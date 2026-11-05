/**
 * Per-project UI save lock.
 *
 * The lock file appears only after its loopback listener is bound to an OS-assigned
 * port. A holder answers a token challenge. A recorded process that has exited
 * is not the holder, even if its old port stays open and silent. A live process
 * that does not answer in time is still held, so a slow save is not replaced.
 * Stale recovery is serialized with a recover file: only one caller may delete
 * the old lock, and it rechecks the holder before deleting.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { processPresence } from '../system/processPresence.js';

const CLAIM_ATTEMPTS = 8;
const LIVE_CHECK_MS = 300;
const RECOVER_STALE_MS = 2000;
const CONTENDED_DELAY_MS = 25;

type LockRecord = { pid?: number; port: number; token: string };

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
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let data = '';
    const finish = () => socket.destroy();
    const lifetime = setTimeout(finish, LIVE_CHECK_MS);
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      data += chunk;
      if (data.length > 80 || data.includes('\n')) {
        clearTimeout(lifetime);
        if (data.trim() === token) socket.end('ok\n');
        else finish();
      }
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
        for (const socket of sockets) socket.destroy();
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
    const value = JSON.parse(raw) as { pid?: unknown; port?: unknown; token?: unknown };
    if (
      typeof value.token !== 'string' ||
      !value.token ||
      !Number.isInteger(value.port) ||
      (value.port as number) < 1 ||
      (value.port as number) > 65535
    ) {
      return undefined;
    }
    const pid =
      Number.isInteger(value.pid) && (value.pid as number) > 0 ? (value.pid as number) : undefined;
    return { pid, port: value.port as number, token: value.token };
  } catch {
    return undefined;
  }
}

/**
 * True when this lock is still the recorded holder's.
 * An exited pid is stale even if its old port accepts and stays silent.
 * A live pid that does not answer before the timeout is still held.
 */
function holderMatches(record: LockRecord | undefined): Promise<boolean> {
  if (!record) return Promise.resolve(false);
  if (record.pid !== undefined && processPresence(record.pid) === 'missing') {
    return Promise.resolve(false);
  }
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
    const timer = setTimeout(() => done(true), LIVE_CHECK_MS);
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
