/**
 * Private Parameter Protocol
 *
 * MCP Server ↔ Proxy 之间的私有参数约定
 * 这些参数不会在 Tool Definition 中声明，但可以被 Handler 读取
 *
 * 命名规则：下划线前缀 '_' 表示私有参数
 *
 * 架构简化（v1.14+）：
 * - 大部分参数已通过 SessionContext（Headers）传递
 * - 私有参数仅用于工具调用时的额外覆盖
 */

import type { MacToken } from './index.js';

/**
 * 私有工具参数接口
 *
 * 这些参数可以被注入到工具调用的 arguments 中，
 * 但不会出现在工具的 inputSchema 定义中。
 *
 * 使用场景：
 * - 覆盖 Session 中的认证（_mac_token）
 * - 覆盖 Session 中的用户标识（_user_id）
 * - 覆盖 Session 中的项目标识（_project_id, _project_path）
 *
 * 注意：developer_id 和 app_id 不在此接口中，
 * 它们应通过 select_app 工具设置并从缓存中读取
 */
export interface PrivateToolParams {
  /**
   * MAC Token for authentication（覆盖 Session 中的 Token）
   *
   * 注入方式：
   * 1. 工具调用时在 arguments 中注入
   * 2. 通常不需要，因为 Token 已在 Session 创建时通过 Header 传递
   */
  _mac_token?: MacToken;

  /**
   * User ID（覆盖 Session 中的 userId）
   * @example "user_12345"
   */
  _user_id?: string;

  /**
   * Session ID（覆盖 Session 中的 sessionId）
   * @example "session_abc123xyz"
   */
  _session_id?: string;

  /**
   * Project ID（覆盖 Session 中的 projectId）
   * 用于缓存隔离
   * @example "project-456"
   */
  _project_id?: string;

  /**
   * Project Path（覆盖 Session 中的 projectPath）
   * 用于文件系统访问和缓存隔离
   * @example "/workspace/runtime-container-1/project-a"
   */
  _project_path?: string;

  /**
   * 业务自定义字段（覆盖 Session 中的 customFields）
   * 由 Proxy 从配置中注入，透传到 Server 业务层
   * @example { "team": "game-studio-a", "env": "staging" }
   */
  _custom_fields?: Record<string, string>;
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
 * // { _mac_token: {...}, _user_id: "123" }
 * ```
 */
export function extractPrivateParams(args: any): PrivateToolParams {
  return {
    _mac_token: args?._mac_token,
    _user_id: args?._user_id,
    _session_id: args?._session_id,
    _project_id: args?._project_id,
    _project_path: args?._project_path,
    _custom_fields: args?._custom_fields,
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
    _project_id,
    _project_path,
    _custom_fields,
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
    args._project_id ||
    args._project_path ||
    args._custom_fields
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
  if (privateParams._project_id) {
    result._project_id = privateParams._project_id;
  }
  if (privateParams._project_path) {
    result._project_path = privateParams._project_path;
  }
  if (privateParams._custom_fields) {
    result._custom_fields = privateParams._custom_fields;
  }

  return result;
}
