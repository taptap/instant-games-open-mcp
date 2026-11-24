---
name: ui-split
description: 将游戏 UI 设计稿切分为独立透明素材，保留 Bbox、文字和素材绑定清单，并在验收后按共享组装器生成可编辑 .ui.json。用于拆界面、切按钮图标；画布会展示进度和产物。不接入游戏逻辑。
---

# UI 切分

对话执行流程，画布只读展示产物。不需要检查、打开或操作画布，不调用 `canvas_operation`。用户已指定原稿和任务名时直接沿用，不重新询问是否新开会话。

先确认当前环境有 `edit_image`、`recognize_ui`、Node.js 及 Python/Pillow。缺能力时说明缺项，保留原任务；不要调用浏览器模板，不把平台凭证写入脚本或项目。

下文的 `init`、`next`、`record`、`approve`、`assemble` 都是同包脚本的子命令，用 Bash 在当前项目目录执行：`python3 <本 Skill 目录>/scripts/ui_split.py <子命令> ...`（本 Skill 目录即此 SKILL.md 所在目录）。它们不是 MCP 工具，不要用 `sprite_gen`、`canvas_operation` 或其他工具执行。命令都返回 JSON。只有 `next` 返回的 `edit_image`、`recognize_ui` 动作才调用 MCP 工具。

1. `init --name <名称> --source <项目内原稿路径>` 创建独立进度；同名已有任务只恢复，不覆盖。
2. `next --name <名称>` 返回唯一待执行动作。只执行该动作；每次调用外部工具前，脚本已经持久化动作编号。
   返回对象中的 `tool` 用来选择工具，`id` 用于之后 record，`issued` 为内部状态；这三个字段不要作为工具参数发送。只把其余动作字段传给指定工具。
3. `edit_image` 动作：严格使用返回的原图、提示词和尺寸。工具完成后 `record --name <名称> --action-id <编号> --file <实际结果路径>`。不要以原稿充当去文字图，不猜结果路径。若响应丢失，记录 `unknown`，核查原工具结果后才继续；不自动重新付费。
4. `recognize_ui` 动作：只传返回的 action、request_key、image 和 prompt（query 时只传 action、request_id），不要补空的 request_id 等字段。把完整工具 JSON 保存到项目临时响应文件，再 `record --name <名称> --action-id <编号> --response <文件>`。running 时继续查询原 request_id。工具报错或响应丢失、没拿到 request_id 时，回到 `next`：它会返回同一 request_key 的原 submit，按原参数重发即可，服务端 24 小时内按 key 去重，不会重复调用模型或计费；不要自行生成新 key。
5. 下一步预排和裁切由脚本在本地完成。对话中按批展示透明素材，检查粘连、缺失和文字残留。若经用户同意用同一张空槽或底板重建多个槽位，说明哪些素材被复用、哪些原稿差异没有保留，展示结果供复核。确认画布引用的产物都存在且可读，再在用户确认后运行 `approve --name <名称>`。文件缺失或视觉问题未验收时，保留原产物并报告具体批次。

已完成批次需要重做，或 `next` 返回 `rejected` 时，先确认本次会重新生成，再用 `next --name <名称> --redo-batch <从0开始的批次> --confirm-new-generation`。已完成的任务只重做该批次，旧结果在新结果验收前保留；首次运行中重试被拒的批次后，继续处理剩余批次。不要对 unknown 请求使用这个入口。新素材仍需复核后 approve。

每次外部动作完成后回到 `next`。需要选择或确认时使用环境提供的提问控件。未触发工具的费用确认门时不额外重复确认；工具要求付费确认时沿用原确认流程。

6. 需要可编辑 UI 时，approve 之后运行 `assemble --name <名称> --screen-key <snake_case> --screen-name <中文名>`。脚本调用内置的共享组装器 `scripts/assemble-ui.mjs`（与 `maker-ui-workflow` 同一实现），从 `bbox.json` 的文字框推算字号、生成节点坐标，输出到 `assets/ui/<key>/`。不要自己写组装脚本、不要额外整体缩放、不要对字号做 pt 换算；需要调整请改识别结果或组装器。输出目录已存在时命令会拒绝执行，请编辑已有文档而不是覆盖。

产物固定在 `assets/image/ui-split/<名称>/`：`bbox.json`、`bindings.json`、去文字图、预排图、分离图和独立 PNG。组装产物在 `assets/ui/<key>/`：`<key>.ui.json`、`<key>.reference.png`、`assembly-map.json`。权威进度在 `docs/.ui-split/<名称>.json`，由现有项目文档接口供画布读取；它只包含参数、阶段、请求编号和产物信息，不包含凭证或图片字节。画布不执行任何付费操作。普通文字保留在 bbox 清单，不烘焙进 PNG。最终回复提供素材目录、UI 产物路径和未完成事项。

**保留画布产物。** 不要自行清理任务产物目录。分离图（`separated-*.png`）是画布上的可见产物，即使不在 `bindings.json` 或 `artifacts` 中也不能删除或移走；其引用记录在进度的 `batches[].result.path`。验收前同时核对原稿、`artifacts[].path`、各批次预排图（`batches[].reference`）、`batches[].result.path` 和最终素材绑定。不要通过删掉引用来让核对通过。
