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
import { createLeaderboard, ensureAppInfo, PeriodType, ScoreType, ScoreOrder, CalcType } from './network/leaderboardApi.js';
import { ApiConfig } from './network/httpClient.js';

// 环境变量配置
const apiConfig = ApiConfig.getInstance();
const TAPTAP_USER_TOKEN = apiConfig.userToken;
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
        name: 'taptap-docs-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
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
        description: 'Check environment configuration and user authentication status. Use this to verify if TAPTAP_USER_TOKEN and TAPTAP_CLIENT_ID are configured.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // ⚙️ Leaderboard Management Tools (requires TAPTAP_USER_TOKEN and TAPTAP_CLIENT_ID)
      {
        name: 'create_leaderboard',
        description: 'Create a new leaderboard on TapTap server. Use this when user needs to create a leaderboard before using it in their minigame. If developer_id and app_id are not provided, they will be automatically fetched and cached.',
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

      // 🔑 User Data Tools (requires TAPTAP_USER_TOKEN)
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

    // 排行榜管理工具处理器（需要 token 和 client_id）
    this.toolHandlers.set('create_leaderboard', this.createLeaderboard.bind(this));

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
        const appInfo = await ensureAppInfo(TAPTAP_PROJECT_PATH);

        if (!developerId) {
          developerId = appInfo.developer_id;
        }

        if (!appId) {
          appId = appInfo.app_id;
        }

        if (!developerId || !appId) {
          return `❌ 无法获取 developer_id 或 app_id\n\n` +
                 `系统会自动从 /level/v1/list 接口获取您的应用信息。\n` +
                 `如果失败，请检查：\n` +
                 `1. 用户是否已创建应用/游戏\n` +
                 `2. TAPTAP_USER_TOKEN 是否有效\n` +
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
      return `❌ 创建排行榜失败:\n${errorMsg}\n\n请检查:\n1. 环境变量是否正确配置（TAPTAP_USER_TOKEN, TAPTAP_CLIENT_ID, TAPTAP_CLIENT_SECRET）\n2. 用户是否已创建应用/游戏\n3. 用户是否有创建排行榜的权限`;
    }
  }

  /**
   * 获取用户排行榜分数数据
   */
  private async getUserLeaderboardScores(args: { leaderboardId?: string; limit?: number }): Promise<string> {
    if (!TAPTAP_USER_TOKEN) {
      return `❌ 此功能需要用户登录 TapTap\n请设置 TAPTAP_USER_TOKEN 环境变量\n\n降级为文档模式:\n${await leaderboardTools.getLeaderboardOverview({})}`;
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
          'Authorization': `Bearer ${TAPTAP_USER_TOKEN}`,
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
      return `❌ API 调用失败: ${errorMsg}\n\n降级为文档模式:\n${await leaderboardTools.getLeaderboardOverview({})}`;
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