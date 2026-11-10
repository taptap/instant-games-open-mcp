local UI = require("urhox-libs/UI")
local Motion = require("Motion")
local LuaTween = require("LuaTween")
local Adapter = require("UrhoxMotion")
local Scene = {}

---@class NativeSceneInstance
---@field stage Widget
---@field width number
---@field height number
---@field bridges table<string, any>
---@field viewport string
---@field controllers MotionController[]
---@field Find fun(self: NativeSceneInstance, id: string): Widget
---@field Bind fun(self: NativeSceneInstance, id: string, options?: table): any
---@field Play fun(self: NativeSceneInstance, recipe: table, afterApply?: function): MotionController
---@field Fit fun(self: NativeSceneInstance)
---@field Destroy fun(self: NativeSceneInstance)

---@param host Widget
---@param path string
---@return NativeSceneInstance
function Scene.Load(host, path)
    local instance, err = UI.UILoader.LoadFromFile(path)
    assert(instance, err)
    ---@cast instance {GetRoot: fun(self: table): Widget?}
    local stage = assert(instance:GetRoot())
    ---@type NativeSceneInstance
    local scene = {stage = stage, width = stage:GetProp("width"),
        height = stage:GetProp("height"), bridges = {}, viewport = "", controllers = {}}
    stage:SetStyle({position = "absolute", overflow = "hidden"})
    host:AddChild(stage)
    function scene:Find(id) return assert(stage:FindById(id), "Missing UI node: " .. id) end
    function scene:Bind(id, options)
        local bridge = Adapter.Bind(self:Find(id), options)
        self.bridges[id] = bridge
        return bridge
    end
    function scene:Play(recipe, afterApply)
        local control = Motion.Play(recipe, LuaTween, function(state, seconds)
            for id, pose in pairs(state) do self.bridges[id]:Apply(pose) end
            if afterApply then afterApply(seconds) end
        end)
        self.controllers[#self.controllers + 1] = control
        return control
    end
    function scene:Fit()
        local x, y, w, h = UI.GetSafeContentArea()
        local key = table.concat({x, y, w, h}, ":")
        if self.viewport == key then return end
        self.viewport = key
        local scale = math.min(w / self.width, h / self.height)
        stage:SetStyle({left = x + (w - self.width * scale) / 2,
            top = y + (h - self.height * scale) / 2, scale = scale, transformOrigin = "top-left"})
    end
    function scene:Destroy()
        for _, control in ipairs(self.controllers) do control:Destroy() end
        for _, bridge in pairs(self.bridges) do bridge:Destroy() end
        if stage.parent then stage.parent:RemoveChild(stage) end
        stage:Destroy()
    end
    scene:Fit()
    return scene
end

function Scene.Recipe(duration)
    local data = {version = 1, duration = duration, nodes = {}, tracks = {}, interactions = {}}
    function data:Node(id, transform)
        self.nodes[#self.nodes + 1] = {id = id, transform = transform or {}}
    end
    function data:Track(id, prop, at, duration, from, to, ease)
        self.tracks[#self.tracks + 1] = {node = id, prop = prop, at = at,
            duration = duration, from = from, to = to, ease = ease or "outCubic"}
    end
    return data
end

function Scene.Reference(control, bindings)
    local data = control.player.recipe
    return {recipe = {version = data.version, duration = data.duration,
        nodes = data.nodes, tracks = data.tracks, interactions = data.interactions},
        bindings = bindings or {}}
end

return Scene
