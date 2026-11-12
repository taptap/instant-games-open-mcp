--[[
LuaTween 使用方法（Maker MCP 补充说明；下方原版运行代码未修改）

一、接入与更新
    local LuaTween = require('LuaTween')
    local panel = {x = -120, alpha = 0, scale = 0.9}
    local tween = LuaTween.To(panel, {x = 0}, 0.3, 'outCubic')

在项目已有的统一更新入口中，每帧只调用一次 LuaTween.Update(dt)。
dt、持续时间和延迟的单位均为秒；属性必须预先存在且为数字。
渲染层将 panel 的属性映射到实际 UI；库不负责创建控件或绑定点击事件。
接入前先找已有模块、require 路径和更新入口，已有则复用，不重复安装或订阅。

二、Sequence 串联：前一段结束后，下一段才开始
    local sequence = LuaTween.Sequence(panel)
        :Append(LuaTween.To(panel, {x = 0}, 0.3, 'outCubic'))
        :Append(LuaTween.To(panel, {alpha = 1}, 0.2, 'linear'))
    -- 总时长 0.5 秒：先移动，再淡入。

三、Sequence 并发：Join 与最近加入段落的起点对齐
    local sequence = LuaTween.Sequence(panel)
        :Append(LuaTween.To(panel, {x = 0}, 0.3, 'outCubic'))
        :Join(LuaTween.To(panel, {alpha = 1}, 0.2, 'linear'))
    -- 总时长 0.3 秒：移动与淡入同时开始，以最长一段结束为准。
    -- Join 不是永远从整条时间线的第 0 秒开始。

四、串并混用：一组并发完成后，等待，再执行下一段
    local sequence = LuaTween.Sequence(panel)
        :Append(LuaTween.To(panel, {x = 0}, 0.3, 'outCubic'))
        :Join(LuaTween.To(panel, {alpha = 1}, 0.2, 'linear'))
        :AppendInterval(0.5)
        :Append(LuaTween.To(panel, {scale = 1}, 0.2, 'outBack'))
    -- 0–0.3 秒移动+淡入，0.3–0.8 秒等待，0.8–1.0 秒缩放。

以上是独立示例，按需选择，不要同时补间同一控件的同一个属性。
Append 加在整条序列末尾；Join 加在最近段落的起点；AppendInterval 在末尾等待。
Sequence 可嵌套。子 tween 加入后由序列管理，不要再单独 Update 子项；
构建好序列后再开始逐帧更新，避免子项在加入前已经播放。

五、其他常用方法
    LuaTween.Value(getter, setter, endValue, duration, ease)
        -- 用 getter/setter 连接引擎对象、数字文本等。
    LuaTween.Path(subject, propertyName, waypoints, duration, options)
        -- 沿路径更新属性。
    tween:SetDelay(0.1):SetEase('outCubic')
    tween:OnComplete(function() print('完成') end)
    sequence:AppendCallback(function() print('到达此段') end)
    sequence:Pause()     -- 暂停
    sequence:Play()      -- 继续
    sequence:Restart()   -- 重播
    sequence:Kill()      -- 取消，只清理本组件拥有的序列

控件连点前先取消旧句柄并恢复初始属性，再创建新序列；关闭/销毁时取消自身句柄。
不要为单个组件调用全局 KillAll/Clear，以免停止其他界面的动画。
原版无注释增补文件与当前文件可能哈希不同；先核对运行代码/API，不能因此重复安装。
]]

-- LuaTween.lua - lightweight chainable tween helpers for UrhoX Lua.

local LuaTween = {}

LuaTween.LoopType = {
    Restart = "restart",
    Yoyo = "yoyo",
}

local active = {}

local function clamp(v, minValue, maxValue)
    if v < minValue then return minValue end
    if v > maxValue then return maxValue end
    return v
end

local function copyValue(value)
    if type(value) ~= "table" then return value end
    local out = {}
    for k, v in pairs(value) do
        out[k] = copyValue(v)
    end
    return out
end

local function copyInto(destination, source)
    for k, v in pairs(source) do
        if type(v) == "table" then
            destination[k] = destination[k] or {}
            copyInto(destination[k], v)
        else
            destination[k] = v
        end
    end
end

local function validateTarget(subject, target, path)
    for k, v in pairs(target) do
        local keyPath = path and (path .. "." .. tostring(k)) or tostring(k)
        if type(v) == "table" then
            if type(subject[k]) ~= "table" then
                error("LuaTween target field '" .. keyPath .. "' is missing from subject", 3)
            end
            validateTarget(subject[k], v, keyPath)
        elseif type(v) ~= "number" then
            error("LuaTween target field '" .. keyPath .. "' must be a number", 3)
        elseif type(subject[k]) ~= "number" then
            error("LuaTween subject field '" .. keyPath .. "' must be a number", 3)
        end
    end
end

local function interpolateInto(subject, initial, target, progress)
    for k, v in pairs(target) do
        if type(v) == "table" then
            interpolateInto(subject[k], initial[k], v, progress)
        else
            subject[k] = initial[k] + (v - initial[k]) * progress
        end
    end
end

local function normalized(t, b, c, d, fn)
    if d <= 0 then return b + c end
    return b + c * fn(clamp(t / d, 0, 1))
end

local function makeIn(power)
    return function(t, b, c, d)
        return normalized(t, b, c, d, function(p) return p ^ power end)
    end
end

local function makeOut(power)
    return function(t, b, c, d)
        return normalized(t, b, c, d, function(p) return 1 - ((1 - p) ^ power) end)
    end
end

local function makeInOut(power)
    return function(t, b, c, d)
        return normalized(t, b, c, d, function(p)
            if p < 0.5 then
                return ((p * 2) ^ power) * 0.5
            end
            return 1 - (((1 - p) * 2) ^ power) * 0.5
        end)
    end
end

local function makeOutIn(inFn, outFn)
    return function(t, b, c, d)
        if t < d * 0.5 then
            return outFn(t * 2, b, c * 0.5, d)
        end
        return inFn((t * 2) - d, b + c * 0.5, c * 0.5, d)
    end
end

local function outBounceProgress(p)
    if p < 1 / 2.75 then
        return 7.5625 * p * p
    elseif p < 2 / 2.75 then
        p = p - 1.5 / 2.75
        return 7.5625 * p * p + 0.75
    elseif p < 2.5 / 2.75 then
        p = p - 2.25 / 2.75
        return 7.5625 * p * p + 0.9375
    end
    p = p - 2.625 / 2.75
    return 7.5625 * p * p + 0.984375
end

local easing = {
    linear = function(t, b, c, d)
        if d <= 0 then return b + c end
        return b + c * clamp(t / d, 0, 1)
    end,
}

for _, item in ipairs({
    { "Quad", 2 },
    { "Cubic", 3 },
    { "Quart", 4 },
    { "Quint", 5 },
}) do
    local name, power = item[1], item[2]
    easing["in" .. name] = makeIn(power)
    easing["out" .. name] = makeOut(power)
    easing["inOut" .. name] = makeInOut(power)
    easing["outIn" .. name] = makeOutIn(easing["in" .. name], easing["out" .. name])
end

easing.inSine = function(t, b, c, d)
    return normalized(t, b, c, d, function(p) return 1 - math.cos(p * math.pi * 0.5) end)
end
easing.outSine = function(t, b, c, d)
    return normalized(t, b, c, d, function(p) return math.sin(p * math.pi * 0.5) end)
end
easing.inOutSine = function(t, b, c, d)
    return normalized(t, b, c, d, function(p) return (1 - math.cos(p * math.pi)) * 0.5 end)
end
easing.outInSine = makeOutIn(easing.inSine, easing.outSine)

easing.inExpo = function(t, b, c, d)
    return normalized(t, b, c, d, function(p) return p == 0 and 0 or 2 ^ (10 * (p - 1)) end)
end
easing.outExpo = function(t, b, c, d)
    return normalized(t, b, c, d, function(p) return p == 1 and 1 or 1 - 2 ^ (-10 * p) end)
end
easing.inOutExpo = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        if p == 0 or p == 1 then return p end
        if p < 0.5 then return (2 ^ (20 * p - 10)) * 0.5 end
        return (2 - 2 ^ (-20 * p + 10)) * 0.5
    end)
end
easing.outInExpo = makeOutIn(easing.inExpo, easing.outExpo)

easing.inCirc = function(t, b, c, d)
    return normalized(t, b, c, d, function(p) return 1 - math.sqrt(1 - p * p) end)
end
easing.outCirc = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        p = p - 1
        return math.sqrt(1 - p * p)
    end)
end
easing.inOutCirc = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        if p < 0.5 then return (1 - math.sqrt(1 - (2 * p) ^ 2)) * 0.5 end
        local q = 2 * p - 2
        return (math.sqrt(1 - q * q) + 1) * 0.5
    end)
end
easing.outInCirc = makeOutIn(easing.inCirc, easing.outCirc)

easing.inBack = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        local s = 1.70158
        return p * p * ((s + 1) * p - s)
    end)
end
easing.outBack = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        local s = 1.70158
        p = p - 1
        return p * p * ((s + 1) * p + s) + 1
    end)
end
easing.inOutBack = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        local s = 1.70158 * 1.525
        p = p * 2
        if p < 1 then return 0.5 * p * p * ((s + 1) * p - s) end
        p = p - 2
        return 0.5 * (p * p * ((s + 1) * p + s) + 2)
    end)
end
easing.outInBack = makeOutIn(easing.inBack, easing.outBack)

easing.outBounce = function(t, b, c, d)
    return normalized(t, b, c, d, outBounceProgress)
end
easing.inBounce = function(t, b, c, d)
    return normalized(t, b, c, d, function(p) return 1 - outBounceProgress(1 - p) end)
end
easing.inOutBounce = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        if p < 0.5 then return (1 - outBounceProgress(1 - 2 * p)) * 0.5 end
        return outBounceProgress(2 * p - 1) * 0.5 + 0.5
    end)
end
easing.outInBounce = makeOutIn(easing.inBounce, easing.outBounce)

easing.outElastic = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        if p == 0 or p == 1 then return p end
        return (2 ^ (-10 * p)) * math.sin((p * 10 - 0.75) * (2 * math.pi / 3)) + 1
    end)
end
easing.inElastic = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        if p == 0 or p == 1 then return p end
        return -((2 ^ (10 * p - 10)) * math.sin((p * 10 - 10.75) * (2 * math.pi / 3)))
    end)
end
easing.inOutElastic = function(t, b, c, d)
    return normalized(t, b, c, d, function(p)
        if p == 0 or p == 1 then return p end
        local c5 = (2 * math.pi) / 4.5
        if p < 0.5 then
            return -0.5 * (2 ^ (20 * p - 10)) * math.sin((20 * p - 11.125) * c5)
        end
        return (2 ^ (-20 * p + 10)) * math.sin((20 * p - 11.125) * c5) * 0.5 + 1
    end)
end
easing.outInElastic = makeOutIn(easing.inElastic, easing.outElastic)

LuaTween.easing = easing

local function easeFunction(ease)
    if ease == nil then return easing.linear end
    if type(ease) == "function" then return ease end
    local fn = easing[ease]
    if not fn then error("LuaTween easing '" .. tostring(ease) .. "' does not exist", 3) end
    return fn
end

local function unregister(item)
    for i = #active, 1, -1 do
        if active[i] == item then
            table.remove(active, i)
            return
        end
    end
end

local function register(item)
    if item._registered then return item end
    item._registered = true
    table.insert(active, item)
    return item
end

local Tween = {}
Tween.__index = Tween

local function newTween(config)
    if type(config.duration) ~= "number" or config.duration <= 0 then
        error("LuaTween duration must be a positive number", 3)
    end
    local tw = setmetatable({
        duration = config.duration,
        ease = easeFunction(config.ease),
        subject = config.subject,
        target = config.target,
        getter = config.getter,
        setter = config.setter,
        sampler = config.sampler,
        clock = 0,
        elapsed = 0,
        delay = config.delay or 0,
        initialDelay = config.delay or 0,
        loops = 1,
        loopType = LuaTween.LoopType.Restart,
        playing = true,
        killed = false,
        completed = false,
        completedSteps = 0,
        started = false,
        id = nil,
        tweenTarget = config.tweenTarget or config.subject,
        callbacks = {},
    }, Tween)
    return register(tw)
end

function Tween:_captureInitial()
    if self.initial ~= nil then return end
    if self.getter then
        self.initial = copyValue(self.getter())
    else
        self.initial = copyValue(self.subject)
    end
end

function Tween:_apply(localClock)
    self:_captureInitial()
    local eased = self.ease(localClock, 0, 1, self.duration)
    eased = clamp(eased, -10, 10)
    if self.sampler then
        self.setter(self.sampler(eased))
    elseif self.getter then
        local value
        if type(self.target) == "table" then
            value = copyValue(self.initial)
            interpolateInto(value, self.initial, self.target, eased)
        else
            value = self.initial + (self.target - self.initial) * eased
        end
        self.setter(value)
    else
        interpolateInto(self.subject, self.initial, self.target, eased)
    end
end

function Tween:_emit(name)
    local fn = self.callbacks[name]
    if fn then fn(self) end
end

function Tween:_totalDuration()
    if self.loops == -1 then return math.huge end
    return self.duration * self.loops
end

function Tween:_currentStepCount()
    if self.duration <= 0 then return 0 end
    if self.loops == -1 then
        return math.floor((self.elapsed + 1e-12) / self.duration)
    end
    if self.elapsed >= self:_totalDuration() then
        return self.loops
    end
    return math.floor((self.elapsed + 1e-12) / self.duration)
end

function Tween:_localClockFromElapsed(elapsed)
    if self.loops == -1 then
        local cycle = math.floor(elapsed / self.duration)
        local cycleTime = elapsed - cycle * self.duration
        if self.loopType == LuaTween.LoopType.Yoyo and cycle % 2 == 1 then
            return self.duration - cycleTime
        end
        return cycleTime
    end

    local total = self:_totalDuration()
    if elapsed >= total then
        if self.loopType == LuaTween.LoopType.Yoyo and self.loops % 2 == 0 then
            return 0
        end
        return self.duration
    end

    local cycle = math.floor(elapsed / self.duration)
    local cycleTime = elapsed - cycle * self.duration
    if self.loopType == LuaTween.LoopType.Yoyo and cycle % 2 == 1 then
        return self.duration - cycleTime
    end
    return cycleTime
end

function Tween:_gotoElapsed(elapsed, emitCallbacks)
    if self.killed then return true end
    self.elapsed = clamp(elapsed, 0, self:_totalDuration())
    self.clock = self:_localClockFromElapsed(self.elapsed)

    if emitCallbacks and not self.started then
        self.started = true
        self:_emit("start")
    end

    self:_apply(self.clock)

    if emitCallbacks then
        self:_emit("update")
        local steps = self:_currentStepCount()
        while self.completedSteps < steps do
            self.completedSteps = self.completedSteps + 1
            self:_emit("stepComplete")
        end
    end

    local done = self.loops ~= -1 and self.elapsed >= self:_totalDuration()
    if done and not self.completed then
        self.completed = true
        self.playing = false
        if emitCallbacks then self:_emit("complete") end
    end
    return done
end

function Tween:Update(dt)
    if self.killed or self.completed then return true end
    if not self.playing then return false end
    if self.delay > 0 then
        self.delay = math.max(0, self.delay - dt)
        return false
    end
    return self:_gotoElapsed(self.elapsed + dt, true)
end

function Tween:Goto(seconds)
    return self:_gotoElapsed(seconds, false)
end

function Tween:Pause()
    if not self.killed and not self.completed then self.playing = false end
    return self
end

function Tween:Resume()
    if not self.killed and not self.completed then self.playing = true end
    return self
end

function Tween:Play()
    return self:Resume()
end

function Tween:Kill(complete)
    if self.killed then return self end
    if complete then self:Complete() end
    self.killed = true
    self.playing = false
    unregister(self)
    self:_emit("kill")
    return self
end

function Tween:Complete()
    if self.killed then return self end
    self:_gotoElapsed(self:_totalDuration(), true)
    return self
end

function Tween:Restart()
    if self.killed then return self end
    self.elapsed = 0
    self.clock = 0
    self.delay = self.initialDelay or 0
    self.completed = false
    self.completedSteps = 0
    self.started = false
    self.playing = true
    self:_gotoElapsed(0, false)
    register(self)
    return self
end

function Tween:Rewind()
    if self.killed then return self end
    self:_gotoElapsed(0, false)
    self.delay = self.initialDelay or 0
    self.playing = false
    self.completed = false
    self.completedSteps = 0
    return self
end

function Tween:SetDelay(seconds)
    if type(seconds) ~= "number" or seconds < 0 then
        error("LuaTween delay must be >= 0", 2)
    end
    self.delay = seconds
    self.initialDelay = seconds
    return self
end

function Tween:SetEase(ease)
    self.ease = easeFunction(ease)
    return self
end

function Tween:SetId(id)
    self.id = id
    return self
end

function Tween:SetTarget(target)
    self.tweenTarget = target
    return self
end

function Tween:SetLoops(count, loopType)
    if count ~= -1 and (type(count) ~= "number" or count < 1) then
        error("LuaTween loop count must be -1 or >= 1", 2)
    end
    self.loops = count
    self.loopType = loopType or LuaTween.LoopType.Restart
    return self
end

function Tween:OnStart(fn)
    self.callbacks.start = fn
    return self
end

function Tween:OnUpdate(fn)
    self.callbacks.update = fn
    return self
end

function Tween:OnComplete(fn)
    self.callbacks.complete = fn
    return self
end

function Tween:OnStepComplete(fn)
    self.callbacks.stepComplete = fn
    return self
end

function Tween:OnKill(fn)
    self.callbacks.kill = fn
    return self
end

function Tween:IsComplete()
    return self.completed
end

local Callback = {}
Callback.__index = Callback

local function newCallback(fn)
    return setmetatable({
        duration = 0,
        fn = fn,
        fired = false,
        id = nil,
        tweenTarget = nil,
        killed = false,
    }, Callback)
end

function Callback:_totalDuration()
    return 0
end

function Callback:Goto(seconds)
    if not self.fired and seconds >= 0 then
        self.fired = true
        if self.fn then self.fn(self) end
    end
    return true
end

function Callback:Restart()
    self.fired = false
    return self
end

function Callback:Kill()
    self.killed = true
    return self
end

local Sequence = {}
Sequence.__index = Sequence

local function newSequence(target)
    local seq = setmetatable({
        entries = {},
        duration = 0,
        elapsed = 0,
        delay = 0,
        initialDelay = 0,
        playing = true,
        killed = false,
        completed = false,
        completedSteps = 0,
        started = false,
        id = nil,
        tweenTarget = target,
        loops = 1,
        loopType = LuaTween.LoopType.Restart,
        callbacks = {},
        _lastStart = 0,
        _lastDuration = 0,
    }, Sequence)
    return register(seq)
end

local function childDuration(child)
    if child._totalDuration then return child:_totalDuration() end
    return child.duration or 0
end

function Sequence:_attach(child, start)
    unregister(child)
    child._registered = false
    table.insert(self.entries, {
        start = start,
        duration = childDuration(child),
        child = child,
        lastClock = nil,
    })
    self.duration = math.max(self.duration, start + childDuration(child))
    self._lastStart = start
    self._lastDuration = childDuration(child)
    return self
end

function Sequence:Append(child)
    return self:_attach(child, self.duration)
end

function Sequence:Join(child)
    return self:_attach(child, self._lastStart)
end

function Sequence:AppendInterval(seconds)
    if type(seconds) ~= "number" or seconds < 0 then
        error("LuaTween sequence interval must be >= 0", 2)
    end
    self.duration = self.duration + seconds
    self._lastStart = self.duration
    self._lastDuration = 0
    return self
end

function Sequence:AppendCallback(fn)
    return self:_attach(newCallback(fn), self.duration)
end

function Sequence:_emit(name)
    local fn = self.callbacks[name]
    if fn then fn(self) end
end

function Sequence:_totalDuration()
    if self.loops == -1 then return math.huge end
    return self.duration * self.loops
end

function Sequence:_currentStepCount()
    if self.duration <= 0 then return 0 end
    if self.loops == -1 then
        return math.floor((self.elapsed + 1e-12) / self.duration)
    end
    if self.elapsed >= self:_totalDuration() then
        return self.loops
    end
    return math.floor((self.elapsed + 1e-12) / self.duration)
end

function Sequence:_localClockFromElapsed(elapsed)
    if self.duration <= 0 then return 0 end
    if self.loops == -1 then
        local cycle = math.floor(elapsed / self.duration)
        local cycleTime = elapsed - cycle * self.duration
        if self.loopType == LuaTween.LoopType.Yoyo and cycle % 2 == 1 then
            return self.duration - cycleTime
        end
        return cycleTime
    end
    local total = self:_totalDuration()
    if elapsed >= total then
        if self.loopType == LuaTween.LoopType.Yoyo and self.loops % 2 == 0 then
            return 0
        end
        return self.duration
    end
    local cycle = math.floor(elapsed / self.duration)
    local cycleTime = elapsed - cycle * self.duration
    if self.loopType == LuaTween.LoopType.Yoyo and cycle % 2 == 1 then
        return self.duration - cycleTime
    end
    return cycleTime
end

function Sequence:_gotoElapsed(elapsed, emitCallbacks)
    if self.killed then return true end
    self.elapsed = clamp(elapsed, 0, self:_totalDuration())

    if emitCallbacks and not self.started then
        self.started = true
        self:_emit("start")
    end

    local localClock = self:_localClockFromElapsed(self.elapsed)
    for _, entry in ipairs(self.entries) do
        local child = entry.child
        if localClock >= entry.start then
            local childClock = clamp(localClock - entry.start, 0, entry.duration)
            local changed = entry.lastClock == nil or entry.lastClock ~= childClock
            entry.lastClock = childClock
            if emitCallbacks and changed and child._gotoElapsed then
                child:_gotoElapsed(childClock, true)
            else
                child:Goto(childClock)
            end
        end
    end

    if emitCallbacks then
        self:_emit("update")
        local steps = self:_currentStepCount()
        while self.completedSteps < steps do
            self.completedSteps = self.completedSteps + 1
            self:_emit("stepComplete")
        end
    end

    local done = self.loops ~= -1 and self.elapsed >= self:_totalDuration()
    if done and not self.completed then
        self.completed = true
        self.playing = false
        if emitCallbacks then self:_emit("complete") end
    end
    return done
end

function Sequence:Update(dt)
    if self.killed or self.completed then return true end
    if not self.playing then return false end
    if self.delay > 0 then
        self.delay = math.max(0, self.delay - dt)
        return false
    end
    return self:_gotoElapsed(self.elapsed + dt, true)
end

function Sequence:Goto(seconds)
    return self:_gotoElapsed(seconds, false)
end

function Sequence:Pause()
    if not self.killed and not self.completed then self.playing = false end
    return self
end

function Sequence:Resume()
    if not self.killed and not self.completed then self.playing = true end
    return self
end

function Sequence:Play()
    return self:Resume()
end

function Sequence:Kill(complete)
    if self.killed then return self end
    if complete then self:Complete() end
    self.killed = true
    self.playing = false
    unregister(self)
    for _, entry in ipairs(self.entries) do
        if entry.child.Kill then entry.child:Kill(false) end
    end
    self:_emit("kill")
    return self
end

function Sequence:Complete()
    if self.killed then return self end
    self:_gotoElapsed(self:_totalDuration(), true)
    return self
end

function Sequence:Restart()
    if self.killed then return self end
    self.elapsed = 0
    self.delay = self.initialDelay or 0
    self.completed = false
    self.completedSteps = 0
    self.started = false
    self.playing = true
    for _, entry in ipairs(self.entries) do
        if entry.child.Restart then entry.child:Restart() end
        unregister(entry.child)
        entry.child._registered = false
        entry.lastClock = nil
    end
    self:_gotoElapsed(0, false)
    register(self)
    return self
end

function Sequence:Rewind()
    if self.killed then return self end
    self:_gotoElapsed(0, false)
    self.delay = self.initialDelay or 0
    self.playing = false
    self.completed = false
    self.completedSteps = 0
    for _, entry in ipairs(self.entries) do
        entry.lastClock = nil
    end
    return self
end

function Sequence:SetDelay(seconds)
    if type(seconds) ~= "number" or seconds < 0 then
        error("LuaTween delay must be >= 0", 2)
    end
    self.delay = seconds
    self.initialDelay = seconds
    return self
end

function Sequence:SetId(id)
    self.id = id
    return self
end

function Sequence:SetTarget(target)
    self.tweenTarget = target
    return self
end

function Sequence:SetLoops(count, loopType)
    if count ~= -1 and (type(count) ~= "number" or count < 1) then
        error("LuaTween loop count must be -1 or >= 1", 2)
    end
    self.loops = count
    self.loopType = loopType or LuaTween.LoopType.Restart
    return self
end

function Sequence:OnStart(fn)
    self.callbacks.start = fn
    return self
end

function Sequence:OnUpdate(fn)
    self.callbacks.update = fn
    return self
end

function Sequence:OnComplete(fn)
    self.callbacks.complete = fn
    return self
end

function Sequence:OnStepComplete(fn)
    self.callbacks.stepComplete = fn
    return self
end

function Sequence:OnKill(fn)
    self.callbacks.kill = fn
    return self
end

function Sequence:IsComplete()
    return self.completed
end

local function matches(item, idOrTarget)
    if idOrTarget == nil then return true end
    return item.id == idOrTarget or item.tweenTarget == idOrTarget
end

local function applyToActive(idOrTarget, fn)
    local count = 0
    for i = #active, 1, -1 do
        local item = active[i]
        if matches(item, idOrTarget) then
            fn(item)
            count = count + 1
        end
    end
    return count
end

function LuaTween.To(subject, target, duration, ease)
    if type(subject) ~= "table" or type(target) ~= "table" then
        error("LuaTween.To expects table subject and target", 2)
    end
    validateTarget(subject, target)
    return newTween({
        subject = subject,
        target = target,
        duration = duration,
        ease = ease,
        tweenTarget = subject,
    })
end

function LuaTween.Value(getter, setter, endValue, duration, ease)
    if type(getter) ~= "function" or type(setter) ~= "function" then
        error("LuaTween.Value expects getter and setter functions", 2)
    end
    return newTween({
        getter = getter,
        setter = setter,
        target = endValue,
        duration = duration,
        ease = ease,
    })
end

function LuaTween.Sequence(target)
    return newSequence(target)
end

local function distance(a, b, keys)
    local sum = 0
    for _, key in ipairs(keys) do
        local d = (b[key] or 0) - (a[key] or 0)
        sum = sum + d * d
    end
    return math.sqrt(sum)
end

local function makePathSampler(points)
    if type(points) ~= "table" or #points < 2 then
        error("LuaTween.Path expects at least two waypoints", 3)
    end

    local keys = {}
    for k, v in pairs(points[1]) do
        if type(v) == "number" then table.insert(keys, k) end
    end
    table.sort(keys)

    local lengths = {}
    local total = 0
    for i = 1, #points - 1 do
        local len = distance(points[i], points[i + 1], keys)
        lengths[i] = len
        total = total + len
    end

    return function(progress)
        if total <= 0 then return copyValue(points[#points]) end
        local wanted = clamp(progress, 0, 1) * total
        local travelled = 0
        for i = 1, #lengths do
            local len = lengths[i]
            if wanted <= travelled + len or i == #lengths then
                local ratio = len == 0 and 1 or (wanted - travelled) / len
                ratio = clamp(ratio, 0, 1)
                local out = {}
                for _, key in ipairs(keys) do
                    out[key] = points[i][key] + ((points[i + 1][key] or points[i][key]) - points[i][key]) * ratio
                end
                return out
            end
            travelled = travelled + len
        end
        return copyValue(points[#points])
    end
end

function LuaTween.Path(subject, propertyName, waypoints, duration, options)
    options = options or {}
    if type(subject) ~= "table" then error("LuaTween.Path expects a table subject", 2) end
    local destination = propertyName and subject[propertyName] or subject
    if type(destination) ~= "table" then error("LuaTween.Path destination must be a table", 2) end

    local sampler = makePathSampler(waypoints)
    return newTween({
        getter = function() return copyValue(destination) end,
        setter = function(value) copyInto(destination, value) end,
        target = copyValue(waypoints[#waypoints]),
        sampler = sampler,
        duration = duration,
        ease = options.ease,
        tweenTarget = subject,
    })
end

function LuaTween.MoveTo(target, endValue, duration, ease)
    if type(target) ~= "table" or type(target.position) ~= "table" then
        error("LuaTween.MoveTo expects target.position table", 2)
    end
    return LuaTween.To(target.position, endValue, duration, ease):SetTarget(target)
end

function LuaTween.ScaleTo(target, endValue, duration, ease)
    if type(target) ~= "table" or type(target.scale) ~= "table" then
        error("LuaTween.ScaleTo expects target.scale table", 2)
    end
    return LuaTween.To(target.scale, endValue, duration, ease):SetTarget(target)
end

function LuaTween.FadeTo(target, endValue, duration, ease)
    if type(target) ~= "table" then error("LuaTween.FadeTo expects a table target", 2) end
    local field = target.alpha ~= nil and "alpha" or "opacity"
    if type(target[field]) ~= "number" then
        error("LuaTween.FadeTo expects target.alpha or target.opacity number", 2)
    end
    return LuaTween.Value(
        function() return target[field] end,
        function(value) target[field] = value end,
        endValue,
        duration,
        ease
    )
        :SetTarget(target)
end

function LuaTween.Update(dt)
    for i = #active, 1, -1 do
        local item = active[i]
        local done = item:Update(dt)
        if done or item.killed then
            unregister(item)
            item._registered = false
        end
    end
end

function LuaTween.Kill(idOrTarget, complete)
    return applyToActive(idOrTarget, function(item) item:Kill(complete) end)
end

function LuaTween.Pause(idOrTarget)
    return applyToActive(idOrTarget, function(item) item:Pause() end)
end

function LuaTween.Resume(idOrTarget)
    return applyToActive(idOrTarget, function(item) item:Resume() end)
end

function LuaTween.Play(idOrTarget)
    return LuaTween.Resume(idOrTarget)
end

function LuaTween.Restart(idOrTarget)
    return applyToActive(idOrTarget, function(item) item:Restart() end)
end

function LuaTween.KillAll(complete)
    return LuaTween.Kill(nil, complete)
end

function LuaTween.PauseAll()
    return LuaTween.Pause(nil)
end

function LuaTween.ResumeAll()
    return LuaTween.Resume(nil)
end

function LuaTween.Clear()
    for i = #active, 1, -1 do
        active[i]._registered = false
        active[i] = nil
    end
end

function LuaTween.TotalActive()
    return #active
end

return LuaTween
