import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { claimUiSaveLock } from '../maker/uiEditor/saveLock';
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
    const peer = net.createServer((socket) => socket.destroy());
    await listen(peer, recoveryMutexPort(lockPath));
    try {
      const release = await claimUiSaveLock(lockPath, () => new Error('busy'));
      await release();
    } finally {
      await close(peer);
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
