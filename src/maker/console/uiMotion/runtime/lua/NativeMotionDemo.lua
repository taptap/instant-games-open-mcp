local UI = require("urhox-libs/UI")
local LuaTween = require("LuaTween")
local Transitions = require("NativeTransitions")
local App = {}
local root, active, transition, destination, pauseBlocker
local current, paused = 1, false
local modules = {"S01RedesignDemo", "S02RedesignDemo", "S03RedesignDemo", "S04RedesignDemo", "S05RedesignDemo"}
local cardPath = "ui/s04-redesign-v1/images/effects/orrery-star-card.png"
local changeScene
local function sampleTransition(progress, seeking)
    local index = progress >= .5 and destination or transition.sourceScene
    index = index or transition.sourceScene
    if current ~= index then changeScene(index) end
    if seeking then
        ---@type MotionController
        local controller = transition.controller
        active.Seek(index == transition.sourceScene and transition.sourceSeconds or
            math.max(0, controller.clock.time - transition.duration / 2))
    end
    transition.switched = progress >= .5
end

changeScene = function(index)
    if active then active.Shutdown() end
    current = math.max(1, math.min(#modules, index))
    active = require(modules[current])
    active.Init(root)
    print("[UI Demo] scene S0" .. current)
end
function App.Init(initialScene)
    UI.Init({theme = "default-dark", scale = UI.Scale.DEFAULT,
        fonts = {
            {family = "sans", weights = {normal = "Fonts/Menu-Black.ttf", bold = "Fonts/Menu-Black.ttf"}},
            {family = "Fonts/NotoSerifSC-Regular.ttf", weights = {
                normal = "Fonts/NotoSerifSC-Regular.ttf", bold = "Fonts/NotoSerifSC-Regular.ttf"}},
        }})
    root = UI.Panel {width = "100%", height = "100%", backgroundColor = {4, 3, 10, 255}}
    UI.SetRoot(root)
    pauseBlocker = UI.Panel {position = "absolute", left = 0, top = 0,
        width = "100%", height = "100%", visible = false,
        pointerEvents = "box-only", zIndex = 2000, backgroundColor = {0, 0, 0, 0}}
    root:AddChild(pauseBlocker)
    paused = false
    changeScene(initialScene or 1)
end
function App.Open(index)
    if transition then transition:Destroy(); transition = nil end
    destination, paused = nil, false
    changeScene(index)
end
function App.SetCard(path) cardPath = path end
function App.Transition(id, nextScene)
    if id == "T03" and current < 4 or id ~= "T03" and current >= 4 then return false end
    if transition then transition:Destroy() end
    destination, paused = nextScene or (id == "T03" and 5 or id == "T02" and 3 or 2), false
    transition = Transitions.New(root, id, cardPath)
    transition.id = id
    transition.sourceScene, transition.sourceSeconds = current, active.GetState().seconds
    return true
end
function App.Update(dt)
    if not active then return end
    pauseBlocker:SetStyle({visible = paused})
    if not paused then
        LuaTween.Update(dt)
        active.Update(dt)
    end
    if transition then
        local progress = transition:Update()
        if not paused and not transition.switched and progress >= .5 then
            sampleTransition(progress, false)
        end
        if not paused and progress >= 1 then
            transition:Destroy(); transition, destination = nil, nil
        end
    elseif not paused then
        local state = active.GetState()
        if current == 1 and state.phase == "confirm" and state.seconds >= 34 / 30 then
            App.Transition("T01", 2)
        elseif active.TakeRequest then
            local nextScene = active.TakeRequest()
            if nextScene then App.Transition(current >= 4 and "T03" or "T02", nextScene) end
        end
    end
end
function App.Confirm() if not paused and not transition then return active.Confirm() end; return false end
function App.Activate(action)
    if not paused and not transition and active.Activate then return active.Activate(action) end
    return false
end
function App.Select(index) if not paused and not transition then active.Select(index) end end
function App.Seek(seconds)
    paused = true
    if transition then
        transition:Seek(seconds)
        sampleTransition(transition.controller.clock.time / transition.duration, true)
    else active.Seek(seconds) end
end
function App.TogglePause()
    paused = not paused
    if not paused then
        if transition and transition.paused then transition:TogglePause() end
        if active.GetState().phase == "paused" then active.TogglePause() end
    end
end
function App.Replay()
    paused = false
    if transition then
        transition:Seek(0)
        sampleTransition(0, true)
        if active.GetState().phase == "paused" then active.TogglePause() end
        transition.controller:Restart(); transition.switched = false; transition.paused = false
    else active.Replay() end
end
function App.Reset() App.Open(current) end
function App.GetState()
    local state = active.GetState(); state.scene, state.paused = current, paused
    if transition then state.seconds = transition.controller.clock.time; state.transition = transition.id end
    return state
end
function App.Reference() return active.Reference() end
function App.Shutdown()
    if transition then transition:Destroy(); transition = nil end
    if active then active.Shutdown(); active = nil end
    UI.Shutdown(); root = nil
end
return App
