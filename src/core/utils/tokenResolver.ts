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
 * Token 来源类型
 */
export enum TokenSource {
  NONE = 'none',
  CONTEXT = 'context',     // From request context (e.g., MCP Proxy injection)
  ENV = 'env',             // From environment variable
  FILE = 'file'            // From local OAuth token file
}

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
    // 内联提取逻辑（避免循环依赖）
    const userId = context?.userId || 'local';
    const projectId = context?.projectId;
    return loadTokenForUser(userId, projectId);
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
 * 获取 MAC Token 状态和来源
 *
 * @param context - Handler context
 * @returns Token 状态和来源信息
 */
export function getTokenStatus(context?: HandlerContext): {
  hasMacToken: boolean;
  source: TokenSource;
} {
  // Priority 1: Check request-specific token (from context, e.g., MCP Proxy)
  if (context?.macToken?.kid && context?.macToken?.mac_key) {
    return {
      hasMacToken: true,
      source: TokenSource.CONTEXT
    };
  }

  // Priority 2: 使用 resolveToken 检查（自动处理用户隔离）
  const token = resolveToken(context);
  if (token?.kid && token?.mac_key) {
    // 根据 transport 模式返回来源
    const source = EnvConfig.transport === 'stdio'
      ? TokenSource.FILE
      : TokenSource.ENV;

    return {
      hasMacToken: true,
      source
    };
  }

  return {
    hasMacToken: false,
    source: TokenSource.NONE
  };
}

/**
 * 获取 Token 来源的显示标签
 *
 * @param source - Token 来源
 * @returns 中文显示标签
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
