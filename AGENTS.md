# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 全局工作指引

**重要：Codex 在此项目中的工作规范**

### 文档更新规则

- **主动更新文档**：当有重要代码改动时（新特性、架构变更、API 修改），必须同时更新相关文档：
  - `AGENTS.md` - 开发指南和技术文档
  - `README.md` - 用户文档和使用说明
  - `docs/` - 相关技术文档
  - **不需要每次都问用户是否更新文档，主动更新即可**
  - **注意**：`CHANGELOG.md` 由 CI/CD 自动生成，无需手动维护

### Git 提交规范

> ⚠️ **重要：提交前必须确认 commit type！**
>
> 不同的 type 会触发不同的版本更新行为。提交前请先确认：
>
> - 本次改动是否需要触发版本更新？
> - 如果只是文档、调试、配置等改动，应使用 `chore:`、`docs:`、`ci:` 等不触发发布的 type
> - 如果是功能或修复，才使用 `feat:`、`fix:`、`refactor:` 等触发发布的 type

- **使用 Conventional Commits 规范**：项目已配置自动化 CI/CD，commit 消息格式至关重要

**触发版本更新的 type：**

- `feat:` - 新功能（触发 minor 版本升级）
- `fix:` - Bug 修复（触发 patch 版本升级）
- `feat!:` 或 `fix!:` - 破坏性变更（触发 major 版本升级）
- `refactor:` - 代码重构（触发 patch 版本升级）
- `perf:` - 性能优化（触发 patch 版本升级）

**不触发版本更新的 type：**

- `docs:` - 文档更新
- `chore:` - 构建/工具/配置/调试相关
- `test:` - 测试相关
- `ci:` - CI 配置更新
- `style:` - 代码格式
- `build:` - 构建系统变更

- **Commit Message 格式规范**（基于 `.commitlintrc.cjs`）：

  ```
  <type>(<scope>): <subject>

  <body>

  <footer>
  ```

  - **Header**（第一行，必填）：
    - 格式：`<type>(<scope>): <subject>`
    - 最大长度：100 字符
    - Type 必须小写
    - Scope 必须小写（可选）
    - Subject：最少 5 字符，最多 100 字符，不以句号结尾
  - **Body**（可选）：
    - 详细描述改动内容
    - 与 header 之间必须有空行
    - 每行不超过 100 字符（由 `body-max-line-length` 强制）
  - **Footer**（可选）：
    - 关联 issue 或注明破坏性变更
    - 与 body 之间必须有空行

- **完整示例**：

```
feat(leaderboard): add score submission API

- 新增 submitScores 工具
- 支持批量提交分数
- 添加输入验证

Closes #123
```

**注意事项**：

- ✅ Type 和 Scope 必须小写
- ✅ Subject 最少 5 字符，不以句号结尾
- ✅ Body 每行不超过 100 字符
- ✅ Body 和 Footer 前必须有空行
- ❌ 错误示例：`Feat(API): Added feature.`（Type 大写、Scope 大写、Subject 以句号结尾）

### Copilot/AI 提交规范

> 📄 详细规范请参考 `.github/copilot-instructions.md`

**Copilot 和其他 AI 工具必须遵循 Conventional Commits 规范。**

- ❌ **禁止的提交消息**：`Initial plan`、`WIP`、`temp`、`test` 等无类型前缀的消息
- ✅ **正确格式**：`feat(proxy): add new feature`、`chore(planning): initial investigation`
- ⚙️ **Commitlint 已配置忽略规则**：自动忽略 `Initial plan`、`WIP` 等模式的提交

### 分支工作流

- ❌ **不要直接 commit 到 main 分支**（已配置分支保护）
- ✅ **创建 feature/fix 分支** → 提交代码 → 创建 PR
- ❌ **PR 合并后不会自动发布 npm**
- ✅ **主包 npm 发布只能手动运行 GitHub Actions workflow**

**工作流程：**

```
feature 分支开发 → git commit (规范格式) → git push → 创建 PR
→ CI 检查 → Code Review → Merge PR → 需要发布时人工触发 workflow → 更新文档
```

### Git 工作区保护规则 ⚠️

**重要：所有 Git 操作必须保护工作区，防止代码丢失！**

- ✅ **切换分支前必须保存工作区**：

  ```bash
  # 方案 1：提交当前更改
  git add .
  git commit -m "wip: save current work"
  git checkout -b new-branch

  # 方案 2：暂存当前更改
  git stash push -m "description"
  git checkout -b new-branch
  git stash pop  # 恢复更改
  ```

- ❌ **永远不要在工作区有未保存更改时切换分支**
- ❌ **永远不要使用 `git checkout -- .` 或 `git reset --hard` 清理工作区**（会导致代码丢失）
- ✅ **如需清理工作区，先确认有 commit 或 stash 备份**

**详细流程参考：** [docs/CI_CD.md](docs/CI_CD.md)

## 项目概述

基于 Model Context Protocol (MCP) 的 TapTap Open API MCP 服务器，为 **TapTap Minigame 和 H5 游戏**提供排行榜、分享、多人联机、云存档，以及当前游戏 DC 数据查询、统计概览与评价操作能力。

**核心特性：**

- 🏆 排行榜系统 - 完整的 API 文档和服务端管理
- 🎮 H5 游戏管理 - 上传、发布、状态查询
- 🧭 当前游戏 DC 能力 - 商店/评价/社区统计概览、商店快照、论坛内容、评价列表、点赞、官方回复
- 🦞 OpenClaw Plugin 子包 - `packages/openclaw-dc-plugin`，面向 OpenClaw 暴露 raw JSON tools，并 bundled 运营简报 skill
- 🛠️ Maker 本地 MCP - `taptap-maker` 支持 PAT-first 的 app 列表、项目 clone/push 和远端构建转发
- 🔐 OAuth 2.0 Device Code Flow - 零配置认证（扫码即用）
- 🎯 完整功能集 - 多类 Tools + Resources，覆盖文档查询与服务端动作
- 🚀 MCP 2025 标准 - Streamable HTTP + RFC 5424 Logging
- 📡 三种传输协议 - stdio（本地）+ SSE（远程/实时）+ HTTP JSON（兼容）
- 🔌 多客户端并发 - 独立会话管理，无限并发

**基本信息：**

- **NPM 包：** `@taptap/instant-games-open-mcp`
- **OpenClaw Plugin 子包：** `packages/openclaw-dc-plugin`（计划独立发布为 npm plugin）
- **官方 API 文档：** https://developer.taptap.cn/minigameapidoc/

## 架构概览

项目采用**三层模块化架构设计**：

```
功能模块层 (src/features/)
  ├── app/         - 应用管理模块（基础功能）
  ├── dcCurrentApp/ - 当前游戏 DC 能力模块
  ├── leaderboard/ - 排行榜模块
  ├── h5game/      - H5 游戏模块
  └── [未来]       - cloudSave/, share/ 等
       ↓ 依赖
核心共享层 (src/core/)
  ├── auth/        - OAuth 2.0 Device Code Flow
  ├── network/     - HTTP Client（MAC 认证 + 签名）
  ├── handlers/    - 通用处理器
  ├── utils/       - 工具函数
  └── types/       - 类型定义
       ↓ 依赖
服务器层
  ├── src/server.ts        - 主服务器（自动注册所有模块）
  └── bin/instant-games-open-mcp - NPM 可执行入口
```

**关键设计模式：**

1. **统一格式** - Tools 和 Resources 采用统一对象数组格式

```typescript
// Tools 统一格式
export const myTools: ToolRegistration[] = [
  {
    definition: { name: 'my_tool', ... },
    handler: async (args: { param: string }, context, extra) => { ... }
  }
];
```

2. **模块依赖规则**

- ✅ 业务模块可依赖 `core/` 和 `features/app/`
- ❌ 业务模块之间不能相互依赖
- ✅ app 模块只依赖 core，不依赖其他业务模块

3. **私有参数协议**（v1.3.0+）

- 支持 MCP Proxy 模式的多账号认证
- 对 AI Agent 和业务层完全透明
- 双模式注入：参数（`_mac_token`）或 Header（`X-TapTap-Mac-Token`）

**完整架构详见：** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## AI Agent 工具使用指导

**设计原则：通过工具描述引导 AI Agent 行为**

### 核心设计理念

本项目通过精心设计的工具描述（Tool Description）来引导 AI Agent 的行为，确保：

1. **提前验证前置条件** - 避免因缺少必要信息而导致的操作失败
2. **优先询问用户选择** - 当有多个选项时，主动询问用户而不是自动决策
3. **提供清晰的错误指导** - 当操作失败时，明确告知下一步应该做什么

### 工具描述优化策略

#### 1. 前置条件检查

对于需要应用上下文的操作（如排行榜管理），工具描述中明确说明：

```
**PREREQUISITE: An app MUST be selected first.**
Before calling this tool, ALWAYS call get_current_app_info to verify
an app is selected. If not, guide user through:
1) Call list_developers_and_apps
2) Show list to user and ASK them to choose
3) Call select_app with user's choice
```

**受益工具：**

- `create_leaderboard` - 创建排行榜前必须选择应用
- `list_leaderboards` - 查询排行榜前必须选择应用
- `publish_leaderboard` - 发布排行榜前必须选择应用

#### 2. 强制用户确认

对于涉及选择的操作，工具描述中强调：

```
**CRITICAL: Show the returned preview/counts to the user and explicitly
ASK them to choose or provide app_id/name keywords - DO NOT automatically
select without user confirmation, even if there is only one option.**
For large accounts, avoid dumping every app into chat; use raw/JSON output
only for machine-readable lookup.
```

**受益工具：**

- `list_developers_and_apps` - 显示预览/总数并询问用户选择，长列表不逐条刷屏
- `select_app` - 仅在用户明确确认后才调用
- `list_leaderboards` - 有多个排行榜时询问用户选择

#### 3. 渐进式引导流程

**标准工作流：**

```mermaid
graph TD
    A[用户请求操作] --> B{是否需要应用上下文?}
    B -->|是| C[调用 get_current_app_info]
    B -->|否| H[直接执行操作]
    C --> D{应用已选择?}
    D -->|是| H
    D -->|否| E[调用 list_developers_and_apps]
    E --> F[显示列表并询问用户]
    F --> G[用户确认后调用 select_app]
    G --> H[执行目标操作]
```

### 实施要点

1. **工具描述是 AI 的行为准则**
   - 使用加粗的 `**PREREQUISITE:**` `**CRITICAL:**` `**IMPORTANT:**` 等关键词
   - 使用大写的 `MUST`、`ALWAYS`、`DO NOT` 来强调
   - 明确列出步骤 `1)`, `2)`, `3)`

2. **降低自动决策的优先级**
   - 明确说明"即使只有一个选项也要询问用户"
   - 强调"只有在用户明确确认后才调用"

3. **提供清晰的失败恢复路径**
   - 当前置条件不满足时，描述中提供完整的解决步骤
   - 使用"guide user through"语法提供流程指导

### 相关文件

- `src/features/app/tools.ts` - 应用管理工具定义
- `src/features/leaderboard/tools.ts` - 排行榜工具定义
- `src/features/h5Game/tools.ts` - H5 游戏工具定义

## 常用命令

### 开发环境设置

```bash
# 安装依赖（推荐，可复现安装）
npm ci

# 新增/更新依赖时使用
# npm install <package>

# 全局安装（可选）
npm install -g @taptap/instant-games-open-mcp
```

### 快速启动

```bash
# stdio 模式（默认，本地开发）
npm start                  # 或 npm run dev

# SSE 模式（远程部署，推荐用于 OpenHands）
npm run serve:sse          # 基础模式（端口 3000）
npm run serve:sse:dev      # 开发模式（详细日志）

# HTTP JSON 模式（兼容普通 HTTP 客户端）
npm run serve:http         # 端口 3000

# 自定义端口和环境
TAPTAP_MCP_PORT=8080 npm run serve:sse       # SSE 模式，端口 8080
TAPTAP_MCP_VERBOSE=true npm run serve:http   # HTTP 模式，启用日志
```

### Maker 本地开发（CLI-first / PAT-first）

Maker 本地开发的默认路径是 CLI-first + PAT-first：

- Maker CLI-first 重构后的正式说明在 `docs/MAKER.md`；面向团队介绍的功能总览在 `docs/MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md`。上下文压缩或长时间中断后，先读这两份文档再继续。
- 用户说“我要开发maker游戏 / 本地maker开发 / 拉取maker游戏到本地 / 把maker游戏代码拉到本地 / clone maker项目 / 下载maker游戏代码 / 初始化maker开发目录 / 配置maker本地开发 / 继续开发maker项目”时，应触发 `taptap-maker init`，由该 CLI 统一处理初始化流程。
- 如果本地没有当前环境的 Maker PAT，CLI 默认运行 CLI 登录：生成满足 `^[A-Za-z0-9_-]{16,128}$` 的临时 code，按需打开当前环境的 `/pat-tokens?code=<code>`，用户登录并点击“创建 token”后，CLI 轮询 `/api/v1/cli-auth/result?code=<code>`，拿到授权结果后完成本地鉴权配置。
- Maker 鉴权文件必须沿用线上已发布版本的原始本地保存路径，不要为 production 或 rnd 新建环境子目录；不要在用户文档或普通用户说明里暴露具体凭证缓存路径。
- 用户可运行 `taptap-maker login` 主动刷新当前环境鉴权；`taptap-maker init` 和无参数 `taptap-maker pat set` 缺 PAT 时也走 CLI 登录。兼容写法 `taptap-maker pat set <PAT>`、`--pat PAT` 或 `--pat-stdin` 仅用于 CI / 应急联调，其中 argv 形式会让 PAT 进入 `ps`/shell history。
- 本地研发环境配置只作为内部开发能力处理：CLI/MCP 按当前环境使用对应配置，显式 `--env` 或 `TAPTAP_MCP_ENV` 优先；项目目录级配置只读取 `.maker/taptap-maker.local.json`，不读取项目根目录散落的本地配置文件；不要把内部研发配置写入面向用户的 README/使用文档。
- `taptap-maker init` 会检查 Git、Python 环境、maker-lua-lsp 本地 Lua 诊断环境、PAT、TapTap token、当前目录绑定状态、app 列表、AI dev kit，并在用户选择 app 后先记录 `.maker-mcp/config.json`，再 checkout 到当前目录；Python 未就绪时会自动尝试准备，最多 3 次，仍失败则暂停 init 且不继续 PAT、app、clone 或 MCP 配置；Python ready 后会 best-effort 创建 Maker 私有 LSP venv，在其中安装/升级 `maker-lua-lsp` 并执行 `maker-lua-lsp install --ide codex,cursor,claude`，LSP 失败只提示错误且不阻塞远端构建。clone/fetch 失败后重复执行 init 会复用已记录 app，显式选择不同 app 会拒绝覆盖已有绑定。app 文本预览默认展示前 40 个；账号 app 很多时在 init 交互中输入 `all` 一次性展开全部，或单独跑 `taptap-maker apps --all`；`taptap-maker apps --json` 仅给 AI / 脚本解析使用。AI 转述时宽屏可用两列紧凑布局，窄屏保持单列；每个 app 保留 app_id，并在用户确认后选择 app。
- AI dev kit 安装/更新按当前环境查询最新版本信息，按返回的 `current.version` 生成版本化下载 URL；版本检查失败时降级使用内置默认下载地址。安装成功后记录本地已安装版本，`taptap-maker doctor`、`maker://status` 和 `maker_status_lite` 输出当前版本、最新版本和是否可更新。
- `taptap-maker init` 首次拉取默认使用 `git init` + `git fetch --depth=1 origin` + checkout；Git clone/fetch 会按错误内容判断是否自动重试：503、HTTP 5xx、超时、连接重置、RPC/HTTP2 中断等远端临时错误会重试；认证、权限、仓库不存在、远端拒绝和本地目录冲突不重试。
- 首次 clone/fetch 前必须提示用户：Maker server 可能正在准备仓库，首次拉代码 20 秒以上是正常现象，请保持当前命令运行。
- CLI 写 MCP 配置时优先支持 Windows：Windows 通过 `cmd.exe` 包装 `npx.cmd`，
  避免无 shell 的 MCP 启动器直接 spawn `.cmd` 失败；Git 引导优先指向 Git for
  Windows；macOS 用户可通过 `git --version` 触发 Xcode Command Line Tools 或安装官方
  Git。
- `taptap-maker mcp verify` 默认验证 `mcp install` 写入配置的 npx 包命令能否启动；本地开发只验证当前 CLI 时使用 `--mode self`。
- MCP 公共能力保留 `maker://status`、`maker_status_lite` 和
  `maker_build_current_directory`；初始化、PAT 保存、app 列表和 clone 由 CLI/skill 承担。
  远端 proxy tools 默认隐藏，仅白名单公开 `generate_image`、`batch_generate_images`、
  `edit_image`、`create_video_task`、`query_video_task` 和 `text_to_music`，用于试用图片/视频/音乐生成链路，
  本地保留远端 tool schema 和成功返回值，但会在 description 追加 Maker 素材链路提示：
  已绑定 Maker 项目应优先建议用户使用这些 tools。远端 proxy tool 返回 `isError` 时，本地 MCP
  必须抛出失败并尽量输出完整 `remote_result` / server 返回内容。
- 新开对话、继续开发或检查 Maker 状态时，先读 `maker://status` 或调用 `maker_status_lite`。已绑定项目会输出 `Maker remote sync` 和 AI dev kit 版本检查结果，提示是否需要先 pull、是否本地 dirty、是否分叉或是否不在 main，以及是否需要运行 `taptap-maker dev-kit update`；按其中 `next_action` / `next_step` 引导用户。频繁轮询或只要快速本地状态时，`maker_status_lite` 可传 `skip_remote_sync=true`，同时跳过远端 Git 同步和 dev-kit 最新版本检查。
- 用户说“帮我提交 / 提交代码 / 提交并推送 / push / 构建 / 预览 / 跑一下 / 验证一下 / 看看效果”时，都调用 `maker_build_current_directory`。普通构建会先 push 再远端 build：本地有改动时提交改动，已有 ahead commit 时直接 push，本地干净且无 ahead commit 时创建 `chore: wake maker build server` 空提交来唤醒 Maker 远端服务；push 成功后才远端 build。
- push 被拒绝、远端有新提交、认证失败或存在冲突时，`maker_build_current_directory` 必须停止在 build 前，并返回 `submit_failed_before_build`、本地 commit/ahead 状态、stderr/stdout 和下一步建议；Agent 必须根据 `classification` 选择恢复路径：`remote_rejected` 才协助 pull/rebase，`branch_not_allowed` 切回 main 并迁移本地 commit，`forbidden_path` 按远端 forbidden pattern 从未推送 commit 移除禁止路径，`auth` 才刷新 PAT。
- push 遇到 503、HTTP 5xx、超时或连接中断会自动重试；最终失败时要读取 `classification`、`retryable`、`retry_reason` 和 `retry_attempts`，按工具返回的恢复路径继续处理。
- push 成功但远端 build 失败时，工具返回 `build_failed_after_submit`，必须同时说明代码已经提交到 Maker 远端和具体构建错误。
- 用户明确说不提交、直接构建云端版本时，才允许调用 `maker_build_current_directory` 并设置 `confirm_remote_build_without_submit=true`；这种模式会先打开并返回 Maker 页面链接，Agent 应把链接发给用户，方便其查看远端项目并降低服务休眠导致构建失败的概率。
- 构建时如果用户未指定入口且本地存在 `scripts/main.lua`，本地 Maker MCP 默认传 `scriptsPath="scripts"` 和 `entry="main.lua"`；用户显式传单机入口或多人入口时优先生效。
- 远端 Maker MCP tools 所需的 TapTap MAC token 通过 PAT 获取。

### 测试和验证

```bash
# 编译检查
npm run build

# 代码检查（ESLint）
npm run lint

# 代码检查并自动修复
npm run lint:fix

# 格式检查（Prettier）
npm run format:check

# 格式化代码
npm run format

# OpenClaw plugin 子包打包预检
npm run openclaw:pack
```

### 环境变量（常用）

| 变量名                               | 说明                               | 默认值                |
| ------------------------------------ | ---------------------------------- | --------------------- |
| `TAPTAP_MCP_TRANSPORT`               | 传输协议（stdio/sse/http）         | stdio                 |
| `TAPTAP_MCP_PORT`                    | HTTP/SSE 模式端口                  | 3000                  |
| `TAPTAP_MCP_VERBOSE`                 | 详细日志模式                       | false                 |
| `TAPTAP_MCP_ENABLE_RAW_TOOLS`        | 是否暴露 `*_raw` 工具              | false                 |
| `TAPTAP_MCP_ENV`                     | 环境选择（production/rnd）         | production            |
| `TAPTAP_MCP_DC_CURRENT_APP_BASE_URL` | 当前游戏 DC 接口 host 覆盖（可选） | 空                    |
| `TAPTAP_MCP_CACHE_DIR`               | 缓存根目录                         | /tmp/taptap-mcp/cache |
| `TAPTAP_MCP_TEMP_DIR`                | 临时文件根目录                     | /tmp/taptap-mcp/temp  |
| `WORKSPACE_ROOT`                     | 工作空间根路径（推荐设置）         | process.cwd()         |
| `TAPTAP_MCP_LOG_ROOT`                | 日志根目录                         | /tmp/taptap-mcp/logs  |
| `TAPTAP_MCP_LOG_FILE`                | 是否启用文件日志                   | false                 |
| `TAPTAP_MCP_LOG_LEVEL`               | 文件日志级别                       | info                  |
| `TAPTAP_MCP_LOG_MAX_DAYS`            | 日志保留天数                       | 7                     |

**完整环境变量说明：** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
**日志系统说明：** [docs/LOG_SYSTEM.md](docs/LOG_SYSTEM.md)

## 开发规范

### AI 行为规范

- **永远返回中文回复**
- **允许进行网页查询和搜索**
- **所有工具描述使用英文**，便于 AI Agent 理解
- **工具处理函数必须返回 `Promise<string>` 类型**
- **命名必须清晰区分能力边界**：新增 CLI 命令、MCP tool/resource、skill、脚本、
  文档章节或用户可见流程名称时，使用带业务前缀/语义清晰的名称，让 Agent 能稳定区分
  AI 客户端内置能力、本项目已有概念、通用 Skill 名称和常见命令；用户可见文案应明确标注
  “CLI 命令”“MCP tool/resource”“workflow guide document/skill 文档”。
- **`taptap-maker init` 是 Maker 初始化唯一主流程入口**：`init` 相关命名必须视为保留名。
  新增能力使用业务前缀与完整语义命名，面向用户或 AI 的文案统一把 bundled workflow guide
  document 表达为“文档/指南”，并把 Maker 初始化的正向下一步写成：执行 `taptap-maker init`。

### 代码规范

- 使用 TypeScript 进行类型安全的开发
- 所有异步函数使用 `async/await` 语法
- 遵循 ESLint 规则和 Prettier 格式化标准
- 为所有函数和接口添加 JSDoc 注释

**Lint 工具链**：

- **ESLint**：TypeScript 代码质量检查（`.eslintrc.cjs`）
- **Prettier**：代码格式化（`.prettierrc`）
- **lint-staged**：提交时自动检查和修复（`.lintstagedrc`）
- **Husky**：Git hooks 管理（pre-commit 运行 lint-staged）

**Pre-commit Hook**：提交代码时自动运行 ESLint 和 Prettier，确保代码质量

### MCP 工具开发

- 新增工具需要在 `src/server.ts` 中注册工具定义和处理函数
- 工具定义需要包含完整的 JSON Schema 输入验证
- 工具描述使用英文，包含使用场景说明
- 服务器使用 stdio 通信模式，适配 Codex Desktop 等 MCP 客户端

### 网络请求开发

- 所有 API 请求必须通过 `HttpClient` 类发送
- HttpClient 自动处理：
  - MAC Token 认证（Authorization header）
  - 请求签名（X-Tap-Sign header）
  - 环境 URL 切换
  - 错误处理和超时控制
- 新增 API 只需调用 `client.get()` 或 `client.post()`

### 认证机制（简要）

- **MAC Token 认证**：每个请求的 Authorization header 使用 MAC 认证
- **请求签名**：X-Tap-Sign header，HMAC-SHA256 签名
- **OAuth 2.0**：Device Code Flow，扫码即用
- **模块化设计**：
  - `tokenStorage.ts`：Token 持久化管理（读取、保存、清除）
  - `config.ts`：OAuth 环境配置（端点、Client ID 管理）
  - `oauth.ts`：OAuth 流程实现（请求 device code、轮询 token）

**详细认证流程：** [docs/ARCHITECTURE.md#认证机制](docs/ARCHITECTURE.md)

### 原生签名模块（Native Signer）

为了保护 `CLIENT_SECRET` 不在 npm 源码中暴露，项目使用 Rust 编写的原生签名模块：

**安全模型：**

- `CLIENT_SECRET` 在 CI/CD 编译时 XOR 加密嵌入二进制
- 运行时在内存中解密，计算签名后返回结果
- SECRET 不暴露给 JS 层

**目录结构：**

```
native/
├── Cargo.toml          # Rust 项目配置
├── build.rs            # 编译时 SECRET 加密
├── src/lib.rs          # 签名实现
├── index.js            # JS 加载器
└── *.node              # 编译后的二进制
```

**开发模式：**

- 如果原生模块不可用，自动 fallback 到环境变量
- 设置 `TAPTAP_MCP_CLIENT_SECRET` 环境变量即可开发测试

**构建原生模块：**

```bash
cd native
export BUILD_CLIENT_ID="your_client_id"
export BUILD_CLIENT_SECRET="your_client_secret"
npm install && npm run build
```

**详细文档：** [native/README.md](native/README.md)

### 本地缓存（v1.4.1+）

**缓存目录结构：**

- 全局缓存：`/tmp/taptap-mcp/cache/global/app.json`
- 租户缓存：`/tmp/taptap-mcp/cache/{userId}/{projectId}/app.json`
- 临时文件：`/tmp/taptap-mcp/temp/{userId}/{projectId}/`

**特性：**

- ✅ 独立于 workspace，支持只读挂载
- ✅ 租户数据完全隔离
- ✅ 临时文件自动清理

### 路径处理最佳实践

1. **推荐使用绝对路径**（如 `/Users/username/project/dist`）
2. **相对路径注意事项**：stdio 模式下可能解析错误，推荐设置 `WORKSPACE_ROOT` 环境变量
3. **调试技巧**：启用 `TAPTAP_MCP_VERBOSE=true` 查看详细日志

**详细说明：** [docs/PATH_RESOLUTION.md](docs/PATH_RESOLUTION.md)

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

## 文档索引

### 用户文档

- **快速开始（零基础）**：[docs/QUICK_START.md](docs/QUICK_START.md) - 面向非技术用户的极简 Cursor 配置指南
- **AI 安装引导**：[docs/AI_SETUP_GUIDE.md](docs/AI_SETUP_GUIDE.md) - 面向 AI Agent 的可执行安装部署指南
- **详细配置指南**：[docs/USER_GUIDE.md](docs/USER_GUIDE.md) - 多种工具的完整配置方法
- **项目介绍**：[README.md](README.md) - 用户快速上手指南
- **贡献指南**：[CONTRIBUTING.md](CONTRIBUTING.md) - 开发者贡献流程

### 技术文档

- **完整架构**：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - 模块化架构、设计模式、认证机制
- **部署指南**：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - 三种传输协议、环境变量、MCP 集成配置
- **CI/CD 流程**：[docs/CI_CD.md](docs/CI_CD.md) - GitHub Flow、Semantic Release、手动发布
- **路径解析**：[docs/PATH_RESOLUTION.md](docs/PATH_RESOLUTION.md) - 路径处理问题、最佳实践

### Proxy 相关文档

- **Proxy 开发**：[docs/PROXY.md](docs/PROXY.md) - MCP Proxy 完整开发指引（整合了私有参数协议、客户端配置、独立打包、TapCode 集成示例）

### 原生签名模块

- **原生签名器**：[native/README.md](native/README.md) - Rust 原生签名模块开发和构建指南

### API 参考

- **TapTap Open API**：https://developer.taptap.cn/minigameapidoc/ - 官方 API 文档
- **MCP 规范**：https://spec.modelcontextprotocol.io/ - Model Context Protocol 规范

## 工具和资源概览

### 核心 MCP Tools

**流程指引（1个）**

- `get_leaderboard_integration_guide` - 排行榜完整接入工作流指引

**信息查询（2个）**

- `get_current_app_info` - 获取当前选择的应用信息
- `check_environment` - 检查环境配置和认证状态

**认证（3个）**

- `start_oauth_authorization` - 开始 OAuth 授权（获取二维码）
- `complete_oauth_authorization` - 完成 OAuth 授权
- `clear_auth_data` - 清除认证数据和缓存

**应用管理（3个）**

- `list_developers_and_apps` - 列出所有开发者和应用（含关卡与非关卡）
- `select_app` - 选择要使用的应用（支持关卡与非关卡）
- `create_developer` - 创建新开发者

**当前游戏 DC 能力（8个）**

- `get_current_app_store_overview` - 获取当前游戏商店统计概览
- `get_current_app_review_overview` - 获取当前游戏评价统计概览
- `get_current_app_community_overview` - 获取当前游戏社区统计概览
- `get_current_app_store_snapshot` - 获取当前游戏商店结果型快照
- `get_current_app_forum_contents` - 获取当前游戏论坛内容
- `get_current_app_reviews` - 获取当前游戏评价列表
- `like_current_app_review` - 给当前游戏指定评价点赞
- `reply_current_app_review` - 以官方身份回复当前游戏评价

**排行榜管理（5个）**

- `create_leaderboard` - 创建新排行榜
- `list_leaderboards` - 列出所有排行榜
- `publish_leaderboard` - 发布排行榜
- `get_user_leaderboard_scores` - 获取用户分数数据
- `get_app_status` - 获取应用审核状态

**H5 游戏管理（3个）**

- `prepare_h5_upload` - 收集 H5 游戏信息（上传前）
- `upload_h5_game` - 上传 H5 游戏包
- `get_debug_feedbacks` - 拉取用户调试反馈并下载附件到本地

> 注：创建/编辑应用请使用 `create_app` 和 `update_app_info` 工具（在应用管理分类中）

**振动 API 文档（1个）**

- `get_vibrate_integration_guide` - 振动 API 完整文档和接入指引

### MCP Resources（示例）

**API 详细文档（6个）**

- `docs://leaderboard/api/get-manager` - tap.getLeaderboardManager()
- `docs://leaderboard/api/open` - openLeaderboard()
- `docs://leaderboard/api/submit-scores` - submitScores()
- `docs://leaderboard/api/load-scores` - loadLeaderboardScores()
- `docs://leaderboard/api/load-player-score` - loadCurrentPlayerLeaderboardScore()
- `docs://leaderboard/api/load-centered-scores` - loadPlayerCenteredScores()

**概览文档（1个）**

- `docs://leaderboard/overview` - 所有 API 的完整概览

## 注意事项

- 所有工具描述使用英文，便于 AI Agent 理解
- 环境变量名称使用 TAPTAP*MCP* 前缀
- MAC Token 必须是 JSON 字符串格式
- 请求签名使用两层机制（MAC + X-Tap-Sign）
- 默认环境为 production，可通过 TAPTAP_MCP_ENV 切换
