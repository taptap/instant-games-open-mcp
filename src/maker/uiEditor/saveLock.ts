/**
 * Per-project UI save lock.
 *
 * The lock file appears only after its loopback listener is already bound to an
 * OS-assigned port. A crashed holder leaves the file, but the port is gone, so
 * the next save can remove that stale file. This does not use a hashed port:
 * an unrelated listener must not make a save look busy.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const CLAIM_ATTEMPTS = 3;
const LIVE_CHECK_MS = 300;

export async function claimUiSaveLock(
  lockPath: string,
  busy: () => Error
): Promise<() => Promise<void>> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const held = await holdLoopbackPort();
    const payload = JSON.stringify({ pid: process.pid, port: held.port, id: randomUUID() });
    const temporary = `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
    let acquired = false;
    try {
      await fs.writeFile(temporary, payload, { flag: 'wx', mode: 0o600 });
      try {
        await fs.link(temporary, lockPath);
        acquired = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (await lockHolderAlive(lockPath)) throw busy();
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await held.close();
        const current = await fs.readFile(lockPath, 'utf8').catch(() => '');
        if (current === payload) await fs.unlink(lockPath).catch(() => undefined);
      };
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
      if (!acquired) await held.close();
    }
  }
  throw busy();
}

async function holdLoopbackPort(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('UI save lock did not receive a loopback port.');
  }
  return {
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** True when the recorded holder is still listening, or the record cannot be proven stale. */
async function lockHolderAlive(lockPath: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await fs.readFile(lockPath, 'utf8');
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  let port: unknown;
  try {
    port = (JSON.parse(raw) as { port?: unknown }).port;
  } catch {
    return true;
  }
  if (typeof port !== 'number' || port <= 0 || port > 65535) return true;
  return portAccepts(port);
}

function portAccepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (alive: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(alive);
    };
    socket.once('connect', () => done(true));
    socket.once('error', (error: NodeJS.ErrnoException) => done(error.code !== 'ECONNREFUSED'));
    socket.setTimeout(LIVE_CHECK_MS, () => done(true));
  });
}
