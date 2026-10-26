---
name: maker-ui-bbox-workflow
description: 执行或复核修复 Maker「游戏UI制作 · Bbox预排参考图（实验）」及其个人副本：一次 run 由画布程序自动跑完识图、预排、分离、切图、组装、meta 与检查，AI 再逐批看图、定向修复并在 UI 编辑器验收，直到交付完整。仅要求切图时交付 PNG 资源包；普通「游戏UI制作」使用 maker-ui-workflow。
---

# Bbox 预排 UI 工作流

**默认交付：可在 Maker UI 编辑器中编辑的 .ui.json、独立 PNG、普通文字 Label 和参考图。**
资源包是中间产物；用户明确要求"仅切图"时才在素材确认后结束。

**职责：程序一次跑完全部步骤，出错自动重试，切图有疑问时按原槽位裁切并记下来，不中途停下；
AI 负责最后的看图复核与定向修复，直到达到第 4 节的完成标准。** 不逐卡编排，不手工拼 assembly.json。
用户在画布点「开始：自动生成 UI」走的是同一条路径，结束后可用「AI 复核修复提示词」把剩余工作交给 AI。

适用于模板 7e1cb6ad-732f-4dc3-a951-000000000015 及关联本 Skill 的个人副本。
沿用用户已选项目和已授权范围；画布写入携带最新 revision；示例结果不能算本次产物。

## 1. 判断目标并读取状态

1. 目标是完整执行、从中断继续、仅切图，还是**复核修复已有交付**（用户贴来复核修复提示词时直接到第 3 节）。
2. 用 `canvas pages / inspect` 取得 page-id、canvas-id、分组 ID 与 revision。
3. 用 `canvas ui-delivery --target-dir <项目> --canvas-id <ID> --id <UI 资源包卡ID>` 查看是否已有交付。

## 2. 一次自动跑完

对 015 分组执行 `canvas run --allow-paid`（input `{"id":"分组ID"}`），与画布「开始」按钮同一协调器：
准备识图输入 → 去文字 → 两轮 API 识图 → 按选择同步批次 → 预排 → 分离生图 → 切图 → 组装 UI → meta → 引用检查。
命令会一直等到组装完成才返回（通常数分钟）；返回 `workflow.status=ready` 与 `workflow.current.stage=assemble`。

- 美术字与背景：默认把识图 role 为 title 的文字做成美术字图片，识图没有背景元素时额外还原环境背景。
  需求不同就在 run 里传 `artText`（文字 ID 数组，无则 `[]`）与 `background`（布尔值）。
- 自动处理（不会停下）：识图无返回时用原请求编号重试；生图失败或结果未知时先查原任务，
  没有结果再重新提交（可能多计一次费用）；每步最多重试 2 次。切图自动校正失败时按原槽位裁切，
  素材缺格时照常完成；缺少素材的元素本版先略过。这些都写进运行日志和交付记录 `delivery.review`。
- 返回 `failed`：多半是识图或生图服务重试后仍不可用、项目或 API 配置有误。报告原因，恢复后再 run 一次，
  只补未完成的步骤。识图只使用 Server API/自定义 API；本地 AI 与网页识图已停用，不作为回退。
- 页面连接中断（`unknown`）不代表流程失败：用 `inspect` 或 `ui-delivery` 查看进度，不要重复提交。

## 3. 复核修复（把结果修到完整）

自动运行只保证流程走完；交付完整由这一节负责。先读 `ui-delivery` 的 `delivery.review`：
`unreviewed`（切图未看过的元素）、`missing`（没有素材、未进入 UI 的元素）、`unbound`（未绑定的分类）。

1. **逐批看图（每一批都要看）**：对每张切图卡 `preview-image-assets`，检查素材完整、透明、无粘连、
   无多余碎片、按钮按下态正确。
   - 只是移位：提交完整 `cut:{mode:"grid",regions:[...]}`，只改 x/y，重新预览。
   - 真正漏画、粘连或画错：只用 update-nodes 修改该分离卡 prompt（写明缺失元素 ID、位置与保留要求），
     run 这张卡（`--allow-paid`），重新预览。一轮修复仍不行就换写法再试一次，仍不行报告具体缺项。
   - 看过且没有问题：带 reviewId `confirm-image-assets`。预排图不能代替透明素材。
2. **缺素材的元素**：在 inspect 中找到所在分离卡，按第 1 步补画。只有识图本身漏项或分类错误时才
   `recognize-ui` 重新识图（会让依赖的批次失效，需要重新 run 分组）。
3. **重新组装**：`canvas assemble-ui --target-dir <项目> --canvas-id <ID> --id <UI 资源包卡ID> --new-version`。
   新版本的 `review` 三个列表应全部为空，meta `done`，引用检查 0 错误。
4. **编辑器验收**：`taptap-maker ui open --target-dir <项目> --file <ui 文件> --no-open --json`，
   对照同名参考图检查位置、尺寸、层级、字号、颜色、美术字、背景与按钮状态；偏差用 `ui inspect / patch`
   （先 dry-run，再带 revision）修正。先确认文件是否已被用户手工修改，不覆盖重建用户编辑过的 UI。

## 4. 完成标准

全部切图批次已确认、`delivery.review` 三个列表为空、meta `done`、引用检查 0 错误、编辑器对照无明显偏差。
达到后交付 UI 文件、素材目录、编辑器入口和检查结果。达不到时报告具体剩余项和原因，不把部分结果报为完成；
无法操作浏览器时注明"待编辑器验收"。静态 UI 不含游戏逻辑接入、构建或发布。

## 组装相关返回码

- `NON_PNG_SOURCE`：画布组装会自动转换；CLI 用 `--design-png` 传入同尺寸 PNG。
- `ART_TEXT_UNMAPPED`：用新的 artText 重新 run，选择对应文字。
- meta `blocked`：Python 未就绪。画布自动运行会尝试准备；CLI 执行 `taptap-maker python setup` 后再 assemble-ui。
- `ASSEMBLY_BUSY`：同一资源包正在组装，等待后用 `ui-delivery` 查看，不要重复提交。

历史分步命令（`sync-ui-batches`、单卡 run、手工组装）仍可用于高级修复，正常路径不需要。
手工组装：`node <同包maker-ui-workflow目录>/scripts/assemble-ui.mjs <项目绝对路径> <assembly.json> <新输出目录>`，
数据格式见[组装数据说明](../maker-ui-workflow/references/workflow.md)；脚本已按 `{textId, assetId}` 处理美术字，
不要再对同一文字重复 patch。已停用的网页识图说明仅作历史参考：[网页识图协议](../maker-ui-workflow/references/chatgpt-web.md)。
