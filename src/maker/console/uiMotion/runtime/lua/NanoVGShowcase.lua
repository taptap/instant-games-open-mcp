local UI = require('urhox-libs/UI')
local NanoVG = require('MakerNanoVG')
local Motion = require('Motion')
local ClipPlayer = require('ClipPlayer')
local UiMotionRecipes = require('UiMotionRecipes')
local idlePlayer
local Adapter = require('UrhoxMotion')
local Demo = {}
local root, stage, overlay, manifest
local scenes, players, recipes, bridges = {}, {}, {}, {}
local state = {scene = 'S01', clip = 'S01.entry', time = 0, playing = false, inspect = false,
    character = 1, selected = 1, chapter = 1, line = 1, auto = false, autoClock = 0,
    idle = true, beacon = true, idleClock = 0, modal = nil}
local viewport = ''
local neutral = {dx=0, dy=0, scale=1, rotation=0, opacity=1, reveal=1, revealY=1, textProgress=1}
local function read(path)
    local file = assert(cache:GetFile(path), 'Missing showcase resource: '..path)
    local result = cjson.decode(file:ReadString()); file:Close(); return result
end
local function definition(id)
    for _, item in ipairs(manifest.scenes) do if item.id == id then return item end end
    error('Unknown scene '..tostring(id))
end
local function find(id, sceneId)
    return assert(scenes[sceneId or state.scene]:FindById(id), 'Missing showcase widget '..id)
end
local function style(id, props) find(id):SetStyle(props) end
local function text(id, value) style(id, {text=value}) end
local function ready()
    local recipe = recipes[state.clip]
    return not state.inspect and recipe.category ~= 'transition' and
        not (recipe.category == 'entry' and state.time < recipe.duration)
end
local function apply(sceneId, recipeId, time)
    local poses = players[recipeId]:Sample(time)
    for id, bridge in pairs(bridges[sceneId]) do
        local value = poses[id] or neutral
        if id == 'dialogue-text' and poses[id] then
            find(id, sceneId):SetStyle({text=Motion.TextAt({text=manifest.dialogue[state.line]}, value.textProgress)})
            value.textProgress = 1
        end
        bridge:Apply(value)
    end
end
local function fit()
    local x,y,w,h = UI.GetSafeContentArea()
    local key = table.concat({x,y,w,h}, ':')
    if viewport == key then return end
    viewport = key
    local scale = math.min(w/1280, h/720)
    stage:SetStyle({left=x+(w-1280*scale)/2, top=y+(h-720*scale)/2,
        scale=scale, transformOrigin='top-left'})
end
local function selectScene(id)
    state.scene = id
    for sceneId, widget in pairs(scenes) do widget:SetStyle({visible=sceneId==id}) end
end
local function refreshState()
    local id = state.scene
    local isReady = ready()
    for buttonId, widget in pairs(scenes[id]._showcaseButtons) do
        local modalButton = buttonId:match('^modal%-') or buttonId:match('^setting%-')
        widget:SetStyle({disabled=not isReady or (state.modal ~= nil and not modalButton),
            scale=widget.state.pressed and .985 or 1})
    end
    if id == 'S01' then
        for i=1,3 do
            style('menu'..i..'-selected', {visible=state.selected==i})
            local b=find('menu'..i)
            b:SetStyle({scale=b.state.pressed and .985 or (isReady and state.selected==i and 1.025 or 1), transformOrigin='left'})
        end
        style('beacon', {visible=state.beacon, opacity=idlePlayer:Sample(state.idleClock).beacon.opacity})
        style('setting-motion', {visible=state.modal and state.modal.kind=='settings' or false})
        style('setting-beacon', {visible=state.modal and state.modal.kind=='settings' or false})
        text('setting-motion-text', state.idle and '待机动画：开' or '待机动画：关')
        text('setting-beacon-text', state.beacon and '灯塔光芒：开' or '灯塔光芒：关')
    elseif id == 'S02' then
        local ch=manifest.characters[state.character]
        style('actor', {backgroundImage=ch.image})
        text('character-name', ch.name); text('character-role', ch.role)
        for i=1,3 do style('portrait'..i..'-selected', {visible=state.character==i}) end
        for i=0,2 do style('stat-fill'..i, {width=ch.stats[i+1]}) end
        local skill=recipes[state.clip].skill
        style('attack', {visible=skill~=nil})
        if skill then
            style('slash',{visible=skill~=2}); style('flash',{visible=skill~=1})
            style('fragments',{visible=skill~=1}); style('ring',{visible=skill~=3})
        end
    elseif id == 'S03' then
        local ch=manifest.characters[state.character]
        style('actor',{backgroundImage=ch.image}); text('speaker',ch.name)
        text('auto-label',state.auto and '▷ AUTO ON' or '▷ AUTO')
        if state.clip ~= 'S03.type' then text('dialogue-text',recipes[state.clip].category=='entry' and '' or manifest.dialogue[state.line]) end
    elseif id == 'S05' then
        for i=1,3 do style('chapter'..i..'-selected',{visible=state.chapter==i}) end
    end
    style('modal', {visible=state.modal~=nil})
    if state.modal then
        text('modal-title',state.modal.title);text('modal-body',state.modal.body)
    end
    if state.idle and isReady and bridges[id].actor then
        local pose=players[state.clip]:Sample(state.time).actor or neutral
        local copy={};for k,v in pairs(pose) do copy[k]=v end
        copy.dy=copy.dy+idlePlayer:Sample(state.idleClock).actor.dy
        bridges[id].actor:Apply(copy)
    end
end
function Demo.Scene(id, entering)
    selectScene(id)
    state.line, state.auto, state.modal = 1, false, nil
    state.clip=definition(id).entry
    state.time=entering==false and recipes[state.clip].duration or 0
    state.playing, state.inspect = entering~=false, false
end
function Demo.Run(id)
    local recipe=assert(recipes[id], 'Unknown clip '..tostring(id))
    if recipe.category=='transition' then selectScene(recipe.source) end
    state.clip, state.time, state.playing, state.inspect = id, 0, true, false
    state.modal, state.autoClock = nil, 0
end
function Demo.Seek(seconds)
    state.time=math.max(0,math.min(recipes[state.clip].duration,seconds))
    state.playing, state.inspect, state.auto = false,true,false
end
function Demo.Ready()
    state.clip=definition(state.scene).entry
    state.time=recipes[state.clip].duration
    state.playing, state.inspect = false,false
end
local function modal(title,body,kind)
    state.modal={title=title,body=body,kind=kind or 'info'}
end
local function nextLine()
    if state.clip=='S03.type' and state.time<recipes[state.clip].duration then
        state.time=recipes[state.clip].duration;state.playing=false
    elseif state.line<#manifest.dialogue then
        state.line=state.line+1;Demo.Run('S03.type')
    else modal('旅程已准备就绪','同行者：'..manifest.characters[state.character].name..'\n向着灯塔出发吧。') end
end
function Demo.Activate(id)
    if not ready() then return false end
    if state.modal and not id:match('^modal%-') and not id:match('^setting%-') then return false end
    local number=id:match('(%d)$')
    if id=='modal-close' then state.modal=nil
    elseif id=='modal-action' then Demo.Run(definition(state.scene).entry)
    elseif id=='setting-motion' then state.idle=not state.idle
    elseif id=='setting-beacon' then state.beacon=not state.beacon
    elseif id:match('^menu%d$') then
        state.selected=tonumber(number)
        if number=='1' then Demo.Run('T01')
        elseif number=='2' then modal('旅程设置','即时切换灯塔光芒与角色待机动画。','settings')
        else modal('旅行档案','航海日志 / 第 01 站：灯塔港\n同行者：'..manifest.characters[state.character].name) end
    elseif id:match('^portrait%d$') then state.character=tonumber(number);Demo.Run('S02.select')
    elseif id:match('^skill%d$') then Demo.Run('S02.skill'..number)
    elseif id=='story' then Demo.Run('T02')
    elseif id=='continue' then nextLine()
    elseif id=='auto' then state.auto=not state.auto;state.autoClock=0
    elseif id=='skip' then state.line=#manifest.dialogue;Demo.Run('S03.type');state.time=recipes[state.clip].duration;state.playing=false
    elseif id=='back' then Demo.Scene(state.scene=='S05' and 'S04' or state.scene=='S03' and 'S02' or 'S01')
    elseif id=='theater1' then Demo.Run('T03')
    elseif id=='theater2' then modal('往日回顾','ACT 01 / 月光来信\n首演记录已收录。')
    elseif id=='theater3' then modal('剧院轶事','每一次谢幕，都是下一场魔术的开始。')
    elseif id=='rabbit-button' then Demo.Run('S04.rabbit')
    elseif id=='clapper' then Demo.Run('S04.clap')
    elseif id:match('^chapter%d$') then state.chapter=tonumber(number);Demo.Run(state.chapter==1 and 'S05.select' or 'S05.select'..state.chapter)
    elseif id=='chapter-enter' then modal('即将开演','ACT 0'..state.chapter..' / '..manifest.chapters[state.chapter])
    else return false end
    return true
end
function Demo.Update(dt)
    if not stage then return end
    dt=math.min(dt,.1)
    if not state.inspect then state.idleClock=state.idleClock+dt end
    local recipe=recipes[state.clip]
    if state.playing then
        state.time=math.min(recipe.duration,state.time+dt)
        if state.time>=recipe.duration then
            state.playing=false
            if not state.inspect then
                if recipe.category=='transition' then
                    Demo.Scene(recipe.target,false)
                    if state.scene=='S03' then Demo.Run('S03.type') end
                elseif state.scene=='S03' and recipe.category=='entry' then Demo.Run('S03.type') end
            end
        end
    end
    recipe=recipes[state.clip]
    overlay:SetStyle({visible=recipe.category=='transition'})
    if recipe.category=='transition' then
        -- Sampling chooses only the visual scene; Seek never advances host state or callbacks.
        local visual=state.time>=recipe.swapAt and recipe.target or recipe.source
        for id,widget in pairs(scenes) do widget:SetStyle({visible=id==visual}) end
        apply(visual,definition(visual).entry,30)
        if visual=='S02' or visual=='S03' then
            find('actor',visual):SetStyle({backgroundImage=manifest.characters[state.character].image})
        end
        local poses=players[state.clip]:Sample(state.time)
        for id,bridge in pairs(bridges.overlay) do bridge:Apply(poses[id] or neutral) end
        overlay:FindById('wipe'):SetStyle({visible=recipe.style=='slab'})
        overlay:FindById('transition-slash'):SetStyle({visible=recipe.style=='slash'})
        overlay:FindById('transition-cards'):SetStyle({visible=recipe.style=='cards'})
        for _,widget in pairs(scenes[visual]._showcaseButtons) do widget:SetStyle({disabled=true}) end
    else
        for id,widget in pairs(scenes) do widget:SetStyle({visible=id==state.scene}) end
        apply(state.scene,state.clip,state.time)
        refreshState()
    end
    if state.auto and state.scene=='S03' and not state.playing and not state.inspect and not state.modal then
        state.autoClock=state.autoClock+dt
        if state.autoClock>.85 then state.autoClock=0;nextLine() end
    end
    fit()
end
function Demo.Key(key)
    if key==KEY_ESCAPE then state.modal=nil;Demo.Ready()
    elseif key==KEY_R then Demo.Run(state.clip)
    elseif key==KEY_P then state.playing=not state.playing
    elseif key==KEY_LEFT then Demo.Seek(state.time-1/60)
    elseif key==KEY_RIGHT then Demo.Seek(state.time+1/60)
    elseif key==KEY_UP then state.selected=(state.selected+1)%3+1
    elseif key==KEY_DOWN then state.selected=state.selected%3+1
    elseif key==KEY_RETURN or key==KEY_SPACE then
        local actions={S01='menu'..state.selected,S02='story',S03='continue',S04='theater1',S05='chapter-enter'}
        Demo.Activate(actions[state.scene])
    elseif key==KEY_1 then Demo.Scene('S01')
    elseif key==KEY_2 then Demo.Scene('S02')
    elseif key==KEY_3 then Demo.Scene('S03')
    elseif key==KEY_4 then Demo.Scene('S04')
    elseif key==KEY_5 then Demo.Scene('S05') end
end
function Demo.GetState() return state end
function Demo.Init()
    idlePlayer = ClipPlayer.New(UiMotionRecipes.Idle())
    UI.Init({theme='default-dark',scale=UI.Scale.DEFAULT,fonts={
        {family='sans',weights={normal='Fonts/Menu-Black.ttf'}},
        {family='Fonts/SignalMenu-Title.ttf',weights={normal='Fonts/SignalMenu-Title.ttf'}},
        {family='Fonts/SignalMenu-Serif.ttf',weights={normal='Fonts/SignalMenu-Serif.ttf'}},
        {family='Fonts/Showcase-Serif.ttf',weights={normal='Fonts/Showcase-Serif.ttf'}},
    }})
    if not UI.NanoVG then NanoVG.register(UI) end
    manifest=read('ui/nanovg-showcase-v1/showcase.json')
    root=UI.Panel{width='100%',height='100%',backgroundColor='#061F23'}
    stage=UI.Panel{position='absolute',left=0,top=0,width=1280,height=720,overflow='hidden'}
    root:AddChild(stage);UI.SetRoot(root)
    for id,path in pairs(manifest.clips) do recipes[id]=read(path);players[id]=Motion.New(recipes[id]) end
    for _,sc in ipairs(manifest.scenes) do
        local instance=assert(UI.UILoader.LoadFromFile(sc.ui));local widget=assert(instance:GetRoot())
        scenes[sc.id]=widget;stage:AddChild(widget);bridges[sc.id]={};widget._showcaseButtons={}
        local ids={}
        for _,clipId in ipairs(sc.clips) do for _,def in ipairs(recipes[clipId].nodes) do ids[def.id]=true end end
        for id in pairs(ids) do bridges[sc.id][id]=Adapter.Bind(find(id,sc.id),{clip=false}) end
        local function bind(def)
            if def.type=='Button' then
                local id=def.id;local w=find(id,sc.id);widget._showcaseButtons[id]=w
                w.props.onClick=function() Demo.Activate(id) end
                if id:match('^menu%d$') then w.props.onPointerEnter=function() if ready() and not state.modal then state.selected=tonumber(id:sub(-1)) end end end
            end
            for _,child in ipairs(def.children or {}) do bind(child) end
        end
        bind(read(sc.ui))
    end
    overlay=assert(UI.UILoader.LoadFromFile(manifest.overlay)):GetRoot();stage:AddChild(overlay)
    overlay:SetStyle({zIndex=100,pointerEvents='auto'});bridges.overlay={}
    local overlayIds,clipped={},{}
    for _,transition in ipairs(manifest.transitions) do
        local recipe=recipes[transition.id]
        for _,node in ipairs(recipe.nodes) do overlayIds[node.id]=true end
        for _,track in ipairs(recipe.tracks) do
            if track.prop=='reveal' or track.prop=='revealY' then clipped[track.node]=true end
        end
    end
    for id in pairs(overlayIds) do
        bridges.overlay[id]=Adapter.Bind(assert(overlay:FindById(id)),{clip=clipped[id]==true})
    end
    Demo.Scene('S01');Demo.Update(0)
    print('[NanoVGShowcase] 5 editable scenes / 3 transitions / independent PNG assets')
end
function Demo.Shutdown()
    if idlePlayer then idlePlayer:Destroy();idlePlayer=nil end
    for _,player in pairs(players) do player:Destroy() end
    for _,list in pairs(bridges) do for _,bridge in pairs(list) do bridge:Destroy() end end
    UI.Shutdown();scenes,players,recipes,bridges={},{},{},{};root,stage,overlay=nil,nil,nil
end
return Demo
