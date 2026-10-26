# Maker Canvas：架构与开发指南

本目录是共享画布的长期开发入口，供 AI 和开发同学定位改动、理解双端边界。
代码权威来源在 Maker MCP 仓库；本地 Maker MCP 与 Maker Web 应消费同一份实现，
避免分别修补编辑逻辑、HTML 快照或复制的类型定义。

## 架构与当前实现

共享包维护一份画布页面主体、编辑规则和业务交互，本地入口只负责接入宿主能力：

```text
本地 console 路由 -> 本地 page.ts / localBrowserHost.ts --+
                                                       +-> browser.getCanvasPageHtml(integration)
Maker Web        -> Web 自己的宿主初始化脚本 ----------+       -> 同一份页面、控制器与规则
                                                               -> CanvasPageHost / Store
```

- `contracts.ts`：文档、媒体、识图、生成与模型任务、模板及自动化命令数据。
- `domain.ts`：`core/` 基础编辑与引用规则、`features/` 素材与流程规则，包括命令校验、
  节点修改计划、资源包成员/过期/完整性/槽位覆盖校验；不依赖 DOM 或 Node。
- `browser.ts`：完整页面创建入口、控制器、展示组件、模板库、媒体处理与编码。
  实例化发生在调用时，导入入口不创建 DOM 或发请求。标准浏览器结构化克隆与历史辅助
  位于浏览器层；Node 宿主复用对应实现时也需提供标准 `structuredClone`。

当前仍沿用 HTML 与 helper `.toString()` 装配，不是重新设计的模块挂载器。
共享 `browser/page.ts` 持有唯一页面主体与共享 helper；本地 `src/maker/canvas/page.ts`
通过 `CanvasPageIntegration` 提供可信的 `hostScript` 和可选 `themeScript`。
`hostScript` 定义 `createCanvasHost(): CanvasPageHost`，只装配宿主适配，不复制页面或控制器。
共享启动调用该工厂；项目 URL 解析、本地 HTTP Store 和缺项目提示均由本地宿主提供。
初始化脚本是应用代码，不能直接使用用户输入拼接。所有模板替换先完成，再注入 helper，
避免通用锚点误改组件内部函数；修改装配时同时核对函数真实名称、闭包依赖与替换顺序。

共享结构校验将媒体引用视为宿主解释的不透明非空字符串，结构合法不代表已授权读取。
本地 `localMediaValidation.ts` 和旧入口薄包装保留原图片/独立 PNG 路径规则；
本地保存、realpath、缺媒体拒绝、revision 和归档保护继续由宿主负责。
资源包完整性算法只有一份，本地通过原校验回调维持严格路径边界。
服务端识图恢复记录不进入共享契约；HTTP Store 只投影恢复尺寸，UI 保留原确认判断。

## 宿主接入

本地仍以无参 `getCanvasPageHtml()` 接入现有 console 路由，页面标识不变。
Web 应直接消费同一份 `browser.getCanvasPageHtml({ hostScript, themeScript })`，
不得复制 HTML 快照或替换共享页面字符串来接入。

`CanvasPageHost` 是当前页面实际接线契约，不是插件注册体系：

- `store` 复用 `CanvasDocumentStore` / `CanvasTemplateStore`，提供文档、媒体地址、
  模板和业务服务。HTTP、内存实现仍在本地目录；Web 提供自己的实现。
- `readSource` 提供可取消的媒体字节读取；现有 WithMedia/WithHost 控制器保持各自
  的明确读取、模型预览来源、识图说明和交付回调。宿主工厂为这些共享控制器补齐回调，
  不维护第二份 UI。视频/图片展示继续使用宿主 Store 的可访问地址。
- `publishUnsaved`、`publishActivity`、`unavailableReason` 提供宿主编辑状态通知和就绪信息；
  `connectAutomation` 只负责命令传输，命令语义与执行器由共享实现维护。
- `onReady(editor)` 在首次授权加载完成后交付 `CanvasEditorHandle`。`current()` 与
  `draft()` 返回副本；`save()` 等待文档保存，`prepareLeave()` 检查编辑面板、帧草稿、
  活动请求及保存结果，返回 false 时宿主必须保留实例。iframe 卸载由宿主负责，
  不在 React cleanup 中发起保存后直接销毁页面；同一 iframe 内不要重复挂载页面。
- `recoverDraft(loaded)` 只在 `store.load` 成功后调用。宿主按用户、项目、画布隔离
  内存草稿，返回先前 `draft()` 的 `{ document, savedLayout }`。保存基线相同时采用
  最新 revision；基线变化时保留草稿原 revision 和基线，让正常保存冲突拒绝覆盖。
  草稿只含已进入文档的编辑，不包含弹窗帧缓冲、生成参数缓存或运行中的请求。
- `editor.importProjectAsset({assetPath, kind, title})` 用于人工素材选择，可在未保存
  文档上添加图片/视频，再调用原保存流程。宿主仍需授权、准备媒体并验证路径；
  保存失败保留原编辑及新卡片。`editor.execute(command)` 继续使用 CLI 的脏状态保护。
- `prepareCanvasImportedNode`、`validateUiAtlasPlan` 保留宿主素材读取及路径约束；
  `downloadCanvasResource` 复用共享编码；`deliverExport` 和 `deliverAutomationExport`
  负责实际交付，`gameUiNextStep` 提供宿主工作流说明。
  `deliverExport({ filename, mime, produce })` 必需提供；先准备目标，再调用
  `produce()` 取得 Blob，以保留原生保存窗口的用户手势。返回 `{status:'saved',path?}`、
  `{status:'downloaded'}` 或 `{status:'canceled'}`；失败抛出。核心不自行选择下载目录，
  也不在缺少回调时偷偷发起浏览器下载。模板、图集、视频历史、模型和截图共用此语义。
  控制器工厂必须转传页面提供的 deliver，不能绕过它直接调用宿主，否则会漏掉离开保护。
  `createCanvasResourceExportWithHost` 的 downloadResource 第九参为本次交付回调，
  适配到 `downloadCanvasResourceWithHost` 的 host.deliver；普通卡片的回调同时核对上游素材。
  `deliverAutomationExport(command, blob, filename)` 在交付成功后可返回 `{path}`；
  共享执行器把它写入 `export.path`。只有真实项目落盘才能返回路径，浏览器下载
  不应伪造沙箱路径；返回 void 保持本地原导出通道。失败必须抛出，不能回报成功。

Web 需要接齐契约中的必需能力；`store.capabilities` 可声明 imageGeneration、
videoGeneration、recognition、model、templateExchange、uiArchive 的 `{available, reason}`。
显式不可用时生成/识图/模型提交入口禁用并显示原因，模板交换隐藏并显示原因；
CLI 实时 inspect 同步能力状态，实际提交仍经相同控制器检查。未声明沿用原行为；
uiArchive 表达宿主保存归档能力，不禁用通用 ZIP 导出，也不替代宿主归档实现。
查询已提交任务及本地预排不等于发起新生成，不由生图能力禁用代替任务恢复规则。
可选服务使用现有 Store/组件可选字段与不可用提示，
不能暗中创建本地 Store，也不能绕过确认门来模拟能力。生成、识图、模型服务及其任务
持久化恢复、认证、项目隔离、预览允许来源、目录和下载策略始终属于宿主。

通用图片/图集/序列帧编码、PNG 校验与 ZIP 字节处理共享；素材读取和下载落点显式传入。
`prepareCanvasImportedNodeFromMedia` 共享图片/视频解码、超时与元数据检查，路径授权
在调用前完成；`detectUiCutoutColorFromReader` 共享底色采样，读取携带取消信号。
`downloadCanvasResourceWithHost` 共享格式选择和导出编排；宿主传入媒体访问、编号、
独立 PNG 与资源包适配和必需的 deliver；本地适配明确选择浏览器保存，CLI 可提供 sink。
`resourceBundleEntriesFromReader` / `createResourceBundleZipWithHost` 共享完整包算法，
接收严格 validation、readSource 和 referenceEntryName。原媒体引用只用于读取，
referenceEntryName 返回包内相对路径；映射后同步 Bbox 路径和 bindings 的 Bbox hash，
源图字节 hash、状态绑定、预算及 ZIP 路径校验仍保留。本地传原路径保持旧格式。
归档落点、项目写入与权限校验仍在外围。
大预设 JSON、Node 文件服务、CLI 说明与命令轮询也保留本地。

已有 Web 接入可按下表移除 localHostHelpers（均从共享 browser/domain 入口消费）：

| 原本地 helper                                   | 共享接法                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| downloadCanvasResource                          | downloadCanvasResourceWithHost，注入读取、编号和包适配            |
| validateResourceBundle                          | validateResourceBundleStructure，第五参传 Web 严格验证器          |
| uiBundleManifest                                | uiBundleManifestWithValidation，显式传同一组验证器                |
| resourceBundleEntries / createResourceBundleZip | resourceBundleEntriesFromReader / createResourceBundleZipWithHost |
| uiDataHash / nextCanvasExportCode               | browser 入口同名导出                                              |
| downloadCanvasImage                             | deliverCanvasImage，显式传 CanvasExportDelivery                   |
| createSequenceExport                            | createSequenceExportFromReader，传读取回调                        |
| detectUiCutoutColor                             | detectUiCutoutColorFromReader，传可取消读取回调                   |

Web 原 `addProjectAsset({path,name,type})` 可在自己的桥接中映射到
`editor.importProjectAsset({assetPath:path,title:name,kind:type})`；无需修改父页面协议。
原 `store.recoverDraft(id)` 可通过 `host.recoverDraft = loaded => store.recoverDraft(loaded.id)`
适配。导出落盘若原先返回字符串，应改为成功后返回 `{path: savedPath}`。

旧 Canvas 入口继续薄转导出或适配，依赖只从宿主指向共享包，包括类型引用。
本包保持 private，不单独发布 npm；Web 外围实现仍由 Web 仓库维护。
完整入口与宿主接线已落到源码，静态约束与运行验收应分开看待；
先前单条链路的验证不代表本次整体结构或 Web 已验收。

## 平台与模板适用范围

宿主在 Store 声明 `platform: 'local' | 'web'`。两端均使用共享
`CanvasPlatform` 类型和 `canvasSupportsPlatform(scope, platform)`，不从 URL、
操作系统或浏览器全局变量推测平台。可选字段是为保留原宿主契约；实际两端均显式赋值。

- 功能沿用 `capabilities`，每个条目可附 `platforms`。统一调用
  `canvasCapabilityReason(store, capability)`：先检查适用端，再检查 available/reason。
  适用端与服务是否已接通、浏览器是否支持此 API 是不同问题，不新增另一套功能注册表。
- 模板与模板摘要使用 `platforms: ['local'] | ['web'] | ['local', 'web']`。省略为双端，
  空数组、重复或未知值报错。保存模板窗口提供选择；列表先筛选后分页，直接添加再次校验。
- 分组使用 `templatePlatforms` 保留来源，选区再次保存默认继承适用范围。多个分组取交集，
  无共同适用端时拒绝混存；用户可在保存窗口明确修改范围。模板归档交换保留标记。
- 已有画布不会因来源模板变为另一端专用而被删除或拒绝打开。标记管理功能/模板入口，
  不提供项目权限、媒体隔离或跨端文件同步。Web 模板的媒体仍受项目素材路径约束。

## 共享服务端识图流程

`domain` 导出 `runCanvasServerRecognition`、`requestCanvasRecognitionStep`、
`uiRecognitionPrompt`、`uiTextRecognitionPrompt` 及相应状态类型。两阶段提示词、
bbox 校验、文本父级归属、原请求恢复和费用汇总从原本地实现抽出，不复制第二套规则。

宿主注入源图校验、请求、持久化与错误脱敏。本地保留 PAT、项目 realpath、原记录目录；
Web 使用现有项目 JWT 接口和素材库，记录仅包含 JSON，不持久化图片字节。查询不提交
下一阶段；显式恢复沿用原幂等键与 24 小时窗口。请求前持久化、未知结果不盲重试。
共享编排不是新的后台任务服务，不保证跨设备原子互斥，也不代替原服务积分结算。

## 业务流程约束

以下约束由共享交互与宿主服务共同保证；Web 外围需按同一语义接入。

```text
编辑 -> 提交时冻结快照 -> 宿主保存 -> 仅确认本次快照已保存
```

保存期间的新编辑仍为未保存状态；版本冲突、保存失败或响应未知时保留草稿，
不得用旧请求的成功响应覆盖新编辑，也不把未知响应直接当作失败后覆盖重试。

```text
素材 -> 宿主读取并提供实际内容版本 -> 共享引用/过期判断 -> 显示或处理
```

引用身份与访问地址分开。宿主可提供 `store.mediaVersions(paths)`，返回路径到真实内容版本
的映射，并让随后 `mediaUrl(path)` 对应这些字节；不能只更新版本字段而继续使用旧 Blob URL。
处理前将实际输入记录为节点 `assetVersion:{path,version}`，已有 sourceSnapshot.version
包含该身份。打开、刷新及再次使用时发现身份变化，已有派生结果沿原规则变为待处理，
不自动重新生成。普通导出只核对自身和上游；整画布截图核对全部素材。
本地使用 SHA-256 与带版本的受控 URL；读取时校验摘要，不匹配拒绝，不返回另一份字节。
本地对已校验字节使用最多 16 项、合计 128 MiB 的进程内缓存，分段读取复用相同内容；
每次请求检查文件身份、大小和修改时间，变化后重新读取并校验。
首次补记内容版本时，旧切图参数仍可用于重新处理，但旧产物不会自动变成已验证的新产物。
版本检查不提供远端任务的不可变上传快照，也不提供跨设备原子保存保证。
旧结果没有内容身份时保留原数据，刷新提示来源待核实，不把当前字节冒充旧任务输入。
未实现 mediaVersions 的宿主仍可运行，但不承诺识别同路径覆盖；Web 须同时更新 HTTP
读取和路径到 Blob 的缓存，不能以本地验收替代 Web 接入验收。

```text
生成 -> 宿主提交并持久化任务 -> 查询/交付
     -> 检查项目、节点、来源仍适用 -> 回填并保存
```

未知任务不盲目重提；下载失败优先恢复原任务交付，不重复付费生成。
停止本地等待不等于取消远端任务；迟到结果不能覆盖已换项目、已删除或来源已变的对象。

## 修改与迭代规范

1. **先定位职责。** 判断需求属于编辑规则、浏览器行为还是宿主服务；
   接口只增加当前真实需要的能力，优先复用已有调用链，不为未来假设扩展框架。
2. **契约只维护一处。** 字段、可选性、联合类型与枚举一起维护，迁移保留原语义
   和必要注释。跨模块引用以共享契约为准，不复制宽类型或用断言掩盖宿主依赖。
3. **区分结构与素材可用性。** 共享结构校验不检查宿主文件是否存在；
   当前本地缺素材拒绝保存的语义暂时保留。跨端策略差异由宿主明确提供，
   不借抽取校验放宽本地保护，也不因缺媒体删除原引用。
4. **来源版本如实表达。** sourceSnapshot.version 由类型、路径、元数据及已记录的
   assetVersion 组成。仅在实际读取或新处理时记录身份，不迁移猜测旧任务输入。
   嵌套外部引用、历史任务和未接入内容版本的宿主，不能宣称已获得完整字节快照保证。
5. **模板是独立实例。** 复制时重映射节点及嵌套引用，清理原生成任务身份；
   不继承实例归档路径，不自动执行生成。示例成果不代表当前实例已完成。
6. **保护已有数据。** 保持项目 realpath 与远端上下文隔离、revision/锁、原子写入
   和权限规则。保存时归档等既有副作用、付费确认门及失败恢复不能在拆分中丢失。
7. **控制改动边界。** 不顺带重写执行器、迁移 UI 编辑器或增加实时协作、
   通用插件框架、持久调度器。必要跨模块修改应能对应真实需求和可证实风险。

## 修改入口

| 入口                                             | 当前用途                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| [src/contracts.ts](src/contracts.ts)             | 数据契约公开入口；按 document、media、ui、operations、templates 归组 |
| [src/domain.ts](src/domain.ts)                   | 编辑、来源依赖及素材纯规则公开入口                                   |
| [src/browser.ts](src/browser.ts)                 | 完整共享页面、控制器、编码、Store 与宿主契约                         |
| [src/core/](src/core/)                           | 基础编辑、连线几何与来源依赖规则                                     |
| [src/features/](src/features/)                   | 图片、序列帧、首尾帧与 UI 识图素材规则                               |
| [旧画布目录](../../src/maker/canvas/)            | 本地薄入口、Store、路径校验、媒体和服务适配                          |
| [本地控制台目录](../../src/maker/console/)       | 本地项目、路由和生成/识图/模型等宿主服务                             |
| [画布操作说明](../../src/maker/canvas/README.md) | 模板、画布 CLI 和用户操作约束                                        |
| [控制台开发说明](../../docs/MAKER_CONSOLE.md)    | 控制台与 Canvas CLI 的对接行为                                       |

新增共享模块应通过实际公开入口接入，避免调用方依赖内部文件布局。
修改本地适配前同时查看调用方和下游，尤其是保存、任务恢复、模板引用和归档。

## 检查与交付

在仓库根目录运行 `npm run maker:canvas:build`，生成被 Git 忽略的
`packages/maker-canvas/dist/{browser,domain,contracts}.mjs` 和 `dist/types/` 声明。
包的根入口及 `./browser`、`./domain`、`./contracts` exports 对应这些产物。
Web 可在自己的生成脚本中导入 `dist/browser.mjs` 的 `getCanvasPageHtml`，传入宿主
脚本和主题，把生成结果作为 Vite raw 资源消费。生成的 HTML 是构建产物，不能手改，
无需导入 `src/maker/canvas` 的私有 helper，草稿、人工导入和导出回执通过正式接口接入。
保留源码 revision/内容指纹用于更新核对；复制产物时包含整个 dist 和 package.json。

构建固定 ES2020、保留函数名且不压缩；不要让消费端先压缩/重命名此生成器再调用它。
宿主应按导出的 `CanvasPageHost` 类型检查返回对象，并验证最终生成页面。
当前仍要求现代浏览器的 `structuredClone`、`createImageBitmap` 等 API；该产物不承诺
Chrome 74 兼容。若 Web 必须支持旧 WebView，需要单独核定运行时能力及脚本转译，
仅把 Vite target 设为 es2018 不会转译 HTML 内脚本，也不能补齐缺失的 API。

从仓库根目录运行共享包的独立类型检查：

```sh
npm run maker:canvas:check
```

该命令依次运行 tsconfig.domain.json 与 tsconfig.json，均使用 strict、noEmit 和
types: []。前者以 ES2020 检查 contracts/domain 及其传递依赖，不允许 DOM/Node 类型；
后者以 ES2020 + DOM + DOM.Iterable 检查完整共享包，允许标准浏览器能力但不引入 Node 类型。
这些静态约束不代表整个画布已完成浏览器兼容验证。

共享源码已纳入根 lint 与 format:check，PR build job 调用上述独立类型检查；
本地 Maker 的现有 esbuild 入口通过旧模块解析共享源码，release-scope 包含本目录。
根 TypeScript 配置负责 IDE 与静态检查，使用 noEmit，不限制跨目录导入；
入口仍限于 src，被旧入口引用的共享源码进入检查图。共享包另有独立检查配置，
防止宿主类型泄漏；运行产物由现有 esbuild 脚本生成，不由根 tsc 输出。

验证按风险覆盖两端直接相关的调用链；尚未接入的端或能力明确列为未验证。
优先通过本地用户实际操作验证编辑、撤销、保存重开与来源变化，不以脚本断言替代。
涉及构建时，同步核对脚本注入、产物、CSP 及相关验证载体，
不得通过放开 unsafe-inline 或 unsafe-eval 绕过模块装配问题。

静态检查和打包成功不能写成运行验收通过；具体命令只使用现有脚本，
检查范围与改动风险相称。交付说明保留实际结果及未验证边界，不把临时验收记录
写入本指南。用户数据、运行中的服务与未保存草稿始终按原保护流程处理。
