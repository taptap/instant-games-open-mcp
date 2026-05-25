# TapTap Maker 本地开发

> Maker 本地开发改为 CLI-first。CLI 负责一次性初始化、PAT、app 选择、dev-kit 和客户端 MCP 配置；MCP 只保留运行期状态查询和“同步并构建”能力。

面向团队介绍的功能总览见
[`docs/MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md`](MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md)。

## 目标

`taptap-maker` 是同一个 npm 包里的 Maker 专用入口：

- 本地通过 cwd 向上查找 `.maker-mcp/config.json` 识别当前 Maker 项目。
- 用户级凭证保存到 `~/.taptap-maker/`。
- CLI 负责 PAT 准备、app 选择、dev-kit 准备、clone 和 AI 客户端 MCP 配置。
- MCP server 只暴露 `maker://status`、`maker_status_lite` 和 `maker_build_current_directory`。
- `maker_build_current_directory` 是用户感知里的提交/推送/远端构建入口；push 失败时会停止在构建前，让本地 Agent 处理冲突或合并。
- 本地 Git 是 clone/push 的硬性前置条件。Maker MCP 只检测和引导，不代替用户安装 Git。
- Windows 是优先支持环境：生成 MCP 配置时 Windows 使用 `npx.cmd`，Git 引导优先指向 Git for Windows。
- 仓库同时提供 `taptap-maker-local`、`taptap-maker-dev-kit-guide` 和 `update-taptap-mcp` skills，用于把本地 Git 工作流、AI dev kit 内容说明和 MCP 更新缓存流程交给本地 AI/Agent 按业务规则执行。

## 本地测试

不要拉线上 npm 包。修改后在仓库内执行：

```bash
npm test
npm run build
node dist/maker.js
```

MCP server 模式：

```bash
node dist/maker.js
```

用 Inspector 测本地构建：

```bash
npx @modelcontextprotocol/inspector node dist/maker.js
```

## 崩溃日志保护

Maker MCP 的最后兜底异常日志写入 `~/.taptap-maker/mcp-crash.log`。日志采用固定上限保护：

- 当前日志默认最多 1 MiB，超出前会把尾部内容轮转到 `mcp-crash.log.1`。
- 单条异常默认最多 16 KiB，避免某个异常对象携带大量 stderr/stdout 时一次性写爆磁盘。
- 可通过 `TAPTAP_MAKER_CRASH_LOG_MAX_BYTES` 和 `TAPTAP_MAKER_CRASH_LOG_MAX_ENTRY_BYTES` 调整上限。

线上排查 Windows 用户反馈时，如果发现 `C:\Users\<user>\.taptap-maker\mcp-crash.log` 异常变大，应优先让用户停止正在反复拉起 Maker MCP 的 AI 客户端进程，删除或压缩该日志，再升级到包含日志上限保护的版本。

## CLI 初始化流程

在 Codex、Claude Code、Cursor 或普通终端里，新用户应优先执行 CLI 初始化：

```bash
npx -y -p @taptap/instant-games-open-mcp taptap-maker init
```

这些用户话术都应触发 Maker 本地开发初始化流程，并优先让 Agent 调用 CLI，而不是逐个调用 MCP tool：

```text
我要开发maker游戏
本地maker开发
拉取maker游戏到本地
把maker游戏代码拉到本地
clone maker项目
clone maker游戏
下载maker项目代码
下载maker游戏代码
初始化maker项目
初始化maker开发目录
配置maker本地开发
打开maker项目开发
继续开发maker项目
```

触发后不要要求用户直接提供 app_id。`taptap-maker init` 会先检查 Git 和 PAT，获取 PAT 后自动获取 TapTap token 并列出 app，让用户从列表中选择，然后准备 dev-kit、clone 项目，并按客户端写入 MCP 配置。

```text
taptap-maker init
检查 Git / PAT / TapTap token
列出 app 并让用户选择
准备 AI dev-kit
clone Maker 项目
写入 Codex / Cursor / Claude MCP 配置
taptap-maker doctor
```

CLI 命令：

- `taptap-maker init`：一站式初始化当前目录。
- `taptap-maker doctor`：检查 Git、PAT、TapTap token、项目绑定、dev-kit 和 MCP 配置状态。
- `taptap-maker apps`：列出当前 PAT 可访问的 Maker app。
- `taptap-maker pat set <PAT>`：保存 PAT，并换取 TapTap token。
- `taptap-maker mcp install`：写入当前机器的 AI 客户端 MCP 配置。
- `taptap-maker mcp verify`：检查本机 Codex、Cursor、Claude 配置是否存在 Maker MCP。
- `taptap-maker dev-kit update`：恢复或更新当前目录的 AI dev-kit。

MCP 运行期能力：

- `maker://status`：资源形式的本地 Maker 状态，适合 Agent 首先读取。
- `maker_status_lite`：工具形式的轻量状态，兼容不会读取 MCP resources 的客户端。
- `maker_build_current_directory`：统一执行本地同步和远端构建。默认发现本地改动或 ahead commit 时先 commit/push，再远端 build；用户明确说“不提交，直接构建云端版本”时才传 `confirm_remote_build_without_submit=true`。
- 如果 push 被拒绝、远端有新提交、认证失败或存在冲突，`maker_build_current_directory` 会在 build 前停止并返回失败阶段。Agent 应解释失败原因，协助用户 pull/rebase 或解决冲突，再重试同一个 build 工具。
- 构建前本地改动检查会忽略 `.gitignore` 和 `.maker-mcp/` 的本地辅助变化；这些变化不应单独触发提交。

## Maker 本地 Workflow Skills

Maker 内置三个业务流程 skill，目标是让本地 AI/Agent 参与本地状态判断，而不是把所有情况都塞进 MCP tool description。

- `taptap-maker-local`：Maker 初始化与本地 Git 工作流。
- `taptap-maker-dev-kit-guide`：AI dev kit 内容说明，帮助本地 AI/Agent 理解 `CLAUDE.md`、`examples/`、`templates/`、`urhox-libs/` 的用途。
- `update-taptap-mcp`：TapTap MCP npx 缓存更新工作流。

第一版范围：

- 初始化 Maker 本地开发目录。
- 在绑定 Maker 项目前准备本地 AI dev kit。
- clone Maker 项目。
- 选择 Maker app，避免自动选择错误项目。
- 解释 PAT、Git、项目绑定和编辑器重启。
- 提交、推送本地改动。
- pull 远端改动前检查本地 dirty 状态。
- 发生冲突时解释为什么冲突、冲突文件在哪里、冲突内容是什么，并让 Agent 给出解决建议。
- 冲突解决前必须让用户确认，不隐藏 unresolved conflict。

`taptap-maker doctor` 和 `maker://status` 会输出已随包内置的 skill 名称和文档路径：`taptap-maker-local`、`taptap-maker-dev-kit-guide` 与 `update-taptap-mcp`。Maker 操作目标是用户当前项目目录；若 MCP 进程 cwd 是临时对话目录，Agent 应优先检查客户端附加工作目录：只有一个附加目录时直接作为 `target_dir`，多个附加目录时让用户选择哪个是 Maker 项目目录，避免把已绑定项目误判为未绑定。

已绑定项目还会检查 AI dev kit 状态：`CLAUDE.md`、`examples/`、`templates/`、`urhox-libs/` 缺失时，`taptap-maker dev-kit update` 可以恢复本地 dev kit，并刷新 `.gitignore` 管理块。

注意：MCP tool surface 已经收敛。初始化、PAT、app 列表和 clone 不再作为公开 MCP tools 暴露，避免 Agent 在长对话里把一次性初始化流程拆散。

### AI dev kit 准备

PAT 验证通过、用户选择 app 后，`taptap-maker init` 会在绑定 Maker 项目前自动准备 AI dev kit。

默认下载地址：

```text
https://urhox-demo-platform.spark.xd.com/ai-dev-kit/pd/stable/ai-dev-kit.zip
```

CLI 负责确定性文件处理：

- 解压开发环境文档、引擎 API、demo、Lua 工具和本地 AI skills 到当前目录。
- 如果目标目录已经存在完整 dev kit（`CLAUDE.md`、`examples/`、`templates`、`urhox-libs`），clone 前会跳过下载和解压，并按目录中实际存在的 dev-kit 顶层条目刷新 `.gitignore` 管理块。
- dev kit 准备失败不会阻塞 Maker 项目 clone；CLI 会返回 `ai_dev_kit_error`，后续可通过 `taptap-maker dev-kit update` 重新恢复。
- 如果目标目录位于外层 Git 仓库下，clone 只把目标目录自身的 `.git` 视为已有 Maker 仓库；父级 Git 仓库不会被复用，也不会被改 remote。
- Windows 原生环境使用 PowerShell `Expand-Archive` 解压；Linux/macOS 先使用 `unzip`，失败时回退到 `python3`/`python` 标准库 `zipfile`。
- 跳过 ZIP 顶层 `scripts` 目录，避免和 Maker 项目 clone 后的 `scripts` 冲突。
- 删除下载完成并解压后的 `ai-dev-kit.zip`。
- clone 前生成 `.gitignore.dev-kit-before-clone` 临时 block，把 dev-kit 顶层内容标记为 local-only。
- clone 成功后自动把临时 block 合并到远端 `.gitignore`，并删除临时文件。

如果 clone 失败，CLI 会返回 `partial_state`，说明目标目录是否已经初始化 `.git`、是否已经绑定 `.maker-mcp/config.json`、dev kit 是否已落盘、以及是否可以直接重试。skill 负责把这些状态解释给用户；不要自动删除半初始化文件。对新手用户，连续失败时优先建议换一个全新的独立目录重新 clone。

### 已有 Git 仓库子目录

Maker 项目可以放在一个大 Git 仓库的子目录里，但 Maker 子目录必须是独立 Git 仓库：

```text
big-repo/
  .git/
  maker-game/
    .git/
    .maker-mcp/config.json
```

错误状态是 Maker 子目录只有 `.maker-mcp/config.json`，但没有自己的 `.git`：

```text
big-repo/
  .git/
  maker-game/
    .maker-mcp/config.json
```

这种状态下，`maker://status` 或 `maker_status_lite` 会显示 Maker config root 和 Git root 不一致；`build` 和
`submit` 会停止，避免把外层大仓库当成 Maker 项目提交或推送。初始化前，skill 应提醒
用户优先选择独立目录；如果用户确认继续，CLI 会在目标目录内创建独立 Maker Git
仓库，不复用父级 Git 仓库。

Maker app 列表关键字段：

- `id`：Maker app id。
- `name`：游戏名称。
- `createdAt`：创建时间，可用于获取最新创建的游戏。
- `lastConversationAt`：最后修改时间，可用于获取最近活跃的游戏。

进度和耗时：

- `taptap-maker init` 会解析 Git clone/fetch stderr 中的百分比进度。
- `taptap-maker init` 会根据 Git stderr 判断是否自动重试：HTTP 5xx、503、超时、连接重置、HTTP2/RPC 中断、early EOF 等远端临时错误会重试；认证失败、权限不足、仓库不存在、远端拒绝、非空目录冲突、本地权限错误不会重试。
- 首次 clone/fetch 默认最多自动重试 2 次；连续重试后仍失败时，错误会保留 `retryable`、`retry_reason` 和已重试次数，方便 Agent 判断是让用户稍后直接重试，还是先处理 PAT、权限或本地目录问题。
- `maker_build_current_directory` 会在本地 commit、push 和远端 build 阶段输出状态，并解析 Git push stderr 中的百分比进度。
- `maker_build_current_directory` 的 push 阶段也会对远端临时错误自动重试；push 最终失败时不会继续远端 build。
- `maker_build_current_directory` 会转发远端 build tool 的 progress notification。
- 以上慢操作最终返回都会包含 `elapsed_ms`、`elapsed`、`progress_events` 和 `last_progress`。如果没有可用百分比进度，则至少返回耗时统计；长任务运行超过 3 分钟时会发送一次仍在运行的 progress heartbeat。

## 当前 PAT 获取方式

Maker 本地开发默认使用 PAT-first 流程：

- Maker PAT：用户直接提供，供 Maker API 项目列表、Git clone/push 和 TapTap token 获取使用。
- Tap token：默认通过 `GET /api/v1/user/taptap-token` 和 Maker PAT 获取，并保存到 `~/.taptap-maker/tap-auth.json`。

PAT 保存步骤：

```text
1. 如果用户没有 PAT，引导用户打开当前环境的 PAT 页面新建 PAT。production 使用 `https://maker.taptap.cn/pat-tokens`，RND 使用 `https://fuping.agnt.xd.com/pat-tokens`。
2. 用户把 PAT 发给 Agent。
3. Agent 运行 `taptap-maker pat set <PAT>`，或在 `taptap-maker init` 提示时粘贴 PAT。
4. CLI 保存 PAT 后会自动获取 TapTap token，并在初始化流程里列出 app。
5. 后续 `taptap-maker apps`、`taptap-maker init`、`maker_build_current_directory` 默认复用缓存 PAT。
```

保存位置：

```text
~/.taptap-maker/pat.json
~/.maker-pat
```

如果 PAT 过期或不可用，Agent 应提示用户提供新的 Maker PAT，再运行 `taptap-maker pat set <PAT>` 更新本地缓存。

## Git 前置条件和引导边界

Maker CLI/MCP 不负责给用户安装 Git，也不会自动调用 `brew`、`winget`、安装器或系统包管理器。工具只做两件事：

1. 通过 `git --version` 检测当前 MCP 进程是否能找到 Git。
2. 如果 Git 缺失，返回当前系统对应的安装引导。

如果 Git 缺失，必须遵守：

- 不继续 clone。
- 不执行 fetch、stage、commit、push。
- 不申请 Maker PAT，因为 clone 不能继续。
- 持续提示用户先自行安装 Git，并在 `git --version` 可用后重启终端；如果是 MCP 客户端，可能也需要重新启动客户端进程。

macOS 引导：

```text
1. 用户自行在终端执行 git --version。
2. 如果系统弹出 Xcode Command Line Tools 安装提示，由用户自行确认安装。
3. 用户也可以自行访问 https://git-scm.com/download/mac 下载官方 macOS 安装器。
4. 安装完成后重启 MCP 客户端或终端，再执行 git --version 验证。
```

Windows 引导：

```text
1. 用户自行访问 https://git-scm.com/download/win 下载 Git for Windows。
2. 安装时建议选择 “Git from the command line and also from 3rd-party software”。
3. 如果用户习惯 winget，可以自行在 PowerShell 执行：
   winget install --id Git.Git -e --source winget
4. 安装完成后重启 MCP 客户端或终端，再执行 git --version 验证。
5. 如果 Git 已安装但 MCP 仍检测不到，可设置 TAPTAP_MAKER_GIT_BIN 为 git.exe 完整路径。
```

Windows 兼容注意：

- 写入 MCP 配置时，`npx` 在 Windows 下使用 `npx.cmd`，避免部分客户端 `spawn` 找不到命令。
- Maker 内部路径必须使用 Node `path` API，不能手写 POSIX 路径分隔符。
- Git 可执行文件默认从 PATH 查找；企业环境或非标准安装路径可通过 `TAPTAP_MAKER_GIT_BIN` 覆盖。

## 远端 Proxy 和构建工具

`init_dev_env.py` 里的 `proxy_cfg` 用于连接远端 MCP server，不属于本地 clone/push 流程。Maker 后端地址集中维护在 `src/maker/config.ts` 的环境配置表里，按 `TAPTAP_MCP_ENV` 自动选择：

```text
TAPTAP_MCP_ENV=rnd
TAPTAP_MCP_ENV=production
```

默认构建路径是本地 Maker MCP 直接转发远端 build：

```text
maker_build_current_directory()
```

本地同步是工具层强制规则，不只是 Agent 文案约定：

- `maker_build_current_directory` 会先读取当前 Maker git 状态。
- 如果本地没有改动且没有 ahead commit，继续转发远端 build。
- 如果本地有改动或已经有本地 commit 未 push，默认先 commit/push，再远端 build。
- 用户说“提交 / push / 构建 / 查看结果 / 预览 / 跑一下 / 验证一下 / 看看效果”时，都使用同一个工具。
- 用户明确说“不提交 / 直接构建 / 构建云端版本”时，才允许传 `confirm_remote_build_without_submit=true`，这会只构建 Maker 远端已提交版本。
- push 被远端拒绝、认证失败、远端有新提交或发生冲突时，工具返回 `mode: submit_failed_before_build`，不会继续远端 build。Agent 应解释 push 失败原因，让用户确认 pull/rebase 或冲突修复策略，再重试同一个构建工具。
- 如果 push 成功但远端 build 失败，工具返回 `mode: build_failed_after_submit`，同时保留成功的提交/推送结果和构建错误。

远端 proxy 配置是 Maker 本地 MCP 的内部能力，不作为普通 Agent tool 暴露。内部配置内容等价于测试脚本中的：

```json
{
  "server": { "url": "<remote-mcp-server-url>", "env": "<rnd-or-production>" },
  "tenant": {
    "project_path": "<app_id>/workspace",
    "user_id": "<maker-user-id>",
    "project_id": "<app_id>"
  },
  "auth": {
    "kid": "<tap kid>",
    "mac_key": "<tap mac_key>",
    "token_type": "mac",
    "mac_algorithm": "hmac-sha-1"
  },
  "options": { "verbose": true }
}
```

如果内部流程需要写入 `.mcp.json`，会同时把它加入当前项目的 `.git/info/exclude`，避免误提交包含认证信息的本地 MCP 配置。

本地工具会复用同一份 `proxy_cfg` 连接远端 MCP server，并转发到远端 `build` tool。默认不要求用户传参：

- `entry` / `scriptsPath`：用户未指定且本地存在 `scripts/main.lua`、也没有显式多人入口参数时，本地 Maker MCP 默认传 `scriptsPath="scripts"` 和 `entry="main.lua"`，减少远端第一次构建的“入口配置缺失”提示。
- `entry_client` / `entry_server`：用户明确说明是多人游戏或给出入口文件时再传入；传入多人入口后不会自动补单机 `scripts/main.lua`。
- `multiplayer`：用户未指定且本地不存在 `.project/settings.json` 时，默认传 `{ "enabled": false }`，用于第一次单机项目构建初始化。
- 如果用户明确说明是多人游戏或给出入口文件，再把对应参数传入。

## 提交和推送约束

当前目录存在 `.maker-mcp/config.json` 时，说明它是 Maker 项目。此时提交/推送/构建请求必须走同一个 Maker MCP 工具：

```text
maker_build_current_directory()
```

这些用户话术都应触发 Maker 提交工具：

```text
帮我提交
帮我提交代码
帮我提交代码到maker
帮我提交代码到taptap制造
帮我提交代码到tap制造
帮我提交代码到tap
提交并推送
push
```

约束：

- 不走本地通用 Git skill 的任务号规则。
- 不因为当前分支是 `main` 就新建功能分支。
- 不要求用户提供 TAP/Jira/飞书任务号。
- commit message 可以由 MCP 根据变更文件自动生成，也可以由用户通过 `message` 显式提供。
- push 被远端拒绝或出现冲突时，不自动建分支；应询问用户是否先 pull/rebase 当前 Maker 远端变更，再重试 push。
- 如果 commit 已完成但 push 失败，工具必须返回 commit hash、git ahead 状态、失败阶段、exit code、stderr/stdout、错误分类、`push_recovery` 和下一步建议。
- `push_recovery` 必须明确告诉 AI：本地提交已保留但未推送；不要手动执行通用 `git push`；修复原因后直接重试 `maker_build_current_directory`。
- 开发阶段任何 Maker tool 失败都必须暴露具体错误原因，不能只返回“连接断开”或“失败”。

## 环境变量

| 变量                                 | 说明                                              |
| ------------------------------------ | ------------------------------------------------- |
| `TAPTAP_MAKER_HOME`                  | 覆盖用户级 Maker 存储目录，默认 `~/.taptap-maker` |
| `MAKER_PROJECT_ID`                   | MCP server 项目识别的环境变量覆盖                 |
| `TAPTAP_MCP_ENV`                     | Maker 环境选择，`production` 或 `rnd`             |
| `TAPTAP_MAKER_API_BASE`              | 可选：覆盖当前环境的 Maker 项目列表接口 base URL  |
| `TAPTAP_MAKER_PAT_URL`               | 可选：覆盖当前环境的 Maker PAT 换取接口           |
| `TAPTAP_MAKER_TAP_TOKEN_URL`         | 可选：覆盖当前环境的 PAT 获取 TapTap token 接口   |
| `TAPTAP_MAKER_GIT_BASE`              | 可选：覆盖当前环境的 Maker git base URL           |
| `TAPTAP_MAKER_REMOTE_MCP_SERVER_URL` | 可选：覆盖当前环境的远端 Maker MCP server URL     |
| `TAPTAP_MAKER_WEB_URL`               | 可选：覆盖当前环境的 Maker 网页地址               |
| `TAPTAP_MAKER_GIT_BIN`               | 可选：覆盖 Git 可执行文件路径                     |
| `TAPTAP_MAKER_GIT_RETRY_DELAY_MS`    | 可选：覆盖 Git 临时错误重试基础延迟，默认 1500ms  |
| `SCE_MCP_URL`                        | 云端 SCE MCP endpoint 默认值                      |

Maker 后端默认地址集中在 `src/maker/config.ts`。兼容旧变量名：`MAKER_API_BASE`、`MAKER_PAT_URL`、`MAKER_TAP_TOKEN_URL`、`MAKER_GIT_BASE`、`TAPTAP_REMOTE_MCP_SERVER_URL`、`MAKER_WEB_URL`。新配置优先使用 `TAPTAP_MAKER_*` 前缀。

| 环境       | Web URL                      | API Base                            | PAT URL                                             | TapTap Token URL                                      | Git Base                         | Remote MCP Server URL               |
| ---------- | ---------------------------- | ----------------------------------- | --------------------------------------------------- | ----------------------------------------------------- | -------------------------------- | ----------------------------------- |
| production | `https://maker.taptap.cn`    | `https://maker.taptap.cn/api/v1`    | `https://maker.taptap.cn/api/v1/user/pat-tokens`    | `https://maker.taptap.cn/api/v1/user/taptap-token`    | `https://maker.taptap.cn/git`    | `https://maker.taptap.cn/mcp/v1`    |
| rnd        | `https://fuping.agnt.xd.com` | `https://fuping.agnt.xd.com/api/v1` | `https://fuping.agnt.xd.com/api/v1/user/pat-tokens` | `https://fuping.agnt.xd.com/api/v1/user/taptap-token` | `https://fuping.agnt.xd.com/git` | `https://fuping.agnt.xd.com/mcp/v1` |

`TAPTAP_MAKER_REMOTE_MCP_SERVER_URL` 可覆盖当前环境的远端 Maker MCP server URL。

## 手动 PAT 联调

测试时可以通过当前环境的 PAT 页面新建 Maker PAT：
production 使用 `https://maker.taptap.cn/pat-tokens`，RND 使用 `https://fuping.agnt.xd.com/pat-tokens`。
再通过 `taptap-maker pat set <PAT>` 保存。
APP_ID 不应要求用户手动输入，而是通过 `taptap-maker init` 或 `taptap-maker apps` 返回的 app 列表让用户选择。

推荐按 CLI 流程测试：

```text
taptap-maker pat set <PAT>
taptap-maker apps
taptap-maker init
```

如果当前目录已经绑定 Maker 项目，app 列表只用于确认账号下有哪些项目；继续在当前绑定项目上提交、构建或检查状态，不要要求用户重新选择 clone。

clone/push 默认会按 `TAPTAP_MCP_ENV` 读取 `src/maker/config.ts` 中对应环境的配置。需要临时覆盖时可设置：

```text
TAPTAP_MAKER_API_BASE=<maker-api-base-url>
TAPTAP_MAKER_PAT_URL=<maker-pat-url>
TAPTAP_MAKER_TAP_TOKEN_URL=<maker-taptap-token-url>
TAPTAP_MAKER_GIT_BASE=<maker-git-base-url>
```

PAT 会缓存到 `~/.taptap-maker/pat.json`，并继续写入旧路径 `~/.maker-pat` 以兼容 git 脚本。

如果 `~/.maker-pat` 已存在，会直接复用；如需刷新 PAT，请让用户重新打开临时 PAT 页面创建新的 PAT，然后运行 `taptap-maker pat set <PAT>` 更新本地缓存。

clone 成功后会写：

```text
<current-directory>/.maker-mcp/config.json
```

然后可以用 CLI 或 MCP 状态验证 cwd 识别：

```text
taptap-maker doctor
maker://status
```

## 当前边界

- 远端 MCP tools 所需的 Tap token 默认由 Maker PAT 获取并缓存。
- `maker_build_current_directory` 会在当前目录创建 commit、push，并在 push 成功后继续远端 build；push 失败时不会构建云端旧版本。
- 云端 SCE MCP proxy 转发仍需要本地已有 Tap auth；后续可接入 PAT 换 Tap token 的后端接口。
