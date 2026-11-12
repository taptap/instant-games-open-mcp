local ImageRecipes = require('ImageMotionRecipes')
local UI = require("urhox-libs/UI")
local Scene = require("NativeScene")
local Controls = require("NativeControls")
local Demo = {}
---@type NativeSceneInstance
local scene
---@type MotionController
local control
local inputs, requested, selectionSpark
local phase, savedPhase, selected = "stopped", "entry", 2
local entryEnd = 1.5
local chapterNames = {"机关试演", "月灯巡游", "星仪档案"}
local chapterTitles = {"第二幕·机关试演", "第三幕·月灯巡游", "第四幕·星仪档案"}
local chapterIds = {"E011", "E013", "E016"}
local controls = {
    {node = "E001", action = "back", label = "返回绒幕星仪剧场"},
    {node = "E034", action = "story", label = "进入故事"},
    {node = "E003", action = "puppet", label = "重播木偶入场"},
    {node = "E011", action = "chapter1", label = "机关试演"},
    {node = "E013", action = "chapter2", label = "月灯巡游"},
    {node = "E016", action = "chapter3", label = "星仪档案"},
    {node = "E007", rect = {-8, -8, 58, 58}, action = "currency1", label = "补充金币"},
    {node = "E010", rect = {-8, -8, 58, 58}, action = "currency2", label = "补充星晶"},
}
local entryLayers = {}
local function applyChapterSelection()
    for i, id in ipairs(chapterIds) do
        scene:Find(id):SetStyle({backgroundImageOpacity = i == selected and 1 or .55})
    end
    local target = scene:Find(chapterIds[selected])
    if selectionSpark.parent ~= target then
        selectionSpark.parent:RemoveChild(selectionSpark)
        target:AddChild(selectionSpark)
    end
    selectionSpark:SetStyle({left = -37, top = (target:GetProp("height") - 46) / 2,
        pointerEvents = "none"})
    inputs:Select("chapter" .. selected)
end
for i, side in ipairs({"left", "right"}) do
    entryLayers[i] = {type = "Panel", id = "openingCurtain" .. i, position = "absolute",
        left = (i - 1) * 1024, top = 0, width = 1024, height = 944, zIndex = 80,
        backgroundImage = "ui/s05-redesign-v1/images/effects/opening-curtain-" .. side .. ".png",
        backgroundFit = "fill", pointerEvents = "none"}
end

function Demo.Init(host)
    scene = Scene.Load(host, "ui/ui015-19bcb09d/v-5b8d00911028/ui/s05_redesign.ui.json")
    local data = ImageRecipes.Scene("S05")
    for i, layer in ipairs(entryLayers) do
        scene.stage:AddChild(UI.Panel(layer))
        scene:Bind(layer.id, {stretch = true})
        -- Width changes gather each curtain toward its own outer edge.
    end
    scene:Bind("E018", {stretch = true})
    scene:Bind("paperContent", {clip = true})
    scene:Bind("puppetRig").widget:SetStyle({transformOrigin = "top"})
    for i, id in ipairs({"E011", "E013", "E016"}) do
        scene:Bind(id)
    end
    control = scene:Play(data)
    inputs = Controls.New(scene.stage, controls, Demo.Activate, function() return phase == "idle" end, {220, 186, 113, 230})
    phase, requested, selected = "entry", nil, 2
    selectionSpark = scene:Find("E015")
    applyChapterSelection()
    print("[S05 redesign] new layered stage, puppet rig and chapter controls ready")
end
function Demo.Update(dt)
    scene:Fit(); inputs:Update(dt)
    if phase == "entry" and control.clock.time >= entryEnd then
        control:Seek(entryEnd):Pause(); phase = "idle"
    end
end
function Demo.Confirm() return Demo.Activate("story") end
function Demo.Activate(action)
    if phase ~= "idle" then return false end
    if action == "back" then requested = 4; return true end
    if action == "puppet" then Demo.Replay(); return true end
    local chapter = tonumber(action:match("^chapter(%d)$"))
    if chapter then
        selected = chapter
        scene:Find("T003"):SetText(chapterTitles[selected])
        applyChapterSelection()
        inputs:Notify(chapterNames[selected] .. " · 已选中")
    elseif action == "story" then
        inputs:Notify("进入故事 · " .. chapterNames[selected] .. "，剧情由接入项目提供")
    else inputs:Notify(action == "currency1" and "金币：100" or "星晶：15") end
    return true
end
function Demo.Select(index) return Demo.Activate("chapter" .. ((index - 1) % 3 + 1)) end
function Demo.TakeRequest() local value = requested; requested = nil; return value end
function Demo.Seek(t)
    control:Seek(t):Pause(); savedPhase = t < entryEnd and "entry" or "idle"; phase = "paused"
end
function Demo.Replay() control:Restart(); phase = "entry" end
function Demo.Reset() control:Seek(entryEnd):Pause(); phase = "idle" end
function Demo.TogglePause()
    if phase == "paused" then phase = savedPhase; if phase == "entry" then control:Play() end
    else savedPhase = phase; phase = "paused"; control:Pause() end
end
function Demo.GetState() return {phase = phase, selected = selected, seconds = control and control.clock.time or 0} end
function Demo.Reference()
    local result = Scene.Reference(control)
    result.controls, result.layers = controls, entryLayers
    result.ui = "assets/ui/ui015-19bcb09d/v-5b8d00911028/ui/s05_redesign.ui.json"
    result.rendering = {puppetRig = {origin = "top"}, E018 = {stretch = true},
        openingCurtain1 = {stretch = true}, openingCurtain2 = {stretch = true}}
    result.chapters = {names = chapterNames, titles = chapterTitles, title = "T003",
        ids = chapterIds, cursor = "E015", cursorRect = {-37, 0, 48, 46}, inactiveImageOpacity = .55}
    return result
end
function Demo.Shutdown()
    if scene then scene:Destroy(); scene = nil end
    control, inputs, requested, selectionSpark, phase = nil, nil, nil, nil, "stopped"
end
return Demo
