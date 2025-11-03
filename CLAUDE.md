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

- **默认提交代码**：完成代码改动后，**自动创建 git commit**
  - 使用清晰的 commit message（遵循 Conventional Commits）
  - 除非用户明确说"不要提交"，否则默认提交
  - 多个相关改动可以合并为一个 commit
  - **不需要每次都问用户是否提交，主动提交即可**

- **Commit Message 格式**：
  - `feat:` - 新功能
  - `fix:` - Bug 修复
  - `docs:` - 文档更新
  - `refactor:` - 代码重构
  - `chore:` - 构建/工具/配置更新

### 🎯 工作流程

```
代码改动 → 自动更新文档 → 自动 git commit → 告知用户完成
```

**例外情况**：
- 用户明确说"不要提交" → 不自动 commit
- 用户明确说"不要更新文档" → 不更新文档
- 临时测试/实验性改动 → 询问用户是否提交

## 项目概述

这是一个基于 Model Context Protocol (MCP) 的 TapTap Open API MCP 服务器。项目为 **TapTap Minigame 和 H5 游戏**提供完整的排行榜 API 文档和服务端管理功能。

**核心特性：**
- 🏆 **排行榜系统** - 完整的排行榜 API 文档和服务端管理
- 🔐 **OAuth 2.0 Device Code Flow** - 零配置认证（扫码即用）
- 🎯 **极简架构** - 10 Tools + 7 Resources
- 🌍 **双平台支持** - Minigame & H5 游戏
- 🚀 **MCP 2025 标准** - Streamable HTTP + RFC 5424 Logging
- 📡 **双传输协议** - stdio（本地）+ Streamable HTTP（远程）

**未来计划：**
- ☁️ 云存档系统
- 👥 好友系统
- 更多 Open API 功能

**官方 API 文档：** https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/

**NPM 包：** `@mikoto_zero/minigame-open-mcp`

**版本说明：**
- `latest` (v1.2.0): 模块化架构 + MCP 2025 标准
  - 17 tools + 7 resources
  - OAuth 2.0 Device Code Flow（SSE 模式支持自动授权）
  - 三种传输协议（stdio + SSE Streaming + HTTP JSON）
  - 多客户端并发支持（独立会话管理）
  - MCP Logging 规范（RFC 5424）+ 连接日志
  - MCP SDK 1.20.2
- `beta` (v1.2.0-beta.23): 最新测试版本

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
  - `network/` - HTTP Client（MAC 认证 + 签名）
  - `handlers/` - 通用处理器（environment）
  - `utils/` - 工具函数（cache, logger, docHelpers）
  - `types/` - 类型定义（ToolRegistration, ResourceRegistration 等）

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

### 启动服务器

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
npx @mikoto_zero/minigame-open-mcp@beta

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

### 环境配置

#### 必需的环境变量

```bash
# MAC Token（JSON 字符串格式）
export TDS_MCP_MAC_TOKEN='{"kid":"your_kid","token_type":"mac","mac_key":"your_mac_key","mac_algorithm":"hmac-sha-1"}'

# 客户端配置
export TDS_MCP_CLIENT_ID="your_client_id"
export TDS_MCP_CLIENT_TOKEN="your_client_secret"

# 启动服务器
npm start
```

#### OpenHands 集成配置示例
```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TDS_MCP_MAC_TOKEN": "${CURRENT_USER_MAC_TOKEN}",
        "TDS_MCP_CLIENT_ID": "your_client_id",
        "TDS_MCP_CLIENT_TOKEN": "your_client_secret",
        "TDS_MCP_ENV": "production",
        "TDS_MCP_PROJECT_PATH": "${CURRENT_PROJECT_PATH}",
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
        "TDS_MCP_MAC_TOKEN": "${CURRENT_USER_MAC_TOKEN}",
        "TDS_MCP_CLIENT_ID": "your_client_id",
        "TDS_MCP_CLIENT_TOKEN": "your_client_secret",
        "TDS_MCP_ENV": "production",
        "TDS_MCP_PROJECT_PATH": "${CURRENT_PROJECT_PATH}",
        "TDS_MCP_VERBOSE": "true"
      }
    }
  }
}
```

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

### 工具分类（10 Tools）

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

## 核心技术栈

- **MCP Framework**: Model Context Protocol 2025-03-26 规范
- **MCP SDK**: @modelcontextprotocol/sdk@1.20.2
- **传输协议**: stdio + Streamable HTTP (MCP 2025 标准)
- **运行时**: Node.js 16+ (ES Module 模式)
- **编程语言**: TypeScript (类型安全)
- **包管理**: NPM (依赖管理和分发)
- **构建工具**: TypeScript Compiler (tsc)
- **开发工具**: tsx (ES modules 运行器)
- **加密签名**: crypto-js (HMAC-SHA1 和 HMAC-SHA256)
- **认证方式**: MAC Token Authentication + OAuth 2.0 Device Flow
- **日志规范**: RFC 5424 (Syslog Protocol)

## 配置说明

### 环境变量详解

**认证方式（二选一）**：

**方式 A: OAuth 2.0 Device Code Flow（推荐，零配置）**
```bash
# 无需配置环境变量！
npx @mikoto_zero/minigame-open-mcp@beta

# 首次使用会提示扫码授权
# Token 自动保存到: ~/.config/taptap-minigame/token.json
```

**方式 B: 环境变量（手动配置）**
```bash
export TDS_MCP_MAC_TOKEN='{"kid":"abc123","token_type":"mac","mac_key":"secret","mac_algorithm":"hmac-sha-1"}'
export TDS_MCP_CLIENT_ID="your_client_id"
export TDS_MCP_CLIENT_TOKEN="your_client_token"
```

**必需环境变量（内置默认值）**：
- `TDS_MCP_CLIENT_ID`: 客户端 ID（已内置，可覆盖）
- `TDS_MCP_CLIENT_TOKEN`: 请求签名密钥（已内置，可覆盖）

**可选配置**：
- `TDS_MCP_MAC_TOKEN`: 用户 MAC Token（可选，否则使用 OAuth）
- `TDS_MCP_ENV`: 环境选择，`production`（默认）或 `rnd`
  - production: `https://agent.tapapis.cn`
  - rnd: `https://agent.api.xdrnd.cn`
- `TDS_MCP_PROJECT_PATH`: 项目路径，用于本地缓存
- `TDS_MCP_VERBOSE`: 详细日志模式（`true` 或 `1`）
- `TDS_MCP_TRANSPORT`: 传输协议，`stdio`（默认）、`sse` 或 `http`
  - `stdio`: 标准输入输出，适合本地集成（Claude Desktop、Cursor）
  - `sse`: SSE 流式响应，支持实时进度和自动授权（推荐用于 OpenHands）
  - `http`: JSON 单次响应，适合普通 HTTP 客户端（不支持 SSE）
- `TDS_MCP_PORT`: HTTP/SSE 模式的监听端口（默认 `3000`）

**环境检查**：
使用 `check_environment` 工具检查认证状态（包括本地文件中的 token）。

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

### 本地缓存
- 缓存位置：`~/.config/taptap-minigame/app.json` 或 `{project}/.taptap-minigame/app.json`
- 自动缓存 developer_id 和 app_id
- 通过 `/level/v1/list` API 自动获取
- 避免重复输入参数

### 添加新功能

使用脚手架快速创建新功能模块：

```bash
# 1. 运行脚手架脚本
./scripts/create-feature.sh

# 2. 按提示输入信息
# - Feature Key: cloud-save (kebab-case)
# - Feature Name: 云存档 (中文描述)
# - 是否需要 Resources: yes/no
# - 是否需要 Prompts: yes/no

# 3. 自动生成完整模块结构
src/features/cloudSave/
  ├── index.ts      # 模块定义
  ├── tools.ts      # 统一格式的工具定义
  ├── handlers.ts   # 业务逻辑（含示例代码）
  └── api.ts        # API调用（含ensureAppInfo示例）

# 4. 实现业务逻辑（参考TODO注释）

# 5. 在 server.ts 注册模块
import { cloudSaveModule } from './features/cloudSave/index.js';
const allModules = [appModule, leaderboardModule, cloudSaveModule];

# 6. 编译测试
npm run build
node dist/server.js
```

**关键点**：
- 使用 `ensureAppInfo()` 获取 developer_id/app_id（从 `../app/api.js` 导入）
- 工具采用统一格式：`ToolRegistration[]`（definition + handler）
- 参考 leaderboard 模块的实现模式

## 项目特色功能

### 智能工作流
`start_leaderboard_integration` 工具提供完整的排行榜接入流程：
1. 自动检查现有排行榜
2. 如果没有排行榜，引导创建
3. 如果有排行榜，列出供用户选择
4. 提供后续实现步骤指引

### 自动 ID 管理
- 首次调用管理工具时自动从 `/level/v1/list` 获取应用信息
- 缓存 developer_id 和 app_id 到本地
- 后续调用无需再提供这些参数
- 支持项目级和全局级缓存

### 每个 API 独立工具
- 每个 LeaderboardManager API 都有独立的文档工具
- 一步到位获取特定 API 的完整文档
- 避免信息过载，提高 AI Agent 效率

### 双重认证机制
- **MAC Token 认证** - 使用 mac_key 进行 HMAC-SHA1 签名
- **请求签名** - 使用 CLIENT_SECRET 进行 HMAC-SHA256 签名
- 完全参考 `tapcode-mcp-h5` 项目的成熟实现

## 工具使用指南

### 推荐工作流程

1. **用户询问接入排行榜**
   - AI 调用 `start_leaderboard_integration`
   - 系统自动检查和引导

2. **需要创建排行榜**
   - AI 调用 `create_leaderboard`
   - 只需提供排行榜配置参数
   - developer_id 和 app_id 自动获取

3. **查看现有排行榜**
   - AI 调用 `list_leaderboards`
   - 显示所有已创建的排行榜

4. **获取实现代码**
   - AI 调用对应的 API 工具（如 `submit_scores`）
   - 返回完整的代码文档和示例

### 工具选择建议

- **用户问"接入排行榜"** → `start_leaderboard_integration`
- **用户问"如何提交分数"** → `submit_scores`
- **用户问"如何显示排行榜"** → `open_leaderboard`
- **用户问"我有哪些排行榜"** → `list_leaderboards`
- **用户问"创建排行榜"** → `create_leaderboard`

## 发布和维护

### 构建发布
```bash
# 编译项目
npm run build

# 发布到 npm
npm publish --access public
```

### 版本管理
- 当前版本：1.2.0
- 遵循语义化版本（Semantic Versioning）
- Beta 版本用于新特性测试和验证
- 主要功能更新增加次版本号
- Bug 修复增加补丁版本号

### 扩展新功能

添加新的 Open API 功能（如云存档）：

1. 在 `src/data/` 创建新的文档数据文件
2. 在 `src/tools/` 创建新的工具处理器
3. 在 `src/network/` 添加对应的 API 函数（如需要）
4. 在 `src/server.ts` 注册新工具
5. 更新 README.md 和文档

### 缓存文件位置

- 全局缓存：`~/.config/taptap-minigame/app.json`
- 项目缓存：`{project}/.taptap-minigame/app.json`

**与 tapcode-mcp-h5 区分**：
- tapcode-mcp-h5: `.taptap/craft.json`
- 本项目: `.taptap-minigame/app.json`

## v1.2.0 新特性（2025-11-03）

### 🚀 多客户端并发支持

- **独立会话管理**：每个客户端拥有独立的 Server 和 Transport 实例
- **Session ID 路由**：通过 `mcp-session-id` header 自动路由请求
- **活跃会话跟踪**：`/health` endpoint 显示当前活跃会话数
- **连接日志**：verbose 模式下记录客户端连接/断开事件

```bash
# 启用连接日志
TDS_MCP_TRANSPORT=sse TDS_MCP_VERBOSE=true npm start
```

### 🔐 智能自动授权（SSE 模式专属）

**SSE 模式下一步完成授权**：
```
用户调用工具 → 服务器返回授权链接 + 自动等待授权（最多 2 分钟）
             → 用户扫码授权 → 服务器自动完成并继续执行工具
```

**实时进度推送**：
- 授权链接 + 操作步骤
- 每 10 秒更新等待时间
- 授权成功/超时/错误通知

**其他模式保持两步式授权**（向后兼容）。

### 📡 三种传输模式

| 模式 | 配置 | 响应格式 | 授权 | 进度 | 多客户端 | 推荐场景 |
|------|------|---------|-----|------|---------|---------|
| **stdio** | 默认 | N/A | 两步式 | ❌ | N/A | Claude Desktop、Cursor、本地单客户端 |
| **sse** | `TDS_MCP_TRANSPORT=sse` | SSE 流 | **一步式** | ✅ 实时 | ✅ | **OpenHands**、Claude Code、Cursor、VSCode、远程/多客户端 |
| **http** | `TDS_MCP_TRANSPORT=http` | JSON | 两步式 | ❌ | ✅ | 普通 HTTP 客户端 |

**关键差异**：
- `sse` 模式：返回 `Content-Type: text/event-stream`，支持持久连接和实时推送
- `http` 模式：返回 `Content-Type: application/json`，单次请求-响应

### 💡 最佳实践

```bash
# ✅ 推荐：OpenHands 集成
TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3000 TDS_MCP_VERBOSE=true npm start
# → 一步式授权 + 实时进度 + 连接日志

# ✅ 推荐：Claude Desktop / Cursor
npx @mikoto_zero/minigame-open-mcp@beta
# → 默认 stdio 模式，最大兼容性

# ✅ 兼容：普通 HTTP 客户端
TDS_MCP_TRANSPORT=http TDS_MCP_PORT=3000 npm start
# → JSON 响应，两步式授权
```

### ⚠️ 重要说明

1. **Accept Header 要求**：
   - MCP SDK 要求客户端必须声明：`Accept: application/json, text/event-stream`
   - 服务器根据 `TDS_MCP_TRANSPORT` 决定实际返回格式

2. **进度通知兼容性**：
   - SSE 模式：所有进度通知实时推送（授权、上传、压缩等）
   - HTTP/stdio 模式：进度通知静默失败，不影响功能
   - 最终结果在所有模式下都正常返回

3. **授权策略差异**：
   - SSE 模式：自动授权，等待最多 2 分钟
   - HTTP/stdio 模式：两步式授权，立即返回错误

## 注意事项

- 所有工具描述使用英文，便于 AI Agent 理解
- 环境变量名称使用 TDS_MCP_ 前缀
- MAC Token 必须是 JSON 字符串格式
- 请求签名使用两层机制（MAC + X-Tap-Sign）
- 默认环境为 production，可通过 TDS_MCP_ENV 切换
