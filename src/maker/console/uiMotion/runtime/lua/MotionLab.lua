-- Shared catalog clock and interactions for the browser and native NanoVG host.
local Components = require('MotionLabComponents')
local Demo = {}
local catalog,selected,category,elapsed,inspecting = nil,nil,nil,0,false
local sequenceIndex,sequenceTimer,controls = 0,0,{}
local function Find(id)
 for _,group in ipairs(catalog.categories) do for _,item in ipairs(group.items) do
  if item.id==id then return item,group.id end
 end end
end
function Demo.Select(id,keepSequence)
 local item,group=Find(id);if not item then return false end
 selected,category,elapsed,inspecting=item,group,0,false
 if not keepSequence then sequenceIndex=0;sequenceTimer=0 end
 Components.Reset(id);controls={};return true
end
function Demo.Init(ctx,data)
 catalog=data;Components.Init(ctx,data);Demo.Select('dialog')
end
function Demo.SetCategory(id)
 for _,group in ipairs(catalog.categories) do if group.id==id then return Demo.Select(group.items[1].id) end end
 return false
end
function Demo.Replay() return Demo.Select(selected.id) end
function Demo.Home() return Demo.Select('main') end
function Demo.ToggleSequence()
 if sequenceIndex>0 then sequenceIndex=0;return end
 sequenceIndex=1;sequenceTimer=0;Demo.Select(catalog.sequence[1],true)
end
function Demo.Update(dt)
 if inspecting then return end
 dt=math.max(0,math.min(dt,.1));elapsed=elapsed+dt;Components.Update(dt,selected.id,elapsed)
 if sequenceIndex>0 then
  sequenceTimer=sequenceTimer+dt
  local hold=math.max(selected.autoHold or selected.duration,1.25)
  if sequenceTimer>=hold+.35 then
   sequenceIndex=sequenceIndex+1;sequenceTimer=0
   if sequenceIndex>#catalog.sequence then Demo.Home() else Demo.Select(catalog.sequence[sequenceIndex],true) end
  end
 end
end
function Demo.Seek(seconds)
 local id=selected.id;Demo.Select(id);elapsed=math.max(0,math.min(seconds,selected.duration));inspecting=true
end
function Demo.SetSkin(id)
 if not Components.SetSkin(id) then return false end
 Demo.Select(selected.id);return true
end
function Demo.GetSkins() return Components.skins end
function Demo.GetState()
 return {id=selected.id,category=category,elapsed=math.min(elapsed,selected.duration),duration=selected.duration,
  inspecting=inspecting,sequencing=sequenceIndex>0,sequenceIndex=sequenceIndex,sequenceCount=#catalog.sequence,ui=Components.GetState()}
end
function Demo.Draw(ctx,w,h)
 controls=Components.Draw(ctx,w,h,{id=selected.id,category=category,elapsed=elapsed,duration=selected.duration,sequencing=sequenceIndex>0,sequenceIndex=sequenceIndex})
end
function Demo.Scroll(delta) Components.Scroll(delta) end
function Demo.Destroy() Components.Destroy() end
function Demo.Hover(id) Components.Hover(id) end
function Demo.GetControls() return controls end
function Demo.Activate(id)
 local valid=false;for _,b in ipairs(controls) do if b.id==id then valid=true;break end end
 if not valid then return false end
 if id:match('^shell:') then
  if id=='shell:replay' then return Demo.Replay()
  elseif id=='shell:home' then return Demo.Home()
  elseif id=='shell:sequence' then Demo.ToggleSequence();return true
  elseif id:match('^shell:effect:') then return Demo.Select(id:sub(14))
  elseif id:match('^shell:category:') then
   local group=catalog.categories[tonumber(id:sub(16))];return group and Demo.SetCategory(group.id) or false
  end
  return false
 end
 sequenceIndex=0;inspecting=false
 local nextEffect=Components.Activate(id,selected.id)
 if nextEffect then Demo.Select(nextEffect) end
 return true
end
function Demo.HandleClick(x,y)
 for n=#controls,1,-1 do local b=controls[n]
  if x>=b.x and x<=b.x+b.w and y>=b.y and y<=b.y+b.h then return Demo.Activate(b.id) end
 end
 return false
end
return Demo
