/**
 * Multiplayer Resources Definitions and Handlers
 * 提供 MCP 资源访问，对应 docs.ts 中的文档分类
 *
 * 按实际使用流程组织：
 * 初始化和连接 → 匹配进入房间 → 游戏数据互通流转循环 → 退出房间
 */

import type { ResourceRegistration } from '../../core/types/index.js';

/**
 * Resources 已完全删除
 * 理由：AI 使用率 < 1%，维护成本 > 价值
 * 所有功能已整合到 Tools 中
 */
export const multiplayerResources: ResourceRegistration[] = [];
