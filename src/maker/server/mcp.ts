/**
 * taptap-maker MCP server mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  ProgressToken,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { identifyMakerProject, formatIdentifyHint } from './identify.js';
import {
  getPatPath,
  getTapAuthPath,
  loadProjectConfig,
  loadJwt,
  loadPat,
  loadTapAuth,
  saveProjectConfig,
} from '../storage.js';
import {
  cloneMakerProject,
  listMakerProjects,
  pushMakerProject,
  readMakerProjectLocalChanges,
  type PushMakerProjectOptions,
  type PushMakerProjectResult,
  type MakerProjectProgress,
  type MakerProjectProgressHandler,
} from '../cli/projects.js';
import { requestTapAuthWithPat } from '../auth/patTap.js';
import { saveManualMakerPat } from '../git/pat.js';
import {
  getMakerEndpoints,
  getMakerEnvironment,
  TEMP_MAKER_PAT_TOKENS_URL,
  requireMakerEndpoint,
} from '../config.js';
import { getUserIdFromMakerJwt } from '../auth/jwt.js';
import {
  MakerGitNotFoundError,
  checkGitEnvironment,
  formatGitEnvironmentStatus,
} from '../system/git.js';
import { formatMakerSkillStatus } from '../cli/skill.js';
import { installAiDevKit } from '../cli/devKit.js';

declare const __MAKER_VERSION__: string | undefined;
declare const __MAKER_BUNDLE_URL__: string | undefined;
const VERSION = typeof __MAKER_VERSION__ !== 'undefined' ? __MAKER_VERSION__ : 'dev';
const DEFAULT_PROXY_MCP_NAME = 'taptap-proxy';
const DEFAULT_PROXY_PACKAGE = '@taptap/instant-games-open-mcp@1.22.0';
const DEFAULT_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const LONG_OPERATION_HEARTBEAT_MS = 3 * 60 * 1000;

export const tools = [
  {
    name: 'maker_exchange_pat',
    description:
      'Save a Maker PAT for local Maker API, Git, and TapTap token operations. After saving PAT, this tool fetches TapTap token and lists available Maker apps.',
    inputSchema: {
      type: 'object',
      properties: {
        manual_pat: {
          type: 'string',
          description:
            'Maker PAT provided by the user. It will be saved for later Maker API and git operations.',
        },
      },
      required: ['manual_pat'],
    },
  },
  {
    name: 'maker_list_apps',
    description:
      'List Maker apps available to the cached or provided Maker PAT. Use this to obtain app_id values for Maker project clone.',
    inputSchema: {
      type: 'object',
      properties: {
        pat: {
          type: 'string',
          description:
            'Optional Maker PAT override. If provided, it is saved for later Maker operations.',
        },
      },
    },
  },
  {
    name: 'maker_status',
    description:
      'Show local Maker MCP status: Git availability, PAT/TapTap token status, project binding, bundled skill document paths, validation checklist, and available apps when PAT exists.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'maker_clone_to_current_directory',
    description:
      'Clone a selected Maker app repository into the current agent working directory and write .maker-mcp/config.json. Requires Git and a concrete app_id. Before clone, the tool prepares the local AI dev kit automatically, skips dev-kit scripts, deletes the downloaded zip, and stages dev-kit ignore rules for merge after checkout. The tool checks local file conflicts before checkout and keeps non-conflicting local files.',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: {
          type: 'string',
          description: 'Maker APP_ID to clone from fuping git.',
        },
        target_dir: {
          type: 'string',
          description:
            'Optional target directory. Defaults to the MCP process cwd, which should be the current Codex conversation directory.',
        },
        pat: {
          type: 'string',
          description:
            'Optional Maker PAT override. If provided, it is saved and used for git authentication.',
        },
        user_id: {
          type: 'string',
          description:
            'Optional Maker user_id from maker_list_apps output. If omitted, the tool will try to resolve it from the app list.',
        },
      },
      required: ['app_id'],
    },
  },
  {
    name: 'maker_submit_current_directory',
    description:
      'Commit, push, and build current Maker project directory changes. Requires local Git. If Git is missing, stop and show install guidance; do not stage, commit, push, or build. Use this in Maker projects when the user says "帮我提交", "帮我提交代码", "提交", "提交代码", "提交并推送", "push", "帮我提交代码到maker", "帮我提交代码到taptap制造", "帮我提交代码到tap制造", or "帮我提交代码到tap". Maker submit means commit + push + build: after a successful push, this tool MUST run the remote Maker build and return the build result. If the remote build fails after push, return build_failure details together with the successful submit result. For build requests that stop on local changes, continue through maker_build_current_directory with submit_local_changes_before_build=true and remember_build_submit_preference=true so the build workflow can save the auto-submit preference and return the build result. This submit tool bypasses local generic Git branch/task-id rules and pushes directly to the Maker remote configured for the current directory.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description:
            'Optional commit message. If omitted, Maker MCP generates a simple message from changed files.',
        },
        target_dir: {
          type: 'string',
          description:
            'Optional target directory. Defaults to the MCP process cwd, which should be the current Codex conversation directory.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional files to stage. Defaults to all changes.',
        },
      },
    },
  },
  {
    name: 'maker_build_current_directory',
    description:
      'Build the current Maker game by forwarding to the remote TapTap Maker MCP build tool. MUST use this for user requests like "构建", "build", "重新构建游戏", "帮我构建maker游戏", "compile", or "run" in a Maker project. The tool itself enforces a local-change guard before remote build: if local Maker project changes exist, it will stop unless confirm_remote_build_without_submit is true, submit_local_changes_before_build is true, or the project has saved build_local_changes_policy=auto_submit. Explain to the user that direct build only uses the Maker remote committed version and may not include local edits. The primary option should be "提交本地改动并触发构建（以后都是如此）"; if the user chooses it, call maker_build_current_directory again with submit_local_changes_before_build=true and remember_build_submit_preference=true. Maker MCP will commit + push local changes, then run remote build and return the build result. If auto_submit preference is already saved, this build tool will submit local changes automatically and then run remote build. If the user explicitly says not to submit and wants to build the remote version, call this tool with confirm_remote_build_without_submit=true. Do not write local build scripts. Uses saved Tap auth and current .maker-mcp/config.json project binding to call the remote build tool through taptap-proxy.',
    inputSchema: {
      type: 'object',
      properties: {
        target_dir: {
          type: 'string',
          description:
            'Optional Maker project directory. Defaults to the MCP process cwd, which should be the current conversation directory.',
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
        confirm_remote_build_without_submit: {
          type: 'boolean',
          description:
            'Set true only after the user explicitly confirms they do not want to submit local changes and want to build the current Maker remote committed version.',
        },
        submit_local_changes_before_build: {
          type: 'boolean',
          description:
            'Set true only after the user explicitly chooses "提交本地改动并触发构建（以后都是如此）". Maker MCP will commit + push local changes, then run the remote build and return the build result.',
        },
        remember_build_submit_preference: {
          type: 'boolean',
          description:
            'Set true together with submit_local_changes_before_build when the user chooses "提交本地改动并触发构建（以后都是如此）". Saves build_local_changes_policy=auto_submit for future build requests.',
        },
      },
    },
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
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const name = request.params.name;

    try {
      if (name === 'maker_status') {
        return {
          content: [
            {
              type: 'text',
              text: await formatStatus(),
            },
          ],
        };
      }

      if (name === 'maker_exchange_pat') {
        const args = (request.params.arguments || {}) as {
          manual_pat?: string;
        };
        if (!args.manual_pat) {
          throw new McpError(ErrorCode.InvalidParams, 'manual_pat is required');
        }

        const pat = saveManualMakerPat(args.manual_pat);
        let tapAuthText: string;
        try {
          const tapAuth = await requestTapAuthWithPat(args.manual_pat);
          tapAuthText = [
            'TapTap token 已通过 PAT 获取并保存。',
            `- kid: ${mask(tapAuth.kid)}`,
            `- token_type: ${tapAuth.token_type}`,
            `- saved: ${getTapAuthPath()}`,
          ].join('\n');
        } catch (error) {
          tapAuthText = [
            'TapTap token 自动获取失败。',
            `原因：${error instanceof Error ? error.message : String(error)}`,
            '远端 Maker MCP tools 需要 TapTap token；请确认 PAT 是否有效后重新调用 maker_exchange_pat。',
          ].join('\n');
        }

        let nextText: string;
        try {
          const projects = await listMakerProjects({ pat: args.manual_pat });
          nextText = ['已自动列出可用 Maker Apps：', '', formatProjectList(projects)].join('\n');
        } catch (error) {
          nextText = [
            '自动列出 Maker Apps 失败。',
            `原因：${error instanceof Error ? error.message : String(error)}`,
            '请确认 PAT 是否有效，然后重新调用 maker_list_apps。',
          ].join('\n');
        }

        return {
          content: [
            {
              type: 'text',
              text: [
                '✓ Maker PAT ready',
                '',
                `- pat: ${mask(pat.token)}`,
                `- saved: ${getPatPath()}`,
                '',
                tapAuthText,
                '',
                nextText,
              ].join('\n'),
            },
          ],
        };
      }

      if (name === 'maker_list_apps') {
        const args = (request.params.arguments || {}) as {
          pat?: string;
        };
        const projects = await listMakerProjects({
          pat: args.pat,
        });
        return {
          content: [
            {
              type: 'text',
              text: formatProjectList(projects),
            },
          ],
        };
      }

      if (name === 'maker_clone_to_current_directory') {
        const args = (request.params.arguments || {}) as {
          app_id?: string;
          target_dir?: string;
          pat?: string;
          user_id?: string;
        };

        if (!args.app_id) {
          throw new McpError(ErrorCode.InvalidParams, 'app_id is required');
        }

        const targetDir = args.target_dir || process.cwd();
        const progressReporter = createToolProgressReporter(
          request.params._meta?.progressToken,
          extra,
          'Maker clone'
        );
        let result: Awaited<ReturnType<typeof cloneMakerProject>>;
        let devKitResult: Awaited<ReturnType<typeof installAiDevKit>>;
        let progressSummary: ToolProgressSummary;
        try {
          progressReporter.report({
            progress: 1,
            total: 100,
            phase: 'dev_kit',
            message: 'Preparing local AI dev kit before Maker clone',
          });
          devKitResult = await installAiDevKit({
            targetDir,
          });
          progressReporter.report({
            progress: 5,
            total: 100,
            phase: 'dev_kit',
            message: 'Local AI dev kit prepared',
          });
          result = await cloneMakerProject({
            appId: args.app_id,
            targetDir,
            pat: args.pat,
            userId: args.user_id,
            sceEndpoint: process.env.SCE_MCP_URL,
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
              text: [
                '✓ Maker project cloned',
                '',
                ...formatCloneWarnings(result.warnings),
                `- app_id: ${args.app_id}`,
                `- target_dir: ${result.targetDir}`,
                `- status: ${result.status}`,
                `- retried_with_new_pat: ${result.retriedWithNewPat ? 'yes' : 'no'}`,
                '- ai_dev_kit: prepared',
                `- ai_dev_kit_installed_entries: ${devKitResult.installedEntries.join(', ') || '(none)'}`,
                `- ai_dev_kit_skipped_entries: ${devKitResult.skippedEntries.join(', ') || '(none)'}`,
                ...formatProgressSummary(progressSummary),
                '- project config: .maker-mcp/config.json',
              ].join('\n'),
            },
          ],
        };
      }

      if (name === 'maker_submit_current_directory') {
        const args = (request.params.arguments || {}) as {
          message?: string;
          target_dir?: string;
          files?: string[];
        };

        const targetDir = args.target_dir || process.cwd();
        const progressReporter = createToolProgressReporter(
          request.params._meta?.progressToken,
          extra,
          'Maker submit'
        );
        let result: Awaited<ReturnType<typeof pushThenBuildCurrentDirectory>>;
        let progressSummary: ToolProgressSummary;
        try {
          result = await pushThenBuildCurrentDirectory({
            targetDir,
            message: args.message,
            files: args.files,
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
              text: formatPushResult(targetDir, result, progressSummary),
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
          confirm_remote_build_without_submit?: boolean;
          submit_local_changes_before_build?: boolean;
          remember_build_submit_preference?: boolean;
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
            targetDir: args.target_dir || process.cwd(),
            entry: args.entry,
            scriptsPath: args.scriptsPath,
            entryClient: args.entry_client,
            entryServer: args.entry_server,
            multiplayer: args.multiplayer,
            serverUrl: args.server_url,
            env: args.env,
            timeoutMs: args.timeout_ms,
            confirmRemoteBuildWithoutSubmit: args.confirm_remote_build_without_submit,
            submitLocalChangesBeforeBuild: args.submit_local_changes_before_build,
            rememberBuildSubmitPreference: args.remember_build_submit_preference,
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

async function formatStatus(): Promise<string> {
  const identify = identifyMakerProject();
  const pat = loadPat();
  let tapAuth = loadTapAuth();
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
        '当前目录已绑定 Maker 项目。',
        '本地 Maker 工作流请优先参考 taptap-maker-local skill；MCP tools 只负责保存 PAT、列 app、clone、submit 和 build 等机器动作。',
      ].join('\n')
    : pat
      ? await formatAutoProjectListFromPat()
      : formatIdentifyHint();

  return [
    'TapTap Maker MCP status',
    '',
    `- version: ${VERSION}`,
    `- tap_auth: ${tapAuth ? 'found' : 'missing'} (${getTapAuthPath()})`,
    `- pat: ${pat ? 'found' : 'missing'} (${getPatPath()})`,
    `- project_source: ${identify.source}`,
    `- project_id: ${identify.projectId || '(none)'}`,
    identify.configPath ? `- config: ${identify.configPath}` : '',
    identify.config?.sce_endpoint ? `- sce_endpoint: ${identify.config.sce_endpoint}` : '',
    '',
    'Local prerequisites',
    '',
    formatGitEnvironmentStatus(git),
    '',
    pat
      ? ''
      : ['Auth next step', '', `Maker PAT 缺失。PAT 页面：${TEMP_MAKER_PAT_TOKENS_URL}`].join('\n'),
    '',
    tapAuthRefreshText,
    '',
    formatMakerSkillStatus({ projectRoot: identify.projectRoot || process.cwd() }),
    '',
    projectSection,
  ]
    .filter(Boolean)
    .join('\n');
}

function rememberBuildSubmitPreference(targetDir: string): void {
  const identify = identifyMakerProject({ cwd: targetDir });
  if (!identify.projectRoot || !identify.projectId) {
    throw new Error(
      `${targetDir} is not bound to a Maker project. Cannot save build submit preference.`
    );
  }

  saveProjectConfig(identify.projectRoot, {
    ...(identify.config || { project_id: identify.projectId }),
    project_id: identify.projectId,
    build_local_changes_policy: 'auto_submit',
  });
}

async function formatAutoProjectListFromPat(): Promise<string> {
  try {
    const projects = await listMakerProjects();
    return [
      '本地已有 Maker PAT，当前目录尚未绑定 Maker 项目。',
      '已自动列出可用 Maker Apps。选择、解释和 clone 顺序请参考 taptap-maker-local skill。',
      '',
      formatProjectList(projects),
    ].join('\n');
  } catch (error) {
    return [
      '本地已有 Maker PAT，但自动列出 Maker Apps 失败。',
      `原因：${error instanceof Error ? error.message : String(error)}`,
      `如果 PAT 已失效，请使用新的 Maker PAT 重新调用 maker_exchange_pat。PAT 页面：${TEMP_MAKER_PAT_TOKENS_URL}`,
    ].join('\n');
  }
}

function mask(value: string): string {
  if (value.length <= 12) {
    return '***';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatProjectList(
  projects: Array<{
    id: string;
    name?: string;
    user_id?: string;
    createdAt?: string;
    lastConversationAt?: string;
    gameType?: string;
    stage?: string;
  }>
): string {
  if (projects.length === 0) {
    return [
      'No Maker apps found.',
      '',
      '请确认 Maker PAT 是否有效，或等待 Maker app list 接口对齐。',
    ].join('\n');
  }

  return [
    'Maker apps',
    '',
    ...projects.map(
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
    '请让用户选择一个 app，然后调用 maker_clone_to_current_directory。',
  ].join('\n');
}

function formatCloneWarnings(warnings: string[]): string[] {
  if (warnings.length === 0) {
    return [
      'Pre-clone local directory check',
      '',
      '- result: checked',
      '- local_files: none found before clone, ignoring dot-prefixed local config entries',
      '',
    ];
  }

  return [
    'Pre-clone local directory check',
    '',
    '- result: found local files before clone',
    '- action: kept local files and continued unless they conflicted with Maker project files',
    '',
    ...warnings.map((warning) => `- ${warning}`),
    '',
  ];
}

function createRemoteProxyContext(options: {
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
      `${options.targetDir} is not bound to a Maker project. Run maker_clone_to_current_directory first.`
    );
  }

  const projectConfig = loadProjectConfig(identify.projectRoot);
  const projectId = projectConfig?.project_id || identify.projectId;
  const tapAuth = loadTapAuth();
  if (!tapAuth) {
    throw new Error('Tap auth not found. Run maker_exchange_pat with a valid Maker PAT first.');
  }

  let userId = projectConfig?.user_id;
  if (!userId) {
    const jwt = loadJwt();
    userId = jwt ? getUserIdFromMakerJwt(jwt) : undefined;
  }
  if (!userId) {
    throw new Error(
      'Cannot resolve user_id. Re-run maker_list_apps and maker_clone_to_current_directory with PAT so the project config can cache user_id.'
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

type BuildCurrentDirectoryResult =
  | {
      mode: 'remote_build';
      projectRoot: string;
      projectId: string;
      projectPath: string;
      serverUrl: string;
      env: string;
      timeoutMs: number;
      buildArgs: Record<string, unknown>;
      resultText: string;
      submitResult?: PushMakerProjectResult;
      buildLocalChangesPolicy?: 'auto_submit';
    }
  | {
      mode: 'submit_failed_before_build';
      projectRoot: string;
      projectId: string;
      submitResult: PushMakerProjectResult;
      buildLocalChangesPolicy?: 'auto_submit';
    }
  | {
      mode: 'build_failed_after_submit';
      projectRoot: string;
      projectId: string;
      submitResult: PushMakerProjectResult;
      buildFailure: MakerBuildFailure;
      buildLocalChangesPolicy?: 'auto_submit';
    };

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
  confirmRemoteBuildWithoutSubmit?: boolean;
  submitLocalChangesBeforeBuild?: boolean;
  rememberBuildSubmitPreference?: boolean;
  submitLocalChanges?: SubmitLocalChangesForBuild;
  callRemoteBuild?: (targetDir: string) => Promise<RemoteBuildResult>;
  onProgress?: MakerProjectProgressHandler;
}): Promise<BuildCurrentDirectoryResult> {
  const localChanges = await readMakerProjectLocalChanges(options.targetDir);
  if (localChanges.hasChanges && !options.confirmRemoteBuildWithoutSubmit) {
    const config = loadProjectConfig(localChanges.projectRoot);
    let buildLocalChangesPolicy: 'auto_submit' | undefined =
      config?.build_local_changes_policy === 'auto_submit' ? 'auto_submit' : undefined;
    if (
      config?.build_local_changes_policy === 'auto_submit' ||
      options.submitLocalChangesBeforeBuild
    ) {
      options.onProgress?.({
        progress: 0,
        total: 100,
        phase: 'auto_submit',
        message: 'Auto-submitting local Maker changes before build',
      });
      const submitResult = await (options.submitLocalChanges || pushMakerProject)({
        cwd: localChanges.projectRoot,
        onProgress: options.onProgress,
      });
      if (options.rememberBuildSubmitPreference && !submitResult.failure) {
        rememberBuildSubmitPreference(localChanges.projectRoot);
        buildLocalChangesPolicy = 'auto_submit';
      }
      if (submitResult.failure || (!submitResult.pushed && submitResult.status !== 'clean')) {
        return {
          mode: 'submit_failed_before_build',
          projectRoot: localChanges.projectRoot,
          projectId: config?.project_id || 'unknown',
          submitResult,
          buildLocalChangesPolicy,
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
          buildLocalChangesPolicy,
        };
      }
      return {
        ...buildResult,
        submitResult,
        buildLocalChangesPolicy,
      };
    }

    throw new Error(formatLocalChangesBeforeBuildMessage(localChanges.files));
  }

  return runRemoteBuildCurrentDirectory(options, options.targetDir);
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
    onProgress?: MakerProjectProgressHandler;
  },
  targetDir: string
): Promise<RemoteBuildResult> {
  if (options.callRemoteBuild) {
    return options.callRemoteBuild(targetDir);
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

    return {
      mode: 'remote_build',
      projectRoot: proxy.projectRoot,
      projectId: proxy.projectId,
      projectPath: proxy.projectPath,
      serverUrl: proxy.serverUrl,
      env: proxy.env,
      timeoutMs,
      buildArgs,
      resultText: formatRemoteToolResult(result),
    };
  } finally {
    await client.close();
  }
}

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

function formatLocalChangesBeforeBuildMessage(files: string[]): string {
  const visibleFiles = files.slice(0, 20);
  const hiddenCount = Math.max(0, files.length - visibleFiles.length);
  return [
    'Current Maker project has local changes that are not submitted.',
    '',
    '当前有本地修改还没有提交。直接构建只会构建 Maker 云端已有版本，可能看不到这些新修改。',
    '请先询问用户选择：',
    '- 提交本地改动并触发构建（以后都是如此）：再次调用 maker_build_current_directory，并设置 submit_local_changes_before_build=true 和 remember_build_submit_preference=true；工具会先 commit + push，再继续执行远端 build 并返回构建结果。后续构建遇到本地改动会默认自动提交并继续构建。',
    '- 如果用户明确说不提交、直接构建云端版本，再调用 maker_build_current_directory，并设置 confirm_remote_build_without_submit=true。',
    '',
    'local_changes:',
    ...visibleFiles.map((file) => `- ${file}`),
    ...(hiddenCount > 0 ? [`- ... and ${hiddenCount} more`] : []),
  ].join('\n');
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
      '- build_local_changes_policy: auto_submit',
      `- branch: ${result.submitResult.branch}`,
      `- status: ${result.submitResult.status}`,
      `- committed: ${result.submitResult.committed ? 'yes' : 'no'}`,
      result.submitResult.commitHash ? `- commit_hash: ${result.submitResult.commitHash}` : '',
      result.submitResult.message ? `- commit_message: ${result.submitResult.message}` : '',
      result.submitResult.ahead ? `- git_state: ${result.submitResult.ahead}` : '',
      ...formatProgressSummary(progressSummary),
      '',
      'note: Maker build was not started because submit did not produce a pushed state.',
      ...(result.submitResult.failure
        ? ['', ...formatMakerFailureLines(result.submitResult.failure)]
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
      result.buildLocalChangesPolicy
        ? `- build_local_changes_policy: ${result.buildLocalChangesPolicy}`
        : '',
      `- branch: ${result.submitResult.branch}`,
      `- status: ${result.submitResult.status}`,
      `- committed: ${result.submitResult.committed ? 'yes' : 'no'}`,
      result.submitResult.commitHash ? `- commit_hash: ${result.submitResult.commitHash}` : '',
      result.submitResult.message ? `- commit_message: ${result.submitResult.message}` : '',
      result.submitResult.ahead ? `- git_state: ${result.submitResult.ahead}` : '',
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
    `- project_path: ${result.projectPath}`,
    `- server_url: ${result.serverUrl}`,
    `- env: ${result.env}`,
  ];
  if (result.buildLocalChangesPolicy) {
    lines.push(`- build_local_changes_policy: ${result.buildLocalChangesPolicy}`);
  }
  lines.push(
    `- timeout_ms: ${result.timeoutMs}`,
    `- build_args: ${JSON.stringify(result.buildArgs)}`,
    ...formatProgressSummary(progressSummary),
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
          `- project_path: ${result.buildResult.projectPath}`,
          `- server_url: ${result.buildResult.serverUrl}`,
          `- env: ${result.buildResult.env}`,
          `- timeout_ms: ${result.buildResult.timeoutMs}`,
          `- build_args: ${JSON.stringify(result.buildResult.buildArgs)}`,
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

  return [...lines, '', ...formatMakerFailureLines(submitResult.failure)]
    .filter(Boolean)
    .join('\n');
}

function formatMakerBuildFailureLines(failure: MakerBuildFailure): string[] {
  return [
    'build_failure:',
    `- error_name: ${failure.name}`,
    `- message: ${failure.message}`,
    failure.stack ? `- stack:\n${indent(failure.stack)}` : '',
  ].filter(Boolean);
}

function formatMakerFailureLines(failure: {
  stage: string;
  command?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  classification: string;
  nextAction: string;
}): string[] {
  return [
    'failure:',
    `- stage: ${failure.stage}`,
    `- classification: ${failure.classification}`,
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
    'next_action: 请把上面的完整错误反馈给开发者；如果本地已有 commit 但 push 未完成，不要重复 commit，直接重试 maker_submit_current_directory。',
  ].join('\n');
}

function indent(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
