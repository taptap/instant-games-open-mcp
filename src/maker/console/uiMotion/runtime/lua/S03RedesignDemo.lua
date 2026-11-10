local ImageRecipes = require('ImageMotionRecipes')
local Scene = require("NativeScene")
local Motion = require("Motion")
local LuaTween = require("LuaTween")
local Controls = require("NativeControls")
local ClipPlayer = require('ClipPlayer')
local Recipes = require('UiMotionRecipes')
local typingPlayer
local Demo = {}
---@type NativeSceneInstance
local scene
---@type MotionController
local control
local pulse, exiting
local phase, savedPhase, line, pulseClock = "stopped", "typing", "", {time = 0}
local inputs, requested, auto, autoWait
local controls = {
    {node = "E007", action = "dialogue", label = "继续对话", zIndex = -1},
    {node = "E010", rect = {-10, -10, 69, 69}, action = "dialogue", label = "菱形继续",
        outline = {.5, .05, .95, .5, .5, .95, .05, .5}},
    {node = "E003", action = "auto", label = "AUTO",
        outline = {.13, .05, .99, .05, .87, .95, .01, .95}},
    {node = "E005", action = "skip", label = "SKIP",
        outline = {.13, .05, .99, .05, .87, .95, .01, .95}},
}

function Demo.Init(host)
    typingPlayer = ClipPlayer.New(Recipes.Typing())
    scene = Scene.Load(host, "ui/ui015-5ddc4204/v-95c6f64e564d/ui/s03_redesign.ui.json")
    local textLabel = scene:Find("T005")
    ---@cast textLabel Label
    line = textLabel:GetProp("text")
    local data = ImageRecipes.Scene("S03")
    scene:Bind("E002")
    for _, id in ipairs({"E007", "E008", "E010"}) do scene:Bind(id, id ~= "E010" and {clip = true} or nil) end
    control = scene:Play(data, function(t)
        textLabel:SetText(Motion.TextAt({text = line}, typingPlayer:Sample(t).text.progress))
    end)
    inputs = Controls.New(scene.stage, controls, Demo.Activate, function()
        return phase == "typing" or phase == "complete" or phase == "ended"
    end)
    scene:Find("T005"):SetStyle({pointerEvents = "none"})
    scene:Find("E008"):SetStyle({pointerEvents = "none"})
    phase, pulseClock.time, requested, auto, autoWait = "typing", 0, nil, false, 0
    print("[S03] ready: frame reveal, Label typing, completion-gated continue")
end
function Demo.Update(dt)
    scene:Fit()
    inputs:Update(dt)
    if phase == "typing" and control.clock.time >= 28 / 30 then
        control:Seek(28 / 30):Pause(); phase = "complete"
        pulseClock.scale = .88
        pulse = LuaTween.To(pulseClock, {scale = 1.12}, .4, "inOutSine"):SetLoops(-1, 'yoyo'):OnUpdate(function()
            scene.bridges["E010"].widget:SetStyle({scale = pulseClock.scale, transformOrigin = "center"})
        end)
    end
    if phase == "complete" and auto then
        autoWait = autoWait + dt
        if autoWait >= .7 then Demo.Confirm() end
    end
end
function Demo.Confirm()
    if phase == "typing" then
        inputs:Notify("台词正在显示"); return false
    end
    if phase == "ended" then Demo.Replay(); return true end
    if phase ~= "complete" then return false end
    if pulse then pulse:Kill(false); pulse = nil end
    phase = "exit"
    local state = {opacity = 1}
    exiting = LuaTween.To(state, {opacity = 0}, .22, "inCubic"):OnUpdate(function()
        scene.bridges["E007"].widget:SetStyle({opacity = state.opacity})
    end):OnComplete(function()
        phase = "ended"
        inputs:Notify("本段对话结束 · 再点重播，SKIP 返回菜单")
        print("[S03] dialogueNext; source contains one sentence, next script belongs to caller")
    end)
    return true
end
function Demo.Activate(action)
    if action == "skip" then requested = 1; return true end
    if action == "auto" then
        auto = not auto; autoWait = 0
        scene:Find("E003"):SetStyle({opacity = auto and 1 or .55})
        inputs:Notify(auto and "AUTO 已开启" or "AUTO 已关闭"); return true
    end
    return Demo.Confirm()
end
function Demo.TakeRequest() local value = requested; requested = nil; return value end
function Demo.Seek(t)
    if pulse then pulse:Kill(false); pulse = nil end
    if exiting then exiting:Kill(false); exiting = nil end
    scene.bridges["E007"].widget:SetStyle({opacity = 1})
    control:Seek(t):Pause(); savedPhase = t < 28 / 30 and "typing" or "complete"; phase = "paused"
end
function Demo.Replay()
    Demo.Seek(0); control:Play(); phase, autoWait = "typing", 0
end
function Demo.Reset() Demo.Replay() end
function Demo.TogglePause()
    if phase == "paused" then
        phase = savedPhase
        if phase == "typing" then control:Play() end
        if pulse then pulse:Resume() end
        if exiting then exiting:Resume() end
    else
        savedPhase = phase; phase = "paused"; control:Pause()
        if pulse then pulse:Pause() end
        if exiting then exiting:Pause() end
    end
end
function Demo.Select(_) end
function Demo.GetState() return {phase = phase, selected = 1, seconds = control and control.clock.time or 0} end
function Demo.Reference()
    local result = Scene.Reference(control)
    result.typing = {id = "T005", text = line, at = 9 / 30, duration = 13 / 30}
    result.controls = controls
    result.dialoguePanel, result.continueIcon = "E007", "E010"
    result.ui = "assets/ui/ui015-5ddc4204/v-95c6f64e564d/ui/s03_redesign.ui.json"
    return result
end
function Demo.Shutdown()
    if typingPlayer then typingPlayer:Destroy();typingPlayer=nil end
    if pulse then pulse:Kill(false); pulse = nil end
    if exiting then exiting:Kill(false); exiting = nil end
    if scene then scene:Destroy(); scene = nil end
    control, phase = nil, "stopped"
end
return Demo
