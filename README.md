# TapTap Open API MCP 服务器

> 基于 Model Context Protocol (MCP) 的 **TapTap 小游戏和 H5 游戏**服务器，提供排行榜、分享、多人联机、云存档，以及当前游戏 DC 数据查询、统计概览与评价操作能力，并支持 **OAuth 2.0 零配置认证**。

🔐 **零配置 OAuth** | 📚 **完整文档** | 🎯 **丰富 Tools & Resources** | 🌍 **小游戏 & H5** | 📦 **单文件 Bundle**

## ✨ 核心特性

- **🔐 零配置认证** - OAuth 2.0 Device Code Flow，扫码即用
- **📖 完整 API 文档** - 6 个排行榜 API + 详细代码示例
- **⚙️ 服务端管理** - 创建/管理排行榜，自动处理 ID
- **🎮 H5 游戏支持** - 上传、发布、状态查询
- **🧭 当前游戏 DC 能力** - 商店/评价/社区统计概览、商店快照、论坛内容、评价列表、评价点赞、官方回复
- **🦞 OpenClaw Plugin** - 提供一个原生 OpenClaw plugin 子包，内部复用 TapTap MCP 运行时并暴露 raw JSON 工具 + bundled skill
- **🚀 三种传输模式** - stdio（本地）、SSE（远程/实时）、HTTP（兼容）
- **🔌 多客户端并发** - 独立会话管理，无限并发
- **📦 单文件 Bundle** - 零依赖，包体积减少 96%（567 KB）
- **🤖 智能引导** - AI Agent 自动验证前置条件，主动询问用户选择

**NPM**: [@taptap/instant-games-open-mcp](https://www.npmjs.com/package/@taptap/instant-games-open-mcp)
**Maker NPM**: [@taptap/maker](https://www.npmjs.com/package/@taptap/maker)

## 🦞 OpenClaw Plugin（实验中）

仓库内提供了一个可独立发布的 OpenClaw plugin 子包：

- [`packages/openclaw-dc-plugin`](packages/openclaw-dc-plugin)

这个子包的设计目标是：

- 让 OpenClaw 用户只安装一个 plugin
- plugin 内部复用 `@taptap/instant-games-open-mcp` 运行时
- 对 OpenClaw 暴露 raw JSON 工具
- 同时内置 `taptap-dc-ops-brief` skill，让模型自己做简报解读

说明：

- 主包里的 `*_raw` tools 默认不会暴露给普通 MCP 客户端
- 只有设置 `TAPTAP_MCP_ENABLE_RAW_TOOLS=true` 时才会注册
- OpenClaw plugin 会自动打开这个开关，因此插件用户不需要额外配置

详见：

- [OpenClaw Plugin 说明](docs/OPENCLAW_PLUGIN.md)
- 维护者发布方式：`npm run openclaw:pack` / `npm run openclaw:publish`

## 🛠️ TapTap Maker 本地开发（CLI-first）

Maker 本地开发按“初始化用 CLI，开发循环用 MCP”拆分。首次配置推荐直接运行：

```bash
npx -y @taptap/maker init
```

CLI 负责一次性流程：Git 检查、PAT 保存、TapTap token 换取、app 列表选择、Maker Git
clone、AI dev kit 准备、MCP 配置写入与基础验证。安装或修改 MCP 配置后，Claude Code /
Codex / Cursor 通常需要重启会话、刷新 MCP 或新开窗口才会出现新的 MCP tools；但当前终端
里的 CLI 初始化流程可以继续完成到 PAT 鉴权和项目绑定。

常用 CLI：

```bash
taptap-maker init
taptap-maker doctor
taptap-maker apps --json
taptap-maker pat set
taptap-maker install --ide codex,cursor,claude
taptap-maker mcp verify
taptap-maker dev-kit update
```

`taptap-maker pat set` 默认通过交互式 prompt 接收 PAT，避免把 PAT 写进
`ps` 进程列表或 shell history；自动化场景可用 `--pat-stdin` 从标准输入读取。
`taptap-maker install` 是 `taptap-maker mcp install` 的快捷别名，二者都会写入 AI 客户端
MCP 配置。`taptap-maker mcp verify` 默认验证 `mcp install` 写入 AI 客户端配置的 npx 启动命令；
本地开发只想验证当前 CLI 时可加 `--mode self`。如果验证输出 `status: null` 或
`failure_type`，说明本地 Node/npm/npx 启动命令还没正常跑通，Maker MCP server
尚未启动；这不是 PAT、app 选择或 Maker 业务接口报错。先按输出里的 command
在终端直接执行，再检查 `where.exe npx/node/npm`、`node -v` 和 `npm -v`。

MCP 精简为开发循环里的高频能力：

```text
maker://status                  # Resource，读取本地 Maker 状态
maker_status_lite               # Resource 不可用时的兼容 tool
maker_build_current_directory   # commit/push/build 合并入口
maker_pull_runtime_logs         # 单次拉取运行日志并落到本地固定路径
taptap-maker logs watch         # CLI，构建成功后持续轮询运行日志
```

`maker_build_current_directory` 同时覆盖“构建 / 预览 / 跑一下 / 验证一下 / 提交 / 推送”。
如果本地有改动或已有未推送 commit，工具会先 commit（必要时）、push 到 Maker 远端，再触发远端
build。push 失败时不会继续 build，会返回本地 commit、ahead 状态、stderr/stdout 和下一步建议，
交给本地 Agent/skill 处理 pull、rebase 或冲突；push 成功但 build 失败时，会明确说明代码已到
Maker 远端但构建失败。只有用户明确说“不提交，只构建云端版本”时，才传
`confirm_remote_build_without_submit=true`。

构建成功并收到远端 build 返回后，Maker MCP 会主动调用当前环境的 Maker Web
`/api/v1/apps/<APP_ID>/preview-refresh`，让 Web 端预览页刷新到最新构建。
构建成功输出会同时给出本地 watcher 状态；MCP 在收到远端 build 返回后会启动本地
`taptap-maker logs watch --target-dir <PROJECT_ROOT> --reset --interval 5s` detached 进程，
由 CLI 清理历史日志并持续轮询。后续如果用户询问游戏运行结果、Lua 报错或调试问题，
本地 AI Agent 应优先读取返回中的 `runtime_logs.local_file`；如需判断 watcher 是否正常，
读取 `runtime_logs.state_file`。

`maker_pull_runtime_logs` 只做固定的一次性业务流：调用远端 `query_runtime_logs`，默认只拉
`user_script`（客户端 Lua 脚本）和 `server_user_script`（服务端 Lua 脚本）。本地只追加写入一份
`.maker/logs/runtime/runtime.log`，保持 server 日志行格式（`t/topic/level/msg/userId` 等），
但去掉无用的 `id` 字段，也不再补 `time/message` 重复字段；`.maker/logs/runtime/state.json`
保存下一次查询游标和 watcher 心跳状态，包括最近轮询时间、最近成功时间、最近写入条数、
连续失败次数和最后错误。
持续轮询和清理旧日志由 `taptap-maker logs watch --reset --interval 5s` 承担，不放进 MCP
tool 长调用；远端返回 `hasMore=true` 时会立即继续拉取，否则每 5 秒轮询一次。

`maker://status` 和 `maker_status_lite` 会在已绑定项目里检查 Maker 远端同步状态。
如果远端有新提交，状态输出会区分本地工作区是否干净：干净时提示可先
`git pull --ff-only origin main`，有本地改动时提示不要直接 pull，应让本地 Agent 先处理
提交、stash 或取消同步。
频繁轮询状态或只需要快速本地状态时，调用 `maker_status_lite` 应传
`skip_remote_sync=true`，避免每次状态查询都触发 `git fetch origin` 网络往返。

首次 clone/fetch 和 push 遇到 503、HTTP 5xx、超时、连接重置、RPC/HTTP2 中断等临时网络错误时会自动重试；认证、权限、仓库不存在、远端拒绝和本地目录冲突不会重试，会把错误分类交给 Agent 处理。首次 clone/fetch 前 CLI 会提示 Maker server 可能正在准备仓库，首次拉代码 20 秒以上是正常现象，建议保持命令运行等待自动重试。

Windows 是默认优先级：CLI 写 MCP 配置时会在 Windows 使用 `npx.cmd`，Git 引导优先提示
Git for Windows，并要求安装选项允许命令行和第三方工具通过 PATH 找到 Git。macOS 用户可通过
`git --version` 触发 Xcode Command Line Tools，或安装官方 Git。

### Maker 本地 Workflow Skills（实验中）

Maker 现在同时内置三个工作流 skill：

- `taptap-maker-local`：把 Maker 初始化转交 CLI，并让本地 AI/Agent 按 push 失败分类处理 pull/rebase、切回 main、移除禁止路径、鉴权刷新、冲突和构建失败恢复。
- `taptap-maker-dev-kit-guide`：介绍 clone 时安装到项目目录的 AI dev kit，明确 `CLAUDE.md`、`examples/`、`templates/`、`urhox-libs/` 的用途。
- `update-taptap-mcp`：引导用户更新本地 npx 缓存里的 `@taptap/maker`，并提醒 Maker MCP 推荐安装到 user/global scope。

初始化流程里，PAT 验证通过、用户选择 app 后，`taptap-maker init` 会先完成 Maker Git checkout，再自动准备本地 AI dev kit。

CLI 会根据 `TAPTAP_MCP_ENV` 自动选择下载源：`production`（默认）使用 `https://urhox-demo-platform.spark.xd.com/ai-dev-kit/pd/stable/ai-dev-kit.zip`，`rnd` 使用 `https://urhox-demo-platform.spark.xd.com/ai-dev-kit/rnd/latest/ai-dev-kit.zip`，checkout 后解压开发环境文档、引擎 API、demo、Lua 工具和本地 AI skills 到当前目录，并用 dev kit 覆盖同名本地辅助文件；解压复制完成后会自动运行 `tools/install-skills.sh all`（Linux/macOS）或 `tools/install-skills.ps1 all`（Windows），把 dev kit skills 安装到各 Agent 的发现目录。CLI 会先输出 `AI skills install started: <script>`，完成后输出 `AI skills install result: claude=N, codex=N, cursor=N, gemini=N`；脚本缺失、跳过或失败时也会输出原因，失败会带上平台、脚本、命令、stdout 和 stderr，方便 AI 与用户直接判断安装情况。流程会跳过 ZIP 里的顶层 `scripts` 目录并删除下载 ZIP，避免和 Maker 项目代码冲突。dev-kit 准备阶段会生成 `.gitignore.dev-kit-before-clone` 临时 block，准备成功后自动合并到远端 `.gitignore`，防止这些本地开发环境文件、Agent skill 目录和 `.maker/` 本地运行状态被提交到 Maker Git。

`maker://status` 和 `maker_status_lite` 会输出已随包内置的 skill 名称和文档路径：`taptap-maker-local`、`taptap-maker-dev-kit-guide` 与 `update-taptap-mcp`。Maker 操作目标是用户当前项目目录；若 MCP 进程 cwd 是临时对话目录，Agent 应把用户当前项目目录作为 `target_dir` 传入，不扫描其他项目。已绑定项目会检查 `CLAUDE.md`、`examples/`、`templates/`、`urhox-libs/`，并输出 `skill_install_status` 和 `skill_install_summary` 说明 `.claude/.codex/.cursor/.gemini` 下的 skill 安装状态；缺失时用 `taptap-maker dev-kit update` 恢复本地 AI dev kit 并刷新 `.gitignore` 管理块。

Git 引导：

- macOS：用户自行执行 `git --version`，按系统提示安装 Xcode Command Line Tools，或访问 `https://git-scm.com/download/mac` 下载安装器。
- Windows：用户自行访问 `https://git-scm.com/download/win` 安装 Git for Windows，并确保安装选项允许命令行和第三方工具通过 PATH 找到 Git。
- 安装后需要重启 MCP 客户端或终端，再用 `git --version` 验证。

详见：[TapTap Maker 本地开发](docs/MAKER.md)。面向团队介绍的功能总览见
[Maker CLI + MCP + Skill Rework Overview](docs/MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md)。

## 🧩 Codex Skills（运营简报）

本仓库内置一个面向运营/工作室的 Codex Skill：`taptap-dc-ops-brief`，用于把“当前游戏 DC 数据”整理成 30 秒可读的结论简报，并在你确认后执行评价点赞/官方回复等动作。

### 安装到 Codex

在已安装 Codex 的机器上运行：

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo taptap/instant-games-open-mcp \
  --path skills/taptap-dc-ops-brief
```

安装完成后重启 Codex，即可在对话中使用：

> 使用 `$taptap-dc-ops-brief` 生成当前游戏的 7 日运营简报，并给出是否建议点赞/回复评价（先出草稿，等我确认再发）。

## 🚀 快速开始

> 🐣 **完全不懂技术？** [快速开始（零基础版）](docs/QUICK_START.md) - 3 分钟搞定 Cursor 配置，复制粘贴就能用。
>
> 📖 **想了解更多配置？** [详细配置指南](docs/USER_GUIDE.md) - Cursor、Claude Code、VS Code、Claude Desktop 等多种工具的配置方法。

### 安装

```bash
# 全局安装
npm install -g @taptap/instant-games-open-mcp

# 或使用 npx 直接运行（无需安装）
npx @taptap/instant-games-open-mcp
```

### 配置（MCP 客户端）

#### Claude Code / VSCode / Cursor

在项目中创建 `.mcp.json`:

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@taptap/instant-games-open-mcp"],
      "env": {
        "TAPTAP_MCP_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

**重要说明**：

- **零配置 OAuth**：首次使用会提示扫码授权，token 自动保存！
- **路径处理**：设置 `TAPTAP_MCP_WORKSPACE_ROOT` 环境变量可以正确解析相对路径（推荐）
  - 如果不设置，相对路径会基于用户 HOME 目录（可能不符合预期）
  - 建议使用绝对路径，或配置 `TAPTAP_MCP_WORKSPACE_ROOT`
- **Windows 启动报 `Received protocol 'c:'`**：这是旧版本 Windows ESM 动态导入路径兼容问题，请升级到包含该修复的最新版本。

#### OpenHands（推荐 SSE 模式）

**远程部署**:

```bash
# 启动 SSE 服务器
TAPTAP_MCP_TRANSPORT=sse TAPTAP_MCP_PORT=3000 \
npx @taptap/instant-games-open-mcp
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

✅ SSE 模式支持实时进度推送！

### Docker 部署

```bash
# 快速启动（同时运行 Production 和 RND 环境）
cd docker/npm
docker-compose up -d

# 健康检查
curl http://localhost:5003/health  # Production
curl http://localhost:5002/health  # RND
```

详见: [Docker 部署文档](docker/README.md)

## 📖 功能列表

### 核心 Tools（含当前游戏 DC 能力）

#### 流程指引 (1)

- `get_leaderboard_integration_guide` - 排行榜完整接入工作流指引

#### 信息查询 (3)

- `get_current_app_info` - 获取当前应用信息
- `check_environment` - 检查环境配置
- `get_environment_switch_guide` - 获取 production/RND 环境切换配置指引

#### 认证 (3)

- `start_oauth_authorization` - 开始 OAuth 授权（获取二维码）
- `complete_oauth_authorization` - 完成 OAuth 授权
- `clear_auth_data` - 清除认证数据和缓存

#### 应用管理 (3)

- `list_developers_and_apps` - 列出所有开发者和应用（含关卡与非关卡）
- `select_app` - 选择当前应用（支持关卡与非关卡）
- `create_developer` - 创建新开发者

#### 当前游戏 DC 能力 (8)

- `get_current_app_store_overview` - 获取当前游戏商店统计概览（曝光、下载、预约、下载请求趋势）
- `get_current_app_review_overview` - 获取当前游戏评价统计概览（评分、好中差评、评分趋势）
- `get_current_app_community_overview` - 获取当前游戏社区统计概览（帖子、关注、浏览、趋势）
- `get_current_app_store_snapshot` - 获取当前游戏商店结果型快照
- `get_current_app_forum_contents` - 获取当前游戏论坛内容
- `get_current_app_reviews` - 获取当前游戏评价列表
- `like_current_app_review` - 给当前游戏指定评价点赞
- `reply_current_app_review` - 以官方身份回复当前游戏评价

#### 排行榜管理 (5)

- `create_leaderboard` - 创建排行榜
- `list_leaderboards` - 列出排行榜
- `publish_leaderboard` - 发布排行榜
- `get_user_leaderboard_scores` - 获取用户分数
- `get_app_status` - 获取应用审核状态

#### H5 游戏管理 (3)

- `prepare_h5_upload` - 收集 H5 游戏信息（上传前）
- `upload_h5_game` - 上传 H5 游戏包
- `get_debug_feedbacks` - 拉取用户调试反馈并下载日志/截图

#### 振动 API 文档 (1)

- `get_vibrate_integration_guide` - 振动 API 完整文档和接入指引

### 11 个 Resources

完整的排行榜 API 文档：

- `docs://leaderboard/overview` - 完整概览
- `docs://leaderboard/api/get-manager` - 初始化
- `docs://leaderboard/api/submit-scores` - 提交分数
- `docs://leaderboard/api/open` - 显示 UI
- `docs://leaderboard/api/load-scores` - 加载数据
- `docs://leaderboard/api/load-player-score` - 玩家排名
- `docs://leaderboard/api/load-centered-scores` - 周围玩家

完整的振动 API 文档：

- `docs://vibrate/overview` - 完整概览
- `docs://vibrate/api/vibrate-short` - 短振动 API
- `docs://vibrate/api/vibrate-long` - 长振动 API
- `docs://vibrate/patterns` - 使用模式和最佳实践

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

- Node.js 18.14.1+
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

### Maker 本地开发预览

Maker 本地开发现在以 CLI-first 为准。初始化、PAT、app 选择、dev-kit 和 clone 都走 CLI；MCP 只保留状态和同步构建：

```text
taptap-maker init
taptap-maker doctor
taptap-maker apps
taptap-maker mcp verify
maker://status
maker_status_lite
maker_build_current_directory
```

`taptap-maker doctor` 会检查 Git、PAT、TapTap token、项目绑定和 MCP 配置。若 Git 不可用，clone/push 会直接停止，直到用户自行安装 Git 并通过 `git --version` 验证。
`taptap-maker mcp verify` 默认跑一次实际 MCP 配置使用的 npx 包命令；本地 dist 自测可用 `--mode self`。如果失败结果显示 `failure_type` 或 `status: null`，优先按本地 Node/npm/npx 启动问题处理，Maker MCP server 此时尚未启动，不要误判为 PAT 或 Maker 服务报错。

测试时引导用户访问当前环境的 PAT 页面新建 Maker PAT，
production 使用 `https://maker.taptap.cn/pat-tokens`，RND 使用 `https://fuping.agnt.xd.com/pat-tokens`，
再运行 `taptap-maker pat set` 并在 prompt 中粘贴 PAT，CLI 会同步获取 TapTap token。
当前目录未绑定时，APP_ID 应通过 `taptap-maker init` 或 `taptap-maker apps` 返回的 app 列表让用户选择；当前目录已绑定时不要再次引导 clone。

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/maker.js
```

详细说明见 [docs/MAKER.md](docs/MAKER.md)。

### 环境变量

**OAuth 认证（推荐）**:

- 无需配置！自动保存 token 到 `~/.config/taptap-minigame/`

**手动配置（可选）**:

- `TAPTAP_MCP_MAC_TOKEN` - MAC Token（JSON 格式）
- `TAPTAP_MCP_CLIENT_ID` - 客户端 ID（非必需，不配置会导致部分工具无法使用）
- `TAPTAP_MCP_CLIENT_SECRET` - 签名密钥（非必需，不配置会导致部分工具无法使用）

**其他**:

- `TAPTAP_MCP_ENV` - 环境：`production`（默认）或 `rnd`
- `TAPTAP_MCP_DC_CURRENT_APP_BASE_URL` - 当前游戏 DC 接口 host 覆盖（可选，路径仍为 `/mcp/v1/current-app/...`）
- `TAPTAP_MCP_TRANSPORT` - 传输模式：`stdio`（默认）、`sse`、`http`
- `TAPTAP_MCP_PORT` - 端口（默认 3000）
- `TAPTAP_MAKER_CRASH_LOG_MAX_BYTES` - Maker MCP 崩溃日志 `~/.taptap-maker/mcp-crash.log` 上限，默认 1 MiB
- `TAPTAP_MAKER_CRASH_LOG_MAX_ENTRY_BYTES` - Maker MCP 单条崩溃日志上限，默认 16 KiB
- `TAPTAP_MCP_VERBOSE` - 详细日志：`true` 或 `false`
- `TAPTAP_MCP_CACHE_DIR` - 缓存目录（默认 `/tmp/taptap-mcp/cache`）
- `TAPTAP_MCP_TEMP_DIR` - 临时文件目录（默认 `/tmp/taptap-mcp/temp`）

**日志配置**:

- `TAPTAP_MCP_LOG_ROOT` - 日志根目录（默认 `/tmp/taptap-mcp/logs`）
- `TAPTAP_MCP_LOG_FILE` - 启用文件日志：`true` 或 `false`（默认 `false`）
- `TAPTAP_MCP_LOG_LEVEL` - 日志级别（RFC 5424）：`debug`、`info`、`notice`、`warning`、`error`、`critical`、`alert`、`emergency`（默认 `info`）
- `TAPTAP_MCP_LOG_MAX_DAYS` - 日志保留天数（默认 7）

详细说明请参考 [docs/LOG_SYSTEM.md](docs/LOG_SYSTEM.md)

### 环境切换帮助

如果需要在 AI 对话中切换测试环境，可以让 AI 调用
`get_environment_switch_guide` 查看配置示例，再更新 MCP 客户端配置中的 `env` 字段。
RND 环境需要显式配置 `TAPTAP_MCP_CLIENT_ID` 和 `TAPTAP_MCP_CLIENT_SECRET`，
production 通常使用内置 native signer，无需额外配置。

### 添加新功能

```bash
# 使用脚手架
./scripts/create-feature.sh

# 按提示输入功能信息
# 自动生成模块结构到 src/features/yourFeature/
```

## 🤖 AI Agent 智能引导

本服务器经过精心设计，通过工具描述引导 AI Agent 提供更智能的用户体验：

### 自动前置条件检查

AI Agent 会在执行排行榜操作前，自动检查是否已选择应用：

```
用户: "创建一个排行榜"

AI: 让我先检查当前是否已选择应用...
    [调用 get_current_app_info]

    发现尚未选择应用，我来帮您列出可用的应用：
    [调用 list_developers_and_apps]

    请问您想为哪个应用创建排行榜？
    共 200 个应用，当前先展示前 40 个；如果没有看到目标应用，
    可以继续查看更多，或提供 App ID/名称关键词继续定位。
    如果客户端宽度足够，可以把预览整理成两列紧凑布局；窄屏保持单列。
    1. 游戏 A (Developer: 开发者A, App ID: 12345)
    2. 游戏 B (Developer: 开发者B, App ID: 67890)
```

### 主动询问用户选择

当有多个选项时，AI Agent 会主动展示列表并询问用户：

```
用户: "查看排行榜"

AI: 您有以下几个排行榜：
    1. 每日高分榜 (ID: lb_001)
    2. 周排行榜 (ID: lb_002)
    3. 全服总榜 (ID: lb_003)

    请问您想查看哪一个？
```

### 工作流程自动优化

AI Agent 会自动引导用户完成必要的步骤，避免操作失败：

```mermaid
graph LR
    A[用户请求] --> B{检查应用选择}
    B -->|未选择| C[列出应用]
    C --> D[询问用户]
    D --> E[选择应用]
    E --> F[执行操作]
    B -->|已选择| F
```

**受益场景：**

- 创建/查询排行榜
- 发布排行榜
- 上传 H5 游戏
- 所有需要应用上下文的操作

**技术实现：**
通过在工具描述中使用 `**PREREQUISITE:**`、`**CRITICAL:**`、`**IMPORTANT:**` 等关键词，以及明确的步骤指导，让 AI Agent 理解何时需要检查前置条件、何时应该询问用户。

详见：[CLAUDE.md - AI Agent 工具使用指导](CLAUDE.md#ai-agent-工具使用指导)

## 📚 文档

### 用户文档

- **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)** - 🐣 新手配置指南（Cursor/VS Code/Claude Code）
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - 贡献指南
- **[CHANGELOG.md](CHANGELOG.md)** - 版本变更历史

### 技术文档

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - 架构文档
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - 部署指南（本地、Docker、开发者测试）
- **[docs/PROXY.md](docs/PROXY.md)** - MCP Proxy 开发指南（面向 TapCode 等平台）
- **[docs/CI_CD.md](docs/CI_CD.md)** - CI/CD 和自动化发布流程
- **[docs/PATH_RESOLUTION.md](docs/PATH_RESOLUTION.md)** - 路径解析系统

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

详见: [docs/CI_CD.md](docs/CI_CD.md)

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
- [Issues](https://github.com/taptap/instant-games-open-mcp/issues)
