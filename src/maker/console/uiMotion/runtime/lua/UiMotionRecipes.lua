local Recipes = {}
function Recipes.BuiltinCards()
    local recipe={duration=1,tracks={}}
    for index=0,4 do
        local node='card'..index
        recipe.tracks[#recipe.tracks+1]={node=node,prop='scale',from=.06,to=12.06,at=index*.035,duration=.4,ease='linear'}
        recipe.tracks[#recipe.tracks+1]={node=node,prop='rotation',from=-.5+index*.21,to=0,at=index*.035,duration=.4,ease='linear'}
    end
    return recipe
end
function Recipes.ImageScene(id) return require('ImageMotionRecipes').Scene(id) end
function Recipes.Typing()
    return {duration=49/30,tracks={{node='text',prop='progress',from=0,to=1,at=9/30,duration=13/30,ease='linear'}}}
end
function Recipes.Clap()
    return {duration=.46,tracks={
        {node='clapper',prop='angle',from=0,to=-18,at=0,duration=.46*.52,ease='linear'},
        {node='clapper',prop='angle',from=-18,to=0,at=.46*.52,duration=.46*.48,ease='linear'},
    }}
end
function Recipes.DialogueExit()
    return {duration=.22,tracks={{node='panel',prop='opacity',from=1,to=0,at=0,duration=.22,ease='inCubic'}}}
end
function Recipes.Transition(id)
    local recipe={duration=1,tracks={}}
    local function track(node,prop,from,to,at,duration,ease)
        recipe.tracks[#recipe.tracks+1]={node=node,prop=prop,from=from,to=to,at=at,duration=duration,ease=ease or 'linear'}
    end
    if id=='T01' then track('mask','x',2700,-3000,0,1)
    elseif id=='T02' then track('mask','breadth',0,2700,0,.5);track('mask','breadth',2700,0,.5,.5)
    else
        for index=1,10 do
            local node='card'..index;local at=(index-1)*.012;local angle=index*2.399
            track(node,'x',1024,1024+math.cos(angle)*530,at,.84)
            track(node,'y',576,576+math.sin(angle)*310,at,.84)
            track(node,'angle',(index-5)*.22,(index-5)*.22+1.8,at,.84)
            track(node,'zoom',.25,.25+.54*.54*22,at,.84*.54,'inQuad')
            track(node,'zoom',.25+.54*.54*22,0,at+.84*.54,.84*.46)
        end
        track('cover','width',120,4520,.3,.23);track('cover','width',4520,120,.53,.29)
        track('cover','height',180,6580,.3,.23);track('cover','height',6580,180,.53,.29)
    end
    return recipe
end
function Recipes.Idle()
    return {duration=86400,tracks={
        {node='actor',prop='dy',from=-2,to=2,at=0,duration=math.pi/1.7,ease='inOutSine',loops=50000,loopType='yoyo'},
        {node='beacon',prop='opacity',from=.3,to=.8,at=0,duration=math.pi/1.8,ease='inOutSine',loops=50000,loopType='yoyo'},
    }}
end
function Recipes.Skill()
    return {duration=.28,tracks={{node='actor',prop='scale',from=.96,to=1,at=0,duration=.28,ease='outBack'}}}
end
return Recipes
