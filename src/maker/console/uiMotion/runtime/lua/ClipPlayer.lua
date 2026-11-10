local LuaTween = require('LuaTween')
local ClipPlayer = {}
local defaults = {dx=0,dy=0,scale=1,scaleX=1,scaleY=1,rotation=0,opacity=1,reveal=1,revealY=1,textProgress=1}

function ClipPlayer.New(recipe)
    local sequence = LuaTween.Sequence():Pause()
    local tracks = {}
    for index, track in ipairs(recipe.tracks) do
        local subject = {value=track.from}
        local tween = LuaTween.To(subject, {value=track.to}, track.duration, track.ease)
        if track.loops then tween:SetLoops(track.loops, track.loopType) end
        tween:Goto(0)
        local branch = LuaTween.Sequence():AppendInterval(track.at):Append(tween)
        sequence:Join(branch)
        tracks[index] = {track=track,subject=subject,index=index}
    end
    table.sort(tracks, function(first, second)
        if first.track.at == second.track.at then return first.index < second.index end
        return first.track.at < second.track.at
    end)
    local player = {sequence=sequence,destroyed=false}
    function player:Sample(seconds)
        assert(not self.destroyed, 'Clip player destroyed')
        assert(type(seconds)=='number' and seconds==seconds and math.abs(seconds)<math.huge, 'Invalid time')
        local time = math.max(0,math.min(seconds,recipe.duration))
        sequence:Goto(time)
        local poses = {}
        for _,node in ipairs(recipe.nodes or {}) do
            local pose = {}
            for key,value in pairs(defaults) do pose[key]=value end
            for key,value in pairs(node.transform or {}) do pose[key]=value end
            poses[node.id]=pose
        end
        for _,entry in ipairs(tracks) do
            local track=entry.track
            poses[track.node]=poses[track.node] or {}
            local pose=poses[track.node]
            if not recipe.nodes and pose[track.prop]==nil then pose[track.prop]=track.from end
            if time>=track.at then pose[track.prop]=entry.subject.value end
        end
        return poses
    end
    function player:Destroy()
        if self.destroyed then return end
        sequence:Kill();self.destroyed=true
    end
    return player
end
return ClipPlayer
