local UI = require("urhox-libs/UI")
local Controls = {}
local Feedback = UI.Panel:Extend("NativeControlFeedback")

function Feedback:HitTest(x, y)
    if not self.outline then return UI.Widget.HitTest(self, x, y) end
    local l = self:GetAbsoluteLayoutForHitTest()
    if l.w <= 0 or l.h <= 0 then return false end
    x, y = (x - l.x) / l.w, (y - l.y) / l.h
    local sign = 0
    for i = 1, #self.outline, 2 do
        local j = i + 2 > #self.outline and 1 or i + 2
        local cross = (self.outline[j] - self.outline[i]) * (y - self.outline[i + 1])
            - (self.outline[j + 1] - self.outline[i + 1]) * (x - self.outline[i])
        if math.abs(cross) > .000001 then
            local side = cross > 0 and 1 or -1
            if sign ~= 0 and sign ~= side then return false end
            sign = side
        end
    end
    return true
end

function Feedback:Render(nvg)
    if not self.outline and self:GetProp("shape") ~= "circle" then
        return UI.Panel.Render(self, nvg)
    end
    local l = self:GetAbsoluteLayout()
    nvgSave(nvg)
    nvgBeginPath(nvg)
    if self.outline then
        nvgMoveTo(nvg, l.x + self.outline[1] * l.w, l.y + self.outline[2] * l.h)
        for i = 3, #self.outline, 2 do
            nvgLineTo(nvg, l.x + self.outline[i] * l.w, l.y + self.outline[i + 1] * l.h)
        end
        nvgClosePath(nvg)
    else
        nvgCircle(nvg, l.x + l.w / 2, l.y + l.h / 2, math.min(l.w, l.h) / 2 - 4)
    end
    local fill = self:GetProp("backgroundColor")
    nvgFillColor(nvg, nvgRGBA(fill[1], fill[2], fill[3], fill[4])); nvgFill(nvg)
    if self:GetProp("borderWidth") > 0 then
        local c = self:GetProp("borderColor")
        nvgStrokeWidth(nvg, self.isSelected and 13 or 7)
        nvgStrokeColor(nvg, nvgRGBA(c[1], c[2], c[3], self.isSelected and 75 or 35)); nvgStroke(nvg)
        nvgStrokeWidth(nvg, self.isSelected and 5 or 3)
        nvgStrokeColor(nvg, nvgRGBA(c[1], c[2], c[3], c[4])); nvgStroke(nvg)
        if self.isSelected then
            nvgStrokeWidth(nvg, 2)
            nvgStrokeColor(nvg, nvgRGBA(255, 243, 253, 255)); nvgStroke(nvg)
        end
    end
    nvgRestore(nvg)
end

function Controls.New(stage, specs, activate, ready, accent, focus)
    local self = {items = {}, specs = specs, selected = nil, toastTime = 0}
    accent = accent or {255, 49, 140, 230}
    for _, spec in ipairs(specs) do
        local rect = spec.rect
        local parent = spec.node and assert(stage:FindById(spec.node)) or stage
        local width, height = parent:GetProp("width"), parent:GetProp("height")
        -- Expanded targets must be siblings: absolute parents reject hits outside their own box.
        local anchor = rect and (parent.parent or stage) or parent
        if spec.outline or spec.shape then
            parent:SetStyle({pointerEvents = "box-none"})
            for _, child in ipairs(parent:GetChildren()) do child:SetStyle({pointerEvents = "none"}) end
        end
        local hit = Feedback {id = "native-hit-" .. (spec.node or spec.action),
            position = "absolute", shape = spec.shape,
            left = rect and (parent:GetProp("left") or 0) + rect[1] or 0,
            top = rect and (parent:GetProp("top") or 0) + rect[2] or 0,
            width = rect and rect[3] or width, height = rect and rect[4] or height,
            backgroundColor = {0, 0, 0, 0}, borderWidth = 0, borderRadius = 0,
            pointerEvents = "box-only", cursor = "pointer", zIndex = spec.zIndex or 95}
        hit.outline = spec.outline
        anchor:AddChild(hit)
        if rect and parent.motionWrapper == anchor then
            -- Keep expanded targets inside the same animation transform, including hit testing.
            function anchor:HitTest(x, y)
                return UI.Widget.HitTest(self, x, y) or hit:HitTest(x, y)
            end
        end
        local item = {hit = hit, spec = spec, hover = false, pressed = false}
        self.items[#self.items + 1] = item
        local function update()
            local enabled = ready()
            local selected = self.selected == spec.action
            hit.isSelected = selected
            hit:SetStyle({backgroundColor = item.pressed and enabled and {255, 255, 255, 42}
                or item.hover and enabled and {255, 255, 255, 18} or {0, 0, 0, 0},
                borderWidth = (selected or item.hover and enabled) and 2 or 0, borderColor = accent})
        end
        item.update = update
        hit:OnEvent("pointerenter", function()
            item.hover = true
            if focus and ready() then focus(spec.action) end
            update()
        end)
        hit:OnEvent("pointerleave", function() item.hover = false; item.pressed = false; update() end)
        hit:OnEvent("pointerdown", function() item.pressed = true; update() end)
        hit:OnEvent("pointerup", function() item.pressed = false; update() end)
        hit:OnEvent("pointercancel", function() item.pressed = false; update() end)
        hit:OnEvent("click", function(_, event)
            if event then event:StopPropagation() end
            if ready() then activate(spec.action) end
        end)
    end
    self.toast = UI.Label {position = "absolute", left = stage:GetProp("width") / 2 - 340,
        top = 42, width = 680, height = 62, fontSize = 24, textAlign = "center",
        fontColor = {255, 248, 236, 255}, backgroundColor = {10, 8, 16, 220},
        visible = false, pointerEvents = "none", zIndex = 150}
    stage:AddChild(self.toast)
    function self:Select(action)
        self.selected = action
        for _, item in ipairs(self.items) do item.update() end
    end
    function self:Notify(text)
        self.toast:SetText(text)
        self.toast:SetStyle({visible = true, opacity = 1})
        self.toastTime = 1.5
    end
    function self:Update(dt)
        local enabled = ready()
        if self.lastReady ~= enabled then
            self.lastReady = enabled
            for _, item in ipairs(self.items) do
                if not enabled then item.hover, item.pressed = false, false end
                item.update()
            end
        end
        if self.toastTime > 0 then
            self.toastTime = math.max(0, self.toastTime - dt)
            self.toast:SetStyle({visible = self.toastTime > 0, opacity = math.min(1, self.toastTime / .2)})
        end
    end
    return self
end
return Controls
