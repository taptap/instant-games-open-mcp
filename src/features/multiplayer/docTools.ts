/**
 * TapTap Multiplayer Documentation Tools
 * 提供文档查询、搜索、生成等功能
 * 
 * 按实际使用流程组织：
 * 初始化和连接 → 匹配进入房间 → 游戏数据互通流转循环 → 退出房间
 */

import {
  generateAPIDoc,
  generateCategoryDoc,
  searchDocumentation,
  generateOverview,
  generateSearchSuggestions,
  type ResourceSuggestion
} from '../../core/utils/docHelpers.js';

import { MULTIPLAYER_DOCUMENTATION } from './docs.js';

interface ToolArgs {
  query?: string;
}

// ============ 阶段分类文档工具 ============

/**
 * 阶段1：初始化和连接 API 文档
 */
async function getStep1Init(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'step1_init');
}

/**
 * 阶段2：匹配进入房间 API 文档
 */
async function getStep2Room(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'step2_room');
}

/**
 * 阶段3：玩家数据更新 API 文档
 */
async function getStep3PlayerData(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'step3_player_data');
}

/**
 * 阶段4：房间数据更新 API 文档
 */
async function getStep4RoomData(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'step4_room_data');
}

/**
 * 阶段5：数据广播转发 API 文档
 */
async function getStep5Broadcast(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'step5_broadcast');
}

/**
 * 阶段6：事件通知文档
 */
async function getStep6Events(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'step6_events');
}

/**
 * 阶段7：退出房间 API 文档
 */
async function getStep7Exit(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'step7_exit');
}

/**
 * 数据结构文档
 */
async function getDataStructures(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'data_structures');
}

/**
 * 通用流程模板文档
 */
async function getCommonPatterns(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'common_patterns');
}

/**
 * API-事件关系表文档
 */
async function getApiEventRelations(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'api_event_relations');
}

/**
 * 协议模板规范文档
 */
async function getProtocolTemplate(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'protocol_template');
}

// ============ 单个 API 文档工具 ============

/**
 * tap.getOnlineBattleManager() 文档
 */
async function getGetOnlineBattleManager(): Promise<string> {
  return generateAPIDoc(MULTIPLAYER_DOCUMENTATION, 'step1_init', 'tap.getOnlineBattleManager');
}

/**
 * registerListener() 文档
 */
async function getRegisterListener(): Promise<string> {
  return generateAPIDoc(MULTIPLAYER_DOCUMENTATION, 'step1_init', 'OnlineBattleManager.registerListener');
}

/**
 * connect() 文档
 */
async function getConnect(): Promise<string> {
  return generateAPIDoc(MULTIPLAYER_DOCUMENTATION, 'step1_init', 'OnlineBattleManager.connect');
}

/**
 * matchRoom() 文档
 */
async function getMatchRoom(): Promise<string> {
  return generateAPIDoc(MULTIPLAYER_DOCUMENTATION, 'step2_room', 'OnlineBattleManager.matchRoom');
}

/**
 * updatePlayerCustomProperties() 文档
 */
async function getUpdatePlayerCustomProperties(): Promise<string> {
  return generateAPIDoc(MULTIPLAYER_DOCUMENTATION, 'step3_player_data', 'OnlineBattleManager.updatePlayerCustomProperties');
}

/**
 * updateRoomProperties() 文档
 */
async function getUpdateRoomProperties(): Promise<string> {
  return generateAPIDoc(MULTIPLAYER_DOCUMENTATION, 'step4_room_data', 'OnlineBattleManager.updateRoomProperties');
}

/**
 * sendCustomMessage() 文档
 */
async function getSendCustomMessage(): Promise<string> {
  return generateAPIDoc(MULTIPLAYER_DOCUMENTATION, 'step5_broadcast', 'OnlineBattleManager.sendCustomMessage');
}

/**
 * leaveRoom() 文档
 */
async function getLeaveRoom(): Promise<string> {
  return generateAPIDoc(MULTIPLAYER_DOCUMENTATION, 'step7_exit', 'OnlineBattleManager.leaveRoom');
}

// ============ 辅助工具 ============

/**
 * 资源建议列表（用于搜索建议）
 */
const MULTIPLAYER_SUGGESTIONS: ResourceSuggestion[] = [
  {
    keywords: ['初始化', 'init', 'manager', '管理器', 'getOnlineBattleManager', '连接', 'connect'],
    uri: 'docs://multiplayer/step1-init',
    description: '阶段1：初始化和连接 - getOnlineBattleManager、registerListener、connect'
  },
  {
    keywords: ['房间', 'room', '匹配', 'match', '加入', 'join'],
    uri: 'docs://multiplayer/step2-room',
    description: '阶段2：匹配进入房间 - matchRoom'
  },
  {
    keywords: ['玩家', 'player', '属性', 'properties', 'customProperties'],
    uri: 'docs://multiplayer/step3-player-data',
    description: '阶段3：玩家数据更新 - updatePlayerCustomProperties'
  },
  {
    keywords: ['房间属性', 'room properties', '更新房间'],
    uri: 'docs://multiplayer/step4-room-data',
    description: '阶段4：房间数据更新 - updateRoomProperties'
  },
  {
    keywords: ['消息', 'message', '发送', 'send', '同步', 'sync', '广播', 'broadcast'],
    uri: 'docs://multiplayer/step5-broadcast',
    description: '阶段5：数据广播转发 - sendCustomMessage'
  },
  {
    keywords: ['事件', 'event', '监听', 'listener', '回调', 'callback'],
    uri: 'docs://multiplayer/step6-events',
    description: '阶段6：事件通知 - onDisconnected、playerEnterRoom 等'
  },
  {
    keywords: ['退出', 'leave', '离开', 'exit'],
    uri: 'docs://multiplayer/step7-exit',
    description: '阶段7：退出房间 - leaveRoom'
  },
  {
    keywords: ['数据', 'data', '结构', 'structure', 'PlayerInfo', 'RoomInfo'],
    uri: 'docs://multiplayer/data-structures',
    description: '数据结构 - PlayerInfo、RoomInfo'
  },
  {
    keywords: ['断线', 'disconnect', '断开', 'offline'],
    uri: 'docs://multiplayer/step6-events',
    description: '断线事件 - onDisconnected、playerOffline'
  }
];

/**
 * 搜索多人联机文档
 */
async function searchMultiplayerDocs(args: ToolArgs): Promise<string> {
  const query = args.query?.toLowerCase() || '';

  if (!query) {
    return 'Please provide a search keyword. 请提供搜索关键词。';
  }

  const results = searchDocumentation(MULTIPLAYER_DOCUMENTATION, query);

  if (results.length === 0) {
    return generateSearchSuggestions(
      query,
      MULTIPLAYER_SUGGESTIONS,
      'docs://multiplayer/overview'
    );
  }

  return `**🎮 搜索结果 "${query}"**\n\n` + results.join('\n---\n\n');
}

/**
 * 获取完整概览
 */
async function getMultiplayerOverview(): Promise<string> {
  return generateOverview(MULTIPLAYER_DOCUMENTATION);
}

/**
 * 获取完整集成流程指南
 */
async function getIntegrationWorkflow(): Promise<string> {
  return `# TapTap 多人联机 SDK 完整接入流程

---

## 🔍 实施前需求确认清单

**⚠️ AI 在开始实现多人联机功能前，必须先向用户确认以下问题：**

### 基础信息
- [ ] 游戏最大支持多少玩家同时在线？（影响 maxPlayerCount 配置）
- [ ] 房间类型(type)如何划分？（如按游戏模式、难度等级）

### 数据同步需求
- [ ] 需要同步哪些玩家数据？（状态、分数、属性等）
- [ ] 是否有房间级别的共享数据需要同步？（如游戏进度、地图状态）
- [ ] ⚠️ 重要：数据同步必须按需同步或低频定时同步，禁止高频同步

### 交互玩法
- [ ] 有哪些玩家间的交互行为？（攻击、道具、技能、碰撞等）
- [ ] 这些交互是否需要定义通讯协议？（建议复杂交互需要协议文档）
- [ ] 是否需要生成协议模板文件？（推荐：docs/multiplayer-protocol.md）

**💡 提示**：
- 默认不需要匹配界面，只有玩家明确提出时才实现
- SDK 支持中途加入游戏
- 玩家掉线会自动触发 playerOffline 事件，1v1 游戏可直接判负
- 房主离开后，SDK 会通过 updateRoomProperties 自动更新新的房主 ID
- 确认以上问题后，可获取详细的通用流程模板（get_multiplayer_common_patterns）和 API-事件关系表（get_api_event_relations）来辅助开发

---

## 📋 总流程

\`\`\`
初始化和连接 → 匹配进入房间 → 游戏数据互通流转循环 → 退出房间
\`\`\`

⚠️ **关键约束：必须进入房间后才能进行联机通信！**

---

## ⚠️ 关键原则

**客户端 API（无需安装）**：
- ❌ 不需要 npm install
- ❌ 不需要 import 语句
- ✅ \`tap\` 是全局对象，由 TapTap 运行时自动提供

**🚨 API 频率限制（极其重要）**：
- ⚠️ **所有 API 都不适合高频调用！游戏设计必须避免高频次使用 API！**
- \`sendCustomMessage\`、\`updatePlayerCustomProperties\`、\`updateRoomProperties\` 共享每秒 **15次** 的频率限制
- ❌ **禁止**：在游戏主循环的每帧都调用 API（例如 60fps 游戏中每帧调用会触发限制）
- ✅ **推荐**：使用定时器控制调用频率（建议 100-200ms 间隔，每秒 5-10 次，留有安全余量）
- ✅ **最佳实践**：
  - 实现节流函数，确保不会超过频率限制
  - 对于快速变化的数据（如位置），使用客户端插值技术减少同步频率
  - 仅在状态真正变化时才调用 API，避免重复同步相同数据

---

## 阶段1：初始化和连接

**目的**：获取管理器、注册事件监听、连接服务器

\`\`\`javascript
// 1. 获取多人联机管理器（全局单例）
let tapOnlineBattle = tap.getOnlineBattleManager();

// 2. 注册事件监听（必须在 connect 之前）
tapOnlineBattle.registerListener({
  onDisconnected: (errorInfo) => {
    // 处理断线
  },
  playerEnterRoom: (info) => {
    // 处理新玩家进入
  },
  playerLeaveRoom: (info) => {
    // 处理玩家离开
  },
  playerOffline: (info) => {
    // 处理玩家掉线
  },
  onCustomMessage: (info) => {
    // 处理实时消息
  },
  onPlayerCustomPropertiesChange: (info) => {
    // 处理玩家属性变更
  },
  onRoomPropertiesChange: (info) => {
    // 处理房间属性变更
  }
});

// 3. 连接服务器，获取 playerId
const res = await tapOnlineBattle.connect();
const myPlayerId = res.playerId;
\`\`\`

---

## 阶段2：匹配进入房间

**目的**：自动匹配或创建房间

⚠️ **必须进入房间后才能进行联机通信！**

💡 **单人开始说明**：
- matchRoom 100% 成功（要么匹配到现有房间，要么创建新房间）
- 如果游戏没有队伍等待/匹配界面，无需等待其他玩家加入
- 单人即可直接开始联机游戏，后续有新玩家加入时会触发 playerEnterRoom 事件

\`\`\`javascript
const res = await tapOnlineBattle.matchRoom({
  data: {
    roomCfg: {
      maxPlayerCount: 4,        // 最大人数
      type: "game_mode",        // 房间类型（用于匹配分组）
      matchParams: {
        level: "1"              // 匹配参数
      }
    },
    playerCfg: {
      customProperties: JSON.stringify({
        nickname: '玩家昵称'
      })
    }
  }
});

const roomInfo = res.roomInfo;
// 初始化房间内已有的玩家
roomInfo.players.forEach(player => {
  // 游戏逻辑自行实现
});
\`\`\`

---

## 阶段3-5：游戏数据互通流转循环

### 3. 玩家数据更新

**目的**：同步玩家属性变化（如分数、等级）

\`\`\`javascript
await tapOnlineBattle.updatePlayerCustomProperties({
  properties: JSON.stringify({
    score: 100,
    level: 5
  })
});
// 所有玩家会收到 onPlayerCustomPropertiesChange 事件
\`\`\`

### 4. 房间数据更新（可选，仅房主）

**目的**：同步房间级别数据

\`\`\`javascript
await tapOnlineBattle.updateRoomProperties({
  data: {
    customProperties: JSON.stringify({
      map: 'level_2'
    })
  }
});
// 所有玩家会收到 onRoomPropertiesChange 事件
\`\`\`

### 5. 数据广播转发

**目的**：实时同步游戏数据（如位置、动作）

\`\`\`javascript
// 注意频率限制：每秒最多50次
let lastSyncTime = 0;
const SYNC_INTERVAL = 50; // 50ms

function gameLoop() {
  // 游戏逻辑自行实现
  
  const now = Date.now();
  if (now - lastSyncTime >= SYNC_INTERVAL) {
    tapOnlineBattle.sendCustomMessage({
      data: {
        msg: JSON.stringify({
          type: 'player_state',
          x: player.x,
          y: player.y
        }),
        type: 0  // 发给房间所有人
      }
    });
    lastSyncTime = now;
  }
  
  requestAnimationFrame(gameLoop);
}
\`\`\`

---

## 阶段6：事件通知

**目的**：响应服务器推送的各种事件

事件通过 registerListener 在阶段1注册，主要包括：
- \`onDisconnected\` - 断线
- \`playerEnterRoom\` - 新玩家进入
- \`playerLeaveRoom\` - 玩家离开
- \`playerOffline\` - 玩家掉线
- \`onCustomMessage\` - 收到实时消息
- \`onPlayerCustomPropertiesChange\` - 玩家属性变更
- \`onRoomPropertiesChange\` - 房间属性变更

---

## 阶段7：退出房间

**目的**：结束游戏或开始下一局

\`\`\`javascript
await tapOnlineBattle.leaveRoom();
// 可以重新匹配下一局
// await tapOnlineBattle.matchRoom({ ... });
\`\`\`

---

## 💡 注意事项

1. **频率限制**：sendCustomMessage 和 updateRoomProperties 共享每秒15次限制
2. **数据大小**：消息内容和属性最大2048字节
3. **事件顺序**：先 registerListener，后 connect
4. **房主权限**：只有房主可以调用 updateRoomProperties
5. **进房约束**：必须进入房间后才能联机通信

---

## 📚 详细文档

- **docs://multiplayer/overview** - 完整概览
- **docs://multiplayer/step1-init** - 阶段1：初始化和连接
- **docs://multiplayer/step2-room** - 阶段2：匹配进入房间
- **docs://multiplayer/step3-player-data** - 阶段3：玩家数据更新
- **docs://multiplayer/step4-room-data** - 阶段4：房间数据更新
- **docs://multiplayer/step5-broadcast** - 阶段5：数据广播转发
- **docs://multiplayer/step6-events** - 阶段6：事件通知
- **docs://multiplayer/step7-exit** - 阶段7：退出房间
- **docs://multiplayer/data-structures** - 数据结构
`;
}

// 导出所有文档工具
export const multiplayerDocTools = {
  // 阶段分类文档
  getStep1Init,
  getStep2Room,
  getStep3PlayerData,
  getStep4RoomData,
  getStep5Broadcast,
  getStep6Events,
  getStep7Exit,
  getDataStructures,

  // 单个 API 文档
  getGetOnlineBattleManager,
  getRegisterListener,
  getConnect,
  getMatchRoom,
  getUpdatePlayerCustomProperties,
  getUpdateRoomProperties,
  getSendCustomMessage,
  getLeaveRoom,

  // 辅助工具
  searchMultiplayerDocs,
  getMultiplayerOverview,
  getIntegrationWorkflow,

  // 新增：通用模板和关系表
  getCommonPatterns,
  getApiEventRelations,
  getProtocolTemplate
};
