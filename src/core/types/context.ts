/**
 * Context Types and Runtime Resolution
 *
 * 统一管理所有 Context 相关的类型和逻辑
 *
 * 设计原则：
 * - 请求级生命周期：每次工具调用创建，用完即丢
 * - 无缓存：每次方法调用都重新计算/加载
 * - 不可变：构造后内部状态不可修改
 */

import type { MacToken } from './index.js';
import type { PrivateToolParams } from './privateParams.js';
import { readAppCache } from '../utils/cache.js';
import { loadTokenFromFile, getTokenPath } from '../auth/tokenStorage.js';
import { EnvConfig } from '../utils/env.js';

/**
 * MCP 请求的原始上下文（接口）
 * 由 MCP Server 在请求时构建和传递
 */
export interface RequestContext {
  // === 认证层 ===
  /** MAC Token for authentication */
  macToken?: MacToken;
  /** User ID for multi-tenant scenarios */
  userId?: string;

  // === 应用上下文层 ===
  /** Developer ID */
  developerId?: number;
  /** App ID */
  appId?: number;
  /** Project ID for token isolation */
  projectId?: string;
  /** Project Path (for file system access) */
  projectPath?: string;

  // === 追踪层 ===
  /** Tenant ID for multi-tenant scenarios */
  tenantId?: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Request ID for logging */
  requestId?: string;
  /** Session ID for request tracking */
  sessionId?: string;
}

/**
 * 应用层深度解析结果
 * 包含从缓存读取的额外信息
 */
export interface AppContext {
  /** Developer ID（应用开发者 ID）*/
  developerId?: number;
  /** App ID（应用 ID）*/
  appId?: number;
  /** Project Path（项目路径）*/
  projectPath?: string;
  /** Developer Name（开发者名称，从缓存读取）*/
  developerName?: string;
  /** App Title（应用名称，从缓存读取）*/
  appTitle?: string;
  /** Miniapp ID（小游戏/H5 预览 ID，从缓存读取）*/
  miniappId?: string;
}

/**
 * Session 上下文（通过闭包注入）
 * 用于 SSE 模式的 Session 隔离
 */
export interface SessionContext {
  userId?: string;
  projectId?: string;
  sessionId?: string;
}

/**
 * Token 来源类型
 */
export enum TokenSource {
  NONE = 'none',
  CONTEXT = 'context', // From request context (MCP Proxy injection)
  ENV = 'env', // From environment variable
  FILE = 'file', // From local OAuth token file
}

/**
 * 运行时解析的 Context（请求级生命周期）
 *
 * 设计原则：
 * - 无缓存：每次调用方法都重新计算/加载
 * - 不可变：构造后 _raw 不可修改
 * - 请求级：仅在单次工具调用中有效，不可保存和重用
 *
 * @example
 * ```typescript
 * // 在 server.ts 中创建
 * const ctx = new ResolvedContext(enrichedArgs, baseContext);
 *
 * // 在 handler 中使用
 * const userId = ctx.userId;
 * const app = ctx.resolveApp();
 * const token = ctx.resolveToken();
 * ```
 */
export class ResolvedContext {
  private readonly _raw: RequestContext;

  /**
   * 构造器：从私有参数和基础 context 创建
   *
   * @param args - 私有参数（_user_id, _mac_token 等）
   * @param base - 基础 context（来自 Session 闭包或空对象）
   */
  constructor(args: PrivateToolParams, base: RequestContext = {}) {
    this._raw = this.mergeArgsIntoContext(args, base);
  }

  /**
   * 合并私有参数到 context（私有方法）
   */
  private mergeArgsIntoContext(args: PrivateToolParams, base: RequestContext): RequestContext {
    const result: RequestContext = { ...base };

    // === 认证层 ===
    if (args._mac_token?.kid && args._mac_token?.mac_key) {
      result.macToken = args._mac_token;
    }
    if (args._user_id) {
      result.userId = args._user_id;
    }
    if (args._session_id) {
      result.sessionId = args._session_id;
    }

    // === 应用上下文层 ===
    if (args._developer_id !== undefined) {
      result.developerId = args._developer_id;
    }
    if (args._app_id !== undefined) {
      result.appId = args._app_id;
    }
    if (args._project_id) {
      result.projectId = args._project_id;
    }
    if (args._project_path) {
      result.projectPath = args._project_path;
    }

    // === 追踪层 ===
    if (args._tenant_id) {
      result.tenantId = args._tenant_id;
    }
    if (args._trace_id) {
      result.traceId = args._trace_id;
    }
    if (args._request_id) {
      result.requestId = args._request_id;
    }

    return result;
  }

  // ========================================================================
  // 字段访问器（直接访问，带默认值）
  // ========================================================================

  /**
   * 获取用户标识
   * 优先级：context.userId > 'local'(stdio) > 'anonymous'
   */
  get userId(): string {
    if (this._raw.userId) {
      return this._raw.userId;
    }
    return EnvConfig.transport === 'stdio' ? 'local' : 'anonymous';
  }

  /** 获取项目标识 */
  get projectId(): string | undefined {
    return this._raw.projectId;
  }

  /** 获取项目路径 */
  get projectPath(): string | undefined {
    return this._raw.projectPath;
  }

  /** 获取开发者 ID */
  get developerId(): number | undefined {
    return this._raw.developerId;
  }

  /** 获取应用 ID */
  get appId(): number | undefined {
    return this._raw.appId;
  }

  /** 获取 Session ID */
  get sessionId(): string | undefined {
    return this._raw.sessionId;
  }

  /** 获取 MAC Token（不解析文件，只返回 context 中的） */
  get macToken(): MacToken | undefined {
    return this._raw.macToken;
  }

  // ========================================================================
  // 应用信息解析（每次调用都读取缓存，无内部缓存）
  // ========================================================================

  /**
   * 解析应用信息（含缓存数据）
   * ⚠️ 每次调用都会读取缓存文件，外部决定是否缓存结果
   */
  resolveApp(): AppContext {
    const cache = readAppCache(this._raw.projectPath);

    return {
      developerId: this._raw.developerId ?? cache?.developer_id,
      appId: this._raw.appId ?? cache?.app_id,
      projectPath: this._raw.projectPath,
      developerName: cache?.developer_name,
      appTitle: cache?.app_title,
      miniappId: cache?.miniapp_id,
    };
  }

  /**
   * 检查是否有有效的应用信息
   */
  hasApp(): boolean {
    const app = this.resolveApp();
    return !!(app.developerId && app.appId);
  }

  // ========================================================================
  // Token 解析（每次调用都加载，无内部缓存）
  // ========================================================================

  /**
   * 解析 MAC Token
   * ⚠️ 每次调用都会重新加载，外部决定是否缓存结果
   *
   * 优先级：
   * 1. context.macToken (MCP Proxy 注入或 HTTP Header 注入)
   * 2. stdio 模式从用户隔离文件加载
   * 3. SSE/HTTP 模式返回 null（必须通过 context 注入）
   *
   * @returns Token 和来源信息
   */
  private resolveTokenWithSource(): { token: MacToken | null; source: TokenSource } {
    // Priority 1: Context token (Proxy/Header 注入)
    if (this._raw.macToken?.kid && this._raw.macToken?.mac_key) {
      return {
        token: this._raw.macToken,
        source: TokenSource.CONTEXT,
      };
    }

    // Priority 2: 从用户隔离文件加载（所有模式都支持）
    const tokenPath = getTokenPath(this.userId, this.projectId);
    const token = loadTokenFromFile(tokenPath);
    if (token?.kid && token?.mac_key) {
      return { token, source: TokenSource.FILE };
    }

    // Priority 3: 无 token
    return { token: null, source: TokenSource.NONE };
  }

  /**
   * 解析 MAC Token（公开方法）
   */
  resolveToken(): MacToken | null {
    return this.resolveTokenWithSource().token;
  }

  /**
   * 检查是否有 Token
   */
  hasToken(): boolean {
    const token = this.resolveToken();
    return !!(token?.kid && token?.mac_key);
  }

  /**
   * 获取 Token 状态和来源
   */
  getTokenStatus(): { hasMacToken: boolean; source: TokenSource } {
    const { token, source } = this.resolveTokenWithSource();
    return {
      hasMacToken: !!(token?.kid && token?.mac_key),
      source,
    };
  }

  // ========================================================================
  // 原始 context 访问（用于传递给底层 API）
  // ========================================================================

  /**
   * 获取原始 RequestContext
   * 用于需要传递给底层 API（如 HttpClient）的场景
   */
  get raw(): RequestContext {
    return this._raw;
  }
}

/**
 * 获取 Token 来源的显示标签
 */
export function getTokenSourceLabel(source: TokenSource): string {
  switch (source) {
    case TokenSource.CONTEXT:
      return '(请求上下文)';
    case TokenSource.ENV:
      return '(环境变量)';
    case TokenSource.FILE:
      return '(本地文件)';
    case TokenSource.NONE:
    default:
      return '';
  }
}
