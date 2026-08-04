# MCP 使用体验优化 TODO

临时记录。目标是降低日常 MCP 使用成本，保留现有能力和客户端兼容性；本轮已实施，后续需求继续追加。

## 目标和边界

- MCP 更新不得主动中断当前会话；当前会话继续使用已加载版本和已有 proxy tools。
- 新版本在下一次 MCP 启动或用户主动重连后生效，并给出正向说明。
- 保留 `maker://status` Resource 和 `maker_status_lite` Tool 两个入口。
- 默认状态查询快速、只读、短输出；完整远端诊断只在明确请求时执行。
- 不删除项目、认证、Git、proxy、dev-kit、AGENTS policy 或 skill 诊断能力。
- 不引入 supervisor、持久化工具快照、额外 proxy 层或 MCP 热加载。

## 工作项 1：更新不破坏当前会话

状态：已实施

### 现状

`taptap-maker upgrade` 只重写客户端 MCP 配置和项目 AGENTS policy，当前没有关闭活跃 MCP
进程的代码。现有完成文案要求用户立即重启或重连，容易让用户主动中断本来可继续使用的会话。

### 实现

- 保持 `runUpgrade()` 的配置写入和 AGENTS policy 更新行为不变。
- 不发送 MCP shutdown、重连请求或 `tools/list_changed` 通知。
- 将升级结果明确标记为 `apply_mode: next_mcp_start` 与 `current_session: preserved`。
- 完成文案改为：当前 MCP 会话继续使用当前版本；更新将在下次 MCP 启动或用户主动重连后生效。
- 不承诺运行中 Node 进程加载新代码；这是下一次启动生效的边界，而不是当前会话失败。

### 验收

- upgrade 流程不创建、关闭或操作任何活跃 MCP transport。
- 输出不再要求用户立即重启客户端或新开对话。
- 下次新建 MCP 进程仍通过现有 launcher 加载更新后的包。

## 工作项 2：Maker status 分层减负

状态：已实施

### 问题

`maker://status` 和 `maker_status_lite` 都调用 `formatStatus()`，输出和检查成本基本相同。
`maker_status_lite` 仅多了 `target_dir` 和 `skip_remote_sync` 参数，默认仍可能进行远端 Git、
远端 proxy、dev-kit 版本、PAT 换 Tap auth 等检查，因此既不轻量，也会把维护与排障信息塞入
日常工作流。

### 保留两个入口

- `maker://status` 继续是支持 MCP Resources 的客户端的首选入口。
- `maker_status_lite` 继续兼容只支持 Tools 的客户端，并保留 `target_dir`。
- 两者共享同一套状态收集和摘要格式，不再产生两份业务逻辑。

### 默认 summary 模式

`maker://status` 和 `maker_status_lite` 默认都返回 summary。summary 只执行本地、只读检查：

- MCP 版本、环境、目标目录、MCP Roots 与项目绑定状态。
- PAT/Tap auth 的存在状态，不输出凭证路径，不自动刷新或写入 token。
- Git 工作目录是否可用于 Maker 项目。
- Python 与 Lua LSP 的简短 ready/missing 状态。
- Maker 项目初始化和项目健康状态。
- 一个与当前状态对应的明确下一步。

summary 不执行网络请求、远端 Git fetch、远端 proxy `tools/list`、dev-kit 最新版本检查、
自动 app 列表拉取或完整 skill / AGENTS policy 展开；只允许读取本地缓存中的 package update
摘要，以保留升级发现能力。

### 明确的 diagnostic 模式

在 `maker_status_lite` 增加可选 `detail: true`。只有明确传入时，才保留并输出当前完整诊断：

- Maker remote sync 和远端 Git 状态。
- Maker proxy tools 可用性。
- AI dev-kit 已安装版本、最新版本和更新建议。
- AGENTS policy、skill 安装状态和详细 MCP cwd 诊断。
- 未绑定但已有 PAT 时的 app 预览。
- 现有项目健康、认证和失败详情。

`skip_remote_sync` 保持兼容：仅在 `detail: true` 时跳过远端 Git 与 dev-kit 新鲜度检查；summary
本身不访问远端，因此该参数无需额外动作。

### 认证边界

- status 是观察接口，不在 summary 或 diagnostic 中自动换取并保存 Tap auth。
- 缺少 Tap auth 时，status 正向提示运行 `taptap-maker login` 或重新执行 `taptap-maker init`。
- 实施前确认 init/login 已覆盖 PAT 到 Tap auth 的正常初始化路径；不能让 status 移除自动刷新后
  导致正常的新项目 proxy 或 build 无法恢复认证。

### 代码组织

- 在 `src/maker/server/mcp.ts` 内将当前 `formatStatus()` 拆为 summary 和 diagnostic 两个明确分支。
- 抽取共享的本地状态采集，复用现有 Git、Python、LSP、项目初始化和健康检查函数。
- 保留现有详细 formatter，避免重写已验证的诊断内容；只用模式开关控制是否执行昂贵检查。
- Resource 固定调用 summary；Tool 根据 `detail` 选择模式。

### 文档和引导

- 更新 `docs/MAKER.md`、README 和 Maker workflow skills。
- 日常新开/继续开发：读取 `maker://status` 或默认 `maker_status_lite`。
- 构建前同步确认、连接排障或用户明确要求完整检查：调用
  `maker_status_lite({ detail: true })`。
- 保留“Resource 不可用时使用 Tool”的兼容性说明。

### 验收

- 两个既有入口、`target_dir` 和 `skip_remote_sync` 均保持可用。
- 默认 summary 不触发任何远端依赖或本地写操作。
- `detail: true` 覆盖当前完整状态的所有诊断区块。
- 未绑定、缺 PAT、缺 Tap auth、项目配置异常和 Git 目录异常都给出明确下一步。
- 以 mock 验证 summary 不调用 Git fetch、proxy tools/list、dev-kit 版本检查、PAT/token 刷新或
  app 列表 API；不使用依赖机器和网络的固定耗时断言。
- 现有 status、构建、认证、proxy 与 workflow skill 测试全部通过。

## 不在本轮处理

- 当前运行中 MCP 的热更新或热加载。
- 用持久化 schema / 快照处理新进程首次远端 tools/list 失败。
- proxy session 生命周期重构。
- 删除任一 status 入口或修改既有 tool 名称。

## 工作项 3：精简项目 AGENTS 受管策略

状态：已实施

- 保留项目级 AGENTS 中的构建、广告、测试二维码和素材/资产工具路由。
- 移除项目级 `Maker feedback workflow` 及其反馈文字，减少每个 Maker 项目的固定上下文。
- 保留 MCP 初始化指引、`get_debug_feedbacks` 工具、运行时 feedback skill 和线上反馈能力；本次只
  精简 AGENTS 注入内容，不删除实际功能。
- 为 MCP 初始化路由和项目 AGENTS 路由提供两个明确视图，避免共享文本为了一个入口被迫膨胀。
- 现有项目通过 `taptap-maker agents update` 或 `upgrade` 更新受管策略，用户自定义 AGENTS 内容保留。
