/**
 * taptap-maker MCP server mode.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  ProgressToken,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { identifyMakerProject, formatIdentifyHint } from './identify.js';
import { HiddenStdioClientTransport } from './hiddenStdioTransport.js';
import {
  getPatPath,
  getTapAuthPath,
  loadProjectConfig,
  loadJwt,
  loadPat,
  loadTapAuth,
} from '../storage.js';
import {
  inspectMakerDirectoryGitStatus,
  inspectMakerRemoteSyncStatus,
  listMakerProjects,
  pushMakerProject,
  readMakerProjectLocalChanges,
  type PushMakerProjectOptions,
  type PushMakerProjectResult,
  type MakerRemoteSyncStatus,
  type MakerProjectProgress,
  type MakerProjectProgressHandler,
  type MakerGitFailure,
} from '../cli/projects.js';
import { requestTapAuthWithPat } from '../auth/patTap.js';
import {
  getMakerEndpoints,
  getMakerEnvironment,
  getMakerPatTokensUrl,
  getMakerWebUrl,
  requireMakerEndpoint,
} from '../config.js';
import { getUserIdFromMakerJwt } from '../auth/jwt.js';
import {
  MakerGitNotFoundError,
  checkGitEnvironment,
  formatGitEnvironmentStatus,
} from '../system/git.js';
import { formatMakerSkillStatus } from '../cli/skill.js';
import {
  DEV_KIT_GITIGNORE_STAGING_FILE,
  inspectAiDevKit,
  type AiDevKitStatus,
} from '../cli/devKit.js';
import {
  formatRuntimeLogPullResult,
  normalizeRuntimeLogQueryResult,
  pullRuntimeLogs,
  writeRuntimeLogRawResponse,
  type RuntimeLogQueryArgs,
  type RuntimeLogQueryResult,
} from './runtimeLogs.js';

declare const __MAKER_VERSION__: string | undefined;
declare const __MAKER_BUNDLE_URL__: string | undefined;
const VERSION = typeof __MAKER_VERSION__ !== 'undefined' ? __MAKER_VERSION__ : 'dev';
const DEFAULT_PROXY_MCP_NAME = 'taptap-proxy';
const DEFAULT_PROXY_PACKAGE = '@taptap/instant-games-open-mcp@1.22.0';
const DEFAULT_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const PREVIEW_REFRESH_TIMEOUT_MS = 15 * 1000;
const WATCHER_STOP_TIMEOUT_MS = 1500;
const WATCHER_PROCESS_PATTERN = /(?:\btaptap-maker\b|\bmaker\.js\b).*\blogs\b.*\bwatch\b/;
const LONG_OPERATION_HEARTBEAT_MS = 3 * 60 * 1000;

class MakerCloneFailedError extends Error {
  readonly targetDir: string;
  readonly originalError: unknown;

  constructor(targetDir: string, originalError: unknown) {
    const message = originalError instanceof Error ? originalError.message : String(originalError);
    super(message);
    this.name = 'MakerCloneFailedError';
    this.targetDir = targetDir;
    this.originalError = originalError;
  }
}

export const tools = [
  {
    name: 'maker_status_lite',
    description:
      'Compatibility fallback for clients that cannot read the maker://status resource. Prefer reading maker://status when resources are available. Shows local Maker status for the user current working directory, including Git, PAT/TapTap auth, project binding, AI dev kit status, and bundled workflow skill document paths.',
    inputSchema: {
      type: 'object',
      properties: {
        target_dir: {
          type: 'string',
          description:
            'Optional user current working directory to inspect. Use when the MCP process cwd differs from the user project CWD.',
        },
        skip_remote_sync: {
          type: 'boolean',
          description:
            'If true, skip git fetch/ahead-behind remote sync checks. Use this for frequent polling or quick local status checks.',
        },
      },
    },
  },
  {
    name: 'maker_build_current_directory',
    description:
      'Sync and build the current Maker game. Use this single tool for user requests like "构建", "build", "跑一下", "预览", "验证一下", "提交", "提交代码", "推送", or "push" in a Maker project. If local changes or committed-but-unpushed commits exist, the tool commits when needed, pushes to Maker remote, then triggers remote Maker build. If push fails, build is not started and the result includes recovery details for the local Agent to handle merge/conflict resolution. If push succeeds but remote build fails, report that code is already on Maker remote and include build failure details. After a successful build, a local runtime log watcher is started; for gameplay/runtime diagnostics, read runtime_logs.local_file, and for watcher health read runtime_logs.state_file. Only set confirm_remote_build_without_submit=true when the user explicitly says they do not want to submit local changes and wants to build the current remote version.',
    inputSchema: {
      type: 'object',
      properties: {
        target_dir: {
          type: 'string',
          description:
            'Optional Maker project directory. Defaults to the MCP process cwd. Pass the user current working directory when it differs from the MCP process cwd.',
        },
        entry: {
          type: 'string',
          description:
            'Optional single-player Lua entry file relative to scriptsPath, e.g. "main.lua". If omitted and local scripts/main.lua exists with no explicit multiplayer entries, Maker MCP sends entry="main.lua" and scriptsPath="scripts" by default to avoid remote entry-missing prompts. Otherwise omit to let the remote build tool infer/default.',
        },
        scriptsPath: {
          type: 'string',
          description:
            'Optional scripts directory relative to workspace. If omitted and local scripts/main.lua exists with no explicit entry overrides, Maker MCP sends scriptsPath="scripts" by default.',
        },
        entry_client: {
          type: 'string',
          description:
            'Optional multiplayer client entry relative to scriptsPath, e.g. "client_main.lua".',
        },
        entry_server: {
          type: 'string',
          description:
            'Optional multiplayer server entry relative to scriptsPath, e.g. "server_main.lua".',
        },
        multiplayer: {
          type: 'object',
          description:
            'Optional multiplayer config forwarded to remote build. If omitted and no .project/settings.json exists, Maker MCP sends { enabled: false } for first single-player build initialization.',
        },
        server_url: {
          type: 'string',
          description:
            'Optional remote MCP server URL override. Defaults to the Maker endpoint table for TAPTAP_MCP_ENV.',
        },
        env: {
          type: 'string',
          enum: ['rnd', 'production'],
          description: 'Remote MCP environment. Defaults to TAPTAP_MCP_ENV.',
        },
        timeout_ms: {
          type: 'number',
          description:
            'Optional remote build timeout in milliseconds. Defaults to 10 minutes. If timed out, do not retry blindly; inspect remote build logs first.',
        },
        message: {
          type: 'string',
          description:
            'Optional commit message used when local file changes need to be committed before build.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional files to stage before build. Defaults to all local changes.',
        },
        confirm_remote_build_without_submit: {
          type: 'boolean',
          description:
            'Set true only after the user explicitly confirms they do not want to submit local changes and want to build the current Maker remote committed version.',
        },
      },
    },
  },
  {
    name: 'maker_pull_runtime_logs',
    description:
      'Pull Maker Lua runtime logs once from the remote Maker MCP query_runtime_logs tool and write user_script/server_user_script logs to .maker/logs/runtime/runtime.log. This is a one-shot fixed business flow for AI diagnostics; it does not start a watcher, does not keep a long-running MCP call open, and does not clear local logs.',
    inputSchema: {
      type: 'object',
      properties: {
        target_dir: {
          type: 'string',
          description:
            'Optional Maker project directory. Defaults to the MCP process cwd. Pass the user current working directory when it differs from the MCP process cwd.',
        },
        start_time: {
          type: 'number',
          description:
            'Optional Unix seconds cursor. If omitted, the tool uses a fresh local state cursor, otherwise defaults to since_seconds.',
        },
        since_seconds: {
          type: 'number',
          description:
            'Optional fallback lookback window in seconds when no fresh cursor exists. Defaults to 600 seconds and is capped by the remote server.',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum log entries returned by the remote query.',
        },
        server_url: {
          type: 'string',
          description:
            'Optional remote MCP server URL override. Defaults to the Maker endpoint table for TAPTAP_MCP_ENV.',
        },
        env: {
          type: 'string',
          enum: ['rnd', 'production'],
          description: 'Remote MCP environment. Defaults to TAPTAP_MCP_ENV.',
        },
        timeout_ms: {
          type: 'number',
          description: 'Optional remote log query timeout in milliseconds. Defaults to 60 seconds.',
        },
      },
    },
  },
];

export const resources = [
  {
    uri: 'maker://status',
    name: 'Maker status',
    description:
      'Local TapTap Maker project status, including Git, PAT/TapTap auth, project binding, AI dev kit status, and bundled workflow skill document paths.',
    mimeType: 'text/plain',
  },
];

export async function startMakerMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: 'taptap-maker',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri !== 'maker://status') {
      throw new McpError(ErrorCode.InvalidParams, `Unknown Maker resource: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: await formatStatus(),
        },
      ],
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const name = request.params.name;

    try {
      if (name === 'maker_status_lite') {
        const args = (request.params.arguments || {}) as {
          target_dir?: string;
          skip_remote_sync?: boolean;
        };
        return {
          content: [
            {
              type: 'text',
              text: await formatStatus({
                targetDir: args.target_dir,
                skipRemoteSync: args.skip_remote_sync,
              }),
            },
          ],
        };
      }

      if (name === 'maker_build_current_directory') {
        const args = (request.params.arguments || {}) as {
          target_dir?: string;
          entry?: string;
          scriptsPath?: string;
          entry_client?: string;
          entry_server?: string;
          multiplayer?: Record<string, unknown>;
          server_url?: string;
          env?: 'rnd' | 'production';
          timeout_ms?: number;
          message?: string;
          files?: string[];
          confirm_remote_build_without_submit?: boolean;
        };

        const progressReporter = createToolProgressReporter(
          request.params._meta?.progressToken,
          extra,
          'Maker build'
        );
        let result: Awaited<ReturnType<typeof buildCurrentDirectory>>;
        let progressSummary: ToolProgressSummary;
        try {
          result = await buildCurrentDirectory({
            targetDir: resolveMakerToolTargetDir(args.target_dir),
            entry: args.entry,
            scriptsPath: args.scriptsPath,
            entryClient: args.entry_client,
            entryServer: args.entry_server,
            multiplayer: args.multiplayer,
            serverUrl: args.server_url,
            env: args.env,
            timeoutMs: args.timeout_ms,
            message: args.message,
            files: args.files,
            confirmRemoteBuildWithoutSubmit: args.confirm_remote_build_without_submit,
            onProgress: progressReporter.report,
          });
          progressSummary = progressReporter.finish();
        } catch (error) {
          progressReporter.finish();
          throw error;
        }

        return {
          content: [
            {
              type: 'text',
              text: formatBuildResult(result, progressSummary),
            },
          ],
        };
      }

      if (name === 'maker_pull_runtime_logs') {
        const args = (request.params.arguments || {}) as {
          target_dir?: string;
          start_time?: number;
          since_seconds?: number;
          limit?: number;
          server_url?: string;
          env?: 'rnd' | 'production';
          timeout_ms?: number;
        };
        const proxy = createRemoteProxyContext({
          targetDir: resolveMakerToolTargetDir(args.target_dir),
          serverUrl: args.server_url,
          env: args.env,
        });
        const result = await pullRuntimeLogs({
          projectRoot: proxy.projectRoot,
          projectId: proxy.projectId,
          startTime: args.start_time,
          sinceSeconds: args.since_seconds,
          limit: args.limit,
          callRemoteRuntimeLogs: (queryArgs) =>
            callRemoteRuntimeLogs(proxy, queryArgs, args.timeout_ms),
        });

        return {
          content: [
            {
              type: 'text',
              text: formatRuntimeLogPullResult(result),
            },
          ],
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown Maker tool: ${name}`);
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: formatToolException(name, error),
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function formatStatus(
  options: { targetDir?: string; skipRemoteSync?: boolean } = {}
): Promise<string> {
  const targetDir = resolveMakerToolTargetDir(options.targetDir);
  const identify = identifyMakerProject({ cwd: targetDir });
  const gitDirectoryStatus = inspectMakerDirectoryGitStatus(targetDir);
  const remoteSyncText =
    identify.projectRoot && gitDirectoryStatus.isUsableMakerGitRepo && !options.skipRemoteSync
      ? await formatMakerRemoteSyncStatusSafely(identify.projectRoot)
      : identify.projectRoot && gitDirectoryStatus.isUsableMakerGitRepo
        ? formatMakerRemoteSyncSkipped()
        : '';
  const pat = loadPat();
  let tapAuth = loadTapAuth();
  const makerPatTokensUrl = getMakerPatTokensUrl();
  let tapAuthRefreshText = '';
  if (pat && !tapAuth) {
    try {
      tapAuth = await requestTapAuthWithPat(pat.token);
      tapAuthRefreshText = [
        'TapTap token',
        '',
        `本地已有 Maker PAT，已自动获取并保存 TapTap token: ${getTapAuthPath()}`,
      ].join('\n');
    } catch (error) {
      tapAuthRefreshText = [
        'TapTap token',
        '',
        '本地已有 Maker PAT，但自动获取 TapTap token 失败。',
        `原因：${error instanceof Error ? error.message : String(error)}`,
      ].join('\n');
    }
  }
  const git = checkGitEnvironment();
  const projectSection = identify.projectId
    ? [
        '目标目录已绑定 Maker 项目。',
        '请继续在当前绑定项目上执行状态、提交、构建等操作；不要再引导用户 clone，除非用户明确要求切换或重新拉取项目。',
        '本地 Maker 工作流请优先参考 taptap-maker-local skill；CLI 负责初始化/PAT/app/clone，MCP 只保留状态和同步构建。',
      ].join('\n')
    : isLikelyAiDialogueDirectory(targetDir)
      ? formatAiDialogueDirectoryHint(targetDir)
      : pat
        ? await formatAutoProjectListFromPat()
        : formatIdentifyHint();

  return [
    'TapTap Maker MCP status',
    '',
    `- version: ${VERSION}`,
    `- tap_auth: ${tapAuth ? 'found' : 'missing'} (${getTapAuthPath()})`,
    `- pat: ${pat ? 'found' : 'missing'} (${getPatPath()})`,
    `- target_dir: ${targetDir}`,
    `- project_source: ${identify.source}`,
    `- project_id: ${identify.projectId || '(none)'}`,
    identify.configPath ? `- config: ${identify.configPath}` : '',
    identify.config?.sce_endpoint ? `- sce_endpoint: ${identify.config.sce_endpoint}` : '',
    '',
    'Local prerequisites',
    '',
    formatGitEnvironmentStatus(git),
    '',
    formatMakerGitDirectoryStatus(gitDirectoryStatus),
    '',
    remoteSyncText,
    '',
    pat ? '' : ['Auth next step', '', `Maker PAT 缺失。PAT 页面：${makerPatTokensUrl}`].join('\n'),
    '',
    tapAuthRefreshText,
    '',
    identify.projectRoot ? await formatAiDevKitStatus(identify.projectRoot) : '',
    '',
    formatMakerSkillStatus({ projectRoot: identify.projectRoot || targetDir }),
    '',
    projectSection,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatMakerRemoteSyncSkipped(): string {
  return [
    'Maker remote sync',
    '',
    '- status: skipped',
    '- next_action: 已跳过远端同步检查；如需确认是否需要 pull，请重新读取 maker_status_lite 且不要设置 skip_remote_sync。',
  ].join('\n');
}

async function formatMakerRemoteSyncStatus(projectRoot: string): Promise<string> {
  const status = await inspectMakerRemoteSyncStatus(projectRoot);
  return formatMakerRemoteSyncStatusLines(status).join('\n');
}

export async function formatMakerRemoteSyncStatusSafely(projectRoot: string): Promise<string> {
  try {
    return await formatMakerRemoteSyncStatus(projectRoot);
  } catch (error) {
    return formatMakerRemoteSyncUnavailable(error);
  }
}

function formatMakerRemoteSyncUnavailable(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return [
    'Maker remote sync',
    '',
    '- status: unavailable',
    `- failure_name: ${error instanceof Error ? error.name : typeof error}`,
    `- failure_message: ${message}`,
    '- next_action: 远端同步检查失败；本地状态仍可继续查看。请稍后重试 maker_status_lite，频繁轮询时可设置 skip_remote_sync=true。',
  ].join('\n');
}

function formatMakerRemoteSyncStatusLines(status: MakerRemoteSyncStatus): string[] {
  const localPreview = status.localChanges.slice(0, 10);
  return [
    'Maker remote sync',
    '',
    `- status: ${status.status}`,
    `- branch: ${status.branch}`,
    `- remote_ref: ${status.remoteRef}`,
    `- ahead: ${status.aheadCount}`,
    `- behind: ${status.behindCount}`,
    `- local_changes: ${status.hasLocalChanges ? 'yes' : 'no'}`,
    status.hasLocalChanges ? `- local_change_count: ${status.localChangeCount}` : '',
    ...localPreview.map((file) => `  - ${file}`),
    status.localChanges.length > localPreview.length
      ? `  - ... ${status.localChanges.length - localPreview.length} more`
      : '',
    status.failure ? `- failure_classification: ${status.failure.classification}` : '',
    status.failure?.retryable !== undefined
      ? `- failure_retryable: ${status.failure.retryable ? 'yes' : 'no'}`
      : '',
    status.failure?.retryReason ? `- failure_retry_reason: ${status.failure.retryReason}` : '',
    status.failure?.stderr ? `- failure_stderr:\n${indent(status.failure.stderr)}` : '',
    `- next_action: ${status.nextAction}`,
  ].filter(Boolean);
}

function formatMakerGitDirectoryStatus(
  status: ReturnType<typeof inspectMakerDirectoryGitStatus>
): string {
  return [
    'Maker Git directory',
    '',
    `- status: ${status.isUsableMakerGitRepo ? 'ready' : status.issue || 'unbound'}`,
    `- target_dir: ${status.targetDir}`,
    status.makerProjectRoot ? `- maker_project_root: ${status.makerProjectRoot}` : '',
    status.gitRoot ? `- git_root: ${status.gitRoot}` : '- git_root: (none)',
    status.gitDir ? `- git_dir: ${status.gitDir}` : '',
    `- target_is_git_root: ${status.isOwnGitRoot ? 'yes' : 'no'}`,
    `- usable_for_build_submit: ${status.isUsableMakerGitRepo ? 'yes' : 'no'}`,
    status.message ? `- warning: ${status.message}` : '',
    status.issue === 'inside_parent_git_repo'
      ? '- recommendation: 当前目录位于外层 Git 仓库下，但不是独立 Maker Git 仓库；建议新开独立目录重新 clone，或重新执行 clone 让当前目录创建自己的 .git。'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function isLikelyAiDialogueDirectory(targetDir: string): boolean {
  const normalized = targetDir.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/xdt-maker/dialogues/')) {
    return true;
  }

  return /(^|\/)dialogues\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f-]{13,}$/i.test(normalized);
}

export function formatAiDialogueDirectoryHint(targetDir: string): string {
  return [
    'AI client workspace selection',
    '',
    `- current_target_dir: ${targetDir}`,
    '- detected_issue: current directory looks like an AI dialogue/session directory, not a Maker project directory.',
    '- do_not_clone_here: yes',
    '- next_step: inspect the AI client attached/extra workspace directories and choose the Maker project directory.',
    '- if_single_attached_workspace: read maker://status or call maker_status_lite with the attached project directory.',
    '- if_multiple_attached_workspaces: show the directories to the user and ask which one is the Maker project.',
    '- do_not_show_app_selection_here: yes',
  ].join('\n');
}

function resolveMakerToolTargetDir(targetDir?: string): string {
  if (targetDir) {
    return path.resolve(targetDir);
  }
  return process.cwd();
}

async function formatAiDevKitStatus(projectRoot: string): Promise<string> {
  const devKitStatus = inspectAiDevKit(projectRoot);
  if (devKitStatus.ready) {
    return formatAiDevKitStatusLines('ready', devKitStatus).join('\n');
  }

  return [
    ...formatAiDevKitStatusLines('missing', devKitStatus),
    '- next_step: 请运行 taptap-maker dev-kit update，或重新执行 taptap-maker init。',
  ].join('\n');
}

function formatAiDevKitStatusLines(
  status: 'ready' | 'missing',
  devKitStatus: AiDevKitStatus
): string[] {
  return [
    'AI dev kit',
    '',
    `- status: ${status}`,
    `- required_entries: ${devKitStatus.requiredEntries.join(', ')}`,
    `- present_entries: ${devKitStatus.presentEntries.join(', ') || '(none)'}`,
    `- missing_entries: ${devKitStatus.missingEntries.join(', ') || '(none)'}`,
  ];
}

async function formatAutoProjectListFromPat(): Promise<string> {
  try {
    const projects = await listMakerProjects();
    return [
      '本地已有 Maker PAT，当前目录尚未绑定 Maker 项目。',
      '当前目录未绑定时，先展示下面的 Maker Apps 预览和总数，避免长列表刷屏；选择、解释和 clone 顺序请参考 taptap-maker-local skill。',
      '',
      formatStatusProjectList(projects),
    ].join('\n');
  } catch (error) {
    return [
      '本地已有 Maker PAT，但自动列出 Maker Apps 失败。',
      `原因：${error instanceof Error ? error.message : String(error)}`,
      `如果 PAT 已失效，请运行 taptap-maker pat set 并粘贴新的 Maker PAT。PAT 页面：${getMakerPatTokensUrl()}`,
    ].join('\n');
  }
}

const MAKER_STATUS_PROJECT_TEXT_LIMIT = 40;

type StatusProject = {
  id: string;
  name?: string;
  user_id?: string;
  createdAt?: string;
  lastAccessedAt?: string | null;
  lastConversationAt?: string;
  gameType?: string;
  stage?: string;
};

function getStatusProjectActivityTime(project: StatusProject): number {
  const value = project.lastConversationAt || project.lastAccessedAt || project.createdAt;
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function sortStatusProjectsByRecentActivity(projects: StatusProject[]): StatusProject[] {
  return projects
    .map((project, index) => ({ project, index }))
    .sort((left, right) => {
      const timeDiff =
        getStatusProjectActivityTime(right.project) - getStatusProjectActivityTime(left.project);
      return timeDiff || left.index - right.index;
    })
    .map(({ project }) => project);
}

export function formatStatusProjectList(projects: StatusProject[]): string {
  if (projects.length === 0) {
    return [
      'No Maker apps found.',
      '',
      '请确认 Maker PAT 是否有效，或等待 Maker app list 接口对齐。',
    ].join('\n');
  }
  const visibleProjects = sortStatusProjectsByRecentActivity(projects).slice(
    0,
    MAKER_STATUS_PROJECT_TEXT_LIMIT
  );
  const hiddenCount = projects.length - visibleProjects.length;

  return [
    `Maker apps (${projects.length})`,
    '',
    hiddenCount > 0
      ? `为了保持友好的可读性，默认最多展示 ${visibleProjects.length} 个 app；如需完整列表，可以选择显示全部。`
      : '已显示全部 app；请询问用户选择。',
    hiddenCount > 0 ? '如需完整列表，请运行 taptap-maker apps --json 查看全部 app。' : undefined,
    'AI 展示建议：如果聊天或客户端宽度足够，可把 app 预览整理成两列紧凑布局；每个 app 保留序号、app_id、名称，以及可用的最近活跃时间或 user_id。窄屏保持单列。不要省略 app_id，也不要在用户确认前自动选择 app。',
    '',
    ...visibleProjects.map(
      (project, index) =>
        `${index + 1}. ${project.id}${project.name ? `  ${project.name}` : ''}${
          project.user_id ? `  user_id=${project.user_id}` : ''
        }${project.gameType ? `  gameType=${project.gameType}` : ''}${
          project.stage ? `  stage=${project.stage}` : ''
        }${project.createdAt ? `  createdAt=${project.createdAt}` : ''}${
          project.lastConversationAt ? `  lastConversationAt=${project.lastConversationAt}` : ''
        }`
    ),
    '',
    '仅当当前目录未绑定且用户要初始化或 clone 时，才让用户选择 app 并继续 taptap-maker init。',
    '如果当前目录已绑定 Maker 项目，这个列表仅作账号项目参考；请继续当前项目，除非用户明确要求切换或重新 clone。',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export function formatClonePartialStateLines(targetDir: string): string[] {
  const resolvedTargetDir = path.resolve(targetDir);
  const identify = identifyMakerProject({ cwd: resolvedTargetDir });
  const gitStatus = inspectMakerDirectoryGitStatus(resolvedTargetDir);
  const devKitStatus = inspectAiDevKit(resolvedTargetDir);
  const stagedDevKitGitignorePath = path.join(resolvedTargetDir, DEV_KIT_GITIGNORE_STAGING_FILE);
  const projectBound = Boolean(identify.projectId);
  const gitInitialized = Boolean(
    gitStatus.isOwnGitRoot || fs.existsSync(path.join(resolvedTargetDir, '.git'))
  );
  const safeToRetry = !projectBound;

  return [
    'partial_state:',
    `- target_dir: ${resolvedTargetDir}`,
    `- git_initialized: ${gitInitialized ? 'yes' : 'no'}`,
    gitStatus.gitRoot ? `- git_root: ${gitStatus.gitRoot}` : '- git_root: (none)',
    `- target_is_git_root: ${gitStatus.isOwnGitRoot ? 'yes' : 'no'}`,
    `- project_bound: ${projectBound ? 'yes' : 'no'}`,
    identify.projectId ? `- project_id: ${identify.projectId}` : '',
    identify.configPath ? `- config: ${identify.configPath}` : '',
    `- ai_dev_kit_present: ${devKitStatus.ready ? 'yes' : 'no'}`,
    `- ai_dev_kit_missing_entries: ${devKitStatus.missingEntries.join(', ') || '(none)'}`,
    `- staged_dev_kit_gitignore: ${fs.existsSync(stagedDevKitGitignorePath) ? 'yes' : 'no'}`,
    `- safe_to_retry: ${safeToRetry ? 'yes' : 'no'}`,
    safeToRetry
      ? '- next_step: 可以直接重试 taptap-maker init；如果连续失败，建议换一个全新的独立目录重新 clone。'
      : '- next_step: 当前目录已经有 Maker 绑定信息；先运行 taptap-maker doctor 或读取 maker://status 确认状态，不要重复 clone。',
  ].filter(Boolean);
}

export function createRemoteProxyContext(options: {
  targetDir: string;
  serverUrl?: string;
  env?: 'rnd' | 'production';
  useNpx?: boolean;
  pkg?: string;
}): {
  projectRoot: string;
  serverUrl: string;
  env: string;
  projectId: string;
  projectPath: string;
  userId: string;
  proxyConfigJson: string;
  command: string;
  args: string[];
  envVars?: Record<string, string>;
} {
  const identify = identifyMakerProject({ cwd: options.targetDir });
  if (!identify.projectRoot || !identify.projectId) {
    throw new Error(
      `${options.targetDir} is not bound to a Maker project. Run taptap-maker init first.`
    );
  }

  const projectConfig = loadProjectConfig(identify.projectRoot);
  const projectId = projectConfig?.project_id || identify.projectId;
  const tapAuth = loadTapAuth();
  if (!tapAuth) {
    throw new Error('Tap auth not found. Run taptap-maker pat set and paste a Maker PAT first.');
  }

  let userId = projectConfig?.user_id;
  if (!userId) {
    const jwt = loadJwt();
    userId = jwt ? getUserIdFromMakerJwt(jwt) : undefined;
  }
  if (!userId) {
    throw new Error(
      'Cannot resolve user_id. Re-run taptap-maker init with PAT so the project config can cache user_id.'
    );
  }

  const env = getMakerEnvironment(options.env);
  const serverUrl =
    options.serverUrl ||
    requireMakerEndpoint('remoteMcpServerUrl', getMakerEndpoints(env).remoteMcpServerUrl, env);
  const projectPath = `${projectId}/workspace`;
  const proxyCfg = {
    server: { url: serverUrl, env },
    tenant: {
      project_path: projectPath,
      user_id: userId,
      project_id: projectId,
    },
    auth: {
      kid: tapAuth.kid,
      mac_key: tapAuth.mac_key,
      token_type: tapAuth.token_type || 'mac',
      mac_algorithm: tapAuth.mac_algorithm || 'hmac-sha-1',
    },
    options: { verbose: true },
  };

  const proxyConfigJson = JSON.stringify(proxyCfg);
  const proxyServer = options.useNpx
    ? {
        command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: ['-y', '-p', options.pkg || DEFAULT_PROXY_PACKAGE, 'taptap-mcp-proxy'],
      }
    : {
        command: 'node',
        args: [resolveLocalProxyBundle()],
      };

  return {
    projectRoot: identify.projectRoot,
    serverUrl,
    env,
    projectId,
    projectPath,
    userId,
    proxyConfigJson,
    command: proxyServer.command,
    args: proxyServer.args,
    envVars: {
      PROXY_CONFIG: proxyConfigJson,
    },
  };
}

export function configureRemoteProxy(options: {
  targetDir: string;
  serverUrl?: string;
  env?: 'rnd' | 'production';
  mcpName?: string;
  useNpx?: boolean;
  pkg?: string;
}): {
  mcpJsonPath: string;
  projectRoot: string;
  mcpName: string;
  serverUrl: string;
  env: string;
  projectId: string;
  projectPath: string;
  userId?: string;
  command: string;
  args: string[];
  envVars?: Record<string, string>;
} {
  const mcpName = options.mcpName || DEFAULT_PROXY_MCP_NAME;
  const proxy = createRemoteProxyContext(options);

  const mcpJsonPath = path.join(proxy.projectRoot, '.mcp.json');
  const mcpJson = readMcpJson(mcpJsonPath);
  mcpJson.mcpServers = {
    ...(mcpJson.mcpServers || {}),
    [mcpName]: {
      command: proxy.command,
      args: proxy.args,
      env: proxy.envVars,
    },
  };
  fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2) + '\n', 'utf8');
  excludeProjectMcpJson(proxy.projectRoot);

  return {
    mcpJsonPath,
    projectRoot: proxy.projectRoot,
    mcpName,
    serverUrl: proxy.serverUrl,
    env: proxy.env,
    projectId: proxy.projectId,
    projectPath: proxy.projectPath,
    userId: proxy.userId,
    command: proxy.command,
    args: proxy.args,
    envVars: proxy.envVars,
  };
}

export function resolveLocalProxyBundle(options?: {
  currentModuleUrl?: string;
  makerEntry?: string;
  cwd?: string;
}): string {
  const currentModuleUrl =
    options?.currentModuleUrl ||
    (typeof __MAKER_BUNDLE_URL__ !== 'undefined' ? __MAKER_BUNDLE_URL__ : undefined);
  const currentModuleDir = currentModuleUrl ? path.dirname(fileURLToPath(currentModuleUrl)) : '';
  const makerEntry = options?.makerEntry ?? process.argv[1];
  const makerEntryDir = makerEntry ? path.dirname(path.resolve(makerEntry)) : '';
  const cwd = options?.cwd ?? process.cwd();
  const candidates = [
    currentModuleDir ? path.join(currentModuleDir, 'proxy.js') : '',
    makerEntryDir ? path.join(makerEntryDir, '..', 'dist', 'proxy.js') : '',
    path.resolve(cwd, 'dist', 'proxy.js'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`MCP proxy bundle not found. Checked: ${candidates.join(', ')}`);
}

function readMcpJson(filePath: string): {
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
} {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      mcpServers?: Record<
        string,
        { command: string; args: string[]; env?: Record<string, string> }
      >;
    };
  } catch (error) {
    throw new Error(
      `Failed to parse existing .mcp.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function excludeProjectMcpJson(projectRoot: string): void {
  const gitDir = path.join(projectRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    return;
  }

  const infoDir = path.join(gitDir, 'info');
  const excludePath = path.join(infoDir, 'exclude');
  const entry = '.mcp.json';
  fs.mkdirSync(infoDir, { recursive: true });
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  const hasEntry = existing
    .split('\n')
    .map((line) => line.trim())
    .includes(entry);
  if (hasEntry) {
    return;
  }

  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(excludePath, `${prefix}${entry}\n`, 'utf8');
}

export function formatRemoteProxyResult(result: {
  mcpJsonPath: string;
  projectRoot: string;
  mcpName: string;
  serverUrl: string;
  env: string;
  projectId: string;
  projectPath: string;
  userId?: string;
  command: string;
  args: string[];
  envVars?: Record<string, string>;
}): string {
  return [
    '✓ Remote Maker MCP proxy configured',
    '',
    `- mcp_name: ${result.mcpName}`,
    `- project_root: ${result.projectRoot}`,
    `- mcp_json: ${result.mcpJsonPath}`,
    `- server_url: ${result.serverUrl}`,
    `- env: ${result.env}`,
    `- project_id: ${result.projectId}`,
    `- project_path: ${result.projectPath}`,
    `- user_id: ${result.userId || '(unknown)'}`,
    `- command: ${result.command}`,
    `- args: ${formatProxyArgs(result.args)}`,
    `- env: ${formatProxyEnv(result.envVars)}`,
    '',
    '已将 .mcp.json 写入本地 .git/info/exclude，避免误提交包含认证信息的本地 MCP 配置。',
    '下一步：请重启当前 Claude/Codex 对话或重新加载 MCP servers，然后远端 taptap-proxy 暴露的 build/构建 tools 才会出现。',
  ].join('\n');
}

function formatProxyArgs(args: string[]): string {
  return args
    .map((arg) => {
      if (arg.startsWith('{') && arg.includes('mac_key')) {
        return '<proxy_cfg_with_auth>';
      }
      return arg;
    })
    .join(' ');
}

function formatProxyEnv(envVars?: Record<string, string>): string {
  if (!envVars) {
    return '(none)';
  }
  return Object.keys(envVars)
    .map((key) => `${key}=<redacted>`)
    .join(' ');
}

interface ToolProgressSummary {
  elapsedMs: number;
  elapsed: string;
  progressEvents: number;
  lastProgress?: MakerProjectProgress;
}

interface ToolProgressReporter {
  report: MakerProjectProgressHandler;
  finish: () => ToolProgressSummary;
}

function createToolProgressReporter(
  progressToken: ProgressToken | undefined,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  operationName: string
): ToolProgressReporter {
  const startedAt = Date.now();
  let events = 0;
  let lastProgress: MakerProjectProgress | undefined;
  let lastSentProgress = 0;
  let finished = false;

  const sendProgress = (progress: MakerProjectProgress): void => {
    if (finished || progressToken === undefined) {
      return;
    }

    const elapsed = formatDuration(Date.now() - startedAt);
    const numericProgress =
      progress.progress !== undefined
        ? Math.max(lastSentProgress, progress.progress)
        : Math.max(lastSentProgress, Math.floor((Date.now() - startedAt) / 1000));
    lastSentProgress = numericProgress;
    const message = `${operationName}: ${progress.message} (elapsed ${elapsed})`;

    void extra
      .sendNotification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: numericProgress,
          ...(progress.total !== undefined ? { total: progress.total } : {}),
          message,
        },
      } as ServerNotification)
      .catch(() => {
        // Progress notification failures should not fail Maker operations.
      });
  };

  const heartbeat = setInterval(() => {
    const elapsed = formatDuration(Date.now() - startedAt);
    sendProgress({
      progress: lastProgress?.progress,
      total: lastProgress?.total,
      phase: lastProgress?.phase,
      message: `still running; elapsed ${elapsed}; last status: ${
        lastProgress?.message || 'waiting for progress'
      }`,
    });
  }, LONG_OPERATION_HEARTBEAT_MS);
  heartbeat.unref?.();

  return {
    report(progress) {
      events += 1;
      lastProgress = progress;
      sendProgress(progress);
    },
    finish() {
      if (!finished) {
        finished = true;
        clearInterval(heartbeat);
      }
      const elapsedMs = Date.now() - startedAt;
      return {
        elapsedMs,
        elapsed: formatDuration(elapsedMs),
        progressEvents: events,
        lastProgress,
      };
    },
  };
}

function formatProgressSummary(summary: ToolProgressSummary): string[] {
  return [
    `- elapsed_ms: ${summary.elapsedMs}`,
    `- elapsed: ${summary.elapsed}`,
    `- progress_events: ${summary.progressEvents}`,
    summary.lastProgress
      ? `- last_progress: ${formatProgressMessage(summary.lastProgress)}`
      : '- last_progress: (none)',
  ];
}

function formatProgressMessage(progress: MakerProjectProgress): string {
  const percent =
    progress.progress !== undefined
      ? `${progress.progress}${progress.total === 100 ? '%' : ''}`
      : undefined;
  return [progress.phase ? `[${progress.phase}]` : '', percent, progress.message]
    .filter(Boolean)
    .join(' ');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

type SubmitLocalChangesForBuild = (
  options: PushMakerProjectOptions
) => Promise<PushMakerProjectResult>;

type RemoteBuildResult = Extract<BuildCurrentDirectoryResult, { mode: 'remote_build' }>;
type MakerBuildFailure = {
  name: string;
  message: string;
  stack?: string;
};
type PreviewRefreshResult = {
  ok: boolean;
  status: number;
  url: string;
  responseText?: string;
  error?: string;
};
type RefreshMakerPreview = (buildResult: RemoteBuildResult) => Promise<PreviewRefreshResult>;
type RuntimeLogWatchStartResult = {
  started: boolean;
  command: string;
  runtimeLog: string;
  stdoutLog?: string;
  stderrLog?: string;
  pidFile?: string;
  pid?: number;
  previousPid?: number;
  previousStopped?: boolean;
  previousStopError?: string;
  error?: string;
};
type RuntimeLogWatcherPidState = {
  pid: number;
  command?: string;
  startedAt?: string;
  legacy?: boolean;
};
type StopRuntimeLogWatcherOptions = {
  getProcessCommand?: (pid: number) => string | undefined;
  waitForExit?: (pid: number, timeoutMs: number) => boolean;
};
type StartRuntimeLogWatch = (buildResult: RemoteBuildResult) => Promise<RuntimeLogWatchStartResult>;
type RuntimeLogMcpClient = Pick<Client, 'connect' | 'callTool' | 'close'>;
type RemoteRuntimeLogClient = {
  call: (args: RuntimeLogQueryArgs) => Promise<RuntimeLogQueryResult>;
  close: () => Promise<void>;
};

function formatMakerAppWebUrl(projectId: string, env: string): string {
  const makerEnv = env === 'rnd' || env === 'production' ? env : undefined;
  return `${getMakerWebUrl(makerEnv)}/app/${encodeURIComponent(projectId)}`;
}

type BuildCurrentDirectoryResult =
  | {
      mode: 'remote_build';
      projectRoot: string;
      projectId: string;
      projectPath: string;
      serverUrl: string;
      env: string;
      makerUrl?: string;
      timeoutMs: number;
      buildArgs: Record<string, unknown>;
      resultText: string;
      previewRefresh?: PreviewRefreshResult;
      runtimeLogWatch?: RuntimeLogWatchStartResult;
      submitResult?: PushMakerProjectResult;
    }
  | {
      mode: 'remote_build_failed';
      projectRoot: string;
      projectId: string;
      buildResult: RemoteBuildResult;
      buildFailure: MakerBuildFailure;
    }
  | {
      mode: 'submit_failed_before_build';
      projectRoot: string;
      projectId: string;
      submitResult: PushMakerProjectResult;
    }
  | {
      mode: 'build_failed_after_submit';
      projectRoot: string;
      projectId: string;
      submitResult: PushMakerProjectResult;
      buildFailure: MakerBuildFailure;
    };

class RemoteBuildFailedError extends Error {
  readonly buildResult: RemoteBuildResult;

  constructor(buildResult: RemoteBuildResult) {
    super(buildResult.resultText);
    this.name = 'RemoteBuildFailedError';
    this.buildResult = buildResult;
  }
}

export async function buildCurrentDirectory(options: {
  targetDir: string;
  entry?: string;
  scriptsPath?: string;
  entryClient?: string;
  entryServer?: string;
  multiplayer?: Record<string, unknown>;
  serverUrl?: string;
  env?: 'rnd' | 'production';
  timeoutMs?: number;
  message?: string;
  files?: string[];
  confirmRemoteBuildWithoutSubmit?: boolean;
  submitLocalChanges?: SubmitLocalChangesForBuild;
  callRemoteBuild?: (targetDir: string) => Promise<RemoteBuildResult>;
  refreshPreview?: RefreshMakerPreview;
  startRuntimeLogWatch?: StartRuntimeLogWatch;
  onProgress?: MakerProjectProgressHandler;
}): Promise<BuildCurrentDirectoryResult> {
  const localChanges = await readMakerProjectLocalChanges(options.targetDir);
  if (localChanges.hasChanges && !options.confirmRemoteBuildWithoutSubmit) {
    const config = loadProjectConfig(localChanges.projectRoot);
    options.onProgress?.({
      progress: 0,
      total: 100,
      phase: 'sync',
      message: 'Syncing local Maker changes before remote build',
    });
    const submitResult = await (options.submitLocalChanges || pushMakerProject)({
      cwd: localChanges.projectRoot,
      message: options.message,
      files: options.files,
      onProgress: options.onProgress,
    });
    if (submitResult.failure || (!submitResult.pushed && submitResult.status !== 'clean')) {
      return {
        mode: 'submit_failed_before_build',
        projectRoot: localChanges.projectRoot,
        projectId: config?.project_id || 'unknown',
        submitResult,
      };
    }
    let buildResult: RemoteBuildResult;
    try {
      buildResult = await runRemoteBuildCurrentDirectory(options, localChanges.projectRoot);
    } catch (error) {
      return {
        mode: 'build_failed_after_submit',
        projectRoot: localChanges.projectRoot,
        projectId: config?.project_id || 'unknown',
        submitResult,
        buildFailure: toMakerBuildFailure(error),
      };
    }
    return {
      ...buildResult,
      submitResult,
    };
  }

  try {
    return await runRemoteBuildCurrentDirectory(options, options.targetDir);
  } catch (error) {
    if (error instanceof RemoteBuildFailedError) {
      return {
        mode: 'remote_build_failed',
        projectRoot: error.buildResult.projectRoot,
        projectId: error.buildResult.projectId,
        buildResult: error.buildResult,
        buildFailure: toMakerBuildFailure(error),
      };
    }
    throw error;
  }
}

async function runRemoteBuildCurrentDirectory(
  options: {
    targetDir: string;
    entry?: string;
    scriptsPath?: string;
    entryClient?: string;
    entryServer?: string;
    multiplayer?: Record<string, unknown>;
    serverUrl?: string;
    env?: 'rnd' | 'production';
    timeoutMs?: number;
    callRemoteBuild?: (
      targetDir: string
    ) => Promise<Extract<BuildCurrentDirectoryResult, { mode: 'remote_build' }>>;
    refreshPreview?: RefreshMakerPreview;
    startRuntimeLogWatch?: StartRuntimeLogWatch;
    onProgress?: MakerProjectProgressHandler;
  },
  targetDir: string
): Promise<RemoteBuildResult> {
  if (options.callRemoteBuild) {
    return attachBuildSuccessSideEffects(await options.callRemoteBuild(targetDir), {
      refreshPreview: options.refreshPreview || skipPreviewRefresh,
      startRuntimeLogWatch: options.startRuntimeLogWatch,
    });
  }

  const proxy = createRemoteProxyContext({
    targetDir,
    serverUrl: options.serverUrl,
    env: options.env,
  });
  const buildArgs = createBuildArgs(proxy.projectRoot, options);
  const timeoutMs = options.timeoutMs || DEFAULT_BUILD_TIMEOUT_MS;

  const transport = new StdioClientTransport({
    command: proxy.command,
    args: proxy.args,
    env: mergeStringEnv(process.env, proxy.envVars),
    stderr: 'pipe',
  });
  const client = new Client(
    {
      name: 'taptap-maker-build-forwarder',
      version: VERSION,
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    const result = await client.callTool(
      {
        name: 'build',
        arguments: buildArgs,
      },
      undefined,
      {
        timeout: timeoutMs,
        resetTimeoutOnProgress: true,
        onprogress: (progress) => {
          options.onProgress?.({
            progress: progress.progress,
            total: progress.total,
            phase: 'remote_build',
            message: progress.message || 'Remote Maker build progress',
          });
        },
      }
    );

    if (isRemoteToolError(result)) {
      throw new Error(formatRemoteToolResult(result));
    }

    return attachBuildSuccessSideEffects(
      {
        mode: 'remote_build',
        projectRoot: proxy.projectRoot,
        projectId: proxy.projectId,
        projectPath: proxy.projectPath,
        serverUrl: proxy.serverUrl,
        env: proxy.env,
        makerUrl: formatMakerAppWebUrl(proxy.projectId, proxy.env),
        timeoutMs,
        buildArgs,
        resultText: formatRemoteToolResult(result),
      },
      {
        refreshPreview: options.refreshPreview,
        startRuntimeLogWatch: options.startRuntimeLogWatch || startRuntimeLogWatch,
      }
    );
  } finally {
    await client.close();
  }
}

async function attachBuildSuccessSideEffects(
  buildResult: RemoteBuildResult,
  options: {
    refreshPreview?: RefreshMakerPreview;
    startRuntimeLogWatch?: StartRuntimeLogWatch;
  }
): Promise<RemoteBuildResult> {
  if (isRemoteBuildFailureResult(buildResult)) {
    throw new RemoteBuildFailedError(buildResult);
  }
  const withPreview = await attachPreviewRefresh(buildResult, options.refreshPreview);
  if (!options.startRuntimeLogWatch) {
    return withPreview;
  }
  return attachRuntimeLogWatch(withPreview, options.startRuntimeLogWatch);
}

function isRemoteToolError(result: unknown): boolean {
  return Boolean(result && typeof result === 'object' && (result as { isError?: unknown }).isError);
}

function isRemoteBuildFailureResult(buildResult: RemoteBuildResult): boolean {
  return /\bBUILD FAILED\b/i.test(buildResult.resultText);
}

async function attachPreviewRefresh(
  buildResult: RemoteBuildResult,
  refreshPreview: RefreshMakerPreview = refreshMakerPreview
): Promise<RemoteBuildResult> {
  try {
    return {
      ...buildResult,
      previewRefresh: await refreshPreview(buildResult),
    };
  } catch (error) {
    return {
      ...buildResult,
      previewRefresh: {
        ok: false,
        status: 0,
        url: '',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function skipPreviewRefresh(buildResult: RemoteBuildResult): Promise<PreviewRefreshResult> {
  return {
    ok: false,
    status: 0,
    url: '',
    error: `preview refresh skipped for injected remote build: ${buildResult.projectId}`,
  };
}

async function attachRuntimeLogWatch(
  buildResult: RemoteBuildResult,
  startWatch: StartRuntimeLogWatch
): Promise<RemoteBuildResult> {
  try {
    return {
      ...buildResult,
      runtimeLogWatch: await startWatch(buildResult),
    };
  } catch (error) {
    return {
      ...buildResult,
      runtimeLogWatch: {
        started: false,
        command: formatRuntimeLogWatchCommand(buildResult).text,
        runtimeLog: getRuntimeLogFilePath(buildResult.projectRoot),
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function startRuntimeLogWatch(
  buildResult: RemoteBuildResult
): Promise<RuntimeLogWatchStartResult> {
  const runtimeDir = path.join(buildResult.projectRoot, '.maker', 'logs', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const stdoutLog = path.join(runtimeDir, 'watcher.out.log');
  const stderrLog = path.join(runtimeDir, 'watcher.err.log');
  const pidFile = path.join(runtimeDir, 'watcher.pid');
  const previous = stopExistingRuntimeLogWatcher(pidFile);
  const outFd = fs.openSync(stdoutLog, 'a');
  const errFd = fs.openSync(stderrLog, 'a');
  const command = formatRuntimeLogWatchCommand(buildResult);

  if (previous.previousStopError) {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
    return {
      started: false,
      command: command.text,
      runtimeLog: getRuntimeLogFilePath(buildResult.projectRoot),
      stdoutLog,
      stderrLog,
      pidFile,
      ...previous,
      error: previous.previousStopError,
    };
  }

  try {
    const child = spawn(command.command, command.args, {
      cwd: buildResult.projectRoot,
      detached: true,
      env: mergeStringEnv(process.env, { TAPTAP_MCP_ENV: buildResult.env }),
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    });
    const spawnError = await waitForSpawnError(child);
    if (spawnError) {
      return {
        started: false,
        command: command.text,
        runtimeLog: getRuntimeLogFilePath(buildResult.projectRoot),
        stdoutLog,
        stderrLog,
        pidFile,
        ...previous,
        error: spawnError.message,
      };
    }
    if (!child.pid) {
      return {
        started: false,
        command: command.text,
        runtimeLog: getRuntimeLogFilePath(buildResult.projectRoot),
        stdoutLog,
        stderrLog,
        pidFile,
        ...previous,
        error: 'runtime log watcher process did not report a pid',
      };
    }
    child.once('error', () => undefined);
    child.unref();
    writeRuntimeLogWatcherPidFile(pidFile, {
      pid: child.pid,
      command: command.text,
      startedAt: new Date().toISOString(),
    });
    return {
      started: true,
      command: command.text,
      runtimeLog: getRuntimeLogFilePath(buildResult.projectRoot),
      stdoutLog,
      stderrLog,
      pidFile,
      pid: child.pid,
      ...previous,
    };
  } finally {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  }
}

export function stopExistingRuntimeLogWatcher(
  pidFile: string,
  options: StopRuntimeLogWatcherOptions = {}
): {
  previousPid?: number;
  previousStopped?: boolean;
  previousStopError?: string;
} {
  if (!fs.existsSync(pidFile)) {
    return {};
  }

  const pidState = readRuntimeLogWatcherPidState(pidFile);
  const pid = pidState?.pid;
  if (!Number.isInteger(pid) || pid <= 0) {
    fs.rmSync(pidFile, { force: true });
    return {};
  }

  try {
    process.kill(pid, 0);
    const processCommand = (options.getProcessCommand || getProcessCommand)(pid);
    const verifiedCommand = getVerifiedRuntimeLogWatcherCommand(processCommand, pidState);
    if (!verifiedCommand) {
      fs.rmSync(pidFile, { force: true });
      return {
        previousPid: pid,
        previousStopped: false,
        previousStopError: processCommand
          ? `process ${pid} does not look like a Maker log watcher: ${processCommand}`
          : `process ${pid} could not be verified as a Maker log watcher`,
      };
    }
    process.kill(pid, 'SIGTERM');
    const stopped = (options.waitForExit || waitForProcessExit)(pid, WATCHER_STOP_TIMEOUT_MS);
    if (stopped) {
      fs.rmSync(pidFile, { force: true });
      return { previousPid: pid, previousStopped: true };
    }
    return {
      previousPid: pid,
      previousStopped: false,
      previousStopError: `process ${pid} did not exit after SIGTERM within ${WATCHER_STOP_TIMEOUT_MS}ms`,
    };
  } catch (error) {
    fs.rmSync(pidFile, { force: true });
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'ESRCH') {
      return { previousPid: pid, previousStopped: false };
    }
    return {
      previousPid: pid,
      previousStopped: false,
      previousStopError: error instanceof Error ? error.message : String(error),
    };
  }
}

function readRuntimeLogWatcherPidState(pidFile: string): RuntimeLogWatcherPidState | null {
  const raw = fs.readFileSync(pidFile, 'utf8').trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RuntimeLogWatcherPidState>;
    if (typeof parsed === 'number') {
      return Number.isInteger(parsed) && parsed > 0 ? { pid: parsed, legacy: true } : null;
    }
    return typeof parsed.pid === 'number' ? (parsed as RuntimeLogWatcherPidState) : null;
  } catch {
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? { pid, legacy: true } : null;
  }
}

function writeRuntimeLogWatcherPidFile(pidFile: string, state: RuntimeLogWatcherPidState): void {
  fs.writeFileSync(pidFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function getProcessCommand(pid: number): string | undefined {
  if (process.platform === 'win32') {
    return undefined;
  }
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function isRuntimeLogWatcherProcess(command: string | undefined): boolean {
  return Boolean(command && WATCHER_PROCESS_PATTERN.test(command));
}

function getVerifiedRuntimeLogWatcherCommand(
  processCommand: string | undefined,
  pidState: RuntimeLogWatcherPidState
): string | undefined {
  if (isRuntimeLogWatcherProcess(processCommand)) {
    return processCommand;
  }
  if (!processCommand && !pidState.legacy && isRuntimeLogWatcherProcess(pidState.command)) {
    return pidState.command;
  }
  return undefined;
}

function waitForProcessExit(pid: number, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    sleepSync(50);
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

function waitForSpawnError(child: ChildProcess): Promise<Error | undefined> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (error?: Error): void => {
      if (done) {
        return;
      }
      done = true;
      child.off('error', finish);
      resolve(error);
    };
    child.once('error', finish);
    setTimeout(() => finish(), 50);
  });
}

function formatRuntimeLogWatchCommand(buildResult: RemoteBuildResult): {
  command: string;
  args: string[];
  text: string;
} {
  const args = [
    resolveMakerCliEntry(),
    'logs',
    'watch',
    '--target-dir',
    buildResult.projectRoot,
    '--reset',
    '--interval',
    '5s',
    '--env',
    buildResult.env,
    '--server-url',
    buildResult.serverUrl,
  ];
  return {
    command: process.execPath,
    args,
    text: formatLocalShellCommand([process.execPath, ...args]),
  };
}

function resolveMakerCliEntry(): string {
  return process.argv[1] || path.resolve(process.cwd(), 'dist', 'maker.js');
}

function getRuntimeLogFilePath(projectRoot: string): string {
  return path.join(projectRoot, '.maker', 'logs', 'runtime', 'runtime.log');
}

async function refreshMakerPreview(buildResult: RemoteBuildResult): Promise<PreviewRefreshResult> {
  const makerEnv =
    buildResult.env === 'rnd' || buildResult.env === 'production' ? buildResult.env : undefined;
  const apiBase = requireMakerEndpoint('apiBase', getMakerEndpoints(makerEnv).apiBase, makerEnv);
  const url = `${apiBase.replace(/\/$/, '')}/apps/${encodeURIComponent(
    buildResult.projectId
  )}/preview-refresh`;
  const pat = loadPat();
  if (!pat?.token) {
    return {
      ok: false,
      status: 0,
      url,
      error: 'Maker PAT not found. Run taptap-maker pat set and paste a Maker PAT first.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, PREVIEW_REFRESH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat.token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: controller.signal,
    });
    const responseText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url,
      ...(responseText ? { responseText: responseText.slice(0, 2000) } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      error:
        error instanceof Error && error.name === 'AbortError'
          ? `preview refresh timed out after ${PREVIEW_REFRESH_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function callRemoteRuntimeLogs(
  proxy: RemoteProxyContext,
  args: RuntimeLogQueryArgs,
  timeoutMs = 60 * 1000
): Promise<RuntimeLogQueryResult> {
  const runtimeLogClient = createRemoteRuntimeLogClient(proxy, timeoutMs);

  try {
    return await runtimeLogClient.call(args);
  } finally {
    await runtimeLogClient.close();
  }
}

export function createRemoteRuntimeLogClient(
  proxy: RemoteProxyContext,
  timeoutMs = 60 * 1000,
  options: {
    createTransport?: () => Transport;
    createClient?: () => RuntimeLogMcpClient;
  } = {}
): RemoteRuntimeLogClient {
  let client: RuntimeLogMcpClient | undefined;

  const createTransport =
    options.createTransport ||
    (() =>
      new HiddenStdioClientTransport({
        command: proxy.command,
        args: proxy.args,
        env: mergeStringEnv(process.env, proxy.envVars),
        stderr: 'pipe',
      }));
  const createClient =
    options.createClient ||
    (() =>
      new Client(
        {
          name: 'taptap-maker-runtime-log-forwarder',
          version: VERSION,
        },
        {
          capabilities: {},
        }
      ));

  const ensureClient = async (): Promise<RuntimeLogMcpClient> => {
    if (client) {
      return client;
    }
    const nextClient = createClient();
    await nextClient.connect(createTransport());
    client = nextClient;
    return nextClient;
  };

  const close = async (): Promise<void> => {
    const activeClient = client;
    client = undefined;
    if (activeClient) {
      await activeClient.close();
    }
  };

  return {
    call: async (args): Promise<RuntimeLogQueryResult> => {
      const activeClient = await ensureClient();
      let result: unknown;
      try {
        result = await activeClient.callTool(
          {
            name: 'query_runtime_logs',
            arguments: { ...args },
          },
          undefined,
          {
            timeout: timeoutMs,
          }
        );
      } catch (error) {
        await close();
        throw error;
      }

      try {
        return normalizeRuntimeLogQueryResult(result);
      } catch (error) {
        const rawPath = writeRuntimeLogRawResponse(proxy.projectRoot, result);
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            `Raw query_runtime_logs response saved to ${rawPath}`,
          ].join(' ')
        );
      }
    },
    close,
  };
}

export type RemoteProxyContext = ReturnType<typeof createRemoteProxyContext>;

type PushThenBuildCurrentDirectoryResult = {
  targetDir: string;
  submitResult: PushMakerProjectResult;
  buildResult?: RemoteBuildResult;
  buildFailure?: MakerBuildFailure;
};

export async function pushThenBuildCurrentDirectory(options: {
  targetDir: string;
  message?: string;
  files?: string[];
  pushLocalChanges?: SubmitLocalChangesForBuild;
  callRemoteBuild?: (targetDir: string) => Promise<RemoteBuildResult>;
  onProgress?: MakerProjectProgressHandler;
}): Promise<PushThenBuildCurrentDirectoryResult> {
  const submitResult = await (options.pushLocalChanges || pushMakerProject)({
    cwd: options.targetDir,
    message: options.message,
    files: options.files,
    onProgress: options.onProgress,
  });
  if (!submitResult.pushed) {
    return {
      targetDir: options.targetDir,
      submitResult,
    };
  }
  let buildResult: RemoteBuildResult;
  try {
    buildResult = await runRemoteBuildCurrentDirectory(
      {
        targetDir: options.targetDir,
        callRemoteBuild: options.callRemoteBuild,
        onProgress: options.onProgress,
      },
      options.targetDir
    );
  } catch (error) {
    return {
      targetDir: options.targetDir,
      submitResult,
      buildFailure: toMakerBuildFailure(error),
    };
  }
  return {
    targetDir: options.targetDir,
    submitResult,
    buildResult,
  };
}

function toMakerBuildFailure(error: unknown): MakerBuildFailure {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };
}

export function createBuildArgs(
  projectRoot: string,
  options: {
    entry?: string;
    scriptsPath?: string;
    entryClient?: string;
    entryServer?: string;
    multiplayer?: Record<string, unknown>;
  }
): Record<string, unknown> {
  const buildArgs: Record<string, unknown> = {};
  if (options.entry) {
    buildArgs.entry = options.entry;
  }
  if (options.scriptsPath) {
    buildArgs.scriptsPath = options.scriptsPath;
  }
  if (
    !options.entry &&
    !options.scriptsPath &&
    !options.entryClient &&
    !options.entryServer &&
    !options.multiplayer &&
    fs.existsSync(path.join(projectRoot, 'scripts', 'main.lua'))
  ) {
    buildArgs.entry = 'main.lua';
    buildArgs.scriptsPath = 'scripts';
  }
  if (options.entryClient) {
    buildArgs.entry_client = options.entryClient;
  }
  if (options.entryServer) {
    buildArgs.entry_server = options.entryServer;
  }
  if (options.multiplayer) {
    buildArgs.multiplayer = options.multiplayer;
  } else if (!fs.existsSync(path.join(projectRoot, '.project', 'settings.json'))) {
    buildArgs.multiplayer = { enabled: false };
  }

  return buildArgs;
}

function mergeStringEnv(
  ...sources: Array<NodeJS.ProcessEnv | Record<string, string> | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
  }
  return result;
}

function formatRemoteToolResult(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return String(result);
  }

  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  if (!Array.isArray(content)) {
    return JSON.stringify(result, null, 2);
  }

  return content
    .map((item) => {
      if (item.type === 'text' && typeof item.text === 'string') {
        return item.text;
      }
      return JSON.stringify(item);
    })
    .join('\n');
}

export function formatBuildResult(
  result: BuildCurrentDirectoryResult,
  progressSummary: ToolProgressSummary
): string {
  if (result.mode === 'remote_build_failed') {
    return [
      '✗ Remote Maker build failed',
      '',
      `- project_root: ${result.projectRoot}`,
      `- project_id: ${result.projectId}`,
      `- maker_url: ${
        result.buildResult.makerUrl ||
        formatMakerAppWebUrl(result.buildResult.projectId, result.buildResult.env)
      }`,
      `- project_path: ${result.buildResult.projectPath}`,
      `- server_url: ${result.buildResult.serverUrl}`,
      `- env: ${result.buildResult.env}`,
      `- timeout_ms: ${result.buildResult.timeoutMs}`,
      `- build_args: ${JSON.stringify(result.buildResult.buildArgs)}`,
      ...formatProgressSummary(progressSummary),
      '',
      ...formatMakerBuildFailureLines(result.buildFailure),
      '',
      'remote_result:',
      indent(result.buildResult.resultText),
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (result.mode === 'submit_failed_before_build') {
    return [
      result.submitResult.pushed
        ? '✓ Maker project submitted; remote build was not started'
        : result.submitResult.status === 'clean'
          ? 'Maker project has no changes to submit; remote build was not started'
          : '✗ Maker project submit failed; remote build was not started',
      '',
      `- project_root: ${result.projectRoot}`,
      `- project_id: ${result.projectId}`,
      `- branch: ${result.submitResult.branch}`,
      `- status: ${result.submitResult.status}`,
      `- committed: ${result.submitResult.committed ? 'yes' : 'no'}`,
      result.submitResult.commitHash ? `- commit_hash: ${result.submitResult.commitHash}` : '',
      result.submitResult.message ? `- commit_message: ${result.submitResult.message}` : '',
      result.submitResult.ahead ? `- git_state: ${result.submitResult.ahead}` : '',
      result.submitResult.transientRetries
        ? `- transient_git_retries: ${result.submitResult.transientRetries}`
        : '',
      ...formatProgressSummary(progressSummary),
      '',
      'note: Maker build was not started because submit did not produce a pushed state.',
      ...(result.submitResult.failure
        ? [
            '',
            ...formatPushRecoveryLines(result.submitResult),
            '',
            ...formatMakerFailureLines(result.submitResult.failure),
          ]
        : []),
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (result.mode === 'build_failed_after_submit') {
    return [
      '✗ Maker project submitted, but remote Maker build failed',
      '',
      `- project_root: ${result.projectRoot}`,
      `- project_id: ${result.projectId}`,
      `- branch: ${result.submitResult.branch}`,
      `- status: ${result.submitResult.status}`,
      `- committed: ${result.submitResult.committed ? 'yes' : 'no'}`,
      result.submitResult.commitHash ? `- commit_hash: ${result.submitResult.commitHash}` : '',
      result.submitResult.message ? `- commit_message: ${result.submitResult.message}` : '',
      result.submitResult.ahead ? `- git_state: ${result.submitResult.ahead}` : '',
      result.submitResult.transientRetries
        ? `- transient_git_retries: ${result.submitResult.transientRetries}`
        : '',
      ...formatProgressSummary(progressSummary),
      '',
      ...formatMakerBuildFailureLines(result.buildFailure),
    ]
      .filter(Boolean)
      .join('\n');
  }

  const submitLines = result.submitResult
    ? [
        'submit_result:',
        `  - branch: ${result.submitResult.branch}`,
        `  - status: ${result.submitResult.status}`,
        `  - committed: ${result.submitResult.committed ? 'yes' : 'no'}`,
        result.submitResult.commitHash ? `  - commit_hash: ${result.submitResult.commitHash}` : '',
        result.submitResult.message ? `  - commit_message: ${result.submitResult.message}` : '',
        result.submitResult.ahead ? `  - git_state: ${result.submitResult.ahead}` : '',
        result.submitResult.transientRetries
          ? `  - transient_git_retries: ${result.submitResult.transientRetries}`
          : '',
        '',
      ].filter(Boolean)
    : [];

  const lines = [
    result.submitResult
      ? '✓ Maker project submitted, then remote Maker build finished'
      : '✓ Remote Maker build finished',
    '',
    `- project_root: ${result.projectRoot}`,
    `- project_id: ${result.projectId}`,
    `- maker_url: ${result.makerUrl || formatMakerAppWebUrl(result.projectId, result.env)}`,
    `- project_path: ${result.projectPath}`,
    `- server_url: ${result.serverUrl}`,
    `- env: ${result.env}`,
  ];
  lines.push(
    `- timeout_ms: ${result.timeoutMs}`,
    `- build_args: ${JSON.stringify(result.buildArgs)}`,
    ...formatPreviewRefreshLines(result.previewRefresh),
    ...formatProgressSummary(progressSummary),
    '',
    ...formatRuntimeLogWatchNextActionLines(result),
    ''
  );
  if (submitLines.length > 0) {
    lines.push(...submitLines);
  }
  lines.push('remote_result:', indent(result.resultText));
  return lines.join('\n');
}

export function formatPushResult(
  targetDir: string,
  result: PushThenBuildCurrentDirectoryResult,
  progressSummary: ToolProgressSummary
): string {
  const submitResult = result.submitResult;
  const lines = [
    result.buildResult
      ? '✓ Maker project pushed, then remote Maker build finished'
      : submitResult.pushed
        ? '✗ Maker project pushed, but remote build result is missing'
        : submitResult.status === 'clean'
          ? 'Maker project has no changes to push'
          : '✗ Maker project push failed',
    '',
    `- target_dir: ${targetDir}`,
    `- branch: ${submitResult.branch}`,
    `- status: ${submitResult.status}`,
    `- committed: ${submitResult.committed ? 'yes' : 'no'}`,
    submitResult.commitHash ? `- commit_hash: ${submitResult.commitHash}` : '',
    submitResult.message ? `- commit_message: ${submitResult.message}` : '',
    submitResult.ahead ? `- git_state: ${submitResult.ahead}` : '',
    submitResult.transientRetries
      ? `- transient_git_retries: ${submitResult.transientRetries}`
      : '',
    ...formatProgressSummary(progressSummary),
  ].filter(Boolean);

  if (result.buildResult) {
    return [
      ...lines,
      '',
      'remote_build:',
      indent(
        [
          `- project_id: ${result.buildResult.projectId}`,
          `- maker_url: ${
            result.buildResult.makerUrl ||
            formatMakerAppWebUrl(result.buildResult.projectId, result.buildResult.env)
          }`,
          `- project_path: ${result.buildResult.projectPath}`,
          `- server_url: ${result.buildResult.serverUrl}`,
          `- env: ${result.buildResult.env}`,
          `- timeout_ms: ${result.buildResult.timeoutMs}`,
          `- build_args: ${JSON.stringify(result.buildResult.buildArgs)}`,
          ...formatPreviewRefreshLines(result.buildResult.previewRefresh),
          '',
          'remote_result:',
          indent(result.buildResult.resultText),
        ].join('\n')
      ),
    ].join('\n');
  }

  if (result.buildFailure) {
    return [
      ...lines,
      '',
      'note: Maker project was pushed successfully, but remote build failed.',
      '',
      ...formatMakerBuildFailureLines(result.buildFailure),
    ].join('\n');
  }

  if (!submitResult.failure) {
    return [
      ...lines,
      '',
      submitResult.pushed
        ? 'note: This is an internal contract error: pushed=true requires remote_build or build_failure.'
        : 'note: Maker build was not started because no push was performed.',
    ].join('\n');
  }

  return [
    ...lines,
    '',
    ...formatPushRecoveryLines(submitResult),
    '',
    ...formatMakerFailureLines(submitResult.failure),
  ]
    .filter(Boolean)
    .join('\n');
}

function formatPreviewRefreshLines(result?: PreviewRefreshResult): string[] {
  if (!result) {
    return ['- preview_refresh: (not attempted)'];
  }

  return [
    `- preview_refresh: ${result.ok ? 'ok' : 'failed'}`,
    `- preview_refresh_status: ${result.status}`,
    result.url ? `- preview_refresh_url: ${result.url}` : '',
    result.error ? `- preview_refresh_error: ${result.error}` : '',
  ].filter(Boolean);
}

function formatRuntimeLogWatchNextActionLines(result: RemoteBuildResult): string[] {
  const command = formatLocalShellCommand([
    'taptap-maker',
    'logs',
    'watch',
    '--target-dir',
    result.projectRoot,
    '--reset',
    '--interval',
    '5s',
  ]);
  return [
    'runtime_logs:',
    result.runtimeLogWatch
      ? `- watch_started: ${result.runtimeLogWatch.started ? 'yes' : 'no'}`
      : '- watch_started: (not attempted)',
    result.runtimeLogWatch?.pid ? `- watch_pid: ${result.runtimeLogWatch.pid}` : '',
    `- watch_command: ${command}`,
    result.runtimeLogWatch?.command
      ? `- actual_watch_command: ${result.runtimeLogWatch.command}`
      : '',
    `- local_file: ${path.join(result.projectRoot, '.maker', 'logs', 'runtime', 'runtime.log')}`,
    result.runtimeLogWatch?.stdoutLog
      ? `- watcher_stdout: ${result.runtimeLogWatch.stdoutLog}`
      : '',
    result.runtimeLogWatch?.stderrLog
      ? `- watcher_stderr: ${result.runtimeLogWatch.stderrLog}`
      : '',
    result.runtimeLogWatch?.pidFile ? `- watcher_pid_file: ${result.runtimeLogWatch.pidFile}` : '',
    `- state_file: ${path.join(result.projectRoot, '.maker', 'logs', 'runtime', 'state.json')}`,
    result.runtimeLogWatch?.previousPid
      ? `- previous_watch_pid: ${result.runtimeLogWatch.previousPid}`
      : '',
    result.runtimeLogWatch?.previousStopped !== undefined
      ? `- previous_watch_stopped: ${result.runtimeLogWatch.previousStopped ? 'yes' : 'no'}`
      : '',
    result.runtimeLogWatch?.previousStopError
      ? `- previous_watch_stop_error: ${result.runtimeLogWatch.previousStopError}`
      : '',
    result.runtimeLogWatch?.error ? `- watch_error: ${result.runtimeLogWatch.error}` : '',
    result.runtimeLogWatch?.started
      ? '- note: 构建成功后已启动本地 CLI watcher，正在清理历史日志并每 5 秒持续追加 Lua 运行日志。'
      : '- note: 构建成功后应由本地 CLI watcher 清理历史日志，并每 5 秒持续追加 Lua 运行日志。',
    '- next_action: 如需分析游戏运行结果或报错，请读取 runtime_logs.local_file；如需判断 watcher 是否正常，请读取 runtime_logs.state_file。',
  ].filter(Boolean);
}

function formatLocalShellCommand(parts: string[]): string {
  return parts
    .map((part) => (/\s/.test(part) ? `"${part.replace(/(["\\$`])/g, '\\$1')}"` : part))
    .join(' ');
}

function formatPushRecoveryLines(submitResult: PushMakerProjectResult): string[] {
  if (submitResult.pushed || submitResult.status !== 'failed_after_commit') {
    return [];
  }

  return [
    'push_recovery:',
    '- committed_but_unpushed: yes',
    submitResult.commitHash ? `- local_commit: ${submitResult.commitHash}` : '',
    submitResult.ahead ? `- git_state: ${submitResult.ahead}` : '',
    '- retry_tool: maker_build_current_directory',
    '- do_not_use_generic_git_push: yes',
    `- user_message: ${pushRecoveryUserMessage(submitResult.failure)}`,
  ].filter(Boolean);
}

function pushRecoveryUserMessage(failure?: MakerGitFailure): string {
  switch (failure?.classification) {
    case 'branch_not_allowed':
      return '本地提交已经保留，但 Maker 远端只接受 main 分支；请切回 main 并把本地提交迁移到 main 后，再重试 Maker 提交/构建工具。';
    case 'forbidden_path':
      return '本地提交已经保留，但包含 Maker 远端禁止提交的路径或目录；请按 failure.stderr 中的 forbidden pattern 从未推送 commit 中移除这些路径，再重试 Maker 提交/构建工具。';
    case 'remote_transient':
      return '本地提交已经保留，但还没推送到 Maker 远端；远端临时异常恢复后，直接重试 Maker 提交/构建工具即可。';
    default:
      return '本地提交已经保留，但还没推送到 Maker 远端；请先按 failure.next_action 修复原因，再重试 Maker 提交/构建工具。';
  }
}

function formatMakerBuildFailureLines(failure: MakerBuildFailure): string[] {
  return [
    'build_failure:',
    `- error_name: ${failure.name}`,
    `- message: ${failure.message}`,
    failure.stack ? `- stack:\n${indent(failure.stack)}` : '',
  ].filter(Boolean);
}

function formatMakerFailureLines(failure: MakerGitFailure): string[] {
  return [
    'failure:',
    `- stage: ${failure.stage}`,
    `- classification: ${failure.classification}`,
    `- retryable: ${failure.retryable ? 'yes' : 'no'}`,
    failure.retryReason ? `- retry_reason: ${failure.retryReason}` : '',
    failure.retryAttempts ? `- retry_attempts: ${failure.retryAttempts}` : '',
    `- exit_code: ${failure.exitCode ?? '(none)'}`,
    failure.command ? `- command: ${failure.command}` : '',
    failure.stderr ? `- stderr:\n${indent(failure.stderr)}` : '',
    failure.stdout ? `- stdout:\n${indent(failure.stdout)}` : '',
    `- next_action: ${failure.nextAction}`,
  ].filter(Boolean);
}

function formatToolException(toolName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  if (error instanceof MakerGitNotFoundError) {
    return [
      '✗ Maker MCP tool stopped',
      '',
      `- tool: ${toolName}`,
      '- reason: git_missing',
      '',
      message,
      '',
      'next_action: 请只引导用户安装 Git；在 `git --version` 可用之前，不要继续调用 clone、fetch、commit 或 push。',
    ].join('\n');
  }

  if (error instanceof MakerCloneFailedError) {
    const original = error.originalError;
    const originalStack = original instanceof Error ? original.stack : undefined;
    return [
      '✗ Maker MCP tool failed',
      '',
      `- tool: ${toolName}`,
      `- error_name: ${original instanceof Error ? original.name : typeof original}`,
      `- message: ${message}`,
      '',
      ...formatClonePartialStateLines(error.targetDir),
      '',
      'debug:',
      originalStack ? indent(originalStack) : indent(message),
      '',
      'next_action: 请根据 partial_state 判断是否直接重试；不要删除用户文件。若用户不懂目录状态，优先建议新建独立目录重新 clone。',
    ].join('\n');
  }

  return [
    '✗ Maker MCP tool failed',
    '',
    `- tool: ${toolName}`,
    `- error_name: ${error instanceof Error ? error.name : typeof error}`,
    `- message: ${message}`,
    '',
    'debug:',
    stack ? indent(stack) : indent(message),
    '',
    'next_action: 请把上面的完整错误反馈给开发者；如果本地已有 commit 但 push 未完成，不要重复 commit，直接重试 maker_build_current_directory。',
  ].join('\n');
}

function indent(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
