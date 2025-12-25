/**
 * Multiplayer Feature Module
 * 提供 TapTap 多人联机（OnlineBattle）API 的 MCP 工具和资源
 *
 * 核心功能（必须实现 - 最高优先级）：
 * - 初始化 API: getOnlineBattleManager、registerListener、connect
 * - 房间管理: matchRoom
 * - 消息通信: sendCustomMessage、updatePlayerCustomProperties、updateRoomProperties
 * - 退出房间: leaveRoom
 * - 事件监听: onDisconnected、playerEnterRoom、playerLeaveRoom、playerOffline、onCustomMessage、onPlayerCustomPropertiesChange、onRoomPropertiesChange
 *
 * 扩展功能（可选 - 中等优先级，仅在用户明确需求时使用）：
 * - 房间管理增强: createRoom、getRoomList、joinRoom、kickRoomPlayer
 * - 连接控制: disconnect
 * - 玩家状态: updatePlayerCustomStatus
 * - 扩展事件: onBattleServiceError、onPlayerKicked、onPlayerCustomStatusChange
 */

import type { FeatureModule } from '../../core/types/index.js';

import { multiplayerTools } from './tools.js';
import { multiplayerResources } from './resources.js';

/**
 * Multiplayer Module Definition
 */
export const multiplayerModule: FeatureModule = {
  name: 'multiplayer',

  // All tools with their handlers
  // Multiplayer tools don't require server-side authentication (client-side APIs)
  tools: multiplayerTools.map((tool) => ({
    definition: tool.definition,
    handler: tool.handler,
    requiresAuth: tool.requiresAuth ?? false,
  })),

  // Resources with their handlers (unified format)
  resources: multiplayerResources,
};
