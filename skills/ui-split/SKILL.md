---
name: ui-split
description: 将游戏 UI 设计稿切分为独立透明素材，保留 Bbox、文字和素材绑定清单。用于拆界面、切按钮图标或在画布中启动 UI 切分；不自动组装 UI 或接入游戏逻辑。
---

# UI 切分

对话执行流程，画布只读展示产物。用户已指定原稿和任务名时直接沿用，不重新询问是否新开会话。

先确认当前环境有 `edit_image`、`recognize_ui`、Node.js 及 Python/Pillow。缺能力时说明缺项，保留原任务；不要调用浏览器模板，不把平台凭证写入脚本或项目。

使用同包 `scripts/ui_split.py`，工作目录是当前项目。命令都返回 JSON。

1. `init --name <名称> --source <项目内原稿路径>` 创建独立进度；同名已有任务只恢复，不覆盖。
2. `next --name <名称>` 返回唯一待执行动作。只执行该动作；每次调用外部工具前，脚本已经持久化动作编号。
   返回对象中的 `tool` 用来选择工具，`id` 用于之后 record，`issued` 为内部状态；这三个字段不要作为工具参数发送。只把其余动作字段传给指定工具。
3. `edit_image` 动作：严格使用返回的原图、提示词和尺寸。工具完成后 `record --name <名称> --action-id <编号> --file <实际结果路径>`。不要以原稿充当去文字图，不猜结果路径。若响应丢失，记录 `unknown`，核查原工具结果后才继续；不自动重新付费。
4. `recognize_ui` 动作：使用返回的 action、request_key、image 和 prompt。把完整工具 JSON 保存到项目临时响应文件，再 `record --name <名称> --action-id <编号> --response <文件>`。running 时继续查询原 request_id；unknown 不生成新 key，已知 request_id 则查询；没有 request_id 时停下核对。
5. 下一步预排和裁切由脚本在本地完成。对话中按批展示透明素材，检查粘连、缺失和文字残留。若经用户同意用同一张空槽或底板重建多个槽位，说明哪些素材被复用、哪些原稿差异没有保留，展示结果供复核。确认画布引用的产物都存在且可读，再在用户确认后运行 `approve --name <名称>`。文件缺失或视觉问题未验收时，保留原产物并报告具体批次。

已完成批次需要重做，或 `next` 返回 `rejected` 时，先确认本次会重新生成，再用 `next --name <名称> --redo-batch <从0开始的批次> --confirm-new-generation`。已完成的任务只重做该批次，旧结果在新结果验收前保留；首次运行中重试被拒的批次后，继续处理剩余批次。不要对 unknown 请求使用这个入口。新素材仍需复核后 approve。

每次外部动作完成后回到 `next`。需要选择或确认时使用环境提供的提问控件。未触发工具的费用确认门时不额外重复确认；工具要求付费确认时沿用原确认流程。

产物固定在 `assets/image/ui-split/<名称>/`：`bbox.json`、`bindings.json`、去文字图、预排图、分离图和独立 PNG。权威进度在 `docs/.ui-split/<名称>.json`，由现有项目文档接口供画布读取；它只包含参数、阶段、请求编号和产物信息，不包含凭证或图片字节。画布不执行任何付费操作。普通文字保留在 bbox 清单，不烘焙进 PNG。最终回复提供素材目录和未完成事项；不声称已生成可编辑 UI。

**保留画布产物。** 不要自行清理任务产物目录。分离图（`separated-*.png`）是画布上的可见产物，即使不在 `bindings.json` 或 `artifacts` 中也不能删除或移走；其引用记录在进度的 `batches[].result.path`。验收前同时核对原稿、`artifacts[].path`、各批次预排图（`batches[].reference`）、`batches[].result.path` 和最终素材绑定。不要通过删掉引用来让核对通过。
