/**
 * Multiplayer Feature Module
 * 提供 TapTap 多人联机（OnlineBattle）API 的 MCP 工具和资源
 * 
 * 核心功能：
 * - 初始化 API: getOnlineBattleManager、registerListener、connect
 * - 房间管理: matchRoom
 * - 消息通信: sendCustomMessage、updatePlayerCustomProperties
 * - 事件监听: onDisconnected、playerEnterRoom、playerLeaveRoom、playerOffline、onCustomMessage、onPlayerCustomPropertiesChange
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
  tools: multiplayerTools.map(tool => ({
    definition: tool.definition,
    handler: tool.handler,
    requiresAuth: tool.requiresAuth ?? false
  })),

  // Resources with their handlers (unified format)
  resources: multiplayerResources
};
