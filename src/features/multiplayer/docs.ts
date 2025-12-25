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
  title: 'TapTap 多人联机 API (OnlineBattle)',
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
⚠️ 仅在用户明确提出对应需求时才使用！严禁主动添加！
以下 API 功能明确，都有对应的使用场景：

1. 房间管理增强 - createRoom、getRoomList、joinRoom、kickRoomPlayer
2. 连接控制 - disconnect
3. 玩家状态扩展 - updatePlayerCustomStatus
4. 错误处理 - onBattleServiceError 事件
5. 房间事件 - onPlayerKicked 事件
6. 状态事件 - onPlayerCustomStatusChange 事件`,

  categories: {
    // 阶段1：初始化和连接
    step1_init: {
      title: '阶段1：初始化和连接',
      description: `SDK 初始化和连接相关 API。
      
**必须首先完成这3步，才能使用后续功能：**
1. getOnlineBattleManager - 获取管理器实例
2. registerListener - 注册事件监听（必须在 connect 前调用）
3. connect - 连接服务器，获取 playerId`,
      apis: [
        {
          name: 'tap.getOnlineBattleManager',
          method: 'tap.getOnlineBattleManager()',
          description: `获取多人联机管理器实例。

**全局单例**：多次调用会返回同一个实例。
**官方文档**：https://developer.taptap.cn/docs/sdk/tap-battle/guide/`,
          parameters: {},
          returnValue: 'OnlineBattleManager - 多人联机管理器实例',
          example: `// ⚠️ 'tap' 是全局对象，无需 import！

// 获取多人联机管理器（全局单例）
let tapOnlineBattle = tap.getOnlineBattleManager();

// 后续所有操作都通过 tapOnlineBattle 进行`,
        },
        {
          name: 'OnlineBattleManager.registerListener',
          method: 'tapOnlineBattle.registerListener(Object listener)',
          description: `注册事件监听器，用于监听多人联机中的各种事件。

**重要**：
- 必须在 connect 之前调用，确保不会错过任何事件
- 可以多次调用注册多个监听器
- 不支持 Promise 风格调用`,
          parameters: {
            listener: 'Object - 事件监听器对象，包含各种事件回调函数',
          },
          returnValue: '无',
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
});`,
        },
        {
          name: 'OnlineBattleManager.connect',
          method: 'tapOnlineBattle.connect(Object option)',
          description: `连接多人联机服务器，返回 playerId（玩家全局唯一标识）。

**连接成功后才能进行后续的房间操作。**
**支持 Promise 风格调用**

🔴 **返回值结构（极其重要）**：
\`\`\`javascript
{
  playerId: "7xX2mTXjdxQ39bn/a+1tVQ==",  // 本地玩家的唯一标识
  errMsg: "connect:ok"                    // 操作结果消息
}
\`\`\`

⚠️ **playerId 是后续所有操作的基础**：
- 必须保存此 playerId，用于判断"是不是我自己"
- 在 matchRoom 返回的 players 列表中，与此 playerId 相同的就是本地玩家
- 在收到 onCustomMessage 时，fromPlayerId 与此 playerId 相同的要跳过（是自己发的）`,
          parameters: {
            'option.success':
              'function (可选) - 成功回调，参数: { playerId: string, errMsg: string }',
            'option.fail': 'function (可选) - 失败回调，参数: { errMsg: string, errno: string }',
            'option.complete': 'function (可选) - 完成回调',
          },
          returnValue: 'Promise<{ playerId: string, errMsg: string }> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// ⭐ 推荐用法：保存 playerId 供后续使用
let myPlayerId = null;

try {
  const res = await tapOnlineBattle.connect();
  
  // 🔴 必须保存 playerId！后续所有判断都依赖它
  myPlayerId = res.playerId;
  
  console.log('连接成功');
  console.log('我的玩家ID:', myPlayerId);
  // 输出示例: 我的玩家ID: 7xX2mTXjdxQ39bn/a+1tVQ==
  
} catch (error) {
  console.error('连接失败:', error);
}

// ❌ 常见错误：没有保存 playerId
// const res = await tapOnlineBattle.connect();
// // 忘记保存 res.playerId，后续无法判断"是不是我自己"

// ✅ 正确做法：在类或模块级别保存
class MultiplayerManager {
  constructor() {
    this.myPlayerId = null;  // 保存本地玩家ID
  }
  
  async init() {
    const res = await tapOnlineBattle.connect();
    this.myPlayerId = res.playerId;  // ← 关键！
  }
}`,
        },
      ],
    },

    // 阶段2：匹配进入房间
    step2_room: {
      title: '阶段2：匹配进入房间',
      description: `房间匹配相关 API。

⚠️ **重点说明：必须进入房间后才能进行联机通信！**

matchRoom 会自动匹配或创建房间，成功后返回 RoomInfo。`,
      apis: [
        {
          name: 'OnlineBattleManager.matchRoom',
          method: 'tapOnlineBattle.matchRoom(Object option)',
          description: `自动匹配房间，根据匹配参数查找或创建房间。

**匹配逻辑**：
- 如果找到符合条件的房间则加入
- 否则自动创建新房间

**支持 Promise 风格调用**

🔴 **返回值结构（极其重要 - 有包装层！）**：
\`\`\`javascript
{
  roomInfo: {                              // ⚠️ 注意：有 roomInfo 包装层！
    id: "25",                              // 房间ID
    ownerId: "7xX2mTXjdxQ39bn/a+1tVQ==",  // 房主玩家ID
    maxPlayerCount: 4,                     // 最大玩家数
    type: "game_mode_1",                   // 房间类型
    createTime: 1764757302,                // 创建时间戳
    customProperties: "{}",                // 房间自定义属性（JSON字符串）
    players: [                             // ⚠️ 房间内所有玩家列表
      {
        id: "7xX2mTXjdxQ39bn/a+1tVQ==",   // 玩家ID（与 connect 返回的 playerId 格式相同）
        status: 1,                         // 1=在线
        customProperties: '{"nickname":"玩家1"}'
      },
      {
        id: "JyFZc84+HTcpxGBdHSdFbqw==",
        status: 1,
        customProperties: '{"nickname":"玩家2"}'
      }
    ]
  },
  errMsg: "matchRoom:ok"
}
\`\`\`

❌ **常见错误**：
- 直接使用 \`result.players\` → undefined！应该用 \`result.roomInfo.players\`
- 直接使用 \`result.id\` → undefined！应该用 \`result.roomInfo.id\``,
          parameters: {
            'option.data': 'Object (必填) - 匹配房间请求数据',
            'option.data.roomCfg': 'Object (必填) - 房间配置',
            'option.data.roomCfg.maxPlayerCount': 'number (必填) - 房间最大人数',
            'option.data.roomCfg.type': 'string (必填) - 房间类型，用于匹配分组',
            'option.data.roomCfg.customProperties': 'string (可选) - 自定义房间属性，最大2048字节',
            'option.data.roomCfg.matchParams':
              "Object (必填) - 匹配参数，如 { level: '5', score: '100' }",
            'option.data.playerCfg': 'Object (可选) - 玩家配置',
            'option.data.playerCfg.customStatus': 'number (可选) - 自定义玩家状态',
            'option.data.playerCfg.customProperties': 'string (可选) - 自定义玩家属性',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<{ roomInfo: RoomInfo, errMsg: string }> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// ⭐ 推荐用法：正确提取 roomInfo
try {
  const result = await tapOnlineBattle.matchRoom({
    data: {
      roomCfg: {
        maxPlayerCount: 4,
        type: "game_mode_1",
        matchParams: { mode: "classic" }
      },
      playerCfg: {
        customProperties: JSON.stringify({ 
          nickname: '玩家' + myPlayerId.substring(0, 6)
        })
      }
    }
  });
  
  // 🔴 必须从 result.roomInfo 获取房间信息！
  const roomInfo = result.roomInfo;
  
  console.log('匹配成功');
  console.log('房间ID:', roomInfo.id);
  console.log('房主ID:', roomInfo.ownerId);
  console.log('当前玩家数:', roomInfo.players.length);
  
  // 🔴 遍历房间内所有玩家，判断哪个是自己
  roomInfo.players.forEach(player => {
    const isMe = (player.id === myPlayerId);
    const props = JSON.parse(player.customProperties || '{}');
    
    console.log(\`玩家 \${player.id.substring(0, 6)}: \${isMe ? '(我)' : '(其他)'}\`);
    
    if (!isMe) {
      // 为其他玩家创建游戏对象
      createRemotePlayer(player.id, props);
    }
  });
  
  // 判断自己是否是房主
  const isOwner = (roomInfo.ownerId === myPlayerId);
  console.log('我是房主:', isOwner);
  
} catch (error) {
  console.error('匹配失败:', error);
}

// ❌ 常见错误示例
// const result = await tapOnlineBattle.matchRoom({...});
// console.log(result.players);  // undefined! 错误！
// console.log(result.id);       // undefined! 错误！

// ✅ 正确做法
// console.log(result.roomInfo.players);  // 正确
// console.log(result.roomInfo.id);       // 正确`,
        },
      ],
    },

    // 阶段3：玩家数据更新
    step3_player_data: {
      title: '阶段3：玩家数据更新',
      description: `更新玩家自定义属性，用于同步玩家状态给其他玩家。

属性变更会触发所有玩家的 onPlayerCustomPropertiesChange 事件。`,
      apis: [
        {
          name: 'OnlineBattleManager.updatePlayerCustomProperties',
          method: 'tapOnlineBattle.updatePlayerCustomProperties(Object option)',
          description: `更新玩家自定义属性。

**典型使用场景**：同步玩家属性变化（如分数、等级、状态等）。
**频率限制**：与 updateRoomProperties、sendCustomMessage 共享每秒15次限制。
**⚠️ 重要**：不适合高频调用，游戏设计应避免高频次使用。

**支持 Promise 风格调用**`,
          parameters: {
            'option.properties': 'string (必填) - 自定义玩家属性，UTF-8字符串，最大2048字节',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<void> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 🔴🔴🔴 【频率限制警告】updatePlayerCustomProperties 与 sendCustomMessage、updateRoomProperties
//        三个 API 共享每秒 15 次限制！严禁超频调用！
//        建议使用节流函数（SyncThrottle），设置最小 100ms 间隔

// 更新玩家属性
await tapOnlineBattle.updatePlayerCustomProperties({  // 🔴 频率限制：共享 15次/秒
  properties: JSON.stringify({
    score: 100,
    level: 5,
    status: 'ready'
  })
});

// 其他玩家会通过 onPlayerCustomPropertiesChange 事件收到更新`,
        },
      ],
    },

    // 阶段4：房间数据更新
    step4_room_data: {
      title: '阶段4：房间数据更新（可选）',
      description: `更新房间属性，用于同步房间级别的数据。

⚠️ **只有房主可以调用此方法**
属性变更会触发所有玩家的 onRoomPropertiesChange 事件。`,
      apis: [
        {
          name: 'OnlineBattleManager.updateRoomProperties',
          method: 'tapOnlineBattle.updateRoomProperties(Object option)',
          description: `更新房间属性（如房间名称、地图、模式）。

**注意事项**：
- 频率限制：与 updatePlayerCustomProperties、sendCustomMessage 共享每秒15次限制
- customProperties 最大2048字节
- 只有房主可以调用此方法
- ⚠️ 不适合高频调用，游戏设计应避免高频次使用

**支持 Promise 风格调用**`,
          parameters: {
            'option.data': 'Object (必填) - 更新房间属性数据',
            'option.data.name': 'string (可选) - 房间名称',
            'option.data.customProperties':
              'string (可选) - 房间自定义属性（UTF-8字符串，最大2048字节）',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<void> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 🔴🔴🔴 【频率限制警告】updateRoomProperties 与 sendCustomMessage、updatePlayerCustomProperties
//        三个 API 共享每秒 15 次限制！严禁超频调用！
//        建议使用节流函数（SyncThrottle），设置最小 100ms 间隔

// 更新房间属性（仅房主可用）
await tapOnlineBattle.updateRoomProperties({  // 🔴 频率限制：共享 15次/秒
  data: {
    name: "新房间名",
    customProperties: JSON.stringify({
      map: 'level_2',
      mode: 'team_battle'
    })
  }
});

// 所有玩家会通过 onRoomPropertiesChange 事件收到更新`,
        },
      ],
    },

    // 阶段5：数据广播转发
    step5_broadcast: {
      title: '阶段5：数据广播转发',
      description: `发送自定义消息给房间内玩家，用于实时数据同步。

这是多人联机中最常用的 API，用于同步游戏实时数据。

🚨 **API 频率限制（极其重要）**：
- sendCustomMessage、updatePlayerCustomProperties、updateRoomProperties **共享每秒 15 次限制**
- ❌ 禁止在每帧调用（60fps 游戏会严重超限）
- ✅ 推荐使用 100-200ms 间隔（每秒 5-10 次）
- ✅ 仅在数据真正变化时才发送

🔴 **消息发送格式（必须包含 data 包装层）**：
\`\`\`javascript
tapOnlineBattle.sendCustomMessage({
  data: {                    // ⚠️ 必须有 data 包装层！
    msg: JSON.stringify({    // ⚠️ msg 必须是字符串！
      type: 'move',
      x: 100,
      y: 200
    }),
    type: 0                  // 0=发给房间所有人
  }
});
\`\`\``,
      apis: [
        {
          name: 'OnlineBattleManager.sendCustomMessage',
          method: 'tapOnlineBattle.sendCustomMessage(Object option)',
          description: `发送自定义消息给房间内玩家。接收方会触发 onCustomMessage 事件。

**典型使用场景**：同步游戏实时数据（如位置、动作、状态等）。
**频率限制**：与 updatePlayerCustomProperties、updateRoomProperties 共享每秒15次限制。
**⚠️ 重要**：不适合高频调用！游戏设计应避免高频次使用API（例如：不要在每帧都调用）。

**支持 Promise 风格调用**`,
          parameters: {
            'option.data': 'Object (必填) - 自定义消息数据',
            'option.data.msg': 'string (必填) - 消息内容，UTF-8字符串，最大2048字节',
            'option.data.type':
              'number (必填) - 消息接收者类型：0=房间内所有玩家，1=队伍内所有玩家',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<void> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 🔴🔴🔴 【频率限制警告】sendCustomMessage 与 updatePlayerCustomProperties、updateRoomProperties
//        三个 API 共享每秒 15 次限制！严禁超频调用！
//        建议使用节流函数（SyncThrottle），设置最小 100ms 间隔

// 发送实时数据
await tapOnlineBattle.sendCustomMessage({  // 🔴 频率限制：共享 15次/秒
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

// 典型使用场景：事件类数据（技能释放、道具使用、碰撞检测等）
function onPlayerUseSkill(skillId: string, targetId: string) {
  tapOnlineBattle.sendCustomMessage({  // 🔴 频率限制：共享 15次/秒
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
  tapOnlineBattle.sendCustomMessage({  // 🔴 频率限制：共享 15次/秒
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
  tapOnlineBattle.sendCustomMessage({  // 🔴 频率限制：共享 15次/秒
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
}`,
        },
      ],
    },

    // 阶段6：事件通知
    step6_events: {
      title: '阶段6：事件通知',
      description: `通过 registerListener 注册的事件回调，用于接收服务器推送的各种通知。

所有事件都需要在 connect 之前通过 registerListener 注册。`,
      apis: [
        {
          name: 'onDisconnected',
          method: 'onDisconnected(errorInfo)',
          description: `连接断开时触发。

**典型处理**：显示断线提示，尝试重连。`,
          parameters: {
            'errorInfo.reason': 'string - 断开原因',
            'errorInfo.code': 'number - 错误代码',
          },
          example: `tapOnlineBattle.registerListener({
  onDisconnected: (errorInfo) => {
    console.log('连接断开:', errorInfo.reason, errorInfo.code);
    // 游戏逻辑自行实现：显示断线提示、尝试重连等
  }
});`,
        },
        {
          name: 'playerEnterRoom',
          method: 'playerEnterRoom(info)',
          description: `玩家进入房间时触发。

**典型处理**：创建新玩家对象。

🔴 **回调参数结构（有 playerInfo 包装层！）**：
\`\`\`javascript
{
  roomId: "25",                           // 房间ID
  playerInfo: {                           // ⚠️ 注意：有 playerInfo 包装层！
    id: "JyFZc84+HTcpxGBdHSdFbqw==",     // 新玩家的ID
    status: 1,                            // 1=在线
    customStatus: 0,
    customProperties: '{"nickname":"新玩家"}'
  }
}
\`\`\`

❌ **常见错误**：
- 直接使用 \`info.id\` → undefined！应该用 \`info.playerInfo.id\`
- 忘记检查是否是自己（理论上不会收到自己的加入事件，但防御性检查）`,
          parameters: {
            'info.roomId': 'string - 房间ID',
            'info.playerInfo': 'PlayerInfo - 进入的玩家信息对象（⚠️ 有包装层！）',
            'info.playerInfo.id': 'string - 新玩家的ID',
            'info.playerInfo.status': 'number - 玩家状态：1=在线',
            'info.playerInfo.customProperties': 'string - 自定义属性（JSON字符串）',
          },
          example: `tapOnlineBattle.registerListener({
  playerEnterRoom: (info) => {
    // 🔴 必须从 info.playerInfo 获取玩家信息！
    const playerInfo = info.playerInfo;
    const newPlayerId = playerInfo.id;
    
    console.log('新玩家加入房间:', info.roomId);
    console.log('新玩家ID:', newPlayerId);
    
    // 防御性检查：跳过自己（理论上不会收到）
    if (newPlayerId === myPlayerId) {
      console.log('这是我自己，跳过');
      return;
    }
    
    // 解析玩家自定义属性
    const props = JSON.parse(playerInfo.customProperties || '{}');
    console.log('玩家昵称:', props.nickname);
    
    // 为新玩家创建游戏对象
    createRemotePlayer(newPlayerId, props);
  }
});

// ❌ 常见错误示例
// playerEnterRoom: (info) => {
//   const playerId = info.id;  // undefined! 错误！
// }

// ✅ 正确做法
// playerEnterRoom: (info) => {
//   const playerId = info.playerInfo.id;  // 正确
// }`,
        },
        {
          name: 'playerLeaveRoom',
          method: 'playerLeaveRoom(info)',
          description: `玩家离开房间时触发（主动离开）。

**典型处理**：移除玩家对象。`,
          parameters: {
            'info.roomId': 'string - 房间ID',
            'info.playerId': 'string - 离开的玩家ID',
            'info.playerName': 'string - 离开的玩家名称',
          },
          example: `tapOnlineBattle.registerListener({
  playerLeaveRoom: (info) => {
    console.log('玩家离开:', info.playerId);
    // 游戏逻辑自行实现：移除玩家对象
  }
});`,
        },
        {
          name: 'playerOffline',
          method: 'playerOffline(info)',
          description: `玩家掉线时触发（非主动离开，如网络断开）。

**典型处理**：将玩家标记为离线或移除。`,
          parameters: {
            'info.playerId': 'string - 掉线的玩家ID',
            'info.playerName': 'string - 掉线的玩家名称',
          },
          example: `tapOnlineBattle.registerListener({
  playerOffline: (info) => {
    console.log('玩家掉线:', info.playerId);
    // 游戏逻辑自行实现：标记离线或移除
  }
});`,
        },
        {
          name: 'onCustomMessage',
          method: 'onCustomMessage(info)',
          description: `收到自定义消息时触发。

**典型处理**：根据消息内容更新游戏状态。

🔴 **回调参数结构（字段名可能不一致！）**：
\`\`\`javascript
{
  fromPlayerId: "7xX2mTXjdxQ39bn/a+1tVQ==",  // 发送者ID（可能是 fromPlayerId 或 playerId）
  msg: '{"type":"move","x":100,"y":200}',     // 消息内容（可能是 msg 或 message）
  type: 0                                      // 消息类型：0=全房间
}
\`\`\`

⚠️ **字段名兼容问题**：
- 发送者ID：可能是 \`fromPlayerId\`、\`fromUserId\` 或 \`playerId\`
- 消息内容：可能是 \`msg\`、\`message\` 或 \`content\`
- 建议使用 \`||\` 运算符兼容多种字段名

🔴 **重要**：发送者自己不会收到此事件！`,
          parameters: {
            'info.fromPlayerId': 'string - 消息发送者玩家ID（也可能是 playerId 或 fromUserId）',
            'info.msg': 'string - 消息内容（也可能是 message 或 content）',
            'info.type': 'number - 消息类型：0=房间内所有玩家，1=队伍内玩家',
          },
          example: `tapOnlineBattle.registerListener({
  onCustomMessage: (info) => {
    // 🔴 兼容多种字段名（不同版本SDK可能不同）
    const fromPlayerId = info.fromPlayerId || info.playerId || info.fromUserId;
    const msgStr = info.msg || info.message || info.content;
    
    console.log('收到消息，来自:', fromPlayerId);
    
    // 🔴 跳过自己发送的消息（发送者不收到，但防御性检查）
    if (fromPlayerId === myPlayerId) {
      return;
    }
    
    // 解析消息内容
    const data = JSON.parse(msgStr);
    console.log('消息数据:', data);
    
    // 根据消息类型处理
    switch (data.type) {
      case 'move':
        handlePlayerMove(fromPlayerId, data.x, data.y);
        break;
      case 'action':
        handlePlayerAction(fromPlayerId, data.action);
        break;
    }
  }
});

// ⭐ 推荐：封装消息解析函数
function parseCustomMessage(info) {
  return {
    fromPlayerId: info.fromPlayerId || info.playerId || info.fromUserId,
    data: JSON.parse(info.msg || info.message || info.content),
    type: info.type
  };
}

// 使用封装后的函数
// onCustomMessage: (info) => {
//   const { fromPlayerId, data } = parseCustomMessage(info);
//   // 处理消息...
// }`,
        },
        {
          name: 'onPlayerCustomPropertiesChange',
          method: 'onPlayerCustomPropertiesChange(info)',
          description: `玩家属性变更时触发（包括自己）。

**典型处理**：更新玩家属性显示。`,
          parameters: {
            'info.playerId': 'string - 玩家ID',
            'info.properties': 'Object - 新的自定义属性对象',
          },
          example: `tapOnlineBattle.registerListener({
  onPlayerCustomPropertiesChange: (info) => {
    const props = typeof info.properties === 'string'
      ? JSON.parse(info.properties)
      : info.properties;
    
    // 游戏逻辑自行实现：更新玩家属性显示
    console.log('玩家属性变更:', info.playerId, props);
  }
});`,
        },
        {
          name: 'onRoomPropertiesChange',
          method: 'onRoomPropertiesChange(info)',
          description: `房间属性变更时触发。

**典型处理**：更新房间状态显示。`,
          parameters: {
            'info.properties': 'Object - 新的房间属性对象',
          },
          example: `tapOnlineBattle.registerListener({
  onRoomPropertiesChange: (info) => {
    const props = typeof info.properties === 'string'
      ? JSON.parse(info.properties)
      : info.properties;
    
    // 游戏逻辑自行实现：更新房间状态
    console.log('房间属性变更:', props);
  }
});`,
        },
      ],
    },

    // 阶段7：退出房间
    step7_exit: {
      title: '阶段7：退出房间',
      description: `离开当前房间，用于结束游戏或开始下一局。`,
      apis: [
        {
          name: 'OnlineBattleManager.leaveRoom',
          method: 'tapOnlineBattle.leaveRoom(Object option)',
          description: `离开当前房间。

**典型使用场景**：游戏结束后离开房间，准备开始下一局。

**支持 Promise 风格调用**`,
          parameters: {
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<void> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 离开房间
await tapOnlineBattle.leaveRoom();
console.log('已离开房间');

// 离开后可以重新匹配下一局
// await tapOnlineBattle.matchRoom({ ... });`,
        },
      ],
    },

    // 数据结构
    data_structures: {
      title: '数据结构',
      description: `API 返回值和事件参数中使用的数据结构。

分为三类：
1. **基础数据结构** - PlayerInfo、RoomInfo
2. **API 返回值结构** - 各 API 的 Promise 返回值格式
3. **事件回调参数结构** - 各事件监听器的参数格式`,
      apis: [
        // ============ 基础数据结构 ============
        {
          name: 'PlayerInfo',
          method: 'PlayerInfo 数据结构',
          description: `🔴 **核心数据结构**：玩家信息对象，包含玩家的基本信息。

---

## 📍 获取 PlayerInfo 的方式

| 来源 | 获取路径 | 说明 |
|-----|---------|------|
| \`matchRoom()\` 返回值 | \`result.roomInfo.players[]\` | 房间内所有玩家（包括自己） |
| \`playerEnterRoom\` 事件 | \`info.playerInfo\` | ⚠️ 注意有 playerInfo 包装层！ |
| \`onPlayerCustomPropertiesChange\` | \`info.playerId\` + \`info.properties\` | 只有 ID 和属性，无完整对象 |

---

## ⚠️ 常见错误

1. **playerEnterRoom 事件的包装层**：
   - ❌ 错误：\`info.id\` → undefined
   - ✅ 正确：\`info.playerInfo.id\`

2. **customProperties 是字符串**：
   - ❌ 错误：\`player.customProperties.nickname\`
   - ✅ 正确：\`JSON.parse(player.customProperties).nickname\`

---

## 📖 官方文档
https://developer.taptap.cn/docs/sdk/tap-battle/guide/`,
          parameters: {
            id: 'string - 玩家ID（服务器分配的全局唯一标识，Base64编码）',
            status: 'number - 玩家在线状态：0=离线，1=在线',
            customStatus: 'number (可选) - 自定义玩家状态（通过 updatePlayerCustomStatus 设置）',
            customProperties:
              'string (可选) - 自定义玩家属性（JSON字符串，最大2048字节，通过 playerCfg.customProperties 或 updatePlayerCustomProperties 设置）',
          },
          example: `// ========== PlayerInfo 完整示例 ==========

// 1️⃣ 数据结构
{
  id: "7xX2mTXjdxQ39bn/a+1tVQ==",  // Base64 编码的玩家ID
  status: 1,                        // 1=在线, 0=离线
  customStatus: 0,                  // 自定义状态（可选）
  customProperties: '{"nickname":"玩家1","level":10,"avatar":"avatar_01"}'
}

// 2️⃣ 从 matchRoom 获取所有玩家
const result = await tapOnlineBattle.matchRoom({...});
result.roomInfo.players.forEach(player => {
  console.log('玩家ID:', player.id);
  console.log('在线状态:', player.status === 1 ? '在线' : '离线');
  
  // 🔴 解析 customProperties（是字符串！）
  const props = JSON.parse(player.customProperties || '{}');
  console.log('昵称:', props.nickname);
  console.log('等级:', props.level);
});

// 3️⃣ 从 playerEnterRoom 事件获取新玩家
tapOnlineBattle.registerListener({
  playerEnterRoom: (info) => {
    // 🔴 注意：有 playerInfo 包装层！
    const newPlayer = info.playerInfo;  // ← 不是 info 本身！
    
    console.log('新玩家加入:', newPlayer.id);
    const props = JSON.parse(newPlayer.customProperties || '{}');
    console.log('新玩家昵称:', props.nickname);
  }
});

// 4️⃣ 判断是否是自己
function isMyself(playerId) {
  return playerId === myPlayerId;  // myPlayerId 来自 connect() 返回值
}

// 5️⃣ 获取除自己外的其他玩家
function getOtherPlayers(roomInfo) {
  return roomInfo.players.filter(p => p.id !== myPlayerId);
}`,
        },
        {
          name: 'RoomInfo',
          method: 'RoomInfo 数据结构',
          description: `🔴 **核心数据结构**：房间信息对象，包含房间的完整信息。

---

## 📍 获取 RoomInfo 的方式

| 来源 | 获取路径 | 说明 |
|-----|---------|------|
| \`matchRoom()\` 返回值 | \`result.roomInfo\` | ⚠️ 注意有 roomInfo 包装层！ |
| \`createRoom()\` 返回值 | \`result.roomInfo\` | 创建房间时返回 |
| \`joinRoom()\` 返回值 | \`result.roomInfo\` | 加入房间时返回 |
| \`onRoomPropertiesChange\` 事件 | 事件参数中部分字段 | 房间属性变更时 |

---

## ⚠️ 常见错误

1. **matchRoom 返回值的包装层**：
   - ❌ 错误：\`result.players\` → undefined
   - ✅ 正确：\`result.roomInfo.players\`

2. **直接访问 result.id**：
   - ❌ 错误：\`result.id\` → undefined
   - ✅ 正确：\`result.roomInfo.id\`

3. **customProperties 是字符串**：
   - ❌ 错误：\`roomInfo.customProperties.map\`
   - ✅ 正确：\`JSON.parse(roomInfo.customProperties).map\`

---

## 📖 官方文档
https://developer.taptap.cn/docs/sdk/tap-battle/guide/`,
          parameters: {
            id: 'string - 房间ID（服务器分配）',
            name: 'string - 房间名称（创建时设置，可通过 updateRoomProperties 修改）',
            type: 'string - 房间类型（用于匹配分组，相同 type 的玩家会被匹配到一起）',
            maxPlayerCount: 'number - 房间最大人数（1-10）',
            ownerId:
              'string - 房主ID（房主离开后会自动转移给其他玩家，通过 onRoomPropertiesChange 事件通知）',
            players: 'PlayerInfo[] - 房间内玩家列表（包含所有当前在房间的玩家）',
            createTime: 'string - 创建时间（Unix时间戳，毫秒）',
            customProperties: 'string (可选) - 自定义房间属性（JSON字符串，最大2048字节）',
          },
          example: `// ========== RoomInfo 完整示例 ==========

// 1️⃣ 数据结构
{
  id: "25",                                    // 房间ID
  name: "测试房间",                            // 房间名称
  type: "game_mode_1",                         // 房间类型
  maxPlayerCount: 4,                           // 最大人数
  ownerId: "7xX2mTXjdxQ39bn/a+1tVQ==",        // 房主ID
  createTime: "1697875200000",                 // 创建时间戳
  customProperties: '{"map":"desert","mode":"battle"}',
  players: [
    { id: "player_001", status: 1, customProperties: '{"nickname":"玩家1","level":10}' },
    { id: "player_002", status: 1, customProperties: '{"nickname":"玩家2","level":8}' }
  ]
}

// 2️⃣ 从 matchRoom 正确获取 RoomInfo
const result = await tapOnlineBattle.matchRoom({
  data: {
    roomCfg: { maxPlayerCount: 4, type: 'default', matchParams: {} },
    playerCfg: { customProperties: JSON.stringify({ nickname: '我' }) }
  }
});

// 🔴 必须从 result.roomInfo 获取！
const roomInfo = result.roomInfo;  // ← 不是 result 本身！

console.log('房间ID:', roomInfo.id);
console.log('房主ID:', roomInfo.ownerId);
console.log('玩家数量:', roomInfo.players.length);
console.log('最大人数:', roomInfo.maxPlayerCount);

// 3️⃣ 解析房间自定义属性
const roomProps = JSON.parse(roomInfo.customProperties || '{}');
console.log('地图:', roomProps.map);
console.log('模式:', roomProps.mode);

// 4️⃣ 判断自己是否是房主
const isOwner = roomInfo.ownerId === myPlayerId;
console.log('我是房主:', isOwner);

// 5️⃣ 遍历房间内玩家
roomInfo.players.forEach(player => {
  const isMe = player.id === myPlayerId;
  const props = JSON.parse(player.customProperties || '{}');
  
  console.log(\`\${props.nickname || player.id.substring(0,6)} \${isMe ? '(我)' : ''}\`);
  
  if (!isMe) {
    // 初始化远程玩家
    createRemotePlayer(player.id, props);
  }
});

// 6️⃣ 监听房主变更（房主离开时）
tapOnlineBattle.registerListener({
  onRoomPropertiesChange: (info) => {
    if (info.ownerId && info.ownerId !== currentOwnerId) {
      console.log('房主已变更为:', info.ownerId);
      currentOwnerId = info.ownerId;
      
      // 检查自己是否成为新房主
      if (info.ownerId === myPlayerId) {
        console.log('我成为了新房主！');
      }
    }
  }
});`,
        },

        // ============ API 返回值结构 ============
        {
          name: 'ConnectResult',
          method: 'connect() 返回值',
          description: `connect() API 的返回值结构。

**使用方式**：
\`\`\`javascript
const result = await tapOnlineBattle.connect();
\`\`\``,
          parameters: {
            playerId: 'string - 当前玩家的唯一标识，后续所有操作都基于此ID',
            errMsg: 'string - 操作结果消息',
          },
          example: `// connect() 返回值示例
const result = await tapOnlineBattle.connect();
// result 结构：
{
  playerId: "player_abc123def456",
  errMsg: "connect:ok"
}

// 保存 playerId 供后续使用
const myPlayerId = result.playerId;
console.log('我的玩家ID:', myPlayerId);`,
        },
        {
          name: 'MatchRoomResult',
          method: 'matchRoom() 返回值',
          description: `matchRoom() API 的返回值结构。

**使用方式**：
\`\`\`javascript
const result = await tapOnlineBattle.matchRoom({ data: {...} });
\`\`\``,
          parameters: {
            roomInfo: 'RoomInfo - 完整的房间信息对象',
            errMsg: 'string - 操作结果消息',
          },
          example: `// matchRoom() 返回值示例
const result = await tapOnlineBattle.matchRoom({
  data: {
    roomCfg: { maxPlayerCount: 4, type: "game_mode_1", matchParams: {} }
  }
});

// result 结构：
{
  roomInfo: {
    id: "room_123456",
    name: "房间名",
    type: "game_mode_1",
    maxPlayerCount: 4,
    ownerId: "player_001",
    createTime: "1697875200000",
    customProperties: "{}",
    players: [
      { id: "player_001", status: 1, customProperties: '{}' },
      { id: "player_002", status: 1, customProperties: '{}' }
    ]
  },
  errMsg: "matchRoom:ok"
}

// 使用 roomInfo
const roomInfo = result.roomInfo;
console.log('房间ID:', roomInfo.id);
console.log('房间人数:', roomInfo.players.length);
console.log('房主:', roomInfo.ownerId);

// 初始化已有玩家
roomInfo.players.forEach(player => {
  if (player.id !== myPlayerId) {
    // 创建其他玩家的游戏对象
    createRemotePlayer(player);
  }
});`,
        },

        // ============ 事件回调参数结构 ============
        {
          name: 'OnDisconnectedInfo',
          method: 'onDisconnected 事件参数',
          description: `onDisconnected 事件的回调参数结构。

**触发时机**：与服务器连接断开时（网络问题、服务器主动断开等）`,
          parameters: {
            reason: 'string - 断开原因的文字描述',
            code: 'number - 错误代码',
          },
          example: `// onDisconnected 事件参数示例
tapOnlineBattle.registerListener({
  onDisconnected: (errorInfo) => {
    // errorInfo 结构：
    // {
    //   reason: "network error",
    //   code: 1001
    // }
    
    console.log('断开原因:', errorInfo.reason);
    console.log('错误代码:', errorInfo.code);
    
    // 显示断线提示并返回主菜单
    showDisconnectNotice(errorInfo.reason);
  }
});`,
        },
        {
          name: 'PlayerEnterRoomInfo',
          method: 'playerEnterRoom 事件参数',
          description: `playerEnterRoom 事件的回调参数结构。

**触发时机**：有新玩家加入房间时（房间内其他玩家收到）
**注意**：新加入的玩家自己通过 matchRoom 返回值获取房间信息，不会收到此事件`,
          parameters: {
            roomId: 'string - 房间ID',
            playerInfo: 'PlayerInfo - 新加入玩家的完整信息',
          },
          example: `// playerEnterRoom 事件参数示例
tapOnlineBattle.registerListener({
  playerEnterRoom: (info) => {
    // info 结构：
    // {
    //   roomId: "room_123456",
    //   playerInfo: {
    //     id: "player_new123",
    //     status: 1,
    //     customStatus: 0,
    //     customProperties: '{"nickname":"新玩家"}'
    //   }
    // }
    
    console.log('新玩家加入房间:', info.roomId);
    console.log('玩家ID:', info.playerInfo.id);
    
    // 解析玩家属性
    const props = JSON.parse(info.playerInfo.customProperties || '{}');
    console.log('玩家昵称:', props.nickname);
    
    // 创建新玩家的游戏对象
    createRemotePlayer(info.playerInfo);
  }
});`,
        },
        {
          name: 'PlayerLeaveRoomInfo',
          method: 'playerLeaveRoom 事件参数',
          description: `playerLeaveRoom 事件的回调参数结构。

**触发时机**：玩家主动离开房间时（房间内其他玩家收到）`,
          parameters: {
            roomId: 'string - 房间ID',
            'info.playerInfo.id': 'string - 离开的玩家ID',
            'info.playerInfo.customProperties': 'string (可选) - 玩家自定义属性（JSON字符串）',
          },
          example: `// playerLeaveRoom 事件参数示例
tapOnlineBattle.registerListener({
  playerLeaveRoom: (info) => {
    // info 结构：
    // {
    //   roomId: "room_123456",
    //   playerInfo: {
    //     id: "player_leaving",
    //     customProperties: '{"nickname":"玩家名"}'
    //   }
    // }

    console.log('玩家离开房间:', info.playerInfo.id);

    // 移除该玩家的游戏对象
    removeRemotePlayer(info.playerInfo.id);
  }
});`,
        },
        {
          name: 'PlayerOfflineInfo',
          method: 'playerOffline 事件参数',
          description: `playerOffline 事件的回调参数结构。

**触发时机**：玩家掉线时（非主动离开，如网络断开）`,
          parameters: {
            'info.playerInfo.id': 'string - 掉线的玩家ID',
            'info.playerInfo.customProperties': 'string (可选) - 玩家自定义属性（JSON字符串）',
          },
          example: `// playerOffline 事件参数示例
tapOnlineBattle.registerListener({
  playerOffline: (info) => {
    // info 结构：
    // {
    //   playerInfo: {
    //     id: "player_offline",
    //     customProperties: '{"nickname":"玩家名"}'
    //   }
    // }

    console.log('玩家掉线:', info.playerInfo.id);

    // 移除该玩家的游戏对象（SDK不支持重连）
    removeRemotePlayer(info.playerInfo.id);
  }
});`,
        },
        {
          name: 'OnCustomMessageInfo',
          method: 'onCustomMessage 事件参数',
          description: `onCustomMessage 事件的回调参数结构。

**触发时机**：收到其他玩家发送的自定义消息时
**注意**：发送者自己不会收到此事件`,
          parameters: {
            playerId: 'string - 消息发送者的玩家ID',
            message: 'string - 消息内容（通常是 JSON 字符串）',
            type: 'number - 消息类型：0=房间内所有玩家，1=队伍内玩家',
          },
          example: `// onCustomMessage 事件参数示例
tapOnlineBattle.registerListener({
  onCustomMessage: (info) => {
    // info 结构：
    // {
    //   playerId: "player_sender",
    //   message: '{"type":"move","x":100,"y":200}',
    //   type: 0
    // }
    
    console.log('收到消息，来自:', info.playerId);
    console.log('消息类型:', info.type);
    
    // 解析消息内容
    const msg = JSON.parse(info.message);
    console.log('消息数据:', msg);
    
    // 根据消息类型处理
    if (msg.type === 'move') {
      handlePlayerMove(info.playerId, msg.x, msg.y);
    }
  }
});`,
        },
        {
          name: 'OnPlayerCustomPropertiesChangeInfo',
          method: 'onPlayerCustomPropertiesChange 事件参数',
          description: `onPlayerCustomPropertiesChange 事件的回调参数结构。

**触发时机**：任何玩家调用 updatePlayerCustomProperties 时
**注意**：所有玩家都会收到此事件，包括调用者自己`,
          parameters: {
            playerId: 'string - 属性变更的玩家ID',
            properties: 'string | Object - 新的自定义属性（可能是字符串或已解析的对象）',
          },
          example: `// onPlayerCustomPropertiesChange 事件参数示例
tapOnlineBattle.registerListener({
  onPlayerCustomPropertiesChange: (info) => {
    // info 结构：
    // {
    //   playerId: "player_123",
    //   properties: '{"score":100,"level":5}' 或 {score:100,level:5}
    // }
    
    console.log('玩家属性变更:', info.playerId);
    
    // 兼容字符串和对象两种格式
    const props = typeof info.properties === 'string'
      ? JSON.parse(info.properties)
      : info.properties;
    
    console.log('新属性:', props);
    
    // 更新玩家显示
    updatePlayerDisplay(info.playerId, props);
  }
});`,
        },
        {
          name: 'OnRoomPropertiesChangeInfo',
          method: 'onRoomPropertiesChange 事件参数',
          description: `onRoomPropertiesChange 事件的回调参数结构。

**触发时机**：房主调用 updateRoomProperties 时
**注意**：所有玩家都会收到此事件，包括房主自己`,
          parameters: {
            properties: 'string | Object - 新的房间属性（可能是字符串或已解析的对象）',
            ownerId: 'string (可选) - 新房主ID（房主转移时会包含）',
          },
          example: `// onRoomPropertiesChange 事件参数示例
tapOnlineBattle.registerListener({
  onRoomPropertiesChange: (info) => {
    // info 结构（属性变更）：
    // {
    //   properties: '{"map":"level_2","mode":"team"}' 或 {map:"level_2",mode:"team"}
    // }
    
    // info 结构（房主转移时）：
    // {
    //   properties: '{}',
    //   ownerId: "new_owner_id"
    // }
    
    // 兼容字符串和对象两种格式
    const props = typeof info.properties === 'string'
      ? JSON.parse(info.properties)
      : info.properties;
    
    console.log('房间属性变更:', props);
    
    // 检查是否有房主变更
    if (info.ownerId) {
      console.log('新房主:', info.ownerId);
      updateRoomOwner(info.ownerId);
    }
    
    // 更新房间状态
    updateRoomState(props);
  }
});`,
        },
      ],
    },

    // ============ 通用流程模板（可扩展）============
    common_patterns: {
      title: '通用流程模板',
      description: `可组合的原子流程模板，用于构建各种联机功能。

💡 **扩展说明**：此分类设计为可扩展结构，后续可添加更多模板。
每个模板包含：使用场景、涉及API/事件、数据结构示例、代码模板。`,
      apis: [
        {
          name: '模板1：玩家状态同步（低频数据）',
          method: 'Pattern: Player State Sync',
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
            properties: 'string - JSON 格式的玩家属性数据',
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
// 🔴 注意：updatePlayerCustomProperties 与 sendCustomMessage、updateRoomProperties 共享 15次/秒 限制
function updatePlayerScore(newScore: number) {
  currentState.score = newScore;
  
  tapOnlineBattle.updatePlayerCustomProperties({  // 🔴 频率限制：共享 15次/秒
    properties: JSON.stringify(currentState)
  });
}

function updatePlayerHP(newHp: number) {
  currentState.hp = newHp;
  
  // 检查是否死亡
  if (newHp <= 0) {
    currentState.status = 'dead';
  }
  
  tapOnlineBattle.updatePlayerCustomProperties({  // 🔴 频率限制：共享 15次/秒
    properties: JSON.stringify(currentState)
  });
}

function setPlayerReady(isReady: boolean) {
  currentState.status = isReady ? 'ready' : 'waiting';
  
  tapOnlineBattle.updatePlayerCustomProperties({  // 🔴 频率限制：共享 15次/秒
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
});`,
        },
        {
          name: '模板2：玩家移动同步（高频数据的正确处理）',
          method: 'Pattern: Player Movement Sync',
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
            移动指令: 'sendCustomMessage - 告知移动目标',
            最终位置: 'updatePlayerCustomProperties - 确认到达',
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
// 🔴 注意：sendCustomMessage 与 updatePlayerCustomProperties、updateRoomProperties 共享 15次/秒 限制
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
  tapOnlineBattle.sendCustomMessage({  // 🔴 频率限制：共享 15次/秒
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
  tapOnlineBattle.updatePlayerCustomProperties({  // 🔴 频率限制：共享 15次/秒
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
}`,
        },
        {
          name: '模板3：自定义消息协议框架',
          method: 'Pattern: Custom Message Protocol',
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
            msg: 'string - JSON 格式的消息内容',
            type: 'number - 接收者类型：0=全房间，1=队伍',
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
});`,
        },
        {
          name: '模板4：玩家进出房间处理',
          method: 'Pattern: Player Room Events',
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
}`,
        },
        {
          name: '模板5：断线处理',
          method: 'Pattern: Disconnect Handling',
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
}`,
        },
      ],
    },

    // ============ API-事件关系表 ============
    api_event_relations: {
      title: 'API 与事件关系表',
      description: `API 调用与事件触发的对应关系，帮助理解不同客户端的处理逻辑差异。

**核心概念**：
- **调用方**：主动调用 API 的客户端
- **接收方**：收到事件通知的客户端
- **全员**：房间内所有玩家（包括调用方自己）`,
      apis: [
        {
          name: 'API-事件关系总表',
          method: 'API Event Relations Table',
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
// - 事件类数据（一次性、高频）→ sendCustomMessage`,
        },
      ],
    },

    // ============ 协议模板规范 ============
    protocol_template: {
      title: '通讯协议模板规范',
      description: `多人联机通讯协议的设计规范和模板，用于 AI 在用户项目中生成协议文档。

💡 **使用建议**：
- 简单游戏（1-3种交互）：可不生成协议文档，直接使用代码注释
- 复杂游戏（4种以上交互）：建议生成 \`docs/multiplayer-protocol.md\`
- 团队协作：强烈建议生成并维护协议文档`,
      apis: [
        {
          name: '协议文档模板',
          method: 'Protocol Document Template',
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
`,
        },
      ],
    },

    // ============ 扩展 API（中等优先级）============
    // 房间管理增强
    extended_room_management: {
      title: '扩展功能：房间管理增强',
      description: `🟡 **中等优先级 - 仅在用户明确需求时使用**

⚠️ **重要警告**：以下 API 不是必须的，只有在用户明确提出对应需求时才使用！严禁主动添加！

**使用场景**：
- 用户需要房间列表界面（显示所有可加入的房间）
- 用户需要创建自定义房间（如房间密码、私密房间）
- 用户需要通过房间 ID 邀请好友
- 用户需要房主踢人功能

**与核心 API 的区别**：
- 核心 API 的 matchRoom 适用于大部分场景（自动匹配）
- 这些扩展 API 适用于需要更多房间控制的场景

**包含 API**：
1. createRoom - 创建自定义房间
2. getRoomList - 获取房间列表
3. joinRoom - 加入指定房间
4. kickRoomPlayer - 踢出玩家`,
      apis: [
        {
          name: 'OnlineBattleManager.createRoom',
          method: 'tapOnlineBattle.createRoom(Object option)',
          description: `🚫 **仅在用户明确需要自定义创建房间时使用**

直接创建新房间，创建者自动成为房主。

**使用场景**：
- 用户需要自定义房间设置（如房间密码、私密房间）
- 用户需要创建房间后获取房间 ID 分享给好友
- 游戏需要"创建房间"按钮功能

**⚠️ 警告**：
- 如果只需要匹配游戏，应使用 matchRoom（核心 API）
- 不要在没有用户明确需求的情况下主动添加此功能
- 添加此功能会增加 UI 复杂度

**与 matchRoom 的区别**：
- matchRoom: 自动匹配或创建（推荐用于大部分场景）
- createRoom: 手动创建，获得房间控制权（用于特殊需求）

**支持 Promise 风格调用**`,
          parameters: {
            'option.data': 'Object (必填) - 创建房间请求数据',
            'option.data.roomCfg': 'Object (必填) - 房间配置',
            'option.data.roomCfg.maxPlayerCount': 'number (必填) - 房间最大人数',
            'option.data.roomCfg.type': 'string (必填) - 房间类型',
            'option.data.roomCfg.customProperties': 'string (可选) - 自定义房间属性，最大2048字节',
            'option.data.playerCfg': 'Object (可选) - 玩家配置',
            'option.data.playerCfg.customStatus': 'number (可选) - 自定义玩家状态',
            'option.data.playerCfg.customProperties': 'string (可选) - 自定义玩家属性',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<{ roomInfo: RoomInfo, errMsg: string }> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 示例：创建自定义房间
try {
  const res = await tapOnlineBattle.createRoom({
    data: {
      roomCfg: {
        maxPlayerCount: 4,
        type: "custom_room",
        customProperties: JSON.stringify({
          password: "1234",
          mode: "private"
        })
      },
      playerCfg: {
        customProperties: JSON.stringify({
          nickname: "房主"
        })
      }
    }
  });
  
  console.log('房间创建成功！');
  console.log('房间ID:', res.roomInfo.id);
  console.log('分享此 ID 给好友，好友使用 joinRoom 加入');
  
} catch (error) {
  console.error('创建房间失败:', error);
}`,
        },
        {
          name: 'OnlineBattleManager.getRoomList',
          method: 'tapOnlineBattle.getRoomList(Object option)',
          description: `🚫 **仅在用户明确需要房间列表界面时使用**

获取房间列表，查看当前可用的房间。

**使用场景**：
- 游戏需要显示房间列表界面
- 用户需要浏览可加入的房间
- 游戏需要显示房间详情（房间名、人数等）

**⚠️ 警告**：
- 如果只需要快速匹配，应使用 matchRoom（核心 API）
- 不要在没有用户明确需求的情况下主动添加房间列表功能
- 房间列表需要额外的 UI 开发工作

**典型流程**：
1. 调用 getRoomList 获取房间列表
2. 展示房间列表给用户选择
3. 用户选择房间后，调用 joinRoom 加入

**支持 Promise 风格调用**`,
          parameters: {
            'option.data': 'Object (可选) - 获取房间列表请求数据',
            'option.data.type': 'string (可选) - 房间类型过滤',
            'option.data.matchParams': 'Object (可选) - 匹配参数过滤',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue:
            'Promise<{ roomList: Array<RoomInfo>, errMsg: string }> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 示例：获取并显示房间列表
try {
  const res = await tapOnlineBattle.getRoomList({
    data: {
      type: "game_mode_1",  // 可选：过滤房间类型
      matchParams: {
        level: "1"           // 可选：过滤匹配参数
      }
    }
  });
  
  console.log('可用房间数量:', res.roomList.length);
  
  // 显示房间列表
  res.roomList.forEach(room => {
    console.log(\`房间: \${room.id}\`);
    console.log(\`  - 人数: \${room.players.length}/\${room.maxPlayerCount}\`);
    console.log(\`  - 名称: \${room.name || '未命名'}\`);
  });
  
} catch (error) {
  console.error('获取房间列表失败:', error);
}`,
        },
        {
          name: 'OnlineBattleManager.joinRoom',
          method: 'tapOnlineBattle.joinRoom(Object option)',
          description: `🚫 **仅在用户明确需要加入指定房间时使用**

加入指定房间，通过房间 ID 直接加入。

**使用场景**：
- 用户通过房间 ID 邀请好友
- 用户从房间列表中选择房间加入
- 游戏需要"输入房间 ID"功能

**⚠️ 警告**：
- 如果只需要快速匹配，应使用 matchRoom（核心 API）
- 不要在没有用户明确需求的情况下主动添加此功能
- 需要配合 createRoom 或 getRoomList 使用

**与 matchRoom 的区别**：
- matchRoom: 自动匹配（推荐用于大部分场景）
- joinRoom: 加入指定房间（用于邀请好友或从列表选择）

**支持 Promise 风格调用**`,
          parameters: {
            'option.data': 'Object (必填) - 加入房间请求数据',
            'option.data.roomId': 'string (必填) - 要加入的房间 ID',
            'option.data.playerCfg': 'Object (可选) - 玩家配置',
            'option.data.playerCfg.customStatus': 'number (可选) - 自定义玩家状态',
            'option.data.playerCfg.customProperties': 'string (可选) - 自定义玩家属性',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<{ roomInfo: RoomInfo, errMsg: string }> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 示例1：通过房间 ID 加入（好友邀请）
const roomId = "room_abc123";  // 从好友那里获得的房间 ID

try {
  const res = await tapOnlineBattle.joinRoom({
    data: {
      roomId: roomId,
      playerCfg: {
        customProperties: JSON.stringify({
          nickname: "玩家2"
        })
      }
    }
  });
  
  console.log('成功加入房间:', res.roomInfo.id);
  console.log('房间内玩家:', res.roomInfo.players);
  
} catch (error) {
  console.error('加入房间失败:', error);
  // 常见错误：房间已满、房间不存在、房间已开始游戏
}

// 示例2：从房间列表选择加入
// 先调用 getRoomList，然后用户选择一个房间
const selectedRoom = roomList[0];  // 用户选择的房间
await tapOnlineBattle.joinRoom({
  data: {
    roomId: selectedRoom.id
  }
});`,
        },
        {
          name: 'OnlineBattleManager.kickRoomPlayer',
          method: 'tapOnlineBattle.kickRoomPlayer(Object option)',
          description: `🚫 **仅在用户明确需要踢人功能时使用**

踢出房间内的玩家（仅房主可用）。

**使用场景**：
- 游戏需要房主踢人功能
- 需要移除不活跃或违规玩家
- 房间管理需求

**⚠️ 警告**：
- 只有房主可以调用此方法
- 不要在没有用户明确需求的情况下主动添加此功能
- 需要配合 UI 让房主选择要踢出的玩家
- 被踢玩家会触发 onPlayerKicked 事件

**权限要求**：
- 调用者必须是房主
- 不能踢出自己

**支持 Promise 风格调用**`,
          parameters: {
            'option.data': 'Object (必填) - 踢出玩家请求数据',
            'option.data.playerId': 'string (必填) - 要踢出的玩家 ID',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<{ errMsg: string }> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 示例：房主踢出玩家
try {
  await tapOnlineBattle.kickRoomPlayer({
    data: {
      playerId: "player_to_kick_id"
    }
  });
  
  console.log('成功踢出玩家');
  
} catch (error) {
  console.error('踢出玩家失败:', error);
  // 常见错误：不是房主、玩家不存在
}

// 配合 UI 使用示例
function showKickPlayerMenu(roomInfo) {
  // 检查是否是房主
  const isOwner = roomInfo.ownerId === myPlayerId;
  if (!isOwner) {
    console.log('只有房主可以踢人');
    return;
  }
  
  // 显示房间内其他玩家列表
  roomInfo.players.forEach(player => {
    if (player.id !== myPlayerId) {
      console.log(\`玩家: \${player.id}\`);
      // 显示"踢出"按钮
    }
  });
}`,
        },
      ],
    },

    // 连接控制
    extended_connection: {
      title: '扩展功能：连接控制',
      description: `🟡 **中等优先级 - 仅在用户明确需求时使用**

⚠️ **重要警告**：以下 API 不是必须的，只有在用户明确提出对应需求时才使用！

**使用场景**：
- 用户需要断开连接但不退出房间（如临时切换到后台）
- 游戏需要手动控制连接状态

**注意事项**：
- 大部分情况下不需要主动断开连接
- 退出房间时会自动断开连接
- 断开连接后需要重新 connect 才能使用联机功能`,
      apis: [
        {
          name: 'OnlineBattleManager.disconnect',
          method: 'tapOnlineBattle.disconnect(Object option)',
          description: `🚫 **仅在用户明确需要主动断开连接时使用**

主动断开与多人联机服务器的连接。

**使用场景**：
- 用户需要临时断开连接但不退出房间
- 游戏需要手动控制连接状态
- 节省网络资源（如游戏进入后台）

**⚠️ 警告**：
- 大部分情况下不需要主动断开连接
- 调用 leaveRoom 会自动断开连接
- 断开后需要重新调用 connect 才能使用联机功能
- 断开期间会触发 onDisconnected 事件

**与 leaveRoom 的区别**：
- leaveRoom: 退出房间并断开连接（推荐）
- disconnect: 仅断开连接，可能仍在房间中

**支持 Promise 风格调用**`,
          parameters: {
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<{ errMsg: string }> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 示例：主动断开连接
try {
  await tapOnlineBattle.disconnect();
  console.log('已断开连接');
  
  // 如果需要重新连接
  // await tapOnlineBattle.connect();
  
} catch (error) {
  console.error('断开连接失败:', error);
}

// 使用场景：游戏进入后台
window.addEventListener('blur', async () => {
  // 游戏失去焦点，断开连接节省资源
  await tapOnlineBattle.disconnect();
});

window.addEventListener('focus', async () => {
  // 游戏恢复焦点，重新连接
  await tapOnlineBattle.connect();
});`,
        },
      ],
    },

    // 玩家状态扩展
    extended_player_status: {
      title: '扩展功能：玩家状态扩展',
      description: `🟡 **中等优先级 - 仅在用户明确需求时使用**

⚠️ **重要警告**：以下 API 不是必须的，只有在用户明确提出对应需求时才使用！

**使用场景**：
- 用户需要额外的状态字段（与 customProperties 分离）
- 需要一个简单的数字状态标识（如 0=未准备，1=已准备）

**与 customProperties 的区别**：
- customProperties: 复杂对象数据（推荐用于大部分场景）
- customStatus: 简单数字状态（用于特殊需求）

**注意事项**：
- 大部分情况下使用 customProperties 即可
- customStatus 是一个简单的数字字段`,
      apis: [
        {
          name: 'OnlineBattleManager.updatePlayerCustomStatus',
          method: 'tapOnlineBattle.updatePlayerCustomStatus(Object option)',
          description: `🚫 **仅在用户明确需要额外状态字段时使用**

更新玩家自定义状态（数字类型）。

**使用场景**：
- 需要一个简单的数字状态标识
- 状态值含义由游戏自定义（如 0=未准备，1=已准备，2=游戏中）
- 需要与 customProperties 分离的状态字段

**⚠️ 警告**：
- 大部分情况下使用 updatePlayerCustomProperties 即可
- customStatus 只是一个数字，customProperties 可以存储复杂对象
- 不要在没有明确需求的情况下使用此 API

**与 updatePlayerCustomProperties 的区别**：
- updatePlayerCustomProperties: 存储复杂对象（推荐）
- updatePlayerCustomStatus: 仅存储一个数字（特殊需求）

**支持 Promise 风格调用**`,
          parameters: {
            'option.status': 'number (必填) - 自定义玩家状态值',
            'option.success': 'function (可选) - 成功回调',
            'option.fail': 'function (可选) - 失败回调',
          },
          returnValue: 'Promise<void> - 使用 Promise 风格时',
          example: `let tapOnlineBattle = tap.getOnlineBattleManager();

// 定义状态值含义
const PlayerStatus = {
  NOT_READY: 0,
  READY: 1,
  PLAYING: 2,
  FINISHED: 3
};

// 示例：更新玩家状态为已准备
try {
  await tapOnlineBattle.updatePlayerCustomStatus({
    status: PlayerStatus.READY
  });
  
  console.log('状态更新为：已准备');
  
} catch (error) {
  console.error('更新状态失败:', error);
}

// 接收状态变更
tapOnlineBattle.registerListener({
  onPlayerCustomStatusChange: (info) => {
    console.log(\`玩家 \${info.playerId} 状态变更为: \${info.status}\`);
    
    switch (info.status) {
      case PlayerStatus.READY:
        console.log('玩家已准备');
        break;
      case PlayerStatus.PLAYING:
        console.log('玩家游戏中');
        break;
    }
  }
});`,
        },
      ],
    },

    // 扩展事件
    extended_events: {
      title: '扩展功能：扩展事件监听',
      description: `🟡 **中等优先级 - 仅在用户明确需求时使用**

⚠️ **重要警告**：以下事件不是必须的，只有在用户明确提出对应需求时才使用！

**使用场景**：
- 需要详细的错误处理和日志
- 需要处理玩家被踢事件
- 需要监听 customStatus 变更（配合 updatePlayerCustomStatus 使用）

**注意事项**：
- 核心事件（7个）已经覆盖大部分需求
- 这些扩展事件用于特殊场景`,
      apis: [
        {
          name: 'onBattleServiceError',
          method: 'onBattleServiceError(errorInfo)',
          description: `🚫 **仅在用户明确需要详细错误处理时使用**

多人联机服务发生错误时触发。

**使用场景**：
- 需要详细的错误日志和监控
- 需要向用户显示具体错误信息
- 需要错误统计和分析

**⚠️ 警告**：
- 大部分错误可以通过 API 的 fail 回调处理
- 只在需要全局错误处理时使用此事件

**触发时机**：
- 服务器内部错误
- 网络连接问题
- 其他运行时错误`,
          parameters: {
            'errorInfo.errorMessage': 'string - 错误消息',
            'errorInfo.errorCode': 'number - 错误代码',
          },
          example: `tapOnlineBattle.registerListener({
  onBattleServiceError: (errorInfo) => {
    console.error('服务错误:', errorInfo.errorMessage);
    console.error('错误代码:', errorInfo.errorCode);
    
    // 可以根据错误代码进行特殊处理
    if (errorInfo.errorCode === 1001) {
      // 处理特定错误
      showErrorDialog('网络连接失败，请检查网络');
    }
    
    // 记录错误日志（用于监控和分析）
    logError({
      type: 'battle_service_error',
      code: errorInfo.errorCode,
      message: errorInfo.errorMessage,
      timestamp: Date.now()
    });
  }
});`,
        },
        {
          name: 'onPlayerKicked',
          method: 'onPlayerKicked(info)',
          description: `🚫 **仅在用户使用踢人功能时需要**

玩家被踢出房间时触发（被踢的玩家收到此事件）。

**使用场景**：
- 游戏有踢人功能（kickRoomPlayer）
- 需要向被踢玩家显示提示信息
- 需要处理被踢后的逻辑

**⚠️ 警告**：
- 只有在使用 kickRoomPlayer API 时才需要此事件
- 主动离开房间不会触发此事件（触发 playerLeaveRoom）

**触发时机**：
- 房主调用 kickRoomPlayer 踢出某玩家
- 被踢玩家会收到此事件`,
          parameters: {
            'info.playerId': 'string - 被踢的玩家 ID',
            'info.reason': 'string - 被踢原因',
          },
          example: `tapOnlineBattle.registerListener({
  onPlayerKicked: (info) => {
    console.log('玩家被踢出:', info.playerId);
    console.log('原因:', info.reason);
    
    // 如果是自己被踢出
    if (info.playerId === myPlayerId) {
      showDialog('您已被房主踢出房间');
      
      // 返回主菜单
      returnToMainMenu();
    } else {
      // 其他玩家被踢出
      console.log(\`玩家 \${info.playerId} 被踢出房间\`);
    }
  }
});`,
        },
        {
          name: 'onPlayerCustomStatusChange',
          method: 'onPlayerCustomStatusChange(info)',
          description: `🚫 **仅在使用 updatePlayerCustomStatus 时需要**

玩家自定义状态变更时触发。

**使用场景**：
- 使用了 updatePlayerCustomStatus API
- 需要监听其他玩家的状态变更
- 实现准备系统等功能

**⚠️ 警告**：
- 只有在使用 updatePlayerCustomStatus API 时才需要此事件
- 如果使用 customProperties，应监听 onPlayerCustomPropertiesChange

**触发时机**：
- 任何玩家调用 updatePlayerCustomStatus
- 所有房间内玩家都会收到此事件`,
          parameters: {
            'info.playerId': 'string - 玩家 ID',
            'info.status': 'number - 新的自定义状态值',
          },
          example: `tapOnlineBattle.registerListener({
  onPlayerCustomStatusChange: (info) => {
    console.log(\`玩家 \${info.playerId} 状态变更: \${info.status}\`);
    
    // 定义状态含义
    const PlayerStatus = {
      NOT_READY: 0,
      READY: 1,
      PLAYING: 2
    };
    
    // 根据状态更新 UI
    switch (info.status) {
      case PlayerStatus.NOT_READY:
        updatePlayerUI(info.playerId, '未准备');
        break;
      case PlayerStatus.READY:
        updatePlayerUI(info.playerId, '已准备');
        checkAllPlayersReady();  // 检查是否所有人都准备好
        break;
      case PlayerStatus.PLAYING:
        updatePlayerUI(info.playerId, '游戏中');
        break;
    }
  }
});

// 检查所有玩家是否准备好
function checkAllPlayersReady() {
  const allReady = roomPlayers.every(p => p.status === PlayerStatus.READY);
  if (allReady && isOwner) {
    showStartGameButton();  // 显示开始游戏按钮
  }
}`,
        },
      ],
    },

    // ============ 完整联机功能示例 ============
    complete_example: {
      title: '完整联机功能示例',
      description: `通用的多人联机管理器模板，可直接复制使用。

**说明**：
- 此示例只包含联机功能的标准实现
- 不包含任何游戏玩法逻辑
- 可直接复制使用，根据需要扩展
- 遵循正确的初始化顺序和事件处理模式

**使用方式**：
1. 复制 MultiplayerManager 类到项目中
2. 设置回调函数处理游戏逻辑
3. 调用 init() 初始化
4. 调用 matchRoom() 进入房间
5. 使用 sendData() 发送游戏数据`,
      apis: [
        {
          name: 'MultiplayerManager 通用模板',
          method: 'class MultiplayerManager',
          description: `一个通用的、可直接使用的多人联机管理器类。

**功能**：
- 封装所有核心 API 调用
- 管理连接状态和房间状态
- 提供简洁的回调接口
- 正确处理初始化顺序

**使用方式**：
\`\`\`javascript
const mp = new MultiplayerManager();
mp.onPlayerJoined = (playerInfo) => { /* 游戏逻辑 */ };
mp.onPlayerLeft = (playerId) => { /* 游戏逻辑 */ };
mp.onDataReceived = (data, fromId) => { /* 游戏逻辑 */ };
await mp.init();
await mp.matchRoom(4, 'game_mode');
\`\`\``,
          parameters: {},
          example: `// ========== MultiplayerManager - 多人联机管理器 ==========
//
// 🎯 核心概念：多人联机 = 数据通讯
//    玩家 A 操作 → sendData() → 其他玩家 onDataReceived → 看到效果
//
// 📖 使用方法：
//    1. 复制这个类到你的项目
//    2. 参考下方"使用说明"章节的示例代码
//    3. 详细流程：调用 get_multiplayer_guide 查看完整指引
//
// 🔄 生命周期：
//    1. 初始化：mp.init() → 返回 playerId
//    2. 进房间：mp.matchRoom() → 返回 roomInfo
//    3. 发送数据：mp.sendData() / mp.syncPosition()
//    4. 接收数据：mp.onDataReceived 回调触发
//    5. 离开房间：mp.leaveRoom()
//    ⚠️ 断线：onDisconnected 触发（SDK 不支持自动重连）
//
// 📡 核心方法：
//    📤 发送：sendData(data), syncPosition(x, y), sendEvent(type, data)
//    📥 接收：onDataReceived(data, fromId), onPlayerJoined(player), onPlayerLeft(id)
//
// 🔧 调试工具：
//    - DEBUG_MODE：控制是否显示弹窗（默认 false）
//    - DebugLogger：屏幕日志系统（调用 get_debug_logger 获取）
//    - getStats()：查看统计信息

// ========== 日志工具（兼容处理）==========
// ⚠️ 注意：本模板使用 Debug.log() 进行日志输出
// 两种使用方式：
// 1. 添加 DebugLogger：调用 get_debug_logger 工具获取屏幕日志组件
// 2. 不添加 DebugLogger：自动降级为 console.log()
const Debug = (typeof window !== 'undefined' && window.Debug) || {
  log: function(...args) {
    console.log('[MultiplayerManager]', ...args);
  }
};

/**
 * 多人联机错误码
 */
const ErrorCode = {
  ERROR_SUCCESS: 0,                                    // 成功
  ERROR_SYSTEM_ERROR: 1,                               // 系统错误
  ERROR_SDK_ERROR: 2,                                  // SDK错误
  ERROR_REQUEST_RATE_LIMIT_EXCEEDED: 3,                // 请求频率超限
  ERROR_MALICIOUS_USER: 4,                             // 恶意用户
  ERROR_TOO_MANY_CONNECTIONS: 5,                       // 连接数过多
  ERROR_NETWORK_ERROR: 6,                              // 网络错误
  ERROR_INVALID_REQUEST: 11,                           // 请求不合法
  ERROR_INVALID_AUTHORIZATION: 12,                     // 认证信息不合法
  ERROR_UNAUTHORIZED: 13,                              // 尚未完成登录认证
  ERROR_ALREADY_SIGNED_IN: 14,                         // 已经登录
  ERROR_PREVIOUS_REQUEST_IN_PROGRESS: 15,              // 上一个请求未完成
  ERROR_UNIMPLEMENTED: 16,                             // 功能未实现
  ERROR_FORBIDDEN: 17,                                 // 没有权限
  ERROR_ROOM_TEMPLATE_NOT_FOUND: 18,                   // 房间模板不存在
  ERROR_ROOM_COUNT_LIMIT_EXCEEDED: 19,                 // 房间数量超限
  ERROR_NOT_IN_ROOM: 20,                               // 尚未加入房间
  ERROR_ALREADY_IN_ROOM: 21,                           // 已在房间中
  ERROR_NOT_ROOM_OWNER: 22,                            // 不是房主
  ERROR_ROOM_FULL: 23,                                 // 房间已满
  ERROR_ROOM_NOT_EXIST: 24,                            // 房间不存在
  ERROR_BATTLE_NOT_STARTED: 25,                        // 对战未开始
  ERROR_BATTLE_ALREADY_STARTED: 26,                    // 对战已开始
  ERROR_PLAYER_NOT_FOUND: 30                           // 玩家不存在
};

class MultiplayerManager {
  constructor() {
    this.manager = null;
    this.myPlayerId = null;
    this.roomInfo = null;
    this.isOnline = false;
    this.isConnected = false;
    this.isInRoom = false;
    this.isHost = false;

    this.lastSyncTime = 0;
    this.SYNC_INTERVAL = 100;        // 100ms = 10次/秒
    this.MAX_MESSAGE_SIZE = 2048;    // 2048字节限制

    this.remotePlayers = new Map();

    // 消息类型
    this.MSG_TYPES = {
      POSITION: 'position',
      STATE: 'state',
      EVENT: 'event',
      SKILL: 'skill'
    };

    // 回调函数
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onDataReceived = null;
    this.onRoomJoined = null;
    this.onDisconnected = null;

    this.DEBUG_MODE = false;  // 关闭调试模式（减少弹窗干扰）
    
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      positionsSynced: 0,
      eventsReceived: 0
    };
    
    this.lastActivityTime = Date.now();
    this.connectionCheckInterval = null;
  }

  /**
   * 检查 TapTap SDK 可用性
   */
  checkTapSDK() {
    console.log('🔍 检查 TapTap SDK...');
    console.log('  - typeof tap:', typeof tap);
    
    if (typeof tap === 'undefined') {
      console.error('❌ tap 对象未定义！这是正常的（本地环境）');
      console.error('  - 原因: 游戏未在TapTap环境中运行');
      console.error('  - 解决: 将自动切换到单机模式');
      this.isOnline = false;
      return false;
    }
    
    console.log('  - tap对象存在:', tap);
    
    if (!tap.getOnlineBattleManager) {
      console.error('❌ tap.getOnlineBattleManager 方法不存在！');
      console.error('  - 可用方法:', Object.keys(tap));
      this.isOnline = false;
      return false;
    }
    
    console.log('✅ TapTap SDK 可用');
    this.isOnline = true;
    return true;
  }

  /**
   * 字段名兼容提取
   */
  extractPlayerId(info) {
    if (info.playerInfo) return info.playerInfo.id;
    return info.playerId || info.id || info.fromPlayerId;
  }

  extractMessage(info) {
    return info.msg || info.message || info.content;
  }

  /**
   * 错误格式化
   */
  formatError(error) {
    if (!error) return '未知错误';
    if (typeof error === 'string') return error;
    return error.message || error.errMsg || error.msg || String(error);
  }

  /**
   * 初始化并连接服务器
   */
  async init() {
    console.log('🚀 [多人联机] 开始初始化...');
    console.log('  - 当前环境:', window.location.href);
    console.log('  - User Agent:', navigator.userAgent);
    
    // 单机模式降级
    if (!this.checkTapSDK()) {
      console.warn('⚠️ 使用单机模式（SDK不可用）');
      console.warn('  - 这是正常的，本地测试时无SDK');
      console.warn('  - 在TapTap平台上会自动启用多人联机');
      this.myPlayerId = 'local-' + Date.now();
      return { 
        success: true, 
        offline: true, 
        playerId: this.myPlayerId,
        message: 'SDK不可用，使用单机模式'
      };
    }

    try {
      console.log('📡 获取OnlineBattleManager...');
      this.manager = tap.getOnlineBattleManager();
      console.log('  ✅ Manager获取成功');

      console.log('📝 注册事件监听器...');
      this._registerListeners();
      console.log('  ✅ 事件监听器注册完成');

      console.log('🔌 连接到TapTap服务器...');
      const res = await this.manager.connect();
      this.myPlayerId = res.playerId;
      this.isConnected = true;

      console.log('✅ [多人联机] 初始化完成！');
      console.log('  - 玩家ID:', this.myPlayerId);
      console.log('  - 连接状态:', this.isConnected);
      
      this._startKeepAlive();
      
      return { success: true, playerId: this.myPlayerId };
    } catch (error) {
      console.error('❌ [多人联机] 初始化失败!');
      console.error('  - 错误类型:', error.constructor.name);
      console.error('  - 错误信息:', this.formatError(error));
      console.error('  - 错误对象:', error);
      console.error('  - 错误堆栈:', error.stack);
      
      return { 
        success: false, 
        error: this.formatError(error),
        errorDetails: {
          type: error.constructor.name,
          message: error.message,
          stack: error.stack
        }
      };
    }
  }
  
  /**
   * 注册事件监听
   */
  _registerListeners() {
    this.manager.registerListener({
      onDisconnected: (errorInfo) => {
        console.error('🔴 [关键错误] 连接断开!!!', errorInfo);
        this.isConnected = false;
        this.isInRoom = false;
        
        if (this.onDisconnected) {
          this.onDisconnected(errorInfo.reason, errorInfo.code);
        }
      },
      
      playerEnterRoom: (info) => {
        const playerId = this.extractPlayerId(info);
        console.log('👤 [事件] 玩家加入房间:', playerId);

        this.remotePlayers.set(playerId, { id: playerId });

        if (this.onPlayerJoined) {
          this.onPlayerJoined(info.playerInfo || info);
        }
      },

      playerLeaveRoom: (info) => {
        const playerId = this.extractPlayerId(info);
        console.log('[多人联机] 玩家离开:', playerId);

        this.remotePlayers.delete(playerId);

        if (this.onPlayerLeft) {
          this.onPlayerLeft(playerId);
        }
      },

      playerOffline: (info) => {
        const playerId = this.extractPlayerId(info);
        console.log('[多人联机] 玩家掉线:', playerId);

        this.remotePlayers.delete(playerId);

        if (this.onPlayerLeft) {
          this.onPlayerLeft(playerId);
        }
      },

      onCustomMessage: (info) => {
        const fromId = this.extractPlayerId(info);
        const msgStr = this.extractMessage(info);
        
        this.stats.messagesReceived++;

        // 跳过自己的消息
        if (fromId === this.myPlayerId) {
          return;
        }

        try {
          const data = typeof msgStr === 'string' ? JSON.parse(msgStr) : msgStr;
          
          this.stats.eventsReceived++;
          
          // 添加日志
          if (data.type === 'position') {
            // 每100次接收输出一次日志
            if (this.stats.eventsReceived % 100 === 0) {
              Debug.log('📥 已接收 ' + this.stats.eventsReceived + ' 条消息');
            }
          } else {
            Debug.log('📥 接收: ' + data.type + ' from ' + fromId.substring(0, 8));
          }

          if (this.onDataReceived) {
            this.onDataReceived(data, fromId);
          }
        } catch (e) {
          console.error('❌ 消息解析失败:', e, msgStr);
          Debug.log('❌ 消息解析失败: ' + e.message, 'error');
        }
      }
    });
    
    console.log('[多人联机] 事件监听已注册');
  }
  
  /**
   * 匹配房间
   */
  async matchRoom(maxPlayers = 2, roomType = 'default', playerProps = {}) {
    console.log('🎮 [多人联机] 开始匹配房间...');
    console.log('  - 最大玩家数:', maxPlayers);
    console.log('  - 房间类型:', roomType);
    console.log('  - 玩家属性:', playerProps);
    
    // 单机模式降级
    if (!this.isOnline) {
      console.warn('⚠️ 单机模式，无法联机');
      this.isInRoom = true;
      if (this.onRoomJoined) {
        this.onRoomJoined({ players: [{ id: this.myPlayerId }] });
      }
      return { 
        success: true, 
        offline: true,
        message: '单机模式，无多人联机'
      };
    }

    try {
      const matchConfig = {
        data: {
          roomCfg: {
            maxPlayerCount: maxPlayers,
            type: roomType
          },
          playerCfg: {
            customProperties: JSON.stringify(playerProps)
          }
        }
      };
      
      console.log('  - 匹配配置:', JSON.stringify(matchConfig, null, 2));
      
      const res = await this.manager.matchRoom(matchConfig);
      
      console.log('  ✅ 匹配响应:', res);

      this.roomInfo = res.roomInfo;
      this.isInRoom = true;
      this.isHost = (this.roomInfo.ownerId === this.myPlayerId);

      console.log('🏠 [房间信息]');
      console.log('  - 房间ID:', this.roomInfo.id);
      console.log('  - 房主ID:', this.roomInfo.ownerId);
      console.log('  - 我是房主:', this.isHost);
      console.log('  - 当前玩家数:', this.roomInfo.players.length);
      console.log('  - 玩家列表:', this.roomInfo.players.map(p => p.id));

      // 初始化房间内已有的玩家
      let existingPlayersCount = 0;
      this.roomInfo.players.forEach(player => {
        if (player.id !== this.myPlayerId) {
          existingPlayersCount++;
          console.log('  👤 房间内已有玩家:', player.id);
          this.remotePlayers.set(player.id, { id: player.id });
          
          if (this.onPlayerJoined) {
            this.onPlayerJoined(player);
          }
        }
      });
      
      if (existingPlayersCount > 0) {
        console.log(\`  ✅ 加载了 \${existingPlayersCount} 个已有玩家\`);
      } else {
        console.log('  ℹ️ 房间内只有自己，等待其他玩家加入...');
      }

      if (this.onRoomJoined) {
        this.onRoomJoined(this.roomInfo);
      }

      return { success: true, roomInfo: this.roomInfo };
    } catch (error) {
      console.error('❌ [多人联机] 匹配失败!');
      console.error('  - 错误类型:', error.constructor.name);
      console.error('  - 错误信息:', this.formatError(error));
      console.error('  - 错误对象:', error);
      console.error('  - 错误堆栈:', error.stack);
      
      // 检查特定错误类型
      if (error.code) {
        console.error('  - 错误代码:', error.code);
        console.error('  - 错误代码说明:', this.getErrorCodeMessage(error.code));
      }
      
      return { 
        success: false, 
        error: this.formatError(error),
        errorCode: error.code,
        errorDetails: {
          type: error.constructor.name,
          message: error.message,
          code: error.code,
          stack: error.stack
        }
      };
    }
  }
  
  /**
   * 获取错误代码说明
   */
  getErrorCodeMessage(code) {
    const messages = {
      [ErrorCode.ERROR_SUCCESS]: '成功',
      [ErrorCode.ERROR_SYSTEM_ERROR]: '系统错误',
      [ErrorCode.ERROR_SDK_ERROR]: 'SDK错误',
      [ErrorCode.ERROR_REQUEST_RATE_LIMIT_EXCEEDED]: '请求频率超限',
      [ErrorCode.ERROR_MALICIOUS_USER]: '恶意用户',
      [ErrorCode.ERROR_TOO_MANY_CONNECTIONS]: '连接数过多',
      [ErrorCode.ERROR_NETWORK_ERROR]: '网络错误',
      [ErrorCode.ERROR_INVALID_REQUEST]: '请求不合法',
      [ErrorCode.ERROR_INVALID_AUTHORIZATION]: '认证信息不合法',
      [ErrorCode.ERROR_UNAUTHORIZED]: '尚未完成登录认证',
      [ErrorCode.ERROR_ALREADY_SIGNED_IN]: '已经登录',
      [ErrorCode.ERROR_PREVIOUS_REQUEST_IN_PROGRESS]: '上一个请求未完成',
      [ErrorCode.ERROR_UNIMPLEMENTED]: '功能未实现',
      [ErrorCode.ERROR_FORBIDDEN]: '没有权限',
      [ErrorCode.ERROR_ROOM_TEMPLATE_NOT_FOUND]: '房间模板不存在',
      [ErrorCode.ERROR_ROOM_COUNT_LIMIT_EXCEEDED]: '房间数量超限',
      [ErrorCode.ERROR_NOT_IN_ROOM]: '尚未加入房间',
      [ErrorCode.ERROR_ALREADY_IN_ROOM]: '已在房间中',
      [ErrorCode.ERROR_NOT_ROOM_OWNER]: '不是房主',
      [ErrorCode.ERROR_ROOM_FULL]: '房间已满',
      [ErrorCode.ERROR_ROOM_NOT_EXIST]: '房间不存在',
      [ErrorCode.ERROR_BATTLE_NOT_STARTED]: '对战未开始',
      [ErrorCode.ERROR_BATTLE_ALREADY_STARTED]: '对战已开始',
      [ErrorCode.ERROR_PLAYER_NOT_FOUND]: '玩家不存在'
    };
    return messages[code] || \`未知错误代码: \${code}\`;
  }
  
  /**
   * 发送数据给其他玩家
   */
  sendData(data) {
    if (!this.isInRoom) {
      Debug.log('⚠️ 未在房间中，无法发送数据', 'warn');
      return false;
    }

    // 单机模式跳过
    if (!this.isOnline) {
      return true;
    }

    try {
      const jsonString = JSON.stringify(data);
      const byteSize = new Blob([jsonString]).size;
      
      if (byteSize > this.MAX_MESSAGE_SIZE) {
        console.error('❌ 数据包过大！', byteSize, '字节');
        Debug.log('❌ 数据包过大: ' + byteSize + '字节', 'error');
        return false;
      }

      this.stats.messagesSent++;
      this.lastActivityTime = Date.now();
      
      // 发送消息
      this.manager.sendCustomMessage({
        data: { msg: jsonString, type: 0 }
      });
      
      // 只在发送事件时输出日志（避免位置同步日志过多）
      if (data.type === 'event') {
        Debug.log('📤 发送事件: ' + data.eventType);
      }
      
      return true;
    } catch (error) {
      console.error('❌ 发送消息失败:', error);
      Debug.log('❌ 发送消息失败: ' + error.message, 'error');
      return false;
    }
  }
  
  /**
   * 同步位置（自动限频）
   */
  syncPosition(x, y, radius) {
    if (!this.isInRoom) return;

    const now = Date.now();
    if (now - this.lastSyncTime < this.SYNC_INTERVAL) return;

    this.stats.positionsSynced++;
    this.lastSyncTime = now;

    const success = this.sendData({ type: 'position', x, y, radius });
    
    // 每100次同步输出一次日志（避免刷屏）
    if (this.stats.positionsSynced % 100 === 0) {
      Debug.log('📍 已同步位置 ' + this.stats.positionsSynced + ' 次');
    }
    
    return success;
  }
  
  /**
   * 发送游戏事件
   */
  sendEvent(eventType, eventData) {
    this.sendData({
      type: this.MSG_TYPES.EVENT,
      eventType,
      ...eventData
    });
  }

  /**
   * 离开房间
   */
  async leaveRoom() {
    if (!this.isInRoom) return;

    console.log('👋 [多人联机] 离开房间...');
    
    this._stopKeepAlive();

    if (this.isOnline && this.manager) {
      try {
        await this.manager.leaveRoom();
      } catch (error) {
        console.error('  ❌ 离开房间失败:', error);
      }
    }

    this.roomInfo = null;
    this.isInRoom = false;
    this.remotePlayers.clear();
  }

  /**
   * 启动连接保活
   */
  _startKeepAlive() {
    this.lastActivityTime = Date.now();
    
    this.connectionCheckInterval = setInterval(() => {
      if (!this.isConnected && this.isOnline) {
        console.warn('⚠️ 检测到连接断开');
      }
    }, 30000);
  }
  
  /**
   * 停止保活
   */
  _stopKeepAlive() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  isOwner() {
    return this.isHost;
  }

  getRemotePlayerIds() {
    return Array.from(this.remotePlayers.keys());
  }
}

// ========== 使用说明 ==========
//
// 📖 以下示例展示如何在游戏中使用 MultiplayerManager
// 📖 完整指引：调用 get_multiplayer_guide 查看详细流程

// ========== 第一部分：基础使用 ==========

// 步骤 1：创建实例
const mp = new MultiplayerManager();

// 步骤 2：设置回调（重要！）
mp.onPlayerJoined = (player) => {
  console.log('👤 新玩家加入:', player.id);
  // TODO: 创建远程玩家对象
  const remotePlayer = createRemotePlayer(player.id);
  remotePlayers.set(player.id, remotePlayer);
};

mp.onPlayerLeft = (playerId) => {
  console.log('👋 玩家离开:', playerId);
  // TODO: 移除玩家对象
  remotePlayers.delete(playerId);
};

mp.onDataReceived = (data, fromId) => {
  console.log('📥 收到数据:', data.type);

  // TODO: 处理数据
  if (data.type === 'position') {
    const player = remotePlayers.get(fromId);
    if (player) {
      player.x = data.x;
      player.y = data.y;
    }
  } else if (data.type === 'event') {
    handleGameEvent(data, fromId);
  }
};

mp.onDisconnected = (reason, code) => {
  console.error('连接断开:', reason, code);

  // ⚠️ 注意：TapTap SDK 不支持自动重连
  // 需要用户手动重新进入游戏（重新调用 init + matchRoom）

  // TODO: 你的游戏逻辑
  // - 清理游戏状态（远程玩家等）
  // - 显示断线提示
  // - 引导用户重新开始游戏
};

// 步骤 3：初始化
async function startMultiplayer() {
  const result = await mp.init();
  if (!result.success) {
    console.error('初始化失败:', result.error);
    return false;
  }

  console.log('初始化成功，玩家 ID:', result.playerId);
  return true;
}

// 步骤 4：匹配房间
async function joinGame() {
  const result = await mp.matchRoom(2, 'my_game', {
    nickname: '玩家A'
  });

  if (!result.success) {
    console.error('匹配失败:', result.error);
    return false;
  }

  console.log('进入房间，玩家数:', result.roomInfo.players.length);
  return true;
}

// 步骤 5：在游戏循环中同步
function gameLoop() {
  localPlayer.update();

  // 同步位置（内置频率限制，可以每帧调用）
  mp.syncPosition(localPlayer.x, localPlayer.y, localPlayer.radius);

  render();
  requestAnimationFrame(gameLoop);
}

// ========== 第二部分：完整游戏集成 ==========

class Game {
  constructor() {
    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.multiplayer = new MultiplayerManager();

    this.setupMultiplayer();
  }

  setupMultiplayer() {
    // 玩家加入
    this.multiplayer.onPlayerJoined = (playerInfo) => {
      Debug.log('👤 新玩家加入: ' + playerInfo.id);

      // 创建远程玩家对象
      const remotePlayer = new Player(playerInfo.id, false);
      this.remotePlayers.set(playerInfo.id, remotePlayer);

      // 可选：根据游戏需要，决定是否立即发送数据
      // 例如：某些游戏需要新玩家立即看到当前状态
      // if (needImmediateSync) {
      //   this.multiplayer.sendData({ type: 'state', ... });
      // }
    };

    // 玩家离开
    this.multiplayer.onPlayerLeft = (playerId) => {
      Debug.log('👋 玩家离开: ' + playerId);
      this.remotePlayers.delete(playerId);
    };

    // 接收数据
    this.multiplayer.onDataReceived = (data, fromId) => {
      const remotePlayer = this.remotePlayers.get(fromId);
      if (!remotePlayer) {
        console.warn('远程玩家对象不存在:', fromId);
        return;
      }

      if (data.type === 'position') {
        remotePlayer.updatePosition(data.x, data.y, data.radius);
      } else if (data.type === 'event') {
        this.handleGameEvent(data, remotePlayer);
      }
    };

    // 连接断开
    this.multiplayer.onDisconnected = (reason, code) => {
      Debug.log('连接断开: ' + reason, 'error');

      // ⚠️ SDK 不支持自动重连，需要用户重新进入游戏
      // 清理游戏状态
      this.remotePlayers.clear();

      // 显示提示（你的游戏逻辑）
      this.showDisconnectedMessage();
    };
  }

  async start() {
    // 初始化多人联机
    const initResult = await this.multiplayer.init();
    if (initResult.success) {
      await this.multiplayer.matchRoom(20, 'my_game');
    }

    // 创建本地玩家
    this.localPlayer = new Player('local', true);

    // 启动游戏循环
    this.gameLoop();
  }

  gameLoop() {
    // 更新本地玩家
    this.localPlayer.update();

    // 更新远程玩家
    this.remotePlayers.forEach(p => p.update());

    // 同步位置
    this.multiplayer.syncPosition(
      this.localPlayer.x,
      this.localPlayer.y,
      this.localPlayer.radius
    );

    // 渲染
    this.render();

    requestAnimationFrame(() => this.gameLoop());
  }

  handleGameEvent(data, remotePlayer) {
    if (data.eventType === 'skill') {
      remotePlayer.castSkill(data.skillId);
    }
  }

  render() {
    // 渲染本地玩家
    this.localPlayer.render();

    // 渲染远程玩家
    this.remotePlayers.forEach(p => p.render());
  }

  showDisconnectedMessage() {
    // 显示断线提示（你的游戏逻辑）
    Debug.log('⚠️ 连接已断开，请重新进入游戏', 'error');
  }
}

class Player {
  constructor(id, isLocal) {
    this.id = id;
    this.isLocal = isLocal;
    this.x = Math.random() * 800;
    this.y = Math.random() * 600;
    this.radius = 20;

    // 远程玩家的目标位置（用于插值）
    if (!isLocal) {
      this.targetX = this.x;
      this.targetY = this.y;
    }
  }

  update() {
    if (this.isLocal) {
      // 本地玩家：处理输入
      this.handleInput();
    } else {
      // 远程玩家：插值到目标位置
      this.x += (this.targetX - this.x) * 0.2;
      this.y += (this.targetY - this.y) * 0.2;
    }
  }

  updatePosition(x, y, radius) {
    this.targetX = x;
    this.targetY = y;

    // 可选：距离太远时直接跳跃（避免插值太慢）
    const distance = Math.sqrt((x - this.x) ** 2 + (y - this.y) ** 2);
    if (distance > 500) {
      this.x = x;
      this.y = y;
    }
  }

  handleInput() {
    // 处理输入（你的游戏逻辑）
  }

  render() {
    // 渲染（你的游戏逻辑）
  }
}

// ========== 第三部分：4 种操作场景 ==========

// 场景 1：摇杆控制（持续移动）
class JoystickControl {
  update() {
    // 根据摇杆输入更新位置
    this.player.x += joystick.dx * speed;
    this.player.y += joystick.dy * speed;

    // 同步位置（内置频率限制，可以每帧调用）
    this.multiplayer.syncPosition(this.player.x, this.player.y);
  }
}

// 场景 2：点击移动（目标点）
class ClickToMove {
  onCanvasClick(targetX, targetY) {
    // 设置本地玩家的移动目标
    this.player.setMoveTarget(targetX, targetY);

    // 发送移动目标（一次性）
    this.multiplayer.sendData({
      type: 'move_target',
      targetX,
      targetY
    });
  }

  onDataReceived(data, fromId) {
    if (data.type === 'move_target') {
      const remotePlayer = this.remotePlayers.get(fromId);
      remotePlayer.setMoveTarget(data.targetX, data.targetY);
    }
  }
}

// 场景 3：技能释放
class SkillSystem {
  castSkill(skillId, targetX, targetY) {
    // 本地立即执行技能效果
    this.player.castSkill(skillId, targetX, targetY);

    // 发送技能事件给其他玩家
    this.multiplayer.sendEvent('skill_cast', {
      skillId,
      targetX,
      targetY
    });
  }

  onDataReceived(data, fromId) {
    if (data.type === 'event' && data.eventType === 'skill_cast') {
      const remotePlayer = this.remotePlayers.get(fromId);
      remotePlayer.castSkill(data.skillId, data.targetX, data.targetY);
    }
  }
}

// 场景 4：调试模式
// 使用 DebugLogger 查看日志（调用 get_debug_logger 获取）
Debug.log('游戏开始');
Debug.log('玩家位置: (' + player.x + ', ' + player.y + ')');
Debug.log('发送数据: ' + JSON.stringify(data));`,
        },
        {
          name: 'MultiplayerManager 使用示例',
          method: 'Usage Example',
          description: `展示如何在实际项目中使用 MultiplayerManager。`,
          parameters: {},
          example: `// ========== 完整使用示例 ==========

// 1. 创建管理器
const multiplayer = new MultiplayerManager();
const remotePlayers = {};  // playerId → 玩家游戏对象

// 2. 设置回调
multiplayer.onPlayerJoined = (playerInfo) => {
  const playerId = playerInfo.id;
  console.log('新玩家加入:', playerId);

  // 创建远程玩家对象（游戏逻辑）
  remotePlayers[playerId] = createPlayer(playerId);
};

multiplayer.onPlayerLeft = (playerId) => {
  console.log('玩家离开:', playerId);

  // 移除玩家对象（游戏逻辑）
  if (remotePlayers[playerId]) {
    remotePlayers[playerId].destroy();
    delete remotePlayers[playerId];
  }
};

multiplayer.onDataReceived = (data, fromPlayerId) => {
  // 根据消息类型处理
  if (data.type === multiplayer.MSG_TYPES.POSITION) {
    // 更新远程玩家位置
    if (remotePlayers[fromPlayerId]) {
      remotePlayers[fromPlayerId].x = data.x;
      remotePlayers[fromPlayerId].y = data.y;
    }
  } else if (data.type === multiplayer.MSG_TYPES.EVENT) {
    // 处理游戏事件
    handleGameEvent(fromPlayerId, data.eventType, data);
  }
};

// 3. 初始化并进入房间
async function startGame() {
  const result = await multiplayer.init();
  if (!result.success) {
    console.error('初始化失败');
    return;
  }

  await multiplayer.matchRoom(2, 'pvp', { nickname: '玩家' });
  console.log('准备完成，开始游戏');
}

// 4. 游戏循环中同步位置（自动节流 + 变化检测）
function gameLoop() {
  player.update();

  // ✅ 可以在每帧调用，内部会自动控制频率
  multiplayer.syncPosition(player.x, player.y);

  // 渲染...
  requestAnimationFrame(gameLoop);
}

// 5. 发送游戏事件（攻击、道具等）
player.onAttack = (targetId) => {
  multiplayer.sendEvent('attack', { targetId });
};

player.onPickupItem = (itemId) => {
  multiplayer.sendEvent('pickup', { itemId });
};

// 6. 如果是房主，生成游戏对象（房主权威）
function spawnEnemy() {
  if (multiplayer.isOwner()) {
    const enemy = createEnemy();
    multiplayer.sendEvent('enemy_spawn', { id: enemy.id, x: enemy.x, y: enemy.y });
  }
}

// 7. 游戏结束
async function endGame() {
  await multiplayer.leaveRoom();
}`,
        },
      ],
    },

    // ============ 玩家 ID 完整指南 ============
    player_id_guide: {
      title: '玩家 ID 完整指南',
      description: `🔑 **playerId 是多人联机的核心概念**

在多人联机游戏中，playerId 是区分不同玩家的唯一标识符。正确理解和使用 playerId 是实现多人联机的关键。

**核心问题**：
- 如何获取自己的 playerId？
- 如何判断"这是不是我自己"？
- 不同 API/事件中 playerId 的字段名为什么不一样？

**playerId 获取时机表**：
| 阶段 | API/事件 | 字段路径 | 说明 |
|------|---------|---------|------|
| 连接 | connect() | result.playerId | 获取本地玩家ID（必须保存！）|
| 匹配房间 | matchRoom() | result.roomInfo.players[].id | 房间内所有玩家ID |
| 新玩家加入 | playerEnterRoom | info.playerInfo.id | 新玩家ID |
| 玩家离开 | playerLeaveRoom | info.playerId | 离开的玩家ID |
| 收到消息 | onCustomMessage | info.fromPlayerId | 发送者ID |`,
      apis: [
        {
          name: '1. 获取本地玩家 ID',
          method: 'Getting Local Player ID',
          description: `**connect() 是获取本地玩家 ID 的唯一途径**

connect() 返回的 playerId 是当前客户端玩家的唯一标识，必须保存供后续使用。`,
          parameters: {},
          example: `// ========== 获取本地玩家 ID ==========

class MultiplayerGame {
  constructor() {
    this.myPlayerId = null;  // 🔴 必须在类级别声明并保存
  }
  
  async init() {
    const manager = tap.getOnlineBattleManager();
    
    // 1. 连接服务器获取 playerId
    const res = await manager.connect();
    
    // 🔴 关键：保存 playerId
    this.myPlayerId = res.playerId;
    
    console.log('我的玩家ID:', this.myPlayerId);
    // 输出示例: 我的玩家ID: 7xX2mTXjdxQ39bn/a+1tVQ==
  }
  
  // 提供获取方法
  getMyPlayerId() {
    return this.myPlayerId;
  }
}

// ❌ 常见错误：没有保存 playerId
// await manager.connect();  // 返回值被丢弃，无法获取 playerId！

// ✅ 正确做法：保存返回值
// const res = await manager.connect();
// this.myPlayerId = res.playerId;`,
        },
        {
          name: '2. 判断是否是自己',
          method: "Checking If It's Me",
          description: `**在多个场景中需要判断"这是不是我自己"**

使用严格相等比较 playerId 来判断身份。`,
          parameters: {},
          example: `// ========== 判断是否是自己 ==========

// 场景1：匹配房间后，遍历房间内玩家
const result = await manager.matchRoom({...});
const roomInfo = result.roomInfo;

roomInfo.players.forEach(player => {
  // 🔴 使用严格相等判断
  const isMe = (player.id === this.myPlayerId);
  
  if (isMe) {
    console.log('这是我自己，跳过创建');
  } else {
    console.log('这是其他玩家，创建游戏对象');
    this.createRemotePlayer(player.id);
  }
});

// 场景2：收到消息时，跳过自己发送的
manager.registerListener({
  onCustomMessage: (info) => {
    const fromId = info.fromPlayerId || info.playerId;
    
    // 🔴 跳过自己的消息（理论上不会收到，但防御性检查）
    if (fromId === this.myPlayerId) {
      return;
    }
    
    // 处理其他玩家的消息
    this.handleMessage(fromId, info.msg);
  }
});

// 场景3：玩家属性变更时，区分自己和他人
manager.registerListener({
  onPlayerCustomPropertiesChange: (info) => {
    const isMe = (info.playerId === this.myPlayerId);
    
    if (isMe) {
      // 自己的属性变更（用于确认同步成功）
      console.log('我的属性已同步');
    } else {
      // 其他玩家的属性变更
      this.updateRemotePlayer(info.playerId, info.properties);
    }
  }
});`,
        },
        {
          name: '3. 字段名兼容处理',
          method: 'Field Name Compatibility',
          description: `**不同 API/事件中 playerId 的字段名可能不同**

建议使用工具函数兼容多种字段名。`,
          parameters: {},
          example: `// ========== 字段名兼容工具函数 ==========

/**
 * 从回调参数中提取玩家ID（兼容多种字段名）
 */
function extractPlayerId(data) {
  // 1. 如果有 playerInfo 包装层
  const playerInfo = data.playerInfo || data;
  
  // 2. 尝试多种可能的字段名
  return playerInfo.id || 
         playerInfo.playerId || 
         playerInfo.userId ||
         data.fromPlayerId ||
         data.fromUserId;
}

/**
 * 从消息回调中提取发送者ID
 */
function extractSenderId(info) {
  return info.fromPlayerId || 
         info.fromUserId || 
         info.playerId ||
         info.senderId;
}

/**
 * 从消息回调中提取消息内容
 */
function extractMessage(info) {
  const msgStr = info.msg || info.message || info.content;
  return typeof msgStr === 'string' ? JSON.parse(msgStr) : msgStr;
}

// 使用示例
manager.registerListener({
  playerEnterRoom: (info) => {
    // 使用工具函数，不用担心字段名问题
    const playerId = extractPlayerId(info);
    console.log('新玩家:', playerId);
  },
  
  onCustomMessage: (info) => {
    const fromId = extractSenderId(info);
    const data = extractMessage(info);
    
    if (fromId === this.myPlayerId) return;
    
    this.handleMessage(fromId, data);
  }
});`,
        },
        {
          name: '4. 常见错误和调试',
          method: 'Common Errors and Debugging',
          description: `**playerId 相关的常见错误及调试方法**`,
          parameters: {},
          example: `// ========== 常见错误 ==========

// ❌ 错误1：直接访问 info.id（没有考虑包装层）
playerEnterRoom: (info) => {
  const playerId = info.id;  // undefined!
}
// ✅ 正确：info.playerInfo.id

// ❌ 错误2：在 matchRoom 后直接访问 players
const result = await manager.matchRoom({...});
const players = result.players;  // undefined!
// ✅ 正确：result.roomInfo.players

// ❌ 错误3：字符串比较问题
if (playerId == myPlayerId)  // 可能有类型问题
// ✅ 正确：使用严格相等
if (playerId === myPlayerId)

// ========== 调试技巧 ==========

// 1. 打印完整的回调参数
playerEnterRoom: (info) => {
  console.log('完整参数:', JSON.stringify(info, null, 2));
  // 查看实际的数据结构
}

// 2. 打印 ID 对比信息
function debugPlayerId(playerId, label = '') {
  console.log(\`[\${label}] playerId: "\${playerId}"\`);
  console.log(\`[\${label}] myPlayerId: "\${this.myPlayerId}"\`);
  console.log(\`[\${label}] 类型: \${typeof playerId} vs \${typeof this.myPlayerId}\`);
  console.log(\`[\${label}] 相等: \${playerId === this.myPlayerId}\`);
}

// 3. 验证所有玩家对象
function debugAllPlayers() {
  console.log('=== 当前所有玩家 ===');
  this.players.forEach((player, id) => {
    const isMe = (id === this.myPlayerId);
    console.log(\`  \${id.substring(0, 8)}...: \${isMe ? '(本地)' : '(远程)'}\`);
  });
}`,
        },
      ],
    },

    // ============ 摇杆同步策略 ============
    joystick_sync_pattern: {
      title: '摇杆同步策略',
      description: `🎮 **摇杆操作游戏的网络同步最佳实践**

摇杆控制的游戏（如射击、跑酷、动作游戏）在网络同步方面有特殊挑战：
- 摇杆是持续输入，没有明确的"目标点"
- 位置每帧都在变化，不能每帧都发送
- 需要在实时性和带宽消耗之间平衡

**核心原则**：
- ❌ 不要每帧都同步位置（会严重超过 15次/秒 限制）
- ✅ 使用定时同步 + 位置变化检测
- ✅ 推荐 100-200ms 间隔（每秒 5-10 次）`,
      apis: [
        {
          name: '策略1：定时同步 + 变化检测',
          method: 'Timer + Change Detection',
          description: `**最推荐的方案**

只在位置真正变化时同步，并且限制同步频率。

**优点**：
- 静止时不发送消息（节省带宽）
- 移动时适度发送（每秒 5-10 次）
- 简单易实现`,
          parameters: {},
          example: `// ========== 定时同步 + 变化检测 ==========

class PositionSync {
  constructor(manager, localPlayer) {
    this.manager = manager;
    this.localPlayer = localPlayer;
    
    // 同步配置
    this.SYNC_INTERVAL = 100;  // 100ms = 每秒最多10次
    this.POSITION_THRESHOLD = 0.5;  // 位置变化阈值
    
    // 状态记录
    this.lastSyncTime = 0;
    this.lastSyncX = 0;
    this.lastSyncY = 0;
    this.lastSyncDir = 0;
  }
  
  /**
   * 在游戏主循环中调用
   * 只在位置真正变化且满足时间间隔时才同步
   */
  update() {
    const now = Date.now();
    
    // 检查时间间隔
    if (now - this.lastSyncTime < this.SYNC_INTERVAL) {
      return;  // 未到同步时间
    }
    
    // 检查位置是否变化
    const dx = Math.abs(this.localPlayer.x - this.lastSyncX);
    const dy = Math.abs(this.localPlayer.y - this.lastSyncY);
    const posChanged = dx > this.POSITION_THRESHOLD || 
                       dy > this.POSITION_THRESHOLD;
    
    // 检查方向是否变化
    const dirChanged = this.localPlayer.direction !== this.lastSyncDir;
    
    // 只在有变化时同步
    if (posChanged || dirChanged) {
      this.syncPosition();
      this.lastSyncTime = now;
    }
  }
  
  syncPosition() {
    // 记录当前状态
    this.lastSyncX = this.localPlayer.x;
    this.lastSyncY = this.localPlayer.y;
    this.lastSyncDir = this.localPlayer.direction;
    
    // 发送位置数据
    this.manager.sendCustomMessage({
      data: {
        msg: JSON.stringify({
          type: 'move',
          x: this.localPlayer.x,
          y: this.localPlayer.y,
          direction: this.localPlayer.direction,
          timestamp: Date.now()
        }),
        type: 0
      }
    });
  }
}

// 使用方式
const positionSync = new PositionSync(manager, localPlayer);

function gameLoop() {
  // 1. 处理摇杆输入
  handleJoystickInput();
  
  // 2. 更新本地玩家位置
  localPlayer.update();
  
  // 3. 检查并同步位置（自动处理频率控制）
  positionSync.update();
  
  // 4. 渲染
  render();
  
  requestAnimationFrame(gameLoop);
}`,
        },
        {
          name: '策略2：客户端预测与插值',
          method: 'Client Prediction and Interpolation',
          description: `**进阶方案：让远程玩家移动更流畅**

由于网络延迟，远程玩家可能会出现"瞬移"现象。使用插值可以让移动更平滑。`,
          parameters: {},
          example: `// ========== 远程玩家插值移动 ==========

class RemotePlayer {
  constructor(playerId) {
    this.playerId = playerId;
    
    // 当前显示位置
    this.x = 0;
    this.y = 0;
    
    // 目标位置（从网络消息获取）
    this.targetX = 0;
    this.targetY = 0;
    
    // 移动参数
    this.speed = 5;  // 插值速度
    this.arriveThreshold = 2;  // 到达阈值
  }
  
  /**
   * 收到网络消息时更新目标位置
   */
  onNetworkUpdate(data) {
    this.targetX = data.x;
    this.targetY = data.y;
    this.direction = data.direction;
  }
  
  /**
   * 每帧更新：向目标位置平滑移动
   */
  update() {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > this.arriveThreshold) {
      // 向目标位置移动（插值）
      const ratio = Math.min(this.speed / distance, 1);
      this.x += dx * ratio;
      this.y += dy * ratio;
    } else {
      // 到达目标位置
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }
}

// 管理所有远程玩家
const remotePlayers = new Map();

// 收到位置消息时
manager.registerListener({
  onCustomMessage: (info) => {
    const fromId = info.fromPlayerId || info.playerId;
    const data = JSON.parse(info.msg || info.message);
    
    if (data.type === 'move') {
      const player = remotePlayers.get(fromId);
      if (player) {
        // 更新目标位置（不直接设置当前位置）
        player.onNetworkUpdate(data);
      }
    }
  }
});

// 游戏主循环
function gameLoop() {
  // 更新所有远程玩家（插值移动）
  remotePlayers.forEach(player => player.update());
  
  render();
  requestAnimationFrame(gameLoop);
}`,
        },
        {
          name: '不同游戏类型的同步频率建议',
          method: 'Sync Frequency Recommendations',
          description: `**根据游戏类型选择合适的同步频率**`,
          parameters: {},
          example: `// ========== 同步频率建议 ==========

/*
| 游戏类型           | 同步频率        | 说明                    |
|-------------------|----------------|------------------------|
| 回合制游戏         | 事件驱动        | 只在操作时发送           |
| 休闲游戏(跑酷/消除) | 5次/秒 (200ms) | 实时性要求不高           |
| 动作游戏(射击/格斗) | 10次/秒 (100ms)| 平衡实时性和带宽         |
| 竞技游戏(MOBA/FPS) | 10次/秒 + 插值  | 需要客户端预测           |

⚠️ 注意：TapTap SDK 限制为每秒 15 次！
   建议预留安全余量，使用 10 次/秒以下
*/

// 配置示例
const SYNC_CONFIG = {
  // 休闲游戏
  casual: {
    interval: 200,      // 200ms
    threshold: 1.0      // 位置变化阈值
  },
  
  // 动作游戏
  action: {
    interval: 100,      // 100ms
    threshold: 0.5
  },
  
  // 实时竞技（推荐配合插值）
  competitive: {
    interval: 100,
    threshold: 0.1,
    useInterpolation: true
  }
};`,
        },
      ],
    },

    // ============ 本地指南文档模板 ============
    local_guide_template: {
      title: '本地指南文档模板',
      description: `📄 **生成到项目中的多人联机使用指南**

此模板用于生成 \`MULTIPLAYER_GUIDE.md\` 文件到用户项目根目录。

**目的**：
1. 保持 MCP 上下文 - 即使没有 MCP 也能查看规范
2. 代码注释引用 - 所有联机代码都指向此文档
3. AI 违规提醒 - AI 发现代码违背规范时主动告知

**使用方式**：
调用 \`generate_local_multiplayer_guide\` 工具生成此文档`,
      apis: [
        {
          name: 'MULTIPLAYER_GUIDE.md 模板',
          method: 'Local Guide Template',
          description: `此内容会被生成到用户项目根目录的 MULTIPLAYER_GUIDE.md 文件中。`,
          parameters: {},
          example: `# 多人联机使用指引和规范

> ⚠️ **重要**：本文档是多人联机开发的核心规范，所有联机相关代码都必须遵循。
> 如果 AI 生成的代码违背本规范，请主动告知开发者！

---

## 🚨 API 频率限制（最重要！）

\`\`\`
sendCustomMessage + updatePlayerCustomProperties + updateRoomProperties
共享每秒 15 次限制！
\`\`\`

### 禁止的做法
- ❌ 在游戏主循环的每帧调用 API（60fps = 严重超限）
- ❌ 不加限制地发送位置同步消息
- ❌ 同时高频调用多个同步 API

### 推荐的做法
- ✅ 使用 100-200ms 间隔（每秒 5-10 次）
- ✅ 只在数据真正变化时才发送
- ✅ 实现节流函数控制调用频率

### 节流函数示例
\`\`\`javascript
class SyncThrottle {
  constructor(interval = 100) {
    this.interval = interval;
    this.lastTime = 0;
  }
  
  canSync() {
    const now = Date.now();
    if (now - this.lastTime >= this.interval) {
      this.lastTime = now;
      return true;
    }
    return false;
  }
}

// 使用
const throttle = new SyncThrottle(100);
function sendPosition() {
  if (throttle.canSync()) {
    manager.sendCustomMessage({...});
  }
}
\`\`\`

---

## 🔑 玩家 ID 使用规范

### 获取本地玩家 ID
\`\`\`javascript
// connect() 返回的 playerId 必须保存！
const res = await manager.connect();
this.myPlayerId = res.playerId;  // ← 关键
\`\`\`

### 判断是否是自己
\`\`\`javascript
const isMe = (playerId === this.myPlayerId);
\`\`\`

### 字段名兼容
\`\`\`javascript
// 发送者ID可能有多种字段名
const fromId = info.fromPlayerId || info.playerId || info.fromUserId;

// playerInfo 可能有包装层
const playerInfo = info.playerInfo || info;
const playerId = playerInfo.id || playerInfo.playerId;
\`\`\`

---

## 📦 数据结构注意事项

### matchRoom() 返回值
\`\`\`javascript
// ⚠️ 有 roomInfo 包装层！
const result = await manager.matchRoom({...});
const roomInfo = result.roomInfo;  // ← 注意！
const players = roomInfo.players;  // 不是 result.players
\`\`\`

### playerEnterRoom 回调
\`\`\`javascript
// ⚠️ 有 playerInfo 包装层！
playerEnterRoom: (info) => {
  const playerId = info.playerInfo.id;  // ← 注意！
  // 不是 info.id
}
\`\`\`

### sendCustomMessage 格式
\`\`\`javascript
// ⚠️ 必须有 data 包装层，msg 必须是字符串！
manager.sendCustomMessage({
  data: {
    msg: JSON.stringify({ type: 'move', x: 100 }),
    type: 0
  }
});
\`\`\`

---

## 🎮 摇杆同步策略

### 推荐方案
\`\`\`javascript
// 定时同步 + 位置变化检测
const SYNC_INTERVAL = 100;  // 100ms
let lastSyncTime = 0;
let lastX = 0, lastY = 0;

function update() {
  const now = Date.now();
  const posChanged = Math.abs(player.x - lastX) > 0.5 || 
                     Math.abs(player.y - lastY) > 0.5;
  
  if (posChanged && now - lastSyncTime >= SYNC_INTERVAL) {
    syncPosition();
    lastSyncTime = now;
    lastX = player.x;
    lastY = player.y;
  }
}
\`\`\`

---

## 📝 代码注释规范

**所有多人联机相关的代码文件顶部必须添加以下注释：**

\`\`\`javascript
/**
 * 多人联机模块
 * 
 * ⚠️ SDK 使用规范请参阅项目中的 MULTIPLAYER_GUIDE.md
 * ⚠️ API 频率限制：sendCustomMessage 等共享每秒 15 次
 */
\`\`\`

---

## ⚠️ AI 开发注意事项

**如果你是 AI 助手，请注意：**

1. 生成联机代码前，先检查是否存在本文档
2. 生成的代码必须包含频率控制逻辑
3. 如果用户的需求会导致超过频率限制，主动提醒
4. 使用正确的数据结构（注意包装层）
5. 在代码文件顶部添加规范注释

**违规情况示例（需要主动告知用户）**：
- 在每帧调用 sendCustomMessage
- 没有对同步频率做任何限制
- 直接使用 result.players 而不是 result.roomInfo.players

---

*文档生成时间：{timestamp}*
*TapTap MiniGame MCP 版本：{version}*`,
        },
      ],
    },

    // ============ 模块化代码模板 ============
    modular_templates: {
      title: '模块化代码模板',
      description: `📦 **可直接复制使用的模块化代码模板**

将多人联机功能拆分为独立模块，便于维护和复用。

**模块列表**：
1. \`MultiplayerManager.js\` - 核心联机管理器
2. \`SyncThrottle.js\` - 同步频率控制
3. \`PlayerIdHelper.js\` - playerId 解析工具`,
      apis: [
        {
          name: 'SyncThrottle.js - 同步频率控制',
          method: 'SyncThrottle Module',
          description: `独立的同步频率控制模块，可用于所有需要限频的场景。`,
          parameters: {},
          example: `// ========== SyncThrottle.js ==========
/**
 * ⚠️ 【强制规范】多人联机独立模块
 * 所有多人联机开发必须遵循项目中的 "MULTIPLAYER_GUIDE.md"
 * 如有冲突，需要告知开发者！
 * 
 * 🔴 API 频率限制：sendCustomMessage / updatePlayerCustomProperties / updateRoomProperties
 *    三个 API 共享每秒 15 次限制！严禁超频调用！
 */

/**
 * 同步频率控制器
 * 用于限制 API 调用频率，避免超过 15次/秒 的限制
 */
class SyncThrottle {
  /**
   * @param {number} interval - 最小调用间隔（毫秒），默认100ms
   */
  constructor(interval = 100) {
    this.interval = interval;
    this.lastTime = 0;
  }
  
  /**
   * 检查是否可以执行同步
   * @returns {boolean}
   */
  canSync() {
    const now = Date.now();
    if (now - this.lastTime >= this.interval) {
      this.lastTime = now;
      return true;
    }
    return false;
  }
  
  /**
   * 执行带频率控制的同步
   * @param {Function} syncFn - 同步函数
   * @returns {boolean} 是否执行了同步
   */
  throttle(syncFn) {
    if (this.canSync()) {
      syncFn();
      return true;
    }
    return false;
  }
  
  /**
   * 重置计时器
   */
  reset() {
    this.lastTime = 0;
  }
  
  /**
   * 设置新的间隔
   * @param {number} interval
   */
  setInterval(interval) {
    this.interval = interval;
  }
}

// 导出（根据项目模块系统调整）
// export default SyncThrottle;
// module.exports = SyncThrottle;
// window.SyncThrottle = SyncThrottle;`,
        },
        {
          name: 'PlayerIdHelper.js - playerId 解析工具',
          method: 'PlayerIdHelper Module',
          description: `用于兼容不同 API/事件中 playerId 字段名不一致的问题。`,
          parameters: {},
          example: `// ========== PlayerIdHelper.js ==========
/**
 * ⚠️ 【强制规范】多人联机独立模块
 * 所有多人联机开发必须遵循项目中的 "MULTIPLAYER_GUIDE.md"
 * 如有冲突，需要告知开发者！
 */

/**
 * 玩家 ID 解析工具
 * 兼容不同 API/事件中字段名不一致的问题
 */
const PlayerIdHelper = {
  /**
   * 从回调参数中提取玩家 ID
   * @param {Object} data - 回调参数
   * @returns {string|null}
   */
  extractPlayerId(data) {
    if (!data) return null;
    
    // 1. 检查 playerInfo 包装层
    const playerInfo = data.playerInfo || data;
    
    // 2. 尝试多种可能的字段名
    return playerInfo.id || 
           playerInfo.playerId || 
           playerInfo.userId ||
           data.fromPlayerId ||
           data.fromUserId ||
           null;
  },
  
  /**
   * 从消息回调中提取发送者 ID
   * @param {Object} info - onCustomMessage 回调参数
   * @returns {string|null}
   */
  extractSenderId(info) {
    if (!info) return null;
    
    return info.fromPlayerId || 
           info.fromUserId || 
           info.playerId ||
           info.senderId ||
           null;
  },
  
  /**
   * 从消息回调中提取消息内容
   * @param {Object} info - onCustomMessage 回调参数
   * @returns {Object|null}
   */
  extractMessage(info) {
    if (!info) return null;
    
    const msgStr = info.msg || info.message || info.content;
    
    if (!msgStr) return null;
    
    try {
      return typeof msgStr === 'string' ? JSON.parse(msgStr) : msgStr;
    } catch (e) {
      console.error('消息解析失败:', e);
      return null;
    }
  },
  
  /**
   * 解析 customProperties（JSON 字符串 → 对象）
   * @param {string|Object} props
   * @returns {Object}
   */
  parseCustomProperties(props) {
    if (!props) return {};
    
    if (typeof props === 'object') return props;
    
    try {
      return JSON.parse(props);
    } catch (e) {
      return {};
    }
  },
  
  /**
   * 判断是否是本地玩家
   * @param {string} playerId
   * @param {string} myPlayerId
   * @returns {boolean}
   */
  isLocalPlayer(playerId, myPlayerId) {
    return playerId === myPlayerId;
  }
};

// 导出
// export default PlayerIdHelper;
// module.exports = PlayerIdHelper;
// window.PlayerIdHelper = PlayerIdHelper;`,
        },
        {
          name: '增强版 MultiplayerManager.js',
          method: 'Enhanced MultiplayerManager',
          description: `集成了频率控制和 playerId 处理的增强版联机管理器。`,
          parameters: {},
          example: `// ========== MultiplayerManager.js（增强版）==========
/**
 * ⚠️ 【强制规范】多人联机独立模块
 * 所有多人联机开发必须遵循项目中的 "MULTIPLAYER_GUIDE.md"
 * 如有冲突，需要告知开发者！
 * 
 * 🔴 API 频率限制：sendCustomMessage / updatePlayerCustomProperties / updateRoomProperties
 *    三个 API 共享每秒 15 次限制！严禁超频调用！
 */

/**
 * 多人联机管理器（增强版）
 * 
 * 功能：
 * - 封装所有核心 API
 * - 内置频率控制
 * - 兼容字段名差异
 * - 提供简洁的回调接口
 */
class MultiplayerManager {
  constructor() {
    // SDK 管理器
    this.manager = null;
    
    // 状态
    this.myPlayerId = null;
    this.roomInfo = null;
    this.isConnected = false;
    this.isInRoom = false;
    
    // 频率控制（⚠️ 重要：避免超过 15次/秒 限制）
    this.syncThrottle = {
      lastTime: 0,
      interval: 100  // 100ms = 每秒最多10次
    };
    
    // 事件回调
    this.onConnected = null;
    this.onRoomJoined = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onDataReceived = null;
    this.onDisconnected = null;
  }
  
  /**
   * 初始化并连接
   */
  async init() {
    this.manager = tap.getOnlineBattleManager();
    this._registerListeners();
    
    const res = await this.manager.connect();
    this.myPlayerId = res.playerId;  // 🔴 保存 playerId
    this.isConnected = true;
    
    console.log('[联机] 连接成功，我的ID:', this.myPlayerId);
    
    if (this.onConnected) {
      this.onConnected(this.myPlayerId);
    }
    
    return this.myPlayerId;
  }
  
  /**
   * 注册事件监听
   */
  _registerListeners() {
    this.manager.registerListener({
      onDisconnected: (errorInfo) => {
        this.isConnected = false;
        this.isInRoom = false;
        if (this.onDisconnected) {
          this.onDisconnected(errorInfo.reason, errorInfo.code);
        }
      },
      
      playerEnterRoom: (info) => {
        // 🔴 正确提取 playerInfo
        const playerInfo = info.playerInfo;
        if (this.onPlayerJoined) {
          this.onPlayerJoined(playerInfo);
        }
      },
      
      playerLeaveRoom: (info) => {
        if (this.onPlayerLeft) {
          this.onPlayerLeft(info.playerId);
        }
      },
      
      playerOffline: (info) => {
        if (this.onPlayerLeft) {
          this.onPlayerLeft(info.playerId);
        }
      },
      
      onCustomMessage: (info) => {
        // 🔴 兼容多种字段名
        const fromId = info.fromPlayerId || info.playerId || info.fromUserId;
        const msgStr = info.msg || info.message || info.content;
        
        // 跳过自己的消息
        if (fromId === this.myPlayerId) return;
        
        if (this.onDataReceived) {
          try {
            const data = JSON.parse(msgStr);
            this.onDataReceived(data, fromId);
          } catch (e) {
            console.error('[联机] 消息解析失败:', e);
          }
        }
      }
    });
  }
  
  /**
   * 匹配房间
   */
  async matchRoom(maxPlayers = 2, roomType = 'default', playerProps = {}) {
    const result = await this.manager.matchRoom({
      data: {
        roomCfg: {
          maxPlayerCount: maxPlayers,
          type: roomType,
          matchParams: {}
        },
        playerCfg: {
          customProperties: JSON.stringify(playerProps)
        }
      }
    });
    
    // 🔴 正确提取 roomInfo
    this.roomInfo = result.roomInfo;
    this.isInRoom = true;
    
    console.log('[联机] 匹配成功，房间人数:', this.roomInfo.players.length);
    
    if (this.onRoomJoined) {
      this.onRoomJoined(this.roomInfo);
    }
    
    return this.roomInfo;
  }
  
  /**
   * 发送数据（带频率控制）
   * ⚠️ 自动限制为每秒最多10次
   */
  sendData(data) {
    if (!this.isInRoom) {
      console.warn('[联机] 未在房间中');
      return false;
    }
    
    // 🔴 频率控制
    const now = Date.now();
    if (now - this.syncThrottle.lastTime < this.syncThrottle.interval) {
      return false;  // 未到发送时间
    }
    this.syncThrottle.lastTime = now;
    
    this.manager.sendCustomMessage({
      data: {
        msg: JSON.stringify(data),
        type: 0
      }
    });
    
    return true;
  }
  
  /**
   * 离开房间
   */
  async leaveRoom() {
    if (!this.isInRoom) return;
    
    await this.manager.leaveRoom();
    this.roomInfo = null;
    this.isInRoom = false;
  }
  
  /**
   * 获取房间内其他玩家
   */
  getOtherPlayers() {
    if (!this.roomInfo) return [];
    return this.roomInfo.players.filter(p => p.id !== this.myPlayerId);
  }
  
  /**
   * 判断自己是否是房主
   */
  isOwner() {
    return this.roomInfo && this.roomInfo.ownerId === this.myPlayerId;
  }
}

// 导出
// export default MultiplayerManager;
// module.exports = MultiplayerManager;
// window.MultiplayerManager = MultiplayerManager;`,
        },
      ],
    },
  },
};
