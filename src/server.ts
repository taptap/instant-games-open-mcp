#!/usr/bin/env node

/**
 * TapTap 小游戏开发文档 MCP 服务器 - Node.js 版本
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import process from 'node:process';

// 导入配置和工具定义
import { ApiConfig } from './network/httpClient.js';
import { getToolDefinitions } from './config/toolDefinitions.js';
import { getResourceDefinitions, RESOURCE_URI_MAP } from './config/resourceDefinitions.js';
import { getPromptDefinitions } from './config/promptDefinitions.js';
import { logger } from './utils/logger.js';

// 导入文档工具
import { leaderboardTools } from './tools/leaderboardTools.js';

// 导入各类处理器
import * as appHandlers from './handlers/appHandlers.js';
import * as leaderboardHandlers from './handlers/leaderboardHandlers.js';
import * as environmentHandlers from './handlers/environmentHandlers.js';
import * as promptHandlers from './handlers/promptHandlers.js';

// 环境变量配置
const apiConfig = ApiConfig.getInstance();
const TDS_MCP_MAC_TOKEN = apiConfig.macToken;
const TDS_MCP_PROJECT_PATH = process.env.TDS_MCP_PROJECT_PATH;

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
        version: '1.1.3',
      }
    );

    this.context = {
      projectPath: TDS_MCP_PROJECT_PATH,
      macToken: TDS_MCP_MAC_TOKEN
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

    // 设置资源列表处理器
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: getResourceDefinitions()
    }));

    // 设置资源读取处理器
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      logger.logToolCall(`ReadResource: ${uri}`, {});

      try {
        const content = await this.handleResourceRead(uri);

        logger.logToolResponse(`ReadResource: ${uri}`, content.substring(0, 500), true);

        return {
          contents: [
            {
              uri: uri,
              mimeType: 'text/markdown',
              text: content
            }
          ]
        };
      } catch (error) {
        logger.logToolResponse(`ReadResource: ${uri}`, error instanceof Error ? error.message : String(error), false);

        throw new McpError(
          ErrorCode.InternalError,
          `资源读取失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // 设置提示列表处理器
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: getPromptDefinitions()
    }));

    // 设置提示获取处理器
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.logToolCall(`GetPrompt: ${name}`, args || {});

      try {
        const prompt = await this.handlePromptGet(name, args || {});

        logger.logToolResponse(`GetPrompt: ${name}`, JSON.stringify(prompt).substring(0, 500), true);

        return prompt;
      } catch (error) {
        logger.logToolResponse(`GetPrompt: ${name}`, error instanceof Error ? error.message : String(error), false);

        throw new McpError(
          ErrorCode.InternalError,
          `提示获取失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * 处理资源读取 - 路由到对应的文档工具
   */
  private async handleResourceRead(uri: string): Promise<string> {
    const handlerKey = RESOURCE_URI_MAP[uri];

    if (!handlerKey) {
      throw new Error(`Unknown resource URI: ${uri}`);
    }

    // Map to leaderboardTools methods
    const toolMethod = (leaderboardTools as any)[handlerKey];
    if (typeof toolMethod !== 'function') {
      throw new Error(`Handler not found for resource: ${uri}`);
    }

    return await toolMethod();
  }

  /**
   * 处理提示获取 - 路由到对应的提示处理器
   */
  private async handlePromptGet(name: string, args: any): Promise<any> {
    if (name === 'leaderboard-integration') {
      return promptHandlers.getLeaderboardIntegrationPrompt(args);
    }

    if (name === 'leaderboard-troubleshooting') {
      return promptHandlers.getLeaderboardTroubleshootingPrompt(args);
    }

    throw new Error(`Unknown prompt: ${name}`);
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
    if (name === 'publish_leaderboard') {
      return leaderboardHandlers.publishLeaderboard(args, this.context);
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
    const resources = getResourceDefinitions();
    const prompts = getPromptDefinitions();

    process.stderr.write('🚀 TapTap Minigame MCP Server Started\n');
    process.stderr.write(`📚 Providing ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts\n`);
    process.stderr.write('🏆 Features: Leaderboard Documentation & Management API\n');
    process.stderr.write(`🌍 Environment: ${apiConfig.environment}\n`);
    process.stderr.write(`🔗 API Base: ${apiConfig.apiBaseUrl}\n`);
    process.stderr.write('\n📖 MCP Capabilities:\n');
    process.stderr.write(`   ✅ Tools (${tools.length}) - Execute operations with side effects\n`);
    process.stderr.write(`   ✅ Resources (${resources.length}) - Read-only documentation and data\n`);
    process.stderr.write(`   ✅ Prompts (${prompts.length}) - Reusable workflow templates\n`);

    if (logger.isVerbose()) {
      process.stderr.write('\n🔍 Verbose logging enabled (TAPTAP_MINIGAME_MCP_VERBOSE=true)\n');
      process.stderr.write('   - Tool call inputs and outputs will be logged\n');
      process.stderr.write('   - HTTP requests and responses will be logged\n');
    } else {
      process.stderr.write('\n💡 Tip: Set TAPTAP_MINIGAME_MCP_VERBOSE=true for detailed logs\n');
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
