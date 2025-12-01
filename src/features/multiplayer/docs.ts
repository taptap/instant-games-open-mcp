/**
 * TapTap Multiplayer (OnlineBattle) API Documentation
 * Based on: /Volumes/Q/MiniGame/minigameapi/jsonMdDocs/开发小游戏/小游戏 API/open-api/tap-battle/
 * 
 * TapTap 小游戏多人联机 SDK 文档
 * 
 * 按实际使用流程组织：
 * 初始化和连接 → 匹配进入房间 → 游戏数据互通流转循环 → 退出房间
 */

import type { Documentation } from '../../core/utils/docHelpers.js';

/**
 * Multiplayer documentation data
 * Uses the generic Documentation interface from core
 */
export const MULTIPLAYER_DOCUMENTATION: Documentation = {
  title: "TapTap 多人联机 API (OnlineBattle)",
  description: `TapTap 小游戏多人联机 SDK，支持多个游戏客户端之间的实时数据互通，实现多人联机游戏功能。

⚠️ 重要说明：
- 无需安装 npm 包或 SDK
- 无需 import 语句
- 'tap' 是 TapTap 运行时提供的全局对象
- 所有 API 通过 tap.getOnlineBattleManager() 获取的管理器实例调用
- 仅在 TapTap 小游戏环境中可用

🔴 必须实现的核心 API（最高优先级）：
以下是实现多人联机游戏的最少 API 集合，必须全部实现：

1. 初始化和连接 - getOnlineBattleManager、registerListener、connect
2. 匹配进入房间 - matchRoom（⚠️ 必须进入房间后才能联机通信）
3. 玩家数据更新 - updatePlayerCustomProperties
4. 房间数据更新 - updateRoomProperties（可选，仅房主可用）
5. 数据广播转发 - sendCustomMessage
6. 事件通知 - 各种房间和游戏数据变更通知（必须实现所有事件监听）
7. 退出房间 - leaveRoom

🟡 扩展 API（中等优先级）：
仅在玩家明确提出需求时才实现（后续补充）`,

  categories: {
    // 阶段1：初始化和连接
    step1_init: {
      title: "阶段1：初始化和连接",
      description: `SDK 初始化和连接相关 API。
      
**必须首先完成这3步，才能使用后续功能：**
1. getOnlineBattleManager - 获取管理器实例
2. registerListener - 注册事件监听（必须在 connect 前调用）
3. connect - 连接服务器，获取 playerId`,
      apis: [
        {
          name: "tap.getOnlineBattleManager",
          method: "tap.getOnlineBattleManager()",
          description: `获取多人联机管理器实例。

**全局单例**：多次调用会返回同一个实例。
**官方文档**：https://developer.taptap.cn/docs/sdk/tap-battle/guide/`,
          parameters: {},
          returnValue: "OnlineBattleManager - 多人联机管理器实例",
          example: `// ⚠️ 'tap' 是全局对象，无需 import！

// 获取多人联机管理器（全局单例）
let tapOnlineBattle = tap.getOnlineBattleManager();

// 后续所有操作都通过 tapOnlineBattle 进行`
        },
        {
          name: "OnlineBattleManager.registerListener",
          method: "tapOnlineBattle.registerListener(Object listener)",
          description: `注册事件监听器，用于监听多人联机中的各种事件。

**重要**：
- 必须在 connect 之前调用，确保不会错过任何事件
- 可以多次调用注册多个监听器
- 不支持 Promise 风格调用`,
          parameters: {
            "listener": "Object - 事件监听器对象，包含各种事件回调函数"
          },
          returnValue: "无",
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 在 connect 之前注册事件监听
tapOnlineBattle.registerListener({
  onDisconnected: (errorInfo) => {
    console.log('连接断开:', errorInfo.reason, errorInfo.code);
  },
  playerEnterRoom: (info) => {
    console.log('玩家进入房间:', info.playerInfo.id);
  },
  playerLeaveRoom: (info) => {
    console.log('玩家离开房间:', info.playerId);
  },
  playerOffline: (info) => {
    console.log('玩家掉线:', info.playerId);
  },
  onCustomMessage: (info) => {
    console.log('收到消息:', info.message, '来自:', info.playerId);
  },
  onPlayerCustomPropertiesChange: (info) => {
    console.log('玩家属性变更:', info.playerId, info.properties);
  },
  onRoomPropertiesChange: (info) => {
    console.log('房间属性变更:', info.properties);
  }
});`
        },
        {
          name: "OnlineBattleManager.connect",
          method: "tapOnlineBattle.connect(Object option)",
          description: `连接多人联机服务器，返回 playerId（玩家全局唯一标识）。

**连接成功后才能进行后续的房间操作。**
**支持 Promise 风格调用**`,
          parameters: {
            "option.success": "function (可选) - 成功回调，参数: { playerId: string, errMsg: string }",
            "option.fail": "function (可选) - 失败回调，参数: { errMsg: string, errno: string }",
            "option.complete": "function (可选) - 完成回调"
          },
          returnValue: "Promise<{ playerId: string, errMsg: string }> - 使用 Promise 风格时",
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// Promise 风格（推荐）
try {
  const res = await tapOnlineBattle.connect();
  console.log('连接成功，玩家ID:', res.playerId);
} catch (error) {
  console.error('连接失败:', error);
}

// 回调风格
tapOnlineBattle.connect({
  success: (res) => {
    console.log('连接成功，玩家ID:', res.playerId);
  },
  fail: ({ errMsg, errno }) => {
    console.error('连接失败:', errMsg, errno);
  }
});`
        }
      ]
    },

    // 阶段2：匹配进入房间
    step2_room: {
      title: "阶段2：匹配进入房间",
      description: `房间匹配相关 API。

⚠️ **重点说明：必须进入房间后才能进行联机通信！**

matchRoom 会自动匹配或创建房间，成功后返回 RoomInfo。`,
      apis: [
        {
          name: "OnlineBattleManager.matchRoom",
          method: "tapOnlineBattle.matchRoom(Object option)",
          description: `自动匹配房间，根据匹配参数查找或创建房间。

**匹配逻辑**：
- 如果找到符合条件的房间则加入
- 否则自动创建新房间

**支持 Promise 风格调用**`,
          parameters: {
            "option.data": "Object (必填) - 匹配房间请求数据",
            "option.data.roomCfg": "Object (必填) - 房间配置",
            "option.data.roomCfg.maxPlayerCount": "number (必填) - 房间最大人数",
            "option.data.roomCfg.type": "string (必填) - 房间类型，用于匹配分组",
            "option.data.roomCfg.customProperties": "string (可选) - 自定义房间属性，最大2048字节",
            "option.data.roomCfg.matchParams": "Object (必填) - 匹配参数，如 { level: '5', score: '100' }",
            "option.data.playerCfg": "Object (可选) - 玩家配置",
            "option.data.playerCfg.customStatus": "number (可选) - 自定义玩家状态",
            "option.data.playerCfg.customProperties": "string (可选) - 自定义玩家属性",
            "option.success": "function (可选) - 成功回调",
            "option.fail": "function (可选) - 失败回调"
          },
          returnValue: "Promise<{ roomInfo: RoomInfo, errMsg: string }> - 使用 Promise 风格时",
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// Promise 风格（推荐）
try {
  const res = await tapOnlineBattle.matchRoom({
    data: {
      roomCfg: {
        maxPlayerCount: 4,        // 最多4人
        type: "game_mode_1",      // 房间类型（匹配分组）
        matchParams: {
          level: "1",             // 匹配参数
          score: "0"
        }
      },
      playerCfg: {
        customProperties: JSON.stringify({ 
          nickname: '玩家1'
        })
      }
    }
  });
  
  console.log('匹配成功，房间ID:', res.roomInfo.id);
  console.log('房间内玩家:', res.roomInfo.players);
  
  // ⚠️ 现在可以开始联机通信了！
} catch (error) {
  console.error('匹配失败:', error);
}`
        }
      ]
    },

    // 阶段3：玩家数据更新
    step3_player_data: {
      title: "阶段3：玩家数据更新",
      description: `更新玩家自定义属性，用于同步玩家状态给其他玩家。

属性变更会触发所有玩家的 onPlayerCustomPropertiesChange 事件。`,
      apis: [
        {
          name: "OnlineBattleManager.updatePlayerCustomProperties",
          method: "tapOnlineBattle.updatePlayerCustomProperties(Object option)",
          description: `更新玩家自定义属性。

**典型使用场景**：同步玩家属性变化（如分数、等级、状态等）。
**频率限制**：与 updateRoomProperties、sendCustomMessage 共享每秒15次限制。
**⚠️ 重要**：不适合高频调用，游戏设计应避免高频次使用。

**支持 Promise 风格调用**`,
          parameters: {
            "option.properties": "string (必填) - 自定义玩家属性，UTF-8字符串，最大2048字节",
            "option.success": "function (可选) - 成功回调",
            "option.fail": "function (可选) - 失败回调"
          },
          returnValue: "Promise<void> - 使用 Promise 风格时",
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 更新玩家属性
await tapOnlineBattle.updatePlayerCustomProperties({
  properties: JSON.stringify({
    score: 100,
    level: 5,
    status: 'ready'
  })
});

// 其他玩家会通过 onPlayerCustomPropertiesChange 事件收到更新`
        }
      ]
    },

    // 阶段4：房间数据更新
    step4_room_data: {
      title: "阶段4：房间数据更新（可选）",
      description: `更新房间属性，用于同步房间级别的数据。

⚠️ **只有房主可以调用此方法**
属性变更会触发所有玩家的 onRoomPropertiesChange 事件。`,
      apis: [
        {
          name: "OnlineBattleManager.updateRoomProperties",
          method: "tapOnlineBattle.updateRoomProperties(Object option)",
          description: `更新房间属性（如房间名称、地图、模式）。

**注意事项**：
- 频率限制：与 updatePlayerCustomProperties、sendCustomMessage 共享每秒15次限制
- customProperties 最大2048字节
- 只有房主可以调用此方法
- ⚠️ 不适合高频调用，游戏设计应避免高频次使用

**支持 Promise 风格调用**`,
          parameters: {
            "option.data": "Object (必填) - 更新房间属性数据",
            "option.data.name": "string (可选) - 房间名称",
            "option.data.customProperties": "string (可选) - 房间自定义属性（UTF-8字符串，最大2048字节）",
            "option.success": "function (可选) - 成功回调",
            "option.fail": "function (可选) - 失败回调"
          },
          returnValue: "Promise<void> - 使用 Promise 风格时",
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 更新房间属性（仅房主可用）
await tapOnlineBattle.updateRoomProperties({
  data: {
    name: "新房间名",
    customProperties: JSON.stringify({
      map: 'level_2',
      mode: 'team_battle'
    })
  }
});

// 所有玩家会通过 onRoomPropertiesChange 事件收到更新`
        }
      ]
    },

    // 阶段5：数据广播转发
    step5_broadcast: {
      title: "阶段5：数据广播转发",
      description: `发送自定义消息给房间内玩家，用于实时数据同步。

这是多人联机中最常用的 API，用于同步游戏实时数据。`,
      apis: [
        {
          name: "OnlineBattleManager.sendCustomMessage",
          method: "tapOnlineBattle.sendCustomMessage(Object option)",
          description: `发送自定义消息给房间内玩家。接收方会触发 onCustomMessage 事件。

**典型使用场景**：同步游戏实时数据（如位置、动作、状态等）。
**频率限制**：与 updatePlayerCustomProperties、updateRoomProperties 共享每秒15次限制。
**⚠️ 重要**：不适合高频调用！游戏设计应避免高频次使用API（例如：不要在每帧都调用）。

**支持 Promise 风格调用**`,
          parameters: {
            "option.data": "Object (必填) - 自定义消息数据",
            "option.data.msg": "string (必填) - 消息内容，UTF-8字符串，最大2048字节",
            "option.data.type": "number (必填) - 消息接收者类型：0=房间内所有玩家，1=队伍内所有玩家",
            "option.success": "function (可选) - 成功回调",
            "option.fail": "function (可选) - 失败回调"
          },
          returnValue: "Promise<void> - 使用 Promise 风格时",
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 发送实时数据
await tapOnlineBattle.sendCustomMessage({
  data: {
    msg: JSON.stringify({
      type: 'player_state',
      x: 100,
      y: 200,
      state: 'moving'
    }),
    type: 0  // 发送给房间内所有玩家
  }
});

// ⚠️ 重要：频率限制为每秒15次（与 updatePlayerCustomProperties、updateRoomProperties 共享）

// 典型使用场景：事件类数据（技能释放、道具使用、碰撞检测等）
function onPlayerUseSkill(skillId: string, targetId: string) {
  tapOnlineBattle.sendCustomMessage({
    data: {
      msg: JSON.stringify({
        type: 'use_skill',
        skillId: skillId,
        targetId: targetId,
        timestamp: Date.now()
      }),
      type: 0  // 发送给房间内所有玩家
    }
  });
}

function onItemCollected(itemId: string) {
  tapOnlineBattle.sendCustomMessage({
    data: {
      msg: JSON.stringify({
        type: 'collect_item',
        itemId: itemId,
        timestamp: Date.now()
      }),
      type: 0
    }
  });
}

// 移动同步：发送移动指令，不是实时位置
function startMoveTo(targetX: number, targetY: number) {
  tapOnlineBattle.sendCustomMessage({
    data: {
      msg: JSON.stringify({
        type: 'move_start',
        fromX: currentX,
        fromY: currentY,
        toX: targetX,
        toY: targetY,
        speed: moveSpeed,
        timestamp: Date.now()
      }),
      type: 0
    }
  });
}`
        }
      ]
    },

    // 阶段6：事件通知
    step6_events: {
      title: "阶段6：事件通知",
      description: `通过 registerListener 注册的事件回调，用于接收服务器推送的各种通知。

所有事件都需要在 connect 之前通过 registerListener 注册。`,
      apis: [
        {
          name: "onDisconnected",
          method: "onDisconnected(errorInfo)",
          description: `连接断开时触发。

**典型处理**：显示断线提示，尝试重连。`,
          parameters: {
            "errorInfo.reason": "string - 断开原因",
            "errorInfo.code": "number - 错误代码"
          },
          example: `tapOnlineBattle.registerListener({
  onDisconnected: (errorInfo) => {
    console.log('连接断开:', errorInfo.reason, errorInfo.code);
    // 游戏逻辑自行实现：显示断线提示、尝试重连等
  }
});`
        },
        {
          name: "playerEnterRoom",
          method: "playerEnterRoom(info)",
          description: `玩家进入房间时触发。

**典型处理**：创建新玩家对象。`,
          parameters: {
            "info.roomId": "string - 房间ID",
            "info.playerInfo": "PlayerInfo - 进入的玩家信息对象"
          },
          example: `tapOnlineBattle.registerListener({
  playerEnterRoom: (info) => {
    console.log('新玩家加入:', info.playerInfo.id);
    const props = JSON.parse(info.playerInfo.customProperties || '{}');
    // 游戏逻辑自行实现：创建新玩家对象
  }
});`
        },
        {
          name: "playerLeaveRoom",
          method: "playerLeaveRoom(info)",
          description: `玩家离开房间时触发（主动离开）。

**典型处理**：移除玩家对象。`,
          parameters: {
            "info.roomId": "string - 房间ID",
            "info.playerId": "string - 离开的玩家ID",
            "info.playerName": "string - 离开的玩家名称"
          },
          example: `tapOnlineBattle.registerListener({
  playerLeaveRoom: (info) => {
    console.log('玩家离开:', info.playerId);
    // 游戏逻辑自行实现：移除玩家对象
  }
});`
        },
        {
          name: "playerOffline",
          method: "playerOffline(info)",
          description: `玩家掉线时触发（非主动离开，如网络断开）。

**典型处理**：将玩家标记为离线或移除。`,
          parameters: {
            "info.playerId": "string - 掉线的玩家ID",
            "info.playerName": "string - 掉线的玩家名称"
          },
          example: `tapOnlineBattle.registerListener({
  playerOffline: (info) => {
    console.log('玩家掉线:', info.playerId);
    // 游戏逻辑自行实现：标记离线或移除
  }
});`
        },
        {
          name: "onCustomMessage",
          method: "onCustomMessage(info)",
          description: `收到自定义消息时触发。

**典型处理**：根据消息内容更新游戏状态。`,
          parameters: {
            "info.playerId": "string - 消息发送者玩家ID",
            "info.message": "any - 自定义消息内容",
            "info.type": "number - 消息类型"
          },
          example: `tapOnlineBattle.registerListener({
  onCustomMessage: (info) => {
    const message = typeof info.message === 'string' 
      ? JSON.parse(info.message) 
      : info.message;
    
    // 游戏逻辑自行实现：根据消息类型处理
    console.log('收到消息:', message, '来自:', info.playerId);
  }
});`
        },
        {
          name: "onPlayerCustomPropertiesChange",
          method: "onPlayerCustomPropertiesChange(info)",
          description: `玩家属性变更时触发（包括自己）。

**典型处理**：更新玩家属性显示。`,
          parameters: {
            "info.playerId": "string - 玩家ID",
            "info.properties": "Object - 新的自定义属性对象"
          },
          example: `tapOnlineBattle.registerListener({
  onPlayerCustomPropertiesChange: (info) => {
    const props = typeof info.properties === 'string'
      ? JSON.parse(info.properties)
      : info.properties;
    
    // 游戏逻辑自行实现：更新玩家属性显示
    console.log('玩家属性变更:', info.playerId, props);
  }
});`
        },
        {
          name: "onRoomPropertiesChange",
          method: "onRoomPropertiesChange(info)",
          description: `房间属性变更时触发。

**典型处理**：更新房间状态显示。`,
          parameters: {
            "info.properties": "Object - 新的房间属性对象"
          },
          example: `tapOnlineBattle.registerListener({
  onRoomPropertiesChange: (info) => {
    const props = typeof info.properties === 'string'
      ? JSON.parse(info.properties)
      : info.properties;
    
    // 游戏逻辑自行实现：更新房间状态
    console.log('房间属性变更:', props);
  }
});`
        }
      ]
    },

    // 阶段7：退出房间
    step7_exit: {
      title: "阶段7：退出房间",
      description: `离开当前房间，用于结束游戏或开始下一局。`,
      apis: [
        {
          name: "OnlineBattleManager.leaveRoom",
          method: "tapOnlineBattle.leaveRoom(Object option)",
          description: `离开当前房间。

**典型使用场景**：游戏结束后离开房间，准备开始下一局。

**支持 Promise 风格调用**`,
          parameters: {
            "option.success": "function (可选) - 成功回调",
            "option.fail": "function (可选) - 失败回调"
          },
          returnValue: "Promise<void> - 使用 Promise 风格时",
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 离开房间
await tapOnlineBattle.leaveRoom();
console.log('已离开房间');

// 离开后可以重新匹配下一局
// await tapOnlineBattle.matchRoom({ ... });`
        }
      ]
    },

    // 数据结构
    data_structures: {
      title: "数据结构",
      description: "API 返回值和事件参数中使用的数据结构",
      apis: [
        {
          name: "PlayerInfo",
          method: "PlayerInfo 数据结构",
          description: `玩家信息对象，包含玩家的基本信息。在 playerEnterRoom 事件和 RoomInfo.players 中使用。`,
          parameters: {
            "id": "string - 玩家ID（服务器分配的全局唯一标识）",
            "status": "number - 玩家状态：0=离线，1=在线",
            "customStatus": "number (可选) - 自定义玩家状态",
            "customProperties": "string (可选) - 自定义玩家属性（JSON字符串，最大2048字节）"
          },
          example: `// PlayerInfo 示例
{
  id: "player_123456",
  status: 1,  // 在线
  customStatus: 0,
  customProperties: JSON.stringify({
    nickname: "玩家1",
    level: 10
  })
}`
        },
        {
          name: "RoomInfo",
          method: "RoomInfo 数据结构",
          description: `房间信息对象，包含房间的完整信息。在 matchRoom 成功回调中返回。`,
          parameters: {
            "id": "string - 房间ID",
            "name": "string - 房间名称",
            "type": "string - 房间类型",
            "maxPlayerCount": "number - 房间最大人数",
            "ownerId": "string - 房主ID",
            "players": "PlayerInfo[] - 房间内玩家列表",
            "createTime": "string - 创建时间（时间戳）",
            "customProperties": "string (可选) - 自定义房间属性（JSON字符串）"
          },
          example: `// RoomInfo 示例
{
  id: "room_123456",
  name: "测试房间",
  type: "game_mode_1",
  maxPlayerCount: 4,
  ownerId: "player_001",
  createTime: "1697875200000",
  customProperties: JSON.stringify({ map: 'default' }),
  players: [
    { id: "player_001", status: 1, customProperties: '{"nickname":"玩家1"}' },
    { id: "player_002", status: 1, customProperties: '{"nickname":"玩家2"}' }
  ]
}`
        }
      ]
    },

    // ============ 通用流程模板（可扩展）============
    common_patterns: {
      title: "通用流程模板",
      description: `可组合的原子流程模板，用于构建各种联机功能。

💡 **扩展说明**：此分类设计为可扩展结构，后续可添加更多模板。
每个模板包含：使用场景、涉及API/事件、数据结构示例、代码模板。`,
      apis: [
        {
          name: "模板1：玩家状态同步（低频数据）",
          method: "Pattern: Player State Sync",
          description: `**使用场景**：玩家状态变化（分数、等级、血量、装备、准备状态等低频变化的重要数据）

**涉及 API**：updatePlayerCustomProperties
**触发事件**：onPlayerCustomPropertiesChange（所有玩家收到，包括自己）

**适用数据特点**：
- 变化频率：低频（状态变化时才更新，不是连续变化）
- 数据重要性：重要，需要持久化和可靠同步
- 数据大小：适中（最大2048字节）

**频率限制**：与 updateRoomProperties、sendCustomMessage 共享每秒15次限制。

**⚠️ 重要说明**：
- ❌ 不适合高频变化的数据（如实时位置、移动速度）
- ✅ 适合确定性状态（如到达目的地后的最终位置、技能CD完成、状态切换）
- ✅ 在状态真正变化时调用，不需要定时轮询`,
          parameters: {
            "properties": "string - JSON 格式的玩家属性数据"
          },
          example: `// ========== 玩家状态同步模板 ==========

// 1. 定义玩家状态数据结构（仅包含低频变化的重要数据）
interface PlayerState {
  score: number;       // 分数
  level: number;       // 等级
  hp: number;          // 当前血量
  maxHp: number;       // 最大血量
  status: string;      // 状态：'ready' | 'playing' | 'dead'
  equipment: string;   // 装备信息
}

// 2. 发送方：在状态变化时立即同步
function updatePlayerScore(newScore: number) {
  currentState.score = newScore;
  
  tapOnlineBattle.updatePlayerCustomProperties({
    properties: JSON.stringify(currentState)
  });
}

function updatePlayerHP(newHp: number) {
  currentState.hp = newHp;
  
  // 检查是否死亡
  if (newHp <= 0) {
    currentState.status = 'dead';
  }
  
  tapOnlineBattle.updatePlayerCustomProperties({
    properties: JSON.stringify(currentState)
  });
}

function setPlayerReady(isReady: boolean) {
  currentState.status = isReady ? 'ready' : 'waiting';
  
  tapOnlineBattle.updatePlayerCustomProperties({
    properties: JSON.stringify(currentState)
  });
}

// 3. 接收方：处理其他玩家状态变化
tapOnlineBattle.registerListener({
  onPlayerCustomPropertiesChange: (info) => {
    const state: PlayerState = JSON.parse(info.properties);
    
    if (info.playerId === myPlayerId) {
      // 自己的状态变化回调（可选：用于确认同步成功）
      console.log('自己的状态已同步:', state);
      return;
    }
    
    // 更新其他玩家的显示状态
    updateRemotePlayerUI(info.playerId, state);
  }
});`
        },
        {
          name: "模板2：玩家移动同步（高频数据的正确处理）",
          method: "Pattern: Player Movement Sync",
          description: `**使用场景**：角色移动、实时位置同步

**核心原则**：位置是高频变化数据，不应该直接同步实时坐标，而是同步移动指令，由客户端自己计算位置。

**涉及 API**：
- sendCustomMessage - 同步移动指令（开始移动）
- updatePlayerCustomProperties - 同步最终位置（到达目的地）

**设计思路**：
1. 玩家A移动到B点 → 通过 sendCustomMessage 广播移动指令
2. 各客户端接收到指令 → 自己计算A的移动轨迹（插值、预测）
3. 玩家A到达B点 → 通过 updatePlayerCustomProperties 确认最终位置

**⚠️ 为什么不直接同步位置**：
- 位置每帧都变化，同步频率会远超 15次/秒 的限制
- 网络延迟会导致位置跳跃，体验差
- 客户端插值计算可以实现流畅的移动效果`,
          parameters: {
            "移动指令": "sendCustomMessage - 告知移动目标",
            "最终位置": "updatePlayerCustomProperties - 确认到达"
          },
          example: `// ========== 玩家移动同步（正确做法）==========

// 1. 定义移动相关的数据结构
interface MoveCommand {
  type: 'move_start';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  speed: number;       // 移动速度
  timestamp: number;
}

interface PlayerPosition {
  x: number;
  y: number;
  timestamp: number;
}

// 2. 发送方：开始移动时发送移动指令
function startMoveTo(targetX: number, targetY: number) {
  const moveCommand: MoveCommand = {
    type: 'move_start',
    fromX: currentX,
    fromY: currentY,
    toX: targetX,
    toY: targetY,
    speed: moveSpeed,
    timestamp: Date.now()
  };
  
  // 广播移动指令（其他玩家根据指令自己计算轨迹）
  tapOnlineBattle.sendCustomMessage({
    data: {
      msg: JSON.stringify(moveCommand),
      type: 0
    }
  });
  
  // 本地开始移动动画
  startLocalMove(targetX, targetY);
}

// 3. 到达目的地时，同步最终位置（纠正误差）
function onArriveDestination(finalX: number, finalY: number) {
  // 更新玩家属性，确认最终位置
  tapOnlineBattle.updatePlayerCustomProperties({
    properties: JSON.stringify({
      x: finalX,
      y: finalY,
      timestamp: Date.now()
    })
  });
}

// 4. 接收方：处理移动指令
tapOnlineBattle.registerListener({
  onCustomMessage: (info) => {
    const msg = JSON.parse(info.message);
    
    if (msg.type === 'move_start') {
      // 根据移动指令，在本地计算并播放移动动画
      playRemotePlayerMove(
        info.playerId,
        msg.fromX,
        msg.fromY,
        msg.toX,
        msg.toY,
        msg.speed
      );
    }
  },
  
  onPlayerCustomPropertiesChange: (info) => {
    const pos: PlayerPosition = JSON.parse(info.properties);
    
    // 收到最终位置，纠正可能的误差
    correctRemotePlayerPosition(info.playerId, pos.x, pos.y);
  }
});

// 5. 客户端插值计算（伪代码）
function playRemotePlayerMove(playerId, fromX, fromY, toX, toY, speed) {
  const player = getRemotePlayer(playerId);
  const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  const duration = distance / speed;
  
  // 使用插值动画平滑移动
  animatePlayer(player, fromX, fromY, toX, toY, duration);
}`
        },
        {
          name: "模板3：自定义消息协议框架",
          method: "Pattern: Custom Message Protocol",
          description: `**使用场景**：技能释放、道具使用、碰撞检测、游戏事件等自定义交互

**涉及 API**：sendCustomMessage
**触发事件**：onCustomMessage（除发送者外的玩家收到）

**适用数据特点**：
- 变化频率：建议中低频（每秒5-10次，留有安全余量）
- 数据重要性：一次性消息，不持久化
- 数据大小：小（最大2048字节）

**频率限制**：与 updatePlayerCustomProperties、updateRoomProperties 共享每秒15次限制。
**⚠️ 重要**：不适合高频调用！游戏设计必须避免高频次使用 API！

**协议设计建议**：
- 使用数字类型标识消息类型（节省字节）
- 预留扩展字段
- 复杂游戏建议生成协议文档
- 实现消息队列和批量发送，避免触发频率限制`,
          parameters: {
            "msg": "string - JSON 格式的消息内容",
            "type": "number - 接收者类型：0=全房间，1=队伍"
          },
          example: `// ========== 自定义消息协议框架 ==========

// 1. 定义消息类型枚举（建议在项目中维护协议文档）
enum MessageType {
  PLAYER_ACTION = 1,    // 玩家动作
  USE_ITEM = 2,         // 使用道具
  GAME_EVENT = 3,       // 游戏事件
  CHAT = 4,             // 聊天消息
  // ... 可扩展更多类型
}

// 2. 定义消息结构（建议每种类型单独定义接口）
interface GameMessage {
  type: MessageType;
  data: any;
  timestamp: number;
}

interface ActionMessage extends GameMessage {
  type: MessageType.PLAYER_ACTION;
  data: {
    action: string;     // 动作名称
    targetId?: string;  // 目标玩家ID（可选）
    params?: any;       // 动作参数
  };
}

// 3. 发送消息（带频率控制）
let lastSendTime = 0;
const SEND_INTERVAL = 100; // 100ms = 每秒最多10次

function sendGameMessage(msg: GameMessage) {
  const now = Date.now();
  
  // ⚠️ 重要：必须做频率控制，避免触发 15次/秒 的限制
  if (now - lastSendTime < SEND_INTERVAL) {
    console.warn('消息发送过快，已跳过');
    return;
  }
  
  tapOnlineBattle.sendCustomMessage({
    data: {
      msg: JSON.stringify(msg),
      type: 0  // 发给房间所有人
    }
  });
  
  lastSendTime = now;
}

// 使用示例：即使多次快速调用，也会被节流函数限制
sendGameMessage({
  type: MessageType.PLAYER_ACTION,
  data: { action: 'jump', params: { height: 100 } },
  timestamp: Date.now()
});

// 4. 接收并处理消息
tapOnlineBattle.registerListener({
  onCustomMessage: (info) => {
    const msg: GameMessage = JSON.parse(info.message);
    
    switch (msg.type) {
      case MessageType.PLAYER_ACTION:
        handlePlayerAction(info.playerId, msg.data);
        break;
      case MessageType.USE_ITEM:
        handleUseItem(info.playerId, msg.data);
        break;
      // ... 处理其他消息类型
    }
  }
});`
        },
        {
          name: "模板4：玩家进出房间处理",
          method: "Pattern: Player Room Events",
          description: `**使用场景**：玩家加入/离开房间时的游戏逻辑处理

**涉及事件**：
- playerEnterRoom - 新玩家加入（其他玩家收到）
- playerLeaveRoom - 玩家主动离开（其他玩家收到）
- playerOffline - 玩家掉线（其他玩家收到）

**不同端处理差异**：
| 事件 | 新玩家/离开者 | 其他房间内玩家 |
|------|--------------|---------------|
| 加入房间 | 通过 matchRoom 获取 RoomInfo | 收到 playerEnterRoom 事件 |
| 离开房间 | leaveRoom 回调 | 收到 playerLeaveRoom 事件 |
| 掉线 | 收到 onDisconnected | 收到 playerOffline 事件 |`,
          parameters: {},
          example: `// ========== 玩家进出房间处理模板 ==========

// 玩家管理器
const players = new Map<string, PlayerEntity>();

// 1. 自己加入房间后 - 初始化已有玩家
async function onJoinRoom() {
  const res = await tapOnlineBattle.matchRoom({ ... });
  const roomInfo = res.roomInfo;
  
  // 初始化房间内已有的所有玩家
  roomInfo.players.forEach(playerInfo => {
    if (playerInfo.id !== myPlayerId) {
      const props = JSON.parse(playerInfo.customProperties || '{}');
      createPlayerEntity(playerInfo.id, props);
    }
  });
}

// 2. 其他玩家加入 - 创建新玩家实体
tapOnlineBattle.registerListener({
  playerEnterRoom: (info) => {
    console.log('新玩家加入:', info.playerInfo.id);
    
    const props = JSON.parse(info.playerInfo.customProperties || '{}');
    createPlayerEntity(info.playerInfo.id, props);
    
    // 可选：显示加入提示
    showNotification(\`\${props.nickname || '玩家'} 加入了房间\`);
  }
});

// 3. 玩家主动离开
tapOnlineBattle.registerListener({
  playerLeaveRoom: (info) => {
    console.log('玩家离开:', info.playerId);
    
    removePlayerEntity(info.playerId);
    showNotification(\`玩家离开了房间\`);
  }
});

// 4. 玩家掉线
tapOnlineBattle.registerListener({
  playerOffline: (info) => {
    console.log('玩家掉线:', info.playerId);
    
    // 方案A：直接移除
    removePlayerEntity(info.playerId);
    
    // 方案B：标记为离线，等待重连
    // markPlayerOffline(info.playerId);
    
    // 方案C：AI 接管
    // convertToAI(info.playerId);
  }
});

// 辅助函数
function createPlayerEntity(playerId: string, props: any) {
  const entity = new PlayerEntity(playerId, props);
  players.set(playerId, entity);
}

function removePlayerEntity(playerId: string) {
  const entity = players.get(playerId);
  if (entity) {
    entity.destroy();
    players.delete(playerId);
  }
}`
        },
        {
          name: "模板5：断线处理",
          method: "Pattern: Disconnect Handling",
          description: `**使用场景**：玩家网络断开时的处理

**涉及事件**：
- onDisconnected - 自己断线时触发（断线玩家收到）
- playerOffline - 其他玩家收到断线通知

⚠️ **重要说明**：SDK 不支持断线重连！
- 玩家断线后建议直接返回主界面
- 其他玩家收到 playerOffline 事件后，默认该玩家已退出
- 不需要实现重连逻辑`,
          parameters: {},
          example: `// ========== 断线处理模板 ==========

// 1. 自己断线 - 返回主界面
tapOnlineBattle.registerListener({
  onDisconnected: (errorInfo) => {
    console.log('连接断开:', errorInfo.reason, errorInfo.code);
    
    // 显示断线提示
    showDisconnectNotice('网络连接断开');
    
    // 直接返回主界面（SDK 不支持重连）
    returnToMainMenu();
  }
});

// 2. 其他玩家断线 - 移除该玩家
tapOnlineBattle.registerListener({
  playerOffline: (info) => {
    console.log('玩家掉线:', info.playerId);
    
    // 移除该玩家（默认已退出）
    removePlayerEntity(info.playerId);
    
    // 可选：显示提示
    showNotification('有玩家掉线离开');
  }
});

// 3. 返回主界面的处理
function returnToMainMenu() {
  // 清理游戏状态
  clearGameState();
  
  // 跳转到主界面
  navigateTo('main-menu');
}`
        }
      ]
    },

    // ============ API-事件关系表 ============
    api_event_relations: {
      title: "API 与事件关系表",
      description: `API 调用与事件触发的对应关系，帮助理解不同客户端的处理逻辑差异。

**核心概念**：
- **调用方**：主动调用 API 的客户端
- **接收方**：收到事件通知的客户端
- **全员**：房间内所有玩家（包括调用方自己）`,
      apis: [
        {
          name: "API-事件关系总表",
          method: "API Event Relations Table",
          description: `## 完整关系表

| 动作 | 调用方 API | 触发的事件 | 调用方收到 | 其他玩家收到 |
|------|-----------|-----------|-----------|-------------|
| 加入房间 | matchRoom | playerEnterRoom | RoomInfo（回调） | playerEnterRoom 事件 |
| 离开房间 | leaveRoom | playerLeaveRoom | 无 | playerLeaveRoom 事件 |
| 玩家掉线 | (网络断开) | playerOffline | onDisconnected | playerOffline 事件 |
| 更新玩家属性 | updatePlayerCustomProperties | onPlayerCustomPropertiesChange | 事件通知 ✅ | 事件通知 ✅ |
| 更新房间属性 | updateRoomProperties | onRoomPropertiesChange | 事件通知 ✅ | 事件通知 ✅ |
| 发送消息 | sendCustomMessage | onCustomMessage | 无 ❌ | 事件通知 ✅ |

## 关键差异说明

### 1. matchRoom vs playerEnterRoom
\`\`\`
玩家A加入房间：
├── 玩家A：matchRoom 回调返回 RoomInfo（包含房间内所有玩家）
└── 玩家B、C...：收到 playerEnterRoom 事件（包含玩家A的信息）
\`\`\`

### 2. leaveRoom vs playerLeaveRoom
\`\`\`
玩家A离开房间：
├── 玩家A：leaveRoom 成功回调，无额外事件
└── 玩家B、C...：收到 playerLeaveRoom 事件
\`\`\`

### 3. updatePlayerCustomProperties - 全员收到
\`\`\`
玩家A更新自己的属性：
├── 玩家A：收到 onPlayerCustomPropertiesChange（自己的更新）
└── 玩家B、C...：收到 onPlayerCustomPropertiesChange
\`\`\`

### 4. sendCustomMessage - 发送者不收到
\`\`\`
玩家A发送消息：
├── 玩家A：无事件（发送者不收到自己的消息）
└── 玩家B、C...：收到 onCustomMessage
\`\`\`

⚠️ **重要提示**：sendCustomMessage 发送者不会收到自己的消息，如果需要确认发送成功，请使用 Promise 回调。`,
          parameters: {},
          example: `// ========== API-事件关系示例 ==========

// 示例：理解 updatePlayerCustomProperties 和 sendCustomMessage 的区别

// 场景：玩家A更新位置
// 使用 updatePlayerCustomProperties
tapOnlineBattle.updatePlayerCustomProperties({
  properties: JSON.stringify({ x: 100, y: 200 })
});
// 结果：玩家A、B、C 都会收到 onPlayerCustomPropertiesChange

// 使用 sendCustomMessage
tapOnlineBattle.sendCustomMessage({
  data: { msg: JSON.stringify({ x: 100, y: 200 }), type: 0 }
});
// 结果：只有玩家B、C会收到 onCustomMessage，玩家A不会收到

// 选择建议：
// - 状态类数据（需要持久化、全员同步）→ updatePlayerCustomProperties
// - 事件类数据（一次性、高频）→ sendCustomMessage`
        }
      ]
    },

    // ============ 协议模板规范 ============
    protocol_template: {
      title: "通讯协议模板规范",
      description: `多人联机通讯协议的设计规范和模板，用于 AI 在用户项目中生成协议文档。

💡 **使用建议**：
- 简单游戏（1-3种交互）：可不生成协议文档，直接使用代码注释
- 复杂游戏（4种以上交互）：建议生成 \`docs/multiplayer-protocol.md\`
- 团队协作：强烈建议生成并维护协议文档`,
      apis: [
        {
          name: "协议文档模板",
          method: "Protocol Document Template",
          description: `AI 应在用户项目中生成类似以下格式的协议文档：

**建议文件路径**：\`docs/multiplayer-protocol.md\` 或 \`MULTIPLAYER_PROTOCOL.md\`

**文档结构**：
1. 消息类型定义（枚举表格）
2. 每种消息的详细结构
3. 使用示例
4. 更新日志`,
          parameters: {},
          example: `# 多人联机通讯协议

> 本文档定义游戏中多人联机通讯的消息格式和协议规范。
> 最后更新：YYYY-MM-DD

## 1. 消息类型定义

| type | 名称 | 说明 | 使用 API |
|------|------|------|----------|
| 1 | PLAYER_MOVE | 玩家移动 | sendCustomMessage |
| 2 | PLAYER_ACTION | 玩家动作 | sendCustomMessage |
| 3 | USE_ITEM | 使用道具 | sendCustomMessage |
| 4 | GAME_EVENT | 游戏事件 | sendCustomMessage |
| 5 | CHAT | 聊天消息 | sendCustomMessage |

## 2. 消息结构定义

### 2.1 PLAYER_MOVE (type: 1)

玩家位置移动消息。

\`\`\`typescript
interface PlayerMoveMessage {
  type: 1;
  x: number;        // X 坐标
  y: number;        // Y 坐标
  direction?: number; // 朝向角度（可选）
  timestamp: number;  // 时间戳
}
\`\`\`

**示例**：
\`\`\`json
{ "type": 1, "x": 100.5, "y": 200.3, "direction": 90, "timestamp": 1699999999999 }
\`\`\`

### 2.2 PLAYER_ACTION (type: 2)

玩家动作消息。

\`\`\`typescript
interface PlayerActionMessage {
  type: 2;
  action: string;     // 动作名称
  targetId?: string;  // 目标玩家ID（可选）
  params?: {          // 动作参数（可选）
    [key: string]: any;
  };
  timestamp: number;
}
\`\`\`

**动作类型**：
| action | 说明 | params |
|--------|------|--------|
| attack | 攻击 | { damage: number } |
| jump | 跳跃 | { height: number } |
| skill | 释放技能 | { skillId: string, targetPos?: {x, y} } |

### 2.3 USE_ITEM (type: 3)

使用道具消息。

\`\`\`typescript
interface UseItemMessage {
  type: 3;
  itemId: string;     // 道具ID
  targetId?: string;  // 目标玩家ID（可选）
  timestamp: number;
}
\`\`\`

## 3. 使用示例

\`\`\`typescript
// 发送移动消息
sendGameMessage({
  type: 1,
  x: player.x,
  y: player.y,
  timestamp: Date.now()
});

// 发送攻击动作
sendGameMessage({
  type: 2,
  action: 'attack',
  targetId: 'player_123',
  params: { damage: 10 },
  timestamp: Date.now()
});
\`\`\`

## 4. 更新日志

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| YYYY-MM-DD | 1.0.0 | 初始版本 |
`
        }
      ]
    }
  }
};
