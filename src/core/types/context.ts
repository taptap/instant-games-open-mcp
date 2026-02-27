/**
 * Context Types and Runtime Resolution
 *
 * 统一管理所有 Context 相关的类型和逻辑
 *
 * 设计原则：
 * - 请求级生命周期：每次工具调用创建，用完即丢
 * - 无缓存：每次方法调用都重新计算/加载
 * - 不可变：构造后内部状态不可修改
 *
 * 架构简化（v1.14+）：
 * - 删除 RequestContext，直接使用 SessionContext
 * - ResolvedContext = SessionContext + PrivateToolParams
 */

import type { MacToken } from './index.js';
import type { PrivateToolParams } from './privateParams.js';
import { readAppCache } from '../utils/cache.js';
import { loadTokenFromFile, getTokenPath } from '../auth/tokenStorage.js';
import { EnvConfig } from '../utils/env.js';

/**
 * Session 上下文（通过闭包注入）
 * 用于 SSE/HTTP 模式的 Session 隔离
 *
 * 参数来源（优先级从高到低）：
 * 1. HTTP Headers（Proxy 模式推荐）：
 *    - X-TapTap-User-Id
 *    - X-TapTap-Project-Id
 *    - X-TapTap-Project-Path
 *    - X-TapTap-Mac-Token（JSON 序列化）
 *    - X-TapTap-Custom-Fields（JSON 序列化，业务自定义字段）
 * 2. URL 参数（SSE 直连兼容）：
 *    - ?user_id=xxx&project_id=xxx&project_path=xxx
 */
export interface SessionContext {
  userId?: string;
  projectId?: string;
  projectPath?: string;
  sessionId?: string;
  macToken?: MacToken;
  /** 业务自定义字段（由 Proxy 透传） */
  customFields?: Record<string, string>;
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
 * Token 来源类型
 */
export enum TokenSource {
  NONE = 'none',
  CONTEXT = 'context', // From session context (Header injection)
  FILE = 'file', // From local OAuth token file
}

/**
 * ResolvedContext 内部存储结构
 * 合并 SessionContext + PrivateToolParams
 *
 * 注意：developerId 和 appId 不在此结构中，
 * 它们应通过 resolveApp() 方法从缓存中读取
 */
interface ResolvedData {
  // Session 层（来自 SessionContext）
  userId?: string;
  projectId?: string;
  projectPath?: string;
  sessionId?: string;
  macToken?: MacToken;
  customFields?: Record<string, string>;
}

/**
 * 运行时解析的 Context（请求级生命周期）
 *
 * 设计原则：
 * - 无缓存：每次调用方法都重新计算/加载
 * - 不可变：构造后内部状态不可修改
 * - 请求级：仅在单次工具调用中有效，不可保存和重用
 *
 * 数据来源：
 * - SessionContext: userId, projectId, projectPath, sessionId, macToken
 * - PrivateToolParams: 覆盖上述字段 + developerId, appId
 *
 * @example
 * ```typescript
 * // 在 server.ts 中创建
 * const ctx = new ResolvedContext(args, sessionContext);
 *
 * // 在 handler 中使用
 * const userId = ctx.userId;
 * const app = ctx.resolveApp();
 * const token = ctx.resolveToken();
 * ```
 */
export class ResolvedContext {
  private readonly _data: ResolvedData;

  /**
   * 构造器：从私有参数和 Session 上下文创建
   *
   * @param args - 私有参数（_user_id, _mac_token 等）
   * @param session - Session 上下文（来自闭包或空对象）
   */
  constructor(args: PrivateToolParams, session: SessionContext = {}) {
    this._data = this.merge(args, session);
  }

  /**
   * 合并私有参数和 Session 上下文
   * 优先级：私有参数 > Session 上下文
   */
  private merge(args: PrivateToolParams, session: SessionContext): ResolvedData {
    return {
      // Session 层（私有参数优先）
      userId: args._user_id || session.userId,
      projectId: args._project_id || session.projectId,
      projectPath: args._project_path || session.projectPath,
      sessionId: args._session_id || session.sessionId,
      macToken:
        args._mac_token?.kid && args._mac_token?.mac_key ? args._mac_token : session.macToken,
      customFields: args._custom_fields || session.customFields,
    };
  }

  // ========================================================================
  // 字段访问器
  // ========================================================================

  /**
   * 获取用户标识
   * 优先级：data.userId > 'local'(stdio) > 'anonymous'
   */
  get userId(): string {
    if (this._data.userId) {
      return this._data.userId;
    }
    return EnvConfig.transport === 'stdio' ? 'local' : 'anonymous';
  }

  /** 获取项目标识 */
  get projectId(): string | undefined {
    return this._data.projectId;
  }

  /** 获取项目路径 */
  get projectPath(): string | undefined {
    return this._data.projectPath;
  }

  /** 获取 Session ID */
  get sessionId(): string | undefined {
    return this._data.sessionId;
  }

  /** 获取 MAC Token（不解析文件，只返回 context 中的） */
  get macToken(): MacToken | undefined {
    return this._data.macToken;
  }

  /** 获取业务自定义字段 */
  get customFields(): Record<string, string> | undefined {
    return this._data.customFields;
  }

  // ========================================================================
  // 应用信息解析（每次调用都读取缓存，无内部缓存）
  // ========================================================================

  /**
   * 获取缓存隔离 key
   *
   * 优先级：
   * 1. projectPath（SSE + Proxy 模式，由 Proxy 注入完整路径）
   * 2. projectId（SSE 直连模式，由客户端通过 URL 参数传递）
   * 3. undefined（stdio 模式，fallback 到 workspaceRoot）
   */
  getCacheIsolationKey(): string | undefined {
    return this._data.projectPath || this._data.projectId;
  }

  /**
   * 解析应用信息（从缓存读取）
   * ⚠️ 每次调用都会读取缓存文件，外部决定是否缓存结果
   *
   * 注意：developerId 和 appId 仅从缓存读取，
   * 需要先调用 select_app 工具设置应用
   */
  resolveApp(): AppContext {
    const cacheKey = this.getCacheIsolationKey();
    const cache = readAppCache(cacheKey);

    return {
      developerId: cache?.developer_id,
      appId: cache?.app_id,
      projectPath: this._data.projectPath,
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
   * 1. data.macToken (Session Header 或私有参数注入)
   * 2. 从用户隔离文件加载
   * 3. 无 token
   */
  private resolveTokenWithSource(): { token: MacToken | null; source: TokenSource } {
    // Priority 1: Context token (Session/私有参数注入)
    if (this._data.macToken?.kid && this._data.macToken?.mac_key) {
      return {
        token: this._data.macToken,
        source: TokenSource.CONTEXT,
      };
    }

    // Priority 2: 从用户隔离文件加载
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
}

/**
 * 获取 Token 来源的显示标签
 */
export function getTokenSourceLabel(source: TokenSource): string {
  switch (source) {
    case TokenSource.CONTEXT:
      return '(Session 上下文)';
    case TokenSource.FILE:
      return '(本地文件)';
    case TokenSource.NONE:
    default:
      return '';
  }
}
