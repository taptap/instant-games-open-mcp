# 开发指南 - 添加新功能

本指南帮助开发者为 TapTap MCP Server 添加新功能（如云存档、分享等）。

## 🏗️ 架构概览

项目采用**模块化架构**，每个功能都是完全内聚的：

```
src/
├── features/              # 功能模块（代码完全内聚）
│   ├── app/              # 应用管理模块（基础功能）
│   │   ├── index.ts      # 模块定义
│   │   ├── tools.ts      # 5 个工具（统一格式）
│   │   ├── handlers.ts   # 业务逻辑
│   │   └── api.ts        # API 调用
│   │
│   └── leaderboard/      # 排行榜模块
│       ├── index.ts      # 模块定义 ⭐
│       ├── tools.ts      # Tools（统一格式）
│       ├── resources.ts  # Resources（统一格式）
│       ├── docs.ts       # 文档数据
│       ├── docTools.ts   # 文档工具
│       ├── handlers.ts   # 业务逻辑
│       └── api.ts        # API 调用
│
├── core/                  # 共享核心代码
│   ├── auth/             # OAuth Device Code Flow
│   ├── network/          # HTTP Client
│   ├── handlers/         # 通用处理器（environment）
│   ├── utils/            # 缓存、日志、文档助手
│   └── types/            # 类型定义
│
└── server.ts              # 自动注册
```

**模块说明**：
- **app**: 基础应用管理（开发者/应用选择、OAuth 授权、环境检查）
- **leaderboard**: 排行榜功能（依赖 app 模块）
- 未来: cloudSave, share 等（都可以复用 app 模块）

---

## 🚀 快速开始

### 使用脚手架（推荐）

```bash
# 1. 运行脚手架脚本
./scripts/create-feature.sh

# 2. 按提示输入
#    Feature Key: cloud-save (kebab-case)
#    Feature Name: 云存档
#    Resources: yes/no
#    Prompts: yes/no

# 3. 自动生成完整模块结构
src/features/cloudSave/
  ├── index.ts      # 模块定义（已包含统一格式）
  ├── tools.ts      # 工具定义（TODO 标记）
  ├── resources.ts  # 资源定义（如选择）
  ├── docs.ts       # 文档内容（如选择）
  ├── docTools.ts   # 文档工具（如选择）
  ├── handlers.ts   # 业务逻辑（含示例）
  └── api.ts        # API 调用（含 ensureAppInfo 示例）

# 4. 参考 TODO 注释实现功能
#    - tools.ts: 定义工具和处理器
#    - handlers.ts: 实现业务逻辑
#    - api.ts: 调用 TapTap API

# 5. 在 server.ts 注册模块
import { cloudSaveModule } from './features/cloudSave/index.js';
const allModules = [
  appModule,
  leaderboardModule,
  cloudSaveModule  // ← 新增
];

# 6. 编译测试
npm run build
node dist/server.js

# 7. 提交
git add src/features/cloudSave
git commit -m "feat: 添加云存档功能"
```

---

## 📋 开发检查清单

添加新功能时，确保：

- [ ] 使用脚手架生成模块结构
- [ ] 实现所有 TODO 标记的内容
- [ ] 工具采用统一格式（`ToolRegistration[]`）
- [ ] 从 `../app/api.js` 导入 `ensureAppInfo()` 获取应用信息
- [ ] 在 server.ts 注册模块
- [ ] 编译无错：`npm run build`
- [ ] 测试启动：`node dist/server.js`
- [ ] 更新 CLAUDE.md（如有新的工具说明）

---

## 🎯 关键设计原则

### 1. 统一格式（v1.2.0-beta.11+，当前 v1.2.0-beta.12）

所有 Tools 和 Resources 采用统一对象数组格式：

```typescript
// Tools 统一格式
export const myTools: ToolRegistration[] = [
  {
    definition: {
      name: 'my_tool',
      description: '...',
      inputSchema: { ... }
    },
    handler: async (args: { param: string }, context) => {
      // 实现逻辑
    }
  }
];

// Resources 统一格式
export const myResources: ResourceRegistration[] = [
  {
    uri: 'docs://my-feature/api',
    name: 'API Doc',
    mimeType: 'text/markdown',
    handler: async () => {
      // 返回文档
    }
  }
];
```

**优势**：
- ✅ 定义和处理器永不不匹配
- ✅ TypeScript 类型安全
- ✅ 易于维护

### 2. 模块依赖规则

```
业务模块 (leaderboard, cloudSave)
    ↓ 可依赖
基础模块 (app)
    ↓ 依赖
核心层 (core)
```

**依赖规则**：
- ✅ 业务模块可依赖 `core/` 和 `features/app/`
- ❌ 业务模块之间不能相互依赖
- ✅ app 模块只依赖 core

### 3. 代码内聚

- 一个功能的所有代码在一个目录
- 不跨目录查找文件
- 模块间通过 core/ 和 app/ 共享代码

---

## 🔧 可复用的核心组件

### HTTP Client

```typescript
import { HttpClient } from '../../core/network/httpClient.js';

const client = new HttpClient();
const result = await client.post('/your-api', {
  body: { ... }
});
```

### App Info（应用信息）

```typescript
import { ensureAppInfo } from '../app/api.js';

const appInfo = await ensureAppInfo(context.projectPath);
// 获得: developer_id, app_id, miniapp_id, app_title, developer_name
```

**注意**：从 v1.2.0-beta.11 开始（当前 v1.2.0-beta.12），应用操作已抽象到独立的 `app` 模块。

### 缓存

```typescript
import { readAppCache, saveAppCache } from '../../core/utils/cache.js';

const cache = readAppCache(projectPath);
saveAppCache({ ...info }, projectPath);
```

### 文档助手

```typescript
import { generateAPIDoc, generateOverview } from '../../core/utils/docHelpers.js';

// 生成 API 文档
const doc = generateAPIDoc(documentation, categoryKey, apiName);

// 生成概览
const overview = generateOverview(documentation);
```

---

## 📚 参考示例

**完整参考**：查看 `src/features/leaderboard/` 模块

特别关注：
- `index.ts` - 模块结构
- `tools.ts` - 统一格式的工具定义
- `resources.ts` - 统一格式的资源定义
- `handlers.ts` - 业务逻辑模式
- `api.ts` - 如何使用 ensureAppInfo

---

## 🔄 技术细节

### 数据流向 - Tools 调用

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
features/[feature]/handlers.ts
    ↓
features/[feature]/api.ts
    ↓
core/network/httpClient.ts
    ↓
TapTap API
```

### 代码度量

当前项目（v1.2.0-beta.12）：

| 模块 | 文件数 | 代码行数 | 说明 |
|------|-------|---------|------|
| app | 4 | ~430 行 | 应用管理基础功能 |
| leaderboard | 7 | ~1350 行 | 排行榜（已分离 app 操作）|
| core | 9 | ~900 行 | 共享核心代码 |
| server.ts | 1 | ~300 行 | 主服务器 |
| **总计** | **21** | **~2980 行** | |

**架构优化成果**：
- ✅ 模块化后清理重复代码
- ✅ app 功能独立，可被其他模块复用
- ✅ 代码内聚度提升，维护更容易

---

## 🎊 享受模块化开发！

模块化架构让添加新功能变得简单快捷！有问题请参考 `src/features/leaderboard/` 示例或查看 CLAUDE.md。
