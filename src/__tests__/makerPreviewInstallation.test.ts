import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPreviewInstaller } from '../maker/preview/installerProcess.js';
import {
  installPreviewRuntime,
  previewInstallation,
  withPreviewLock,
} from '../maker/preview/installation.js';
import { probeRuntime } from '../maker/preview/runtime.js';
import { previewDirectory, writePrivateJson } from '../maker/preview/protocol.js';
import { checkMakerPythonEnvironment } from '../maker/system/python.js';

jest.mock('../maker/preview/installerProcess.js', () => ({ runPreviewInstaller: jest.fn() }));
jest.mock('../maker/preview/runtime.js', () => ({ probeRuntime: jest.fn() }));
jest.mock('../maker/system/python.js', () => ({ checkMakerPythonEnvironment: jest.fn() }));

const info = {
  protocol_version: 1,
  runtime_version: 'fixture-1',
  platform: 'darwin',
  arch: process.arch,
  capabilities: [],
};
let root: string;
let home: string | undefined;
let platform: PropertyDescriptor;

beforeEach(() => {
  jest.resetAllMocks();
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-install-preview-')));
  home = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  jest
    .mocked(checkMakerPythonEnvironment)
    .mockReturnValue({ ready: true, python: '/python', status: 'ready' } as ReturnType<
      typeof checkMakerPythonEnvironment
    >);
  jest.mocked(probeRuntime).mockResolvedValue(info);
  jest.mocked(runPreviewInstaller).mockImplementation(async (_python, parameters) => {
    const destination = parameters[parameters.indexOf('--dest') + 1];
    fs.writeFileSync(path.join(destination, 'UrhoXRuntime'), 'binary');
    fs.writeFileSync(path.join(destination, 'UrhoXRuntime.zip'), 'archive');
    return { stdout: 'installed', stderr: '' };
  });
});

afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  if (home === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = home;
  fs.rmSync(root, { recursive: true, force: true });
});

function previousInstallation(): string {
  const executable = path.join(root, 'previous-runtime');
  fs.writeFileSync(executable, 'old usable binary');
  writePrivateJson(path.join(previewDirectory(root), 'installation.json'), {
    install_state: 'ready',
    executable,
    runtime: info,
  });
  return executable;
}

test('installer is explicitly given a new managed destination and records validated version/hash', async () => {
  const result = await installPreviewRuntime(root);
  expect(result).toMatchObject({
    install_state: 'ready',
    runtime: info,
    archive_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  const args = jest.mocked(runPreviewInstaller).mock.calls[0][1];
  expect(args).toContain('--dest');
  expect(args).toContain('darwin');
  expect(path.dirname(result.executable!)).toBe(args[args.indexOf('--dest') + 1]);
  expect(previewInstallation(root).executable).toBe(result.executable);
});

test('a compatible installation is reused without executing the installer', async () => {
  const previous = previousInstallation();
  expect((await installPreviewRuntime(root)).executable).toBe(previous);
  expect(runPreviewInstaller).not.toHaveBeenCalled();
});

test('executable verification failure preserves the old installation and removes only new staging', async () => {
  const previous = previousInstallation();
  jest
    .mocked(probeRuntime)
    .mockResolvedValueOnce(info)
    .mockRejectedValueOnce(new Error('executable missing'));
  await expect(installPreviewRuntime(root, undefined, true)).rejects.toThrow(
    'previous installation was preserved'
  );
  expect(fs.readFileSync(previous, 'utf8')).toBe('old usable binary');
  expect(previewInstallation(root).executable).toBe(previous);
  expect(fs.readdirSync(previewDirectory(root))).toEqual(['installation.json']);
});

test('download failure preserves the old pointer and missing Python gives a dependency guide', async () => {
  const previous = previousInstallation();
  jest.mocked(runPreviewInstaller).mockRejectedValue(new Error('download failed'));
  await expect(installPreviewRuntime(root, undefined, true)).rejects.toThrow('download failed');
  expect(previewInstallation(root).executable).toBe(previous);
  jest
    .mocked(checkMakerPythonEnvironment)
    .mockReturnValue({ ready: false } as ReturnType<typeof checkMakerPythonEnvironment>);
  await expect(installPreviewRuntime(root, undefined, true)).rejects.toThrow('Python and curl');
});

test('project installation locks serialize operations and are released on failure', async () => {
  await withPreviewLock(root, async () => {
    await expect(withPreviewLock(root, async () => 'should not run')).rejects.toThrow(
      'in progress'
    );
  });
  await expect(
    withPreviewLock(root, async () => {
      throw new Error('failure');
    })
  ).rejects.toThrow('failure');
  expect(fs.existsSync(path.join(previewDirectory(root), 'operation.lock'))).toBe(false);
});

test('Windows installation selects the exe artifact and Windows CDN target', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  jest.mocked(probeRuntime).mockResolvedValue({ ...info, platform: 'win32', arch: process.arch });
  jest.mocked(runPreviewInstaller).mockImplementation(async (_python, parameters) => {
    const destination = parameters[parameters.indexOf('--dest') + 1];
    fs.writeFileSync(path.join(destination, 'UrhoXRuntime.exe'), 'binary');
    fs.writeFileSync(path.join(destination, 'UrhoXRuntime.zip'), 'archive');
    return { stdout: '', stderr: '' };
  });
  const result = await installPreviewRuntime(root);
  expect(result.executable?.endsWith('UrhoXRuntime.exe')).toBe(true);
  const args = jest.mocked(runPreviewInstaller).mock.calls[0][1];
  expect(args).toContain('win32');
});

test('successful updates retain current and previous managed installations only', async () => {
  const paths: string[] = [];
  for (let i = 0; i < 5; i++) {
    const installed = await installPreviewRuntime(root, undefined, true);
    paths.push(path.dirname(installed.executable!));
  }
  expect(
    fs.readdirSync(previewDirectory(root)).filter((name) => name.startsWith('runtime-'))
  ).toHaveLength(2);
  expect(fs.existsSync(paths[3])).toBe(true);
  expect(fs.existsSync(paths[4])).toBe(true);
  expect(fs.existsSync(paths[0])).toBe(false);
});

test('unverified installer cleanup preserves staging and the previous pointer', async () => {
  const previous = previousInstallation();
  jest
    .mocked(runPreviewInstaller)
    .mockRejectedValue(
      Object.assign(new Error('cancelled without confirmed cleanup'), { cleanupVerified: false })
    );
  await expect(installPreviewRuntime(root, undefined, true)).rejects.toThrow(
    'staging was retained'
  );
  expect(previewInstallation(root).executable).toBe(previous);
  const entries = fs
    .readdirSync(previewDirectory(root))
    .filter((name) => name.startsWith('runtime-'));
  expect(entries).toHaveLength(1);
  jest.mocked(runPreviewInstaller).mockClear();
  await expect(installPreviewRuntime(root, undefined, true)).rejects.toThrow(
    'previous installer cleanup'
  );
  expect(runPreviewInstaller).not.toHaveBeenCalled();
});
