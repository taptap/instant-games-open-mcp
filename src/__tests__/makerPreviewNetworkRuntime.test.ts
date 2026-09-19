import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PreviewRuntime } from '../maker/preview/runtime.js';
import { preparePreviewProject } from '../maker/preview/prepare.js';
import { preparePreviewServer } from '../maker/preview/network.js';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('../maker/preview/prepare.js', () => ({
  requireManifestPreviewPlatform: jest.fn(),
  preparePreviewProject: jest.fn(),
}));
jest.mock('../maker/preview/network.js', () => ({
  ...jest.requireActual('../maker/preview/network.js'),
  preparePreviewServer: jest.fn(),
}));

let root: string;
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
  jest.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-network-runtime-'));
  fs.mkdirSync(path.join(root, '.project'), { recursive: true });
  for (const name of ['project', 'resources', 'settings'])
    fs.writeFileSync(path.join(root, '.project', name + '.json'), '{}');
  jest.mocked(preparePreviewProject).mockResolvedValue({
    source_directory: root,
    entry: 'main.lua',
  });
  jest.mocked(preparePreviewServer).mockResolvedValue({
    userId: 123,
    connectInfo: { pod_ip: '61.254', server_port: 0, ws_port: 1234 },
  });
  jest.mocked(spawn).mockImplementation(() => {
    const events = new EventEmitter();
    const child = Object.assign(events, {
      pid: 1234,
      exitCode: null as number | null,
      signalCode: null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: new PassThrough(),
      kill() {
        this.exitCode = 0;
        this.stdout.end();
        this.stderr.end();
        queueMicrotask(() => events.emit('close', 0));
        return true;
      },
    });
    queueMicrotask(() => child.emit('spawn'));
    return child as unknown as ReturnType<typeof spawn>;
  });
});
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  fs.rmSync(root, { recursive: true, force: true });
});

function runtime(): PreviewRuntime {
  return new PreviewRuntime(
    '/runtime',
    {
      protocol_version: 1,
      project_realpath: root,
      session_id: 'test',
      reload_id: 0,
    },
    root,
    jest.fn()
  );
}

test.each(['darwin', 'win32'])(
  '%s launch and restart use fresh connection info with skip_login',
  async (value) => {
    Object.defineProperty(process, 'platform', { value });
    for (let round = 0; round < 2; round++) {
      const instance = runtime();
      try {
        await instance.start('main.lua', root, {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          defaulted: true,
        });
        const args = jest.mocked(spawn).mock.calls.at(-1)![1] as string[];
        expect(args).toContain('-skip_login');
        expect(args).toContain('-server=entrance-new-pd.spark.xd.com');
        expect(args.some((arg) => arg.startsWith('-directConnectParams='))).toBe(true);
        expect(args).toContain('main.lua');
        expect(args).toContain('-tapcode_dir=' + root);
        expect(jest.mocked(spawn).mock.calls.at(-1)![2]).toMatchObject({ cwd: root });
      } finally {
        await instance.stop();
      }
    }
    expect(preparePreviewServer).toHaveBeenCalledTimes(2);
  }
);

test('configured projects launch directly from the original project', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  const instance = runtime();
  await instance.start('main.lua', root, {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
    defaulted: true,
  });

  expect(preparePreviewProject).not.toHaveBeenCalled();
  expect(jest.mocked(spawn).mock.calls.at(-1)![1]).toEqual(
    expect.arrayContaining(['main.lua', '-tapcode_dir=' + root])
  );
  expect(jest.mocked(spawn).mock.calls.at(-1)![2]).toMatchObject({ cwd: root });
  await instance.stop();
});

test.each(['old-dist', 'resource-index'])(
  'Windows single player %s launches fresh prepared output without requesting networking',
  async (reason) => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    if (reason === 'old-dist') {
      fs.mkdirSync(path.join(root, 'dist'));
      fs.writeFileSync(path.join(root, 'dist/latest.json'), 'old');
    } else {
      fs.writeFileSync(
        path.join(root, '.project/resources.json'),
        JSON.stringify({ aliases: { player: 'uuid://player' } })
      );
    }
    const prepared = path.join(root, 'prepared');
    jest.mocked(preparePreviewProject).mockResolvedValue({
      source_directory: prepared,
      entry: 'main.lua',
    });
    jest.mocked(preparePreviewServer).mockResolvedValue(undefined);
    const instance = runtime();
    try {
      await instance.start('main.lua', root);
      expect(preparePreviewProject).toHaveBeenCalledTimes(1);
      expect(preparePreviewServer).toHaveBeenCalledWith(
        prepared,
        root,
        expect.any(AbortSignal),
        false
      );
      const args = jest.mocked(spawn).mock.calls.at(-1)![1] as string[];
      expect(args).toContain('-tapcode_dir=' + prepared);
      expect(args).not.toContain('-tapcode_dir=' + root);
      expect(args.some((arg) => arg.startsWith('-directConnectParams='))).toBe(false);
      if (reason === 'old-dist')
        expect(fs.readFileSync(path.join(root, 'dist/latest.json'), 'utf8')).toBe('old');
    } finally {
      await instance.stop();
    }
  }
);

test('projects without standard configuration use the isolated preparation path', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  fs.rmSync(path.join(root, '.project'), { recursive: true });
  const instance = runtime();
  await instance.start('main.lua', root, {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
    defaulted: true,
  });

  expect(preparePreviewProject).toHaveBeenCalledWith(root, root, expect.any(AbortSignal));
  expect(jest.mocked(spawn).mock.calls.at(-1)![1]).toEqual(
    expect.arrayContaining(['main.lua', '-tapcode_dir=' + root])
  );
  await instance.stop();
});

test('allocation failure does not launch a misleading offline window', async () => {
  jest.mocked(preparePreviewServer).mockRejectedValue(new Error('allocation failed'));
  await expect(
    runtime().start('main.lua', root, {
      width: 960,
      height: 540,
      orientation: 'landscape',
      defaulted: true,
    })
  ).rejects.toThrow('allocation failed');
  expect(spawn).not.toHaveBeenCalled();
});

test('persists a launch intent before spawning and reports PID before startup settles', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  const launching = jest.fn();
  const instance = new PreviewRuntime(
    '/runtime',
    { protocol_version: 1, project_realpath: root, session_id: 'test', reload_id: 0 },
    root,
    jest.fn(),
    undefined,
    launching
  );
  try {
    await instance.start('main.lua', root);
    expect(launching.mock.calls).toEqual([[], [1234]]);
    expect(launching.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(spawn).mock.invocationCallOrder[0]
    );
  } finally {
    await instance.stop();
  }
});

test.each([false, true])(
  'PID persistence failure stops Runtime even if cleanup persistence fails: %s',
  async (cleanupFails) => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    fs.writeFileSync(path.join(root, 'sentinel'), 'preserved');
    const instance = new PreviewRuntime(
      '/runtime',
      { protocol_version: 1, project_realpath: root, session_id: 'test', reload_id: 0 },
      root,
      () => {
        if (cleanupFails) throw new Error('cleanup persistence denied');
      },
      undefined,
      (pid) => {
        if (pid !== undefined) throw new Error('PID persistence denied');
      }
    );
    await expect(instance.start('main.lua', root)).rejects.toThrow('PID persistence denied');
    expect(instance.processAlive).toBe(false);
    const args = jest.mocked(spawn).mock.calls.at(-1)![1] as string[];
    expect(args).toContain('-tapcode_dir=' + root);
    expect(fs.readFileSync(path.join(root, 'sentinel'), 'utf8')).toBe('preserved');
    if (cleanupFails) expect(instance.errors.join(' ')).toContain('cleanup persistence denied');
  }
);

test('running state persistence failure stops the owned Runtime', async () => {
  const instance = new PreviewRuntime(
    '/runtime',
    { protocol_version: 1, project_realpath: root, session_id: 'test', reload_id: 0 },
    root,
    (state) => {
      if (state === 'running') throw new Error('running persistence denied');
    }
  );
  await expect(instance.start('main.lua', root)).rejects.toThrow('running persistence denied');
  expect(instance.processAlive).toBe(false);
});

test('unconfirmed stop preserves the original project and reports persistence failure', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  jest.useFakeTimers();
  const original = jest.mocked(spawn).getMockImplementation()!;
  let child: any;
  jest.mocked(spawn).mockImplementationOnce((...args: any[]) => {
    child = (original as any)(...args);
    child.kill = jest.fn(() => false);
    return child;
  });
  const instance = new PreviewRuntime(
    '/runtime',
    { protocol_version: 1, project_realpath: root, session_id: 'test', reload_id: 0 },
    root,
    jest.fn(),
    undefined,
    (pid) => {
      if (pid !== undefined) throw new Error('PID persistence denied');
    }
  );
  try {
    const rejected = expect(instance.start('main.lua', root)).rejects.toThrow(
      'Runtime cleanup is unverified'
    );
    await jest.advanceTimersByTimeAsync(7100);
    await rejected;
    expect(instance.processAlive).toBe(true);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(fs.existsSync(root)).toBe(true);
  } finally {
    if (child) {
      child.exitCode = 0;
      child.emit('close', 0);
    }
    await jest.advanceTimersByTimeAsync(0);
    jest.useRealTimers();
  }
});
