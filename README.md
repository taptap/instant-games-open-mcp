# TapTap Open API MCP 服务器

> 基于 Model Context Protocol (MCP) 的 **TapTap 小游戏和 H5 游戏**服务器 - 提供排行榜文档和管理 API，支持 **OAuth 2.0 零配置认证**。

🔐 **零配置 OAuth** | 📚 **完整文档** | 🎯 **17 Tools + 7 Resources** | 🌍 **小游戏 & H5**

## ✨ 核心特性

- **🔐 零配置认证** - OAuth 2.0 Device Code Flow，扫码即用
- **📖 完整 API 文档** - 6 个排行榜 API + 详细代码示例
- **⚙️ 服务端管理** - 创建/管理排行榜，自动处理 ID
- **🎮 H5 游戏支持** - 上传、发布、状态查询
- **🚀 三种传输模式** - stdio（本地）、SSE（远程/实时）、HTTP（兼容）
- **🔌 多客户端并发** - 独立会话管理，无限并发

**当前版本**: v1.4.13 | **NPM**: [@mikoto_zero/minigame-open-mcp](https://www.npmjs.com/package/@mikoto_zero/minigame-open-mcp)

## 🚀 快速开始

### 安装

```bash
# 全局安装
npm install -g @mikoto_zero/minigame-open-mcp

# 或使用 npx 直接运行（无需安装）
npx @mikoto_zero/minigame-open-mcp
```

### 配置（MCP 客户端）

#### Claude Code / VSCode / Cursor

在项目中创建 `.mcp.json`:

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

**零配置 OAuth**：首次使用会提示扫码授权，token 自动保存！

#### OpenHands（推荐 SSE 模式）

**远程部署**:

```bash
# 启动 SSE 服务器
TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3000 \
npx @mikoto_zero/minigame-open-mcp
```

**OpenHands 配置**:

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "url": "http://your-server:3000",
      "transport": "sse"
    }
  }
}
```

✅ SSE 模式支持自动授权和实时进度推送！

### Docker 部署

```bash
# 快速启动
docker-compose up -d

# 健康检查
curl http://localhost:5003/health
```

详见: [Docker 部署文档](docs/DOCKER_DEPLOYMENT.md)

## 📖 功能列表

### 17 个 Tools

#### 流程指引 (1)
- `get_integration_guide` - 完整接入工作流指引

#### 信息查询 (2)
- `get_current_app_info` - 获取当前应用信息
- `check_environment` - 检查环境配置

#### 认证 (1)
- `complete_oauth_authorization` - 完成 OAuth 授权

#### 应用管理 (2)
- `list_developers_and_apps` - 列出所有应用
- `select_app` - 选择当前应用

#### 排行榜管理 (4)
- `create_leaderboard` - 创建排行榜
- `list_leaderboards` - 列出排行榜
- `publish_leaderboard` - 发布排行榜
- `get_user_leaderboard_scores` - 获取用户分数

#### H5 游戏管理 (7)
- `list_h5_games` - 列出 H5 游戏
- `create_h5_game` - 创建 H5 游戏
- `update_h5_game` - 更新游戏信息
- `upload_h5_game` - 上传游戏包
- `publish_h5_game` - 发布游戏
- `get_h5_game_status` - 查询发布状态
- `get_h5_game_share_url` - 获取分享链接

### 7 个 Resources

完整的排行榜 API 文档：
- `docs://leaderboard/overview` - 完整概览
- `docs://leaderboard/api/get-manager` - 初始化
- `docs://leaderboard/api/submit-scores` - 提交分数
- `docs://leaderboard/api/open` - 显示 UI
- `docs://leaderboard/api/load-scores` - 加载数据
- `docs://leaderboard/api/load-player-score` - 玩家排名
- `docs://leaderboard/api/load-centered-scores` - 周围玩家

## 🎯 使用示例

### 接入排行榜

```
用户: "我想在游戏中接入排行榜"

AI 调用: get_integration_guide
→ 返回完整工作流（创建排行榜 → 客户端代码 → 测试）

AI 调用: create_leaderboard
→ 创建服务端排行榜

AI 读取: docs://leaderboard/api/submit-scores
→ 获取客户端代码示例
```

### OAuth 授权（首次）

```
AI 调用: create_leaderboard
→ 🔐 需要授权，显示二维码链接

用户: 扫码后告知 "已授权"

AI 调用: complete_oauth_authorization
→ ✅ 授权完成，token 已保存

AI 调用: create_leaderboard
→ ✅ 排行榜创建成功
```

## 🛠️ 开发

### 环境要求

- Node.js 16+
- npm 或 pnpm

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build

# 运行测试
npm test
```

### 环境变量

**OAuth 认证（推荐）**:
- 无需配置！自动保存 token 到 `~/.config/taptap-minigame/`

**手动配置（可选）**:
- `TDS_MCP_MAC_TOKEN` - MAC Token（JSON 格式）
- `TDS_MCP_CLIENT_ID` - 客户端 ID（已内置）
- `TDS_MCP_CLIENT_TOKEN` - 签名密钥（已内置）

**其他**:
- `TDS_MCP_ENV` - 环境：`production`（默认）或 `rnd`
- `TDS_MCP_TRANSPORT` - 传输模式：`stdio`（默认）、`sse`、`http`
- `TDS_MCP_PORT` - 端口（默认 3000）
- `TDS_MCP_VERBOSE` - 详细日志：`true` 或 `false`
- `TDS_MCP_CACHE_DIR` - 缓存目录（默认 `/tmp/taptap-mcp/cache`）
- `TDS_MCP_TEMP_DIR` - 临时文件目录（默认 `/tmp/taptap-mcp/temp`）

### 添加新功能

```bash
# 使用脚手架
./scripts/create-feature.sh

# 按提示输入功能信息
# 自动生成模块结构到 src/features/yourFeature/
```

## 📚 文档

- **[CLAUDE.md](CLAUDE.md)** - AI Agent 开发指引
- **[CHANGELOG.md](CHANGELOG.md)** - 版本变更历史
- **[docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md)** - Docker 部署指南
- **[docs/MCP_PROXY_GUIDE.md](docs/MCP_PROXY_GUIDE.md)** - MCP Proxy 开发指南
- **[docs/PRIVATE_PROTOCOL.md](docs/PRIVATE_PROTOCOL.md)** - 私有参数协议

## 🔄 CI/CD

基于 Conventional Commits 的完全自动化发布：

```bash
# 创建功能分支
git checkout -b feat/awesome-feature

# 提交代码
git commit -m "feat: add awesome feature"

# 创建 PR 并合并
gh pr create && gh pr merge

# 自动发布到 npm（版本：1.4.13 → 1.5.0）
```

**发布流程**：
1. PR 合并 → 触发 Actions
2. 分析 commits 确定版本号
3. 发布到 npm
4. 自动创建版本 PR 并合并
5. 创建 GitHub Release

详见: [CLAUDE.md - CI/CD 章节](CLAUDE.md#cicd-和自动化发布)

## 🤝 贡献

欢迎贡献！请遵循：
1. Fork 仓库并创建 feature 分支
2. 使用 Conventional Commits 规范
3. 创建 PR，等待 CI 检查
4. Review 通过后合并

## 📄 许可证

MIT

## 🔗 相关链接

- [TapTap 开发者中心](https://developer.taptap.cn/)
- [官方 API 文档](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Issues](https://github.com/taptap/taptap_minigame_open_mcp/issues)
