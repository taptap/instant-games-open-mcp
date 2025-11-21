/**
 * Token Resolver
 * 负责按需解析和加载 MAC Token（无全局状态）
 *
 * 设计原则：
 * - 无全局状态：每次请求动态解析
 * - 用户隔离：根据 userId 加载对应的 token
 * - 优先级明确：context > file > null
 */

import type { HandlerContext, MacToken } from '../types/index.js';
import { loadTokenFromFile, getTokenPath } from '../auth/tokenStorage.js';
import { EnvConfig } from './env.js';

/**
 * 解析有效的 MAC Token（按需加载，无全局缓存）
 *
 * 优先级：
 * 1. context.macToken (MCP Proxy 注入或 HTTP Header 注入)
 * 2. stdio 模式从用户隔离的文件加载
 * 3. SSE/HTTP 模式返回 null（必须通过 context 注入）
 *
 * @param context - Handler context
 * @returns MAC Token or null
 */
export function resolveToken(context?: HandlerContext): MacToken | null {
  // Priority 1: Context token (MCP Proxy 或请求级注入)
  if (context?.macToken?.kid && context?.macToken?.mac_key) {
    return context.macToken;
  }

  // Priority 2: stdio 模式从用户隔离的文件加载（每次即时加载）
  if (EnvConfig.transport === 'stdio') {
    const userId = getUserId(context);
    return loadTokenForUser(userId);
  }

  // Priority 3: SSE/HTTP 模式不使用文件
  // 必须通过 context.macToken 注入（来自 Proxy 或 HTTP Header）
  return null;
}

/**
 * 检查 Token 是否可用
 *
 * @param context - Handler context
 * @returns true if token is available and valid
 */
export function hasToken(context?: HandlerContext): boolean {
  const token = resolveToken(context);
  return !!(token?.kid && token?.mac_key);
}

/**
 * 从 context 提取用户标识
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
 * 获取项目标识（可选）
 *
 * @param context - Handler context
 * @returns Project identifier or undefined
 */
export function getProjectId(context?: HandlerContext): string | undefined {
  return context?.projectId;
}

/**
 * 为指定用户加载 Token
 *
 * @param userId - User identifier
 * @param projectId - Optional project identifier
 * @returns MAC Token or null
 *
 * @internal 内部函数，由 resolveToken 调用
 */
function loadTokenForUser(
  userId: string,
  projectId?: string
): MacToken | null {
  // 获取用户隔离的 token 路径
  const tokenPath = getTokenPath(userId, projectId);

  // 从文件加载 token
  return loadTokenFromFile(tokenPath);
}
