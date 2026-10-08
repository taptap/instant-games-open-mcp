# AGENTS.md

本文件是仓库级开发入口，供 Codex、Claude Code、Copilot 等 Agent 使用。
它只记录稳定、跨模块、需要在开始工作前知道的约束；实现细节、完整 API 清单、
一次性验收记录和排障过程应维护在对应文档中，不要持续追加到本文件。

## 工作范围与文档入口

先判断任务属于哪个模块，再定位并阅读对应文档的相关章节，不要预读整张索引或无关全文。
文档是实现细节的来源，本文件只保留索引和不可违反的通用规则。

| 任务范围                                | 先读                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 仓库架构、模块依赖、认证                | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                   |
| MCP 部署、传输协议、通用环境变量        | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)、[docs/MCP_USAGE.md](docs/MCP_USAGE.md)               |
| MCP Proxy、私有参数、连接生命周期       | [src/mcp-proxy/README.md](src/mcp-proxy/README.md)、[docs/PROXY.md](docs/PROXY.md)             |
| Maker CLI、PAT、项目初始化、客户端集成  | [docs/MAKER.md](docs/MAKER.md)                                                                 |
| Maker 控制台、UI 编辑器                 | [docs/MAKER_CONSOLE.md](docs/MAKER_CONSOLE.md)                                                 |
| Maker Canvas                            | [src/maker/canvas/README.md](src/maker/canvas/README.md)                                       |
| Maker Runtime、本地预览、验证和进程清理 | [docs/MAKER_LOCAL_PREVIEW.md](docs/MAKER_LOCAL_PREVIEW.md)                                     |
| Maker 环境变量                          | [docs/MAKER_ENVIRONMENT_VARIABLES.md](docs/MAKER_ENVIRONMENT_VARIABLES.md)                     |
| UI 设计稿、切图和布局复原               | [docs/MAKER_UI_WORKFLOW.md](docs/MAKER_UI_WORKFLOW.md)                                         |
| 示例资源、CDN 和打包校验                | [docs/MAKER_DEMO_RESOURCES.md](docs/MAKER_DEMO_RESOURCES.md)                                   |
| 小游戏/H5 广告                          | [docs/MCP_USAGE.md](docs/MCP_USAGE.md)、[src/features/ads/tools.ts](src/features/ads/tools.ts) |
| 代码审核                                | [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md)                                                     |
| 资源 `.meta` 和 UUID                    | [docs/MAKER_RESOURCE_META_WORKFLOW.md](docs/MAKER_RESOURCE_META_WORKFLOW.md)                   |
| 发布、版本、Native 构建、Release guard  | [docs/CI_CD.md](docs/CI_CD.md)、[docs/RELEASE_PR_GUARDS.md](docs/RELEASE_PR_GUARDS.md)         |
| 本地 Maker 操作指引                     | [skills/taptap-maker-local/SKILL.md](skills/taptap-maker-local/SKILL.md)                       |

修改模块前先查相邻源码、测试和上述文档；不要把一次 bug 的解决步骤直接升级成全仓库
永久规则。只有稳定的架构契约、安全边界或 Agent 行为变化才需要更新本文件。

## 仓库定位

本仓库包含两类能力：

- `src/features/`：TapTap 小游戏/H5 Open API MCP，包含应用、排行榜、H5、广告和当前游戏
  DC 等业务模块。
- `src/maker/`、`packages/`、`plugins/`：Maker CLI/MCP、控制台、Canvas、客户端插件和
  相关打包产物。

通用服务器入口是 `src/server.ts`，NPM 入口是 `bin/instant-games-open-mcp`。
服务器支持 `stdio`、SSE 和 HTTP JSON；不要把某一种传输方式写成唯一模式。

### 模块边界

- 业务模块可以依赖 `src/core/` 和应用上下文能力。
- 业务模块之间不要直接互相依赖；需要共享逻辑时放入合适的 `core/` 抽象。
- Maker 业务保持在 `src/maker/`，不要把 Maker 专属策略写入通用 `src/mcp-proxy/`。
- 新增 MCP tool/resource 时沿用现有 `ToolRegistration`、`ResourceRegistration` 和模块
  自动注册机制，先参考同目录实现，不要在 `src/server.ts` 重复编排业务逻辑。

## 不可违反的行为约束

### 安全、凭证与数据隔离

- 不把 PAT、MAC token、Bearer token、client secret、API key 或完整认证响应写入源码、
  提交、普通日志、URL、命令参数或用户可见错误。
- 不为了排障打印完整环境变量；输出前脱敏凭证和 URL 中的认证信息。
- 本地项目操作必须绑定已校验的项目 realpath；远端操作使用已确认的应用/项目上下文。
  不猜测 workspace，不跨项目混用缓存、会话、任务和凭证；复用既有隔离机制。
- 受控文件写入应使用项目已有的路径校验、原子写入、revision/锁和权限策略；不要绕过
  受控路由直接改写打开中的 Canvas、项目绑定或用户草稿。
- 不删除、覆盖或清理用户文件、`dist`、Runtime、项目配置或未知进程，除非已有明确的
  所有权证据和对应模块流程。
- 控制台只监听本机 loopback。loopback 地址只用于本机，页面和 CLI 请求不携带 Bearer。

### 用户确认、付费操作与不确定结果

- 用户未明确指定应用、项目、方向、开发者或模板等目标时，按工具契约展示候选并等待
  确认；不能因为只有一个候选就自动选择。用户已明确指定的目标不重复询问。
- 生成、上传、发布、远端构建、二维码、素材处理等可能扣费、提交或产生不可逆副作用的
  操作必须遵循对应工具/文档的确认门，不得主动扩展用户请求。
- 远端请求在响应中断、超时或返回 `unknown` 时，不得把未知解释为失败，也不得盲目重放
  可能已经执行的付费或提交操作。应先查询原任务、产物、状态或用量，再由用户决定是否重试。
- 保留上游业务错误和结构化诊断；不要用笼统的“服务不可用”覆盖编译、校验或业务错误。
- 小游戏/H5 广告流程与 Maker/UrhoX 广告流程严格分开，不混用工具、应用上下文、广告位
  ID 或运行时 API。

### Agent 行为

- 先读取当前状态和上下文，再执行写操作；状态查询默认保持只读。
- 优先复用已有 CLI、MCP tool、Store、网络客户端和文档，不新增第二套工作流或重试器。
- 对用户未明确要求的远端构建、付费生成、发布、提交、上报和大范围重构保持克制。
- 工具描述使用英文，并清楚写明前置条件、确认要求、失败恢复路径和副作用。
- 用户可见回复默认使用简体中文；代码、命令、API 名称和协议字段保留原文。

## 开发约定

### TypeScript 与模块实现

- 新代码使用 TypeScript，遵循仓库现有类型、ESLint 和 Prettier 配置。
- 公共函数、接口和跨模块契约应有足够的类型与注释；不为机械覆盖率添加无意义注释。
- 异步流程优先使用 `async/await`，正确传播取消、超时、未知结果和原始错误。
- TapTap Open API 功能模块通过 `HttpClient` 发起请求；Maker 专属请求沿用 Maker 模块已有
  client/transport，不要把两套认证或错误策略混在一起。
- 新增工具需要完整 JSON Schema，并在所属功能模块注册；不要维护手工工具清单作为第二来源。

### 状态、持久化与回归

- 持久化模型、引用关系、任务状态和缓存只保留一个权威来源；不要为方便 UI 再复制一份
  可变关系。
- 付费任务、用户草稿、远端任务和本地等待分开建模；停止本地等待不等同于取消远端任务。
- 修改共享契约、项目隔离、认证、进程清理或付费流程时，定向验证直接相关的调用链及
  失败、取消或未知结果路径；按实际风险扩大范围，不因模块名称就机械运行整组回归。
- 不把截图、窗口可见或 HTTP 成功单独当作游戏玩法、资源质量或发布成功的证明。

## Git 与提交

- 不直接向 `main` 提交；优先沿用当前合适分支，不为小修自动切分支。需要新分支时默认
  使用 `fix/`；确认需要 minor 版本升级的新功能才使用 `feature/`，不使用 `codex/` 前缀。
- Commit 使用 Conventional Commits：
  `feat`、`fix`、`refactor`、`perf`、`docs`、`chore`、`test`、`ci`、`build`、`style`。
  type/scope 使用英文小写，subject 不以句号结尾；重要改动的 body 用短 bullet 说明行为、
  设计取舍、风险和验证；header 和 body 每行不超过 100 字符。
- 不使用 `WIP`、`temp`、`test` 或 `Initial plan` 作为手工提交消息。需要保护未完成工作时
  使用 `git stash` 或有实际含义的正式提交，不要提交示例中的“保存工作区”伪提交。
- 切换分支或执行可能影响文件的 Git 操作前，先确认工作区已提交或 stash。
- 不使用 `git reset --hard`、`git checkout -- .` 等破坏性清理命令，也不覆盖用户已有修改。
- 发布、Native 复用、插件打包和 Release tag 规则只按
  [docs/CI_CD.md](docs/CI_CD.md) 与 [docs/RELEASE_PR_GUARDS.md](docs/RELEASE_PR_GUARDS.md) 执行。

## 验证与交付

- 小修默认只做相关静态检查和最小定向测试，不重复执行全量或大范围回归。完整验收由用户
  最后统一执行；涉及数据安全、共享契约或发布门禁时，保留必要的针对性验证。
- 文档修改只检查内容、链接及差异，不运行代码测试、构建或全仓 lint。
- 依赖未变且本机可用时不重复安装；需要安装或准备正式发布物时使用锁定依赖（ 60npm ci 60）。
- 测试、lint 和格式检查限定到受影响文件或用例。构建仅在编译产物、打包或实际运行验证
  需要时执行；具体命令查  60package.json 60 和对应模块文档，不把命令清单当成每次必跑步骤。
- 用户要求本地看到最新页面时，交付包括构建、核对运行入口和必要的服务重启；保护未保存
  草稿及活动任务，不把“已编译”当成“运行中的进程已更新”。

完成前检查  60git diff --check 60，确认没有带入无关修改、凭证、临时图片或调查记录。
说明实际运行的检查及未验证边界；不要把局部通过写成完整验收通过。

## 文档维护边界

- `README.md` 面向用户，描述稳定能力和使用方式。
- `docs/` 面向开发、运维和排障，维护完整流程、协议、参数和历史兼容约束。
- `skills/` 面向 Agent，维护可执行的任务路由和操作顺序。
- `AGENTS.md` 是仓库规则的唯一维护入口；`CLAUDE.md` 只引用它，不复制规则正文。
- 不要因为一次实现、一次测试、一个平台探针或一个具体日期就扩充本文件；如果某条规则
  只对一个模块成立，应放在该模块文档或 Skill 中。重要行为变化同步更新对应正式文档，
  不把临时计划、测试报告或交接记录写入并提交到仓库，除非用户明确要求。
