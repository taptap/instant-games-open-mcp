# 本地与Web接入

[返回共享画布入口](../README.md)

修改两端适配、素材读写、保存恢复或服务交付时阅读。这里只说明共享接入契约，
各端认证配置、部署和文件服务实现仍由对应宿主维护。

按需定位：[页面接入](#页面接入与职责)、[平台开关](#平台与能力开关)、
[素材与交付](#素材读取与交付)、[保存与任务](#保存来源版本与任务恢复)、
[视频服务](#视频服务)、[构建验证](#构建与验证)。

类型入口：[CanvasPageHost / CanvasEditorHandle](../src/browser/pageHost.ts)、
[Store](../src/browser/store.ts)、[功能开关](../src/browser/capabilities.ts)、
[交付回执](../src/browser/exportDelivery.ts)。以下解释语义，不另维护完整字段清单。

## 页面接入与职责

共享页面、控制器和规则由本包提供；本地与 Web 的工厂负责装配各自的 Host / Store。
`contracts/domain` 不依赖 DOM 或 Node，`browser` 导入时不创建 DOM、不发请求。
标准浏览器结构化克隆与历史辅助位于浏览器层；Node 宿主复用时也需提供标准 `structuredClone`。

当前仍沿用 HTML 与 helper `.toString()` 装配，不是重新设计的模块挂载器。
共享 `browser/page.ts` 持有唯一页面主体与共享 helper；本地 `src/maker/canvas/page.ts`
通过 `CanvasPageIntegration` 提供可信的 `hostScript` 和可选 `themeScript`。
`hostScript` 定义 `createCanvasHost(): CanvasPageHost`，只装配宿主适配，不复制页面或控制器。
共享启动调用该工厂；项目 URL 解析、本地 HTTP Store 和缺项目提示均由本地宿主提供。
初始化脚本是应用代码，不能直接使用用户输入拼接。所有模板替换先完成，再注入 helper，
避免通用锚点误改组件内部函数；修改装配时同时核对函数真实名称、闭包依赖与替换顺序。

共享结构校验将媒体引用视为宿主解释的不透明非空字符串，结构合法不代表已授权读取。
本地 `localMediaValidation.ts` 和旧入口薄包装保留原图片/独立 PNG 路径规则；
保存时的素材可用性策略、realpath、revision 和归档保护继续由各端宿主负责；
结构校验不代替文件授权，也不因媒体缺失删除原引用。
资源包完整性算法只有一份，本地通过原校验回调维持严格路径边界。
服务端识图恢复记录不进入共享契约；HTTP Store 只投影恢复尺寸，UI 保留原确认判断。

本地仍以无参 `getCanvasPageHtml()` 接入现有 console 路由，页面标识不变。
Web 应直接消费同一份 `browser.getCanvasPageHtml({ hostScript, themeScript })`，
可以脚本生成 HTML 快照并记录来源版本；不要手改快照或替换内部页面字符串维护分叉。
宿主脚本和主题通过正式接入参数提供。

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
  最新 revision；基线变化时保留草稿原 revision 和基线，由宿主既有保存冲突策略处理，不冒充已与新基线合并。
  草稿只含已进入文档的编辑，不包含弹窗帧缓冲、生成参数缓存或运行中的请求。
- `editor.importProjectAsset({assetPath, kind, title})` 用于人工素材选择，可在未保存
  文档上添加图片/视频，再调用原保存流程。宿主仍需授权、准备媒体并验证路径；
  保存失败保留原编辑及新卡片。`editor.execute(command)` 继续使用 CLI 的脏状态保护。

## 平台与能力开关

三者职责不同，组合使用，不互相替代：

- `store.platform` / 模板 `platforms`：能力或模板适用于哪一端；本地为 `'local'`，Web 宿主
  消费本包时应显式声明 `'web'`，否则带平台限制的模板会被过滤。
- `host.features`：只决定页面显示哪些入口（按钮、菜单）；隐藏入口不是权限控制，
  也不会禁用对应的 Agent 命令。
- `store.capabilities`：某类服务是否已接通及不可用原因。

默认外观保留本地既有分组与模板入口；`connectors`、`spriteGen` 和 `imageTools` 需显式开启。

开启功能时需要接齐对应契约；`store.capabilities` 可声明 imageGeneration、
videoGeneration、recognition、model、templateExchange、uiArchive 的 `{available, reason}`。
显式不可用时生成/识图/模型提交入口禁用并显示原因，模板交换隐藏并显示原因；
CLI 实时 inspect 同步能力状态，实际提交仍经相同控制器检查。未声明沿用原行为；
uiArchive 表达宿主保存归档能力，不禁用通用 ZIP 导出，也不替代宿主归档实现。
查询已提交任务及本地预排不等于发起新生成，不由生图能力禁用代替任务恢复规则。

宿主在 Store 声明 `platform: 'local' | 'web'`。两端均使用共享
`CanvasPlatform` 类型和 `canvasSupportsPlatform(scope, platform)`，不从 URL、
操作系统或浏览器全局变量推测平台。可选字段是为保留原宿主契约；实际两端均显式赋值。

能力条目可附 `platforms`；`canvasCapabilityReason(store, capability)` 先检查适用端，再检查
available/reason。平台适用性、服务是否接通与浏览器 API 支持是不同问题。

模板适用范围与实例规则见[画布功能与业务规则](画布功能与业务规则.md#模板与平台适用范围)。

`host.features`（`CanvasPageFeatures`）只控制页面入口显示，不过滤自动化命令；
开放 `execute` 的宿主须自行做动作白名单。以下是入口说明，默认值以[功能开关类型](../src/browser/capabilities.ts)为准：

| 键             | 设为 false 时隐藏                                                                    |
| -------------- | ------------------------------------------------------------------------------------ |
| templates      | 添加模板、模板右键菜单（保存/替换模板、分组重命名）；015 等流程入口                  |
| uiRecognition  | 导入 UI 设计稿、识别 UI / 查看标注                                                   |
| video          | 导入视频、视频输入卡、视频历史、右键新建视频卡、视频生成、拖线建视频卡               |
| sequence       | 拆序列帧                                                                             |
| model3d        | 模型卡片上的预览与操作（创建入口本就只在模板/CLI）                                   |
| uiEditor       | 导出后「组装游戏 UI」交接                                                            |
| resourceExport | 分组/资源包的导出与汇总资源；图片 PNG/JPG 下载保留                                   |
| sections       | 新建分区                                                                             |
| imageEditing   | 快速编辑、扩展画面、去纯色背景、本地编辑                                             |
| cutout         | 选中菜单「去纯色背景」（Web 为一键「抠图」+「调整抠图」）；未声明时跟随 imageEditing |
| connectors     | 默认关闭；设为 true 才显示图片左右连接点并允许选中连线删除                           |
| spriteGen      | 默认关闭；设为 true（仅 Web 外观）且宿主提供 `startSpriteGen` 才显示「生成精灵」     |
| imageTools     | Web 外观的裁剪、旋转与翻转；默认关闭                                                 |

开关按当前接入能力配置；关闭某功能是接入状态，不是后续开发的永久限制。
`uiEditor` 只控制导出后的组装交接，不会自动引入独立 UI 编辑器。

可选服务使用现有 Store/组件可选字段与不可用提示，
不能暗中创建本地 Store，也不能绕过确认门来模拟能力。生成、识图、模型服务及其任务
持久化恢复、认证、项目隔离、预览允许来源、目录和下载策略始终属于宿主。

## 素材读取与交付

- `prepareCanvasImportedNode`、`validateUiAtlasPlan` 保留宿主素材读取及路径约束；
  `downloadCanvasResource` 复用共享编码；`deliverExport` 和 `deliverAutomationExport`
  负责实际交付，`gameUiNextStep` 提供宿主工作流说明。
  `deliverExport({ filename, mime, produce })` 必需提供；先准备目标，再调用
  `produce()` 取得 Blob，以保留原生保存窗口的用户手势。返回 `{status:'saved',path?}`、
  `{status:'downloaded'}` 或 `{status:'canceled'}`；失败抛出。核心不自行选择下载目录，
  也不在缺少回调时偷偷发起浏览器下载。模板、图集、视频历史、模型和截图共用此语义。
  控制器工厂必须转传页面提供的 deliver，不能绕过它直接调用宿主，否则会漏掉离开保护。
  `createCanvasResourceExportWithHost` 转传本次交付回调至 `downloadCanvasResourceWithHost` 的 host.deliver；
  普通卡片的回调同时核对上游素材。参数位置以类型定义为准。
  `deliverAutomationExport(command, blob, filename)` 在交付成功后可返回 `{path}`；
  共享执行器把它写入 `export.path`。只有真实项目落盘才能返回路径，浏览器下载
  不应伪造沙箱路径；返回 void 保持本地原导出通道。失败必须抛出，不能回报成功。

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

主要复用入口：`validateResourceBundleStructure`、`uiBundleManifestWithValidation`
接收宿主的严格验证器；`createSequenceExportFromReader` 与 `detectUiCutoutColorFromReader`
接收媒体读取回调；`deliverCanvasImage` 接收交付回调。
这些函数从 [browser](../src/browser.ts) / [domain](../src/domain.ts) 导出，
本地薄适配仍可复用，Web 不需要依赖本地私有 helper。

### 素材引用和宿主交互

文档保存素材引用，访问时由宿主转换成授权 URL 或 Blob。临时 Blob URL、带凭证的访问地址
不作为持久化素材身份；本地路径不能直接当作远端素材地址。引用结构合法不代表允许读取。
模板交换时映射到目标端的实际引用，包内文件名与来源路径分别处理。

`addToChat`、`pickProjectImages` 和 `toggleAssetPanel` 等可选钩子让共享页面调用宿主的对话和素材面板；
缺省时对应入口不显示。素材选择仍经 `prepareCanvasImportedNode` 校验。
`editor.reload()` 用于外部文件变化：保留视口和仍存在的选中，有未保存编辑、导入、草稿或任务时
返回 false，不覆盖本页工作；重读后重新建立撤销历史。
宿主只隐藏面板而不卸载时用 `setPanelVisible` 通知，暂停不可见面板的轮询、动画和视频。

## 保存、来源版本与任务恢复

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
本地复用已校验字节，文件身份、大小或修改时间变化后重新读取并校验；
具体缓存预算由本地实现维护。
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

## 视频服务

`createVideo` 提交视频生成，`importVideo` 导入 Blob 并返回 `{relativePath}`。
完整字段参考 [Store](../src/browser/store.ts) 与 [生成面板调用](../src/browser/generationUi.ts)。

- 输入模式包括文生视频、首帧、首尾帧与多图参考。Web 文生视频不带图片字段，比例不能为
  `adaptive`；返回尝试也不伪造来源图片或快照，按零来源回填。
- 页面目前使用模型 `'2.0' | '2.5'`，不调用 `videoModels`；2.5 在默认外观由页面确认，Web 由宿主确认。
- 返回尝试保留目标卡片、远端任务、结果路径、来源快照、状态、错误与费用信息；
  只有来源快照与已保存文档一致时才回填，不能只凭生成成功覆盖已变更的卡片。
- `videoHistory(offset, 30)` 返回 `{items, total, busy?}`，`listGeneration` 也需包含视频尝试；
  `generationAction` 复用 query / retry / cancel 语义，其中 cancel 是停止等待。

页面可提交的模型和参数范围需与宿主、实际服务相容；先核对产品用途与限制原因，
不能只放宽界面，也不能为匹配模型上限直接删除宿主校验。本地序列帧用途通常只需 4–5 秒，
短时长有控制生成费用、便于抽帧的目的；具体场景与历史差异见[视频时长问题](常见问题与兼容冲突.md#web-同步共享画布时视频时长选项与提交校验可能不一致)。

## 构建与验证

在仓库根目录运行 `npm run maker:canvas:build`，生成被 Git 忽略的
`packages/maker-canvas/dist/{browser,domain,contracts}.mjs` 和 `dist/types/` 声明。
包的根入口及 `./browser`、`./domain`、`./contracts` exports 对应这些产物。
Web 可在自己的生成脚本中导入 `dist/browser.mjs` 的 `getCanvasPageHtml`，传入宿主
脚本和主题，把生成结果作为 Vite raw 资源消费。生成的 HTML 是构建产物，不能手改，
无需导入 `src/maker/canvas` 的私有 helper，草稿、人工导入和导出回执通过正式接口接入。
保留源码 revision/内容指纹用于更新核对；按接入方式保留所需产物及其依赖，包消费入口见 package.json。

构建目标为 chrome74、保留函数名且不压缩；不要让消费端先压缩/重命名此生成器再调用它。
宿主应按导出的 `CanvasPageHost` 类型检查返回对象，并验证最终生成页面。
页面内脚本由 HTML 字符串拼装，esbuild 打包看不到；构建先生成页面，再把内联脚本整体降到
chrome74，dist 的 `getCanvasPageHtml` 直接返回降级后的页面（源码入口与本地控制台不变）。
`hostScript` / `themeScript` 原样插入，宿主须自行保证其可在 Chrome 74 运行
（如用 esbuild 以 chrome74 转译后再注入）。页面最先执行 `installCanvasPolyfills()`，
按特性检测补 structuredClone、crypto.randomUUID、Object.hasOwn、Array/String.prototype.at、
replaceAll、findLast/findLastIndex、Promise.allSettled、Element.replaceChildren、
Blob.arrayBuffer/text、AbortSignal.timeout。`body.inert` 在旧内核上不生效，CSS 中的
`inset`、flex `gap` 等仅影响样式，未做降级。`createImageBitmap` 仍依赖浏览器原生实现。

在源码仓库根目录运行 `npm run maker:canvas:check`，分别检查纯规则层和浏览器层；
配置见 [tsconfig.domain.json](../tsconfig.domain.json) 与 [tsconfig.json](../tsconfig.json)。
两者都是 strict / noEmit，不引入 Node 类型；纯规则层不允许 DOM 类型。
构建由现有脚本生成产物，类型检查不输出运行代码。

需要浏览器兼容验证时，构建后可运行源码仓库的 `node scripts/test-maker-canvas-web-basics.mjs`。
它检查降级语法，并在移除相关原生 API 的 Chromium 中跑 Web 形态宿主链路，
不等于真实 Chrome 74 设备验收，也不能替代 Web 项目自身的适配验证。

验证按风险覆盖两端直接相关的调用链；尚未接入的端或能力明确列为未验证。
优先通过本地用户实际操作验证编辑、撤销、保存重开与来源变化，不以脚本断言替代。
涉及构建时，同步核对脚本注入、产物、CSP 及相关验证载体，
不得通过放开 unsafe-inline 或 unsafe-eval 绕过模块装配问题。

静态检查和打包成功不能写成运行验收通过；具体命令只使用现有脚本，
检查范围与改动风险相称。交付说明保留实际结果及未验证边界，不把临时验收记录
写入本指南。用户数据、运行中的服务与未保存草稿始终按原保护流程处理。
