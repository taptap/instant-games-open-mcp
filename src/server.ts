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
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import process from 'node:process';

// 导入配置和工具定义
import { ApiConfig } from './network/httpClient.js';
import { getToolDefinitions } from './config/toolDefinitions.js';
import { logger } from './utils/logger.js';

// 导入文档工具
import { leaderboardTools } from './tools/leaderboardTools.js';

// 导入各类处理器
import * as appHandlers from './handlers/appHandlers.js';
import * as leaderboardHandlers from './handlers/leaderboardHandlers.js';
import * as environmentHandlers from './handlers/environmentHandlers.js';

// 环境变量配置
const apiConfig = ApiConfig.getInstance();
const TAPTAP_MAC_TOKEN = apiConfig.macToken;
const TAPTAP_PROJECT_PATH = process.env.TAPTAP_PROJECT_PATH;

/**
 * Handler context type
 */
interface HandlerContext {
  projectPath?: string;
  macToken?: any;
}

/**
 * TapTap 小游戏 MCP 服务器
 */
class TapTapMinigameMCPServer {
  private server: Server;
  private context: HandlerContext;

  constructor() {
    this.server = new Server(
      {
        name: 'taptap-minigame-mcp',
        version: '1.0.3',
      }
    );

    this.context = {
      projectPath: TAPTAP_PROJECT_PATH,
      macToken: TAPTAP_MAC_TOKEN
    };

    this.setupHandlers();
  }

  /**
   * 设置请求处理器
   */
  private setupHandlers(): void {
    // 设置工具列表处理器
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getToolDefinitions()
    }));

    // 设置工具调用处理器
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Log tool call input
      logger.logToolCall(name, args || {});

      try {
        const result = await this.handleToolCall(name, args || {});

        // Log tool call output
        logger.logToolResponse(name, result, true);

        return {
          content: [
            {
              type: 'text',
              text: result
            }
          ]
        };
      } catch (error) {
        // Log tool call error
        logger.logToolResponse(name, error instanceof Error ? error.message : String(error), false);

        throw new McpError(
          ErrorCode.InternalError,
          `工具执行失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * 处理工具调用 - 路由到对应的处理器
   */
  private async handleToolCall(name: string, args: any): Promise<string> {
    // Workflow guidance
    if (name === 'start_leaderboard_integration') {
      return leaderboardHandlers.startLeaderboardIntegration(args, this.context);
    }

    // LeaderboardManager API documentation tools
    if (name === 'get_leaderboard_manager') {
      return leaderboardTools.getLeaderboardManager();
    }
    if (name === 'open_leaderboard') {
      return leaderboardTools.openLeaderboard();
    }
    if (name === 'submit_scores') {
      return leaderboardTools.submitScores();
    }
    if (name === 'load_leaderboard_scores') {
      return leaderboardTools.loadLeaderboardScores();
    }
    if (name === 'load_current_player_score') {
      return leaderboardTools.loadCurrentPlayerScore();
    }
    if (name === 'load_player_centered_scores') {
      return leaderboardTools.loadPlayerCenteredScores();
    }

    // Helper tools
    if (name === 'search_leaderboard_docs') {
      return leaderboardTools.searchLeaderboardDocs(args);
    }
    if (name === 'get_leaderboard_overview') {
      return leaderboardTools.getLeaderboardOverview();
    }
    if (name === 'get_leaderboard_patterns') {
      return leaderboardTools.getLeaderboardPatterns();
    }

    // Environment check
    if (name === 'check_environment') {
      return environmentHandlers.checkEnvironment(this.context);
    }

    // App management tools
    if (name === 'list_developers_and_apps') {
      return appHandlers.listDevelopersAndApps(this.context);
    }
    if (name === 'select_app') {
      return appHandlers.selectApp(args, this.context);
    }

    // Leaderboard management tools
    if (name === 'create_leaderboard') {
      return leaderboardHandlers.createLeaderboard(args, this.context);
    }
    if (name === 'list_leaderboards') {
      return leaderboardHandlers.listLeaderboards(args, this.context);
    }

    // User data tools
    if (name === 'get_user_leaderboard_scores') {
      return leaderboardHandlers.getUserLeaderboardScores(args, this.context);
    }

    // Unknown tool
    throw new McpError(
      ErrorCode.MethodNotFound,
      `未知工具: ${name}`
    );
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    const tools = getToolDefinitions();
    process.stderr.write('🚀 TapTap Minigame MCP Server Started\n');
    process.stderr.write(`📚 Providing ${tools.length} tools\n`);
    process.stderr.write('🏆 Features: Leaderboard Documentation & Management API\n');
    process.stderr.write(`🌍 Environment: ${apiConfig.environment}\n`);
    process.stderr.write(`🔗 API Base: ${apiConfig.apiBaseUrl}\n`);

    if (logger.isVerbose()) {
      process.stderr.write('🔍 Verbose logging enabled (TAPTAP_MINIGAME_MCP_VERBOSE=true)\n');
      process.stderr.write('   - Tool call inputs and outputs will be logged\n');
      process.stderr.write('   - HTTP requests and responses will be logged\n');
    } else {
      process.stderr.write('💡 Tip: Set TAPTAP_MINIGAME_MCP_VERBOSE=true for detailed logs\n');
    }
  }
}

// 启动服务器
async function main(): Promise<void> {
  const server = new TapTapMinigameMCPServer();

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
