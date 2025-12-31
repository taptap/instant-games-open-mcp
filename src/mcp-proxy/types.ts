/**
 * MCP Proxy 类型定义
 */

import type { LogLevel } from '../core/types/log.js';

// 重新导出 LogLevel 供外部使用
export type { LogLevel } from '../core/types/log.js';

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
 * 日志配置
 */
export interface LogConfig {
  /**
   * 日志根目录
   * 默认: /tmp/taptap-mcp/logs
   *
   * 实际日志路径: {root}/proxy/{user_id}/{project_id}/ 或 {root}/proxy/{kid_hash}/
   */
  root?: string;

  /**
   * 是否启用文件日志
   * 默认: false
   */
  enabled?: boolean;

  /**
   * 日志级别（RFC 5424 标准）
   * 默认: info
   *
   * 支持的级别（按严重程度递减）：
   * emergency, alert, critical, error, warning, notice, info, debug
   *
   * 注意: 当 verbose=true 时，日志级别自动变为 debug
   */
  level?: LogLevel;

  /**
   * 日志保留天数
   * 默认: 7
   */
  max_days?: number;
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
    /** 健康检查间隔（毫秒，默认 30000）- 定期验证 Server 会话是否有效 */
    health_check_interval?: number;
    /**
     * 启用 Cookie 会话粘性（默认 true）
     * 用于 K8s 多副本部署时，通过 Ingress Cookie 实现会话粘性
     * 确保同一 Proxy 的所有请求被路由到同一个 MCP Server Pod
     */
    enable_cookie_sticky?: boolean;
    /** 日志配置 */
    log?: LogConfig;
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
