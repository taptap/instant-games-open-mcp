# TapTap Maker 本地 MCP

> 本文档描述 Issue #162 的本地 MCP 开发骨架。Server 同学提供的脚本用于说明接口和测试流程，本仓库侧交付 MCP tools，不要求用户流程依赖 CLI。

## 目标

`taptap-maker` 是同一个 npm 包里的 Maker 专用 MCP server 入口：

- 本地通过 cwd 向上查找 `.maker-mcp/config.json` 识别当前 Maker 项目。
- 用户级凭证保存到 `~/.taptap-maker/`。
- Agent 通过 MCP tools 完成 PAT 准备、app 选择、clone、push 和远端构建准备。
- 本地 Git 是 clone/push 的硬性前置条件。Maker MCP 只检测和引导，不代替用户安装 Git。

## 本地测试

不要拉线上 npm 包。修改后在仓库内执行：

```bash
npm test
npm run build
node dist/maker.js status
node dist/maker.js init --project-id demo-project --target /tmp/demo-maker --sce-endpoint http://localhost:5003
```

MCP server 模式：

```bash
node dist/maker.js
```

用 Inspector 测本地构建：

```bash
npx @modelcontextprotocol/inspector node dist/maker.js
```

## MCP 工具流程

在 Codex 新开空目录后，可以用一句“使用 tapmaker 初始化当前目录”触发工具链。Agent 应按下面顺序执行：

这些用户话术都应触发 Maker 本地开发初始化流程：

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

触发后不要要求用户直接提供 app_id。应先检查 Git 和 PAT，获取 PAT 后自动获取 TapTap token 并列出 app，让用户从列表中选择。

```text
maker_status
maker_check_environment
用户提供 Maker PAT
maker_exchange_pat(manual_pat)
自动获取 TapTap token
自动列出 app
用户选择 app
maker_clone_to_current_directory
如 PAT 获取 TapTap token 失败，再使用 maker_tap_login_start / maker_tap_login_complete fallback
maker_status
```

工具说明：

- `maker_check_environment`：检查本机前置条件，当前重点是 Git 是否可用。该工具只输出状态和安装引导，不执行安装。
- `maker_tap_login_start`：legacy fallback，申请 TapTap device code，返回授权链接。
- `maker_tap_login_complete`：legacy fallback，用户扫码后轮询 Tap token，保存 MAC 认证数据。
- `maker_exchange_pat`：接收用户提供的 Maker PAT，以 `manual_pat` 传入后保存到本地 `~/.taptap-maker/pat.json`，并兼容旧的 `~/.maker-pat`；保存后会自动获取 TapTap token 并列出 app。
- `maker_status`：如果发现本地已有 PAT 但缺少 TapTap token，会自动尝试获取；如果当前目录未绑定，会自动列出 app，不需要用户额外要求。
- `maker_list_apps`：优先用 Maker PAT 拉取 app 列表，必须展示给用户选择；JWT 仅作为 legacy fallback。会解析 Maker `/apps` 返回的创建时间、最近会话时间、游戏类型、阶段、图标、置顶/归档/删除时间等字段，并保留原始 `raw` 数据。
- `maker_clone_to_current_directory`：把选中的 Maker app 仓库拉到当前目录并写 `.maker-mcp/config.json`。如果本机没有 Git，工具会在申请 PAT 和改动文件前停止。当前目录不要求为空；clone 前会检查本地目录，忽略 `.claude`、`.mcp`、`.skill`、`.config`、`.ini` 等点开头配置项，只对普通本地文件输出提醒。clone 最终结果固定包含 `Pre-clone local directory check` 区块；已有本地文件会保留，若与 Maker 项目文件同路径冲突则失败并列出冲突文件。
- `maker_configure_remote_proxy`：按 server 测试脚本生成 `proxy_cfg`，写入当前项目 `.mcp.json`，连接远端 `taptap-proxy`。
- `maker_build_current_directory`：用户说“构建 / build / 重新构建游戏”时使用，转发调用远端 `build` tool。工具内部会强制检查本地 Maker 项目是否有未提交改动；如果有改动且没有传入 `confirm_remote_build_without_submit=true`，会停止并要求先询问用户。构建转发会从 MCP 包自身定位 `dist/proxy.js`；`cwd` / `target_dir` 只用于识别 Maker 游戏项目，不要求游戏目录存在 MCP 的 `dist/proxy.js`。
- `maker_submit_current_directory`：用户说“帮我提交”“提交代码”时使用，提交并推送当前 Maker 项目。Maker 提交等于 commit + push；提交成功后会自动触发构建。如果来自构建拦截首选项 `提交本地改动并触发构建（以后都是如此）`，必须传入 `remember_build_submit_preference=true`。如果本机没有 Git，工具会在 stage/commit/push 前停止。
- `maker_push_current_directory`：把当前目录改动 commit 并 push 到 Maker git。如果本机没有 Git，工具会在 stage/commit/push 前停止。

Maker app 列表关键字段：

- `id`：Maker app id。
- `name`：游戏名称。
- `createdAt`：创建时间，可用于获取最新创建的游戏。
- `lastConversationAt`：最后修改时间，可用于获取最近活跃的游戏。

进度和耗时：

- `maker_clone_to_current_directory` 会解析 Git clone/fetch stderr 中的百分比进度；如果客户端支持 MCP progress notification，会实时显示进度。
- `maker_push_current_directory` / `maker_submit_current_directory` 会在 stage、commit、push 阶段输出状态，并解析 Git push stderr 中的百分比进度。
- `maker_build_current_directory` 会转发远端 build tool 的 progress notification。
- 以上慢操作最终返回都会包含 `elapsed_ms`、`elapsed`、`progress_events` 和 `last_progress`。如果没有可用百分比进度，则至少返回耗时统计；长任务运行超过 3 分钟时会发送一次仍在运行的 progress heartbeat。

## 当前 PAT 获取方式

Maker 本地 MCP 默认使用 PAT-first 流程：

- Maker PAT：用户直接提供，供 Maker API 项目列表、Git clone/push 和 TapTap token 获取使用。
- Tap token：默认通过 `GET /api/v1/user/taptap-token` 和 Maker PAT 获取，并保存到 `~/.taptap-maker/tap-auth.json`；OAuth device code 仅作为 legacy fallback。

Maker Tap 登录只需要 `client_id` 发起 device code flow，不需要 `CLIENT_SECRET` 参与
`X-Tap-Sign`。默认情况下：

- 如果显式配置了 `TAPTAP_MCP_CLIENT_ID`，直接使用它。
- 如果配置了 `TAPTAP_MAKER_CLIENT_ID`，Maker 登录会把它作为 Maker 专用 client id。
- 如果没有配置 client id，且当前是 `TAPTAP_MCP_ENV=rnd` 或 npm `@beta` 包，
  Maker MCP 使用内置 Maker client id 兜底，方便内部 RND/beta 测试。
- 稳定 production 包在 production 环境下不使用内置 Maker client id 兜底，会继续走
  production native signer 或显式环境变量。

PAT 保存步骤：

```text
1. 如果用户没有 PAT，引导用户打开临时 PAT 页面 https://fuping.agnt.xd.com/pat-tokens 新建 PAT。
2. 用户把 PAT 发给 Agent。
3. Agent 把它作为 `maker_exchange_pat` 的 `manual_pat` 参数传入。
4. `maker_exchange_pat` 保存 PAT 后会自动获取 TapTap token 并列出 app。
5. 后续 `maker_list_apps`、`maker_clone_to_current_directory`、`maker_push_current_directory` 默认复用缓存 PAT。
```

保存位置：

```text
~/.taptap-maker/pat.json
~/.maker-pat
```

也可以通过环境变量临时提供：

```bash
MAKER_PAT=<maker_pat> taptap-maker projects list
```

如果 PAT 过期或不可用，Agent 应提示用户提供新的 Maker PAT，再调用
`maker_exchange_pat(manual_pat)` 更新本地缓存。

## Git 前置条件和引导边界

Maker MCP 不负责给用户安装 Git，也不会自动调用 `brew`、`winget`、安装器或系统包管理器。工具只做两件事：

1. 通过 `git --version` 检测当前 MCP 进程是否能找到 Git。
2. 如果 Git 缺失，返回当前系统对应的安装引导。

如果 Git 缺失，必须遵守：

- 不调用 `maker_clone_to_current_directory` 继续 clone。
- 不执行 fetch、stage、commit、push。
- 不申请 Maker PAT，因为 clone 不能继续。
- 持续提示用户先自行安装 Git，并在 `git --version` 可用后重启 MCP 客户端或终端。

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

构建前本地改动检查是工具层强制规则，不只是 Agent 文案约定：

- `maker_build_current_directory` 会先读取当前 Maker git 状态。
- 如果本地没有改动，继续转发远端 build。
- 如果本地有改动且没有保存自动提交偏好，默认停止，不会静默构建云端旧版本。
- 此时必须提示用户：直接构建只会使用 Maker 云端已有版本，可能看不到本地新修改。
- 首选项文案必须是 `提交本地改动并触发构建（以后都是如此）`。
- 用户选择首选项时，调用 `maker_submit_current_directory(remember_build_submit_preference=true)`；提交等于 commit + push，提交成功后 Maker 会自动触发构建，不要再额外调用 `maker_build_current_directory`。
- `remember_build_submit_preference=true` 会把当前项目 `.maker-mcp/config.json` 的 `build_local_changes_policy` 保存为 `auto_submit`。
- 保存偏好后，后续用户说“构建”且本地有改动时，`maker_build_current_directory` 会自动提交并依赖 Maker 自动构建，不再重复询问。
- 用户明确说“不提交 / 直接构建 / 构建云端版本”时，才允许再次调用 `maker_build_current_directory(confirm_remote_build_without_submit=true)`。
- 用户说“查看结果 / 预览 / 跑一下 / 验证一下 / 看看效果”时，也按这个构建检查流程处理。

如需在当前 Maker 项目里直接暴露远端全量 `taptap-proxy` tools，可以执行：

```text
maker_configure_remote_proxy()
```

这个工具会写入：

```text
<current-directory>/.mcp.json
```

配置内容等价于测试脚本中的：

```json
{
  "server": { "url": "<remote-mcp-server-url>", "env": "<rnd-or-production>" },
  "tenant": {
    "project_path": "<app_id>/workspace",
    "user_id": "<jwt.userId>",
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

写入 `.mcp.json` 后，需要重启 Claude/Codex 对话或重新加载 MCP servers，远端 `taptap-proxy` 暴露的 build/构建 tools 才会出现在工具列表里。

`maker_configure_remote_proxy` 会把 `.mcp.json` 加入当前项目的 `.git/info/exclude`，避免误提交包含认证信息的本地 MCP 配置。

本地工具会复用同一份 `proxy_cfg` 连接远端 MCP server，并转发到远端 `build` tool。默认不要求用户传参：

- `entry` / `scriptsPath`：用户未指定且本地存在 `scripts/main.lua`、也没有显式多人入口参数时，本地 Maker MCP 默认传 `scriptsPath="scripts"` 和 `entry="main.lua"`，减少远端第一次构建的“入口配置缺失”提示。
- `entry_client` / `entry_server`：用户明确说明是多人游戏或给出入口文件时再传入；传入多人入口后不会自动补单机 `scripts/main.lua`。
- `multiplayer`：用户未指定且本地不存在 `.project/settings.json` 时，默认传 `{ "enabled": false }`，用于第一次单机项目构建初始化。
- 如果用户明确说明是多人游戏或给出入口文件，再把对应参数传入。

## 提交和推送约束

当前目录存在 `.maker-mcp/config.json` 时，说明它是 Maker 项目。此时提交/推送请求必须走 Maker MCP 工具：

```text
maker_submit_current_directory()
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
- commit message 可以由 MCP 根据变更文件自动生成，也可以由用户显式提供。
- push 被远端拒绝或出现冲突时，不自动建分支；应询问用户是否先 pull/rebase 当前 Maker 远端变更，再重试 push。
- 如果 commit 已完成但 push 失败，工具必须返回 `failed_after_commit`、commit hash、git ahead 状态、失败阶段、exit code、stderr/stdout、错误分类和下一步建议。
- 开发阶段任何 Maker tool 失败都必须暴露具体错误原因，不能只返回“连接断开”或“失败”。

## 环境变量

| 变量                                 | 说明                                              |
| ------------------------------------ | ------------------------------------------------- |
| `TAPTAP_MAKER_HOME`                  | 覆盖用户级 Maker 存储目录，默认 `~/.taptap-maker` |
| `MAKER_PROJECT_ID`                   | MCP server 项目识别的环境变量覆盖                 |
| `MAKER_JWT_EXCHANGE_URL`             | Legacy：Tap OAuth token 换 Maker JWT 的接口       |
| `TAPTAP_MCP_ENV`                     | Maker 环境选择，`production` 或 `rnd`             |
| `TAPTAP_MAKER_CLIENT_ID`             | 可选：覆盖 Maker Tap 登录专用 client id           |
| `TAPTAP_MAKER_API_BASE`              | 可选：覆盖当前环境的 Maker 项目列表接口 base URL  |
| `TAPTAP_MAKER_PAT_URL`               | 可选：覆盖当前环境的 Maker PAT 换取接口           |
| `TAPTAP_MAKER_TAP_TOKEN_URL`         | 可选：覆盖当前环境的 PAT 获取 TapTap token 接口   |
| `TAPTAP_MAKER_GIT_BASE`              | 可选：覆盖当前环境的 Maker git base URL           |
| `TAPTAP_MAKER_REMOTE_MCP_SERVER_URL` | 可选：覆盖当前环境的远端 Maker MCP server URL     |
| `TAPTAP_MAKER_WEB_URL`               | 可选：覆盖当前环境的 Maker 网页地址               |
| `TAPTAP_MAKER_GIT_BIN`               | 可选：覆盖 Git 可执行文件路径                     |
| `SCE_MCP_URL`                        | 云端 SCE MCP endpoint 默认值                      |

Maker 后端默认地址集中在 `src/maker/config.ts`。兼容旧变量名：`MAKER_API_BASE`、`MAKER_PAT_URL`、`MAKER_TAP_TOKEN_URL`、`MAKER_GIT_BASE`、`TAPTAP_REMOTE_MCP_SERVER_URL`、`MAKER_WEB_URL`。新配置优先使用 `TAPTAP_MAKER_*` 前缀。

## 手动 PAT 联调

测试时可以通过临时 PAT 页面 `https://fuping.agnt.xd.com/pat-tokens` 新建 Maker PAT，
再通过 `maker_exchange_pat(manual_pat)` 保存。
APP_ID 不应要求用户手动输入，而是通过 `maker_exchange_pat` 自动返回的 app 列表让用户选择。

推荐在 MCP 客户端中按工具流程测试：

```text
maker_exchange_pat(manual_pat)
自动获取 TapTap token
自动列出 app
用户选择 app
maker_clone_to_current_directory(app_id)
```

clone/push 默认会按 `TAPTAP_MCP_ENV` 读取 `src/maker/config.ts` 中对应环境的配置。需要临时覆盖时可设置：

```text
TAPTAP_MAKER_API_BASE=<maker-api-base-url>
TAPTAP_MAKER_PAT_URL=<maker-pat-url>
TAPTAP_MAKER_TAP_TOKEN_URL=<maker-taptap-token-url>
TAPTAP_MAKER_GIT_BASE=<maker-git-base-url>
```

PAT 会缓存到 `~/.taptap-maker/pat.json`，并继续写入旧路径 `~/.maker-pat` 以兼容 git 脚本。

如果 `~/.maker-pat` 已存在，会直接复用；如需重新创建 PAT：

```text
maker_clone_to_current_directory(app_id, force_pat=true)
```

clone 成功后会写：

```text
<current-directory>/.maker-mcp/config.json
```

然后可以调用 `maker_status` 验证 cwd 识别：

```text
maker_status()
```

## 当前边界

- Tap OAuth 复用现有 `src/core/auth`，当前仍保留给远端 MCP tools 的 Tap token 认证。
- `maker_exchange_jwt` 作为 legacy fallback 保留，也支持缓存 JWT、`JWT` / `MAKER_JWT` 环境变量。
- `maker_push_current_directory` 会在当前目录创建 commit 并 push，调用前需要用户明确要求推送。
- 云端 SCE MCP proxy 转发仍需要本地已有 Tap auth；后续可接入 PAT 换 Tap token 的后端接口。
