import { readFileSync } from 'node:fs';
import process from 'node:process';
import { TapTapMcpBridge } from './lib/mcp-bridge.js';

const RESTART_NOTICE =
  'TapTap DC 插件已安装完成。OpenClaw 接下来如需重启 Gateway，应先提示用户；重启完成后即可使用 taptap_dc_* 工具。';

const INSTALLATION_GUIDANCE = [
  '如果安装流程判断需要重启 Gateway，先通知用户，再执行重启。',
  `推荐提示文案：${RESTART_NOTICE}`,
  '执行顺序：先提示用户 -> 再执行 gateway restart -> 重启完成后再开始使用 taptap_dc_* 工具。',
];

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

function buildMarkdownLink(label, url) {
  if (!url) {
    return '-';
  }

  return `[${label}](${url})`;
}

function tryParseUrl(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodeWrappedAuthUrl(value) {
  const parsed = tryParseUrl(value);
  const wrappedCode = parsed?.searchParams?.get('code');
  if (!wrappedCode) {
    return null;
  }

  try {
    return decodeURIComponent(wrappedCode);
  } catch {
    return wrappedCode;
  }
}

function enrichAuthPayload(authPayload) {
  if (!authPayload || typeof authPayload !== 'object') {
    return authPayload;
  }

  const directAuthUrl =
    authPayload.direct_auth_url ||
    authPayload.verification_uri_complete ||
    authPayload.qrcode_url ||
    decodeWrappedAuthUrl(authPayload.auth_url) ||
    authPayload.verification_uri ||
    null;

  const wrappedAuthUrl = authPayload.wrapped_auth_url || authPayload.auth_url || null;
  const preferredAuthUrl = directAuthUrl || wrappedAuthUrl || null;
  const authLinks = [
    preferredAuthUrl
      ? {
          kind: 'preferred',
          label: '直接点击授权',
          url: preferredAuthUrl,
        }
      : null,
    directAuthUrl && directAuthUrl !== preferredAuthUrl
      ? {
          kind: 'direct',
          label: '授权直链',
          url: directAuthUrl,
        }
      : null,
    wrappedAuthUrl && wrappedAuthUrl !== preferredAuthUrl
      ? {
          kind: 'wrapped',
          label: 'TapTap 包装授权页',
          url: wrappedAuthUrl,
        }
      : null,
    authPayload.qrcode_url && authPayload.qrcode_url !== preferredAuthUrl
      ? {
          kind: 'qrcode',
          label: '授权页直链',
          url: authPayload.qrcode_url,
        }
      : null,
  ].filter(Boolean);

  return {
    ...authPayload,
    direct_auth_url: directAuthUrl,
    wrapped_auth_url: wrappedAuthUrl,
    preferred_auth_url: preferredAuthUrl,
    authorization_url: preferredAuthUrl,
    mobile_auth_url: preferredAuthUrl,
    auth_links: authLinks,
    next_action:
      '优先打开 preferred_auth_url 完成授权；完成后调用 taptap_dc_complete_authorization。',
  };
}

function isVerboseLoggingEnabled(config = {}) {
  return (
    config?.verbose === true ||
    String(process.env.TAPTAP_MCP_VERBOSE || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN') : '-';
}

function getNumberField(source, keys = []) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }

  return undefined;
}

function getCurrentAppLabel(payload) {
  return payload?.app_title || payload?.cache?.app_title || payload?.cache?.appTitle || '当前游戏';
}

function flattenApps(payload) {
  const developers = Array.isArray(payload?.list) ? payload.list : [];
  const flattened = [];

  for (const developer of developers) {
    const apps = Array.isArray(developer?.apps) ? developer.apps : [];
    for (const app of apps) {
      flattened.push({
        developer_id: developer.developer_id,
        developer_name: developer.developer_name,
        app_id: app.app_id,
        app_title: app.app_title,
      });
    }
  }

  return flattened;
}

function findAppMatch(payload, appName, appId) {
  const apps = flattenApps(payload);

  if (appId !== undefined) {
    const matched = apps.find((app) => app.app_id === appId);
    return matched ? { matched, candidates: [] } : { matched: null, candidates: [] };
  }

  const keyword = normalizeText(appName);
  if (!keyword) {
    return { matched: null, candidates: [] };
  }

  const exact = apps.filter((app) => normalizeText(app.app_title) === keyword);
  if (exact.length === 1) {
    return { matched: exact[0], candidates: [] };
  }

  const partial = apps.filter((app) => normalizeText(app.app_title).includes(keyword));
  if (partial.length === 1) {
    return { matched: partial[0], candidates: [] };
  }

  return { matched: null, candidates: exact.length > 0 ? exact.slice(0, 5) : partial.slice(0, 5) };
}

function buildBriefText(appTitle, sections, meta = {}) {
  const store = sections.store?.data || {};
  const review = sections.review?.data || {};
  const community = sections.community?.data || {};
  const ratingSummary = review.rating_summary || {};

  const pageViewCount = getNumberField(store, ['page_view_count']);
  const downloadRequestCount = getNumberField(store, ['download_request_count']);
  const downloadCount = getNumberField(store, ['download_count']);
  const reserveCount = getNumberField(store, ['reserve_count']);
  const ratingScore = getNumberField(ratingSummary, ['score', 'rating_score', 'average_score']);
  const reviewCount = getNumberField(ratingSummary, ['review_count', 'count', 'total_count']);
  const positiveCount = getNumberField(review, ['positive_review_count']);
  const negativeCount = getNumberField(review, ['negative_review_count']);
  const topicPageViewCount = getNumberField(community, ['topic_page_view_count']);
  const topicCount = getNumberField(community, ['topic_count']);

  const summary = [];
  if (pageViewCount !== undefined || downloadRequestCount !== undefined) {
    summary.push(
      `商店侧有数据回传，详情页访问量 ${formatNumber(pageViewCount)}，下载请求量 ${formatNumber(downloadRequestCount)}。`
    );
  }
  if (ratingScore !== undefined || reviewCount !== undefined) {
    summary.push(`评价侧当前均分 ${ratingScore ?? '-'}，累计评价 ${formatNumber(reviewCount)}。`);
  }
  if (topicPageViewCount !== undefined || topicCount !== undefined) {
    summary.push(
      `社区侧页面浏览量 ${formatNumber(topicPageViewCount)}，帖子量 ${formatNumber(topicCount)}。`
    );
  }
  if (summary.length === 0) {
    summary.push('已成功拉取数据，但当前字段较少，建议继续查看详细原始结果。');
  }

  const lines = [
    `《${appTitle}》TapTap DC 快速简报`,
    '',
    `时间范围：${meta.start_date || '默认'} ~ ${meta.end_date || '默认'}`,
    '',
    '结论：',
    ...summary.map((item) => `- ${item}`),
    '',
    '关键指标：',
    `- 详情页访问量（PV）：${formatNumber(pageViewCount)}`,
    `- 下载请求量：${formatNumber(downloadRequestCount)}`,
    `- 下载完成量：${formatNumber(downloadCount)}`,
    `- 预约量：${formatNumber(reserveCount)}`,
    `- 评价均分：${ratingScore ?? '-'}`,
    `- 评价总数：${formatNumber(reviewCount)}`,
    `- 正向评价数：${formatNumber(positiveCount)}`,
    `- 负向评价数：${formatNumber(negativeCount)}`,
    `- 社区页面浏览量：${formatNumber(topicPageViewCount)}`,
    `- 社区帖子量：${formatNumber(topicCount)}`,
  ];

  return lines.join('\n');
}

function buildAuthGuideText(authPayload) {
  const enriched = enrichAuthPayload(authPayload);
  if (enriched?.authorized || enriched?.already_authorized) {
    return [
      'TapTap 授权已完成，无需再次扫码或打开授权链接。',
      '如果你刚完成授权，接下来可直接调用 `taptap_dc_quick_brief` 或其他 `taptap_dc_*` 工具。',
    ].join('\n');
  }

  const preferredAuthUrl = enriched?.preferred_auth_url;
  const directAuthUrl = enriched?.direct_auth_url;
  const wrappedAuthUrl = enriched?.wrapped_auth_url;
  const qrcodeUrl = enriched?.qrcode_url;
  const lines = ['当前还没有完成 TapTap 授权，请先完成一次授权。'];

  if (preferredAuthUrl) {
    lines.push(
      '',
      '优先打开下面这条授权直链。这一行会同时保留裸链接，方便手机端直接点击，或在宿主吞掉超链接时复制打开：',
      preferredAuthUrl,
      `<${preferredAuthUrl}>`
    );
  }

  if (preferredAuthUrl || directAuthUrl || wrappedAuthUrl || qrcodeUrl) {
    lines.push(
      '',
      '可点击版本：',
      `- ${buildMarkdownLink('直接点击授权', preferredAuthUrl || directAuthUrl)}`,
      `- ${buildMarkdownLink('打开 TapTap 包装授权页', wrappedAuthUrl)}`,
      `- ${buildMarkdownLink('打开授权页直链', qrcodeUrl || directAuthUrl || preferredAuthUrl)}`
    );
  }

  lines.push(
    '',
    '如果你在手机上对话，优先直接点上面的第一条裸链接；如果超链接显示异常，优先使用 details.preferred_auth_url。',
    '完成授权后，请继续调用 `taptap_dc_complete_authorization`，然后再次调用 `taptap_dc_quick_brief`。'
  );

  if (enriched?.device_code) {
    lines.push('', `device_code：${enriched.device_code}`);
  }

  if (preferredAuthUrl) {
    lines.push('', `preferred_auth_url：${preferredAuthUrl}`);
  }

  if (directAuthUrl && directAuthUrl !== preferredAuthUrl) {
    lines.push('', `直接授权链接：${directAuthUrl}`);
  }

  if (wrappedAuthUrl && wrappedAuthUrl !== preferredAuthUrl) {
    lines.push(`TapTap 包装授权链接：${wrappedAuthUrl}`);
  }

  if (qrcodeUrl && qrcodeUrl !== preferredAuthUrl) {
    lines.push(`授权页直链：${qrcodeUrl}`);
  }

  return lines.join('\n');
}

async function callJsonTool(bridge, name, args = {}) {
  const text = await bridge.callTool(name, args);
  const normalized = normalizeJsonText(text);
  return JSON.parse(normalized);
}

async function resolveSelectedApp(bridge, params) {
  if (params.developer_id && params.app_id) {
    const selected = await callJsonTool(bridge, 'select_app_raw', {
      developer_id: params.developer_id,
      app_id: params.app_id,
    });
    return {
      app: {
        developer_id: params.developer_id,
        app_id: params.app_id,
        app_title: getCurrentAppLabel(selected),
      },
      selected,
    };
  }

  const current = await callJsonTool(bridge, 'get_current_app_info_raw', {});
  if (!params.app_name && !params.app_id && current?.selected) {
    return {
      app: {
        developer_id: current?.cache?.developer_id || current?.cache?.developerId,
        app_id: current?.cache?.app_id || current?.cache?.appId,
        app_title: getCurrentAppLabel(current),
      },
      selected: current,
    };
  }

  const appList = await callJsonTool(bridge, 'list_developers_and_apps_raw', {});
  const { matched, candidates } = findAppMatch(appList, params.app_name, params.app_id);

  if (!matched) {
    return {
      error: {
        ok: false,
        error: 'APP_NOT_RESOLVED',
        message:
          candidates.length > 0
            ? '找到多个候选游戏，请改用更精确的 app_name 或直接传 app_id / developer_id。'
            : '没有找到匹配的游戏，请传 app_name、app_id，或先手动选择一次游戏。',
        candidates,
      },
    };
  }

  const selected = await callJsonTool(bridge, 'select_app_raw', {
    developer_id: matched.developer_id,
    app_id: matched.app_id,
  });

  return {
    app: matched,
    selected,
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
          const parsed = tryParseJson(normalized);
          const normalizedParsed = definition.normalizeResult
            ? definition.normalizeResult(parsed)
            : parsed;
          const renderedText = definition.resultFormatter
            ? definition.resultFormatter(normalizedParsed, normalized)
            : normalized;
          return toolResult(renderedText, {
            mcpToolName: definition.mcpToolName,
            parsed: normalizedParsed,
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

function safeRegisterTool(api, logger, verbose, registerFn, toolName) {
  try {
    registerFn();
    if (verbose) {
      logger?.info?.(`[TapTap DC] Registered OpenClaw tool: ${toolName}`);
    }
    return true;
  } catch (error) {
    logger?.error?.(
      `[TapTap DC] Failed to register OpenClaw tool ${toolName}: ${
        error instanceof Error ? error.stack || error.message : String(error)
      }`
    );
    return false;
  }
}

function registerQuickBriefTool(api, bridge) {
  api.registerTool(
    () => ({
      name: 'taptap_dc_quick_brief',
      label: 'TapTap 快速简报',
      description:
        '按当前选中游戏、游戏名或 app_id，直接生成一份 TapTap DC 快速运营简报；如果未授权，会自动返回扫码授权信息。',
      parameters: createSchema({
        app_name: {
          type: 'string',
          description: '可选，游戏名。传入后会自动在你可访问的游戏里匹配并选中。',
        },
        developer_id: {
          type: 'number',
          description: '可选，开发者 ID。与 app_id 一起传时会直接选中游戏。',
        },
        app_id: {
          type: 'number',
          description: '可选，游戏 app_id。可单独传，也可与 developer_id 一起传。',
        },
        start_date: {
          type: 'string',
          description: '可选，开始日期，格式 YYYY-MM-DD。',
        },
        end_date: {
          type: 'string',
          description: '可选，结束日期，格式 YYYY-MM-DD。',
        },
      }),
      async execute(_id, params) {
        try {
          const env = await callJsonTool(bridge, 'check_environment_raw', {});
          if (!env?.auth?.has_mac_token) {
            const authPayload = enrichAuthPayload(
              await callJsonTool(bridge, 'start_oauth_authorization_raw', {})
            );
            return toolResult(buildAuthGuideText(authPayload), authPayload);
          }

          const resolved = await resolveSelectedApp(bridge, params || {});
          if (resolved.error) {
            return toolResult(JSON.stringify(resolved.error, null, 2), resolved.error);
          }

          const overviewArgs = {
            ...(params?.start_date ? { start_date: params.start_date } : {}),
            ...(params?.end_date ? { end_date: params.end_date } : {}),
          };

          const [store, review, community] = await Promise.all([
            callJsonTool(bridge, 'get_current_app_store_overview_raw', overviewArgs),
            callJsonTool(bridge, 'get_current_app_review_overview_raw', overviewArgs),
            callJsonTool(bridge, 'get_current_app_community_overview_raw', overviewArgs),
          ]);

          const appTitle = resolved.app?.app_title || getCurrentAppLabel(store) || '当前游戏';
          const brief = buildBriefText(
            appTitle,
            { store, review, community },
            {
              start_date: params?.start_date,
              end_date: params?.end_date,
            }
          );

          return toolResult(brief, {
            app: resolved.app,
            sections: { store, review, community },
          });
        } catch (error) {
          return toolResult(
            JSON.stringify(
              {
                ok: false,
                error: 'QUICK_BRIEF_FAILED',
                message: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        }
      },
    }),
    { name: 'taptap_dc_quick_brief' }
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
      'Start TapTap OAuth device flow and return a mobile-friendly clickable auth link plus qrcode link.',
    mcpToolName: 'start_oauth_authorization_raw',
    parameters: createSchema(),
    normalizeResult(parsed) {
      return enrichAuthPayload(parsed);
    },
    resultFormatter(parsed, normalized) {
      if (!parsed || typeof parsed !== 'object') {
        return normalized;
      }
      return buildAuthGuideText(parsed);
    },
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
  id: 'openclaw-dc-plugin',
  name: 'TapTap DC',
  description:
    '面向 OpenClaw 的 TapTap DC 插件，内置原始数据工具与运营简报 skill；如需重启 Gateway，应先提示用户。',
  installation: {
    restartRequired: true,
    restartCommand: 'openclaw gateway restart',
    postInstallMessage: RESTART_NOTICE,
    instructions: INSTALLATION_GUIDANCE,
  },
  installHints: {
    beforeRestartMessage: RESTART_NOTICE,
    instructions: INSTALLATION_GUIDANCE,
  },
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
    const logger = api.logger;
    const verbose = isVerboseLoggingEnabled(api.pluginConfig || {});
    if (verbose) {
      logger?.info?.('[TapTap DC] Starting OpenClaw plugin registration');
    }

    let bridge;
    try {
      bridge = new TapTapMcpBridge({
        logger,
        config: api.pluginConfig || {},
      });
    } catch (error) {
      logger?.error?.(
        `[TapTap DC] Failed to create TapTapMcpBridge during registration: ${
          error instanceof Error ? error.stack || error.message : String(error)
        }`
      );
      throw error;
    }

    let successCount = 0;

    if (
      safeRegisterTool(
        api,
        logger,
        verbose,
        () => registerQuickBriefTool(api, bridge),
        'taptap_dc_quick_brief'
      )
    ) {
      successCount += 1;
    }

    for (const definition of toolDefinitions) {
      if (
        safeRegisterTool(
          api,
          logger,
          verbose,
          () => registerProxyTool(api, bridge, definition),
          definition.name
        )
      ) {
        successCount += 1;
      }
    }

    if (successCount !== toolDefinitions.length + 1) {
      logger?.error?.(
        `[TapTap DC] OpenClaw plugin registration incomplete: ${successCount}/${
          toolDefinitions.length + 1
        } tools registered`
      );
      return;
    }

    if (verbose) {
      logger?.info?.(
        `[TapTap DC] OpenClaw plugin registration completed: ${successCount}/${
          toolDefinitions.length + 1
        } tools registered`
      );
    }
  },
};

export default plugin;
