# 重构提案：统一 Tools/Resources 定义和处理器

## 问题分析

当前实现中，Tools 和 Resources 的定义和处理器分离在两个数组中：

```typescript
// 当前方案（容易出错）
export const leaderboardToolDefinitions: Tool[] = [
  { name: 'get_integration_guide', ... },
  { name: 'get_current_app_info', ... },
  // ... 更多定义
];

export const leaderboardToolHandlers = [
  async (args, context) => { ... },  // ⚠️ 必须对应第 1 个定义
  async (args, context) => { ... },  // ⚠️ 必须对应第 2 个定义
  // ... 更多处理器
];
```

**问题：**
1. ❌ 需要手动保持两个数组的顺序一致
2. ❌ 添加/删除/重排序时容易出错
3. ❌ 注释需要重复写（定义和处理器都要标注）
4. ❌ 代码分散，难以维护
5. ❌ 类型安全性差，参数类型需要手动同步

## 解决方案

### 方案 A：对象数组（推荐）✅

使用单一数组，每个元素包含定义和处理器：

```typescript
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from '../../core/types/index.js';

/**
 * Tool 注册接口（定义 + 处理器）
 */
export interface ToolRegistration<T = any> {
  definition: Tool;
  handler: (args: T, context: HandlerContext) => Promise<string>;
}

/**
 * Leaderboard Tools（定义和处理器统一管理）
 */
export const leaderboardTools: ToolRegistration[] = [
  // 🎯 Integration Guide
  {
    definition: {
      name: 'get_integration_guide',
      description: '⭐ READ THIS FIRST when user wants to integrate leaderboard功能...',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (args, context) => {
      return leaderboardDocTools.getIntegrationWorkflow();
    }
  },

  // 📱 Get Current App Info
  {
    definition: {
      name: 'get_current_app_info',
      description: 'Get currently selected app information...',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (args, context) => {
      return leaderboardDocTools.getCurrentAppInfo();
    }
  },

  // 🔧 Create Leaderboard
  {
    definition: {
      name: 'create_leaderboard',
      description: 'Create a new leaderboard...',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Leaderboard name (required)'
          },
          score_order: {
            type: 'string',
            enum: ['higher_better', 'lower_better'],
            description: 'Score order'
          }
          // ... 更多参数
        },
        required: ['name', 'score_order']
      }
    },
    handler: async (args: {
      name: string;
      score_order: 'higher_better' | 'lower_better';
      // ... 类型定义
    }, context) => {
      return leaderboardHandlers.createLeaderboard(args, context);
    }
  }
];
```

### 方案 B：类定义（更面向对象）

```typescript
/**
 * Tool 基类
 */
abstract class ToolBase<T = any> {
  abstract definition: Tool;
  abstract handler(args: T, context: HandlerContext): Promise<string>;
}

/**
 * 获取集成指引工具
 */
class GetIntegrationGuideTool extends ToolBase {
  definition: Tool = {
    name: 'get_integration_guide',
    description: '⭐ READ THIS FIRST...',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  };

  async handler(args: any, context: HandlerContext): Promise<string> {
    return leaderboardDocTools.getIntegrationWorkflow();
  }
}

/**
 * 创建排行榜工具
 */
class CreateLeaderboardTool extends ToolBase<{
  name: string;
  score_order: 'higher_better' | 'lower_better';
}> {
  definition: Tool = {
    name: 'create_leaderboard',
    description: 'Create a new leaderboard...',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Leaderboard name' },
        score_order: {
          type: 'string',
          enum: ['higher_better', 'lower_better'],
          description: 'Score order'
        }
      },
      required: ['name', 'score_order']
    }
  };

  async handler(args: {
    name: string;
    score_order: 'higher_better' | 'lower_better';
  }, context: HandlerContext): Promise<string> {
    return leaderboardHandlers.createLeaderboard(args, context);
  }
}

// 导出所有工具实例
export const leaderboardTools = [
  new GetIntegrationGuideTool(),
  new CreateLeaderboardTool(),
  // ...
];
```

## 对比分析

| 特性 | 当前方案 | 方案 A（对象数组） | 方案 B（类定义） |
|------|---------|-------------------|------------------|
| **顺序同步** | ❌ 手动保持 | ✅ 自动一致 | ✅ 自动一致 |
| **类型安全** | ❌ 弱 | ✅ 强 | ✅ 最强 |
| **代码集中** | ❌ 分散 | ✅ 集中 | ✅ 集中 |
| **易于维护** | ❌ 困难 | ✅ 简单 | ⚠️ 较复杂 |
| **学习曲线** | ✅ 简单 | ✅ 简单 | ⚠️ 需要 OOP |
| **代码量** | 中 | 中 | 多 |
| **推荐度** | ❌ | ✅✅✅ | ⚠️ |

## 推荐方案：方案 A（对象数组）

**理由：**
1. ✅ **解决核心问题**：定义和处理器绑定在一起，无法错位
2. ✅ **类型安全**：handler 可以直接定义参数类型
3. ✅ **简单直观**：不需要额外的 OOP 概念
4. ✅ **易于迁移**：可以渐进式重构现有代码
5. ✅ **IDE 友好**：折叠、跳转、重构都更方便

## 实现步骤

### 1. 定义类型（core/types/index.ts）

```typescript
import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool 注册接口
 */
export interface ToolRegistration<T = any> {
  definition: Tool;
  handler: (args: T, context: HandlerContext) => Promise<string>;
}

/**
 * Resource 注册接口
 */
export interface ResourceRegistration {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: (args?: any) => Promise<string>;
}

/**
 * Prompt 注册接口
 */
export interface PromptRegistration {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  handler: (args?: any) => Promise<{
    messages: Array<{
      role: string;
      content: {
        type: string;
        text: string;
      };
    }>;
  }>;
}
```

### 2. 重构 tools.ts

```typescript
import { ToolRegistration } from '../../core/types/index.js';
import * as handlers from './handlers.js';
import { leaderboardDocTools } from './docTools.js';

export const leaderboardTools: ToolRegistration[] = [
  {
    definition: {
      name: 'get_integration_guide',
      description: '...',
      inputSchema: { ... }
    },
    handler: async (args, context) => {
      return leaderboardDocTools.getIntegrationWorkflow();
    }
  },
  // ... 更多工具
];
```

### 3. 更新 index.ts（模块导出）

```typescript
import { leaderboardTools } from './tools.js';
import { leaderboardResources } from './resources.js';

export const leaderboardModule = {
  name: 'leaderboard',
  description: 'TapTap Leaderboard 功能',

  // 直接使用统一格式
  tools: leaderboardTools.map(tool => ({
    definition: tool.definition,
    handler: tool.handler,
    requiresAuth: [
      'create_leaderboard',
      'list_leaderboards',
      // ...
    ].includes(tool.definition.name)
  })),

  resources: leaderboardResources
};
```

### 4. 更新脚手架脚本模板

修改 `create-feature.sh` 生成的模板，使用新格式。

## 迁移指南

### 分步迁移（推荐）

1. **Phase 1**: 定义新类型
2. **Phase 2**: 创建新格式的示例（如 cloudSave）
3. **Phase 3**: 逐步迁移现有模块（leaderboard）
4. **Phase 4**: 更新文档和脚手架

### 完整示例：CloudSave

```typescript
// src/features/cloudSave/tools.ts
import { ToolRegistration } from '../../core/types/index.js';
import * as handlers from './handlers.js';
import { cloudSaveDocTools } from './docTools.js';

export const cloudSaveTools: ToolRegistration[] = [
  {
    definition: {
      name: 'get_cloud_save_integration_guide',
      description: '⭐ Get complete Cloud Save integration workflow guide',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (args, context) => {
      return cloudSaveDocTools.getIntegrationWorkflow();
    }
  },

  {
    definition: {
      name: 'save_cloud_data',
      description: 'Save data to cloud storage',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Data key'
          },
          value: {
            type: 'string',
            description: 'Data value'
          }
        },
        required: ['key', 'value']
      }
    },
    handler: async (args: { key: string; value: string }, context) => {
      return handlers.saveData(args, context);
    }
  }
];
```

## 额外好处

### 1. 更好的开发体验

```typescript
// 添加新工具时，定义和实现在一起
export const cloudSaveTools: ToolRegistration[] = [
  // ... 现有工具

  // 新增工具 - 一次性完成定义和实现
  {
    definition: {
      name: 'delete_cloud_data',
      description: 'Delete data from cloud storage',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Data key to delete' }
        },
        required: ['key']
      }
    },
    handler: async (args: { key: string }, context) => {
      return handlers.deleteData(args, context);
    }
  }
];
```

### 2. 重排序更安全

```typescript
// 可以随意调整顺序，不会影响功能
export const cloudSaveTools: ToolRegistration[] = [
  { /* 工具 C */ },
  { /* 工具 A */ },  // 重排序
  { /* 工具 B */ },
];
```

### 3. 注释更清晰

```typescript
export const cloudSaveTools: ToolRegistration[] = [
  // 🎯 流程指引
  { /* get_integration_guide */ },

  // 💾 数据操作
  { /* save_cloud_data */ },
  { /* load_cloud_data */ },
  { /* delete_cloud_data */ },

  // 📊 数据管理
  { /* list_cloud_data */ },
];
```

## 后续优化

### 可选：添加工具分类

```typescript
export interface ToolCategory {
  name: string;
  description: string;
  tools: ToolRegistration[];
}

export const cloudSaveToolCategories: ToolCategory[] = [
  {
    name: 'guide',
    description: '流程指引',
    tools: [{ /* get_integration_guide */ }]
  },
  {
    name: 'data',
    description: '数据操作',
    tools: [
      { /* save_cloud_data */ },
      { /* load_cloud_data */ },
      { /* delete_cloud_data */ }
    ]
  }
];
```

## 总结

**推荐立即实施方案 A（对象数组）：**

1. ✅ 解决手动同步问题
2. ✅ 提高代码可维护性
3. ✅ 增强类型安全
4. ✅ 改善开发体验
5. ✅ 易于理解和迁移

**实施优先级：**
1. 高优先级：新功能（cloudSave）使用新格式
2. 中优先级：更新脚手架脚本
3. 低优先级：迁移现有模块（leaderboard）

---

**问题讨论：**
- 是否同意采用方案 A？
- 是否需要立即重构 leaderboard 模块？
- 是否有其他考虑因素？
