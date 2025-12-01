/**
 * Application Management Handlers
 * Handles developer and app selection operations
 */

import type { ResolvedContext } from '../../core/types/context.js';
import {
  getAllDevelopersAndApps,
  selectApp as selectAppApi,
  createDeveloper,
  createAppForDeveloper,
  editAppInfo as editAppInfoApi,
} from './api.js';
import { clearAppCache } from '../../core/utils/cache.js';
import { clearToken, saveToken } from '../../core/auth/tokenStorage.js';
import { EnvConfig } from '../../core/utils/env.js';
import { requestDeviceCode, generateAuthUrl, pollForToken } from '../../core/auth/oauth.js';
import { oauthState } from '../../core/auth/oauthState.js';

// Messages for App operations
const MESSAGES = {
  SELECT_DEVELOPER_FOR_CREATE: (developers: any[]) => {
    let msg = `⚠️ **需要选择开发者身份**\n\n`;
    msg += `您有多个开发者身份，请在 create_app 工具的 parameters 中指定 \`developerId\`。\n\n`;
    msg += `**可用的开发者身份：**\n`;
    developers.forEach((dev) => {
      msg += `- ${dev.developer_name} (ID: ${dev.developer_id})\n`;
    });
    return msg;
  },
  DEVELOPER_ID_NOT_EXISTS: `❌ **找不到开发者身份**\n\n请先使用 \`create_developer\` 创建开发者身份，或使用 \`list_developers_and_apps\` 查看现有身份。`,
  CREATE_DEVELOPER_FAILED: `❌ **创建开发者身份失败**`,
  CREATE_GAME_SUCCESS: (devId: number, appId: number, name: string, displayName: string) =>
    `✅ **创建应用成功！**\n\n` +
    `应用名称：${name}\n` +
    `显示名称：${displayName}\n` +
    `App ID：${appId}\n` +
    `Developer ID：${devId}\n\n` +
    `💡 **下一步**：您可以使用 \`select_app\` 选择此应用，然后开始开发功能（如排行榜）。`,
  CREATE_GAME_FAILED: `❌ **创建应用失败**`,
  EDIT_GAME_INFO_CONFIRMATION: `⚠️ **参数缺失**\n\n请提供 developerId 和 appId 以更新应用信息。`,
  EDIT_GAME_INFO_SUCCESS: `✅ **更新应用信息成功！**`,
};

/**
 * List all developers and apps for the current user
 */
export async function listDevelopersAndApps(ctx: ResolvedContext): Promise<string> {
  try {
    const result = await getAllDevelopersAndApps(ctx);

    if (!result.list || result.list.length === 0) {
      return `📋 暂无开发者或应用\n\n您还没有创建任何开发者账号或应用。请先在 TapTap 开放平台创建应用。`;
    }

    let output = `📋 开发者和应用列表\n\n`;

    result.list.forEach((developer, devIndex) => {
      output += `**开发者 ${devIndex + 1}: ${developer.developer_name}**\n`;
      output += `- Developer ID: ${developer.developer_id}\n`;

      // 检查 levels 字段（而不是 crafts）
      if (!developer.levels || developer.levels.length === 0) {
        output += `- 暂无应用\n\n`;
      } else {
        output += `- 应用列表:\n`;
        developer.levels.forEach((app, appIndex) => {
          output += `  ${appIndex + 1}. **${app.app_title}** (App ID: ${app.app_id})\n`;
          if (app.miniapp_id) {
            output += `     Miniapp ID: ${app.miniapp_id}\n`;
          }
          if (app.category) {
            output += `     类别: ${app.category}\n`;
          }
          if (app.is_published !== undefined) {
            output += `     已发布: ${app.is_published ? '是' : '否'}\n`;
          }
        });
        output += `\n`;
      }
    });

    output += `\n💡 **下一步:**\n`;
    output += `使用 select_app 工具选择要使用的开发者和应用，例如:\n`;
    output += `- developer_id: ${result.list[0].developer_id}\n`;
    output += `- app_id: ${result.list[0].levels[0]?.app_id || 'N/A'}\n`;

    return output;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `❌ 获取开发者和应用列表失败:\n${errorMsg}`;
  }
}

/**
 * Select a specific developer and app
 */
export async function selectApp(
  args: { developer_id: number; app_id: number },
  ctx: ResolvedContext
): Promise<string> {
  try {
    const result = await selectAppApi(args.developer_id, args.app_id, ctx.projectPath, ctx);

    let message =
      `✅ 已选择应用!\n\n` +
      `📱 应用信息:\n` +
      `- 开发者: ${result.developer_name} (ID: ${result.developer_id})\n` +
      `- 应用: ${result.app_title} (ID: ${result.app_id})\n`;

    if (result.miniapp_id) {
      message += `- Miniapp ID: ${result.miniapp_id}\n`;
    }

    message +=
      `\n💾 此选择已缓存，后续操作将默认使用此应用。\n\n` +
      `🎮 下一步:\n` +
      `您现在可以使用 create_leaderboard 或 list_leaderboards 等工具来管理排行榜了。`;

    return message;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `❌ 选择应用失败:\n${errorMsg}\n\n请使用 list_developers_and_apps 查看可用的开发者和应用列表。`;
  }
}

/**
 * Get current app information from cache
 */
export async function getCurrentAppInfo(ctx: ResolvedContext): Promise<string> {
  try {
    const { readAppCache, getCachePath } = await import('../../core/utils/cache.js');
    const cache = readAppCache(ctx.projectPath);

    if (!cache || !cache.developer_id || !cache.app_id) {
      return `# 当前应用信息

⚠️ **尚未选择应用**

请先选择一个应用，使用以下工具：
1. \`list_developers_and_apps\` - 列出所有可用的开发者和应用
2. \`select_app\` - 选择要使用的特定应用

选择后，应用信息将被缓存并在此显示。
`;
    }

    const cachePath = getCachePath(ctx.projectPath);

    const info = `# 当前应用信息

## 📱 已选择的应用

- **开发者 ID**: \`${cache.developer_id}\`
- **应用 ID**: \`${cache.app_id}\`
- **小程序 ID**: \`${cache.miniapp_id || '不可用'}\`
- **应用名称**: ${cache.app_title || cache.developer_name || '_不可用_'}

## 📂 缓存位置

\`${cachePath}\`

## 💡 下一步操作

- 查看排行榜：使用 \`list_leaderboards\` 工具
- 创建排行榜：使用 \`create_leaderboard\` 工具
- 切换应用：使用 \`select_app\` 工具并指定不同的 developer_id/app_id
`;

    return info;
  } catch (error) {
    return `# 当前应用信息

❌ **加载应用信息失败**

${error instanceof Error ? error.message : String(error)}

请使用 \`check_environment\` 工具验证您的配置。
`;
  }
}

/**
 * Start OAuth authorization
 */
export async function startOAuthAuthorization(ctx: ResolvedContext): Promise<string> {
  // Use shared authentication check logic
  const { hasMacToken, source } = ctx.getTokenStatus();

  if (hasMacToken) {
    return (
      '✅ 已经完成授权\n\n' +
      `当前已有有效的 MAC Token，可以直接使用所有功能。\n\n` +
      '💡 如需切换账号，请先使用 clear_auth_data 工具清除现有授权。'
    );
  }

  try {
    const environment = EnvConfig.environment;
    const deviceCodeData = await requestDeviceCode(environment);
    const authUrl = generateAuthUrl(deviceCodeData.qrcode_url, environment);

    // 保存状态，供 completion 使用
    oauthState.setPendingState({
      deviceCode: deviceCodeData.device_code,
      environment,
    });

    return (
      '🔐 TapTap 授权登录\n\n' +
      '请按以下步骤完成授权：\n\n' +
      `1️⃣ 打开授权链接：\n   ${authUrl}\n\n` +
      '2️⃣ 使用 TapTap App 扫描二维码\n\n' +
      '3️⃣ 授权成功后，调用 complete_oauth_authorization 工具完成授权\n\n' +
      '💡 提示：授权链接有效期为 2 分钟，过期后需要重新获取'
    );
  } catch (error) {
    return (
      `❌ 获取授权链接失败: ${error instanceof Error ? error.message : String(error)}\n\n` +
      '请稍后重试或联系技术支持。'
    );
  }
}

/**
 * Complete OAuth authorization
 */
export async function completeOAuthAuthorization(
  _args: Record<string, never>,
  ctx: ResolvedContext
): Promise<string> {
  const pendingState = oauthState.getPendingState();

  if (!pendingState) {
    return '❌ 未找到待完成的授权\n\n' + '请先使用 start_oauth_authorization 工具获取授权链接。';
  }

  try {
    const macToken = await pollForToken(pendingState.deviceCode, pendingState.environment);

    // ✅ 获取用户和项目标识（用于隔离存储）
    const userId = ctx.userId;
    const projectId = ctx.projectId;

    // ✅ 保存到用户隔离的目录
    saveToken(macToken, {
      environment: pendingState.environment,
      userId,
      projectId,
    });

    // ✅ 不再设置全局 token，已通过用户隔离的文件存储

    // 清除状态
    oauthState.clearPendingState();

    // ✅ 对 AI Agent 返回简洁的成功消息（技术细节对 AI 透明）
    return (
      '✅ 授权完成！\n\n' +
      'Token 已成功保存，现在可以使用所有需要认证的功能了。\n\n' +
      '请重新执行之前失败的操作。'
    );
  } catch (error) {
    return (
      `❌ 授权失败: ${error instanceof Error ? error.message : String(error)}\n\n` +
      '请确认：\n' +
      '1. 已在浏览器中打开授权链接\n' +
      '2. 已使用 TapTap App 扫码授权\n' +
      '3. 授权页面显示成功\n\n' +
      '如果仍然失败，请使用 start_oauth_authorization 工具获取新的授权链接。'
    );
  }
}

/**
 * Clear authentication data and app cache
 */
export async function clearAuthData(
  args: { clear_token?: boolean; clear_cache?: boolean },
  ctx: ResolvedContext
): Promise<string> {
  const clearTokenFlag = args.clear_token !== false; // Default true
  const clearCacheFlag = args.clear_cache !== false; // Default true

  let message = `🗑️ 清理认证数据\n\n`;
  const clearedItems: string[] = [];

  // Clear OAuth token file
  if (clearTokenFlag) {
    try {
      // ✅ 获取用户和项目标识
      const userId = ctx.userId;
      const projectId = ctx.projectId;

      // 清除用户隔离的 token 文件
      clearToken(userId, projectId);

      // ✅ 不再清除全局 token，用户隔离文件已清除

      clearedItems.push('✅ OAuth Token 文件已清除');
    } catch (error) {
      clearedItems.push(
        `⚠️ OAuth Token 清除失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Clear app cache
  if (clearCacheFlag) {
    try {
      clearAppCache(ctx.projectPath);
      clearedItems.push('✅ 应用选择缓存已清除');
    } catch (error) {
      clearedItems.push(
        `⚠️ 缓存清除失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  message += clearedItems.join('\n');
  message += `\n\n📋 下一步：\n`;
  message += `1. 调用需要认证的工具（如 list_developers_and_apps）\n`;
  message += `2. 系统会自动生成新的授权链接\n`;
  message += `3. 使用 TapTap App 扫码授权\n`;
  message += `4. 调用 complete_oauth_authorization 完成授权`;

  return message;
}

/**
 * Check environment configuration and authentication status
 */
export async function checkEnvironment(ctx: ResolvedContext): Promise<string> {
  // Check MAC Token status and source
  const { hasMacToken } = ctx.getTokenStatus();

  // Format MAC Token status
  const macTokenStatus = hasMacToken ? '✅ 已配置' : '❌ 未配置';

  // Build environment info object
  const envInfo = {
    TAPTAP_MCP_MAC_TOKEN: macTokenStatus,
    TAPTAP_MCP_CLIENT_ID: EnvConfig.clientId ? '✅ 已配置' : '❌ 未配置',
    TAPTAP_MCP_CLIENT_SECRET: EnvConfig.clientSecret ? '✅ 已配置' : '❌ 未配置',
    TAPTAP_MCP_ENV: `${EnvConfig.environment} (${EnvConfig.endpoints.apiBaseUrl})`,
    TAPTAP_PROJECT_PATH: ctx.projectPath ? '✅ 已配置' : '❌ 未配置 (可选)',
  };

  const envResult = Object.entries(envInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  let statusMessage = '';
  if (hasMacToken) {
    statusMessage = '\n✅ 认证配置完整，可以使用所有功能';
  } else {
    statusMessage =
      '\n⚠️  MAC Token 未配置\n' +
      '   📖 文档功能可用（Resources, Prompts, 搜索等）\n' +
      '   🔐 管理功能需要授权（创建排行榜、列表等）\n\n' +
      '💡 如需授权，请使用 start_oauth_authorization 工具获取授权链接';
  }

  return `🔧 环境配置检查结果:\n\n${envResult}${statusMessage}`;
}

/**
 * Create a new app (General version)
 */
export async function createApp(
  args: {
    developerId?: number;
    appName?: string;
    genre?: string;
  },
  ctx: ResolvedContext
): Promise<string> {
  let developerId = args.developerId;

  if (!developerId) {
    const response = await getAllDevelopersAndApps(ctx);
    const results = response.list;

    // 开发者身份信息存在
    if (results && results.length > 0) {
      // 只有一个开发者身份，直接选择
      if (results.length === 1) {
        developerId = results[0].developer_id;
      } else {
        return MESSAGES.SELECT_DEVELOPER_FOR_CREATE(results);
      }
    } else {
      // 开发者身份信息不存在，创建开发者身份
      const createDevResult = await createDeveloper(ctx);
      if (createDevResult && createDevResult.developer_id) {
        developerId = createDevResult.developer_id;
      }
    }
  }

  // 确定开发者身份 id, 创建游戏
  if (!developerId) {
    return MESSAGES.DEVELOPER_ID_NOT_EXISTS;
  }

  const results = await createAppForDeveloper(developerId, args.appName, args.genre, ctx);
  if (results && results.app_id) {
    return MESSAGES.CREATE_GAME_SUCCESS(
      developerId,
      results.app_id,
      results.app_title,
      results.display_app_title
    );
  } else {
    return MESSAGES.CREATE_GAME_FAILED;
  }
}

/**
 * Update app information (General version)
 */
export async function updateAppInfo(
  args: {
    developerId?: number;
    appId?: number;
    appName?: string;
    genre?: string;
    description?: string;
    chattingLabel?: string;
    chattingNumber?: string;
    screenOrientation?: number;
  },
  ctx: ResolvedContext
): Promise<string> {
  if (!args.developerId || !args.appId) {
    return MESSAGES.EDIT_GAME_INFO_CONFIRMATION;
  }

  await editAppInfoApi(
    args.appId,
    args.developerId,
    undefined, // package_id
    args.appName,
    args.genre,
    args.description,
    args.chattingLabel,
    args.chattingNumber,
    args.screenOrientation,
    ctx
  );

  return MESSAGES.EDIT_GAME_INFO_SUCCESS;
}
