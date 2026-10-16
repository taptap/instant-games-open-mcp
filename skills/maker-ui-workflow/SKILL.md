---
name: maker-ui-workflow
description: 'TapTap Maker 游戏 UI 设计稿拆解、按钮/图标/背景切图、已有素材组装 UI.json，以及在控制台 UI 编辑器中对照还原。适用于‘照这张图做游戏 UI’‘拆这个界面’‘把切图拼回 UI’‘生成 UI.json’‘和设计稿对比调整’；按用户目的进入相应阶段，普通单个 UI 属性修改不重跑拆图。'
---

# Maker UI 设计稿拆解与还原

Maker 是流程入口；自由画布展示分析与切图，脚本按显式布局组装，控制台 UI 编辑器负责对照和调整。
本 Skill 不新增 MCP tool，不执行游戏构建、提交或更换游戏加载入口。
「游戏UI制作 · Bbox预排参考图（实验）」及包含 uiAtlasPrelayout 的副本使用独立
`maker-ui-bbox-workflow` Skill，不按本 Skill 的普通模板拆图步骤执行。

## 从用户需要的阶段开始

- 有设计稿，要做成可编辑 UI：识别布局 → 分层切图 → 资源入项目 → 组装 → 编辑器对照。
- 只要按钮、图标、背景等切图：在资源导出结束，不自动扩展为整屏 UI 重建。
- 已有切图，要拼回界面：先找布局清单和素材绑定；缺失时对照原稿补录并说明来源，不能猜配相似素材。
- 已有 UI.json，要调位置或对照：直接打开编辑器，不重新生图或覆盖现有文档。
- 只说“做个背包/商店界面”：从上下文找原稿及风格要求；缺少会改变结果的设计意图时再询问。

已有 UI 的命令行编辑使用同包 taptap-maker ui：capabilities 查看格式，list 找文档，
inspect 读取保存版本及 revision，patch 按节点 ID（或 children pointer）批量增删改和移动。
先用 --dry-run 检查，再带同一 revision 执行；版本冲突时重读并合并，不强制覆盖。
check 检查声明和资源，open --no-open 返回控制台 UI 编辑器地址。CLI 不读取网页未保存草稿；
网页有草稿时先保留，CLI 写入后通过文档菜单重新从磁盘加载或打开保存版本。

## 准备

调用生图或识图前先执行 `taptap-maker canvas model-settings --target-dir <项目>`，读取有效设置；遵循返回的 vision.source，不自行切换渠道。默认 Server API 不可用时由系统临时降级为 chatgpt-web，用户明确选择优先。
generation=maker 时沿用 Maker；custom 时通过画布 run 调用选定 API，不读取或传递密钥。
vision=chatgpt-web 时执行 [网页识图](references/chatgpt-web.md)，复用客户端浏览器；登录可选，不安装独立执行器。
local 时由当前客户端使用自身能力执行，缺少对应能力则提示用户；画布 run 无法调用客户端模型。
本地图片可用 canvas import 导入，但它只新增图片卡，不会自动回填或完成已有模板节点，
不得把导入成功当成原工作流完成。已有 Bbox 仍通过 update-nodes 写入所属识图卡并按原契约校验。

读取 Maker 状态并绑定明确的项目目录；沿用对话中已选项目。控制台打开、画布 CLI 和生成遵循
同包 taptap-maker-local 与工具实际 schema。保持同一 target-dir，不凭全局当前项目推断。
打开控制台后用 canvas pages / snapshot 读取当前页面、画布和 revision；通过页面桥接操作和保存，
不能直接覆写打开中的画布文件。命令参数先读当前 CLI 的 canvas 帮助。
修改卡片显示大小使用 canvas update-nodes，例如 input 为
`{"nodes":[{"id":"卡片ID","width":800}]}`。图片卡设置 width 或 height 即等比调整另一边，
它只改变卡片，不改变图片像素、其它卡片位置或画布缩放；具体范围以 canvas capabilities 为准。

尺寸以图片像素为准，不使用画布卡片的 width/height：inspect 的 imageInfo 是当前图片实际宽高和比例，
originalImage 是沿引用链取得的原稿坐标基准。去文字、背景准备和整屏标注默认 parameters.aspectRatio=source，
跟随原稿；图集保持自己的行列排版。固定比例可用 canvas capabilities 的选项显式覆盖。
非常见比例先向用户说明可能影响构图和切图；跟随的比例不被接口支持时，在运行前选择支持的比例，
不静默拉伸、裁剪原稿，也不把 9:21 当成已支持的输出。原图尺寸和请求/结果尺寸分别保留。
生成记录的 referenceImages、originalImage、parameters.targetSize、resultImageInfo 和 warnings 用于核对；
submittedPrompt 包含实际发送的参考图尺寸。实际结果比例不符时先核对，不把请求尺寸当成成功结果。

有完整 UI 拆解用户模板时优先复用，在新画布替换原稿；没有时用现有图片和资源卡建立同样的流程。
旧示例结果只供参考。换原稿后重做识别、布局、素材绑定与网格核对，不能只换首图就沿用旧结果。

官方合批模板与历史分类模板保留各自保存的识图开关；CLI 的 canvas run 游戏 UI 分组或图片步骤默认开启识图，
保存开关，先完成去文字，再取得去文字图的清单后才继续下游，不依赖 Agent 额外开启。
带当前 page-id、canvas-id、revision 和 target-dir 执行；只有用户明确要求无识图对照时，
在本次及后续 run 的 input 中显式传 `"recognition":false`，例如
`{"id":"分组ID","recognition":false}`。仅提前关闭卡片开关不能覆盖 CLI run 的默认值。
识图遵循设置：local 才使用当前客户端模型；custom 使用选中的命名 API 配置和模型；
chatgpt-web 按网页识图引用完成两轮、校验和回填；server 使用画布现有两轮识图。已提交或结果未知的任务不因接口不可用换渠道重做。
自定义 API 的 GPT-6.1 Sol 使用 low 档位，其它模型不强加该参数。
以下两次接口执行步骤适用于 custom 和 server；local 按同样输入与 Bbox 契约由客户端识别后写回。
沿用用户的任务要求执行两轮识图，无需逐轮重复询问：
Server API 的 pending/unknown 先 query；提示等待恢复时，recognize-ui 的 input 传
`{"id":"去文字卡ID","recover":true}` 并带 `--allow-paid`，复用原请求。旧版丢失 pendingId 时加原 `attemptId`。

1. run「去文字设计稿」，确认其已完成，且直接连线引用唯一原稿。
2. 运行去文字卡的两次识图（分组 run 也会自动执行）：第一次只看去文字图提取 UI；
   第二次只看原稿提取文字，并带第一次已换算到原稿像素的清单。不要加入旧稿数量或额外识图 Skill。
3. inspect 读取选用结果的 uiRecognition.results[].bbox，或在识图面板导出 Bbox JSON。
   固定 version=1、coordinateSpace=design-pixels、bboxFormat=xywh，design/cutSource 保存图片路径、
   哈希及真实尺寸；elements 为 E 编号的 icon/frame/panel/button/tab/title，texts 为 T 编号的文字。
   所有 bbox 都是原稿像素 [x,y,w,h]；切去文字图才按两张图的实际宽高换算。
4. 完整结果保存后继续拆图。文字的 text、parentId、role、align、color、bold 全部保留，cutout=false，
   后续做 Label，不入切图清单。unknown 或中断只查询原请求，不重放；第二次失败不把第一次当作完成。

不要重新看图猜坐标或让用户换当前对话模型。已有 Bbox 时直接复用；换原稿或重新去文字后再识别。
旧版单次清单没有文字 Bbox，需要双次识图后才能按本流程完整组装。

当前「游戏UI制作」模板按控件、图标、装备、面板、人物和背景分类自动分批，单张最多 5×5，
分类内按 Bbox 尺寸和长宽比合批，横长、竖长与普通素材分开；长条每批最多五格，
续批保留元素 ID 和状态绑定，不按旧序号解释新图。duplicateOf 实例共用槽位，但保留各自的坐标和绑定。
执行该模板时沿用自动规划，不额外改成混合分类或固定更大的网格。自定义流程的合批建议见
references/workflow.md 的「图集合批」。已有结果保留，不为了合批重新生成。

只执行已配置的画布模板时，确认输入和参数后使用分组 run（执行时传 --allow-paid，沿用当前任务授权）。
local / chatgpt-web 在缺少识图结果时交给 Agent 执行；完成回填、确认保存后读取最新 revision，
再次 run 原分组继续下游，保留 recognition=true，不通过关闭识图绕过等待。
队列按连线自动接续图片与资源卡，资源卡按已保存网格裁切并保存独立 PNG，不必逐张调用。
最后一步是内容就绪的资源包卡片；入项目、meta、UI.json 和编辑器属于后续独立任务，
仅在用户要求时继续。自动裁切不表示视觉复核通过；缺少网格或结果未知时处理原阻塞后再继续。

## 执行

布局字段、坐标依据、冗余资源和双重对位契约见 [workflow.md](references/workflow.md)。

1. 官方合批模板与历史分类模板都先准备原稿与去文字稿，再分别识别去文字稿 UI 与原稿文字。
   两条流程都保存同格式 Bbox JSON，按设置使用识图来源。
   相似按钮逐个记录，切图清单用于标框和拆图；原稿文字清单留给组装。重新去文字后必须重新识别。
2. 按去文字稿的清单分别标注按钮、图标；背景在去文字后再去除前景。
   美术字是独立支线：标注和提取始终引用未去文字的原设计稿，不能因去文字清单没有美术字而跳过。
   提取提示词分开写“参考与目标”“保留”“移除”“输出”。按钮默认/按下态分别生成、统一画布与锚点，
   图标与按钮底板分离；美术字只保留字形及字效，不带后方底框。
   普通文字从第二次识图的 texts 还原为 Label，不混入去文字切图清单，不重新猜位置。
3. 切图前固定 uiAtlasPlan：每格关联元素 ID、状态，按从左到右、从上到下输出，
   提示词带名称和换算到参考图的 Bbox。生成结果保存本次清单，不用后续修改的清单解释旧图。
   当前官方模板按分类自动生成清单及续批；自定义清单才由 Agent 显式规划。更换原稿或识图结果后重新规划，不能沿用旧绑定。
   查看真实结果。透明处理、必要的重新排版要明确使用已有能力或可重复的本地处理，不能把人工修图冒充模板自动能力。
   用图集预览核对完整边界后确认，再导出独立 PNG；未知远端任务只查原任务，不自动重提。
   数量相同不能证明内容顺序正确。未核对的切图保持 unreviewed，不允许直接拼装。
   导出资源包同时包含 bbox.json、bindings.json，PNG 仍按分类分文件夹。
4. 正式素材按 assets/ui/<界面>/images/ 归档；备用图同目录 reserve/ 保留但不入布局。
   过程文件、layout.json、corrections.json 留在项目 .maker/ui-workflows/<界面>/，不混入正式 PNG。
   明确绑定资源 ID 与元素 ID、默认/按下态，记录图片尺寸与哈希；显式调用 generate_resource_meta。
5. 使用本 Skill 的 scripts/assemble-ui.mjs 组装到新的目录，例如 assets/ui/<界面>/assembled-v1/。
   输出目录必须不存在，保护手工编辑；多轮用新目录。脚本验证绑定、哈希、尺寸与层级，不做视觉自动匹配。
6. 在控制台「UI 编辑器」打开 assembled.ui.json，同名 assembled.reference.png 会自动作为设计稿。
   左右检查完整性、层级、资源选择，再重叠检查位置/尺寸；必要时按同一元素 ID 记录纠偏重新组装。
   用户已经手工编辑的文件继续在编辑器调整，不能无条件重新生成覆盖。

## 组装和打开

### 隔一段时间继续拼 UI

官方合批模板与历史分类模板共用本地归档，不依赖聊天记忆或控制台保持开启。
先运行 `taptap-maker canvas ui-archives --target-dir <项目>`，按名称、uiId 和 revision 选择用户指定的 UI；
读取返回的同一条记录的 bboxPath、bindingsPath。多个版本不能擅自选最新，也不跨界面借用坐标。
旧画布尚无归档时，先保存，再运行 `canvas archive-ui --target-dir <项目> --canvas-id <ID>`；
该命令只归档已保存数据，不生图、不识图、不读取未保存草稿。
recognized 记录只有 Bbox；resources 记录才包含分类 PNG、设计稿、去文字稿和 bindings.json。
资源版本为不可变快照，重识图或重切保存新版本；改名称不改变 uiId，复制新画布产生新 uiId。
从该归档目录或用户解压的资源包导入图片，保留 bbox.design/cutSource 的 assets/ 路径和哈希；
素材按分类放入 assets/ui/<界面>/images/，只改 bindings.assets 中的 path，不改元素 ID 或 Bbox。
合并 bbox.json 与 bindings.json 为 assembly.json，保留 ui 字段；脚本检查 Bbox 哈希，拒绝混搭版本。
原参考图目标路径已存在时先核对哈希，不覆盖不同图片。归档不自动清理，删除整个项目仍需自行备份 ZIP。

在已安装的 Skill 目录运行（正式分发的脚本已打包依赖，无需 npm install）：

    node scripts/assemble-ui.mjs <项目绝对路径> <layout.json> <新输出目录> [corrections.json]

输出 assembled.ui.json、assembled.reference.png、assembly-map.json。将新资源纳入 meta 生成后，
用当前分发的 CLI 执行 console open --target-dir <项目> --no-open --json，取得真实地址；
保留其项目参数，追加 &page=ui-editor&ui=<URL编码的 assets/ 相对 UI 路径>，即可直达文档。
控制台已打开时也可进入「UI 编辑器」并刷新文件列表。不要启动独立 UrhoxUIEditor 或 Python 服务。
也可直接运行 taptap-maker ui open --target-dir <项目> --file <assets/相对UI路径> --no-open --json，
取得含项目与 checkout 身份的直达地址；不要手工拼接另一个项目的 URL。

### 直接使用 Bbox JSON 组装

已有单次或两次识图的 Bbox 时，不手工重建另一份坐标。准备一个 assembly.json，包含：

- bbox：导出的完整 Bbox JSON 对象；所有框已是原稿像素 [x,y,w,h]。
- assets：沿用 layout 格式的资源记录（id、assets/ 相对 path、sha256、width、height、role）。
- bindings：每个 E 元素的显式 {elementId,assetId}，按钮可附 pressedAssetId；备用素材 role=reserve。

资源包的 bindings.json 可直接与 bbox.json 合并，仅将资源 path 改为导入后的 assets/ 路径；
保留 confirmed、review、哈希、contentRect 和 backgroundAssetId。缺件或未确认清单不能拼装。
contentRect 是 PNG 内的有效区域，脚本确定性裁掉透明边距到新目录，原素材不变；不是视觉纠偏。
已有素材只有存在明确的元素 ID/路径/哈希记录才能回填为 recorded，不能按文件顺序臆测旧关联。

将 assembly.json 作为 assemble-ui.mjs 的第二个参数。脚本按 Bbox 生成图像节点和 Label，
自动换算父子相对位置，保留文本、对齐、颜色和粗体；字号以墨迹高度初拟合，字体沿用编辑器 PingFang SC。
输出额外的 layout.json，后续纠偏使用该文件与已有 corrections 契约。不从 PNG 名称或相似外观猜绑定，
缺少任一 E 元素的绑定即停止；文字无需 PNG。组装目前仍要求参考源和素材为 PNG，
非 PNG 参考先在项目中转为 PNG 并明确更新路径、哈希与尺寸，不修改 bbox 坐标。
字体度量、素材透明边距、图层顺序和生图形变仍需编辑器对照；Bbox 通过校验不代表视觉验收通过。

## 完成检查

检查正式文件和素材引用，查看真实左右/重叠效果，并确认保存后重新打开仍正确。
保留冗余资源，报告缺件、形变、未验证项和实际修整；静态检查通过不代表像素级一致。
交付目标是可在编辑器继续编辑的静态 UI；点击逻辑、动态列表和游戏运行时接入只有用户要求才做。
