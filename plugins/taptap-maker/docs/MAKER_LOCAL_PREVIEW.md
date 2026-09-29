# Maker 本地窗口预览

本地预览优先使用官方 Runtime 直接加载项目原目录，不提交、不上传、不远端构建，
也不要求安装引擎源码。缺配置、联机/server、声明构建或资源配置、包含资源元数据的项目使用
随包 ProjectBuilder 在受管理副本生成本轮产物。Windows 原目录存在 `dist/latest.json`
时也走准备链路，防止 Runtime 加载旧产物；不删除或覆盖原项目 dist。
公共资源由 manifest 加载链路下载和缓存，首次可能下载公共整包。

Runtime 按本机安装并由所有 Maker 项目共用，安装记录和新下载版本保存在
`~/.taptap-maker/runtime/`。项目哈希目录只保存该项目的会话、准备产物、日志和运行缓存。
升级前已经安装在项目哈希目录中的有效 Runtime 会自动登记为本机 Runtime，不重复下载，
也不会移动或删除可能仍在使用的旧文件。

安装完成和每次启动已登记 Runtime 前，Maker 会补齐 `Data/LuaScripts`、`Data/Fonts`、
`CoreData` 和 `Res/Fonts`。中文兜底字体放在引擎实际挂载的
`Res/Fonts/MiSans-Regular.ttf`，优先复用旧 `Data/Fonts` 中的字体，否则从 macOS 或 Windows
系统字体中复制。已有同名字体不会被覆盖；找不到可用字体时预览仍可启动，但会返回警告。
这是本机 Runtime 的通用兜底，不会把任一项目的字体复制进共享 Runtime。各项目自己的字体仍放在
项目 `assets/Fonts`，直读项目从原目录加载，需要构建的项目通过受管理预览副本加载。
显式 `--runtime` 指向的外部 Runtime 不会被自动修改。

## 使用

`<PROJECT>` 为已绑定 Maker 游戏的绝对目录。插件用户使用当前插件内 CLI。

```sh
taptap-maker preview install --target-dir <PROJECT> --json
taptap-maker preview status --target-dir <PROJECT> --json
taptap-maker preview start --target-dir <PROJECT> --json
taptap-maker preview refresh --target-dir <PROJECT> --json
taptap-maker preview logs --target-dir <PROJECT> --json
taptap-maker preview logs --target-dir <PROJECT> --tail --json
taptap-maker preview check --target-dir <PROJECT> --json
taptap-maker preview stop --target-dir <PROJECT> --json
```

安装使用 Python/curl，遵循宿主授权。已有 Runtime 可在 run 或 validate 时传
`--runtime <绝对可执行文件路径>`。start/refresh 根据项目加载需求选择原目录或自动 prepare；
单独排查产物可运行 `preview prepare --target-dir <PROJECT> --json`。
新项目缺少 `.project` 配置时，prepare 仅在受管理副本补齐 project/resources/settings，
无需先远端构建或生成二维码。入口缺省 `scripts/main.lua`，不存在时明确提示；
缺省版本 `1.0.0`，资源扫描 scripts/assets，公共来源使用官方 stable 配置。
临时项目标识优先使用本地绑定 ID，临时作者标识为 `local-preview`，不代表 TapTap 平台身份。
已有配置及资源元数据保持优先；配置损坏不以默认值掩盖。
不支持 JSONC/旧根目录配置或外部 `asset_dirs`。

安装器的 stdin 仅用于取消通知；下载等子进程默认使用空输入，不继承取消管道，避免 Windows
子进程卡住或争用取消信号。超时与取消必须等待本轮子进程回收，未确认回收时保留失败状态。

刷新会先关闭旧窗口，重新读取原项目并启动，丢失内存状态；新项目 prepare 失败不启动
Runtime，也不运行旧 dist。
停止或手动关闭后不自动复活。`process_alive=true` 只证明进程存活，`check` 不代表玩法通过。
停止标记只针对读取并核验过的 session 与 owner；旧会话的停止请求不会取消并发的新预览。
没有已登记会话时，stop 不创建可影响后续启动的标记；启动前探测由发起任务的取消信号中止。
常驻窗口的即时截图、输入脚本、Server/云模拟和游戏存档隔离尚不支持，停止也不保证保存游戏。
`run-lua-validate` 的一次性验证使用下方独立入口。

## run-lua-validate 本地接入

验证方法、报告判读、视觉检查及修复复测使用 UrhoX ai-dev-kit 的 `run-lua-validate` Skill。
Maker 只负责本地执行适配：复用预览的 Runtime 安装、项目分类、准备与资源加载，收集本轮证据。
仅支持单机；不修改引擎、不提交或远端构建、不改写游戏代码和发布配置。

插件用户使用 `taptap-maker-local` 指定的当前插件 CLI；不要切换另一份全局 CLI。
先执行 `preview status`，有活动预览须经用户同意停止，验证不会自动接管窗口。
若上次验证命令异常退出，启动检查仍会读取遗留验证记录；Runtime 存活、创建结果未知或
记录无法核验时，拒绝新的 validate/start/run，并提示核对对应记录和进程，不自动停止或接管。
Skill 缺失时通过当前渠道执行 `dev-kit update`；Runtime 缺失用 `preview install`。
Skill 分发由 UrhoX ai-dev-kit 维护。Maker 在安装 Skill 及执行验证时，若检测到本机规则仍
排除 `run-lua-validate`，先通过 stderr 提示，再仅移除当前平台的该项；其它平台、其它
排除项和原 Skill 正文不变，结果中的 `warnings` 保留处理信息。已开放时不改文件。
若旧安装器已删除原 Skill 文件，明确提示通过当前渠道执行 `dev-kit update` 恢复；
不会把修正名单当作 Skill 已安装，不自动下载升级。配置损坏或不可写时保留告警，
不因此阻断 Runtime 验证。
本地调用映射由 `taptap-maker-local` 和项目 Maker 指引提供。
用户请求 Validate 但 AI 尚不可用该 Skill 时，由 AI 按 `taptap-maker-local` 先检查本地
`skills/` 或 `.installer/skills/` 原文件，告知并解除当前平台排除，再运行项目原安装脚本。
旧安装器未提供 Codex `.agents/skills` 时，AI 仅补齐该 Skill 的完整目录，不覆盖已有文件；
确认安装文件可读后读取原 Skill 执行。仅原文件缺失才引导更新 ai-dev-kit。
此引导不新增安装命令；`preview validate` 本身仍只修正过滤规则，不负责安装 Skill。

以下为独立调用示例，不是一段顺序运行的脚本；项目参数使用绝对路径：

```sh
taptap-maker preview validate --target-dir "/absolute/game" --json
taptap-maker preview validate --target-dir "/absolute/game" --mode both --screenshot-frame 600 --json
taptap-maker preview validate --target-dir "/absolute/game" --validate-test check.lua --json
```

| 本地参数                                      | 对应原有 Skill / Runtime 能力                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `--mode validate`（默认）                     | headless 运行，取得原始 JSON 报告与日志                                              |
| `--mode screenshot` / `both`                  | 渲染截图 / 同时取得报告；macOS、Windows 需要桌面渲染环境                             |
| `--screenshot-frame N`                        | 原有 `-screenshot-frame`；截图时必须选择，无固定截图帧                               |
| `--validate-frames N`                         | 验证帧数，默认 60；both 默认截图帧 + 80，至少预留 3 帧回读时间                       |
| `--validate-timeout S`                        | 秒数 1–580，逻辑默认 45、截图默认 100；进程预算再加 20 秒                            |
| `--validate-test check.lua`                   | 加载 `scripts/` 下已有断言脚本，使用原有 `V` helpers，不生成断言                     |
| `--entry state.lua`                           | 选择 `scripts/` 下受控测试入口；manifest 项目只调整受管理副本的入口                  |
| `--width W --height H`                        | 本轮尺寸 100–4096，默认复用预览窗口设置，不保存或改发布配置                          |
| `--validate-spike-threshold MS` / `--nosound` | 原有帧耗时阈值 / 静音选项，仅显式传入时启用                                          |
| `--output-dir /absolute/acceptance`           | 每轮结束将证据复制到该目录下独立的 run ID 子目录；须在受管理预览缓存之外，不自动清理 |

600 只是示例，不保证加载完成。截图数量、受控状态和拼图仍由 Skill/Agent 决定；
每轮重新启动 Runtime，不是同一窗口连续抓帧。按原 Skill 生成临时测试脚本后，可用
`--entry` 选择入口；验证命令不会改写脚本，测试结束后由 Agent 清理临时文件。

CLI 返回 `report`、`exit_code`、`exit_signal`、`artifacts`、`log_path`、`invocation_path` 和
`evidence_directory`。`COMPLETED/ok:true` 只表示执行和证据收集完成，不是游戏 PASS。
按原 Skill 读取原始报告与日志、打开每张 PNG、修复后复测；MCP 不复制噪音过滤或游戏判级规则。
有效 FAIL 报告和 Runtime exit 1 可完成收集，异常退出、取消、超时、无效或缺失产物不能完成。
报告与截图独立收集，失败仍保留已取得的部分证据。
运行日志写入失败同样属于采集失败，不得返回 `COMPLETED`；已有报告、截图及正常回收流程保留。

不依赖 `-screenshot-after-start` 或新增引擎协议，不要求 Computer Use 截屏。
无 PNG 时检查日志、文件权限和桌面环境，不凭一条 captured 日志判成功或断言版本过旧；
确认缺少能力后才按当前渠道升级 Runtime。不自动换引擎或重试，不影响正常预览入口。

### 本地多轮验证与过程可见性

Agent 根据验收目标决定入口、断言、截图时机和轮数，顺序重复调用同一命令即可；
不固定“一张图”或限制为几轮，也不新增批量测试框架。每轮重新启动 Runtime，
不支持对常驻窗口连续抓帧。大量截图应按状态选择代表性画面检查，不把数量当作覆盖率。

CLI 在准备开始前向 stderr 输出 `validation.started`，包含 `run_id`、`evidence_directory`、
`log_path`、`invocation_path`。可在命令运行中读取该目录的 `run.json` 和日志尾部，
不必等最终 stdout JSON，也不应为了轮询进度再启动 Runtime。记录覆盖准备、启动、运行、
完成；早期失败也会留档。进程意外退出、缺少最终记录时展示“结果待确认”，不能判为 PASS。

控制台“构建与测试 → 日志 → Validate”只读取这些文件，控制台未启动也不影响验证。
按轮次查看调用参数、准备日志、合并的 stdout/stderr/Lua 日志、JSON 报告和已完整收集的 PNG；
执行收集结果与游戏报告结果分别展示。控制台不代替 Agent 看图，也不记录 Agent 内部推理。

证据位于 Maker user home 的 `preview/<项目 realpath 哈希>/validation/<run ID>/`，
独立于普通预览的最近几轮清理。完成后保留 7 天，下次验证时清理过期且确认不再使用的记录；
活跃或进程归属未知的记录不自动删除。单项目超过 5 GiB 只告警，不为满足配额删除近期证据。
验收材料需长期保留时指定 `--output-dir`，结果中的 `archive_directory` 表示实际归档位置；
归档包含调用参数、日志、原始报告、截图和最终结果，不包含准备副本源码。
归档结果中的证据路径指向归档副本，不随缓存到期失效；实际执行过的调用参数保持原样。
归档失败仍保留本机缓存并明确报错。显式归档目录不参与自动清理。

## 联网项目

启动 Runtime 前，Maker 先分类项目：

- 标准配置且没有联机/server 特征、资源/构建配置、资源元数据和 Windows dist 冲突的项目：
  直接使用原项目目录，不复制、不 prepare。其它单机项目保留 manifest 准备链路；
  不另写资源依赖解析器，也不把需要资源索引的单机项目误当成联网项目。
- `@runtime.multiplayer`、`@runtime.max_players`、持久世界配置，或
  `entry@server`、`scripts/server_main.lua`、`scripts/server.lua`：进入受管理副本，
  先生成本轮 client manifest，再申请测试服。
- 缺少标准配置的新项目：进入受管理副本，仅在副本补齐默认配置；如果同时发现 server 入口，
  仍按联机/server 项目处理，不能伪装成单机项目。

联网项目启动/刷新时，Maker 使用已有 PAT 登录线上入口，为当前游戏申请测试服，再让原版
Runtime 以 `skip_login + directConnectParams` 通过 WebSocket 网关直连，无需扫码。
这些流程都不会提交、上传或远端构建代码。

需要联网能力时，项目必须存在有效 Maker 登录，以及本地准备副本中的 `dist/latest.json`
指向已提交构建的测试版本；缺少登录时运行 `taptap-maker login`。标准联机/server 项目
每次启动都会重新准备并校验 manifest，缺少构建产物、项目 ID 或配置时直接失败，不会静默
启动离线窗口。
**服务端运行远端已构建版本，本地 server 代码修改需提交构建后才生效。**
申请游戏沿用引擎多开调试接口的 `test` 标签，不连接正式服；刷新会申请新的测试游戏，
不是恢复原房间或加入已有房间。测试服中的存档等真实业务副作用不作隔离。

鉴权失败、测试版本不存在、超时或连接信息无效时明确失败，不静默降级为单机；
申请结果未知时不自动重试。PAT/MAC 凭证不传入 Runtime、不写入预览状态或日志，
Runtime 参数仅携带用户标识和测试服路由。停止只关闭本地 Runtime，
测试游戏的回收遵循远端服务自身规则。
已在 macOS 验证服务端房间信息与玩家资料回包；Windows 共用此链路，仍需实机验收。

## 预览窗口

控制台“构建与测试”的本地预览区提供 16:9（960×540）、21:9（1260×540）和
4:3（1024×768）预设，也支持宽高各 100–4096 的自定义整数尺寸。
未保存过窗口设置时默认使用 1920×1080 自定义尺寸；已有保存设置不变。
方向默认跟随项目 `taptap_publish.screen_orientation`，未配置时使用横屏；
无论项目配置如何，都可以手动切换横屏或竖屏，竖屏交换长短边。
这些值是 Runtime 窗口尺寸，不模拟设备 DPR、触控或安全区域。

点击“保存设置”后按项目保存在 Maker 本机预览目录的 `window.json`，不修改项目发布配置；
切换预设保留自定义尺寸。CLI 启动/刷新也使用该设置。保存不会重启运行中的游戏，
需要显式刷新才应用，刷新仍会丢失游戏内存状态；页面区分已保存尺寸和本轮运行尺寸。

## 平台与排障

### Node 来源与 Windows 启动排查

Maker 启动本地预览时优先复用当前宿主进程的 Node.js；只有宿主 Node 不可用时才回退到系统
Node.js。系统 Node 本身不是失败证据，不要仅因为路径来自系统或 WorkBuddy 之外就要求用户切换
Node、修改 PATH 或重装环境。

正常路径只用 Node 启动 Runtime，不调用 WMI/CIM、隐藏 PowerShell 或 EncodedCommand。

```text
AI 调试 -> 前台 Node 会话 -> Runtime -> 收集日志 -> 停止本轮游戏
用户预览 -> 控制台 Node -> Runtime -> 用户关闭或停止 -> 清理本轮资源
```

- 调试：`preview run --target-dir <项目> --json` 在前台持有游戏。stderr 的
  `preview.started` 事件提供会话信息；其它 CLI 可按 session 查询 logs/status/check 或 stop。
  默认最多运行 10 分钟，`--duration-ms 1000..600000` 可指定较短的冒烟测试。
  结束时 stdout 返回最终状态和日志摘要，不把会话 JSON 当作游戏断言通过。
- 用户预览：`preview start` 自动连接或直接启动同版本控制台，经已有项目任务接口发起预览。
  `console open` 打开页面后点击预览也走同一流程。无需先手动启动 Host。
  请求 CLI 结束后游戏继续由控制台管理；不承诺退出整个 IDE 后仍能保活。
  需要独立于整个 IDE 时，可由用户在外部终端运行可选的 `console serve`。
- 两入口在各自 Node 进程内复用 PreviewSession、资源准备和日志代码，不再启动预览 CLI
  或独立 supervisor 子进程。保留兼容字段 `supervisor_pid`，其值现在是持有会话的 Node PID。
- Runtime 明确使用 `shell:false`、`detached:false`；Windows 环境变量使用白名单。
  正常退出等待 Runtime 结束。Windows 强杀清理利用 Node/libuv 对非 detached 子进程的
  Job 管理，并需实机验收；不新增 breakaway、WMI 或按进程名清理的兜底。
- `logs` 合并 stdout/stderr 与本轮 Runtime 公布的 Lua 日志。Lua 文件只允许来自当前
  Runtime 的固定 logs/lua 目录，校验文件身份、拒绝链接、有界增量读取，不扫描其它项目日志。
- 常驻预览的即时截图、输入注入、游戏断言 JSON 协议仍未实现，必须明确返回不支持或 UNDETERMINED。
  一次性报告和截图使用 `preview validate`，不能把常驻会话状态当成验证报告。
  游戏加载、画面和业务正确性不能用进程存活代替。
- 只有显式 `--legacy-wmi` 使用旧后台入口；正常失败不自动重试。先区分创建失败、
  Runtime 自行退出、主动停止及宿主回收，不因空日志就断言杀软拦截。
- 后台进程已登记控制端点、但在启动完成前退出时，只有明确确认 supervisor 已退出，且
  Runtime 尚未尝试创建或已记录的 Runtime 也已退出，才允许重新启动。创建 Runtime 前先持久化
  启动意图，拿到 PID 后立即登记；如果中断发生在这两步之间，结果未知，不自动清理或重复启动。
  存活、权限未知以及缺少新阶段标记的旧版启动记录仍保持保护，不按 PID 为零直接删除会话。
  此恢复机制不绕过安全软件；需先由用户解决外部拦截。
  已发布端点但创建结果未知的 starting 记录，在确认早于本次系统启动至少一分钟、且已记录
  的 supervisor/Runtime PID 均不存在后，也允许显式重新启动。权限未知或 PID 仍存活时不回收。
- Runtime 创建后的 PID 登记或运行状态写入失败，会停止本轮持有句柄的子进程。退出后的状态
  写入再次失败不会阻断退出等待和映射清理；无法确认子进程退出则保留资源并报告清理未确认，
  不把失败伪装成成功停止。

- 直读项目在项目根目录启动 Runtime，使用 `<入口> -tapcode_dir=<项目根目录>
-skip_login`；不复制项目、不创建 junction 或软链接。需要准备的项目使用受管理副本，
  默认配置只写入副本。preflight 的 preparation_reason 说明本轮分流依据。

- 符合直读条件的单机项目在 macOS 和 Windows 都由 Runtime 直接读取原项目目录。
- 所有需要 prepare 的项目在 Windows/macOS 均使用受管理副本生成的 client manifest 和受保护的
  loopback asset server，通过 game_url 加载；不按平台或单机/联机选择不同资源加载方式。
  单机只加载资源，不申请测试服。准备路径不再依赖 Windows Runtime 对 tapcode_dir 的
  manifest 支持。仅挂载松散 scripts/assets 的 Runtime 会找不到生成的 settings.json，
  即使 WebSocket 已连接也可能返回 IsNetworkMode=false。两种平台都不使用 junction、
  软链接或 `subst`，不会改写游戏原目录。
- Windows 所有需要 prepare 的预览使用每轮独占的 TEMP/maker-cache-\* 下载缓存，避免项目哈希、会话 ID 和下载
  临时文件名叠加超过 Runtime 路径限制。正常退出、刷新和启动失败时在确认进程退出后清理；
  无法确认退出或缓存根被替换时保留，不清理原项目或共享 Runtime 资源。每轮缓存不复用，
  公共资源可能需要重新下载；异常强杀 supervisor 时可能遗留临时缓存。
- 控制台与 Agent 前台会话在各自进程内直接持有 Runtime，共用准备、manifest、联网和日志逻辑。
  不再另外启动 supervisor 进程。Windows Runtime 子进程不 detached，环境变量使用白名单；
  legacy WMI 不是自动回退。
- 失败先查看 status、logs 和返回的 `log_path`；Runtime 原始日志位于安装目录
  `logs/game`、`logs/lua`，需按本轮时间判断。进程启动不能代替资源、画面或云能力验收。
- 安装取消、超时或 CLI 断连后，守卫停止并等待下载辅助进程。无法确认退出时保留带
  `.cleanup-unverified` 标记的安装临时目录并阻止再次安装/更新；确认相关进程已退出后才移除提示的
  单个目录，不清空 Maker 数据目录。已有可用 Runtime 仍可复用。
- 失败且 Runtime 已退出时，supervisor 保存原因后退出；显式 start 可重新创建会话。
  报错但仍存活的 Runtime 不自动关闭；身份未知时不按历史 PID 强制终止。
- 预览操作复用短期 loopback socket 互斥，异常退出后操作系统释放；旧 `operation.lock`
  仅在持有互斥且确认记录的进程不存在时回收。进程存活、权限未知或锁内容损坏时不自动删除，
  不按文件年龄抢占；退出只删除本次创建的锁。升级前应结束旧版预览命令，不与旧版并行恢复。
  Runtime 安装锁仍沿用原有保护，不凭主进程退出推断下载辅助进程已清理。
- 新启动携带会话 ID 和 30 秒控制通道发布期限；发布前后均校验，迟到的启动进程不能接管
  替换后的会话。尚未发布 PID/端口的启动记录过期后可重新点击本地预览，状态查询不修改记录。
  旧版零 PID 启动记录缺少此校验信息，不能仅凭零 PID 判定进程已结束；
  重启电脑后重新打开控制台可恢复，不必删除项目或重新安装 Runtime。
  控制通道已发布但身份未知的进程仍保持保护，不强制终止或重复启动。
- supervisor 意外退出后，只有会话证据身份匹配且记录的 supervisor、Runtime PID 均确认不存在，
  才将状态判定为已失败且可重新启动。status 保持只读，显式 start 在项目操作锁内替换旧会话；
  stop/check 不要求预先执行 status。任一进程仍存活、权限不足或证据缺失时不自动重启。

## 维护约束

### Builder 重复来源诊断

公共索引可能同时在 engine-res 定义资源、在 official-res 通过 source=engine-res 转引它。
固定 Builder 会为这类重复路径输出 ERROR，但仍继续生成产物。Maker 仅在完整诊断与本轮
导入日志记录的精确 client/server hash 索引均可核验时，将同一路径、同 UUID、唯一真实来源且
内容元数据一致的转引降为可见警告；不通过扫描旧缓存或只比较 UUID 放行。
这包括 Techniques/PBR/PBRDiff.xml、Models/Plane.mdl，但实现不依赖这两个具体路径。

原始 prepare.log 不改写，因此可能仍包含这些已核验的 ERROR；CLI 返回 warnings 标明核验结果。
缺索引、诊断截断、不同 UUID/内容、多个独立定义、来源循环以及其他 stdout/stderr ERROR 仍失败。
Builder 非零退出、manifest 或本地产物校验失败仍阻止启动。无需修改游戏引用、公共资源或 Builder 快照。

### Windows 联机兼容性验证

本机同一个 Runtime、同一个“测试匹配”1.0.4 项目对照显示：原 tapcode_dir 启动只执行
DirectConnect/Ready，运行时配置虽已存在于 manifest，Ready 仍找不到 settings.json。
改用 loopback manifest 后，IsNetworkMode=true，MatchProbeClient 初始化并收到游戏服版本回包；
启动、刷新均验证。世界杯足球夜也在启动、刷新后收到房间人数、玩家资料和聊天回包。
该轮验证中 Windows 单机入口尚保持原行为，铁壁要塞完成启动/停止回归，不以进程存活替代业务证据。
后续统一所有 prepare 项目的加载入口；Windows 缺配置新项目及资源索引单机需要补做
启动、刷新、资源显示和停止后的缓存清理实机验收，不沿用此前单机入口的验收结论。

仅切换 game_url 而保留深层缓存目录时，本机曾因 manifest 下载临时路径过长而写入失败；
每轮短缓存解决该问题，并在停止后确认目录被移除。强制退出或特别长的 TEMP 仍需单独排查。
上述验证未升级 Runtime、未修改游戏或 Builder，不代表不同平台二进制版本一致；本机安装记录
版本为 unknown，PE 版本为占位值 9.999.999.0，缺少 macOS 构建标识，不能据此断言版本差异。

### 资源与生命周期

- Builder 快照由 `scripts/snapshot-maker-preview-builder.js <UrhoX绝对目录>` 生成。
  来源版本以 `src/maker/preview/builderSource.ts` 和返回的 `builder_commit` 为准，
  不在文档重复维护 commit。生成器逐字节核对固定 Git 输入，拒绝修改、未跟踪、
  忽略、删除及符号链接输入。不要直接修改快照或复制公共资源补丁。
- 执行 Builder 前校验标准配置和版本路径：版本须为跨平台安全的单个目录名，
  允许 `{x}` 模板，禁止路径跳转和 Windows 保留名；不得允许配置回退绕过校验。
  只对受管理副本执行构建及输出清理，保留原项目 UUID 和资源引用语义。
- Windows/macOS 资源服务归本轮持有者管理，使用动态 loopback 端口、随机访问路径及
  client manifest 文件白名单，校验 Host 并拒绝浏览器跨源请求，不暴露源码和 server 产物。
  停止、刷新、启动失败或窗口退出时关闭。控制台只清理自己的会话，不影响独立 Agent 调试。
- 缓存只清理 Maker 管理且已确认无活跃引用的目录，不跟随链接、不清理外部 Runtime
  或公共缓存。独立 prepare 保留最近 3 份；本机 Runtime 安装保留当前与上一份，
  被任一项目活跃会话引用的版本额外保留；
  普通预览证据保留最近 3 个会话、每会话 5 轮；validate 独立保留 7 天，见前文。
  活跃引用和清理未确认目录额外保留。
  这是数量限制，不是磁盘配额。
- 正常结束等待 Runtime 退出和资源清理；强杀 Node 时 Windows 子进程清理依赖 libuv Job 行为。
  特殊宿主限制、进程创建瞬间被强杀、非 Windows 强杀等边界不作绝对保证，临时下载缓存可能保留。
  未确认所有权或退出时不强行清理、不宣称无孤儿；安装器取消测试不替代实机进程回收测试。

Windows 启动链路迁移阶段 A 的独立探针、操作方法和未完成验收项见 [启动方式探针](MAKER_WINDOWS_RUNTIME_LAUNCH_PROBE.md)。空 supervisor 日志只说明未观察到 supervisor 写日志，不能单凭此确认是火绒、WMI 或 Runtime 故障；先结合杀软事件与本轮启动结果排查。

隔离新用户目录完成 Runtime 安装、Agent 前台取数及控制台 Host 预览；受限 Job 退出测试证明 Agent 会清理，独立 Host 持有的窗口仍存活。旧 breakaway 实验路径已撤回。详情见 [启动方式探针](MAKER_WINDOWS_RUNTIME_LAUNCH_PROBE.md)。

## Preparation and final evidence

Real-game acceptance results and remaining blockers: see the 2026-09-28 section in
[Windows launch verification](MAKER_WINDOWS_RUNTIME_LAUNCH_PROBE.md).

Python probes and setup in the preview path run asynchronously with bounded output and timeouts.
Cancellation waits for the owned child process cleanup; sequential asynchronous copying preserves
project isolation and rejects links. Existing synchronous Python commands are unchanged.
After cancellation or timeout, Python command cleanup has a six-second drain deadline. If a
Windows parent has already exited, its PID is not reused for tree termination. Unverifiable
cleanup is reported explicitly as failure; closing inherited pipes is not proof of child cleanup.

Agent runs continue through reloading. Stop/cancel still wins, and final evidence is selected only
after owned-session cleanup and identity verification, using the final reload ID. Runtime close
drains remaining Lua output in 64 KiB chunks, yielding between chunks, up to the existing 64 MiB
file limit. Truncation or incomplete collection is reported as an error rather than hidden.

These checks do not prove game rendering, interaction, or server connectivity. Real-game acceptance
must include inspected window screenshots and representative input, separately from process checks.
