/**
 * Application Management Handlers
 * Handles developer and app selection operations
 */

import type { HandlerContext } from '../../core/types/index.js';
import { getAllDevelopersAndApps, selectApp as selectAppApi } from './api.js';
import { clearAppCache } from '../../core/utils/cache.js';
import { clearToken } from '../../core/auth/tokenStorage.js';
import { ApiConfig } from '../../core/network/httpClient.js';

/**
 * List all developers and apps for the current user
 */
export async function listDevelopersAndApps(context: HandlerContext): Promise<string> {
  try {
    const result = await getAllDevelopersAndApps(context);

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
  context: HandlerContext
): Promise<string> {
  try {
    const result = await selectAppApi(args.developer_id, args.app_id, context.projectPath, context);

    let message = `✅ 已选择应用!\n\n` +
           `📱 应用信息:\n` +
           `- 开发者: ${result.developer_name} (ID: ${result.developer_id})\n` +
           `- 应用: ${result.app_title} (ID: ${result.app_id})\n`;

    if (result.miniapp_id) {
      message += `- Miniapp ID: ${result.miniapp_id}\n`;
    }

    message += `\n💾 此选择已缓存，后续操作将默认使用此应用。\n\n` +
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
export async function getCurrentAppInfo(context: HandlerContext): Promise<string> {
  try {
    const { readAppCache, getCachePath } = await import('../../core/utils/cache.js');
    const cache = readAppCache(context.projectPath);

    if (!cache || !cache.developer_id || !cache.app_id) {
      return `# 当前应用信息

⚠️ **尚未选择应用**

请先选择一个应用，使用以下工具：
1. \`list_developers_and_apps\` - 列出所有可用的开发者和应用
2. \`select_app\` - 选择要使用的特定应用

选择后，应用信息将被缓存并在此显示。
`;
    }

    const cachePath = getCachePath(context.projectPath);

    let info = `# 当前应用信息

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
 * Clear authentication data and app cache
 */
export async function clearAuthData(
  args: { clear_token?: boolean; clear_cache?: boolean },
  context: HandlerContext
): Promise<string> {
  const clearTokenFlag = args.clear_token !== false; // Default true
  const clearCacheFlag = args.clear_cache !== false; // Default true

  let message = `🗑️ 清理认证数据\n\n`;
  const clearedItems: string[] = [];

  // Clear OAuth token file
  if (clearTokenFlag) {
    try {
      clearToken(); // 直接调用函数
      
      // Also clear in-memory token
      const apiConfig = ApiConfig.getInstance();
      apiConfig.setMacToken({} as any);

      clearedItems.push('✅ OAuth Token 文件已清除');
    } catch (error) {
      clearedItems.push(`⚠️ OAuth Token 清除失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Clear app cache
  if (clearCacheFlag) {
    try {
      clearAppCache(context.projectPath);
      clearedItems.push('✅ 应用选择缓存已清除');
    } catch (error) {
      clearedItems.push(`⚠️ 缓存清除失败: ${error instanceof Error ? error.message : String(error)}`);
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
