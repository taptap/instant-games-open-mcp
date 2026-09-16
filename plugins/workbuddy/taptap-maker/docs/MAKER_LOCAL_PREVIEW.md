# Maker 本地窗口预览

本地预览使用官方 Runtime 和随包 ProjectBuilder，在受管理源码副本生成新产物。
不提交、不上传、不远端构建，不修改游戏原目录，也不要求安装引擎源码。
公共资源由 Runtime 下载和缓存，首次可能下载公共整包。

Runtime 按本机安装并由所有 Maker 项目共用，安装记录和新下载版本保存在
`~/.taptap-maker/runtime/`。项目哈希目录只保存该项目的会话、准备产物、日志和运行缓存。
升级前已经安装在项目哈希目录中的有效 Runtime 会自动登记为本机 Runtime，不重复下载，
也不会移动或删除可能仍在使用的旧文件。

安装完成和每次启动已登记 Runtime 前，Maker 会补齐 `Data/LuaScripts`、`Data/Fonts`、
`CoreData`，并在缺少 `Data/Fonts/MiSans-Regular.ttf` 时从 macOS 或 Windows 系统字体中复制
一个中文兜底字体。已有同名字体不会被覆盖；找不到可用系统字体时预览仍可启动，但会返回警告。
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
prepare 需要标准 `.project/project.json`，不支持 JSONC/旧根目录配置或外部 `asset_dirs`。

刷新会先关闭旧窗口，重新准备并启动，丢失内存状态；prepare 失败不运行旧 dist。
停止或手动关闭后不自动复活。`process_alive=true` 只证明进程存活，`check` 不代表玩法通过。
截图、输入脚本、Server/云模拟和游戏存档隔离尚不支持，停止也不保证保存游戏。

## 平台与排障

- macOS 通过会话内本机只读资源服务，将本轮 client manifest 交给 Runtime 的 `game_url`；
  Windows 使用本地 manifest 入口，仍需 Windows 实机验收。
- Windows 预览 supervisor 与控制台复用 PowerShell/CIM 后台启动器，避免依赖 AI IDE
  短命令的进程生命周期；macOS/Linux 保留 detached 启动。状态中的 `supervisor_log_path`
  指向项目预览目录下的 supervisor 错误日志。
- 失败先查看 status、logs 和返回的 `log_path`；Runtime 原始日志位于安装目录
  `logs/game`、`logs/lua`，需按本轮时间判断。进程启动不能代替资源、画面或云能力验收。
- 安装取消、超时或 CLI 断连后，守卫停止并等待下载辅助进程。无法确认退出时保留带
  `.cleanup-unverified` 标记的安装临时目录并阻止再次安装/更新；确认相关进程已退出后才移除提示的
  单个目录，不清空 Maker 数据目录。已有可用 Runtime 仍可复用。
- 失败且 Runtime 已退出时，supervisor 保存原因后退出；显式 start 可重新创建会话。
  报错但仍存活的 Runtime 不自动关闭；身份未知时不按历史 PID 强制终止。
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
