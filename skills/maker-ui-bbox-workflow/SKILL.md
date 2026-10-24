---
name: maker-ui-bbox-workflow
description: 执行或复核 Maker「游戏UI制作 · Bbox预排参考图（实验）」及其个人副本：由画布程序推进识图、预排、切图和 UI 组装，AI 负责选择、检查和修正，并在 UI 编辑器验收。仅要求切图时交付 PNG 资源包；普通「游戏UI制作」使用 maker-ui-workflow。
---

# Bbox 预排 UI 工作流

**默认交付：可在 Maker UI 编辑器中编辑的 .ui.json、独立 PNG、普通文字 Label 和参考图。**
资源包是中间产物；用户明确要求"仅切图"时才在素材确认后结束。

**职责：程序负责步骤顺序、批次、连线、预排、切图、组装、meta 与引用检查；AI 负责选择、
看图检查和定向修正。** 不再逐卡编排，不手工拼 assembly.json，不搬运资源路径。
用户也可以在画布分组栏按同样阶段操作，AI 与用户可在同一实例交替接手。

适用于模板 7e1cb6ad-732f-4dc3-a951-000000000015 及关联本 Skill 的个人副本。
沿用用户已选项目和已授权范围；画布写入携带最新 revision；示例结果不能算本次产物。

## 1. 判断目标并读取状态

1. 目标是完整执行、从中断继续、仅切图，还是**复核已有交付**。只复核时不生成新素材，直接到第 4 节。
2. 用 `canvas pages / inspect` 取得 page-id、canvas-id、分组 ID 与 revision。
3. 用 `canvas ui-delivery --target-dir <项目> --canvas-id <ID> --id <UI 资源包卡ID>` 查看是否已有交付。

## 2. 推进到下一个检查点

对 015 分组执行 `canvas run --allow-paid`（input `{"id":"分组ID"}`）。它与画布按钮使用同一个协调器：
准备 PNG 识图输入 → 去文字 → 两轮 API 识图 → 同步批次 → 本地预排，停在检查点 A；
再次 run 继续分离生图与切图。付费步骤写入画布运行日志，不逐步确认。返回的 `workflow.current.stage`：

| stage              | 含义与 AI 动作                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `choice`           | 识图完成，返回文字列表。按需求选美术字 ID 和是否额外还原背景，再 run 一次并传 `artText`（无则 `[]`）与 `background` |
| `prelayout-review` | **检查点 A**：查看各批预排图与识图标注，确认无漏项、错误复用、文字未混入 UI；无问题再 run                           |
| `generation`       | 仍有未完成或失败的批次；查明原因后 run 继续（只补缺失步骤）                                                         |
| `binding-review`   | **检查点 B**：对列出的切图卡逐个 `preview-image-assets` 看图，再带 reviewId `confirm-image-assets`                  |
| `assemble`         | 素材已确认，执行第 3 节                                                                                             |

已有选择会从现有支线推导；改选时 run 传新的 `artText/background`，或用 `sync-ui-batches`。
识图只使用 Server API/自定义 API；本地 AI 与网页识图已停用，不作为回退。

## 3. 组装可编辑 UI

```sh
taptap-maker canvas assemble-ui --target-dir <项目> --canvas-id <ID> --id <UI 资源包卡ID>
```

它从已保存画布的同一版本资源归档导入素材到 `assets/ui/<ui>/<版本>/`（images、reserve、source、ui），
组装 `ui/assembled.ui.json`（普通文字 Label、美术字图片、背景、按钮正常/按下态），再显式生成资源 meta 并 `ui check`。
同一版本已完成时直接返回原结果；meta 或检查未完成时只补这两步；`--new-version` 写新目录。不覆盖已有文件。

- `ASSETS_UNCONFIRMED`：回到检查点 B；不要为通过组装批量改审核状态。
- `NON_PNG_SOURCE`：在画布重新执行准备识图输入；`ART_TEXT_UNMAPPED`：用新的 artText 重新选择对应文字。
- meta 显示 blocked：Python 未就绪，执行 `taptap-maker python setup` 或让用户点分组栏「准备 Python 环境」，再次 assemble-ui。
- `ASSEMBLY_BUSY`：同一资源包正在组装，等待后用 `ui-delivery` 查看，不要重复提交。

## 4. 编辑器验收（检查点 C）与复核

1. `taptap-maker ui open --target-dir <项目> --file <ui 文件> --no-open --json`，用同名参考图对照。
2. 检查字体、层级、位置、尺寸、美术字、背景、按钮状态与可编辑性；先确认文件是否已被用户手工修改。
3. 偏差用 `ui inspect / patch`（先 dry-run，再带 revision）修正；不要覆盖重建用户已编辑的 UI。
4. 交付 UI 文件、素材目录、编辑器入口和检查结果。生成文件不等于视觉验收通过；
   无法操作浏览器时注明"待编辑器验收"。静态 UI 不含游戏逻辑接入、构建或发布。

## 遇到问题时（定向修正，不重做无关步骤）

- unknown 先查原任务；Server API 恢复复用原编号，不换渠道重提，不盲目重放付费请求。
- 识图结果错误：仅重新识图（`recognize-ui`），会使依赖的规划失效；不重跑去文字。
- **切图空格或移位：** `preview-image-assets` 对照 regions 与 bindings；只是移位时提交完整
  `cut:{mode:"grid",regions:[...]}` 只改 x/y，重新预览后确认。
- **真正漏画或粘连：** 只用 update-nodes 修改该分离卡 prompt（点明缺失 ID、位置与保留要求），run 这张卡，
  重新预览确认；一轮修复仍缺失则报告具体缺项，停止重复生成。预排图不能代替透明素材。
- 来源或 Bbox 改变后只更新受影响步骤；保留已有素材与用户修改。
- 无法继续时报告当前阶段、已有产物和具体缺口，不把部分产物报为全部完成。

历史分步命令（`sync-ui-batches`、单卡 run、手工组装）仍可用于高级修复，正常路径不需要。
手工组装：`node <同包maker-ui-workflow目录>/scripts/assemble-ui.mjs <项目绝对路径> <assembly.json> <新输出目录>`，
数据格式见[组装数据说明](../maker-ui-workflow/references/workflow.md)；脚本已按 `{textId, assetId}` 处理美术字，
不要再对同一文字重复 patch。已停用的网页识图说明仅作历史参考：[网页识图协议](../maker-ui-workflow/references/chatgpt-web.md)。
