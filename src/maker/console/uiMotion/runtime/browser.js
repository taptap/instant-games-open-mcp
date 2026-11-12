import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';

export function createLuaRuntime(sources) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  function push(value) {
    if (value == null) lua.lua_pushnil(state);
    else if (typeof value === 'number') lua.lua_pushnumber(state, value);
    else if (typeof value === 'boolean') lua.lua_pushboolean(state, value);
    else if (typeof value === 'string') lua.lua_pushstring(state, to_luastring(value));
    else {
      lua.lua_newtable(state);
      for (const [key, item] of Object.entries(value)) {
        push(item);
        if (Array.isArray(value)) lua.lua_rawseti(state, -2, Number(key) + 1);
        else lua.lua_setfield(state, -2, to_luastring(key));
      }
    }
  }
  function read(index) {
    const absolute = lua.lua_absindex(state, index);
    const type = lua.lua_type(state, absolute);
    if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(state, absolute);
    if (type === lua.LUA_TSTRING) return to_jsstring(lua.lua_tolstring(state, absolute));
    if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(state, absolute);
    if (type !== lua.LUA_TTABLE) return null;
    const result = {};
    lua.lua_pushnil(state);
    while (lua.lua_next(state, absolute)) {
      result[read(-2)] = read(-1);
      lua.lua_pop(state, 1);
    }
    return result;
  }
  function check(status) {
    if (status !== lua.LUA_OK) {
      const message = read(-1);
      lua.lua_settop(state, 0);
      throw new Error('LuaTween 执行失败：' + message);
    }
  }
  function run(source) {
    check(lauxlib.luaL_loadstring(state, to_luastring(source)));
    check(lua.lua_pcall(state, 0, 0, 0));
  }
  for (const [name, source] of Object.entries(sources)) {
    run('package.preload[' + JSON.stringify(name) + ']=function()\n' + source + '\nend');
  }
  run(
    'local ClipPlayer=require("ClipPlayer"); local Recipes=require("UiMotionRecipes"); local players={}\n' +
      'function Create(id,recipe) players[id]=ClipPlayer.New(recipe) end\n' +
      'function Sample(id,time) return players[id]:Sample(time) end\n' +
      'function Named(key,kind,arg,time) if not players[key] then players[key]=ClipPlayer.New(Recipes[kind](arg)) end;return players[key]:Sample(time) end\n' +
      'function Destroy() for _,player in pairs(players) do player:Destroy() end;players={} end'
  );
  function call(name, ...args) {
    lua.lua_getglobal(state, to_luastring(name));
    for (const value of args) push(value);
    check(lua.lua_pcall(state, args.length, 1, 0));
    const result = read(-1);
    lua.lua_pop(state, 1);
    return result;
  }
  let recipes = new WeakMap(),
    count = 0;
  return {
    named(kind, argument, time) {
      return call('Named', kind + ':' + String(argument), kind, argument, time);
    },
    sample(recipe, time) {
      let id = recipes.get(recipe);
      if (!id) {
        id = ++count;
        call('Create', id, recipe);
        recipes.set(recipe, id);
      }
      return call('Sample', id, time);
    },
    destroy() {
      call('Destroy');
      recipes = new WeakMap();
    },
  };
}
