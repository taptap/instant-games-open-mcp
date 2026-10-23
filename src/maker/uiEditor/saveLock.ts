/**
 * Per-project UI save lock.
 *
 * The lock file appears only after its loopback listener is bound to an OS-assigned
 * port. A holder answers a token challenge, so a reused port or an unrelated
 * listener is not treated as this save. Stale recovery is serialized with a
 * recover file: only one caller may delete the old lock, and it rechecks the
 * holder before deleting.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const CLAIM_ATTEMPTS = 8;
const LIVE_CHECK_MS = 300;
const RECOVER_STALE_MS = 2000;
const CONTENDED_DELAY_MS = 25;

type LockRecord = { port: number; token: string };

export async function claimUiSaveLock(
  lockPath: string,
  busy: () => Error
): Promise<() => Promise<void>> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const token = randomUUID();
    const held = await holdLoopbackPort(token);
    const payload = JSON.stringify({ pid: process.pid, port: held.port, token });
    const temporary = `${lockPath}.${process.pid}.${token}.tmp`;
    let acquired = false;
    try {
      await fs.writeFile(temporary, payload, { flag: 'wx', mode: 0o600 });
      try {
        await fs.link(temporary, lockPath);
        acquired = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const outcome = await recoverStaleLock(lockPath);
        if (outcome === 'live') throw busy();
        if (outcome === 'contended') await delay(CONTENDED_DELAY_MS);
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

async function holdLoopbackPort(
  token: string
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((socket) => {
    let data = '';
    const finish = () => socket.destroy();
    socket.setEncoding('utf8');
    socket.setTimeout(LIVE_CHECK_MS, finish);
    socket.on('data', (chunk: string) => {
      data += chunk;
      if (!data.includes('\n')) return;
      if (data.trim() === token) socket.end('ok\n');
      else finish();
    });
    socket.on('error', finish);
  });
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
      new Promise((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 50);
      }),
  };
}

/** Removes a dead lock. Only one caller at a time may delete it. */
async function recoverStaleLock(
  lockPath: string
): Promise<'removed' | 'live' | 'changed' | 'contended'> {
  const recoverPath = `${lockPath}.recover`;
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(recoverPath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await removeAbandonedRecover(recoverPath);
    return 'contended';
  }
  try {
    await handle.writeFile(String(Date.now()));
    const current = await fs.readFile(lockPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current === null) return 'changed';
    if (await holderMatches(parseRecord(current))) return 'live';
    await fs.unlink(lockPath);
    return 'removed';
  } finally {
    await handle.close();
    await fs.unlink(recoverPath).catch(() => undefined);
  }
}

async function removeAbandonedRecover(recoverPath: string): Promise<void> {
  const stat = await fs.stat(recoverPath).catch(() => undefined);
  if (!stat || Date.now() - stat.mtimeMs < RECOVER_STALE_MS) return;
  await fs.unlink(recoverPath).catch(() => undefined);
}

function parseRecord(raw: string): LockRecord | undefined {
  try {
    const value = JSON.parse(raw) as { port?: unknown; token?: unknown };
    if (
      typeof value.token !== 'string' ||
      !value.token ||
      !Number.isInteger(value.port) ||
      (value.port as number) < 1 ||
      (value.port as number) > 65535
    ) {
      return undefined;
    }
    return { port: value.port as number, token: value.token };
  } catch {
    return undefined;
  }
}

/** True only when the recorded holder answers its own token. */
function holderMatches(record: LockRecord | undefined): Promise<boolean> {
  if (!record) return Promise.resolve(false);
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: record.port });
    let buf = '';
    let settled = false;
    const done = (alive: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(alive);
    };
    const timer = setTimeout(() => done(false), LIVE_CHECK_MS);
    socket.once('error', () => {
      clearTimeout(timer);
      done(false);
    });
    socket.once('close', () => {
      clearTimeout(timer);
      done(false);
    });
    socket.once('connect', () => socket.write(`${record.token}\n`));
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      if (buf.includes('ok')) {
        clearTimeout(timer);
        done(true);
      }
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
