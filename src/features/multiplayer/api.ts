/**
 * Multiplayer API Calls
 * 
 * 注意：多人联机功能主要是客户端 API，通过全局 'tap' 对象调用。
 * 
 * 客户端 API（无需服务端调用）：
 * - tap.getOnlineBattleManager() - 获取管理器实例
 * - tapOnlineBattle.registerListener() - 注册事件监听
 * - tapOnlineBattle.connect() - 连接服务器
 * - tapOnlineBattle.matchRoom() - 匹配房间
 * - tapOnlineBattle.sendCustomMessage() - 发送自定义消息
 * - tapOnlineBattle.updatePlayerCustomProperties() - 更新玩家属性
 * 
 * 本文件预留给可能的服务端 API 调用（如需要 MAC Token 认证的管理接口）。
 * 目前多人联机功能主要通过客户端 API 实现。
 * 
 * See docs.ts for complete API documentation.
 */

import { HttpClient } from '../../core/network/httpClient.js';
import type { ResolvedContext } from '../../core/types/context.js';

/**
 * Multiplayer API client
 * 预留给可能的服务端 API 调用
 */
export class MultiplayerApi {
  private httpClient: HttpClient;

  constructor(context: ResolvedContext) {
    this.httpClient = new HttpClient(context);
  }

  // 目前无服务端 API 需要实现
  // 所有多人联机功能都是客户端 API，通过 tap.getOnlineBattleManager() 调用
}

// Export a factory function for creating API instances
export function createMultiplayerApi(context: ResolvedContext): MultiplayerApi {
  return new MultiplayerApi(context);
}
