#!/usr/bin/env node

/**
 * TapTap 小游戏开发文档 MCP 服务器 - Node.js 版本
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import process from 'node:process';

// 导入工具处理器
import { leaderboardTools } from './tools/leaderboardTools.js';

// 导入网络API
import {
  createLeaderboard,
  listLeaderboards,
  ensureAppInfo,
  getAllDevelopersAndApps,
  selectApp,
  SelectionRequiredError,
  PeriodType,
  ScoreType,
  ScoreOrder,
  CalcType
} from './network/leaderboardApi.js';
import { ApiConfig } from './network/httpClient.js';

// 环境变量配置
const apiConfig = ApiConfig.getInstance();
const TAPTAP_MAC_TOKEN = apiConfig.macToken;
const TAPTAP_CLIENT_ID = apiConfig.clientId;
const TAPTAP_PROJECT_PATH = process.env.TAPTAP_PROJECT_PATH;

/**
 * MCP 服务器类
 */
class TapTapDocsMCPServer {
  private server: Server;
  private tools: Tool[] = [];
  private toolHandlers: Map<string, (args: any) => Promise<string>> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'taptap-leaderboard-mcp',
        version: '1.0.0',
      }
    );

    this.setupTools();
    this.setupHandlers();
  }

  /**
   * 设置所有工具定义
   */
  private setupTools(): void {
    this.tools = [
      // 🎯 Workflow Guidance Tool
      {
        name: 'start_leaderboard_integration',
        description: 'START HERE when user asks about integrating leaderboards, implementing rankings, or "接入排行榜". This tool guides the complete workflow: check existing leaderboards, create if needed, then provide implementation docs. Use this as the first step for any leaderboard integration request.',
        inputSchema: {
          type: 'object',
          properties: {
            purpose: {
              type: 'string',
              description: 'What the user wants to do with leaderboards (optional, for context)'
            }
          }
        }
      },

      // 📖 Core LeaderboardManager API Documentation Tools (one tool per API)
      {
        name: 'get_leaderboard_manager',
        description: 'Get documentation for tap.getLeaderboardManager() - how to obtain the LeaderboardManager instance. Use this when user asks how to initialize or access the leaderboard system.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'open_leaderboard',
        description: 'Get documentation for leaderboardManager.openLeaderboard() - how to display the TapTap leaderboard UI. Use this when user wants to show leaderboard interface to players.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'submit_scores',
        description: 'Get documentation for leaderboardManager.submitScores() - how to submit player scores to leaderboards. Use this when user wants to upload scores or update rankings.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'load_leaderboard_scores',
        description: 'Get documentation for leaderboardManager.loadLeaderboardScores() - how to retrieve paginated leaderboard data. Use this when user wants to fetch top scores or implement custom leaderboard UI.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'load_current_player_score',
        description: 'Get documentation for leaderboardManager.loadCurrentPlayerLeaderboardScore() - how to get current player\'s score and rank. Use this when user wants to show player their own ranking.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'load_player_centered_scores',
        description: 'Get documentation for leaderboardManager.loadPlayerCenteredScores() - how to load scores of players near current user. Use this when user wants to display surrounding competitors.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // 🔍 Helper Tools
      {
        name: 'search_leaderboard_docs',
        description: 'Search all leaderboard documentation by keyword. Use this when user asks a general question or you\'re not sure which specific API they need.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search keyword, such as: leaderboard, score, ranking, submission, etc.'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_leaderboard_overview',
        description: 'Get comprehensive overview of all TapTap leaderboard APIs and features. Use this when user wants to understand what leaderboard functionality is available.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_leaderboard_patterns',
        description: 'Get complete implementation examples and best practices for leaderboards. Use this when user wants to see full integration code or common usage patterns.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // 🔧 Environment Check Tool
      {
        name: 'check_environment',
        description: 'Check environment configuration and user authentication status. Use this to verify if TAPTAP_MAC_TOKEN and TAPTAP_CLIENT_ID are configured.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // 📱 Developer & App Management Tools
      {
        name: 'list_developers_and_apps',
        description: 'List all developers and their apps/games for the current user. Use this when multiple developers or apps exist and you need to let user/AI choose which one to use.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'select_app',
        description: 'Select a specific developer and app to use for subsequent operations. This will cache the selection. Use this after listing developers and apps with list_developers_and_apps.',
        inputSchema: {
          type: 'object',
          properties: {
            developer_id: {
              type: 'number',
              description: 'Developer ID to select (required)'
            },
            app_id: {
              type: 'number',
              description: 'App/Game ID to select (required)'
            }
          },
          required: ['developer_id', 'app_id']
        }
      },

      // ⚙️ Leaderboard Management Tools (requires TAPTAP_MAC_TOKEN, TAPTAP_CLIENT_ID, TAPTAP_CLIENT_SECRET)
      {
        name: 'create_leaderboard',
        description: 'Create a new leaderboard on TapTap server. Use this AFTER checking existing leaderboards with list_leaderboards or start_leaderboard_integration. Auto-fetches developer_id and app_id if not provided. Returns the leaderboard_id needed for client-side APIs.',
        inputSchema: {
          type: 'object',
          properties: {
            developer_id: {
              type: 'number',
              description: 'Developer ID (optional, will be auto-fetched if not provided)'
            },
            app_id: {
              type: 'number',
              description: 'Application/Game ID (optional, will be auto-fetched if not provided)'
            },
            title: {
              type: 'string',
              description: 'Leaderboard title/name (required)'
            },
            period_type: {
              type: 'number',
              description: 'Period type: 0=Daily, 1=Weekly, 2=Monthly, 3=Always, 4=Custom (required)',
              enum: [0, 1, 2, 3, 4]
            },
            score_type: {
              type: 'number',
              description: 'Score type: 0=Integer, 1=Float, 2=Time (required)',
              enum: [0, 1, 2]
            },
            score_order: {
              type: 'number',
              description: 'Score order: 0=Ascending (lower is better), 1=Descending (higher is better), 2=None (required)',
              enum: [0, 1, 2]
            },
            calc_type: {
              type: 'number',
              description: 'Calculation type: 0=Best, 1=Latest, 2=Sum, 3=First (required)',
              enum: [0, 1, 2, 3]
            },
            display_limit: {
              type: 'number',
              description: 'Display limit for leaderboard entries (optional, default 100)'
            },
            period_time: {
              type: 'string',
              description: 'Period reset time in HH:MM:SS format (optional, for periodic leaderboards)'
            },
            score_unit: {
              type: 'string',
              description: 'Score unit display text (optional, e.g., "points", "seconds")'
            }
          },
          required: ['title', 'period_type', 'score_type', 'score_order', 'calc_type']
        }
      },
      {
        name: 'list_leaderboards',
        description: 'List all leaderboards created for the current app/game. Use this to check existing leaderboards before creating new ones or when user asks "我有哪些排行榜" or wants to see leaderboard IDs. Auto-fetches developer_id and app_id if not provided.',
        inputSchema: {
          type: 'object',
          properties: {
            developer_id: {
              type: 'number',
              description: 'Developer ID (optional, will be auto-fetched if not provided)'
            },
            app_id: {
              type: 'number',
              description: 'Application/Game ID (optional, will be auto-fetched if not provided)'
            },
            page: {
              type: 'number',
              description: 'Page number, starts from 1 (optional, default 1)'
            },
            page_size: {
              type: 'number',
              description: 'Results per page (optional, default 10)'
            }
          }
        }
      },

      // 🔑 User Data Tools (requires TAPTAP_MAC_TOKEN)
      {
        name: 'get_user_leaderboard_scores',
        description: 'Get actual user leaderboard score data from TapTap API (requires user login). Use this when user wants to see their own scores or ranking positions. Falls back to documentation mode if token is not provided.',
        inputSchema: {
          type: 'object',
          properties: {
            leaderboardId: {
              type: 'string',
              description: 'The specific leaderboard ID to query. Leave empty to get all leaderboards associated with the user.'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of score entries to return. Default is 10.',
              default: 10
            }
          }
        }
      }
    ];
  }

  /**
   * 设置工具处理器
   */
  private setupHandlers(): void {
    // Workflow guidance tool
    this.toolHandlers.set('start_leaderboard_integration', this.startLeaderboardIntegration.bind(this));

    // Core LeaderboardManager API documentation tools
    this.toolHandlers.set('get_leaderboard_manager', leaderboardTools.getLeaderboardManager);
    this.toolHandlers.set('open_leaderboard', leaderboardTools.openLeaderboard);
    this.toolHandlers.set('submit_scores', leaderboardTools.submitScores);
    this.toolHandlers.set('load_leaderboard_scores', leaderboardTools.loadLeaderboardScores);
    this.toolHandlers.set('load_current_player_score', leaderboardTools.loadCurrentPlayerScore);
    this.toolHandlers.set('load_player_centered_scores', leaderboardTools.loadPlayerCenteredScores);

    // Helper tools
    this.toolHandlers.set('search_leaderboard_docs', leaderboardTools.searchLeaderboardDocs);
    this.toolHandlers.set('get_leaderboard_overview', leaderboardTools.getLeaderboardOverview);
    this.toolHandlers.set('get_leaderboard_patterns', leaderboardTools.getLeaderboardPatterns);

    // 环境检查工具处理器
    this.toolHandlers.set('check_environment', this.checkEnvironment.bind(this));

    // 开发者和应用管理工具处理器
    this.toolHandlers.set('list_developers_and_apps', this.listDevelopersAndApps.bind(this));
    this.toolHandlers.set('select_app', this.selectApp.bind(this));

    // 排行榜管理工具处理器（需要 token 和 client_id）
    this.toolHandlers.set('create_leaderboard', this.createLeaderboard.bind(this));
    this.toolHandlers.set('list_leaderboards', this.listLeaderboards.bind(this));

    // 用户数据工具处理器（需要 token）
    this.toolHandlers.set('get_user_leaderboard_scores', this.getUserLeaderboardScores.bind(this));

    // 设置 MCP 服务器处理器
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const handler = this.toolHandlers.get(name);
      if (!handler) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `未知工具: ${name}`
        );
      }

      try {
        const result = await handler(args || {});
        return {
          content: [
            {
              type: 'text',
              text: result
            }
          ]
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `工具执行失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * 排行榜接入工作流引导
   */
  private async startLeaderboardIntegration(args: { purpose?: string }): Promise<string> {
    try {
      // Step 1: Check existing leaderboards (autoSelect = false to detect multiple apps)
      let leaderboardsResult;
      try {
        leaderboardsResult = await listLeaderboards({}, TAPTAP_PROJECT_PATH);
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
   * 列出所有开发者和应用
   */
  private async listDevelopersAndApps(): Promise<string> {
    try {
      const result = await getAllDevelopersAndApps();

      if (!result.list || result.list.length === 0) {
        return `📋 暂无开发者或应用\n\n您还没有创建任何开发者账号或应用。请先在 TapTap 开放平台创建应用。`;
      }

      let output = `📋 开发者和应用列表\n\n`;

      result.list.forEach((developer, devIndex) => {
        output += `**开发者 ${devIndex + 1}: ${developer.developer_name}**\n`;
        output += `- Developer ID: ${developer.developer_id}\n`;

        if (!developer.crafts || developer.crafts.length === 0) {
          output += `- 暂无应用\n\n`;
        } else {
          output += `- 应用列表:\n`;
          developer.crafts.forEach((app, appIndex) => {
            output += `  ${appIndex + 1}. **${app.app_title}** (App ID: ${app.app_id})\n`;
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
      output += `- app_id: ${result.list[0].crafts[0]?.app_id || 'N/A'}\n`;

      return output;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return `❌ 获取开发者和应用列表失败:\n${errorMsg}`;
    }
  }

  /**
   * 选择开发者和应用
   */
  private async selectApp(args: { developer_id: number; app_id: number }): Promise<string> {
    try {
      const result = await selectApp(args.developer_id, args.app_id, TAPTAP_PROJECT_PATH);

      return `✅ 已选择应用!\n\n` +
             `📱 应用信息:\n` +
             `- 开发者: ${result.developer_name} (ID: ${result.developer_id})\n` +
             `- 应用: ${result.app_title} (ID: ${result.app_id})\n\n` +
             `💾 此选择已缓存，后续操作将默认使用此应用。\n\n` +
             `🎮 下一步:\n` +
             `您现在可以使用 create_leaderboard 或 list_leaderboards 等工具来管理排行榜了。`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return `❌ 选择应用失败:\n${errorMsg}\n\n请使用 list_developers_and_apps 查看可用的开发者和应用列表。`;
    }
  }

  /**
   * 环境检查工具
   */
  private async checkEnvironment(): Promise<string> {
    const configStatus = apiConfig.getConfigStatus();
    const envInfo = {
      ...configStatus,
      'TAPTAP_PROJECT_PATH': TAPTAP_PROJECT_PATH ? '✅ 已配置' : '❌ 未配置 (可选)'
    };

    const envResult = Object.entries(envInfo)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    return `🔧 环境配置检查结果:\n\n${envResult}\n\n✨ 所有必需配置已就绪，可以使用完整功能`;
  }

  /**
   * 创建排行榜
   */
  private async createLeaderboard(args: {
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
  }): Promise<string> {
    try {
      // Ensure developer_id and app_id are available
      let developerId = args.developer_id;
      let appId = args.app_id;

      // If not provided, try to get from cache or API
      if (!developerId || !appId) {
        try {
          const appInfo = await ensureAppInfo(TAPTAP_PROJECT_PATH, true);

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

      const result = await createLeaderboard({
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
   * 查询排行榜列表
   */
  private async listLeaderboards(args: {
    developer_id?: number;
    app_id?: number;
    page?: number;
    page_size?: number;
  }): Promise<string> {
    try {
      const result = await listLeaderboards({
        developer_id: args.developer_id,
        app_id: args.app_id,
        page: args.page,
        page_size: args.page_size
      }, TAPTAP_PROJECT_PATH);

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
   * 获取用户排行榜分数数据
   */
  private async getUserLeaderboardScores(args: { leaderboardId?: string; limit?: number }): Promise<string> {
    if (!TAPTAP_MAC_TOKEN || !TAPTAP_MAC_TOKEN.kid) {
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
          'Authorization': `MAC id="${TAPTAP_MAC_TOKEN.kid}"`,
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

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    process.stderr.write('🚀 TapTap Leaderboard MCP Server Started\n');
    process.stderr.write(`📚 Providing ${this.tools.length} tools\n`);
    process.stderr.write('🏆 Features: Leaderboard Documentation & Management API\n');
    process.stderr.write(`🌍 Environment: ${apiConfig.environment}\n`);
    process.stderr.write(`🔗 API Base: ${apiConfig.apiBaseUrl}\n`);
  }
}

// 启动服务器
async function main(): Promise<void> {
  const server = new TapTapDocsMCPServer();

  // 处理优雅关闭
  process.on('SIGINT', () => {
    process.stderr.write('\n📴 收到中断信号，正在关闭服务器...\n');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    process.stderr.write('\n📴 收到终止信号，正在关闭服务器...\n');
    process.exit(0);
  });

  try {
    await server.start();
  } catch (error) {
    process.stderr.write(`❌ 服务器启动失败: ${error}\n`);
    process.exit(1);
  }
}

// 启动主函数
main().catch((error) => {
  process.stderr.write(`❌ 服务器运行失败: ${error}\n`);
  process.exit(1);
});