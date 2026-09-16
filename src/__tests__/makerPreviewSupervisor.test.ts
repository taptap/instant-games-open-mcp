import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  previewDirectory,
  previewRoundDirectory,
  readPreviewRecord,
  runtimeDirectory,
  writePrivateJson,
  type PreviewRecord,
} from '../maker/preview/protocol.js';
import { preflightPreview, PreviewRuntime } from '../maker/preview/runtime.js';
import { ensurePreviewRuntimeResources } from '../maker/preview/runtimeResources.js';
import { buildWindowsPreviewLaunchScripts } from '../maker/preview/processLauncher.js';
import { previewStatus, requestPreview, runPreviewSupervisor } from '../maker/preview/session.js';
import { runPreviewCli } from '../maker/cli/preview.js';

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: jest.fn(),
}));

// Keep the real supervisor HTTP channel, session state machine and persistence.
// Only the native Runtime boundary is simulated, including a failed-but-alive process.
jest.mock('../maker/preview/runtime.js', () => {
  class Runtime {
    static mode = 'fail';
    static holdStop = false;
    static instances: Runtime[] = [];
    processAlive = false;
    pid = 42;
    errors: string[] = [];
    artifacts: unknown[] = [];
    logs = { read: () => ({ logs: [] }) };
    launchMode = 'local_manifest';
    isReady = false;
    stops = 0;
    release?: () => void;
    releaseStop?: () => void;
    constructor(
      _executable: string,
      _identity: unknown,
      readonly directory: string,
      readonly changed: (state: string) => void
    ) {
      Runtime.instances.push(this);
    }
    async start(): Promise<void> {
      fs.mkdirSync(path.join(this.directory, 'source'), { recursive: true });
      fs.writeFileSync(path.join(this.directory, 'source', 'marker'), 'owned source');
      if (Runtime.mode === 'delayed') {
        await new Promise<void>((resolve) => {
          this.release = resolve;
        });
        throw new Error('CANCELLED');
      }
      this.processAlive = Runtime.mode !== 'fail';
      if (Runtime.mode !== 'running') throw new Error('fixture preparation failure');
      this.changed('running');
    }
    async stop(): Promise<void> {
      this.stops++;
      this.processAlive = false;
      this.release?.();
      if (Runtime.holdStop)
        await new Promise<void>((resolve) => {
          this.releaseStop = resolve;
        });
      this.changed('stopped');
    }
    crash(): void {
      this.processAlive = false;
      this.errors.push('fixture native crash');
      this.changed('failed');
    }
  }
  return {
    PreviewRuntime: Runtime,
    preflightPreview: jest.fn(async () => ({ entry: 'main.lua' })),
    probeRuntime: jest.fn(async () => ({
      protocol_version: 0,
      runtime_version: 'fixture',
      platform: process.platform,
      arch: 'fixture',
      capabilities: [],
    })),
  };
});
jest.mock('../maker/preview/runtimeResources.js', () => ({
  ensurePreviewRuntimeResources: jest.fn(() => ({ fallbackFont: 'existing', warnings: [] })),
}));

const runtime = PreviewRuntime as unknown as {
  mode: string;
  holdStop: boolean;
  instances: {
    processAlive: boolean;
    stops: number;
    crash(): void;
    release?: () => void;
    releaseStop?: () => void;
  }[];
};
let root: string;
let project: string;
let oldHome: string | undefined;
let record: PreviewRecord;
let signalListeners: Map<'SIGINT' | 'SIGTERM', NodeJS.SignalsListener[]>;

function pendingRecord(): PreviewRecord {
  return {
    protocol_version: 1,
    project_realpath: project,
    session_id: randomUUID(),
    reload_id: 0,
    supervisor_id: randomUUID(),
    supervisor_pid: 0,
    started_at: new Date().toISOString(),
    token: 'a'.repeat(64),
    port: 0,
    executable: path.join(root, 'runtime'),
    state: 'starting',
    runtime: {
      protocol_version: 0,
      runtime_version: 'fixture',
      platform: process.platform,
      arch: 'fixture',
      capabilities: [],
    },
  };
}

async function boot(): Promise<void> {
  record = pendingRecord();
  writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
  await runPreviewSupervisor(project);
  record = readPreviewRecord(project)!;
}

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Supervisor did not reach the expected state.');
}

async function isClosed(): Promise<boolean> {
  return requestPreview(record, 'status', {}, 200).then(
    () => false,
    () => true
  );
}

async function callCli(
  action: string,
  runtimePath: string | null = path.join(root, 'runtime')
): Promise<Record<string, unknown>> {
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const exitCode = process.exitCode;
  process.exitCode = 0;
  try {
    await runPreviewCli(action, {
      target_dir: project,
      ...(runtimePath ? { runtime: runtimePath } : {}),
      json: true,
    });
    return JSON.parse(stdout.mock.calls.map(([text]) => String(text)).join(''));
  } finally {
    process.exitCode = exitCode;
    stdout.mockRestore();
    record = readPreviewRecord(project)!;
  }
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-supervisor-test-')));
  project = path.join(root, 'project');
  fs.mkdirSync(project);
  writePrivateJson(path.join(project, '.maker-mcp', 'config.json'), { project_id: 'fixture' });
  fs.writeFileSync(path.join(root, 'runtime'), '');
  oldHome = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  runtime.mode = 'fail';
  runtime.holdStop = false;
  runtime.instances = [];
  jest.mocked(ensurePreviewRuntimeResources).mockClear();
  jest.mocked(spawn).mockReset();
  jest.mocked(spawn).mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      pid: 12345,
      exitCode: null,
      unref: jest.fn(),
      kill: jest.fn(),
    });
    void runPreviewSupervisor(project).catch((error) => child.emit('error', error));
    return child as unknown as ReturnType<typeof spawn>;
  });
  signalListeners = new Map(
    (['SIGINT', 'SIGTERM'] as const).map((signal) => [
      signal,
      process.listeners(signal) as NodeJS.SignalsListener[],
    ])
  );
});

test('CLI start repairs the shared managed Runtime before probing it', async () => {
  const installedExecutable = path.join(root, 'installed-runtime');
  fs.writeFileSync(installedExecutable, '');
  writePrivateJson(path.join(runtimeDirectory(), 'installation.json'), {
    install_state: 'ready',
    executable: installedExecutable,
  });
  runtime.mode = 'running';

  expect(await callCli('start', null)).toMatchObject({ ok: true, state: 'running' });
  expect(ensurePreviewRuntimeResources).toHaveBeenCalledWith(installedExecutable);
});

test('CLI start does not modify an explicitly supplied external Runtime', async () => {
  runtime.mode = 'running';

  expect(await callCli('start')).toMatchObject({ ok: true, state: 'running' });
  expect(ensurePreviewRuntimeResources).not.toHaveBeenCalled();
});

test('builds a Windows system-broker launch for the preview supervisor', () => {
  const scripts = buildWindowsPreviewLaunchScripts({
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    execArgv: ['--no-warnings'],
    entry: 'C:\\Maker\\dist\\maker.js',
    project: 'F:\\MiniGame\\mcp\\test-2',
    cwd: 'C:\\Maker\\Runtime',
    logFile: 'C:\\Maker\\preview\\supervisor.log',
    env: {
      PATH: 'C:\\Windows\\System32',
      TAPTAP_MAKER_HOME: 'C:\\Users\\Maker\\.taptap-maker',
      TAPTAP_MCP_MAC_TOKEN: 'must-not-leak',
    },
  });

  expect(scripts.broker).toContain('Invoke-CimMethod');
  expect(scripts.process).toContain('__maker-preview-supervisor');
  expect(scripts.process).toContain('F:\\MiniGame\\mcp\\test-2');
  expect(scripts.process).toContain('supervisor.log');
  expect(scripts.process).not.toContain('must-not-leak');
});

afterEach(async () => {
  if (record) await requestPreview(record, 'stop', {}, 1000).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (const [signal, previous] of signalListeners) {
    for (const listener of process.listeners(signal))
      if (!previous.includes(listener as NodeJS.SignalsListener))
        process.removeListener(signal, listener);
  }
  if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = oldHome;
  fs.rmSync(root, { recursive: true, force: true });
});

test('failed startup retires the real HTTP supervisor and retains verified failure evidence', async () => {
  await boot();
  expect(await requestPreview(record, 'start')).toMatchObject({
    state: 'failed',
    process_alive: false,
    ok: false,
  });
  await waitUntil(isClosed);
  expect(await previewStatus(project)).toMatchObject({
    state: 'failed',
    process_alive: false,
    supervisor_retired: true,
    ok: false,
    error: expect.stringContaining('fixture preparation failure'),
  });
  expect(
    JSON.parse(fs.readFileSync(path.join(previewRoundDirectory(record), 'result.json'), 'utf8'))
  ).toMatchObject({ state: 'failed', process_alive: false, supervisor_retired: true });
  expect(process.listeners('SIGTERM')).toEqual(signalListeners.get('SIGTERM'));
  expect(process.listeners('SIGINT')).toEqual(signalListeners.get('SIGINT'));
});

test('a later native crash retires the supervisor without losing runtime error evidence', async () => {
  runtime.mode = 'running';
  await boot();
  await requestPreview(record, 'start');
  runtime.instances[0].crash();
  await waitUntil(isClosed);
  expect(await previewStatus(project)).toMatchObject({
    state: 'failed',
    process_alive: false,
    supervisor_retired: true,
    errors: ['fixture native crash'],
    ok: false,
  });
});

test('preflight failure before Runtime creation also retires with retained diagnostics', async () => {
  jest.mocked(preflightPreview).mockRejectedValueOnce(new Error('fixture invalid entry'));
  await boot();
  expect(await requestPreview(record, 'start')).toMatchObject({ state: 'failed', ok: false });
  expect(runtime.instances).toHaveLength(0);
  await waitUntil(isClosed);
  expect(await previewStatus(project)).toMatchObject({
    supervisor_retired: true,
    process_alive: false,
    error: expect.stringContaining('fixture invalid entry'),
  });
});

test('an explicitly created new session can start after a failed supervisor retires', async () => {
  await boot();
  await requestPreview(record, 'start');
  const failedRecord = record;
  await waitUntil(isClosed);
  expect(runtime.instances).toHaveLength(1);
  runtime.mode = 'running';
  await boot();
  expect(record.session_id).not.toBe(failedRecord.session_id);
  expect(await requestPreview(record, 'start')).toMatchObject({
    state: 'running',
    process_alive: true,
    ok: true,
  });
  expect(
    JSON.parse(
      fs.readFileSync(path.join(previewRoundDirectory(failedRecord), 'result.json'), 'utf8')
    )
  ).toMatchObject({ state: 'failed', supervisor_retired: true });
});

test('CLI check/stop retain a retired failure and explicit start creates a fresh working session', async () => {
  await boot();
  await requestPreview(record, 'start');
  const oldSession = record.session_id;
  await waitUntil(isClosed);
  expect(await callCli('check')).toMatchObject({
    result: 'FAIL',
    state: 'failed',
    process_alive: false,
    supervisor_retired: true,
    session_id: oldSession,
    error: expect.stringContaining('fixture preparation failure'),
  });
  expect(await callCli('stop')).toMatchObject({
    ok: true,
    process_alive: false,
    supervisor_retired: true,
    session_id: oldSession,
  });
  expect(await previewStatus(project)).toMatchObject({
    state: 'failed',
    error: expect.stringContaining('fixture preparation failure'),
  });
  expect(spawn).not.toHaveBeenCalled();
  runtime.mode = 'running';
  expect(await callCli('start')).toMatchObject({ ok: true, state: 'running', process_alive: true });
  expect(record.session_id).not.toBe(oldSession);
  expect(spawn).toHaveBeenCalledTimes(1);
});

test('CLI refresh never revives a retired failed preview', async () => {
  await boot();
  await requestPreview(record, 'start');
  await waitUntil(isClosed);
  expect(await callCli('refresh')).toMatchObject({
    ok: false,
    process_alive: false,
    supervisor_retired: true,
    error: expect.stringContaining('never starts'),
  });
  expect(spawn).not.toHaveBeenCalled();
});

test('CLI explicit start skips the closed failed endpoint', async () => {
  await boot();
  await requestPreview(record, 'start');
  await waitUntil(isClosed);
  runtime.mode = 'running';
  expect(await callCli('start')).toMatchObject({
    ok: true,
    state: 'running',
    process_alive: true,
  });
  expect(spawn).toHaveBeenCalledTimes(1);
});

test('active managed Runtime status keeps its installation date for console display', async () => {
  const installedAt = '2026-09-14T02:50:25.979Z';
  writePrivateJson(path.join(runtimeDirectory(), 'installation.json'), {
    install_state: 'ready',
    executable: path.join(root, 'runtime'),
    installed_at: installedAt,
  });
  runtime.mode = 'running';
  await boot();
  await requestPreview(record, 'start');
  expect(await previewStatus(project)).toMatchObject({
    state: 'running',
    process_alive: true,
    executable: path.join(root, 'runtime'),
    installed_at: installedAt,
  });
});

test('an active external Runtime does not imply a managed Runtime is installed', async () => {
  runtime.mode = 'running';
  await boot();
  await requestPreview(record, 'start');

  expect(await previewStatus(project)).toMatchObject({
    state: 'running',
    process_alive: true,
    executable: path.join(root, 'runtime'),
    install_state: 'missing',
  });
});

test('active external Runtime keeps session identity while reporting the managed installation', async () => {
  const installedExecutable = path.join(root, 'installed-runtime');
  fs.writeFileSync(installedExecutable, '');
  writePrivateJson(path.join(runtimeDirectory(), 'installation.json'), {
    install_state: 'ready',
    executable: installedExecutable,
    runtime: {
      protocol_version: 0,
      runtime_version: 'managed-version',
      platform: process.platform,
      arch: 'fixture',
      capabilities: [],
    },
    installed_at: '2026-09-16T03:00:00.000Z',
  });
  runtime.mode = 'running';
  await boot();
  await requestPreview(record, 'start');

  expect(await previewStatus(project)).toMatchObject({
    state: 'running',
    process_alive: true,
    executable: path.join(root, 'runtime'),
    runtime_version: 'fixture',
    install_state: 'ready',
    runtime: { runtime_version: 'managed-version' },
    installed_at: '2026-09-16T03:00:00.000Z',
  });
});

test('a retired manual Runtime keeps its identity when another Runtime is installed', async () => {
  await boot();
  const manualExecutable = record.executable;
  const installedExecutable = path.join(root, 'installed-runtime');
  fs.writeFileSync(installedExecutable, '');
  writePrivateJson(path.join(runtimeDirectory(), 'installation.json'), {
    install_state: 'ready',
    executable: installedExecutable,
  });
  await requestPreview(record, 'start');
  await waitUntil(isClosed);
  expect(await previewStatus(project)).toMatchObject({
    state: 'failed',
    process_alive: false,
    supervisor_retired: true,
    executable: manualExecutable,
    install_state: 'ready',
  });
  runtime.mode = 'running';
  expect(await callCli('start')).toMatchObject({
    ok: true,
    state: 'running',
    process_alive: true,
    executable: manualExecutable,
  });
  expect(spawn).toHaveBeenCalledTimes(1);
});

test('CLI stop acknowledges a retired failure without contacting its old control endpoint', async () => {
  await boot();
  await requestPreview(record, 'start');
  await waitUntil(isClosed);
  expect(await callCli('stop')).toMatchObject({
    ok: true,
    process_alive: false,
    supervisor_retired: true,
  });
  expect(spawn).not.toHaveBeenCalled();
});

test('CLI start refuses an unreachable failure lacking verified retirement', async () => {
  await boot();
  await requestPreview(record, 'stop');
  await waitUntil(isClosed);
  record.state = 'failed';
  writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
  expect(await callCli('start')).toMatchObject({
    ok: false,
    error: expect.stringContaining('ownership is unverified'),
  });
  expect(spawn).not.toHaveBeenCalled();
});

test('failed-but-alive Runtime is not stopped by failure retirement', async () => {
  runtime.mode = 'failed-alive';
  await boot();
  await requestPreview(record, 'start');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(await requestPreview(record, 'status')).toMatchObject({
    state: 'failed',
    process_alive: true,
  });
  expect(runtime.instances[0].stops).toBe(0);
});

test('retirement waits for an explicit stop that is still draining Runtime resources', async () => {
  runtime.mode = 'failed-alive';
  runtime.holdStop = true;
  await boot();
  await requestPreview(record, 'start');
  const stopped = requestPreview(record, 'stop');
  await waitUntil(() => Boolean(runtime.instances[0].releaseStop));
  try {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await requestPreview(record, 'status')).toMatchObject({
      error: expect.stringContaining('fixture preparation failure'),
      process_alive: false,
    });
  } finally {
    runtime.holdStop = false;
    runtime.instances[0].releaseStop?.();
    await stopped;
  }
  await waitUntil(isClosed);
  expect(await previewStatus(project)).toMatchObject({ state: 'stopped', process_alive: false });
});

test('stop wins over in-flight startup and a queued refresh', async () => {
  runtime.mode = 'delayed';
  await boot();
  const start = requestPreview(record, 'start');
  await waitUntil(() => Boolean(runtime.instances[0]?.release));
  const refresh = requestPreview(record, 'refresh');
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(await requestPreview(record, 'stop')).toMatchObject({
    state: 'stopped',
    process_alive: false,
    ok: true,
  });
  await Promise.all([start, refresh]);
  await waitUntil(isClosed);
  expect(await previewStatus(project)).toMatchObject({ state: 'stopped', process_alive: false });
  expect(runtime.instances).toHaveLength(1);
});

test.each(['fail', 'failed-alive'])(
  'failure completion (%s) bounds old evidence without removing the current round or another project',
  async (mode) => {
    runtime.mode = mode;
    await boot();
    const directory = path.join(previewDirectory(project), 'sessions');
    for (let i = 0; i < 6; i++) {
      const old = path.join(directory, randomUUID(), '0');
      fs.mkdirSync(path.join(old, 'source'), { recursive: true });
      fs.writeFileSync(path.join(old, 'source', 'marker'), 'old');
    }
    const other = path.join(
      previewDirectory(path.join(root, 'other-project')),
      'sessions',
      randomUUID(),
      '0'
    );
    fs.mkdirSync(path.join(other, 'source'), { recursive: true });
    fs.writeFileSync(path.join(other, 'source', 'marker'), 'other project');
    await requestPreview(record, 'start');
    expect(fs.readdirSync(directory)).toHaveLength(3);
    expect(fs.existsSync(path.join(previewRoundDirectory(record), 'source', 'marker'))).toBe(true);
    expect(fs.readFileSync(path.join(other, 'source', 'marker'), 'utf8')).toBe('other project');
    expect(runtime.instances[0].stops).toBe(0);
  }
);

test('unreachable failure without retirement evidence remains unverified', async () => {
  await boot();
  await requestPreview(record, 'stop');
  await waitUntil(isClosed);
  record.state = 'failed';
  writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
  writePrivateJson(path.join(previewRoundDirectory(record), 'result.json'), {
    ...record,
    process_alive: false,
    state: 'failed',
  });
  expect(await previewStatus(project)).toMatchObject({ process_alive: null, ok: false });
});

test('recovers an unreachable Windows-style session after both recorded processes are absent', async () => {
  await boot();
  await requestPreview(record, 'stop');
  await waitUntil(isClosed);
  record.state = 'running';
  record.supervisor_pid = 2147483646;
  record.runtime_pid = 2147483647;
  writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
  writePrivateJson(path.join(previewRoundDirectory(record), 'result.json'), {
    ...record,
    state: 'running',
    process_alive: true,
    runtime_pid: record.runtime_pid,
  });

  expect(await previewStatus(project)).toMatchObject({
    state: 'failed',
    process_alive: false,
    supervisor_retired: true,
    stale_session_recovered: true,
  });
  // Status is read-only so concurrent observers cannot overwrite a new session.
  expect(readPreviewRecord(project)).toMatchObject({ state: 'running' });
  expect(await previewStatus(project)).not.toHaveProperty('token');
  expect(await callCli('stop')).toMatchObject({ ok: true, process_alive: false });
  expect(await callCli('check')).toMatchObject({ result: 'FAIL', process_alive: false });

  runtime.mode = 'running';
  expect(await callCli('start')).toMatchObject({ ok: true, state: 'running' });
});

test.each(['stop', 'check'])(
  'direct %s recovers a legacy session without a prior status call',
  async (action) => {
    record = pendingRecord();
    record.state = 'running';
    record.supervisor_pid = 2147483646;
    writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
    writePrivateJson(path.join(previewRoundDirectory(record), 'result.json'), {
      ...record,
      runtime_pid: 2147483647,
      process_alive: true,
    });
    expect(await callCli(action)).toMatchObject({
      process_alive: false,
      supervisor_retired: true,
      ...(action === 'stop' ? { ok: true } : { result: 'FAIL' }),
    });
  }
);

test.each(['alive', 'unknown', 'reloading'])('does not recover %s ownership', async (mode) => {
  record = pendingRecord();
  record.state = mode === 'reloading' ? 'reloading' : 'running';
  record.supervisor_pid = 2147483646;
  record.runtime_pid = mode === 'alive' ? process.pid : 2147483647;
  writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
  writePrivateJson(path.join(previewRoundDirectory(record), 'result.json'), {
    ...record,
    process_alive: true,
  });
  const kill =
    mode === 'unknown'
      ? jest.spyOn(process, 'kill').mockImplementation(() => {
          throw Object.assign(new Error('denied'), { code: 'EPERM' });
        })
      : undefined;
  try {
    expect(await callCli('start')).toMatchObject({ ok: false });
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    kill?.mockRestore();
  }
});

test.each([
  ['session_id', randomUUID()],
  ['reload_id', 1],
  ['supervisor_id', randomUUID()],
  ['supervisor_pid', 999999],
  ['started_at', 'another launch'],
  ['executable', '/another-runtime'],
  ['process_alive', true],
])('retirement evidence with mismatching %s cannot authorize a restart', async (field, value) => {
  await boot();
  await requestPreview(record, 'stop');
  await waitUntil(isClosed);
  record.state = 'failed';
  writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
  writePrivateJson(path.join(previewRoundDirectory(record), 'result.json'), {
    ...record,
    state: 'failed',
    process_alive: false,
    supervisor_retired: true,
    [field]: value,
  });
  expect(await previewStatus(project)).toMatchObject({
    process_alive: null,
    supervisor_retired: false,
    ok: false,
  });
});
