#!/usr/bin/env node

/**
 * TapTap 小游戏开发文档 MCP 服务器 - Node.js 版本
 */

// Declare __VERSION__ for bundle mode (injected at build time by esbuild)
// When __VERSION__ is defined: production bundle mode (no dotenv, version injected)
// When __VERSION__ is undefined: development mode (load dotenv, read version from package.json)
declare const __VERSION__: string | undefined;

// Load .env file in development mode only
if (typeof __VERSION__ === 'undefined') {
  try {
    const { default: dotenv } = await import('dotenv');
    dotenv.config();
  } catch {
    // dotenv not available, skip
  }
}

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
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import process from 'node:process';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';

// 导入核心模块
import { ApiConfig } from './core/network/httpClient.js';
import { logger } from './core/utils/logger.js';
import type { MacToken } from './core/types/index.js';
import { stripPrivateParams } from './core/types/privateParams.js';

// 导入 OAuth 模块
import { requestDeviceCode, generateAuthUrl } from './core/auth/oauth.js';
import { oauthState } from './core/auth/oauthState.js';

// 导入功能模块
import { appModule } from './features/app/index.js';
import { leaderboardModule } from './features/leaderboard/index.js';
import { h5GameModule } from './features/h5Game/index.js';
import { vibrateModule } from './features/vibrate/index.js';
import { multiplayerModule } from './features/multiplayer/index.js';
import { shareModule } from './features/share/index.js';
import { cloudSaveModule } from './features/cloudSave/index.js';
import type {
  SessionContext,
  FeatureModule,
  ToolRegistration,
  ResourceRegistration,
} from './core/types/index.js';
import { ResolvedContext } from './core/types/context.js';
import { EnvConfig, printDeprecationWarnings, getEnv } from './core/utils/env.js';
import { VERSION } from './version.js';

// 导入新的认证错误处理模块
import { createAuthError, generateOAuthGuidance, isAuthError } from './core/errors/authErrors.js';

// 导入 Native Signer 状态
import { isUsingNativeSigner } from './core/network/nativeSigner.js';

// 环境变量配置 (仅用于启动时验证)
const transportMode = EnvConfig.transport;
const serverPort = EnvConfig.port;

// 所有功能模块
const allModules: FeatureModule[] = [
  appModule, // App management (developer/app selection)
  leaderboardModule, // Leaderboard management
  h5GameModule, // H5 Game management (upload, publish, status)
  vibrateModule, // Vibrate API documentation and guides
  multiplayerModule, // Multiplayer/OnlineBattle SDK documentation
  shareModule, // Share API documentation and management
  cloudSaveModule, // Cloud Save documentation (client-side only)
];

/**
 * 验证解析后的 JSON 是否为合法的 Record<string, string>
 */
function isValidCustomFields(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string')
  );
}

/**
 * TapTap 小游戏 MCP 服务器
 */
class TapTapMinigameMCPServer {
  private server: Server;
  private ensureAuth: (context?: ResolvedContext) => Promise<void>;

  // 工具和资源的快速查找索引 (O(1) 查找，替代 O(n) 线性搜索)
  private toolRegistry: Map<string, ToolRegistration>;
  private resourceRegistry: Map<string, ResourceRegistration>;

  constructor(ensureAuthFn: (context?: ResolvedContext) => Promise<void>) {
    // Create server with explicit capabilities declaration (required in SDK 1.20+)
    this.server = new Server(
      {
        name: 'taptap-minigame-mcp',
        version: VERSION,
      },
      {
        capabilities: {
          logging: {}, // Declare logging capability
          tools: {}, // Declare tools capability
          resources: {}, // Declare resources capability
        },
      }
    );

    this.ensureAuth = ensureAuthFn;

    // 构建工具和资源索引（一次性开销，O(n) → O(1) 查找）
    this.toolRegistry = this.buildToolRegistry();
    this.resourceRegistry = this.buildResourceRegistry();

    this.setupHandlers();
  }

  /**
   * 构建工具注册表（带名称冲突检测）
   */
  private buildToolRegistry(): Map<string, ToolRegistration> {
    const registry = new Map<string, ToolRegistration>();

    for (const module of allModules) {
      for (const tool of module.tools) {
        const toolName = tool.definition.name;

        // 检测名称冲突
        if (registry.has(toolName)) {
          process.stderr.write(
            `⚠️  Warning: Tool name conflict detected!\n` +
              `   Tool "${toolName}" is defined in multiple modules.\n` +
              `   Later registration will override the previous one.\n`
          );
        }

        registry.set(toolName, tool);
      }
    }

    return registry;
  }

  /**
   * 构建资源注册表（带 URI 冲突检测）
   */
  private buildResourceRegistry(): Map<string, ResourceRegistration> {
    const registry = new Map<string, ResourceRegistration>();

    for (const module of allModules) {
      for (const resource of module.resources) {
        const uri = resource.uri;

        // 检测 URI 冲突
        if (registry.has(uri)) {
          process.stderr.write(
            `⚠️  Warning: Resource URI conflict detected!\n` +
              `   URI "${uri}" is defined in multiple modules.\n` +
              `   Later registration will override the previous one.\n`
          );
        }

        registry.set(uri, resource);
      }
    }

    return registry;
  }

  /**
   * 从 HTTP Headers 提取私有参数
   * 支持：_mac_token, _user_id, _project_id 等
   *
   * @param args - 原始参数
   * @param headers - HTTP Headers
   * @returns 合并后的参数
   */
  private extractPrivateParamsFromHeaders(
    args: any,
    headers: Record<string, string | string[]>
  ): any {
    const enrichedArgs = { ...args };

    // Helper: 安全获取 header 值（处理大小写和数组）
    const getHeader = (name: string): string | undefined => {
      // Node.js 会自动转小写
      const lowerName = name.toLowerCase();
      const value = headers[lowerName];

      // 处理数组情况（取第一个值）
      if (Array.isArray(value)) {
        return value[0];
      }

      return typeof value === 'string' ? value : undefined;
    };

    // 提取 MAC Token
    const macTokenHeader = getHeader('X-TapTap-Mac-Token');
    if (macTokenHeader && !enrichedArgs._mac_token) {
      try {
        let token: MacToken;
        // 支持 Base64 编码或直接 JSON
        try {
          const decoded = Buffer.from(macTokenHeader, 'base64').toString('utf-8');
          token = JSON.parse(decoded);
        } catch {
          token = JSON.parse(macTokenHeader);
        }
        enrichedArgs._mac_token = token;
      } catch (error) {
        logger.warning('Invalid X-TapTap-Mac-Token header', { error: String(error) });
      }
    }

    // ✅ 提取 User ID
    const userIdHeader = getHeader('X-TapTap-User-Id');
    if (userIdHeader && !enrichedArgs._user_id) {
      enrichedArgs._user_id = userIdHeader;
    }

    // ✅ 提取 Project ID
    const projectIdHeader = getHeader('X-TapTap-Project-Id');
    if (projectIdHeader && !enrichedArgs._project_id) {
      enrichedArgs._project_id = projectIdHeader;
    }

    // ✅ 提取业务自定义字段
    const customFieldsHeader = getHeader('X-TapTap-Custom-Fields');
    if (customFieldsHeader && !enrichedArgs._custom_fields) {
      try {
        const parsed = JSON.parse(customFieldsHeader);
        if (isValidCustomFields(parsed)) {
          enrichedArgs._custom_fields = parsed;
        } else {
          logger.warning(
            'Invalid X-TapTap-Custom-Fields header: expected a JSON object with string values'
          );
        }
      } catch (error) {
        logger.warning('Invalid X-TapTap-Custom-Fields header', { error: String(error) });
      }
    }

    return enrichedArgs;
  }

  /**
   * 直接返回 SessionContext（简化架构，不再需要 RequestContext 中间层）
   *
   * @param sessionContext - Session 上下文（通过闭包注入）
   * @returns SessionContext
   */
  private getSessionContext(sessionContext?: SessionContext): SessionContext {
    return sessionContext ?? {};
  }

  /**
   * 设置请求处理器（为主服务器，stdio 模式）
   */
  private setupHandlers(): void {
    // stdio 模式：使用默认的 sessionContext
    const defaultContext: SessionContext = {
      userId: 'local', // stdio 固定使用 'local'
    };
    this.setupHandlersForServer(this.server, defaultContext);
  }

  /**
   * 为指定的 Server 实例设置请求处理器
   * 用于支持多客户端并发连接（每个会话独立的 Server 实例）
   *
   * @param server - Server 实例
   * @param sessionContext - Session 上下文（通过闭包注入）
   */
  private setupHandlersForServer(server: Server, sessionContext?: SessionContext): void {
    // 设置日志级别处理器 (MCP logging/setLevel)
    server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      const { level } = request.params;
      logger.setLevel(level);
      return {};
    });

    // 设置工具列表处理器 - 从所有模块收集
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: allModules.flatMap((m) => m.tools.map((t) => t.definition)),
    }));

    // 设置工具调用处理器 - 自动从模块路由
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args } = request.params;

      // 私有参数支持两种方式：
      // 1. MCP Proxy 在 arguments 中注入（args._mac_token, _user_id, etc.）
      // 2. HTTP Header 注入（仅 HTTP/SSE 模式，从 extra.requestInfo.headers 读取）
      let enrichedArgs = args || {};

      // 从 HTTP Headers 提取所有私有参数（如果存在且 args 中没有）
      if (extra?.requestInfo?.headers) {
        enrichedArgs = this.extractPrivateParamsFromHeaders(
          enrichedArgs,
          extra.requestInfo.headers as Record<string, string | string[]>
        );
      }

      // Log tool call input (私有参数会被自动过滤)
      await logger.logToolCall(name, enrichedArgs);

      // ✅ 构建 ResolvedContext（直接使用 SessionContext）
      const ctx = new ResolvedContext(enrichedArgs, this.getSessionContext(sessionContext));

      try {
        // 使用 Map 快速查找工具（O(1) 复杂度）
        const toolReg = this.toolRegistry.get(name);

        if (!toolReg) {
          throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${name}`);
        }

        // Check if authentication is required
        if (toolReg.requiresAuth) {
          try {
            await this.ensureAuth(ctx);
          } catch (authError) {
            // 使用统一的认证错误处理
            if (isAuthError(authError)) {
              throw new McpError(
                ErrorCode.InternalError,
                authError.userGuidance || authError.message
              );
            }

            // 其他错误保持原有处理
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

        // ✅ Call handler（传递 ResolvedContext）
        const result = await toolReg.handler(businessArgs, ctx);

        // Log tool call output
        await logger.logToolResponse(name, result, true);

        // 检查结果中是否包含 JSON 格式的二维码
        const qrJsonMatch = result.match(/__QR_CODE_JSON__([\s\S]*?)__END_QR_CODE_JSON__/);

        if (qrJsonMatch && qrJsonMatch[1]) {
          try {
            // 解析 JSON 格式的二维码数据
            const qrData = JSON.parse(qrJsonMatch[1].trim());
            const qrImageBase64 = qrData.qrcode; // 直接获取 base64 编码的二维码
            const textContent = qrData.message || '请扫描二维码完成授权';

            // 返回文本和图片
            return {
              content: [
                {
                  type: 'text',
                  text: textContent,
                },
                {
                  type: 'image',
                  data: qrImageBase64,
                  mimeType: 'image/png',
                },
              ],
            };
          } catch (parseError) {
            // 如果解析失败，继续使用普通文本返回
          }
        }

        // 普通文本返回
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        // Log tool call error
        await logger.logToolResponse(
          name,
          error instanceof Error ? error.message : String(error),
          false
        );

        // 如果是认证错误，保持用户友好的提示
        if (error instanceof McpError && error.code === ErrorCode.InternalError) {
          throw error; // 已经格式化的错误消息
        }

        // 其他错误保持原有处理
        throw new McpError(
          ErrorCode.InternalError,
          `工具执行失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // 设置资源列表处理器 - 从所有模块收集
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: allModules.flatMap((m) =>
        m.resources.map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        }))
      ),
    }));

    // 设置资源读取处理器 - 自动从模块路由
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      await logger.logToolCall(`ReadResource: ${uri}`, {});

      try {
        // 使用 Map 快速查找资源（O(1) 复杂度）
        const resourceReg = this.resourceRegistry.get(uri);

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
              text: content,
            },
          ],
        };
      } catch (error) {
        await logger.logToolResponse(
          `ReadResource: ${uri}`,
          error instanceof Error ? error.message : String(error),
          false
        );

        throw new McpError(
          ErrorCode.InternalError,
          `资源读取失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    // Count tools and resources from all modules
    const totalTools = allModules.reduce((sum, m) => sum + m.tools.length, 0);
    const totalResources = allModules.reduce((sum, m) => sum + m.resources.length, 0);

    if (transportMode === 'sse' || transportMode === 'http') {
      // SSE mode: Start HTTP server
      await this.startSSEServer(totalTools, totalResources);
    } else {
      // Default: stdio mode
      await this.startStdioServer(totalTools, totalResources);
    }
  }

  /**
   * 打印服务器启动信息（通用方法）
   */
  private printServerInfo(transportInfo: string, totalTools: number, totalResources: number): void {
    process.stderr.write(`🚀 TapTap Open API MCP Server v${VERSION} (Minigame & H5)\n`);
    process.stderr.write(`🔌 Transport: ${transportInfo}\n`);
    process.stderr.write(`📚 Providing ${totalTools} tools, ${totalResources} resources\n`);
    process.stderr.write('🏆 Features: Leaderboard Documentation & Management API\n');
    process.stderr.write(`🌍 Environment: ${EnvConfig.environment}\n`);
    process.stderr.write(`🔗 API Base: ${EnvConfig.endpoints.apiBaseUrl}\n`);

    // 显示认证配置（区分 Native Signer 和环境变量两种模式）
    process.stderr.write('\n🔐 Authentication Configuration:\n');
    if (isUsingNativeSigner()) {
      // Native Signer 模式：凭证嵌入在二进制中
      process.stderr.write('   Mode: Native Signer (credentials embedded in binary)\n');
      process.stderr.write('   Client ID: ✅ Embedded\n');
      process.stderr.write('   Client Secret: ✅ Protected\n');
    } else {
      // 环境变量模式
      process.stderr.write('   Mode: Environment Variables\n');
      process.stderr.write(
        `   Client ID: ${EnvConfig.clientId ? '✅ ' + EnvConfig.clientId : '❌ Not configured'}\n`
      );
      process.stderr.write(
        `   Client Secret: ${EnvConfig.clientSecret ? '✅ Configured' : '❌ Not configured'}\n`
      );
    }

    // 显示目录配置
    process.stderr.write('\n📂 Directory Configuration:\n');
    const workspaceRoot = getEnv('TAPTAP_MCP_WORKSPACE_ROOT') || process.cwd();
    const workspaceRootLabel = getEnv('TAPTAP_MCP_WORKSPACE_ROOT') ? '(env)' : '(default: cwd)';
    process.stderr.write(`   📁 WORKSPACE_ROOT: ${workspaceRoot} ${workspaceRootLabel}\n`);

    const cacheDir =
      getEnv('TAPTAP_MCP_CACHE_DIR') || path.join(os.tmpdir(), 'taptap-mcp', 'cache');
    const cacheDirLabel = getEnv('TAPTAP_MCP_CACHE_DIR') ? '(env)' : '(default)';
    process.stderr.write(`   📦 TAPTAP_MCP_CACHE_DIR: ${cacheDir} ${cacheDirLabel}\n`);

    const tempDir = getEnv('TAPTAP_MCP_TEMP_DIR') || path.join(os.tmpdir(), 'taptap-mcp', 'temp');
    const tempDirLabel = getEnv('TAPTAP_MCP_TEMP_DIR') ? '(env)' : '(default)';
    process.stderr.write(`   📂 TAPTAP_MCP_TEMP_DIR: ${tempDir} ${tempDirLabel}\n`);

    const logRoot = getEnv('TAPTAP_MCP_LOG_ROOT') || path.join(os.tmpdir(), 'taptap-mcp', 'logs');
    const logRootLabel = getEnv('TAPTAP_MCP_LOG_ROOT') ? '(env)' : '(default)';
    process.stderr.write(`   📝 TAPTAP_MCP_LOG_ROOT: ${logRoot} ${logRootLabel}\n`);

    process.stderr.write('\n📖 MCP Capabilities:\n');
    process.stderr.write(`   ✅ Tools (${totalTools}) - Execute operations with side effects\n`);
    process.stderr.write(
      `   ✅ Resources (${totalResources}) - Read-only documentation and data\n`
    );

    process.stderr.write('\n🎯 Loaded Modules:\n');
    allModules.forEach((m) => {
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
  }

  /**
   * 启动 stdio 传输服务器
   */
  private async startStdioServer(totalTools: number, totalResources: number): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Initialize logger with server instance
    logger.initialize(this.server, 'stdio');

    // 打印启动信息
    this.printServerInfo('stdio', totalTools, totalResources);
  }

  /**
   * 启动 Streamable HTTP 传输服务器（2025 标准）
   * 支持多客户端并发连接 - 每个会话使用独立的 Server 和 Transport 实例
   */
  private async startSSEServer(totalTools: number, totalResources: number): Promise<void> {
    // Initialize logger (before any connections)
    logger.initialize(this.server, 'sse');

    // Store active transport instances by session ID
    const transports: Map<string, { server: Server; transport: StreamableHTTPServerTransport }> =
      new Map();

    const httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Mcp-Session-Id, X-TapTap-Mac-Token, X-TapTap-User-Id, X-TapTap-Project-Id, X-TapTap-Project-Path, X-TapTap-Custom-Fields'
      );

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (url.pathname === '/health' && req.method === 'GET') {
        // Health check endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            version: VERSION,
            transport: 'streamable-http',
            tools: totalTools,
            resources: totalResources,
            activeSessions: transports.size,
          })
        );
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

      // ✅ 新 session：从 URL 参数或 Headers 提取用户标识
      // 优先级：URL 参数 > HTTP Headers
      // 这样客户端可以在连接 URL 中传递参数，如：
      //   http://localhost:3000/?project_id=game-a&user_id=user-123
      const getHeader = (name: string): string | undefined => {
        const value = req.headers[name.toLowerCase()];
        return typeof value === 'string' ? value : undefined;
      };

      // URL 参数（SSE 直连兼容）
      const urlUserId = url.searchParams.get('user_id');
      const urlProjectId = url.searchParams.get('project_id');
      const urlProjectPath = url.searchParams.get('project_path');

      // HTTP Headers（Proxy 模式推荐，更安全）
      const headerUserId = getHeader('X-TapTap-User-Id');
      const headerProjectId = getHeader('X-TapTap-Project-Id');
      const headerProjectPath = getHeader('X-TapTap-Project-Path');
      const headerMacToken = getHeader('X-TapTap-Mac-Token');
      const headerCustomFields = getHeader('X-TapTap-Custom-Fields');

      // 合并：Headers 优先（Proxy 使用 Headers，SSE 直连使用 URL 参数）
      // 使用 ?? undefined 将 null 转换为 undefined（SessionContext 不接受 null）
      const userId = headerUserId || (urlUserId ?? undefined);
      const projectId = headerProjectId || (urlProjectId ?? undefined);
      let projectPath = headerProjectPath || (urlProjectPath ?? undefined);

      if (projectPath) {
        // Normalize path to ensure consistency for cache isolation (e.g. remove trailing slashes)
        projectPath = path.normalize(projectPath);
      }

      // 解析 MAC Token（JSON 序列化）
      let macToken: MacToken | undefined;
      if (headerMacToken) {
        try {
          macToken = JSON.parse(headerMacToken);
        } catch (error) {
          // 忽略解析错误，Token 将从其他来源获取
          logger.warning(`Failed to parse MAC Token from header: ${error}`);
        }
      }

      // 解析业务自定义字段（JSON 序列化）
      let customFields: Record<string, string> | undefined;
      if (headerCustomFields) {
        try {
          const parsed = JSON.parse(headerCustomFields);
          if (isValidCustomFields(parsed)) {
            customFields = parsed;
          } else {
            logger.warning(
              'Failed to parse Custom Fields from header: expected a JSON object with string values'
            );
          }
        } catch (error) {
          logger.warning(`Failed to parse Custom Fields from header: ${error}`);
        }
      }

      // 创建 session 专属的上下文（通过闭包捕获）
      const sessionContext: SessionContext = {
        userId,
        projectId,
        projectPath,
        macToken,
        customFields,
        // sessionId 会在 onsessioninitialized 回调中设置
      };

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

      // ✅ 为这个 session 设置 handlers（闭包自动捕获 sessionContext）
      this.setupHandlersForServer(sessionServer, sessionContext);

      // Create new transport instance for this session
      const sessionTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => {
          // Generate secure session ID
          return Math.random().toString(36).substring(2) + Date.now().toString(36);
        },
        // Response mode based on transport type:
        // - 'http': JSON responses only (for clients that don't support SSE)
        // - 'sse': SSE streaming (for Streamable HTTP clients)
        enableJsonResponse: transportMode === 'http',
        // Log client connections
        onsessioninitialized: async (newSessionId: string) => {
          // ✅ 注入 sessionId 到闭包的 sessionContext
          sessionContext.sessionId = newSessionId;

          // 输出完整的 session 上下文信息
          await logger.logClientConnection(newSessionId, {
            userId: sessionContext.userId,
            projectId: sessionContext.projectId,
            projectPath: sessionContext.projectPath,
            macToken: sessionContext.macToken,
          });

          // Store the session（只需存储 server 和 transport，context 在闭包中）
          transports.set(newSessionId, { server: sessionServer, transport: sessionTransport });
        },
        // Log client disconnections
        onsessionclosed: async (closedSessionId: string) => {
          await logger.logClientDisconnection(closedSessionId);
          // Remove the session
          transports.delete(closedSessionId);
        },
      });

      // Connect transport to the new server
      await sessionServer.connect(sessionTransport);

      // Handle the request
      await sessionTransport.handleRequest(req, res);
    });

    httpServer.listen(serverPort, () => {
      // 打印 HTTP 专属信息
      const responseMode = transportMode === 'http' ? 'JSON Only' : 'SSE Streaming';
      process.stderr.write(`🌐 HTTP Server: http://localhost:${serverPort}\n`);
      process.stderr.write(`📡 MCP Endpoint: http://localhost:${serverPort}/\n`);
      process.stderr.write(`💚 Health Check: http://localhost:${serverPort}/health\n\n`);

      // 打印通用服务器信息
      this.printServerInfo(`Streamable HTTP (${responseMode})`, totalTools, totalResources);

      // Print deprecation warnings
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

/**
 * 改进的认证检查函数
 * 使用统一的错误处理
 */
async function ensureAuthenticated(context?: ResolvedContext): Promise<void> {
  // 使用 ResolvedContext 检查认证状态
  if (context?.hasToken()) {
    return;
  }

  // Auth already in progress
  if (oauthState.isAuthInProgress()) {
    throw createAuthError('AUTH_IN_PROGRESS');
  }

  // ✅ Token 加载已移至 tokenResolver
  // 不再需要在这里预加载和设置全局 token

  // 需要 OAuth 授权
  const environment = EnvConfig.environment;

  try {
    const deviceCodeData = await requestDeviceCode(environment);
    const authUrl = generateAuthUrl(deviceCodeData.qrcode_url, environment);

    // 保存状态，供 complete_oauth_authorization 使用
    oauthState.setPendingState({
      deviceCode: deviceCodeData.device_code,
      environment,
    });

    // 使用统一的OAuth引导文案
    const guidance = generateOAuthGuidance(authUrl);

    throw createAuthError('TOKEN_MISSING', guidance, {
      authUrl,
      retryAvailable: true,
    });
  } catch (error) {
    // 如果是我们自己抛出的认证错误，直接传递
    if (isAuthError(error)) {
      throw error;
    }

    // 网络或其他错误，包装为认证错误
    if (error instanceof Error) {
      throw createAuthError('NETWORK_ERROR', error.message);
    }

    throw createAuthError('CONFIG_ERROR', String(error));
  }
}

// 启动服务器
async function main(): Promise<void> {
  // 启动时初始化签名器（native 或 env fallback）
  await ApiConfig.initAsync();

  // ✅ Token 状态检查已移至 tokenResolver
  // stdio 模式会自动从 ~/.taptap-mcp/cache/local/ 加载
  process.stderr.write('ℹ️  MAC Token will be loaded from user-isolated storage when needed\n');

  const server = new TapTapMinigameMCPServer(ensureAuthenticated);

  // 处理优雅关闭（仅在 stdio 模式下需要，SSE 模式在 startSSEServer 中处理）
  if (transportMode !== 'sse' && transportMode !== 'http') {
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
