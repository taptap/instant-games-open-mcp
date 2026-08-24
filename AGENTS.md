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
- ✅ **默认创建 `fix/` 分支** → 提交代码 → 创建 PR
- ⚠️ **谨慎创建 `feature/` 分支**：仅当改动是明确的新功能，并且确认应触发 minor 版本升级时使用
- ❌ 不要因为改动较大、开发时间较长或包含多个提交就使用 `feature/`；无法确认时使用 `fix/`
- ✅ 分支前缀和 commit type 都必须反映实际改动；`feature/` 通常对应 `feat:`，会使中版本号 +1
- ❌ **PR 合并后不会自动发布 npm**
- ✅ **主包 npm 发布只能手动运行 GitHub Actions workflow**

**工作流程：**

```
默认 fix 分支开发 → git commit (规范格式) → git push → 创建 PR
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

- Codex Maker plugin 位于 `plugins/taptap-maker`。Codex 和 WorkBuddy 插件共用独立插件版本，
  唯一来源为 `config/maker-plugin-version.json`，首版 `0.0.1`；内置 Maker MCP 版本仍读取
  `config/maker-version-policy.json`，不得用插件版本覆盖 runtime、埋点、诊断或 npm 版本。使用
  `npm run maker:codex-plugin:prepare` 生成完整自包含产物；运行时使用宿主 Node.js 和插件内
  `dist/maker.js`，不得依赖外部 npm/npx。`.agents/plugins/marketplace.json` 是仓库级 Codex
  marketplace；正式 marketplace 名为 `taptap-maker`。
- WorkBuddy Maker plugin 位于 `plugins/workbuddy/taptap-maker`，使用
  `npm run maker:workbuddy-plugin:prepare` 生成；仓库本地市场是
  `.codebuddy-plugin/marketplace.json`。MCP 和插件 CLI 必须通过插件内 `bin/run-node` 启动
  `${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js`；启动器优先 `WORKBUDDY_EXTRA_PATHS` 和 WorkBuddy
  managed Node 目录，再回退系统 PATH。Windows 必须同时支持版本目录根和 `bin` 子目录中的
  `node.exe`。插件不依赖 npm/npx，也不固定项目 `cwd`。
  `create-project` 和 `sync-project` 是仅有的两个快捷命令，执行前必须要求空 workspace。
  WorkBuddy 插件的 `init` 和 `dev-kit update` 必须逐项检查
  `.workbuddy/skills/taptap-maker-*`，只从 `.installer/skills` 补齐缺失的项目 Skill，不得覆盖已有
  同名 Skill。该同步不得影响独立 Maker MCP、Codex 插件或其他客户端；目录链接不可用时才复制。
- 客户端插件发布只使用 `Prepare Maker Plugin Release` 和 `Publish Maker Plugin` workflows。
  前者按最新 `maker-plugin-v*` tag 自动递增 patch 并创建版本 PR；后者在 PR 合并后发布两份完整
  marketplace ZIP、`INSTALL.md`、`SHA256SUMS` 和 `maker-plugin-release.json`。插件发布不得调用
  npm publish、不得复用 Maker npm 或主包 release workflow。插件专属安装页固定为
  `plugins/taptap-maker/README.md`；对外安装使用对应渠道的 GitHub Release 页面和 ZIP。直接从
  仓库添加 marketplace 只用于源码验证，并且必须在添加前用生成目录中的 CLI 完成旧 MCP 检查。
- 客户端专属源文件必须放在 `plugin-sources/taptap-maker/<client>/`；生成产物必须按客户端隔离。
  不得把 WorkBuddy manifest、commands、Skills 或 MCP 配置写入 Codex 插件目录。新增客户端时复用
  `src/maker/` 的 runtime/CLI，不复制 Maker tools、resources 或 proxy 业务逻辑。
- 插件 runtime 必须设置非空的 `TAPTAP_MAKER_DISTRIBUTION`；任意非空值都表示由插件渠道管理，
  Maker 不执行 npm 包版本检查或输出 npm 升级提示。具体值只用于识别 Codex、WorkBuddy、DSH 或
  外部插件分发渠道；独立 Maker MCP 不设置该变量并保持现有 npm 更新策略。
- 插件模式必须先按 `taptap-maker-plugin-lifecycle` 检查对应客户端的旧 Maker MCP。Codex 安装请求
  即授权自动迁移：安装前后都要检查，活动旧注册只写 `enabled = false`，无需再次确认；只有状态为
  `disabled` 或 `not_found` 才能报告插件可用，`ambiguous` 必须在安装前停止。WorkBuddy 同时检查
  `~/.workbuddy/mcp.json` 和旧
  `.mcp.json`，禁用只写 `disabled: true`，并通过只读 SessionStart Hook 向 AI 注入提醒；只有用户
  明确确认后才调用迁移 CLI。两个客户端在正常移除插件时恢复旧注册都必须明确确认；保留原配置、
  最新备份和恢复状态。不得删除旧注册、PAT、Maker home、项目绑定、WorkBuddy connector trust 或游戏文件。初始化必须使用
  `taptap-maker init --skip-mcp-install`。插件用户通过当前客户端 marketplace 更新，不运行独立 npm
  包升级。
  Codex 只有在本次安装实际禁用旧注册后又安装或验证失败时，才自动 restore 作为事务回滚；原本已
  禁用、未找到、此前已迁移或不是本次迁移的注册不得恢复。回滚前必须移除本次已安装的插件并确认
  不再启用；插件移除失败时保持旧 MCP 禁用。正常移除插件时仍要求用户明确确认。
  Codex 插件产物必须使用插件专用 `update-taptap-mcp`，不得复制 npm 发行版的更新 Skill。旧 MCP
  restore 必须校验迁移注册指纹；插件模式故障上报只检查插件 `.mcp.json` 和当前 bundle，不能把
  已禁用的独立 `taptap-maker` 注册或物化 self runtime 当作插件运行证据。
- Maker CLI-first 重构后的正式说明在 `docs/MAKER.md`；完整环境变量契约在
  `docs/MAKER_ENVIRONMENT_VARIABLES.md`；面向团队介绍的功能总览在
  `docs/MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md`。上下文压缩或长时间中断后，先读这些文档再继续。
- 用户说“我要开发maker游戏 / 本地maker开发 / 拉取maker游戏到本地 / 把maker游戏代码拉到本地 / clone maker项目 / 下载maker游戏代码 / 初始化maker开发目录 / 配置maker本地开发 / 继续开发maker项目”时，应触发 `taptap-maker init`，由该 CLI 展示 app 列表并让用户选择已有 app 或 `0`/`new`。只有用户明确说“创建/新建项目或游戏”时，才使用 `taptap-maker init --create`。
- 如果本地没有当前环境的 Maker PAT，CLI 默认运行 CLI 登录：生成满足 `^[A-Za-z0-9_-]{16,128}$` 的临时 code，按需打开当前环境的 `/pat-tokens?code=<code>`，用户登录并点击“创建 token”后，CLI 轮询 `/api/v1/cli-auth/result?code=<code>`，拿到授权结果后完成本地鉴权配置。
- Maker 鉴权文件必须沿用线上已发布版本的原始本地保存路径，不要新建环境子目录；不要在用户文档或普通用户说明里暴露具体凭证缓存路径。
- 用户可运行 `taptap-maker login` 主动刷新当前环境鉴权；`taptap-maker init` 和无参数 `taptap-maker pat set` 缺 PAT 时也走 CLI 登录。兼容写法 `taptap-maker pat set <PAT>`、`--pat PAT` 或 `--pat-stdin` 仅用于 CI / 应急联调，其中 argv 形式会让 PAT 进入 `ps`/shell history。
- 本地研发服务配置只作为内部开发能力处理；项目目录级配置只读取 `.maker/taptap-maker.local.json`，不读取项目根目录散落的本地配置文件。不要把内部环境名称、地址或切换方式写入面向用户的 schema、CLI help、README、skill、示例或错误指引。
- `taptap-maker init` 会检查 Git、Python 环境、maker-lua-lsp 本地 Lua 诊断环境、PAT、TapTap token、当前目录绑定状态、app 列表、AI dev kit，并在用户选择 app 或创建新 Maker 项目后先记录 `.maker-mcp/config.json`，再 checkout 到当前目录；Python 未就绪时会自动尝试准备，最多 3 次，仍失败则暂停 init 且不继续 PAT、app、clone 或 MCP 配置；Python ready 后会 best-effort 创建 Maker 私有 LSP venv，在其中安装/升级 `maker-lua-lsp` 并执行 `maker-lua-lsp install --ide codex,cursor,claude`，LSP 失败只提示错误且不阻塞远端构建。clone/fetch 失败后重复执行 init 会复用已记录 app，显式选择不同 app 会拒绝覆盖已有绑定。app 文本预览默认展示前 40 个；创建新项目入口 `0. Create a new Maker project` 不参与裁剪，始终在列表底部显示；账号 app 很多时在 init 交互中输入 `all` 一次性展开全部，或单独跑 `taptap-maker apps --all`；`taptap-maker apps --json` 仅给 AI / 脚本解析使用。AI 转述时宽屏可用两列紧凑布局，窄屏保持单列；每个 app 保留 app_id，并在用户确认后选择 app；如需新建项目，可让用户在 init 中选择 `0`/`new` 并输入项目名称，或使用 `taptap-maker init --create --name "my-local-game"`；当前目录已绑定 Maker 项目时，必须切换到新的独立目录后再创建新项目。
- AI dev kit 安装/更新按当前环境查询最新版本信息，按返回的 `current.version` 生成版本化下载 URL；版本检查失败时降级使用内置默认下载地址。安装成功后记录本地已安装版本，`taptap-maker doctor`、`maker://status` 和 `maker_status_lite` 输出当前版本、最新版本和是否可更新。
- `taptap-maker init` 首次拉取默认使用 `git init` + `git fetch --depth=1 origin` + checkout；Git clone/fetch 会按错误内容判断是否自动重试：503、HTTP 5xx、超时、连接重置、RPC/HTTP2 中断等远端临时错误会重试；认证、权限、仓库不存在、远端拒绝和本地目录冲突不重试。
- 首次 clone/fetch 前必须提示用户：Maker server 可能正在准备仓库，首次拉代码 20 秒以上是正常现象，请保持当前命令运行。
- CLI 写 MCP 配置时优先支持 Windows：默认把当前包的 Maker bundle、skills 和排障文档物化到
  `TAPTAP_MAKER_HOME/mcp-runtime/<version>/`，并固化当前进程的绝对 `node.exe` 与版本化
  `dist/maker.js`，避免依赖 npx 缓存、网络和客户端 PATH。显式 `--launcher npx` 才使用 npm，
  发布包必须固定当前精确版本、使用专用可写 npm cache；Windows 固化绝对 `node.exe` 与
  `npm-cli.js`，不把 `.cmd` shell 命令写入客户端配置。最终命令必须先完成 MCP `initialize` 和
  `tools/list`，验证失败时
  不修改任何客户端配置或备份；Git 引导优先指向 Git for
  Windows；macOS 用户可通过 `git --version` 触发 Xcode Command Line Tools 或安装官方
  Git。`taptap-maker init`、`mcp install` 和 `upgrade` 写入的用户级 MCP 配置永远不包含项目
  `cwd`，默认覆盖 Codex、Cursor、Claude，并自动检测已存在配置文件的 Trae、OpenCode、
  WorkBuddy、DSH；避免多个客户端、对话或 Maker 项目争用同一个全局路径。支持 MCP Roots 的客户端
  由当前 workspace root 决定 Maker 项目；不支持 Roots 时，由 Agent 在具体 Maker tool 调用中
  传入 `target_dir`。`upgrade --target-dir <PROJECT_DIR>` 只指定本次项目策略更新目标，不把目录
  持久化到 MCP 配置。项目级本地研发服务选择只在调用时解析，不会提升为用户级 MCP 启动环境。
  MCP 进程 cwd 只作为最后兜底和诊断信息。安装器必须先比较现有
  `taptap-maker` 条目，内容一致时不写文件；Claude 也不得重复执行 `claude mcp add`。
  Trae Solo/Solo CN 优先支持，按 `User/` 目录创建或合并 `User/mcp.json`，普通 Trae
  只在 `mcp.json` 已存在时更新；
  OpenCode 使用官方 `mcp` schema 和 command 数组；self 模式只写客户端标识，显式 npx 模式
  额外写专用 npm cache，不持久化项目路径或项目级本地研发服务选择；
  WorkBuddy 在 macOS 和 Windows 都优先写用户目录下的 `.workbuddy/mcp.json`；显式传
  `--ide workbuddy` 时会创建该官方配置文件；未显式指定 IDE 的自动检测模式下，legacy
  `.workbuddy/.mcp.json` 仅在官方配置文件不存在且自身已存在时作为 fallback 合并；通用
  `mcpServers` JSON 只作为 README/文档片段引导其它 AI 编辑器识别自己的实际配置文件后合并写入，
  CLI 不生成额外通用配置文件。`taptap-maker init` 写入多个客户端配置时，任一目标失败都必须
  记录 `mcp_install_failed`、返回非零且不报告初始化完成；已成功写入的目标保持不变，失败项可用
  `taptap-maker install` 自动检测并幂等重试。`--ide` / `--register-mcp` 只保留给历史自动化兼容；
  新增客户端必须接入默认自动检测流程，不得要求用户传客户端参数。
  DSH 使用 `@deepseek-ai/dsh-mcp-client` 插件；CLI 写入用户级
  `$DSH_HOME/cordis.patch.yml`（默认 `~/.dsh/cordis.patch.yml`），使用稳定 self launcher、
  `failOnStartupError: true` 和一小时 `toolCallTimeoutMs`。首次注册必须写 Cordis `insert` patch；
  裸顶层 id patch 不会在空根创建 plugin。已有 profile 级 Maker registration 时就地更新 profile，
  不创建重复 serverName；所有配置都不写项目 `cwd`。
  DSH HMR 可热重载该补丁，无需重启 IDE；DSH 当前不广播 MCP Roots，Agent 必须在每个项目相关
  Maker tool 调用中显式传入当前游戏目录 `target_dir`。
- `taptap-maker mcp verify` 默认验证安装器使用的稳定 self runtime；`--mode npx` 验证固定当前
  精确版本的 npm launcher。验证失败必须返回非零退出码。npm stderr 中的 EPERM、EACCES、
  root-owned/cache 不可写必须归类为 `npm_environment_error`，不能误报为普通 protocol error。
- `taptap-maker doctor` 只做离线主机、项目和 CLI 执行上下文检查，不检查当前 AI 会话是否已
  加载 Maker tools，也不读取客户端实际配置；不要因为存在 `.workbuddy` 就把 WorkBuddy trust
  当作其它客户端的故障原因。Python/Lua LSP、dev-kit、版本和 AGENTS policy 检查属于维护信息，
  不能单独证明 MCP 连接失败。
- Maker MCP tools 缺失或出现 `-32000` / `Connection closed` 时，先按 `docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md` 做不依赖 MCP tools 的本地自检。先根据真实配置、日志或 MCP 初始化信息确认当前客户端，再检查该客户端的 command/args/cwd、MCP Roots、Node/npm/npx、client PATH、退出码和 stderr；只有确认当前客户端为 WorkBuddy 时才检查其信任状态。禁止用 Windows 中文路径 `cd && npx` 拼接命令修复 cwd。
- 远端 proxy tool 调用必须先确认解析出的目录存在有效 `.maker-mcp/config.json`。MCP Roots 不可用
  且进程 cwd 未绑定时，只让该项目相关调用快速失败，错误必须包含 `evaluated_target_dir`、
  `project_context_source` 和显式 `target_dir` 指引；不得阻止 MCP server、status 或 tools/list 启动。
- Maker 内嵌 proxy 必须设置 `disable_standalone_sse=true`，不打开可选的 standalone SSE GET；
  远端 RPC 响应与 progress 继续使用 POST SSE。该设置用于避免 Node.js 26 中长连接阻塞后续
  `tools/list` 并触发 SDK 固定 60 秒超时。普通 MCP Proxy 默认保持 standalone SSE 可用，不能全局关闭。
- 疑似 Maker MCP、proxy、客户端集成或服务端基础设施缺陷（启动/连接失败、tools 异常缺失、超时、反复重连失败、HTTP 5xx/unavailable、未分类内部错误）时，AI 应先按错误码、操作和稳定错误信息形成故障指纹，并在当前会话只询问用户一次是否允许上报。用户明确同意后，把已脱敏的错误、当前 tools、workspace roots、客户端版本和复现步骤通过 stdin 交给 Maker 报告 CLI。优先原样复用当前客户端 `taptap-maker` 配置中的 command 和有序 args，再追加 `mcp report --ide <client> --target-dir <project> --context-stdin --consent --json`；不得依赖全局 PATH 中存在 `taptap-maker`，也不得用无版本的 `@taptap/maker` 启动可能落后的 npm `latest`。只有确认精确安装版本时才可使用 `npx -y --package @taptap/maker@<exact-version> taptap-maker ...` 作为 fallback；Windows 的 `npx` 不可用时继续使用配置内的绝对 `node.exe` 和 `npm-cli.js` argv。不要上传完整聊天、项目源码、其它 MCP server、PAT/token 或完整环境变量。普通参数错误、已有明确恢复路径的登录问题、项目文件缺失、用户取消、Lua 编译或业务校验错误不提示上报。返回 `manual_required` 表示 GitHub 不可达、未登录或自动提交失败；展示脱敏报告和手动 Issue 地址后继续原任务，不得把上报失败当作 Maker 任务失败。
- MCP 公共能力保留 `maker://status`、`maker_status_lite` 和
  `maker_build_current_directory`；初始化、PAT 保存、app 列表和 clone 由 CLI/skill 承担。
  远端 proxy tools 默认隐藏，仅白名单公开 `generate_image`、`batch_generate_images`、
  `edit_image`、`create_video_task`、`query_video_task`、`text_to_music`、
  `text_to_sound_effect`、`batch_sound_effects`、`text_to_dialogue`、
  `audition_voices_for_character`、`confirm_character_voice`、
  `create_3d_asset`、`generate_test_qrcode`、`add_test_whitelist`、`get_ad_config`
  和 `get_debug_feedbacks`，
  用于试用图片/视频/音乐/音效/配音/3D 模型生成、广告配置同步和远端玩家反馈查询链路，
  本地保留远端 input schema、参数语义和成功返回值；完整公开定义固定在
  `src/maker/server/remoteProxyToolSnapshot.json`，description 使用已审核的本地内容，避免远端通用
  教程与 Maker 本地确认门、素材落盘和恢复工作流冲突。提交前用已绑定 Maker 项目运行
  `npm run maker:proxy-schema:check -- --target-dir <PROJECT_DIR>` 对比实时远端 schema；发现漂移时运行
  `npm run maker:proxy-schema:update -- --target-dir <PROJECT_DIR>` 生成快照，review diff 后再次检查。
  schema 或白名单变化必须随本地 MCP 版本更新发布。
  这些 tools 为 Maker 项目提供对应的素材和平台能力。远端 proxy tool 返回 `isError` 时，本地 MCP
  必须抛出失败并尽量输出完整 `remote_result` / server 返回内容。
- `create_video_task` 仅在用户明确要求生成视频时调用，不得在实现玩法、补齐素材或自我优化时主动生成。
  明确指定 `duration > 10` 秒或使用 `model="2.5"` 时，必须先展示粗估积分，并说明实际扣费按上游
  token 结算；得到用户明确确认后，再以相同参数并带 `user_confirmed=true` 重试。
- 音频 proxy tools 在本地 Maker 项目中必须保留 Provider 原格式并落盘生成结果。
  `text_to_sound_effect` 和 `batch_sound_effects` 固定使用豆包 Seed Audio；
  `text_to_dialogue`、`audition_voices_for_character` 和 `confirm_character_voice` 固定使用
  ElevenLabs；`text_to_music` 固定使用 Suno。`AUDIO_PROVIDER` 不再切换这些公开工具。
  ElevenLabs 确认成功后必须保存本地 Voice ID mapping，并通过 `next_step_hint` 引导 Agent
  只使用角色名和台词继续调用 `text_to_dialogue`；历史豆包 mapping 保留但不用于固定的
  ElevenLabs 对白、试听和确认流程。
- 本地 Maker MCP 活跃上报复用 `tapmaker_mcp_call`，在 `args.source` 写入 `local_mcp`，
  在 `args.mcp_version` 写入 `@taptap/maker` 版本；开发构建使用 `dev`，禁止使用主包版本
  代替。`user_id` 和 `project_id` 只从当前项目 `.maker-mcp/config.json` 读取；缺少关键字段或
  项目上下文无法准确解析时不上报，不使用 JWT、PAT、默认值或其它项目配置补齐。Tool、
  `maker://status` Resource 和 MCP 启动事件计入本地活跃，上报失败不得影响 MCP 结果。
  错误信息上报前必须脱敏 PAT、Bearer、access token、refresh token、MAC key 和 URL 凭证，
  可保留 user_id、project_id、路径等诊断信息。
- 新开对话、继续开发或检查 Maker 状态时，先读 `maker://status` 或调用 `maker_status_lite`。默认 status 是快速本地摘要；只有明确排障或同步确认时才调用 `maker_status_lite` 的 `detail=true`，获取 `Maker remote sync`、AI dev kit、proxy 和维护诊断。支持 MCP Roots 的客户端会输出 `MCP client roots` 与 `project_context_source`；只有一个 workspace root 时直接作为 Maker 操作目标，多个 root 中只有一个已绑定 Maker 项目时自动选择该项目，多个 Maker root 时必须让用户只保留一个 Maker workspace 或显式传 `target_dir`，不要猜测。项目初始化和健康状态仍会提示是否需要先 pull、是否本地 dirty、是否分叉或是否不在 main、是否需要运行 `taptap-maker dev-kit update`。本地主配置缺失时保持 `not_initialized` 且允许显式构建；仅在用户明确要求构建、提交或预览时调用 `maker_build_current_directory`。构建成功后本地配置仍可能缺失，此时保持二维码、广告和多人配置等依赖能力不可用，不要自动重复构建。detail 模式下可传 `skip_remote_sync=true` 跳过远端 Git 同步和 dev-kit 最新版本检查。
- 统一项目健康检查保持只读，不自动移动、覆盖或重建 `.project` 配置。不得用 `.project` 目录是否存在判断项目已经初始化；`.project` 为空、只含音色 mapping/其它本地文件、只含 `resources.json`，或缺少 `project.json` / `settings.json` 时，都按具体文件状态保持新项目可构建。只有规范位置的配置文件实际存在且内容错误时才进入校验/修复路径：`settings.json` 仍可解析为 object 时，可在用户确认后补入缺失的 schema/build 默认字段，并保留 `@runtime`、`asset_ignores` 与未知字段。`sources.*.tag` 是锁定字段，只能从完整副本恢复；不要凭默认值生成项目身份、版本、发布元数据或资源分组。`entry=main.lua` 也必须先确认项目实际入口。
- 当前目录是已绑定 Maker 项目时，调用 `generate_test_qrcode` 应先不传方向参数。本地 MCP 会读取 `.project/project.json`：已有合法 `taptap_publish.screen_orientation` 时直接沿用，不再询问用户，且后续输入不能覆盖；只有该字段从未设置时，才单独发起一次对话，让用户明确选择横屏（`landscape`）或竖屏（`portrait`），禁止推断或默认。用户选择后重试并传本地私有参数 `confirmed_screen_orientation`，本地 MCP 只在首次缺失时写入该值，不会把私有参数转发给远端。二维码生成并建立应用身份后，只有用户明确提供 TapTap `user_id` 时才调用 `add_test_whitelist`，不要猜测账号 ID。
- 当前目录是已绑定 Maker 项目时，只要用户消息涉及广告（包括“广告”、激励视频、播放广告、广告 ID、广告位、`ShowRewardVideoAd`、广告配置、广告开通状态等），先阅读 `maker://ads-integration-guide`，再按其中流程检查 Maker 项目状态、调用 `get_ad_config` 并阅读项目内 `engine-docs/recipes/sdk.md`。主配置未初始化时，本地 preflight 会保持广告能力不可用且不调用远端 `get_ad_config`；仅在用户明确要求构建时调用 `maker_build_current_directory`。构建后本地配置仍缺失时直接说明当前已知限制，不要自动重复构建。配置就绪后再调用 `get_ad_config` 获取广告开通状态和配置；若返回缺少 `app_id` 或 `developer_id`，应调用 `generate_test_qrcode` 一次生成测试二维码元数据，再重试 `get_ad_config`。不要先查 `.maker-mcp/config.json` 或用运行回调推断广告是否开通，也不要为这个恢复流程调用发布类工具。
- 当前目录是已绑定 Maker 项目时，只有用户明确询问当前 Maker 游戏的线上玩家反馈（包括玩家提交的游戏故障、真机游戏日志或截图），或指定游戏会话的服务端/Lua 日志时，才调用 Maker MCP tool `get_debug_feedbacks`；Cindy 等 AI 客户端、插件、通用开发工具或其它产品的问题反馈/问题上报不属于该工具。本地 runtime log 只用于当前本地构建/运行会话，不要用本地日志替代线上玩家提交的反馈。
- `get_debug_feedbacks` 会拉取线上玩家反馈，并在可下载附件存在时保存日志和截图到当前 Maker 项目的 `logs/feed_back/feedback_<id>/`；调用后优先使用返回的 `local_dir`、`local_log_paths`、`local_screenshot_paths` 读取日志和查看截图。附件路径以 tool 返回的 `local_*` 字段为准；没有 `local_*` 字段时，不要把附件当成本地文件读取。
- 当前目录是已绑定 Maker 项目时，用户说“帮我提交 / 提交代码 / 提交并推送 / push / 构建 / 预览 / 跑一下 / 查看结果 / 看看效果 / 验证游戏效果”时，都调用 `maker_build_current_directory`。普通“验证代码 / 跑测试 / lint / 检查实现”不应自动触发 Maker 远端构建，除非用户明确要求构建、运行或预览 Maker 游戏。普通构建会先 push 再远端 build：本地有改动时提交改动，已有 ahead commit 时直接 push，本地干净且无 ahead commit 时创建 `chore: wake maker build server` 空提交来唤醒 Maker 远端服务；push 成功后才远端 build。
- push 被拒绝、远端有新提交、认证失败或存在冲突时，`maker_build_current_directory` 必须停止在 build 前，并返回 `submit_failed_before_build`、本地 commit/ahead 状态、stderr/stdout 和下一步建议；Agent 必须根据 `classification` 选择恢复路径：`remote_rejected` 才协助 pull/rebase，`branch_not_allowed` 切回 main 并迁移本地 commit，`forbidden_path` 按远端 forbidden pattern 从未推送 commit 移除禁止路径，`auth` 才刷新 PAT。
- push 遇到 503、HTTP 5xx、超时或连接中断会自动重试；最终失败时要读取 `classification`、`retryable`、`retry_reason` 和 `retry_attempts`，按工具返回的恢复路径继续处理。
- 所有构建失败输出都必须返回 `failure_stage`、`code_submit_status` 和 `remote_build_status`，明确区分
  项目校验、代码提交/推送和远端构建。push 成功但远端 build 失败时，工具返回
  `build_failed_after_submit`，必须同时说明代码已经提交到 Maker 远端，并优先检查返回的
  `build_failure` / `remote_result` 中是否存在代码或资源诊断；不得自动修改项目文件。
- `MCP error -32001: Request timed out` 只证明 MCP 请求超时，不能单独证明 Maker server 故障。
  Maker MCP 能收到该错误时必须返回只读的本地进程、Node、cwd/project 对齐摘要，并把根因保持为
  `unconfirmed`；随后通过活动客户端相同的 Maker launcher 对该项目运行 doctor（独立 CLI 等价命令为
  `taptap-maker doctor --target-dir <PROJECT_DIR>`），再检查活动客户端实际生效的 command、args、
  cwd/Roots、会话/tool 注册和 request timeout。doctor 不能读取活动客户端配置；没有
  HTTP 5xx、服务端日志或服务状态等证据时禁止宣称服务端宕机，也禁止盲目重复构建。
- 远端 Lua/LSP 编译失败属于工具级业务错误。代理必须把带 `error.data.remote_result` 的上游 `McpError(-32603)`
  转换为 `CallToolResult.isError` 并保留完整诊断；只有连接断开、会话失效等传输故障才允许进入重连路径，
  不得用 `TapTap MCP Server is currently unavailable` 覆盖原始编译错误。Maker 本地重试器必须优先依据
  `remote_result` 和 MCP 错误码分类，业务错误不得重复发起构建；只有 `build` 可对明确的 proxy
  unavailable、连接关闭、请求超时和 HTTP 5xx 自动重试最多 5 次。build pending 请求重放期间再次
  断线时，保留未完成请求并进入下一轮退避重连。其它 Maker Proxy tools 固定单次调用，不进入本地
  重试器，也不在 Proxy 重连后自动重放；派发前失败返回 `execution_state=not_executed`，派发后响应中断
  返回 `execution_state=unknown`，并统一返回 `automatic_retry=false`。遇到 `unknown` 时必须先核对远端
  产物、任务、状态和用量，再决定是否由用户显式重试。
- 用户明确说不提交、直接构建云端版本时，才允许调用 `maker_build_current_directory` 并设置 `confirm_remote_build_without_submit=true`；这种模式只构建 Maker 远端已提交版本，不会自动打开 Maker 页面。
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

### Maker Proxy 架构约束

- Maker MCP 按活动项目维护 embedded proxy 长连接；每个项目拥有独立远端 session、工具缓存
  和重连状态，多个本地项目可并行开发。
- 单项目断线自动恢复，不要求重新安装或重启 Maker MCP；项目、环境、用户、项目 ID 和授权
  配置指纹共同决定连接身份，禁止跨项目复用连接。
- 同项目连接身份变化时新连接立即接管；旧连接必须等待已开始的请求结束后再关闭，避免中断
  构建或远端工具调用。
- MCP 包版本或本地 proxy 工具白名单/schema 变化后需要 Reconnect 本地 MCP；proxy tools 使用
  版本化本地定义，不依赖运行时 `tools/list_changed` 刷新工具列表。
- runtime-log watcher 保持独立 polling connection lifecycle，不纳入远端 proxy manager。

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
