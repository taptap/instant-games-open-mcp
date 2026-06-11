# TapTap Maker 本地开发

> Maker 本地开发改为 CLI-first。CLI 负责一次性初始化、PAT、app 选择、dev-kit 和客户端 MCP 配置；MCP 只保留运行期状态查询和“同步并构建”能力。

面向团队介绍的功能总览见
[`docs/MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md`](MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md)。

## 目标

`taptap-maker` 由独立 npm 包 `@taptap/maker` 提供：

- 本地通过 cwd 向上查找 `.maker-mcp/config.json` 识别当前 Maker 项目。
- 用户级鉴权状态由 CLI 在本机统一管理。
- CLI 负责 PAT 准备、app 选择、dev-kit 准备、clone 和 AI 客户端 MCP 配置。
- MCP server 暴露固定运行期业务流：`maker://status`、`maker_status_lite` 和
  `maker_build_current_directory`；远端 proxy tools 默认隐藏，仅白名单公开
  `generate_image`、`batch_generate_images`、`edit_image`、`create_video_task` 和
  `text_to_music` 试用图片/视频/音乐生成链路。
- `maker_build_current_directory` 是用户感知里的提交/推送/远端构建入口；push 失败时会停止在构建前，让本地 Agent 处理冲突或合并。
- 运行时日志不作为本地公开 MCP tool 暴露；构建成功后由 `taptap-maker logs watch`
  内部调用远端 `query_runtime_logs` 并落盘，持续轮询、清理和问题分析由 CLI 与 skill 编排。
- 本地 Git 是 clone/push 的硬性前置条件。Maker MCP 只检测和引导，不代替用户安装 Git。
- Windows 是优先支持环境：生成 MCP 配置时 Windows 通过 `cmd.exe` 包装 `npx.cmd`，避免无
  shell 的 MCP 启动器直接 spawn `.cmd` 失败；Git 引导优先指向 Git for Windows。
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

## Maker NPM 发布边界

Maker CLI 独立发布为 `@taptap/maker`，不走主包
`@taptap/instant-games-open-mcp` 的 semantic-release。Maker-only PR 标题必须带
`(maker)` scope，例如 `fix(maker): repair PAT setup`，并且只能修改 Maker-owned paths。
合并时不要编辑 squash commit 标题去掉 `(maker)`。合并后主包 release workflow 会按
Maker-only paths 跳过这类 push；如需发布 Maker CLI，使用 GitHub Actions 中的
`Publish Maker Package` workflow。

Maker 包版本号使用三段式 semver，例如 `0.0.1`。Maker 包只能从长期发布分支 `beta` 或
`main` 发布，`fix/*` 分支只用于提交 PR，不作为发版来源。workflow 默认使用
`auto-last-number`。`tag=latest` 会递增稳定 patch；`tag=beta`、`tag=alpha` 和 `tag=next`
会基于当前 major/minor 下最高稳定版本生成 prerelease，例如已发布最高稳定版本为 `0.0.16`
时，下一次 beta 自动发布 `0.0.17-beta.1`，后续同一条线递增为 `0.0.17-beta.2`。
正式发布再使用稳定三段版本和 `tag=latest`，例如 `0.0.17`，避免 beta 测试包消耗正式版本号。
手动发布如果修改 major 或 minor，CI 会先在 Actions Summary 展示当前线上 dist-tag 版本和
目标版本，人工核对后点击 protected environment 审批按钮继续发布。发布 job 在
`npm publish` 前会再次查询目标版本是否仍未发布，避免审批等待期间同版本被抢先发布。

### 主包迁移说明

主包 `@taptap/instant-games-open-mcp` 只保留 TapTap Open API MCP server 和 proxy 入口。
`taptap-maker` CLI、Maker MCP bundle 和 Maker workflow skills 迁移到独立包
`@taptap/maker`，后续 Maker 功能更新不会再通过主包发布。已通过主包调用 Maker CLI 的用户
需要改为：

```bash
npx -y @taptap/maker init
```

AI 客户端 MCP 配置也应使用 `taptap-maker mcp install` 写入的
`npx -y -p @taptap/maker taptap-maker` 命令；不要再依赖
`@taptap/instant-games-open-mcp` 提供 Maker CLI。

## 崩溃日志保护

Maker MCP 的最后兜底异常日志写入 `~/.taptap-maker/mcp-crash.log`。日志采用固定上限保护：

- 当前日志默认最多 1 MiB，超出前会把尾部内容轮转到 `mcp-crash.log.1`。
- 单条异常默认最多 16 KiB，避免某个异常对象携带大量 stderr/stdout 时一次性写爆磁盘。
- 可通过 `TAPTAP_MAKER_CRASH_LOG_MAX_BYTES` 和 `TAPTAP_MAKER_CRASH_LOG_MAX_ENTRY_BYTES` 调整上限。

线上排查 Windows 用户反馈时，如果发现 `C:\Users\<user>\.taptap-maker\mcp-crash.log` 异常变大，应优先让用户停止正在反复拉起 Maker MCP 的 AI 客户端进程，删除或压缩该日志，再升级到包含日志上限保护的版本。

## CLI 初始化流程

在 Codex、Claude Code、Cursor 或普通终端里，新用户应优先执行 CLI 初始化：

```bash
npx -y @taptap/maker init
```

普通初始化不要在 `taptap-maker init` 后追加 `--package`。该参数已移除；CLI 写入
AI 客户端 MCP 配置和 `taptap-maker mcp verify` 默认验证的 npx 包都固定为
`@taptap/maker`。

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

触发后不要要求用户直接提供 app_id。`taptap-maker init` 会先检查 Git 和 Python 环境；
如果 Python 环境未就绪，会自动尝试准备 3 次。3 次都失败时初始化会暂停，后续 PAT、
app 列表、clone 和 MCP 配置不会继续执行。Python 修复后重新运行 `taptap-maker init`
即可继续。Python 检查通过后，CLI 获取 PAT、自动获取 TapTap token 并列出 app，让用户从列表中选择，然后 clone 项目、准备 dev-kit，并按客户端写入 MCP 配置。

```text
taptap-maker init
检查 Git / Python
Python 未就绪时自动准备，失败最多重试 2 次
检查 PAT / TapTap token
列出 app 并让用户选择
clone Maker 项目
准备 AI dev-kit
写入 Codex / Cursor / Claude MCP 配置
taptap-maker doctor
```

CLI 命令：

- `taptap-maker init`：一站式初始化当前目录。
- `taptap-maker doctor`：检查 Git、PAT、TapTap token、项目绑定、dev-kit 版本和 MCP 配置状态。
- `taptap-maker apps`：列出当前 PAT 可访问的 Maker app。
- `taptap-maker login`：CLI 登录入口；按需打开 Maker 授权页，CLI 轮询授权结果并完成本地鉴权配置。
- `taptap-maker pat set`：无参数时同样进入 CLI 登录；显式传 PAT 或 stdin 仅用于 CI
  或应急联调。
- `taptap-maker python doctor`：检查本地 Maker Python 运行时。优先复用可信系统 Python；
  Windows 会避开 Microsoft Store app execution alias。
- `taptap-maker python setup`：自动准备本地 Lua 诊断环境。缺少可用系统 Python 时，CLI 会先把
  `uv` 安装到 `~/.taptap-maker/bin/`，再用 uv 安装 managed Python 到
  `~/.taptap-maker/python/uv/`，不修改系统 Python 或全局 PATH；Python ready 后会 best-effort
  创建 Maker 私有 LSP venv，在其中安装/升级 `maker-lua-lsp` 并执行
  `maker-lua-lsp install --ide codex,cursor,claude`。
- `taptap-maker python path`：输出 Maker 诊断脚本应使用的真实 Python 可执行文件路径。
- `taptap-maker lua-lsp doctor`：检查 `maker-lua-lsp` 是否已经可用于本地 Lua 诊断。
- `taptap-maker lua-lsp setup`：使用当前 Maker Python 创建
  `~/.taptap-maker/lua-lsp-venv/`，在 venv 中安装/升级 `maker-lua-lsp`，
  然后配置 Codex、Cursor 和 Claude。

Python 运行时策略：

- 优先复用可信的用户级/开发者 Python，例如 python.org、Homebrew、pyenv、conda 或 Windows
  `py -3` 找到的真实 Python，并要求 `pip` 可用。
- Maker Lua 诊断脚本的 Python 最低要求是 3.8；低于 3.8 会被标记为
  `version_unsupported`，并提示运行 `taptap-maker python setup`。
- Python 3.8 到 3.11 满足最低要求，可以继续使用；状态中会提示推荐使用 3.12 或更新版本。
- `taptap-maker python setup` 使用 uv 安装 Python 3.12，满足推荐版本要求；随后创建
  Maker 私有 LSP venv 并继续准备 `maker-lua-lsp`。LSP 安装成功或失败都会在命令输出和状态中展示，但失败不阻塞远端构建。
- Windows 不信任 `%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe` 这类 Microsoft Store
  app execution alias；检测到 alias 时会提示运行 `taptap-maker python setup`。
- macOS 不把 `/usr/bin/python3`、Xcode 或 Command Line Tools 自带 Python 作为 Maker 工具链，
  即使它们能输出版本号。自动准备会改用 uv managed Python，避免向 Apple/Xcode 目录安装诊断依赖。
- `taptap-maker python setup` 使用 Node/npx 启动，不要求用户预先安装系统 Python、pip 或 Homebrew。
- `taptap-maker init` 会把 Python 作为强制前置条件，并在 Python ready 后 best-effort 准备
  `maker-lua-lsp`。Python 不可用时会自动运行 setup；
  如果连续 3 次仍失败，init 会暂停并提示用户让 AI 重试 `taptap-maker python setup`，
  或自行安装 Python 3.12 后运行 `taptap-maker python doctor`。
- `taptap-maker install`：`taptap-maker mcp install` 的快捷别名，用于写入当前机器的
  AI 客户端 MCP 配置。
- `taptap-maker mcp install`：写入当前机器的 AI 客户端 MCP 配置。Codex 配置写入
  会同时清理 `[mcp_servers.taptap-maker]` 与 `[mcp_servers."taptap-maker"]`
  两种 TOML 等价写法，并默认设置 `startup_timeout_sec = 60`，重复运行或从旧配置升级时应保持幂等。
- `taptap-maker mcp verify`：默认验证 AI 客户端 MCP 配置使用的 npx 包命令可启动；`--mode self` 只验证当前 CLI 二进制。验证失败时若出现 `failure_type` 或 `status: null`，表示本地启动命令还没正常退出，Maker MCP server 尚未启动，不要当作 PAT、项目或 Maker 业务接口错误。
- `taptap-maker dev-kit update`：检查当前环境可用的最新 AI dev kit，恢复或更新当前目录。

MCP 运行期能力：

- `maker://status`：资源形式的本地 Maker 状态，适合 Agent 首先读取。
- `maker_status_lite`：工具形式的轻量状态，兼容不会读取 MCP resources 的客户端。
  当 AI 客户端从父目录或对话目录启动 MCP server，而实际 Maker 项目位于子目录时，状态会输出
  `MCP tool registration cwd` 诊断，说明 proxy tools 虽然会静态出现在 `tools/list`，但实际调用时
  可能因为 MCP server cwd 不是 Maker 项目目录而失败。
- `maker://status` 和 `maker_status_lite` 会输出 `Python environment` 和
  `Lua LSP environment`。本地 Lua 诊断需要环境时，Agent 应先看这两段；如果
  `python_status` 或 `lsp_status` 不是 `ready`，可运行 `taptap-maker python setup`
  准备完整本地 Lua 诊断环境。Python 或 LSP 缺失不阻塞远端构建主流程。
- `maker_build_current_directory`：统一执行本地同步和远端构建。提交前会检查 Maker 远端同步状态；
  本地落后远端、分叉、当前不在 `main` 或无法确认远端同步时，会在创建 commit 前停止。普通构建会先
  push 再远端 build：本地有改动时提交改动，已有 ahead commit 时直接 push，本地干净且无 ahead commit
  时创建 `chore: wake maker build server` 空提交来唤醒 Maker 远端服务。用户明确说“不提交，直接构建云端版本”时才传
  `confirm_remote_build_without_submit=true`，此时工具会先打开并返回 `maker_page_url`，提示用户打开
  Maker 远端页面后查看结果。
- 运行时日志：不作为本地公开 MCP tool 暴露。构建成功后 `taptap-maker logs watch`
  内部调用远端 `query_runtime_logs`，默认只拉 `engine`、`user_script`（客户端 Lua 脚本）和
  `server_user_script`（服务端 Lua 脚本）。本地只追加写入一份
  `.maker/logs/runtime/runtime.log`，保持 server 日志行格式（`t/topic/level/msg/userId`
  等），但去掉无用的 `id` 字段，也不再补 `time/message` 重复字段；并维护
  `.maker/logs/runtime/state.json` 的 `nextStartTime` 和心跳字段。
- 构建成功输出会包含 `maker_url`，格式为 `https://maker.taptap.cn/app/<project_id>` 或当前环境对应的 Maker Web URL，可直接打开远端 Maker 页面预览。
- 构建成功并收到远端 build 返回后，MCP 会用本地缓存 Maker PAT 调用当前环境
  Maker API：`POST /api/v1/apps/<APP_ID>/preview-refresh`，主动刷新 Maker Web 端预览。
- 构建成功输出会包含 `runtime_logs.watch_started`、`runtime_logs.watch_pid` 和
  `runtime_logs.watch_command`、`runtime_logs.local_file` 和 `runtime_logs.state_file`。
  MCP 在收到成功 build 结果后会启动该本地 CLI watcher：
  `taptap-maker logs watch --target-dir <PROJECT_ROOT> --reset --interval 5s`。watcher 会先清理
  `.maker/logs/runtime/` 下的历史 runtime 日志、旧拆分日志和游标，然后持续写入同一份
  `.maker/logs/runtime/runtime.log`。watcher 以 detached 进程运行，MCP build tool 不等待长轮询结束。
  Windows 上 watcher 和其内部远端日志 proxy 子进程会隐藏 console 窗口；watcher 生命周期内复用同一条
  远端日志 MCP 连接，不会每 5 秒重新启动一个 proxy 进程。
  后续分析游戏运行结果或 Lua 报错时，Agent 应读取 `runtime_logs.local_file`；判断 watcher
  是否正常时读取 `runtime_logs.state_file`。
- 如果提交前发现远端有新提交、分叉、非 main 分支、认证失败或 push 被拒绝，
  `maker_build_current_directory` 会在 build 前停止并返回失败阶段。远端同步类失败会尽量发生在创建
  commit 前。Agent 应解释失败原因，并根据 `classification` 选择恢复路径：`remote_rejected` 才协助
  pull/rebase，`branch_not_allowed` 切回 main 并迁移本地 commit，`forbidden_path` 按远端 forbidden
  pattern 从未推送 commit 移除禁止路径，`auth` 才刷新 PAT。
- 构建前本地改动检查会忽略 `.maker-mcp/` 的本地配置变化；`.gitignore` 是 Maker 项目必要文件，
  首次 init 后如果出现或变化，应随游戏代码一起提交。即使 AI 传了 `files` 白名单，Maker MCP 也会把
  已变化的根 `.gitignore` 纳入提交。
- 已绑定项目的状态输出会包含 `Maker remote sync`。该段会 fetch Maker 远端并比较 `HEAD...origin/main`：本地干净且远端领先时提示先 fast-forward pull；本地有未提交改动时提示不要直接 pull，让本地 Agent 先引导提交、stash 或取消同步。
- 频繁轮询状态或只需要快速本地状态时，调用 `maker_status_lite` 应传
  `skip_remote_sync=true`，避免每次状态查询都触发 `git fetch origin` 和 AI dev kit
  最新版本检查网络往返。

## Maker 本地 Workflow Skills

Maker 内置三个业务流程 skill，目标是让本地 AI/Agent 参与本地状态判断，而不是把所有情况都塞进 MCP tool description。

- `taptap-maker-local`：Maker 初始化与本地 Git 工作流。
- `taptap-maker-dev-kit-guide`：AI dev kit 内容说明，帮助本地 AI/Agent 理解 `CLAUDE.md`、`examples/`、`templates/`、`urhox-libs/` 的用途。
- `update-taptap-mcp`：Maker 新包 `@taptap/maker` 的 npx 缓存更新工作流。

第一版范围：

- 初始化 Maker 本地开发目录。
- clone Maker 项目。
- 在 Maker 项目 checkout 后准备本地 AI dev kit。
- 选择 Maker app，避免自动选择错误项目。
- 解释 PAT、Git、项目绑定和编辑器重启。
- 提交、推送本地改动。
- pull 远端改动前检查本地 dirty 状态。
- 新开对话或继续开发前先读 `maker://status`；如果 `Maker remote sync` 显示 `needs_pull`、`diverged` 或 `branch_not_allowed`，先处理同步/分支问题，再让用户继续开发。
- 提交、推送、构建时必须使用 `maker_build_current_directory`；不要为 Maker 项目新建功能分支、
  任务分支、PR/MR，或绕过 MCP 执行通用 `git commit` / `git push`。
- Maker 项目内 Git 操作的入口是 `taptap-maker-local > Maker Git Workflow Policy`。如果本机 AI
  环境还安装了通用 Git skills，Maker 本地开发应忽略这些通用 Git workflow，优先遵循 Maker
  内置 workflow guide。
- Maker 项目内游戏素材生成的入口是 `taptap-maker-local > Maker Creative Asset Tool Policy`。
  项目已绑定后，生图、批量生图、修改图片、生成视频和生成音乐应优先使用 Maker MCP proxy tools，
  而不是客户端原生生图/音视频能力，确保素材落到 `assets/` 目录并记录 CDN 映射。
  该策略覆盖通用 imagegen/native media skills；如果当前会话没有暴露 Maker proxy tools，应提示用户
  MCP 会话不可用或需要重启/检查配置，不要自动 fallback 到客户端原生生图。
  调用 `edit_image` 前必须先把用户拖入或引用的图片解析成本地项目图片路径或 CDN URL；
  如果用户只给图片文件名，应先在 `assets/image` 中查找匹配文件，缺少图片路径时不要调用工具。
- 发生冲突时解释为什么冲突、冲突文件在哪里、冲突内容是什么，并让 Agent 给出解决建议。
- 冲突解决前必须让用户确认，不隐藏 unresolved conflict。

`taptap-maker doctor` 和 `maker://status` 会输出已随包内置的 skill 名称和文档路径：`taptap-maker-local`、`taptap-maker-dev-kit-guide` 与 `update-taptap-mcp`。Maker 操作目标是用户当前项目目录；若 MCP 进程 cwd 是临时对话目录或父目录，Agent 应优先检查客户端附加工作目录：只有一个附加目录时直接作为 `target_dir`，多个附加目录时让用户选择哪个是 Maker 项目目录，避免把已绑定项目误判为未绑定。若状态输出 `MCP tool registration cwd` 且 `mcp_cwd_project_dir` 不是当前 `maker_project_dir`，说明当前会话启动 MCP 时的 cwd 错误，proxy tools 可能不会出现在工具列表里；应从 Maker 项目目录启动 AI 客户端，或修正 `taptap-maker` MCP 配置里的 `cwd` 后在 `/mcp` 中 Reconnect，而不是反复普通重启。

已绑定项目还会检查 AI dev kit 状态：`CLAUDE.md`、`examples/`、`templates/`、`urhox-libs/` 缺失时，`taptap-maker dev-kit update` 可以恢复本地 dev kit，并刷新 `.gitignore` 管理块。`maker://status` 和 `maker_status_lite` 也会输出已安装版本、当前环境最新版本和是否需要更新，供新开 AI 对话先发现 dev-kit 过期状态。

注意：MCP tool surface 已经收敛。初始化、PAT、app 列表和 clone 不再作为公开 MCP tools 暴露，避免 Agent 在长对话里把一次性初始化流程拆散。

### AI dev kit 准备

PAT 验证通过、用户选择 app 后，`taptap-maker init` 会先把已选 app 写入
`.maker-mcp/config.json`，再执行 Maker Git checkout。即使 clone/fetch 失败，后续重新执行
`taptap-maker init` 也能复用这次选择继续拉取；`taptap-maker doctor` 会负责识别后续流程是否缺
Git repo、HEAD checkout、dev kit 或 MCP 配置。

Maker Git checkout 完成后，`taptap-maker init` 会自动准备 AI dev kit。这样 dev-kit 生成的本地辅助文件不会在 checkout 前变成未跟踪文件，避免阻塞 clone；checkout 后 dev kit 会覆盖同名本地辅助文件，并通过 `.gitignore` 保持 local-only。`.gitignore` 本身是 Maker 项目必要文件，应提交到 Maker Git。

CLI 会先查询当前环境可用的最新 AI dev kit 版本，并按该版本下载安装包；如果版本检查临时失败，会降级使用内置默认下载地址，避免初始化流程被非关键检查阻塞。如需自定义可通过 `installAiDevKit({ url })` 显式覆盖。

CLI 负责确定性文件处理：

- checkout 成功后解压开发环境文档、引擎 API、demo、Lua 工具和本地 AI skills 到当前目录，dev kit 同名文件会覆盖本地 checkout 内容。
- 即使目标目录已经存在完整 dev kit（`CLAUDE.md`、`examples/`、`templates`、`urhox-libs`），初始化时也会重新下载并解压，确保 dev kit 内容刷新。
- dev kit 准备成功后会记录已安装版本；`taptap-maker doctor` 可显示当前版本、最新版本和是否有更新。
- dev kit 准备失败不会回滚已完成的 Maker 项目 clone；CLI 会返回 `ai_dev_kit_error`，后续可通过 `taptap-maker dev-kit update` 重新恢复。
- 如果目标目录位于外层 Git 仓库下，clone 只把目标目录自身的 `.git` 视为已有 Maker 仓库；父级 Git 仓库不会被复用，也不会被改 remote。
- Windows 原生环境使用 PowerShell `Expand-Archive` 解压；Linux/macOS 先使用 `unzip`，失败时回退到 `python3`/`python` 标准库 `zipfile`。
- 解压复制完成后，如果 dev kit 带有 `tools/install-skills.*`，CLI 会按平台执行
  `install-skills.sh all`（Linux/macOS）或 `install-skills.ps1 all`（Windows），把
  `skills/` 安装到 `.claude/skills/`、`.codex/skills/`、`.cursor/skills/` 和
  `.gemini/skills/`。
- skill 安装脚本开始执行时，普通 CLI 输出会追加 `AI skills install started:
  <script>`；安装结束后会追加 `AI skills install result: claude=N, codex=N,
  cursor=N, gemini=N`。如果目标目录已经存在完整 dev kit，checkout 后也会重新执行
  skill 安装脚本并输出结果，避免用户无法判断本地 skill 是否刷新。
- JSON 输出会在 `data.skillInstaller` 中包含脚本路径、stdout、stderr 和摘要；脚本缺失或
  被跳过时也会返回跳过原因。
- 如果 skill 安装脚本失败，CLI 会在错误里输出平台、脚本路径、工作目录、命令、退出码、
  stdout 和 stderr，方便 Agent 与用户直接看到失败原因。
- `maker://status` 和 `maker_status_lite` 会输出 `skill_install_status` 与
  `skill_install_summary`，用于检查 `.claude/.codex/.cursor/.gemini` 下的 skill 安装状态。
- 跳过 ZIP 顶层 `scripts` 目录，避免和 Maker 项目 clone 后的 `scripts` 冲突。
- 删除下载完成并解压后的 `ai-dev-kit.zip`。
- dev-kit 准备成功后会刷新项目根 `.gitignore`，把 dev-kit 顶层内容、Agent skill 发现目录和
  `.maker/` 本地运行状态标记为忽略项。`.gitignore` 文件本身是 Maker 项目必要文件，
  应提交到 Maker Git，尤其是首次 init 生成时。

如果 clone 失败，CLI 会保留 `.maker-mcp/config.json` 中的已选 app。后续重新执行
`taptap-maker init` 时，如果用户没有重新传 `--app-id`，CLI 会复用这个项目选择继续拉取；如果显式传入不同 app，会拒绝覆盖已有绑定，要求换目录。失败输出会返回 `partial_state`，说明目标目录是否已经初始化 `.git`、是否已经绑定 `.maker-mcp/config.json`、dev kit 是否已落盘、以及是否可以直接重试。skill 负责把这些状态解释给用户；不要自动删除半初始化文件。对新手用户，连续失败时优先建议换一个全新的独立目录重新 clone。

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

- `taptap-maker init` 会通过 Git `--progress` 强制输出 clone/fetch 进度，并解析
  stderr 中的百分比进度。
- 首次拉取默认使用浅拉取。`taptap-maker init` 在记录已选 app 后，通常执行
  `git init` + `git fetch --depth=1 origin`，再 checkout 远端默认分支，避免大项目在慢网环境下载完整历史。
- 首次 clone/fetch 前会明确提示用户：Maker server 可能正在准备仓库，首次拉代码 20 秒以上是正常现象，请保持当前命令运行。
- `taptap-maker init` 会根据 Git stderr 判断是否自动重试：HTTP 5xx、503、超时、连接重置、HTTP2/RPC 中断、early EOF 等远端临时错误会在 fetch 阶段重试；认证失败、权限不足、仓库不存在、远端拒绝、非空目录冲突、本地权限错误不会重试。
- 首次 clone/fetch 默认最多自动重试 2 次；连续重试后仍失败时，错误会保留 `retryable`、`retry_reason` 和已重试次数，方便 Agent 判断是让用户稍后直接重试，还是先处理 PAT、权限或本地目录问题。
- `maker_build_current_directory` 会在本地 commit、push 和远端 build 阶段输出状态，并解析 Git push stderr 中的百分比进度。
- `maker_build_current_directory` 的 push 阶段也会对远端临时错误自动重试；push 最终失败时不会继续远端 build。
- `maker_build_current_directory` 会转发远端 build tool 的 progress notification。
- `taptap-maker logs watch` 承载运行时日志轮询，不作为本地公开 MCP tool 暴露：默认每 5 秒调用一次远端
  `query_runtime_logs`，固定只拉 `engine`、`user_script` 和 `server_user_script`。远端返回
  `hasMore=true` 且游标/写入有进展时会立即继续拉取下一页；如果没有进展，会按轮询间隔睡眠，避免热循环。
  连续 10 分钟没有写入新日志时，watcher 会自动退出，避免构建后残留的 Node 进程长期空轮询。
  默认遇到临时错误会持续重试并写 watcher 输出；只有显式传 `--max-consecutive-failures` 时才会达到阈值后退出。
- watcher 会维护 `.maker/logs/runtime/watcher.pid`。同一项目启动新 watcher 前会停止旧 watcher，
  避免多个进程同时写同一个 `runtime.log`。
- 本地游标会防御 server cursor 落后：如果远端返回的 `nextStartTime` 小于本页最大日志时间，
  本地会推进到 `max(log.t)+1`。本地日志写入不做内容去重，server 返回什么就按顺序追加什么。
- `.maker/logs/runtime/state.json` 会记录 watcher 心跳字段：`lastPollAt`、`lastSuccessAt`、
  `lastWrittenLogs`、`consecutiveFailures` 和 `lastError`，方便判断 watcher 是正常空轮询还是持续失败。
- 以上慢操作最终返回都会包含 `elapsed_ms`、`elapsed`、`progress_events` 和 `last_progress`。如果没有可用百分比进度，则至少返回耗时统计；长任务运行超过 3 分钟时会发送一次仍在运行的 progress heartbeat。

## 当前 PAT 获取方式

Maker 本地开发默认使用 CLI 登录流程，不再要求用户自行创建并复制 PAT：

```text
1. CLI 生成临时 code，按需打开当前环境的 `/pat-tokens?code=<code>`。
2. 用户在网页里完成登录并点击“创建 token”。
3. CLI 轮询 `/api/v1/cli-auth/result?code=<code>`。
4. 服务端返回授权结果后，CLI 完成本地鉴权配置，并调用 `GET /api/v1/user/taptap-token`
   准备后续 MCP/Git 操作所需的 TapTap token。
5. 后续 `taptap-maker apps`、`taptap-maker init`、`maker_build_current_directory`
   默认复用当前环境的本地鉴权状态。
```

命令入口：

```text
taptap-maker login
taptap-maker init       # 缺 PAT 时自动进入 CLI 登录
taptap-maker pat set    # 无参数时也走 CLI 登录
```

如果本地鉴权过期或不可用，Agent 应提示用户运行 `taptap-maker login` 重新完成 CLI 登录。
兼容写法 `taptap-maker pat set <PAT>`、`--pat PAT` 和 `--pat-stdin` 仍可用于 CI 或
服务端接口联调，但不作为普通用户默认流程。

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

- 写入 MCP 配置时，Windows 下通过 `cmd.exe /d /s /c npx.cmd ...` 启动，避免部分客户端
  无 shell 直接 `spawn` `.cmd` 时返回 `EINVAL`。
- `taptap-maker init` 会把已选择的 Maker 项目目录写入支持 `cwd` 的 MCP 配置；单独运行
  `taptap-maker mcp install --target-dir <PROJECT_DIR>` 时也会写入该目录，避免 AI 客户端从父目录
  启动 MCP 导致 proxy tools 未注册。
- `taptap-maker mcp verify` 的 `status: null` 会被解释为本地 Node/npm/npx 启动验证失败，并输出 `failure_type`、原始 command 和下一步排查命令；这发生在 Maker MCP server 启动前。
- `taptap-maker mcp install` 会逐 IDE 返回成功或失败；某个客户端配置写入失败不会阻塞其他客户端继续尝试。
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
- 普通构建必须先 push 到 Maker 远端再 build；如果本地没有改动且没有 ahead commit，会创建
  `chore: wake maker build server` 空提交并 push，用于唤醒可能已挂起或销毁的远端服务。
- 如果本地有改动或已经有本地 commit 未 push，默认先 commit/push，再远端 build。
- 用户说“提交 / push / 构建 / 查看结果 / 预览 / 跑一下 / 验证一下 / 看看效果”时，都使用同一个工具。
- 用户明确说“不提交 / 直接构建 / 构建云端版本”时，才允许传 `confirm_remote_build_without_submit=true`，
  这会只构建 Maker 远端已提交版本；工具会先打开 Maker 远端页面，并在结果里返回 `maker_page_url`，
  如果浏览器没有自动弹出，Agent 应把这个链接发给用户让其手动打开。
- push 被远端拒绝、认证失败、远端有新提交或发生冲突时，工具返回 `mode: submit_failed_before_build`，不会继续远端 build。Agent 应解释 push 失败原因，按 `classification` 使用对应恢复策略，再重试同一个构建工具。
- 如果 push 成功但远端 build 失败，工具返回 `mode: build_failed_after_submit`，同时保留成功的提交/推送结果和构建错误。
- 如果 build 成功，工具会启动本地 CLI watcher 并在返回里带出
  `runtime_logs.watch_started/watch_pid/watch_command/local_file/state_file`；MCP tool 不会长时间阻塞等待轮询。
  后续运行时诊断应优先读取 `runtime_logs.local_file`，watcher 健康状态读取
  `runtime_logs.state_file`。

远端 proxy 配置默认是 Maker 本地 MCP 的内部能力，不作为普通 Agent tool 全量暴露。
当前只把 `generate_image`、`batch_generate_images`、`edit_image`、`create_video_task` 和
`text_to_music` 作为白名单公开；本地 MCP 为这些白名单 tools 静态注册 description 和
input schema，保证 MCP 启动和 `tools/list` 不连接远端 Maker proxy。实际调用时才启动 proxy、
连接远端 server，并继续沿用远端返回值。内部配置内容等价于测试脚本中的：

本地 Maker MCP 会对生成类 tools 做客户端素材落地，并把本地生成素材到 CDN URL 的映射记录到
`.maker/assets/generated-assets.json`。`generate_image`、`batch_generate_images` 和
`edit_image` 的成功图片会下载到 `assets/image/`，`create_video_task` 的成功视频会下载到
`assets/video/`，`text_to_music` 的成功音频会下载到 `assets/audio/`。`edit_image` 和
`create_video_task` 调用前会基于映射，把本地新生成素材路径改写为 CDN URL。
对于 `edit_image`，AI/Agent 调用前应先解析用户提供的图片：拖入/附件图片优先取客户端暴露的本地
文件路径，`assets/image/...` 直接传项目素材路径，只给文件名时先搜索 `assets/image`，无法确认图片
路径或 CDN URL 时应停下来说明缺少参数。

已绑定 Maker 项目里，AI/Agent 应优先使用这些 Maker MCP proxy tools 生成或修改游戏素材，不应优先
调用客户端自带的生图、生视频或音频生成能力。
如果当前会话没有暴露这些 Maker proxy tools，AI/Agent 应停止并说明工具未暴露，不应自动切到通用
imagegen 或客户端原生媒体生成能力；如果 tools 可见但调用失败，应优先检查 Maker 项目绑定、
MCP server cwd、PAT/TapTap token 和远端 proxy 状态。
`maker_status_lite` 会主动检查 Maker proxy tools 状态；如果 proxy 连接失败，状态中会明确提示
远端 proxy tools 与 build 构建都不可用。用户明确调用 proxy tool 或 build 时，MCP 对连接/握手类
失败默认最多尝试 5 次，每次失败后间隔 30 秒再试；不会无限重试，也不会对远端已返回的业务失败
盲目重复提交。

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
- push 被远端拒绝或出现冲突时，不自动建分支；只有 `remote_rejected` 表示远端已有新提交时，才询问用户是否先 pull/rebase 当前 Maker 远端变更。
- 如果失败是 `branch_not_allowed`，说明 Maker 远端只接受 main 分支。不要 pull/rebase、不要新建分支、不要手动 git push；保留本地 commit，切回 main（必要时从 origin/main 创建），把本地 commit cherry-pick 到 main 后重试 `maker_build_current_directory`。
- 如果失败是 `forbidden_path`，说明本地 commit 包含 Maker 远端 pre-receive hook 禁止提交的路径或目录。不要刷新 PAT；读取 `stderr` 里的 forbidden pattern，保留工作区文件，把这些路径从未推送 commit 中移除，确认 `git status` 不再包含这些路径后重试。
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

Maker 后端默认地址集中在 `src/maker/config.ts`。兼容旧变量名：`MAKER_API_BASE`、
`MAKER_PAT_URL`、`MAKER_TAP_TOKEN_URL`、`MAKER_GIT_BASE`、
`TAPTAP_REMOTE_MCP_SERVER_URL`、`MAKER_WEB_URL`。新配置优先使用 `TAPTAP_MAKER_*`
前缀。`TAPTAP_MAKER_REMOTE_MCP_SERVER_URL` 可覆盖当前环境的远端 Maker MCP server URL。

## CLI 登录联调

测试时优先运行 CLI 登录：

```text
taptap-maker login
taptap-maker apps
taptap-maker init
```

CLI 会按需打开当前环境的 `/pat-tokens?code=<code>`，并轮询
`/api/v1/cli-auth/result?code=<code>`。
兼容入口 `taptap-maker pat set --pat-stdin`、`taptap-maker pat set <PAT>` 和 `--pat PAT`
仅用于 CI 或应急联调；普通本地流程不要引导用户手动复制 PAT。
APP_ID 不应要求用户手动输入，而是通过 `taptap-maker init` 或 `taptap-maker apps` 返回的
app 预览让用户选择。

CLI app 列表行为：账号 app 很多时，文本输出默认按最近活跃排序展示前 40 个和总数。
`taptap-maker init` 交互中输入 `all` 一次性展开全部 app 再选择；命令行单独查看时使用
`taptap-maker apps --all` 直接列出全部。普通文本列表只展示名称、id 和最后活跃时间，
便于人类阅读；完整机器可读字段使用 `taptap-maker apps --json`，给 AI / 脚本解析。

MCP status 行为：`maker://status` 和 `maker_status_lite` 的 app 预览默认最多展示 40 个 app；
超过 40 个时提示用户可以选择显示全部，并引导运行 `taptap-maker apps --json` 查看全部 app；
40 个以内直接显示全部。

如果当前目录已经绑定 Maker 项目，app 列表只用于确认账号下有哪些项目；继续在当前绑定项目上提交、构建或检查状态，不要要求用户重新选择 clone。

clone/push 默认会按 `TAPTAP_MCP_ENV` 读取 `src/maker/config.ts` 中对应环境的配置。需要临时覆盖时可设置：

```text
TAPTAP_MAKER_API_BASE=<maker-api-base-url>
TAPTAP_MAKER_PAT_URL=<maker-pat-url>
TAPTAP_MAKER_TAP_TOKEN_URL=<maker-taptap-token-url>
TAPTAP_MAKER_GIT_BASE=<maker-git-base-url>
```

兼容写法 `taptap-maker pat set <PAT>` 和 `--pat PAT` 仍可用，但 PAT 会出现在
`ps` 进程列表、shell history 或进程审计日志中；仅在确认风险的自动化场景使用。

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
- 运行时日志不作为本地公开 MCP tool 暴露；持续获取日志的循环、日志清理和错误分析流程使用
  `taptap-maker logs watch --reset --interval 5s` 与 skill 编排。
- 云端 SCE MCP proxy 转发仍需要本地已有 Tap auth；后续可接入 PAT 换 Tap token 的后端接口。
