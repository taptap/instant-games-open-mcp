import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import {
  clearAppCache,
  getCachePath,
  mutateAppCache,
  readAppCache,
  saveAppCache,
} from '../core/utils/cache';

describe('app cache mutation recovery', () => {
  const cacheDirs: string[] = [];

  afterEach(() => {
    for (const cacheDir of cacheDirs.splice(0)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  function writeMalformedCache(label: string): string {
    const cacheKey = `/tmp/taptap-cache-mutation-${label}-${Date.now()}-${Math.random()}`;
    const cachePath = getCachePath(cacheKey);
    const cacheDir = path.dirname(cachePath);
    cacheDirs.push(cacheDir);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, '{malformed json', 'utf8');
    return cacheKey;
  }

  test('saveAppCache replaces a malformed cache file', () => {
    const cacheKey = writeMalformedCache('save');

    saveAppCache({ developer_id: 100, app_id: 200 }, cacheKey);

    expect(readAppCache(cacheKey)).toEqual(
      expect.objectContaining({ developer_id: 100, app_id: 200 })
    );
  });

  test('clearAppCache removes a malformed cache file', () => {
    const cacheKey = writeMalformedCache('clear');
    const cachePath = getCachePath(cacheKey);

    clearAppCache(cacheKey);

    expect(fs.existsSync(cachePath)).toBe(false);
  });

  test('readAppCache waits for a short mutation and returns the committed cache', async () => {
    const cacheKey = `/tmp/taptap-cache-mutation-locked-${Date.now()}-${Math.random()}`;
    const cachePath = getCachePath(cacheKey);
    const cacheDir = path.dirname(cachePath);
    const lockPath = `${cachePath}.lock`;
    cacheDirs.push(cacheDir);
    saveAppCache({ developer_id: 100, app_id: 200 }, cacheKey);

    const holder = spawn(
      process.execPath,
      [
        '-e',
        `
          const fs = require('node:fs');
          const path = require('node:path');
          const lockPath = process.argv[1];
          fs.mkdirSync(lockPath, { recursive: true });
          const ownerPath = path.join(lockPath, 'test-owner');
          const ownerFd = fs.openSync(ownerPath, 'wx');
          fs.writeFileSync(ownerFd, JSON.stringify({ pid: process.pid, holds_open: true }), 'utf8');
          process.stdout.write('ready\\n');
          setTimeout(() => {
            fs.closeSync(ownerFd);
            try { fs.unlinkSync(ownerPath); } catch (error) {
              if (error.code !== 'ENOENT') throw error;
            }
            try { fs.rmdirSync(lockPath); } catch (error) {
              if (error.code !== 'ENOENT') throw error;
            }
          }, 250);
        `,
        lockPath,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    );
    const holderExited = new Promise<void>((resolve, reject) => {
      holder.once('error', reject);
      holder.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
    const holderReady = new Promise<void>((resolve) => {
      holder.stdout.once('data', () => resolve());
    });

    try {
      await Promise.race([
        holderReady,
        holderExited.then(() => {
          throw new Error('cache lock holder exited before signaling ready');
        }),
      ]);

      const startedAt = Date.now();
      const cached = readAppCache(cacheKey);

      expect(cached).toEqual(expect.objectContaining({ developer_id: 100, app_id: 200 }));
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
      expect(Date.now() - startedAt).toBeLessThan(1000);
    } finally {
      await holderExited;
    }
  });

  test('saveAppCache recovers a lock left by a dead process', () => {
    const cacheKey = `/tmp/taptap-cache-mutation-dead-lock-${Date.now()}-${Math.random()}`;
    const cachePath = getCachePath(cacheKey);
    const cacheDir = path.dirname(cachePath);
    const lockPath = `${cachePath}.lock`;
    cacheDirs.push(cacheDir);
    fs.mkdirSync(lockPath, { recursive: true });
    fs.writeFileSync(path.join(lockPath, 'dead-owner'), '999999999', 'utf8');

    const startedAt = Date.now();
    saveAppCache({ developer_id: 100, app_id: 200 }, cacheKey);

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(readAppCache(cacheKey)).toEqual(
      expect.objectContaining({ developer_id: 100, app_id: 200 })
    );
  });

  test('does not reclaim a fresh owner before its PID has been written', () => {
    const cacheKey = `/tmp/taptap-cache-mutation-fresh-owner-${Date.now()}-${Math.random()}`;
    const cachePath = getCachePath(cacheKey);
    const cacheDir = path.dirname(cachePath);
    const lockPath = `${cachePath}.lock`;
    const ownerPath = path.join(lockPath, 'pending-owner');
    cacheDirs.push(cacheDir);
    fs.mkdirSync(lockPath, { recursive: true });
    fs.writeFileSync(ownerPath, '', 'utf8');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(readAppCache(cacheKey)).toBeNull();
    expect(fs.existsSync(ownerPath)).toBe(true);

    consoleError.mockRestore();
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(ownerPath, staleTime, staleTime);
    saveAppCache({ developer_id: 100, app_id: 200 }, cacheKey);
    expect(readAppCache(cacheKey)).toEqual(
      expect.objectContaining({ developer_id: 100, app_id: 200 })
    );
  });

  test('does not reclaim a stale lock owned by the current process instance', () => {
    const cacheKey = `/tmp/taptap-cache-mutation-paused-owner-${Date.now()}-${Math.random()}`;
    const cachePath = getCachePath(cacheKey);
    const cacheDir = path.dirname(cachePath);
    const lockPath = `${cachePath}.lock`;
    let ownerPayload = '';
    cacheDirs.push(cacheDir);
    mutateAppCache(cacheKey, () => {
      const [ownerFile] = fs.readdirSync(lockPath);
      ownerPayload = fs.readFileSync(path.join(lockPath, ownerFile), 'utf8');
      return undefined;
    });
    expect(JSON.parse(ownerPayload)).toEqual(
      expect.objectContaining({ pid: process.pid, holds_open: true })
    );
    fs.mkdirSync(lockPath);
    const ownerPath = path.join(lockPath, 'paused-owner');
    const ownerFd = fs.openSync(ownerPath, 'w');
    fs.writeFileSync(ownerFd, ownerPayload, 'utf8');
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(ownerPath, staleTime, staleTime);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(readAppCache(cacheKey)).toBeNull();
    expect(fs.existsSync(ownerPath)).toBe(true);
    fs.closeSync(ownerFd);
    consoleError.mockRestore();
  });

  test('saveAppCache recovers a lock whose PID has been reused', () => {
    const cacheKey = `/tmp/taptap-cache-mutation-reused-pid-${Date.now()}-${Math.random()}`;
    const cachePath = getCachePath(cacheKey);
    const cacheDir = path.dirname(cachePath);
    const lockPath = `${cachePath}.lock`;
    const ownerPath = path.join(lockPath, 'stale-owner');
    cacheDirs.push(cacheDir);
    let ownerPayload = '';
    mutateAppCache(cacheKey, () => {
      const [ownerFile] = fs.readdirSync(lockPath);
      ownerPayload = fs.readFileSync(path.join(lockPath, ownerFile), 'utf8');
      return undefined;
    });
    fs.mkdirSync(lockPath, { recursive: true });
    const reusedOwner = JSON.parse(ownerPayload);
    fs.writeFileSync(
      ownerPath,
      JSON.stringify({ ...reusedOwner, process_start: 'different-process-instance' }),
      'utf8'
    );

    const startedAt = Date.now();
    saveAppCache({ developer_id: 100, app_id: 200 }, cacheKey);

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(readAppCache(cacheKey)).toEqual(
      expect.objectContaining({ developer_id: 100, app_id: 200 })
    );
  });
});
