import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const $ = (s) => document.querySelector(s),
  canvas = $('#stage'),
  ctx = canvas.getContext('2d');
let paints = [],
  winding = 'nonzero',
  error = false,
  visible = true,
  last = 0,
  controlsKey = '',
  loadingSkin = false,
  skinError = '';
const images = new Map();
const loading = document.createElement('div');
loading.id = 'lab-loading';
loading.setAttribute('role', 'status');
const loadingText = document.createElement('span'),
  retry = document.createElement('button');
retry.textContent = '重新加载';
retry.onclick = () => location.reload();
loading.append(loadingText, retry);
$('.viewport').append(loading);
let loadingTimer;
function reportLoading(state, message) {
  if (error && state !== 'error') return;
  clearTimeout(loadingTimer);
  loading.dataset.state = state;
  loading.hidden = state === 'ready';
  $('#status').hidden = state !== 'ready';
  loadingText.textContent = message;
  retry.hidden = state !== 'error';
  if (parent !== window)
    parent.postMessage({ type: 'maker:motion-lab-loading', state }, location.origin);
  if (state === 'loading')
    loadingTimer = setTimeout(() => {
      error = true;
      retry.onclick = () => location.reload();
      reportLoading('error', '加载超时，请检查网络后重新加载。');
    }, 60000);
}
reportLoading('loading', '正在准备字体与 LuaTween 演示…');
function val(i) {
  const t = lua.lua_type(L, i);
  if (t === lua.LUA_TSTRING) return to_jsstring(lua.lua_tolstring(L, i));
  if (t === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, i);
  if (t === lua.LUA_TNUMBER) return lua.lua_tonumber(L, i);
  return null;
}
function push(value) {
  if (value === null || value === undefined) lua.lua_pushnil(L);
  else if (typeof value === 'number') lua.lua_pushnumber(L, value);
  else if (typeof value === 'boolean') lua.lua_pushboolean(L, value);
  else if (typeof value === 'string') lua.lua_pushstring(L, to_luastring(value));
  else {
    lua.lua_newtable(L);
    for (const [key, v] of Object.entries(value)) {
      push(v);
      if (Array.isArray(value)) lua.lua_rawseti(L, -2, Number(key) + 1);
      else lua.lua_setfield(L, -2, to_luastring(key));
    }
  }
}
function read(i) {
  i = lua.lua_absindex(L, i);
  if (lua.lua_type(L, i) !== lua.LUA_TTABLE) return val(i);
  const result = {};
  lua.lua_pushnil(L);
  while (lua.lua_next(L, i)) {
    const k = val(-2);
    result[k] = read(-1);
    lua.lua_pop(L, 1);
  }
  const keys = Object.keys(result);
  return keys.length && keys.every((k, n) => Number(k) === n + 1) ? Object.values(result) : result;
}
function register(name, fn) {
  lua.lua_pushcfunction(L, () => {
    const a = [];
    for (let i = 1; i <= lua.lua_gettop(L); i++) a.push(val(i));
    const r = fn(...a);
    if (r !== undefined) {
      push(r);
      return 1;
    }
    return 0;
  });
  lua.lua_setglobal(L, to_luastring(name));
}
function paint(v) {
  return paints[v] ?? '#faeecc';
}
const api = {
  nvgRGBA: (r, g, b, a) => {
    paints.push('rgba(' + r + ',' + g + ',' + b + ',' + a / 255 + ')');
    return paints.length - 1;
  },
  nvgCreateFont: () => 1,
  nvgBeginPath: () => {
    ctx.beginPath();
    winding = 'nonzero';
  },
  nvgClosePath: () => ctx.closePath(),
  nvgRect: (_, x, y, w, h) => ctx.rect(x, y, w, h),
  nvgRoundedRect: (_, x, y, w, h, r) =>
    ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))),
  nvgCircle: (_, x, y, r) => {
    ctx.moveTo(x + Math.max(0, r), y);
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  },
  nvgArc: (_, x, y, r, a, b, dir) => ctx.arc(x, y, Math.max(0, r), a, b, dir === 2),
  nvgMoveTo: (_, x, y) => ctx.moveTo(x, y),
  nvgLineTo: (_, x, y) => ctx.lineTo(x, y),
  nvgQuadTo: (_, x, y, a, b) => ctx.quadraticCurveTo(x, y, a, b),
  nvgFillColor: (_, p) => {
    ctx.fillStyle = paint(p);
  },
  nvgStrokeColor: (_, p) => {
    ctx.strokeStyle = paint(p);
  },
  nvgStrokeWidth: (_, v) => {
    ctx.lineWidth = Math.max(0.001, v);
  },
  nvgFill: () => ctx.fill(winding),
  nvgStroke: () => ctx.stroke(),
  nvgPathWinding: (_, v) => {
    if (v === 2) winding = 'evenodd';
  },
  nvgSave: () => ctx.save(),
  nvgRestore: () => ctx.restore(),
  nvgScale: (_, x, y) => ctx.scale(x, y),
  nvgTranslate: (_, x, y) => ctx.translate(x, y),
  nvgRotate: (_, r) => ctx.rotate(r),
  nvgScissor: (_, x, y, w, h) => {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  },
  nvgGlobalAlpha: (_, a) => {
    ctx.globalAlpha = a;
  },
  nvgFontFace: (_, font) => {
    ctx.font = ctx.font.replace(/Lab\w+$/u, font === 'lab-bold' ? 'LabBold' : 'LabSerif');
  },
  nvgFontSize: (_, s) => {
    const family = ctx.font.includes('LabBold') ? 'LabBold' : 'LabSerif';
    ctx.font = s + 'px ' + family;
  },
  nvgTextAlign: (_, v) => {
    ctx.textAlign = v & 2 ? 'center' : v & 4 ? 'right' : 'left';
    ctx.textBaseline = v & 16 ? 'middle' : v & 8 ? 'top' : v & 32 ? 'bottom' : 'alphabetic';
  },
  nvgText: (_, x, y, t) => ctx.fillText(t, x, y),
  nvgLinearGradient: (_, x, y, x2, y2, c1, c2) => {
    const p = ctx.createLinearGradient(x, y, x2, y2);
    p.addColorStop(0, paint(c1));
    p.addColorStop(1, paint(c2));
    paints.push(p);
    return paints.length - 1;
  },
  nvgFillPaint: (_, p) => {
    ctx.fillStyle = paint(p);
  },
  nvgCreateImage: (_, path) => (images.has(path) ? path : 0),
  nvgDeleteImage: () => {},
  nvgImagePattern: (_, x, y, w, h, angle, handle) => {
    const im = images.get(handle);
    const p = ctx.createPattern(im, 'no-repeat');
    p.setTransform(
      new DOMMatrix()
        .translate(x, y)
        .rotate((angle * 180) / Math.PI)
        .scale(w / im.width, h / im.height)
    );
    paints.push(p);
    return paints.length - 1;
  },
};
for (const [n, f] of Object.entries(api)) register(n, f);
for (const [n, v] of Object.entries({
  NVG_ALIGN_LEFT: 1,
  NVG_ALIGN_CENTER: 2,
  NVG_ALIGN_RIGHT: 4,
  NVG_ALIGN_MIDDLE: 16,
  NVG_CW: 1,
  NVG_HOLE: 2,
  NVG_SOLID: 1,
})) {
  push(v);
  lua.lua_setglobal(L, to_luastring(n));
}
function fail(message) {
  error = true;
  retry.onclick = () => location.reload();
  reportLoading('error', '动效加载失败：' + message);
  throw new Error(message);
}
function call(name, ...args) {
  lua.lua_getglobal(L, to_luastring('Demo'));
  lua.lua_getfield(L, -1, to_luastring(name));
  lua.lua_remove(L, -2);
  for (const a of args) push(a);
  if (lua.lua_pcall(L, args.length, 1, 0) !== lua.LUA_OK) fail(val(-1));
  const r = read(-1);
  lua.lua_pop(L, 1);
  return r;
}
async function loadSkinImages(id) {
  const queue = Object.entries(DATA.images).filter(([path]) =>
    path.startsWith('ui/motion-lab-v2/' + id + '/')
  );
  const loaded = new Map();
  const total = queue.length;
  const controller = new AbortController();
  reportLoading('loading', '正在加载皮肤图片 0/' + total + '…');
  let failure;
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && !failure && !error) {
        const [path, src] = queue.shift();
        try {
          let blob;
          if (src.startsWith('data:')) {
            const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (character) =>
              character.charCodeAt(0)
            );
            blob = new Blob([bytes], { type: 'image/webp' });
          } else {
            const response = await fetch(src, { signal: controller.signal });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            blob = await response.blob();
          }
          loaded.set(path, await createImageBitmap(blob));
          if (error) throw new Error('加载已超时');
          if (!failure)
            reportLoading('loading', '正在加载皮肤图片 ' + loaded.size + '/' + total + '…');
        } catch (cause) {
          failure ||= new Error(path + '：' + cause.message);
          controller.abort();
        }
      }
    })
  );
  if (failure || error) {
    for (const bitmap of loaded.values()) bitmap.close();
    throw failure || new Error('加载已超时');
  }
  for (const bitmap of images.values()) bitmap.close();
  images.clear();
  for (const [path, bitmap] of loaded) images.set(path, bitmap);
}
try {
  await Promise.all([document.fonts.load('24px LabSerif'), document.fonts.load('24px LabBold')]);
  if (error) throw new Error('字体加载超时');
} catch (cause) {
  fail('字体准备失败：' + cause.message);
}
if (
  lauxlib.luaL_loadstring(L, to_luastring(DATA.lua)) !== lua.LUA_OK ||
  lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK
)
  fail(val(-1));
lua.lua_setglobal(L, to_luastring('Demo'));
const catalog = DATA.catalog,
  items = catalog.categories.flatMap((c) => c.items),
  byId = new Map(items.map((i) => [i.id, i]));
function button(label, fn, className = '') {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = className;
  b.onclick = fn;
  return b;
}
function back() {
  if (parent !== window) parent.postMessage({ type: 'maker:motion-lab-back' }, location.origin);
  else action('Home');
}
function action(name, ...args) {
  if (loadingSkin || error) return false;
  if (name === 'Activate' && ['shell:back', 'shell:close'].includes(args[0])) {
    back();
    return true;
  }
  const result = call(name, ...args);
  draw();
  sync();
  return result;
}
function draw() {
  paints = [];
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, 2048, 1152);
  call('Draw', 1, 2048, 1152);
  const raw = call('GetControls'),
    all = Array.isArray(raw) ? raw : [],
    key = JSON.stringify(all);
  if (key === controlsKey) return;
  controlsKey = key;
  const hits = $('#hits');
  hits.replaceChildren();
  for (const hit of all) {
    const b = button('', () => action('Activate', hit.id), 'hit');
    b.setAttribute('aria-label', hit.label);
    b.dataset.control = hit.id;
    Object.assign(b.style, {
      left: hit.x / 20.48 + '%',
      top: hit.y / 11.52 + '%',
      width: hit.w / 20.48 + '%',
      height: hit.h / 11.52 + '%',
    });
    b.onpointerenter = () => call('Hover', hit.id);
    b.onpointerleave = () => call('Hover', null);
    hits.append(b);
  }
}
function sync() {
  const s = call('GetState');
  $('#status').textContent =
    skinError ||
    (byId.get(s.id)?.title || '更多动效') +
      (s.sequencing ? ' · 顺序体验 ' + s.sequenceIndex + '/33' : '');
  $('#status').className = skinError ? '' : 'ready';
  return s;
}
call('Init', 1, catalog);
const skins = call('GetSkins');
const skinMenu = $('#skins'),
  skinToggle = $('#skin-toggle'),
  skinPrevious = $('#skin-prev'),
  skinNext = $('#skin-next');
let skinIndex = -1;
function showSkinMenu(open, focus = false) {
  if (open && loadingSkin) return;
  skinMenu.hidden = !open;
  skinToggle.setAttribute('aria-expanded', String(open));
  if (focus) {
    const target = open
      ? skinMenu.querySelector('[aria-pressed=true]') || skinMenu.firstElementChild
      : skinToggle;
    target?.focus();
  }
}
function turnSkin(delta) {
  showSkinMenu(false);
  return setSkin(skins[(skinIndex + delta + skins.length) % skins.length].id);
}
async function setSkin(id) {
  const skin = skins.find((s) => s.id === id);
  if (!skin || loadingSkin || error) return false;
  showSkinMenu(false);
  if (skinIndex === skins.indexOf(skin)) {
    skinError = '';
    reportLoading('ready', '演示已就绪');
    return true;
  }
  loadingSkin = true;
  $('#status').className = '';
  $('#status').textContent = '加载 ' + skin.name + '…';
  $('#hits').style.pointerEvents = 'none';
  for (const b of [skinPrevious, skinNext, skinToggle, ...skinMenu.children]) b.disabled = true;
  try {
    await loadSkinImages(id);
    skinError = '';
    call('SetSkin', id);
    document.body.dataset.skin = id;
    document.body.style.setProperty('--hot', skin.hot);
    skinIndex = skins.indexOf(skin);
    $('#skin-name').textContent = skin.name;
    $('#skin-count').textContent =
      String(skinIndex + 1).padStart(2, '0') + ' / ' + String(skins.length).padStart(2, '0');
    skinToggle.setAttribute(
      'aria-label',
      '选择界面，当前 ' + skin.name + '，第 ' + (skinIndex + 1) + ' 套，共 ' + skins.length + ' 套'
    );
    skinPrevious.setAttribute(
      'aria-label',
      '上一套界面：' + skins[(skinIndex + skins.length - 1) % skins.length].name
    );
    skinNext.setAttribute(
      'aria-label',
      '下一套界面：' + skins[(skinIndex + 1) % skins.length].name
    );
    for (const b of skinMenu.children)
      b.setAttribute('aria-pressed', String(b.dataset.skin === id));
    try {
      localStorage.setItem('maker-motion-lab-skin', id);
    } catch {}
    draw();
    sync();
    reportLoading('ready', '演示已就绪');
    return true;
  } catch (cause) {
    skinError = '皮肤加载失败：' + cause.message;
    $('#status').textContent = skinError;
    if (!error) {
      retry.onclick = () => setSkin(id);
      reportLoading('error', skinError);
    }
    return false;
  } finally {
    loadingSkin = false;
    last = 0;
    $('#hits').style.pointerEvents = '';
    for (const b of [skinPrevious, skinNext, skinToggle, ...skinMenu.children]) b.disabled = false;
  }
}
for (const [index, skin] of skins.entries()) {
  const b = button(skin.name, async () => {
    if (await setSkin(skin.id)) skinToggle.focus();
  });
  b.dataset.skin = skin.id;
  b.dataset.number = String(index + 1).padStart(2, '0');
  b.style.setProperty('--swatch', skin.hot);
  skinMenu.append(b);
}
skinPrevious.onclick = () => turnSkin(-1);
skinNext.onclick = () => turnSkin(1);
skinToggle.onclick = () => showSkinMenu(skinMenu.hidden, true);
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.skin-picker')) showSkinMenu(false);
});
$('.skin-picker').addEventListener('focusout', (e) => {
  if (!e.currentTarget.contains(e.relatedTarget)) showSkinMenu(false);
});
let skin = 'teal-gold';
try {
  skin =
    new URLSearchParams(location.search).get('skin') ||
    localStorage.getItem('maker-motion-lab-skin') ||
    skin;
} catch {}
await setSkin(skins.some((item) => item.id === skin) ? skin : 'teal-gold');
$('.stage').addEventListener(
  'wheel',
  (e) => {
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left + r.width * 0.74) return;
    e.preventDefault();
    action('Scroll', (e.deltaY * 2048) / r.width);
  },
  { passive: false }
);
let touch = null,
  suppressClickUntil = 0;
$('#hits').addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    const r = canvas.getBoundingClientRect();
    if (e.clientX > r.left + r.width * 0.74) {
      touch = { id: e.pointerId, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }
});
$('#hits').addEventListener('pointermove', (e) => {
  if (touch?.id === e.pointerId) {
    const delta = touch.y - e.clientY;
    if (Math.abs(delta) > 3) {
      action('Scroll', (delta * 2048) / canvas.getBoundingClientRect().width);
      touch.y = e.clientY;
      suppressClickUntil = performance.now() + 350;
    }
  }
});
$('#hits').addEventListener(
  'click',
  (e) => {
    if (performance.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true
);
window.addEventListener('pointerup', () => {
  touch = null;
});
window.addEventListener('pointercancel', () => {
  touch = null;
});
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (!skinMenu.hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      showSkinMenu(false, true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const buttons = [...skinMenu.children],
        index = buttons.indexOf(document.activeElement);
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }
    return;
  }
  if (e.target === skinToggle && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    showSkinMenu(true, true);
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (!e.repeat) turnSkin(e.key === 'ArrowLeft' ? -1 : 1);
  } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    action('Scroll', e.key === 'PageDown' ? 300 : 65);
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    action('Scroll', e.key === 'PageUp' ? -300 : -65);
  } else if (e.key === 'Escape') back();
  else if (e.key.toLowerCase() === 'r') action('Replay');
});
function frame(t) {
  if (error) return;
  if (visible && !document.hidden && !loadingSkin && skinIndex >= 0) {
    if (last) call('Update', Math.min(0.06, (t - last) / 1000));
    draw();
    sync();
  }
  last = t;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('message', (e) => {
  if (
    e.origin !== location.origin ||
    e.source !== parent ||
    e.data?.type !== 'maker:motion-visibility'
  )
    return;
  visible = !!e.data.visible;
  last = 0;
});
document.addEventListener('visibilitychange', () => {
  last = 0;
});
window.MotionLab = {
  select: (id) => action('Select', id),
  activate: (id) => action('Activate', id),
  skin: setSkin,
  skins,
  seek: (t) => action('Seek', t),
  state: () => call('GetState'),
  controls: () => call('GetControls'),
  scroll: (delta) => action('Scroll', delta),
  update: (dt) => {
    call('Update', dt);
    draw();
    sync();
  },
  catalog,
};
