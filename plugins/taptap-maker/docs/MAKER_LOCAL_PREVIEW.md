# Maker 本地窗口预览

本地预览使用官方 Runtime 和随包 ProjectBuilder，在受管理源码副本生成新产物。
不提交、不上传、不远端构建，不修改游戏原目录，也不要求安装引擎源码。
公共资源由 Runtime 下载和缓存，首次可能下载公共整包。

Runtime 按本机安装并由所有 Maker 项目共用，安装记录和新下载版本保存在
`~/.taptap-maker/runtime/`。项目哈希目录只保存该项目的会话、准备产物、日志和运行缓存。
升级前已经安装在项目哈希目录中的有效 Runtime 会自动登记为本机 Runtime，不重复下载，
也不会移动或删除可能仍在使用的旧文件。

安装完成和每次启动已登记 Runtime 前，Maker 会补齐 `Data/LuaScripts`、`Data/Fonts`、
`CoreData` 和 `Res/Fonts`。中文兜底字体放在引擎实际挂载的
`Res/Fonts/MiSans-Regular.ttf`，优先复用旧 `Data/Fonts` 中的字体，否则从 macOS 或 Windows
系统字体中复制。已有同名字体不会被覆盖；找不到可用字体时预览仍可启动，但会返回警告。
这是本机 Runtime 的通用兜底，不会把任一项目的字体复制进共享 Runtime。各项目自己的字体仍放在
项目 `assets/Fonts`，通过项目独立的受管理预览副本加载。显式 `--runtime` 指向的外部 Runtime
不会被自动修改。

## 使用

`<PROJECT>` 为已绑定 Maker 游戏的绝对目录。插件用户使用当前插件内 CLI。

```sh
taptap-maker preview install --target-dir <PROJECT> --json
taptap-maker preview status --target-dir <PROJECT> --json
taptap-maker preview start --target-dir <PROJECT> --json
taptap-maker preview refresh --target-dir <PROJECT> --json
taptap-maker preview logs --target-dir <PROJECT> --json
taptap-maker preview check --target-dir <PROJECT> --json
taptap-maker preview stop --target-dir <PROJECT> --json
```

安装使用 Python/curl，遵循宿主授权。已有 Runtime 可在 start 时传
`--runtime <绝对可执行文件路径>`。start/refresh 自动 prepare；
单独排查产物可运行 `preview prepare --target-dir <PROJECT> --json`。
新项目缺少 `.project` 配置时，prepare 仅在受管理副本补齐 project/resources/settings，
无需先远端构建或生成二维码。入口缺省 `scripts/main.lua`，不存在时明确提示；
缺省版本 `1.0.0`，资源扫描 scripts/assets，公共来源使用官方 stable 配置。
临时项目标识优先使用本地绑定 ID，临时作者标识为 `local-preview`，不代表 TapTap 平台身份。
已有配置及资源元数据保持优先；配置损坏不以默认值掩盖。
不支持 JSONC/旧根目录配置或外部 `asset_dirs`。

刷新会先关闭旧窗口，重新准备并启动，丢失内存状态；prepare 失败不运行旧 dist。
停止或手动关闭后不自动复活。`process_alive=true` 只证明进程存活，`check` 不代表玩法通过。
截图、输入脚本、Server/云模拟和游戏存档隔离尚不支持，停止也不保证保存游戏。

## 联网项目

读取 `.project/settings.json` 的 `@runtime.multiplayer`（或 `@runtime.max_players`）
判断联网模式。联网项目启动/刷新时，Maker 使用已有 PAT 登录线上入口，为当前游戏申请测试服，
再让原版 Runtime 以 `skip_login + directConnectParams` 通过 WebSocket 网关直连，无需扫码。
客户端仍使用本轮本地构建的受管理副本；不会提交、上传或远端构建代码。

需要有效 Maker 登录，以及已提交构建的游戏配置和测试版本。缺少登录时运行
`taptap-maker login`；新联网项目缺少游戏配置时先提交构建并生成一次测试二维码。
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

- macOS 通过会话内本机只读资源服务，将本轮 client manifest 交给 Runtime 的 `game_url`；
  Windows 使用本地 manifest 入口，仍需 Windows 实机验收。
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

- Builder 快照由 `scripts/snapshot-maker-preview-builder.js <UrhoX绝对目录>` 生成。
  来源版本以 `src/maker/preview/builderSource.ts` 和返回的 `builder_commit` 为准，
  不在文档重复维护 commit。生成器逐字节核对固定 Git 输入，拒绝修改、未跟踪、
  忽略、删除及符号链接输入。不要直接修改快照或复制公共资源补丁。
- 执行 Builder 前校验标准配置和版本路径：版本须为跨平台安全的单个目录名，
  允许 `{x}` 模板，禁止路径跳转和 Windows 保留名；不得允许配置回退绕过校验。
  只对受管理副本执行构建及输出清理，保留原项目 UUID 和资源引用语义。
- macOS 资源服务归独立 supervisor 管理，使用动态 loopback 端口、随机访问路径及
  client manifest 文件白名单，校验 Host 并拒绝浏览器跨源请求，不暴露源码和 server 产物。
  停止、刷新、启动失败或窗口退出时关闭，不依赖控制台存活。
- 缓存只清理 Maker 管理且已确认无活跃引用的目录，不跟随链接、不清理外部 Runtime
  或公共缓存。独立 prepare 保留最近 3 份；本机 Runtime 安装保留当前与上一份，
  被任一项目活跃会话引用的版本额外保留；
  证据保留最近 3 个会话、每会话 5 轮。活跃引用和清理未确认目录额外保留。
  这是数量限制，不是磁盘配额。
- 强杀 supervisor 可能遗留 Runtime 和下载缓存，不在所有权未知时强行清理。
  Windows 安装器的取消测试不能替代实机辅助进程回收验证。
