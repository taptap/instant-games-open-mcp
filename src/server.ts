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
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import process from 'node:process';

// 导入配置和工具定义
import { ApiConfig } from './network/httpClient.js';
import { getToolDefinitions } from './config/toolDefinitions.js';
import { getResourceDefinitions, RESOURCE_URI_MAP } from './config/resourceDefinitions.js';
import { logger } from './utils/logger.js';
import { DeviceFlowAuth } from './auth/deviceFlow.js';

// 导入文档工具
import { leaderboardTools } from './tools/leaderboardTools.js';

// 导入各类处理器
import * as appHandlers from './handlers/appHandlers.js';
import * as leaderboardHandlers from './handlers/leaderboardHandlers.js';
import * as environmentHandlers from './handlers/environmentHandlers.js';

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
  private ensureAuth: () => Promise<void>;

  constructor(ensureAuthFn: () => Promise<void>) {
    this.server = new Server(
      {
        name: 'taptap-minigame-mcp',
        version: '1.2.0-beta.10',
      }
    );

    this.context = {
      projectPath: TDS_MCP_PROJECT_PATH,
      macToken: TDS_MCP_MAC_TOKEN
    };

    this.ensureAuth = ensureAuthFn;
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
        // Check if this tool requires authentication
        const authRequiredTools = [
          'list_developers_and_apps',
          'select_app',
          'create_leaderboard',
          'list_leaderboards',
          'publish_leaderboard',
          'get_user_leaderboard_scores'
        ];

        if (authRequiredTools.includes(name)) {
          // Trigger OAuth if needed (non-blocking on startup, blocking here)
          try {
            await this.ensureAuth();
          } catch (authError) {
            const errorMsg = authError instanceof Error ? authError.message : String(authError);

            // If it's an OAuth error, provide user-friendly message with next steps
            throw new McpError(
              ErrorCode.InternalError,
              `🔐 需要 TapTap 授权\n\n${errorMsg}\n\n` +
              `📋 授权步骤：\n` +
              `1. 在浏览器中打开上面的授权链接\n` +
              `2. 使用 TapTap App 扫码授权\n` +
              `3. 授权成功后，调用 complete_oauth_authorization 工具完成授权\n` +
              `4. 然后重新执行此操作`
            );
          }
        }

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
   * 处理工具调用 - 路由到对应的处理器
   */
  private async handleToolCall(name: string, args: any): Promise<string> {
    // Integration guide tool (for MCP clients that dont auto-read Resources)
    if (name === 'get_integration_guide') {
      return leaderboardTools.getIntegrationWorkflow();
    }



    // App information
    if (name === 'get_current_app_info') {
      return leaderboardTools.getCurrentAppInfo();
    }

    // Environment check
    if (name === 'check_environment') {
      return environmentHandlers.checkEnvironment(this.context);
    }

    // OAuth authorization completion
    if (name === 'complete_oauth_authorization') {
      if (!deviceAuth) {
        return '❌ No pending authorization found.\n\nPlease call a tool that requires authentication (like list_developers_and_apps) first to start the authorization flow.';
      }

      try {
        const macToken = await deviceAuth.completeAuthorization();
        const apiConfig = ApiConfig.getInstance();
        apiConfig.setMacToken(macToken);

        return '✅ 授权完成！\n\n' +
               'Token 已成功保存，现在可以使用所有需要认证的功能了。\n\n' +
               '请重新执行之前失败的操作。';
      } catch (error) {
        return `❌ 授权失败: ${error instanceof Error ? error.message : String(error)}\n\n` +
               '请确认：\n' +
               '1. 已在浏览器中打开授权链接\n' +
               '2. 已使用 TapTap App 扫码授权\n' +
               '3. 授权页面显示成功\n\n' +
               '如果仍然失败，请重新调用需要认证的工具获取新的授权链接。';
      }
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
    

    process.stderr.write('🚀 TapTap Open API MCP Server Started (Minigame & H5) [LOCAL-DEBUG]\n');
    process.stderr.write(`📚 Providing ${tools.length} tools, ${resources.length} resources\n`);
    process.stderr.write('🏆 Features: Leaderboard Documentation & Management API\n');
    process.stderr.write(`🌍 Environment: ${apiConfig.environment}\n`);
    process.stderr.write(`🔗 API Base: ${apiConfig.apiBaseUrl}\n`);
    process.stderr.write('\n📖 MCP Capabilities:\n');
    process.stderr.write(`   ✅ Tools (${tools.length}) - Execute operations with side effects\n`);
    process.stderr.write(`   ✅ Resources (${resources.length}) - Read-only documentation and data\n`);

    if (logger.isVerbose()) {
      process.stderr.write('\n🔍 Verbose logging enabled (TAPTAP_MINIGAME_MCP_VERBOSE=true)\n');
      process.stderr.write('   - Tool call inputs and outputs will be logged\n');
      process.stderr.write('   - HTTP requests and responses will be logged\n');
    } else {
      process.stderr.write('\n💡 Tip: Set TAPTAP_MINIGAME_MCP_VERBOSE=true for detailed logs\n');
    }
  }
}

// Global device auth instance for lazy initialization
let deviceAuth: DeviceFlowAuth | null = null;
let authInProgress = false;

/**
 * Lazy load authentication when needed (non-blocking)
 * Returns authorization URL if auth is needed, or completes silently if token exists
 */
async function ensureAuthenticated(): Promise<void> {
  const apiConfig = ApiConfig.getInstance();

  // Already authenticated
  if (apiConfig.macToken.kid && apiConfig.macToken.mac_key) {
    return;
  }

  // Auth already in progress
  if (authInProgress) {
    throw new Error('⏳ OAuth 授权正在进行中...\n\n另一个工具正在等待授权，请完成授权后重试。');
  }

  // Need to start OAuth flow
  if (!deviceAuth) {
    deviceAuth = new DeviceFlowAuth(apiConfig.environment);
  }

  // Try to load from local file first
  const macToken = await deviceAuth.initialize();

  // If initialize succeeded, we got token from file
  if (macToken) {
    apiConfig.setMacToken(macToken);
    return;
  }

  // Need OAuth authorization - throw error with URL
  throw new Error('OAuth authorization required');
}

// 启动服务器
async function main(): Promise<void> {
  const apiConfig = ApiConfig.getInstance();

  // Check authentication status (non-blocking, just info)
  if (!apiConfig.macToken.kid || !apiConfig.macToken.mac_key) {
    process.stderr.write('ℹ️  MAC Token not configured yet\n');
    process.stderr.write('   Will request OAuth authorization when you use authenticated tools\n\n');
  } else {
    process.stderr.write('✅ Using MAC Token from environment variable\n');
  }

  const server = new TapTapMinigameMCPServer(ensureAuthenticated);

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
