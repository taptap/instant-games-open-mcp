local Showcase = require('NanoVGShowcase')
function Start()
    graphics.windowTitle = 'NanoVG UI Motion / 1-5 scenes, R replay, P pause'
    Showcase.Init()
    SubscribeToEvent('Update','ShowcaseUpdate')
    SubscribeToEvent('KeyDown','ShowcaseKey')
end
function ShowcaseUpdate(_,data) Showcase.Update(data['TimeStep']:GetFloat()) end
function ShowcaseKey(_,data) Showcase.Key(data['Key']:GetInt()) end
function Stop() Showcase.Shutdown() end
