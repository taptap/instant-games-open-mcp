# Maker 本地控制台

控制台是 Maker CLI 的本机网页入口，随包分发，无需安装前端开发环境。

页脚版本信息右侧在日签预加载成功后才显示淡黄色“独立游戏开发日签”入口。悬停或点击后只展开内嵌内容，无标题或关闭按钮。
iframe 同源代理公开日签页，使用 `theme=dungeon` 与控制台相同的 `mode=light|dark`，切换深浅色时同步刷新；按内容高度自适应，不传项目数据或凭证，并使用 no-referrer。
不允许弹窗或顶层导航。鼠标离开入口和浮层后延迟关闭，避免闪缩。访问不到上游时不显示入口。

## 文档 / Skill

顶部“文档 / Skill”提供开发文档、项目文档、Skill 三个子页签，左侧分类及搜索，右侧阅读 Markdown。
开发文档包含 Maker 内置资料、engine-docs、urhox-libs、examples、templates；
项目文档包含项目根 README/AGENTS/CLAUDE 和 docs，Skill 保持独立。
开发文档顶部“常用功能”突出广告接入、云存档与排行榜、多人联机，使用黄色加粗；
补充服务端云存储、UI、资源加载及预览排障入口。重点资料展示用途、适用范围和已有相关资料，
原始正文保持不变。广告流程直接复用 `maker://ads-integration-guide` 的 MCP 内容；
广告 Skill 仅在当前资料目录确实存在时显示和关联，不跨项目借用，不隐式安装。
未选择项目时可阅读 Maker 随包控制台、预览、排障文档与官方 Skill；选择项目后合并展示
项目根 README/AGENTS/CLAUDE、docs、engine-docs、urhox-libs、examples、templates，
以及 `.installer/skills`、`skills` 和常见 AI 客户端目录中的 Skill 资料。
同一真实文件去重，不扫描隐藏计划、凭证、node_modules 或项目外链接目录。
目录仅收录 Markdown，单文件上限 1 MiB、最多 600 份；文件修改后可点击“刷新目录”。
目录中的相对文档链接可跳转；外部网页在新标签打开。图片暂显示替代文本，不加载远程资源。
原始 HTML 以文本显示，不执行脚本。此入口仅阅读，不安装或执行 Skill，不新增 MCP tool。
正文标题旁可“复制文档链接”，本地文档和 Skill 复制真实绝对路径，MCP 资源复制
`maker://` URI，便于粘贴给本机 AI 客户端；不复制控制台 URL 或访问凭证。

构建与测试页在操作区下方提供通栏日志区，按构建、Lua 检查、Runtime 分页签查看，
支持刷新、复制及自动换行。上方仅展示简短状态；日志按项目隔离，后台刷新不切换所选日志。
Runtime 日志按需读取，不自动持续拉取。

标题旁的版本下拉框显示当前运行版本及 npm 最近发布的 5 个版本；同渠道有更新时黄色提醒。
选择其他版本需二次确认，Beta 和降级会明确提示。控制台通过所选精确版本的现有
`upgrade --launcher self --json` 流程校验并更新客户端配置，不新增 MCP tool。
安装完成后需重新连接 AI 客户端 MCP；当前控制台不会自动切换版本或中断预览。
插件渠道只显示当前版本，须通过对应插件市场更新。查询失败可在下拉框中重试。
更新任务保存在当前控制台进程中，执行期间禁止重复更新及主动关闭，不触发空闲退出。
更新异常不自动重试；部分客户端配置可能已更新，应检查后再决定是否重试。

## 使用

在游戏项目对话中说“打开控制台”，或运行：

```sh
taptap-maker console open --target-dir <游戏项目绝对路径>
taptap-maker console status --json
taptap-maker console stop --json
```

`open` 自动打开浏览器；加 `--no-open --json` 只返回地址。不指定项目时展示项目列表，
不自动选择。相同 Maker 版本从 Codex、WorkBuddy 或独立 CLI 重复打开时复用同一个用户级服务；
切换版本前先停止旧控制台。
仅支持本机访问，不支持局域网或 SSH 转发。会话地址含访问凭证，不要分享。

- 项目列表登记已绑定的本地目录，不扫描磁盘。init/clone 成功后自动登记，
  已有项目可点击“打开本地文件夹”，通过 macOS / Windows 系统窗口选择项目或父目录。
  仅在用户选择的目录中按 `.maker-mcp/config.json` 项目绑定校验并批量登记，重复项目跳过；
  不自动初始化、构建或切换项目。取消选择不修改登记；读取或校验失败显示汇总。
  遇到有效项目不再深入其内容，跳过依赖目录及子目录符号链接；
  扫描最多 8 层、5000 个条目、200 个项目或 10 秒，达到限制会提示缩小选择范围。
  移除记录不删除游戏。
- 项目页顶部展示本机 Runtime 和独立 maker-lua-lsp 安装状态（是否安装、版本）。Runtime
  在 `~/.taptap-maker/runtime/` 登记并由所有项目共用，切换项目不会要求重复安装；旧项目级安装
  会自动登记为本机安装。Lua LSP 未安装不影响控制台连接。已安装 Runtime 时优先显示版本，
  没有版本时显示安装时间，未安装时可进入现有 Runtime 安装流程。
- 构建页提供独立“Lua 检查”按钮，检查当前项目 scripts。构建按钮旁默认勾选“构建前检查 Lua”，
  勾选后先检查，发现 Lua 错误则停止提交和远端构建；取消勾选可直接构建。LSP 未安装时提示
  环境问题，不把安装缺失当成代码错误。勾选状态保存在本机浏览器。
- 项目页的构建和本地预览快捷操作会先切换到“构建与测试”。构建调用现有 CLI，可能提交并推送
  代码；页面显示真实阶段及该阶段的进度，没有有效比例时显示不定进度，不拼接虚假的总进度。
  Git 提交失败和服务端返回的错误默认展开，包含分类、命令、stderr 和下一步，不要求先打开
  任务详情。最近构建详情和 Runtime 日志使用整行宽度，结果未知时先核实，不自动重试。
- 本地预览的安装、启动和刷新见[预览指南](MAKER_LOCAL_PREVIEW.md)。
  预览状态使用中文展示；Runtime 进程仍存活但日志出现资源等错误时，页面保持“运行中”并单独
  标记日志错误数量，用户可直接查看运行日志。会话 ID、Runtime PID 等技术字段收纳在折叠的
  诊断信息中，不占用主要状态区域。
- Lua 检查结果以构建页的检查摘要和问题列表为主；对应失败任务不自动展开，也不重复展示与
  结构化结果相同的原始输出。完整原始结果仍保留在折叠详情中供排查。
- Git 页只读展示提交关系、日期和差异；浅克隆的历史不完整，不提供分支或回退操作。

## 控制台插件与 FrameCrate

### 2026-09-16 集成纠正

用户已否定另开浏览器标签的启动器方案。本轮目标是**通用插件注册表 + 持久内嵌完整
FrameCrate 标签页**；本轮本地验证与独立复核已完成，5 项集成 findings 全部关闭。
Maker 7 套件 139 项、FrameCrate 46 套件 665 项、两仓库构建及实际内嵌浏览器 9 步通过。
控制台 Web 32 项、Russell Maker 83 项及 FrameCrate 61 项通过，无剩余高置信度阻塞问题。
Maker 全仓 tsc 仍有 287 项基线错误，控制台范围无诊断；FrameCrate 保留既有大 chunk 警告。
真实 AI、计价、付费生成和 Windows 仍未验收，不以本地通过替代这些边界。

- `src/maker/console/plugins.ts` 维护类型化的可信插件注册表；
  `integrations/framecrate.ts` 只实现 FrameCrate 启动与进程适配，不承载编辑或 AI 业务。
- `GET /api/state` 的 `plugins` 提供公开插件元数据，不含 Studio token、启动命令或私有环境。
  页面按元数据展示插件标签，而非硬编码 FrameCrate 专属启动按钮。
- `POST /api/projects/:key/plugins/:id/open` 只打开注册表中的可信插件，复用 Host、Origin、
  Bearer 校验，并在每次打开或复用前检查登记项目的 realpath 和 Maker 绑定。
  浏览器不能提交启动命令、安装路径或任意目标 URL；不增加 MCP tool。

### 配置与会话

在启动控制台的进程环境中显式设置 `FRAMECRATE_STUDIO_DIR`，指向已安装依赖并构建前端的
framepacker Studio 根目录绝对路径。控制台按项目打开内嵌标签，不弹出新窗口。
未配置或目录不完整时显示不可用原因；本轮不做安装器、ZIP 下载、插件市场或自动更新。

FrameCrate 子进程启动契约为：

```text
<process.execPath> --import <FRAMECRATE_STUDIO_DIR>/node_modules/tsx/dist/loader.mjs
  <FRAMECRATE_STUDIO_DIR>/server/main.ts --project <已校验的项目 realpath>
  --host-origin <控制台精确 loopback origin>
```

这是同一条命令，使用明确 Node、`shell: false` 和 Studio 根目录作为 `cwd`；
继承受信启动环境，不从游戏目录解析 Studio 模块，不触发生成、构建、提交或发布。
`--host-origin` 必须是当前控制台的精确本机 HTTP origin（含端口，无路径），
不能替换成通配符、另一端口或仅因同属 loopback 就信任的地址。

Studio 就绪 JSON 交付本机 URL 和匹配的 `projectPath`，URL fragment 使用 Studio 自有 token。
控制台仅将经校验地址交给对应 iframe，不共享控制台 Bearer 或 PAT；不将 token/URL 写入
任务历史、`/api/state` 或 MCP 配置。stderr 仅消费，不转发凭证。Studio 仍独立运行本地服务；
内嵌模式的 CSP `frame-ancestors` 仅允许 `--host-origin` 指定宿主，独立启动不开放被嵌入权限。

### 内嵌协议与生命周期

- 消息固定使用 `protocolVersion: 1`：宿主发送 `maker-console:connect`，
  主题变化发送 `maker-console:theme`，子页面回应 `maker-console:plugin-ready`，
  真实用户活动通知为 `maker-console:plugin-activity`。连接和主题消息携带 `light`/`dark`，
  插件跟随控制台主题且不维护独立主题状态。
  双方校验精确 `origin`、窗口 `source`、消息类型与版本，发送时指定目标 origin；
  消息不传 token，也不是生成、保存、任意命令或自动重试通道。
- iframe 使用 `sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"`，
  不允许 popup 或 top navigation；保留本地导入、编辑、导出、工程保存恢复及完整 AI 工作流。
- 页面按项目与插件标识保留 iframe map，最多 8 个工作区。切换项目或标签只隐藏页面，
  不删除 DOM、不重写 `src`，不静默淘汰旧工作区。达到上限应拒绝新增并提示先保存。
  需要重连时由用户明确操作并提示可能丢失未保存编辑，不因超时自动重建 iframe。
- 同项目复用本控制台拥有的存活子进程；启动中或存活时不得被控制台自动空闲退出误杀。
  真实插件活动参与有界续期；插件轮询、握手和定时消息不能伪造用户活动。
  控制台宿主页自身通过有界页面租约保活，不能由 iframe 绕过宿主生命周期。
  最后一个子进程退出后恢复空闲计时；显式停止仅回收本实例启动的进程，不影响独立 Studio、
  IDE MCP 或 Runtime，也不等于取消已提交的远端视频。
- ready 子进程正常关闭等待 graceful drain，无强制超时；若它永久挂起，关闭会持续等待，
  这是避免截断写入的安全取舍，不承诺限时退出。未完成启动的回收仍可强制终止。

### 本轮本地验收（已完成）

- 注册表元数据及通用打开路由覆盖合法、未知插件和失效项目；拒绝任意命令/路径。
- 精确宿主 CSP、独立 token、消息 origin/source/版本校验及 sandbox 权限均有负向测试。
- 桌面与窄屏真实浏览器中验证完整编辑及 AI 页面；跨标签、跨项目保留未保存编辑、
  8 个会话容量与超限行为，无弹窗、静默淘汰或自动重新生成。
- 启动失败、断连、显式重连、空闲及关闭的归属清理已完成本轮回归与独立复核。
  付费生成仍需单独预算确认；测试桩不得冒充真实 AI 验收。

实际内嵌浏览器证据持久保存在
`/Users/liangdong/Documents/MakerTools/framecrate-review-evidence/console-plugin-20260916/report.json`，
报告 9 步全部通过，包含自刷新 200、重连、项目隔离、PNG/工程输出及窄屏验证；
外部请求、生成请求和付费调用均为 0。独立工作台追加 smoke 的 1 次 fixture 提交不是付费生成。

## 生命周期与恢复

服务自动分配空闲端口。控制台页面存活时每分钟续期，重新获得焦点或恢复可见时立即续期；
普通状态轮询和健康检查不续期。页面关闭、浏览器退出或租约停止后，无任务时约 30 分钟退出，
任务结束后重新计时。关闭浏览器不会终止任务，`stop` 在任务执行中拒绝退出。
停止控制台不停止独立 Runtime。

Windows 上 `console open` 通过本机 PowerShell/CIM 系统代理创建服务进程，不依赖短命令的
Node 子进程在 AI IDE 任务树中继续存活。系统代理只传递控制台需要的非敏感环境变量；PAT、
MAC token、client secret 等凭证不进入启动命令。macOS/Linux 保持 detached Node 启动。

启动锁恢复使用短期 loopback socket 互斥，进程退出后由操作系统释放，不增加额外磁盘互斥锁。
已有 `.recovery` 文件仅在持有互斥且确认所属进程不存在时回收；空文件需超过 2 秒。
存活、权限不明或内容损坏的非空锁保持拒绝接管。互斥端口被占用时不会干预占用者。
升级测试前应结束旧版启动命令；旧版不参与 socket 互斥，无法保证与新版同时恢复空锁的安全性。

断连后重新运行 `console open` 获取新会话地址，旧端口和凭证可能失效。
网页不能自行启动已退出的 Node 服务，不设常驻唤醒进程。
任务历史和输出有上限，不作永久归档；异常退出时未完成的任务标为“结果待确认”。
Git 401/403 应检查凭证和项目权限，BLACKLISTED 需管理员解除账号限制。

## 维护约束

本地预览窗口设置通过项目绑定的 `/api/projects/:key/preview/window` 写入本机偏好，
复用 Origin/Bearer 校验；项目任务执行中拒绝保存。方向支持跟随项目、横屏、竖屏，
无方向配置时默认横屏。提供 16:9、21:9、4:3 和可保存的自定义尺寸；不修改发布配置，
保存后仅在下次启动/刷新应用。详见 `MAKER_LOCAL_PREVIEW.md`。

启动或刷新本地预览前检查 Git 工作区中的服务端 Lua 改动（含暂存、新增、删除、重命名）。
识别 `entry@server` 入口及其专属子目录、`server` 目录/入口文件，以及 `.meta` 的 `s`/`cs`
标记；检测到后显示可关闭的非阻塞提示，建议提交构建后再预览。不自动提交或远端构建。
检查限时 2 秒，失败不阻止预览；不分析完整依赖图，不判断已提交代码是否部署到服务端。

- 浏览器 `project` 参数是本地登记标识，每次操作显式携带，由服务端解析并验证 realpath
  与 Maker 绑定，不使用全局当前项目。不同 checkout 分别登记；目录迁移或重绑后需重新添加。
- 服务仅监听 `127.0.0.1`，校验 Host、Origin 和 Bearer；PAT 不进入网页，
  会话凭证不写入项目。只开放固定 CLI 操作，不提供任意 shell 或文件浏览。
- 控制台 Bearer 保留在 URL fragment 中，避免浏览器恢复或新标签重建时因
  `sessionStorage` 隔离而丢失会话。fragment 不会随 HTTP 请求或 Referrer 发送；页面保持
  `no-store`、无远程依赖，并继续执行 Host、Origin 与 Bearer 校验。
- 项目登记统一使用 Maker user home 的 `projects.json`；写事务加跨进程锁并原子替换。
  旧控制台列表只迁移一次，登记失败不改变 init/clone 结果。
  遗留登记锁不能按时间抢占，确认写入进程已停止后才处理提示的 `.lock` 目录。
- 查询、任务、输出和历史均设上限；退出清理连接、定时器和本实例状态。
  只清理已确认所有权的进程，不按名称终止。生命周期和存储实现分别见
  `src/maker/console/`、`src/maker/projectRegistry.ts`。
- macOS/Linux 的 CLI 进程组守卫是 best-effort；同步阻塞可能延迟父进程退出后的回收。
  Windows 控制台服务使用系统代理脱离 AI IDE 任务树；该启动链路仍需 Windows 实机验收。
  控制台执行的直接 CLI 子进程已覆盖终止测试，辅助进程清理仍需实机验证。
  固定 Runtime 安装器另有清理确认机制，不能据此推断所有 CLI 子进程均已回收。
