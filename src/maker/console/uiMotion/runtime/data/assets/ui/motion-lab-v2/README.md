# 更多 UI 动效

七套界面按视觉关键词命名：深青描金、霓虹涂鸦、粉彩圆角、纸感缝线、复古铜框、科技切角、典雅绶带。
界面展示普通按钮、标签、列表、弹窗、文字信息、选项卡和数量项；不包含角色、怪物、游戏徽记或特色道具。
保留各套自己的布局、配色和材质。

## 原生接入

- 各关键词目录对应独立 PNG、空白与退选状态及选中边框，媒体从参考包 assets 列表按需下载。
- 浮动菜单与列表返回按钮使用独立的 \*-floating.png 透明轮廓；返回按钮保持原图比例。
- 顺播中的停止按钮复用 header-sequence-blank.png 材质，并绘制对应风格的动态文字。
- assets/ui/motion-lab-v2/designs.json 是布局和名称的唯一来源，按数组条目的 id 匹配所选皮肤；scripts/MotionLabDesign.lua 是其生成数据。
- scripts/MotionLabComponents.lua 负责图层绘制、选择、提示、弹窗与组件反馈。
- scripts/MotionLab.lua 负责目录、播放时钟、重播、33 项顺播和输入路由。
- scripts/MotionLabMain.lua 是独立 NanoVG 入口，不覆盖项目 main.lua。
- assets/ui/motion-lab-v1/catalog.json 保存 43 项动效与阶段时序，fonts/ 保存字体及许可。

坐标保持 2048 × 1152 横屏，绘制与输入均按同一比例换算；右侧目录独立滚动，不显示底部时间轴。
控制台预览通过左右小三角切换界面；底部当前名称可展开七套界面列表，支持上下滚动与键盘选择。
所有图层独立绘制，不能用整屏设计图覆盖组件热区。选项卡、弹窗、列表、提示和数量项可单独接入。
初始化 Init(ctx, catalog)，每帧 Update(dt)，在 NanoVGRender 中调用 Draw(ctx, width, height)。
GetControls() 返回当前可操作区域。网页和 Maker 原生执行同一份动效 Lua。
图层边缘含配套背景的纹理，换用其他背景前需处理边缘。

维护本仓库时更新 designs.json，再按 Maker 的现有构建流程生成 Lua 数据与预览；接入项目直接使用参考包中已生成的数据。
