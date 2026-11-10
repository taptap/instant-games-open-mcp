local LuaTween = require('LuaTween')
local Recipes = {}

function Recipes.New(id, nodes, selectedCard)
    local sequence = LuaTween.Sequence():Pause()
    local poses, particles, rings, strips, radial, fragments = {}, {}, {}, {}, {}, {}
    local overlay = {reveal=1,count=0,shine=0,focusX=0,focusY=0,alpha=0,scale=1,sideX=1510,toastY=0,bannerX=0,radius=1900,cover=0}
    local function add(tween, at)
        tween:Goto(0)
        sequence:Join(LuaTween.Sequence():AppendInterval(at or 0):Append(tween))
        return tween
    end
    local function to(subject, prop, from, destination, duration, ease, at)
        local holder = {value=from}
        local tween = LuaTween.Value(function() return holder.value end, function(value)
            holder.value=value
        end, destination, duration, ease or 'outCubic')
        add(tween, at)
        return {subject=subject,prop=prop,holder=holder,at=at or 0,initial=from}, tween
    end
    local channels = {}
    local function channel(subject, prop, from, destination, duration, ease, at)
        local entry,tween=to(subject,prop,from,destination,duration,ease,at)
        channels[#channels+1]=entry
        if subject[prop]==nil then subject[prop]=from end
        return tween
    end
    local function center(name)
        local box=assert(nodes[name],name).box
        return (box[1]+box[3])/2,(box[2]+box[4])/2
    end
    for name,node in pairs(nodes) do
        local pose={sx=1,sy=1,dx=0,dy=0,alpha=1,angle=0}
        poses[name]=pose
        local group=node.group
        if id=='main' and group~='directory' and group~='decoration' and not name:match('^header') and name~='home' and name~='replay' then
            local delay=({list=.12,modal=.2,items=.27,dialogue=.34,reward=.4})[group] or 0
            channel(pose,'alpha',0,1,.5,'linear',delay)
            channel(pose,'dy',36,0,.5,'outCubic',delay)
            channel(pose,'sx',.96,1,.5,'outBack',delay);channel(pose,'sy',.96,1,.5,'outBack',delay)
        end
        if name=='primary' then
            if id=='cta' or id=='button-feedback-1' then
                channel(pose,'sx',1,.9,.15,'outSine');channel(pose,'sx',.9,1,.15,'inSine',.15)
                channel(pose,'sy',1,.84,.15,'outSine');channel(pose,'sy',.84,1,.15,'inSine',.15)
            elseif id=='button-feedback-2' then
                channel(pose,'sy',1,1.15,.12,'outSine');channel(pose,'sy',1.15,1,.5,'outElastic',.12)
            elseif id=='button-feedback-3' or id=='button-feedback-6' then
                local amplitude=id=='button-feedback-3' and .04 or .12
                for step=0,7 do
                    local from=step==0 and 0 or amplitude*(1-(step-1)/8)*(step%2==0 and -1 or 1)
                    local target=step==7 and 0 or amplitude*(1-step/8)*(step%2==0 and 1 or -1)
                    channel(pose,'angle',from,target,.0775,'inOutSine',step*.0775)
                end
            end
        elseif group=='list' then
            if id=='list' then channel(pose,'alpha',0,1,.22,'linear');channel(pose,'dx',-40,0,.35)
            elseif id=='magnetList' and name:match('^task') then channel(pose,'dx',200,0,.5,'outBack',(tonumber(name:match('%d'))-1)*.12) end
        elseif group=='modal' then
            if id=='dialog' then channel(pose,'alpha',0,1,.22,'linear');channel(pose,'dy',28,0,.34)
            elseif id=='panelFlip' then channel(pose,'sx',1,.025,.41,'inSine',.12);channel(pose,'sx',.025,1,.41,'outSine',.53)
            elseif id=='shatterPanel' or id=='pixelDissolve' then channel(pose,'alpha',0,1,.12,'linear');channel(pose,'alpha',1,0,.001,'linear',.3) end
        elseif group=='items' and name:match('^card') then
            local index=tonumber(name:match('%d'))
            if id=='cards' then channel(pose,'alpha',0,1,.38,'linear',(index-1)*.08);channel(pose,'dy',60,0,.38,'outBack',(index-1)*.08)
            elseif id=='flipCards' then channel(pose,'sx',1,.025,.275,'inSine',.22+(index-1)*.28);channel(pose,'sx',.025,1,.275,'outSine',.495+(index-1)*.28)
            elseif id=='magnetDrag' and index==selectedCard then channel(pose,'dx',-200,0,.9);channel(pose,'dy',100,0,.9) end
        elseif group=='dialogue' then
            if id=='bubble' then channel(pose,'alpha',0,1,.2,'linear');channel(pose,'sx',.8,1,.32,'outBack');channel(pose,'sy',.8,1,.32,'outBack')
            elseif id=='portrait' and name=='portrait' then channel(pose,'dx',-120,0,.36,'outBack');channel(pose,'alpha',0,1,.22,'linear') end
        elseif group=='reward' then
            if id=='reward' or id=='rewardBurst' then channel(pose,'sx',.7,1,.45,'outBack');channel(pose,'sy',.7,1,.45,'outBack');channel(pose,'alpha',0,1,.24,'linear')
            elseif id=='elasticPull' then channel(pose,'dy',0,-100,.5);channel(pose,'dy',-100,0,.68,'outBack',.5)
            elseif id=='rewardBox' then
                for step=0,5 do channel(pose,'dx',step==0 and 0 or (step%2==0 and -6 or 6),step==5 and 0 or (step%2==0 and 6 or -6),.07,'inOutSine',step*.07) end
                channel(pose,'sx',1,1.04,.21,'outSine');channel(pose,'sx',1.04,1,.21,'inSine',.21)
                channel(pose,'sy',1,1.04,.21,'outSine');channel(pose,'sy',1.04,1,.21,'inSine',.21)
            end
        end
    end
    if id=='maskSweep' then channel(overlay,'reveal',0,1,1.15) end
    if id=='scoreRoll' then channel(overlay,'count',0,500,1.1) end
    if id=='button-feedback-5' then channel(overlay,'shine',0,1,.62,'linear') end
    if id=='shatterPanel' or id=='pixelDissolve' then
        for column=0,6 do for row=0,4 do
            local fragment={column=column,row=row,dx=0,dy=0,alpha=1}
            fragments[#fragments+1]=fragment
            channel(fragment,'dx',0,(column-3)*65,.85,'linear',.3)
            channel(fragment,'dy',0,(row-2)*(id=='pixelDissolve' and 90 or 140),.85,'linear',.3)
            channel(fragment,'alpha',1,0,.85,'linear',.3)
        end end
    end
    if id=='spotlight' or id=='focusLens' then
        local bx,by=center('primary');local cx,cy=center('card-'..selectedCard)
        channel(overlay,'focusX',bx,cx,1.55);channel(overlay,'focusY',by,cy,1.55)
    end
    if id=='modal' then channel(overlay,'alpha',0,.6,.2,'linear');channel(overlay,'scale',1,1.55,.28,'outBack') end
    if id=='sideList' then channel(overlay,'sideX',1510,1020,.42,'outBack') end
    if id=='radialMenu' then
        for index=1,6 do
            local angle=index*math.pi/3;local point={x=760,y=640};radial[index]=point
            channel(point,'x',760,760+math.cos(angle)*240,.42,'outBack',(index-1)*.055)
            channel(point,'y',640,640+math.sin(angle)*190,.42,'outBack',(index-1)*.055)
        end
    end
    if id=='toast' then channel(overlay,'toastY',-120,0,.28);channel(overlay,'toastY',0,-120,.36,'outCubic',2.2) end
    if id=='banner' then channel(overlay,'bannerX',500,0,.32);channel(overlay,'bannerX',0,-1700,.28,'outCubic',1.8) end
    if id=='circle' or id=='star' then channel(overlay,'radius',1900,0,.32);channel(overlay,'radius',0,1900,.36,'outCubic',.32) end
    if id=='transition' then channel(overlay,'cover',0,1,.32);channel(overlay,'cover',1,0,.36,'outCubic',.32) end
    if id=='particleWipe' then
        for index=0,9 do local strip={value=0};strips[index+1]=strip;channel(strip,'value',0,1,.47,'outCubic',index*.025);channel(strip,'value',1,0,.45,'outCubic',.7+index*.025) end
    end
    if id=='ripple' or id=='buttonBlast' or id=='button-feedback-4' then
        for index=0,2 do local ring={radius=35,alpha=1};rings[index+1]=ring;channel(ring,'radius',35,210,.65,'linear',index*.13);channel(ring,'alpha',1,0,.65,'linear',index*.13) end
    end
    if ({rewardBurst=true,rewardBox=true,arcFly=true,buttonField=true,['button-feedback-7']=true,buttonBlast=true,magnetDock=true,scatterMagnet=true})[id] then
        local bx,by=center('primary');local rx,ry=center('reward');local tx,ty=center('toast')
        for index=1,18 do
            local angle=index*2.4;local points={}
            for step=0,48 do
                local progress=step/48;local x,y
                if id=='rewardBurst' or id=='rewardBox' or id=='arcFly' then
                    x=rx+math.cos(angle)*180*math.sin(progress*math.pi)+(tx-rx)*progress;y=ry+(ty-ry)*progress-180*math.sin(progress*math.pi)
                elseif id=='buttonField' or id=='button-feedback-7' then
                    x=bx+math.cos(angle+progress*5)*110*(1-progress);y=by+math.sin(angle+progress*5)*70*(1-progress)
                elseif id=='buttonBlast' then x=bx+math.cos(angle)*230*progress;y=by+math.sin(angle)*150*progress
                else x=rx+math.cos(angle)*500*(1-progress);y=ry+math.sin(angle)*350*(1-progress) end
                points[#points+1]={x=x,y=y}
            end
            local particle={position={x=points[1].x,y=points[1].y},alpha=1,at=index*.025}
            particles[index]=particle
            add(LuaTween.Path(particle,'position',points,1.1,{ease=(id=='buttonBlast' or id=='magnetDock' or id=='scatterMagnet') and 'outCubic' or 'linear'}),particle.at)
            channel(particle,'alpha',1,0,1.1,'linear',particle.at)
        end
    end
    local recipe={poses=poses,overlay=overlay,particles=particles,rings=rings,strips=strips,radial=radial,fragments=fragments}
    function recipe:Sample(seconds)
        sequence:Goto(math.max(0,seconds))
        local assigned={}
        for _,entry in ipairs(channels) do
            assigned[entry.subject]=assigned[entry.subject] or {}
            if not assigned[entry.subject][entry.prop] then entry.subject[entry.prop]=entry.initial;assigned[entry.subject][entry.prop]=true end
            if seconds>=entry.at then entry.subject[entry.prop]=entry.holder.value end
        end
        return self
    end
    function recipe:Destroy() sequence:Kill() end
    recipe:Sample(0)
    return recipe
end
return Recipes
