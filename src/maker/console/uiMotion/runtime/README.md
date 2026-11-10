# LuaTween UI 演示运行代码

动画库：<https://github.com/529951164/Lua-Tween>
来源提交：a2eedd07e4b06c681ee3d2386d2e3c72c0582479
来源文件 SHA-256：36d6fbdccc8be2b2d96797192c323b4b285ab4b72558e7c5fb467f557d9f7767
LuaTween.lua 仅在顶部增加使用说明注释，运行代码保持原样；不能用 JS 版本或手写插值替换。
library.json 中 sha256 校验随包文件，upstreamSha256 标识未增补注释的来源文件。

网页通过 Fengari 执行此目录的 Lua。Canvas2D / NanoVG 只负责绘图，
输入、切页和演示计时由宿主负责。PNG、字体与 UI.json 来自独立素材，
不将整屏截图改成热区，也不重新生成已确认的七套皮肤。

- MotionLabRecipes.lua：43 项效果，真实 Value / Path / Sequence 属性补间。
- ClipPlayer.lua：JSON 属性轨道建立 To / Sequence；Goto 只定位姿态。
- Motion.lua：Maker UI 的轨道、输入命中与播放控制，强制使用 LuaTween。
- UiMotionRecipes.lua：网页和原生共用的转场、待机循环与角色反馈。
- ImageMotionRecipes、MotionLabDesign、MotionLabCatalog 在打包时从同一份时间线、布局与目录 JSON 生成，交付包包含生成的 Lua。
- MotionLabMain.lua、NanoVGShowcaseMain.lua、UIRedesignPreview.lua：原生入口。

接入时从控制台 /ui-motion/runtime-reference 取实际运行源码，
不要继续复制参考项目旧版 Motion / 手写 Tween。保留素材目录结构，
将需要的模块放进目标项目脚本路径。仅复用动效时适配现有控件，不额外引入渲染器；
复用完整 Maker 示例界面时才需要 urhox-libs/UI 与 NanoVG。
图片 UI 的参考包另含 UI.json、时间线及资源读取地址。
先读 docs/LuaTween-integration.md；库 README 与 API 位于 docs/luatween/。
库尚未安装时默认使用 scripts/LuaTween.lua，已有兼容原版则复用，不覆盖项目代码。

普通播放用项目统一的 LuaTween.Update(dt)，不能每个组件重复更新全局库。
工坊与逐帧查看使用暂停的属性序列 Goto(seconds)；无业务回调，
反向定位不能发奖、提交网络请求或自动切页。
每个控制器退出只 Kill 自己的序列，不调用全局 KillAll / Clear。
原生宿主负责 Start / Stop、输入订阅、画面缩放与绘图资源释放。

Fengari 仅为网页 Lua VM，不是 LuaTween 的 JS 移植。
其许可证随包保留于 FENGARI-LICENSE.txt。网页通过不代表 Maker 引擎验收。
