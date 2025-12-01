/**
 * Multiplayer Handlers
 * 
 * 注意：多人联机功能主要是客户端 API，不需要服务端处理器。
 * 
 * 本文件预留给可能的复杂业务逻辑处理。
 * 目前所有多人联机功能都通过客户端 API 实现，不需要服务端处理器。
 */

import type { ResolvedContext } from '../../core/types/context.js';

/**
 * Multiplayer handler result interface
 */
export interface MultiplayerResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// 目前无服务端处理器需要实现
// 所有多人联机功能都是客户端 API

// Export handlers object for consistency with other modules
export const multiplayerHandlers = {
  // 预留给未来可能的服务端处理器
};
