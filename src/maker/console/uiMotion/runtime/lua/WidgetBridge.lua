-- Apply timeline poses to dedicated motion wrappers, not native interaction children.
local Bridge = {}
local mapping = { dx = "translateX", dy = "translateY", scale = "scale", rotation = "rotate", opacity = "opacity" }
function Bridge.New(widget, adapters)
    adapters = adapters or {}
    assert(not widget:HasActiveTransitions(), "Bind a fresh motion wrapper; active animation owns its properties")
    assert(not widget:GetProp("transition"), "Motion wrapper cannot also have native transitions")
    local base = {}
    for source, target in pairs(mapping) do base[source] = widget:GetProp(target, (source == "scale" or source == "opacity") and 1 or 0) end
    local bridge = { widget = widget, last = nil, destroyed = false }
    function bridge:Apply(pose)
        assert(not self.destroyed, 'Bridge already destroyed')
        assert(not self.widget:HasActiveTransitions(), "Motion property ownership conflict")
        assert(not self.widget:GetProp("transition"), "Native transition added to motion-owned wrapper")
        local sx, sy, rx, ry = pose.scaleX or 1, pose.scaleY or 1, pose.reveal or 1, pose.revealY or 1
        assert(adapters.axes or (sx == 1 and sy == 1), 'Axis scaling requires an axes adapter')
        assert(adapters.clip or (rx == 1 and ry == 1), 'Reveal requires a clip adapter')
        assert(adapters.text or pose.textProgress == nil or pose.textProgress == 1, 'Text progress requires a text adapter')
        local style = {}
        local changed = false
        for source, target in pairs(mapping) do
            local value = assert(pose[source], "Missing motion pose property")
            if source == "scale" or source == "opacity" then value = value * base[source] else value = value + base[source] end
            if source == "opacity" then value = math.max(0, math.min(1, value)) end
            style[target] = value
            if not (source == 'scale' and adapters.axes) and (not self.last or self.last[target] ~= value) then changed = true end
        end
        if adapters.axes then
            local x, y = base.scale * pose.scale * sx, base.scale * pose.scale * sy
            style.scale = nil
            if not self.last or self.last.axisX ~= x or self.last.axisY ~= y then adapters.axes(self.widget, x, y) end
            style.axisX, style.axisY = x, y
        end
        if adapters.clip then
            rx, ry = math.max(0,math.min(1,rx)), math.max(0,math.min(1,ry))
            if not self.last or self.last.clipX ~= rx or self.last.clipY ~= ry then adapters.clip(self.widget, rx, ry) end
            style.clipX, style.clipY = rx, ry
        end
        if adapters.text then adapters.text(self.widget, pose.textProgress or 1) end
        if changed then
            local native = {}
            for _, target in pairs(mapping) do native[target] = style[target] end
            self.widget:SetStyle(native)
        end
        self.last = style
    end
    function bridge:Destroy(restore)
        if self.destroyed then return end
        if restore then
            assert(not self.widget:HasActiveTransitions() and not self.widget:GetProp('transition'), 'Motion property ownership conflict')
            local style = {}
            for source, target in pairs(mapping) do style[target] = base[source] end
            if adapters.axes then style.scale = nil end
            self.widget:SetStyle(style)
            if adapters.axes then adapters.axes(self.widget, base.scale, base.scale) end
            if adapters.clip then adapters.clip(self.widget, 1, 1) end
        end
        self.destroyed = true
    end
    return bridge
end
return Bridge
