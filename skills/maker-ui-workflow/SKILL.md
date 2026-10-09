---
name: maker-ui-workflow
description: 'TapTap Maker 游戏 UI 设计稿拆解、按钮/图标/背景切图、已有素材组装 UI.json，以及在控制台 UI 编辑器中对照还原。适用于‘照这张图做游戏 UI’‘拆这个界面’‘把切图拼回 UI’‘生成 UI.json’‘和设计稿对比调整’；按用户目的进入相应阶段，普通单个 UI 属性修改不重跑拆图。'
---

# Maker UI 设计稿拆解与还原

Maker 是流程入口；自由画布展示分析与切图，脚本按显式布局组装，控制台 UI 编辑器负责对照和调整。
本 Skill 不新增 MCP tool，不执行游戏构建、提交或更换游戏加载入口。

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

读取 Maker 状态并绑定明确的项目目录；沿用对话中已选项目。控制台打开、画布 CLI 和付费生成遵循
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

画布手动添加模板默认关闭识图；CLI 的 canvas run 游戏 UI 分组或图片步骤默认开启识图，
保存开关，先完成去文字，再取得去文字图的清单后才继续下游，不依赖 Agent 额外开启。
带当前 page-id、canvas-id、revision 和 target-dir 执行；只有用户明确要求无识图对照时，
在本次及后续 run 的 input 中显式传 `"recognition":false`，例如
`{"id":"分组ID","recognition":false}`。仅提前关闭卡片开关不能覆盖 CLI run 的默认值。
识图由当前对话 AI 自己完成，不要求配置 TAPTAP_MAKER_VISION_CONFIG 或另一个模型服务。
沿用看图 → CLI 写入 → 继续流程：

1. 先 run「去文字设计稿」卡片；分组 run 也会先完成去文字，然后提示当前 AI 识图。
   inspect 确认去文字卡已完成，读取它的 assetPath 和 imageInfo，使用当前模型识别这张去文字图。
   原设计稿只作为去文字输入，以及美术字独立支线的参考；不能用原稿代替去文字图识别。
   不能以生图的标框图片代替清单；当前模型无法读取图片时，明确建议切换支持图片输入的模型。
2. 逐项记录元素 id、name、category、rect（去文字图像素 x/y/宽/高）、parentId、zIndex、states、cutout。
   category 取 icon/frame/tab/action/shortcut/close/title/panel/art_text/text；普通文字 cutout=false。
   重复按钮逐个记录，不能漏掉实例。坐标是 AI 识别估计，不能宣称精确测量。
3. 用现有 canvas update-nodes 写去文字卡的 uiRecognition.result，自动显示便签并供标框/拆图引用。
   input：`{"nodes":[{"id":"去文字卡ID","uiRecognition":{"enabled":true,"result":{...}}}]}`。
   result 字段：id（新 UUID）、model（实际当前模型名，未知写 unknown）、prompt（本次识别要求）、
   createdAt（ISO 时间）、durationMs（识别耗时，未计时写 0）、sourcePath（assetPath）、sourceSha256
   （去文字图字节的 SHA-256）、width/height（真实像素）、elements（上述元素数组）。
   重新 inspect 取得 revision 后写入；系统校验去文字图路径、哈希、尺寸、坐标和编号，保存并选用清单。
4. inspect 的 recognitionState=ready 且便签 text 有实际编号后，再 run 分组。
   换模型测试时读取同一去文字图，写入新的 result；历史清单保留，画布「对比」可查看和切换。
   报错时按具体原因修正，不自动关闭识图跳过。远端生图超时或 unknown 先查询原任务，不盲目重提。

只执行已配置的画布模板时，确认输入和参数后使用分组 run（取得付费授权后传 --allow-paid）。
队列按连线自动接续图片与资源卡，资源卡按已保存网格裁切并保存独立 PNG，不必逐张调用。
最后一步是内容就绪的资源包卡片；入项目、meta、UI.json 和编辑器属于后续独立任务，
仅在用户要求时继续。自动裁切不表示视觉复核通过；缺少网格或结果未知时处理原阻塞后再继续。

## 执行

布局字段、坐标依据、冗余资源和双重对位契约见 [workflow.md](references/workflow.md)。

1. 先从原设计稿生成去文字稿；再由当前 AI 识别去文字稿，保存稳定元素 ID、该图像素位置、类型、父级及绘制顺序。
   相似按钮逐个记录，清单通过上述 CLI 写入便签，再用于标框和拆图。重新去文字后必须重新识别。
2. 按去文字稿的清单分别标注按钮、图标；背景在去文字后再去除前景。
   美术字是独立支线：标注和提取始终引用未去文字的原设计稿，不能因去文字清单没有美术字而跳过。
   提取提示词分开写“参考与目标”“保留”“移除”“输出”。按钮默认/按下态分别生成、统一画布与锚点，
   图标与按钮底板分离；美术字只保留字形及字效，不带后方底框。
   后续组装需要的普通文字及原稿布局单独对照原稿补录，不混入去文字切图清单。
3. 查看真实结果。透明处理、必要的重新排版要明确使用已有能力或可重复的本地处理，不能把人工修图冒充模板自动能力。
   用图集预览核对完整边界后确认，再导出独立 PNG；未知远端任务只查原任务，不自动重提。
4. 正式素材按 assets/ui/<界面>/images/ 归档；备用图同目录 reserve/ 保留但不入布局。
   过程文件、layout.json、corrections.json 留在项目 .maker/ui-workflows/<界面>/，不混入正式 PNG。
   明确绑定资源 ID 与元素 ID、默认/按下态，记录图片尺寸与哈希；显式调用 generate_resource_meta。
5. 使用本 Skill 的 scripts/assemble-ui.mjs 组装到新的目录，例如 assets/ui/<界面>/assembled-v1/。
   输出目录必须不存在，保护手工编辑；多轮用新目录。脚本验证绑定、哈希、尺寸与层级，不做视觉自动匹配。
6. 在控制台「UI 编辑器」打开 assembled.ui.json，同名 assembled.reference.png 会自动作为设计稿。
   左右检查完整性、层级、资源选择，再重叠检查位置/尺寸；必要时按同一元素 ID 记录纠偏重新组装。
   用户已经手工编辑的文件继续在编辑器调整，不能无条件重新生成覆盖。

## 组装和打开

在已安装的 Skill 目录运行（正式分发的脚本已打包依赖，无需 npm install）：

    node scripts/assemble-ui.mjs <项目绝对路径> <layout.json> <新输出目录> [corrections.json]

输出 assembled.ui.json、assembled.reference.png、assembly-map.json。将新资源纳入 meta 生成后，
用当前分发的 CLI 执行 console open --target-dir <项目> --no-open --json，取得真实地址；
保留其项目参数，追加 &page=ui-editor&ui=<URL编码的 assets/ 相对 UI 路径>，即可直达文档。
控制台已打开时也可进入「UI 编辑器」并刷新文件列表。不要启动独立 UrhoxUIEditor 或 Python 服务。
也可直接运行 taptap-maker ui open --target-dir <项目> --file <assets/相对UI路径> --no-open --json，
取得含项目与 checkout 身份的直达地址；不要手工拼接另一个项目的 URL。

## 完成检查

检查正式文件和素材引用，查看真实左右/重叠效果，并确认保存后重新打开仍正确。
保留冗余资源，报告缺件、形变、未验证项和实际修整；静态检查通过不代表像素级一致。
交付目标是可在编辑器继续编辑的静态 UI；点击逻辑、动态列表和游戏运行时接入只有用户要求才做。
