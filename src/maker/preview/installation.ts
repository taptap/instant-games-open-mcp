import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { checkMakerPythonEnvironment } from '../system/python.js';
import {
  previewDirectory,
  readPreviewRecord,
  writePrivateJson,
  type RuntimeInfo,
} from './protocol.js';
import { probeRuntime } from './runtime.js';
import { PREVIEW_INSTALLER_SOURCE } from './installerSource.js';
import { runPreviewInstaller } from './installerProcess.js';
import { trimPreviewCache, UNVERIFIED_CLEANUP_MARKER } from './cache.js';

export type PreviewInstallation = {
  install_state: 'missing' | 'ready';
  executable?: string;
  runtime?: RuntimeInfo;
  archive_sha256?: string;
  installed_at?: string;
  warnings?: string[];
};

export function previewInstallation(project: string): PreviewInstallation {
  const filename = path.join(previewDirectory(project), 'installation.json');
  if (!fs.existsSync(filename)) return { install_state: 'missing' };
  const value = JSON.parse(fs.readFileSync(filename, 'utf8')) as PreviewInstallation;
  if (!value.executable || !path.isAbsolute(value.executable) || !fs.existsSync(value.executable))
    return { install_state: 'missing' };
  return value;
}

export async function withPreviewLock<T>(project: string, action: () => Promise<T>): Promise<T> {
  const directory = previewDirectory(project);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'operation.lock');
  let descriptor: number;
  try {
    descriptor = fs.openSync(filename, 'wx', 0o600);
  } catch {
    throw new Error(
      'Another preview start/install is in progress. If an interrupted command left a lock, verify that command has exited before removing ' +
        filename
    );
  }
  try {
    fs.writeFileSync(
      descriptor,
      JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })
    );
    return await action();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(filename);
  }
}

export async function installPreviewRuntime(
  project: string,
  signal?: AbortSignal,
  update = false
): Promise<PreviewInstallation> {
  if (!['darwin', 'win32'].includes(process.platform))
    throw new Error('Local preview installation supports macOS and Windows only.');
  const previous = previewInstallation(project);
  if (previous.executable) {
    const compatible = await probeRuntime(previous.executable, signal).then(
      () => true,
      () => false
    );
    if (signal?.aborted) throw new Error('CANCELLED');
    if (compatible && !update) return previous;
  }
  const directory = previewDirectory(project);
  const unresolved =
    fs.existsSync(directory) &&
    fs
      .readdirSync(directory, { withFileTypes: true })
      .find(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith('runtime-') &&
          fs.existsSync(path.join(directory, entry.name, UNVERIFIED_CLEANUP_MARKER))
      );
  if (unresolved) {
    throw new Error(
      'The previous installer cleanup is unverified. Confirm its processes have exited before removing only the marked directory: ' +
        path.join(directory, unresolved.name)
    );
  }
  const python = checkMakerPythonEnvironment();
  if (!python.ready || !python.python) {
    throw new Error(
      'Runtime installation needs Python and curl. Run taptap-maker python setup with host approval, then retry.'
    );
  }
  const staging = path.join(directory, 'runtime-' + randomUUID());
  fs.mkdirSync(staging, { recursive: true, mode: 0o700 });
  const installer = path.join(staging, 'install-urhox-runtime.py');
  fs.writeFileSync(installer, PREVIEW_INSTALLER_SOURCE, { mode: 0o600 });
  const platform = process.platform === 'win32' ? 'win32' : 'darwin';
  try {
    await runPreviewInstaller(
      python.python,
      [installer, '--platform', platform, '--dest', staging],
      {
        cwd: staging,
        timeoutMs: 300000,
        maxBuffer: 1024 * 1024,
        signal,
      }
    );
    const executable = fs.realpathSync(
      path.join(staging, platform === 'win32' ? 'UrhoXRuntime.exe' : 'UrhoXRuntime')
    );
    const runtime = await probeRuntime(executable, signal);
    const archive = path.join(staging, 'UrhoXRuntime.zip');
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
    const installation: PreviewInstallation = {
      install_state: 'ready',
      executable,
      runtime,
      archive_sha256: hash.digest('hex'),
      installed_at: new Date().toISOString(),
    };
    const record = readPreviewRecord(project);
    const protectedDirectories = [staging];
    if (previous.executable) protectedDirectories.push(path.dirname(previous.executable));
    if (record && record.state !== 'stopped')
      protectedDirectories.push(path.dirname(record.executable));
    writePrivateJson(path.join(directory, 'installation.json'), installation);
    installation.warnings = trimPreviewCache(directory, 'runtime-', 2, protectedDirectories);
    return installation;
  } catch (error) {
    const cleanupUnverified = (error as { cleanupVerified?: boolean }).cleanupVerified === false;
    if (!cleanupUnverified) fs.rmSync(staging, { recursive: true, force: true });
    else
      fs.writeFileSync(
        path.join(staging, UNVERIFIED_CLEANUP_MARKER),
        'Installer process ownership must be verified before cleanup.\n',
        { mode: 0o600 }
      );
    throw new Error(
      'Runtime installation or executable validation failed; previous installation was preserved. ' +
        String(error) +
        (cleanupUnverified
          ? ' Installer cleanup was not verified; staging was retained at ' + staging
          : '')
    );
  }
}
