/**
 * Multiplayer API Calls
 *
 * 注意：多人联机功能是纯客户端 API，通过全局 'tap' 对象调用。
 *
 * 主要客户端 API：
 * - tap.getOnlineBattleManager() - 获取管理器实例
 * - tapOnlineBattle.registerListener() - 注册事件监听
 * - tapOnlineBattle.connect() - 连接服务器
 * - tapOnlineBattle.matchRoom() - 匹配房间
 * - tapOnlineBattle.sendCustomMessage() - 发送自定义消息
 * - tapOnlineBattle.updatePlayerCustomProperties() - 更新玩家属性
 * - tapOnlineBattle.updateRoomProperties() - 更新房间属性（仅房主）
 * - tapOnlineBattle.leaveRoom() - 离开房间
 *
 * 所有 API 都是客户端实现，详见 docs.ts 完整文档。
 */

// 多人联机是纯客户端 API，不需要服务端调用
// 本文件保持为空，仅用于模块结构完整性
export class MultiplayerApi {
  // 无需实现
}

export function createMultiplayerApi(): MultiplayerApi {
  return new MultiplayerApi();
}
