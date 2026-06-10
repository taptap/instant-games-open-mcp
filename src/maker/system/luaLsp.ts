/**
 * Maker Lua LSP setup helpers.
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getMakerHome } from '../storage.js';
import {
  checkMakerPythonEnvironment,
  setupMakerPythonEnvironment,
  type MakerPythonEnvironment,
  type MakerPythonRuntimeOptions,
} from './python.js';

const LUA_LSP_PACKAGE = 'maker-lua-lsp';
const LUA_LSP_IDES = 'codex,cursor,claude';
const LUA_LSP_SETUP_TIMEOUT_MS = 120_000;
const PYTHON_SCRIPTS_DIR_SCRIPT = [
  'import sysconfig',
  'print(sysconfig.get_path("scripts") or "")',
].join('; ');

export type MakerLuaLspStatus = 'ready' | 'missing' | 'python_missing' | 'setup_failed';

export interface MakerLuaLspEnvironment {
  platform: NodeJS.Platform;
  ready: boolean;
  status: MakerLuaLspStatus;
  command?: string;
  version?: string;
  python?: string;
  scriptsDir?: string;
  missing: string[];
  configPath: string;
  setupCommand: string;
  doctorCommand: string;
  installCommand: string;
  nextAction: string;
  error?: string;
}

export interface MakerLuaLspSetupResult {
  changed: boolean;
  environment: MakerLuaLspEnvironment;
  python: MakerPythonEnvironment;
}

type SpawnRunner = (
  command: string,
  args: string[],
  options?: {
    encoding?: BufferEncoding;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
  }
) => SpawnSyncReturns<string>;

export interface MakerLuaLspRuntimeOptions extends MakerPythonRuntimeOptions {
  pythonEnvironment?: MakerPythonEnvironment;
}

interface LuaLspRuntimeConfig {
  status?: MakerLuaLspStatus;
  command?: string;
  python?: string;
  error?: string;
  saved_at?: string;
}

export function getMakerLuaLspConfigPath(): string {
  return path.join(getMakerHome(), 'lua-lsp.json');
}

export function checkMakerLuaLspEnvironment(
  options: MakerLuaLspRuntimeOptions = {}
): MakerLuaLspEnvironment {
  const runner = options.spawn || spawnSync;
  const python = options.pythonEnvironment || checkMakerPythonEnvironment(options);
  const platform = options.platform || python.platform || process.platform;
  const base = createLuaLspBase(platform);

  if (!python.ready || !python.python) {
    return {
      ...base,
      ready: false,
      status: 'python_missing',
      missing: ['python'],
      error: python.error,
      nextAction:
        '本地 Lua 诊断需要 Python 环境。请先运行 `taptap-maker python setup`，它会继续准备 maker-lua-lsp。',
    };
  }

  const resolved = resolveLuaLspCommand(python, platform, runner);
  const command = resolved.command || LUA_LSP_PACKAGE;
  const version = readLuaLspVersion(command, runner);
  if (version) {
    return {
      ...base,
      ready: true,
      status: 'ready',
      command,
      version,
      python: python.python,
      scriptsDir: resolved.scriptsDir,
      missing: [],
      nextAction: 'maker-lua-lsp 已安装；本地 Lua 诊断可用。',
    };
  }

  const saved = loadLuaLspRuntimeConfig();
  if (saved?.status === 'setup_failed') {
    return {
      ...base,
      ready: false,
      status: 'setup_failed',
      command: saved.command || resolved.command,
      python: python.python,
      scriptsDir: resolved.scriptsDir,
      missing: [LUA_LSP_PACKAGE],
      error: saved.error,
      nextAction:
        '上次 maker-lua-lsp 安装失败。请查看错误后重试 `taptap-maker lua-lsp setup`；失败不会阻塞远端构建。',
    };
  }

  return {
    ...base,
    ready: false,
    status: 'missing',
    command: resolved.command,
    python: python.python,
    scriptsDir: resolved.scriptsDir,
    missing: [LUA_LSP_PACKAGE],
    nextAction:
      '未检测到 maker-lua-lsp。请运行 `taptap-maker lua-lsp setup`，或运行 `taptap-maker python setup` 自动准备完整本地 Lua 诊断环境。',
  };
}

export function setupMakerLuaLspEnvironment(
  options: MakerLuaLspRuntimeOptions = {}
): MakerLuaLspSetupResult {
  const runner = options.spawn || spawnSync;
  const python = options.pythonEnvironment || ensurePythonForLuaLsp(options);
  const platform = options.platform || python.platform || process.platform;

  if (!python.ready || !python.python) {
    const environment: MakerLuaLspEnvironment = {
      ...createLuaLspBase(platform),
      ready: false,
      status: 'python_missing',
      python: python.python,
      missing: ['python'],
      error: python.error,
      nextAction:
        'maker-lua-lsp 安装需要 Python >= 3.8 和 pip。请先运行 `taptap-maker python setup`。',
    };
    saveLuaLspRuntimeConfig(environment);
    return { changed: false, environment, python };
  }

  const pipInstall = runner(python.python, ['-m', 'pip', 'install', '--upgrade', LUA_LSP_PACKAGE], {
    encoding: 'utf8',
    timeout: LUA_LSP_SETUP_TIMEOUT_MS,
  });
  if (pipInstall.status !== 0) {
    const environment = formatLuaLspSetupFailure(
      platform,
      python,
      'maker-lua-lsp pip install failed',
      pipInstall
    );
    saveLuaLspRuntimeConfig(environment);
    return { changed: false, environment, python };
  }

  const resolved = resolveLuaLspCommand(python, platform, runner);
  const command = resolved.command || LUA_LSP_PACKAGE;
  const ideInstall = runner(command, ['install', '--ide', LUA_LSP_IDES], {
    encoding: 'utf8',
    timeout: LUA_LSP_SETUP_TIMEOUT_MS,
  });
  if (ideInstall.status !== 0) {
    const environment = formatLuaLspSetupFailure(
      platform,
      python,
      'maker-lua-lsp IDE install failed',
      ideInstall,
      command,
      resolved.scriptsDir
    );
    saveLuaLspRuntimeConfig(environment);
    return { changed: false, environment, python };
  }

  const environment: MakerLuaLspEnvironment = {
    ...createLuaLspBase(platform),
    ready: true,
    status: 'ready',
    command,
    version: readLuaLspVersion(command, runner),
    python: python.python,
    scriptsDir: resolved.scriptsDir,
    missing: [],
    nextAction: 'maker-lua-lsp 已安装并完成 Codex/Cursor/Claude 配置。',
  };
  saveLuaLspRuntimeConfig(environment);
  return { changed: true, environment, python };
}

export function formatMakerLuaLspEnvironmentStatus(environment: MakerLuaLspEnvironment): string {
  return [
    'Lua LSP environment',
    '',
    `- lsp_status: ${environment.status}`,
    `- ready: ${environment.ready ? 'yes' : 'no'}`,
    environment.command ? `- command: ${environment.command}` : '',
    environment.version ? `- version: ${environment.version}` : '',
    environment.python ? `- python: ${environment.python}` : '',
    environment.scriptsDir ? `- scripts_dir: ${environment.scriptsDir}` : '',
    `- config: ${environment.configPath}`,
    `- missing: ${environment.missing.join(', ') || '(none)'}`,
    environment.error ? `- error: ${environment.error}` : '',
    `- install_command: ${environment.installCommand}`,
    `- setup_command: ${environment.setupCommand}`,
    `- doctor_command: ${environment.doctorCommand}`,
    `- next_action: ${environment.nextAction}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function ensurePythonForLuaLsp(options: MakerLuaLspRuntimeOptions): MakerPythonEnvironment {
  const current = checkMakerPythonEnvironment(options);
  if (current.ready) {
    return current;
  }
  try {
    return setupMakerPythonEnvironment(options).environment;
  } catch (error) {
    return {
      ...current,
      status: 'setup_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createLuaLspBase(
  platform: NodeJS.Platform
): Pick<
  MakerLuaLspEnvironment,
  'platform' | 'configPath' | 'setupCommand' | 'doctorCommand' | 'installCommand'
> {
  return {
    platform,
    configPath: getMakerLuaLspConfigPath(),
    setupCommand: 'taptap-maker lua-lsp setup',
    doctorCommand: 'taptap-maker lua-lsp doctor',
    installCommand: `${LUA_LSP_PACKAGE} install --ide ${LUA_LSP_IDES}`,
  };
}

function resolveLuaLspCommand(
  python: MakerPythonEnvironment,
  platform: NodeJS.Platform,
  runner: SpawnRunner
): { command?: string; scriptsDir?: string } {
  const scriptsDir = readPythonScriptsDir(python.python, runner);
  if (scriptsDir) {
    const command = path.join(
      scriptsDir,
      platform === 'win32' ? 'maker-lua-lsp.exe' : 'maker-lua-lsp'
    );
    if (fs.existsSync(command)) {
      return { command, scriptsDir };
    }
    return { scriptsDir };
  }
  return {};
}

function readPythonScriptsDir(python: string | undefined, runner: SpawnRunner): string | undefined {
  if (!python) {
    return undefined;
  }
  const result = runner(python, ['-c', PYTHON_SCRIPTS_DIR_SCRIPT], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] || undefined : undefined;
}

function readLuaLspVersion(command: string, runner: SpawnRunner): string | undefined {
  const result = runner(command, ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() || 'installed' : undefined;
}

function formatLuaLspSetupFailure(
  platform: NodeJS.Platform,
  python: MakerPythonEnvironment,
  message: string,
  result: SpawnSyncReturns<string>,
  command?: string,
  scriptsDir?: string
): MakerLuaLspEnvironment {
  return {
    ...createLuaLspBase(platform),
    ready: false,
    status: 'setup_failed',
    command,
    python: python.python,
    scriptsDir,
    missing: [LUA_LSP_PACKAGE],
    error: [
      message,
      `- status: ${result.status ?? '(none)'}`,
      result.error?.message ? `- error: ${result.error.message}` : '',
      result.stderr?.trim() ? `- stderr: ${result.stderr.trim()}` : '',
      result.stdout?.trim() ? `- stdout: ${result.stdout.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    nextAction:
      'maker-lua-lsp 安装失败，但不会阻塞远端构建。请检查网络、pip、权限或脚本输出后重试 `taptap-maker lua-lsp setup`。',
  };
}

function loadLuaLspRuntimeConfig(): LuaLspRuntimeConfig | undefined {
  const configPath = getMakerLuaLspConfigPath();
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as LuaLspRuntimeConfig;
  } catch {
    return undefined;
  }
}

function saveLuaLspRuntimeConfig(environment: MakerLuaLspEnvironment): void {
  const config: LuaLspRuntimeConfig = {
    status: environment.status,
    command: environment.command,
    python: environment.python,
    error: environment.error,
    saved_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(getMakerLuaLspConfigPath()), { recursive: true });
  fs.writeFileSync(getMakerLuaLspConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}
