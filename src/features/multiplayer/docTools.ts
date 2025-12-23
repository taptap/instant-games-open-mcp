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

// ============ 已删除的废弃函数 ============
// 以下函数已删除，功能整合到核心工具中：
// - getStep1Init ~ getStep7Exit (整合到 getIntegrationWorkflow)
// - getDataStructures (整合到 getApiDataStructures)
// - getCommonPatterns (整合到 getCompleteExample)

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

/**
 * 完整联机功能示例
 */
async function getCompleteExample(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'complete_example');
}

// ============ 已删除的单 API 文档函数 ============
// 以下函数已删除，功能整合到 get_code_template 的代码注释中：
// - getGetOnlineBattleManager, getRegisterListener, getConnect
// - getMatchRoom, getUpdatePlayerCustomProperties, getUpdateRoomProperties
// - getSendCustomMessage, getLeaveRoom

// ============ 已删除的辅助工具函数 ============
// - searchMultiplayerDocs (使用率低，已删除)
// - getMultiplayerOverview (整合到 getIntegrationWorkflow)

/**
 * 获取完整集成流程指南
 */
async function getIntegrationWorkflow(): Promise<string> {
  // 直接嵌入完整代码模板
  const codeTemplate = await getCompleteExample();

  return `# TapTap 多人联机集成指南

---

## 🔧 内置调试工具

**MultiplayerManager 已内置屏幕日志系统！**

- ✅ DEBUG_MODE 默认开启（显示弹窗提示）
- ✅ 数据同步状态可视化（📤 发送、📥 接收）
- ✅ 适合非程序员和移动端调试

**需要更强大的日志面板？**

调用 \`get_debug_logger\` 获取独立的 DebugLogger 组件：
- 右下角绿点显示日志面板
- 日志分级、去重、复制
- 自动拦截 console.log/warn/error

---

## 🚀 快速开始（3步上手）

### 步骤1：复制完整代码模板

以下是经过3款真实游戏验证的生产级代码模板，**直接复制到项目中即可使用**：

${codeTemplate}

---

### 步骤2：初始化

\`\`\`javascript
const multiplayer = new MultiplayerManager();

// 设置回调
multiplayer.onPlayerJoined = (playerInfo) => {
  // 创建远程玩家（游戏逻辑）
  const player = createPlayer(playerInfo.id);
};

multiplayer.onPlayerLeft = (playerId) => {
  // 移除玩家（游戏逻辑）
  removePlayer(playerId);
};

multiplayer.onDataReceived = (data, fromPlayerId) => {
  // 处理数据（游戏逻辑）
  if (data.type === 'position') {
    updatePlayerPosition(fromPlayerId, data.x, data.y);
  }
};

// 初始化并匹配房间
await multiplayer.init();
await multiplayer.matchRoom(2, 'pvp');
\`\`\`

---

### 步骤3：在游戏循环中同步

\`\`\`javascript
function gameLoop() {
  player.update();

  // ✅ 可以每帧调用，内部已处理频率限制和变化检测
  multiplayer.syncPosition(player.x, player.y);

  requestAnimationFrame(gameLoop);
}
\`\`\`

---

## 🚨 常见问题速查

| 问题 | 解决方案 |
|------|---------|
| 看不到其他玩家 | 确保在 onPlayerJoined 中创建玩家对象 |
| 位置不同步 | 确保使用 syncPosition() 方法 |
| playerId undefined | 已内置字段兼容，检查其他原因 |
| 游戏卡顿 | syncPosition 内置变化检测，已优化 |

遇到其他问题？调用 \`diagnose_multiplayer_issues\` 工具

---

## 📋 7步骤流程（参考）

代码模板已实现以下步骤，无需手动编写：

1️⃣ 获取管理器 - ✅ 在 init() 中
2️⃣ 注册事件 - ✅ 在 _registerListeners() 中
3️⃣ 连接服务器 - ✅ 在 init() 中
4️⃣ 匹配房间 - ✅ 调用 matchRoom()
5️⃣ 数据同步 - ✅ 调用 syncPosition() / sendData()
6️⃣ 事件处理 - ✅ 已内置，通过回调函数
7️⃣ 退出房间 - ✅ 调用 leaveRoom()

---

## 🔧 代码模板特性

✅ **开箱即用** - 直接复制，立即可用
✅ **防御性强** - 内置频率限制、字段兼容、变化检测
✅ **支持调试** - 单机模式降级，无需真实环境
✅ **可扩展** - MSG_TYPES 可自定义，sendEvent() 支持任意事件

---

## 💡 一键生成方案

**更快捷的方式**：调用 \`generate_multiplayer_code\` 工具，自动创建文件：
- \`js/MultiplayerManager.js\` - 完整代码
- \`MULTIPLAYER_GUIDE.md\` - 本地规范文档

---

## 🟡 扩展功能（可选）

需要房间列表、好友邀请等功能时，调用 \`get_extended_apis\` 工具
`;
}

// ============ 已删除的扩展 API 函数 ============
// 以下函数已删除，功能整合到 getExtendedApis：
// - getExtendedRoomManagement, getExtendedConnection
// - getExtendedPlayerStatus, getExtendedEvents
// - getCreateRoom, getGetRoomList, getJoinRoom
// - getKickRoomPlayer, getDisconnect, getUpdatePlayerCustomStatus

// ============ 专题指南文档 ============

/**
 * 玩家 ID 完整指南
 */
async function getPlayerIdGuide(): Promise<string> {
  return generateCategoryDoc(MULTIPLAYER_DOCUMENTATION, 'player_id_guide');
}

// ============ 已删除/重命名的专题函数 ============
// - getJoystickSyncPattern → getSyncStrategy（重命名并优化）
// - getLocalGuideTemplate（已删除，功能在 generateLocalMultiplayerGuide 中）
// - getModularTemplates（已删除，功能整合到 getSyncStrategy）

/**
 * 生成本地多人联机指南文档
 * 返回可直接保存到项目根目录的 MULTIPLAYER_GUIDE.md 内容
 */
async function generateLocalMultiplayerGuide(): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const version = '1.0.0';
  
  return `# 多人联机使用指引和规范

> ⚠️ **重要**：本文档是多人联机开发的核心规范，所有联机相关代码都必须遵循。
> 如果 AI 生成的代码违背本规范，请主动告知开发者！

---

## 🚨 API 频率限制

**共享限制：15 次/秒**

以下 3 个 API 共享频率限制：
- \`sendCustomMessage()\`
- \`updatePlayerCustomProperties()\`
- \`updateRoomProperties()\`

### 解决方案：定时同步

\`\`\`javascript
let lastSyncTime = 0;
const SYNC_INTERVAL = 100;  // 100ms = 10次/秒

function syncData() {
  const now = Date.now();
  if (now - lastSyncTime >= SYNC_INTERVAL) {
    manager.sendCustomMessage({...});
    lastSyncTime = now;
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

## 📦 数据结构

### matchRoom 返回值
\`\`\`javascript
const res = await manager.matchRoom({...});
// res.roomInfo.players  ← 所有玩家数组
// res.roomInfo.ownerId  ← 房主 ID
\`\`\`

### playerEnterRoom 事件
\`\`\`javascript
playerEnterRoom: (info) => {
  // info.playerInfo.id              ← 玩家 ID
  // info.playerInfo.customProperties ← 玩家属性
}
\`\`\`

### sendCustomMessage 格式
\`\`\`javascript
manager.sendCustomMessage({
  data: {
    msg: JSON.stringify({ type: 'move', x: 100 }),
    type: 0  // 0=所有人（不包括自己）
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

## 💡 AI 开发提示

**如果你是 AI 助手，实现多人联机时：**

1. 先调用 \`generate_local_guide\` 生成本文档
2. 调用 \`get_code_template\` 获取完整代码模板
3. 使用定时器控制同步频率（100ms 间隔）
4. 正确使用数据结构（res.roomInfo.players、info.playerInfo.id）
5. 保存 connect() 返回的 playerId

---

*文档生成时间：${timestamp}*
*TapTap MiniGame MCP 版本：${version}*
`;
}

/**
 * 扩展 API 速查（合并所有扩展 API）
 */
async function getExtendedApis(): Promise<string> {
  return `# 扩展 API 速查手册

⚠️ **使用原则**：仅在用户明确提出需求时使用

---

## 🏠 房间管理增强

### createRoom() - 创建自定义房间

**使用场景**：需要固定房间ID（邀请好友）

\`\`\`javascript
const res = await manager.createRoom({
  data: {
    roomCfg: {
      maxPlayerCount: 4,
      type: 'custom',
      roomId: 'ROOM_12345'  // 自定义房间ID
    },
    playerCfg: {
      customProperties: JSON.stringify({ nickname: 'Player' })
    }
  }
});

// 返回值结构：
// res.roomInfo.roomId  ← 房间 ID
\`\`\`

---

### getRoomList() - 获取房间列表

**使用场景**：显示房间列表 UI

\`\`\`javascript
const res = await manager.getRoomList({
  data: {
    pageIndex: 1,
    pageSize: 20,
    roomType: 'pvp'
  }
});

// 返回值结构：
// res.rooms  ← 房间数组
// res.rooms[].roomId
// res.rooms[].currentPlayerCount
// res.rooms[].maxPlayerCount
\`\`\`

---

### joinRoom() - 加入指定房间

**使用场景**：通过房间ID邀请好友

\`\`\`javascript
const res = await manager.joinRoom({
  data: {
    roomId: 'ROOM_12345',
    playerCfg: {
      customProperties: JSON.stringify({ nickname: 'Player' })
    }
  }
});

// 返回值结构：
// res.roomInfo  ← 房间信息（同 matchRoom）
\`\`\`

---

### kickRoomPlayer() - 踢出玩家

**使用场景**：房主踢人功能

\`\`\`javascript
// 仅房主可调用
await manager.kickRoomPlayer({
  data: { kickedPlayerId: 'player_123' }
});

// 返回值：无（void）
// 被踢玩家会收到 onPlayerKicked 事件
\`\`\`

---

## 🔌 连接控制

### disconnect() - 主动断开连接

**使用场景**：游戏切后台时断开

\`\`\`javascript
await manager.disconnect();

// 返回值：无（void）
\`\`\`

---

## 📊 玩家状态扩展

### updatePlayerCustomStatus() - 更新简单状态

**使用场景**：需要额外的数字状态字段

\`\`\`javascript
await manager.updatePlayerCustomStatus({
  data: { customStatus: 1 }  // 只能是数字
});

// 返回值：无（void）
// 所有人会收到 onPlayerCustomStatusChange 事件
\`\`\`

---

## 🚨 扩展事件

### onBattleServiceError - 服务错误

\`\`\`javascript
manager.registerListener({
  onBattleServiceError: (info) => {
    // info.code
    // info.message
  }
});
\`\`\`

### onPlayerKicked - 被踢事件

\`\`\`javascript
manager.registerListener({
  onPlayerKicked: (info) => {
    // 玩家被房主踢出
  }
});
\`\`\`

### onPlayerCustomStatusChange - 状态变更

\`\`\`javascript
manager.registerListener({
  onPlayerCustomStatusChange: (info) => {
    // info.playerInfo.id
    // info.playerInfo.customStatus
  }
});
\`\`\`

---

## 📋 完整扩展 API 清单

| API | 用途 | 使用场景 |
|-----|------|---------|
| createRoom | 创建自定义房间 | 邀请好友 |
| getRoomList | 获取房间列表 | 房间列表UI |
| joinRoom | 加入指定房间 | 好友邀请 |
| kickRoomPlayer | 踢出玩家 | 房主管理 |
| disconnect | 主动断开 | 切后台 |
| updatePlayerCustomStatus | 更新状态 | 额外状态字段 |
`;
}

/**
 * 同步策略指南（合并摇杆同步 + 节流）
 */
async function getSyncStrategy(): Promise<string> {
  return `# 同步策略指南

## 🎯 策略选择

### 策略1：定时同步（摇杆/WASD控制）

**适用场景**：虚拟摇杆、WASD 键盘控制

**实现方案**：定时同步 + 位置变化检测

\`\`\`javascript
class MultiplayerManager {
  constructor() {
    this.SYNC_INTERVAL = 100;  // 100ms = 10次/秒
    this.lastSyncTime = 0;
    this.lastX = 0;
    this.lastY = 0;
  }

  // 在游戏主循环中调用
  update(player) {
    const now = Date.now();

    // 检查位置是否变化
    const posChanged = Math.abs(player.x - this.lastX) > 0.5 ||
                       Math.abs(player.y - this.lastY) > 0.5;

    // 定时同步 + 位置变化检测
    if (posChanged && now - this.lastSyncTime >= this.SYNC_INTERVAL) {
      this.syncPosition(player);
      this.lastSyncTime = now;
      this.lastX = player.x;
      this.lastY = player.y;
    }
  }

  syncPosition(player) {
    this.manager.sendCustomMessage({
      data: {
        msg: JSON.stringify({ type: 'position', x: player.x, y: player.y }),
        type: 0
      }
    });
  }
}

// 使用
function gameLoop() {
  player.update();  // 应用摇杆输入
  multiplayerManager.update(player);  // 同步位置
  requestAnimationFrame(gameLoop);
}
\`\`\`

---

### 策略2：事件驱动同步（点击移动）

**适用场景**：点击目标、技能释放

**实现方案**：直接在事件中同步

\`\`\`javascript
player.onClick = (targetX, targetY) => {
  // 1. 本地立即执行
  player.moveTo(targetX, targetY);

  // 2. 发送给其他玩家
  manager.sendCustomMessage({
    data: {
      msg: JSON.stringify({ type: 'move_to', targetX, targetY }),
      type: 0
    }
  });
};
\`\`\`

---

## 🔴 频率限制处理

**关键**：sendCustomMessage 有 15次/秒限制（与其他 API 共享）

**解决方案**：使用定时器控制

\`\`\`javascript
// 方案1：简单定时器
let lastSyncTime = 0;
const SYNC_INTERVAL = 100;  // 100ms = 10次/秒

function syncData(data) {
  const now = Date.now();
  if (now - lastSyncTime >= SYNC_INTERVAL) {
    manager.sendCustomMessage({...});
    lastSyncTime = now;
  }
}

// 方案2：封装为类方法（在 MultiplayerManager 中）
constructor() {
  this.lastSyncTime = 0;
  this.SYNC_INTERVAL = 100;
}

canSync() {
  const now = Date.now();
  if (now - this.lastSyncTime >= this.SYNC_INTERVAL) {
    this.lastSyncTime = now;
    return true;
  }
  return false;
}

syncData() {
  if (this.canSync()) {
    this.manager.sendCustomMessage({...});
  }
}
\`\`\`
`;
}

/**
 * API 数据结构完整参考（新增）
 */
async function getApiDataStructures(): Promise<string> {
  return `# API 返回数据结构完整参考

## 核心 API 返回值

### connect() - 连接服务器

\`\`\`javascript
const res = await manager.connect();

// 返回值结构：
{
  playerId: "player_123456",  // 本地玩家 ID（必须保存）
  errMsg: ""                  // 错误信息（空字符串表示成功）
}
\`\`\`

---

### matchRoom() - 匹配房间

\`\`\`javascript
const res = await manager.matchRoom({...});

// 返回值结构：
{
  roomInfo: {
    roomId: "room_abc123",           // 房间 ID
    ownerId: "player_123456",        // 房主 ID
    maxPlayerCount: 4,               // 最大人数
    currentPlayerCount: 2,           // 当前人数
    customProperties: "{...}",       // 房间自定义属性（JSON字符串）
    players: [                       // 所有玩家数组
      {
        id: "player_123456",         // 玩家 ID
        customProperties: "{...}"    // 玩家属性（JSON字符串）
      }
    ]
  }
}
\`\`\`

---

### sendCustomMessage() - 发送消息

\`\`\`javascript
await manager.sendCustomMessage({
  data: {
    msg: JSON.stringify({ type: 'position', x: 100, y: 200 }),
    type: 0  // 0=所有人（不包括自己），1=指定玩家
  }
});

// 返回值：无（void）
// 注意：发送者自己不会收到 onCustomMessage 事件
\`\`\`

---

### updatePlayerCustomProperties() - 更新玩家属性

\`\`\`javascript
await manager.updatePlayerCustomProperties({
  properties: JSON.stringify({ score: 100, level: 5 })
});

// 返回值：无（void）
// 注意：所有人会收到 onPlayerCustomPropertiesChange 事件（包括自己）
\`\`\`

---

### updateRoomProperties() - 更新房间属性

\`\`\`javascript
await manager.updateRoomProperties({
  data: {
    customProperties: JSON.stringify({ map: 'level_2' })
  }
});

// 返回值：无（void）
// 注意：只有房主能调用；所有人会收到 onRoomPropertiesChange 事件
\`\`\`

---

### leaveRoom() - 退出房间

\`\`\`javascript
await manager.leaveRoom();

// 返回值：无（void）
// 注意：其他玩家会收到 playerLeaveRoom 事件
\`\`\`

---

## 事件回调数据结构

### playerEnterRoom - 玩家进入房间

\`\`\`javascript
playerEnterRoom: (info) => {
  // info 结构：
  {
    playerInfo: {
      id: "player_789012",         // 新玩家 ID
      customProperties: "{...}"    // 新玩家属性（JSON字符串）
    }
  }

  // 使用：
  const playerId = info.playerInfo.id;
  const props = JSON.parse(info.playerInfo.customProperties);
}
\`\`\`

---

### playerLeaveRoom - 玩家离开房间

\`\`\`javascript
playerLeaveRoom: (info) => {
  // info 结构：
  {
    playerInfo: {
      id: "player_789012"          // 离开的玩家 ID
    }
  }
}
\`\`\`

---

### playerOffline - 玩家掉线

\`\`\`javascript
playerOffline: (info) => {
  // info 结构：
  {
    playerInfo: {
      id: "player_789012"          // 掉线的玩家 ID
    }
  }
}
\`\`\`

---

### onCustomMessage - 收到自定义消息

\`\`\`javascript
onCustomMessage: (info) => {
  // info 结构：
  {
    fromPlayerId: "player_789012", // 发送者 ID
    msg: "{...}"                   // 消息内容（JSON字符串）
  }

  // 使用：
  const message = JSON.parse(info.msg);
}
\`\`\`

---

### onPlayerCustomPropertiesChange - 玩家属性变更

\`\`\`javascript
onPlayerCustomPropertiesChange: (info) => {
  // info 结构：
  {
    playerInfo: {
      id: "player_789012",         // 玩家 ID
      customProperties: "{...}"    // 更新后的属性（JSON字符串）
    }
  }

  // 使用：
  const playerId = info.playerInfo.id;
  const props = JSON.parse(info.playerInfo.customProperties);
}
\`\`\`

---

### onRoomPropertiesChange - 房间属性变更

\`\`\`javascript
onRoomPropertiesChange: (info) => {
  // info 结构：
  {
    customProperties: "{...}",     // 更新后的房间属性（JSON字符串）
    ownerId: "player_123456"       // 房主 ID（可能变更）
  }

  // 使用：
  const props = JSON.parse(info.customProperties);
  const newOwnerId = info.ownerId;
}
\`\`\`

---

### onDisconnected - 连接断开

\`\`\`javascript
onDisconnected: (info) => {
  // info 结构：
  {
    code: 1000,                    // 错误代码
    reason: "connection lost"      // 断开原因
  }
}
\`\`\`

---

## 📋 扩展 API 完整清单

| API | 用途 | 使用场景 | 返回值 |
|-----|------|---------|-------|
| createRoom | 创建自定义房间 | 邀请好友 | roomInfo |
| getRoomList | 获取房间列表 | 房间列表UI | rooms 数组 |
| joinRoom | 加入指定房间 | 好友邀请 | roomInfo |
| kickRoomPlayer | 踢出玩家 | 房主管理 | void |
| disconnect | 主动断开 | 切后台 | void |
| updatePlayerCustomStatus | 更新状态 | 额外状态字段 | void |
`;
}

/**
 * 一键生成多人联机代码（新增）
 */
async function generateMultiplayerCode(): Promise<string> {
  const codeTemplate = await getCompleteExample();
  const guideTemplate = await generateLocalMultiplayerGuide();

  return `# 一键生成多人联机代码

已为你生成以下文件，请保存到项目中：

---

## 📄 文件1：js/MultiplayerManager.js

**路径**：\`js/MultiplayerManager.js\` 或 \`game/js/MultiplayerManager.js\`

**内容**：

${codeTemplate}

---

## 📄 文件2：MULTIPLAYER_GUIDE.md

**路径**：项目根目录 \`MULTIPLAYER_GUIDE.md\`

**内容**：

${guideTemplate}

---

## ✅ 下一步

1. **保存文件**：将以上内容保存到对应路径
2. **引入代码**：在 main.js 或 game.js 中引入
   \`\`\`javascript
   // 引入多人联机管理器（根据你的文件路径调整）
   // <script src="js/MultiplayerManager.js"></script>
   \`\`\`
3. **开始使用**：参考 MULTIPLAYER_GUIDE.md 中的使用示例

---

## 🎯 快速验证

\`\`\`javascript
const mp = new MultiplayerManager();
await mp.init();
console.log('初始化成功，playerId:', mp.myPlayerId);
\`\`\`
`;
}

/**
 * 问题诊断工具（新增 - 可扩展）
 */
async function diagnoseIssues(): Promise<string> {
  return `# 多人联机问题诊断

---

## 🔧 推荐：先添加可视化调试工具

**如果你无法查看浏览器控制台（移动端测试）或不熟悉编程调试：**

**调用 \`get_debug_logger\` 获取屏幕日志工具，添加到项目后：**

\`\`\`javascript
// 在代码中使用
Debug.log('👤 玩家加入: ' + player.id);
Debug.log('📤 发送: ' + JSON.stringify(data));
Debug.log('📥 接收: ' + JSON.stringify(data));
\`\`\`

**运行游戏，点击右下角绿色小圆点，所有日志会显示在屏幕上！**

**如果已经添加了 DebugLogger 或能查看控制台，继续以下步骤...**

---

## 步骤 1：分析问题类型 ⚠️

**首先判断：游戏逻辑问题 or SDK 数据同步问题？**

### 方法 1：使用 DebugLogger（推荐）

\`\`\`javascript
// 在关键位置添加日志
mp.onPlayerJoined = (player) => {
  Debug.log('✅ onPlayerJoined 触发: ' + player.id);
  createRemotePlayer(player.id);
};

mp.onDataReceived = (data, fromId) => {
  Debug.log('✅ onDataReceived 触发: ' + JSON.stringify(data));
  updateRemotePlayer(fromId, data);
};

mp.sendData({ type: 'click', x: 100, y: 200 });
Debug.log('✅ sendData 已调用');
\`\`\`

**运行游戏，查看屏幕日志，根据情况判断：**

| 弹窗情况 | 问题类型 | 解决方向 |
|---------|---------|---------|
| 有"📥 接收"弹窗，但画面没变化 | 🎮 游戏逻辑问题 | 检查游戏代码：是否创建了玩家？是否更新了渲染？ |
| 有"📤 发送"弹窗，但对方没有"📥 接收" | 🔌 SDK 数据同步问题 | 继续步骤 2 |
| 没有"👤 玩家加入"弹窗 | 🎮 或 🔌 问题 | 检查是否设置了回调，是否进入了房间 |

---

### 方法 2：询问用户提供问题描述

**如果无法使用调试弹窗，请向用户询问以下信息：**

\`\`\`
1. 问题现象描述：
   - 玩家 A 做了什么操作？（例如：点击了屏幕）
   - 玩家 B 看到了什么？（例如：什么都没看到 / 看到了但位置不对）

2. 是否看到游戏内的错误提示？
   - 是否有弹窗提示错误？
   - 弹窗内容是什么？

3. 是否多人都进入了房间？
   - 能看到对方的昵称或头像吗？
   - 是否显示房间内有多个玩家？

4. 是否只有特定操作有问题？
   - 所有操作都无法同步，还是只有某个操作？
   - 例如：移动可以同步，但点击无法同步
\`\`\`

**根据用户回答判断：**
- 能看到对方，但操作不同步 → 可能是数据同步问题
- 完全看不到对方 → 可能是游戏逻辑问题（未创建玩家对象）
- 只有特定操作有问题 → 可能是通讯协议不一致

---

**关键：SDK 只负责数据传输，游戏逻辑（创建对象、渲染画面）是你的代码！**

---

## 步骤 2：自我检查流程 🔍

**如果是 SDK 数据同步问题，先自我检查是否正确实现了数据同步流程：**

### 自检清单（调用 get_multiplayer_guide 复习）

\`\`\`
□ 是否调用了 init() 并保存了 playerId？
□ 是否调用了 matchRoom() 进入房间？
□ 是否设置了 onPlayerJoined 回调？
□ 是否设置了 onDataReceived 回调？
□ 是否在操作时调用了 sendData() 或 syncPosition()？
□ 是否遵循了推荐的通讯协议（get_protocol_template）？
\`\`\`

**如果有任何一项不确定，先调用 \`get_multiplayer_guide\` 复习正确流程！**

**如果都确认正确，继续步骤 3**

---

## 步骤 3：细化数据同步问题 🔬

**基于 5 个真实项目的问题总结，按出现频率排序：**

### 🔴 最常见问题1：看不到其他玩家（45% 项目遇到）

**症状：**
- 玩家 B 进入房间，看不到玩家 A
- 玩家 A 能看到玩家 B
- **单向可见**

**根本原因：matchRoom 返回的 roomInfo.players 未立即处理**

\`\`\`javascript
// ❌ 错误做法（SuperMario v1.0.4）
const res = await manager.matchRoom({...});
const roomInfo = res.roomInfo;

// 只注册监听器，没有立即处理 roomInfo.players
registerListener({ playerEnterRoom: ... });

// ❌ 延后处理或分步处理（错误！）
setTimeout(() => {
  roomInfo.players.forEach(...);
}, 1000);
\`\`\`

**正确做法：**
\`\`\`javascript
// ✅ 正确做法（SuperMario v1.0.5）
const res = await manager.matchRoom({...});
const roomInfo = res.roomInfo;

// 立即遍历并处理房间内已有的玩家
roomInfo.players.forEach(player => {
  if (player.id !== this.myPlayerId) {
    addRemotePlayer(player);  // 立即添加！
  }
});

// 然后注册监听器（处理后续加入的玩家）
registerListener({ playerEnterRoom: ... });
\`\`\`

**检查清单：**
\`\`\`
□ matchRoom 后是否立即遍历 roomInfo.players？
□ 是否为每个其他玩家调用了 addRemotePlayer？
□ 是否在创建本地玩家后才处理远程玩家？
\`\`\`

---

### 🔴 最常见问题2：字段名不统一导致 undefined（45% 项目遇到）

**症状：**
\`\`\`
[ERROR] 玩家 ID undefined
[ERROR] 未找到玩家 ID=undefined
\`\`\`

**根本原因：SDK 不同版本/不同回调使用不同字段名**

\`\`\`javascript
// playerEnterRoom 回调
{ playerInfo: { id: '...', playerId: '...', userId: '...' } }

// onCustomMessage 回调
{ msg: '...', content: '...', fromPlayerId: '...', fromUserId: '...' }
\`\`\`

**错误提取：**
\`\`\`javascript
// ❌ 错误（Tank v1.0）
playerEnterRoom: (info) => {
  const playerId = info.id;  // undefined!
}

// ❌ 错误（Tank v1.1）
playerEnterRoom: (info) => {
  const playerId = info.playerInfo.id;  // 可能 undefined
}
\`\`\`

**正确提取：**
\`\`\`javascript
// ✅ 正确（兼容所有情况）
function extractPlayerId(info) {
  if (info.playerInfo) return info.playerInfo.id || info.playerInfo.playerId;
  return info.playerId || info.id || info.userId || info.fromPlayerId;
}

playerEnterRoom: (info) => {
  const playerId = extractPlayerId(info);  // 兼容提取
}
\`\`\`

**检查方法：**
\`\`\`javascript
// 添加日志验证
console.log('原始 info:', JSON.stringify(info));
console.log('提取的 playerId:', playerId);
\`\`\`

---

### 🔴 最常见问题3：sendCustomMessage 格式错误（18% 项目遇到）

**症状：**
- 发送了数据，但其他人收不到
- 或者 API 调用失败

**错误格式：**
\`\`\`javascript
// ❌ 错误（Tank v1.0）
manager.sendCustomMessage({
  type: 'move',
  x: 100
});
\`\`\`

**正确格式：**
\`\`\`javascript
// ✅ 正确（Tank v1.1）
manager.sendCustomMessage({
  data: {                           // ← 必须有 data 包装
    msg: JSON.stringify({           // ← msg 必须是字符串
      type: 'move',
      x: 100
    }),
    type: 0                         // ← 0=所有人，1=指定玩家
  }
});
\`\`\`

**检查清单：**
\`\`\`
□ 是否有 data 包装？
□ msg 是否是 JSON 字符串？
□ 是否包含 type 字段（0 或 1）？
\`\`\`

---

### 🟡 常见问题4：静止也在疯狂发送（9% 项目遇到）

**症状：**
\`\`\`
[LOG] 📤 发送: (40, 576)
[LOG] 📤 发送: (40, 576)  ← 位置没变也在发送
[LOG] 📤 发送: (40, 576)  ← 每帧都发送
\`\`\`

**原因：**
没有变化检测

**解决方案：**
\`\`\`javascript
// ✅ 添加变化检测（Tank v1.2）
let lastX = 0, lastY = 0;

function update() {
  const oldX = player.x;
  const oldY = player.y;

  player.update();

  // 变化检测
  const posChanged = Math.abs(player.x - oldX) > 0.1 ||
                     Math.abs(player.y - oldY) > 0.1;

  if (posChanged) {
    mp.syncPosition(player.x, player.y);  // 只在移动时发送
  }
}
\`\`\`

---

## 📊 三种 API 对比（基础）

| API | 发送者是否收到事件 | 其他人是否收到事件 | 典型用途 |
|-----|-----------------|-----------------|---------|
| sendCustomMessage | ❌ 不会收到 | ✅ 收到 onCustomMessage | 实时操作（点击、移动） |
| updatePlayerCustomProperties | ✅ 收到事件 | ✅ 收到事件 | 玩家属性（分数、血量） |
| updateRoomProperties | ✅ 收到事件 | ✅ 收到事件 | 房间状态（地图、回合） |

详细对比 → 调用 \`get_api_event_table\`

---

## 🔢 常见错误码参考

**多人联机 ErrorCode（已内置在 MultiplayerManager 中）：**

| 错误码 | 名称 | 说明 | 解决方案 |
|-------|------|------|---------|
| 3 | REQUEST_RATE_LIMIT_EXCEEDED | 请求频率超限 | 减少发送频率，使用 MultiplayerManager 的内置限流 |
| 6 | NETWORK_ERROR | 网络错误 | 检查网络连接，重新调用 init() |
| 20 | NOT_IN_ROOM | 尚未加入房间 | 确保 matchRoom() 成功后再发送数据 |
| 21 | ALREADY_IN_ROOM | 已在房间中 | 先调用 leaveRoom() 再匹配新房间 |
| 22 | NOT_ROOM_OWNER | 不是房主 | 只有房主可以调用 updateRoomProperties |
| 23 | ROOM_FULL | 房间已满 | 等待或创建新房间 |
| 24 | ROOM_NOT_EXIST | 房间不存在 | 使用 matchRoom 自动匹配 |

**完整错误码列表（23 个）：**

查看 MultiplayerManager 代码模板顶部的 ErrorCode 常量定义

---

### 方式 2：updatePlayerCustomProperties（更新玩家属性）

**特性：**
- 📤 发送者：调用后**自己也会**收到 \`onPlayerCustomPropertiesChange\` 事件
- 📥 其他人：也会收到 \`onPlayerCustomPropertiesChange\` 事件

**诊断代码：**
\`\`\`javascript
// 发送端（玩家 A）
console.log('📤 A 调用 updatePlayerCustomProperties');
manager.updatePlayerCustomProperties({
  properties: JSON.stringify({ score: 100 })
});

// 接收端（所有人，包括 A）
registerListener({
  onPlayerCustomPropertiesChange: (info) => {
    console.log('📥 收到 onPlayerCustomPropertiesChange:', info.playerId);
    // A 和其他人都应该有这个日志
  }
});
\`\`\`

**问题判断：**
- A 调用了，但 A 自己都没收到事件 → **SDK 调用可能失败**（检查参数格式）
- A 收到了，其他人没收到 → **其他人的回调没设置**（检查 registerListener）
- 都收到了，但画面没变化 → **游戏逻辑问题**（检查业务代码）

---

### 方式 3：updateRoomProperties（更新房间属性）

**特性：**
- 📤 发送者：只有房主可以调用
- 📥 所有人：收到 \`onRoomPropertiesChange\` 事件

**诊断代码：**
\`\`\`javascript
// 发送端（房主）
if (mp.isHost) {
  console.log('📤 房主调用 updateRoomProperties');
  manager.updateRoomProperties({
    data: { customProperties: JSON.stringify({ mapLevel: 2 }) }
  });
} else {
  console.error('❌ 不是房主，无法更新房间属性');
}

// 接收端（所有人）
registerListener({
  onRoomPropertiesChange: (info) => {
    console.log('📥 收到 onRoomPropertiesChange:', info);
  }
});
\`\`\`

**问题判断：**
- 不是房主但调用了 → **权限错误**（只有房主可以调用）
- 房主调用了，但没人收到事件 → **回调没设置**（检查 registerListener）
- 收到了，但画面没变化 → **游戏逻辑问题**（检查业务代码）

---

## 📊 三种方式对比（重要！）

| API | 发送者是否收到事件 | 其他人是否收到事件 | 典型用途 |
|-----|-----------------|-----------------|---------|
| sendCustomMessage | ❌ 不会收到 | ✅ 收到 onCustomMessage | 实时操作（点击、移动） |
| updatePlayerCustomProperties | ✅ 收到事件 | ✅ 收到事件 | 玩家属性（分数、血量） |
| updateRoomProperties | ✅ 收到事件 | ✅ 收到事件 | 房间状态（地图、回合） |

**关键理解：** \`sendCustomMessage\` 发送者不会收到回调，其他两个 API 所有人都会收到！

详细对比 → 调用 \`get_api_event_table\`

---

## 🛠️ 万能调试日志

**复制这段代码，快速定位问题：**

\`\`\`javascript
// ====== 调试开关 ======
const DEBUG = true;

// 📤 sendCustomMessage 日志
const _sendData = mp.sendData;
mp.sendData = function(data) {
  if (DEBUG) console.log('📤 [sendCustomMessage] 发送:', data);
  return _sendData.call(this, data);
};

// 📥 接收日志
mp.onDataReceived = (data, fromId) => {
  if (DEBUG) console.log('📥 [onCustomMessage] 接收:', data, 'from:', fromId);
  // 你的游戏逻辑...
};

// 玩家属性变更日志
registerListener({
  onPlayerCustomPropertiesChange: (info) => {
    if (DEBUG) console.log('📥 [玩家属性变更]:', info.playerId, info.properties);
  },
  onRoomPropertiesChange: (info) => {
    if (DEBUG) console.log('📥 [房间属性变更]:', info);
  }
});
\`\`\`

---

## 💡 诊断流程总结

\`\`\`
1. 先判断问题类型
   ├─ 有日志但画面没变化 → 游戏逻辑问题（检查业务代码）
   └─ 没有对应日志 → SDK 问题（继续）

2. 自我检查流程是否正确
   └─ 调用 get_multiplayer_guide 复习正确实现

3. 细化 SDK 问题
   ├─ sendCustomMessage 问题？（发送者不会收到事件）
   ├─ updatePlayerCustomProperties 问题？（所有人都会收到）
   └─ updateRoomProperties 问题？（所有人都会收到，只有房主能调用）

4. 根据具体 API 添加日志
   └─ 观察日志判断：发送成功？接收成功？
\`\`\`

---

**关键：SDK 只负责数据传输，游戏逻辑（创建对象、更新画面）是你的代码！**
`;
}

/**
 * 代码检查工具（新增）
 */
async function checkCode(args: { code: string }): Promise<string> {
  const code = args.code;
  const issues = [];

  // 检测1：是否保存 playerId
  if (code.includes('connect()') && !code.includes('playerId')) {
    issues.push({
      severity: 'high',
      issue: '未保存 connect() 返回的 playerId',
      location: 'connect() 调用处',
      fix: 'const res = await manager.connect(); this.myPlayerId = res.playerId;',
      reference: '调用 get_player_id_guide 了解详情'
    });
  }

  // 检测2：是否使用了错误的字段名
  const wrongFields = [
    { pattern: /playerLeaveRoom.*info\.playerId/, correct: 'info.playerInfo.id' },
    { pattern: /playerOffline.*info\.playerId/, correct: 'info.playerInfo.id' },
    { pattern: /onCustomMessage.*info\.playerId/, correct: 'info.fromPlayerId' },
    { pattern: /onCustomMessage.*info\.message/, correct: 'info.msg' }
  ];

  wrongFields.forEach(({ pattern, correct }) => {
    if (pattern.test(code)) {
      issues.push({
        severity: 'high',
        issue: '字段名错误',
        location: pattern.source,
        fix: `应使用 ${correct}`,
        reference: '调用 get_api_data_structures 查看正确字段'
      });
    }
  });

  // 检测3：是否有频率限制
  if (code.includes('sendCustomMessage') && code.includes('requestAnimationFrame')) {
    if (!code.includes('lastSyncTime') && !code.includes('SYNC_INTERVAL') && !code.includes('syncPosition')) {
      issues.push({
        severity: 'high',
        issue: '在游戏循环中调用 sendCustomMessage 但无频率限制',
        location: 'gameLoop 或 requestAnimationFrame 内部',
        fix: '使用 MultiplayerManager.syncPosition() 方法（已内置频率限制）',
        reference: '调用 get_sync_strategy 了解同步策略'
      });
    }
  }

  // 检测4：是否初始化房间内已有玩家
  if (code.includes('matchRoom') && !code.includes('roomInfo.players')) {
    issues.push({
      severity: 'medium',
      issue: '未初始化房间内已有的玩家',
      location: 'matchRoom 成功后',
      fix: 'roomInfo.players.forEach(p => { if (p.id !== myPlayerId) createPlayer(p); })',
      reference: '查看 get_code_template 中的完整示例'
    });
  }

  // 检测5：registerListener 是否在 connect 之前
  const connectIndex = code.indexOf('connect()');
  const registerIndex = code.indexOf('registerListener');
  if (connectIndex > 0 && registerIndex > 0 && connectIndex < registerIndex) {
    issues.push({
      severity: 'high',
      issue: 'registerListener 必须在 connect 之前调用',
      location: '初始化流程',
      fix: '调整顺序：1. getOnlineBattleManager → 2. registerListener → 3. connect',
      reference: '查看 get_code_template 中的正确顺序'
    });
  }

  if (issues.length === 0) {
    return `✅ 代码检查通过！

未发现常见问题。你的代码看起来不错！

建议：
- 在真实环境中测试
- 使用 diagnose_multiplayer_issues 工具排查运行时问题
`;
  }

  return `# 代码检查结果

发现 ${issues.length} 个潜在问题：

---

${issues.map((issue, index) => `
## 问题 ${index + 1}：${issue.issue}

**严重程度**：${issue.severity === 'high' ? '🔴 高' : '🟡 中'}
**位置**：${issue.location}

**修复方案**：
\`\`\`
${issue.fix}
\`\`\`

**参考**：${issue.reference}

---
`).join('\n')}

## 💡 建议

修复以上问题后，重新调用 check_multiplayer_code 验证。

或直接使用 MultiplayerManager 代码模板（已避免所有常见问题）：
\`\`\`
get_code_template
\`\`\`
`;
}

/**
 * DebugLogger 工具 - 屏幕调试日志组件
 */
async function getDebugLogger(): Promise<string> {
  return `# DebugLogger - 屏幕调试日志工具

> 适合非程序员和移动端调试

---

## 🎯 功能特性

- ✅ 右下角绿点，点击显示日志面板
- ✅ 在屏幕上直接查看日志（无需控制台）
- ✅ 日志分级：普通/警告/错误（不同颜色）
- ✅ 日志去重：相同日志显示 ×N
- ✅ 复制日志到剪贴板
- ✅ 自动拦截 console.log/warn/error
- ✅ 移动端适配

---

## 🚀 使用方法

### 步骤 1：创建文件

在你的项目中创建 DebugLogger 文件夹，并复制以下代码：

#### 文件结构
\`\`\`
你的项目/
├── index.html
├── DebugLogger/
│   ├── DebugLogger.js
│   └── DebugLogger.css
└── js/game.js
\`\`\`

---

### 步骤 2：复制完整代码

由于代码较长，请访问以下路径查看完整代码：

📁 DebugLogger.js 和 DebugLogger.css 的完整代码已经准备好。

**或者，你可以直接告诉 AI：**
\`\`\`
"请从 /Volumes/Q/MiniGame/Mcp/Tank/DebugLogger 复制文件到我的项目"
\`\`\`

---

### 步骤 3：在 HTML 中引入

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="DebugLogger/DebugLogger.css">
</head>
<body>
    <!-- DebugLogger 容器 -->
    <div id="debug-logger-container"></div>

    <script src="DebugLogger/DebugLogger.js"></script>
    <script src="js/game.js"></script>
</body>
</html>
\`\`\`

---

### 步骤 4：在代码中使用

\`\`\`javascript
// 普通日志
Debug.log('游戏初始化完成');

// 警告日志
Debug.log('网络延迟', 'warn');

// 错误日志
Debug.log('连接失败', 'error');
\`\`\`

---

## 🔍 用于多人联机调试

### 集成示例

\`\`\`javascript
const mp = new MultiplayerManager();

mp.onPlayerJoined = (player) => {
  Debug.log('👤 玩家加入: ' + player.id);
  createRemotePlayer(player.id);
};

mp.onDataReceived = (data, fromId) => {
  Debug.log('📥 接收: ' + JSON.stringify(data));
  updateRemotePlayer(fromId, data);
};

function onClick(x, y) {
  Debug.log('📤 发送: ' + JSON.stringify({ type: 'click', x, y }));
  mp.sendData({ type: 'click', x, y });
}
\`\`\`

---

## 📱 运行效果

点击右下角绿色小圆点，会显示日志面板：

\`\`\`
[20:14:03] [LOG] 👤 玩家加入: abc123...
[20:14:05] [LOG] 📤 发送: {"type":"click","x":100,"y":200}
[20:14:05] [LOG] 📥 接收: {"type":"click","x":100,"y":200}
\`\`\`

**非程序员也能看懂！**

---

## 💡 文件位置

完整代码位于：\`/Volumes/Q/MiniGame/Mcp/Tank/DebugLogger\`

**AI 可以直接复制这些文件到用户项目中。**
`;
}

// 导出所有文档工具
export const multiplayerDocTools = {
  // 核心工具（保留）
  getIntegrationWorkflow,
  getCompleteExample,
  getApiEventRelations,
  getProtocolTemplate,

  // 专题工具（保留并优化）
  getPlayerIdGuide,
  getSyncStrategy,
  generateLocalMultiplayerGuide,

  // 实战优化工具
  getExtendedApis,
  getApiDataStructures,

  // 新增工具
  generateMultiplayerCode,
  diagnoseIssues,
  checkCode,
  getDebugLogger
};
