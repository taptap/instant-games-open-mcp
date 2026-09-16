import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPreviewInstaller } from '../maker/preview/installerProcess.js';
import {
  installPreviewRuntime,
  previewInstallation,
  withRuntimeInstallLock,
  withPreviewLock,
} from '../maker/preview/installation.js';
import { probeRuntime } from '../maker/preview/runtime.js';
import { previewDirectory, runtimeDirectory, writePrivateJson } from '../maker/preview/protocol.js';
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
  const directory = path.join(runtimeDirectory(), 'runtime-previous');
  fs.mkdirSync(directory, { recursive: true });
  const executable = path.join(directory, 'UrhoXRuntime');
  fs.writeFileSync(executable, 'old usable binary');
  writePrivateJson(path.join(runtimeDirectory(), 'installation.json'), {
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
  expect(path.dirname(result.executable!).startsWith(runtimeDirectory() + path.sep)).toBe(true);
  expect(previewInstallation(root).executable).toBe(result.executable);
});

test('one managed Runtime installation is shared by every project', async () => {
  const projectA = path.join(root, 'project-a');
  const projectB = path.join(root, 'project-b');
  const installed = await installPreviewRuntime(projectA);

  expect(previewInstallation(projectB)).toMatchObject({
    install_state: 'ready',
    executable: installed.executable,
    runtime: info,
  });
  expect(fs.existsSync(path.join(previewDirectory(projectB), 'installation.json'))).toBe(false);
});

test('a valid legacy project installation is registered globally without downloading again', () => {
  const projectA = path.join(root, 'project-a');
  const projectB = path.join(root, 'project-b');
  const legacyDirectory = path.join(previewDirectory(projectA), 'runtime-' + 'a'.repeat(36));
  fs.mkdirSync(legacyDirectory, { recursive: true });
  const executable = path.join(legacyDirectory, 'UrhoXRuntime');
  fs.writeFileSync(executable, 'legacy binary');
  writePrivateJson(path.join(previewDirectory(projectA), 'installation.json'), {
    install_state: 'ready',
    executable,
    runtime: info,
    installed_at: '2026-09-15T08:00:00.000Z',
  });

  expect(previewInstallation(projectB)).toMatchObject({
    install_state: 'ready',
    executable,
    installed_at: '2026-09-15T08:00:00.000Z',
  });
  expect(
    JSON.parse(fs.readFileSync(path.join(runtimeDirectory(), 'installation.json'), 'utf8'))
  ).toMatchObject({ executable });
  expect(runPreviewInstaller).not.toHaveBeenCalled();
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
  expect(fs.readdirSync(runtimeDirectory()).sort()).toEqual([
    'installation.json',
    'runtime-previous',
  ]);
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

test('Runtime installation lock is machine-global and released on failure', async () => {
  await withRuntimeInstallLock(async () => {
    await expect(withRuntimeInstallLock(async () => 'should not run')).rejects.toThrow(
      'Runtime installation is in progress'
    );
  });
  await expect(
    withRuntimeInstallLock(async () => {
      throw new Error('failure');
    })
  ).rejects.toThrow('failure');
  expect(fs.existsSync(path.join(runtimeDirectory(), 'installation.lock'))).toBe(false);
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
    fs.readdirSync(runtimeDirectory()).filter((name) => name.startsWith('runtime-'))
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
    .readdirSync(runtimeDirectory())
    .filter(
      (name) =>
        name.startsWith('runtime-') &&
        fs.existsSync(path.join(runtimeDirectory(), name, '.cleanup-unverified'))
    );
  expect(entries).toHaveLength(1);
  jest.mocked(runPreviewInstaller).mockClear();
  await expect(installPreviewRuntime(root, undefined, true)).rejects.toThrow(
    'previous installer cleanup'
  );
  expect(runPreviewInstaller).not.toHaveBeenCalled();
});

test('updates preserve a Runtime still referenced by another project session', async () => {
  const first = await installPreviewRuntime(root, undefined, true);
  const otherProject = path.join(root, 'other-project');
  writePrivateJson(path.join(previewDirectory(otherProject), 'session.json'), {
    protocol_version: 1,
    project_realpath: otherProject,
    session_id: '00000000-0000-0000-0000-000000000001',
    reload_id: 0,
    supervisor_id: '00000000-0000-0000-0000-000000000002',
    supervisor_pid: 123,
    started_at: '2026-09-16T00:00:00.000Z',
    token: 'a'.repeat(64),
    port: 12345,
    executable: first.executable,
    state: 'running',
    runtime: info,
  });

  await installPreviewRuntime(root, undefined, true);
  await installPreviewRuntime(root, undefined, true);

  expect(fs.existsSync(path.dirname(first.executable!))).toBe(true);
});
