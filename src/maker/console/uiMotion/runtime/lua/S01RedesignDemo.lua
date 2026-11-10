local ImageRecipes = require('ImageMotionRecipes')
local UI = require("urhox-libs/UI")
local Motion = require("Motion")
local LuaTween = require("LuaTween")
local Adapter = require("UrhoxMotion")
local Scene = require("NativeScene")
local Controls = require("NativeControls")
local Demo = {}
local stage, root
---@type MotionController
local controller
local bridges, buttons = {}, {}
local buttonRects, normalImages = {}, {}
local cursor, cursorTween
local cursorPose = {x = 775, y = 512}
local primaryImage, secondaryImage
local phase, viewport, selected = "stopped", "", 1
local savedPhase = "entry"
local entryEnd = 21 / 30
local width, height = 2048, 1152
local hosted = false
local inputs
local controlSpecs = {
    {node = "E005", action = "menu1", label = "START GAME",
        outline = {.06, .05, .99, .05, .94, .95, .01, .95}},
    {node = "E007", action = "menu2", label = "SETTINGS",
        outline = {.06, .05, .99, .05, .94, .95, .01, .95}},
    {node = "E008", action = "menu3", label = "GALLERY",
        outline = {.06, .05, .99, .05, .94, .95, .01, .95}},
    {node = "E009", action = "menu4", label = "ONLINE MODE",
        outline = {.06, .05, .99, .05, .94, .95, .01, .95}},
    {node = "E010", action = "confirmMenu", label = "PRESS ANY BUTTON"},
}

local Wipe = UI.Widget:Extend("S01DiagonalWipe")
function Wipe:Render(nvg)
    local l = self:GetAbsoluteLayout()
    nvgBeginPath(nvg)
    nvgMoveTo(nvg, l.x + 700, l.y)
    nvgLineTo(nvg, l.x + l.w, l.y)
    nvgLineTo(nvg, l.x + l.w - 700, l.y + l.h)
    nvgLineTo(nvg, l.x, l.y + l.h)
    nvgClosePath(nvg)
    nvgFillColor(nvg, nvgRGBA(6, 5, 14, 255))
    nvgFill(nvg)
    nvgStrokeColor(nvg, nvgRGBA(245, 44, 126, 255))
    nvgStrokeWidth(nvg, 18)
    nvgStroke(nvg)
end

local function fit()
    local x, y, w, h = UI.GetSafeContentArea()
    local key = table.concat({x, y, w, h}, ":")
    if viewport == key then return end
    viewport = key
    local scale = math.min(w / width, h / height)
    stage:SetStyle({left = x + (w - width * scale) / 2,
        top = y + (h - height * scale) / 2, scale = scale, transformOrigin = "top-left"})
end

local function recipe() return ImageRecipes.Scene("S01") end

function Demo.Select(index)
    if phase ~= "idle" then return end
    selected = (index - 1) % #buttons + 1
    for i, button in ipairs(buttons) do
        button:SetStyle({backgroundImage = i == selected
            and primaryImage or secondaryImage,
            scale = i == selected and 1.06 or 1, transformOrigin = "center"})
    end
    local rect = buttonRects[selected]
    if cursorTween then cursorTween:Kill(false) end
    cursorTween = LuaTween.To(cursorPose, {x = rect[1] - 21, y = rect[2] + (rect[4] - 100) / 2},
        0.14, "outBack"):OnUpdate(function()
        cursor:SetStyle({left = cursorPose.x, top = cursorPose.y})
    end)
    print("[S01] focus", selected)
end

function Demo.Init(host)
    hosted = host ~= nil
    if not hosted then
        UI.Init({theme = "default-dark", scale = UI.Scale.DEFAULT,
            fonts = {{family = "sans", weights = {normal = "Fonts/Menu-Black.ttf", bold = "Fonts/Menu-Black.ttf"}}}})
    end
    local instance, err = UI.UILoader.LoadFromFile("ui/ui015-e4be1752/v-8c8b4b0e087e/ui/s01_redesign.ui.json")
    assert(instance, err)
    ---@cast instance {GetRoot: fun(self: table): Widget?}
    stage = assert(instance:GetRoot())
    stage:SetStyle({position = "absolute", width = width, height = height, overflow = "hidden"})
    root = host or UI.Panel {width = "100%", height = "100%", backgroundColor = {4, 5, 12, 255}}
    root:AddChild(stage)
    if not hosted then UI.SetRoot(root) end
    local function find(id) return assert(stage:FindById(id), "Missing S01 node: " .. id) end
    cursor = find("E006")
    cursor.parent:RemoveChild(cursor)
    cursor:SetStyle({left = 775, top = 512, width = 85, height = 100, zIndex = 30})
    stage:AddChild(cursor)
    for _, id in ipairs({"E002", "E003", "E006", "E012", "E014",
        "T001", "T002", "T003", "T004", "T005", "T006", "T007"}) do
        find(id):SetStyle({pointerEvents = "none"})
    end
    for i, id in ipairs({"E005", "E007", "E008", "E009"}) do
        local button = find(id)
        button:SetStyle({borderWidth = 0, borderRadius = 0, padding = 0, boxShadow = false,
            backgroundColor = {0, 0, 0, 0}, hoverBackgroundColor = {0, 0, 0, 0},
            pressedBackgroundColor = {0, 0, 0, 0}})
        buttons[i] = button
        buttonRects[i] = {button:GetProp("left"), button:GetProp("top"),
            button:GetProp("width"), button:GetProp("height")}
        normalImages[i] = button:GetProp("backgroundImage")
        bridges["menu" .. i] = Adapter.Bind(button, {clip = true})
    end
    primaryImage, secondaryImage = normalImages[1], normalImages[2]
    for _, id in ipairs({"E004", "T001", "T002"}) do bridges[id] = Adapter.Bind(find(id)) end
    bridges.backdrop = Adapter.Bind(find("E001"))
    bridges.actorLeft = Adapter.Bind(find("E002"))
    bridges.actorRight = Adapter.Bind(find("E003"))
    bridges.footer = Adapter.Bind(find("E010"))
    inputs = Controls.New(stage, controlSpecs, Demo.Activate, function() return phase == "idle" end, nil, function(action)
        local index = tonumber(action:match("^menu(%d)$"))
        if index then Demo.Select(index) end
    end)
    local sweep = UI.Panel {position = "absolute", left = 796, top = 510, width = 503, height = 103,
        backgroundImage = primaryImage,
        backgroundFit = "fill", pointerEvents = "none", zIndex = 25}
    stage:AddChild(sweep)
    bridges.sweep = Adapter.Bind(sweep, {stretch = true})
    local wipe = Wipe {position = "absolute", left = -4000, top = 0,
        width = 9280, height = height, pointerEvents = "none", zIndex = 100}
    stage:AddChild(wipe)
    bridges.wipe = Adapter.Bind(wipe)
    controller = Motion.Play(recipe(), LuaTween, function(state, seconds)
        for id, pose in pairs(state) do
            if hosted and id == "wipe" then pose.opacity = 0 end
            bridges[id]:Apply(pose)
        end
        cursor:SetStyle({visible = seconds >= entryEnd and seconds < 35 / 30})
    end)
    phase = "entry"
    selected = 1
    fit()
    print("[S01] ready: native independent PNG layers, editable UI, 2048x1152")
end

function Demo.Update(dt)
    if not controller then return end
    fit()
    inputs:Update(dt)
    if not hosted then LuaTween.Update(dt) end
    if phase == "entry" and controller.clock.time >= entryEnd then
        controller:Seek(entryEnd):Pause()
        phase = "idle"
        Demo.Select(1)
    elseif phase == "confirm" and controller.clock.time >= 47 / 30 then
        controller:Pause()
        phase = "ended"
        print("[S01] transition finished")
    end
end

function Demo.Confirm()
    if phase ~= "idle" then return false end
    if selected ~= 1 then
        inputs:Select("menu" .. selected)
        inputs:Notify(({"START GAME", "SETTINGS", "GALLERY", "ONLINE MODE"})[selected] .. " · 入口已选中")
        return true
    end
    phase = "confirm"
    local rect = buttonRects[selected]
    bridges.sweep.widget:SetStyle({left = rect[1], top = rect[2]})
    controller:Seek(24 / 30):Play()
    print("[S01] confirm", selected)
    return true
end
function Demo.Activate(action)
    if phase ~= "idle" then return false end
    local index = tonumber(action:match("^menu(%d)$"))
    if index then Demo.Select(index) end
    return Demo.Confirm()
end
function Demo.Seek(seconds)
    controller:Seek(seconds):Pause()
    savedPhase = seconds < entryEnd and "entry" or seconds < 24 / 30 and "idle" or "confirm"
    phase = "paused"
end
function Demo.Replay() controller:Restart(); phase = "entry" end
function Demo.Reset() controller:Seek(entryEnd):Pause(); phase = "idle"; Demo.Select(1) end
function Demo.TogglePause()
    if phase == "paused" then
        phase = savedPhase
        if phase ~= "idle" then controller:Play() end
    else savedPhase = phase; controller:Pause(); phase = "paused" end
end
function Demo.GetState() return {phase = phase, selected = selected, seconds = controller and controller.clock.time or 0} end
function Demo.Reference()
    local result = Scene.Reference(controller, {menu1 = "E005", menu2 = "E007",
        menu3 = "E008", menu4 = "E009", footer = "E010", sweep = "sweep",
        actorLeft = "E002", actorRight = "E003", backdrop = "E001"})
    result.controls = controlSpecs
    result.entryEvidence = "已审核原创设计；独立双角色入场、背景轻推近与菜单错峰。"
    result.menu = {ids = {"E005", "E007", "E008", "E009"}, primary = primaryImage,
        secondary = secondaryImage, cursor = cursor:GetProp("backgroundImage"), cursorRect = {-21, 0, 85, 100}}
    result.layers = {{id = "sweep", type = "Panel", left = 796, top = 510, width = 503, height = 103,
        backgroundFit = "fill", backgroundImage = primaryImage}}
    result.ui = "assets/ui/ui015-e4be1752/v-8c8b4b0e087e/ui/s01_redesign.ui.json"
    return result
end
function Demo.Shutdown()
    if controller then controller:Destroy(); controller = nil end
    if cursorTween then cursorTween:Kill(false); cursorTween = nil end
    for _, bridge in pairs(bridges) do bridge:Destroy() end
    bridges, buttons = {}, {}
    buttonRects, normalImages = {}, {}
    if hosted and stage then
        if stage.parent then stage.parent:RemoveChild(stage) end
        stage:Destroy()
    end
    if not hosted then UI.Shutdown() end
    stage, root = nil, nil
    phase, viewport = "stopped", ""
end
return Demo
