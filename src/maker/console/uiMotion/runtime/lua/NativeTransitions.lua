local UI = require("urhox-libs/UI")
local Motion = require("Motion")
local ClipPlayer = require("ClipPlayer")
local Recipes = require("UiMotionRecipes")
local LuaTween = require("LuaTween")
local Images = require("urhox-libs/UI/Core/ImageCache")
local Transitions = {}
local Layer = UI.Widget:Extend("NativeTransitionLayer")
local function polygon(nvg, points, color)
    nvgBeginPath(nvg)
    nvgMoveTo(nvg, points[1], points[2])
    for i = 3, #points, 2 do nvgLineTo(nvg, points[i], points[i + 1]) end
    nvgClosePath(nvg); nvgFillColor(nvg, color); nvgFill(nvg)
end

function Layer:Render(nvg)
    local p = self.progress or 0
    if p <= 0 or p >= 1 then return end
    local poses = self.player:Sample(p)
    local l = self:GetAbsoluteLayout()
    nvgSave(nvg); nvgTranslate(nvg, l.x, l.y); nvgScale(nvg, l.w / 2048, l.h / 1152)
    if self.transitionId == "T01" then
        local x = poses.mask.x
        polygon(nvg, {x, 0, x + 3000, 0, x + 2300, 1152, x - 700, 1152}, nvgRGBA(7, 5, 14, 255))
        polygon(nvg, {x, 0, x + 26, 0, x - 674, 1152, x - 700, 1152}, nvgRGBA(251, 38, 128, 255))
    elseif self.transitionId == "T02" then
        local breadth = poses.mask.breadth
        nvgTranslate(nvg, 1024, 576); nvgRotate(nvg, .57)
        polygon(nvg, {-2400, -breadth / 2 - 16, 2400, -breadth / 2 - 16,
            2400, breadth / 2 + 16, -2400, breadth / 2 + 16}, nvgRGBA(255, 29, 129, 255))
        polygon(nvg, {-2400, -breadth / 2, 2400, -breadth / 2,
            2400, breadth / 2, -2400, breadth / 2}, nvgRGBA(255, 252, 253, 255))
    else
        local image = Images.Get(self.cardPath)
        if p >= .50 and p <= .60 then
            polygon(nvg, {0, 0, 2048, 0, 2048, 1152, 0, 1152}, nvgRGBA(12, 7, 9, 255))
        end
        for i = 1, 10 do
            local pose = poses["card"..i]
            local w, h = 180 * pose.zoom, 260 * pose.zoom
            nvgSave(nvg)
            nvgTranslate(nvg, pose.x, pose.y)
            nvgRotate(nvg, pose.angle)
            nvgBeginPath(nvg); nvgRect(nvg, -w / 2, -h / 2, w, h)
            if image > 0 then
                nvgFillPaint(nvg, nvgImagePattern(nvg, -w / 2, -h / 2, w, h, 0, image, 1))
                nvgFill(nvg)
            end
            nvgRestore(nvg)
        end
        if image > 0 and p >= .30 and p <= .82 then
            local w, h = poses.cover.width, poses.cover.height
            nvgSave(nvg); nvgTranslate(nvg, 1024, 576); nvgRotate(nvg, -.12)
            nvgBeginPath(nvg); nvgRect(nvg, -w / 2, -h / 2, w, h)
            nvgFillPaint(nvg, nvgImagePattern(nvg, -w / 2, -h / 2, w, h, 0, image, 1))
            nvgFill(nvg); nvgRestore(nvg)
        end
    end
    nvgRestore(nvg)
end

function Transitions.New(host, id, cardPath)
    assert(id == "T01" or id == "T02" or id == "T03", "Unknown transition")
    if id == "T03" then assert(cardPath, "T03 requires an independent card PNG") end
    local layer = Layer {position = "absolute", left = 0, top = 0, width = 1, height = 1,
        pointerEvents = "box-only", zIndex = 1000}
    layer.transitionId, layer.cardPath = id, cardPath
    layer.player = ClipPlayer.New(Recipes.Transition(id))
    host:AddChild(layer)
    local duration = id == "T03" and 32 / 30 or id == "T02" and 10 / 30 or 12 / 30
    local recipe = {version = 1, duration = duration, nodes = {{id = "mask", transform = {reveal = 0}}},
        tracks = {{node = "mask", prop = "reveal", at = 0, duration = duration, from = 0, to = 1, ease = "linear"}}, interactions = {}}
    local control = Motion.Play(recipe, LuaTween, function(state) layer.progress = state.mask.reveal end)
    local result = {controller = control, duration = duration, switched = false, paused = false}
    function result:Update()
        local x, y, w, h = UI.GetSafeContentArea()
        layer:SetStyle({left = x, top = y, width = w, height = h})
        return control.clock.time / duration
    end
    function result:Seek(t) control:Seek(t):Pause(); self.paused = true end
    function result:TogglePause()
        if self.paused then control:Play() else control:Pause() end
        self.paused = not self.paused
    end
    function result:Destroy()
        control:Destroy()
        layer.player:Destroy()
        if layer.parent then layer.parent:RemoveChild(layer) end
        layer:Destroy()
    end
    return result
end
return Transitions
