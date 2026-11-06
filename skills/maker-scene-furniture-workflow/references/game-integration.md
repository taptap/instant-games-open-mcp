# 场景素材接入

入口 scene.json（version 2）。素材包仅含素材和配置，不含 UI.json 或游戏入口代码。

| 配置                     | 用途                                                     |
| ------------------------ | -------------------------------------------------------- |
| size、coordinates        | 设计尺寸；左上原点，x 向右、y 向下，像素 xywh            |
| viewport                 | contain 等比缩放、居中；按场景边界裁切                   |
| background               | 默认空场景背景，路径相对素材包根目录                     |
| assets                   | 唯一资源列表：静态图、animation.json、类别               |
| instances                | 每个摆放位置：assetId、imageBox、animationBox、zIndex    |
| playback                 | speed 为整体速度倍率；autoplay=false 默认只显示背景      |
| instances.startMs、speed | 计划入场时间、单件速度倍率（默认 1）                     |
| instances.parent         | 支撑物实例 ID；不做坐标或缩放继承                        |
| animation.json           | 帧文件、durationMs、帧尺寸、loop=false、endBehavior=hold |

每帧 file 相对该 animation.json 所在目录。共享 assetId 只共享图片缓存，各实例独立计时和显示。

## 还原步骤

1. 读取 scene 和每份 animation；绘制背景，默认隐藏家具。不要启动时预加载全部帧为 GPU 纹理；按需读取，可预加载即将播放的动作。
2. 视口宽高 W/H，缩放 s=min(W/size[1],H/size[2])，偏移 ((W-size[1]*s)/2,(H-size[2]*s)/2)。背景和家具使用同一变换，不能各自适配。
3. 全部入场从场景时间 0 开始，每次增加 deltaMs \* playback.speed；整体速度同时影响入场间隔和动作。
4. 全部播放时，有效开始时间 max(startMs, 支撑物有效开始时间+支撑动画时长/支撑实例speed)，从父到子计算。无 parent 时直接用 startMs。
5. 局部动画时间 (场景时间-有效开始时间)\*实例speed。小于 0 隐藏；累计 frames[].durationMs 找当前帧，到边界切下一帧，结束后保持末帧。不用固定 fps 替代逐帧时长。
6. 按 zIndex 从小到大绘制；动画用 animationBox，静态图用 imageBox。不要逐帧裁透明边或在控件内二次 contain；矩形内部用 fill。

清空需取消全部定时状态，仅留背景；重播支撑家具时隐藏其子孙，避免摆件悬空。单件播放可先补播尚未出现的支撑物；不触发同资源的其他实例。越界动画按 viewport.clip 裁切。

## Maker Lua 接入参考

配套 Skill 的 assets/SceneFurniturePlayer.lua 接收已解码 scene 和 loadJson(相对路径)，提供：
new、playAll、clear、trigger(id)、update(deltaMs)、seek(sceneMs)、sample(id)、layout(W,H)。
sample 返回当前帧路径、animationBox、帧号与 finished；nil 表示隐藏。

将模块复制到 scripts，素材目录放在 assets 下；调用方用 cache:GetFile + cjson 解码配置，给返回图片路径加素材包前缀。
UI 可用设计尺寸的绝对布局舞台，外层按 layout 等比缩放并裁切；每实例一个 Panel，按 sample 的 box 和图片更新。所有状态由 Player 管理，不另开 Sprite 自动播放计时器。

正式帧已烘焙弹性变形，游戏无需再施加缩放曲线。画布循环预览不改变播放一次的配置。游戏 AI 接入后对照 reference 检查位置、层级和几段动作即可。
