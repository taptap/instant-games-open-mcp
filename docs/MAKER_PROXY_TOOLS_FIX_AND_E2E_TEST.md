# Maker Proxy Tools 修复说明与真实用户验收

## 1. 修复概述

分支：`fix/maker-static-proxy-schema`

提交：`652dc1a fix(maker): 固化 Proxy 工具定义并校验远端契约`

### 原问题

- Proxy tools 依赖 MCP 启动目录、项目绑定和远端连接结果动态注册。
- MCP 从未绑定目录启动时，客户端通常只能看到 2 个本地工具。
- 用户随后绑定或指定 Maker 项目，即使远端连接成功，当前会话的工具列表也不会更新，
  经常需要重启会话。
- 本地工具 schema 可能落后于远端，导致新参数缺失或旧参数继续暴露。

### 修复方案

- MCP 启动时固定注册 2 个本地工具和 16 个白名单 Proxy tools。
- `tools/list` 不再依赖 cwd、项目绑定、PAT 或远端连接。
- 项目上下文、鉴权和远端连接延迟到工具实际调用时解析。
- 使用版本化快照保存远端 input schema，同时保留审核后的本地工具说明。
- 增加实时 schema 检查和更新命令：

```bash
npm run maker:proxy-schema:check -- --target-dir <BOUND_MAKER_PROJECT>
npm run maker:proxy-schema:update -- --target-dir <BOUND_MAKER_PROJECT>
```

### 本次同步的远端参数

- 图片生成增加 `quality`。
- 3D 生成增加 `payload.subject_type`。
- 视频模型更新为 Seedance `2.0`、`2.5`。
- 视频分辨率更新为 `480p`、`720p`。
- 移除已经废弃的视频 `seed` 参数。

### 能力边界

- 本次确定修复工具不可见，以及绑定项目后必须重启才能获得工具的问题。
- 本次没有修改远端 Proxy Manager 的连接重试实现。
- 工具可见但调用失败时，仍需区分 PAT、TapTap token、网络、远端服务和传输断线。
- MCP 包版本或静态 schema 更新后，客户端仍需重连一次以加载新版本。
- 上述重连只属于“加载新版本”；绑定或切换 Maker 项目走 MCP Roots 或逐次传入
  `target_dir`，不改写用户级 MCP 配置，也不要求重启或新开会话。

## 2. 真实用户验收

先定义测试对象。路径应替换为测试电脑上的真实绝对路径；Windows 建议使用包含空格和中文的
项目目录，以同时覆盖常见路径边界：

```text
MCP_REPO=<MCP 源码仓库绝对路径>
MAKER_ENTRY=<MCP_REPO>/dist/maker.js
MAKER_PROJECT=<已绑定 Maker 项目绝对路径>
```

Windows 示例：

```text
MCP_REPO=D:\Maker MCP\taptap_minigame_open_mcp_2
MAKER_ENTRY=D:\Maker MCP\taptap_minigame_open_mcp_2\dist\maker.js
MAKER_PROJECT=D:\Maker 游戏\宝石排序测试
```

在 PowerShell 中验证编译产物时，使用调用运算符和独立参数，不要拼接 `cd &&`：

```powershell
Set-Location "<MCP_REPO>"
npm run build
& "<绝对 node.exe>" "<MAKER_ENTRY>" mcp verify --mode self --json
```

Codex MCP 配置同样必须把 command 和 args 分开；Windows 使用安装器确认过的绝对
`node.exe`，本地源码测试时把编译产物作为单独参数传入，不要写成一条 PowerShell 或
`cmd.exe` 命令字符串。

### 测试约束

- 重启 Codex 或新开任务后开始测试，确保加载新的 MCP 进程。
- 不使用 Jest、Lint 或其它单元测试代替以下验收。
- 不修改 MCP 源码，不构建、不提交、不推送 Maker 项目。
- 不输出 PAT、TapTap token 或其它凭证。
- 每步记录用户提示、实际工具、耗时、结果和产生的本地文件。

### 场景一：未绑定目录首次启动

从 MCP 仓库或其它未绑定 Maker 项目的目录新开 Codex 任务，发送：

```text
请直接使用 Maker MCP 检查当前目录状态，不要用 shell 模拟。
当前目录没有绑定 Maker 项目也没关系。
```

通过标准：

- `maker_status_lite` 可以直接调用，并返回未绑定状态。
- 16 个 Proxy tools 已经可见。
- 不要求先绑定项目、修改 MCP cwd 或重启会话。

### 场景二：同一会话切换到 Meowdoku

不重启、不 Reconnect，在同一个任务中发送：

```text
现在继续开发 <MAKER_PROJECT>。
请详细检查项目状态和远端 Proxy 是否可用，不要构建或提交。
```

AI 应调用：

```text
maker_status_lite(
  target_dir="<MAKER_PROJECT>",
  detail=true,
  skip_remote_sync=true
)
```

通过标准：

- 项目状态为 `bound`。
- 项目来源为显式 `target_dir` 或等价的明确来源。
- Proxy 状态为 `ok`，白名单工具完整。
- 绑定前后工具列表保持不变，全程没有重启 MCP。

### 场景三：实际调用 Proxy tool

仍在同一个任务中发送：

```text
不要重启或重新配置 MCP。请使用 GPT 低质量模式生成一张 128x128 的
透明背景蓝色圆形测试图标，文件名使用 mcp_proxy_e2e。
不要修改游戏代码，不要构建或提交。
```

预期使用 `generate_image`，关键参数为：

```text
target_dir=<MAKER_PROJECT>
name=mcp_proxy_e2e
target_size=128x128
aspect_ratio=1:1
transparent=true
model=gpt
quality=low
```

通过标准：

- 调用真实到达远端，没有 `tool not found`、schema 拒绝或最终连接失败。
- `quality=low` 被正常接受。
- 返回成功结果；如果返回本地路径，对应文件真实存在于 Meowdoku 内。
- 调用完成后再次检查状态，Proxy 仍为 `ok`，无需重启。

### 场景四：Maker workspace 自动识别

以 `<MAKER_PROJECT>` 作为唯一 workspace 新开一个 Codex 任务，发送：

```text
这是一个 Maker 游戏，请检查当前项目状态，并告诉我图片生成能力是否可用。
不要让我重新提供项目 ID。
```

通过标准：

- 不传 `target_dir` 也能通过 MCP Roots 识别当前 Maker 项目。
- 不要求重新 clone、绑定项目或改写用户级 MCP cwd。
- Maker 状态为 `bound`，图片生成工具可用。

## 3. 结果分类

| 现象                           | 结论方向                                       |
| ------------------------------ | ---------------------------------------------- |
| Maker tools 完全不可见         | 配置未加载、旧会话缓存或 MCP 启动失败          |
| 工具可见但项目无法识别         | MCP Roots、`target_dir` 或绑定解析失败         |
| 项目已识别但 Proxy unavailable | 鉴权、网络、远端服务或 embedded proxy 连接问题 |
| 参数被本地拒绝                 | 静态 schema 或客户端工具缓存问题               |
| 远端成功但没有本地文件         | 素材落盘或路径映射问题                         |
| 首次断线、自动重试后成功       | 连接恢复成功，但应保留首次断线和耗时证据       |

## 4. 测试报告要求

最终报告至少包含：

- 每个场景通过或失败。
- 实际加载的 MCP binary。
- 首次是否能看到 Proxy tools。
- 绑定项目后是否重启过。
- Proxy 实际调用和素材落盘结果。
- 脱敏后的完整错误与重试过程。
- MCP 仓库和 Maker 项目测试后的 `git status`。

不要只写“测试通过”。
