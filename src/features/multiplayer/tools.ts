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
  // ⭐ 主入口工具
  {
    definition: {
      name: 'get_multiplayer_guide',
      description: `⭐ PRIMARY entry for multiplayer/多人联机/联网游戏.

CORE CONCEPT: Player A does action → sendData() → Other players receive in onDataReceived() → They see it happen.

Returns: Complete guide with code template. Includes: data sync basics, PlayerId usage, sync strategies, protocol guidelines, API-event relationships, built-in debug logger.

🔧 Built-in features:
- MultiplayerManager template (complete, production-ready)
- Debug logger system (on-screen logs, call get_debug_logger for setup)
- Error codes reference (23 error codes)
- Connection keep-alive
- Message size validation (2048 bytes)

Use when: User wants players to play together, sync game data, see each other's actions.

Perfect for ANY creative H5 game. No game-specific logic needed.`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getIntegrationWorkflow();
    },
    requiresAuth: false,
  },

  // 📦 完整代码模板
  {
    definition: {
      name: 'get_code_template',
      description: `Get complete MultiplayerManager.js template (350+ lines).

Core methods:
- 📤 sendData(data) → Send your action to others
- 📥 onDataReceived(data, fromId) → Receive others' actions
- syncPosition(x, y) → Optimized position sync
- init() → Returns playerId (MUST save it!)
- matchRoom() → Match or create room

Features: Built-in rate limiting (10/sec), field compatibility, offline fallback, change detection.

Copy-paste ready. Use for ANY game type.`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getCompleteExample();
    },
    requiresAuth: false,
  },

  // 📊 API-事件关系表
  {
    definition: {
      name: 'get_api_event_table',
      description: `⚠️ CRITICAL - API-to-Event relationship table.

Shows: Which API call triggers which event, and WHO receives it.

Key relationships AI must understand:
- matchRoom() → You: get roomInfo, Others: get playerEnterRoom event
- sendCustomMessage() → You: NO event, Others: get onCustomMessage event
- updatePlayerCustomProperties() → ALL players (including you): get event

This relationship is hard to show in code template, so use this table when implementing event handlers.

Use when: Implementing multiplayer logic, debugging "why no event triggered?"`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getApiEventRelations();
    },
    requiresAuth: false,
  },

  // 📝 通讯协议模板
  {
    definition: {
      name: 'get_protocol_template',
      description: `⚠️ CRITICAL - Communication protocol template to ensure consistency.

PURPOSE: Prevent AI from using different protocols for different features.

COMMON MISTAKE (AI often does this):
- Feature 1: { type: 'click', x, y }
- Feature 2: { action: 'move', pos: {x, y} }  ❌ Inconsistent!

SOLUTION: Define protocol ONCE at project start, reuse for ALL features:
- All messages: { type: string, ...data }
- Consistent structure across all game features

Use when: Starting multiplayer implementation, adding new interaction types.

This is a MAJOR source of bugs - keep protocol consistent!`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getProtocolTemplate();
    },
    requiresAuth: false,
  },

  // 🔧 扩展 API 速查
  {
    definition: {
      name: 'get_extended_apis',
      description:
        '🟡 Get extended APIs quick reference: createRoom, getRoomList, joinRoom, kickRoomPlayer, disconnect, updatePlayerCustomStatus. ONLY use when user explicitly requests room list UI, custom room creation, friend invitation, or player kick functionality. These are OPTIONAL.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getExtendedApis();
    },
    requiresAuth: false,
  },

  // ====== 专题指南工具 ======

  // 🔑 玩家 ID 指南
  {
    definition: {
      name: 'get_player_id_guide',
      description:
        '🔑 Get Player ID usage guide: how to get local player ID from connect(), check "is this me?", handle field name differences (fromPlayerId/playerId/id). Use when implementing player identification logic or debugging player-related issues.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getPlayerIdGuide();
    },
    requiresAuth: false,
  },

  // 🎮 同步策略指南
  {
    definition: {
      name: 'get_sync_strategy',
      description:
        '🎮 Get synchronization strategy guide for joystick/WASD controls and click-based movement. Includes timer-based sync pattern (100ms interval) and change detection. Use when implementing position synchronization or continuous input handling.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getSyncStrategy();
    },
    requiresAuth: false,
  },

  // 📄 生成本地指南文档
  {
    definition: {
      name: 'generate_local_guide',
      description:
        '📄 Generate MULTIPLAYER_GUIDE.md for user project root. Creates persistent reference with API rate limits, playerId rules, data structures. Enables context persistence across conversations. Use at project start.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.generateLocalMultiplayerGuide();
    },
    requiresAuth: false,
  },

  // 📊 API 数据结构
  {
    definition: {
      name: 'get_api_data_structures',
      description:
        '📊 Get complete API return value structures and event callback data structures. Includes all core APIs (connect, matchRoom, sendCustomMessage, etc) and events (playerEnterRoom, onCustomMessage, etc). Use when implementing API calls to avoid guessing data structures.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getApiDataStructures();
    },
    requiresAuth: false,
  },

  // 🎯 一键生成工具
  {
    definition: {
      name: 'generate_multiplayer_code',
      description: `🎯 One-click: Generate complete multiplayer files ready to save.

Generates:
1. js/MultiplayerManager.js (complete template with comments)
2. MULTIPLAYER_GUIDE.md (quick reference for project)

Returns: File paths and contents, ready to save.

Use when: User wants quick setup, or says "generate multiplayer code/生成多人联机代码".`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.generateMultiplayerCode();
    },
    requiresAuth: false,
  },

  // 🔍 问题诊断工具
  {
    definition: {
      name: 'diagnose_multiplayer_issues',
      description: `🔍 Diagnose common multiplayer issues.

Use when user reports:
- Players not visible / 看不到其他玩家
- Position not syncing / 位置不同步
- Connection failed / 连接失败
- Data not received / 收不到数据

Returns: Checklist with solutions for each issue.`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.diagnoseIssues();
    },
    requiresAuth: false,
  },

  // ✅ 代码检查工具
  {
    definition: {
      name: 'check_multiplayer_code',
      description: `✅ Check multiplayer code before deployment.

Detects:
- Missing rate limiting
- Wrong field names (playerId vs id)
- Missing playerId save
- Uninitialized remote players
- Protocol inconsistency

Use when: Before finalizing code, or when debugging.`,
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The multiplayer code to check',
          },
        },
        required: ['code'],
      },
    },
    handler: async (args) => {
      return multiplayerDocTools.checkCode(args as { code: string });
    },
    requiresAuth: false,
  },

  // 🔧 调试工具
  {
    definition: {
      name: 'get_debug_logger',
      description: `🔧 Get on-screen debug logger / 屏幕日志系统 / 调试日志工具.

CALL THIS WHEN user says:
- "添加日志工具" / "add logger" / "add debug tool"
- "屏幕日志" / "screen log" / "on-screen log"
- "看不到日志" / "can't see logs" / "无法查看控制台"
- "移动端调试" / "mobile debug" / "手机测试"
- "调试工具" / "debug tool" / "debugging"
- "显示日志在屏幕上" / "show logs on screen"

Features:
- 右下角绿色小圆点 → 点击显示日志面板
- 日志分级 (log/warn/error)，自动去重
- 支持复制日志，自动拦截 console
- 移动端友好，非程序员也能用

Returns: DebugLogger setup guide + usage. AI can copy files from /Volumes/Q/MiniGame/Mcp/Tank/DebugLogger to project.

Perfect for: H5 games, mobile testing, non-technical users.`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return multiplayerDocTools.getDebugLogger();
    },
    requiresAuth: false,
  },
];
