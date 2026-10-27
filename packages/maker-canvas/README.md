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

`host.features`（`CanvasPageFeatures`）只控制页面入口显示，不过滤自动化命令；
开放 `execute` 的宿主须自行做动作白名单。未声明时保持现有页面：

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
| connectors     | 唯一默认关闭的项；设为 true 才显示图片左右连接点并允许选中连线删除                   |

Web 只保留图片、便签、标注、图片槽、连线、导入、删除、复制、撤销/重做和图片下载时，
传 `features: { templates: false, uiRecognition: false, video: false, sequence: false,
model3d: false, uiEditor: false, resourceExport: false, sections: false, imageEditing: false,
connectors: true }`。
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

## 图片槽与连线

图片槽沿用现有图片卡：`type: 'image'` 且没有 `assetPath`，可带 `generationDraft`，
不新增节点类型。工具栏「图片生成卡」和 `add-node {type:'image'}` 都创建图片槽。
状态取自原生成状态：空、生成中（卡片 loading 遮罩）、失败（遮罩显示「重试」，经
`store.generationAction(..., 'retry')` 重提原任务）、已填充。选中图片槽时下方面板显示参考图
缩略图与「+」导入参考、提示词、模型/比例/分辨率和「生成」；面板内没有上传按钮。模型列表只来自
`store.imageModels(tool)`；「自动」不传 model，由宿主取平台默认。发送仍调用
`store.generateImage(canvasId, {prompt, targetNodeId, sourceImageIds, sourceImagePaths,
referenceImagePaths, provider, model?, resolution, aspectRatio, targetSize, operation})`，
成功结果写回 `targetNodeId` 同一张卡。默认外观点槽内「导入图片」按钮走页面本地图片导入，`fill-slot` 沿用
`prepareCanvasImportedNode` 的项目素材校验。回填保留节点 id、位置、宽度和连线；
高度按原有图片卡规则随图片比例调整。

连线复用 `image-variant` 边，不新增类型：`from` 必须是已有素材且无需处理的图片，
不允许自连和循环，重复连线忽略，每张图最多 14 张参考。连到图片槽时，原 `generationDraft.sourceImageId`
转为显式边并设 `referenceInput = {includeSelf:false}`，生成时按连线顺序提交全部上游图片，
结果回填后这些连线保留；连到已有图片只表示关系，该图的编辑仍沿用原来源规则。
`connectors: true` 时左侧连接点拖到另一张图片表示「它连入我」，右侧拖出表示「我连到它」；
单击（无拖动，或键盘激活）右侧「+」在右侧新建默认尺寸的空图片槽并连 `卡片 → 槽`，
左侧「+」在左侧新建并连 `槽 → 卡片`；位置避开已有卡片，新槽被选中并打开提示词面板，
走正常撤销栈与自动保存，连线被拒绝时撤回该槽。
选中图片参考线可按 Delete 或「删除连线」移除，与 `disconnect` 同样只允许
`image-variant` / `first-frame`。

可选宿主钩子（缺省即不显示对应入口，本地宿主不受影响）：
`addToChat?(items: {nodeId, assetPath}[])` 与
`pickProjectImages?(): Promise<{path, name}[]>`（`path` 为项目相对路径，如 `assets/image/x.png`）。

`host.appearance?: 'default' | 'web'` 只换皮肤：`'web'` 给 `<html>` 加
`canvas-appearance-web` 并启用 `webStyles.ts` 中的作用域 CSS（工具条、选中菜单、
图片卡/图片槽、提示词面板），连线语义与命令不变。`'web'` 下的交互差异：

- 「+」只在恰好选中一张卡片（或键盘聚焦）时出现，多选不显示。锚点是图片框（标题行以下的
  可见框）左右边的垂直中点：20px 圆环（1.2px 描边 ink 70%、底 charcoal 90%、12px Plus）
  停在边上，80px 热区中心在边外 25px，按屏幕像素绘制不随缩放变化；热区内跟随指针最多 30px、
  放大 1.1（80ms），离开弹回（400ms spring）。普通导入图片只有右侧「+」，图片槽（空槽或
  AI 生成结果）两侧都有。拖动时显示曲线预览，悬停到其他图片卡会吸附到对侧边并高亮目标，
  松手仍走 `connect` 校验（`webChrome.ts`）。
- 选中样式对齐 Mivo `.dom-node.selected`：图片框直角，2px（屏幕）宿主主题色 `--canvas-accent`
  描边，外加同色 4px、不透明度 `.18` 的光晕与 `0 18px 44px rgba(35,35,35,.22)`；空槽光晕 `.1`
  且无投影。多选只保持每张卡的 2px 主题色描边和 `.14` 光晕，不画整组外框，不显示角柄。四角柄为 10px 圆点（2px 主题色描边、`#fffaf0` 底、20px 热区），
  四角都可缩放：nw/se 为 `nwse-resize`，ne/sw 为 `nesw-resize`，拖动从该角缩放并固定对角，
  沿用图片比例规则，走撤销栈。
- `image-variant` 连线画成两张图片框左右边中点之间的三次曲线、无箭头；悬停或选中时线与流光都
  改用宿主主题色 `--canvas-accent`：3px 底线降到 30% 不透明度，上方 6 层 5px 宽彗星虚线
  （Mivo 层表，260px 周期、1.08s）用 CSS `stroke-dashoffset` 动画流动（Chrome 74 可用；
  按时钟相位续播，重绘不重启；`prefers-reduced-motion` 时静止）。选中或悬停 1 秒后中点出现 28px 圆形剪断按钮
  （居中 14px lucide scissors；毛玻璃：62% 面板色 + `backdrop-filter: blur(10px)`，不支持
  backdrop-filter 的 Chrome 74 退回实色面板；悬停/聚焦去掉描边，改为主题色图标与 14% 主题色底）
  删除连线，Delete 同样有效；曲线不提供折线手柄。
- 连线只表示引用关系：删除指向已有图片卡的连线时，丢弃该来源的 `sourceSnapshot(s)`，不设
  `templatePending`、不使下游失效，图片保持原样；删除指向空槽的连线只移除下一次生成的参考
  （同时清掉草稿 `sourceImageId(s)`，两种外观都如此）。默认外观仍按原规则把分组成员标为待处理。
  Web 中剪断 AI 结果卡（有 `generation`、不属于模板分组）的连线后写入
  `referenceInput: {includeSelf: false}`，再生成只用剩余连线，不再回退到 `generation.sourceImageId(s)`；
  撤销恢复连线与原行为。
- 没有再生成路径的图片（本地编辑、抠图、普通导入：无 `generation`/草稿提示词，且不属于分组、
  二合图标或识别流程）在两种外观下都不提供「处理并继续 / 重试并继续」，连续处理时跳过；来源连线
  已断开不再算作“来源已变化”，旧画布中此类卡加载即正常显示；仍连着的来源变化只显示提示性的「待处理」。
- 点击空图片槽只选中并打开下方面板，不弹文件选择；单选空槽时图片框上方居中出现「上传」
  胶囊（距框 14px，屏幕高度不超过 30px 且不超过框高 20%），只有它会打开本地导入
  （键盘聚焦槽内导入按钮回车仍可导入）。生成中的槽和已有图片不显示。
- 选中已有图片的图片槽（AI 生成结果，带 `generation`）仍打开下方提示词面板；在该面板重新生成会
  把结果原位写回同一张卡（`targetNodeId` 为该卡；保留 id、位置、宽度、标题与连线，高度按新图比例），
  上一张图只保留在撤销栈和素材文件中。普通导入或上传填充的图片只显示选中菜单；经「快速编辑」
  生成仍落到新的连线结果卡（与 Mivo 上传后转为普通图片一致）。默认外观不变：快速编辑/重新生成
  一律新建「图片变体」结果卡。
- 提示词面板对齐 Mivo `ImageSlotComposer`：宽 `max(640, 卡宽+80)`、卡下 12px 居中；宽度和位置
  限制在画板内并扣除左侧工具条，卡下放不下时翻到卡片（及选中菜单）上方；
  10px 圆角、8px 内边距、段间 6px、`0 18px 48px rgba(35,35,35,.12)` 投影与 12px 模糊；
  顶部 44px 参考图行（10px 圆角，虚线「+」），无边框提示词（13px/1.5、最小 96px），底行为
  透明药丸下拉（30px、8px 圆角、20px 右留白放箭头）、「素材规范」药丸与 32px 圆形发送键。
  暗色取 Mivo 插件值（面板 `#393737`、描边 `#5a5a5a`/聚焦 `#6f6f6f`、发送 `#eeeeee` 底
  `#252222` 图标），亮色按同一混色比例作用于宿主浅色 token（发送键反相）。Web 下不显示
  分辨率说明、无参考图提示、服务商与服务模型说明。
- 模型/分辨率/比例下拉按所选文字收窄（上限 220px），右侧留出自绘箭头位置。
- 「素材规范」药丸开启时带 ✓；点击打开小弹层：开关（仍写本卡
  `generationDraft.parameters.assetConstraints`）、说明「让结果单体完整、纯色背景，方便抠图和放进游戏」、
  可编辑约束文本与「恢复默认」。文本按画布保存在 `document.settings.assetConstraintText`
  （与内置文本相同或为空时删除该字段），只在开启时追加到发送给宿主的 prompt，卡片的
  `generation.prompt` 仍只存用户文本。发送或点击弹层外部会关闭弹层。弹层是锚定药丸的浮层，
  向上展开并夹在画板内，不改变面板布局（`canvasWebPlacePopover`）。
- 所有 AI 结果卡选中都打开提示词面板：页面生图结果、「图片变体 · 已保存结果」，以及 Agent 经
  `fill-slot` / `replace-image` / 带 prompt 的 `import` 放入的结果。
- 选中菜单中「加入对话」（lucide `message-square-plus`）、「抠图」（lucide `square-scissors`）与
  「下载」为 16px 图标按钮，名称在 `aria-label` 与悬停提示中；其余动作仍为文字。「抠图」右侧
  紧贴 16px 宽 chevron 按钮「调整抠图」。
- 图标按钮提示（`installCanvasWebTooltips`，选中菜单、左侧工具条、剪断按钮、卡片菜单、画布页签
  重命名共用）：不用原生 `title`，悬停 150ms 或键盘聚焦后在按钮上方显示深色小胶囊（12px，
  明暗主题各一套色值，上方放不下时翻到下方），刚关闭 300ms 内移到相邻按钮立即显示；按下指针、
  Esc、滚动或失焦即隐藏。已有 `title` 在首次悬停/聚焦时迁入 `data-web-tip`，`aria-label` 保留。
- 右键已有图片的卡片：菜单顶部增加「加入对话」「抠图」「调整抠图」「下载」「下载 JPG」，分别按
  `addToChat` 钩子、`cutout` 功能键（两项抠图）显示，两项下载总是显示；空槽、处理中的卡与空白处
  菜单不变。宿主关闭 `resourceExport` 时图片卡不再显示「导出资源 ▸」组（与「下载」重复）；
  默认外观仍保留图片的该组。
- 「下载」（选中菜单下载图标与右键「下载」一次点击直接 PNG，右键「下载 JPG」为 JPG）走现有导出链。
  默认外观的 `<details>` PNG/JPG 浮层为 `position: fixed`，在 Web 毛玻璃选中菜单
  （`backdrop-filter` 会成为 fixed 元素的定位容器，且菜单 `overflow` 裁剪）里错位不可见，
  因此 Web 改为普通图标按钮；默认外观不变。导出链：
  `resourceExport.download(node, format)` → `host.downloadCanvasResource` →
  `host.deliverExport({ filename, mime: 'image/png', produce })`，`produce()` 返回编码后的 PNG Blob，
  落点由宿主决定。
- 选中菜单：「加入对话」在宿主提供 `addToChat` 时出现（单选与多选），只传已有 `assetPath`
  且不在处理中的图片卡；「抠图」由 `cutout` 功能键控制，为一键操作：按去背景编辑器的方式
  自动取背景色，用编辑器默认参数（`CANVAS_BACKGROUND_DEFAULTS`：容差 32、过渡 24、去溢色 .5、
  边缘连通）在浏览器内去除，经 `store.importImage` 保存 PNG，在原图右侧新建「<原标题> · 抠图」卡，
  以 `image-variant` 从来源连入并选中，可撤销。处理中原卡显示处理遮罩；未识别到纯色背景或
  其它失败只提示「抠图失败：…」（未识别时提示改用「调整抠图」），不创建卡片；画布已达 400 张卡或
  800 条连线时在导入前拒绝。不打开编辑器，不调用生成或付费服务；默认外观的
  「去纯色背景」仍打开完整本地编辑器（「本地图片编辑」+「去背景」两层）。Web「调整抠图」（同受
  `cutout` 控制）只打开「去背景」参数框（`openBackgroundEditor` 的 `confirm` 单图模式：自动/手动取色、
  从原图取色、容差、边缘过渡、去溢色、处理范围与实时预览），底部仅「取消」和主按钮「保存」；
  「保存」按当前参数处理后与一键抠图共用提交逻辑，在右侧新建「<原标题> · 抠图」`image-variant`
  连线卡并选中、图片立即显示。保存失败时对话框保留并提示，可重试；保存中不可取消。
- 工具条顶部握把为内联 lucide `grip-horizontal`（2 行 × 3 点）。
- 生成/处理中：卡内为面板色底、主题色淡层与扫光的细边框，22px 细环形 spinner；文案
  「处理中」与「停止等待」放在卡下方胶囊中，停止按钮始终可点。
- 空白处右键：「新建图片卡片」（右键点处空槽）、「上传图片」（本地文件，放到右键点处）与
  「从素材库添加」（仅宿主提供 `pickProjectImages` 时出现；逐张走 `importProjectAsset`
  的项目素材校验，从右键点向右排开不重叠，最多 20 张）。
- 工具条：选择/拖拽按钮的激活态与光标跟随实际模式（拖拽为 grab/grabbing，含空格临时平移）；
  保存只保留一个图标，`data-save-state` 为 saved / unsaved / saving / failed，并带对应提示，
  不再单列 ✓ / … 状态。
- 画布页签栏对齐 Maker Web `TabsList`：40px 高、画板底色（`--canvas-soft`），页签为 30px 圆角
  胶囊；激活页签用卡片底色、前景文字与轻投影，其余为次要文字、悬停浅底。关闭 × 只在悬停或激活时
  显示，重命名铅笔只在悬停激活页签时显示，键盘聚焦时始终可见并保留焦点环；右侧「+」「全部画布」
  为 28px ghost 按钮。
- 「适配画布」排除左侧工具条（及显示中的流程条）占位并留 32px 边距（默认外观同样避开工具条），
  按卡片实际渲染尺寸计算。

颜色取 `--canvas-*`（Web 由 `--maker-*` 映射），随 `:root[data-theme]` 切换明暗。

两种外观共有的修复：拖拽、缩放或平移时提示词面板不再随每次 `pointermove` 重建，只重新定位，
下拉、已输入提示词和选择保持原节点（以 `canvasComposerKey` 判断卡片内容是否变化）；生图模型
列表按工具（`generate_image` / `edit_image`）缓存，提交时仍读取最新值并刷新缓存，读取失败不缓存。
未设置或 `'default'` 保持原外观。

## 自动化命令补充

- `inspect` 及所有返回快照的命令带 `selectedIds`。
- `undo` / `redo`：`input` 为空对象，复用页面撤销栈及其模板流程、队列保护；栈空返回
  `INVALID_ARGS`。
- `fill-slot`：`{id, assetPath, prompt?}`，只接受空图片槽，返回快照且 `selectedIds` 为该槽。
- `replace-image`：`{id, assetPath, prompt?}`，原位替换已有图片（保留 id、位置、宽度、标题与连线，
  高度随图片比例），一次撤销即还原；空槽须用 `fill-slot`，非图片卡、生成中或有未确认任务均为
  `INVALID_ARGS`。素材校验与 `fill-slot` 相同（`prepareCanvasImportedNode`），下游结果按来源版本变为过期。
- `import`：`{assetPath, kind?, title?, prompt?, sourceId?}`；`kind` 默认 `image`，`title` 默认文件名
  （去扩展名，≤80 字），文件名可含中文等任意 Unicode，路径仍拒绝 `..`、空段、反斜杠与不符扩展名。
  `sourceId` 为已有素材图片时，新卡放在其右侧并添加 `sourceId → 新卡` 的 `image-variant` 连线。
- 三者带 `prompt`（1～8000 字，仅图片）时按页面生成结果的同一形状写入
  `generation = {prompt, referenceImagePaths: [], parameters: {}, operation, origin: 'agent',
sourceImageId?, sourceImageIds?}`（有入边时 `operation: 'variant'` 并记录来源快照），因此
  `canvasWebSlot` 为真，选中即打开预填该提示词的面板；不发起生成。无 `prompt` 时行为不变
  （`replace-image` 会清除旧生成元数据）。宿主对素材路径的拒绝同样是 `INVALID_ARGS`。
- 游戏素材约束只附加到发给宿主的请求：卡片 `generation.prompt` 只存用户文本（旧卡末尾的标准约束段
  显示时去掉），选择记录在 `parameters.assetConstraints`。未记录时沿用原规则（生图默认开启，编辑
  不附加，原文已含约束段视为开启）。Web 底行「游戏素材」开关可切换，悬停显示约束全文；默认外观
  无开关、请求内容与之前一致。
- `connect` 支持图片到图片（规则见上），校验失败为 `INVALID_ARGS`。

写命令遇到的唯一阻塞是未保存修改或进行中的自动保存时，先等待保存（上限约 10 秒）再
重新检查；保存失败或超时即拒绝，命令不执行；等待期间又有人工修改时以 revision 过期拒绝，
需重新 inspect，不把旧命令叠加到调用方未看过的内容上。例外是 `undo` / `redo`：保存失败时仍可执行，
用来撤回导致保存失败的修改；任务、面板、草稿和其他页面的阻挡照常生效。

`execute` 抛出的错误带 `code`：卡片、连线不存在或 canvasId 不是当前画布为 `NOT_FOUND`；
其余在任何副作用之前的拒绝均为 `INVALID_ARGS`（宿主报告「未执行」），包括命令结构、
input 字段与取值、过期 revision、未传 `allowPaid`、AI 操作执行中、`blocked` 状态原因
（面板/对话框打开、草稿、任务执行中等）、保存失败/超时及卡片任务待确认。副作用开始后的
失败不带 code（宿主按未知处理），015 分组 `run` 的协调器失败也不带 code。本地宿主经页面回传、
bridge 与 CLI `status/wait` 原样保留 `code`（只接受这两个值）。revision 校验保持不变。

`disconnect` 由宿主提供 `disconnect(edge)` 时与页面删线走同一段变更（清草稿来源引用；Web 外观丢弃
该来源快照，默认外观把分组成员标为待处理并使下游失效），未提供时沿用原通用逻辑。

## 平台、页面入口与服务可用性

三者职责不同，组合使用，不互相替代：

- `store.platform` / 模板 `platforms`：能力或模板适用于哪一端；本地为 `'local'`，Web 宿主
  消费本包时应显式声明 `'web'`，否则带平台限制的模板会被过滤。
- `host.features`：只决定页面显示哪些入口（按钮、菜单）；隐藏入口不是权限控制，
  也不会禁用对应的 Agent 命令。
- `store.capabilities`：某类服务是否已接通及不可用原因。

本地宿主不声明 `appearance`、`features`，保持默认外观，图片连接点（`connectors`）关闭，
分组与模板入口保留。

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

从仓库根目录运行共享包的独立类型检查：

```sh
npm run maker:canvas:check
```

该命令依次运行 tsconfig.domain.json 与 tsconfig.json，均使用 strict、noEmit 和
types: []。前者以 ES2020 检查 contracts/domain 及其传递依赖，不允许 DOM/Node 类型；
后者以 ES2020 + DOM + DOM.Iterable 检查完整共享包，允许标准浏览器能力但不引入 Node 类型。
这些静态约束不代表整个画布已完成浏览器兼容验证。
`node scripts/test-maker-canvas-web-basics.mjs`（先构建）以 ES2019 语法解析降级产物，并在
移除上述原生 API 的 Chromium 中跑 Web 形态宿主的图片槽、连线和命令；它不等于真实
Chrome 74 设备验收。

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
