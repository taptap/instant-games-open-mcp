-- Renderer-independent playback of scene.json v2 assets. Time is milliseconds.
local Player = {}
Player.__index = Player

function Player.new(scene, loadJson)
    assert(scene.version == 2 and scene.size[1] > 0 and scene.size[2] > 0, 'Invalid scene')
    local self = setmetatable({scene=scene, clock=0, speed=scene.playback.speed or 1, states={}, byId={}, assets={}, ordered={}}, Player)
    assert(self.speed > 0, 'Invalid scene speed')
    for _, asset in ipairs(scene.assets) do
        local animation = loadJson(asset.animation)
        assert(animation and #animation.frames > 0 and not animation.loop, 'Expected one-shot animation')
        local duration = 0
        for _, frame in ipairs(animation.frames) do
            assert(frame.durationMs > 0, 'Invalid frame duration')
            duration = duration + frame.durationMs
        end
        assert(math.abs(duration-animation.durationMs) < .001, 'Frame timing mismatch')
        self.assets[asset.id] = {data=asset, animation=animation, duration=duration, directory=asset.animation:match('^(.*)/') or ''}
    end
    for _, instance in ipairs(scene.instances) do
        assert(not self.byId[instance.id] and self.assets[instance.assetId], 'Invalid instance reference')
        assert(instance.speed > 0 and instance.startMs >= 0, 'Invalid instance timing')
        self.byId[instance.id] = instance
        self.ordered[#self.ordered+1] = instance
    end
    for _, instance in ipairs(self.ordered) do
        local parent, seen = instance.parent, {[instance.id]=true}
        while type(parent) == 'string' do
            assert(self.byId[parent] and not seen[parent], 'Invalid support dependency')
            seen[parent] = true
            parent = self.byId[parent].parent
        end
    end
    table.sort(self.ordered, function(a,b)
        return a.zIndex == b.zIndex and a.id < b.id or a.zIndex < b.zIndex
    end)
    self:clear()
    if scene.playback.autoplay then self:playAll() end
    return self
end

function Player:clear()
    self.clock = 0
    self.states = {}
    for _, instance in ipairs(self.ordered) do self.states[instance.id] = {} end
end

function Player:finishTime(id)
    local instance = self.byId[id]
    return self.states[id].start + self.assets[instance.assetId].duration / instance.speed
end

function Player:playAll()
    self:clear()
    local function schedule(id)
        local state, instance = self.states[id], self.byId[id]
        if state.start then return end
        local start = instance.startMs
        if type(instance.parent) == 'string' then
            schedule(instance.parent)
            start = math.max(start, self:finishTime(instance.parent))
        end
        state.start = start
    end
    for _, instance in ipairs(self.ordered) do schedule(instance.id) end
end

function Player:trigger(id)
    assert(self.byId[id], 'Unknown instance')
    local function hideChildren(parent)
        for _, instance in ipairs(self.ordered) do
            if instance.parent == parent then
                self.states[instance.id] = {}
                hideChildren(instance.id)
            end
        end
    end
    hideChildren(id)
    self.states[id] = {}
    local function schedule(target)
        local instance, state = self.byId[target], self.states[target]
        if state.start and state.start <= self.clock then return end
        local start = self.clock
        if type(instance.parent) == 'string' then
            schedule(instance.parent)
            start = math.max(start, self:finishTime(instance.parent))
        end
        state.start = start
    end
    schedule(id)
end

function Player:update(deltaMs)
    assert(deltaMs >= 0 and self.speed > 0, 'Invalid playback time')
    self.clock = self.clock + deltaMs*self.speed
end

function Player:seek(sceneMs)
    assert(sceneMs >= 0, 'Invalid scene time')
    self.clock = sceneMs
end

function Player:sample(id)
    local instance, state = self.byId[id], self.states[id]
    assert(instance, 'Unknown instance')
    if not state.start or self.clock < state.start then return nil end
    local asset = self.assets[instance.assetId]
    local time, elapsed = (self.clock-state.start)*instance.speed, 0
    local index = #asset.animation.frames
    for i, frame in ipairs(asset.animation.frames) do
        elapsed = elapsed+frame.durationMs
        if time < elapsed then index=i; break end
    end
    return {path=asset.directory..'/'..asset.animation.frames[index].file, box=instance.animationBox,
            frame=index, finished=time >= asset.duration}
end

function Player:layout(width, height)
    local sw, sh = self.scene.size[1], self.scene.size[2]
    local scale = math.min(width/sw, height/sh)
    return {scale=scale, x=(width-sw*scale)/2, y=(height-sh*scale)/2}
end

return Player
