---
name: maker-ui-bbox-workflow
description: 执行 Maker「游戏UI制作 · Bbox预排参考图（实验）」及其个人副本，从识图、预排切图到组装可编辑的 .ui.json，并在 UI 编辑器验收。仅要求切图时交付 PNG 资源包；普通「游戏UI制作」使用 maker-ui-workflow。
---

# Bbox 预排 UI 工作流

**默认交付：可在 Maker UI 编辑器中编辑的 .ui.json、独立 PNG、普通文字 Label 和参考图。**
资源包是中间产物，完成后继续组装与验收；用户明确要求“仅切图”时才在第 3 步结束。

**全程：识图 → 预排切图 → 核对归档 → 组装 UI → 编辑器验收。**
开始时将这五步加入任务计划；每步完成记录产物位置与下一步。中断后重读当前步骤并查询实际状态再继续。
沿用用户已选项目和已授权范围，不逐步重复询问。命令参数以当前 CLI schema 为准，画布写入携带最新 revision。

适用于模板 7e1cb6ad-732f-4dc3-a951-000000000015 及关联本 Skill 的个人副本，由 CLI 编排。
读取实际卡片与连线；示例结果不能算本次产物，不将普通模板转换为此流程。

## 1. 准备与识图

**顺序：定位去文字卡 → 完成并保存去文字图 → 按来源执行两轮识图 → 确认结果已写回 → 进入预排。**

1. 用 `canvas pages / inspect` 取得 page-id、canvas-id、分组与 revision，找到
   `uiRecognition.inputRole=text-free` 的去文字卡及其唯一上游原稿；后续识图都用这张去文字卡的 ID。
   用 `canvas model-settings --target-dir <项目>` 读取有效 vision.source。
   **原稿与去文字图未变且已有完整、选中的 Bbox 时，直接进入第 2 节，不重做识图。**
2. 先确认原稿已就绪；若其下游 `inputRole=design` 的“原稿与识图输入”卡仍待执行，先 run 该卡同步原稿并保存。
   再用 `canvas run` 运行未完成的去文字卡，等待原操作并 inspect 确认图片已生成、保存。
   **此时不运行整组：Bbox 模板须先有识图结果并 sync-ui-batches，才能运行整组。**
   local/chatgpt-web 提示“等待 Bbox”时，若去文字图已就绪，继续下面的回填流程，不重跑去文字。
3. 按 vision.source 选择一条路径：
   - **server/custom：** 去文字卡 run 会接续两轮识图；等待该操作结果。已有去文字图但缺 Bbox 时，
     用 `canvas recognize-ui` 仅识图。pending/unknown 先用 `canvas query` 查原请求；
     Server API 提示“等待恢复”时，用 `canvas recognize-ui --input '{"id":"去文字卡ID","recover":true}' --allow-paid`
     接续原请求，已成功的轮次直接复用。旧版清掉 pendingId 时，同一 input 加原记录的 `attemptId`。
     操作仍 running 时继续 wait/status 原 operationId；不重新 run 去文字、不转入手动回填。
   - **local/chatgpt-web：** 由 Agent 完成下方“两轮回填”，画布不能替 Agent 看图。
     不反复 run 或 recognize-ui 等待它自动完成；网页操作按[网页识图协议](../maker-ui-workflow/references/chatgpt-web.md)。

### 两轮回填（仅 local/chatgpt-web）

以下命令均使用同一项目、canvas-id 和去文字卡 ID；输入准备读取已保存画布。
**recognition-input 不调用模型；recognition-result 不保存画布，必须再 update-nodes。**

1. 调用 `canvas recognition-input`，保留返回的 canvasId、nodeId、design、cutSource。
   按返回的 imagePath 和 prompt 识别去文字图，取得第一轮 cut JSON；local 由当前客户端看图，网页由浏览器操作。
2. 将四个身份字段与 cut 写入 reply.json，再调用 `canvas recognition-input --input-file <reply.json>`。
   它校验第一轮并换算坐标，返回第二轮原稿 imagePath 与文字 prompt；按此执行并取得 text JSON。
   **两轮顺序执行，保留原始回复，不手工二次换算坐标，也不拿去文字图识别文字。**
3. 在同一 reply.json 中加入 text、实际 model 和两轮实际耗时 durationMs（毫秒，必须大于 0），
   调用 `canvas recognition-result --input-file <reply.json>`。校验失败先检查对应回复，保留已完成的一轮。
4. 将成功返回的整个 `{nodes:[...]}` 保存为 update.json，重新 inspect 取得最新 page-id/revision，
   用 `canvas update-nodes --input-file <update.json>` 写回；查询该操作确认写入、保存成功。

**进入预排的条件：** inspect 确认去文字卡的 selectedId 指向本次完整结果，Bbox 含 elements、texts
及与当前图片匹配的 design/cutSource 身份，格式为 version=1、design-pixels、xywh。
只有 cut、只有校验输出或结果尚未保存，都先完成本节；满足条件后直接执行第 2 节的 sync-ui-batches。

## 2. 预排、分离与切图

1. 核对复用元素、按钮状态及美术字需求，保存后调用 `canvas sync-ui-batches`。例如：
   `{"id":"分组ID","artText":["T001","T008"],"background":false}`。
   artText 填需要图片化的文字 ID，无则 []；普通文字保留为 Label。background 仅在需要额外还原环境背景时开启。
2. **先运行本地预排并看图，再继续分离生图。** 每批沿用“去文字图 → 本地预排 → 分离 → PNG”。
   预排按原稿 Bbox 尺寸紧凑排布，只移动、不缩放；2048 是单边上限，不是固定画幅。
   检查主体清晰、没有大面积无用留白；容量超限说明缺口，不缩图或截断清单。
3. 分离卡只引用对应预排图，提示词分写“保留主体”“移除背景与覆盖物”“输出透明 PNG”。
   **输出尺寸与槽位沿用本次 nativeLayout，按记录矩形裁切；真实 Alpha 透明，不绘制棋盘格。**
   美术字独立引用原稿，不混入去文字图集。
4. inspect 核对批次、覆盖与连线后，运行分组接续到资源包，保留识图开启；并发和重试沿用现有队列。
   缺少 local/chatgpt-web 识图结果时先回填、保存，再带最新 revision 继续。

**本步产物：** 各批独立 PNG 及资源包。等待实际结果，提交任务不算完成。

## 3. 核对与归档

1. 看实际 PNG：主体完整、透明正确、底板与图标分离、状态对齐；核对后确认绑定，未查看的保持 unreviewed。
2. **逐项对照 Bbox：** 每个元素（含 duplicateOf 实例）有正常态绑定，按钮/页签有按下态；
   每个选定美术字在 artTextBindings 中有 PNG，普通文字保留在 texts。缺项先补齐。
3. 按类别排列画布，每批“预排 → 分离 → 资源”横向对应，资源包放底部，保存。
   用 `canvas ui-archives --target-dir <项目>` 取得本次界面同一版本的 resources 归档；
   尚无归档时用 `canvas archive-ui` 归档已保存画布，也可使用本次完整导出包。

**本步产物：** 同一版本的 PNG、参考图、bbox.json、bindings.json。recognized 归档只有识图，不能用于完整组装。
默认继续第 4 步；仅切图任务在此交付实际文件路径。ZIP 超限时按资源卡下载并核对全集。

## 4. 组装可编辑 UI

1. PNG 导入 `assets/ui/<界面>/images/`，备用图放 `reserve/`；过程文件放 `.maker/ui-workflows/<界面>/`。
   按 bbox.design/cutSource 的路径导入原稿、去文字图并核对哈希。参考图与素材均须为 PNG。
2. 将 bbox.json 与 bindings.json 合并为 assembly.json，保留全部绑定、审核及归档字段；
   将 assets 和 artTextBindings 的 path 映射到导入后的 assets/ 相对路径。
   **布局只用原稿 Bbox 坐标，素材只用已核对的 ID 绑定，不按外观或文件顺序猜配。**
3. 用同包脚本组装，先建父目录，输出目录必须不存在：

   ```sh
   node <同包maker-ui-workflow目录>/scripts/assemble-ui.mjs <项目绝对路径> <assembly.json路径> <新输出目录>
   ```

   输出目录放在 `assets/ui/<界面>/` 下。脚本生成独立图像节点、文字 Label、父子坐标及参考图。
   数据与纠偏格式按需读[组装数据说明](../maker-ui-workflow/references/workflow.md)的“布局文件与组装工具”，不转入其普通模板拆图步骤。

4. **美术字需另行应用：脚本不自动处理 artTextBindings。** 按 textId 找对应 Label，
   用 `ui inspect / patch` 改为引用 PNG 的图像节点，保留位置、父级和层级，移除重复文字。
   脚本裁出新 PNG 时使用输出 layout.json 中的最终路径；patch 先 dry-run，再带同一 revision 写入。
5. 对新 UI、参考图及 PNG 显式调用 `generate_resource_meta`，再用 `ui check` 检查引用。

**本步产物：** assembled.ui.json、同名 .reference.png、assembly-map.json 和 layout.json。
已有用户编辑内容通过编辑器或受控 patch 调整，不覆盖重建。

## 5. 编辑器验收与交付

1. 运行 `taptap-maker ui open --target-dir <项目> --file <assets/相对UI路径> --no-open --json`，
   用返回地址实际打开 UI 编辑器，同名参考图用于对照。
2. 左右检查内容、层级、素材与状态；重叠检查位置和尺寸。偏差按原 ID 修正，重新组装后重应用美术字绑定。
3. **确认独立节点可编辑、普通文字为 Label，保存后重开检查。** 交付 UI 文件路径、素材目录、编辑器入口及核对结果。

无法操作浏览器时交付文件与入口，注明“待编辑器验收”。静态 UI 交付不包含游戏逻辑接入、构建或发布。

## 遇到阻塞时

- unknown 先查原任务；Server API 恢复复用原编号并按接口确认，不换渠道重提。
- 明确识图失败会结束本地等待并返回原请求编号；先检查保留的原始结果，能修正则回填 Bbox，
  无法修正再仅重新识图。重验原记录用 attemptId 恢复，不重跑去文字或其它已完成步骤。
- 下载或保存失败先恢复已有结果；切图失败按下方步骤区分裁框问题与素材缺失。
- **分离图空格：** 先 preview-image-assets，对照返回的 regions、bindings 和预览定位缺项。
  素材只是移位时，按原槽位顺序提交完整 `cut:{mode:"grid",regions:[...]}`，只改 x/y，
  保留名称、数量和宽高；重新预览后用 reviewId 确认。
  真正漏画时，保留 Bbox、预排和其它批次；只用 update-nodes 修改该分离卡的 prompt，点明缺失 ID、
  位置及保留要求，再 run 这张分离卡并重新预览、确认切图。修复一轮仍缺失则报告具体缺项，停止重复生成。
  成功后继续原分组到资源包归档与 UI 组装。**预排图未完成分层，不能以裁出非空 PNG 代替透明素材。**
- 来源或 Bbox 改变后更新受影响步骤，旧生成图仍按其原规划解释；保留已有素材与用户修改。
- 无法继续时报告当前步骤、已有产物和具体缺口，恢复后从该步继续，不把部分产物报为全部完成。
