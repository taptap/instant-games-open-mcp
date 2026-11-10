-- Independent native-size layers for seven neutral UI styles.
local Designs=require('MotionLabDesign')
local Recipes=require('MotionLabRecipes')
local LuaTween=require('LuaTween')
local recipe
local UI={skins={}}
local designs={}
for _,d in ipairs(Designs) do
 designs[d.id]=d
 UI.skins[#UI.skins+1]={id=d.id,name=d.name,hot=d.hot,ink=d.ink,font='lab-'..d.font}
end
local ctx,theme,images,nodes,controls,catalog=nil,Designs[1],{},{},{},nil
local elapsed,effect,duration,state=0,'dialog',1,nil
local task,card,tab,dialogue,claimed,modal,auto=1,2,1,1,false,true,true
local notice,noticeTime,feedback,hover,scroll,ensureVisible='',0,nil,nil,0,true
local lines={'点击查看下一条信息。','当前设置已保存。','点选卡片，切换选中状态。'}
local tabLabels={'选项一','选项二','选项三'}
local function clamp(x) return math.max(0,math.min(1,x)) end

local function color(hex,a) return nvgRGBA(tonumber(hex:sub(2,3),16),tonumber(hex:sub(4,5),16),tonumber(hex:sub(6,7),16),math.floor(255*clamp(a or 1))) end
local function box(n) local b=n.box;return b[1],b[2],b[3]-b[1],b[4]-b[2] end
local function center(n) local x,y,w,h=box(n);return x+w/2,y+h/2 end
local function rect(x,y,w,h,c,a) nvgBeginPath(ctx);nvgRect(ctx,x,y,w,h);nvgFillColor(ctx,color(c,a));nvgFill(ctx) end
local function text(x,y,s,size,c,align)
 nvgFontFace(ctx,'lab-'..theme.font);nvgFontSize(ctx,size);nvgTextAlign(ctx,(align or NVG_ALIGN_LEFT)+NVG_ALIGN_MIDDLE);nvgFillColor(ctx,color(c or theme.ink));nvgText(ctx,x,y,s,nil)
end
local function picture(path,x,y,w,h,a)
 local image=images[path];if not image then image=nvgCreateImage(ctx,path,0);assert(image and image~=0,'Missing UI layer: '..path);images[path]=image end
 nvgBeginPath(ctx);nvgRect(ctx,x,y,w,h);nvgFillPaint(ctx,nvgImagePattern(ctx,x,y,w,h,0,image,a or 1));nvgFill(ctx)
end
local function art(n,path) local x,y,w,h=box(n);picture(path or n.path,x,y,w,h) end
local function caption(n,value,align)
 local x,y,w,h=box(n);local c=n.caption or {};local count=0
 for i=1,#value do local byte=value:byte(i);if byte<128 or byte>=192 then count=count+1 end end
 local size=math.min(c.size or 29,(c.width or w*.72)/math.max(1,count))
 text(x+(c.x or w/2),y+(c.y or h/2),value,size,c.color,align or NVG_ALIGN_CENTER)
end
local function variant(n,name) return n.path:gsub('%.png$','-'..name..'.png') end
local function ring(n,a)
 local name=n.name or '';local kind=name:match('^card') and 'card' or name:match('^task') and 'task' or name:match('^tab') and 'tab' or name:match('^category') and 'category' or name=='primary' and 'primary' or 'entry'
 local x,y,w,h=box(n);nvgSave(ctx);nvgGlobalAlpha(ctx,a);picture('ui/motion-lab-v2/'..theme.id..'/focus-'..kind..'.png',x,y,w,h);nvgRestore(ctx)
end
local function hit(n)
 if n.control then local x,y,w,h=box(n);controls[#controls+1]={id=n.control,label=n.label or n.control,x=x,y=y,w=w,h=h} end
end
local function index()
 nodes={};local function visit(n) nodes[n.name]=n;for _,c in ipairs(n.children) do visit(c) end end
 for _,n in ipairs(theme.nodes) do visit(n) end;task,card=theme.task,theme.card
end
function UI.Init(context,data)
 ctx,catalog=context,data
 for _,f in ipairs({'serif','bold'}) do assert(nvgCreateFont(ctx,'lab-'..f,'ui/motion-lab-v1/fonts/'..(f=='serif' and 'Serif' or 'Bold')..'.ttf')~=-1,'Motion Lab font failed') end
 index()
end
function UI.SetSkin(id)
 if not designs[id] then return false end
 if feedback then feedback.tween:Kill() end
 for _,image in pairs(images) do nvgDeleteImage(ctx,image) end;images={}
 theme=designs[id];index()
 tab,dialogue,claimed,modal,auto=1,1,false,true,true;notice,noticeTime,feedback,hover,scroll='',0,nil,nil,0;return true
end
function UI.Reset(id)
 if recipe then recipe:Destroy() end
 if feedback then feedback.tween:Kill() end
 recipe=Recipes.New(id,nodes,card)
 modal=true;feedback=nil;noticeTime=0;scroll=0;ensureVisible=true;if id=='reward' then claimed=false end
end
function UI.Destroy()
 if recipe then recipe:Destroy();recipe=nil end
 if feedback then feedback.tween:Kill();feedback=nil end
end
function UI.Update(dt,id,t)
 effect,elapsed=id,t;noticeTime=math.max(0,noticeTime-dt)
 if feedback then feedback.t=feedback.t+dt;feedback.tween:Goto(feedback.t);if feedback.t>.55 then feedback.tween:Kill();feedback=nil end end
 if auto and effect=='reward' and t>.7 and not claimed then claimed=true;notice='奖励已领取';noticeTime=1.6 end
end
function UI.Hover(id) hover=id end
function UI.Scroll(delta)
 if not state then return end;local category
 for _,c in ipairs(catalog.categories) do if c.id==state.category then category=c end end
 local _,_,_,h=box(nodes.directory);local _,_,_,row=box(nodes['entry-1']);local content=category.id=='popup' and nodes['entry-6'].box[4]-nodes['entry-1'].box[2] or #category.items*row
 scroll=math.max(0,math.min(math.max(0,content-h),scroll+delta))
end
function UI.GetState() return {skin=theme.id,task=task,card=card,tab=tab,claimed=claimed,modalVisible=modal,dialogue=dialogue,autoClaim=auto} end
function UI.Activate(key,id)
 if feedback then feedback.tween:Kill() end
 key=key:gsub('^ui:','');feedback={key='ui:'..key,t=0,pose={alpha=1}}
 feedback.tween=LuaTween.To(feedback.pose,{alpha=0},.55,'linear'):Pause()
 feedback.tween:Goto(0)
 if key:match('^tab:') then tab=tonumber(key:sub(5));notice='分类已切换';noticeTime=1.3
 elseif key:match('^task:') then task=tonumber(key:sub(6))
 elseif key:match('^card:') then card=tonumber(key:sub(6));notice='已选中';noticeTime=1.3
 elseif key=='confirm' then modal=false;notice='操作已确认';noticeTime=1.6
 elseif key=='cancel' then modal=false
 elseif key=='secondary' or key=='outline' then modal=true;return 'dialog'
 elseif key=='claim' then if not claimed then claimed=true;notice='奖励已领取';noticeTime=1.6;return 'rewardBurst' end
 elseif key=='auto' then auto=not auto
 elseif key=='dialogue' then dialogue=dialogue%#lines+1
 elseif key=='toast' then return 'toast'
 elseif key=='banner' then return 'banner'
 elseif key=='settings' then notice='点击右侧目录切换动效';noticeTime=2
 elseif key:match('^prize:') then notice='奖励详情 · '..key:sub(7);noticeTime=1.5
 elseif key=='close-overlay' then return 'dialog'
 elseif key:match('^radial:') then notice='已选择快捷项 '..key:sub(8);noticeTime=1.5;return 'dialog'
 elseif key=='feedback' then if id:match('^button%-feedback%-') or id=='cta' or id=='ripple' or id=='buttonBlast' or id=='buttonField' then return id end;return 'button-feedback-1' end
end
local function transform(n,nested)
 if nested and not (effect=='magnetList' and n.name:match('^task') or effect=='portrait' and n.name=='portrait') then return 1,1,0,0,1,0 end
 local pose=recipe.poses[n.name]
 return pose.sx,pose.sy,pose.dx,pose.dy,pose.alpha,pose.angle
end
local function drawNode(n,interactive,nested,parentAlpha)
 if n.name=='modal' and not modal then return end
 if n.name=='badge' then
  local base=nodes['card-'..theme.card];local current=nodes['card-'..card];local bx,by=center(base);local cx,cy=center(current)
  local sx,sy,dx,dy,a,angle=transform(current)
  nvgSave(ctx);nvgTranslate(ctx,cx+dx,cy+dy);nvgScale(ctx,sx,sy);nvgRotate(ctx,angle);nvgTranslate(ctx,-bx,-by);nvgGlobalAlpha(ctx,a);art(n);nvgRestore(ctx);return
 end
 local sx,sy,dx,dy,a,angle=transform(n,nested);a=a*(parentAlpha or 1);if a<=0 then return end
 local cx,cy=center(n);nvgSave(ctx);nvgTranslate(ctx,cx+dx,cy+dy);nvgRotate(ctx,angle);nvgScale(ctx,sx,sy);nvgTranslate(ctx,-cx,-cy);nvgGlobalAlpha(ctx,a)
 local active=interactive and a>.98 and math.abs(dx)<1 and math.abs(dy)<1 and math.abs(sx-1)<.01 and math.abs(sy-1)<.01
 if n.name=='modal' and effect=='maskSweep' then local x,y,w,h=box(n);nvgScissor(ctx,x,y,w*recipe.overlay.reveal,h);active=active and elapsed>1.15 end
 local number=tonumber(n.name:match('%-(%d+)$'))
 local isTab=n.name:match('^tab%-[123]$')~=nil
 local isTask=n.name:match('^task%-[123]$')~=nil
 local isSelectedTab=isTab and number==tab
 local isSelectedTask=isTask and number==task
 local needsActiveVariant=isSelectedTab and number~=1
 local off=n.name:match('^card%-') and number==theme.card and card~=theme.card or n.name=='tab-1' and tab~=1
 local cardBack=n.name:match('^card%-') and effect=='flipCards' and elapsed<.495+(number-1)*.28
 local panelBack=n.name=='modal' and effect=='panelFlip' and elapsed<.53
 if cardBack or panelBack then art(n,variant(n,'blank'))
 elseif n.name=='dialogue-text' and dialogue~=1 then
  caption(n,lines[dialogue],NVG_ALIGN_LEFT)
 elseif n.name=='claim' and claimed then art(n,variant(n,'blank'));caption(n,'已领取')
 elseif n.name=='auto' and not auto then art(n,variant(n,'off'))
 elseif n.name=='prize-1' and effect=='scoreRoll' and elapsed<1.85 then art(n,variant(n,'count'));caption(n,tostring(math.floor(recipe.overlay.count)))
elseif isTask and ({['teal-gold']=1,['neon-ink']=1,['pastel-round']=1,['paper-stitch']=1,['brass-frame']=1,['tech-cut']=1,['ribbon-gold']=1})[theme.id] then
  local x,y,w,h=box(n);local selected=number==task
  picture('ui/motion-lab-v2/'..theme.id..(selected and '/task-row-selected.png' or '/task-row.png'),x,y,w,h)
elseif isTab and ({['teal-gold']=1,['neon-ink']=1,['pastel-round']=1,['paper-stitch']=1,['brass-frame']=1,['tech-cut']=1,['ribbon-gold']=1})[theme.id] then
  local x,y,w,h=box(n);local selected=number==tab
  local basePath=(n.name=='tab-1' and tab~=1) and variant(n,'off') or n.path
  if selected and number>1 then
   -- The selected plate is text-free, so the label is rendered exactly once.
   local selectedInk={
    ['teal-gold']='#f2eedb',['neon-ink']='#1a1a1a',['pastel-round']='#fffdf7',
    ['paper-stitch']='#f2eedb',['brass-frame']='#f3e6c4',['tech-cut']='#f6e7cf',['ribbon-gold']='#f6e7cf'
   }
   picture('ui/motion-lab-v2/'..theme.id..'/tab-plate-selected.png',x,y,w,h)
   text(x+w/2,y+h*.52,tabLabels[number],31,selectedInk[theme.id],NVG_ALIGN_CENTER)
  else
   picture(selected and variant(n,'active') or basePath,x,y,w,h)
  end
  if active and n.control then controls[#controls+1]={id=n.control,label=n.label or n.control,x=x,y=y,w=w,h=h} end
 else art(n,(needsActiveVariant and theme.id~='paper-stitch') and variant(n,'active') or ((off or (isTask and theme.id~='neon-ink' and number==theme.task and task~=number)) and variant(n,'off') or nil)) end
 if n.name:match('^card%-') and number==card and number~=theme.card then ring(n,1) end

 if n.name=='primary' and effect=='button-feedback-5' and elapsed<.62 then local x,y,w,h=box(n);nvgSave(ctx);nvgScissor(ctx,x,y,w,h);rect(x-40+recipe.overlay.shine*(w+80),y,32,h,'#ffffff',.4);nvgRestore(ctx) end
 if active and not (isTab and ({['teal-gold']=1,['neon-ink']=1,['pastel-round']=1,['paper-stitch']=1,['brass-frame']=1,['tech-cut']=1,['ribbon-gold']=1})[theme.id]) then hit(n) end;if not panelBack then for _,child in ipairs(n.children) do drawNode(child,active,true,a) end end;nvgRestore(ctx)
end
local function directory()
 local category,catIndex;for i,c in ipairs(catalog.categories) do if c.id==state.category then category,catIndex=c,i end end
 for i=1,6 do local n=nodes['category-'..i];art(n,i==2 and catIndex~=2 and variant(n,'off') or nil);if i==catIndex and i~=2 then ring(n,1) end;hit(n) end
 art(nodes.directory);local heading=nodes['directory-heading']
 if heading then if catIndex==2 then art(heading) else local x,y,w,h=box(heading);text(x,y+h/2,category.title..'  · '..category.count..' 项',29) end end
 local x,y,w,h=box(nodes.directory);local row=nodes['entry-1'];local rx,ry,rw,rh=box(row)
 if ensureVisible then
  ensureVisible=false
  if catIndex~=2 then for i,item in ipairs(category.items) do if item.id==state.id then scroll=math.max(0,i*rh-h) end end end
 end
 nvgSave(ctx);nvgScissor(ctx,x,y,w,h)
 for i,item in ipairs(category.items) do
  local yy=ry+(i-1)*rh-scroll
  if yy+rh>y and yy<y+h then
   local original=catIndex==2 and nodes['entry-'..i] or nil;local selected=item.id==state.id
   local path=original and original.path or variant(row,'blank');if original and i==4 and not selected then path=variant(original,'off') end
   local ox,oy,ow,oh=rx,yy,rw,rh;if original then ox,oy,ow,oh=box(original);oy=oy-scroll end
   picture(path,ox,oy,ow,oh)
   if not original then local c=row.caption or {};text(ox+ow*.10,oy+oh/2,item.title,c.size or 28,c.color);text(ox+ow-30,oy+oh/2,'›',34,c.color,NVG_ALIGN_CENTER) end
   if selected and not (original and i==4) then ring({box={ox+4,oy+4,ox+ow-4,oy+oh-4}},1) end
   controls[#controls+1]={id='shell:effect:'..item.id,label=item.title,x=ox,y=math.max(y,oy),w=ow,h=math.min(y+h,oy+oh)-math.max(y,oy)}
  end
 end;nvgRestore(ctx)
 local content=catIndex==2 and nodes['entry-6'].box[4]-row.box[2] or #category.items*rh
 if content>h then local length=h*h/content;rect(x+w-5,y+(h-length)*scroll/(content-h),3,length,theme.hot,.7) end
end
local function particles()
 for index,particle in ipairs(recipe.particles) do
  if elapsed>particle.at and particle.alpha>0 then
   nvgSave(ctx);nvgGlobalAlpha(ctx,particle.alpha);picture(nodes['prize-'..(index%3+1)].path,particle.position.x-18,particle.position.y-18,36,36);nvgRestore(ctx)
  end
 end
end
local function transition()
 local x,y,w,h=20,190,1480,912;local t=elapsed;nvgSave(ctx);nvgScissor(ctx,x,y,w,h)
 if effect=='circle' or effect=='star' then if t<.68 then
  local r=recipe.overlay.radius;nvgBeginPath(ctx);nvgRect(ctx,x,y,w,h)
  if effect=='circle' then nvgCircle(ctx,x+w/2,y+h/2,r) else for i=0,9 do local ang=-math.pi/2+i*math.pi/5;local rr=i%2==0 and r or r*.5;local px,py=x+w/2+math.cos(ang)*rr,y+h/2+math.sin(ang)*rr;if i==0 then nvgMoveTo(ctx,px,py) else nvgLineTo(ctx,px,py) end end;nvgClosePath(ctx) end
  nvgPathWinding(ctx,NVG_HOLE);nvgFillColor(ctx,color(theme.hot));nvgFill(ctx)
 end
 elseif effect=='transition' and t<.68 then local p=recipe.overlay.cover;rect(x,y,w/2,h*p,theme.hot);rect(x+w/2,y+h*(1-p),w/2,h*p,theme.hot)
 elseif effect=='particleWipe' and t<1.45 then for i=0,9 do local v=recipe.strips[i+1].value;if v>0 then rect(x+i*w/10,i%2==0 and y or y+h-h*v,w/10+1,h*v,theme.hot) end end end;nvgRestore(ctx)
end
local function overlays()
 local t=elapsed
 if effect=='button-feedback-4' or effect=='ripple' or effect=='buttonBlast' then local x,y=center(nodes.primary);for i,ring in ipairs(recipe.rings) do if t>(i-1)*.13 and ring.alpha>0 then nvgBeginPath(ctx);nvgCircle(ctx,x,y,ring.radius);nvgStrokeWidth(ctx,2);nvgStrokeColor(ctx,color(theme.hot,ring.alpha));nvgStroke(ctx) end end end
 if effect=='rewardBurst' or effect=='arcFly' or effect=='magnetDock' or effect=='scatterMagnet' or effect=='buttonField' or effect=='buttonBlast' or effect=='rewardBox' or effect=='button-feedback-7' then particles() end
 if (effect=='shatterPanel' or effect=='pixelDissolve') and t>.3 and t<1.3 then
  local x,y,w,h=box(nodes.modal)
  for _,fragment in ipairs(recipe.fragments) do
   local xx=x+fragment.column*w/7+fragment.dx;local yy=y+fragment.row*h/5+fragment.dy
   nvgSave(ctx);nvgScissor(ctx,xx,yy,w/7-2,h/5-2);nvgTranslate(ctx,fragment.dx,fragment.dy);nvgGlobalAlpha(ctx,fragment.alpha);art(nodes.modal);for _,n in ipairs(nodes.modal.children) do art(n) end;nvgRestore(ctx)
  end
 elseif (effect=='spotlight' or effect=='focusLens') and t<duration then
  local x,y=recipe.overlay.focusX,recipe.overlay.focusY
  nvgBeginPath(ctx);nvgRect(ctx,20,190,1480,912);nvgCircle(ctx,x,y,effect=='focusLens' and 110 or 170);nvgPathWinding(ctx,NVG_HOLE);nvgFillColor(ctx,color('#000000',.6));nvgFill(ctx)
  if effect=='focusLens' then nvgSave(ctx);nvgScissor(ctx,x-95,y-95,190,190);picture(nodes['card-'..card].path,x-100,y-150,200,300);nvgRestore(ctx) end
 elseif effect=='modal' and modal then
  rect(20,190,1480,912,'#000000',recipe.overlay.alpha);local n=nodes.modal;local cx,cy=center(n);local s=recipe.overlay.scale;local prior=controls;controls={}
  nvgSave(ctx);nvgTranslate(ctx,760,640);nvgScale(ctx,s,s);nvgTranslate(ctx,-cx,-cy);art(n);for _,c in ipairs(n.children) do art(c) end;nvgRestore(ctx)
  for _,c in ipairs(n.children) do if c.control and t>.3 then local x,y,w,h=box(c);controls[#controls+1]={id=c.control,label=c.control,x=760+(x-cx)*s,y=640+(y-cy)*s,w=w*s,h=h*s} end end
  for _,c in ipairs(prior) do if c.id:match('^shell:') then controls[#controls+1]=c end end
 elseif effect=='radialMenu' and t<duration then
  local shell={};for _,c in ipairs(controls) do if c.id:match('^shell:') then shell[#shell+1]=c end end;controls=shell
  rect(20,190,1480,912,'#000000',.55)
  for i,label in ipairs({'选项','列表','内容','记录','设置','更多'}) do local x,y=recipe.radial[i].x,recipe.radial[i].y
   picture(variant(nodes.secondary,'floating'),x-85,y-36,170,72);text(x,y,label,29,nodes.secondary.caption and nodes.secondary.caption.color,NVG_ALIGN_CENTER);controls[#controls+1]={id='ui:radial:'..i,label=label,x=x-85,y=y-36,w=170,h=72}
  end
 elseif effect=='sideList' then
  local shell={};for _,c in ipairs(controls) do if c.id:match('^shell:') then shell[#shell+1]=c end end;controls=shell
  local x=recipe.overlay.sideX;local n=nodes.list;local nx,ny,nw,nh=box(n);rect(20,190,1480,912,'#000000',.35)
  nvgSave(ctx);nvgTranslate(ctx,x-nx,420-ny);art(n)
  for _,c in ipairs(n.children) do
   local num=tonumber(c.name:match('^task%-(%d+)$'))
   if num and num<=3 then
   local cx,cy,cw,ch=box(c);local selected=num==task
   picture('ui/motion-lab-v2/'..theme.id..(selected and '/task-row-selected.png' or '/task-row.png'),cx,cy,cw,ch)
   else art(c) end
  end;nvgRestore(ctx)
  for i,c in ipairs(n.children) do local xx,yy,w,h=box(c);controls[#controls+1]={id=c.control,label='快捷任务 '..i,x=x+xx-nx,y=420+yy-ny,w=w,h=h} end
  local _,_,bw,bh=box(nodes.back);local scale=math.min(1,nw/bw);bw,bh=bw*scale,bh*scale
  local bx,by=x+(nw-bw)/2,420+nh+10
  controls[#controls+1]={id='ui:close-overlay',label='收起列表',x=bx,y=by,w=bw,h=bh};picture(variant(nodes.back,'floating'),bx,by,bw,bh)
 end
 if noticeTime>0 or effect=='toast' and t<2.56 or effect=='banner' and t<2.08 then
  local n=nodes[noticeTime>0 and 'toast' or effect=='banner' and 'banner' or 'toast'];local x,y,w,h=box(n);local dx,dy=0,0
  if noticeTime<=0 then if effect=='toast' then dy=recipe.overlay.toastY else dx=recipe.overlay.bannerX end end
  nvgSave(ctx);nvgTranslate(ctx,dx,dy)
  if noticeTime>0 then art(n,variant(n,'blank'));caption(n,notice) else art(n) end
  nvgRestore(ctx)
 end
end
function UI.Draw(context,w,h,current)
 ctx,state=context,current;effect,elapsed,duration=current.id,current.elapsed,current.duration;controls={};recipe:Sample(elapsed)
 local scale=math.min(w/2048,h/1152);nvgSave(ctx);nvgScissor(ctx,0,0,w,h);nvgTranslate(ctx,(w-2048*scale)/2,(h-1152*scale)/2);nvgScale(ctx,scale,scale)
 picture(theme.backdrop,0,0,2048,1152)
 for _,n in ipairs(theme.nodes) do
  local movingToast=n.name=='toast' and (noticeTime>0 or effect=='toast' and elapsed<2.56)
  local movingBanner=n.name=='banner' and effect=='banner' and elapsed<2.08 and noticeTime<=0
  if n.group~='directory' and not movingToast and not movingBanner then drawNode(n,true) end
 end
 overlays();transition();directory()
 if state.sequencing then local n=nodes['header-sequence'];art(n,variant(n,'blank'));caption(n,'停止体验 '..state.sequenceIndex..'/33') end
 for _,b in ipairs(controls) do
  local a=b.id==hover and .4 or feedback and b.id==feedback.key and feedback.pose.alpha or 0
  if a>0 then
   local name='entry';for _,n in pairs(nodes) do if n.control==b.id then name=n.name;break end end
   ring({name=name,box={b.x,b.y,b.x+b.w,b.y+b.h}},a)
  end
 end
 if (effect=='circle' or effect=='star') and elapsed<.68 or effect=='transition' and elapsed<.68 or effect=='particleWipe' and elapsed<1.45 then local shell={};for _,c in ipairs(controls) do if c.id:match('^shell:') then shell[#shell+1]=c end end;controls=shell end
 nvgRestore(ctx);return controls
end
return UI
