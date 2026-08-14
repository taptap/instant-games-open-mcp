# TapTap Maker MCP 本地连接自检与修复指引

适用于以下现象：

- AI 客户端提示 `-32000`、`Connection closed`、`command not found` 或启动后立即退出。
- 当前对话没有 `maker_status_lite`、`maker_build_current_directory` 等 Maker tools。
- 同一项目之前可用，重启客户端、新开对话或多开对话后失效。
- 普通终端可以运行 Maker CLI，但 Codex、WorkBuddy 等客户端无法启动 MCP。

`Connection closed` 只说明 MCP server 子进程已经退出。它不能直接证明 PAT、远端服务、项目绑定
或中文项目路径有问题。MCP 尚未连接时，初始自检必须依赖本地文件、shell 命令和客户端日志，
不能依赖 Maker MCP tools。

## 1. 先保存现场

在修改前记录并备份：

- AI 客户端名称、版本、安装路径和当前 workspace。
- 客户端实际读取的 MCP 配置文件。
- `taptap-maker` 的原始 `command`、`args`、`cwd` 和环境变量。
- MCP 启动日志、完整 stderr、退出码或 signal。
- 当前对话与新对话是否都缺少 Maker tools。

不要自动修改 trust storage、PATH、cwd、凭证或游戏业务代码，不要编辑猜测出来的配置副本。
保存日志和配置时，凭证值必须脱敏，包括 PAT、token、Authorization、Cookie 和其它密钥；错误结构、
字段名、路径、参数顺序、退出状态和脱敏后的 stderr 应保留完整。

## 2. 报错时运行标准 launcher/CLI 检查

只要 Maker tools 缺失，出现 `-32000`、`Connection closed`、`command not found` 或进程启动后立即
退出，用户 AI 都应尝试运行以下只读命令。命令自身失败也是诊断证据，必须记录，不能因此跳过。

```bash
taptap-maker mcp verify --json
```

`mcp verify --json` 默认验证安装器物化到 Maker 用户目录的稳定 self runtime（stable self runtime），完成 MCP
`initialize` 和 `tools/list`，并返回 launcher_kind、command、stage、tools、stderr、error 和
failure_type。失败时命令退出码非零。它证明本机最终启动命令和 stdio MCP 通路可用，但不会读取
客户端实际生效的配置，也不能检查任意客户端 trust、客户端配置缓存或 MCP Roots。
只有明确检查 npm 启动链路时才追加 `--mode npx`；发布包会固定当前精确版本并使用专用可写 cache。
如果当前 shell 找不到 `taptap-maker`，优先复用客户端配置中的绝对 command/args；最后才用当前
精确版本的 npx 命令启动 CLI，禁止省略版本落到 npm `latest`。

因此，无论该命令成功还是失败，后续都必须先确认当前客户端，再检查并复现该客户端真实使用的
config path、command、有序 args、cwd、workspace/Roots、Node/npm/npx 路径、client PATH、退出状态
和 stderr。WorkBuddy enable/trust 只适用于已确认的 WorkBuddy 客户端。

### MCP 已连接但 tool/resource 调用失败

如果 `tools/list` 或其它 Maker MCP 调用已经成功，但某个 tool/resource 调用失败（包括客户端显示
`-32003`），说明当前会话已经建立连接。不要给 `-32003` 假定固定含义，也不要直接套用启动失败结论；
应保留客户端返回的原始错误 code、message 和 data，按实际证据分类。

对于已经连接的会话，`mcp verify` 不是首要检查。它只验证本地 launcher 和 stdio MCP 通路，不能解释单次
tool/resource 调用中的请求校验、项目上下文、远端响应或业务错误。用户 AI 应先保存以下证据：

远端 Maker 构建中的 Lua/LSP 编译错误是工具级业务失败。代理会把带 `error.data.remote_result` 的
上游 MCP 协议异常转换成 `CallToolResult.isError: true`，原始编译诊断放在 `content` 和
`remote_result` 中；这类错误不应触发重连，也不应被“TapTap MCP Server is currently unavailable”
替换。Maker 本地重试器也会根据 `error.data.remote_result` 和 MCP 错误码跳过业务错误重试，避免
同一次构建被重复提交。明确的 proxy unavailable、连接断开、会话失效、请求超时或 HTTP 5xx 才按
重试策略处理；pending 请求重放期间再次断线时，未完成队列会保留到下一轮退避重连。

- 失败的 tool/resource 名称，以及可稳定复现的操作步骤。
- 完整但已脱敏的请求参数；保留字段名、类型和结构，不保留 PAT、token、Authorization、Cookie、
  secret 或其它凭证值。
- 当前会话的 `tools/list`，用于确认失败能力是否实际注册，以及 schema 是否与请求一致。
- 原始 error code、message、完整 data，以及完整、已脱敏的 `remote_result`；不要删掉嵌套错误、
  warning、debug 或远端状态字段。
- request ID、correlation ID、trace ID 等关联标识；不存在时记录 `unknown`。
- 错误发生时间（含时区）、操作系统与架构、AI 客户端名称和版本、`@taptap/maker` 包版本。

先用相同脱敏参数稳定复现一次，再判断是 schema/参数错误、项目上下文错误、客户端转发错误、远端
业务错误还是临时服务错误。不要因为 MCP 已连接后的单次调用失败就重写 command、cwd、PATH、信任
状态或用户项目代码。只有证据同时显示启动链路也异常时，才回到本指南的离线启动检查流程。

## 3. 找到实际生效的 MCP 配置

常见位置：

- Codex：`~/.codex/config.toml`
- Cursor：`~/.cursor/mcp.json`
- Claude Code：用户级 Claude 配置或 `claude mcp` 管理的配置
- WorkBuddy：`~/.workbuddy/mcp.json`
- WorkBuddy 旧配置仅作为兼容检查：`~/.workbuddy/.mcp.json`
- DeepSeek Harness（DSH）：`$DSH_HOME/cordis.patch.yml`，默认
  `~/.dsh/cordis.patch.yml`；手工 profile 配置还可能位于
  `~/.dsh/profiles/<profile>/cordis.yml` 或 `cordis.patch.yml`

Windows 中 `~` 对应 `%USERPROFILE%`。

多开 AI 对话不会隔离用户级 MCP 配置。某个对话如果修改了共享配置中的 command、args 或 cwd，
其它对话在重连或重启后也会失效。应比较配置备份和最近修改时间，确认是否被其它对话重写。

DSH 不使用 `mcpServers` JSON。运行 `taptap-maker install` 会自动检测 DSH，并按插件 id 合并用户级
YAML 补丁，DSH 通过 HMR 热重载，无需重启 IDE。Maker 插件项应使用
`@deepseek-ai/dsh-mcp-client`、`transport: stdio`、`failOnStartupError: true` 和
`toolCallTimeoutMs: 3600000`。DSH 当前不广播 MCP Roots，不能把固定项目目录写入该用户级配置；
Agent 应在每个项目相关 Maker tool 调用中显式传入真实游戏目录 `target_dir`。
首次新增 plugin row 必须放在顶层 `insert` 操作内；裸的顶层 `id: mcp-taptap-maker` 只能覆盖
已经由更低层插入的同 id row，在空根上会被跳过。应优先重新运行安装器修复，不要手工复制普通
`mcpServers` JSON。若安装器发现现有 profile 级 Maker registration，会就地更新对应 profile
patch，避免再写一个全局重复 `serverName`。

## 4. 当前客户端与 WorkBuddy 专属检查

先根据当前客户端的真实配置、启动日志或 MCP `initialize` 信息确认客户端类型。
不要因为本机存在 `.workbuddy` 就判断当前请求经过 WorkBuddy。

只有确认当前客户端是 WorkBuddy 时，才检查以下启用和信任状态。

WorkBuddy 需要同时满足：

- `~/.workbuddy/mcp.json` 中存在 `taptap-maker`，并且 `disabled` 为 `false`。
- 当前账号已经在 WorkBuddy MCP 设置中启用并信任 `taptap-maker`。

账号状态存放在：

```text
~/.workbuddy/connectors/<account-id>/connector-states.json
```

AI 只读取该文件用于诊断，不自动修改账号信任状态。未信任时，应让用户在 WorkBuddy MCP 设置中
手动启用并信任，然后 reconnect 或重启 WorkBuddy。

## 5. 检查标准启动命令

Windows 通用 `mcpServers` 配置应使用安装器探测并验证后的独立 command 和 args。默认形式是：

```text
command: <绝对 node.exe>
args: ["%USERPROFILE%\\.taptap-maker\\mcp-runtime\\<exact-version>\\dist\\maker.js"]
```

该路径由安装器创建，不能手工指向 `_npx` 临时缓存。显式 `--launcher npx` 才使用绝对
`node.exe` + `npm-cli.js`，固定当前精确版本并设置专用 npm cache。安装器不会把 `cmd.exe` 或
`.cmd` launcher 持久化到客户端配置。

macOS/Linux：

```text
command: npx
args: ["-y", "-p", "@taptap/maker@<exact-version>", "taptap-maker"]
```

上面的 macOS/Linux npx 形式只是显式兼容模式；默认同样是绝对 Node + 版本化 self runtime。

不要把 command、项目路径和参数拼成一个长字符串，尤其不要使用：

```text
cd /d "<Maker项目路径>" && npx.cmd ...
```

Maker 支持中文项目路径；但 Windows `cmd.exe`、客户端参数转义、编码和 argv 直传可能让上述
`cd &&` 形式以 rc=1 退出或产生乱码。这是启动命令问题，不代表 Maker 不支持中文路径。

Windows 8.3 短路径名称可能未启用，不能把短路径当作默认兜底。只有在同一台机器、同一磁盘卷上
验证后才能把结果作为诊断证据；如果 `%~sI` 返回原始长路径、空值或仍含原始路径特征，说明没有可用
的短路径别名，不要继续把它拼进 MCP 启动命令。

## 6. 检查 Node、npm、npx 和客户端 PATH

默认 self launcher 只要求配置中的绝对 Node 和版本化 Maker bundle 可用。以下 npm/npx 检查只在
客户端仍使用旧 npx 配置，或用户显式选择 `--launcher npx` 时是必需项。

Windows 普通终端：

```bat
where.exe node
where.exe npm
where.exe npx
node --version
npm --version
npx --version
```

macOS/Linux 普通终端：

```bash
command -v node
command -v npm
command -v npx
type -a node npm npx
node --version
npm --version
npx --version
```

如果普通终端找不到 `npx`，可先运行 `taptap-maker mcp install --launcher self`
迁移到默认 launcher；只有必须使用 npx 时才修复或安装受支持的 Node.js/npm。

DSH 应直接使用 `taptap-maker install` 自动生成的绝对 Node + self runtime 插件项。
不要把手工 `npx` 示例当作长期配置；DSH 的 Agent 沙箱可能禁止 npx 冷启动写入默认 npm cache。
如果 DSH 中工具调用总在约 60 秒失败，先确认实际生效的插件项包含
`toolCallTimeoutMs: 3600000`，再区分客户端超时和 Maker server 返回的业务错误。

如果普通终端能找到 `npx`，但 AI 客户端或其内置终端提示 `command not found`，根因通常是客户端
进程没有继承相同的 PATH。继续比较客户端进程环境与普通登录 shell；macOS 可额外检查：

```bash
/bin/zsh -lic 'command -v node; command -v npm; command -v npx; printf "%s\n" "$PATH"'
```

对于 nvm、fnm、Volta、asdf、Homebrew 等安装方式，应先确认实际路径仍有效。不要未经验证就把
带版本号的临时绝对路径写入共享 MCP 配置；优先让客户端从正确的启动环境继承 PATH，并在修复后
用同一客户端启动方式复测。

若 stderr 同时出现 EPERM/EACCES、root-owned files 或 cache 不可写，`mcp verify` 会返回
`failure_type: npm_environment_error`。这通常是沙箱或 npm cache 路径不可写，不应仅凭 npm 的
通用提示执行 `chown ~/.npm`；优先迁移到 self launcher，或给 npx 模式提供明确可写的 cache。

## 7. 检查 cwd、workspace 和 MCP Roots

先确认用户本地项目目录存在 `.maker-mcp/config.json`，并记录客户端当前打开的 workspace。

- 支持 MCP Roots 的客户端应只打开当前 Maker 项目，使用 workspace root 识别项目。
- 不支持 MCP Roots 的客户端应由 Agent 在具体 Maker tool 调用中传入项目绝对路径作为
  `target_dir`，不要把项目路径写入用户级 MCP 配置。
- 当最终 cwd fallback 中找不到 `.maker-mcp/config.json` 时，Maker MCP 不会阻断 server 启动或
  隐藏 tools；项目相关 proxy tool 会返回 `evaluated_target_dir` 和 `project_context_source` 后
  快速失败。看到 `/tmp`、会话目录或其它项目路径时，应修正 workspace/Roots 或在该次调用显式传
  `target_dir`，不要把其它目录的 `not_initialized` 当成真实项目结论。
- 某些 WorkBuddy 版本不会把当前 workspace 暴露为 MCP Roots。此时仍禁止使用 `cd && npx`
  补丁；应恢复不含项目 `cwd` 的标准启动配置、只打开正确项目 workspace，并收集 WorkBuddy
  的实际进程 cwd 和启动日志作为诊断信息，不能依赖反复重写配置来切换项目。
- 本地配置中的项目 id 与当前项目不一致时，先检查客户端启动目录和实际读取的配置，不要重新绑定
  或覆盖用户项目。

MCP 恢复连接后，再调用 `maker_status_lite` 验证 `project_context_source`、`cwd_mismatch` 和
Maker tools 列表。当前 Maker MCP 会在解析 cwd、项目和鉴权之前，根据版本化本地完整定义注册白名单 proxy tools；
`target_dir` 只决定调用时的项目上下文，不负责动态补注册。若当前会话仍缺 proxy tools，应比较
活动会话和 `mcp verify` 的包版本及 `tools/list`，按旧包或客户端缓存排查。

## 8. 复现客户端真实启动配置

使用实际生效配置中的相同 command、有序 args 和 cwd 执行只读启动检查，并保存退出码、signal、
spawn error、stdout 和完整 stderr。不要用第 2 节的标准命令代替这一步；两者比较后才能区分标准
npx/CLI 启动链路故障和客户端真实配置故障。

Windows 复现应尽量使用与 MCP 客户端相同的 argv 直传边界。通过 Bash、PowerShell 或其它外层
shell 再包一层 `cmd.exe` 时，外层 shell 的引号或转义失败必须单独记录，不能替代 MCP 子进程的真实
退出结果。同样，stderr 解码失败只说明当前读取方式或代码页不匹配；应分别记录子进程退出码、原始
stderr、尝试的编码和解码错误，不能把解码异常直接当成 Maker MCP server 的错误。

例如，配置使用 Windows 绝对 Node/npm CLI 时，按相同顺序复现：

```bat
"<绝对 node.exe>" "<绝对 npm-cli.js>" exec --yes --package @taptap/maker@<exact-version> -- taptap-maker
```

然后用该 CLI 执行 `mcp verify --json`；不要只用 `help` 代替 MCP 协议握手。

配置使用 macOS/Linux 标准 argv 时：

```bash
npx -y -p @taptap/maker@<exact-version> taptap-maker help
```

如果终端成功而客户端失败，应继续排查客户端读取的配置、信任状态、PATH、cwd 和子进程启动方式，
不要归因于远端 Maker 服务。

## 9. 按证据分类后修复

先按证据分类根因，再由用户 AI 只修改已确认有问题的项目：

- MCP 启动命令或参数错误。
- Node/npm/npx 缺失，或客户端 PATH 不完整。
- 客户端读取了错误的配置文件。
- WorkBuddy 未启用或未信任 MCP。
- 客户端未暴露 MCP Roots，且调用未传 `target_dir`。
- 多个 AI 对话修改了共享 MCP 配置。
- IDE 安装路径、shell 转义或编码导致子进程启动失败。
- MCP server 启动后的真实业务错误。

不要无条件重装或覆盖 MCP 配置。仅在证据确认实际配置项损坏时，才可把官方 CLI 重新生成标准配置
作为可选恢复方式，并先备份实际生效的配置：

```bash
npx -y -p @taptap/maker@<exact-version> taptap-maker mcp install --launcher self
```

Windows 如无法从 PATH 运行上述恢复命令，应使用当前可用 npm 的绝对路径启动这一次 CLI；安装器
默认会把验证过的绝对 Node 和版本化 self runtime 写入配置。只有显式 `--launcher npx` 才持久化
绝对 Node/npm launcher。客户端不支持 MCP Roots 时，不要给安装命令追加项目目录；应让 Agent 在
具体 Maker tool 调用中传入 `target_dir`。

不要让多个 AI 对话同时修改共享 MCP 配置。配置恢复后，在客户端 MCP 设置中 reconnect；必要时完全
退出并重启客户端，再新开一个对话。

## 10. 恢复后的验证

连接恢复后分别在当前对话和新对话中调用 `maker_status_lite`，确认：

- MCP 可以稳定连接。
- `project_context_source` 指向 workspace root 或正确 Maker 项目。
- 没有 `cwd_mismatch`。
- 预期的 Maker tools 已注册。
- WorkBuddy 中 `taptap-maker` 仍处于启用和信任状态。

## 11. 用户同意后的 GitHub Issue 上报

当证据指向 Maker MCP、proxy、客户端集成或服务端基础设施异常时，AI 应主动询问用户是否允许把
已脱敏诊断提交到官方 GitHub Issue。适合上报的现象包括启动/连接失败、tools 异常缺失、请求超时、
反复重连失败、HTTP 5xx/unavailable 和未分类内部错误。普通参数错误、已有明确恢复路径的登录问题、
项目文件缺失、用户取消、Lua 编译和业务校验错误不应提示上报。

同一种故障按失败操作、错误码和稳定错误信息形成指纹；当前会话只询问一次。用户拒绝后不再针对该
指纹打扰。用户明确同意后无需第二次确认，AI 将已脱敏的当前会话错误 JSON 通过 stdin 传入：

```text
npx -y --package @taptap/maker@<exact-version> taptap-maker mcp report --ide <client> --target-dir <project> --context-stdin --consent --json
```

优先原样复用当前客户端 Maker MCP 配置中的 command 和有序 args，再追加上述 `mcp report`
参数。示例 npx 命令只在已确认当前精确版本时使用，禁止省略版本误启 npm `latest`；Windows
找不到 `npx` 时使用配置中的绝对 `node.exe` 和 `npm-cli.js` argv。

CLI 会读取当前客户端的 `taptap-maker` 配置项、执行有短超时保护的 launcher
`initialize`/`tools/list` 验证、记录当前 cwd 和绑定项目状态，再生成 Issue 标题与 Markdown 正文。
不会上传其它 MCP server、完整聊天、项目源码、PAT/token、完整环境变量或 project/user ID；用户
主目录统一替换为 `~`。错误、`remote_result` 和请求参数保留非敏感结构，方便服务端按
request/correlation ID 继续定位。

成功时返回 `created` 和 Issue URL。GitHub CLI 不存在、未登录、网络不可达、超时或提交失败时返回
`manual_required`、脱敏标题/正文和手动 Issue 地址，命令仍成功结束；AI 应明显告知用户没有自动
提交，并展示可复制报告，然后继续原排障或开发任务。不带 `--consent` 时返回
`consent_required`，只生成报告，不发起 GitHub 写操作。

## 12. 诊断报告模板

用户 AI 应尽量完整填写以下模板。未获取到的字段写 `unknown`，不要猜测；args 必须保持原始顺序，
凭证值必须脱敏。

```text
client:
config_path:
command:
args:
cwd:
node_path:
npm_path:
npx_path:
client_PATH:
exit_status:
signal:
spawn_error:
wrapper_error:
stdout:
stderr:
stderr_encoding:
occurred_at:
os_arch:
client_version:
maker_package_version:
failed_operation:
redacted_request_params:
tools_list:
error_code:
error_message:
error_data:
remote_result:
request_or_correlation_id:
reproduction_steps:
workbuddy_trust:
workspace_roots:
classification:
evidence:
repair:
verification:
```

启动失败时，`evidence` 应包含标准 `mcp verify --json` 结果和客户端真实配置复现结果。MCP 已连接但
调用失败时，优先填写运行期错误字段，不要求把 `mcp verify` 当作首要证据。`repair` 只记录基于证据
采取的修改；`verification` 记录重连或稳定复现后的结果。`redacted_request_params`、`error_data` 和
`remote_result` 中的凭证值必须脱敏，同时保留排障所需的完整结构和非敏感内容。
