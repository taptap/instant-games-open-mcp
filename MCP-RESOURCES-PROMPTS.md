# MCP Resources 和 Prompts 功能说明

## 📋 概述

在 v1.1.0 版本中，我们添加了完整的 MCP Resources 和 Prompts 支持，使服务器更符合 MCP 的设计理念。

## 🎯 架构变化

### 之前（v1.0.x）- 全部使用 Tools
```
Tools (17个):
├── 文档工具 (9个) - 返回只读文档
├── 管理工具 (5个) - 执行实际操作
└── 辅助工具 (3个) - 环境检查等
```

### 现在（v1.1.0）- 三种类型分离
```
Resources (8个) - 只读文档数据:
├── docs://leaderboard/api/get-manager
├── docs://leaderboard/api/open
├── docs://leaderboard/api/submit-scores
├── docs://leaderboard/api/load-scores
├── docs://leaderboard/api/load-player-score
├── docs://leaderboard/api/load-centered-scores
├── docs://leaderboard/overview
└── docs://leaderboard/patterns

Prompts (2个) - 工作流模板:
├── leaderboard-integration (完整接入引导)
└── leaderboard-troubleshooting (问题排查指南)

Tools (17个) - 实际操作:
├── 管理工具 (5个)
│   ├── create_leaderboard
│   ├── list_leaderboards
│   ├── publish_leaderboard
│   ├── get_user_leaderboard_scores
│   └── check_environment
├── 工作流工具 (1个)
│   └── start_leaderboard_integration
├── 文档工具 (9个) - 保留以兼容旧版本
└── 辅助工具 (2个)
```

## 🆕 新增功能

### 1. Resources - 只读文档

**用途**: 提供结构化的、可缓存的文档数据

**URI 格式**:
- `docs://leaderboard/api/*` - LeaderboardManager API 文档
- `docs://leaderboard/overview` - 完整概览
- `docs://leaderboard/patterns` - 最佳实践

**使用示例**:
```javascript
// MCP 客户端调用
const response = await client.readResource({
  uri: 'docs://leaderboard/api/submit-scores'
});

console.log(response.contents[0].text);
// 输出: submitScores() API 的完整文档
```

**优点**:
- ✅ 语义清晰 - "读取文档"而不是"调用工具"
- ✅ 可缓存 - MCP 客户端可以缓存文档内容
- ✅ 并发读取 - 无副作用，可以并发访问
- ✅ 符合规范 - 遵循 MCP 设计理念

### 2. Prompts - 工作流模板

**用途**: 提供预定义的、可重用的交互模板

**可用 Prompts**:

#### `leaderboard-integration`
完整的排行榜接入引导流程：
- 自动检查现有排行榜
- 引导创建或选择排行榜
- 提供集成代码示例

**使用示例**:
```javascript
// MCP 客户端调用
const prompt = await client.getPrompt({
  name: 'leaderboard-integration',
  arguments: {}
});

// prompt.messages 包含预定义的对话流程
for (const message of prompt.messages) {
  console.log(`${message.role}: ${message.content.text}`);
}
```

#### `leaderboard-troubleshooting`
排行榜问题排查指南：
- 支持通用排查步骤
- 支持特定错误码排查（可选参数 `error_code`）

**使用示例**:
```javascript
// 通用排查
const prompt1 = await client.getPrompt({
  name: 'leaderboard-troubleshooting'
});

// 特定错误码排查
const prompt2 = await client.getPrompt({
  name: 'leaderboard-troubleshooting',
  arguments: { error_code: '500001' }
});
```

**优点**:
- ✅ 标准化工作流 - 一致的用户体验
- ✅ 用户触发 - 明确的意图表达
- ✅ 可参数化 - 支持动态内容
- ✅ 可重用 - 封装最佳实践

## 🔄 向后兼容

为了确保平滑迁移，我们保留了所有现有的 Tools：

### 文档 Tools（保留）
- `get_leaderboard_manager`
- `open_leaderboard`
- `submit_scores`
- `load_leaderboard_scores`
- `load_current_player_score`
- `load_player_centered_scores`
- `get_leaderboard_overview`
- `get_leaderboard_patterns`
- `search_leaderboard_docs`

这些工具仍然可用，但推荐使用对应的 Resources。

### 迁移建议

#### AI Agent 使用者
**推荐**: 优先使用 Resources 读取文档
```typescript
// ✅ 推荐 - 使用 Resources
readResource('docs://leaderboard/api/submit-scores')

// ⚠️ 仍可用，但不推荐
callTool('submit_scores')
```

#### 人类用户
**推荐**: 使用 Prompts 启动工作流
```typescript
// ✅ 推荐 - 使用 Prompts
getPrompt('leaderboard-integration')

// ⚠️ 仍可用，但不推荐
callTool('start_leaderboard_integration')
```

## 📁 新增文件

### 配置文件
- `src/config/resourceDefinitions.ts` - Resources 定义和 URI 映射
- `src/config/promptDefinitions.ts` - Prompts 定义

### 处理器文件
- `src/handlers/promptHandlers.ts` - Prompts 模板生成逻辑

### 修改文件
- `src/server.ts` - 添加 Resources 和 Prompts 请求处理器

## 🎨 MCP 协议实现

### Resources 协议
```typescript
// 列出所有 Resources
{
  method: 'resources/list',
  result: {
    resources: [
      {
        uri: 'docs://leaderboard/api/get-manager',
        name: 'LeaderboardManager 实例获取',
        description: '如何获取 LeaderboardManager 实例',
        mimeType: 'text/markdown'
      },
      // ...
    ]
  }
}

// 读取特定 Resource
{
  method: 'resources/read',
  params: {
    uri: 'docs://leaderboard/api/get-manager'
  },
  result: {
    contents: [
      {
        uri: 'docs://leaderboard/api/get-manager',
        mimeType: 'text/markdown',
        text: '# tap.getLeaderboardManager\n\n...'
      }
    ]
  }
}
```

### Prompts 协议
```typescript
// 列出所有 Prompts
{
  method: 'prompts/list',
  result: {
    prompts: [
      {
        name: 'leaderboard-integration',
        description: 'Complete interactive guide for integrating...',
        arguments: []
      },
      {
        name: 'leaderboard-troubleshooting',
        description: 'Common leaderboard issues...',
        arguments: [
          {
            name: 'error_code',
            description: 'Optional error code...',
            required: false
          }
        ]
      }
    ]
  }
}

// 获取特定 Prompt
{
  method: 'prompts/get',
  params: {
    name: 'leaderboard-integration',
    arguments: {}
  },
  result: {
    description: '排行榜接入完整工作流引导',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: '我想在我的 TapTap 小游戏中接入排行榜功能...'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: '好的！我会帮你完成排行榜接入...'
        }
      }
    ]
  }
}
```

## 🚀 启动信息

新版本启动时会显示：

```
🚀 TapTap Minigame MCP Server Started
📚 Providing 17 tools, 8 resources, 2 prompts
🏆 Features: Leaderboard Documentation & Management API
🌍 Environment: production
🔗 API Base: https://agent.tapapis.cn

📖 MCP Capabilities:
   ✅ Tools (17) - Execute operations with side effects
   ✅ Resources (8) - Read-only documentation and data
   ✅ Prompts (2) - Reusable workflow templates

💡 Tip: Set TAPTAP_MINIGAME_MCP_VERBOSE=true for detailed logs
```

## 🎯 最佳实践

### 何时使用 Resources
- ✅ 读取 API 文档
- ✅ 获取代码示例
- ✅ 查看配置说明
- ✅ 访问最佳实践指南

### 何时使用 Prompts
- ✅ 启动标准化工作流
- ✅ 获取问题排查指南
- ✅ 使用预定义的对话模板
- ✅ 触发常见操作流程

### 何时使用 Tools
- ✅ 创建排行榜（副作用）
- ✅ 发布排行榜（副作用）
- ✅ 查询排行榜列表（需要认证）
- ✅ 检查环境配置（需要运行时信息）

## 📊 对比总结

| 特性 | Tools | Resources | Prompts |
|------|-------|-----------|---------|
| **作用** | 执行操作 | 提供数据 | 提供模板 |
| **副作用** | ✅ 有 | ❌ 无 | ❌ 无 |
| **控制方** | 模型控制 | 应用控制 | 用户控制 |
| **可缓存** | ❌ 否 | ✅ 是 | ✅ 是 |
| **并发访问** | ⚠️ 需注意 | ✅ 安全 | ✅ 安全 |
| **参数化** | ✅ 是 | ❌ 否 | ✅ 是 |
| **用例** | 创建、修改、删除 | 文档、配置、示例 | 工作流、引导、模板 |

## 🔮 未来规划

随着项目的发展，我们将：

1. **逐步迁移**: 鼓励用户使用 Resources 和 Prompts
2. **标记废弃**: 在未来版本中标记文档类 Tools 为 deprecated
3. **最终移除**: 在 v2.0.0 中移除废弃的 Tools，保持架构清晰

## 💡 总结

v1.1.0 版本通过添加 Resources 和 Prompts 支持：

- ✅ **更符合 MCP 规范** - 正确分离了不同类型的功能
- ✅ **更好的语义** - "读取文档" vs "调用工具"
- ✅ **更高的性能** - Resources 可缓存，可并发
- ✅ **更好的体验** - Prompts 提供标准化工作流
- ✅ **向后兼容** - 所有现有功能仍然可用

这是一个重要的架构升级，为未来的功能扩展奠定了坚实的基础！🚀
