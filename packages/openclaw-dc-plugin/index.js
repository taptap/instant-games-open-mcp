import { readFileSync } from 'node:fs';
import { TapTapMcpBridge } from './lib/mcp-bridge.js';

function toolResult(text, details = {}) {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeJsonText(text) {
  const parsed = tryParseJson(text);
  if (parsed !== null) {
    return JSON.stringify(parsed, null, 2);
  }

  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    const parsedFence = tryParseJson(fencedJson[1].trim());
    if (parsedFence !== null) {
      return JSON.stringify(parsedFence, null, 2);
    }
  }

  return JSON.stringify(
    {
      ok: false,
      error: 'UNPARSEABLE_RESPONSE',
      raw: text,
    },
    null,
    2
  );
}

function createSchema(properties = {}, required = []) {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function registerProxyTool(api, bridge, definition) {
  api.registerTool(
    () => ({
      name: definition.name,
      label: definition.label,
      description: definition.description,
      parameters: definition.parameters,
      async execute(_id, params) {
        try {
          const text = await bridge.callTool(definition.mcpToolName, params || {});
          const normalized = normalizeJsonText(text);
          return toolResult(normalized, {
            mcpToolName: definition.mcpToolName,
            parsed: tryParseJson(normalized),
          });
        } catch (error) {
          return toolResult(
            JSON.stringify(
              {
                ok: false,
                error: 'PLUGIN_PROXY_ERROR',
                message: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        }
      },
    }),
    { name: definition.name }
  );
}

const toolDefinitions = [
  {
    name: 'taptap_dc_check_environment',
    label: 'TapTap Env',
    description: 'Check embedded TapTap runtime, signer, auth status, and directories as raw JSON.',
    mcpToolName: 'check_environment_raw',
    parameters: createSchema(),
  },
  {
    name: 'taptap_dc_start_authorization',
    label: 'TapTap Auth Start',
    description:
      'Start TapTap OAuth device flow and return auth_url/qrcode_url/device_code as raw JSON.',
    mcpToolName: 'start_oauth_authorization_raw',
    parameters: createSchema(),
  },
  {
    name: 'taptap_dc_complete_authorization',
    label: 'TapTap Auth Complete',
    description: 'Complete TapTap OAuth device flow after the user scans and approves the QR code.',
    mcpToolName: 'complete_oauth_authorization_raw',
    parameters: createSchema(),
  },
  {
    name: 'taptap_dc_clear_auth',
    label: 'TapTap Clear Auth',
    description: 'Clear TapTap cached token and/or selected app cache.',
    mcpToolName: 'clear_auth_data_raw',
    parameters: createSchema({
      clear_token: {
        type: 'boolean',
        description: 'Clear OAuth token cache. Defaults to true.',
      },
      clear_cache: {
        type: 'boolean',
        description: 'Clear selected app cache. Defaults to true.',
      },
    }),
  },
  {
    name: 'taptap_dc_list_apps',
    label: 'TapTap Apps',
    description: 'List all accessible developers and apps as raw JSON.',
    mcpToolName: 'list_developers_and_apps_raw',
    parameters: createSchema(),
  },
  {
    name: 'taptap_dc_select_app',
    label: 'TapTap Select App',
    description: 'Select a developer/app pair for subsequent TapTap DC calls.',
    mcpToolName: 'select_app_raw',
    parameters: createSchema(
      {
        developer_id: {
          type: 'number',
          description: 'Developer ID to select.',
        },
        app_id: {
          type: 'number',
          description: 'App ID to select.',
        },
      },
      ['developer_id', 'app_id']
    ),
  },
  {
    name: 'taptap_dc_get_current_app',
    label: 'TapTap Current App',
    description: 'Get the currently selected app/cache payload as raw JSON.',
    mcpToolName: 'get_current_app_info_raw',
    parameters: createSchema({
      ignore_cache: {
        type: 'boolean',
        description: 'Force refresh from server when true.',
      },
    }),
  },
  {
    name: 'taptap_dc_get_store_overview',
    label: 'TapTap Store Overview',
    description: 'Get current-app store overview raw JSON.',
    mcpToolName: 'get_current_app_store_overview_raw',
    parameters: createSchema({
      start_date: {
        type: 'string',
        description: 'Optional start date in YYYY-MM-DD format.',
      },
      end_date: {
        type: 'string',
        description: 'Optional end date in YYYY-MM-DD format.',
      },
    }),
  },
  {
    name: 'taptap_dc_get_review_overview',
    label: 'TapTap Review Overview',
    description: 'Get current-app review overview raw JSON.',
    mcpToolName: 'get_current_app_review_overview_raw',
    parameters: createSchema({
      start_date: {
        type: 'string',
        description: 'Optional start date in YYYY-MM-DD format.',
      },
      end_date: {
        type: 'string',
        description: 'Optional end date in YYYY-MM-DD format.',
      },
    }),
  },
  {
    name: 'taptap_dc_get_community_overview',
    label: 'TapTap Community Overview',
    description: 'Get current-app community overview raw JSON.',
    mcpToolName: 'get_current_app_community_overview_raw',
    parameters: createSchema({
      start_date: {
        type: 'string',
        description: 'Optional start date in YYYY-MM-DD format.',
      },
      end_date: {
        type: 'string',
        description: 'Optional end date in YYYY-MM-DD format.',
      },
    }),
  },
  {
    name: 'taptap_dc_get_store_snapshot',
    label: 'TapTap Store Snapshot',
    description: 'Get current-app store snapshot raw JSON.',
    mcpToolName: 'get_current_app_store_snapshot_raw',
    parameters: createSchema(),
  },
  {
    name: 'taptap_dc_get_forum_contents',
    label: 'TapTap Forum Contents',
    description: 'Get current-app forum contents raw JSON.',
    mcpToolName: 'get_current_app_forum_contents_raw',
    parameters: createSchema({
      type: {
        type: 'string',
        description: 'Forum flow type. Default: feed.',
      },
      sort: {
        type: 'string',
        description: 'Sort mode. Default: default.',
      },
      from: {
        type: 'number',
        description: 'Pagination start offset.',
      },
      limit: {
        type: 'number',
        description: 'Page size. Default 10, max 20.',
      },
      group_label_id: {
        type: 'number',
        description: 'Optional sub-group label ID.',
      },
    }),
  },
  {
    name: 'taptap_dc_get_reviews',
    label: 'TapTap Reviews',
    description: 'Get current-app reviews raw JSON.',
    mcpToolName: 'get_current_app_reviews_raw',
    parameters: createSchema({
      sort: {
        type: 'string',
        description: 'new / hot / spent',
      },
      from: {
        type: 'number',
        description: 'Pagination start offset.',
      },
      limit: {
        type: 'number',
        description: 'Page size. Default 10, max 10.',
      },
      is_collapsed: {
        type: 'boolean',
        description: 'Whether to query collapsed reviews.',
      },
      filter_platform: {
        type: 'string',
        description: 'mobile / pc / web',
      },
    }),
  },
  {
    name: 'taptap_dc_like_review',
    label: 'TapTap Like Review',
    description: 'Like a current-app review and return the raw upstream response.',
    mcpToolName: 'like_current_app_review_raw',
    parameters: createSchema(
      {
        review_id: {
          type: 'number',
          description: 'Target review ID to like.',
        },
      },
      ['review_id']
    ),
  },
  {
    name: 'taptap_dc_reply_review',
    label: 'TapTap Reply Review',
    description: 'Reply to a current-app review and return the raw upstream response.',
    mcpToolName: 'reply_current_app_review_raw',
    parameters: createSchema(
      {
        review_id: {
          type: 'number',
          description: 'Target review ID to reply to.',
        },
        contents: {
          type: 'string',
          description: 'Reply content to send.',
        },
        reply_comment_id: {
          type: 'number',
          description: 'Optional comment ID when replying to a child comment.',
        },
        confirm_high_risk: {
          type: 'boolean',
          description: 'Only set after explicit human approval.',
        },
      },
      ['review_id', 'contents']
    ),
  },
];

let pluginVersion = 'unknown';
try {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  pluginVersion = pkg.version || 'unknown';
} catch {
  // Best-effort version only
}

const plugin = {
  id: 'taptap-dc-plugin',
  name: 'TapTap DC',
  description: '面向 OpenClaw 的 TapTap DC 插件，内置原始数据工具与运营简报 skill。',
  configSchema: {
    type: 'object',
    properties: {
      environment: {
        type: 'string',
        enum: ['production', 'rnd'],
        default: 'production',
      },
      workspaceRoot: {
        type: 'string',
      },
      cacheDir: {
        type: 'string',
      },
      tempDir: {
        type: 'string',
      },
      logRoot: {
        type: 'string',
      },
      verbose: {
        type: 'boolean',
        default: false,
      },
    },
    additionalProperties: false,
  },
  register(api) {
    const bridge = new TapTapMcpBridge({
      logger: api.logger,
      config: api.pluginConfig || {},
    });

    for (const definition of toolDefinitions) {
      registerProxyTool(api, bridge, definition);
    }

    api.logger.info?.(
      `[TapTap DC] OpenClaw plugin v${pluginVersion} initialised with ${toolDefinitions.length} tools`
    );
  },
};

export default plugin;
