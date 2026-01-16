# TapTap Minigame MCP Server 使用文档

本文档详细介绍了 TapTap Minigame MCP Server 的接入方法、完整功能列表以及使用示例，帮助开发者快速掌握如何使用该服务。

## 📚 目录

- [简介](#简介)
- [接入指南](#接入指南)
- [功能模块详解](#功能模块详解)
  - [应用管理 (App)](#应用管理-app)
  - [排行榜 (Leaderboard)](#排行榜-leaderboard)
  - [H5 游戏 (H5 Game)](#h5-游戏-h5-game)
  - [多人联机 (Multiplayer)](#多人联机-multiplayer)
  - [分享 (Share)](#分享-share)
  - [云存档 (Cloud Save)](#云存档-cloud-save)
  - [振动反馈 (Vibrate)](#振动反馈-vibrate)
- [使用示例](#使用示例)

---

## 简介

TapTap Minigame MCP Server 是一个基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的服务器，专为 TapTap 小游戏和 H5 游戏开发者设计。它允许 AI 助手（如 Cursor、Claude Desktop）直接与 TapTap 平台交互，执行创建排行榜、上传游戏、查询文档等操作。

---

## 接入指南

### 快速配置 (推荐)

在你的游戏项目根目录下创建 `.mcp.json` 文件：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"]
    }
  }
}
```

重启 Cursor 或 Claude Desktop 即可生效。

### 平台接入与环境变量

对于需要更细粒度控制（如手动认证、环境切换、日志调试）的场景，可以通过环境变量进行配置。你可以在 `.mcp.json` 的 `env` 字段中设置这些变量。

#### 环境变量列表

**1. 基础配置**

| 变量名                      | 描述                                                                | 默认值          |
| :-------------------------- | :------------------------------------------------------------------ | :-------------- |
| `TAPTAP_MCP_ENV`            | 环境选择，`production` (生产环境) 或 `rnd` (测试环境)               | `production`    |
| `TAPTAP_MCP_VERBOSE`        | 是否启用详细调试日志，`true` 或 `false`                             | `false`         |
| `TAPTAP_MCP_WORKSPACE_ROOT` | 项目工作区根目录，用于解析相对路径。推荐设置为 `${workspaceFolder}` | `process.cwd()` |

**2. 认证配置 (可选)**

> 默认使用 OAuth 2.0 扫码认证（零配置），无需设置以下变量。如果需要手动配置认证（如 CI/CD 环境），可使用以下变量：

| 变量名                     | 描述                        |
| :------------------------- | :-------------------------- |
| `TAPTAP_MCP_MAC_TOKEN`     | MAC Token (JSON 格式字符串) |
| `TAPTAP_MCP_CLIENT_ID`     | 客户端 ID                   |
| `TAPTAP_MCP_CLIENT_SECRET` | 签名密钥                    |

**3. 网络传输配置**

| 变量名                 | 描述                                                             | 默认值  |
| :--------------------- | :--------------------------------------------------------------- | :------ |
| `TAPTAP_MCP_TRANSPORT` | 传输模式：`stdio` (本地管道), `sse` (Server-Sent Events), `http` | `stdio` |
| `TAPTAP_MCP_PORT`      | 服务器监听端口 (仅 SSE/HTTP 模式有效)                            | `3000`  |

**4. 日志与存储配置**

| 变量名                 | 描述                                       | 默认值                  |
| :--------------------- | :----------------------------------------- | :---------------------- |
| `TAPTAP_MCP_LOG_FILE`  | 是否启用文件日志，`true` 或 `false`        | `false`                 |
| `TAPTAP_MCP_LOG_LEVEL` | 日志级别：`debug`, `info`, `warn`, `error` | `info`                  |
| `TAPTAP_MCP_LOG_ROOT`  | 日志文件存储目录                           | `/tmp/taptap-mcp/logs`  |
| `TAPTAP_MCP_CACHE_DIR` | 缓存文件存储目录                           | `/tmp/taptap-mcp/cache` |
| `TAPTAP_MCP_TEMP_DIR`  | 临时文件存储目录                           | `/tmp/taptap-mcp/temp`  |

#### 配置示例 (.mcp.json)

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TAPTAP_MCP_ENV": "production",
        "TAPTAP_MCP_VERBOSE": "true",
        "TAPTAP_MCP_WORKSPACE_ROOT": "${workspaceFolder}",
        "TAPTAP_MCP_LOG_FILE": "true"
      }
    }
  }
}
```

---

### 接入模式详解

本服务器支持三种接入模式，适应不同的开发场景：

#### 1. Stdio 模式 (默认)

适用于本地 IDE（如 Cursor, VS Code, Claude Desktop）直接调用。

- **原理**：MCP Client 通过标准输入输出 (stdio) 与 MCP Server 通信。
- **优点**：配置简单，无需端口映射，安全性高（仅本地可访问）。
- **配置**：默认无需额外配置，只要在 `.mcp.json` 中指定 `command` 和 `args` 即可。

```json
{
  "taptap-minigame": {
    "command": "npx",
    "args": ["-y", "@mikoto_zero/minigame-open-mcp"]
  }
}
```

#### 2. SSE 模式 (Server-Sent Events)

适用于远程部署或需要 HTTP 交互的场景（如 OpenHands, 远程服务器）。

- **原理**：通过 HTTP SSE 协议进行流式传输，支持 HTTP POST 发送请求。
- **优点**：支持远程连接，支持多客户端并发。
- **配置**：
  - 服务端：设置环境变量 `TAPTAP_MCP_TRANSPORT=sse` 和 `TAPTAP_MCP_PORT=3000`。
  - 客户端：在配置中指定 `url` 而非 `command`。

```bash
# 启动 SSE 服务器
TAPTAP_MCP_TRANSPORT=sse TAPTAP_MCP_PORT=3000 npx @mikoto_zero/minigame-open-mcp
```

```json
/* 客户端配置示例 */
{
  "mcpServers": {
    "taptap-minigame-remote": {
      "url": "http://your-server-ip:3000/sse",
      "transport": "sse"
    }
  }
}
```

#### 3. Proxy 接入模式

适用于平台级集成（如 TapCode），通过 MCP Proxy 中转请求。

- **原理**：请求经过 Proxy 服务中转，Proxy 负责注入认证信息 (MAC Token) 和上下文信息 (User ID, Project ID)。
- **优点**：对用户透明，无需手动配置认证，支持多租户隔离。
- **配置**：通常由平台方预置，用户无需感知。
  - 核心机制：Proxy 在 HTTP Header 中注入 `X-TapTap-Mac-Token`, `X-TapTap-User-Id` 等信息，MCP Server 解析这些 Header 建立带状态的 Session。

#### 4. Agent 代码集成 (SDK)

适用于开发自定义 AI Agent，通过代码直接连接 MCP Server。以下使用官方 `@modelcontextprotocol/sdk` 演示：

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// 1. 配置传输层 (以 Stdio 为例)
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@mikoto_zero/minigame-open-mcp'],
  env: {
    TAPTAP_MCP_ENV: 'production', // 可选：指定环境变量
  },
});

// 2. 初始化客户端
const client = new Client(
  {
    name: 'my-game-agent',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {}, // 声明支持工具调用
      resources: {}, // 声明支持资源读取
    },
  }
);

// 3. 连接服务器
await client.connect(transport);

// 4. 调用工具示例
const result = await client.callTool({
  name: 'get_current_app_info',
  arguments: {},
});

console.log(result);
```

---

## 功能模块详解

### 应用管理 (App)

核心模块，用于管理开发者身份、应用信息以及 OAuth 认证。**大多数操作前都需要先选择应用。**

**Tools (工具):**

- `get_current_app_info`: 获取当前选中的应用信息。**重要：操作前请先检查此项。**
- `check_environment`: 检查环境变量配置和认证状态。
- `start_oauth_authorization`: 开始 OAuth 2.0 授权流程（获取二维码）。
- `complete_oauth_authorization`: 完成 OAuth 授权（用户扫码后调用）。
- `list_developers_and_apps`: 列出当前账号下的所有开发者和应用。
- `select_app`: 选择要操作的应用。**必须由用户明确确认后调用。**
- `create_developer`: 创建新的开发者身份。
- `create_app`: 创建新应用。
- `update_app_info`: 更新应用信息（名称、简介、图标、截图等）。
- `get_app_status`: 查询应用审核状态。
- `upload_image`: 上传图片资源（用于更新应用信息）。
- `clear_auth_data`: 清除认证数据和缓存。

---

### 排行榜 (Leaderboard)

提供排行榜的创建、管理、发布以及客户端集成文档。

**Tools (工具):**

- `get_leaderboard_integration_guide`: **接入必读**。获取完整的排行榜接入工作流指引。
- `create_leaderboard`: 创建新排行榜（支持每日/每周/每月重置，多种计分方式）。
- `list_leaderboards`: 列出当前应用的所有排行榜。
- `publish_leaderboard`: 发布排行榜或设为白名单模式。
- `get_user_leaderboard_scores`: 查询用户的排行榜分数。

**Resources (资源 - 文档):**

- `docs://leaderboard/overview`: 排行榜 API 总览。
- `docs://leaderboard/api/get-manager`: 获取管理器实例。
- `docs://leaderboard/api/open`: 打开排行榜 UI。
- `docs://leaderboard/api/submit-scores`: 提交分数。
- `docs://leaderboard/api/load-scores`: 加载排行榜数据。
- `docs://leaderboard/api/load-player-score`: 加载当前玩家排名。
- `docs://leaderboard/api/load-centered-scores`: 加载周围玩家排名。

---

### H5 游戏 (H5 Game)

专为 H5 游戏提供的发布和部署工具。

**Tools (工具):**

- `prepare_h5_upload`: **上传第一步**。收集游戏信息，确认构建目录（如 dist/build）。
- `upload_h5_game`: **上传第二步**。将确认好的游戏包上传到 TapTap 平台。

---

### 多人联机 (Multiplayer)

提供多人联机功能的完整开发指引、代码模板和调试工具。

**Tools (工具):**

- `get_multiplayer_guide`: **接入必读**。获取多人联机接入完整指南。
- `get_code_template`: 获取 `MultiplayerManager.js` 完整代码模板。
- `get_api_event_table`: 查询 API 与事件的对应关系表。
- `get_protocol_template`: 获取通信协议设计模板。
- `get_extended_apis`: 查询扩展 API（房间列表、踢人等）。
- `get_player_id_guide`: 玩家 ID 使用指南。
- `get_sync_strategy`: 位置同步策略指南（摇杆/点击移动）。
- `generate_local_guide`: 在项目根目录生成 `MULTIPLAYER_GUIDE.md`。
- `get_api_data_structures`: 查询 API 数据结构定义。
- `generate_multiplayer_code`: **一键生成**所有联机相关代码文件。
- `diagnose_multiplayer_issues`: 常见问题诊断（如位置不同步、连接失败）。
- `check_multiplayer_code`: 检查联机代码中的常见错误。
- `get_debug_logger`: 获取屏幕日志调试工具（适合移动端调试）。

---

### 分享 (Share)

管理游戏内的分享功能和分享文案模板。

**Tools (工具):**

- `get_share_integration_guide`: **接入必读**。获取分享功能接入指引。
- `create_share_template`: 创建分享文案模板（需审核）。
- `list_share_templates`: 列出所有分享模板及其审核状态。
- `get_share_template_info`: 查询特定模板的详细信息。
- `search_share_docs`: 搜索分享相关 API 文档。

**Resources (资源 - 文档):**

- `docs://share/overview`: 分享 API 总览。
- `docs://share/api/show-shareboard`: 显示分享面板。
- `docs://share/api/set-shareboard-hidden`: 隐藏/显示菜单中的分享按钮。
- `docs://share/api/on-share-message`: 监听分享事件。
- `docs://share/api/off-share-message`: 取消监听分享事件。
- `docs://share/api/on-show`: 获取启动参数（热启动）。
- `docs://share/api/get-launch-options-sync`: 获取启动参数（冷启动）。
- `docs://share/api/get-enter-options-sync`: 获取启动参数（通用）。

---

### 云存档 (Cloud Save)

提供云端存档功能的开发文档和 API 说明。

**Tools (工具):**

- `get_cloud_save_integration_guide`: **接入必读**。获取云存档接入工作流指引。

**Resources (资源 - 文档):**

- `docs://cloud-save/overview`: 云存档 API 总览。
- `docs://cloud-save/api/get-cloud-save-manager`: 获取云存档管理器。
- `docs://cloud-save/api/cloud-save-manager/create-archive`: 创建存档。
- `docs://cloud-save/api/cloud-save-manager/update-archive`: 更新存档。
- `docs://cloud-save/api/cloud-save-manager/get-archive-list`: 获取存档列表。
- `docs://cloud-save/api/cloud-save-manager/get-archive-data`: 下载存档数据。
- `docs://cloud-save/api/cloud-save-manager/get-archive-cover`: 获取存档封面。
- `docs://cloud-save/api/cloud-save-manager/delete-archive`: 删除存档。
- `docs://cloud-save/api/get-file-system-manager`: 获取文件系统管理器。
- `docs://cloud-save/api/file-system-manager/write-file`: 写入本地文件。
- `docs://cloud-save/api/file-system-manager/read-file`: 读取本地文件。
- `docs://cloud-save/api/file-system-manager/mkdir`: 创建目录。
- `docs://cloud-save/api/file-system-manager/rmdir`: 删除目录。
- `docs://cloud-save/api/file-system-manager/unlink`: 删除文件。

---

### 振动反馈 (Vibrate)

提供手机振动功能的开发文档。

**Tools (工具):**

- `get_vibrate_integration_guide`: 获取振动功能接入指引。

**Resources (资源 - 文档):**

- `docs://vibrate/overview`: 振动 API 总览。
- `docs://vibrate/api/vibrate-short`: 短振动 API (Taptic Engine)。
- `docs://vibrate/api/vibrate-long`: 长振动 API。
- `docs://vibrate/patterns`: 振动模式设计最佳实践。

---

## 使用示例

### 场景 1：接入排行榜

**用户**: "我想给我的游戏加个排行榜"

**AI 助手**:

1. 调用 `get_leaderboard_integration_guide` 获取流程。
2. 提示用户选择应用（若未选择）。
3. 调用 `create_leaderboard` 创建服务端排行榜。
4. 读取 `docs://leaderboard/api/submit-scores` 等文档，生成客户端代码。

### 场景 2：发布 H5 游戏

**用户**: "帮我把这个 H5 游戏上传到 TapTap"

**AI 助手**:

1. 询问构建产物目录（如 `dist`）。
2. 调用 `prepare_h5_upload` 确认信息。
3. 调用 `upload_h5_game` 执行上传。
4. 返回上传结果和体验链接。

### 场景 3：实现多人联机

**用户**: "我想做一个简单的联机对战功能"

**AI 助手**:

1. 调用 `get_multiplayer_guide` 了解基础概念。
2. 调用 `generate_multiplayer_code` 生成 `MultiplayerManager.js`。
3. 解释代码如何使用，并指导用户调用 `init()` 和 `matchRoom()`。

### 场景 4：查询 API 文档

**用户**: "怎么使用云存档功能？"

**AI 助手**:

1. 调用 `get_cloud_save_integration_guide`。
2. 读取 `docs://cloud-save/overview` 展示可用 API。
3. 根据用户具体需求（如“保存存档”），读取 `docs://cloud-save/api/cloud-save-manager/create-archive` 并提供代码示例。
