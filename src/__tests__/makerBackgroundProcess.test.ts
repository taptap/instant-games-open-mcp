import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { launchPreviewSupervisorProcess } from '../maker/preview/processLauncher';
import { launchConsoleServerProcess } from '../maker/console/processLauncher';

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: jest.fn(),
}));

test.each(['preview', 'console'])('%s uses the Windows broker at execution time', async (kind) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-broker-'));
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  jest.mocked(spawn).mockImplementationOnce(() => {
    process.nextTick(() => {
      child.stdout.emit('data', Buffer.from('12345'));
      child.emit('close', 0);
    });
    return child as unknown as ReturnType<typeof spawn>;
  });
  try {
    const options = {
      execPath: 'C:\\Program Files\\node.exe',
      execArgv: [],
      entry: 'C:\\Maker\\maker.js',
      project: 'D:\\游戏',
      cwd: root,
      logFile: path.join(root, 'supervisor.log'),
      env: { PATH: 'C:\\Windows', TAPTAP_MCP_MAC_TOKEN: 'private-secret' },
      platform: 'win32' as const,
    };
    const launch = await (kind === 'preview'
      ? launchPreviewSupervisorProcess(options)
      : launchConsoleServerProcess(options));
    const [command, args, settings] = jest.mocked(spawn).mock.calls.at(-1)!;
    expect(command).toBe('powershell.exe');
    expect(args).toEqual(expect.arrayContaining([expect.stringContaining('Invoke-CimMethod')]));
    expect(settings).toMatchObject({ windowsHide: true, shell: false });
    expect(JSON.stringify(settings)).not.toContain('private-secret');
    expect(launch.failure()).toBeUndefined();
    expect(launch.stopUnpublished()).toBe(false);
    expect(fs.existsSync(options.logFile)).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.each(['timeout', 'cancel'])('bounds a stalled Windows broker: %s', async (mode) => {
  jest.useFakeTimers();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-broker-'));
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: jest.fn(),
  });
  jest.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
  const controller = new AbortController();
  try {
    const promise = launchPreviewSupervisorProcess({
      execPath: 'node.exe',
      execArgv: [],
      entry: 'maker.js',
      project: root,
      cwd: root,
      logFile: path.join(root, 'supervisor.log'),
      env: {},
      platform: 'win32',
      signal: controller.signal,
    });
    const result = expect(promise).rejects.toThrow('unverified');
    if (mode === 'cancel') controller.abort();
    else jest.advanceTimersByTime(15000);
    await result;
    expect(child.kill).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
