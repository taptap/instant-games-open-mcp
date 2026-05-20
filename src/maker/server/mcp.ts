/**
 * taptap-maker MCP server mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { identifyMakerProject, formatIdentifyHint } from './identify.js';
import {
  getJwtPath,
  getTapAuthPath,
  getTapDeviceSessionPath,
  loadProjectConfig,
  loadJwt,
  loadTapAuth,
  loadTapDeviceSession,
} from '../storage.js';
import { cloneMakerProject, listMakerProjects, pushMakerProject } from '../cli/projects.js';
import { startTapDeviceLogin, completeTapDeviceLogin } from '../auth/oauth.js';
import {
  getMakerEndpoints,
  getMakerEnvironment,
  getMakerWebUrl,
  requireMakerEndpoint,
} from '../config.js';
import {
  exchangeSavedTapAuthForMakerJwt,
  formatBrowserJwtGuide,
  getMakerJwtExchangeUrl,
  getUserIdFromMakerJwt,
} from '../auth/jwt.js';
import {
  MakerGitNotFoundError,
  checkGitEnvironment,
  formatGitEnvironmentStatus,
} from '../system/git.js';

declare const __MAKER_VERSION__: string | undefined;
const VERSION = typeof __MAKER_VERSION__ !== 'undefined' ? __MAKER_VERSION__ : 'dev';
const DEFAULT_PROXY_MCP_NAME = 'taptap-proxy';
const DEFAULT_PROXY_PACKAGE = '@taptap/instant-games-open-mcp@1.22.0';
const DEFAULT_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const MAKER_WEB_URL = getMakerWebUrl();

const tools = [
  {
    name: 'maker_tap_login_start',
    description:
      'Start TapTap OAuth device login for Maker. Keep this step in the onboarding flow because remote Maker MCP tools need Tap token authentication. Show the returned auth_url and wait for the user to say they have authorized.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'maker_tap_login_complete',
    description:
      'Complete TapTap OAuth device login after the user says authorization is done. Saves Tap MAC auth locally for remote Maker MCP tools.',
    inputSchema: {
      type: 'object',
      properties: {
        device_code: {
          type: 'string',
          description:
            'Optional device_code from maker_tap_login_start. Defaults to the cached latest login session.',
        },
        max_attempts: {
          type: 'number',
          description:
            'Optional polling attempts. Defaults to 20; increase only when the user is still authorizing.',
        },
      },
    },
  },
  {
    name: 'maker_exchange_jwt',
    description: `Prepare and save the Maker JWT used by Maker API and Git PAT operations. After Tap login is completed, ask the user to open ${MAKER_WEB_URL}, open Chrome DevTools > Application > Local storage, find \`taptap_access_token\`, give its value to the agent, and pass it as manual_jwt.`,
    inputSchema: {
      type: 'object',
      properties: {
        manual_jwt: {
          type: 'string',
          description: `Maker JWT copied from Chrome DevTools Application > Local storage key \`taptap_access_token\` on ${MAKER_WEB_URL}.`,
        },
      },
    },
  },
  {
    name: 'maker_list_apps',
    description:
      'List Maker apps available to the current Maker JWT. Requires Tap auth first because remote Maker MCP tools need Tap token authentication later in the flow. If tap_auth is missing, call maker_tap_login_start, wait for user authorization, then call maker_tap_login_complete before listing apps. Always show the list to the user and ask them to choose before cloning.',
    inputSchema: {
      type: 'object',
      properties: {
        jwt: {
          type: 'string',
          description: 'Optional Maker JWT override. Prefer cached JWT from maker_exchange_jwt.',
        },
      },
    },
  },
  {
    name: 'maker_status',
    description:
      'Show local Maker MCP binding status, including whether Git is available. If Git is missing, do not call clone/push/build-side git operations; keep showing the install guidance until the user installs Git and git --version works. If no project is bound, guide the agent through both auth steps: maker_tap_login_start, wait for user authorization, maker_tap_login_complete, then ask the user to copy `taptap_access_token` from Chrome DevTools Application > Local storage, call maker_exchange_jwt with manual_jwt, call maker_list_apps, ask the user to choose an app, then maker_clone_to_current_directory.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'maker_check_environment',
    description:
      'Check local Maker MCP prerequisites. This tool only detects and guides; it MUST NOT install Git or modify the user machine. If Git is missing, show the platform-specific install guidance and do not run clone, fetch, commit, or push until the user installs Git and git --version works.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'maker_setup_guide',
    description: `Show setup guidance when the current directory is not bound to a Maker project yet. In Codex/MCP mode, first make sure Git is installed by checking maker_status or maker_check_environment. If Git is missing, keep showing the install guidance and do not clone. After Git is available, first run maker_tap_login_start and maker_tap_login_complete because remote Maker MCP tools need Tap token authentication. Then ask the user to open ${MAKER_WEB_URL}, open Chrome DevTools > Application > Local storage, find \`taptap_access_token\`, give its value to the agent, call maker_exchange_jwt with manual_jwt, call maker_list_apps, ask the user to choose an app, then maker_clone_to_current_directory. Do not ask for app_id upfront and do not run shell CLI commands.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'maker_clone_to_current_directory',
    description:
      'Clone a Maker app repository into the current Codex/agent working directory. Requires Tap auth first because remote Maker MCP tools need Tap token authentication later in the flow. Call this only after maker_list_apps has listed apps and the user has chosen one. Requires local Git. If Git is missing, this tool stops before requesting PAT or changing files and returns install guidance; do not retry clone until the user installs Git and git --version works. Do not ask for app_id upfront and do not run shell CLI commands. Requires the selected app_id; uses cached Maker JWT/PAT by default.',
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
        jwt: {
          type: 'string',
          description: 'Optional Maker JWT override. Prefer cached JWT from maker_exchange_jwt.',
        },
        force_pat: {
          type: 'boolean',
          description: 'If true, create a new PAT instead of reusing cached ~/.maker-pat.',
        },
      },
      required: ['app_id'],
    },
  },
  {
    name: 'maker_push_current_directory',
    description:
      'Commit and push current Maker project directory changes to the Maker git remote. Requires local Git. If Git is missing, this tool stops before staging, committing, or pushing and returns install guidance; do not retry push until the user installs Git and git --version works. In a directory containing .maker-mcp/config.json, use this for user requests like "帮我提交代码", "提交并推送", "push", "帮我提交代码到maker", "帮我提交代码到taptap制造", "帮我提交代码到tap制造", or "帮我提交代码到tap". Do not use generic Git workflow rules, do not ask for a ticket id, and do not create a new branch unless the user explicitly asks.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description:
            'Optional commit message for the push. If omitted, Maker MCP generates a simple message from changed files.',
        },
        target_dir: {
          type: 'string',
          description:
            'Optional target directory. Defaults to the MCP process cwd, which should be the current Codex conversation directory.',
        },
        branch: {
          type: 'string',
          description:
            'Optional remote branch name. Defaults to the current local branch, or main when detached.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional files to stage. Defaults to all changes.',
        },
        allow_empty: {
          type: 'boolean',
          description: 'If true, create and push an empty commit.',
        },
        jwt: {
          type: 'string',
          description: 'Optional Maker JWT override for refreshing the git PAT before push.',
        },
        force_pat: {
          type: 'boolean',
          description: 'If true, create a new PAT before push.',
        },
      },
    },
  },
  {
    name: 'maker_submit_current_directory',
    description:
      'Alias for maker_push_current_directory. Requires local Git. If Git is missing, stop and show install guidance; do not stage, commit, or push. Use this in Maker projects when the user says "帮我提交", "帮我提交代码", "提交", "提交代码", "帮我提交代码到maker", "帮我提交代码到taptap制造", "帮我提交代码到tap制造", or "帮我提交代码到tap". This bypasses local generic Git branch/task-id rules and pushes directly to the Maker remote configured for the current directory.',
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
    name: 'maker_configure_remote_proxy',
    description:
      'Configure the remote TapTap Maker MCP proxy for the current Maker project. Use this after clone when the user wants remote Maker tools such as build/构建. It writes .mcp.json with a taptap-proxy server using saved Tap auth, user_id, project_id, and project_path="<app_id>/workspace". The client must reload MCP servers after this.',
    inputSchema: {
      type: 'object',
      properties: {
        target_dir: {
          type: 'string',
          description:
            'Optional Maker project directory. Defaults to the MCP process cwd, which should be the current conversation directory.',
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
        mcp_name: {
          type: 'string',
          description: 'MCP server name to write in .mcp.json. Defaults to taptap-proxy.',
        },
        use_npx: {
          type: 'boolean',
          description:
            'If true, write the script-style npx package command. Defaults to false for local development and uses local dist/proxy.js.',
        },
        pkg: {
          type: 'string',
          description:
            'Package used when use_npx=true. Defaults to @taptap/instant-games-open-mcp@1.22.0.',
        },
      },
    },
  },
  {
    name: 'maker_build_current_directory',
    description:
      'Build the current Maker game by forwarding to the remote TapTap Maker MCP build tool. MUST use this for user requests like "构建", "build", "重新构建游戏", "帮我构建maker游戏", "compile", or "run" in a Maker project. Do not write local build scripts. Uses saved Tap auth/JWT and current .maker-mcp/config.json project binding to call the remote build tool through taptap-proxy.',
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
            'Optional single-player Lua entry file relative to scriptsPath, e.g. "main.lua". Omit to let the remote build tool infer/default.',
        },
        scriptsPath: {
          type: 'string',
          description:
            'Optional scripts directory relative to workspace. Remote build defaults to "scripts" when omitted.',
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
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;

    try {
      if (name === 'maker_status') {
        return {
          content: [
            {
              type: 'text',
              text: formatStatus(),
            },
          ],
        };
      }

      if (name === 'maker_check_environment') {
        return {
          content: [
            {
              type: 'text',
              text: formatEnvironment(),
            },
          ],
        };
      }

      if (name === 'maker_tap_login_start') {
        const session = await startTapDeviceLogin();
        return {
          content: [
            {
              type: 'text',
              text: [
                'TapTap login started',
                '',
                '请让用户打开下面链接或用 TapTap App 扫码授权：',
                session.auth_url,
                '',
                `- environment: ${session.environment}`,
                `- expires_at: ${session.expires_at}`,
                `- interval_seconds: ${session.interval_seconds}`,
                '',
                '授权完成后调用 maker_tap_login_complete。',
              ].join('\n'),
            },
          ],
        };
      }

      if (name === 'maker_tap_login_complete') {
        const args = (request.params.arguments || {}) as {
          device_code?: string;
          max_attempts?: number;
        };
        const auth = await completeTapDeviceLogin({
          deviceCode: args.device_code,
          maxAttempts: args.max_attempts,
        });
        return {
          content: [
            {
              type: 'text',
              text: [
                '✓ TapTap login completed',
                '',
                `- kid: ${mask(auth.kid)}`,
                `- token_type: ${auth.token_type}`,
                `- mac_algorithm: ${auth.mac_algorithm}`,
                `- saved: ${getTapAuthPath()}`,
                '',
                '下一步调用 maker_exchange_jwt。',
              ].join('\n'),
            },
          ],
        };
      }

      if (name === 'maker_exchange_jwt') {
        const args = (request.params.arguments || {}) as {
          manual_jwt?: string;
        };
        if (!args.manual_jwt && !loadJwt() && !getMakerJwtExchangeUrl()) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: [
                  'Maker JWT is required before listing apps or cloning projects.',
                  '',
                  formatBrowserJwtGuide(),
                ].join('\n'),
              },
            ],
          };
        }
        const jwt = await exchangeSavedTapAuthForMakerJwt({
          manualJwt: args.manual_jwt,
        });
        return {
          content: [
            {
              type: 'text',
              text: [
                '✓ Maker JWT ready',
                '',
                `- jwt: ${mask(jwt.token)}`,
                `- user_id: ${jwt.user_id || '(unknown)'}`,
                `- implementation: ${getMakerJwtExchangeUrl() ? 'remote_exchange' : 'temporary_cached_or_manual_jwt'}`,
                `- saved: ${getJwtPath()}`,
                '',
                '下一步调用 maker_list_apps。',
              ].join('\n'),
            },
          ],
        };
      }

      if (name === 'maker_list_apps') {
        if (!loadTapAuth()) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: formatTapLoginRequired('maker_list_apps'),
              },
            ],
          };
        }

        const args = (request.params.arguments || {}) as {
          jwt?: string;
        };
        const projects = await listMakerProjects({
          jwt: args.jwt,
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

      if (name === 'maker_setup_guide') {
        return {
          content: [
            {
              type: 'text',
              text: formatIdentifyHint(),
            },
          ],
        };
      }

      if (name === 'maker_clone_to_current_directory') {
        const args = (request.params.arguments || {}) as {
          app_id?: string;
          target_dir?: string;
          jwt?: string;
          force_pat?: boolean;
        };

        if (!args.app_id) {
          throw new McpError(ErrorCode.InvalidParams, 'app_id is required');
        }
        if (!loadTapAuth()) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: formatTapLoginRequired('maker_clone_to_current_directory'),
              },
            ],
          };
        }

        const targetDir = args.target_dir || process.cwd();
        const result = await cloneMakerProject({
          appId: args.app_id,
          targetDir,
          jwt: args.jwt,
          forcePat: args.force_pat === true,
          sceEndpoint: process.env.SCE_MCP_URL,
        });

        return {
          content: [
            {
              type: 'text',
              text: [
                '✓ Maker project cloned',
                '',
                `- app_id: ${args.app_id}`,
                `- target_dir: ${result.targetDir}`,
                `- status: ${result.status}`,
                `- retried_with_new_pat: ${result.retriedWithNewPat ? 'yes' : 'no'}`,
                '- project config: .maker-mcp/config.json',
              ].join('\n'),
            },
          ],
        };
      }

      if (name === 'maker_push_current_directory' || name === 'maker_submit_current_directory') {
        const args = (request.params.arguments || {}) as {
          message?: string;
          target_dir?: string;
          branch?: string;
          files?: string[];
          allow_empty?: boolean;
          jwt?: string;
          force_pat?: boolean;
        };

        const targetDir = args.target_dir || process.cwd();
        const result = await pushMakerProject({
          cwd: targetDir,
          message: args.message,
          branch: args.branch,
          files: args.files,
          allowEmpty: args.allow_empty === true,
          jwt: args.jwt,
          forcePat: args.force_pat === true,
        });

        return {
          content: [
            {
              type: 'text',
              text: formatPushResult(targetDir, result),
            },
          ],
        };
      }

      if (name === 'maker_configure_remote_proxy') {
        const args = (request.params.arguments || {}) as {
          target_dir?: string;
          server_url?: string;
          env?: 'rnd' | 'production';
          mcp_name?: string;
          use_npx?: boolean;
          pkg?: string;
        };

        const result = configureRemoteProxy({
          targetDir: args.target_dir || process.cwd(),
          serverUrl: args.server_url,
          env: args.env,
          mcpName: args.mcp_name,
          useNpx: args.use_npx === true,
          pkg: args.pkg,
        });

        return {
          content: [
            {
              type: 'text',
              text: formatRemoteProxyResult(result),
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
        };

        const result = await buildCurrentDirectory({
          targetDir: args.target_dir || process.cwd(),
          entry: args.entry,
          scriptsPath: args.scriptsPath,
          entryClient: args.entry_client,
          entryServer: args.entry_server,
          multiplayer: args.multiplayer,
          serverUrl: args.server_url,
          env: args.env,
          timeoutMs: args.timeout_ms,
        });

        return {
          content: [
            {
              type: 'text',
              text: formatBuildResult(result),
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

function formatStatus(): string {
  const identify = identifyMakerProject();
  const jwt = loadJwt();
  const tapAuth = loadTapAuth();
  const tapSession = loadTapDeviceSession();
  const git = checkGitEnvironment();

  return [
    'TapTap Maker MCP status',
    '',
    `- version: ${VERSION}`,
    `- tap_auth: ${tapAuth ? 'found' : 'missing'} (${getTapAuthPath()})`,
    `- tap_login_session: ${tapSession ? 'found' : 'missing'} (${getTapDeviceSessionPath()})`,
    `- jwt: ${jwt ? 'found' : 'missing'} (${getJwtPath()})`,
    `- project_source: ${identify.source}`,
    `- project_id: ${identify.projectId || '(none)'}`,
    identify.configPath ? `- config: ${identify.configPath}` : '',
    identify.config?.sce_endpoint ? `- sce_endpoint: ${identify.config.sce_endpoint}` : '',
    '',
    'Local prerequisites',
    '',
    formatGitEnvironmentStatus(git),
    '',
    tapAuth
      ? ''
      : [
          'Auth next step',
          '',
          'Tap 登录授权缺失。继续列项目或克隆前，请先调用 maker_tap_login_start，用户授权后调用 maker_tap_login_complete。',
        ].join('\n'),
    '',
    identify.projectId
      ? [
          '当前目录已绑定 Maker 项目。',
          '如果用户要求“帮我提交代码 / 提交并推送 / push / 帮我提交代码到maker / 帮我提交代码到taptap制造 / 帮我提交代码到tap制造 / 帮我提交代码到tap”，必须调用 maker_submit_current_directory 或 maker_push_current_directory。',
          '不要套用本地通用 Git skill 的任务号、默认分支保护、新建分支规则；Maker push 按远端 Maker 仓库当前分支直接提交并推送。',
        ].join('\n')
      : formatIdentifyHint(),
  ]
    .filter(Boolean)
    .join('\n');
}

function formatEnvironment(): string {
  const git = checkGitEnvironment();
  return [
    'TapTap Maker MCP environment',
    '',
    `- version: ${VERSION}`,
    `- node_version: ${process.version}`,
    formatGitEnvironmentStatus(git),
    '',
    git.installed
      ? 'Git 已可用，可以继续 Maker 登录、列出 app、clone 或 push 流程。'
      : 'Git 未可用。安装并验证 Git 前，Maker MCP 不会执行 clone、fetch、commit 或 push。',
  ].join('\n');
}

function formatTapLoginRequired(nextTool: string): string {
  return [
    'Tap 登录授权缺失，先暂停当前 Maker 流程。',
    '',
    '远端 Maker MCP tools 需要 Tap token 认证，因此在列项目或克隆前必须先完成 Tap 登录。',
    '',
    '请按顺序执行：',
    '1. 调用 maker_tap_login_start，展示授权链接。',
    '2. 等用户完成授权并回复“已授权”。',
    '3. 调用 maker_tap_login_complete，保存 Tap token。',
    `4. 重新调用 ${nextTool}。`,
    '',
    `Tap auth 保存位置：${getTapAuthPath()}`,
  ].join('\n');
}

function mask(value: string): string {
  if (value.length <= 12) {
    return '***';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatProjectList(projects: Array<{ id: string; name?: string }>): string {
  if (projects.length === 0) {
    return [
      'No Maker apps found.',
      '',
      '请确认 Maker JWT 是否有效，或等待 Maker app list 接口对齐。',
    ].join('\n');
  }

  return [
    'Maker apps',
    '',
    ...projects.map(
      (project, index) => `${index + 1}. ${project.id}${project.name ? `  ${project.name}` : ''}`
    ),
    '',
    '请让用户选择一个 app，然后调用 maker_clone_to_current_directory。',
  ].join('\n');
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
  const jwt = loadJwt();
  if (!jwt) {
    throw new Error('Maker JWT not found. Run maker_exchange_jwt first.');
  }

  const tapAuth = loadTapAuth();
  if (!tapAuth) {
    throw new Error(
      'Tap auth not found. Run maker_tap_login_start and maker_tap_login_complete first.'
    );
  }

  const userId = getUserIdFromMakerJwt(jwt);
  if (!userId) {
    throw new Error('Cannot resolve user_id from Maker JWT.');
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

function configureRemoteProxy(options: {
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

function resolveLocalProxyBundle(): string {
  const makerEntry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const alongsideMaker = makerEntry ? path.join(path.dirname(makerEntry), 'proxy.js') : '';
  if (alongsideMaker && fs.existsSync(alongsideMaker)) {
    return alongsideMaker;
  }

  const cwdBundle = path.resolve(process.cwd(), 'dist', 'proxy.js');
  if (fs.existsSync(cwdBundle)) {
    return cwdBundle;
  }

  throw new Error(
    'Local dist/proxy.js not found. Run npm run build before configuring remote proxy.'
  );
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

function formatRemoteProxyResult(result: {
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

async function buildCurrentDirectory(options: {
  targetDir: string;
  entry?: string;
  scriptsPath?: string;
  entryClient?: string;
  entryServer?: string;
  multiplayer?: Record<string, unknown>;
  serverUrl?: string;
  env?: 'rnd' | 'production';
  timeoutMs?: number;
}): Promise<{
  projectRoot: string;
  projectId: string;
  projectPath: string;
  serverUrl: string;
  env: string;
  timeoutMs: number;
  buildArgs: Record<string, unknown>;
  resultText: string;
}> {
  const proxy = createRemoteProxyContext({
    targetDir: options.targetDir,
    serverUrl: options.serverUrl,
    env: options.env,
  });
  const buildArgs = createBuildArgs(proxy.projectRoot, options);
  const timeoutMs = options.timeoutMs || DEFAULT_BUILD_TIMEOUT_MS;

  const transport = new StdioClientTransport({
    command: proxy.command,
    args: proxy.args,
    env: {
      ...process.env,
      ...proxy.envVars,
    },
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
      }
    );

    return {
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

function createBuildArgs(
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

function formatBuildResult(result: {
  projectRoot: string;
  projectId: string;
  projectPath: string;
  serverUrl: string;
  env: string;
  timeoutMs: number;
  buildArgs: Record<string, unknown>;
  resultText: string;
}): string {
  return [
    '✓ Remote Maker build finished',
    '',
    `- project_root: ${result.projectRoot}`,
    `- project_id: ${result.projectId}`,
    `- project_path: ${result.projectPath}`,
    `- server_url: ${result.serverUrl}`,
    `- env: ${result.env}`,
    `- timeout_ms: ${result.timeoutMs}`,
    `- build_args: ${JSON.stringify(result.buildArgs)}`,
    '',
    'remote_result:',
    indent(result.resultText),
  ].join('\n');
}

function formatPushResult(
  targetDir: string,
  result: {
    branch: string;
    committed: boolean;
    commitHash?: string;
    message?: string;
    pushed: boolean;
    status: string;
    ahead?: string;
    failure?: {
      stage: string;
      command?: string;
      exitCode?: number | null;
      stdout?: string;
      stderr?: string;
      message: string;
      classification: string;
      nextAction: string;
    };
  }
): string {
  const lines = [
    result.pushed
      ? '✓ Maker project pushed'
      : result.status === 'clean'
        ? 'Maker project has no changes to push'
        : '✗ Maker project push failed',
    '',
    `- target_dir: ${targetDir}`,
    `- branch: ${result.branch}`,
    `- status: ${result.status}`,
    `- committed: ${result.committed ? 'yes' : 'no'}`,
    result.commitHash ? `- commit_hash: ${result.commitHash}` : '',
    result.message ? `- commit_message: ${result.message}` : '',
    result.ahead ? `- git_state: ${result.ahead}` : '',
  ].filter(Boolean);

  if (!result.failure) {
    return lines.join('\n');
  }

  return [
    ...lines,
    '',
    'failure:',
    `- stage: ${result.failure.stage}`,
    `- classification: ${result.failure.classification}`,
    `- exit_code: ${result.failure.exitCode ?? '(none)'}`,
    result.failure.command ? `- command: ${result.failure.command}` : '',
    result.failure.stderr ? `- stderr:\n${indent(result.failure.stderr)}` : '',
    result.failure.stdout ? `- stdout:\n${indent(result.failure.stdout)}` : '',
    `- next_action: ${result.failure.nextAction}`,
  ]
    .filter(Boolean)
    .join('\n');
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
    'next_action: 请把上面的完整错误反馈给开发者；如果本地已有 commit 但 push 未完成，不要重复 commit，直接重试 maker_push_current_directory。',
  ].join('\n');
}

function indent(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
