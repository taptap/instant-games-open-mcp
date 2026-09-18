import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { checkMakerPythonEnvironment } from '../system/python.js';
import {
  previewDirectory,
  runtimeDirectory,
  writePrivateJson,
  type RuntimeInfo,
} from './protocol.js';
import { probeRuntime } from './runtime.js';
import { ensurePreviewRuntimeResources } from './runtimeResources.js';
import { PREVIEW_INSTALLER_SOURCE } from './installerSource.js';
import { runPreviewInstaller } from './installerProcess.js';
import { trimPreviewCache, UNVERIFIED_CLEANUP_MARKER } from './cache.js';
import { claimRecoveryMutex } from '../system/recoveryMutex.js';
import { processPresence } from '../system/processPresence.js';

export type PreviewInstallation = {
  install_state: 'missing' | 'ready';
  executable?: string;
  runtime?: RuntimeInfo;
  archive_sha256?: string;
  installed_at?: string;
  warnings?: string[];
};

function readInstallation(filename: string): PreviewInstallation | undefined {
  if (!fs.existsSync(filename)) return undefined;
  try {
    const value = JSON.parse(fs.readFileSync(filename, 'utf8')) as PreviewInstallation;
    if (
      value.install_state !== 'ready' ||
      !value.executable ||
      !path.isAbsolute(value.executable) ||
      !fs.statSync(value.executable).isFile()
    ) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function isInside(directory: string, filename: string): boolean {
  const relative = path.relative(directory, filename);
  return relative !== '' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function legacyPreviewInstallation(project: string): PreviewInstallation | undefined {
  const root = path.dirname(previewDirectory(project));
  if (!fs.existsSync(root)) return undefined;
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name));
  const candidates: Array<{ installation: PreviewInstallation; modified: number }> = [];
  for (const entry of entries) {
    const directory = path.join(root, entry.name);
    const filename = path.join(directory, 'installation.json');
    const installation = readInstallation(filename);
    if (!installation?.executable) continue;
    try {
      const executable = fs.realpathSync(installation.executable);
      const managedDirectory = fs.realpathSync(directory);
      if (!isInside(managedDirectory, executable)) continue;
      candidates.push({
        installation: { ...installation, executable },
        modified: Date.parse(installation.installed_at || '') || fs.statSync(filename).mtimeMs,
      });
    } catch {
      // Ignore invalid legacy records and continue looking for a usable installation.
    }
  }
  candidates.sort((left, right) => right.modified - left.modified);
  return candidates[0]?.installation;
}

export function previewInstallation(project: string): PreviewInstallation {
  const filename = path.join(runtimeDirectory(), 'installation.json');
  const current = readInstallation(filename);
  if (current) return current;
  const legacy = legacyPreviewInstallation(project);
  if (!legacy) return { install_state: 'missing' };
  try {
    writePrivateJson(filename, legacy);
    return legacy;
  } catch {
    return {
      ...legacy,
      warnings: [
        ...(legacy.warnings || []),
        'Legacy Runtime is usable, but its machine-wide registration could not be saved.',
      ],
    };
  }
}

async function withFileLock<T>(
  directory: string,
  name: string,
  busyMessage: string,
  action: () => Promise<T>
): Promise<T> {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, name);
  let descriptor: number;
  try {
    descriptor = fs.openSync(filename, 'wx', 0o600);
  } catch {
    throw new Error(
      busyMessage +
        ' If an interrupted command left a lock, verify it exited before removing ' +
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

export async function withPreviewLock<T>(project: string, action: () => Promise<T>): Promise<T> {
  const directory = previewDirectory(project);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(fs.realpathSync(directory), 'operation.lock');
  const busy = () =>
    new Error('Another preview operation is in progress. Please retry after it finishes.');
  // All new preview operations hold this OS-owned guard through release, so two
  // recoverers cannot remove one another's replacement file.
  const release = await claimRecoveryMutex(filename, busy);
  const identity = JSON.stringify({
    pid: process.pid,
    created_at: new Date().toISOString(),
    id: randomUUID(),
  });
  let owned = false;
  try {
    if (fs.existsSync(filename)) {
      const previous = fs.readFileSync(filename, 'utf8');
      let pid: unknown;
      try {
        pid = JSON.parse(previous).pid;
      } catch {
        /* Keep malformed ownership records. */
      }
      if (typeof pid !== 'number' || processPresence(pid) !== 'missing')
        throw new Error(
          'Preview operation ownership is still active or unverified. ' +
            'Confirm the previous command has exited before removing only: ' +
            filename
        );
      fs.unlinkSync(filename);
    }
    fs.writeFileSync(filename, identity, { flag: 'wx', mode: 0o600 });
    owned = true;
    return await action();
  } finally {
    try {
      if (owned) removeOwnedPreviewLock(filename, identity);
    } finally {
      await release();
    }
  }
}

function removeOwnedPreviewLock(filename: string, identity: string): void {
  try {
    if (fs.readFileSync(filename, 'utf8') === identity) fs.unlinkSync(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function withRuntimeInstallLock<T>(action: () => Promise<T>): Promise<T> {
  return withFileLock(
    runtimeDirectory(),
    'installation.lock',
    'Another Runtime installation is in progress.',
    action
  );
}

function activePreviewRuntimeDirectories(project: string): string[] {
  const root = path.dirname(previewDirectory(project));
  if (!fs.existsSync(root)) return [];
  const protectedDirectories: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
    const filename = path.join(root, entry.name, 'session.json');
    if (!fs.existsSync(filename)) continue;
    try {
      const record = JSON.parse(fs.readFileSync(filename, 'utf8')) as {
        state?: string;
        executable?: string;
      };
      if (record.state !== 'stopped' && record.executable && path.isAbsolute(record.executable)) {
        protectedDirectories.push(path.dirname(record.executable));
      }
    } catch {
      // Invalid session records cannot authorize deletion or process management.
    }
  }
  return protectedDirectories;
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
    if (compatible && !update) {
      const resources = ensurePreviewRuntimeResources(previous.executable);
      return {
        ...previous,
        warnings: [...new Set([...(previous.warnings || []), ...resources.warnings])],
      };
    }
  }
  const directory = runtimeDirectory();
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
    const resources = ensurePreviewRuntimeResources(executable);
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
      warnings: resources.warnings,
    };
    const protectedDirectories = [staging, ...activePreviewRuntimeDirectories(project)];
    if (previous.executable) protectedDirectories.push(path.dirname(previous.executable));
    installation.warnings = [
      ...(installation.warnings || []),
      ...trimPreviewCache(directory, 'runtime-', 2, protectedDirectories),
    ];
    writePrivateJson(path.join(directory, 'installation.json'), installation);
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
