# 家具弹性入场：首尾帧到完整序列帧

## 官方独立家具模板

「添加模板 → 角色与动画 → 场景家具 · 独立入场动画」提供完整示例：两张参考图、
首尾帧视频、覆盖全片的序列帧、场景识别与去重，以及每种唯一家具的独立动画。
模板首页使用欧卡皇室场景的完整入场动画作预览。示例共 21 份唯一资源、25 个摆放实例；
示例媒体经资源索引下载到共享缓存，不依赖作者项目中的文件。

继续制作或导出时使用 [配套 Skill](../skills/maker-scene-furniture-workflow/SKILL.md)。
其中示例配方包含可校验的下载来源、摆放坐标、复用关系、速度及支撑依赖。
最终交付背景、每种家具各自的动画目录、scene.json 和 ZIP，不自动组装 UI。
换场景需重新识别、拆件和生成动画；整段视频是动作参考，不会自动变成透明家具层。

下文保留整画面首尾帧动画的制作说明。

## 整画面动画

用于 16:9 欧卡风室内布置、房间升级和装修完成动画。产物是带背景的整画面动画，
不提供可单独拖动的透明家具素材或碰撞、摆放逻辑。

## 复用步骤

画布沿用官方首尾帧模板：左列上方是空房间首帧、下方是满房间尾帧，中间是视频，
右侧依次为可导出的序列帧和动画预览。首尾输入使用固定槽位，不随参考图顺序变化。
先满后空是参考图制作顺序；画布主流程按视频播放方向排列，不放复盘说明卡。

1. 从「添加模板 → 我的模板」添加「家具弹性入场 · Maker 原生工作流」，或导入模板 ZIP。
2. 先设计满房间：欧卡风、16:9、前中后景清楚，所有家具和地毯完整入镜。可以换提示词重新生成，也可以导入自己的图。
3. 引用满房间生成空房间，逐项核对窗户、墙角、地板线、台阶和相机。建筑改变时先修正空图。
4. 视频按「空房间 = 首帧、满房间 = 尾帧」连接。默认 Maker Seedance 2.0、10 秒、720p、自适应比例。
5. 查看完整视频，核对家具入场、构图和结尾落稳，再处理序列帧卡。
6. 抽帧：起始 0、结束 0（全片）、扫描 24 FPS、全片去重减帧、384×216、完整显示、不抠图。
7. 手工操作时，抽帧后进入「整理与输出」，统一缩放，再保存。动画卡核对播放，再导出图集 ZIP。
8. 游戏按 spritesheet.json 的逐帧 duration 播放；单图包提供 durationsMs，已有播放器需要读取该字段。
9. 保存画布后重开确认。分享时选中整个相连分组「保存为模板」，在「我的模板」导出 ZIP。

图集 ZIP 是游戏素材；模板 ZIP 才包含可复用的提示词、连接和参数。
模板不依赖公共工具脚本、MiniMax 账号或某台机器的绝对路径。生图使用 Maker 当前配置的生图模型。

CLI 自动化先用 `canvas templates` 查询模板 ID 和 revision，再指定已有输出目录：

```sh
taptap-maker canvas export-template --target-dir "<项目绝对路径>" \
  --id "<模板 ID>" --revision 1 --output-dir "<已有输出目录绝对路径>"
```

此命令不依赖打开的画布，不弹保存框，不覆盖同名文件；版本变化时返回错误，重新查询即可。
CLI 生视频需先向用户说明当前参数及预计积分，取得授权后传 `--allow-paid`，不会弹页面确认框。

## 视频工具与扣费

当前 Maker 工具列出 Seedance 2.0、Seedance 2.5 和 Wan3.0；画布本流程沿用已有 Seedance 2.0/2.5。
当前接口没有 MiniMax 模型项，不能把 H3 实验说成 Maker 已原生生成。
2.0 支持 4～15 秒，2.5 支持 4～30 秒；2.5 首尾帧使用 adaptive。
10 秒 2.0 估算 2000 积分，2.5 估算 3000 积分，实际以平台扣费为准。
超过 1000 积分需明确确认，分组的通用执行确认不能替代本次视频的积分确认。

任务超时或结果未知时使用「查询原任务」，不重复提交。停止本地等待不等于取消远端任务。

## 设计要点

先做满房间再移除家具，让首尾帧共享建筑和相机。独立生成两张房间容易改变窗户和透视。
家具采用圆润、厚实、轮廓清楚的欧卡造型，适合压缩、拉伸与回弹；不使用写实细碎纹理。
视频提示词规定不同家具组的入场方式和节奏，避免只有“逐渐出现”而变成淡入或整体溶解。
换房间时以新尾帧中实际存在的物件为准，不照抄五扇窗、王座等示例专属物件。
提示词时间点是导演意图，不是模型保证精确执行的时间轴。

## 已确认的历史样片

H3 样片由公共工具生成，用户已认可效果；首尾图是 1536×864。
原始视频 1344×768、24 FPS、243 帧、10.125 秒，上下各裁 6 像素后等比放大为 1536×864。
这不是模型原生精确 16:9，不能用拉伸代替等比适配。

实际顺序约为：窗帘 0.25～1.63 秒、地毯 1.08～3.17 秒、中央座椅 2.75～3.88 秒、
柜子 3.92～5.17 秒、植物 4.58～5.08 秒、书桌 5.21～5.83 秒、沙发 5.75～6.46 秒、
茶几与道具 6.17～8.42 秒，之后稳定。节奏与提示词并不完全相同。
柜子弹得偏高，个别家具悬浮偏久。新提示词加入约 110～115% 峰值高度、短回弹和不出框约束。
新提示词在 Maker 上的成片质量需单独验证，不能沿用 H3 的认可结论。

旧离线流程：243 帧去掉 24 张近似重复帧，从 219 张候选取 120 帧，384×216、12 FPS、10 秒，
图集约 11.55 MB。它改变了静止段和部分动作节奏。新画布流程直接扫描原视频并保留逐帧时间间隔。
实际处理该样片得到 120 帧，覆盖 0～10.124 秒，逐帧时长合计 10.125 秒；
3840×2592 图集为 18,045,942 字节，低于上传上限。

## 卡点与处理

| 卡点                               | 原因                                         | 处理                                                 |
| ---------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| 只能处理开头约 80 帧               | 默认只取 3 秒；去重前受帧数及原尺寸预算限制  | 全片模式先小图扫描，再编码选中帧；保留首尾           |
| 缩小输出仍超限                     | 原预算按 1024 边长的解码帧计算               | 全片模式结合受限解码尺寸和输出图集容量               |
| 保存时报 Request body is too large | PNG 超过 20 MiB                              | 打包后、上传前检查真实字节数；保留帧供缩小尺寸重存   |
| 后台处理慢                         | 每帧 setTimeout 可能受后台节流               | 改用消息任务让出执行权，保留进度与取消               |
| 失败遮罩挡住编辑                   | 普通序列卡没有调整入口                       | 非运行状态提供「调整参数」，继续原草稿               |
| CLI 拒绝结束 0                     | CLI 与界面的全片约定不一致                   | 两处支持并持久保留 0，换更长视频仍覆盖全片           |
| 10 秒配置或保存失败                | 界面、CLI、提交、保存仍限 4～8 秒            | 按已有 Seedance 模型的时长范围验证                   |
| 重开丢设置与节奏                   | 保存层未保留采样模式、逐帧时长               | 保存、编辑预览、动画和两种导出均传递时长             |
| 示例能看、换素材不连贯             | 离线中间视频没有依赖关系，画布也未保存为模板 | 完整参考关系和原生抽帧，通过模板 ZIP 分享            |
| 自动化弹出保存框                   | 点击了面向人工的模板库导出按钮               | CLI `export-template` 指定输出目录，复用同一归档服务 |

全片模式最多扫描 900 个采样间隔，输出最多 120 帧，仍受 4096×4096 图集及像素预算限制。
长视频降低扫描 FPS 或选定区间；细小高速动作应提高扫描精度并逐段预览。近似重复判断采用
低分辨率全图及局部块差异，仍是有损处理，不能保证任意视频压到 120 帧都无损。

图集超过 20 MiB 时，在「调整参数 → 整理与输出 → 调整输出尺寸与帧率」降低宽高，
例如 384×216 改为 320×180，再缩放保存，无需重新生视频。
主动修改播放 FPS 会改成固定帧间隔；保持原节奏时不要修改该项。

## 验收边界

分别核对首尾建筑对齐、视频实际动作、完整帧集覆盖、保存重开、最终导出文件。
H3 样片与 Maker 新任务是两份来源；未完成 Maker 新任务前，只能认定本地处理链路及模板结构，
不能宣称 Maker 生视频效果已经验收。

## 可复用提示词

### 满房间：默认宫廷会客室

```text
Create an original grand royal sitting room in an appealing Western casual mobile-game cartoon style (欧卡 / 欧美卡通手游风). Landscape 16:9, 1536x864. Deliver one full-bleed game environment, no text, UI, watermarks or comparison layout.
Most important: use playful stylized shape language and simplified illustration. Oversized rounded furniture silhouettes, thick plump cushions, chunky curved wooden legs, generous rounded bevels, broad bold gold trim, large simple decorative motifs, warm rich saturated colors, soft painted gradient shading, restrained clean highlights, simplified smooth materials. Furniture looks crafted for squash-and-stretch animation, with sturdy readable shapes that can compress and spring back like animated film props. Fully formed and resting normally in this still image. NOT photorealistic, NOT an architectural visualization, NOT a photograph, NOT realistic baroque detailing, NOT thin intricate filigree, NOT tiny woodgrain or fabric fibers, NOT PBR or ray-traced material rendering.
A noble but joyful palace room: warm honey-gold architecture, red/burgundy velvet, emerald green cushions and turquoise-blue window light. Gently curved rear wall with five tall arched windows and a sunlit painted garden outside, chunky gold window frames, simple timber ceiling ribs and a shallow curved raised dais. Fixed front-centered camera, slightly elevated, coherent moderate perspective and clearly visible floor. Strong foreground/midground/background staging, broad comfortable room spanning the landscape frame, no fisheye, no extreme tunnel perspective. Architecture is also rounded and simplified .
Luxurious but readable furniture groups: a plump emerald throne-like armchair centered on the back dais; deep red scalloped curtains and drapes around the windows with oversized gold tassels; a small chunky gold chandelier above; a red runner with a bold simple gold border and a few large fleur-de-lis motifs unrolled down the center toward the foreground; a tall honey-walnut cabinet at left with a few big colorful books and porcelain ornaments; a rounded red velvet sofa at right with two plump gold cushions; a generous rounded wooden writing desk in the foreground left, with a big brass globe, a closed turquoise book and an oversized quill in an inkpot; a low round gold-trimmed tea table at foreground right with a stylized teapot and two cups; a small gold side table on the dais and a leafy plant in a rounded blue ceramic pot at rear left.
Arrange every object in convincing shared perspective, use soft simple contact shadows, leave a visible central aisle and show the complete front edge of the rug inside the frame. Furniture groups are separated enough to read and animate independently. All main furniture must fit within frame. Rich full-room decoration and dignified palace scale, yet clearly a colorful Western cartoon GAME scene . The broad shapes and soft proportions matter more than microscopic detail.
```

### 空房间：引用满房间

```text
Edit the provided furnished room into its EMPTY first frame. Preserve its exact 16:9 composition, camera, perspective, architecture, window count and positions, outdoor scenery, lighting and cartoon art style. Every visible permanent architectural edge must remain at the same image coordinates. First identify all removable furniture, curtains, rugs, hanging lights, plants and props actually present in this image; remove them all and their contact shadows. Fill the revealed floor and walls consistently with the existing surfaces. Preserve permanent steps, windows, ceiling and wall structure. Do not invent new openings or redesign the room. No zoom, crop, lens changes, text or comparison layout. Output one empty image matching the input dimensions.
```

### 视频：首帧为空，尾帧为满

```text
A playful 10-second Western casual mobile-game cartoon room-decorating animation. The EMPTY room is the FIRST frame; the FURNISHED version of the same room is the LAST frame. Fixed camera, one continuous shot, no zoom, pan, cuts or background movement. Preserve the exact room shell, window positions, floor lines, perspective and lighting throughout.
Animate only removable objects actually visible in the supplied LAST frame. Use their real final positions, counts and silhouettes; omit any category absent from that image. Do not invent extra furniture.
Timing guide: 0.0-0.4s hold the empty room. 0.4-1.8s curtains and hanging fabric unfurl downward, the hanging light gently bobs into place. 1.8-3.2s the rug visibly unrolls from the rear toward the camera with a rounded cylindrical leading roll, then flattens. 3.2-4.4s central seating and side tables grow upward from their anchored bases with squash and stretch. 4.4-5.6s cabinets and plants spring up with short, staggered rebounds. 5.6-7.0s desks, chairs, sofas and tea tables pop into their final places with varied timing. 7.0-8.5s cushions, books and small props land with tiny hops. 8.5-10.0s settle fully and hold the furnished composition.
Each arrival has anticipation, one main overshoot, and one or two diminishing rebounds. Keep feet and bases grounded during squash and stretch; peak height around 110-115% of final height, no long hovering and no furniture leaving the frame. Maintain the identity and topology of each object. Motion should feel chunky, soft, bouncy and readable, with clear stagger between groups.
No opacity fades, cross-dissolves, ghost copies, liquid morphing, sliding architecture, cuts, characters, text, particles or added objects. End with a clean stable match to the LAST frame.
```

### 历史 H3 实际提示词：用于复盘

```text
A playful 10-second Western cartoon mobile-game room-decorating animation. Use the supplied empty room as the FIRST frame and the furnished room as the LAST frame. One locked camera, one continuous shot, same room throughout. The windows, garden, ceiling beams, columns, walls, dais steps, tiled floor, perspective and lighting remain absolutely still. Only furnishings animate. Bold readable squash-and-stretch, springy DUANG-DUANG bounces and staggered entrances, matching these rounded cartoon furniture designs.
0.0-0.4 seconds: hold the empty room.
0.4-1.8 seconds: the red curtains and valances unfurl from their fixed top edges, roll down with cascading cloth folds and a soft swish, gathering into their final positions. The two heraldic banners unfurl vertically. The little gold chandelier drops down on its chain with one short springy bob.
1.8-3.2 seconds: a visible thick red carpet roll forms at the back floor near the dais and rolls TOWARD THE CAMERA, rotating as it unspools the flat gold-bordered rug behind it. Clearly show the moving cylindrical leading edge and the flat rug it leaves behind; it finishes flat at the exact final front edge. The tiled floor never moves.
3.2-4.3 seconds: the green throne sprouts from its final floor contact as a short squashed shape, stretches upward past normal height, compresses once on landing, rebounds a little and settles. The small fruit-bowl side table follows with a tiny bounce.
4.2-5.5 seconds: the left cabinet rises from a short wide base, stretches vertically, then squashes and rebounds into its final proportions. Books and pottery pop into its shelves after it settles. The potted plant pops up beside it, leaves springing outward.
5.3-7.0 seconds: the foreground writing desk and its red chair pop up at their final positions with a clear vertical stretch, a broad squash on landing, and one smaller rebound. Slightly later the red sofa at right does a larger soft DUANG bounce; its two cushions squash with it then jiggle with a small delayed follow-through. The round tea table rises and lands with a compact bounce.
7.0-8.5 seconds: the globe, turquoise book, quill and inkpot, teapot and cups make short staggered hops into their correct positions on the now-still tables. Each small object gives one tiny landing bounce, then stays still.
8.5-10.0 seconds: everything settles into the furnished LAST image and holds completely still.
Each entrance is an actual shape animation with anticipation, fast spring-out, clear overshoot, squash on landing and a diminishing rebound. Allow intentional elastic deformation of furniture but preserve each object's final identity, count, location, color and proportions. Keep their feet/base anchored to their own final floor footprint during squash/stretch. Different groups start at different moments. No whole-room reveal, no opacity fade, no cross-dissolve, no transparent ghost furniture, no melting, no furniture turning into different furniture, no camera moves or zoom, no room geometry deformation, no scene cuts, no characters, hands, text, extra objects or explosive particles.
```
