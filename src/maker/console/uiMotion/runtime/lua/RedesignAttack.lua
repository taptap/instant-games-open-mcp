local UI = require("urhox-libs/UI")
local Images = require("urhox-libs/UI/Core/ImageCache")
local Motion = require("Motion")
local Scene = require("NativeScene")
local Attack = UI.Widget:Extend("CharacterAttackPreview")

function Attack.Definition()
    local data = require("ImageMotionRecipes").Scene("Attack")
    local pink, white = {255, 48, 146, 245}, {255, 250, 255, 255}
    return {recipe = data, frameSize = {1280, 720}, actorRect = {345, 65, 430, 651},
        poses = {
            {at = 0, image = "ui/s02-redesign-v1/motion/poses/pose1.png", rect = {406.6048, 80.0000, 271.7904, 640.0000}},
            {at = 3 / 30, image = "ui/s02-redesign-v1/motion/poses/pose2.png", rect = {275.9498, 246.9869, 388.4716, 473.0131}},
            {at = 6 / 30, image = "ui/s02-redesign-v1/motion/poses/pose3.png", rect = {240.3166, 191.7904, 542.8821, 521.9214}},
            {at = 8 / 30, image = "ui/s02-redesign-v1/motion/poses/pose4.png", rect = {331.1463, 124.0175, 468.8210, 597.3799}},
            {at = 11 / 30, image = "ui/s02-redesign-v1/motion/poses/pose5.png", rect = {323.4607, 117.0306, 398.9520, 598.0786}},
            {at = 17 / 30, image = "ui/s02-redesign-v1/motion/poses/pose6.png", rect = {416.3865, 78.6026, 273.8865, 638.6026}},
        },
        layers = {
            {id = "crescent", pivot = {1005, 360}, shapes = {
                {color = pink, path = {{"M", 1005, 74}, {"C", 1175, 203, 1224, 486, 1130, 675},
                    {"L", 1080, 750}, {"L", 987, 750}, {"C", 1110, 499, 1090, 252, 1005, 74}}},
                {color = {255, 112, 192, 140}, path = {{"M", 1013, 109}, {"C", 1136, 294, 1154, 505, 1064, 700}}, stroke = 5},
                {color = pink, path = {{"M", 80, 14}, {"L", 426, 202}, {"L", 110, 42}}},
                {color = pink, path = {{"M", 1150, 224}, {"L", 1201, 276}, {"L", 1165, 270}}},
            }},
            {id = "beam", pivot = {800, 416}, shapes = {
                {color = {255, 37, 140, 70}, path = {{"M", 410, 420}, {"L", 1340, 400}, {"L", 1340, 450}}},
                {color = white, path = {{"M", 418, 426}, {"L", 1340, 412}, {"L", 1340, 435}}},
                {color = white, path = {{"M", 214, 259}, {"C", 385, 310, 485, 331, 601, 427}}, stroke = 5},
            }},
            {id = "spark", pivot = {1016, 350}, shapes = {
                {color = {255, 33, 146, 35}, path = {{"M", 1016, 219}, {"L", 1086, 350}, {"L", 1016, 481}, {"L", 946, 350}}},
                {color = {255, 103, 193, 100}, path = {{"M", 1016, 260}, {"L", 1049, 350}, {"L", 1016, 440}, {"L", 983, 350}}},
                {color = white, path = {{"M", 1016, 232}, {"L", 1024, 337}, {"L", 1170, 350},
                    {"L", 1026, 359}, {"L", 1016, 410}, {"L", 1007, 360}, {"L", 947, 350}, {"L", 1007, 339}}},
                {color = white, path = {{"M", 1012, 349}, {"L", 1112, 167}, {"L", 1030, 354}}},
            }},
            {id = "slash", pivot = {640, 360}, rotation = 31, shapes = {
                {color = {255, 40, 145, 35}, path = {{"M", -260, 320}, {"L", 1540, 348}, {"L", 1540, 400}, {"L", -260, 365}}},
                {color = pink, path = {{"M", -260, 337}, {"L", 1540, 352}, {"L", 1540, 386}, {"L", -260, 364}}},
                {color = white, path = {{"M", -260, 347}, {"L", 1540, 358}, {"L", 1540, 376}, {"L", -260, 358}}},
            }},
        }}
end

function Attack:Render(nvg)
    if not self.active then return end
    local l, data = self:GetAbsoluteLayout(), self.definition
    local t = self.time or 0
    local state = self.sampler:Sample(t)
    nvgSave(nvg); nvgTranslate(nvg, l.x, l.y); nvgScale(nvg, l.w / 1280, l.h / 720)
    local pose = data.poses[1]
    for _, candidate in ipairs(data.poses) do if t >= candidate.at then pose = candidate end end
    local image = Images.Get(pose.image)
    local rect = pose.rect or data.actorRect
    if image > 0 then
        if state.echo.opacity > 0 then
            nvgBeginPath(nvg); nvgRect(nvg, rect[1] - 18, rect[2], rect[3], rect[4])
            nvgFillPaint(nvg, nvgImagePattern(nvg, rect[1] - 18, rect[2], rect[3], rect[4], 0, image, state.echo.opacity)); nvgFill(nvg)
        end
        nvgBeginPath(nvg); nvgRect(nvg, rect[1], rect[2], rect[3], rect[4])
        nvgFillPaint(nvg, nvgImagePattern(nvg, rect[1], rect[2], rect[3], rect[4], 0, image, 1)); nvgFill(nvg)
    end
    for _, layer in ipairs(data.layers) do
        local p = state[layer.id]
        nvgSave(nvg); nvgTranslate(nvg, layer.pivot[1], layer.pivot[2])
        nvgRotate(nvg, math.rad(layer.rotation or 0)); nvgScale(nvg, p.scale * p.scaleX, p.scale * p.scaleY)
        nvgTranslate(nvg, -layer.pivot[1], -layer.pivot[2])
        for _, shape in ipairs(layer.shapes) do
            nvgBeginPath(nvg)
            for _, cmd in ipairs(shape.path) do
                if cmd[1] == "M" then nvgMoveTo(nvg, cmd[2], cmd[3])
                elseif cmd[1] == "L" then nvgLineTo(nvg, cmd[2], cmd[3])
                elseif cmd[1] == "C" then nvgBezierTo(nvg, cmd[2], cmd[3], cmd[4], cmd[5], cmd[6], cmd[7]) end
            end
            local c = shape.color
            local color = nvgRGBA(c[1], c[2], c[3], math.floor(c[4] * p.opacity))
            if shape.stroke then nvgStrokeColor(nvg, color); nvgStrokeWidth(nvg, shape.stroke); nvgStroke(nvg)
            else nvgClosePath(nvg); nvgFillColor(nvg, color); nvgFill(nvg) end
        end
        nvgRestore(nvg)
    end
    nvgRestore(nvg)
end

function Attack.New(stage)
    local widget = Attack {position = "absolute", left = 0, top = 0,
        width = stage:GetProp("width"), height = stage:GetProp("height"), pointerEvents = "none", zIndex = 80}
    widget.definition = Attack.Definition()
    widget.sampler = Motion.New(widget.definition.recipe)
    stage:AddChild(widget)
    return widget
end
return Attack
