/**
 * Leaderboard Management Handlers
 * Handles leaderboard operations including creation, listing, and workflow guidance
 */

import {
  createLeaderboard as createLeaderboardApi,
  listLeaderboards as listLeaderboardsApi,
  ensureAppInfo,
  SelectionRequiredError,
  PeriodType,
  ScoreType,
  ScoreOrder,
  CalcType
} from '../network/leaderboardApi.js';
import { leaderboardTools } from '../tools/leaderboardTools.js';

/**
 * Handler context for accessing environment variables
 */
export interface HandlerContext {
  projectPath?: string;
  macToken?: any;
}

/**
 * Start leaderboard integration workflow - guides user through the process
 */
export async function startLeaderboardIntegration(
  args: { purpose?: string },
  context: HandlerContext
): Promise<string> {
  try {
    // Step 1: Check existing leaderboards (autoSelect = false to detect multiple apps)
    let leaderboardsResult;
    try {
      leaderboardsResult = await listLeaderboardsApi({}, context.projectPath);
    } catch (error) {
      // Check if this is a SelectionRequiredError
      if (error instanceof SelectionRequiredError) {
        return `🎯 排行榜接入流程\n\n` +
               `⚠️ **检测到多个开发者或应用**\n\n` +
               error.message + `\n\n` +
               `**流程说明：**\n` +
               `1. 使用 list_developers_and_apps 查看所有开发者和应用\n` +
               `2. 使用 select_app 选择要使用的应用\n` +
               `3. 再次运行 start_leaderboard_integration 继续排行榜接入流程`;
      }
      throw error;
    }

    if (!leaderboardsResult.list || leaderboardsResult.list.length === 0) {
      // No leaderboards exist - guide to create one
      return `🎯 排行榜接入流程\n\n` +
             `📋 **当前状态：** 暂无排行榜\n\n` +
             `**下一步操作：**\n` +
             `您需要先创建一个排行榜。请使用 create_leaderboard 工具创建排行榜。\n\n` +
             `**创建排行榜需要配置：**\n` +
             `1. title - 排行榜名称（如 "每周高分榜"）\n` +
             `2. period_type - 周期类型：0=每日, 1=每周, 2=每月, 3=永久\n` +
             `3. score_type - 分数类型：0=整数, 1=浮点数, 2=时间\n` +
             `4. score_order - 排序：0=升序（越低越好）, 1=降序（越高越好）\n` +
             `5. calc_type - 计算方式：0=最佳, 1=最新, 2=累计, 3=首次\n\n` +
             `💡 **建议配置示例（每周高分榜）：**\n` +
             `\`\`\`\n` +
             `title: "每周高分榜"\n` +
             `period_type: 1 (每周)\n` +
             `score_type: 0 (整数)\n` +
             `score_order: 1 (降序，分数越高越好)\n` +
             `calc_type: 0 (保留最佳成绩)\n` +
             `\`\`\``;
    }

    // Leaderboards exist - present options
    let output = `🎯 排行榜接入流程\n\n`;
    output += `📋 **当前状态：** 已有 ${leaderboardsResult.total} 个排行榜\n\n`;

    if (leaderboardsResult.list.length === 1) {
      // Only one leaderboard - recommend using it
      const lb = leaderboardsResult.list[0];
      output += `**推荐使用现有排行榜：**\n`;
      output += `- 名称: ${lb.title}\n`;
      output += `- ID: ${lb.leaderboard_open_id}\n`;
      output += `- 周期: ${lb.period}\n`;
      output += `- 默认: ${lb.is_default ? '是' : '否'}\n\n`;
      output += `**下一步：选择要实现的功能**\n`;
      output += `请告诉我您想实现以下哪个功能，我会提供相应的代码示例：\n\n`;
    } else {
      // Multiple leaderboards - let AI/user choose
      output += `**现有排行榜列表：**\n\n`;
      leaderboardsResult.list.forEach((lb, index) => {
        output += `${index + 1}. **${lb.title}**\n`;
        output += `   - ID: ${lb.leaderboard_open_id}\n`;
        output += `   - 周期: ${lb.period}\n`;
        output += `   - 默认: ${lb.is_default ? '是' : '否'}\n`;
        output += `   - 白名单: ${lb.whitelist_only ? '是' : '否'}\n\n`;
      });
      output += `**下一步：**\n`;
      output += `请选择要使用的排行榜 (通过 leaderboard_open_id)，或者告诉我您想创建新的排行榜。\n\n`;
    }

    output += `**可实现的功能：**\n`;
    output += `1. 📊 **打开排行榜界面** - 使用 open_leaderboard 工具查看文档\n`;
    output += `2. 📤 **提交玩家分数** - 使用 submit_scores 工具查看文档\n`;
    output += `3. 📥 **查询排行榜数据** - 使用 load_leaderboard_scores 工具查看文档\n`;
    output += `4. 🎯 **查询玩家排名** - 使用 load_current_player_score 工具查看文档\n`;
    output += `5. 👥 **查询周围玩家** - 使用 load_player_centered_scores 工具查看文档\n`;

    return output;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `❌ 无法获取排行榜信息:\n${errorMsg}\n\n` +
           `这可能是因为：\n` +
           `1. 用户还没有创建应用/游戏\n` +
           `2. 环境变量配置不正确\n` +
           `3. 有多个开发者或应用需要选择\n\n` +
           `请使用 list_developers_and_apps 查看可用的开发者和应用列表。`;
  }
}

/**
 * Create a new leaderboard
 */
export async function createLeaderboard(
  args: {
    developer_id?: number;
    app_id?: number;
    title: string;
    period_type: number;
    score_type: number;
    score_order: number;
    calc_type: number;
    display_limit?: number;
    period_time?: string;
    score_unit?: string;
  },
  context: HandlerContext
): Promise<string> {
  try {
    // Ensure developer_id and app_id are available
    let developerId = args.developer_id;
    let appId = args.app_id;

    // If not provided, try to get from cache or API
    if (!developerId || !appId) {
      try {
        const appInfo = await ensureAppInfo(context.projectPath, true);

        if (!developerId) {
          developerId = appInfo.developer_id;
        }

        if (!appId) {
          appId = appInfo.app_id;
        }
      } catch (error) {
        if (error instanceof SelectionRequiredError) {
          return `❌ 无法创建排行榜：需要选择应用\n\n` +
                 error.message + `\n\n` +
                 `**操作步骤：**\n` +
                 `1. 使用 list_developers_and_apps 查看所有可用的应用\n` +
                 `2. 使用 select_app 选择要使用的应用\n` +
                 `3. 再次调用 create_leaderboard 创建排行榜`;
        }
        throw error;
      }

      if (!developerId || !appId) {
        return `❌ 无法获取 developer_id 或 app_id\n\n` +
               `系统会自动从 /level/v1/list 接口获取您的应用信息。\n` +
               `如果失败，请检查：\n` +
               `1. 用户是否已创建应用/游戏\n` +
               `2. TAPTAP_MAC_TOKEN 是否有效\n` +
               `3. 您也可以手动指定 developer_id 和 app_id 参数`;
      }
    }

    const result = await createLeaderboardApi({
      developer_id: developerId,
      app_id: appId,
      title: args.title,
      period_type: args.period_type as PeriodType,
      score_type: args.score_type as ScoreType,
      score_order: args.score_order as ScoreOrder,
      calc_type: args.calc_type as CalcType,
      display_limit: args.display_limit,
      period_time: args.period_time,
      score_unit: args.score_unit
    });

    return `✅ 排行榜创建成功!\n\n` +
           `📊 排行榜信息:\n` +
           `- Leaderboard ID: ${result.leaderboard_id}\n` +
           `- Open ID: ${result.open_id}\n` +
           `- Title: ${result.title}\n` +
           `- Status: ${result.default_status}\n\n` +
           `📝 应用信息（已缓存）:\n` +
           `- Developer ID: ${developerId}\n` +
           `- App ID: ${appId}\n\n` +
           `🎮 使用方法:\n` +
           `在小游戏中使用 leaderboardId "${result.leaderboard_id}" 来调用排行榜 API`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `❌ 创建排行榜失败:\n${errorMsg}\n\n请检查:\n1. 环境变量是否正确配置（TAPTAP_MAC_TOKEN, TAPTAP_CLIENT_ID, TAPTAP_CLIENT_SECRET）\n2. 用户是否已创建应用/游戏\n3. 用户是否有创建排行榜的权限\n4. 是否有多个应用需要选择 (使用 list_developers_and_apps 查看)`;
  }
}

/**
 * List all leaderboards for the current app
 */
export async function listLeaderboards(
  args: {
    developer_id?: number;
    app_id?: number;
    page?: number;
    page_size?: number;
  },
  context: HandlerContext
): Promise<string> {
  try {
    const result = await listLeaderboardsApi({
      developer_id: args.developer_id,
      app_id: args.app_id,
      page: args.page,
      page_size: args.page_size
    }, context.projectPath);

    if (!result.list || result.list.length === 0) {
      return `📋 暂无排行榜\n\n您还没有创建任何排行榜。使用 create_leaderboard 工具创建第一个排行榜。`;
    }

    let output = `📋 排行榜列表 (共 ${result.total} 个)\n\n`;

    result.list.forEach((item, index) => {
      output += `${index + 1}. **${item.title}**\n`;
      output += `   - ID: ${item.id}\n`;
      output += `   - Open ID: ${item.leaderboard_open_id}\n`;
      output += `   - Period: ${item.period}\n`;
      output += `   - Default: ${item.is_default ? 'Yes' : 'No'}\n`;
      output += `   - Whitelist Only: ${item.whitelist_only ? 'Yes' : 'No'}\n\n`;
    });

    const currentPage = args.page || 1;
    const pageSize = args.page_size || 10;
    const totalPages = Math.ceil(result.total / pageSize);

    if (totalPages > 1) {
      output += `\n📄 Page ${currentPage} of ${totalPages}\n`;
      if (currentPage < totalPages) {
        output += `Use page=${currentPage + 1} to see more results.\n`;
      }
    }

    return output;
  } catch (error) {
    if (error instanceof SelectionRequiredError) {
      return `❌ 无法查询排行榜列表：需要选择应用\n\n` +
             error.message + `\n\n` +
             `**操作步骤：**\n` +
             `1. 使用 list_developers_and_apps 查看所有可用的应用\n` +
             `2. 使用 select_app 选择要使用的应用\n` +
             `3. 再次调用 list_leaderboards 查询排行榜列表`;
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    return `❌ 查询排行榜列表失败:\n${errorMsg}`;
  }
}

/**
 * Get user leaderboard scores (requires user token)
 */
export async function getUserLeaderboardScores(
  args: { leaderboardId?: string; limit?: number },
  context: HandlerContext
): Promise<string> {
  if (!context.macToken || !context.macToken.kid) {
    return `❌ 此功能需要用户登录 TapTap\n请设置 TAPTAP_MAC_TOKEN 环境变量\n\n降级为文档模式:\n${await leaderboardTools.getLeaderboardOverview()}`;
  }

  try {
    // 模拟 API 调用（实际项目中替换为真实 API）
    const url = args.leaderboardId
      ? `https://api.taptap.com/leaderboard/${args.leaderboardId}/scores`
      : 'https://api.taptap.com/leaderboard/user-scores';

    // @ts-ignore - fetch 在 Node.js 18+ 中可用
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `MAC id="${context.macToken.kid}"`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API 调用失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return `🏆 用户排行榜数据:\n${JSON.stringify(data, null, 2)}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `❌ API 调用失败: ${errorMsg}\n\n降级为文档模式:\n${await leaderboardTools.getLeaderboardOverview()}`;
  }
}
