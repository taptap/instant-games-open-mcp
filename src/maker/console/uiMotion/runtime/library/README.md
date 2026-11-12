# LuaTween

一个纯 Lua、单文件的补间动画库：不绑定渲染器，不需要第三方依赖。
用几行链式调用就能描述 UI 入场、按钮反馈、数字滚动与路径移动，方便 AI 接入现有游戏。

## 常用方法

- `To`：将普通 Lua table 的数字属性补间到目标值。
- `Value`：用 getter/setter 适配引擎对象或数字显示；`Path`：沿路径移动。
- `Sequence`：把多个动效组织成一条时间线。
- `Pause / Play / Restart / Kill`：暂停、继续、重播、取消自身动画。

## 串联、并发与混用

| 方式 | 写法                          | 播放顺序                        |
| ---- | ----------------------------- | ------------------------------- |
| 串联 | `Append(A):Append(B)`         | A 结束后开始 B                  |
| 并发 | `Append(A):Join(B)`           | A、B 同时开始，等待最长一段结束 |
| 混用 | `Append(A):Join(B):Append(C)` | A、B 同时播放，两者结束后开始 C |

`Join` 对齐最近加入段落的起点，不是永远从整条时间线的第 0 秒开始。
`AppendInterval(seconds)` 可以在序列末尾插入等待。

例如：移动与淡入同时播放 → 停留半秒 → 缩放到正常大小。

```lua
local LuaTween = require('LuaTween')
local panel = {x = -120, alpha = 0, scale = 0.9}

local sequence = LuaTween.Sequence(panel)
    :Append(LuaTween.To(panel, {x = 0}, 0.3, 'outCubic'))
    :Join(LuaTween.To(panel, {alpha = 1}, 0.2, 'linear'))
    :AppendInterval(0.5)
    :Append(LuaTween.To(panel, {scale = 1}, 0.2, 'outBack'))
```

在项目统一更新入口每帧调用一次 `LuaTween.Update(dt)`（秒），将状态映射到实际 UI。
接入前由 AI 检查并复用已有库、更新入口和事件绑定，无需用户手动安装。
关闭组件时只取消自己的 `sequence:Kill()`，不要清空全局动画。

详细用法见控制台「源码」中 `LuaTween.lua` 顶部注释。
