# 项目架构

## 🎯 模块化设计（v1.2.0-beta.11+）

每个功能（排行榜、云存档、分享等）都是**完全内聚的模块**：

```
src/
├── features/              # 功能模块（代码完全内聚）
│   └── leaderboard/      # 排行榜模块
│       ├── index.ts      # 模块定义和导出 ⭐
│       ├── tools.ts      # Tools 定义 + 处理器
│       ├── resources.ts  # Resources 定义 + 处理器
│       ├── docs.ts       # 文档内容
│       ├── docTools.ts   # 文档工具函数
│       ├── handlers.ts   # 业务逻辑
│       └── api.ts        # API 调用
│
├── core/                  # 共享核心代码
│   ├── auth/             # OAuth 认证
│   ├── network/          # HTTP Client
│   ├── handlers/         # 通用处理器
│   ├── utils/            # 缓存、日志
│   └── types/            # 类型定义
│
└── server.ts              # 主服务器（自动注册）
```

---

## 📦 模块结构

### Leaderboard 模块示例

```typescript
// features/leaderboard/index.ts
export const leaderboardModule = {
  name: 'leaderboard',

  tools: [
    {
      definition: { name: 'get_integration_guide', ... },
      handler: async (args, context) => { ... },
      requiresAuth: false
    },
    {
      definition: { name: 'create_leaderboard', ... },
      handler: async (args, context) => { ... },
      requiresAuth: true  // ← 标记需要认证
    }
    // ... 更多 tools
  ],

  resources: [
    {
      uri: 'docs://leaderboard/api/submit-scores',
      name: 'API: submitScores()',
      description: '...',
      handler: async () => { ... }
    }
    // ... 更多 resources
  ]
};
```

---

## 🔄 自动注册机制

### server.ts 自动注册

```typescript
// 导入所有功能模块
import { leaderboardModule } from './features/leaderboard/index.js';
// import { cloudSaveModule } from './features/cloudSave/index.js';  // 未来

// 所有模块
const allModules = [
  leaderboardModule
  // cloudSaveModule  // 未来
];

// 自动注册 Tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allModules.flatMap(m => m.tools.map(t => t.definition))
}));

// 自动注册 Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: allModules.flatMap(m => m.resources.map(r => ({...})))
}));

// 自动路由 Tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  // 查找对应的 tool
  for (const module of allModules) {
    const tool = module.tools.find(t => t.definition.name === name);
    if (tool) {
      // 检查认证
      if (tool.requiresAuth) await ensureAuth();
      // 调用 handler
      return await tool.handler(args, context);
    }
  }
});

// 自动路由 Resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // 查找对应的 resource
  for (const module of allModules) {
    const resource = module.resources.find(r => r.uri === uri);
    if (resource) {
      return await resource.handler();
    }
  }
});
```

---

## 🔄 数据流向

### Tools 调用流程

```
MCP Client (Claude Code/VSCode)
    ↓
MCP Protocol: tools/call
    ↓
server.ts → 自动路由
    ↓
查找模块中的 tool.handler
    ↓ 如果 requiresAuth=true
ensureAuth() → OAuth 懒加载
    ↓
执行 handler(args, context)
    ↓
features/leaderboard/handlers.ts
    ↓
features/leaderboard/api.ts
    ↓
core/network/httpClient.ts
    ↓
TapTap API
```

### Resources 读取流程

```
MCP Client (Claude Code)
    ↓
MCP Protocol: resources/read
    ↓
server.ts → 自动路由
    ↓
查找模块中的 resource.handler
    ↓
执行 handler()
    ↓
features/leaderboard/docTools.ts
    ↓
features/leaderboard/docs.ts
    ↓
返回文档内容
```

---

## 📁 核心共享代码

### core/auth/

**OAuth 2.0 Device Code Flow**
- `deviceFlow.ts` - 完整的 OAuth 实现
- 懒加载认证
- Token 本地存储

### core/network/

**HTTP 客户端**
- `httpClient.ts` - 通用 HTTP 客户端
  - MAC Token 认证
  - 请求签名（X-Tap-Sign）
  - 环境切换（production/rnd）

### core/handlers/

**通用处理器**（跨模块使用）
- `appHandlers.ts` - 应用管理
- `environmentHandlers.ts` - 环境检查

### core/utils/

**工具函数**
- `cache.ts` - 本地缓存（developer_id, app_id, miniapp_id）
- `logger.ts` - 日志工具（verbose 模式）

### core/types/

**类型定义**
- `index.ts` - MacToken, HandlerContext 等

---

## ✨ 添加新功能

### 方法 1: 复制现有模块（最快）

```bash
# 1. 复制排行榜模块作为模板
cp -r src/features/leaderboard src/features/cloudSave

# 2. 修改模块内容
cd src/features/cloudSave
# 修改 index.ts, tools.ts, resources.ts, docs.ts 等

# 3. 在 server.ts 注册
# 添加一行 import
import { cloudSaveModule } from './features/cloudSave/index.js';
# 添加到数组
const allModules = [leaderboardModule, cloudSaveModule];

# 完成！自动注册 ✅
```

### 方法 2: 使用脚手架（推荐）

```bash
# 使用脚手架生成模板
./scripts/create-feature.sh cloud-save "Cloud Save"

# 会自动创建：
# - src/features/cloudSave/index.ts
# - src/features/cloudSave/tools.ts
# - src/features/cloudSave/resources.ts
# - src/features/cloudSave/docs.ts
# - src/features/cloudSave/docTools.ts
# - src/features/cloudSave/handlers.ts
# - src/features/cloudSave/api.ts

# 然后按 TODO 提示填充内容
```

---

## 🎨 设计原则

### 1. 代码内聚

**一个功能，一个目录**
- 排行榜的所有代码在 `features/leaderboard/`
- 不需要跨目录查找

### 2. 模块独立

**模块间通过 core/ 共享代码**
- 模块不直接依赖其他模块
- 通过 core/ 的共享组件交互

### 3. 自动注册

**声明式定义，自动注册**
- 在模块 index.ts 中定义 Tools 和 Resources
- server.ts 自动收集和注册
- 不需要手动修改多个配置文件

### 4. 职责清晰

**Tools vs Resources**
- Tools: 操作和指引（AI 主动调用）
- Resources: API 详细文档（补充阅读）
- 不混淆，不重复

---

## 📏 命名约定

### 文件命名

| 文件 | 用途 | 示例 |
|------|------|------|
| `index.ts` | 模块定义 | 导出 `[feature]Module` |
| `tools.ts` | Tools 定义 + 处理器 | 导出数组 |
| `resources.ts` | Resources 定义 + 处理器 | 导出数组 |
| `docs.ts` | 文档数据 | 原 `data/[feature]Docs.ts` |
| `docTools.ts` | 文档工具 | 原 `tools/[feature]Tools.ts` |
| `handlers.ts` | 业务逻辑 | 原 `handlers/[feature]Handlers.ts` |
| `api.ts` | API 调用 | 原 `network/[feature]Api.ts` |

### Tool 命名

- 动词开头：`get_`, `create_`, `list_`, `delete_`
- 小写 + 下划线：`get_integration_guide`, `create_leaderboard`
- 每个功能至少有：`get_[feature]_guide`

### Resource 命名

- URI 格式：`docs://[feature]/api/[method]` 或 `docs://[feature]/overview`
- 小写 + 连字符：`leaderboard`, `cloud-save`, `social-share`

---

## 📊 代码度量

当前项目（v1.2.0-beta.11）：

| 模块 | 文件数 | 代码行数 |
|------|-------|---------|
| leaderboard | 7 | ~1800 行 |
| core | 8 | ~800 行 |
| server.ts | 1 | ~300 行 |
| **总计** | **16** | **~2900 行** |

模块化后代码减少了约 15%（清理了重复）

---

## 🔗 模块依赖关系

```
features/leaderboard/
    ↓ 依赖
core/ (共享代码)
    ↓ 不依赖
features/* (其他模块)
```

**依赖规则**：
- ✅ 功能模块可以依赖 core/
- ❌ 功能模块不能相互依赖
- ✅ core/ 不依赖任何功能模块

---

## 📖 延伸阅读

- **CONTRIBUTING.md** - 如何添加新功能的详细指南
- **README.md** - 用户使用指南
- **CLAUDE.md** - AI 集成指南
- **CHANGELOG.md** - 版本历史

---

## 🎯 最佳实践

### 开发新功能时

1. ✅ 先阅读 CONTRIBUTING.md
2. ✅ 使用 `./scripts/create-feature.sh` 生成模板
3. ✅ 参考 features/leaderboard/ 的实现
4. ✅ 遵循命名约定
5. ✅ 测试所有 MCP 客户端（Claude Code, VSCode）

### 维护现有功能时

1. ✅ 所有代码在 features/[feature]/ 中
2. ✅ 不要跨模块引用
3. ✅ 共享代码放 core/
4. ✅ 编译测试：`npm run build`
5. ✅ 功能测试：启动 server 并测试 tools

---

**模块化架构让多人协作开发变得简单！** 🎊
