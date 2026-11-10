local ImageRecipes = require('ImageMotionRecipes')
local Scene = require("NativeScene")
local LuaTween = require("LuaTween")
local Controls = require("NativeControls")
local ClipPlayer = require('ClipPlayer')
local Recipes = require('UiMotionRecipes')
local Demo = {}
---@type NativeSceneInstance
local scene
---@type MotionController
local control
local clap, clapPlayer, clapFinished, inputs
local phase, savedPhase, requested = "stopped", "entry", nil
local selected = 1
local entryEnd = 1.3
local controls = {
    {node = "E001", rect = {-14, -10, 77, 72}, action = "back", label = "返回"},
    {node = "menu1", action = "episode1", label = "演出序幕"},
    {node = "menu2", action = "episode2", label = "剧目档案"},
    {node = "menu3", action = "episode3", label = "星仪收藏"},
    {node = "E010", rect = {-10, -10, 96, 118}, action = "review", label = "回顾"},
    {node = "clapper", action = "clap", label = "开启演出"},
    {node = "E012", action = "rabbit", label = "礼帽兔子"},
}

local function clearClap()
    if clap then clap:Kill(false); clap = nil end
    if clapPlayer then clapPlayer:Destroy(); clapPlayer = nil end
    clapFinished = false
end

function Demo.Init(host)
    scene = Scene.Load(host, "ui/ui015-a64b2869/v-f8b6ba273b67/ui/s04_redesign.ui.json")
    local data = ImageRecipes.Scene("S04")
    scene:Bind("background")
    for i, id in ipairs({"E002", "menu1", "menu2", "menu3", "E010", "T003", "clapper"}) do
        scene:Bind(id)
    end
    scene:Bind("E011").widget:SetStyle({transformOrigin = "bottom"})
    for _, id in ipairs({"E013", "hatFront"}) do
        scene:Bind(id)
    end
    scene:Bind("E012")
    control = scene:Play(data)
    -- This hinge is independent of the entry wrapper and pivots at the new artwork's rivet.
    scene:Bind("clapperTop").widget:SetStyle({transformOrigin = {282 / 353, 73 / 309}})
    inputs = Controls.New(scene.stage, controls, Demo.Activate, function() return phase == "idle" end, {220, 186, 113, 230})
    phase, requested, selected = "entry", nil, 1
    print("[S04 redesign] new magician, layered hat and rabbit, menus and clapper ready")
end
function Demo.Update(dt)
    if clapFinished then
        clearClap()
        phase = "idle"
        scene.bridges.clapperTop.widget:SetStyle({rotate = 0})
        requested = 5
    end
    scene:Fit(); inputs:Update(dt)
    if phase == "entry" and control.clock.time >= entryEnd then phase = "idle" end
end
function Demo.Confirm()
    if phase ~= "idle" then return false end
    phase = "clap"
    local clock = {time = 0}
    local player = ClipPlayer.New(Recipes.Clap())
    clapPlayer = player
    clap = LuaTween.To(clock, {time = .46}, .46, "linear"):OnUpdate(function()
        scene.bridges.clapperTop.widget:SetStyle({rotate = player:Sample(clock.time).clapper.angle})
    end):OnComplete(function()
        clapFinished = true
    end)
    return true
end
function Demo.Activate(action)
    if phase ~= "idle" then return false end
    inputs:Select(action)
    if action == "clap" then return Demo.Confirm() end
    if action:match("^episode") then selected = tonumber(action:match("(%d)$")) or 1; requested = 5
    elseif action == "back" then Demo.Reset(); inputs:Notify("绒幕星仪剧场 · 活动主页")
    elseif action == "review" then inputs:Notify("回顾已选中")
    elseif action == "rabbit" then Demo.Replay() end
    return true
end
function Demo.Seek(t)
    clearClap()
    scene.bridges.clapperTop.widget:SetStyle({rotate = 0})
    control:Seek(t):Pause(); phase = "paused"; savedPhase = t < entryEnd and "entry" or "idle"
end
function Demo.Replay() Demo.Seek(0); control:Play(); phase = "entry" end
function Demo.Reset() Demo.Seek(entryEnd); phase = "idle" end
function Demo.TogglePause()
    if phase == "paused" then
        phase = savedPhase; control:Play(); if clap then clap:Resume() end
    else
        savedPhase, phase = phase, "paused"; control:Pause(); if clap then clap:Pause() end
    end
end
function Demo.Select(index)
    if phase ~= "idle" then return false end
    selected = (index - 1) % 3 + 1; inputs:Select("episode" .. selected); return true
end
function Demo.TakeRequest() local value = requested; requested = nil; return value end
function Demo.GetState() return {phase = phase, selected = selected, seconds = control and control.clock.time or 0} end
function Demo.Reference()
    local result = Scene.Reference(control)
    result.controls = controls
    result.ui = "assets/ui/ui015-a64b2869/v-f8b6ba273b67/ui/s04_redesign.ui.json"
    result.rendering = {E011 = {origin = "bottom"},
        clapperTop = {origin = {282 / 353, 73 / 309}}}
    result.clap = {node = "clapperTop", duration = .46, peak = .52, angle = -18}
    return result
end
function Demo.Shutdown()
    clearClap()
    if scene then scene:Destroy(); scene = nil end
    control, inputs, requested, phase = nil, nil, nil, "stopped"
end
return Demo
