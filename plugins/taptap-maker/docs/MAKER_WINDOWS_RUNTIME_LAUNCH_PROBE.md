# Windows 预览启动方式探针（迁移阶段 A）

## PR #532 Python 管道收尾复验（2026-09-28）

- 真实 Python 父进程退出后，后代继续持有输出管道：原实现设置 300 ms 超时，
  仍等待到后代约 7.17 秒自行退出；证明 exitCode 有值不等于 close 已触发。
- POSIX 取消仍向本轮进程组发送信号，不因组长已退出跳过回收。
  Windows 父进程已退出时不再用旧 PID 执行 taskkill；无法确认清理明确返回
  cleanupVerified=false，取消/超时额外等待最多 6 秒后断开输出句柄并报告失败。
- 修复后同类 Windows 实机用例约 6.33 秒返回 TIMEOUT 和清理未验证错误，
  而非等待继承管道的后代；测试后代自行结束，未把这一用例描述为已自动回收后代。
  此修复消除无限等待，不承诺 Windows 父进程提前退出后仍能安全找回所有后代。
  不新增 WMI、PowerShell 启动绕行或 Runtime 中间进程。

## 更换 PAT 后四款联网项目复测（2026-09-28）

本轮仅复测 871584、884567、902204、919382，不包括世界杯足球夜。
使用前述相同 SHA256 的已编译插件和 Runtime；只更新凭据，不改启动代码或原项目。
四款均不再返回 PAT_INVALID，均完成准备、真实窗口启动、刷新至 reload_id=1 和停止。
四款 scripts/assets/.project 哈希前后一致，结束后未发现残留 Runtime 进程。

| 项目         | 窗口与交互证据                                   | 联网/兼容性边界                                                                              |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 碰碰车大乱斗 | 主菜单、点击联机对战进入大厅；刷新后恢复菜单     | 日志收到 EnergyData 等业务响应，未完成多人对局                                               |
| 赛博狼人杀   | 进入游戏后显示角色选择，点击创建角色             | 服务能力日志 source=server；创建后过渡画面，未完成对局                                       |
| 幻海航迹     | 初始短暂黑屏后显示船与海面，点击启航进入地图选择 | server_ack 云存档回包；资源和大厅 API 报错；刷新截图仅到启动 Logo，未证明刷新后完整载入      |
| 逐鹿十三州   | 主菜单可见，点击自定义联机弹出客户端版本提醒     | 脚本按 no_lobby 触发提醒，并非真正比较版本号；日志 serverCloud transport=offline，联机未通过 |

四款均仍有 DaySpecularHDR.dds / themis_x64.dll 错误，Agent 最终 result 为 FAIL，
不能把本轮启动及进程回收通过写成四款完整联网兼容通过。本轮检查的截图未见防火墙弹窗，
不代表对所有防护弹窗具有自动检测能力。未修改防护设置或为通过测试屏蔽错误。
证据：.maker/game-acceptance-D8h00A/network-retest.json 和 network-retest-\* 目录中的
截图、日志与最终结果。测试目录内凭据副本已删除，保留用户默认 Maker 登录。

## 异步准备与真实游戏复验（2026-09-28）

结论：审核项修复已实现，但真实游戏兼容性验收未通过，不作为可发布的全绿证明。
保留 Node 直接持有 Runtime，不新增 Host、supervisor 或自动绕过安全软件的路径。

- 预览 Python 检查/安装及副本复制改为异步，取消等待本轮子进程退出。
  实测发现控制台状态页仍同步检查 Lua LSP/Python，一并改为异步去重及缓存。
- Agent 不再把 reloading 当作结束；退出等待 Lua 日志排空，再按最终会话及刷新轮次取证。
- 锁文件依赖未改变；使用 npm ci --ignore-scripts 后生成两种插件，未升级依赖。
- 最终两个 bundle SHA256 均为
  AEB3111196344B10EB4AAD793F25156BAFAE4BEF3093DFAEF60DDDC554CF1F57。

### 已完成的实测

- 全新 Runtime 安装/复用、归属冲突、强杀 Agent、调用方退出后控制台预览存活、
  刷新/停止、重放旧取消标记、强杀控制台后回收及重启等 10 个生命周期场景通过。
  该组为真实 Runtime 生命周期测试，不代替真实游戏验收。
- 注入 8 秒 Python 检查延迟时，健康请求 40 ms、状态请求 4 ms；预览取消成功，
  控制台关闭后检查进程确认退出。
- 浏览器实际点击高中模拟器的本地预览、刷新确认、停止；刷新轮次变为 1，
  停止后 Runtime 退出，测试控制台正常关闭。防火墙弹窗期间不计入原生游戏交互通过。
- 最终针对性回归 7 套、161 项通过；改动文件 ESLint 通过。
  更广回归曾出现未改动安装器测试的 EBUSY 清理失败，单独复跑通过；
  既有 Windows SIGKILL 断言及整体类型检查问题未作为本次修复范围。

### 真实项目结果

| 项目                    | 已观察结果                                    | 未完成或失败项                                |
| ----------------------- | --------------------------------------------- | --------------------------------------------- |
| 世界杯足球夜            | 完成准备，按 client_main.lua 联网入口启动流程 | 鉴权 HTTP 401 PAT_INVALID，未启动游戏         |
| 871584 碰碰车大乱斗     | 按联网流程执行                                | 同一鉴权阻塞                                  |
| 884567 赛博狼人杀       | 按联网流程执行                                | 同一鉴权阻塞                                  |
| 902204 幻海航迹         | 按联网流程执行                                | 同一鉴权阻塞                                  |
| 919382 逐鹿十三州       | 按 server 项目流程执行                        | 同一鉴权阻塞                                  |
| 876002 越跳越有钱       | 游戏 HUD、开始交互、刷新及停止                | 动态图标资源缺失                              |
| 898394 高中模拟器       | 菜单、新游戏存档选择、刷新及停止              | 未进入课堂玩法                                |
| 902150 幸运弹球         | 引导关闭、多球画面、刷新及停止                | 仍有公共资源/模块错误                         |
| 902393 百代人生         | 角色生成及人生界面、刷新及停止                | 纸质背景资源缺失                              |
| 911154 留给先行者的花束 | 3D 挑战界面、刷新及停止                       | 画面异常偏淡，shader 写入错误，交互效果未确认 |
| 923522 只差一次         | 开始按钮进入难度选择、刷新及停止              | 未完成一局玩法                                |

六个离线项目均非黑屏，但不能标为完整兼容通过；都有公共资源或模块错误，
包括 DaySpecularHDR.dds 和 themis_x64.dll。短安装路径下，对比 HEAD 原 bundle
与修复 bundle，越跳越有钱均重现公共资源及动态图标缺失，不能归因于本轮异步修复。
3D 项目的短路径复验被取消，不能据此认定 shader 错误已解决。

10 个项目的 scripts/assets/.project 前后哈希一致。未修改游戏、引擎或防护设置，
未把联网项目改成离线来制造通过。新安装 Runtime 触发 Windows Defender 防火墙提示，
未代用户允许。需要用户重新登录 Maker，并自行处理该提示后继续联网和深入玩法验收。

本机证据位于 .maker/game-acceptance-D8h00A/，包括 verified-compatibility.json、
各项目窗口截图、日志、baseline-jump.json、verified-short-jump.json、responsiveness.json。
生命周期证据位于 .maker/direct-preview-01a600a5-7731-43ee-bd9f-865ff0ecec8e/evidence.json。
证据目录被 Git 忽略；不随插件分发凭据、用户项目或完整日志。

## PR #532 审核修复复验（2026-09-27）

- 复现旧会话 stop 与新会话 Runtime 探测并发导致错误取消；修复后标记匹配 session_id
  和 supervisor_id，无会话 stop 不写标记，保留本会话启动期间的取消能力。
- 新增三个回归用例；七套相关测试共 191 项通过，格式与 ESLint 全量检查通过。
  首轮 Windows 进程恢复用例有一次失败，单独复跑及完整七套复跑均通过，未修改其断言。
- 使用 npm ci 恢复锁文件依赖后生成双插件，Zod 恢复为 4.3.6，Prettier 为 3.6.2；
  不改锁文件，不使用 npm audit fix。安装审计仍报告 47 项依赖漏洞，需另行分级处理，
  本次不能作为全部依赖安全通过的证明。
- Codex 原目录直读和 WorkBuddy 受管理副本各通过九组真实 Runtime 流程：窗口与 Lua 日志、
  Agent 互斥、错误 session 拒绝、刷新、停止、owner 强杀后退出与重启、控制台跨站拒绝。
  启动期间分别重放旧停止标记 225 次和 442 次，新 Runtime 正常启动且最终退出。
  记录分别为 .maker/direct-preview-1d618ae0-5b0e-4a21-bb97-271dc709bc4a/evidence.json
  和 .maker/direct-preview-db8f48d4-9c60-4055-8741-cee9e1bd8156/evidence.json。
- 本轮双插件 maker.js SHA256 均为
  40489BA2FBF806419D5D3104FECACA82317FBA1AA006FC2980F94DF3A91A4F33。
  本轮复用已有安装，不宣称重新完成首次下载或产品经理杀软环境验收。
- CodeQL 对生成 bundle 中 Markdown 词法解析表达式的告警不等于存在 HTML 执行入口；
  已有大小写 SCRIPT、异常注释闭合与 javascript 链接安全渲染测试均通过。仅排除两个
  第三方依赖聚合 bundle 的重复扫描，第一方源码与构建脚本继续扫描，不关闭安全查询。
- 上轮代码审核指出的同步准备阻塞控制台、退出时大批 Lua 日志未排空、刷新后 Agent
  证据轮次混用，仍是本轮范围之外的待修复项。不能把本次 PR 评论修复等同于整体发布验收。

## 提交前复验（2026-09-27）

提交检查要求将 Agent 停止校验提取为独立函数，保留原有归属校验和 finally 中的所有者清理，
不跳过 ESLint 或提交钩子。调整后 79 项相关测试通过，双插件重新生成；最终 WorkBuddy bundle
再次通过 8 组真实 Runtime 所有权、刷新、停止、异常回收、故障恢复及同源写入校验。
记录：.maker/direct-preview-3ebebfc2-fb13-47f8-87d6-8c8876f7bf82/evidence.json。
本次提交的双插件 maker.js SHA256 均为：
865E5E2334B2FCCAAF122F4DB8D0F90DC0E75AB3D973B8845E0FC6BFD29CB95B。
下文 ZIP 候选目录与摘要是提取函数前的验收快照，不代表本次提交的最终 bundle；
正式交付应从本次提交重新打包。已知限制没有因提交而变为通过。

## 交付复核结论（2026-09-27）

当前可作为产品经理的「Windows 本地预览专项回归候选」，不标为正式验收全通过，
也不承诺杀软零弹窗。以下复核在本机 Node 22.18.0 / libuv 1.51.0 上完成。

- 发现并修复安装器取消管道继承隐患：真实 Python 子进程继承 stdin 时不能及时执行，
  改用 DEVNULL 后正常完成；未禁用安全软件、未修改引擎、未新增进程代理。
  安装取消、超时、输出超限、解释器异常退出等 8 项真实子进程测试通过。
- 22 套安装、预览、控制台生命周期、网页和双插件包测试：425 项通过、10 项跳过。
  旧扩大回归的 11 项失败中，5 项安装器失败已解决；其余 6 项仍失败，见后面的限制。
- 实测使用真实 ZIP 解压产物，不只是仓库 dist：WorkBuddy 包从空 Home 下载并安装
  Runtime，重复安装复用，然后完成 9 组真实流程；Codex 包用原目录直读模式完成 8 组。
  项目路径包含中文、空格、单引号和 &。新安装记录：
  .maker/direct-preview-fc20a1f1-2d0d-48c3-a772-95705b711651/evidence.json；
  Codex 记录：.maker/direct-preview-eb8a795f-4145-4dc7-8b7e-d274e03d3d1d/evidence.json。
- 覆盖真实窗口、游戏日志、请求 CLI 退出后继续预览、刷新与停止、持有者被强杀后的清理、
  故障恢复；另验证第二个 Agent 和错误 session 不能抢占/停止原会话，活动预览时拒绝关闭
  控制台，外部 Origin、无 Origin 及 cross-site 写请求均返回 403 且不影响正在运行的游戏。
- 额外使用 ZIP 内 WorkBuddy run-node.cmd 真实启动图形场景，从另一条命令读到窗口及
  USER_FLOW_TICK，随后按 session 停止并关闭控制台，确认两个 PID 均退出。
  同包 Agent 运行也得到真实游戏日志；两类引擎错误仍保留为 FAIL。

已测代码的双插件 maker.js SHA256：
613F234E7E1F8D8657E754979AFEE09E5E75666B99C0163109C6DB59F42019FB。
最终候选包位于 .maker/delivery-20260927-reviewed，ZIP 摘要见同目录 SHA256SUMS；
该目录仅是本地测试产物，未发布，未改插件版本。更新文档后重新打包须与上述已测 bundle
摘要一致。正式发版仍走插件独立 release 流程产生新版本，避免同版本缓存复用。

### 交付限制

1. 实际引擎继续报告 Cube/Day/DaySpecularHDR.dds 和 themis_x64.dll；图形场景及 Lua
   更新可运行，但不能据此忽略错误或宣称游戏检查通过，也不从非官方来源补 DLL。
2. FrameCrate 关闭等待 1 项、Git 换行断言 2 项、项目发现长短路径 2 项、CLI Windows
   signal 断言 1 项仍失败。FrameCrate 及项目发现不能仅当作测试断言问题排除；本次不顺手
   修改这些无关实现，也不把它们列入交付通过范围。全仓 tsc 仍失败。
3. 未覆盖产品经理杀软组合、所有 Windows/IDE、创建极短瞬间被杀、实际完整游戏玩法；
   截图和游戏断言 JSON API 未实现。之前的桌面截图只是人工验收证据。

### 给产品经理的最短验收步骤

1. 更新到本次候选版本前，先停止旧预览、关闭旧控制台，再重新载入插件，确认运行的是新包。
2. 打开控制台，未安装则点安装；点本地预览，确认真实游戏画面和运行日志都出现。
3. 刷新三次，每次只保留一个该项目的预览窗口；关闭游戏窗口，再启动一次。
4. 点停止，再关闭控制台，确认测试窗口全部退出；重开后仍能预览。
5. 让 AI 运行一次有时限的调试，确认能读到游戏日志且结束后窗口退出。
6. 若弹出安全拦截，记录窗口标题、被拦程序完整路径、时间和截图；先暂停，勿关闭杀软或
   给整个目录放行。把证据与预览日志交回开发，不将「点击允许后能运行」等同于安全验收。

## 当前实现与实测：直接持有 Runtime（2026-09-27）

本节取代后文阶段 A/B 的默认启动建议；后文保留为历史排查记录，不代表当前流程。

```text
AI 调试 -> 前台 Node -> Runtime -> 读取本轮日志 -> 停止并清理
用户预览 -> 控制台 Node -> Runtime -> 请求 CLI 可退出 -> 用户停止并清理
```

- 控制台不经预览子 CLI 或独立 supervisor；两入口复用进程内 PreviewSession。
  普通 console open/preview start 自动连接或直启控制台，不要求用户先开外部终端。
  supervisor_pid 是兼容字段，现在表示实际持有者的 PID。
- Runtime 使用 Node spawn，shell:false、detached:false；Windows 环境变量使用白名单。
  无 WMI、EncodedCommand、自动 breakaway、Native 安装器或杀软配置变更。
  控制台自身可后台运行；不承诺整个 IDE 的外层 Job 被销毁后仍存活。
- Node/libuv 已有非 detached 子进程的 Windows Job 清理机制，不需要为此再加启动进程。
  本轮使用 Node 22.18.0 / libuv 1.51.0；显式关闭与强制终止分别验证。
  Job 绑定被宿主限制、创建瞬间被强杀、其它 Node/系统组合仍需独立验证，不能承诺绝无孤儿。
- 实测发现 Lua 输出未必进入 stdout/stderr。新增本轮官方 Lua 文件的有界跟随，支持
  引擎延迟创建日志及最多 4 次公布的日志文件；拒绝其它目录、链接和身份变化后的文件。
  游戏日志不能指定任意读文件操作。正常 JSON 是会话证据，不是游戏断言通过。

使用已有真实 Runtime 安装，在新的隔离 Maker Home 与本地离线项目执行：

```sh
node scripts/verify-maker-preview-ownership.mjs dist/maker.js <installation.json>
```

脚本验证 Agent 直接持有、Lua 标记读取、按 session 停止、只强杀 Agent 后 Runtime 退出、
自动控制台在请求 CLI 结束后继续预览、刷新更换 Runtime、停止回收、只强杀控制台后
Runtime 退出，以及故障后重新预览。结果写入 .maker/direct-preview-\*/evidence.json。
2026-09-27 第一轮完整通过记录：direct-preview-7d26467b-8be3-4304-85f4-de798f3850d7。
Codex 插件自包含 bundle 的原目录直读流程也完成相同 5 组验证，项目路径包含中文、空格、
单引号和 &；记录 direct-preview-c0f53b4c-b16a-4502-b9b5-4a69e50ece88。
额外通过两次独立 Agent shell 调用验证：第一次用 Codex bundle 启动后命令退出，第二次
用 WorkBuddy bundle 仍读到同一 Runtime 存活、窗口标题正确及非零窗口句柄，然后按 session
停止并关闭控制台。两插件共用同一版控制台，未调用系统进程代理。
只复用已安装 Runtime，不将本轮称作重新下载安装验收。无服务端构建或发布。

针对性回归 5 套件 105 项通过、1 项跳过；控制台新版入口的 3 项针对性测试通过。
主包 build、Codex/WorkBuddy 插件 prepare 成功，两个插件的 Maker bundle 内容一致。
扩大回归 32 套件：27 通过、5 失败，572 项通过、11 失败、21 跳过；失败集中在
安装器辅助进程、FrameCrate、Git 拉取、Windows SIGKILL 表示及长短路径比较。
这些失败未作为“已通过”掩盖，也未为本次启动改动顺手修改无关实现。全仓 tsc 仍有未解决错误。

未完成/不可推断：产品经理的火绒环境、Windows 11、其它 IDE 的真实整树回收、macOS
强杀清理、创建极短窗口内被杀；截图和游戏断言 JSON 协议仍未支持。仓库级回归中的
Windows 路径、SIGKILL 表示、安装器辅助进程及其它控制台测试失败另行记录，不能宣称全仓通过。

## 追加真实用户验收（2026-09-27）

隔离目录：.maker/user-acceptance-085485b9-6615-44a5-b7c6-0f41451c6096。
该轮从空 Maker Home 开始，未复制旧安装记录；用真实 Chrome 点击控制台按钮：

- 安装 Runtime、确认下载、自动启动项目均完成。安装记录时间为 2026-09-27T07:03:04.225Z。
  运行中重复安装被拒绝；停止后重复安装复用同一可执行文件、哈希和安装时间。
- 桌面截图人工视觉检查到棋盘、绿色方块、红色方块及光照；Lua 更新循环持续输出
  USER_FLOW_TICK。不是仅检查 PID，也不把这个简易场景当作完整游戏玩法验收。
- 对核对路径后的本轮 Runtime 调用 CloseMainWindow（普通关窗请求，非强杀），
  Runtime 退出，CLI 与网页显示已停止；网页再次启动成功。
- 网页刷新经用户确认后更换 Runtime PID、reload_id 递增，旧进程确认退出；
  网页停止预览和关闭控制台成功，最后持有者退出、该隔离安装没有 Runtime 残留。
- 实测发现控制台及 Agent 最终证据原先只读最初 100 行，启动日志遮蔽游戏输出。
  改为有界末尾读取（100 行、64 KiB），保留 CLI 原分页协议，增加 --tail。
  重建后实测网页和 Agent 最终 JSON 均包含 USER_FLOW_TICK，网页显示截断提示。
  同时纠正关闭控制台弹窗，不再声称活动预览不受影响。
- Agent 用最终 WorkBuddy bundle 运行真实场景 25 秒后自动停止；最终 JSON 保留引擎
  Cube/Day/DaySpecularHDR.dds 与 themis_x64.dll 错误，result=FAIL，没有伪造 PASS。

最终 WorkBuddy bundle 另跑完整所有权脚本，5 组通过，记录位于
.maker/direct-preview-39813490-c046-42ba-a8ff-bf18f0414d5a/evidence.json：
AI 直接持有、Lua 日志、显式停止、强杀 AI 清理、请求命令结束继续预览、刷新与停止、
强杀控制台清理、故障后重新启动。两插件 bundle SHA256 相同：
6BAB077FCAB7DEDF37FD88A0E755FA268CDDACCF366DE61195B7DD9868F0D771。

本轮 8 套相关测试共 204 项通过、9 项跳过；主包 build 和双插件 prepare 成功。
此前扩大回归的 11 项失败与全仓类型检查问题仍未宣称解决。
本地证据为 acceptance.json、各阶段 status JSON、agent-final.json 和 runtime-desktop.png。
截图仅是测试桌面取证，不是产品截图 API；尝试键盘输入未取得可验证响应，不计入通过。
产品经理杀软环境、其它 Windows/IDE 组合及完整游戏交互仍需独立验收。

## 历史探针详情（不代表当前默认流程）

本探针不改变生产预览启动器，不启动 Runtime，也不把 Node 进程存活等同于预览验收。

在目标 Windows 10/11、Codex、WorkBuddy 中分别运行：

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/probe-windows-preview-launch.ps1
    # 仅需比较旧路径时，加 -IncludeLegacy
    # 退出当前 CLI 后，在 90 秒内用输出的 directory 再检查：
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/probe-windows-preview-launch.ps1 -Action check -Directory '<directory>'

探针用随机标记和每秒心跳，90 秒后子进程自行退出，不按 PID 杀进程；输出位于用户 LOCALAPPDATA/TapTap/Maker/launch-probes，不含凭据。Alive 仅说明子进程最近写入了匹配本轮随机标记的心跳，不能证明 Runtime 窗口可见、进程已脱离 IDE Job 或安全软件兼容。需要在关闭 IDE 后复查；不能用这个探针代替真实预览验收。

本机首次验证：启动脚本位于 Job Object 中，Node detached、普通 CreateProcess、CREATE_BREAKAWAY_FROM_JOB 和 ShellExecute 四种方式均创建成功，在 CLI 命令结束后再次检查仍有心跳。**未**测试 IDE 关闭、Windows 10/11 双系统、火绒、真实 Runtime 窗口、Host、Job 归属或不同插件分发方式；另一次加 -IncludeLegacy 的本机对照中 CIM direct 和 Hidden EncodedCommand 均创建成功并有心跳，但这不能代替火绒环境验证。因而目前没有证据可以把 breakaway、ShellExecute 或 User Host 切为默认，阶段 A 时旧 WMI 是默认路径；当前阶段 B 见下。后续需在产品经理的火绒环境和 Codex/WorkBuddy 各跑一次完整启动、关闭 IDE、refresh、stop 及资源准备测试，确认归属与失败回收，才可修改默认启动器。

## 隔离新用户安装与真实预览验收

在仓库忽略目录 .maker/e2e-windows-6a94485267cc4a909af138d7c8392284 下，新建独立 TAPTAP_MAKER_HOME 和仅含 .maker-mcp/config.json、scripts/main.lua 的离线项目；没有读取或修改真实游戏目录的发布配置，也未提交/上传。实际运行的 preview install 从缺失变为 ready，生成新的 UrhoXRuntime.exe 和下载包 SHA256；第二次 install 返回同一 executable、installed_at、archive_sha256，验证了幂等。独立项目走 new_project + missing_configuration 的受管理副本/manifest 准备，原目录仍只有两个子目录。start 返回 running，Runtime 有非零窗口句柄，窗口标题被游戏 Lua 设置；CLI 退出后 status 可读，refresh 结束旧 PID 并产生新窗口，stop 后 supervisor 与 Runtime 均退出。包含空格、单引号及 & 的另一个独立项目也完成 start/stop。窗口标题说明 Lua 已运行，不证明全部资源/画面/玩法正常；日志包含缺失可选资源和 themis_x64.dll 的错误。

## 受限 IDE Job 安全验收：失败

为了模拟 AI IDE 回收任务，创建临时未命名 Windows Job Object，设置 JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE；把启动预览的 CLI 在 CREATE_SUSPENDED 状态下精确加入该 Job，再恢复执行。实验 native-breakaway 策略曾在普通本机 CLI 中成功启动，但本次 supervisor 和 Runtime 均被确认属于这个测试 Job；关闭 Job 后两者均退出，窗口消失，状态安全恢复为 failed / process_alive=false。该测试只管理本轮临时 Job 和隔离项目，不按 PID 历史记录或进程名杀其它进程。节点进程、普通 CreateProcess、ShellExecute 与 Shell.Application COM 的隔离探针都仍落入父 Job；仅当前允许 breakaway 的探针 Job 能脱离，不能外推至受限 IDE Job。

因此 native-breakaway **不是可用的默认修复**。仓库内临时加入过显式实验入口用于上述真实预览和失败复现，现已从代码中撤回；阶段 A 曾保持旧 CIM 默认；阶段 B 正常路径已切为用户级 Host / Agent 前台。禁止通过关闭安全软件、放开系统免疫、自动重试未知启动或按进程名结束进程来掩盖失败。需要一个在 IDE Job 外由用户明确启动/安装的用户级 Host（或经过同等实机验证的可信启动方式），再验收安装/重启、Host IPC 身份验证、项目 realpath 与 session 绑定、Runtime 窗口、refresh/stop、受限 Job 关闭、火绒和 Win10/11。未经该验收不可宣称产品经理的问题解决或安全无风险。

## 两入口启动与受限 Job 回归（阶段 B）

正常 Windows 控制台现在由用户在 IDE 外的终端启动 `taptap-maker console serve`，`console open` 仅复用同版本且标记为用户启动的 Host；缺失立即 HOST_UNAVAILABLE。网页 `POST /api/tasks` 不新增任意命令端点，原任务执行器启动预览 CLI；该 CLI 通过 IPC 存活标记、Host instanceId 与真实父 PID 核验后，以普通 Node spawn 启动共享 supervisor。普通 Agent 改用 `preview run --target-dir <项目> --duration-ms 30000 --json`：CLI 保持前台，收集当前轮日志和运行状态，再按 session 停止；当前不支持截图，UNDETERMINED 不等于游戏业务正确。`preview start` 和 `console open` 在 Host 缺失时不会自动回退 WMI；只有用户明确给 `--legacy-wmi` 才使用旧链路。

沿用隔离 Maker Home 与真实安装 Runtime、全新离线项目验证：通过控制台现有任务 API 启动后，Runtime 窗口句柄非零；refresh 更换 PID，stop 后 Runtime/supervisor 退出。Agent run 5 秒返回 started=running、最终 stopped、100 条有界日志；CLI 未停时运行的 Runtime 可由 status 查询。把 Agent CLI 加入 KILL_ON_JOB_CLOSE 受限 Job，supervisor/Runtime 都属于该 Job，关闭后双进程消失，离线状态确认进程已退出。另从受限 Job 的客户端提交控制台 preview.start 任务，Host、supervisor 与 Runtime 都不属于该测试 Job；关闭 IDE 模拟 Job 后窗口仍存活，控制台任务 stop 成功。上述验证来自本机已运行的 Host；不证明一个从 IDE 内错误启动的 Host 可保活。

安全边界：Host 只使用现有注册项目任务及 loopback/Origin 校验；Host 子 CLI 校验所属 server session 与真实父 PID，Windows 子 supervisor 仅继承白名单环境变量。正常启动不通过 WMI、EncodedCommand、隐藏 PowerShell；旧链路保留为显式排障选项。活动预览禁止显式关闭 Host 并阻止其空闲退出；Agent IPC 中断按原 stop 协议收尾，不按历史 PID 或进程名误杀。项目日志中的可选资源和 themis_x64.dll 错误仍可能影响具体游戏，不应把窗口出现视为玩法通过。

剩余上线门槛：必须通过当前发布渠道实际的用户级 Host 首次安装/启动入口验证 Host 确实在目标 IDE Job 之外，并在产品经理的火绒机器、Windows 10/11、Codex/WorkBuddy 上验证被拦截的原操作及正常路径。Norton/Defender/飞连在本机可见，不等于火绒已验收；一次 Windows 防护弹窗“允许”也不是安全审计结论。未经该验收不得承诺任何杀软环境必然放行。

补充验收：已从当前源码生成 Codex 与 WorkBuddy 的完整自包含插件 bundle，两份 Maker bundle SHA256 一致。使用 Codex bundle 启动 Host、WorkBuddy bundle 连接同一 Host 会话并经现有网页任务接口拉起真实 UrhoXRuntime 窗口（窗口句柄非零），再由同一界面停止；两个渠道无需外部 npm/npx。Codex bundle 的 Agent run 也在同一隔离安装中取得运行日志与 JSON 后停止。无 Host 时普通 console open / preview start 返回 HOST_UNAVAILABLE，不运行 WMI；伪造 Host 环境标记而无父进程 IPC 的调用被拒绝。有活跃预览时 Host /api/shutdown 返回 409，停止预览后才能退出。

上线前必须补测真实火绒拦截场景、实际用户从桌面/用户终端而非 IDE 启动 Host 的分发 UX，以及 Win10/Win11 两系统和 IDE 完整退出。上述本机受限 Job 测试仅证明 Host 在**所测试的 IDE Job 之外**时能保活，不证明误从 IDE 内启动的 Host 同样安全；绝不能把一次杀软弹窗点击“允许”视为兼容性结论。
本轮实测操作系统为 Windows 10 专业版 Build 19045；Windows 11 尚未验收。当前 console serve 以前台方式运行，独立终端须保持运行。首次使用无需用户放行 WmiPrvSE.exe，但独立桌面启动器和产品经理火绒环境仍属上线门槛。

针对杀软/权限拒绝还增加了 direct spawn EACCES 测试：立即分类为 NATIVE_LAUNCH_FAILED，不暴露凭据；尚未取得 PID 时不按旧 PID 杀进程，避免无意义的 control-channel 超时。真实目标杀软环境仍需验收。

追加安全场景：独立 Host 的本轮 Runtime 正在运行时，在隔离测试项目中暂时移走 .maker-mcp/config.json，令项目登记暂时失效；Host 的 /api/shutdown 仍返回 409，窗口与 Runtime 进程均存活。恢复原配置后经预览任务正常停止；没有按项目名或 PID 全局清理。这防止项目配置临时失效导致 Host 错误空闲退出。

发布前安全复核还覆盖了两个所有权边界：Agent 在项目锁内再次确认无活动会话，防止并发启动时接管他人的预览；前台 CLI 的 IPC 一旦异常断开，共享 supervisor 按现有协议停止。实机只终止 Agent CLI 的试验中，Runtime 和 supervisor 随后退出，状态保留 failed / process_alive=false / supervisor_retired=true；下一次 preview run 使用新的 session 安全重启。Host 缺失时 console open --json 返回可机器解析的 HOST_UNAVAILABLE，并包含当前 Node 与 bundle 的复制命令，不含 PAT/MAC 凭据。显式 --legacy-wmi 控制台的预览按钮继续显式使用旧启动器，不会暗中切换默认。
