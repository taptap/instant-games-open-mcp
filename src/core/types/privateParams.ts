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
   * 优先级：_mac_token > context.macToken > env.TAPTAP_MCP_MAC_TOKEN
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

  // === 应用上下文层（v1.4.0 规划）===

  /**
   * Developer ID (应用开发者 ID)
   * 优先级：_developer_id > context.developerId > cache
   * @example 89058
   */
  _developer_id?: number;

  /**
   * App ID (应用 ID)
   * 优先级：_app_id > context.appId > cache
   * @example 204334
   */
  _app_id?: number;

  /**
   * Project ID (项目标识符)
   * 用于 Token 项目级隔离存储
   * 优先级：_project_id > context.projectId
   * @example "project-456"
   */
  _project_id?: string;

  /**
   * Project Path (项目路径)
   * 用于 H5 上传等需要访问文件系统的场景
   * @example "/workspace/runtime-container-1/project-a"
   */
  _project_path?: string;

  // === 追踪层（扩展）===

  /**
   * Tenant ID for multi-tenant scenarios
   * @example "tenant_abc"
   */
  _tenant_id?: string;

  /**
   * Trace ID for distributed tracing
   * @example "trace_xyz789"
   */
  _trace_id?: string;

  /**
   * Request ID for logging
   * @example "req_12345"
   */
  _request_id?: string;
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
    _session_id: args?._session_id,
    _developer_id: args?._developer_id,
    _app_id: args?._app_id,
    _project_id: args?._project_id,      // ✅ 新增
    _project_path: args?._project_path,
    _tenant_id: args?._tenant_id,
    _trace_id: args?._trace_id,
    _request_id: args?._request_id
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

  const {
    _mac_token,
    _user_id,
    _session_id,
    _developer_id,
    _app_id,
    _project_id,      // ✅ 新增
    _project_path,
    _tenant_id,
    _trace_id,
    _request_id,
    ...businessParams
  } = args;
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

  return !!(
    args._mac_token ||
    args._user_id ||
    args._session_id ||
    args._developer_id ||
    args._app_id ||
    args._project_id ||      // ✅ 新增
    args._project_path ||
    args._tenant_id ||
    args._trace_id ||
    args._request_id
  );
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
  if (privateParams._developer_id !== undefined) {
    result._developer_id = privateParams._developer_id;
  }
  if (privateParams._app_id !== undefined) {
    result._app_id = privateParams._app_id;
  }
  if (privateParams._project_id) {      // ✅ 新增
    result._project_id = privateParams._project_id;
  }
  if (privateParams._project_path) {
    result._project_path = privateParams._project_path;
  }
  if (privateParams._tenant_id) {
    result._tenant_id = privateParams._tenant_id;
  }
  if (privateParams._trace_id) {
    result._trace_id = privateParams._trace_id;
  }
  if (privateParams._request_id) {
    result._request_id = privateParams._request_id;
  }

  return result;
}
