# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 全局工作指引

**重要：Claude Code 在此项目中的工作规范**

### 📝 文档更新规则

- **自动更新文档**：当有重要代码改动时（新特性、架构变更、API 修改），必须同时更新：
  - `CLAUDE.md` - 开发指南和技术文档
  - `README.md` - 用户文档和使用说明
  - `CHANGELOG.md` - 版本变更记录
  - **不需要每次都问用户是否更新文档，主动更新即可**

### 💾 Git 提交规则

- **使用 Conventional Commits 规范**：项目已配置自动化 CI/CD，commit 消息格式至关重要
  - `feat:` - 新功能（触发 minor 版本升级）
  - `fix:` - Bug 修复（触发 patch 版本升级）
  - `feat!:` 或 `fix!:` - 破坏性变更（触发 major 版本升级）
  - `docs:` - 文档更新（不触发发布）
  - `refactor:` - 代码重构（触发 patch 版本升级）
  - `chore:` - 构建/工具/配置更新（不触发发布）
  - `test:` - 测试相关（不触发发布）
  - `ci:` - CI 配置更新（不触发发布）

- **Commit Message 最佳实践**：
  - Subject 长度：5-100 字符
  - 使用祈使句："add feature" 而不是 "added feature"
  - 不要以句号结尾
  - 示例：
    - `feat(leaderboard): add score submission API`
    - `fix(auth): resolve token refresh issue`
    - `feat!: change API endpoint structure`

- **分支工作流**：
  - ❌ **不要直接 commit 到 main 分支**（已配置分支保护）
  - ✅ **创建 feature/fix 分支** → 提交代码 → 创建 PR
  - ✅ **PR 合并后自动触发发布**（由 semantic-release 处理）

### 🎯 工作流程

```
feature 分支开发 → git commit (规范格式) → git push → 创建 PR
→ CI 检查 → Code Review → Merge PR → 自动发布 → 更新文档
```

**完整的自动发布流程**：
1. **PR 合并到 main** - 触发 GitHub Actions
2. **分析 commits** - semantic-release dry-run 确定版本号
3. **创建 release 分支** - `release/vX.X.X`
4. **发布到 npm** - 在 release 分支更新版本
5. **生成 CHANGELOG** - 自动生成版本说明
6. **自动创建 PR** - release 分支 → main
7. **自动合并 PR** - 符合 trunk-guard 要求
8. **创建 GitHub Release** - 添加 tag 和 release notes

**重要注意事项**：
- ✅ **始终在 feature/fix 分支工作**，不要直接 commit 到 main
- ✅ **Commit 类型决定版本号**：
  - `feat:` → minor 版本 (1.2.0 → 1.3.0)
  - `fix:` → patch 版本 (1.2.0 → 1.2.1)
  - `feat!:` / `fix!:` → major 版本 (1.2.0 → 2.0.0)
  - `docs:` / `ci:` / `chore:` → 不触发发布
- ✅ **发布完全自动化**，无需人工干预
- ✅ **符合组织 Ruleset**，所有更改通过 PR

## 项目概述

这是一个基于 Model Context Protocol (MCP) 的 TapTap Open API MCP 服务器。项目为 **TapTap Minigame 和 H5 游戏**提供完整的排行榜 API 文档和服务端管理功能。

**核心特性：**
- 🏆 **排行榜系统** - 完整的排行榜 API 文档和服务端管理
- 🎮 **H5 游戏管理** - H5 游戏上传、发布、状态查询
- 🔐 **OAuth 2.0 Device Code Flow** - 零配置认证（扫码即用，SSE 模式支持自动授权）
- 🎯 **完整功能集** - 17 Tools + 7 Resources
- 🌍 **双平台支持** - Minigame & H5 游戏
- 🚀 **MCP 2025 标准** - Streamable HTTP + RFC 5424 Logging
- 📡 **三种传输协议** - stdio（本地）+ SSE（远程/实时）+ HTTP JSON（兼容）
- 🔌 **多客户端并发** - 独立会话管理，无限并发

**未来计划：**
- ☁️ 云存档系统
- 👥 好友系统
- 更多 Open API 功能

**官方 API 文档：** https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/

**NPM 包：** `@mikoto_zero/minigame-open-mcp`

**当前版本：** v1.4.8

**主要特性：**
- 17 tools + 7 resources（应用管理 + 排行榜 + H5 游戏）
- OAuth 2.0 Device Code Flow（SSE 模式支持自动授权）
- 三种传输协议（stdio + SSE Streaming + HTTP JSON）
- 多客户端并发支持（独立会话管理）
- 🆕 **私有参数协议** - 支持 MCP Proxy 多账号认证（双模式注入）
- MCP Logging 规范（RFC 5424）+ 连接日志
- MCP SDK 1.20.2

## 架构概览

项目采用**模块化架构设计**：

### 功能模块层
- **`src/features/`** - 功能模块（代码完全内聚）
  - `app/` - **应用管理模块（基础功能）**
    - `index.ts` - 模块定义和注册
    - `tools.ts` - 5 个工具（统一格式：definition + handler）
    - `handlers.ts` - 业务逻辑
    - `api.ts` - API 调用
  - `leaderboard/` - **排行榜模块**
    - `index.ts` - 模块定义和注册
    - `tools.ts` - Tools 定义 + 处理器（统一格式）
    - `resources.ts` - Resources 定义 + 处理器（统一格式）
    - `docs.ts` - 文档内容
    - `docTools.ts` - 文档工具函数
    - `handlers.ts` - 业务逻辑
    - `api.ts` - API 调用
  - 未来: `cloudSave/`, `share/` 等

### 核心共享层
- **`src/core/`** - 跨模块共享代码
  - `auth/` - OAuth 2.0 Device Code Flow
  - `network/` - HTTP Client（MAC 认证 + 签名，支持动态 Token）
  - `handlers/` - 通用处理器（environment）
  - `utils/` - 工具函数（cache, logger, docHelpers, handlerHelpers）
  - `types/` - 类型定义（ToolRegistration, ResourceRegistration, PrivateToolParams 等）

### 服务器层
- **`src/server.ts`** - 主服务器（自动注册所有模块）
- **`bin/minigame-open-mcp`** - NPM 可执行入口点

### 架构优势
- ✅ **代码内聚** - 每个功能的所有代码在一个目录
- ✅ **独立开发** - 多人可并行开发不同功能
- ✅ **自动注册** - 添加新功能只需导入模块
- ✅ **易于维护** - 清晰的模块边界
- ✅ **基础功能复用** - app 模块可被其他模块复用

### 关键设计模式

**1. 统一格式**
- Tools 和 Resources 采用统一对象数组格式
- 每个工具包含 `definition` + `handler`，永不不匹配
- 类型安全的参数定义

```typescript
// Tools 统一格式
export const myTools: ToolRegistration[] = [
  {
    definition: { name: 'my_tool', ... },
    handler: async (args: { param: string }, context) => { ... }
  }
];

// Resources 统一格式
export const myResources: ResourceRegistration[] = [
  {
    uri: 'docs://my-feature/api',
    name: 'API Doc',
    handler: async () => { ... }
  }
];
```

**2. 模块依赖规则**
```
业务模块 (leaderboard, cloudSave)
    ↓ 可依赖
基础模块 (app)
    ↓ 依赖
核心层 (core)
```

- ✅ 业务模块可依赖 `core/` 和 `features/app/`
- ❌ 业务模块之间不能相互依赖
- ✅ app 模块只依赖 core，不依赖其他业务模块

**3. 私有参数协议**（v1.3.0 新增）

支持 MCP Proxy 模式的多账号认证，对 AI Agent 和业务层完全透明：

```typescript
// Server 层（唯一处理私有参数的地方）
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  // 1. 提取私有参数（从 arguments 或 HTTP Header）
  // 2. 合并到 context
  const effectiveContext = getEffectiveContext(enrichedArgs, baseContext);
  // 3. 移除私有参数，业务层不可见
  const businessArgs = stripPrivateParams(enrichedArgs);
  // 4. 调用业务层
  await toolReg.handler(businessArgs, effectiveContext);
});

// 业务层（完全不感知私有参数）
handler: async (args: { page: number }, context) => {
  return api.foo(args, context);  // 简洁
}
```

**双模式注入：**
- 参数注入：`arguments._mac_token`（MCP Proxy）
- Header 注入：`X-TapTap-Mac-Token`（API Gateway）

详见：[docs/PRIVATE_PROTOCOL.md](docs/PRIVATE_PROTOCOL.md)

## 常用命令

### 开发环境设置
```bash
# 确保安装了 Node.js 16+
node --version
npm --version

# 安装项目依赖
npm install

# 全局安装使用
npm install -g @mikoto_zero/minigame-open-mcp
```

### 快速启动（npm scripts）

```bash
# stdio 模式（默认，本地开发）
npm start                  # 或 npm run dev

# SSE 模式（远程部署，推荐用于 OpenHands）
npm run serve:sse          # 基础模式（端口 3000）
npm run serve:sse:dev      # 开发模式（详细日志）

# HTTP JSON 模式（兼容普通 HTTP 客户端）
npm run serve:http         # 端口 3000

# 自定义端口和环境
TDS_MCP_PORT=8080 npm run serve:sse       # SSE 模式，端口 8080
TDS_MCP_VERBOSE=true npm run serve:http   # HTTP 模式，启用日志
```

### 启动服务器（传统方式）

#### 传输协议选择

MCP 服务器支持**三种传输模式**：

| 模式 | 适用场景 | 响应格式 | 授权方式 | 进度反馈 | 多客户端 |
|------|---------|---------|---------|---------|---------|
| **stdio** | 本地集成（单客户端）、Claude Desktop、Cursor、VSCode | N/A | 两步式 | ❌ | N/A |
| **sse** | 远程部署、多客户端、**OpenHands**、Claude Code、Cursor、VSCode | SSE 流 | **一步式自动** | ✅ 实时 | ✅ |
| **http** | 普通 HTTP 客户端、不支持 SSE 的场景 | JSON | 两步式 | ❌ | ✅ |

```bash
# ========== stdio 模式（默认，最大兼容性）==========

# 开发模式启动
npm run dev

# 通过 npx 直接运行（推荐）
npx @mikoto_zero/minigame-open-mcp

# 启用详细日志
TDS_MCP_VERBOSE=true npm start

# ========== SSE 流式模式（推荐用于 OpenHands）==========

# 基础启动（SSE 流式响应 + 自动授权）
TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3000 npm start

# SSE 模式 + 详细日志
TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3000 TDS_MCP_VERBOSE=true npm start

# 特性：
# - ✅ 实时进度推送（压缩、上传、授权等）
# - ✅ 一步式自动授权（无需手动调用 complete_oauth_authorization）
# - ✅ 多客户端并发支持
# - ✅ 客户端连接日志

# ========== HTTP JSON 模式（兼容普通 HTTP 客户端）==========

# JSON 单次响应模式
TDS_MCP_TRANSPORT=http TDS_MCP_PORT=3000 npm start

# 特性：
# - ✅ 返回 JSON 响应（Content-Type: application/json）
# - ❌ 无实时进度（但功能完整）
# - ✅ 两步式授权（避免长时间阻塞）
# - ✅ 多客户端并发支持
```

**Streamable HTTP 模式 Endpoints：**
- MCP 请求：`GET/POST http://localhost:3000/` (统一 endpoint)
- 健康检查：`GET http://localhost:3000/health`
  - 返回活跃会话数、工具数、资源数等信息

**重要说明**：
- MCP SDK 要求客户端 Accept header 必须包含：`application/json, text/event-stream`
- 服务器根据 `TDS_MCP_TRANSPORT` 决定实际返回格式（JSON 或 SSE）
- SSE 模式下支持智能自动授权，HTTP 模式保持两步式授权

### 环境变量说明

#### 认证相关（可选 - 推荐使用 OAuth）

- `TDS_MCP_MAC_TOKEN`: 用户 MAC Token（JSON 格式，可选）
  - 不配置则使用 OAuth 2.0 Device Code Flow
  - Token 自动保存到 `~/.config/taptap-minigame/token.json`

#### 客户端配置（可选 - 已内置默认值）

- `TDS_MCP_CLIENT_ID`: 客户端 ID（已内置，一般无需配置）
- `TDS_MCP_CLIENT_TOKEN`: 请求签名密钥（**必需**，已内置默认值）

#### 环境和传输（可选）

- `TDS_MCP_ENV`: 环境选择（默认 `production`）
  - `production`: https://agent.tapapis.cn
  - `rnd`: https://agent.api.xdrnd.cn
- `TDS_MCP_VERBOSE`: 详细日志模式（`true` 或 `false`，默认 `false`）
- `TDS_MCP_TRANSPORT`: 传输协议（`stdio` / `sse` / `http`，默认 `stdio`）
- `TDS_MCP_PORT`: HTTP/SSE 模式端口（默认 `3000`）

#### 缓存和临时文件（v1.4.1+，可选）

- `TDS_MCP_CACHE_DIR`: 缓存根目录（默认 `/tmp/taptap-mcp/cache`）
  - 应用信息缓存存储位置，独立于 workspace
  - 支持只读 workspace 部署
- `TDS_MCP_TEMP_DIR`: 临时文件根目录（默认 `/tmp/taptap-mcp/temp`）
  - H5 游戏压缩包等临时文件存储位置
  - 上传完成后自动清理
- ~~`TDS_MCP_PROJECT_PATH`~~: 已废弃，v1.4.1+ 不再使用

### 测试和验证
```bash
# 编译检查
npm run build

# 代码检查
npm run lint

# 格式化代码
npm run format

# 测试服务器启动
TDS_MCP_MAC_TOKEN='{"kid":"test","token_type":"mac","mac_key":"test","mac_algorithm":"hmac-sha-1"}' \
TDS_MCP_CLIENT_ID=test \
TDS_MCP_CLIENT_TOKEN=test \
node dist/server.js
```

## MCP 集成配置

### Claude Desktop 集成
在 `~/.config/claude-desktop/config.json` 中添加：
```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TDS_MCP_MAC_TOKEN": "{\"kid\":\"your_kid\",\"token_type\":\"mac\",\"mac_key\":\"your_key\",\"mac_algorithm\":\"hmac-sha-1\"}",
        "TDS_MCP_CLIENT_ID": "your_client_id",
        "TDS_MCP_CLIENT_TOKEN": "your_secret",
        "TDS_MCP_VERBOSE": "false"
      }
    }
  }
}
```

**开启调试模式：**
```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TDS_MCP_MAC_TOKEN": "{\"kid\":\"your_kid\",\"token_type\":\"mac\",\"mac_key\":\"your_key\",\"mac_algorithm\":\"hmac-sha-1\"}",
        "TDS_MCP_CLIENT_ID": "your_client_id",
        "TDS_MCP_CLIENT_TOKEN": "your_secret",
        "TDS_MCP_VERBOSE": "true"
      }
    }
  }
}
```

**注意**: 完全零安装，通过 npx 自动下载和运行！

### 工具分类（17 Tools）

#### 🎯 流程指引工具（1个）
- **`get_integration_guide`** ⭐ 完整接入工作流指引
  - 返回从零到生产的完整步骤
  - 强调客户端无需安装 SDK
  - 列出所有可用的 Resources（API 文档）
  - **推荐：AI 在开始接入前必读**

#### 📱 信息查询工具（2个）
- **`get_current_app_info`** - 获取当前选择的应用信息
  - 返回 developer_id, app_id, miniapp_id, app_name
  - 用于确认当前操作的应用
  - 用于构建预览链接

- **`check_environment`** - 检查环境配置和认证状态
  - 检查环境变量和本地文件中的 token
  - 显示认证状态和可用功能

#### 🔐 认证工具（1个）
- **`complete_oauth_authorization`** - 完成 OAuth 授权
  - 用户扫码后调用此工具完成授权
  - 轮询获取授权结果并保存 token
  - 配合懒加载 OAuth 流程使用

#### 📁 应用管理工具（2个）
- **`list_developers_and_apps`** - 列出所有开发者和应用
  - 显示 miniapp_id 用于构建预览链接
  - 自动检测多应用场景

- **`select_app`** - 选择要使用的应用
  - 缓存选择，后续操作自动使用

#### ⚙️ 排行榜管理工具（4个）
- **`create_leaderboard`** - 创建新排行榜
  - 自动获取 developer_id 和 app_id
  - 支持所有配置参数
  - 返回 leaderboard_id

- **`list_leaderboards`** - 列出所有排行榜
  - 显示排行榜 ID 和配置
  - 支持分页

- **`publish_leaderboard`** - 发布排行榜
  - 控制排行榜可见性

- **`get_user_leaderboard_scores`** - 获取用户分数数据

### Resources 分类（7 Resources）

#### 📖 API 详细文档（6个）
每个 Resource 提供一个 LeaderboardManager API 的完整文档：
- **`docs://leaderboard/api/get-manager`** - tap.getLeaderboardManager()
- **`docs://leaderboard/api/open`** - openLeaderboard()
- **`docs://leaderboard/api/submit-scores`** - submitScores()
- **`docs://leaderboard/api/load-scores`** - loadLeaderboardScores()
- **`docs://leaderboard/api/load-player-score`** - loadCurrentPlayerLeaderboardScore()
- **`docs://leaderboard/api/load-centered-scores`** - loadPlayerCenteredScores()

#### 📚 概览文档（1个）
- **`docs://leaderboard/overview`** - 所有 API 的完整概览

**使用说明**：
- Claude Code：AI 会自动读取这些 Resources
- VSCode/Cursor：如果不支持，使用 `get_integration_guide` Tool 中的代码示例

## 日志和调试

### 详细日志模式

项目支持详细日志模式，通过环境变量 `TDS_MCP_VERBOSE` 控制。

**启用方式：**
```bash
# 启用详细日志
export TDS_MCP_VERBOSE=true
# 或
export TDS_MCP_VERBOSE=1

# 然后启动服务器
npm start
```

**日志内容：**

1. **工具调用日志** - 记录每个 MCP 工具的调用
   - 工具名称和时间戳
   - 输入参数（完整 JSON）
   - 输出结果（前 500 字符）
   - 执行状态（成功/失败）

2. **HTTP 请求日志** - 记录所有 TapTap API 请求
   - 请求方法和 URL
   - 请求头（敏感信息已脱敏）
   - 请求体
   - 请求时间戳

3. **HTTP 响应日志** - 记录所有 API 响应
   - 响应状态码和状态文本
   - 响应体（完整 JSON）
   - 响应时间戳
   - 成功/失败标识

**日志格式示例：**
```
================================================================================
[2025-01-15T10:30:45.123Z] [TOOL CALL] create_leaderboard
================================================================================
📥 Input:
{
  "name": "Weekly Ranking",
  "score_type": "better_than"
}

--------------------------------------------------------------------------------
[2025-01-15T10:30:45.456Z] [TOOL RESPONSE] create_leaderboard - ✅ SUCCESS
--------------------------------------------------------------------------------
📤 Output:
Leaderboard created successfully!
Leaderboard ID: 123456
================================================================================

================================================================================
[2025-01-15T10:30:45.500Z] [HTTP REQUEST] POST /level/v1/create
================================================================================
📤 Headers:
{
  "Content-Type": "application/json",
  "Authorization": "MAC id=\"abc123\", ts=\"1234567890\", nonce=\"random123\", mac=\"***\"",
  "X-Tap-Sign": "***"
}
📤 Body:
{"name":"Weekly Ranking","score_type":"better_than"}

--------------------------------------------------------------------------------
[2025-01-15T10:30:45.789Z] [HTTP RESPONSE] POST /level/v1/create - 200 OK ✅
--------------------------------------------------------------------------------
📥 Response:
{
  "success": true,
  "data": {
    "leaderboard_id": "123456"
  }
}
================================================================================
```

**安全性：**
- MAC Token 的 `mac` 字段自动脱敏为 `***`
- `X-Tap-Sign` 签名自动脱敏为 `***`
- 其他敏感信息根据需要进行脱敏

**使用场景：**
- 开发和调试新功能
- 排查 API 调用问题
- 了解请求和响应的完整内容
- 验证认证和签名是否正确

## 开发注意事项

### 代码规范
- 使用 TypeScript 进行类型安全的开发
- 所有异步函数使用 `async/await` 语法
- 遵循 ESLint 规则和 Prettier 格式化标准
- 为所有函数和接口添加 JSDoc 注释

### MCP 工具开发
- 工具处理函数必须返回 `Promise<string>` 类型
- 新增工具需要在 `src/server.ts` 中注册工具定义和处理函数
- 工具定义需要包含完整的 JSON Schema 输入验证
- 工具描述使用英文，包含使用场景说明
- 服务器使用 stdio 通信模式，适配 Claude Desktop 等 MCP 客户端

### 网络请求开发
- 所有 API 请求必须通过 `HttpClient` 类发送
- HttpClient 自动处理：
  - MAC Token 认证（Authorization header）
  - 请求签名（X-Tap-Sign header）
  - 环境 URL 切换
  - 错误处理和超时控制
- 新增 API 只需调用 `client.get()` 或 `client.post()`

### 认证机制

#### MAC Token 认证
每个请求的 Authorization header 使用 MAC 认证：
```
MAC id="kid", ts="timestamp", nonce="random", mac="hmac_sha1_signature"
```

签名基础字符串格式：
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

#### 请求签名（X-Tap-Sign）
每个请求还需要 X-Tap-Sign header：
```
HMAC-SHA256(method\nurl\nx-tap-headers\nbody\n, CLIENT_SECRET)
```

### 文档数据管理
- 所有文档内容使用 TypeScript 静态数据，类型安全
- 按功能模块分离文档数据（排行榜、云存档等）
- 每个 LeaderboardManager API 对应一个独立工具
- 支持关键词搜索和完整代码示例

### 本地缓存（v1.4.1+ 架构优化）

**缓存目录结构：**
```
# 全局缓存（无 _project_path）
/tmp/taptap-mcp/cache/global/app.json

# 租户缓存（通过 _project_path 隔离）
/tmp/taptap-mcp/cache/{userId}/{projectId}/app.json
```

**临时文件目录：**
```
# H5 游戏压缩包等
/tmp/taptap-mcp/temp/{userId}/{projectId}/game-{timestamp}.zip
```

**特性：**
- ✅ 独立于 workspace，支持只读挂载
- ✅ 自动缓存 developer_id 和 app_id
- ✅ 通过 `/level/v1/list` API 自动获取
- ✅ 租户数据完全隔离
- ✅ 临时文件自动清理

**环境变量配置：**
- `TDS_MCP_CACHE_DIR`: 缓存根目录（默认 `/tmp/taptap-mcp/cache`）
- `TDS_MCP_TEMP_DIR`: 临时文件根目录（默认 `/tmp/taptap-mcp/temp`）



## CI/CD 和自动化发布

### 概述

项目采用 **GitHub Flow + Semantic Release** 实现完全自动化的版本管理和发布流程。

**核心特性：**
- ✅ 基于 Conventional Commits 自动计算版本号
- ✅ 自动生成 CHANGELOG.md
- ✅ 自动发布到 npm
- ✅ 自动创建 GitHub Release
- ✅ 完整的 PR 检查（lint、build、test、commitlint）

### 分支策略

```
main          # 稳定版本（1.2.3）- 受保护
├── beta      # Beta 测试版（1.3.0-beta.1）
├── alpha     # Alpha 早期版（1.3.0-alpha.1）
├── next      # 下一个主版本（2.0.0-next.1）
└── 1.x       # 旧版本维护（1.2.4）
```

**分支保护规则：**
- `main` 分支受组织级 Ruleset (trunk-guard) 保护
- 所有更改必须通过 PR 合并
- PR 必须通过所有 CI 检查
- Commit 消息必须符合 Conventional Commits 规范

**自动发布机制：**
- Feature PR 合并 → 触发 GitHub Actions
- 分析 commits 确定版本号
- 创建临时 release 分支
- 在临时分支发布到 npm 并更新版本
- 自动创建 PR 并合并到 main
- 创建 GitHub Release

### 开发工作流

#### 1. 开发新功能

```bash
# 从 main 创建 feature 分支
git checkout main
git pull origin main
git checkout -b feature/awesome-feature

# 开发并提交（使用规范格式）
git add .
git commit -m "feat: add awesome new feature"

# 推送到远程
git push origin feature/awesome-feature

# 在 GitHub 创建 PR → 等待 CI 检查 → 请求 Review → 合并
# 合并后自动触发发布（版本：1.2.0 → 1.3.0）
```

#### 2. 修复 Bug

```bash
# 创建 fix 分支
git checkout -b fix/critical-bug

# 修复并提交
git commit -m "fix: resolve critical security issue"

# Push 并创建 PR
git push origin fix/critical-bug

# 合并后自动发布（版本：1.2.0 → 1.2.1）
```

#### 3. 发布 Beta 版本

```bash
# 创建或切换到 beta 分支
git checkout -b beta

# 合并要测试的功能
git merge feature/feature-a
git merge feature/feature-b

# 推送到远程
git push origin beta

# 自动发布 beta 版本（1.3.0-beta.1）
# 用户可通过 npm install @mikoto_zero/minigame-open-mcp@beta 安装

# 测试稳定后，合并到 main
git checkout main
git merge beta
git push origin main

# 发布正式版本（1.3.0）
```

### 版本号规则

Semantic Release 根据 commit 类型自动计算版本号：

| Commit 类型 | 版本变更 | 示例 |
|------------|---------|------|
| `feat:` | Minor | 1.2.0 → 1.3.0 |
| `fix:` | Patch | 1.2.0 → 1.2.1 |
| `feat!:` 或 `BREAKING CHANGE:` | Major | 1.2.0 → 2.0.0 |
| `docs:`, `chore:`, `test:` | 无变更 | 不触发发布 |
| `refactor:`, `perf:` | Patch | 1.2.0 → 1.2.1 |

**混合 commit 时取最高优先级：**
```bash
# PR 包含多个 commits
git commit -m "fix: bug fix 1"
git commit -m "feat: new feature"
git commit -m "feat!: breaking change"

# 最终版本变更：Major（因为有 feat!）
# 1.2.0 → 2.0.0
```

### CI/CD 工作流

#### PR 检查 (.github/workflows/pr.yml)

PR 创建或更新时自动运行：
- ✅ Lint - 代码风格检查
- ✅ Build - 构建检查
- ✅ Test - 单元测试
- ✅ Commitlint - Commit 消息格式检查

所有检查通过才能合并。

#### 自动发布 (.github/workflows/release.yml)

PR 合并到 main/beta/alpha 分支后自动运行：
1. 运行质量检查（lint、build、test）
2. 执行 semantic-release：
   - 分析所有 commits
   - 计算新版本号
   - 更新 package.json
   - 生成/更新 CHANGELOG.md
   - Git commit 和 tag
   - **发布到 npm**
   - 创建 GitHub Release

**npm 发布策略：**
- ⚠️ **不使用 Provenance**（npm Provenance 仅支持 public 仓库，当前仓库为 internal）
- ✅ 使用 **Automation Token** 绕过 2FA
- ✅ 完整的 CI/CD 质量检查

### 配置文件

- `.releaserc.js` - Semantic Release 配置
- `.commitlintrc.js` - Commitlint 配置
- `.github/workflows/pr.yml` - PR 检查工作流
- `.github/workflows/release.yml` - 发布工作流

### 环境变量和 Secrets

需要在 GitHub 仓库设置中配置：

**Secrets (Settings → Secrets and variables → Actions):**
- `NPM_TOKEN` - npm 发布令牌（必需）
  - **类型**：**Automation Token**（可绕过 2FA）
  - **创建步骤**：
    1. 登录 https://www.npmjs.com/
    2. 进入 Access Tokens 页面
    3. 点击 "Generate New Token"
    4. 选择 "Automation" 类型
    5. 勾选 "Bypass 2FA"
    6. 复制 token 并更新到 GitHub Secret

**自动提供（无需配置）:**
- `GITHUB_TOKEN` - GitHub API 令牌（用于创建 PR、合并、创建 Release）

**Permissions 要求：**
```yaml
permissions:
  contents: write      # 创建 commit 和 tag
  issues: write        # 发布说明
  pull-requests: write # 创建和合并 PR
  id-token: write      # GitHub OIDC（未来可能需要）
```

### 手动操作

#### 安装依赖

```bash
npm install
```

这会安装所有 CI/CD 相关的依赖：
- `semantic-release` - 自动化发布
- `@commitlint/cli` - Commit 消息检查
- `@semantic-release/*` - 各种插件

#### 本地验证 Commit 消息

```bash
# 检查最近的 commit
npx commitlint --from HEAD~1 --to HEAD

# 检查多个 commits
npx commitlint --from HEAD~5 --to HEAD
```

#### 本地测试发布流程（dry-run）

```bash
# 不会真正发布，只显示会做什么
npx semantic-release --dry-run
```

### 版本管理
- 遵循语义化版本（Semantic Versioning）
- 版本号完全自动化，不需要手动修改
- Beta/Alpha 版本用于新特性测试
- 旧版本通过维护分支（如 1.x）支持

### 扩展新功能

使用脚手架快速创建新功能模块：

```bash
# 运行脚手架脚本
./scripts/create-feature.sh

# 按提示输入功能信息
# 自动生成模块结构：src/features/yourFeature/
# 包含：index.ts, tools.ts, handlers.ts, api.ts 等

# 在 src/server.ts 注册新模块
import { yourFeatureModule } from './features/yourFeature/index.js';
const allModules = [..., yourFeatureModule];
```

详见脚手架使用说明部分。

### 缓存文件位置（v1.4.1+ 更新）

**新架构（推荐）：**
- 全局缓存：`/tmp/taptap-mcp/cache/global/app.json`
- 租户缓存：`/tmp/taptap-mcp/cache/{userId}/{projectId}/app.json`
- 临时文件：`/tmp/taptap-mcp/temp/{userId}/{projectId}/`

**优点：**
- ✅ workspace 可以只读挂载
- ✅ 缓存和临时文件完全隔离
- ✅ 租户数据完全隔离
- ✅ 通过环境变量自定义目录位置


## 注意事项

- 所有工具描述使用英文，便于 AI Agent 理解
- 环境变量名称使用 TDS_MCP_ 前缀
- MAC Token 必须是 JSON 字符串格式
- 请求签名使用两层机制（MAC + X-Tap-Sign）
- 默认环境为 production，可通过 TDS_MCP_ENV 切换
