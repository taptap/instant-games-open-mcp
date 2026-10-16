import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { ConsoleUpdates, fetchConsoleVersions, runConsoleUpgrade } from '../maker/console/updates';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('../maker/cli/mcpLauncher', () => ({
  resolveMakerMcpLauncher: () => ({ command: process.execPath, args: [] }),
}));

const catalog = async () => ({
  versions: ['1.0.1-beta.1', '1.0.0', '1.0.0-beta.2', '0.9.0'],
  latest: '1.0.0',
  beta: '1.0.1-beta.1',
});

describe('console package updates', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    jest.mocked(spawn).mockReset();
  });

  it('retains published channel tags within five sorted and unique choices', async () => {
    const versions = ['1.0.1', ...Array.from({ length: 6 }, (_, i) => `1.1.0-beta.${i + 1}`)];
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        versions: Object.fromEntries(versions.map((v) => [v, {}])),
        'dist-tags': { latest: '1.0.1', beta: '1.1.0-beta.6' },
      }),
    } as Response);
    expect(await fetchConsoleVersions()).toEqual({
      latest: '1.0.1',
      beta: '1.1.0-beta.6',
      versions: ['1.1.0-beta.6', '1.1.0-beta.5', '1.1.0-beta.4', '1.1.0-beta.3', '1.0.1'],
    });
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({
        versions: { '1.0.1': {} },
        'dist-tags': { latest: '9.0.0', beta: '--bad' },
      }),
    } as Response);
    expect(await fetchConsoleVersions()).toEqual({ versions: ['1.0.1'] });
  });

  it.each([
    { platform: 'win32', exited: false },
    { platform: 'win32', exited: true },
    { platform: 'darwin', exited: false },
  ])(
    'bounds $platform timeout cleanup without close events (exited=$exited)',
    async ({ platform, exited }) => {
      jest.useFakeTimers();
      jest.replaceProperty(process, 'platform', platform as NodeJS.Platform);
      jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);
      const kill = jest.spyOn(process, 'kill').mockReturnValue(true);
      const child = Object.assign(new EventEmitter(), {
        pid: 43210,
        exitCode: exited ? 0 : null,
        signalCode: null,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: jest.fn(),
        unref: jest.fn(),
      });
      const killer = Object.assign(new EventEmitter(), { kill: jest.fn(), unref: jest.fn() });
      jest.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
      jest.mocked(spawn).mockReturnValueOnce(killer as unknown as ReturnType<typeof spawn>);
      const updates = new ConsoleUpdates('0.9.0', undefined, catalog, runConsoleUpgrade);
      await updates.start('1.0.0');
      await jest.advanceTimersByTimeAsync(10 * 60_000 + 5000);
      expect(updates.job.status).toBe('unknown');
      expect(child.stdout.destroyed).toBe(true);
      expect(child.stderr.destroyed).toBe(true);
      expect(child.unref).toHaveBeenCalled();
      if (exited) {
        expect(spawn).toHaveBeenCalledTimes(1);
        expect(child.kill).not.toHaveBeenCalled();
        expect(kill).not.toHaveBeenCalled();
      } else if (platform === 'win32') {
        expect(spawn).toHaveBeenLastCalledWith(
          'taskkill.exe',
          ['/PID', '43210', '/T', '/F'],
          expect.any(Object)
        );
        expect(killer.kill).toHaveBeenCalledWith('SIGKILL');
      } else {
        expect(spawn).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({ detached: true })
        );
        expect(kill).toHaveBeenCalledWith(-43210, 'SIGKILL');
      }
      child.emit('close', 0);
      expect(updates.job.status).toBe('unknown');
      await expect(updates.start('1.0.0')).rejects.toThrow('结果未确认');
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  it('does not offer Beta updates to stable users', async () => {
    const value = await new ConsoleUpdates('1.0.0', undefined, catalog).list();
    expect(value.updateAvailable).toBe(false);
    expect(value.downgrades).toContain('1.0.0-beta.2');
    expect(
      (await new ConsoleUpdates('1.0.0-beta.2', undefined, catalog).list()).updateAvailable
    ).toBe(true);
  });
  it('never queries or upgrades a plugin managed distribution', async () => {
    const fetcher = jest.fn(catalog),
      upgrade = jest.fn();
    const updates = new ConsoleUpdates('1.0.0', 'external_plugin', fetcher, upgrade);
    expect((await updates.list()).managed).toBe(true);
    await expect(updates.start('0.9.0')).rejects.toThrow('插件');
    expect(fetcher).not.toHaveBeenCalled();
    expect(upgrade).not.toHaveBeenCalled();
  });
  it('validates versions and prevents concurrent updates', async () => {
    let finish!: () => void;
    const upgrade = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const updates = new ConsoleUpdates('0.9.0', undefined, catalog, upgrade);
    await expect(updates.start('--bad')).rejects.toThrow();
    await expect(updates.start('9.0.0')).rejects.toThrow();
    await expect(updates.start('0.9.0')).rejects.toThrow();
    expect((await updates.start('1.0.0')).status).toBe('running');
    await expect(updates.start('1.0.0-beta.2')).rejects.toThrow('重复');
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    expect(updates.job.status).toBe('succeeded');
    expect(updates.current).toBe('0.9.0');
    expect(upgrade).toHaveBeenCalledTimes(1);
  });
  it('records failure without automatic retry', async () => {
    const upgrade = jest.fn(async () => {
      throw new Error('network unavailable');
    });
    const updates = new ConsoleUpdates('0.9.0', undefined, catalog, upgrade);
    await updates.start('1.0.0');
    await new Promise((resolve) => setImmediate(resolve));
    expect(updates.job).toMatchObject({ status: 'failed', message: 'network unavailable' });
    expect(upgrade).toHaveBeenCalledTimes(1);
  });
});
