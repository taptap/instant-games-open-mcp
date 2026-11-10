local Demo = require("NativeMotionDemo")

function Start()
    graphics.windowTitle = "UI Motion / Original Designs"
    Demo.Init()
    SubscribeToEvent("Update", "RedesignUpdate")
    SubscribeToEvent("KeyDown", "RedesignKey")
end

function RedesignUpdate(_, eventData)
    Demo.Update(eventData["TimeStep"]:GetFloat())
end

function RedesignKey(_, eventData)
    local key = eventData["Key"]:GetInt()
    if key >= KEY_1 and key <= KEY_5 then Demo.Open(key - KEY_1 + 1)
    elseif key == KEY_RETURN or key == KEY_SPACE then Demo.Confirm()
    elseif key == KEY_R then Demo.Replay()
    elseif key == KEY_P then Demo.TogglePause()
    elseif key == KEY_ESCAPE then Demo.Reset()
    elseif key == KEY_UP then Demo.Select(Demo.GetState().selected - 1)
    elseif key == KEY_DOWN then Demo.Select(Demo.GetState().selected + 1)
    elseif key == KEY_LEFT then Demo.Seek(Demo.GetState().seconds - 1 / 30)
    elseif key == KEY_RIGHT then Demo.Seek(Demo.GetState().seconds + 1 / 30)
    elseif key == KEY_F1 then Demo.Transition("T01", 2)
    elseif key == KEY_F2 then Demo.Transition("T02", 3)
    elseif key == KEY_F3 then Demo.Transition("T03", 5) end
end

function Stop() Demo.Shutdown() end
