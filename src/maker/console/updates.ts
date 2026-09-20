import { execFile } from 'node:child_process';
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
    .sort((a, b) => Date.parse(data.time?.[b] || '') - Date.parse(data.time?.[a] || ''))
    .slice(0, 5);
  if (!versions.length) throw new Error('未找到可用版本');
  return { versions, latest: data['dist-tags']?.latest, beta: data['dist-tags']?.beta };
}

export function runConsoleUpgrade(version: string): Promise<void> {
  if (!VERSION.test(version)) throw new Error('无效版本号');
  const launcher = resolveMakerMcpLauncher({ packageName: `@taptap/maker@${version}` });
  const home = getMakerHome();
  const cache = path.join(home, 'cache', 'npm');
  fs.mkdirSync(cache, { recursive: true });
  return new Promise((resolve, reject) => {
    // Run the selected package's existing self-install/verification workflow.
    execFile(
      launcher.command,
      [...launcher.args, 'upgrade', '--launcher', 'self', '--json'],
      {
        cwd: home,
        env: { ...process.env, npm_config_cache: cache },
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        timeout: 10 * 60_000,
      },
      (error, stdout) => {
        if (error)
          return reject(
            new Error('更新未完成，请检查网络及 Node/npm 环境后重试；部分客户端配置可能已更新。')
          );
        try {
          const result = JSON.parse(stdout);
          if (result.ok !== true) throw new Error();
          resolve();
        } catch {
          reject(new Error('无法确认更新结果，请检查客户端 MCP 配置后再重试。'));
        }
      }
    );
  });
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
    if (this.job.status === 'running') throw new ConsoleError('正在更新，请勿重复操作。', 409);
    if (typeof version !== 'string' || !VERSION.test(version) || version === this.current)
      throw new ConsoleError('请选择有效的其他版本。');
    const catalog = await this.list();
    if (!catalog.versions.includes(version))
      throw new ConsoleError('版本列表已变化，请刷新后重新选择。');
    if (this.job.status === 'running') throw new ConsoleError('正在更新，请勿重复操作。', 409);
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
