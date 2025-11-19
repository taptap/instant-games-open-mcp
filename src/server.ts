#!/usr/bin/env node

/**
 * TapTap 小游戏开发文档 MCP 服务器 - Node.js 版本
 */

// Load .env file if exists (for local development)
import dotenv from 'dotenv';
dotenv.config();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SetLevelRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import process from 'node:process';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// 导入核心模块
import { ApiConfig } from './core/network/httpClient.js';
import { logger } from './core/utils/logger.js';
import { DeviceFlowAuth } from './core/auth/deviceFlow.js';
import { VERSION } from './version.js';
import type { MacToken } from './core/types/index.js';
import { mergePrivateParams, stripPrivateParams } from './core/types/privateParams.js';
import { getEffectiveContext, getMacTokenStatus, getTokenSourceLabel } from './core/utils/handlerHelpers.js';

// 导入功能模块
import { appModule } from './features/app/index.js';
import { leaderboardModule } from './features/leaderboard/index.js';
import { h5GameModule } from './features/h5Game/index.js';
import { vibrateModule } from './features/vibrate/index.js';
import type { HandlerContext, FeatureModule } from './core/types/index.js';
import { getEnv, getEnvInt, printDeprecationWarnings } from './core/utils/env.js';

// 环境变量配置
const apiConfig = ApiConfig.getInstance();
const TDS_MCP_TRANSPORT = (getEnv('TAPTAP_MCP_TRANSPORT', 'stdio')).toLowerCase();
const TDS_MCP_PORT = getEnvInt('TAPTAP_MCP_PORT', 3000);

// 所有功能模块
const allModules: FeatureModule[] = [
  appModule,        // App management (developer/app selection)
  leaderboardModule,// Leaderboard management
  h5GameModule,     // H5 Game management (upload, publish, status)
  vibrateModule     // Vibrate API documentation and guides
  // Future: cloudSaveModule, shareModule, etc.
];

/**
 * TapTap 小游戏 MCP 服务器
 */
class TapTapMinigameMCPServer {
  private server: Server;
  private context: HandlerContext;
  private ensureAuth: (context?: HandlerContext) => Promise<void>;

  constructor(ensureAuthFn: (context?: HandlerContext) => Promise<void>) {
    // Create server with explicit capabilities declaration (required in SDK 1.20+)
    this.server = new Server(
      {
        name: 'taptap-minigame-mcp',
        version: VERSION,
      },
      {
        capabilities: {
          logging: {},  // Declare logging capability
          tools: {},    // Declare tools capability
          resources: {}, // Declare resources capability
        },
      }
    );

    // Context with dynamic token getter (supports OAuth updates)
    this.context = {
      get macToken() {
        return apiConfig.macToken;
      }
    };

    this.ensureAuth = ensureAuthFn;
    this.setupHandlers();
  }

  /**
   * 设置请求处理器（为主服务器）
   */
  private setupHandlers(): void {
    this.setupHandlersForServer(this.server);
  }

  /**
   * 为指定的 Server 实例设置请求处理器
   * 用于支持多客户端并发连接（每个会话独立的 Server 实例）
   */
  private setupHandlersForServer(server: Server): void {
    // 设置日志级别处理器 (MCP logging/setLevel)
    server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      const { level } = request.params;
      logger.setLevel(level);
      return {};
    });

    // 设置工具列表处理器 - 从所有模块收集
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: allModules.flatMap(m => m.tools.map(t => t.definition))
    }));

    // 设置工具调用处理器 - 自动从模块路由
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args } = request.params;

      // 私有参数支持两种方式：
      // 1. MCP Proxy 在 arguments 中注入（args._mac_token）
      // 2. HTTP Header 注入（仅 HTTP/SSE 模式，从 extra.requestInfo.headers 读取）
      let enrichedArgs = args || {};

      // 从 HTTP Header 提取 MAC Token（如果存在且 args 中没有）
      if (extra?.requestInfo?.headers && !enrichedArgs._mac_token) {
        const headers = extra.requestInfo.headers;
        const macTokenHeader = headers['x-taptap-mac-token'];

        if (macTokenHeader && typeof macTokenHeader === 'string') {
          try {
            // 支持 Base64 编码或直接 JSON
            let token: MacToken;
            try {
              const decoded = Buffer.from(macTokenHeader, 'base64').toString('utf-8');
              token = JSON.parse(decoded);
            } catch {
              token = JSON.parse(macTokenHeader);
            }
            enrichedArgs = mergePrivateParams(enrichedArgs, { _mac_token: token });
          } catch (error) {
            // 忽略无效的 token header
            await logger.warning('Invalid X-TapTap-Mac-Token header', { error: String(error) });
          }
        }
      }

      // Log tool call input (私有参数会被自动过滤)
      await logger.logToolCall(name, enrichedArgs);

      // 统一在 Server 层处理 effectiveContext（合并私有参数到 context）
      // 这样 OAuth 工具也能检查到 Proxy 注入的 token
      const effectiveContext = getEffectiveContext(enrichedArgs, this.context);

      try {
        // Special handling for OAuth tools (need deviceAuth access)
        if (name === 'start_oauth_authorization') {
          const result = await this.handleOAuthStart(effectiveContext);
          await logger.logToolResponse(name, result, true);
          return {
            content: [{ type: 'text', text: result }]
          };
        }

        if (name === 'complete_oauth_authorization') {
          const result = await this.handleOAuthCompletion();
          await logger.logToolResponse(name, result, true);
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

        // Check if authentication is required (pass effectiveContext to check request-level token)
        if (toolReg.requiresAuth) {
          try {
            await this.ensureAuth(effectiveContext);
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

        // 从 args 中移除私有参数（业务层完全不感知）
        const businessArgs = stripPrivateParams(enrichedArgs);

        // Call handler（传递干净的业务参数 + 包含 macToken 的 context）
        const result = await toolReg.handler(businessArgs, effectiveContext);

        // Log tool call output
        await logger.logToolResponse(name, result, true);

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
        await logger.logToolResponse(name, error instanceof Error ? error.message : String(error), false);

        throw new McpError(
          ErrorCode.InternalError,
          `工具执行失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // 设置资源列表处理器 - 从所有模块收集
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: allModules.flatMap(m => m.resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType
      })))
    }));

    // 设置资源读取处理器 - 自动从模块路由
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      await logger.logToolCall(`ReadResource: ${uri}`, {});

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

        await logger.logToolResponse(`ReadResource: ${uri}`, content.substring(0, 500), true);

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
        await logger.logToolResponse(`ReadResource: ${uri}`, error instanceof Error ? error.message : String(error), false);

        throw new McpError(
          ErrorCode.InternalError,
          `资源读取失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * Handle OAuth start (special case - needs deviceAuth access)
   */
  private async handleOAuthStart(context?: HandlerContext): Promise<string> {
    // Use shared authentication check logic
    const { hasMacToken, source } = getMacTokenStatus(context);

    if (hasMacToken) {
      const sourceLabel = getTokenSourceLabel(source);
      return '✅ 已经完成授权\n\n' +
             `当前已有有效的 MAC Token ${sourceLabel}，可以直接使用所有功能。\n\n` +
             '💡 如需切换账号，请先使用 clear_auth_data 工具清除现有授权。';
    }

    if (!deviceAuth) {
      deviceAuth = new DeviceFlowAuth(apiConfig.environment);
    }

    try {
      // Get authorization URL
      const authUrl = await deviceAuth.getAuthorizationUrl();

      return '🔐 TapTap 授权登录\n\n' +
             '请按以下步骤完成授权：\n\n' +
             `1️⃣ 打开授权链接：\n   ${authUrl}\n\n` +
             '2️⃣ 使用 TapTap App 扫描二维码\n\n' +
             '3️⃣ 授权成功后，调用 complete_oauth_authorization 工具完成授权\n\n' +
             '💡 提示：授权链接有效期为 2 分钟，过期后需要重新获取';
    } catch (error) {
      return `❌ 获取授权链接失败: ${error instanceof Error ? error.message : String(error)}\n\n` +
             '请稍后重试或联系技术支持。';
    }
  }

  /**
   * Handle OAuth completion (special case - needs deviceAuth access)
   */
  private async handleOAuthCompletion(): Promise<string> {
    if (!deviceAuth) {
      return '❌ 未找到待完成的授权\n\n' +
             '请先使用 start_oauth_authorization 工具获取授权链接。';
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
             '如果仍然失败，请使用 start_oauth_authorization 工具获取新的授权链接。';
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

    // Initialize logger with server instance
    logger.initialize(this.server, 'stdio');

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
      process.stderr.write('\n🔍 Verbose logging enabled (TDS_MCP_VERBOSE=true)\n');
      process.stderr.write('   - Tool call inputs and outputs will be logged\n');
      process.stderr.write('   - HTTP requests and responses will be logged\n');
    } else {
      process.stderr.write('\n💡 Tip: Set TDS_MCP_VERBOSE=true for detailed logs\n');
    }
  }

  /**
   * 启动 Streamable HTTP 传输服务器（2025 标准）
   * 支持多客户端并发连接 - 每个会话使用独立的 Server 和 Transport 实例
   */
  private async startSSEServer(totalTools: number, totalResources: number): Promise<void> {
    // Initialize logger (before any connections)
    logger.initialize(this.server, 'sse');

    // Set transport mode for authentication
    // - 'sse': enables auto-authorization with progress streaming
    // - 'http' (JSON only): uses two-step auth (no progress streaming available)
    const authMode = TDS_MCP_TRANSPORT === 'sse' ? 'sse' : 'stdio';
    setTransportMode(authMode);

    // Store active transport instances by session ID
    const transports: Map<string, { server: Server, transport: StreamableHTTPServerTransport }> = new Map();

    const httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, X-TapTap-Mac-Token');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (url.pathname === '/health' && req.method === 'GET') {
        // Health check endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          version: VERSION,
          transport: 'streamable-http',
          tools: totalTools,
          resources: totalResources,
          activeSessions: transports.size
        }));
        return;
      }

      // Get session ID from header (if exists)
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Check if this is a request for an existing session
      if (sessionId && transports.has(sessionId)) {
        // Use existing transport for this session
        const { transport } = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      // New session - create new Server and Transport instances
      const sessionServer = new Server(
        {
          name: 'taptap-minigame-mcp',
          version: VERSION,
        },
        {
          capabilities: {
            logging: {},
            tools: {},
            resources: {},
          },
        }
      );

      // Set up handlers for the new session (same as original server)
      this.setupHandlersForServer(sessionServer);

      // Create new transport instance for this session
      const sessionTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => {
          // Generate secure session ID
          return Math.random().toString(36).substring(2) + Date.now().toString(36);
        },
        // Response mode based on transport type:
        // - 'http': JSON responses only (for clients that don't support SSE)
        // - 'sse': SSE streaming (for Streamable HTTP clients)
        enableJsonResponse: TDS_MCP_TRANSPORT === 'http',
        // Log client connections
        onsessioninitialized: async (newSessionId: string) => {
          await logger.logClientConnection(newSessionId);
          // Store the session
          transports.set(newSessionId, { server: sessionServer, transport: sessionTransport });
        },
        // Log client disconnections
        onsessionclosed: async (closedSessionId: string) => {
          await logger.logClientDisconnection(closedSessionId);
          // Remove the session
          transports.delete(closedSessionId);
        }
      });

      // Connect transport to the new server
      await sessionServer.connect(sessionTransport);

      // Handle the request
      await sessionTransport.handleRequest(req, res);
    });

    httpServer.listen(TDS_MCP_PORT, () => {
      process.stderr.write(`🚀 TapTap Open API MCP Server v${VERSION} (Minigame & H5)\n`);
      const responseMode = TDS_MCP_TRANSPORT === 'http' ? 'JSON Only' : 'SSE Streaming';
      process.stderr.write(`🔌 Transport: Streamable HTTP (${responseMode})\n`);
      process.stderr.write(`🌐 HTTP Server: http://localhost:${TDS_MCP_PORT}\n`);
      process.stderr.write(`📡 MCP Endpoint: http://localhost:${TDS_MCP_PORT}/\n`);
      process.stderr.write(`💚 Health Check: http://localhost:${TDS_MCP_PORT}/health\n`);
      process.stderr.write(`📚 Providing ${totalTools} tools, ${totalResources} resources\n`);
      process.stderr.write('🏆 Features: Leaderboard Documentation & Management API\n');
      process.stderr.write(`🌍 Environment: ${apiConfig.environment}\n`);
      process.stderr.write(`🔗 API Base: ${apiConfig.apiBaseUrl}\n`);

      // 显示目录配置
      process.stderr.write('\n📂 Directory Configuration:\n');

      // WORKSPACE_ROOT
      const workspaceRoot = getEnv('TAPTAP_MCP_WORKSPACE_ROOT') || process.cwd();
      const workspaceRootLabel = getEnv('TAPTAP_MCP_WORKSPACE_ROOT') ? '(env)' : '(default: cwd)';
      process.stderr.write(`   📁 WORKSPACE_ROOT: ${workspaceRoot} ${workspaceRootLabel}\n`);

      // TDS_MCP_CACHE_DIR
      const cacheDir = getEnv('TAPTAP_MCP_CACHE_DIR') || path.join(os.tmpdir(), 'taptap-mcp', 'cache');
      const cacheDirLabel = getEnv('TAPTAP_MCP_CACHE_DIR') ? '(env)' : '(default)';
      process.stderr.write(`   📦 TDS_MCP_CACHE_DIR: ${cacheDir} ${cacheDirLabel}\n`);

      // TDS_MCP_TEMP_DIR
      const tempDir = getEnv('TAPTAP_MCP_TEMP_DIR') || path.join(os.tmpdir(), 'taptap-mcp', 'temp');
      const tempDirLabel = getEnv('TAPTAP_MCP_TEMP_DIR') ? '(env)' : '(default)';
      process.stderr.write(`   📂 TDS_MCP_TEMP_DIR: ${tempDir} ${tempDirLabel}\n`);

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
        process.stderr.write('\n🔍 Verbose logging enabled (TAPTAP_MCP_VERBOSE=true)\n');
        process.stderr.write('   - Tool call inputs and outputs will be logged\n');
        process.stderr.write('   - HTTP requests and responses will be logged\n');
      } else {
        process.stderr.write('\n💡 Tip: Set TAPTAP_MCP_VERBOSE=true for detailed logs\n');
      }

      // Print deprecation warnings for old environment variables
      printDeprecationWarnings();
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

// Track current transport mode (set by server)
let currentTransportMode: 'stdio' | 'sse' = 'stdio';

/**
 * Set transport mode for authentication flow
 */
function setTransportMode(mode: 'stdio' | 'sse'): void {
  currentTransportMode = mode;
}

/**
 * Lazy load authentication when needed
 * - stdio mode: throw error with auth URL (two-step flow)
 * - SSE mode: auto-poll with progress notifications (one-step flow)
 *
 * @param context - Request-specific context (may contain injected MAC token from Proxy)
 */
async function ensureAuthenticated(context?: HandlerContext): Promise<void> {
  // Use shared authentication check logic
  const { hasMacToken } = getMacTokenStatus(context);

  if (hasMacToken) {
    return;
  }

  const apiConfig = ApiConfig.getInstance();

  // Auth already in progress
  if (authInProgress) {
    throw new Error('⏳ OAuth 授权正在进行中...\n\n另一个工具正在等待授权，请完成授权后重试。');
  }

  // Need to start OAuth flow
  if (!deviceAuth) {
    deviceAuth = new DeviceFlowAuth(apiConfig.environment);
  }

  // Unified two-step auth flow for all modes
  // Step 1: Throw error with auth URL
  // Step 2: User authorizes and calls complete_oauth_authorization
  try {
    const macToken = await deviceAuth.initialize();
    if (macToken) {
      apiConfig.setMacToken(macToken);
      return;
    }
  } catch (error) {
    // Throw the error with auth URL
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('OAuth authorization required');
  }
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

      // Print deprecation warnings for old environment variables
      printDeprecationWarnings();
}

// 启动主函数
main().catch((error) => {
  process.stderr.write(`❌ 服务器运行失败: ${error}\n`);
  process.exit(1);
});
