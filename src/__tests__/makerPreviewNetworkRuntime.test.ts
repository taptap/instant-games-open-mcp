import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PreviewRuntime } from '../maker/preview/runtime.js';
import { preparePreviewProject } from '../maker/preview/prepare.js';
import { preparePreviewServer } from '../maker/preview/network.js';
import { startPreviewAssetServer } from '../maker/preview/assets.js';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('../maker/preview/prepare.js', () => ({
  requireManifestPreviewPlatform: jest.fn(),
  preparePreviewProject: jest.fn(),
}));
jest.mock('../maker/preview/network.js', () => ({
  ...jest.requireActual('../maker/preview/network.js'),
  preparePreviewServer: jest.fn(),
}));
jest.mock('../maker/preview/assets.js', () => ({ startPreviewAssetServer: jest.fn() }));

let root: string;
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
  jest.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-network-runtime-'));
  jest.mocked(preparePreviewProject).mockResolvedValue({
    source_directory: root,
    entry: 'main.lua',
  });
  jest.mocked(preparePreviewServer).mockResolvedValue({
    userId: 123,
    connectInfo: { pod_ip: '61.254', server_port: 0, ws_port: 1234 },
  });
  jest.mocked(startPreviewAssetServer).mockResolvedValue({
    url: 'http://127.0.0.1:12345/assets/',
    close: jest.fn(async () => {}),
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
        if (value === 'win32') {
          const alias = args.find((arg) => arg.startsWith('-tapcode_dir='))!.slice(13);
          expect(fs.realpathSync(alias)).toBe(fs.realpathSync(root));
          expect(jest.mocked(spawn).mock.calls.at(-1)![2]).toMatchObject({ cwd: alias });
        } else {
          expect(args).toContain('-game_url=http://127.0.0.1:12345/assets/');
        }
      } finally {
        await instance.stop();
      }
    }
    expect(preparePreviewServer).toHaveBeenCalledTimes(2);
  }
);

test('allocation failure does not launch a misleading offline window or leave an asset server', async () => {
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
  expect(startPreviewAssetServer).not.toHaveBeenCalled();
});

test('Windows stop removes only the owned alias after the child closes', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  fs.writeFileSync(path.join(root, 'sentinel'), 'preserved');
  const instance = runtime();
  await instance.start('main.lua', root);
  const args = jest.mocked(spawn).mock.calls.at(-1)![1] as string[];
  const alias = args.find((arg) => arg.startsWith('-tapcode_dir='))!.slice(13);
  await instance.stop();
  expect(fs.existsSync(alias)).toBe(false);
  expect(fs.readFileSync(path.join(root, 'sentinel'), 'utf8')).toBe('preserved');
});

test('Windows synchronous spawn failure releases the alias and preserves source', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  let alias = '';
  jest.mocked(spawn).mockImplementationOnce((_command, args) => {
    alias = (args as string[]).find((arg) => arg.startsWith('-tapcode_dir='))!.slice(13);
    throw new Error('injected spawn failure');
  });
  await expect(runtime().start('main.lua', root)).rejects.toThrow('injected spawn failure');
  expect(alias).not.toBe('');
  expect(fs.existsSync(alias)).toBe(false);
  expect(fs.existsSync(root)).toBe(true);
});
