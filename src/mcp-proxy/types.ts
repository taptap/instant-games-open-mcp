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
    /** 用户 ID（用于标识租户） */
    user_id: string;
    /** 项目 ID（用于标识租户） */
    project_id: string;
    /** 工作空间根路径（Docker 中的挂载点，默认 /workspace） */
    workspace_path?: string;
    /** 项目相对于 workspace 的路径（例如：Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo） */
    project_relative_path?: string;
  };

  /** 认证配置（MAC Token） */
  auth: MacToken;

  /** 可选配置 */
  options?: {
    /** 详细日志模式（默认 false） */
    verbose?: boolean;
    /** 重连间隔（毫秒，默认 5000） */
    reconnect_interval?: number;
    /** 连接监控间隔（毫秒，默认 10000） */
    monitor_interval?: number;
  };
}
