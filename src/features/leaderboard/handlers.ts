/**
 * Leaderboard Management Handlers
 * Handles leaderboard operations including creation, listing, and workflow guidance
 */

import type { ResolvedContext } from '../../core/types/index.js';
import {
  createLeaderboard as createLeaderboardApi,
  listLeaderboards as listLeaderboardsApi,
  publishLeaderboard as publishLeaderboardApi,
  PeriodType,
  ScoreType,
  ScoreOrder,
  CalcType
} from './api.js';
import { SelectionRequiredError } from '../app/api.js';
import { leaderboardTools } from './docTools.js';

/**
 * Start leaderboard integration workflow - guides user through the process
 */
export async function startLeaderboardIntegration(
  _args: { purpose?: string },
  ctx: ResolvedContext
): Promise<string> {
  try {
    // Step 1: Check existing leaderboards (autoSelect = false to detect multiple apps)
    let leaderboardsResult;
    try {
      leaderboardsResult = await listLeaderboardsApi({}, ctx);
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
      // No leaderboards exist - prompt AI to analyze context and make suggestions
      return `🎯 排行榜接入流程\n\n` +
             `📋 **当前状态：** 暂无排行榜\n\n` +
             `**⚠️ AI Agent 智能引导流程：**\n\n` +
             `**第一步：分析上下文** 🔍\n` +
             `- 查看项目文件、代码、注释\n` +
             `- 识别游戏类型（如：跑酷、射击、益智、卡牌等）\n` +
             `- 推测排行榜需求\n\n` +
             `**第二步：提供智能建议** 💡\n` +
             `根据分析结果，向用户提供具体的排行榜配置建议。例如：\n` +
             `"根据您的项目分析，这是一个【游戏类型】。我建议创建【排行榜类型】：\n` +
             `- 类型：【高分榜/最佳时间/累计积分】\n` +
             `- 重置周期：【永久/每天/每周/每月】\n` +
             `- 重置时间：【具体时间】\n` +
             `这样的配置是否合适？"\n\n` +
             `**第三步：确认并创建** ✅\n` +
             `- 等待用户确认或提出修改\n` +
             `- 根据用户反馈调整配置\n` +
             `- 确认后调用 create_leaderboard 工具\n\n` +
             `**如果无法从上下文推测，则直接询问：**\n` +
             `1. 游戏类型是什么？\n` +
             `2. 需要什么类型的排名？\n` +
             `3. 是否需要定期重置？\n\n` +
             `💡 **提示：** TapTap 排行榜不需要引入任何 npm 包或 JS SDK！\n` +
             `- 客户端直接使用全局 tap 对象\n` +
             `- 无需 import 或 require\n` +
             `- TapTap 运行环境自动提供`;
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
        output += `   - 默认: ${lb.is_default ? '是' : '否'}\n\n`;
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
  ctx: ResolvedContext
): Promise<string> {
  try {
    // Resolve developer_id and app_id from context (priority: args > context > cache)
    const resolved = ctx.resolveApp();
    const developerId = args.developer_id ?? resolved.developerId;
    const appId = args.app_id ?? resolved.appId;

    if (!developerId || !appId) {
      return `❌ 无法获取 developer_id 或 app_id\n\n` +
             `请通过以下方式之一提供应用信息：\n` +
             `1. 使用 select_app 工具选择应用（会自动缓存）\n` +
             `2. 通过上下文传递\n` +
             `3. 在参数中直接指定 developer_id 和 app_id\n\n` +
             `提示：使用 list_developers_and_apps 查看可用的应用列表`;
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
    }, ctx);

    // 自动发布排行榜（将白名单模式设置为 false，使其对所有用户可见）
    try {
      await publishLeaderboardApi({
        developer_id: developerId,
        app_id: appId,
        id: result.id,
        whitelist_only: false  // 发布上线，所有用户可见
      }, ctx);
    } catch (publishError) {
      // 如果发布失败，记录警告但不阻止创建流程
      const publishErrorMsg = publishError instanceof Error ? publishError.message : String(publishError);
      return `✅ 排行榜创建成功!\n\n` +
             `📊 排行榜信息:\n` +
             `- 🆔 数据库 ID: ${result.id} (仅后台管理使用)\n` +
             `- 🎮 客户端 ID: \`${result.leaderboard_open_id}\` ⭐ (游戏代码中使用这个!)\n` +
             `- 📝 名称: ${result.title}\n\n` +
             `📝 应用信息（已缓存）:\n` +
             `- Developer ID: ${developerId}\n` +
             `- App ID: ${appId}\n\n` +
             `⚠️ **注意：** 排行榜创建成功，但自动发布失败。\n` +
             `错误信息: ${publishErrorMsg}\n` +
             `排行榜当前处于白名单模式，您可以稍后使用 publish_leaderboard 工具手动发布。\n\n` +
             `🎮 **客户端代码示例**:\n` +
             `\`\`\`javascript\n` +
             `// ⚠️ 使用客户端 ID，不是数字 ID！\n` +
             `leaderboardManager.submitScores({\n` +
             `  scores: [{ leaderboardId: "${result.leaderboard_open_id}", score: 100 }]\n` +
             `});\n` +
             `\`\`\``;
    }

    return `✅ 排行榜创建成功并已自动发布上线!\n\n` +
           `📊 排行榜信息:\n` +
           `- 🆔 数据库 ID: ${result.id} (仅后台管理使用)\n` +
           `- 🎮 客户端 ID: \`${result.leaderboard_open_id}\` ⭐ (游戏代码中使用这个!)\n` +
           `- 📝 名称: ${result.title}\n` +
           `- 🚀 状态: 已发布（所有用户可见）\n\n` +
           `📝 应用信息（已缓存）:\n` +
           `- Developer ID: ${developerId}\n` +
           `- App ID: ${appId}\n\n` +
           `🎮 **客户端代码示例**:\n` +
           `\`\`\`javascript\n` +
           `// ⚠️ 使用客户端 ID（字符串），不是数据库 ID（数字）！\n` +
           `const leaderboardManager = tap.getLeaderboardManager();\n\n` +
           `leaderboardManager.submitScores({\n` +
           `  scores: [{\n` +
           `    leaderboardId: "${result.leaderboard_open_id}",  // ← 使用这个字符串 ID\n` +
           `    score: playerScore\n` +
           `  }]\n` +
           `});\n` +
           `\`\`\`\n\n` +
           `💡 **提示：** 排行榜已自动发布上线，所有用户都可以看到和使用。`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // 解析具体错误，提供更有针对性的建议
    let specificHelp = '';

    if (errorMsg.includes('score_type') || errorMsg.includes('period_type') ||
        errorMsg.includes('score_order') || errorMsg.includes('calc_type')) {
      specificHelp = `\n⚠️ **参数错误：**\n` +
                     `所有枚举参数的值不能为 0！（0 = 未指定/无效）\n` +
                     `正确的值：\n` +
                     `- period_type: 1=永久, 2=每日, 3=每周, 4=每月\n` +
                     `- score_type: 1=数值型, 2=时间型\n` +
                     `- score_order: 1=降序(越高越好), 2=升序(越低越好)\n` +
                     `- calc_type: 1=累计, 2=最佳, 3=最新\n\n` +
                     `请使用正确的枚举值重试。`;
    } else if (errorMsg.includes('Unauthorized') || errorMsg.includes('401')) {
      specificHelp = `\n🔑 **认证错误：**\n` +
                     `请检查环境变量:\n` +
                     `- TAPTAP_MCP_MAC_TOKEN\n` +
                     `- TAPTAP_MCP_CLIENT_ID\n` +
                     `- TAPTAP_MCP_CLIENT_SECRET`;
    } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
      specificHelp = `\n🚫 **权限错误：**\n` +
                     `当前用户可能没有创建排行榜的权限，请检查开发者账号权限。`;
    }

    return `❌ 创建排行榜失败\n\n` +
           `**错误信息：**\n${errorMsg}\n${specificHelp}\n\n` +
           `**常见问题检查：**\n` +
           `1. 所有枚举参数是否使用了正确的值（不能为 0）\n` +
           `2. 环境变量是否正确配置\n` +
           `3. 用户是否有创建排行榜的权限\n` +
           `4. 是否有多个应用需要选择`;
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
  ctx: ResolvedContext
): Promise<string> {
  try {
    const result = await listLeaderboardsApi({
      developer_id: args.developer_id,
      app_id: args.app_id,
      page: args.page,
      page_size: args.page_size
    }, ctx);

    if (!result.list || result.list.length === 0) {
      return `📋 暂无排行榜\n\n您还没有创建任何排行榜。使用 create_leaderboard 工具创建第一个排行榜。`;
    }

    let output = `📋 排行榜列表 (共 ${result.total} 个)\n\n`;

    result.list.forEach((item, index) => {
      output += `${index + 1}. **${item.title}**\n`;
      output += `   - 🆔 数据库 ID: ${item.id} (⚠️ 仅后台管理使用)\n`;
      output += `   - 🎮 客户端 ID: \`${item.leaderboard_open_id}\` ⭐ (游戏代码中使用这个)\n`;
      output += `   - 📅 周期: ${item.period}\n`;
      output += `   - 🔧 默认: ${item.is_default ? 'Yes' : 'No'}\n\n`;
    });

    output += `⚠️ **重要提示**：\n`;
    output += `- 在客户端代码中使用 **客户端 ID**（leaderboard_open_id）\n`;
    output += `- 例如：\`leaderboardManager.submitScores({ scores: [{ leaderboardId: "${result.list[0]?.leaderboard_open_id}", score: 100 }] })\`\n\n`;

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
 * Publish a leaderboard or set it to whitelist-only mode
 */
export async function publishLeaderboard(
  args: {
    developer_id?: number;
    app_id?: number;
    id: number;
    publish: boolean;  // true = 发布上线, false = 仅白名单可见
  },
  ctx: ResolvedContext
): Promise<string> {
  try {
    // Resolve developer_id and app_id from context (priority: args > context > cache)
    const resolved = ctx.resolveApp();
    const developerId = args.developer_id ?? resolved.developerId;
    const appId = args.app_id ?? resolved.appId;

    if (!developerId || !appId) {
      return `❌ 无法获取 developer_id 或 app_id\n\n` +
             `请通过以下方式之一提供应用信息：\n` +
             `1. 使用 select_app 工具选择应用（会自动缓存）\n` +
             `2. 通过上下文传递\n` +
             `3. 在参数中直接指定 developer_id 和 app_id\n\n` +
             `提示：使用 list_developers_and_apps 查看可用的应用列表`;
    }

    // whitelist_only 的含义：false = 公开发布，true = 仅白名单可见
    // 所以我们需要反转用户的输入（publish = true 表示要公开发布）
    const result = await publishLeaderboardApi({
      developer_id: developerId,
      app_id: appId,
      id: args.id,
      whitelist_only: !args.publish  // 反转：publish=true 时，whitelist_only=false
    }, ctx);

    const statusText = result.whitelist_only ? '仅白名单可见' : '已公开发布';
    const emoji = result.whitelist_only ? '🔒' : '🚀';

    return `${emoji} 排行榜状态更新成功!\n\n` +
           `📊 排行榜信息:\n` +
           `- Leaderboard ID: ${result.id}\n` +
           `- 当前状态: ${statusText}\n\n` +
           `${result.whitelist_only ?
             '🔒 **仅白名单可见模式**\n' +
             '只有白名单中的用户可以看到此排行榜。\n' +
             '适合用于内测或特定用户群体。' :
             '🚀 **已公开发布**\n' +
             '所有用户都可以看到此排行榜。\n' +
             '排行榜已正式上线！'}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // 解析具体错误，提供更有针对性的建议
    let specificHelp = '';

    if (errorMsg.includes('Unauthorized') || errorMsg.includes('401')) {
      specificHelp = `\n🔑 **认证错误：**\n` +
                     `请检查环境变量:\n` +
                     `- TAPTAP_MCP_MAC_TOKEN\n` +
                     `- TAPTAP_MCP_CLIENT_ID\n` +
                     `- TAPTAP_MCP_CLIENT_SECRET`;
    } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
      specificHelp = `\n🚫 **权限错误：**\n` +
                     `当前用户可能没有修改排行榜的权限，请检查开发者账号权限。`;
    } else if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
      specificHelp = `\n🔍 **排行榜不存在：**\n` +
                     `请检查排行榜 ID (${args.id}) 是否正确。\n` +
                     `使用 list_leaderboards 查看所有可用的排行榜。`;
    }

    return `❌ 发布排行榜失败\n\n` +
           `**错误信息：**\n${errorMsg}\n${specificHelp}\n\n` +
           `**常见问题检查：**\n` +
           `1. 排行榜 ID 是否正确\n` +
           `2. 环境变量是否正确配置\n` +
           `3. 用户是否有修改排行榜的权限\n` +
           `4. 是否有多个应用需要选择`;
  }
}

/**
 * Get user leaderboard scores (requires user token)
 */
export async function getUserLeaderboardScores(
  args: { leaderboardId?: string; limit?: number },
  ctx: ResolvedContext
): Promise<string> {
  const token = await ctx.resolveToken();
  if (!token || !token.kid) {
    return `❌ 此功能需要用户登录 TapTap\n请设置 TAPTAP_MCP_MAC_TOKEN 环境变量\n\n降级为文档模式:\n${await leaderboardTools.getLeaderboardOverview()}`;
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
        'Authorization': `MAC id="${token.kid}"`,
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
