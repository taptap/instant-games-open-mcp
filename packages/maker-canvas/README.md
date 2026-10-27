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
走正常撤销栈与自动保存，连线被拒绝时撤回该槽。新槽的 `generationDraft.parameters` 继承来源卡的
生成设置（模型、分辨率、比例、素材规范开关及其它已存参数；面板里尚未发送的修改优先，
其次草稿，再次 `generation.parameters`），面板打开即显示同样的选项；提示词不继承。
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
- 所有连线（`image-variant`、`first-frame`、`frame-first` / `frame-last`、`image-to-video`、
  `sequence-source` 等）都画成两张卡片框左右边中点之间的三次曲线、无箭头；悬停或选中时线与流光都
  改用宿主主题色 `--canvas-accent`：3px 底线降到 30% 不透明度，上方 6 层 5px 宽彗星虚线
  （Mivo 层表，260px 周期、1.08s）用 CSS `stroke-dashoffset` 动画流动（Chrome 74 可用；
  按时钟相位续播，重绘不重启；`prefers-reduced-motion` 时静止）。选中或悬停 1 秒后中点出现 28px 圆形剪断按钮
  （居中 14px lucide scissors；毛玻璃：62% 面板色 + `backdrop-filter: blur(10px)`，不支持
  backdrop-filter 的 Chrome 74 退回实色面板；悬停/聚焦去掉描边，改为主题色图标与 14% 主题色底）
  删除连线，Delete 同样有效；曲线不提供折线手柄。剪断按钮与 Delete 仍只对 `image-variant` /
  `first-frame` 生效，其余派生连线只有悬停/选中流光。拖线预览也会吸附到视频槽。
- 连线只表示引用关系：删除指向已有图片卡的连线时，丢弃该来源的 `sourceSnapshot(s)`，不设
  `templatePending`、不使下游失效，图片保持原样；删除指向空槽的连线只移除下一次生成的参考
  （同时清掉草稿 `sourceImageId(s)`，两种外观都如此）。默认外观仍按原规则把分组成员标为待处理。
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
  其它失败只提示「抠图失败：…」（未识别时提示改用「调整抠图」），不创建卡片。不打开编辑器，不调用生成或付费服务；默认外观的
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
  显示，重命名铅笔只在悬停激活页签时显示，键盘聚焦时始终可见并保留焦点环；「+」（新建空白画布）
  紧跟最后一个页签，图标为 16px 居中的遮罩加号，「全部画布」靠右；两者均为 28px ghost 按钮。
- 图片右上角积分角标（「积分：…」）为 20px 高、左右 8px 内边距的整圆胶囊（999px），
  明暗主题沿用浮层底色与文字色。
- 选中标注（框选矩形/椭圆、箭头）时选中菜单在颜色后多一个删除图标按钮（lucide `trash-2`，
  悬停提示「删除」）；右键菜单的「删除卡片」与 Delete 键在两种外观下本就可用，均走撤销栈。
  默认外观的标注菜单仍只有颜色。
- 「适配画布」排除左侧工具条（及显示中的流程条）占位并留 32px 边距，按卡片实际渲染尺寸计算。

`features.video` / `sequence` / `sections` 打开时（Web 其余 templates、resourceExport 等可保持关闭），
`'web'` 下的视频、拆帧与分组（`applyWebMediaPatches`，样式在 `webStyles.ts`）：

- 视频槽（`video`）与视频结果（`video-source`）按图片卡绘制：标题行在框上、框带投影，选中为
  同样的 2px 主题色描边、光晕与四角柄（视频结果保持视频比例，nw/ne/sw 角固定对角）；空视频槽为
  图片槽同款圆角框加 lucide `video` 图形，已连接首帧不在卡内显示，只在面板参考图行显示。
  积分角标、生成中遮罩（卡下「处理中 / 停止等待」胶囊）与图片相同；失败/待确认/等待继续遮罩在两类卡上
  都改为毛玻璃面板、着色状态图标与药丸按钮。
- 入口：图片选中菜单「视频生成」、视频结果的「生成视频」「拆序列帧」、多选「分组」、分组的
  「取消分组」「删除分组」均为图标按钮（lucide `video` / `film` / `group` / `ungroup` / `trash-2`），
  共用悬停提示。右键：图片卡加「视频生成」，视频结果加「拆序列帧」，多选加「分组」，分组卡改为
  「取消分组」「删除分组」（隐藏不适用的复制/删除卡片）；空白处加「导入视频」（放到右键点处）。
  工具条「+」中的「视频输入卡」「新建分区」在 Web 显示为「新建视频卡片」「分组」，「视频历史」
  移入工具条「···」菜单（日志栏在 Web 收起）。默认外观的文案、入口与位置不变。
- 选中空视频槽即打开视频面板（与图片槽一致，不显示选中菜单）；面板沿用图片面板的参考图行、
  提示词与药丸下拉（输入方式 / 「模型 2.0」/ 分辨率 / 「4 秒」/「自适应比例」，只改显示文字，
  提交值不变），参考图缩略图左下角标注「首帧」「尾帧」「参考图 n」，「导入视频」为发送键旁的圆形图标。
- 视频卡没有侧边「+」：现有连线模型里视频只接受图片输入（`first-frame` / `frame-*` /
  `image-to-video`），没有视频→视频的边，因此不提供“从视频卡新建连入的视频槽”。
- 已有图片的右侧「+」点击（或键盘回车）打开小菜单「图片卡片」「视频卡片」（`openCanvasWebSlotChooser`，
  方向键移动、Esc 关闭并把焦点还给「+」）：图片沿用原侧边新槽逻辑；视频在右侧新建空视频槽并以
  `first-frame` 从该图连入，不继承任何图片参数。未开 `features.video` 或空图片槽的「+」仍直接新建图片槽。
- 视频结果卡不带原生控件：按下拖动与图片卡一样移动卡片，点击卡片只选中、不播放；播放/暂停只走框内
  左下角 28px 圆形按钮（`.web-video-play`，lucide play / pause，`aria-label` 随状态切换）。
- 播放按钮右侧为紧凑进度条（`canvasWebVideoBar`，每个复用的 `<video>` 只建一次，重渲染不重置）：
  显示「当前 / 时长」，点击或拖动轨道跳转，带静音切换；悬停、选中、聚焦或播放中才显示，隐藏时不拦截
  指针，进度条上的指针事件不冒泡到卡片拖拽。轨道为 `role="slider"`，方向键 ±1s、Home/End 到首尾，
  同步 `aria-valuenow` / `aria-valuetext`。MediaRecorder 产出的 WebM 时长为 `Infinity`，加载元数据后
  先探测一次真实时长再回到 0。
- 文生视频：未连接也未导入任何图片的视频槽可只按提示词生成，面板不显示输入方式胶囊，比例只提供
  `16:9`（默认）/`9:16`/`1:1`（自适应依赖图片）；连接图片后自动回到首帧等模式。
- 模型 2.5 不再弹页面自己的「按当前参数开始生成视频？」确认，费用确认由 Web 宿主负责，页面传
  `userConfirmed: false`；默认外观仍保留该确认。
- 焦点环只在键盘操作时出现：`installCanvasWebTooltips` 的最近输入标记写到 `:root.canvas-web-keyboard`
  （Chrome 74 无 `:focus-visible`；在输入框里打字与单按修饰键不算键盘导航），指针聚焦一律无描边，
  键盘聚焦统一为 1.5px、宿主主题色 60% 的细环（`--web-focus-ring`，运行时按当前主题色计算）。
- 「取消分组」只删除分组框（成员保留原位、清除 `sectionId` 并被选中）；「删除分组」连同成员一起
  走 `deleteSelected` 的既有保护；两者都可撤销。分组框为 16px 圆角细边框、标题与节点数在框内顶部。
- 拆序列帧编辑器、视频历史与其它 `.sequence-editor` 对话框改用面板/菜单 token：平头部、8px 圆角
  按钮、主按钮与发送键同色反相、输入框用面板输入底色；序列帧卡与动画卡为面板色圆角框与药丸按钮。
- 关闭的功能不出入口：templates 关闭时无「编辑视频」等模板入口，resourceExport 关闭时视频结果与
  分组的选中/右键菜单都不出现导出项；视频历史里的「下载视频」走宿主 `deliverExport`，不依赖 resourceExport。

视频相关的宿主 store 契约（本页实际调用）：`createVideo(canvasId, { prompt, sourceImagePath,
sourceImageId, sourceImageIds, sourceImagePaths, referenceImagePaths, mode, targetNodeId, duration,
model, resolution, ratio, userConfirmed }, signal)`，`mode` 为 `'text_to_video' | 'first_frame' |
'first_last_frame' | 'multi_modal_reference'`。`text_to_video` 仅 Web 外观发出，且不带任何图片字段：
`{ prompt, mode: 'text_to_video', targetNodeId, duration, model, resolution, ratio, userConfirmed }`
（`ratio` 不为 `adaptive`）；返回的尝试同样没有 `sourceImageId(s)` / `sourceSnapshot(s)`，按零来源回填。
模型取值固定为 `'2.0' | '2.5'`（2.5 默认外观由页面确认，Web 由宿主确认），
页面不调用 `videoModels`；返回的尝试读取 `id, canvasId, kind: 'video', status, taskId, targetNodeId,
targetAssetPath, resultAssetPath, sourceImageId(s), sourceSnapshot(s), referenceImagePaths,
parameters.mode, prompt, error, remoteStatus, executionState, credits, createdAt`，只有
`sourceSnapshots` 与已保存文档中的来源一致时才回填卡片。`videoHistory(offset, 30)` 返回
`{ items: CanvasGenerationAttempt[], total, busy? }`；`listGeneration` 需包含视频尝试，
`generationAction(canvasId, id, 'query' | 'retry' | 'cancel')` 用于查询、重试与停止等待；
`importVideo(canvasId, blob, contentType)` 返回 `{ relativePath }`。

颜色取 `--canvas-*`（Web 由 `--maker-*` 映射），随 `:root[data-theme]` 切换明暗。

两种外观共有的修复：视频结果卡的 `<video>` 按卡片 id + 媒体 URL 跨渲染复用（此前每次 `render()`
重建，点击、平移都会重新加载并把播放进度归零而闪烁）；序列帧卡帧格用 `canvasCachedImage` 缓存的已解码
图集同步重绘；动画卡在 `createAnimationCards` 闭包内按卡片 id + 图集 URL/帧布局复用已绘制的 canvas
与已解码图集（不依赖页面全局缓存，单独注入时同样可用），重渲染时当前帧立即可见、播放计时连续；序列帧编辑器跨进度刷新保留预览画布、抽帧视频与按 Blob 缓存的缩略图位图，处理过程中不再闪。
拖拽、缩放或平移时提示词面板不再随每次 `pointermove` 重建，只重新定位，
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
重新检查；保存失败或超时即拒绝，命令不执行。

`execute` 抛出的错误带 `code`：卡片、连线不存在或 canvasId 不是当前画布为 `NOT_FOUND`；
其余在任何副作用之前的拒绝均为 `INVALID_ARGS`（宿主报告「未执行」），包括命令结构、
input 字段与取值、过期 revision、未传 `allowPaid`、AI 操作执行中、`blocked` 状态原因
（面板/对话框打开、草稿、任务执行中等）、保存失败/超时及卡片任务待确认。副作用开始后的
失败不带 code（宿主按未知处理）。revision 校验保持不变。

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
