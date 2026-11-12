local Motion = {}
local defaults = { dx = 0, dy = 0, scale = 1, scaleX = 1, scaleY = 1, rotation = 0, opacity = 1, reveal = 1, revealY = 1, textProgress = 1 }
local LuaTween = require('LuaTween')
local eases = LuaTween.easing
local function clamp(value, low, high) return math.max(low, math.min(high, value)) end
local function finite(value) return type(value) == 'number' and value == value and math.abs(value) < math.huge end
local function checkValue(prop, value)
    assert(defaults[prop] ~= nil and finite(value) and math.abs(value) <= 10000, 'Invalid pose property')
    if prop == 'opacity' or prop == 'reveal' or prop == 'revealY' or prop == 'textProgress' then assert(value >= 0 and value <= 1, 'Invalid normalized property') end
    if prop == 'scale' then assert(value > 0 and value <= 10, 'Invalid scale') end
    if prop == 'scaleX' or prop == 'scaleY' then assert(math.abs(value) <= 10, 'Invalid axis scale') end
end

function Motion.Validate(recipe)
    assert(recipe.version == 1, 'Unsupported motion version')
    assert(finite(recipe.duration) and recipe.duration > 0 and recipe.duration <= 30, 'Invalid duration')
    local nodes, channels = {}, {}
    for _, node in ipairs(recipe.nodes) do
        assert(type(node.id) == 'string' and not nodes[node.id], 'Duplicate/invalid node ID')
        nodes[node.id] = node
        if node.valueFrom ~= nil or node.valueTo ~= nil then
            assert(node.kind == 'text' and finite(node.valueFrom) and finite(node.valueTo), 'Invalid counter')
        end
        for prop, value in pairs(node.transform or {}) do checkValue(prop, value) end
    end
    for _, track in ipairs(recipe.tracks) do
        assert(nodes[track.node] and eases[track.ease], 'Unknown node or easing')
        checkValue(track.prop, track.from); checkValue(track.prop, track.to)
        assert(finite(track.at) and track.at >= 0 and finite(track.duration) and track.duration > 0 and
            track.at + track.duration <= recipe.duration + 1e-9, 'Track outside duration')
        channels[track.node] = channels[track.node] or {}
        local nodeChannels = channels[track.node]
        nodeChannels[track.prop] = nodeChannels[track.prop] or {}
        table.insert(nodeChannels[track.prop], track)
    end
    for nodeId, nodeChannels in pairs(channels) do
        for prop, tracks in pairs(nodeChannels) do
            table.sort(tracks, function(a,b) return a.at < b.at end)
            local expected, lastEnd = (nodes[nodeId].transform or {})[prop] or defaults[prop], -1
            for _, track in ipairs(tracks) do
                assert(track.at + 1e-9 >= lastEnd, 'Overlapping motion ownership')
                assert(math.abs(expected-track.from) <= 1e-8, 'Discontinuous motion channel')
                expected, lastEnd = track.to, track.at + track.duration
            end
        end
    end
    return recipe
end

function Motion.TextAt(node, progress)
    local p = clamp(progress,0,1)
    if node.valueTo ~= nil then return string.format('%.0f', math.floor(node.valueFrom+(node.valueTo-node.valueFrom)*p)) end
    local characters = {}
    for character in node.text:gmatch('[%z\1-\127\194-\244][\128-\191]*') do characters[#characters+1]=character end
    local result = {}
    for index=1,math.floor(#characters*p+1e-9) do result[index]=characters[index] end
    return table.concat(result)
end

function Motion.New(recipe, luaTween)
    luaTween = luaTween or LuaTween
    Motion.Validate(recipe)
    local player = { recipe = recipe, tracks = {}, handles = {}, owner = {}, destroyed = false }
    for _, track in ipairs(recipe.tracks) do
        assert(eases[track.ease] and defaults[track.prop] ~= nil, "Unsupported motion track")
        player.tracks[#player.tracks + 1] = track
    end
    table.sort(player.tracks, function(first, second) return first.at < second.at end)
    for index, track in ipairs(player.tracks) do
        local subject = { value = track.from }
        local tween = luaTween.To(subject, { value = track.to }, track.duration, track.ease)
            :SetTarget(player.owner):Pause()
        tween:Goto(0)
        player.handles[index] = { subject = subject, tween = tween }
    end
    function player:Sample(seconds)
        assert(not self.destroyed, "Player already destroyed")
        assert(type(seconds) == "number" and seconds == seconds and math.abs(seconds) < math.huge, "Invalid time")
        local time = clamp(seconds, 0, self.recipe.duration)
        local state = {}
        for _, node in ipairs(self.recipe.nodes) do
            local pose = {}
            for prop, value in pairs(defaults) do pose[prop] = value end
            for prop, value in pairs(node.transform or {}) do pose[prop] = value end
            state[node.id] = pose
        end
        for index, track in ipairs(self.tracks) do
            if time >= track.at then
                local elapsed = clamp(time - track.at, 0, track.duration)
                local handle = self.handles[index]
                handle.tween:Goto(elapsed)
                state[track.node][track.prop] = handle.subject.value
            end
        end
        return state
    end
    function player:Destroy()
        if self.destroyed then return end
        for _, handle in ipairs(self.handles) do handle.tween:Kill() end
        self.handles = {}
        self.destroyed = true
    end
    return player
end

-- Each track has its own subject, so backward seeks cannot capture a later pose.
-- The caller owns LuaTween.Update(dt); no global Clear/KillAll is used here.
---@class MotionController
---@field player table
---@field clock {time: number}
---@field Pause fun(self: MotionController): MotionController
---@field Play fun(self: MotionController): MotionController
---@field Seek fun(self: MotionController, seconds: number): MotionController
---@field Restart fun(self: MotionController): MotionController
---@field Destroy fun(self: MotionController)
---@return MotionController
function Motion.Play(recipe, luaTween, apply)
    assert(luaTween and type(apply) == 'function', 'LuaTween and pose consumer required')
    local player = Motion.New(recipe, luaTween)
    local clock = { time = 0 }
    local sequence = luaTween.Sequence(player.owner):Pause()
    sequence:Append(luaTween.To(clock, {time=recipe.duration}, recipe.duration, 'linear'))
    for index, track in ipairs(player.tracks) do
        local branch = luaTween.Sequence(player.owner)
        branch:AppendInterval(track.at):Append(player.handles[index].tween)
        sequence:Join(branch)
    end
    local control = { player=player, sequence=sequence, clock=clock, destroyed=false }
    local function alive() assert(not control.destroyed, 'Controller already destroyed') end
    sequence:OnUpdate(function() apply(player:Sample(clock.time), clock.time) end)
    function control:Pause() alive(); sequence:Pause(); return self end
    function control:Play()
        alive()
        if clock.time >= recipe.duration then sequence:Restart() else sequence:Resume() end
        return self
    end
    function control:Seek(seconds)
        alive(); assert(finite(seconds), 'Invalid time')
        local time = clamp(seconds,0,recipe.duration)
        sequence:Restart():Pause(); sequence:Goto(time)
        apply(player:Sample(time), time)
        return self
    end
    function control:Restart() alive(); self:Seek(0); sequence:Resume(); return self end
    function control:Destroy()
        if self.destroyed then return end
        sequence:Kill(); player:Destroy(); self.destroyed=true
    end
    local ok, errorMessage = pcall(function() apply(player:Sample(0),0) end)
    if not ok then control:Destroy(); error(errorMessage,0) end
    sequence:Resume()
    return control
end

function Motion.Hit(recipe, state, time, x, y)
    local nodes = {}
    for _, node in ipairs(recipe.nodes) do nodes[node.id] = node end
    for index = #recipe.interactions, 1, -1 do
        local action = recipe.interactions[index]
        local node = nodes[action.node]
        local pose = state[action.node]
        local sx, sy = pose.scale * (pose.scaleX or 1), pose.scale * (pose.scaleY or 1)
        if time >= action.at and pose.opacity >= 0.1 and pose.scale > 0 and math.abs(sx) > 1e-9 and math.abs(sy) > 1e-9 then
            local offsetX = x - node.x - node.width / 2 - pose.dx
            local offsetY = y - node.y - node.height / 2 - pose.dy
            local angle = -pose.rotation * math.pi / 180
            local localX = (offsetX * math.cos(angle) - offsetY * math.sin(angle)) / sx + node.width / 2
            local localY = (offsetX * math.sin(angle) + offsetY * math.cos(angle)) / sy + node.height / 2
            if localX >= 0 and localX <= node.width * clamp(pose.reveal, 0, 1) and localY >= 0 and localY <= node.height * clamp(pose.revealY or 1, 0, 1) then
                return action
            end
        end
    end
    return nil
end
return Motion
