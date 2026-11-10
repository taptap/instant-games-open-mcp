local ImageRecipes = require('ImageMotionRecipes')
local UI = require("urhox-libs/UI")
local Scene = require("NativeScene")
local Controls = require("NativeControls")
local Attack = require("RedesignAttack")
local LuaTween = require("LuaTween")
local Demo = {}
local scene, control, attack, inputs, preview, feedback
local phase, savedPhase, requested, selected, auto = "stopped", "entry", nil, 1, false
local avatarIds = {"E001", "E003", "E005", "E007"}
local characters = {
    {name = "VELA", image = "ui/s02-redesign-v1/images/characters/vela.png", stats = {29, 128, 178, 188, 138}},
    {name = "RIN", image = "ui/s02-redesign-v1/images/characters/rin.png", stats = {27, 146, 162, 174, 192}},
    {name = "MICA", image = "ui/s02-redesign-v1/images/characters/mica.png", stats = {26, 154, 148, 198, 170}},
    {name = "SABLE", image = "ui/s02-redesign-v1/images/characters/sable.png", stats = {30, 172, 194, 156, 180}},
}
local controls = {
    {node = "E001", action = "select1", label = "VELA",
        outline = {.0167, .0272, .9766, .2529, .9799, .9767, .0201, .7665}},
    {node = "E003", action = "select2", label = "RIN",
        outline = {.0196, .0087, .9765, .2121, .9804, .9827, .0196, .7879}},
    {node = "E005", action = "select3", label = "MICA",
        outline = {.0159, .0128, .9841, .2255, .9683, .9872, .0119, .7787}},
    {node = "E007", action = "select4", label = "SABLE",
        outline = {.0159, .0128, .9841, .2255, .9683, .9872, .0119, .7787}},
    {node = "E027", action = "skill1", label = "脉冲攻击", shape = "circle"},
    {node = "E028", action = "skill2", label = "旋刃预览", shape = "circle"},
    {node = "E029", action = "skill3", label = "护盾预览", shape = "circle"},
    {node = "E025", action = "next", label = "进入剧情"},
    {node = "E010", rect = {0, 0, 155, 48}, action = "auto", label = "AUTO"},
    {node = "E012", rect = {0, 0, 155, 48}, action = "next", label = "SKIP"},
}
local statIds = {"T007", "T009", "T011", "T013", "T015"}
local fillIds = {"E016", "E018", "E020", "E022", "E024"}
local fillWidths = {126, 108, 114, 142, 130}
local function applyAttack(t)
    attack.time = math.max(0, t - .6)
    attack.active = selected == 1 and t > .6 and t < 1.4
    scene:Find("E009"):SetStyle({visible = selected == 1 and not attack.active})
end
function Demo.Init(host)
    scene = Scene.Load(host, "ui/ui015-e69e9731/v-5f2bcbecf50b/ui/s02_redesign.ui.json")
    local data = ImageRecipes.Scene("S02")
    for i, id in ipairs(avatarIds) do
        scene:Bind(id)
    end
    for i, id in ipairs({"T004", "E014", "E015", "E017", "E019", "E021", "E023", "E027", "E028", "E029"}) do
        scene:Bind(id, {clip = true})
    end
    scene:Bind("E009")
    attack = Attack.New(scene.stage)
    preview = UI.Panel {position = "absolute", left = 590, top = 128, width = 556, height = 1024,
        visible = false, backgroundFit = "contain", pointerEvents = "none", zIndex = 10}
    scene.stage:AddChild(preview)
    inputs = Controls.New(scene.stage, controls, Demo.Activate, function() return phase == "idle" end)
    selected, phase, requested, auto = 1, "entry", nil, false
    control = scene:Play(data, applyAttack)
end
function Demo.Select(index)
    if phase ~= "idle" then return false end
    if feedback then feedback:Kill(false); feedback = nil end
    selected = (index - 1) % #characters + 1
    local character = characters[selected]
    inputs:Select("select" .. selected)
    for i, id in ipairs(avatarIds) do
        scene:Find(id):SetStyle({backgroundImageOpacity = i == 1 and selected ~= 1 and .4 or 1})
    end
    scene:Find("T005"):SetText(character.name)
    for i, id in ipairs(statIds) do
        scene:Find(id):SetText(tostring(character.stats[i]))
        scene:Find(fillIds[i]):SetStyle({width = fillWidths[i] * character.stats[i] / characters[1].stats[i]})
    end
    preview:SetStyle({visible = selected ~= 1, backgroundImage = character.image, scale = 1})
    scene:Find("E009"):SetStyle({visible = selected == 1})
    return true
end
function Demo.Confirm()
    if phase ~= "idle" then return false end
    if selected == 1 then phase = "attack"; control:Seek(.6):Play(); return true end
    if feedback then feedback:Kill(false) end
    local pose = {scale = .96}
    feedback = LuaTween.To(pose, {scale = 1}, .28, "outBack"):OnUpdate(function()
        preview:SetStyle({scale = pose.scale, transformOrigin = "top-center"})
    end)
    inputs:Notify(characters[selected].name .. " · 技能已选中")
    return true
end
function Demo.Activate(action)
    if phase ~= "idle" then return false end
    local index = tonumber(action:match("^select(%d)$"))
    if index then return Demo.Select(index) end
    if action == "next" then requested = 3
    elseif action == "auto" then
        auto = not auto; scene:Find("E010"):SetStyle({opacity = auto and 1 or .55})
        inputs:Notify(auto and "AUTO 已开启" or "AUTO 已关闭")
    else return Demo.Confirm() end
    return true
end
function Demo.Update(dt)
    scene:Fit(); inputs:Update(dt)
    if phase == "entry" and control.clock.time >= .6 or phase == "attack" and control.clock.time >= 1.4 then
        control:Seek(.6):Pause(); phase = "idle"
        Demo.Select(selected)
    end
end
function Demo.TakeRequest() local value = requested; requested = nil; return value end
function Demo.Seek(t)
    control:Seek(t):Pause(); savedPhase = t > .6 and "attack" or "entry"; phase = "paused"
end
function Demo.Replay()
    phase = "idle"; Demo.Select(1); control:Restart(); phase = "entry"
end
function Demo.Reset() control:Seek(.6):Pause(); phase = "idle"; Demo.Select(1) end
function Demo.TogglePause()
    if phase == "paused" then phase = savedPhase; control:Play()
    else savedPhase = phase; phase = "paused"; control:Pause() end
end
function Demo.GetState() return {phase = phase, selected = selected, auto = auto, seconds = control and control.clock.time or 0} end
function Demo.Reference()
    local result = Scene.Reference(control)
    result.controls, result.attack = controls, Attack.Definition()
    result.attack.at = .6
    result.characters = {items = characters, actor = "E009", name = "T005", stats = statIds,
        fills = fillIds, fillWidths = fillWidths, previewRect = {590, 128, 556, 1024},
        avatars = avatarIds, inactiveFrameOpacity = {.4, 1, 1, 1}}
    result.ui = "assets/ui/ui015-e69e9731/v-5f2bcbecf50b/ui/s02_redesign.ui.json"
    return result
end
function Demo.Shutdown()
    if feedback then feedback:Kill(false); feedback = nil end
    if attack then attack.sampler:Destroy() end
    if scene then scene:Destroy(); scene = nil end
    control, attack, requested, inputs, preview = nil, nil, nil, nil, nil; phase = "stopped"
end
return Demo
