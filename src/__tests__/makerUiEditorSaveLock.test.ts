import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { claimUiSaveLock } from '../maker/uiEditor/saveLock';

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
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 1, port: 1, id: 'stale' }));
    const release = await claimUiSaveLock(lockPath, () => new Error('busy'));
    expect(fs.existsSync(lockPath)).toBe(true);
    await release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('does not treat an unrelated loopback listener as this project lock', async () => {
    const peer = net.createServer((socket) => socket.destroy());
    await new Promise<void>((resolve, reject) => {
      peer.once('error', reject);
      peer.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
    });
    try {
      const release = await claimUiSaveLock(lockPath, () => new Error('busy'));
      await release();
    } finally {
      await new Promise<void>((resolve, reject) =>
        peer.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
