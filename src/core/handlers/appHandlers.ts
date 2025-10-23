/**
 * Application Management Handlers
 * Handles developer and app selection operations
 */

import { getAllDevelopersAndApps, selectApp as selectAppApi } from '../../features/leaderboard/api.js';

/**
 * Handler context for accessing environment variables
 */
export interface HandlerContext {
  projectPath?: string;
}

/**
 * List all developers and apps for the current user
 */
export async function listDevelopersAndApps(context: HandlerContext): Promise<string> {
  try {
    const result = await getAllDevelopersAndApps();

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
    const result = await selectAppApi(args.developer_id, args.app_id, context.projectPath);

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
