/**
 * Handler Helper Functions
 * Utilities for tool handlers to work with private parameters
 */

import type { HandlerContext, MacToken } from '../types/index.js';
import type { PrivateToolParams } from '../types/privateParams.js';
import { ApiConfig } from '../network/httpClient.js';

/**
 * Extract effective MAC Token from arguments and context
 *
 * Priority: args._mac_token > context.macToken > global config
 *
 * @param args - Tool arguments (may contain _mac_token)
 * @param context - Handler context (may contain macToken)
 * @returns Effective MAC Token to use for API calls
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
  // If _mac_token is provided in args, use it
  if (args._mac_token) {
    return {
      ...context,
      macToken: args._mac_token
    };
  }

  // Otherwise, use context as-is
  return context;
}

/**
 * Extract effective MAC Token directly (without full context)
 *
 * Priority: args._mac_token > context.macToken > global config
 *
 * @param args - Tool arguments (may contain _mac_token)
 * @param context - Handler context (may contain macToken)
 * @returns Effective MAC Token
 */
export function getEffectiveMacToken<T extends PrivateToolParams>(
  args: T,
  context: HandlerContext
): MacToken | undefined {
  return args._mac_token || context.macToken || ApiConfig.getInstance().macToken;
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
