# 给游戏项目测试 AI：本地验证功能质检

## 任务与判定原则

在你当前负责的真实 Maker 游戏项目中，模拟普通用户验收本地验证功能。
不是重复原开发者的测试项目，也不是只证明某条手工命令能成功。

用户期望：在 Codex 中提出“在本地运行当前游戏，检查运行错误和画面”后，
AI 能发现正确的工作流，使用已安装的 Maker 插件和默认 Runtime，返回本轮报告、
日志、截图及真实的视觉检查结论，不要求用户重新安装或手拼参数。

分别给出两个结论：

1. **用户流程是否通过**：当前会话能否发现并正确使用工作流。
2. **底层执行是否通过**：当前插件和默认 Runtime 能否在当前游戏完成验证。

手工指定 CLI 后运行成功，不能抵消 Skill 未发现、错误路由或反复要求安装的问题。
游戏自身报错应报告为游戏问题，不应仅凭报错认定工具失效；工具必须准确返回证据。

## 已知基线，不代表当前会话已验收

截至 2026-09-27，开发机核对过：

- MCP 仓库：`taptap/instant-games-open-mcp`，分支 `fix/local-validation-phase-one`；
  功能提交 `2062d2b`，后续包含文档提交。不要要求 HEAD 必须等于功能提交。
- 引擎仓库：`taptap/urhox`，同名分支，功能提交 `ecb76d388`。
- 本机已安装插件目录：
  `/Users/liangdong/.codex/plugins/cache/taptap-maker/taptap-maker/0.0.3`
- 该插件的 `dist/maker.js` SHA-256：
  `f4dc45882ed033304248673d544a6d1fe792b30f58746b98e5ac5550c31709b5`
- 本机默认 Runtime 安装记录：
  `/Users/liangdong/.taptap-maker/runtime/installation.json`
- 当时登记的可执行文件：
  `/Users/liangdong/.taptap-maker/runtime/runtime-local-validation-ecb76d388/UrhoXRuntime.app/Contents/MacOS/UrhoXRuntime`
- 该可执行文件 SHA-256：
  `b08568fde872e6f7b6f5b8aa73265cc8eb5023f879fd9699ec6872cef5cd22e7`

目录名、插件版本号或安装记录中的 `unknown` 都不能单独判断版本正确与否。
文件哈希匹配也只证明磁盘文件一致，不证明旧会话已重新加载。
以上是本机测试产物基线，不代表已经正式发布；其他电脑不能照搬绝对路径。

## 第一步：检查真实项目和用户入口

### 必须先读的 Skill

这份文档是质检任务书，不是替代正式 Skill 的另一套工作流。测试 AI 必须先加载：

1. 当前 Maker 插件的 `taptap-maker-plugin-lifecycle`：确定插件内启动器及重复 MCP 状态。
2. 当前 Maker 插件的 `taptap-maker-local`，特别是 `One-shot Validation (macOS)`：
   选择本地流程，检查预览占用，禁止误走远端构建。
3. **当前游戏安装的 `run-lua-validate/SKILL.md`**：执行验证、读报告、
   看截图、解释失败及修复后复测的完整流程。

`run-lua-validate` 来自 UrhoX ai-dev-kit，不是独立 npm 软件，也不是新增 MCP tool。
本次源码真源位于：
`/Users/liangdong/Documents/Maker/urhox_dev/ai-dev-kit/skills/run-lua-validate/SKILL.md`。
该源码路径只用于对照，不能代替当前游戏中的正式安装及宿主发现验收。
本地 macOS 项目必须走该 Skill 开头的“本地 Maker”部分；
不能继续执行后半段 Web/Linux 的直接 Runtime 安装流程。

若项目缺少 Skill：先记录缺失，按当前插件的 dev-kit 更新流程恢复并检查宿主发现。
更新后若仍缺失，核对获取到的 dev-kit 是否包含本次修改；不要循环更新、
手工复制后宣称正式分发正常，或要求用户重新安装整套 MCP。
宿主尚未加载时报告需要重新加载会话，不把文件已存在当成会话可用。

先记录，不要先修环境或安装 Skill，否则会掩盖用户遇到的原始问题。

- 记录当前游戏绝对路径，确认不是 MCP 源码仓库或原验收临时项目。
- 调用当前会话可用的 Maker 状态入口，显式传当前游戏路径；
  记录 MCP 版本、distribution、项目绑定及初始化状态。
- 确认当前项目是否单机；一次性验证不支持多人/server，不得改配置绕过。
- 列出会话实际可发现的 `taptap-maker-local` 和 `run-lua-validate`；
  区分“文件存在”“宿主发现”“本会话可加载”，不能混为一谈。
- 检查项目 `.installer/skills` 和宿主 Skill 发现目录，记录缺失或断链。
- 从当前插件配置和 Skill 路径确认 CLI 来源；不要使用不明来源的全局命令。
- 读取实际 Maker home 的 Runtime 登记，确认可执行文件与所需资源存在。
  如果有 home/Runtime 覆盖配置，记录实际使用位置，不默认套用基线路径。

该能力通过插件内 CLI `preview validate` 提供，不是新增一个名为 validate 的 MCP tool。
“工具列表没有 validate”不等于能力缺失；但 AI 不知道如何调用仍属于用户流程问题。

## 第二步：默认环境运行

### 命令到底做什么

`preview validate` 是**一次性启动当前游戏并收集验证证据**的 CLI 子命令：
它不提交代码、不做远端构建，也不是复用已打开的常驻预览窗口。
必要时准备受管理项目副本，然后启动本机 Runtime，收集结果并结束本轮进程。

| 参数或入口 | 含义 |
| --- | --- |
| `node "$CLI"` | 用 Node 执行当前已安装 Maker 插件里的程序，无需安装另一份 CLI |
| `preview status` | 查询该项目预览状态，不启动游戏 |
| `preview validate` | 执行一轮游戏运行验证 |
| `--target-dir "$GAME"` | 指定已确认的当前游戏绝对目录，不是 MCP 源码目录 |
| `--mode validate` | headless 运行，收集结构化报告，不产出视觉截图 |
| `--mode screenshot` | 真实渲染并截图，不要求 validate JSON 报告 |
| `--mode both` | 同一轮真实渲染中收集 validate 报告和截图 |
| `--json` | 把执行结果以 JSON 返回，方便 AI 读取状态和文件路径 |

这些模式不自动模拟点击、完整玩法或胜负流程。`both` 也不自动完成视觉判断；
AI 必须打开图片，不能以文件存在代替看图。

先通过已发现的 Skill 执行。下面命令仅用于核对或诊断，不应成为用户必须手动操作的步骤。
macOS shell 中，填入刚核实的实际路径：

```sh
GAME="/当前真实游戏绝对路径"
CLI="/当前已启用插件绝对路径/dist/maker.js"
node "$CLI" preview status --target-dir "$GAME" --json
```

若预览正在运行、启动或停止，先征得用户同意再通过正常 stop 命令停止；
不得杀未知进程、清锁或把未知状态当作已停止。

无占用后，按顺序运行，每次等前一次结束：

```sh
node "$CLI" preview validate --mode validate --target-dir "$GAME" --json
node "$CLI" preview validate --mode screenshot --target-dir "$GAME" --json
node "$CLI" preview validate --mode both --target-dir "$GAME" --json
```

首次验收不要加 `--runtime`：需要证明用户默认选择的 Runtime 可用。
若必须显式指定 Runtime 才成功，分别记录默认路径失败和指定路径成功，
不能宣称默认环境已通过。

## 第三步：核验本轮证据

### 截图检查不需要 Computer Use

本地验证生成的是 PNG 文件，不需要操作桌面、点击 Runtime 窗口或申请 Computer Use：

1. 从 CLI 返回的 `artifacts[].path` 取得**本轮实际生成的 PNG**。
2. 使用当前 Agent 已提供的图片读取能力读取该文件：
   - Web/Claude 工作流使用 `Read` 读取 PNG；
   - Codex 工作流使用可用的本地图片查看能力读取 PNG。
3. 根据图片内容判断 loading、黑屏、空场景、资源、UI 裁切和遮挡。

不要把“读取图片并进行视觉判断”改写成“需要 Computer Use”。Computer Use 只有在
任务明确要求操作真实桌面窗口、点击游戏、键盘输入或采集屏幕时才相关；本次
`validate`、`screenshot`、`both` 验证不包含这些操作。若测试 AI 要求 Computer Use，
先报告为“当前会话没有正确使用图片读取能力/对应工具未加载”，不要宣称 Maker MCP
或 UrhoXRuntime 缺少能力，也不要让用户为本次 PNG 检查额外授权。

先解析 JSON，不要只搜索 stdout 中有没有字符串 PASS：

- `ok` / `result`：本轮执行结论；FAIL、UNSUPPORTED、TIMEOUT、CANCELLED 均不算通过。
- `report`：引擎结构化报告；检查阶段、帧数、错误计数和缺失资源。
- `artifacts`：本轮证据列表；按 `kind` 区分 `validate-report`、`screenshot`、`prepare-log`，
  从各项 `path` 读取，不能猜截图文件名。
- `log_path`：本轮 Runtime 日志；`invocation_path`：实际执行程序和参数。
- `upgrade_required` / `required_capabilities` / `upgrade_message`：
  若返回则解释能力不足与升级要求，不把它解释成游戏代码错误。

| 检查项 | 必须看到的证据 |
| --- | --- |
| validate | 本轮 JSON 报告、实际运行帧数、阶段结果、错误及资源计数 |
| screenshot | 本轮非空 PNG；AI 实际打开，检查 loading、黑屏、资源与 UI |
| both | 同一轮的验证报告和截图，两者均检查，不能只看退出码 |
| 日志 | 读取返回的 log_path；结合报告解释错误，不能批量过滤后宣称通过 |
| 运行身份 | invocation_path 中实际 executable、参数及工作目录 |
| 项目保护 | 不提交、不推送、不远端构建，不改游戏配置来换取通过 |

`-screenshot-frame` 是指定截图帧，不是多帧截图功能。
截图成功不等于视觉验收通过；有限帧报告也不证明完整玩法和交互正常。
记录各轮 session_id、时间和证据路径，不能用上轮图片替代。

## 第四步：失败时如何定位

| 现象 | 应检查的范围 |
| --- | --- |
| AI 一直要求重新安装或只尝试远端构建 | 会话工作流、Skill 发现及入口选择 |
| CLI 不认识 preview validate | 实际启动器路径和加载的插件产物 |
| 返回 UNSUPPORTED 并要求截图能力升级 | 实际 Runtime 路径、日志中的能力标记 |
| 默认失败、显式 Runtime 成功 | 默认安装记录或覆盖配置，不是功能已完整可用 |
| 项目未绑定、配置无效 | 当前游戏初始化和项目配置，不要重装所有组件 |
| 有报告但游戏 FAIL | 结合 Lua/资源/引擎日志定位，保留失败证据 |
| 没报告、没截图、超时或进程提前退出 | invocation、日志、退出码和进程状态，不猜测原因 |

旧 Runtime 未确认 `-screenshot-after-start` 时不得把截图判 PASS；
检查 `UNSUPPORTED`、升级提示及已经生成的 validate 报告是否保留。
此兼容场景仅在有明确的旧 Runtime 测试副本时执行，不覆盖共享 Runtime，
也不为了制造场景去下载未知旧包。未执行则写“未覆盖”。

修复前记录故障，修复后在同一真实项目按默认入口复测。
不要自动安装 npm latest、改全局 PATH、换渠道或改引擎。
缺 Skill 时不要把手工复制成功冒充正式分发正常；需分别记录分发与会话加载问题。
涉及重连或重开会话，明确指出原会话与新会话的差异。

## 交付给用户

在项目外的测试证据目录生成一份简单 HTML，按执行顺序展示：

1. 项目、实际插件/Runtime 路径、环境检查与 Skill 发现情况。
2. 每次真实命令、开始结束时间、退出码和返回结果。
3. 报告、日志内容及本轮截图，标注 AI 视觉观察。
4. 遇到的问题、实际修复、修复后复测结果和未覆盖项。

日志和参数先脱敏，不展示 PAT、token 或凭据；不修改原始结果掩盖失败。
不要把测试产物提交到游戏仓库。用户已有报告位置时沿用。

最终用下面格式简短汇报：

```text
用户流程：通过 / 失败 / 未验证
默认插件 + 默认 Runtime：通过 / 失败 / 未验证
Skill：会话可用 / 仅磁盘存在 / 缺失
validate：
screenshot：
both：
游戏问题与工具问题：
做了哪些环境修复：
HTML 证据位置：
未覆盖项：
```

如果只在诊断命令下成功，而普通用户入口仍不可用，最终结论必须保留该失败。
