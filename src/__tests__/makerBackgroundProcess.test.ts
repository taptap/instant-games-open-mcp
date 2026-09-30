import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { buildWindowsBackgroundLaunchScripts } from '../maker/system/backgroundProcess';
import { launchPreviewSupervisorProcess } from '../maker/preview/processLauncher';
import { launchConsoleServerProcess } from '../maker/console/processLauncher';

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: jest.fn(),
}));

test('keeps setup fail-fast and relaxes error handling only for native stderr', () => {
  const scripts = buildWindowsBackgroundLaunchScripts({
    command: 'C:\\Program Files\\node.exe',
    args: ['C:\\Maker\\maker.js'],
    cwd: "C:\\Maker's project",
    logFile: "C:\\Maker's project\\stderr.log",
    env: { HOME: "C:\\Maker's home" },
  });
  expect(scripts.process.split('\r\n')).toEqual([
    "$ErrorActionPreference = 'Stop'",
    "$env:HOME = 'C:\\Maker''s home'",
    "Set-Location -LiteralPath 'C:\\Maker''s project'",
    '$LASTEXITCODE = 1',
    "$ErrorActionPreference = 'Continue'",
    "& 'C:\\Program Files\\node.exe' 'C:\\Maker\\maker.js' 1> $null 2>> 'C:\\Maker''s project\\stderr.log'",
    "$ErrorActionPreference = 'Stop'",
    'exit $LASTEXITCODE',
  ]);
  expect(scripts.broker).toMatch(/^\$ErrorActionPreference = 'Stop'/);
  const encoded = scripts.broker.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)![1];
  expect(scripts.encodedCommand).toBe(encoded);
  expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe(scripts.process);
});

const windowsTest = process.platform === 'win32' ? test : test.skip;
windowsTest.each([0, 7])('Windows PowerShell preserves stderr and native exit %i', (code) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maker native's stderr-"));
  try {
    const probe = path.join(root, 'probe.cjs');
    const logFile = path.join(root, 'stderr.log');
    fs.writeFileSync(
      probe,
      `process.stderr.write('native-warning\\n'); setTimeout(() => process.exit(${code}), 100);`
    );
    fs.writeFileSync(logFile, Buffer.from('existing-log\r\n', 'utf16le'));
    const scripts = buildWindowsBackgroundLaunchScripts({
      command: process.execPath,
      args: [probe],
      cwd: root,
      logFile,
      env: {},
    });
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(scripts.process, 'utf16le').toString('base64'),
      ],
      { encoding: 'utf8', timeout: 10_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(code);
    const log = fs.readFileSync(logFile).toString('utf16le');
    expect(log).toContain('existing-log');
    expect(log).toContain('native-warning');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

windowsTest('Windows setup failure stops before running the native command', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-native-setup-'));
  try {
    const marker = path.join(root, 'started');
    const probe = path.join(root, 'probe.cjs');
    fs.writeFileSync(
      probe,
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started');`
    );
    const scripts = buildWindowsBackgroundLaunchScripts({
      command: process.execPath,
      args: [probe],
      cwd: path.join(root, 'missing'),
      logFile: path.join(root, 'stderr.log'),
      env: {},
    });
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(scripts.process, 'utf16le').toString('base64'),
      ],
      { encoding: 'utf8', timeout: 10_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(fs.existsSync(marker)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
      : launchConsoleServerProcess({ ...options, legacy: true }));
    const [command, args, settings] = jest.mocked(spawn).mock.calls.at(-1)!;
    expect(command).toBe('powershell.exe');
    expect(args).toEqual(expect.arrayContaining([expect.stringContaining('Invoke-CimMethod')]));
    expect(settings).toMatchObject({ windowsHide: true, shell: false });
    expect(JSON.stringify(settings)).not.toContain('private-secret');
    expect(launch.failure()).toBeUndefined();
    expect(launch.expectedPid).toBeUndefined();
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

test.each(['direct', 'attached'] as const)(
  'Windows %s preview launches Node without CIM or sensitive inherited environment',
  async (mode) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-direct-launch-'));
    const child = Object.assign(new EventEmitter(), {
      pid: 12345,
      exitCode: null,
      signalCode: null,
      connected: true,
      disconnect: jest.fn(),
      unref: jest.fn(),
      kill: jest.fn(),
    });
    jest.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
    try {
      const launch = await launchPreviewSupervisorProcess({
        execPath: 'C:/Program Files/node.exe',
        execArgv: [],
        entry: 'C:/Maker/maker.js',
        project: root,
        cwd: root,
        logFile: path.join(root, 'supervisor.log'),
        env: { TAPTAP_MCP_MAC_TOKEN: 'private-secret', TAPTAP_MAKER_HOME: root },
        platform: 'win32',
        mode,
      });
      const [command, args, settings] = jest.mocked(spawn).mock.calls.at(-1)!;
      expect(command).toBe('C:/Program Files/node.exe');
      expect(args).toContain('__maker-preview-supervisor');
      expect(settings?.env?.TAPTAP_MAKER_HOME).toBe(root);
      expect(JSON.stringify(settings)).not.toContain('private-secret');
      expect(settings?.detached).toBe(mode === 'direct');
      expect(settings?.stdio).toEqual(
        mode === 'attached'
          ? ['ignore', 'ignore', expect.any(Number), 'ipc']
          : ['ignore', 'ignore', expect.any(Number)]
      );
      expect(launch.expectedPid).toBe(12345);
      expect(child.unref).toHaveBeenCalledTimes(mode === 'direct' ? 1 : 0);
      if (mode === 'attached') {
        launch.releaseOwner?.();
        expect(child.disconnect).toHaveBeenCalledTimes(1);
      } else expect(launch.releaseOwner).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
);

test('blocked direct Windows spawn fails at the launcher stage without an unknown PID', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-blocked-launch-'));
  const child = Object.assign(new EventEmitter(), {
    pid: undefined,
    exitCode: null,
    signalCode: null,
    unref: jest.fn(),
    kill: jest.fn(),
  });
  jest.mocked(spawn).mockImplementationOnce(() => {
    process.nextTick(() =>
      child.emit('error', Object.assign(new Error('Access denied'), { code: 'EACCES' }))
    );
    return child as unknown as ReturnType<typeof spawn>;
  });
  try {
    const launch = await launchPreviewSupervisorProcess({
      execPath: 'C:/Program Files/node.exe',
      execArgv: [],
      entry: 'C:/Maker/maker.js',
      project: root,
      cwd: root,
      logFile: path.join(root, 'supervisor.log'),
      env: {},
      platform: 'win32',
      mode: 'direct',
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(launch.failure()?.message).toContain('NATIVE_LAUNCH_FAILED');
    expect(launch.failure()?.message).toContain('EACCES');
    expect(launch.expectedPid).toBeUndefined();
    expect(launch.stopUnpublished()).toBe(true);
    expect(child.kill).not.toHaveBeenCalled();
    expect(jest.mocked(spawn).mock.calls.at(-1)![0]).not.toBe('powershell.exe');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
