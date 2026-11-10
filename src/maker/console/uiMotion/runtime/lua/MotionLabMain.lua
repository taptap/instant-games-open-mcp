-- Native host uses the same approved 2048 x 1152 layout and component states.
local Lab=require('MotionLab')
local Catalog=require('MotionLabCatalog')
local ctx,scale,ox,oy=nil,1,0,0
local skins,skinIndex
local function layout()
 local w,h=graphics:GetWidth(),graphics:GetHeight();scale=math.min(w/2048,h/1152);ox=(w-2048*scale)/2;oy=(h-1152*scale)/2;return w,h
end
function Start()
 graphics.windowTitle='Motion Lab / 7 UI styles';input.mouseVisible=true;input.mouseMode=MM_ABSOLUTE
 ctx=nvgCreate(1);assert(ctx,'Motion Lab: nvgCreate failed');Lab.Init(ctx,Catalog);skins=Lab.GetSkins();skinIndex=1;Lab.SetSkin(skins[1].id)
 SubscribeToEvent(ctx,'NanoVGRender','MotionLabRender');SubscribeToEvent('Update','MotionLabUpdate')
 SubscribeToEvent('MouseButtonDown','MotionLabClick');SubscribeToEvent('TouchBegin','MotionLabTouch');SubscribeToEvent('KeyDown','MotionLabKey');SubscribeToEvent('MouseWheel','MotionLabWheel')
 print('Motion Lab ready: 7 approved layouts / 43 effects / landscape')
end
function MotionLabUpdate(_,data)
 Lab.Update(data['TimeStep']:GetFloat())
 local p=input:GetMousePosition();local x,y=(p.x-ox)/scale,(p.y-oy)/scale;local hovered
 for _,b in ipairs(Lab.GetControls()) do if x>=b.x and x<=b.x+b.w and y>=b.y and y<=b.y+b.h then hovered=b.id end end;Lab.Hover(hovered)
end
function MotionLabRender()
 local w,h=layout();nvgBeginFrame(ctx,w,h,1);nvgSave(ctx);nvgTranslate(ctx,ox,oy);nvgScale(ctx,scale,scale);Lab.Draw(ctx,2048,1152);nvgRestore(ctx);nvgEndFrame(ctx)
end
local function click(px,py)
 local x,y=(px-ox)/scale,(py-oy)/scale
 for _,b in ipairs(Lab.GetControls()) do if (b.id=='shell:back' or b.id=='shell:close') and x>=b.x and x<=b.x+b.w and y>=b.y and y<=b.y+b.h then Lab.Home();return end end
 Lab.HandleClick(x,y)
end
function MotionLabClick(_,data) if data['Button']:GetInt()==MOUSEB_LEFT then local p=input:GetMousePosition();click(p.x,p.y) end end
function MotionLabTouch(_,data) click(data['X']:GetInt(),data['Y']:GetInt()) end
function MotionLabWheel(_,data) local p=input:GetMousePosition();if (p.x-ox)/scale>1510 then Lab.Scroll(-data['Wheel']:GetInt()*70) end end
function MotionLabKey(_,data)
 local key=data['Key']:GetInt()
 if key==KEY_R then Lab.Replay() elseif key==KEY_H then Lab.Home() elseif key==KEY_SPACE then Lab.ToggleSequence() elseif key==KEY_TAB then skinIndex=skinIndex%#skins+1;Lab.SetSkin(skins[skinIndex].id) elseif key==KEY_DOWN then Lab.Scroll(70) elseif key==KEY_UP then Lab.Scroll(-70) end
end
function Stop() Lab.Destroy();UnsubscribeFromAllEvents();if ctx then nvgDelete(ctx);ctx=nil end end
