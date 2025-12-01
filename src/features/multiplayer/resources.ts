/**
 * Multiplayer Resources Definitions and Handlers
 * 提供 MCP 资源访问，对应 docs.ts 中的文档分类
 * 
 * 按实际使用流程组织：
 * 初始化和连接 → 匹配进入房间 → 游戏数据互通流转循环 → 退出房间
 */

import type { ResourceRegistration } from '../../core/types/index.js';
import { multiplayerDocTools } from './docTools.js';

/**
 * Resource definitions array
 */
const multiplayerResourceDefinitions = [
  // 概览和指南
  {
    uri: 'docs://multiplayer/overview',
    name: 'Multiplayer Complete Overview',
    description: 'Complete overview of TapTap Multiplayer (OnlineBattle) APIs',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/integration-guide',
    name: 'Multiplayer Integration Guide',
    description: 'Complete step-by-step integration workflow with all 7 stages',
    mimeType: 'text/markdown'
  },

  // 阶段1：初始化和连接
  {
    uri: 'docs://multiplayer/step1-init',
    name: 'Stage 1: Initialization and Connection',
    description: 'Stage 1 APIs - getOnlineBattleManager(), registerListener(), connect()',
    mimeType: 'text/markdown'
  },

  // 阶段2：匹配进入房间
  {
    uri: 'docs://multiplayer/step2-room',
    name: 'Stage 2: Room Matching',
    description: 'Stage 2 APIs - matchRoom(). IMPORTANT: Must enter room before multiplayer communication!',
    mimeType: 'text/markdown'
  },

  // 阶段3：玩家数据更新
  {
    uri: 'docs://multiplayer/step3-player-data',
    name: 'Stage 3: Player Data Update',
    description: 'Stage 3 APIs - updatePlayerCustomProperties()',
    mimeType: 'text/markdown'
  },

  // 阶段4：房间数据更新
  {
    uri: 'docs://multiplayer/step4-room-data',
    name: 'Stage 4: Room Data Update',
    description: 'Stage 4 APIs - updateRoomProperties() (room owner only)',
    mimeType: 'text/markdown'
  },

  // 阶段5：数据广播转发
  {
    uri: 'docs://multiplayer/step5-broadcast',
    name: 'Stage 5: Data Broadcast',
    description: 'Stage 5 APIs - sendCustomMessage() for real-time data sync',
    mimeType: 'text/markdown'
  },

  // 阶段6：事件通知
  {
    uri: 'docs://multiplayer/step6-events',
    name: 'Stage 6: Event Notifications',
    description: 'Stage 6 Events - onDisconnected, playerEnterRoom, playerLeaveRoom, playerOffline, onCustomMessage, onPlayerCustomPropertiesChange, onRoomPropertiesChange',
    mimeType: 'text/markdown'
  },

  // 阶段7：退出房间
  {
    uri: 'docs://multiplayer/step7-exit',
    name: 'Stage 7: Exit Room',
    description: 'Stage 7 APIs - leaveRoom()',
    mimeType: 'text/markdown'
  },

  // 数据结构
  {
    uri: 'docs://multiplayer/data-structures',
    name: 'Data Structures',
    description: 'Data structures - PlayerInfo, RoomInfo',
    mimeType: 'text/markdown'
  },

  // ====== 新增：通用模板和关系表 ======
  {
    uri: 'docs://multiplayer/common-patterns',
    name: 'Common Patterns & Templates',
    description: 'Reusable atomic patterns: 1) Player state sync (low-frequency data like score/level), 2) Player movement sync (high-frequency position data), 3) Custom message protocol, 4) Room events handling, 5) Disconnect handling (no reconnect support)',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/api-event-relations',
    name: 'API-Event Relations Table',
    description: 'API to Event relationship table - understand which events are triggered by which API calls and who receives them',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/protocol-template',
    name: 'Protocol Template Specification',
    description: 'Communication protocol template for generating protocol docs in user project (docs/multiplayer-protocol.md)',
    mimeType: 'text/markdown'
  },

  // 单个 API 文档
  {
    uri: 'docs://multiplayer/api/getOnlineBattleManager',
    name: 'tap.getOnlineBattleManager() API',
    description: 'Get the OnlineBattleManager singleton instance',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/api/registerListener',
    name: 'registerListener() API',
    description: 'Register event listeners for multiplayer events',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/api/connect',
    name: 'connect() API',
    description: 'Connect to multiplayer server, returns playerId',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/api/matchRoom',
    name: 'matchRoom() API',
    description: 'Auto-match or create room based on matching parameters',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/api/updatePlayerCustomProperties',
    name: 'updatePlayerCustomProperties() API',
    description: 'Update player custom properties',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/api/updateRoomProperties',
    name: 'updateRoomProperties() API',
    description: 'Update room properties (room owner only)',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/api/sendCustomMessage',
    name: 'sendCustomMessage() API',
    description: 'Send custom message to room players for real-time data sync',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://multiplayer/api/leaveRoom',
    name: 'leaveRoom() API',
    description: 'Leave current room',
    mimeType: 'text/markdown'
  }
];

/**
 * Resource handlers array (order must match definitions array)
 */
const multiplayerResourceHandlers = [
  // 概览和指南
  async () => multiplayerDocTools.getMultiplayerOverview(),
  async () => multiplayerDocTools.getIntegrationWorkflow(),

  // 阶段分类
  async () => multiplayerDocTools.getStep1Init(),
  async () => multiplayerDocTools.getStep2Room(),
  async () => multiplayerDocTools.getStep3PlayerData(),
  async () => multiplayerDocTools.getStep4RoomData(),
  async () => multiplayerDocTools.getStep5Broadcast(),
  async () => multiplayerDocTools.getStep6Events(),
  async () => multiplayerDocTools.getStep7Exit(),
  async () => multiplayerDocTools.getDataStructures(),

  // 新增：通用模板和关系表
  async () => multiplayerDocTools.getCommonPatterns(),
  async () => multiplayerDocTools.getApiEventRelations(),
  async () => multiplayerDocTools.getProtocolTemplate(),

  // 单个 API
  async () => multiplayerDocTools.getGetOnlineBattleManager(),
  async () => multiplayerDocTools.getRegisterListener(),
  async () => multiplayerDocTools.getConnect(),
  async () => multiplayerDocTools.getMatchRoom(),
  async () => multiplayerDocTools.getUpdatePlayerCustomProperties(),
  async () => multiplayerDocTools.getUpdateRoomProperties(),
  async () => multiplayerDocTools.getSendCustomMessage(),
  async () => multiplayerDocTools.getLeaveRoom()
];

/**
 * Unified resource registrations
 */
export const multiplayerResources: ResourceRegistration[] = multiplayerResourceDefinitions.map((definition, index) => ({
  ...definition,
  handler: multiplayerResourceHandlers[index]
}));
