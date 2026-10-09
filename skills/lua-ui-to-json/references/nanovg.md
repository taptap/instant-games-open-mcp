# NanoVG 提取与回放

NanoVG 是即时绘制 API，原 Lua 函数没有可直接序列化的控件树。
编辑器用 NanoVG 节点保存命名图层内的绘制指令，保留原始坐标、曲线、渐变和绘制顺序。
这是视觉数据，不是 Lua 程序，不会自动提取业务热区或动画。

## 文档格式

```json
{
  "type": "NanoVG",
  "id": "border",
  "position": "absolute",
  "left": 20,
  "top": 30,
  "width": 240,
  "height": 160,
  "viewBox": [0, 0, 240, 160],
  "commands": [
    ["beginPath"],
    ["roundedRect", 2, 2, 236, 156, 12],
    ["fillPaint", { "kind": "linearGradient", "args": [0, 0, 240, 160, "#164e63", "#22a899"] }],
    ["fill"],
    ["strokeColor", "#a7f3d0"],
    ["strokeWidth", 2],
    ["stroke"]
  ]
}
```

节点可与 Panel、Label、Button 混用。viewBox 定义局部坐标；改节点尺寸会整体缩放，
不重算原绘图函数。背景样式写在指令中；通用节点属性控制布局、透明度、变换。
节点树中的 NanoVG 类型名使用青色区分，不添加重复后缀，也不改文档 ID。
属性面板点击「应用」后一次进入撤销历史；CLI ui patch 用 set 修改 commands/viewBox，
沿用 revision 冲突保护和原子保存。

ui capabilities --json 列出完整指令签名。每条指令为数组，第一项是去掉 nvg 前缀的 API 名，
其余参数去掉 context。颜色是 0..255 RGBA 数组或 #RRGGBB / #RRGGBBAA。
paint 使用 {kind,args}，支持 linearGradient、radialGradient、imagePattern；
图片画刷的第六个参数是 assets 相对资源路径，不保存原生 image handle。
单层最多 20000 条指令，save/restore 必须配对且最多嵌套 32 层；调用方仍须为外围 UI 保留原生栈空间。

## 从 Lua 提取

1. 读取活动页面及绘图函数，确认设计尺寸。按已有面板、装饰、标题等函数划分命名图层，
   保留稳定 ID；不要将整个游戏压成不可分选的截图。
2. 使用 [MakerNanoVG.lua](../runtime/MakerNanoVG.lua)，或通过 ui nanovg-adapter 取得同一源码。
   默认先在受控测试入口验证，不覆盖已有同名脚本。
3. 在已创建字体/资源、已开始的 NanoVG 帧内，对审阅过的同步函数调用 capture。
   它临时包装全局 nvg 函数，结束或异常时恢复，不能跨协程、跨帧或嵌套执行。

```lua
local Vector = require("ui.MakerNanoVG")
local layer = Vector.capture(vg, {
    id = "gothic_panel", width = 760, height = 460, left = 120, top = 100,
    images = { [nativeImage] = "image/panel.png" }, -- 仅用到已有图片时提供
    fonts = { [fontId] = "sans" },                 -- 仅用到 FontFaceId 时提供
}, function()
    Theme.DrawPanel(vg, 12, 12, 730, 420, 0.9)
end)
-- 用项目已有 cjson/资源写入方式输出 layer 或装入页面 children。
```

capture 从默认绘图状态和局部坐标开始，结束恢复原状态。回调内应设置颜色、画刷、字号，
不能依赖外层 transform、scissor 或隐含样式。已有图片/字体句柄须提供映射；
颜色和画刷在回调内创建。资源创建、销毁、未知 API 或无法映射的句柄会导致捕获失败。
可分离资源初始化与绘图后再提取，不能自动改写游戏业务逻辑来强行通过。

用 ui create --input-file 将结果写到新文件，检查后显式生成 meta。已有文档沿用 revision 比较，
不重新生成覆盖编辑结果。逐层检查缩放、文字、裁剪，说明捕获的动态状态，不推断其他状态已覆盖。
捕获前核对真实入场参数与动画终态，避免把尚未淡入的透明层误当作空页面。
若只提取某个初态，在文档中记录 `exportState`；多阶段页面按实际子状态分别检查。
存档数据区保持真实空态，另保留模板与绑定边界；不要伪造玩家数据填满页面。
拆分捕获结果时保留绘制顺序和进入每层时的颜色、字体、变换、裁剪状态，不能在未配对的 save/restore 中间切层。

## 引擎接入

仅提取时保留游戏入口。明确接入时才替换原绘制调用，不能新旧重复绘制。
原始 NanoVG 项目在现有 NanoVGRender / BeginFrame / EndFrame 中回放已解析节点：

```lua
-- resolveImage(path, ctx) 复用项目图片缓存，返回原生句柄。
Vector.draw(vg, layer, layer.left, layer.top, layer.width, layer.height, resolveImage)
```

draw 只画一个图层，不遍历普通 UI 节点，不管理帧、字体、资源、事件或存档。
直接调用时由游戏负责显隐、动画、外围变换及热区，不能让图层移位后热区仍留在旧坐标。

使用 urhox-libs/UI 时，在项目原 UI.LoadJSON 流程之前注册一次：

```lua
local UI = require("urhox-libs/UI")
local Vector = require("ui.MakerNanoVG")
Vector.register(UI, resolveImage)
```

注册复用 Widget 的布局、变换与树遍历；仍须绑定交互。新增 JSON 不证明引擎已接入。
字体名称由项目在当前 context 中创建，不能把浏览器兜底字体当原生字体。

## 限制与验收

支持路径、圆角/圆/椭圆/弧、贝塞尔曲线、描边、线性/径向渐变、图片画刷、单行及 textBox 多行文字、变换及裁剪。
textBox 指令为 `["textBox", x, y, width, text]`，宽度大于 0；浏览器按字体度量换行，保留显式换行，原生回放调用 nvgTextBox。
未列入白名单的调用（箱形渐变、pathWinding 孔洞、混合、fontBlur、reset 系列等）
会报错；不能删指令、用矩形或截图来掩盖差异。
Canvas 2D 与 NanoVG 的字体度量、抗锯齿、非等比描边、旋转裁剪可能不同。
浏览器图片画刷暂按重复采样预览，原生图片边缘/重复模式由项目 image flags 决定。
分别报告静态检查、浏览器视觉、Lua 调用测试和真实引擎视觉/交互验收。
模拟 nvg 函数的捕获/回放测试不能代替真实引擎验收。
