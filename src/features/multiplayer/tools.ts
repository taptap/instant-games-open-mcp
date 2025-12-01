/**
 * Multiplayer Tools
 * Unified definitions and handlers for multiplayer functionality
 * 
 * TapTap 小游戏多人联机 SDK MCP 工具
 * 
 * 按实际使用流程组织：
 * 初始化和连接 → 匹配进入房间 → 游戏数据互通流转循环 → 退出房间
 */

import type { ToolRegistration } from '../../core/types/index.js';

import { multiplayerDocTools } from './docTools.js';

/**
 * Multiplayer Tools Registration
 * Each tool combines its definition and handler in one place
 */
export const multiplayerTools: (ToolRegistration & { requiresAuth?: boolean })[] = [
  // ⭐ 入口工具：集成指南
  {
    definition: {
      name: 'get_multiplayer_integration_guide',
      description: '⭐ USE THIS TOOL FIRST when user asks about multiplayer/多人联机/实时对战/OnlineBattle/联网游戏 functionality, wants to integrate/接入/setup/add/使用 multiplayer features, searches for multiplayer API documentation/文档/教程/示例, asks how to connect/match rooms/sync data, needs multiplayer code examples/代码示例, or asks about real-time sync/房间匹配. Returns complete step-by-step integration workflow with all REQUIRED core APIs (highest priority - must implement all). Call this BEFORE making any implementation plans.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getIntegrationWorkflow();
    },
    requiresAuth: false
  },

  // 📚 概览工具
  {
    definition: {
      name: 'get_multiplayer_overview',
      description: 'Get complete overview of TapTap Multiplayer (OnlineBattle) APIs. Shows REQUIRED core APIs (highest priority - minimum set for multiplayer functionality) and future extended APIs (medium priority). Use when user needs to understand the overall multiplayer system architecture, available APIs, and capabilities.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getMultiplayerOverview();
    },
    requiresAuth: false
  },

  // 🔍 搜索工具
  {
    definition: {
      name: 'search_multiplayer_docs',
      description: 'Search multiplayer documentation by keyword. Use when user asks specific questions about multiplayer features. Keywords: 初始化/连接/房间/匹配/消息/同步/事件/断线/属性/退出',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search keyword (e.g., "connect", "matchRoom", "sendCustomMessage", "leaveRoom")'
          }
        },
        required: ['query']
      }
    },
    handler: async (args) => {
      return multiplayerDocTools.searchMultiplayerDocs(args as { query: string });
    },
    requiresAuth: false
  },

  // ====== 阶段分类文档工具 ======

  // 阶段1：初始化和连接
  {
    definition: {
      name: 'get_multiplayer_step1_init_docs',
      description: 'Get Stage 1: Initialization and Connection APIs documentation - getOnlineBattleManager(), registerListener(), connect(). Use when user asks about SDK initialization, connecting to server, or event listener setup.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getStep1Init();
    },
    requiresAuth: false
  },

  // 阶段2：匹配进入房间
  {
    definition: {
      name: 'get_multiplayer_step2_room_docs',
      description: 'Get Stage 2: Room Matching APIs documentation - matchRoom(). IMPORTANT: Must enter room before any multiplayer communication! Use when user asks about room matching, creating rooms, or joining rooms.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getStep2Room();
    },
    requiresAuth: false
  },

  // 阶段3：玩家数据更新
  {
    definition: {
      name: 'get_multiplayer_step3_player_data_docs',
      description: 'Get Stage 3: Player Data Update APIs documentation - updatePlayerCustomProperties(). Use when user asks about syncing player properties like score, level, status.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getStep3PlayerData();
    },
    requiresAuth: false
  },

  // 阶段4：房间数据更新
  {
    definition: {
      name: 'get_multiplayer_step4_room_data_docs',
      description: 'Get Stage 4: Room Data Update APIs documentation - updateRoomProperties(). Note: Only room owner can call this. Use when user asks about updating room properties.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getStep4RoomData();
    },
    requiresAuth: false
  },

  // 阶段5：数据广播转发
  {
    definition: {
      name: 'get_multiplayer_step5_broadcast_docs',
      description: 'Get Stage 5: Data Broadcast APIs documentation - sendCustomMessage(). IMPORTANT: Rate limited to 15 calls/second (shared with updatePlayerCustomProperties and updateRoomProperties). NOT suitable for high-frequency calls! Use when user asks about sending messages, real-time data sync, broadcasting game state.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getStep5Broadcast();
    },
    requiresAuth: false
  },

  // 阶段6：事件通知
  {
    definition: {
      name: 'get_multiplayer_step6_events_docs',
      description: 'Get Stage 6: Event Notifications documentation - onDisconnected, playerEnterRoom, playerLeaveRoom, playerOffline, onCustomMessage, onPlayerCustomPropertiesChange, onRoomPropertiesChange. Use when user asks about event callbacks.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getStep6Events();
    },
    requiresAuth: false
  },

  // 阶段7：退出房间
  {
    definition: {
      name: 'get_multiplayer_step7_exit_docs',
      description: 'Get Stage 7: Exit Room APIs documentation - leaveRoom(). Use when user asks about leaving room, ending game, or starting next round.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getStep7Exit();
    },
    requiresAuth: false
  },

  // 数据结构
  {
    definition: {
      name: 'get_multiplayer_data_structures_docs',
      description: 'Get data structures documentation: PlayerInfo, RoomInfo. Use when user asks about player data format, room information structure, or API response formats.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getDataStructures();
    },
    requiresAuth: false
  },

  // ====== 单个 API 文档工具 ======

  {
    definition: {
      name: 'get_connect_api_doc',
      description: 'Get detailed documentation for connect() API. Use when user specifically asks about connecting to multiplayer server.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getConnect();
    },
    requiresAuth: false
  },

  {
    definition: {
      name: 'get_match_room_api_doc',
      description: 'Get detailed documentation for matchRoom() API. Use when user specifically asks about room matching or auto-matching.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getMatchRoom();
    },
    requiresAuth: false
  },

  {
    definition: {
      name: 'get_send_custom_message_api_doc',
      description: 'Get detailed documentation for sendCustomMessage() API. CRITICAL: Rate limited to 15 calls/second (shared with updatePlayerCustomProperties and updateRoomProperties). All APIs are NOT suitable for high-frequency calls! Use when user specifically asks about sending custom messages or real-time data synchronization.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getSendCustomMessage();
    },
    requiresAuth: false
  },

  {
    definition: {
      name: 'get_update_player_properties_api_doc',
      description: 'Get detailed documentation for updatePlayerCustomProperties() API. Use when user specifically asks about updating player properties or player data synchronization.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getUpdatePlayerCustomProperties();
    },
    requiresAuth: false
  },

  {
    definition: {
      name: 'get_update_room_properties_api_doc',
      description: 'Get detailed documentation for updateRoomProperties() API. Note: Only room owner can call this. Use when user specifically asks about updating room properties.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getUpdateRoomProperties();
    },
    requiresAuth: false
  },

  {
    definition: {
      name: 'get_leave_room_api_doc',
      description: 'Get detailed documentation for leaveRoom() API. Use when user specifically asks about leaving room or exiting game.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getLeaveRoom();
    },
    requiresAuth: false
  },

  // ====== 新增：通用模板和关系表工具 ======

  {
    definition: {
      name: 'get_multiplayer_common_patterns',
      description: 'Get common reusable patterns/templates for multiplayer features. Includes: 1) Player state sync (低频数据：分数/等级/血量), 2) Player movement sync (高频数据：位置同步的正确做法), 3) Custom message protocol framework (自定义消息协议), 4) Player room events handling (进出房间处理), 5) Disconnect handling (断线处理, NOTE: SDK does not support reconnect). USE THIS when implementing specific multiplayer features after understanding the integration flow.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getCommonPatterns();
    },
    requiresAuth: false
  },

  {
    definition: {
      name: 'get_api_event_relations',
      description: 'Get the API-to-Event relationship table (API与事件关系表). Shows which events are triggered by which API calls, and who receives them. CRITICAL for understanding: 1) matchRoom vs playerEnterRoom, 2) leaveRoom vs playerLeaveRoom, 3) updatePlayerCustomProperties (全员收到) vs sendCustomMessage (发送者不收到). Use this to understand different client handling logic.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getApiEventRelations();
    },
    requiresAuth: false
  },

  {
    definition: {
      name: 'get_protocol_template',
      description: 'Get the communication protocol template specification (通讯协议模板规范). Use this when: 1) Game has 4+ types of interactions, 2) Need to generate protocol documentation file (docs/multiplayer-protocol.md), 3) Team collaboration requires clear protocol definition. Returns a markdown template that AI should use to generate protocol docs in user project.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async () => {
      return multiplayerDocTools.getProtocolTemplate();
    },
    requiresAuth: false
  }
];
