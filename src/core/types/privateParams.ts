/**
 * Private Parameter Protocol
 *
 * MCP Server ↔ Proxy 之间的私有参数约定
 * 这些参数不会在 Tool Definition 中声明，但可以被 Handler 读取
 *
 * 命名规则：下划线前缀 '_' 表示私有参数
 */

import type { MacToken } from './index.js';

/**
 * 私有工具参数接口
 *
 * 这些参数可以被 MCP Proxy 注入到工具调用的 arguments 中，
 * 但不会出现在工具的 inputSchema 定义中。
 *
 * 使用场景：
 * - 多账号认证（_mac_token）
 * - 多租户支持（_user_id）
 * - 请求追踪（_session_id）
 */
export interface PrivateToolParams {
  /**
   * MAC Token for authentication
   *
   * 优先级：_mac_token > context.macToken > env.TDS_MCP_MAC_TOKEN
   *
   * 注入方式：
   * 1. MCP Proxy 直接在 arguments 中注入
   * 2. MCP Server 从 HTTP Header (X-TapTap-Mac-Token) 读取并注入
   *
   * @example
   * ```typescript
   * {
   *   kid: "abc123",
   *   mac_key: "secret_key",
   *   token_type: "mac",
   *   mac_algorithm: "hmac-sha-1"
   * }
   * ```
   */
  _mac_token?: MacToken;

  /**
   * User ID for multi-tenant scenarios
   *
   * 用于多租户场景，标识当前请求的用户身份
   *
   * @example "user_12345"
   */
  _user_id?: string;

  /**
   * Session ID for logging and debugging
   *
   * 用于请求追踪和调试，关联一系列相关的工具调用
   *
   * @example "session_abc123xyz"
   */
  _session_id?: string;
}

/**
 * 从参数对象中提取私有参数
 *
 * @param args - 工具调用的完整参数对象
 * @returns 提取出的私有参数
 *
 * @example
 * ```typescript
 * const args = { page: 1, _mac_token: {...}, _user_id: "123" };
 * const privateParams = extractPrivateParams(args);
 * // { _mac_token: {...}, _user_id: "123", _session_id: undefined }
 * ```
 */
export function extractPrivateParams(args: any): PrivateToolParams {
  return {
    _mac_token: args?._mac_token,
    _user_id: args?._user_id,
    _session_id: args?._session_id
  };
}

/**
 * 从参数对象中移除私有参数（用于日志脱敏）
 *
 * 返回只包含业务参数的新对象，私有参数被移除
 *
 * @param args - 工具调用的完整参数对象
 * @returns 移除私有参数后的业务参数对象
 *
 * @example
 * ```typescript
 * const args = { page: 1, _mac_token: {...}, _user_id: "123" };
 * const businessParams = stripPrivateParams(args);
 * // { page: 1 }
 * ```
 */
export function stripPrivateParams(args: any): any {
  if (!args || typeof args !== 'object') {
    return args;
  }

  const { _mac_token, _user_id, _session_id, ...businessParams } = args;
  return businessParams;
}

/**
 * 检查参数对象是否包含私有参数
 *
 * @param args - 工具调用的参数对象
 * @returns 是否包含任何私有参数
 *
 * @example
 * ```typescript
 * hasPrivateParams({ page: 1 }) // false
 * hasPrivateParams({ page: 1, _mac_token: {...} }) // true
 * ```
 */
export function hasPrivateParams(args: any): boolean {
  if (!args || typeof args !== 'object') {
    return false;
  }

  return !!(args._mac_token || args._user_id || args._session_id);
}

/**
 * 合并私有参数到参数对象
 *
 * @param args - 业务参数对象
 * @param privateParams - 要注入的私有参数
 * @returns 合并后的完整参数对象
 *
 * @example
 * ```typescript
 * const args = { page: 1 };
 * const privateParams = { _mac_token: {...} };
 * const enriched = mergePrivateParams(args, privateParams);
 * // { page: 1, _mac_token: {...} }
 * ```
 */
export function mergePrivateParams(args: any, privateParams: PrivateToolParams): any {
  const result = { ...args };

  if (privateParams._mac_token) {
    result._mac_token = privateParams._mac_token;
  }
  if (privateParams._user_id) {
    result._user_id = privateParams._user_id;
  }
  if (privateParams._session_id) {
    result._session_id = privateParams._session_id;
  }

  return result;
}
