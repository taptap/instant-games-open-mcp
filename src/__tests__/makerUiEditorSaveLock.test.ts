import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { claimUiSaveLock } from '../maker/uiEditor/saveLock';
import { processPresence } from '../maker/system/processPresence';
import { recoveryMutexPort } from '../maker/system/recoveryMutex';

describe('UI save lock', () => {
  let directory: string;
  let lockPath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-save-lock-'));
    lockPath = path.join(directory, '.maker', 'ui-editor-save.lock');
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test('rejects a second saver while the first lock is held', async () => {
    const release = await claimUiSaveLock(lockPath, () => new Error('busy'));
    await expect(claimUiSaveLock(lockPath, () => new Error('busy'))).rejects.toThrow('busy');
    await release();
    const next = await claimUiSaveLock(lockPath, () => new Error('busy'));
    await next();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('replaces a stale lock whose holder port is gone', async () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 1, port: 1, token: 'stale' }));
    const release = await claimUiSaveLock(lockPath, () => new Error('busy'));
    expect(fs.existsSync(lockPath)).toBe(true);
    await release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('still acquires when the old hashed port is already taken', async () => {
    let peer: net.Server | undefined;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) {
        fs.rmSync(directory, { recursive: true, force: true });
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-save-lock-'));
        lockPath = path.join(directory, '.maker', 'ui-editor-save.lock');
      }
      peer = net.createServer((socket) => socket.destroy());
      try {
        await listen(peer, recoveryMutexPort(lockPath));
        break;
      } catch (error) {
        await close(peer);
        peer = undefined;
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= 19) throw error;
      }
    }
    try {
      const release = await claimUiSaveLock(lockPath, () => new Error('busy'));
      await release();
    } finally {
      if (peer) await close(peer);
    }
  });

  test('replaces a stale lock whose port was reused by an unrelated listener', async () => {
    const peer = net.createServer((socket) => {
      socket.on('error', () => undefined);
      socket.end('nope');
    });
    await listen(peer, 0);
    const port = (peer.address() as net.AddressInfo).port;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 1, port, token: 'previous-holder' }));
    try {
      const release = await claimUiSaveLock(lockPath, () => new Error('busy'));
      await release();
    } finally {
      await close(peer);
    }
  });

  test('replaces a stale lock when the holder has exited and the port stays silent', async () => {
    const peer = silentServer();
    await listen(peer.server, 0);
    const port = (peer.server.address() as net.AddressInfo).port;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: await exitedPid(), port, token: 'previous-holder' })
    );
    try {
      const release = await claimUiSaveLock(lockPath, () => new Error('busy'));
      await release();
    } finally {
      await peer.close();
    }
  });

  test('keeps a lock whose process is still alive when the port stays silent', async () => {
    const peer = silentServer();
    await listen(peer.server, 0);
    const port = (peer.server.address() as net.AddressInfo).port;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port, token: 'live-holder' }));
    try {
      await expect(claimUiSaveLock(lockPath, () => new Error('busy'))).rejects.toThrow('busy');
    } finally {
      await peer.close();
    }
  });

  test('lets only one saver recover the same stale lock', async () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 1, port: 1, token: 'stale' }));
    const results = await Promise.allSettled([
      claimUiSaveLock(lockPath, () => new Error('busy')),
      claimUiSaveLock(lockPath, () => new Error('busy')),
    ]);
    const held = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    try {
      expect(held).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      await expect(claimUiSaveLock(lockPath, () => new Error('busy'))).rejects.toThrow('busy');
    } finally {
      await Promise.all(held.map((release) => release()));
    }
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(fs.existsSync(lockPath + '.recover')).toBe(false);
  });
});

function listen(server: net.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolve());
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    setTimeout(resolve, 20);
  });
}

function silentServer(): { server: net.Server; close: () => Promise<void> } {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
  });
  return {
    server,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await close(server);
    },
  };
}

async function exitedPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  const pid = child.pid;
  if (!pid) throw new Error('spawned process has no pid');
  await new Promise<void>((resolve, reject) => {
    child.once('exit', () => resolve());
    child.once('error', reject);
  });
  if (processPresence(pid) !== 'missing') {
    throw new Error(`pid ${pid} was reused before the test could use it`);
  }
  return pid;
}
