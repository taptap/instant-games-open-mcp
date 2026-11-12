-- Fixed-layout urhox-libs/UI adapter. The animated wrapper owns no hover state.
local UI = require("urhox-libs/UI")
local WidgetBridge = require("WidgetBridge")
local Adapter = {}

function Adapter.Bind(child, options)
    options = options or {}
    local parent = assert(child.parent, "Motion child must already have a parent")
    local width, height = child:GetProp("width"), child:GetProp("height")
    local left, top = child:GetProp("left", 0), child:GetProp("top", 0)
    assert(child:GetProp("position") == "absolute" and type(width) == "number" and
        type(height) == "number" and width > 0 and height > 0, "Fixed absolute layout required")
    assert(type(left) == "number" and type(top) == "number" and
        child:GetProp("right") == nil and child:GetProp("bottom") == nil,
        "Numeric left/top layout required; resolve anchors before binding")
    if options.stretch then
        assert(child:GetNumChildren() == 0, "Stretch only supports a dedicated image layer")
        assert(not options.clip, "Use separate layers for stretch and reveal")
    end
    local index = 1
    for i, widget in ipairs(parent:GetChildren()) do if widget == child then index = i; break end end
    local wrapper = UI.Panel {
        position = "absolute", left = left, top = top,
        width = width, height = height, zIndex = child:GetProp("zIndex", 0),
        pointerEvents = "box-none",
        borderWidth = 0, borderRadius = 0, padding = 0,
    }
    parent:RemoveChild(child)
    child:SetStyle({ left = 0, top = 0 })
    wrapper:AddChild(child)
    child.motionWrapper = wrapper
    parent:InsertChild(wrapper, index)
    local adapters = {}
    if options.clip then
        adapters.clip = function(widget, x, y)
            widget:SetStyle({ width = width * x, height = height * y,
                overflow = (x < 1 or y < 1) and "hidden" or "visible" })
        end
    end
    if options.stretch then
        adapters.axes = function(widget, x, y)
            assert(x >= 0 and y >= 0, "Image stretch cannot mirror; use a renderer transform")
            widget:SetStyle({ width = width * x, height = height * y })
            child:SetStyle({ width = width * x, height = height * y })
        end
    end
    return WidgetBridge.New(wrapper, adapters), wrapper
end

return Adapter
