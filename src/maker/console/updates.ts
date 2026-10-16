import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveMakerMcpLauncher } from '../cli/mcpLauncher.js';
import { getMakerHome } from '../storage.js';
import { ConsoleError } from './types.js';
import { compareMakerVersionStrings } from '../versionCheck.js';

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
type Catalog = { versions: string[]; latest?: string; beta?: string };
type Job = {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  version?: string;
  message?: string;
};

export async function fetchConsoleVersions(): Promise<Catalog> {
  const response = await fetch('https://registry.npmjs.org/@taptap%2fmaker', {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('暂时无法获取版本，请稍后重试');
  const data = await response.json();
  const versions = Object.keys(data.versions || {})
    .filter((v) => VERSION.test(v))
    .sort((a, b) => compareMakerVersionStrings(b, a))
    .slice(0, 5);
  if (!versions.length) throw new Error('未找到可用版本');
  const latest = data['dist-tags']?.latest;
  const beta = data['dist-tags']?.beta;
  return {
    versions,
    latest: typeof latest === 'string' && VERSION.test(latest) ? latest : undefined,
    beta: typeof beta === 'string' && VERSION.test(beta) ? beta : undefined,
  };
}

export function runConsoleUpgrade(version: string): Promise<void> {
  if (!VERSION.test(version)) throw new Error('无效版本号');
  let launcher: ReturnType<typeof resolveMakerMcpLauncher>;
  try {
    launcher = resolveConsoleUpgradeLauncher(`@taptap/maker@${version}`);
  } catch {
    throw new Error('未找到可用的 Node/npm/npx 启动器。请先安装带 npm 的 Node.js，再重试升级。');
  }
  const home = getMakerHome();
  const cache = path.join(home, 'cache', 'npm');
  try {
    fs.mkdirSync(cache, { recursive: true });
  } catch {
    throw new Error('Maker 专用 npm 缓存不可写，请检查目录权限后再重试升级。');
  }
  return new Promise((resolve, reject) => {
    // Do not rely on the PATH inherited by a GUI process. Keep npm's cache
    // private to Maker and capture both streams so progress output cannot make
    // a successful JSON result look like a failed update.
    const child = spawn(
      launcher.command,
      [...launcher.args, 'upgrade', '--launcher', 'self', '--json'],
      {
        cwd: home,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          npm_config_cache: cache,
          PATH: [path.dirname(process.execPath), process.env.PATH]
            .filter(Boolean)
            .join(path.delimiter),
        },
      }
    );
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, 10 * 60_000);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (value: string) => {
      stdout = appendOutput(stdout, value);
    });
    child.stderr?.on('data', (value: string) => {
      stderr = appendOutput(stderr, value);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          error.message.includes('ENOENT')
            ? '未找到 Node/npm/npx。请先安装带 npm 的 Node.js，再重试升级。'
            : '更新未完成，请检查网络及 Node/npm 环境后重试；部分客户端配置可能已更新。'
        )
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error('更新超过 10 分钟仍未完成，请检查网络及 npm 缓存后再重试。'));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim()
              ? `更新未完成：${stderr.trim().split(/\r?\n/).slice(-1)[0]}`
              : '更新未完成，请检查网络及 Node/npm 环境后重试；部分客户端配置可能已更新。'
          )
        );
        return;
      }
      const result = parseLastJson(stdout);
      if (!result || result.ok !== true) {
        reject(new Error('无法确认更新结果，请检查客户端 MCP 配置后再重试。'));
        return;
      }
      if (!hasInstalledRuntime(home, version)) {
        reject(new Error('更新命令已返回成功，但目标 Maker runtime 未落盘，请检查缓存后再重试。'));
        return;
      }
      resolve();
    });
  });
}

function resolveConsoleUpgradeLauncher(packageName: string) {
  const launcher = resolveMakerMcpLauncher({ packageName });
  if (process.platform === 'win32') return launcher;
  const args = ['-y', '--package', packageName, 'taptap-maker'];

  const node = process.execPath;
  const npmCliCandidates = [
    path.join(path.dirname(node), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.join(path.dirname(node), '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ];
  const npmCli = npmCliCandidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (npmCli) {
    return {
      ...launcher,
      command: node,
      args: [npmCli, ...args],
      commandAndArgs: [node, npmCli, ...args],
    };
  }

  const candidates = [
    path.join(path.dirname(node), 'npx'),
    ...(process.env.PATH || '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, 'npx')),
  ];
  const npx = candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!npx) throw new Error('未找到 npx。请先安装带 npm 的 Node.js，再重试升级。');
  return { ...launcher, args, command: npx, commandAndArgs: [npx, ...args] };
}

function parseLastJson(output: string): Record<string, unknown> | undefined {
  for (const line of output.trim().split(/\r?\n/).filter(Boolean).reverse()) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object') return value as Record<string, unknown>;
    } catch {
      // npm and the CLI may print progress before the final JSON result.
    }
  }
  return undefined;
}

function appendOutput(previous: string, chunk: string): string {
  const output = previous + chunk;
  return output.length > 2 * 1024 * 1024 ? output.slice(-2 * 1024 * 1024) : output;
}

function hasInstalledRuntime(home: string, version: string): boolean {
  const runtimeRoot = path.join(home, 'mcp-runtime', version);
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8')
    ) as {
      version?: unknown;
    };
    return (
      packageJson.version === version &&
      fs.statSync(path.join(runtimeRoot, 'dist', 'maker.js')).isFile()
    );
  } catch {
    return false;
  }
}

export class ConsoleUpdates {
  job: Job = { status: 'idle' };
  private catalog?: Catalog;
  private checkedAt = 0;
  private query?: Promise<Catalog>;
  constructor(
    readonly current: string,
    readonly distribution?: string,
    private readonly fetchVersions = fetchConsoleVersions,
    private readonly upgrade = runConsoleUpgrade
  ) {}
  get managed(): boolean {
    return Boolean(this.distribution && this.distribution !== 'standalone');
  }
  async list(): Promise<
    Catalog & { managed: boolean; updateAvailable: boolean; downgrades: string[] }
  > {
    if (this.managed)
      return { versions: [], managed: true, updateAvailable: false, downgrades: [] };
    if (!this.catalog || Date.now() - this.checkedAt > 5 * 60_000) {
      this.query ||= this.fetchVersions()
        .then((value) => {
          this.catalog = value;
          this.checkedAt = Date.now();
          return value;
        })
        .finally(() => {
          this.query = undefined;
        });
      await this.query;
    }
    const catalog = this.catalog!;
    const candidates = [catalog.latest, ...(this.current.includes('-') ? [catalog.beta] : [])];
    return {
      ...catalog,
      managed: false,
      updateAvailable: candidates.some((v) => v && compareMakerVersionStrings(v, this.current) > 0),
      downgrades: catalog.versions.filter((v) => compareMakerVersionStrings(v, this.current) < 0),
    };
  }
  async start(version: unknown): Promise<Job> {
    if (this.managed) throw new ConsoleError('此版本由插件管理，请通过插件市场更新。', 409);
    if (isUpdateRunning(this.job)) throw new ConsoleError('正在更新，请勿重复操作。', 409);
    if (typeof version !== 'string' || !VERSION.test(version) || version === this.current)
      throw new ConsoleError('请选择有效的其他版本。');
    const catalog = await this.list();
    if (!catalog.versions.includes(version))
      throw new ConsoleError('版本列表已变化，请刷新后重新选择。');
    if (isUpdateRunning(this.job)) throw new ConsoleError('正在更新，请勿重复操作。', 409);
    this.job = { status: 'running', version };
    void Promise.resolve()
      .then(() => this.upgrade(version))
      .then(() => {
        this.job = {
          status: 'succeeded',
          version,
          message: `已安装 ${version}，请重新连接 AI 客户端的 MCP 后生效。当前控制台仍运行 ${this.current}。`,
        };
      })
      .catch((error: Error) => {
        this.job = { status: 'failed', version, message: error.message };
      });
    return this.job;
  }
}

function isUpdateRunning(job: Job): boolean {
  return job.status === 'running';
}
