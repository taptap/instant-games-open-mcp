# TapTap Open API MCP 服务器

> 基于 Model Context Protocol (MCP) 的 **TapTap 小游戏和 H5 游戏**服务器 - 提供排行榜文档和管理 API，支持 **OAuth 2.0 零配置认证**。

🔐 **零配置 OAuth** | 📚 **完整文档** | 🎯 **模块化架构** | 🌍 **小游戏 & H5**

## 功能特性

### 🔐 零配置 OAuth 认证

- **无需手动配置 token！**
- Device Code Flow - 扫码即可授权
- 自动保存 token 到 `~/.config/taptap-minigame/token.json`
- 支持 Cursor、Claude Code、VSCode
- 懒加载 - 服务器秒级启动，需要时才触发认证

### 📖 完整的 API 文档

6 个 LeaderboardManager API 及详细文档：
- `tap.getLeaderboardManager()` - 初始化排行榜
- `submitScores()` - 提交玩家分数
- `openLeaderboard()` - 显示排行榜 UI
- `loadLeaderboardScores()` - 获取排行榜数据
- `loadCurrentPlayerLeaderboardScore()` - 获取玩家排名
- `loadPlayerCenteredScores()` - 加载周围玩家

**⚠️ 关键提示：无需安装任何 SDK！**
- `tap` 是全局对象（类似 `window`）
- 不需要 `npm install`
- 不需要 import

### ⚙️ 服务端管理

- **创建排行榜** - 服务端创建排行榜
- **列出排行榜** - 查询现有排行榜
- **自动 ID 管理** - 自动获取 developer_id、app_id、miniapp_id
- **完整集成指南** - 分步骤工作流

### 🎯 模块化架构

- **10 个 Tools** - AI 的统一入口
- **7 个 Resources** - 详细 API 文档
- **模块化设计** - 易于添加新功能（云存档、分享等）
- **完全兼容** - Claude Code ✅、VSCode ✅、Cursor ✅

## 快速开始

### 安装

```bash
npm install -g @mikoto_zero/minigame-open-mcp
```

或使用 npx 直接运行（无需安装）：

```bash
npx @mikoto_zero/minigame-open-mcp@beta
```

### 配置

#### 在 Claude Code / VSCode / Cursor 中使用（零配置 OAuth）

**推荐**：使用 OAuth Device Code Flow - 无需手动配置 token！

在项目中创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp@beta"],
      "env": {
        "TDS_MCP_ENV": "production"
      }
    }
  }
}
```

**首次使用流程**：
1. 服务器秒级启动
2. 使用需要认证的功能时，会显示授权二维码链接
3. 用 TapTap App 扫码授权
4. 调用 `complete_oauth_authorization` 工具完成授权
5. Token 自动保存，后续使用自动加载！

**手动配置 Token**（可选）：

如果你想手动配置：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["@mikoto_zero/minigame-open-mcp@beta"],
      "env": {
        "TDS_MCP_MAC_TOKEN": "{\"kid\":\"your_kid\",\"token_type\":\"mac\",\"mac_key\":\"your_key\",\"mac_algorithm\":\"hmac-sha-1\"}",
        "TDS_MCP_ENV": "production",
        "TAPTAP_MINIGAME_MCP_VERBOSE": "false"
      }
    }
  }
}
```

#### 在 OpenHands 中使用

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["@mikoto_zero/minigame-open-mcp@beta"],
      "env": {
        "TDS_MCP_MAC_TOKEN": "${CURRENT_USER_MAC_TOKEN}",
        "TDS_MCP_CLIENT_ID": "your_client_id",
        "TDS_MCP_CLIENT_TOKEN": "your_client_token",
        "TDS_MCP_ENV": "production",
        "TDS_MCP_PROJECT_PATH": "${CURRENT_PROJECT_PATH}",
        "TAPTAP_MINIGAME_MCP_VERBOSE": "false"
      }
    }
  }
}
```

### 环境变量

**OAuth 认证（推荐 - 零配置）：**
- ✅ 无需配置环境变量！
- Token 自动保存到 `~/.config/taptap-minigame/token.json`

**手动配置（可选）：**
- `TDS_MCP_MAC_TOKEN` - MAC Token JSON 格式（可选，不设置则使用 OAuth）
- `TDS_MCP_CLIENT_ID` - 客户端 ID（已内置默认值，可覆盖）
- `TDS_MCP_CLIENT_TOKEN` - 签名密钥（已内置默认值，可覆盖）

**其他配置：**
- `TDS_MCP_ENV` - 环境选择：`production`（默认）或 `rnd`
- `TDS_MCP_PROJECT_PATH` - 项目路径，用于本地缓存
- `TAPTAP_MINIGAME_MCP_VERBOSE` - 详细日志：`true` 或 `false`（默认）

**调试模式：**

启用详细日志查看所有工具调用、HTTP 请求/响应：

```bash
export TAPTAP_MINIGAME_MCP_VERBOSE=true
npm start
```

详细日志包含：
- 📥 工具调用的输入和输出
- 📤 HTTP 请求头和请求体
- 📥 HTTP 响应状态和数据
- 🔒 敏感数据自动脱敏

## 使用示例

### 场景 1: 接入排行榜功能

```
用户: "我想在游戏中接入排行榜功能"

AI 调用: get_integration_guide

返回: 完整的分步骤工作流
✅ 强调无需安装 SDK
✅ 步骤 1: 检查/创建服务端排行榜
✅ 步骤 2: 客户端代码（使用全局 tap 对象）
✅ 步骤 3: 测试检查清单
✅ 列出所有 Resources 供详细阅读
```

### 场景 2: 获取 API 文档

**在 Claude Code 中**（AI 自动读取）：
```
用户: "如何提交分数？"

AI 读取: docs://leaderboard/api/submit-scores

返回: submitScores() 完整文档（参数、示例、错误码）
```

**在 VSCode 中**（调用工具）：
```
用户: "如何提交分数？"

AI 调用: get_integration_guide

返回: 完整工作流（包含代码示例）
```

### 场景 3: OAuth 授权流程

```
用户: "创建排行榜"

AI 调用: create_leaderboard

返回: 🔐 需要授权
      🔗 https://www.taptap.cn/tap-qrcode?...

      步骤:
      1. 点击链接在浏览器打开
      2. 用 TapTap App 扫码
      3. 调用 complete_oauth_authorization
      4. 重新执行

用户: "我已经授权了"

AI 调用: complete_oauth_authorization

返回: ✅ 授权完成！Token 已保存

用户: "创建排行榜"

AI 调用: create_leaderboard

返回: ✅ 排行榜创建成功！
      🎮 客户端 ID: xxx
```

## 🏗️ 架构

### 模块化设计

v1.2.0-beta 引入了**完全模块化的架构**，每个功能都是自包含的：

```
src/
├── features/              # 功能模块（自包含）
│   ├── app/              # 应用管理模块（基础功能）
│   │   ├── index.ts      # 模块定义和注册
│   │   ├── tools.ts      # 5 个工具（应用选择、环境检查等）
│   │   ├── handlers.ts   # 业务逻辑
│   │   └── api.ts        # API 调用
│   │
│   └── leaderboard/      # 排行榜模块
│       ├── index.ts      # 模块定义和注册
│       ├── tools.ts      # 5 个工具 + 处理器
│       ├── resources.ts  # 7 个 Resources + 处理器
│       ├── docs.ts       # 文档内容
│       ├── docTools.ts   # 文档工具
│       ├── handlers.ts   # 业务逻辑
│       └── api.ts        # API 调用
│
├── core/                  # 共享核心功能
│   ├── auth/             # OAuth Device Code Flow
│   ├── network/          # HTTP 客户端
│   ├── handlers/         # 通用处理器（environment）
│   ├── utils/            # 缓存、日志、文档助手
│   └── types/            # 类型定义
│
└── server.ts              # 主服务器（自动注册）
```

**模块说明**：
- **app**: 基础应用管理（开发者/应用选择、OAuth 授权、环境检查）
- **leaderboard**: 排行榜功能（依赖 app 模块）
- 未来: cloudSave, share 等（都可以复用 app 模块）

**添加新功能**：
```typescript
// 1. 使用脚手架创建新模块
./scripts/create-feature.sh

// 2. 按照提示输入功能信息
// Feature Key: cloud-save
// Feature Name: 云存档
// Resources: yes
// Prompts: no

// 3. 在 server.ts 导入
import { cloudSaveModule } from './features/cloudSave/index.js';
const allModules = [appModule, leaderboardModule, cloudSaveModule];

// 完成！自动注册 ✅
```

## 📚 文档

- **README.md** - 本文件（用户指南）
- **CLAUDE.md** - Claude Code 集成指南
- **CONTRIBUTING.md** - 开发者贡献指南（添加新功能）
- **CHANGELOG.md** - 版本变更历史

## 🤝 贡献

想要添加新功能（云存档、分享等）？

查看 **CONTRIBUTING.md** 了解：
- 分步骤指南
- 代码结构
- 设计原则
- 快速脚手架：`./scripts/create-feature.sh`

## 📖 相关资源

- **官方 API 文档**: https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/
- **MCP 规范**: https://modelcontextprotocol.io/
- **npm 包**: [@mikoto_zero/minigame-open-mcp](https://www.npmjs.com/package/@mikoto_zero/minigame-open-mcp)

## 📊 版本

- **latest (v1.1.4)**: 纯 Tools 稳定版（17 tools）
- **beta (v1.2.0-beta.11)**: 模块化架构 + OAuth（10 tools + 7 resources）

推荐使用 **beta 版本**获得最佳体验！

## 📄 许可证

MIT

## 🔗 链接

- [TapTap 开发者中心](https://developer.taptap.cn/)
- [MCP 协议](https://modelcontextprotocol.io/)
- [Issues](https://github.com/taptap/taptap-minigame-mcp-server/issues)
