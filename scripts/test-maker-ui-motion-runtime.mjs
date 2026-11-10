import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import fengari from 'fengari';
import motionAssets from './maker-ui-motion-assets.cjs';

const assets = motionAssets(fileURLToPath(new URL('..', import.meta.url)));
const sources = Object.fromEntries(
  Object.entries(assets)
    .filter(([name]) => name.startsWith('lua/'))
    .map(([name, source]) => [name.slice(4, -4), source])
);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function execute(source) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const preload = Object.entries(sources)
    .map(
      ([name, content]) =>
        'package.preload[' + JSON.stringify(name) + ']=function()\n' + content + '\nend\n'
    )
    .join('');
  try {
    const status = lauxlib.luaL_dostring(state, to_luastring(preload + source));
    if (status !== lua.LUA_OK) assert.fail(to_jsstring(lua.lua_tostring(state, -1)));
  } finally {
    lua.lua_close(state);
  }
}

const nativeHostStub = `
  local function widget(props)
    local result={props=props or {},children={}}
    function result:SetStyle(style) for key,value in pairs(style) do self.props[key]=value end end
    function result:GetProp(key) return self.props[key] or (key=='text' and 'dialogue' or 100) end
    function result:SetText(text) self.text=text end
    function result:AddChild(child) child.parent=self;self.children[child.props.id or #self.children+1]=child end
    function result:RemoveChild(child) child.parent=nil end
    function result:Destroy() end
    function result:FindById(id)
      if not self.children[id] then self:AddChild(widget({id=id})) end
      return self.children[id]
    end
    return result
  end
  local UI={Panel=widget,Init=function()end,Shutdown=function()end,SetRoot=function()end,
    Scale={DEFAULT=1},GetSafeContentArea=function()return 0,0,2048,1152 end,
    UILoader={LoadFromFile=function()local root=widget();return {GetRoot=function()return root end}end},
    Widget={Extend=function()return setmetatable({},{__call=function(_,props)return widget(props)end})end}}
  package.preload['urhox-libs/UI']=function()return UI end
  package.preload['urhox-libs/UI/Core/ImageCache']=function()return {}end
  package.preload.UrhoxMotion=function()return {Bind=function(target)
    return {widget=target,Apply=function()end,Destroy=function()end}
  end}end
  package.preload.NativeControls=function()return {New=function()
    return {Update=function()end,Select=function()end,Notify=function()end}
  end}end
`;

test('native S04 completes and cancels claps without mutating the active update traversal', () => {
  execute(
    nativeHostStub +
      `
    local Tween=require('LuaTween')
    local demo=require('S04RedesignDemo')
    local survivor=Tween.To({value=0},{value=1},100):Pause()
    for _,action in ipairs({'complete','seek','shutdown','pending-shutdown'}) do
      demo.Init(require('urhox-libs/UI').Panel({}))
      Tween.Update(1.31);demo.Update(1.31)
      local baseline=Tween.TotalActive()
      assert(demo.Confirm());assert(not demo.Confirm())
      Tween.Update(.1);demo.Update(.1)
      if action=='complete' then
        demo.TogglePause();Tween.Update(1);demo.Update(1)
        assert(demo.GetState().phase=='paused')
        demo.TogglePause();Tween.Update(.5);demo.Update(.5)
        assert(demo.GetState().phase=='idle' and demo.TakeRequest()==5)
        assert(Tween.TotalActive()==baseline)
        assert(demo.Confirm());Tween.Update(.5);demo.Update(.5)
        assert(demo.TakeRequest()==5)
      elseif action=='seek' then
        demo.Seek(1.3);Tween.Update(.5);demo.Update(.5)
        assert(demo.GetState().phase=='paused' and demo.TakeRequest()==nil)
        assert(Tween.TotalActive()==baseline)
      elseif action=='pending-shutdown' then Tween.Update(.5) end
      demo.Shutdown();Tween.Update(.1)
      assert(Tween.TotalActive()==1 and not survivor.killed,action)
    end
    survivor:Kill()
  `
  );
});

test('native host resumes scene and transition together after seeks and replay', () => {
  execute(
    nativeHostStub +
      `
    local Tween=require('LuaTween')
    local app=require('NativeMotionDemo')
    local survivor=Tween.To({value=0},{value=1},100):Pause()
    local function step(seconds) for frame=1,math.ceil(seconds*60) do app.Update(1/60) end end
    for _,case in ipairs({{'T01',1,2,.4},{'T02',2,3,10/30},{'T03',4,5,32/30}}) do
      for _,progress in ipairs({.25,.75}) do
        for _,action in ipairs({'resume','replay'}) do
          app.Init(case[2]);step(2)
          assert(app.Transition(case[1],case[3]))
          app.Seek(case[4]*progress)
          assert(app.GetState().phase=='paused' and app.GetState().paused)
          if action=='resume' then app.TogglePause() else app.Replay() end
          assert(not app.GetState().paused and app.GetState().phase~='paused')
          step(3)
          local state=app.GetState()
          local expectedPhase=case[3]==3 and 'complete' or 'idle'
          assert(state.scene==case[3] and state.phase==expectedPhase and not state.transition,case[1]..action)
          app.Shutdown();assert(Tween.TotalActive()==1 and not survivor.killed)
        end
      end
    end
    survivor:Kill()
  `
  );
});

test('adds only usage comments to the original LuaTween library and identifies both files', () => {
  const library = JSON.parse(assets['library.json']);
  assert.equal(createHash('sha256').update(sources.LuaTween).digest('hex'), library.sha256);
  const original = sources.LuaTween.replace(/^--\[\[[\s\S]*?\]\]\n\n/, '');
  assert.equal(
    createHash('sha256').update(original).digest('hex'),
    '36d6fbdccc8be2b2d96797192c323b4b285ab4b72558e7c5fb467f557d9f7767'
  );
  assert.equal(createHash('sha256').update(original).digest('hex'), library.upstreamSha256);
});

test('README mixed sequence waits for parallel motion before continuing', () => {
  const example = assets['library/README.md'].split('```lua')[1].split('```')[0];
  execute(
    example +
      [
        'assert(math.abs(sequence.duration - 1) < 1e-8)',
        'LuaTween.Update(.3); assert(panel.x == 0 and panel.alpha == 1 and panel.scale == .9)',
        'LuaTween.Update(.4); assert(panel.scale == .9)',
        'LuaTween.Update(.4); assert(panel.scale == 1)',
        'sequence:Kill(); assert(LuaTween.TotalActive() == 0)',
      ].join('\n')
  );
});

test('all 301 skin/effect combinations use real property tweens and scoped cleanup', () => {
  execute(`
    local Tween=require('LuaTween')
    local Recipes=require('MotionLabRecipes')
    local calls={Value=0,Path=0}
    for name in pairs(calls) do
      local original=Tween[name]
      Tween[name]=function(...) calls[name]=calls[name]+1;return original(...) end
    end
    local survivor=Tween.To({value=0},{value=1},100):Pause()
    local baseline=Tween.TotalActive()
    local function finite(value)
      if type(value)=='number' then assert(value==value and math.abs(value)<math.huge)
      elseif type(value)=='table' then for _,child in pairs(value) do finite(child) end end
    end
    local count=0
    for _,skin in ipairs(require('MotionLabDesign')) do
      local nodes={}
      local function visit(node) nodes[node.name]=node;for _,child in ipairs(node.children or {}) do visit(child) end end
      for _,node in ipairs(skin.nodes) do visit(node) end
      for _,category in ipairs(require('MotionLabCatalog').categories) do
        for _,item in ipairs(category.items) do
          local before=calls.Value
          local recipe=Recipes.New(item.id,nodes,skin.card or 2)
          assert(calls.Value>before,item.id..' did not create property tweens')
          for _,time in ipairs({0,.2,item.duration,.1,0}) do finite(recipe:Sample(time)) end
          recipe:Destroy();recipe:Destroy()
          assert(Tween.TotalActive()==baseline,item.id..' leaked or killed another owner')
          count=count+1
        end
      end
    end
    assert(count==301 and calls.Path>0)
    survivor:Kill()
  `);
});

test('shared clips support repeat, backward seek, image scenes and long idle loops', () => {
  execute(`
    local Tween=require('LuaTween')
    local Player=require('ClipPlayer')
    local Recipes=require('UiMotionRecipes')
    local recipe={duration=2,tracks={
      {node='box',prop='x',from=0,to=10,at=0,duration=1,ease='linear'},
      {node='box',prop='x',from=10,to=0,at=1,duration=1,ease='linear'}}}
    local player=Player.New(recipe)
    assert(math.abs(player:Sample(.5).box.x-5)<1e-8)
    assert(player:Sample(2).box.x==0)
    assert(math.abs(player:Sample(.5).box.x-5)<1e-8)
    assert(player:Sample(0).box.x==0)
    player:Destroy()
    for _,name in ipairs({'S01','S02','S03','S04','S05','Attack'}) do
      local image=Player.New(Recipes.ImageScene(name));image:Sample(1);image:Sample(0);image:Destroy()
    end
    for _,name in ipairs({'T01','T02','T03'}) do
      local transition=Player.New(Recipes.Transition(name))
      transition:Sample(.75);transition:Sample(.25);transition:Destroy()
    end
    local idle=Player.New(Recipes.Idle())
    for _,time in ipairs({0,1,4,1000,86400,0}) do
      local value=idle:Sample(time).actor.dy
      assert(value==value and value>=-2 and value<=2)
    end
    idle:Destroy()
    assert(Tween.TotalActive()==0)
  `);
});

test('browser VM samples original Lua and can rebuild after pagehide cleanup', () => {
  const context = vm.createContext({ TextEncoder, TextDecoder, console });
  vm.runInContext(assets['browser.bundle.js'], context);
  const runtime = context.MakerLuaMotion.createLuaRuntime(sources);
  const recipe = {
    duration: 1,
    tracks: [{ node: 'box', prop: 'x', from: 0, to: 10, at: 0, duration: 1, ease: 'linear' }],
  };
  assert.equal(runtime.sample(recipe, 0.5).box.x, 5);
  assert.equal(runtime.named('BuiltinCards', null, 0).card0.scale, 0.06);
  assert.equal(runtime.named('BuiltinCards', null, 0.8).card0.scale, 12.06);
  runtime.destroy();
  assert.equal(runtime.sample(recipe, 0.5).box.x, 5);
  runtime.destroy();
});

test('reference metadata points to current Lua and validated media, not legacy easing', () => {
  const catalog = JSON.parse(assets['data/ui-motion-native/catalog.json']);
  assert.ok(!catalog.files.some((file) => file.path === 'scripts/Easing.lua'));
  for (const file of catalog.files.filter((file) => file.path.startsWith('scripts/'))) {
    const content = assets['lua/' + file.path.slice(8)];
    assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256);
  }
});

test('browser showcase uses the exact editable native layouts and clips', () => {
  const data = JSON.parse(assets['showcase/data.json']);
  for (const scene of data.manifest.scenes) {
    assert.deepEqual(data.trees[scene.id], JSON.parse(assets['data/assets/' + scene.ui]));
  }
  for (const [id, name] of Object.entries(data.manifest.clips)) {
    assert.deepEqual(data.clips[id], JSON.parse(assets['data/assets/' + name]));
  }
});
