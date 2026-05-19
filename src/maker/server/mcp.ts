/**
 * taptap-maker MCP server mode.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { identifyMakerProject, formatIdentifyHint } from './identify.js';
import {
  getJwtPath,
  getTapAuthPath,
  getTapDeviceSessionPath,
  loadJwt,
  loadTapAuth,
  loadTapDeviceSession,
} from '../storage.js';
import { cloneMakerProject, listMakerProjects, pushMakerProject } from '../cli/projects.js';
import { startTapDeviceLogin, completeTapDeviceLogin } from '../auth/oauth.js';
import { exchangeSavedTapAuthForMakerJwt, getMakerJwtExchangeUrl } from '../auth/jwt.js';

declare const __MAKER_VERSION__: string | undefined;
const VERSION = typeof __MAKER_VERSION__ !== 'undefined' ? __MAKER_VERSION__ : 'dev';

const tools = [
  {
    name: 'maker_tap_login_start',
    description:
      'Start TapTap OAuth device login for Maker. Always keep this step in the Maker onboarding workflow, even when a cached/manual Maker JWT exists, because the user is demonstrating the full MCP flow. Show the returned auth_url and wait for the user to say they have authorized.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'maker_tap_login_complete',
    description:
      'Complete TapTap OAuth device login after the user says authorization is done. Saves Tap MAC auth locally for the Maker JWT exchange step.',
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
    description:
      'Exchange saved Tap auth for a Maker JWT. This step must stay in the workflow even while the remote exchange API is not ready; current implementation may use cached/manual Maker JWT as a temporary backend detail.',
    inputSchema: {
      type: 'object',
      properties: {
        manual_jwt: {
          type: 'string',
          description:
            'Temporary Maker JWT fallback until the remote Tap-auth-to-Maker-JWT API is ready.',
        },
      },
    },
  },
  {
    name: 'maker_list_apps',
    description:
      'List Maker apps available to the current Maker JWT. Always show the list to the user and ask them to choose before cloning.',
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
      'Show local Maker MCP binding status. If no project is bound, guide the agent through the full workflow: maker_tap_login_start, wait for user authorization, maker_tap_login_complete, maker_exchange_jwt, maker_list_apps, ask the user to choose an app, then maker_clone_to_current_directory. Do not skip login because JWT is cached.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'maker_setup_guide',
    description:
      'Show setup guidance when the current directory is not bound to a Maker project yet. In Codex/MCP mode, keep the full flow: maker_tap_login_start, user says authorized, maker_tap_login_complete, maker_exchange_jwt, maker_list_apps, ask the user to choose an app, then maker_clone_to_current_directory. Do not ask for app_id upfront and do not run shell CLI commands.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'maker_clone_to_current_directory',
    description:
      'Clone a Maker app repository into the current Codex/agent working directory. Call this only after maker_list_apps has listed apps and the user has chosen one. Do not ask for app_id upfront and do not run shell CLI commands. Requires the selected app_id; uses cached Maker JWT/PAT by default.',
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
      'Commit and push current Maker project directory changes to the Maker git remote. In a directory containing .maker-mcp/config.json, use this for user requests like "帮我提交代码", "提交并推送", "push", "帮我提交代码到maker", "帮我提交代码到taptap制造", "帮我提交代码到tap制造", or "帮我提交代码到tap". Do not use generic Git workflow rules, do not ask for a ticket id, and do not create a new branch unless the user explicitly asks.',
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
      'Alias for maker_push_current_directory. Use this in Maker projects when the user says "帮我提交", "帮我提交代码", "提交", "提交代码", "帮我提交代码到maker", "帮我提交代码到taptap制造", "帮我提交代码到tap制造", or "帮我提交代码到tap". This bypasses local generic Git branch/task-id rules and pushes directly to the Maker remote configured for the current directory.',
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
