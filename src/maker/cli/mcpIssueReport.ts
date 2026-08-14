/**
 * Public-safe Maker MCP issue report helpers.
 *
 * This module intentionally lives outside the MCP server so reporting still works when the
 * Maker MCP process or embedded proxy cannot connect.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { identifyMakerProject } from '../server/identify.js';
import { resolveMakerMcpLauncher, verifyMakerMcpLauncher } from './mcpLauncher.js';

const MAKER_MCP_NAME = 'taptap-maker';
const GITHUB_REPOSITORY = 'taptap/instant-games-open-mcp';
const GITHUB_NEW_ISSUE_URL = `https://github.com/${GITHUB_REPOSITORY}/issues/new`;

export type MakerMcpReportContext = {
  summary: string;
  error_message?: string;
  failed_operation?: string;
  error_code?: string | number;
  error_data?: unknown;
  redacted_request_params?: unknown;
  remote_result?: unknown;
  request_or_correlation_id?: string;
  reproduction_steps?: string[];
  session_tools?: string[];
  workspace_roots?: string[];
  client_version?: string;
};

export type MakerMcpIssueDiagnostics = {
  occurred_at: string;
  client?: string;
  os_arch: string;
  node_version: string;
  maker_package_version: string;
  process_cwd: string;
  target_dir: string;
  project_context: unknown;
  client_config: unknown;
  mcp_verify: unknown;
  network_proxy?: unknown;
  workbuddy_trust?: unknown;
};

export type MakerMcpIssue = {
  title: string;
  body: string;
};

type MakerMcpConfigInspection = {
  ide: string;
  status: 'found' | 'not_found' | 'missing_entry' | 'unreadable' | 'unsupported';
  entries: Array<{
    path: string;
    status: 'found' | 'missing_entry' | 'unreadable';
    server?: Record<string, unknown>;
  }>;
};

type GitHubCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

type MakerMcpIssueSubmission =
  | { status: 'created'; issue_url: string }
  | (MakerMcpIssue & { status: 'manual_required'; issue_url: string });

export function parseMakerMcpReportContext(input: string): MakerMcpReportContext {
  const trimmed = input.trim();
  if (!trimmed) {
    return { summary: 'Maker MCP problem report' };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isRecord(parsed)) {
      return pickMakerMcpReportContext(parsed);
    }
  } catch {
    // Plain text is a supported fallback for clients that cannot construct JSON reliably.
  }

  return {
    summary: 'Maker MCP problem report',
    error_message: trimmed,
  };
}

export function extractMakerMcpServerConfig(
  config: Record<string, unknown>,
  mcpName: string
): Record<string, unknown> | undefined {
  const container = isRecord(config.mcpServers)
    ? config.mcpServers
    : isRecord(config.mcp)
      ? config.mcp
      : undefined;
  const server = container?.[mcpName];
  if (!isRecord(server)) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const key of ['type', 'command', 'args', 'cwd', 'disabled']) {
    if (server[key] !== undefined) {
      result[key] =
        (key === 'command' || key === 'args') && Array.isArray(server[key])
          ? sanitizeCommandArguments(server[key])
          : server[key];
    }
  }

  const environment = isRecord(server.env)
    ? server.env
    : isRecord(server.environment)
      ? server.environment
      : undefined;
  if (environment) {
    result.env_keys = Object.keys(environment).sort();
    if (typeof environment.TAPTAP_MCP_CLIENT_IDE === 'string') {
      result.client_ide = environment.TAPTAP_MCP_CLIENT_IDE;
    }
  }

  return result;
}

export function inspectMakerMcpClientConfig(options: {
  ide: string;
  homeDir: string;
  platform: NodeJS.Platform;
  appData?: string;
  mcpName?: string;
}): MakerMcpConfigInspection {
  const ide = options.ide.trim().toLowerCase();
  const configPaths = getMcpConfigPaths({ ...options, ide });
  if (!configPaths) {
    return { ide, status: 'unsupported', entries: [] };
  }

  const entries = configPaths
    .filter((configPath) => fs.existsSync(configPath))
    .map((configPath) => inspectMcpConfigFile(configPath, ide, options.mcpName || MAKER_MCP_NAME));
  const status = entries.some((entry) => entry.status === 'found')
    ? 'found'
    : entries.some((entry) => entry.status === 'unreadable')
      ? 'unreadable'
      : entries.length > 0
        ? 'missing_entry'
        : 'not_found';
  return { ide, status, entries };
}

export function buildMakerMcpIssue(options: {
  context: MakerMcpReportContext;
  diagnostics: MakerMcpIssueDiagnostics;
  homeDir: string;
}): MakerMcpIssue {
  const context = sanitizePublicValue(options.context, options.homeDir) as MakerMcpReportContext;
  const diagnostics = sanitizePublicValue(
    options.diagnostics,
    options.homeDir
  ) as MakerMcpIssueDiagnostics;
  const summary =
    stripControlCharacters(sanitizePublicText(context.summary, options.homeDir))
      .replace(/\s+/gu, ' ')
      .trim() || 'Maker MCP problem report';
  const title = `[Maker MCP] ${summary}`.slice(0, 120);
  const body = [
    '<!-- maker-mcp-auto-report -->',
    '> 由 TapTap Maker AI 故障上报流程自动生成；凭证和用户主目录已经脱敏。',
    '',
    '## 问题摘要',
    '',
    summary,
    '',
    '## AI 会话与错误上下文',
    '',
    fencedJson(context, 24_000),
    '',
    '## Maker MCP 本地诊断',
    '',
    fencedJson(diagnostics, 24_000),
    '',
    '## 隐私说明',
    '',
    '- 未包含完整聊天记录、项目源码、完整环境变量或其它 MCP server 配置。',
    '- PAT、token、Authorization、Cookie、密钥和用户主目录已自动脱敏。',
  ].join('\n');

  return { title, body };
}

export async function collectMakerMcpIssueDiagnostics(options: {
  ide?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  appData?: string;
  processCwd?: string;
  targetDir: string;
  makerVersion: string;
  environment?: NodeJS.ProcessEnv;
  now?: () => Date;
  verify?: () => Promise<unknown>;
}): Promise<MakerMcpIssueDiagnostics> {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const processCwd = path.resolve(options.processCwd || process.cwd());
  const targetDir = path.resolve(options.targetDir);
  const identify = identifyMakerProject({ cwd: targetDir });
  const projectContext = identify.projectRoot
    ? {
        status: 'bound',
        source: identify.source,
        project_root: identify.projectRoot,
        config_path: identify.configPath,
      }
    : {
        status: 'not_bound',
        source: identify.source,
      };
  const client = options.ide?.trim().toLowerCase();
  const environment = options.environment || process.env;
  const clientConfig = client
    ? inspectMakerMcpClientConfig({
        ide: client,
        homeDir,
        platform,
        appData: options.appData || environment.APPDATA,
      })
    : { status: 'not_checked', reason: 'active_client_not_provided' };

  let mcpVerify: unknown;
  try {
    mcpVerify = options.verify ? await options.verify() : await collectMcpVerifyEvidence();
  } catch {
    mcpVerify = {
      ok: false,
      stage: 'collect',
      failure_type: 'verification_unavailable',
    };
  }

  const diagnostics: MakerMcpIssueDiagnostics = {
    occurred_at: (options.now || (() => new Date()))().toISOString(),
    client,
    os_arch: `${platform} ${options.arch || process.arch}`,
    node_version: process.version,
    maker_package_version: options.makerVersion,
    process_cwd: processCwd,
    target_dir: targetDir,
    project_context: projectContext,
    client_config: clientConfig,
    mcp_verify: mcpVerify,
    network_proxy: {
      http_proxy_configured: hasEnvironmentValue(environment, 'HTTP_PROXY'),
      https_proxy_configured: hasEnvironmentValue(environment, 'HTTPS_PROXY'),
      no_proxy_configured: hasEnvironmentValue(environment, 'NO_PROXY'),
    },
  };
  if (client === 'workbuddy') {
    diagnostics.workbuddy_trust = inspectWorkBuddyTrust(homeDir);
  }
  return diagnostics;
}

export function submitMakerMcpIssue(
  issue: MakerMcpIssue,
  options: {
    run?: (args: string[], input: string) => GitHubCommandResult;
  } = {}
): MakerMcpIssueSubmission {
  try {
    const run = options.run || runGitHubIssueCreate;
    const result = run(
      ['issue', 'create', '--repo', GITHUB_REPOSITORY, '--title', issue.title, '--body-file', '-'],
      issue.body
    );
    const issueUrl = result.stdout.trim();
    if (
      result.status === 0 &&
      new RegExp(`^https://github\\.com/${escapeRegExp(GITHUB_REPOSITORY)}/issues/\\d+$`, 'u').test(
        issueUrl
      )
    ) {
      return { status: 'created', issue_url: issueUrl };
    }
  } catch {
    // Missing gh, expired auth, network failures, and timeouts all use the manual fallback.
  }

  return {
    status: 'manual_required',
    issue_url: GITHUB_NEW_ISSUE_URL,
    ...issue,
  };
}

function getMcpConfigPaths(options: {
  ide: string;
  homeDir: string;
  platform: NodeJS.Platform;
  appData?: string;
}): string[] | undefined {
  const { ide, homeDir, platform } = options;
  if (ide === 'codex') {
    return [path.join(homeDir, '.codex', 'config.toml')];
  }
  if (ide === 'cursor') {
    return [path.join(homeDir, '.cursor', 'mcp.json')];
  }
  if (ide === 'claude') {
    return [path.join(homeDir, '.claude.json')];
  }
  if (ide === 'opencode') {
    return [path.join(homeDir, '.config', 'opencode', 'opencode.jsonc')];
  }
  if (ide === 'workbuddy') {
    const primary = path.join(homeDir, '.workbuddy', 'mcp.json');
    if (fs.existsSync(primary)) {
      return [primary];
    }
    const legacy = path.join(homeDir, '.workbuddy', '.mcp.json');
    return fs.existsSync(legacy) ? [legacy] : [primary];
  }
  if (ide === 'trae') {
    const root =
      platform === 'win32'
        ? options.appData || path.join(homeDir, 'AppData', 'Roaming')
        : path.join(homeDir, 'Library', 'Application Support');
    return ['TRAE SOLO', 'TRAE SOLO CN', 'Trae', 'TRAE', 'Trae CN'].map((name) =>
      path.join(root, name, 'User', 'mcp.json')
    );
  }
  return undefined;
}

function inspectMcpConfigFile(
  configPath: string,
  ide: string,
  mcpName: string
): MakerMcpConfigInspection['entries'][number] {
  try {
    const server =
      ide === 'codex'
        ? extractCodexMcpServerConfig(fs.readFileSync(configPath, 'utf8'), mcpName)
        : extractMakerMcpServerConfig(
            parseJsonConfig(fs.readFileSync(configPath, 'utf8'), ide === 'opencode'),
            mcpName
          );
    return server
      ? { path: configPath, status: 'found', server }
      : { path: configPath, status: 'missing_entry' };
  } catch {
    return { path: configPath, status: 'unreadable' };
  }
}

function extractCodexMcpServerConfig(
  content: string,
  mcpName: string
): Record<string, unknown> | undefined {
  const rootNames = new Set([`mcp_servers.${mcpName}`, `mcp_servers."${mcpName}"`]);
  const envNames = new Set(Array.from(rootNames, (name) => `${name}.env`));
  const server: Record<string, unknown> = {};
  const envKeys: string[] = [];
  let section: 'root' | 'env' | 'other' = 'other';
  let found = false;

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const header = /^\[([^\]]+)\]$/u.exec(line)?.[1];
    if (header) {
      section = rootNames.has(header) ? 'root' : envNames.has(header) ? 'env' : 'other';
      found ||= section !== 'other';
      continue;
    }
    if (!line || line.startsWith('#') || section === 'other') {
      continue;
    }
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u.exec(line);
    if (!assignment) {
      continue;
    }
    const [, key, rawValue] = assignment;
    if (section === 'env') {
      envKeys.push(key);
      if (key === 'TAPTAP_MCP_CLIENT_IDE') {
        const value = parseTomlJsonValue(rawValue);
        if (typeof value === 'string') {
          server.client_ide = value;
        }
      }
      continue;
    }
    if (['command', 'args', 'cwd', 'disabled'].includes(key)) {
      server[key] = parseTomlJsonValue(rawValue);
    }
  }

  if (!found) {
    return undefined;
  }
  if (envKeys.length > 0) {
    server.env_keys = envKeys.sort();
  }
  return server;
}

function parseTomlJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return '<unparsed>';
  }
}

function parseJsonConfig(content: string, jsonc: boolean): Record<string, unknown> {
  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const normalized = jsonc ? removeTrailingCommas(stripJsonComments(withoutBom)) : withoutBom;
  const parsed = JSON.parse(normalized) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('MCP config top-level value must be an object.');
  }
  return parsed;
}

function stripJsonComments(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (lineComment) {
      if (character === '\n' || character === '\r') {
        lineComment = false;
        result += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      } else if (character === '\n' || character === '\r') {
        result += character;
      }
      continue;
    }
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
    } else if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
    } else if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else {
      result += character;
    }
  }
  return result;
}

function removeTrailingCommas(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ',') {
      let lookahead = index + 1;
      while (/\s/u.test(content[lookahead] || '')) {
        lookahead += 1;
      }
      if (content[lookahead] === '}' || content[lookahead] === ']') {
        continue;
      }
    }
    result += character;
  }
  return result;
}

function runGitHubIssueCreate(args: string[], input: string): GitHubCommandResult {
  const result = spawnSync('gh', args, {
    input,
    encoding: 'utf8',
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    shell: false,
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

function inspectWorkBuddyTrust(homeDir: string): {
  status: 'trusted' | 'disabled' | 'pending' | 'mixed' | 'not_found' | 'unreadable';
  accounts_checked: number;
  trusted_accounts: number;
  disabled_accounts: number;
  pending_accounts: number;
  unreadable_accounts: number;
} {
  const emptyCounts = {
    accounts_checked: 0,
    trusted_accounts: 0,
    disabled_accounts: 0,
    pending_accounts: 0,
    unreadable_accounts: 0,
  };
  const connectorsDir = path.join(homeDir, '.workbuddy', 'connectors');
  if (!fs.existsSync(connectorsDir)) {
    return { status: 'not_found', ...emptyCounts };
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(connectorsDir, { withFileTypes: true });
  } catch {
    return { status: 'unreadable', ...emptyCounts };
  }

  const counts = { ...emptyCounts };
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const statePath = path.join(connectorsDir, entry.name, 'connector-states.json');
    if (!fs.existsSync(statePath)) {
      continue;
    }
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as unknown;
      if (!isRecord(state)) {
        counts.accounts_checked += 1;
        counts.unreadable_accounts += 1;
        continue;
      }
      const enabled = asStringArray(state.enabled).includes(MAKER_MCP_NAME);
      const userDisabled = asStringArray(state.userDisabled).includes(MAKER_MCP_NAME);
      const everConnected = asStringArray(state.everConnected).includes(MAKER_MCP_NAME);
      if (!enabled && !userDisabled && !everConnected) {
        continue;
      }
      counts.accounts_checked += 1;
      if (enabled && !userDisabled) {
        counts.trusted_accounts += 1;
      } else if (userDisabled) {
        counts.disabled_accounts += 1;
      } else {
        counts.pending_accounts += 1;
      }
    } catch {
      counts.accounts_checked += 1;
      counts.unreadable_accounts += 1;
    }
  }

  if (counts.accounts_checked === 0) {
    return { status: 'not_found', ...counts };
  }
  const observedStates = [
    counts.trusted_accounts,
    counts.disabled_accounts,
    counts.pending_accounts,
    counts.unreadable_accounts,
  ].filter((count) => count > 0).length;
  const status =
    observedStates > 1
      ? 'mixed'
      : counts.trusted_accounts > 0
        ? 'trusted'
        : counts.disabled_accounts > 0
          ? 'disabled'
          : counts.pending_accounts > 0
            ? 'pending'
            : 'unreadable';
  return { status, ...counts };
}

function hasEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): boolean {
  return Boolean(environment[key] || environment[key.toLowerCase()]);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

async function collectMcpVerifyEvidence(): Promise<Record<string, unknown>> {
  try {
    const launcher = resolveMakerMcpLauncher({ packageName: '@taptap/maker' });
    const result = await verifyMakerMcpLauncher(launcher, { timeoutMs: 15_000 });
    return {
      ok: result.ok,
      stage: result.stage,
      launcher_kind: result.launcherKind,
      command: result.command,
      tools: result.toolNames,
      stderr: result.stderr,
      error: result.error,
      failure_type: result.failureType,
    };
  } catch {
    return {
      ok: false,
      stage: 'resolve',
      failure_type: 'launcher_not_found',
    };
  }
}

function sanitizePublicValue(value: unknown, homeDir: string): unknown {
  return normalizeHomePaths(sanitizeDiagnosticValue(value), homeDir, new WeakSet<object>());
}

function sanitizePublicText(value: string, homeDir: string): string {
  const sanitized = sanitizeDiagnosticValue(value);
  return replaceHomePath(
    redactReportText(typeof sanitized === 'string' ? sanitized : String(sanitized)),
    homeDir
  );
}

function normalizeHomePaths(value: unknown, homeDir: string, visited: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return replaceHomePath(redactReportText(value), homeDir);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (visited.has(value)) {
    return '<circular>';
  }
  visited.add(value);

  const result = Array.isArray(value)
    ? value.map((item) => normalizeHomePaths(item, homeDir, visited))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          normalizeHomePaths(item, homeDir, visited),
        ])
      );
  visited.delete(value);
  return result;
}

function replaceHomePath(value: string, homeDir: string): string {
  const trimmedHome = homeDir.replace(/[\\/]+$/u, '');
  if (!trimmedHome) {
    return value;
  }

  const variants = new Set([
    trimmedHome,
    trimmedHome.replaceAll('\\', '/'),
    trimmedHome.replaceAll('/', '\\'),
  ]);
  let result = value;
  for (const variant of variants) {
    const flags = /^[A-Za-z]:[\\/]/u.test(variant) ? 'giu' : 'gu';
    result = result.replace(new RegExp(escapeRegExp(variant), flags), '~');
  }
  return result;
}

function fencedJson(value: unknown, maxLength: number): string {
  const serialized = JSON.stringify(value, null, 2);
  const content =
    serialized.length <= maxLength
      ? serialized
      : `${serialized.slice(0, maxLength)}\n... <truncated>`;
  return ['```json', content, '```'].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function pickMakerMcpReportContext(parsed: Record<string, unknown>): MakerMcpReportContext {
  const context: MakerMcpReportContext = {
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : 'Maker MCP problem report',
  };
  for (const key of [
    'error_message',
    'failed_operation',
    'request_or_correlation_id',
    'client_version',
  ] as const) {
    if (typeof parsed[key] === 'string') {
      context[key] = parsed[key];
    }
  }
  if (typeof parsed.error_code === 'string' || typeof parsed.error_code === 'number') {
    context.error_code = parsed.error_code;
  }
  for (const key of ['error_data', 'redacted_request_params', 'remote_result'] as const) {
    if (parsed[key] !== undefined) {
      context[key] = parsed[key];
    }
  }
  for (const key of ['reproduction_steps', 'session_tools', 'workspace_roots'] as const) {
    if (Array.isArray(parsed[key])) {
      context[key] = parsed[key]
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 100);
    }
  }
  return context;
}

function sanitizeCommandArguments(args: unknown[]): unknown[] {
  let redactNext = false;
  return args.map((arg) => {
    if (redactNext) {
      redactNext = false;
      return '<redacted>';
    }
    if (typeof arg !== 'string') {
      return arg;
    }
    if (isSensitiveCliFlag(arg)) {
      redactNext = true;
      return arg;
    }
    return redactReportText(arg);
  });
}

function isSensitiveCliFlag(value: string): boolean {
  return /^--(?:[a-z0-9]+[-_])*(?:pat|token|secret|authorization|cookie|password|passwd|passphrase|mac[-_]?key|api[-_]?key|auth[-_]?key|private[-_]?key)$/iu.test(
    value
  );
}

function redactReportText(value: string): string {
  return value
    .replace(
      /(^|[\s,;])(--(?:[a-z0-9]+[-_])*(?:pat|token|secret|authorization|cookie|password|passwd|passphrase|mac[-_]?key|api[-_]?key|auth[-_]?key|private[-_]?key))\s+(?:"[^"]*"|'[^']*'|[^\s,;]+)/gimu,
      '$1$2 <redacted>'
    )
    .replace(
      /(--(?:[a-z0-9]+[-_])*(?:pat|token|secret|authorization|cookie|password|passwd|passphrase|mac[-_]?key|api[-_]?key|auth[-_]?key|private[-_]?key)=)([^\s]+)/giu,
      '$1<redacted>'
    )
    .replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^@\s/]+)@/gu, '$1<redacted>@')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/gu, '<redacted>')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu, '<redacted>');
}

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint < 32 || codePoint === 127 ? ' ' : character;
  }).join('');
}
