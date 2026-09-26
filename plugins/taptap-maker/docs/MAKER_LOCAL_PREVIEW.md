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
taptap-maker preview validate --target-dir <PROJECT> --mode validate --json
taptap-maker preview validate --target-dir <PROJECT> --mode screenshot --json
taptap-maker preview validate --target-dir <PROJECT> --mode both --json
taptap-maker preview check --target-dir <PROJECT> --json
taptap-maker preview stop --target-dir <PROJECT> --json
```

安装使用 Python/curl，遵循宿主授权。已有 Runtime 可在 start 时传
`--runtime <绝对可执行文件路径>`。start/refresh 根据项目加载需求选择原目录或自动 prepare；
单独排查产物可运行 `preview prepare --target-dir <PROJECT> --json`。
新项目缺少 `.project` 配置时，prepare 仅在受管理副本补齐 project/resources/settings，
无需先远端构建或生成二维码。入口缺省 `scripts/main.lua`，不存在时明确提示；
缺省版本 `1.0.0`，资源扫描 scripts/assets，公共来源使用官方 stable 配置。
临时项目标识优先使用本地绑定 ID，临时作者标识为 `local-preview`，不代表 TapTap 平台身份。
已有配置及资源元数据保持优先；配置损坏不以默认值掩盖。
不支持 JSONC/旧根目录配置或外部 `asset_dirs`。

刷新会先关闭旧窗口，重新读取原项目并启动，丢失内存状态；新项目 prepare 失败不启动
Runtime，也不运行旧 dist。
停止或手动关闭后不自动复活。`process_alive=true` 只证明进程存活，`check` 不代表玩法通过。
常驻窗口截图、输入脚本、Server/云模拟和游戏存档隔离尚不支持，停止也不保证保存游戏。
`preview validate` 是一次性验证流程，不复用常驻窗口：`validate` 运行引擎的 JSON 验证模式，
`screenshot` 运行引擎的真实渲染截图模式，`both` 同时生成两类证据。验证前必须停止常驻预览，
并且多人及 server 项目不支持 `run-lua-validate`。
只有实际生成的 `validate.json` 和通过格式检查的 PNG 才会作为验证证据返回；进程退出码、日志或
“captured” 文本本身不能替代文件检查。

### 一次性验证与 Skill

本轮已在 macOS 验证；Windows 保留安装过滤，不能沿用 macOS 的验收结论。
`run-lua-validate` 由 UrhoX ai-dev-kit 分发，在更新后的 macOS 过滤配置中开放；
已有项目必须通过当前渠道执行 `dev-kit update`，仅重跑旧安装脚本无法恢复已经被过滤删除的源文件。
Maker 安装器继续同步 `.agents/skills` 等发现目录，当前会话是否需要重新加载由宿主决定。
不从源码仓手工修改用户的全局 Skill，不用另一份 npm/插件替代当前渠道。

`validate` 使用引擎 headless 检查；`screenshot` / `both` 使用真实桌面渲染。
截图要求 Runtime 支持 `-screenshot-after-start`，从游戏脚本及 `Start()` 成功后计帧，
避免 manifest 下载期间提前截到加载页；旧 Runtime 未确认该能力时返回 `UNSUPPORTED`，
通过当前渠道更新 Runtime，不能把旧加载页当作验证通过。普通 `preview start/refresh` 不使用此参数。
Web/直接 Runtime 默认的绝对帧截图语义不变，不修改 validate JSON 协议。

所有一次性验证持有项目操作锁，与 start/prepare/install 和另一轮验证互斥；不自动停止现有窗口。
失败、Ctrl-C 或超时先终止并等待本轮 Runtime 退出，再关闭资源服务、清理临时下载缓存。
使用受管理副本的源文件与准备日志跟随本轮证据保留，不改写游戏原目录。

结果返回 `report`、`artifacts`、`log_path`、`invocation_path`、`evidence_directory`、
起止时间与退出码。`invocation.json` 记录实际参数与工作目录，`runtime.log` 为有界、脱敏的
stdout/stderr JSON 行；原始 Runtime 另有安装目录中的 `logs/game` 与 `logs/lua`。
`prepare-log` 为构建副本日志，`validate-report` 为原始引擎报告，`screenshot` 含像素尺寸。
报告缺失、缺少成功字段、错误计数不为零、缺资源、断言失败、截图格式错误均不能通过；
截图失败也保留已生成的验证报告。引擎 FAIL 不通过批量过滤“噪音”改写为 PASS。
Agent 必须打开本轮图片检查画面，按错误修复游戏并复测；有限帧报告及单张截图不证明
完整交互、胜负逻辑或游戏内自行延迟加载的资源正确。

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

Windows 预览失败时，先按证据区分四层问题：Node 版本与直接执行能力、Runtime 文件与资源、
supervisor/后台启动链路、Runtime 本体与游戏加载。依次核对实际 `process.execPath`、Node 版本、
Runtime 可执行文件、`supervisor_log_path`、Runtime 日志和 control channel 结果；不要把
“Runtime 文件存在”或“WMI 返回 PID/请求成功”当作 Runtime 已经真正启动。若 supervisor 日志为空
且 control channel 超时，应优先记录为 Windows 后台启动链路的待确认问题，不要直接归因于游戏代码、
Runtime 缺失或 Node 版本。本地 AI 按 `skills/taptap-maker-local/SKILL.md` 的
“AI Local Preview Launch Playbook”处理：目标是打开本机 `UrhoXRuntime`，不要改 PATH 或切 Node。
`Local prepare failed` 只表示 Python/ProjectBuilder 未写出完整 manifest，Runtime 尚未启动，
应读本轮 `prepare.log`。空 supervisor 日志加控制通道超时，通常是 CIM Hidden EncodedCommand
被拦截；可重试 `preview start`。不要在 start 返回后再跑 `__maker-preview-supervisor`。
锁恢复互斥口 `EACCES` 时改试邻近口，`EADDRINUSE` 视为互斥占用并 fail closed，不结束占用进程。
启动失败且控制通道未发布时，Windows 只在当前 PID 命令行仍是本次 EncodedCommand 时回收包装进程，
不按历史 PID 误杀。

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
- Windows 预览 supervisor 与控制台复用 PowerShell/CIM 后台启动器，避免依赖 AI IDE
  短命令的进程生命周期；macOS/Linux 保留 detached 启动。状态中的 `supervisor_log_path`
  指向项目预览目录下的 supervisor 错误日志。
  Windows 包装脚本的准备步骤失败即停止；Node 的 stderr 警告写入日志，不作为启动失败，
  最终保留 Node 退出码。self runtime 同时携带 `package.json` 的 ESM 模块声明。
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
- Windows/macOS 资源服务归独立 supervisor 管理，使用动态 loopback 端口、随机访问路径及
  client manifest 文件白名单，校验 Host 并拒绝浏览器跨源请求，不暴露源码和 server 产物。
  停止、刷新、启动失败或窗口退出时关闭，不依赖控制台存活。
- 缓存只清理 Maker 管理且已确认无活跃引用的目录，不跟随链接、不清理外部 Runtime
  或公共缓存。独立 prepare 保留最近 3 份；本机 Runtime 安装保留当前与上一份，
  被任一项目活跃会话引用的版本额外保留；
  证据保留最近 3 个会话、每会话 5 轮。活跃引用和清理未确认目录额外保留。
  这是数量限制，不是磁盘配额。
- 强杀 supervisor 可能遗留 Runtime 和下载缓存，不在所有权未知时强行清理。
  Windows 安装器的取消测试不能替代实机辅助进程回收验证。
