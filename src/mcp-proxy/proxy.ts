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
// import * as path from 'node:path';  // 暂时未使用
import type { ProxyConfig, PendingRequest } from './types.js';
import { VERSION } from '../version.js';

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
  private pendingRequests: PendingRequest[] = [];

  constructor(config: ProxyConfig) {
    this.config = config;

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
   * 启动 Proxy
   */
  async start(): Promise<void> {
    console.error(`[Proxy] TapTap MCP Proxy v${VERSION}`);
    console.error(`[Proxy] Starting...`);
    console.error(`[Proxy] Project Path: ${this.config.tenant.project_path}`);
    if (this.config.tenant.user_id) {
      console.error(`[Proxy] User ID: ${this.config.tenant.user_id}`);
    }
    if (this.config.tenant.project_id) {
      console.error(`[Proxy] Project ID: ${this.config.tenant.project_id}`);
    }
    console.error(`[Proxy] Token kid: ${this.config.auth.kid.substring(0, 12)}...`);

    // 1. 初始化时直接连接 TapTap Server
    try {
      await this.connectToServer();
    } catch (error) {
      console.error('[Proxy] Initial connection failed, will retry in background');
      this.scheduleReconnect();
      // 不抛出错误，让 Proxy 继续启动
      // Agent 在调用工具时会收到 "not connected" 错误
    }

    // 2. 设置请求处理器
    this.setupHandlers();

    // 3. 启动 stdio server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('[Proxy] Started (stdio mode)');
  }

  /**
   * 连接到 TapTap MCP Server
   */
  private async connectToServer(): Promise<void> {
    console.error(`[Proxy] Connecting to ${this.config.server.url}...`);

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(this.config.server.url)
      );

      await this.client.connect(transport);
      this.connected = true;

      console.error('[Proxy] ✅ Connected to TapTap MCP Server');

      // 如果是重连，处理待处理的请求
      if (this.reconnecting) {
        await this.notifyReconnected();
        await this.processPendingRequests();
        this.reconnecting = false;
      }
    } catch (error) {
      this.connected = false; // 确保连接失败时状态正确
      throw error;
    }
  }

  /**
   * 重连到 TapTap Server
   */
  private async reconnectToServer(): Promise<void> {
    if (this.reconnecting) return; // 防止重复重连

    this.reconnecting = true;
    this.clearReconnectTimer();

    try {
      // 重连时创建新的 Client 实例（避免旧 Client 状态异常）
      this.client = new Client(
        { name: 'taptap-proxy-client', version: '1.0.0' },
        { capabilities: {} }
      );

      await this.connectToServer();
      console.error('[Proxy] ✅ Reconnected successfully');
    } catch (error) {
      console.error('[Proxy] Reconnect failed, will retry in 5s');
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
   * 检测是否是网络错误或连接中断
   */
  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const errorMsg = error.message.toLowerCase();
    const errorCode = (error as any).code;

    // 检查错误码（优先，更可靠）
    const networkErrorCodes = [
      'ECONNREFUSED',  // 连接拒绝
      'ECONNRESET',    // 连接重置
      'ETIMEDOUT',     // 连接超时
      'ENOTFOUND',     // DNS 解析失败
      'EHOSTUNREACH',  // 主机不可达
      'ENETUNREACH',   // 网络不可达
      'EPIPE',         // 管道破裂
      'EAI_AGAIN',     // DNS 临时失败
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
      'server not initialized',  // MCP SDK Server 未初始化（重启后会话丢失）
      'not connected',            // 连接断开
    ];

    return networkErrorKeywords.some(keyword => errorMsg.includes(keyword));
  }

  /**
   * 处理待处理的请求队列
   */
  private async processPendingRequests(): Promise<void> {
    const timeout = this.config.options?.request_timeout ?? 30000;
    const now = Date.now();

    console.error(`[Proxy] Processing ${this.pendingRequests.length} pending requests...`);

    while (this.pendingRequests.length > 0) {
      const req = this.pendingRequests.shift()!;

      // 检查请求是否超时
      if (now - req.timestamp > timeout) {
        req.reject(new Error('Request timeout while waiting for reconnection'));
        continue;
      }

      // 执行请求
      try {
        const result = await this.client.callTool({
          name: req.name,
          arguments: req.arguments,
        });
        req.resolve(result);
      } catch (error) {
        req.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    console.error('[Proxy] ✅ All pending requests processed');
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
            timestamp: new Date().toISOString()
          }
        }
      });

      // 2. 尝试发送工具列表变化通知（支持的客户端会刷新）
      try {
        await this.server.notification({
          method: 'notifications/tools/list_changed',
          params: {}
        });
      } catch (error) {
        // 忽略不支持的通知
      }

      console.error('[Proxy] 📢 Notified Agent: reconnected');
    } catch (error) {
      console.error('[Proxy] ⚠️  Failed to send notification:', error);
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

    // 拦截 tools/call - 注入私有参数
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // 使用配置中的 MAC Token
      const macToken = this.config.auth;

      // 直接使用配置中的项目路径（相对路径，由平台生成）
      // 注入私有参数
      const enrichedArgs = {
        ...args,
        _mac_token: macToken,
        _project_path: this.config.tenant.project_path,
        _user_id: this.config.tenant.user_id,
      };

      if (this.config.options?.verbose) {
        console.error(`[Proxy] Tool call: ${name}`);
        console.error(`[Proxy] Injected: _mac_token (kid: ${macToken.kid.substring(0, 12)}...)`);
        console.error(`[Proxy] Injected: _project_path = ${this.config.tenant.project_path}`);
      }

      // 检查连接状态
      if (!this.connected) {
        // 如果正在重连，加入队列等待
        if (this.reconnecting) {
          console.error(`[Proxy] ⏳ Queueing request: ${name} (reconnecting...)`);

          return new Promise((resolve, reject) => {
            this.pendingRequests.push({
              name,
              arguments: enrichedArgs,
              resolve,
              reject,
              timestamp: Date.now()
            });
          });
        }

        // 未连接且未重连，抛出错误
        throw new McpError(
          ErrorCode.InternalError,
          'TapTap MCP Server is currently unavailable. The proxy will attempt to reconnect automatically.'
        );
      }

      // 透传到 TapTap Server（捕获网络错误并触发重连）
      try {
        const result = await this.client.callTool({
          name,
          arguments: enrichedArgs,
        });
        return result;
      } catch (error) {
        // 检查是否是网络错误（使用增强的检测）
        if (this.isNetworkError(error)) {
          console.error('[Proxy] ❌ Network error detected, marking connection as lost');
          this.connected = false;

          // 立即触发重连
          if (!this.reconnecting) {
            console.error('[Proxy] Triggering immediate reconnection...');
            this.reconnectToServer();

            // 将当前请求加入队列等待重连
            console.error(`[Proxy] ⏳ Queueing current request: ${name}`);
            return new Promise((resolve, reject) => {
              this.pendingRequests.push({
                name,
                arguments: enrichedArgs,
                resolve,
                reject,
                timestamp: Date.now()
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
