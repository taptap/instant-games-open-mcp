# 架构文档

本文档详细介绍 TapTap MCP Server 的技术架构设计。

## 目录

1. [模块化架构](#1-模块化架构)
2. [核心设计模式](#2-核心设计模式)
3. [统一格式](#3-统一格式)
4. [私有参数协议](#4-私有参数协议)
5. [缓存系统](#5-缓存系统)
6. [路径解析系统](#6-路径解析系统)
7. [模块依赖规则](#7-模块依赖规则)
8. [代码度量](#8-代码度量)
9. [认证机制](#9-认证机制)

---

## 1. 模块化架构

项目采用**模块化架构设计**，每个功能都是完全内聚的，所有代码都在一个目录中。

### 目录结构

```
src/
├── features/              # 功能模块（代码完全内聚）
│   ├── app/              # 应用管理模块（基础功能）
│   │   ├── index.ts      # 模块定义和注册
│   │   ├── tools.ts      # 5 个工具（统一格式：definition + handler）
│   │   ├── handlers.ts   # 业务逻辑
│   │   └── api.ts        # API 调用
│   │
│   ├── leaderboard/      # 排行榜模块
│   │   ├── index.ts      # 模块定义和注册
│   │   ├── tools.ts      # Tools 定义 + 处理器（统一格式）
│   │   ├── resources.ts  # Resources 定义 + 处理器（统一格式）
│   │   ├── docs.ts       # 文档内容
│   │   ├── docTools.ts   # 文档工具函数
│   │   ├── handlers.ts   # 业务逻辑
│   │   └── api.ts        # API 调用
│   │
│   ├── h5Game/           # H5 游戏模块
│   │   ├── index.ts      # 模块定义
│   │   ├── tools.ts      # 工具定义
│   │   ├── handlers.ts   # 业务逻辑
│   │   ├── api.ts        # API 调用
│   │   └── messages.ts   # 消息常量
│   │
│   ├── vibrate/          # 振动 API 文档模块
│   │   ├── index.ts      # 模块定义
│   │   ├── tools.ts      # 工具定义
│   │   ├── resources.ts  # 资源定义
│   │   ├── docs.ts       # 文档内容
│   │   └── docTools.ts   # 文档工具
│   │
│   └── 未来功能/         # cloudSave/, share/ 等
│
├── core/                  # 跨模块共享代码
│   ├── auth/             # OAuth 2.0 Device Code Flow
│   ├── network/          # HTTP Client（MAC 认证 + 签名）
│   ├── handlers/         # 通用处理器（environment）
│   ├── utils/            # 工具函数（cache, logger, docHelpers, handlerHelpers）
│   └── types/            # 类型定义（ToolRegistration, ResourceRegistration, PrivateToolParams 等）
│
└── server.ts              # 主服务器（自动注册所有模块）

bin/
└── minigame-open-mcp      # NPM 可执行入口点
```

### 架构分层

#### 功能模块层（`src/features/`）

功能模块是业务逻辑的主要容器，每个模块都是完全内聚的：

- **app 模块** - 基础应用管理模块
  - 开发者和应用选择
  - OAuth 2.0 授权流程
  - 环境配置检查
  - 为其他模块提供应用信息

- **leaderboard 模块** - 排行榜功能
  - 排行榜管理工具（创建、发布、查询）
  - 排行榜 API 文档 Resources
  - 用户分数查询

- **h5Game 模块** - H5 游戏管理
  - H5 游戏信息收集
  - 游戏包上传和发布
  - 游戏创建和状态查询

- **vibrate 模块** - 振动 API 文档
  - 振动功能接入指引
  - 完整的 API 文档 Resources
  - 最佳实践和使用模式

- **未来模块** - cloudSave（云存档）、share（分享）等

#### 核心共享层（`src/core/`）

核心层提供跨模块的共享功能：

- **auth/** - 认证机制
  - OAuth 2.0 Device Code Flow
  - 懒加载授权（首次使用时自动触发）
  - Token 持久化

- **network/** - 网络通信
  - HttpClient 类（统一 HTTP 请求接口）
  - MAC Token 认证
  - 请求签名（X-Tap-Sign）
  - 支持动态 Token（多账号场景）

- **handlers/** - 通用处理器
  - Environment 工具（检查环境配置）
  - 跨模块复用的处理逻辑

- **utils/** - 工具函数
  - 缓存管理（cache.ts）
  - 日志系统（logger.ts）
  - 文档助手（docHelpers.ts）
  - 处理器助手（handlerHelpers.ts）
  - 路径解析（pathResolver.ts）

- **types/** - 类型定义
  - ToolRegistration（工具注册格式）
  - ResourceRegistration（资源注册格式）
  - PrivateToolParams（私有参数协议）

#### 服务器层

- **`src/server.ts`** - MCP 服务器主入口
  - 自动注册所有功能模块
  - 处理 MCP 协议请求
  - 私有参数提取和注入
  - 智能 OAuth 授权流程

- **`bin/minigame-open-mcp`** - NPM 可执行入口
  - 支持 stdio、SSE、HTTP 三种传输模式
  - 环境变量配置
  - 进程管理

### 架构优势

- ✅ **代码内聚** - 每个功能的所有代码在一个目录
- ✅ **独立开发** - 多人可并行开发不同功能
- ✅ **自动注册** - 添加新功能只需导入模块
- ✅ **易于维护** - 清晰的模块边界
- ✅ **基础功能复用** - app 模块可被其他模块复用

---

## 2. 核心设计模式

### 代码内聚原则

每个功能模块的所有代码都在一个目录中：
- 不跨目录查找文件
- 模块间通过 `core/` 和 `app/` 共享代码
- 新增功能只需添加一个目录

### 自动注册机制

服务器自动注册所有功能模块，无需手动配置：

```typescript
// server.ts
import { appModule } from './features/app/index.js';
import { leaderboardModule } from './features/leaderboard/index.js';

const allModules = [
  appModule,
  leaderboardModule
  // 新增模块只需在这里添加
];

// 自动注册所有 Tools
allModules.forEach(module => {
  module.tools.forEach(tool => {
    server.setRequestHandler(CallToolRequestSchema, tool.handler);
  });
});

// 自动注册所有 Resources
allModules.forEach(module => {
  module.resources.forEach(resource => {
    server.setRequestHandler(ReadResourceRequestSchema, resource.handler);
  });
});
```

### 懒加载 OAuth

OAuth 授权采用懒加载机制，只在第一次调用需要认证的工具时触发：

```typescript
// 工具定义时标记是否需要认证
{
  definition: { name: 'create_leaderboard', ... },
  handler: async (args, context) => { ... },
  requiresAuth: true  // 标记需要认证
}

// 服务器层自动处理
if (tool.requiresAuth) {
  await ensureAuth(context);  // 自动触发 OAuth
}
```

### 数据流向

#### Tools 调用流程

```
MCP Client (Claude Code/VSCode/Cursor)
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

#### Resources 读取流程

```
MCP Client
    ↓
MCP Protocol: resources/read
    ↓
server.ts → 自动路由
    ↓
查找模块中的 resource.handler
    ↓
执行 handler()
    ↓
features/[feature]/docs.ts
    ↓
返回文档内容
```

---

## 3. 统一格式

从 v1.2.0-beta.11 开始，所有 Tools 和 Resources 采用统一的对象数组格式。

### Tools 统一格式

```typescript
export const myTools: ToolRegistration[] = [
  {
    definition: {
      name: 'my_tool',
      description: 'Tool description...',
      inputSchema: {
        type: 'object',
        properties: {
          param: { type: 'string' }
        },
        required: ['param']
      }
    },
    handler: async (args: { param: string }, context) => {
      // 实现逻辑
      return 'Result...';
    },
    requiresAuth: true  // 可选，是否需要认证
  }
];
```

**类型定义**：

```typescript
export interface ToolRegistration {
  definition: {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  handler: (args: any, context: ToolContext) => Promise<string>;
  requiresAuth?: boolean;
}
```

### Resources 统一格式

```typescript
export const myResources: ResourceRegistration[] = [
  {
    uri: 'docs://my-feature/api',
    name: 'API Documentation',
    mimeType: 'text/markdown',
    description: 'API documentation for my feature',
    handler: async () => {
      // 返回文档内容
      return '# API Documentation\n\n...';
    }
  }
];
```

**类型定义**：

```typescript
export interface ResourceRegistration {
  uri: string;
  name: string;
  mimeType: string;
  description?: string;
  handler: () => Promise<string>;
}
```

### 优势

- ✅ **定义和处理器永不不匹配** - 在同一个对象中
- ✅ **TypeScript 类型安全** - 参数类型自动推导
- ✅ **易于维护** - 一个地方修改所有相关代码
- ✅ **自动注册** - 遍历数组即可注册

---

## 4. 私有参数协议

从 v1.3.0 开始，支持 MCP Proxy 模式的多账号认证，对 AI Agent 和业务层完全透明。

### 设计目标

- AI Agent 无需感知私有参数
- 业务层代码保持简洁
- 支持双模式注入（参数 + Header）

### 实现方案

服务器层是唯一处理私有参数的地方，使用 `ResolvedContext` 进行统一封装：

```typescript
// Server 层（src/server.ts）
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  // 1. 从 HTTP Headers 提取私有参数（仅 HTTP/SSE 模式）
  let enrichedArgs = args || {};
  if (extra?.requestInfo?.headers) {
    enrichedArgs = extractPrivateParamsFromHeaders(enrichedArgs, extra.requestInfo.headers);
  }

  // 2. 构建 ResolvedContext（合并 args + baseContext）
  // baseContext 来自 Session 闭包（userId, projectId）
  const ctx = new ResolvedContext(enrichedArgs, baseContext);

  // 3. 移除私有参数，业务层不可见
  const businessArgs = stripPrivateParams(enrichedArgs);

  // 4. 调用业务层（传入 context）
  const result = await toolReg.handler(businessArgs, ctx);

  return result;
});
```

业务层代码完全不感知私有参数，通过 Context 访问：

```typescript
// 业务层（features/leaderboard/handlers.ts）
handler: async (args: { page: number }, context: ResolvedContext) => {
  // 通过 context 获取认证和应用信息
  const token = context.resolveToken();
  const app = context.resolveApp();
  
  // 简洁的业务逻辑
  return api.listLeaderboards(args, context);
}
```

### 双模式注入

#### 参数注入（MCP Proxy）

```json
{
  "name": "list_leaderboards",
  "arguments": {
    "page": 1,
    "_mac_token": {
      "kid": "user123",
      "mac_key": "secret",
      "mac_algorithm": "hmac-sha-1",
      "token_type": "mac"
    },
    "_project_path": "/path/to/project"
  }
}
```

#### Header 注入（API Gateway）

```http
POST /tools/call
X-TapTap-Mac-Token: {"kid":"user123","mac_key":"secret",...}
X-TapTap-Project-Path: /path/to/project
Content-Type: application/json

{
  "name": "list_leaderboards",
  "arguments": {
    "page": 1
  }
}
```

详见：[docs/PROXY.md](PROXY.md)

---

## 5. 缓存系统

从 v1.4.1 开始，缓存系统完全独立于 workspace，支持只读挂载。

### 缓存目录结构

```bash
# 全局缓存（无 _project_path）
/tmp/taptap-mcp/cache/global/app.json

# 租户缓存（通过 _project_path 隔离）
/tmp/taptap-mcp/cache/{userId}/{projectId}/app.json
```

### 临时文件目录

```bash
# H5 游戏压缩包等
/tmp/taptap-mcp/temp/{userId}/{projectId}/game-{timestamp}.zip
```

### 缓存内容

应用信息缓存（`app.json`）：

```json
{
  "developer_id": "123",
  "developer_name": "My Studio",
  "app_id": "456",
  "app_title": "My Game",
  "miniapp_id": "789"
}
```

### 特性

- ✅ **独立于 workspace** - 支持只读挂载
- ✅ **自动缓存** - developer_id 和 app_id
- ✅ **自动获取** - 通过 `/level/v1/list` API
- ✅ **租户隔离** - 通过 _project_path 隔离数据
- ✅ **自动清理** - 临时文件上传后自动删除

### 环境变量配置

- `TAPTAP_MCP_CACHE_DIR` - 缓存根目录（默认 `/tmp/taptap-mcp/cache`）
- `TAPTAP_MCP_TEMP_DIR` - 临时文件根目录（默认 `/tmp/taptap-mcp/temp`）

### API

```typescript
import { readAppCache, saveAppCache } from '../../core/utils/cache.js';

// 读取缓存
const cache = readAppCache(projectPath);
// 返回: { developer_id, developer_name, app_id, app_title, miniapp_id } | null

// 保存缓存
saveAppCache({
  developer_id: '123',
  developer_name: 'My Studio',
  app_id: '456',
  app_title: 'My Game',
  miniapp_id: '789'
}, projectPath);
```

---

## 6. 路径解析系统

路径解析系统处理用户输入的路径，支持绝对路径和相对路径。

### 常见问题

详见：[docs/PATH_RESOLUTION.md](PATH_RESOLUTION.md)

### 最佳实践

1. **推荐使用绝对路径**
   ```typescript
   path: '/Users/username/project/dist'
   ```

2. **相对路径需要 WORKSPACE_ROOT**
   ```json
   {
     "env": {
       "WORKSPACE_ROOT": "${workspaceFolder}"
     }
   }
   ```

3. **启用详细日志调试**
   ```bash
   TAPTAP_MCP_VERBOSE=true npm start
   ```

---

## 7. 模块依赖规则

### 依赖层次

```
业务模块 (leaderboard, cloudSave)
    ↓ 可依赖
基础模块 (app)
    ↓ 依赖
核心层 (core)
```

### 规则

- ✅ **业务模块** 可依赖 `core/` 和 `features/app/`
- ❌ **业务模块之间** 不能相互依赖
- ✅ **app 模块** 只依赖 core，不依赖其他业务模块

### 示例

```typescript
// ✅ 正确：leaderboard 依赖 app
import { ensureAppInfo } from '../app/api.js';

// ✅ 正确：leaderboard 依赖 core
import { HttpClient } from '../../core/network/httpClient.js';

// ❌ 错误：leaderboard 依赖 cloudSave
import { saveGame } from '../cloudSave/api.js';  // 不允许
```

### 可复用的核心组件

#### HTTP Client

```typescript
import { HttpClient } from '../../core/network/httpClient.js';

const client = new HttpClient();
const result = await client.post('/your-api', {
  body: { ... }
});
```

#### App Info（应用信息）

```typescript
import { ensureAppInfo } from '../app/api.js';

const appInfo = await ensureAppInfo(context.projectPath);
// 获得: developer_id, app_id, miniapp_id, app_title, developer_name
```

#### 缓存

```typescript
import { readAppCache, saveAppCache } from '../../core/utils/cache.js';

const cache = readAppCache(projectPath);
saveAppCache({ ...info }, projectPath);
```

#### 文档助手

```typescript
import { generateAPIDoc, generateOverview } from '../../core/utils/docHelpers.js';

// 生成 API 文档
const doc = generateAPIDoc(documentation, categoryKey, apiName);

// 生成概览
const overview = generateOverview(documentation);
```

---

## 8. 代码度量

当前项目统计：

| 模块 | 文件数 | 代码行数 | 说明 |
|------|-------|---------|------|
| **app** | 4 | ~430 行 | 应用管理基础功能 |
| **leaderboard** | 7 | ~1350 行 | 排行榜（已分离 app 操作）|
| **h5Game** | 5 | ~600 行 | H5 游戏管理 |
| **vibrate** | 6 | ~300 行 | 振动 API 文档 |
| **core** | 10 | ~1100 行 | 共享核心代码 |
| **server.ts** | 1 | ~450 行 | 主服务器（支持 SSE/HTTP）|
| **总计** | **33** | **~4230 行** | |

### 架构优化成果

- ✅ 模块化后清理重复代码
- ✅ app 功能独立，可被其他模块复用
- ✅ 代码内聚度提升，维护更容易
- ✅ 支持 SSE 流式响应和多传输协议

---

## 9. 认证机制

项目支持双层认证：MAC Token 认证 + 请求签名。

### MAC Token 认证

每个请求的 Authorization header 使用 MAC 认证：

```
MAC id="kid", ts="timestamp", nonce="random", mac="hmac_sha1_signature"
```

#### 签名基础字符串格式

```
timestamp\n
nonce\n
method\n
uri\n
host\n
port\n
\n
```

使用 `mac_key` 进行 HMAC-SHA1 签名。

#### 实现示例

```typescript
import crypto from 'crypto';

function generateMACAuth(
  macToken: MacToken,
  method: string,
  uri: string,
  host: string,
  port: number
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(8).toString('hex');

  // 构建签名基础字符串
  const baseString = [
    timestamp,
    nonce,
    method.toUpperCase(),
    uri,
    host,
    port.toString(),
    '',
    ''
  ].join('\n');

  // HMAC-SHA1 签名
  const mac = crypto
    .createHmac('sha1', macToken.mac_key)
    .update(baseString)
    .digest('base64');

  // 构建 Authorization header
  return `MAC id="${macToken.kid}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
}
```

### 请求签名（X-Tap-Sign）

每个请求还需要 X-Tap-Sign header：

```
HMAC-SHA256(method\nurl\nx-tap-headers\nbody\n, CLIENT_SECRET)
```

#### 实现示例

```typescript
function generateRequestSign(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  clientSecret: string
): string {
  // 提取 x-tap-* headers 并排序
  const tapHeaders = Object.keys(headers)
    .filter(k => k.toLowerCase().startsWith('x-tap-'))
    .sort()
    .map(k => `${k.toLowerCase()}:${headers[k]}`)
    .join('\n');

  // 构建签名字符串
  const signString = [
    method.toUpperCase(),
    url,
    tapHeaders,
    body,
    ''
  ].join('\n');

  // HMAC-SHA256 签名
  return crypto
    .createHmac('sha256', clientSecret)
    .update(signString)
    .digest('hex');
}
```

### OAuth 2.0 Device Code Flow

项目支持零配置的 OAuth 2.0 Device Code Flow：

1. **用户首次调用需要认证的工具**
2. **自动触发授权流程**
   - 生成 device code 和 user code
   - 返回二维码和授权链接
3. **用户扫码授权**
4. **轮询获取 token**
   - SSE 模式：自动轮询
   - stdio/HTTP 模式：调用 `complete_oauth_authorization` 工具
5. **Token 持久化**
   - 保存到 `~/.config/taptap-minigame/token.json`

### 环境变量

#### 认证相关（可选）

- `TAPTAP_MCP_MAC_TOKEN` - 用户 MAC Token（JSON 格式）
  - 不配置则使用 OAuth 2.0
  - Token 自动保存到本地

#### 客户端配置（可选）

- `TAPTAP_MCP_CLIENT_ID` - 客户端 ID（非必需，不配置会导致部分工具无法使用）
- `TAPTAP_MCP_CLIENT_SECRET` - 请求签名密钥（非必需，不配置会导致部分工具无法使用）

---

## 总结

TapTap MCP Server 的架构设计具有以下特点：

1. **模块化** - 功能完全内聚，易于扩展
2. **统一格式** - Tools 和 Resources 采用一致的注册格式
3. **私有参数协议** - 支持 MCP Proxy 多账号场景
4. **独立缓存** - 支持只读 workspace 部署
5. **路径解析** - 智能处理绝对和相对路径
6. **清晰依赖** - 严格的模块依赖规则
7. **双层认证** - MAC Token + 请求签名
8. **OAuth 懒加载** - 零配置的认证体验

更多信息请参考：
- [开发指南](../CONTRIBUTING.md)
- [MCP Proxy 开发指引](PROXY.md)
- [路径解析说明](PATH_RESOLUTION.md)
