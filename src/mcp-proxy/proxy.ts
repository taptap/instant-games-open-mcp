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
import type { ProxyConfig } from './types.js';

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
  private monitorTimer: NodeJS.Timeout | null = null;

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
    console.error(`[Proxy] Starting...`);
    console.error(`[Proxy] Project: ${this.config.tenant.project_id}`);
    console.error(`[Proxy] User: ${this.config.tenant.user_id}`);
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

    // 4. 启动连接监控
    this.monitorConnection();

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

      // 如果是重连，通知 Agent 工具列表已更新
      if (this.reconnecting) {
        await this.notifyToolsChanged();
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
   * 监控连接状态
   */
  private monitorConnection(): void {
    // 定期检查连接状态
    const interval = this.config.options?.monitor_interval ?? 10000;
    this.monitorTimer = setInterval(() => {
      if (!this.connected && !this.reconnecting) {
        console.error('[Proxy] Connection lost, attempting to reconnect...');
        this.reconnectToServer();
      }
    }, interval);
  }

  /**
   * 清理资源（公开方法，供进程退出时调用）
   */
  public cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * 通知 Agent 工具列表已更新
   */
  private async notifyToolsChanged(): Promise<void> {
    try {
      await this.server.notification({
        method: 'notifications/tools/list_changed',
        params: {}
      });
      console.error('[Proxy] 📢 Notified Agent: tools list changed');
    } catch (error) {
      console.error('[Proxy] Failed to notify tools changed:', error);
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
      if (!this.connected) {
        throw new McpError(
          ErrorCode.InternalError,
          'TapTap MCP Server is currently unavailable. The proxy is attempting to reconnect. Please try again in a few moments.'
        );
      }

      const { name, arguments: args } = request.params;

      // 使用配置中的 MAC Token
      const macToken = this.config.auth;

      // 构建 _project_path: 绝对路径（workspacePath/userId/projectId）
      const projectPath = path.join(
        this.config.tenant.workspace_path!,
        this.config.tenant.user_id,
        this.config.tenant.project_id
      );

      // 注入私有参数
      const enrichedArgs = {
        ...args,
        _mac_token: macToken,
        _project_path: projectPath,
        _user_id: this.config.tenant.user_id,
      };

      if (this.config.options?.verbose) {
        console.error(`[Proxy] Tool call: ${name}`);
        console.error(`[Proxy] Injected: _mac_token (kid: ${macToken.kid.substring(0, 12)}...)`);
        console.error(`[Proxy] Injected: _project_path = ${projectPath}`);
      }

      // 透传到 TapTap Server（错误不处理，直接返回）
      const result = await this.client.callTool({
        name,
        arguments: enrichedArgs,
      });

      return result;
    });
  }
}
