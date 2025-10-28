#!/usr/bin/env node

/**
 * TapTap 小游戏开发文档 MCP 服务器 - Node.js 版本
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import process from 'node:process';
import http from 'node:http';

// 导入核心模块
import { ApiConfig } from './core/network/httpClient.js';
import { logger } from './core/utils/logger.js';
import { DeviceFlowAuth } from './core/auth/deviceFlow.js';
import { VERSION } from './version.js';

// 导入功能模块
import { appModule } from './features/app/index.js';
import { leaderboardModule } from './features/leaderboard/index.js';
import type { HandlerContext } from './core/types/index.js';

// 环境变量配置
const apiConfig = ApiConfig.getInstance();
const TDS_MCP_MAC_TOKEN = apiConfig.macToken;
const TDS_MCP_PROJECT_PATH = process.env.TDS_MCP_PROJECT_PATH;
const TDS_MCP_TRANSPORT = (process.env.TDS_MCP_TRANSPORT || 'stdio').toLowerCase();
const TDS_MCP_PORT = parseInt(process.env.TDS_MCP_PORT || '3000', 10);

// 所有功能模块
const allModules = [
  appModule,        // App management (developer/app selection)
  leaderboardModule // Leaderboard management
  // Future: cloudSaveModule, shareModule, etc.
];

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
        version: VERSION,
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
    // 设置工具列表处理器 - 从所有模块收集
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: allModules.flatMap(m => m.tools.map(t => t.definition))
    }));

    // 设置工具调用处理器 - 自动从模块路由
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Log tool call input
      logger.logToolCall(name, args || {});

      try {
        // Special handling for complete_oauth_authorization (needs deviceAuth access)
        if (name === 'complete_oauth_authorization') {
          const result = await this.handleOAuthCompletion();
          logger.logToolResponse(name, result, true);
          return {
            content: [{ type: 'text', text: result }]
          };
        }

        // Find tool from modules
        let toolReg = null;
        for (const module of allModules) {
          toolReg = module.tools.find(t => t.definition.name === name);
          if (toolReg) break;
        }

        if (!toolReg) {
          throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${name}`);
        }

        // Check if authentication is required
        if (toolReg.requiresAuth) {
          try {
            await this.ensureAuth();
          } catch (authError) {
            const errorMsg = authError instanceof Error ? authError.message : String(authError);
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

        // Call handler
        const result = await toolReg.handler(args || {}, this.context);

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

    // 设置资源列表处理器 - 从所有模块收集
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: allModules.flatMap(m => m.resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType
      })))
    }));

    // 设置资源读取处理器 - 自动从模块路由
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      logger.logToolCall(`ReadResource: ${uri}`, {});

      try {
        // Find resource from modules
        let resourceReg = null;
        for (const module of allModules) {
          resourceReg = module.resources.find(r => r.uri === uri);
          if (resourceReg) break;
        }

        if (!resourceReg) {
          throw new Error(`Unknown resource URI: ${uri}`);
        }

        // Call handler
        const content = await resourceReg.handler();

        logger.logToolResponse(`ReadResource: ${uri}`, content.substring(0, 500), true);

        return {
          contents: [
            {
              uri: uri,
              mimeType: resourceReg.mimeType || 'text/markdown',
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
   * Handle OAuth completion (special case - needs deviceAuth access)
   */
  private async handleOAuthCompletion(): Promise<string> {
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

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    // Count tools and resources from all modules
    const totalTools = allModules.reduce((sum, m) => sum + m.tools.length, 0);
    const totalResources = allModules.reduce((sum, m) => sum + m.resources.length, 0);

    if (TDS_MCP_TRANSPORT === 'sse' || TDS_MCP_TRANSPORT === 'http') {
      // SSE mode: Start HTTP server
      await this.startSSEServer(totalTools, totalResources);
    } else {
      // Default: stdio mode
      await this.startStdioServer(totalTools, totalResources);
    }
  }

  /**
   * 启动 stdio 传输服务器
   */
  private async startStdioServer(totalTools: number, totalResources: number): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    process.stderr.write(`🚀 TapTap Open API MCP Server v${VERSION} (Minigame & H5)\n`);
    process.stderr.write('🔌 Transport: stdio\n');
    process.stderr.write(`📚 Providing ${totalTools} tools, ${totalResources} resources\n`);
    process.stderr.write('🏆 Features: Leaderboard Documentation & Management API\n');
    process.stderr.write(`🌍 Environment: ${apiConfig.environment}\n`);
    process.stderr.write(`🔗 API Base: ${apiConfig.apiBaseUrl}\n`);
    process.stderr.write('\n📖 MCP Capabilities:\n');
    process.stderr.write(`   ✅ Tools (${totalTools}) - Execute operations with side effects\n`);
    process.stderr.write(`   ✅ Resources (${totalResources}) - Read-only documentation and data\n`);
    process.stderr.write('\n🎯 Loaded Modules:\n');
    allModules.forEach(m => {
      const toolCount = m.tools.length;
      const resourceCount = m.resources.length;
      process.stderr.write(`   📦 ${m.name}: ${toolCount} tools, ${resourceCount} resources\n`);
    });

    if (logger.isVerbose()) {
      process.stderr.write('\n🔍 Verbose logging enabled (TAPTAP_MINIGAME_MCP_VERBOSE=true)\n');
      process.stderr.write('   - Tool call inputs and outputs will be logged\n');
      process.stderr.write('   - HTTP requests and responses will be logged\n');
    } else {
      process.stderr.write('\n💡 Tip: Set TAPTAP_MINIGAME_MCP_VERBOSE=true for detailed logs\n');
    }
  }

  /**
   * 启动 SSE 传输服务器
   */
  private async startSSEServer(totalTools: number, totalResources: number): Promise<void> {
    const sessions = new Map<string, SSEServerTransport>();

    const httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (url.pathname === '/sse' && req.method === 'GET') {
        // SSE connection
        const transport = new SSEServerTransport('/message', res);
        await this.server.connect(transport);
        sessions.set(transport.sessionId, transport);

        // Cleanup on close
        transport.onclose = () => {
          sessions.delete(transport.sessionId);
        };

        await transport.start();
      } else if (url.pathname === '/message' && req.method === 'POST') {
        // Handle POST message
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing sessionId' }));
          return;
        }

        const transport = sessions.get(sessionId);
        if (!transport) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        await transport.handlePostMessage(req, res);
      } else if (url.pathname === '/health' && req.method === 'GET') {
        // Health check endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          version: VERSION,
          transport: 'sse',
          sessions: sessions.size,
          tools: totalTools,
          resources: totalResources
        }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    httpServer.listen(TDS_MCP_PORT, () => {
      process.stderr.write(`🚀 TapTap Open API MCP Server v${VERSION} (Minigame & H5)\n`);
      process.stderr.write('🔌 Transport: SSE (Server-Sent Events)\n');
      process.stderr.write(`🌐 HTTP Server: http://localhost:${TDS_MCP_PORT}\n`);
      process.stderr.write(`📡 SSE Endpoint: http://localhost:${TDS_MCP_PORT}/sse\n`);
      process.stderr.write(`📥 Message Endpoint: http://localhost:${TDS_MCP_PORT}/message\n`);
      process.stderr.write(`💚 Health Check: http://localhost:${TDS_MCP_PORT}/health\n`);
      process.stderr.write(`📚 Providing ${totalTools} tools, ${totalResources} resources\n`);
      process.stderr.write('🏆 Features: Leaderboard Documentation & Management API\n');
      process.stderr.write(`🌍 Environment: ${apiConfig.environment}\n`);
      process.stderr.write(`🔗 API Base: ${apiConfig.apiBaseUrl}\n`);
      process.stderr.write('\n📖 MCP Capabilities:\n');
      process.stderr.write(`   ✅ Tools (${totalTools}) - Execute operations with side effects\n`);
      process.stderr.write(`   ✅ Resources (${totalResources}) - Read-only documentation and data\n`);
      process.stderr.write('\n🎯 Loaded Modules:\n');
      allModules.forEach(m => {
        const toolCount = m.tools.length;
        const resourceCount = m.resources.length;
        process.stderr.write(`   📦 ${m.name}: ${toolCount} tools, ${resourceCount} resources\n`);
      });

      if (logger.isVerbose()) {
        process.stderr.write('\n🔍 Verbose logging enabled (TAPTAP_MINIGAME_MCP_VERBOSE=true)\n');
        process.stderr.write('   - Tool call inputs and outputs will be logged\n');
        process.stderr.write('   - HTTP requests and responses will be logged\n');
      } else {
        process.stderr.write('\n💡 Tip: Set TAPTAP_MINIGAME_MCP_VERBOSE=true for detailed logs\n');
      }
    });

    // Handle server shutdown
    process.on('SIGINT', () => {
      process.stderr.write('\n📴 收到中断信号，正在关闭服务器...\n');
      httpServer.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      process.stderr.write('\n📴 收到终止信号，正在关闭服务器...\n');
      httpServer.close();
      process.exit(0);
    });
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

  // 处理优雅关闭（仅在 stdio 模式下需要，SSE 模式在 startSSEServer 中处理）
  if (TDS_MCP_TRANSPORT !== 'sse' && TDS_MCP_TRANSPORT !== 'http') {
    process.on('SIGINT', () => {
      process.stderr.write('\n📴 收到中断信号，正在关闭服务器...\n');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      process.stderr.write('\n📴 收到终止信号，正在关闭服务器...\n');
      process.exit(0);
    });
  }

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
