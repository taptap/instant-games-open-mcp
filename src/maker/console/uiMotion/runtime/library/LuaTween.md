# LuaTween AI 使用指南

本文件给 AI 和开发者快速了解 `LuaTween.lua` 的用法。模块位置：

```lua
local LuaTween = require("LuaTween")
```

`LuaTween` 是纯 Lua 的链式补间模块，功能目标对齐 DOTween 常见工作流，但代码和公开命名保持独立。它适合 UI 表现、2D/3D 物件表现、数字滚动、路径移动和轻量演出编排。它不会自动订阅 UrhoX Update 事件，使用方必须在每帧调用：

```lua
function HandleUpdate(eventType, eventData)
    local dt = eventData["TimeStep"]:GetFloat()
    LuaTween.Update(dt)
end
```

## 核心概念

- Tweener：单个属性补间，例如 `{ x = 0 } -> { x = 100 }`。
- Sequence：时间线组合，可串行动画和并行动画。
- Manager：`LuaTween` 模块内部维护 active tween 列表，`LuaTween.Update(dt)` 统一推进。
- Target/Id：可用 `SetTarget(target)` 或 `SetId(id)` 后通过批量 API 控制。
- Ease：缓动函数名或函数。默认 `linear`。

## 最小示例

```lua
local panel = { x = -120, y = 40, alpha = 0 }

LuaTween.To(panel, { x = 20, alpha = 1 }, 0.35, "outBack")
    :SetId("panel-in")
    :OnComplete(function()
        print("panel entered")
    end)

-- 每帧调用
LuaTween.Update(dt)
```

## 模块级 API

### `LuaTween.To(subject, target, duration, ease)`

创建 table 属性补间。`subject` 和 `target` 都必须是 table，`target` 的叶子字段必须是 number，且必须已经存在于 `subject`。

```lua
local obj = { x = 0, y = 0, color = { a = 0 } }
LuaTween.To(obj, { x = 100, color = { a = 1 } }, 0.5, "outQuad")
```

效果：

- 自动注册到全局 manager。
- 支持嵌套 table。
- 补间完成后会从 active 列表移除。

### `LuaTween.Value(getter, setter, endValue, duration, ease)`

创建 getter/setter 补间。适合 userdata、引擎对象属性、或不能直接 table 插值的对象。

```lua
LuaTween.Value(
    function() return node.position.x end,
    function(v)
        local p = node.position
        node.position = Vector3(v, p.y, p.z)
    end,
    10,
    0.4,
    "inOutSine"
)
```

效果：

- 每帧读取初始值并通过 setter 写回。
- `endValue` 可以是 number，也可以是 vector-like table。

### `LuaTween.Path(subject, propertyName, waypoints, duration, options)`

沿线性折线路径移动 table 字段。

```lua
local item = { pos = { x = 0, y = 0 } }

LuaTween.Path(item, "pos", {
    { x = 0, y = 0 },
    { x = 120, y = 0 },
    { x = 120, y = 80 },
}, 1.0, { ease = "linear" })
```

效果：

- 本期只支持线性路径。
- 按折线总长度等速采样，长线段占用更多时间。
- waypoint 字段以第一个点中的 number 字段为准。

### `LuaTween.Sequence(target)`

创建时间线组合。`target` 可选，用于之后 `LuaTween.Kill(target)`、`LuaTween.Pause(target)` 等批量控制。

```lua
local seq = LuaTween.Sequence(panel)
seq:Append(LuaTween.To(panel, { x = 40 }, 0.2, "outQuad"))
   :Join(LuaTween.To(panel, { alpha = 1 }, 0.2, "linear"))
   :AppendInterval(0.1)
   :AppendCallback(function() panel.ready = true end)
   :Append(LuaTween.To(panel, { y = 80 }, 0.25, "outBack"))
```

效果：

- `Append` 串行追加。
- `Join` 与上一段同起点并行播放。
- 加入 Sequence 的子 tween 会从全局 manager 移除，避免重复 Update。
- Sequence 自然播放时会触发子 tween 的 `OnStart`、`OnUpdate`、`OnComplete`；手动 `Goto(seconds)` 仍不触发回调。

### `LuaTween.Update(dt)`

推进所有 active tween/sequence。

```lua
LuaTween.Update(dt)
```

效果：

- 自动跳过 paused tween。
- 自动移除 completed/killed tween。

### 批量控制 API

这些 API 的第一个参数可以是 `id` 或 `target`。传 `nil` 表示全部 active tween。

```lua
LuaTween.Kill(idOrTarget, complete)
LuaTween.Pause(idOrTarget)
LuaTween.Resume(idOrTarget)
LuaTween.Play(idOrTarget)
LuaTween.Restart(idOrTarget)

LuaTween.KillAll(complete)
LuaTween.PauseAll()
LuaTween.ResumeAll()
LuaTween.Clear()
LuaTween.TotalActive()
```

效果：

- `Kill(idOrTarget, true)` 会先 Complete 再 Kill。
- `Pause` 只暂停，不重置进度。
- `Resume` / `Play` 继续播放。
- `Restart` 回到起点并重新播放。
- `Clear` 清空 manager，适合切场景或重置测试。
- `TotalActive` 返回当前 active tween/sequence 数量。

## Tweener 链式 API

所有 `LuaTween.To`、`LuaTween.Value`、`LuaTween.Path`、shortcut 返回的对象都支持这些方法：

```lua
tw:Update(dt)
tw:Goto(seconds)
tw:Pause()
tw:Resume()
tw:Play()
tw:Kill(complete)
tw:Complete()
tw:Restart()
tw:Rewind()
tw:SetEase(ease)
tw:SetDelay(seconds)
tw:SetId(id)
tw:SetTarget(target)
tw:SetLoops(count, loopType)
tw:OnStart(fn)
tw:OnUpdate(fn)
tw:OnComplete(fn)
tw:OnStepComplete(fn)
tw:OnKill(fn)
tw:IsComplete()
```

### 生命周期效果

- `Pause()`：停止推进时间。
- `Resume()` / `Play()`：恢复播放。
- `Kill(complete)`：停止并移出 manager；`complete=true` 时先跳到终点。
- `Complete()`：跳到终点，触发 `OnComplete`。
- `Restart()`：回到起点，重新播放。
- `Rewind()`：回到起点并暂停。
- `SetDelay(seconds)`：设置启动延迟，`Restart()` 和 `Rewind()` 会恢复该延迟。
- `Goto(seconds)`：跳到指定时间点，不触发回调。

### Callback 效果

- `OnStart(fn)`：第一次播放时触发一次。
- `OnUpdate(fn)`：每次实际推进并写值后触发。
- `OnComplete(fn)`：自然完成或 `Complete()` 时触发。
- `OnStepComplete(fn)`：每完成一次 loop cycle 时触发，包括最后一轮。
- `OnKill(fn)`：`Kill()` 时触发。

### Loop/Yoyo

```lua
LuaTween.To(obj, { x = 100 }, 0.5, "linear")
    :SetLoops(3, "restart")

LuaTween.To(obj, { alpha = 1 }, 0.8, "inOutSine")
    :SetLoops(-1, "yoyo")
```

效果：

- `SetLoops(3, "restart")`：从起点到终点播放 3 次。
- `SetLoops(2, "yoyo")`：正向一次、反向一次，最终回到起点。
- `SetLoops(-1, "yoyo")`：无限往返循环。

## Sequence API

Sequence 支持 Tweener 的大部分生命周期方法，并额外支持：

```lua
seq:Append(child)
seq:Join(child)
seq:AppendInterval(seconds)
seq:AppendCallback(fn)
```

### `seq:Append(child)`

把 tween/sequence 追加到当前时间线尾部，形成串行动画。

### `seq:Join(child)`

把 child 放到上一段动画的起始时间，形成并行动画。

### `seq:AppendInterval(seconds)`

在时间线尾部插入等待。

### `seq:AppendCallback(fn)`

在时间线当前位置插入一次性回调。

## 引擎对象 shortcut

这些 shortcut 面向常见 table/view-model 对象。真实 UrhoX userdata 如果字段不能直接读写，应改用 `LuaTween.Value`。

### `LuaTween.MoveTo(target, endValue, duration, ease)`

补间 `target.position`。

```lua
local nodeProxy = { position = { x = 0, y = 0, z = 0 } }
LuaTween.MoveTo(nodeProxy, { x = 2, y = 1, z = 0 }, 0.5, "outQuad")
```

### `LuaTween.ScaleTo(target, endValue, duration, ease)`

补间 `target.scale`。

```lua
LuaTween.ScaleTo(button, { x = 1.08, y = 1.08, z = 1 }, 0.12, "outBack")
```

### `LuaTween.FadeTo(target, endValue, duration, ease)`

补间 `target.alpha`；如果没有 `alpha`，则尝试 `target.opacity`。

```lua
LuaTween.FadeTo(panel, 1, 0.25, "linear")
```

## Ease 名称

可用缓动名：

```text
linear
inQuad outQuad inOutQuad outInQuad
inCubic outCubic inOutCubic outInCubic
inQuart outQuart inOutQuart outInQuart
inQuint outQuint inOutQuint outInQuint
inSine outSine inOutSine outInSine
inExpo outExpo inOutExpo outInExpo
inCirc outCirc inOutCirc outInCirc
inBack outBack inOutBack outInBack
inBounce outBounce inOutBounce outInBounce
inElastic outElastic inOutElastic outInElastic
```

常用选择：

- UI 弹出：`outBack`
- UI 消失：`inBack`
- 数字滚动：`outQuad`
- 淡入淡出：`linear` 或 `inOutQuad`
- 呼吸/循环光效：`inOutSine` + `SetLoops(-1, "yoyo")`
- 弹跳：`outBounce`
- 夸张弹性：`outElastic`

## 推荐模式

### UI 入场

```lua
panel.x = -80
panel.alpha = 0

LuaTween.To(panel, { x = 24, alpha = 1 }, 0.35, "outBack")
    :SetDelay(0.08)
    :SetId("menu-page")
```

多元素级联入场可以给每个 tween 设置不同 delay：

```lua
LuaTween.To(header, { alpha = 1, x = 0 }, 0.35, "outBack")
    :SetDelay(0.05)
    :SetId("menu-page")

LuaTween.To(card, { alpha = 1, y = 0 }, 0.4, "outBack")
    :SetDelay(0.18)
    :SetId("menu-page")
```

### 按钮点击反馈

```lua
LuaTween.Sequence(button)
    :Append(LuaTween.ScaleTo(button, { x = 0.94, y = 0.94, z = 1 }, 0.06, "outQuad"))
    :Append(LuaTween.ScaleTo(button, { x = 1, y = 1, z = 1 }, 0.12, "outBack"))
```

### 金币数字滚动

```lua
local display = { cash = oldCash }

LuaTween.To(display, { cash = newCash }, 0.45, "outQuad")
    :OnUpdate(function()
        uiCashText = tostring(math.floor(display.cash))
    end)
```

### 切页面时清理动画

```lua
LuaTween.Kill("market-page")
-- 或者切整个场景
LuaTween.Clear()
```

## 注意事项

- `duration` 必须大于 0。
- `target` 字段必须预先存在于 `subject`，且是 number。
- Sequence 中的子 tween 不应再手动 `Update`。
- `Goto(seconds)` 用于无副作用跳转时间，不会触发 `OnStart`、`OnUpdate`、`OnComplete`、`OnStepComplete`。
- 无限 loop 不会自然完成，也不会自动触发 `OnComplete`。
- 对 UrhoX `Vector3`、`Color` 等 userdata，优先用 `Value(getter, setter, ...)` 做适配。
- 每个游戏页面如果创建了长期循环 tween，离开页面时应 `Kill(idOrTarget)` 或 `Clear()`。

## 本地测试

仓库内置轻量 Lua 行为测试：

```bash
lua tests/run.lua
```

测试覆盖启动延迟、Sequence 子 tween 回调、loop step complete 等基础行为。
