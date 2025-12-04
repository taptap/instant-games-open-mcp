/**
 * MCP Proxy 类型定义
 */

/**
 * MAC Token 结构
 */
export interface MacToken {
  kid: string;
  mac_key: string;
  token_type: 'mac';
  mac_algorithm: 'hmac-sha-1';
}

/**
 * Proxy 配置（通过 JSON 传递）
 */
export interface ProxyConfig {
  /** MCP Server 配置 */
  server: {
    /** TapTap MCP Server 地址 */
    url: string;
    /** 环境选择（默认 rnd） */
    env?: 'rnd' | 'production';
  };

  /** 租户配置 */
  tenant: {
    /** 项目路径（由平台生成，相对于 MCP Server WORKSPACE_ROOT，默认 '.'） */
    project_path?: string;
    /** 用户标识符（可选，仅用于日志追踪和标识） */
    user_id?: string;
    /** 项目标识符（可选，仅用于日志追踪和标识） */
    project_id?: string;
  };

  /** 认证配置（MAC Token） */
  auth: MacToken;

  /** 可选配置 */
  options?: {
    /** 详细日志模式（默认 false） */
    verbose?: boolean;
    /** 重连间隔（毫秒，默认 5000） */
    reconnect_interval?: number;
    /** 请求队列超时（毫秒，默认 30000） */
    request_timeout?: number;
    /** Tool 调用超时（毫秒，默认 300000 即 5 分钟） */
    tool_call_timeout?: number;
    /** 收到 progress 通知时重置超时计时器（默认 true） */
    reset_timeout_on_progress?: boolean;
  };
}

/**
 * 待处理的请求
 */
export interface PendingRequest {
  name: string;
  arguments: any;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}
