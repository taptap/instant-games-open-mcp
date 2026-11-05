import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { listCodexMcpRegistrations } from '../cli/codexMcpConfig.js';
import { ConsoleError } from './types.js';

export const CONTEXT_CLIENTS = ['project', 'claude', 'codex', 'cursor', 'workbuddy'] as const;
export type ContextClient = (typeof CONTEXT_CLIENTS)[number];
type Kind = 'rules' | 'memory' | 'skills' | 'mcp';
export interface ContextSource {
  id: string;
  kind: Kind;
  scope: 'project' | 'global' | 'maker';
  name: string;
  path: string;
  filePath: string;
  aliases: string[];
  bytes: number;
  loading: 'entry' | 'conditional' | 'on-demand' | 'unknown';
  registrations?: Array<{ name: string; enabled: boolean }>;
}
type WarningKind = 'invalid' | 'unverified' | 'skipped';
export interface ContextCheck {
  checkedAt: string;
  client: ContextClient;
  complete: boolean;
  sources: ContextSource[];
  findings: Array<{ title: string; detail: string; sourceIds: string[] }>;
  warnings: Array<{ kind: WarningKind; message: string }>;
  omittedWarningCount: number;
  warningCounts: Record<WarningKind, number>;
}
const MAX_FILE = 1024 * 1024;
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_FILES = 600;
const SKILL_DIRS = [
  'skills',
  '.installer/skills',
  '.agents/skills',
  '.claude/skills',
  '.codex/skills',
  '.cursor/skills',
  '.workbuddy/skills',
];
const RULE_FILES = [
  'AGENTS.md',
  'AGENTS.override.md',
  'CLAUDE.md',
  'CLAUDE.local.md',
  'GEMINI.md',
  '.cursorrules',
];
const PROJECT_CONFIGS = [
  '.mcp.json',
  '.cursor/mcp.json',
  '.codex/config.toml',
  '.workbuddy/mcp.json',
  '.workbuddy/.mcp.json',
];
const GLOBAL_CONFIGS: Record<Exclude<ContextClient, 'project'>, string[]> = {
  claude: ['.claude.json'],
  codex: ['.codex/config.toml'],
  cursor: ['.cursor/mcp.json'],
  workbuddy: ['.workbuddy/mcp.json', '.workbuddy/.mcp.json'],
};
function inside(root: string, filename: string): boolean {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Bounded, offline inventory. File size is not a measurement of the host's active context. */
export async function inspectContext(options: {
  projectDir: string;
  client?: string;
  packageRoot?: string;
  homeDir?: string;
  signal?: AbortSignal;
}): Promise<ContextCheck> {
  const client = options.client ?? 'project';
  if (!CONTEXT_CLIENTS.includes(client as ContextClient))
    throw new ConsoleError('不支持的客户端，请重新选择。');
  const result: ContextCheck = {
    checkedAt: new Date().toISOString(),
    client: client as ContextClient,
    complete: true,
    sources: [],
    findings: [],
    warnings: [],
    omittedWarningCount: 0,
    warningCounts: { invalid: 0, unverified: 0, skipped: 0 },
  };
  const project = await fs.realpath(options.projectDir);
  const seen = new Map<string, ContextSource>();
  const hashes = new Map<string, ContextSource[]>();
  let visited = 0;
  let bytesRead = 0;
  const warningMessages = new Set<string>();
  const warn = (message: string, kind: WarningKind = 'unverified') => {
    result.complete = false;
    if (warningMessages.has(message)) return;
    warningMessages.add(message);
    result.warningCounts[kind]++;
    if (result.warnings.length < 20) result.warnings.push({ kind, message });
    else result.omittedWarningCount++;
  };
  const find = (title: string, detail: string, sources: ContextSource[]) => {
    result.findings.push({ title, detail, sourceIds: sources.map((source) => source.id) });
  };
  async function collect(
    base: string,
    relative: string,
    kind: Kind,
    scope: ContextSource['scope']
  ) {
    options.signal?.throwIfAborted();
    let root: string;
    try {
      root = await fs.realpath(base);
    } catch {
      warn('无法读取所选来源目录。');
      return;
    }
    const prefix = scope === 'global' ? '~/' : scope === 'maker' ? 'Maker 内置/' : '';
    // Global checks stay inside the explicitly selected client directory, not the whole home.
    const boundary = scope === 'global' ? path.join(root, relative.split('/')[0]) : root;
    async function walk(filename: string, depth: number, ancestors: Set<string>): Promise<void> {
      options.signal?.throwIfAborted();
      if (++visited > 6000 || result.sources.length >= MAX_FILES || bytesRead >= MAX_BYTES) {
        warn('达到检查数量或读取上限，结果不完整。', 'skipped');
        return;
      }
      const display = prefix + path.relative(root, filename).split(path.sep).join('/');
      let real: string;
      try {
        real = await fs.realpath(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ELOOP')
          warn('跳过循环链接：' + display, 'invalid');
        else if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warn('无法读取：' + display);
        else if ((await fs.lstat(filename).catch(() => undefined))?.isSymbolicLink())
          warn('跳过失效链接：' + display, 'invalid');
        return;
      }
      if (!inside(boundary, real)) {
        warn('跳过来源目录外的链接：' + display, 'skipped');
        return;
      }
      const previous = seen.get(real);
      if (previous) {
        if (previous.path !== display && !previous.aliases.includes(display))
          previous.aliases.push(display);
        return;
      }
      try {
        const stat = await fs.stat(real);
        if (stat.isDirectory()) {
          if (kind === 'mcp') {
            warn('MCP 配置不是普通文件：' + display, 'invalid');
            return;
          }
          if (ancestors.has(real)) {
            warn('跳过循环链接：' + display, 'invalid');
            return;
          }
          // A discovered Skill's references are loaded by the Skill, not separate catalog entries.
          if (kind === 'skills') {
            const entry = path.join(filename, 'SKILL.md');
            try {
              const entryStat = await fs.lstat(entry);
              if (entryStat.isFile() || entryStat.isSymbolicLink()) {
                await walk(entry, depth + 1, new Set(ancestors).add(real));
                return;
              }
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                warn('无法读取 Skill 入口：' + display);
                return;
              }
            }
          }
          if (depth >= 5) {
            warn('跳过过深目录：' + display, 'skipped');
            return;
          }
          const next = new Set(ancestors).add(real);
          for (const name of (await fs.readdir(real)).sort()) {
            if (['node_modules', '.git', '.DS_Store'].includes(name)) continue;
            if (visited > 6000 || result.sources.length >= MAX_FILES || bytesRead >= MAX_BYTES) {
              warn('达到检查数量或读取上限，结果不完整。', 'skipped');
              break;
            }
            await walk(path.join(filename, name), depth + 1, next);
          }
          return;
        }
        if (!stat.isFile()) {
          warn('跳过非普通文件：' + display, 'skipped');
          return;
        }
        if (kind === 'skills' && path.basename(filename) !== 'SKILL.md') return;
        if (
          kind !== 'mcp' &&
          kind !== 'skills' &&
          !/\.(md|mdc)$/i.test(filename) &&
          path.basename(filename) !== '.cursorrules'
        )
          return;
        const source: ContextSource = {
          id: createHash('sha256')
            .update(scope + ':' + display)
            .digest('hex'),
          kind,
          scope,
          name: kind === 'skills' ? path.basename(path.dirname(filename)) : path.basename(filename),
          path: display,
          filePath: filename,
          aliases: [],
          bytes: stat.size,
          loading:
            kind === 'skills'
              ? 'on-demand'
              : kind === 'mcp'
                ? 'unknown'
                : kind === 'rules' && depth === 0 && RULE_FILES.includes(path.basename(filename))
                  ? 'entry'
                  : 'conditional',
        };
        seen.set(real, source);
        result.sources.push(source);
        if (stat.size > MAX_FILE) {
          warn('文件超过 1 MiB，未读取：' + display, 'skipped');
          return;
        }
        if (bytesRead + stat.size > MAX_BYTES) {
          warn('达到读取上限，结果不完整。', 'skipped');
          return;
        }
        const handle = await fs.open(real, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        let content: string;
        try {
          const current = await handle.stat();
          if (!current.isFile() || current.size !== stat.size) {
            warn('检查期间文件变化：' + display);
            return;
          }
          const buffer = Buffer.alloc(stat.size + 1);
          const read = await handle.read(buffer, 0, buffer.length, 0);
          if (read.bytesRead !== stat.size) {
            warn('检查期间文件变化：' + display);
            return;
          }
          content = buffer.subarray(0, read.bytesRead).toString('utf8');
        } finally {
          await handle.close();
        }
        bytesRead += stat.size;
        if (kind === 'mcp') {
          try {
            if (filename.endsWith('.toml')) {
              source.registrations = listCodexMcpRegistrations(content);
              if (/mcp_servers/.test(content) && !source.registrations.length)
                warn('未识别 MCP 表结构：' + display);
            } else {
              const parsed: unknown = JSON.parse(content);
              if (!record(parsed)) throw new Error();
              const servers = parsed.mcpServers;
              if (servers !== undefined && !record(servers)) throw new Error();
              source.registrations = Object.entries(servers || {}).flatMap(([name, config]) => {
                if (!record(config)) {
                  warn('存在无法识别的 MCP 配置：' + display, 'invalid');
                  return [];
                }
                return [
                  {
                    name,
                    enabled: config.disabled !== true && config.enabled !== false,
                  },
                ];
              });
            }
          } catch {
            warn('无法解析 MCP 配置：' + display, 'invalid');
          }
          source.registrations = source.registrations?.filter((item) => {
            if (item.name.length <= 160) return true;
            warn('跳过过长的 MCP 注册名称：' + display, 'skipped');
            return false;
          });
          if (source.registrations && source.registrations.length > 200) {
            source.registrations = source.registrations.slice(0, 200);
            warn('MCP 注册超过 200 项，仅展示前 200 项：' + display, 'skipped');
          }
          const names = source.registrations?.map((item) => item.name) || [];
          if (new Set(names).size < names.length)
            find(
              '同一配置存在重复 MCP 注册',
              '请在客户端检查重复项；此检查不会修改配置或启动服务。',
              [source]
            );
        } else {
          const hash = kind + ':' + createHash('sha256').update(content).digest('hex');
          if (content.trim()) hashes.set(hash, [...(hashes.get(hash) || []), source]);
          if (
            kind === 'skills' &&
            source.name === 'taptap-maker-dev-kit-guide' &&
            content.includes('“预览”, “跑一下”') &&
            content.includes('runs the remote build')
          )
            find(
              'Maker 开发指南仍包含旧预览指引',
              '此指引把普通预览导向提交与远端构建，建议核对并修正；本地预览应使用 preview CLI。',
              [source]
            );
        }
      } catch {
        options.signal?.throwIfAborted();
        warn('无法读取：' + display);
      }
    }
    await walk(path.join(root, relative), 0, new Set());
  }
  for (const name of RULE_FILES) await collect(project, name, 'rules', 'project');
  for (const name of ['MEMORY.md', 'memory', 'memories', '.claude/memory'])
    await collect(project, name, 'memory', 'project');
  for (const directory of ['.claude/rules', '.cursor/rules', '.agents/rules', '.workbuddy/rules'])
    await collect(project, directory, 'rules', 'project');
  for (const directory of SKILL_DIRS) await collect(project, directory, 'skills', 'project');
  for (const name of PROJECT_CONFIGS) await collect(project, name, 'mcp', 'project');
  if (options.packageRoot) await collect(options.packageRoot, 'skills', 'skills', 'maker');
  if (client !== 'project') {
    const home = options.homeDir || os.homedir();
    const folder = '.' + client;
    for (const name of RULE_FILES) await collect(home, folder + '/' + name, 'rules', 'global');
    await collect(home, folder + '/rules', 'rules', 'global');
    await collect(home, folder + '/skills', 'skills', 'global');
    for (const name of ['MEMORY.md', 'memory', 'memories'])
      await collect(home, folder + '/' + name, 'memory', 'global');
    for (const name of GLOBAL_CONFIGS[client as Exclude<ContextClient, 'project'>])
      await collect(home, name, 'mcp', 'global');
    if (client === 'codex') await collect(home, '.agents/skills', 'skills', 'global');
  }
  for (const sources of hashes.values()) {
    if (sources.length > 1)
      find(
        '发现内容完全相同的副本',
        '可核对这些来源是否需要同时保留。不同客户端的副本不代表当前会话重复加载，不建议直接删除。',
        sources
      );
  }
  options.signal?.throwIfAborted();
  return result;
}
