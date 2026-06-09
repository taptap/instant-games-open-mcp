/**
 * Maker Python runtime detection and uv-managed bootstrap helpers.
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getMakerHome } from '../storage.js';

const PYTHON_INFO_SCRIPT = [
  'import json, sys',
  'print(json.dumps({"executable": sys.executable, "version": ".".join(map(str, sys.version_info[:3]))}))',
].join('; ');
const DEFAULT_PYTHON_VERSION = '3.13';

export type MakerPythonStatus =
  | 'ready'
  | 'missing'
  | 'pip_missing'
  | 'store_alias_only'
  | 'setup_failed';

export type MakerPythonProvider = 'system' | 'configured' | 'uv-managed';

export interface MakerPythonEnvironment {
  platform: NodeJS.Platform;
  ready: boolean;
  status: MakerPythonStatus;
  provider?: MakerPythonProvider;
  python?: string;
  version?: string;
  pipVersion?: string;
  missing: string[];
  configPath: string;
  setupCommand: string;
  pathCommand: string;
  nextAction: string;
  uv: {
    path: string;
    installed: boolean;
    version?: string;
  };
  error?: string;
}

export interface MakerPythonSetupResult {
  changed: boolean;
  environment: MakerPythonEnvironment;
  uvInstalled: boolean;
}

type SpawnRunner = (
  command: string,
  args: string[],
  options?: {
    encoding?: BufferEncoding;
    env?: NodeJS.ProcessEnv;
  }
) => SpawnSyncReturns<string>;

export interface MakerPythonRuntimeOptions {
  platform?: NodeJS.Platform;
  spawn?: SpawnRunner;
  env?: NodeJS.ProcessEnv;
}

interface PythonRuntimeConfig {
  provider?: MakerPythonProvider;
  python?: string;
  version?: string;
  saved_at?: string;
}

interface PythonCandidate {
  provider: MakerPythonProvider;
  command: string;
  argsPrefix?: string[];
}

interface PythonInfo {
  executable: string;
  version: string;
}

export function getMakerPythonConfigPath(): string {
  return path.join(getMakerHome(), 'python.json');
}

export function getMakerUvInstallRoot(): string {
  return path.join(getMakerHome(), 'bin');
}

export function getMakerUvPath(platform: NodeJS.Platform = process.platform): string {
  return path.join(getMakerUvInstallRoot(), platform === 'win32' ? 'uv.exe' : 'uv');
}

export function getMakerUvPythonInstallDir(): string {
  return path.join(getMakerHome(), 'python', 'uv');
}

export function checkMakerPythonEnvironment(
  options: MakerPythonRuntimeOptions = {}
): MakerPythonEnvironment {
  const platform = options.platform || process.platform;
  const runner = options.spawn || spawnSync;
  const env = options.env || process.env;
  const uvPath = getMakerUvPath(platform);
  const setupCommand = 'taptap-maker python setup';
  const pathCommand = 'taptap-maker python path';
  const base = {
    platform,
    configPath: getMakerPythonConfigPath(),
    setupCommand,
    pathCommand,
    uv: {
      path: uvPath,
      installed: fs.existsSync(uvPath),
      version: readUvVersion(uvPath, runner),
    },
  };

  const configuredPython = env.TAPTAP_MAKER_PYTHON_BIN;
  if (configuredPython) {
    const result = inspectPythonCandidate(
      { provider: 'configured', command: configuredPython },
      runner
    );
    if (result) {
      return resultToEnvironment(result, base);
    }
  }

  const saved = loadPythonRuntimeConfig();
  if (saved?.python) {
    const result = inspectPythonCandidate(
      { provider: saved.provider || 'configured', command: saved.python },
      runner
    );
    if (result && !isUnsupportedSystemPython(platform, result.executable, result.provider)) {
      return resultToEnvironment(result, base);
    }
  }

  let sawWindowsStoreAlias = false;
  let unsupportedPython: string | undefined;
  for (const candidate of createPythonCandidates(platform, runner)) {
    if (candidate.command === '__windows_store_alias__') {
      sawWindowsStoreAlias = true;
      continue;
    }
    const result = inspectPythonCandidate(candidate, runner);
    if (result) {
      if (isUnsupportedSystemPython(platform, result.executable, result.provider)) {
        unsupportedPython = result.executable;
        continue;
      }
      return resultToEnvironment(result, base);
    }
  }

  const status = sawWindowsStoreAlias ? 'store_alias_only' : 'missing';
  return {
    ...base,
    ready: false,
    status,
    missing: ['python'],
    error:
      status === 'store_alias_only'
        ? 'Only Windows Store Python app execution aliases were found.'
        : unsupportedPython
          ? `Apple/Xcode Python was found at ${unsupportedPython}, but Maker needs a private or user-managed Python toolchain for diagnostics.`
          : undefined,
    nextAction:
      status === 'store_alias_only'
        ? '检测到 Windows Store Python alias，但这不是真实 Python。请运行 `taptap-maker python setup` 自动准备 Maker 私有 Python。'
        : '未检测到可用 Python。请运行 `taptap-maker python setup` 自动准备 Maker 私有 Python。',
  };
}

export function setupMakerPythonEnvironment(
  options: MakerPythonRuntimeOptions = {}
): MakerPythonSetupResult {
  const before = checkMakerPythonEnvironment(options);
  if (before.ready) {
    savePythonRuntimeConfig(before);
    return { changed: false, environment: before, uvInstalled: before.uv.installed };
  }

  const platform = options.platform || process.platform;
  const runner = options.spawn || spawnSync;
  const uvPath = ensureUvInstalled(platform, runner);
  const uvEnv = createUvPythonEnv();
  const install = runner(
    uvPath,
    ['python', 'install', DEFAULT_PYTHON_VERSION, '--managed-python'],
    {
      encoding: 'utf8',
      env: uvEnv,
    }
  );
  if (install.status !== 0) {
    throw new Error(formatSetupFailure('uv python install failed', install));
  }

  const find = runner(uvPath, ['python', 'find', DEFAULT_PYTHON_VERSION], {
    encoding: 'utf8',
    env: uvEnv,
  });
  if (find.status !== 0 || !find.stdout.trim()) {
    throw new Error(formatSetupFailure('uv python find failed', find));
  }

  const python = find.stdout.trim().split(/\r?\n/)[0];
  const result = inspectPythonCandidate({ provider: 'uv-managed', command: python }, runner);
  if (!result?.pipVersion) {
    throw new Error('uv managed Python was installed, but pip is not available.');
  }
  const environment = resultToEnvironment(result, {
    platform,
    configPath: getMakerPythonConfigPath(),
    setupCommand: 'taptap-maker python setup',
    pathCommand: 'taptap-maker python path',
    uv: {
      path: uvPath,
      installed: true,
      version: readUvVersion(uvPath, runner),
    },
  });
  savePythonRuntimeConfig(environment);
  return { changed: true, environment, uvInstalled: true };
}

export function formatMakerPythonEnvironmentStatus(environment: MakerPythonEnvironment): string {
  return [
    'Python environment',
    '',
    `- python_status: ${environment.status}`,
    `- ready: ${environment.ready ? 'yes' : 'no'}`,
    environment.provider ? `- provider: ${environment.provider}` : '',
    environment.python ? `- python: ${environment.python}` : '',
    environment.version ? `- python_version: ${environment.version}` : '',
    environment.pipVersion ? `- pip_version: ${environment.pipVersion}` : '',
    `- config: ${environment.configPath}`,
    `- uv_installed: ${environment.uv.installed ? 'yes' : 'no'}`,
    `- uv_path: ${environment.uv.path}`,
    environment.uv.version ? `- uv_version: ${environment.uv.version}` : '',
    `- missing: ${environment.missing.join(', ') || '(none)'}`,
    environment.error ? `- error: ${environment.error}` : '',
    `- setup_command: ${environment.setupCommand}`,
    `- path_command: ${environment.pathCommand}`,
    `- next_action: ${environment.nextAction}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function createPythonCandidates(platform: NodeJS.Platform, runner: SpawnRunner): PythonCandidate[] {
  if (platform === 'win32') {
    const candidates: PythonCandidate[] = [
      { provider: 'system', command: 'py', argsPrefix: ['-3'] },
    ];
    const where = runner('where.exe', ['python'], { encoding: 'utf8' });
    const paths =
      where.status === 0
        ? where.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
    let sawStoreAlias = false;
    for (const item of paths) {
      if (isWindowsStorePythonAlias(item)) {
        sawStoreAlias = true;
        continue;
      }
      candidates.push({ provider: 'system', command: item });
    }
    if (sawStoreAlias) {
      candidates.push({ provider: 'system', command: '__windows_store_alias__' });
    }
    return candidates;
  }

  return [
    { provider: 'system', command: 'python3' },
    { provider: 'system', command: 'python' },
  ];
}

function inspectPythonCandidate(
  candidate: PythonCandidate,
  runner: SpawnRunner
): (PythonInfo & { provider: MakerPythonProvider; pipVersion?: string }) | undefined {
  const infoArgs = [...(candidate.argsPrefix || []), '-c', PYTHON_INFO_SCRIPT];
  const info = runner(candidate.command, infoArgs, { encoding: 'utf8' });
  if (info.status !== 0 || !info.stdout.trim()) {
    return undefined;
  }
  const parsed = parsePythonInfo(info.stdout);
  if (!parsed?.executable || !parsed.version) {
    return undefined;
  }

  const pip = runner(parsed.executable, ['-m', 'pip', '--version'], { encoding: 'utf8' });
  return {
    ...parsed,
    provider: candidate.provider,
    pipVersion: pip.status === 0 ? pip.stdout.trim() : undefined,
  };
}

function resultToEnvironment(
  result: PythonInfo & { provider: MakerPythonProvider; pipVersion?: string },
  base: Pick<
    MakerPythonEnvironment,
    'platform' | 'configPath' | 'setupCommand' | 'pathCommand' | 'uv'
  >
): MakerPythonEnvironment {
  const ready = Boolean(result.pipVersion);
  return {
    ...base,
    ready,
    status: ready ? 'ready' : 'pip_missing',
    provider: result.provider,
    python: result.executable,
    version: result.version,
    pipVersion: result.pipVersion,
    missing: ready ? [] : ['pip'],
    nextAction: ready
      ? '本地 Python 运行时可用；Maker Lua 诊断脚本可以复用该解释器。'
      : '检测到 Python，但 pip 不可用。请运行 `taptap-maker python setup` 自动准备 Maker 私有 Python。',
  };
}

function ensureUvInstalled(platform: NodeJS.Platform, runner: SpawnRunner): string {
  const uvPath = getMakerUvPath(platform);
  if (fs.existsSync(uvPath)) {
    return uvPath;
  }

  fs.mkdirSync(getMakerUvInstallRoot(), { recursive: true });
  const env = {
    ...process.env,
    INSTALLER_NO_MODIFY_PATH: '1',
    UV_INSTALL_DIR: getMakerUvInstallRoot(),
  };
  const install =
    platform === 'win32'
      ? runner(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'ByPass',
            '-Command',
            'irm https://astral.sh/uv/install.ps1 | iex',
          ],
          { encoding: 'utf8', env }
        )
      : runner('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], {
          encoding: 'utf8',
          env,
        });
  if (install.status !== 0) {
    throw new Error(formatSetupFailure('uv installer failed', install));
  }
  if (!fs.existsSync(uvPath)) {
    const nestedUvPath = path.join(
      getMakerUvInstallRoot(),
      'bin',
      platform === 'win32' ? 'uv.exe' : 'uv'
    );
    if (fs.existsSync(nestedUvPath)) {
      return nestedUvPath;
    }
    throw new Error(`uv installer finished, but ${uvPath} was not created.`);
  }
  return uvPath;
}

function createUvPythonEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    UV_PYTHON_INSTALL_DIR: getMakerUvPythonInstallDir(),
    UV_CACHE_DIR: path.join(getMakerHome(), 'cache', 'uv'),
  };
}

function readUvVersion(uvPath: string, runner: SpawnRunner): string | undefined {
  if (!fs.existsSync(uvPath)) {
    return undefined;
  }
  const result = runner(uvPath, ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
}

function parsePythonInfo(stdout: string): PythonInfo | undefined {
  try {
    const data = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || '{}') as {
      executable?: unknown;
      version?: unknown;
    };
    if (typeof data.executable === 'string' && typeof data.version === 'string') {
      return { executable: data.executable, version: data.version };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isWindowsStorePythonAlias(value: string): boolean {
  return /\\Microsoft\\WindowsApps\\python(?:3)?\.exe$/i.test(value);
}

function isUnsupportedSystemPython(
  platform: NodeJS.Platform,
  executable: string,
  provider: MakerPythonProvider
): boolean {
  if (provider !== 'system' || platform !== 'darwin') {
    return false;
  }
  return (
    executable === '/usr/bin/python3' ||
    executable.startsWith('/Applications/Xcode.app/') ||
    executable.startsWith('/Library/Developer/CommandLineTools/')
  );
}

function loadPythonRuntimeConfig(): PythonRuntimeConfig | undefined {
  const configPath = getMakerPythonConfigPath();
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8')) as PythonRuntimeConfig;
    return typeof data.python === 'string' ? data : undefined;
  } catch {
    return undefined;
  }
}

function savePythonRuntimeConfig(environment: MakerPythonEnvironment): void {
  if (!environment.python) {
    return;
  }
  const config: PythonRuntimeConfig = {
    provider: environment.provider,
    python: environment.python,
    version: environment.version,
    saved_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(getMakerPythonConfigPath()), { recursive: true });
  fs.writeFileSync(getMakerPythonConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function formatSetupFailure(message: string, result: SpawnSyncReturns<string>): string {
  return [
    message,
    `- status: ${result.status ?? '(none)'}`,
    result.error?.message ? `- error: ${result.error.message}` : '',
    result.stderr?.trim() ? `- stderr: ${result.stderr.trim()}` : '',
    result.stdout?.trim() ? `- stdout: ${result.stdout.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
