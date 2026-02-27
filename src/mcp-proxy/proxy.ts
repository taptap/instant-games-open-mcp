import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { ProxyConfig, PendingRequest } from './types.js';
import { CookieJar, createCookieFetch } from './cookieJar.js';
import { LogWriter, type LogLevel } from '../core/utils/logWriter.js';

// Version placeholder - replaced at build time by esbuild
declare const __PROXY_VERSION__: string;
const VERSION = typeof __PROXY_VERSION__ !== 'undefined' ? __PROXY_VERSION__ : 'dev';

/**
 * TapTap MCP Proxy
 *
 * 功能：
 * 1. 通过 stdio 暴露给 AI Agent
 * 2. 通过 HTTP/SSE 连接到 TapTap MCP Server
 * 3. 自动注入 MAC Token 到工具调用
 * 4. 自动重连并通知 Agent 更新工具列表
 */
export class TapTapMCPProxy {
  private config: ProxyConfig;
  private client: Client;
  private server: Server;

  private connected: boolean = false;
  private reconnecting: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private pendingRequests: PendingRequest[] = [];

  // 会话验证相关
  private sessionValidated: boolean = false;
  private lastValidationTime: number = 0;
  private readonly SESSION_VALIDATION_INTERVAL = 30000; // 30秒验证一次会话

  // Cookie 粘性支持（用于 K8s 多副本部署）
  private cookieJar: CookieJar;

  // 文件日志写入器
  private logWriter: LogWriter;

  constructor(config: ProxyConfig) {
    this.config = config;

    // 初始化 Cookie 管理器（用于会话粘性）
    this.cookieJar = new CookieJar(config.options?.verbose ?? false);

    // 初始化文件日志写入器
    this.logWriter = this.createLogWriter();

    // 初始化 MCP Client（连接 TapTap Server）
    this.client = new Client(
      { name: 'taptap-proxy-client', version: '1.0.0' },
      { capabilities: {} }
    );

    // 初始化 MCP Server（暴露给 Agent）
    this.server = new Server(
      { name: 'taptap-proxy', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } }
    );
  }

  /**
   * 创建文件日志写入器
   */
  private createLogWriter(): LogWriter {
    const logConfig = this.config.options?.log;
    const logRoot = logConfig?.root || '/tmp/taptap-mcp/logs';

    // 计算日志目录
    const { user_id, project_id } = this.config.tenant;
    let logDir: string;

    if (user_id && project_id) {
      // 有 user_id 和 project_id，使用它们
      logDir = path.join(logRoot, 'proxy', user_id, project_id);
    } else {
      // 无 user_id/project_id，使用 kid 的 hash
      const kidHash = crypto
        .createHash('sha256')
        .update(this.config.auth.kid)
        .digest('hex')
        .substring(0, 8);
      logDir = path.join(logRoot, 'proxy', kidHash);
    }

    return new LogWriter({
      logDir,
      prefix: 'proxy',
      enabled: logConfig?.enabled ?? false,
      level: logConfig?.level ?? 'info',
      maxDays: logConfig?.max_days ?? 7,
    });
  }

  /**
   * 获取当前时间戳
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 统一日志输出方法
   */
  private log(level: LogLevel, message: string): void {
    const timestamp = this.getTimestamp();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [proxy] ${message}\n`;
    this.logWriter.writeSync(level, formattedMessage);
  }

  /**
   * 启动 Proxy
   */
  async start(): Promise<void> {
    this.log('info', `TapTap MCP Proxy v${VERSION}`);
    this.log('info', 'Starting...');
    this.log('info', `Server URL: ${this.config.server.url}`);
    this.log('info', `Project Path: ${this.config.tenant.project_path}`);
    if (this.config.tenant.user_id) {
      this.log('info', `User ID: ${this.config.tenant.user_id}`);
    }
    if (this.config.tenant.project_id) {
      this.log('info', `Project ID: ${this.config.tenant.project_id}`);
    }
    this.log('info', `Token kid: ${this.config.auth.kid.substring(0, 12)}...`);
    this.log('info', `Cookie sticky: ${this.config.options?.enable_cookie_sticky ?? true}`);

    // 显示文件日志配置
    const logConfig = this.config.options?.log;
    if (logConfig?.enabled) {
      this.log('info', `File logging enabled: ${this.logWriter.getConfig().logDir}`);
    }

    // 1. 初始化时直接连接 TapTap Server
    try {
      await this.connectToServer();
    } catch (error) {
      this.log('error', `❌ Initial connection failed: ${this.formatError(error)}`);
      this.log('info', 'Will retry in background...');
      this.scheduleReconnect();
      // 不抛出错误，让 Proxy 继续启动
      // Agent 在调用工具时会收到 "not connected" 错误
    }

    // 2. 设置请求处理器
    this.setupHandlers();

    // 3. 启动 stdio server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.log('info', 'Started (stdio mode)');
  }

  /**
   * 构建会话初始化 Headers
   * 将所有会话参数通过 Header 传递（更安全，不会暴露在 URL/日志中）
   *
   * Headers:
   * - X-TapTap-User-Id: 用户标识
   * - X-TapTap-Project-Id: 项目标识
   * - X-TapTap-Project-Path: 项目路径
   * - X-TapTap-Mac-Token: MAC 认证令牌（JSON）
   */
  private buildSessionHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    // 会话上下文参数
    if (this.config.tenant.user_id) {
      headers['X-TapTap-User-Id'] = this.config.tenant.user_id;
    }
    if (this.config.tenant.project_id) {
      headers['X-TapTap-Project-Id'] = this.config.tenant.project_id;
    }
    if (this.config.tenant.project_path) {
      headers['X-TapTap-Project-Path'] = this.config.tenant.project_path;
    }

    // 认证令牌（JSON 序列化）
    headers['X-TapTap-Mac-Token'] = JSON.stringify(this.config.auth);

    // 业务自定义字段（JSON 序列化）
    if (
      this.config.tenant.custom_fields &&
      Object.keys(this.config.tenant.custom_fields).length > 0
    ) {
      headers['X-TapTap-Custom-Fields'] = JSON.stringify(this.config.tenant.custom_fields);
    }

    return headers;
  }

  /**
   * 注入私有参数到工具调用参数中
   *
   * 私有参数已在初始化连接时通过 Headers 传递，此方法用于在每次工具调用时
   * 也注入这些参数，以兼容不支持从 Session 获取参数的 MCP Server。
   *
   * 注入的参数（以下划线开头，表示私有）：
   * - _mac_token: MAC 认证令牌
   * - _user_id: 用户标识（可选）
   * - _project_id: 项目标识（可选）
   * - _project_path: 项目路径（可选）
   */
  private injectPrivateParams(args: Record<string, unknown> | undefined): Record<string, unknown> {
    const injected: Record<string, unknown> = { ...(args || {}) };

    // 注入 MAC Token（必需）
    injected._mac_token = this.config.auth;

    // 注入可选的会话上下文参数
    if (this.config.tenant.user_id) {
      injected._user_id = this.config.tenant.user_id;
    }
    if (this.config.tenant.project_id) {
      injected._project_id = this.config.tenant.project_id;
    }
    if (this.config.tenant.project_path) {
      injected._project_path = this.config.tenant.project_path;
    }

    // 注入业务自定义字段
    if (
      this.config.tenant.custom_fields &&
      Object.keys(this.config.tenant.custom_fields).length > 0
    ) {
      injected._custom_fields = this.config.tenant.custom_fields;
    }

    return injected;
  }

  /**
   * 连接到 TapTap MCP Server
   */
  private async connectToServer(): Promise<void> {
    this.log('info', `Connecting to ${this.config.server.url}...`);

    try {
      // 创建支持 Cookie 的 fetch（用于 K8s Ingress 会话粘性）
      const cookieEnabled = this.config.options?.enable_cookie_sticky ?? true;
      const customFetch = cookieEnabled ? createCookieFetch(this.cookieJar) : undefined;

      if (cookieEnabled && this.config.options?.verbose) {
        this.log('debug', 'Cookie sticky session enabled');
      }

      // 构建会话 Headers（包含认证和上下文信息）
      const sessionHeaders = this.buildSessionHeaders();

      const transport = new StreamableHTTPClientTransport(new URL(this.config.server.url), {
        fetch: customFetch,
        // ✅ 在初始化请求中附加会话 Headers
        requestInit: {
          headers: sessionHeaders,
        },
      });

      await this.client.connect(transport);

      // 🔑 关键：连接成功后立即验证会话
      // 这确保即使连接到新的 Server 副本，也能确认 MCP 会话已正确初始化
      await this.validateSession();

      this.connected = true;
      this.sessionValidated = true;
      this.lastValidationTime = Date.now();

      this.log('info', '✅ Connected and session validated');

      // 启动定期健康检查
      this.startHealthCheck();

      // 如果是重连，处理待处理的请求
      if (this.reconnecting) {
        await this.notifyReconnected();
        await this.processPendingRequests();
        this.reconnecting = false;
      }
    } catch (error) {
      this.connected = false; // 确保连接失败时状态正确
      this.sessionValidated = false;
      throw error;
    }
  }

  /**
   * 验证 MCP 会话是否有效
   * 通过调用 listTools 来验证 Server 端的 MCP 会话状态
   */
  private async validateSession(): Promise<void> {
    this.log('debug', 'Validating MCP session...');

    try {
      // 使用 listTools 作为会话验证手段
      // 如果 Server 未初始化，这个调用会失败
      await this.client.listTools();
      this.log('debug', '✅ Session validation successful');
    } catch (error) {
      this.log('error', `❌ Session validation failed: ${error}`);

      // 检查是否是 "server not initialized" 错误
      if (this.isSessionInvalidError(error)) {
        throw new Error('Server session not initialized - need to reconnect');
      }

      // 其他错误也视为会话无效
      throw error;
    }
  }

  /**
   * 检测是否是会话无效错误（Server 未初始化）
   */
  private isSessionInvalidError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const errorMsg = error.message.toLowerCase();

    // MCP SDK Server 返回的未初始化错误
    const sessionInvalidKeywords = [
      'server not initialized',
      'not initialized',
      'session not found',
      'session expired',
      'invalid session',
      'no active session',
    ];

    return sessionInvalidKeywords.some((keyword) => errorMsg.includes(keyword));
  }

  /**
   * 启动定期健康检查
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    const interval = this.config.options?.health_check_interval ?? this.SESSION_VALIDATION_INTERVAL;

    this.healthCheckTimer = setInterval(async () => {
      if (!this.connected || this.reconnecting) return;

      try {
        await this.validateSession();
        this.lastValidationTime = Date.now();
      } catch (error) {
        this.log('error', '❌ Health check failed, triggering reconnection');
        this.connected = false;
        this.sessionValidated = false;

        if (!this.reconnecting) {
          this.reconnectToServer();
        }
      }
    }, interval);

    this.log('debug', `Health check started (interval: ${interval}ms)`);
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 格式化错误信息，提取有用的错误详情
   *
   * 错误来源及结构：
   * 1. 网络层错误 (Node.js fetch):
   *    - message: "fetch failed"
   *    - cause.code: "ECONNREFUSED" / "ETIMEDOUT" 等系统错误码
   *    - cause.message: "connect ECONNREFUSED 127.0.0.1:4000"
   *
   * 2. HTTP 错误 (MCP SDK send):
   *    - message: "Error POSTing to endpoint (HTTP 502): Bad Gateway"
   *    - HTTP 状态码嵌入在 message 中
   *
   * 3. SSE 连接错误 (MCP SDK StreamableHTTPError):
   *    - message: "Streamable HTTP error: Failed to open SSE stream: Bad Gateway"
   *    - code: 502 (HTTP 状态码，注意和系统错误码共用 code 字段)
   */
  private formatError(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }

    const parts: string[] = [];

    // 错误消息（HTTP 状态码可能嵌入在消息中）
    parts.push(error.message);

    // 错误码：可能是系统错误码 (ECONNREFUSED) 或 HTTP 状态码 (502)
    const errorCode = (error as any).code;
    if (errorCode) {
      // 判断是数字（HTTP 状态码）还是字符串（系统错误码）
      if (typeof errorCode === 'number') {
        parts.push(`[HTTP ${errorCode}]`);
      } else {
        parts.push(`[${errorCode}]`);
      }
    }

    // 原因（cause）- 网络错误的真正原因在这里
    const cause = (error as any).cause;
    if (cause) {
      if (cause instanceof Error) {
        const causeCode = (cause as any).code;
        let causeInfo = cause.message;
        if (causeCode) causeInfo += ` [${causeCode}]`;
        parts.push(`(cause: ${causeInfo})`);
      } else {
        parts.push(`(cause: ${String(cause)})`);
      }
    }

    return parts.join(' ');
  }

  /**
   * 重连到 TapTap Server
   */
  private async reconnectToServer(): Promise<void> {
    if (this.reconnecting) return; // 防止重复重连

    this.reconnecting = true;
    this.clearReconnectTimer();

    // Clear cookies to retrieve new routing information
    // This ensures correct routing cookies when connecting to different Pods
    const cookieEnabled = this.config.options?.enable_cookie_sticky ?? true;
    if (cookieEnabled && this.cookieJar.hasCookies) {
      this.cookieJar.clear();
      if (this.config.options?.verbose) {
        this.log('debug', 'Cookies cleared for reconnection');
      }
    }

    try {
      // 重连时创建新的 Client 实例（避免旧 Client 状态异常）
      this.client = new Client(
        { name: 'taptap-proxy-client', version: '1.0.0' },
        { capabilities: {} }
      );

      await this.connectToServer();
      this.log('info', '✅ Reconnected successfully');
    } catch (error) {
      const interval = this.config.options?.reconnect_interval ?? 5000;
      this.log('error', `❌ Reconnect failed: ${this.formatError(error)}`);
      this.log('info', `Will retry in ${interval / 1000}s...`);
      this.reconnecting = false; // 重置状态，允许下次重连
      this.scheduleReconnect();
    }
  }

  /**
   * 调度重连
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const interval = this.config.options?.reconnect_interval ?? 5000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectToServer();
    }, interval);
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 清理资源（公开方法，供进程退出时调用）
   */
  public cleanup(): void {
    // 停止健康检查
    this.stopHealthCheck();

    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 拒绝所有待处理的请求
    const timeout = new Error('Proxy is shutting down');
    while (this.pendingRequests.length > 0) {
      const req = this.pendingRequests.shift()!;
      req.reject(timeout);
    }
  }

  /**
   * 检测是否是需要重连的错误（网络错误或会话无效）
   */
  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const errorMsg = error.message.toLowerCase();
    const errorCode = (error as any).code;

    // 检查错误码（优先，更可靠）
    const networkErrorCodes = [
      'ECONNREFUSED', // 连接拒绝
      'ECONNRESET', // 连接重置
      'ETIMEDOUT', // 连接超时
      'ENOTFOUND', // DNS 解析失败
      'EHOSTUNREACH', // 主机不可达
      'ENETUNREACH', // 网络不可达
      'EPIPE', // 管道破裂
      'EAI_AGAIN', // DNS 临时失败
    ];

    if (errorCode && networkErrorCodes.includes(errorCode)) {
      return true;
    }

    // 检查错误消息关键词（备选）
    const networkErrorKeywords = [
      'fetch failed',
      'socket hang up',
      'network error',
      'connection refused',
      'connection reset',
      'timeout',
      'dns',
      'not connected', // 连接断开
    ];

    if (networkErrorKeywords.some((keyword) => errorMsg.includes(keyword))) {
      return true;
    }

    // 🔑 关键：会话无效错误也需要触发重连
    // 这解决了多副本部署时连接到未初始化 Server 副本的问题
    return this.isSessionInvalidError(error);
  }

  /**
   * 处理待处理的请求队列
   */
  private async processPendingRequests(): Promise<void> {
    const timeout = this.config.options?.request_timeout ?? 30000;
    const now = Date.now();

    this.log('info', `Processing ${this.pendingRequests.length} pending requests...`);

    while (this.pendingRequests.length > 0) {
      const req = this.pendingRequests.shift()!;

      // 检查请求是否超时
      if (now - req.timestamp > timeout) {
        req.reject(new Error('Request timeout while waiting for reconnection'));
        continue;
      }

      // 执行请求
      try {
        const result = await this.client.callTool(
          {
            name: req.name,
            arguments: req.arguments,
          },
          undefined, // resultSchema
          {
            timeout: this.config.options?.tool_call_timeout ?? 300000,
            resetTimeoutOnProgress: this.config.options?.reset_timeout_on_progress ?? true,
          }
        );
        req.resolve(result);
      } catch (error) {
        req.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.log('info', '✅ All pending requests processed');
  }

  /**
   * 通知 Agent 已重新连接
   */
  private async notifyReconnected(): Promise<void> {
    try {
      // 1. 发送标准日志通知（所有客户端都支持）
      await this.server.notification({
        method: 'notifications/message',
        params: {
          level: 'info',
          logger: 'proxy',
          data: {
            message: '✅ Reconnected to TapTap MCP Server',
            event: 'reconnected',
            timestamp: new Date().toISOString(),
          },
        },
      });

      // 2. 尝试发送工具列表变化通知（支持的客户端会刷新）
      try {
        await this.server.notification({
          method: 'notifications/tools/list_changed',
          params: {},
        });
      } catch (error) {
        // 忽略不支持的通知
      }

      this.log('info', '📢 Notified Agent: reconnected');
    } catch (error) {
      this.log('warning', `⚠️  Failed to send notification: ${error}`);
    }
  }

  /**
   * 设置请求处理器
   */
  private setupHandlers(): void {
    // 转发 tools/list（不缓存，每次都转发）
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.connected) {
        throw new McpError(
          ErrorCode.InternalError,
          'TapTap MCP Server is currently unavailable. The proxy is attempting to reconnect. Please try again in a few moments.'
        );
      }

      const result = await this.client.listTools();
      return result;
    });

    // 转发 resources/list（不缓存）
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      if (!this.connected) {
        throw new McpError(
          ErrorCode.InternalError,
          'TapTap MCP Server is currently unavailable. The proxy is attempting to reconnect. Please try again in a few moments.'
        );
      }

      const result = await this.client.listResources();
      return result;
    });

    // 转发 resources/read
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (!this.connected) {
        throw new McpError(
          ErrorCode.InternalError,
          'TapTap MCP Server is currently unavailable. The proxy is attempting to reconnect. Please try again in a few moments.'
        );
      }

      const result = await this.client.readResource(request.params);
      return result;
    });

    // 拦截 tools/call - 注入私有参数后转发
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // 根据配置决定是否在每次调用时注入私有参数（默认注入，兼容不同 MCP Server）
      const shouldInjectParams = this.config.options?.inject_params_per_call ?? true;
      const finalArgs = shouldInjectParams ? this.injectPrivateParams(args) : args;

      if (this.config.options?.verbose) {
        this.log('debug', `Tool call: ${name} (inject_params_per_call: ${shouldInjectParams})`);
      }

      // 检查连接状态
      if (!this.connected) {
        // 如果正在重连，加入队列等待
        if (this.reconnecting) {
          this.log('info', `⏳ Queueing request: ${name} (reconnecting...)`);

          return new Promise((resolve, reject) => {
            this.pendingRequests.push({
              name,
              arguments: finalArgs,
              resolve,
              reject,
              timestamp: Date.now(),
            });
          });
        }

        // 未连接且未重连，抛出错误
        throw new McpError(
          ErrorCode.InternalError,
          'TapTap MCP Server is currently unavailable. The proxy will attempt to reconnect automatically.'
        );
      }

      // 转发到 TapTap Server（捕获网络错误并触发重连）
      try {
        const result = await this.client.callTool(
          {
            name,
            arguments: finalArgs,
          },
          undefined, // resultSchema
          {
            timeout: this.config.options?.tool_call_timeout ?? 300000,
            resetTimeoutOnProgress: this.config.options?.reset_timeout_on_progress ?? true,
          }
        );
        return result;
      } catch (error) {
        // 检查是否是网络错误（使用增强的检测）
        if (this.isNetworkError(error)) {
          this.log('error', '❌ Network error detected, marking connection as lost');
          this.connected = false;

          // 立即触发重连
          if (!this.reconnecting) {
            this.log('info', 'Triggering immediate reconnection...');
            this.reconnectToServer();

            // 将当前请求加入队列等待重连
            this.log('info', `⏳ Queueing current request: ${name}`);
            return new Promise((resolve, reject) => {
              this.pendingRequests.push({
                name,
                arguments: finalArgs,
                resolve,
                reject,
                timestamp: Date.now(),
              });
            });
          }
        }

        // 非网络错误，直接抛出
        throw error;
      }
    });
  }
}
