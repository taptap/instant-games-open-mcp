/**
 * Application Management Handlers
 * Handles developer and app selection operations
 */

import type { ResolvedContext } from '../../core/types/context.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getAllDevelopersAndApps,
  selectApp as selectAppApi,
  createDeveloper,
  createAppForDeveloper,
  editAppInfo as editAppInfoApi,
  getAppStatus as getAppStatusApi,
  uploadImage as uploadImageApi,
  AppStatus,
  ReviewStatus,
} from './api.js';
import { resolvePathSafe } from '../../core/utils/pathResolver.js';
import { clearAppCache } from '../../core/utils/cache.js';
import { clearToken, saveToken } from '../../core/auth/tokenStorage.js';
import { EnvConfig } from '../../core/utils/env.js';
import {
  requestDeviceCode,
  generateAuthUrl,
  pollForToken,
  generateQRCodeBase64,
} from '../../core/auth/oauth.js';
import { oauthState } from '../../core/auth/oauthState.js';
import { isUsingNativeSigner, getSignerStatus } from '../../core/network/nativeSigner.js';

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
    `✅ **已自动选中此应用**，可以直接进行后续操作（如上传游戏、创建排行榜等）。`,
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

      if (!developer.apps || developer.apps.length === 0) {
        output += `- 暂无应用\n\n`;
      } else {
        output += `- 应用列表:\n`;
        developer.apps.forEach((app, appIndex) => {
          const appKind = app.is_level ? '关卡游戏' : '非关卡游戏';
          output += `  ${appIndex + 1}. **${app.app_title}** (App ID: ${app.app_id})\n`;
          output += `     类型: ${appKind}\n`;
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
    output += `- app_id: ${result.list[0].apps[0]?.app_id || 'N/A'}\n`;

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
      `您现在可以继续使用 current-app 社区能力，或按需使用排行榜、H5 上传等工具。`;

    return message;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `❌ 选择应用失败:\n${errorMsg}\n\n请使用 list_developers_and_apps 查看可用的开发者和应用列表。`;
  }
}

/**
 * Get current app information from cache
 */
export async function getCurrentAppInfo(
  ctx: ResolvedContext,
  ignoreCache: boolean = false
): Promise<string> {
  try {
    const { getCachePath } = await import('../../core/utils/cache.js');
    const { ensureAppInfo } = await import('./api.js');

    // ensureAppInfo handles TTL check and refresh
    // Returns null if no app selected, or cached/refreshed data
    const cache = await ensureAppInfo(ctx.projectPath, ctx, ignoreCache);

    // No app selected - guide user to select one
    if (!cache) {
      return `# 当前应用信息

⚠️ **尚未选择应用**

请按以下步骤选择应用：
1. 调用 \`list_developers_and_apps\` 查看可用的开发者和应用
2. 调用 \`select_app\` 选择要使用的应用

选择后再次调用此工具查看应用信息。
`;
    }

    const cachePath = getCachePath(ctx.projectPath);
    const updatedAt = cache.updated_at ? new Date(cache.updated_at).toLocaleString() : '未知';
    const isStale = !!cache.is_stale;

    // Format Level Info (Online version)
    let levelInfo = '';
    if (cache.level) {
      const levelData = cache.level.data;
      levelInfo = `
### 🟢 线上版本
- **版本号**: ${cache.level.version || '未知'}
- **状态**: ${cache.level.status}
- **显示名称**: ${levelData?.title || cache.level.app_title || '未知'}
- **描述**: ${levelData?.description || '无'}
- **分类**: ${levelData?.category || '未设置'}`;
    } else {
      levelInfo = `
### 🟢 线上版本
_暂无线上版本_`;
    }

    // Format Upload Level Info (Draft/Audit version)
    let uploadInfo = '';
    if (cache.upload_level) {
      const formInfo = cache.upload_level.form_data?.info;
      uploadInfo = `
### 🟡 草稿/审核版本
- **版本号**: ${cache.upload_level.version || '未知'}
- **状态**: ${cache.upload_level.status}
- **显示名称**: ${formInfo?.title || cache.upload_level.app_title || '未知'}
- **描述**: ${formInfo?.description || '无'}
- **分类**: ${formInfo?.category || '未设置'}`;
    } else {
      uploadInfo = `
### 🟡 草稿/审核版本
_暂无草稿版本_`;
    }

    const info = `# 当前应用信息

## 📱 已选择的应用

- **开发者 ID**: \`${cache.developer_id}\`
- **开发者名称**: ${cache.developer_name || '_未知_'}
- **应用 ID**: \`${cache.app_id}\`
- **应用名称**: ${cache.app_title || '_未知_'}
- **小程序 ID**: \`${cache.miniapp_id || '不可用'}\`

## 📦 版本信息
${levelInfo}
${uploadInfo}

## 💾 缓存状态

- **最后更新**: ${updatedAt}
- **数据来源**: ${ignoreCache ? '实时服务器 (强制刷新)' : '本地缓存'}${isStale ? ' ⚠️ (数据已陈旧 - 刷新失败)' : ''}
- **缓存位置**: \`${cachePath}\`

## 💡 下一步操作

- 当前游戏 DC 能力：\`get_current_app_store_overview\` / \`get_current_app_review_overview\` / \`get_current_app_community_overview\`
- 当前游戏详情能力：\`get_current_app_store_snapshot\` / \`get_current_app_forum_contents\` / \`get_current_app_reviews\`
- 查看排行榜：\`list_leaderboards\`
- 创建排行榜：\`create_leaderboard\`
- 查看应用状态：\`get_app_status\`
- 切换应用：\`select_app\`
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
  const { hasMacToken } = ctx.getTokenStatus();

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

    // 二维码应该直接使用 qrcode_url（API 返回的原始 URL），而不是经过 generateAuthUrl 处理的 URL
    // generateAuthUrl 生成的 URL 用于在浏览器中打开，但二维码应该直接使用 qrcode_url
    const qrCodeUrl = deviceCodeData.qrcode_url;

    // 生成 base64 编码的二维码图片
    const qrCodeBase64 = await generateQRCodeBase64(qrCodeUrl);
    const hasQRImage = !!(qrCodeBase64 && qrCodeBase64.length > 0);

    if (hasQRImage) {
      // 使用 JSON 格式返回，包含 base64 二维码和其他信息
      const resultObj = {
        qrcode: qrCodeBase64, // base64 编码的二维码图片（PNG 格式），内容为 qrcode_url
        authUrl: authUrl, // 授权链接（用于浏览器打开）
        message: `🔐 TapTap 授权登录\n\n请选择以下任一方式完成授权：\n\n方式一：扫描返回的二维码\n📱 使用 TapTap App 直接扫描下方二维码图片\n\n方式二：打开链接后扫描链接展示的二维码\n🔗 [点击打开授权页面](${authUrl})，然后在页面中扫描二维码\n\n📝 操作步骤\n1. 打开 TapTap App\n2. 选择方式一（扫描下方二维码）或方式二（打开链接后扫描链接展示的二维码）\n3. 在 TapTap App 中点击授权按钮\n4. 授权完成后，调用 complete_oauth_authorization 工具完成授权\n\n💡 提示：授权链接有效期为 2 分钟，过期后需要重新获取`,
      };
      // 使用特殊标记格式，供 server.ts 解析
      return `__QR_CODE_JSON__${JSON.stringify(resultObj)}__END_QR_CODE_JSON__`;
    } else {
      // 如果没有图片，只提供链接
      return (
        '🔐 TapTap 授权登录\n\n' +
        '请按以下步骤完成授权：\n\n' +
        `1️⃣ 打开授权链接：\n   ${authUrl}\n\n` +
        '2️⃣ 使用 TapTap App 扫描二维码\n\n' +
        '3️⃣ 授权成功后，调用 complete_oauth_authorization 工具完成授权\n\n' +
        '💡 提示：授权链接有效期为 2 分钟，过期后需要重新获取'
      );
    }
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

  // Get signer status
  const signerStatus = await getSignerStatus();
  const usingNative = isUsingNativeSigner();

  // Format MAC Token status
  const macTokenStatus = hasMacToken ? '✅ 已配置' : '❌ 未配置';

  // Build environment info
  let envResult = '';

  // 显示签名器配置（区分 Native Signer 和环境变量两种模式）
  envResult += '📦 签名器配置:\n';
  if (usingNative) {
    envResult += `   Mode: Native Signer (v${signerStatus.version})\n`;
    envResult += '   Client ID: ✅ 嵌入二进制\n';
    envResult += '   Client Secret: ✅ 受保护\n';
  } else {
    envResult += '   Mode: 环境变量\n';
    envResult += `   Client ID: ${EnvConfig.clientId ? '✅ 已配置' : '❌ 未配置'}\n`;
    envResult += `   Client Secret: ${EnvConfig.clientSecret ? '✅ 已配置' : '❌ 未配置'}\n`;
  }

  // 显示认证状态
  envResult += '\n🔐 认证状态:\n';
  envResult += `   MAC Token: ${macTokenStatus}\n`;

  // 显示环境配置
  envResult += '\n🌍 环境配置:\n';
  envResult += `   TAPTAP_MCP_ENV: ${EnvConfig.environment} (${EnvConfig.endpoints.apiBaseUrl})\n`;

  // 显示目录配置
  envResult += '\n📂 目录配置:\n';
  envResult += `   WORKSPACE_ROOT: ${EnvConfig.workspaceRoot}\n`;
  envResult += `   CACHE_DIR: ${EnvConfig.cacheDir}\n`;
  envResult += `   TEMP_DIR: ${EnvConfig.tempDir}\n`;
  envResult += `   LOG_ROOT: ${EnvConfig.logRoot}\n`;

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
 *
 * 设计说明：
 * - 成功创建后自动调用 selectAppApi 选中新应用
 * - 用户无需手动调用 select_app
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
    // ✅ 自动选中新创建的应用（写入缓存）
    try {
      await selectAppApi(developerId, results.app_id, ctx.projectPath, ctx);
    } catch (selectError) {
      console.warn('Failed to auto-select newly created app:', selectError);
      // 即使选中失败，也返回成功消息（用户可以手动选择）
    }

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
    icon?: string;
    banner?: string;
    screenshots?: string[];
    trialNote?: string;
  },
  ctx: ResolvedContext
): Promise<string> {
  if (!args.developerId || !args.appId) {
    return MESSAGES.EDIT_GAME_INFO_CONFIRMATION;
  }

  try {
    const result = await editAppInfoApi(
      args.appId,
      args.developerId,
      undefined, // package_id
      args.appName,
      args.genre,
      args.description,
      args.chattingLabel,
      args.chattingNumber,
      args.screenOrientation,
      args.icon,
      args.banner,
      args.screenshots,
      args.trialNote,
      ctx
    );

    // Refresh App Cache immediately after successful update
    try {
      await selectAppApi(args.developerId, args.appId, ctx.projectPath, ctx);
    } catch (refreshError) {
      console.warn('Failed to refresh app cache after update:', refreshError);
    }

    return `# 应用信息更新成功

## 📱 更新后信息

- **显示名称**: ${result.display_app_title || args.appName || '未修改'}
- **应用标题**: ${result.app_title || '未修改'}

## 🔗 下一步

您可以使用 \`get_current_app_info\` 查看最新的应用详情。
`;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to update app info: ${error.message}`);
    }
    throw new Error(`Failed to update app info: ${String(error)}`);
  }
}

/**
 * Get app status (app_status and review_status)
 * Always fetches fresh data from API for real-time accuracy.
 * @see https://agent.api.xdrnd.cn/_docs#/level/get_level_v1_status
 */
export async function getAppStatus(
  appId: number,
  ctx: ResolvedContext,
  _ignoreCache: boolean = false // Kept for API compatibility, but always fetches fresh
): Promise<string> {
  // Always fetch fresh status data for real-time accuracy
  const resultData = await getAppStatusApi(appId, ctx);

  // 使用枚举映射状态文本
  const appStatusMap: Record<number, string> = {
    [AppStatus.Offline]: '未上线',
    [AppStatus.Online]: '已上线',
  };
  const appStatusText = appStatusMap[resultData.app_status] ?? '未知状态';

  const reviewStatusMap: Record<number, string> = {
    [ReviewStatus.Unpublished]: '未发布',
    [ReviewStatus.UnderReview]: '审核中',
    [ReviewStatus.Rejected]: '审核失败',
    [ReviewStatus.Published]: '已上线',
  };
  const reviewStatusText = reviewStatusMap[resultData.review_status] ?? '未知状态';

  return (
    `📋 应用状态查询结果\n\n` +
    `🎮 关卡游戏状态：${appStatusText} (${resultData.app_status})\n` +
    `   - ${AppStatus.Offline}: 未上线\n` +
    `   - ${AppStatus.Online}: 已上线\n\n` +
    `📝 审核状态：${reviewStatusText} (${resultData.review_status})\n` +
    `   - ${ReviewStatus.Unpublished}: 未发布\n` +
    `   - ${ReviewStatus.UnderReview}: 审核中\n` +
    `   - ${ReviewStatus.Rejected}: 审核失败\n` +
    `   - ${ReviewStatus.Published}: 已上线\n\n` +
    `⏱️ 数据来源：实时获取`
  );
}

/**
 * Upload image to TapTap server
 * Accepts either a local file path or base64 encoded image data
 */
export async function uploadImage(
  args: {
    filePath?: string;
    base64Data?: string;
    filename?: string;
  },
  ctx: ResolvedContext
): Promise<string> {
  let imageBuffer: Buffer;
  let filename: string;

  if (args.filePath) {
    // Handle local file path
    const pathResult = resolvePathSafe(args.filePath, ctx, {
      allowEmpty: false,
      checkExists: true,
    });

    if (!pathResult.success) {
      throw new Error(pathResult.error!.userMessage);
    }

    const resolvedPath = pathResult.resolvedPath!;

    // Check if file exists and is a file (not directory)
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error(`路径 "${args.filePath}" 不是一个文件`);
    }

    // Read file
    imageBuffer = fs.readFileSync(resolvedPath);
    filename = args.filename || path.basename(resolvedPath);
  } else if (args.base64Data) {
    // Handle base64 data
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    let base64String = args.base64Data;
    const dataUrlMatch = base64String.match(/^data:image\/(\w+);base64,(.+)$/);

    if (dataUrlMatch) {
      const ext = dataUrlMatch[1];
      base64String = dataUrlMatch[2];
      filename = args.filename || `image.${ext}`;
    } else {
      filename = args.filename || 'image.png';
    }

    // Decode base64
    imageBuffer = Buffer.from(base64String, 'base64');
  } else {
    throw new Error('必须提供 filePath（本地文件路径）或 base64Data（Base64 编码数据）');
  }

  // Validate file size (max 4MB for most images)
  const maxSize = 4 * 1024 * 1024;
  if (imageBuffer.length > maxSize) {
    throw new Error(
      `图片文件过大（${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB），最大支持 4MB`
    );
  }

  // Upload
  try {
    const url = await uploadImageApi(imageBuffer, filename, ctx);

    return `# 图片上传成功

## 📷 上传结果

- **文件名**: ${filename}
- **文件大小**: ${(imageBuffer.length / 1024).toFixed(2)} KB
- **URL**: ${url}

## 💡 使用说明

此 URL 可用于以下场景：
- \`update_app_info\` 的 \`icon\`、\`banner\`、\`screenshots\` 参数
- 其他需要图片 URL 的 API 调用

**注意**: 请在上传后尽快使用此 URL，链接可能有时效性。
`;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`上传图片失败: ${error.message}`);
    }
    throw new Error(`上传图片失败: ${String(error)}`);
  }
}
