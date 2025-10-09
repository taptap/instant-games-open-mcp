# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 Model Context Protocol (MCP) 的 TapTap 小游戏 Open API MCP 服务器。项目提供 TapTap 小游戏 Open API 的完整文档、代码示例和服务端管理功能。

**当前功能：**
- 🏆 **排行榜系统** - 完整的排行榜 API 文档和服务端管理

**未来计划：**
- ☁️ 云存档系统
- 👥 好友系统
- 更多 Open API 功能

**官方 API 文档：** https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/

**NPM 包：** `@mikoto_zero/minigame-open-mcp`

## 架构概览

项目采用分层架构设计：

### 核心服务器层
- **`src/server.ts`** - 主 MCP 服务器，使用标准 MCP 协议（stdio 模式）
- **`bin/minigame-open-mcp`** - NPM 可执行入口点

### 网络请求层
- **`src/network/`** - 网络请求模块
  - `httpClient.ts` - 通用 HTTP 客户端，支持 MAC 认证和请求签名
  - `leaderboardApi.ts` - 排行榜服务端 API（创建、查询排行榜）

### 文档工具层
- **`src/tools/`** - 文档工具集
  - `leaderboardTools.ts` - 排行榜 API 文档工具（每个 API 一个独立工具）

### 数据层
- **`src/data/`** - 静态文档数据（TypeScript）
  - `leaderboardDocs.ts` - 排行榜 API 完整文档、示例代码和最佳实践

### 工具层
- **`src/utils/`** - 工具函数
  - `cache.ts` - 本地缓存（自动缓存 developer_id 和 app_id）

### 类型定义
- **`src/types/`** - TypeScript 类型定义
  - `index.ts` - MacToken 等核心类型

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
```bash
# 开发模式启动
npm run dev

# 编译并启动
npm run build
npm start

# 通过 npx 直接运行（推荐）
npx @mikoto_zero/minigame-open-mcp
```

### 环境配置

#### 必需的环境变量

```bash
# MAC Token（JSON 字符串格式）
export TAPTAP_MAC_TOKEN='{"kid":"your_kid","token_type":"mac","mac_key":"your_mac_key","mac_algorithm":"hmac-sha-1"}'

# 客户端配置
export TAPTAP_CLIENT_ID="your_client_id"
export TAPTAP_CLIENT_SECRET="your_client_secret"

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
        "TAPTAP_MAC_TOKEN": "${CURRENT_USER_MAC_TOKEN}",
        "TAPTAP_CLIENT_ID": "your_client_id",
        "TAPTAP_CLIENT_SECRET": "your_client_secret",
        "TAPTAP_ENV": "production",
        "TAPTAP_PROJECT_PATH": "${CURRENT_PROJECT_PATH}"
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
TAPTAP_MAC_TOKEN='{"kid":"test","token_type":"mac","mac_key":"test","mac_algorithm":"hmac-sha-1"}' \
TAPTAP_CLIENT_ID=test \
TAPTAP_CLIENT_SECRET=test \
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
        "TAPTAP_MAC_TOKEN": "{\"kid\":\"your_kid\",\"token_type\":\"mac\",\"mac_key\":\"your_key\",\"mac_algorithm\":\"hmac-sha-1\"}",
        "TAPTAP_CLIENT_ID": "your_client_id",
        "TAPTAP_CLIENT_SECRET": "your_secret"
      }
    }
  }
}
```

**注意**: 完全零安装，通过 npx 自动下载和运行！

### 工具分类

#### 🎯 工作流引导工具
- **`start_leaderboard_integration`** - 排行榜接入工作流引导（推荐作为起点）
  - 自动检查现有排行榜
  - 引导创建或选择排行榜
  - 提供后续实现步骤

#### 📖 LeaderboardManager API 文档工具（6个）
每个工具提供一个特定 API 的完整文档：
- **`get_leaderboard_manager`** - 获取 LeaderboardManager 实例
- **`open_leaderboard`** - 打开排行榜 UI
- **`submit_scores`** - 提交玩家分数
- **`load_leaderboard_scores`** - 加载排行榜数据
- **`load_current_player_score`** - 获取当前玩家分数和排名
- **`load_player_centered_scores`** - 加载当前玩家周围的玩家分数

#### ⚙️ 排行榜管理工具（2个）
- **`create_leaderboard`** - 创建排行榜
  - 自动获取 developer_id 和 app_id
  - 支持所有配置参数（周期、分数类型、排序等）
  - 返回 leaderboard_id 供客户端使用

- **`list_leaderboards`** - 查询已创建的排行榜列表
  - 自动获取 developer_id 和 app_id
  - 支持分页
  - 显示排行榜 ID 和配置信息

#### 🔍 辅助工具（3个）
- **`search_leaderboard_docs`** - 搜索排行榜文档
- **`get_leaderboard_overview`** - 获取排行榜 API 完整概览
- **`get_leaderboard_patterns`** - 获取集成模式和最佳实践

#### 🔧 系统工具（2个）
- **`check_environment`** - 检查环境变量配置和认证状态
- **`get_user_leaderboard_scores`** - 获取用户实际排行榜分数数据（需要 MAC Token）

## 核心技术栈

- **MCP Framework**: 基于 Model Context Protocol 的工具服务
- **运行时**: Node.js 16+ (ES Module 模式)
- **编程语言**: TypeScript (类型安全)
- **包管理**: NPM (依赖管理和分发)
- **构建工具**: TypeScript Compiler (tsc)
- **加密签名**: crypto-js (HMAC-SHA1 和 HMAC-SHA256)
- **认证方式**: MAC Token Authentication

## 配置说明

### 环境变量详解

**核心环境变量（必需）**：
- `TAPTAP_MAC_TOKEN`: 用户 MAC Token，JSON 字符串格式
  ```json
  {"kid":"abc123","token_type":"mac","mac_key":"secret","mac_algorithm":"hmac-sha-1"}
  ```
- `TAPTAP_CLIENT_ID`: 客户端 ID，用于 API 调用
- `TAPTAP_CLIENT_SECRET`: 客户端密钥，用于请求签名

**可选配置**：
- `TAPTAP_ENV`: 环境选择，`production`（默认）或 `rnd`
  - production: `https://agent.tapapis.cn`
  - rnd: `https://agent.api.xdrnd.cn`
- `TAPTAP_PROJECT_PATH`: 项目路径，用于本地缓存

**环境检查**：
使用 `check_environment` 工具检查所有环境变量的配置状态。

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

### 项目结构
- `src/server.ts` - 主服务器入口和工具注册
- `src/network/` - 网络请求模块（HTTP 客户端和 API 封装）
- `src/tools/` - 工具处理函数实现
- `src/data/` - 文档数据定义
- `src/utils/` - 工具函数（缓存等）
- `src/types/` - 类型定义
- `bin/` - NPM 可执行文件
- `dist/` - 编译输出目录

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
- 当前版本：1.0.1
- 遵循语义化版本（Semantic Versioning）
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

## 注意事项

- 所有工具描述使用英文，便于 AI Agent 理解
- 环境变量名称使用 TAPTAP_ 前缀
- MAC Token 必须是 JSON 字符串格式
- 请求签名使用两层机制（MAC + X-Tap-Sign）
- 默认环境为 production，可通过 TAPTAP_ENV 切换
