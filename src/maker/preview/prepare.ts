import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getMakerHome, loadProjectConfig } from '../storage.js';
import { previewEntryName, readPreviewConfiguration } from './configuration.js';
import { checkMakerPythonEnvironment, setupMakerPythonEnvironment } from '../system/python.js';
import { previewDirectory } from './protocol.js';
import {
  PREVIEW_BUILDER_SOURCE,
  PREVIEW_BUILDER_DIGEST,
  PREVIEW_BUILDER_COMMIT,
} from './builderSource.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { trimPreviewCache } from './cache.js';

export function requireManifestPreviewPlatform(platform = process.platform): void {
  if (platform !== 'win32' && platform !== 'darwin')
    throw new Error(
      'PUBLIC_PREVIEW_PLATFORM_UNSUPPORTED: local preview supports macOS and Windows only. ' +
        'No source-only fallback was started.'
    );
}

export function materializePreviewBuilder(): string {
  const directory = path.join(getMakerHome(), 'preview-tools', PREVIEW_BUILDER_DIGEST);
  const files = JSON.parse(
    gunzipSync(Buffer.from(PREVIEW_BUILDER_SOURCE, 'base64')).toString('utf8')
  ) as Record<string, string>;
  for (const [name, content] of Object.entries(files)) {
    const filename = path.join(directory, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== content)
      fs.writeFileSync(filename, content, { mode: 0o600 });
  }
  return path.join(directory, 'project_builder.py');
}

function inside(root: string, relative: string): string {
  const filename = path.resolve(root, relative);
  if (path.relative(root, filename).startsWith('..') || path.isAbsolute(relative))
    throw new Error('Prepared manifest path escapes its output directory.');
  return filename;
}

function copyTree(source: string, target: string, signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('CANCELLED');
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink())
    throw new Error(`Local prepare does not support symbolic links: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(source)) {
      copyTree(path.join(source, name), path.join(target, name), signal);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Local prepare does not support special files: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, target);
}

function validateProjectVersion(source: string): void {
  const filename = path.join(source, '.project', 'project.json');
  if (!fs.existsSync(filename))
    throw new Error(
      'Local prepare requires .project/project.json; JSONC-only and legacy root layouts are not supported.'
    );
  const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const version = Object.prototype.hasOwnProperty.call(config, 'version')
    ? config.version
    : '1.0.0';
  // Builder deletes its version directory before writing: validate before invoking Python.
  const component = typeof version === 'string' ? version.replace(/\{x\}/g, '0') : '';
  if (
    !/^[a-z0-9][a-z0-9._+-]{0,127}$/i.test(component) ||
    component.endsWith('.') ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(component)
  ) {
    throw new Error(
      'Unsafe project version: expected one portable directory component, optionally containing {x}.'
    );
  }
  inside(path.join(source, 'dist'), component);
}

export function validatePreparedPreview(source: string): Record<string, unknown> {
  const directory = path.join(source, 'dist');
  const latest = JSON.parse(fs.readFileSync(path.join(directory, 'latest.json'), 'utf8'));
  if (
    typeof latest.version !== 'string' ||
    !latest.version ||
    typeof latest.client !== 'string' ||
    !/^[a-f0-9]+$/i.test(latest.client)
  )
    throw new Error('Prepared latest.json is invalid.');
  const manifestPath = inside(directory, latest.version + '/manifest-' + latest.client + '.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest.target !== 'client' ||
    !Array.isArray(manifest.files) ||
    typeof manifest.entry !== 'string' ||
    !manifest.entry
  )
    throw new Error('Prepared client manifest is invalid.');
  const sources = manifest.sources || {};
  for (const [name, value] of Object.entries(sources)) {
    if (name === 'project') continue;
    const config = value as { base_url?: string | string[] };
    const urls = Array.isArray(config.base_url) ? config.base_url : [config.base_url];
    if (!urls.length || urls.some((url) => typeof url !== 'string' || !url.startsWith('https://')))
      throw new Error('Public source has no HTTPS CDN address: ' + name);
    const cache = path.join(source, '.build', 'manifest_cache');
    if (
      !fs.existsSync(cache) ||
      !fs.readdirSync(cache).some((file) => file.startsWith(name + '-') && file.endsWith('.json'))
    )
      throw new Error('Public source index was not downloaded: ' + name);
  }
  let projectFiles = 0;
  for (const file of manifest.files) {
    if (file.source && file.source !== 'project') continue;
    if (
      typeof file.uuid !== 'string' ||
      typeof file.hash !== 'string' ||
      typeof file.ext !== 'string'
    )
      throw new Error('Prepared project asset metadata is invalid.');
    const asset = inside(path.join(directory, 'assets'), file.uuid + '-' + file.hash + file.ext);
    if (!fs.statSync(asset).isFile())
      throw new Error('Prepared project asset is missing: ' + asset);
    if (typeof file.size === 'number' && fs.statSync(asset).size !== file.size)
      throw new Error('Prepared project asset size mismatch: ' + asset);
    projectFiles++;
  }
  return {
    entry: manifest.entry,
    manifest_path: manifestPath,
    project_files: projectFiles,
    public_sources: Object.keys(sources),
    builder_commit: PREVIEW_BUILDER_COMMIT,
  };
}

export async function preparePreviewProject(
  project: string,
  directory: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> | undefined;
  try {
    result = await prepareProjectCopy(project, directory, signal);
    return result;
  } finally {
    const preparations = path.join(previewDirectory(project), 'preparations');
    if (path.dirname(directory) === preparations) {
      const warnings = trimPreviewCache(preparations, '', 3, [directory]);
      if (result)
        result.warnings = [...(Array.isArray(result.warnings) ? result.warnings : []), ...warnings];
      else if (warnings.length) process.stderr.write(warnings.join('\n') + '\n');
    }
  }
}

async function prepareProjectCopy(
  project: string,
  directory: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (signal?.aborted) throw new Error('CANCELLED');
  const projectConfig = readPreviewConfiguration(project, 'project');
  const resourcesConfig = readPreviewConfiguration(project, 'resources');
  const settingsConfig = readPreviewConfiguration(project, 'settings');
  const source = path.join(directory, 'source');
  if (fs.existsSync(source)) throw new Error('Refusing to reuse an old prepared source directory.');
  fs.mkdirSync(source, { recursive: true, mode: 0o700 });
  for (const name of ['scripts', 'assets', '.project']) {
    const original = path.join(project, name);
    if (fs.existsSync(original)) copyTree(original, path.join(source, name), signal);
  }
  const configDirectory = path.join(source, '.project');
  fs.mkdirSync(configDirectory, { recursive: true });
  const projectDefaults = projectConfig || {
    project_id: loadProjectConfig(project)?.project_id || 'local-preview',
    author: { id: 'local-preview' },
    version: '1.0.0',
  };
  // Defaults exist only in this preparation; publishing files and existing resource IDs stay untouched.
  if (projectDefaults['entry@client'] === undefined && projectDefaults.entry === undefined)
    projectDefaults.entry = previewEntryName(projectConfig, resourcesConfig);
  fs.writeFileSync(path.join(configDirectory, 'project.json'), JSON.stringify(projectDefaults));
  if (!resourcesConfig)
    fs.writeFileSync(
      path.join(configDirectory, 'resources.json'),
      JSON.stringify({ groups: { default: ['**'] }, preload_groups: [] })
    );
  validateProjectVersion(source);
  const configuration = settingsConfig || {
    sources: {
      engine: { tag: 'stable' },
      'engine-res': { tag: 'stable' },
      'official-res': { tag: 'stable' },
    },
    build: { asset_dirs: ['../assets', '../scripts'], generate_fs_path: true },
  };
  const directories = configuration.build?.asset_dirs;
  if (
    directories &&
    (!Array.isArray(directories) ||
      directories.some(
        (value: unknown) =>
          typeof value !== 'string' ||
          !['../assets', '../scripts', '../assets/', '../scripts/'].includes(value)
      ))
  )
    throw new Error(
      'Local prepare currently supports project-local scripts/assets only; custom asset_dirs need explicit support.'
    );
  configuration.build = { ...configuration.build, output_dir: '../dist' };
  fs.writeFileSync(path.join(source, '.project', 'settings.json'), JSON.stringify(configuration));
  let python = checkMakerPythonEnvironment();
  if (!python.ready) python = setupMakerPythonEnvironment().environment;
  if (!python.ready || !python.python)
    throw new Error('Could not prepare the managed Python environment.');
  const builder = materializePreviewBuilder();
  const args = [builder, '--project', source, '--force-enhanced-refs', '--no-7z', '--no-compress'];
  const cache = path.join(previewDirectory(project), 'public-index-cache');
  const roundCache = path.join(source, '.build', 'manifest_cache');
  if (fs.existsSync(cache)) copyTree(cache, roundCache, signal);
  const log = path.join(directory, 'prepare.log');
  try {
    const output = await promisify(execFile)(python.python, args, {
      cwd: path.dirname(builder),
      windowsHide: true,
      signal,
      timeout: 300000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONNOUSERSITE: '1' },
    });
    fs.writeFileSync(log, String(sanitizeDiagnosticValue(output.stdout + output.stderr)), {
      mode: 0o600,
    });
    if (/加载远端来源.*失败|无法获取 version.json|无法下载 manifest/.test(output.stdout))
      throw new Error('Public source index download failed.');
    if (output.stdout.includes('[ERROR]')) throw new Error('ProjectBuilder reported an error.');
    const result = validatePreparedPreview(source);
    if (fs.existsSync(roundCache)) copyTree(roundCache, cache, signal);
    return {
      ok: true,
      source_directory: source,
      log_path: log,
      warnings: output.stdout
        .split(String.fromCharCode(10))
        .filter((line) => line.includes('[WARN]'))
        .slice(0, 30),
      ...result,
    };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    if (failure.stdout || failure.stderr || !fs.existsSync(log))
      fs.writeFileSync(
        log,
        String(
          sanitizeDiagnosticValue((failure.stdout || '') + (failure.stderr || '') || String(error))
        ),
        { mode: 0o600 }
      );
    throw new Error(
      'Local prepare failed; no Runtime was started. ' + String(error) + ' Log: ' + log
    );
  }
}

export function previewPreparationDirectory(project: string): string {
  return path.join(previewDirectory(project), 'preparations', randomUUID());
}
