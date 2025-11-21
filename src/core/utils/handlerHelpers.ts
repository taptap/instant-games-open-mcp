/**
 * Handler Helper Functions
 * Utilities for tool handlers to work with private parameters
 */

import type { HandlerContext, MacToken } from '../types/index.js';
import type { PrivateToolParams } from '../types/privateParams.js';
import { resolveToken } from './tokenResolver.js';
import { EnvConfig } from './env.js';

/**
 * Extract effective context from arguments and base context
 *
 * Merges private parameters from args into context with proper priority:
 * - args._mac_token > context.macToken > global config
 * - args._developer_id > context.developerId > cache
 * - args._app_id > context.appId > cache
 * - ... (similar for all fields)
 *
 * @param args - Tool arguments (may contain private parameters)
 * @param context - Base handler context
 * @returns Merged effective context
 *
 * @example
 * ```typescript
 * handler: async (args: MyArgs & PrivateToolParams, context) => {
 *   const effectiveContext = getEffectiveContext(args, context);
 *   return apiCall(args, effectiveContext);
 * }
 * ```
 */
export function getEffectiveContext<T extends PrivateToolParams>(
  args: T,
  context: HandlerContext
): HandlerContext {
  const result: HandlerContext = { ...context };

  // === 认证层 ===
  // 🔧 FIX: 只有在私有参数有效时才覆盖（避免 undefined 覆盖已有 token）
  if (args._mac_token && args._mac_token.kid && args._mac_token.mac_key) {
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
  if (args._project_id) {               // ✅ 新增
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

/**
 * Extract effective MAC Token directly (without full context)
 *
 * Priority: args._mac_token > context.macToken > resolveToken(context)
 *
 * @param args - Tool arguments (may contain _mac_token)
 * @param context - Handler context (may contain macToken)
 * @returns Effective MAC Token
 */
export function getEffectiveMacToken<T extends PrivateToolParams>(
  args: T,
  context: HandlerContext
): MacToken | undefined {
  // ✅ 使用 tokenResolver 替代全局 ApiConfig
  return args._mac_token || context.macToken || resolveToken(context) || undefined;
}

/**
 * Check if effective MAC Token is available
 *
 * @param args - Tool arguments (may contain _mac_token)
 * @param context - Handler context (may contain macToken)
 * @returns true if MAC Token is available
 */
export function hasMacToken<T extends PrivateToolParams>(
  args: T,
  context: HandlerContext
): boolean {
  const token = getEffectiveMacToken(args, context);
  return !!(token && token.kid && token.mac_key);
}

/**
 * Token source types
 */
export enum TokenSource {
  NONE = 'none',
  CONTEXT = 'context',     // From request context (e.g., MCP Proxy injection)
  ENV = 'env',             // From environment variable
  FILE = 'file'            // From local OAuth token file
}

/**
 * Get MAC Token source and availability
 * Returns both availability and the source of the token
 *
 * Priority: context.macToken > global config > local file
 *
 * @param context - Handler context (may contain macToken from request)
 * @returns Object with hasMacToken flag and tokenSource enum
 */
export function getMacTokenStatus(context?: HandlerContext): {
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

  // Priority 2: 使用 tokenResolver 检查（自动处理用户隔离）
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
 * Get human-readable token source label for display
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
