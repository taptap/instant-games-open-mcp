/**
 * Context Resolver
 *
 * 集中处理上下文解析逻辑，实现无状态架构的核心组件
 *
 * 职责：
 * 1. 按优先级解析各字段（私有参数 > HandlerContext > 本地缓存）
 * 2. 提供 developer_id 和 app_id 查询接口（不再主动调用 API）
 * 3. 管理本地缓存（仅用于查询，不再主动写入）
 *
 * 设计原则：
 * - 无状态：不持有任何会话状态
 * - 单一职责：只负责上下文解析，不负责 API 调用
 * - 高可维护性：清晰的优先级规则和职责边界
 */

import type { HandlerContext } from '../types/index.js';
import { readAppCache, type AppCacheInfo } from './cache.js';

/**
 * Context Resolver 结果
 */
export interface ResolvedContext {
  /** Developer ID（应用开发者 ID）*/
  developerId?: number;

  /** App ID（应用 ID）*/
  appId?: number;

  /** Project Path（项目路径）*/
  projectPath?: string;

  /** Developer Name（开发者名称，仅从缓存读取）*/
  developerName?: string;

  /** App Title（应用名称，仅从缓存读取）*/
  appTitle?: string;

  /** Miniapp ID（小游戏/H5 预览 ID，仅从缓存读取）*/
  miniappId?: string;
}

/**
 * Context Resolver 类
 *
 * 负责从多个来源解析应用上下文信息：
 * 1. HandlerContext（来自私有参数注入）
 * 2. 本地缓存（上次操作的结果）
 *
 * 优先级规则：
 * - developer_id: context.developerId > cache.developer_id
 * - app_id: context.appId > cache.app_id
 * - project_path: context.projectPath > cache（不涉及缓存）
 */
export class ContextResolver {
  /**
   * 解析完整的应用上下文
   *
   * @param context - Handler context（可能包含私有参数注入的字段）
   * @returns 解析后的完整上下文
   *
   * @example
   * ```typescript
   * const resolver = new ContextResolver();
   * const resolved = resolver.resolve(context);
   *
   * if (!resolved.developerId || !resolved.appId) {
   *   throw new Error('Missing developer_id or app_id');
   * }
   * ```
   */
  resolve(context: HandlerContext): ResolvedContext {
    const result: ResolvedContext = {};

    // 尝试从本地缓存读取
    const cache = this.readCache(context.projectPath);

    // === 应用上下文层（按优先级解析）===

    // Developer ID
    result.developerId = context.developerId ?? cache?.developer_id;

    // App ID
    result.appId = context.appId ?? cache?.app_id;

    // Project Path（直接使用，不涉及缓存）
    result.projectPath = context.projectPath;

    // === 附加信息（仅从缓存读取）===
    if (cache) {
      result.developerName = cache.developer_name;
      result.appTitle = cache.app_title;
      result.miniappId = cache.miniapp_id;
    }

    return result;
  }

  /**
   * 检查是否存在有效的应用上下文
   *
   * @param context - Handler context
   * @returns true if both developer_id and app_id are available
   */
  hasAppContext(context: HandlerContext): boolean {
    const resolved = this.resolve(context);
    return !!(resolved.developerId && resolved.appId);
  }

  /**
   * 获取 developer_id（优先级：context > cache）
   *
   * @param context - Handler context
   * @returns Developer ID or undefined
   */
  getDeveloperId(context: HandlerContext): number | undefined {
    return this.resolve(context).developerId;
  }

  /**
   * 获取 app_id（优先级：context > cache）
   *
   * @param context - Handler context
   * @returns App ID or undefined
   */
  getAppId(context: HandlerContext): number | undefined {
    return this.resolve(context).appId;
  }

  /**
   * 获取 project_path
   *
   * @param context - Handler context
   * @returns Project path or undefined
   */
  getProjectPath(context: HandlerContext): string | undefined {
    return context.projectPath;
  }

  /**
   * 从本地缓存读取应用信息（内部辅助方法）
   *
   * @param projectPath - 项目路径（可选）
   * @returns 缓存信息或 null
   */
  private readCache(projectPath?: string): AppCacheInfo | null {
    return readAppCache(projectPath);
  }
}

/**
 * 全局单例实例（可选）
 *
 * 由于 ContextResolver 是无状态的，可以使用单例
 */
export const contextResolver = new ContextResolver();
