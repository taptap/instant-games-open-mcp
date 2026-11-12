---
name: maker-scene-furniture-workflow
description: 制作或继续 Maker 场景家具独立入场模板：首尾帧动作参考、实例识别与资源去重、透明拆件、单件动画、素材及摆放播放配置导出。适用于房间布置等固定镜头场景，不用于 UI 组装；默认仅交付素材，游戏接入按需执行。
---

# 场景家具独立动画

交付素材目录和 ZIP：背景、每种唯一物件的独立目录、scene.json、各物件的 animation.json。
画布负责展示与生成，Skill 衔接步骤；Group 是视觉分区，不能作为执行顺序或资源身份。
不对整个混合分组执行 run。按具体卡片执行；已有原图、样片、拆件或配方时从该阶段继续。

## 1. 定位输入与画布

- 收到模板 ZIP 时用 canvas import-template --target-dir <项目> --file <ZIP绝对路径> 导入；取返回的 templateId，在新画布用 canvas add-template --input '{"id":"返回的templateId"}' 添加（仍携带当前 page-id、canvas-id 和 revision）。此命令无需浏览器上传或文件选择框；Skill 需单独安装或从分享包读取。
- 使用用户已指定项目，读取 canvas pages / inspect / model-settings。画布操作携带当前 page-id、canvas-id 和 revision，完成一批后重新读取。
- 模板素材均为示例；用户已确认使用示例时直接继续，换场景时重新制作下方结果，不沿用示例 bbox、去重关系或裁切框。
- 官方模板「场景家具 · 独立入场动画」使用最初的欧卡皇室场景，配套 [皇室场景示例配方](assets/royal-room-recipe.json)。复用示例时，将 sources 中的文件按相对路径下载到新的工作目录：先用 CDN，失败再用 GitHub，逐份核对 SHA-256，然后按第 4 节运行脚本；无需原作者的项目或分享包。换场景时编写自己的配方，不沿用示例 sources。
- 用 canvas replace-image --file <图片绝对路径> --input-file <含 id 的 JSON> 替换参考卡。
- 选择新的项目工作目录保存配方、生成回执和预览清单；不直接写 .maker 保存文件。稳定实例 ID 和资源 ID 存在配方中，卡片 ID 从实际操作结果取得。
- CLI wait 返回 queued/running 仅表示本次等待结束，继续用原 operation-id 查询或等待；不要重新提交。仅 succeeded 才进入依赖步骤，失败时保留原始错误。

## 2. 首尾帧与动作参考

先生成满场景，再参考它生成相同镜头的空场景。默认 16:9；透视、固定建筑、光照保持一致。
提示词要点：固定镜头，无运镜；空房到满房；家具分批弹性入场，轻微压缩回弹；地毯卷展、窗帘下展；最后停稳；保持结构，不增减物件。

生图遵循 model-settings；生视频使用 Maker MCP 的 create_video_task / query_video_task 或画布视频卡的 Maker 生成入口，读取当期模型和首尾帧参数，不写死供应商能力。按工具费用确认规则执行；未知任务先查询。已有满意样片时复用，不为跑模板重复付费。

对视频卡 add-node {type:sequence,sourceId}，设置完整时段、sampling:adaptive 去重复停顿再整体减帧，run 抽帧，然后创建 animation 卡。抽帧上限以 capabilities 为准，不能只截前半段凑帧数。原视频仅用于动作参考，不等于已经分割出独立物件。

## 3. 识别、去重与透明拆件

识别每个摆放实例，记录像素 xywh、层级、支撑物和入场时间。相同资源使用 reuseOf，摆放实例不合并；形状、透视或纹样不同保留变体。脚本支持同向缩放复用；镜像资源先另外制作。

仅为唯一资源生成透明拆件，利用 Maker 生图/编辑工具补全遮挡，避免把桌上物件粘进桌子。写出 [recipe 配方](references/recipe.md)；新拆件图必须使用自己的裁切框。识别与裁切由当前 AI 完成，脚本不自动识图。

## 4. 单件动画、画布与导出

动作选择：spring 家具弹入，rock 高柜底部立起并左右摇摆，slide 宽桌侧滑回摆，unfurl 布饰展开，hang 悬挂入场，roll 地毯从画面后方向前方卷展。按物件形态与参考视频选择节奏，不给所有家具套同一种弹跳。roll 直接使用本次新地毯透明图，脚本生成移动卷筒前沿和逐步铺平的帧，末帧回到原图；这是 2D 动作重建，不是从房间视频自动提取。更复杂、不同方向的动作才用 sequence 提供另行制作的透明图集和逐帧清单，不复用旧地毯帧。

使用本 Skill 的 scripts/scene_assets.py（Python 3.9+、Pillow），一次生成正式素材和独立画布预览：

    python3 <Skill目录>/scripts/scene_assets.py --source-root <来源根目录> --recipe <配方绝对路径> --output <新的素材目录> --preview-dir <新的预览目录>

需要依赖时优先复用 Maker Python；taptap-maker python path 返回不可用时按其提示 setup，或使用已有 Pillow 环境。脚本不调用生成服务，不覆盖输出，不弹保存框。失败留下 .incomplete，查清原因后换新输出路径；不得把部分目录当成成功。

读预览目录 manifest.json。对每个 item，将 {title,frameSetInfo} 写入临时 input JSON，通过 canvas import --file <预览PNG绝对路径> --input-file <JSON> 导入动画卡；使用返回的新 ID 排版。此入口要求支持 frameSetInfo 的 Maker 版本，capabilities 未列出时提示更新，不能改写 .maker 文件绕过。

先导入新结果并保存，再删除本模板实例的旧示例动画；不操作其他分组或用户原有卡片。按类别排等宽列，类别内每行至多三件，第一行始终为两张参考图 → 视频 → 全片抽帧及动画。全部素材共用一个配方，分类只影响排版。
位置落在分组内不等于加入分组。排版后用 canvas group 的 ids 同时选中一个目标 section ID 和新卡片 ID，把新卡加入原组；保存模板前通过 inspect 核对 sectionId，防止漏卡。
需要另存自定义模板时，先在画布工具栏切回鼠标选择模式，再打开 Group 菜单选择“保存为新模板”；手形平移模式会拦截卡片菜单。模板 ZIP 用 canvas export-template 的明确输出目录导出，避免系统保存框。

终点便签写实际导出目录、实例/资源数量、配方与预览清单的项目相对路径，便于中断后继续。替换来源后旧示例结果应明确标注，只有本次真实产物可写“已完成”。

## 5. 交付与按需游戏还原

交付素材 ZIP、scene.json、配方及 [游戏接入约定](references/game-integration.md)。不生成 UI.json。
用户要求接入游戏时，按接入约定读取配置；可复用 assets/SceneFurniturePlayer.lua，它只计算播放状态，不绑定渲染引擎。
画布自动循环预览不改变正式动画的播放一次、末帧保持行为。

脚本必须拒绝缺资源、非法框、循环支撑关系和不完整导出。其他质量判断交给用户的 AI：简单提示它对照尾帧检查位置、遮挡和动作，再在目标游戏分辨率看一遍即可；不额外设置多轮审核关卡。
