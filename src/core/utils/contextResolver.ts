/**
 * Context Resolver
 *
 * 统一处理上下文解析逻辑（纯函数设计）
 *
 * 职责：
 * 1. 解析 Context 各字段（优先级：私有参数 > context > 缓存）
 * 2. 提供字段提取工具（developer/app/user/project）
 * 3. 查询本地缓存
 *
 * 设计原则：
 * - 纯函数：无状态，易测试
 * - 单一职责：只负责上下文解析
 * - 高可维护性：清晰的优先级规则
 */

import type { HandlerContext } from '../types/index.js';
import { readAppCache, type AppCacheInfo } from './cache.js';
import { EnvConfig } from './env.js';

/**
 * 解析后的应用上下文
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
 * 解析完整的应用上下文
 *
 * 优先级规则：
 * - developer_id: context.developerId > cache
 * - app_id: context.appId > cache
 * - project_path: context.projectPath (不涉及缓存)
 *
 * @param context - Handler context
 * @returns 解析后的完整上下文
 */
export function resolveAppContext(context: HandlerContext): ResolvedContext {
  const result: ResolvedContext = {};

  // 尝试从本地缓存读取
  const cache = readAppCache(context.projectPath);

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
export function hasAppContext(context: HandlerContext): boolean {
  const resolved = resolveAppContext(context);
  return !!(resolved.developerId && resolved.appId);
}

/**
 * 获取 developer_id（优先级：context > cache）
 *
 * @param context - Handler context
 * @returns Developer ID or undefined
 */
export function getDeveloperId(context: HandlerContext): number | undefined {
  return resolveAppContext(context).developerId;
}

/**
 * 获取 app_id（优先级：context > cache）
 *
 * @param context - Handler context
 * @returns App ID or undefined
 */
export function getAppId(context: HandlerContext): number | undefined {
  return resolveAppContext(context).appId;
}

/**
 * 获取 project_path
 *
 * @param context - Handler context
 * @returns Project path or undefined
 */
export function getProjectPath(context: HandlerContext): string | undefined {
  return context.projectPath;
}

/**
 * 获取用户标识
 *
 * 优先级：
 * 1. context.userId (MCP Proxy 注入或 Session 闭包注入)
 * 2. 'local' (stdio 模式默认)
 * 3. 'anonymous' (其他情况)
 *
 * @param context - Handler context
 * @returns User identifier
 */
export function getUserId(context?: HandlerContext): string {
  // Priority 1: Proxy 或 Session 注入的 userId
  if (context?.userId) {
    return context.userId;
  }

  // Priority 2: stdio 模式默认使用 'local'
  if (EnvConfig.transport === 'stdio') {
    return 'local';
  }

  // Priority 3: 其他情况使用 'anonymous'
  return 'anonymous';
}

/**
 * 获取项目标识
 *
 * @param context - Handler context
 * @returns Project identifier or undefined
 */
export function getProjectId(context?: HandlerContext): string | undefined {
  return context?.projectId;
}
