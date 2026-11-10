export const uiMotionScript = String.raw`
const $ = (id) => document.getElementById(id);
const find = (id) => examples.find((item) => item.id === id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let timelineFrames = false;
let localSelection;
function renderTimeline() {
  $('timeline-unit').textContent = timelineFrames ? '帧 → 秒' : '秒 → 帧';
  $('keyframe-tracks').replaceChildren();
  const names = {actor:'角色',logo:'标题',stats:'属性',dialog:'对话框',text:'对白',
    cursor:'焦点',sweep:'确认扫光',arc:'弧光',slash:'斜刃',hint:'继续提示',nameplate:'姓名牌'};
  const groups = new Map();
  for (const track of clip.tracks) {
    if (!groups.has(track.node)) groups.set(track.node, new Map());
    const points = groups.get(track.node);
    for (const t of [track.at, track.at + track.duration]) points.set(t.toFixed(5), t);
  }
  for (const [node, points] of groups) {
    const row = document.createElement('div'); row.className = 'timeline-track';
    const label = document.createElement('span'); label.textContent = names[node] || node;
    const lane = document.createElement('div'); lane.className = 'timeline-lane';
    const marker = document.createElement('i'); marker.className = 'timeline-head-marker';
    lane.append(marker);
    for (const t of [...points.values()].sort((a,b)=>a-b)) {
      const key = document.createElement('button'); key.className = 'timeline-key';
      key.style.left = t / clip.duration * 100 + '%';
      const when = timelineFrames ? Math.round(t * 60) + ' f' : t.toFixed(2) + ' s';
      key.title = label.textContent + ' · ' + when;
      key.setAttribute('aria-label', key.title);
      key.onclick = () => { seek(t); $('keyframe-detail').textContent = key.title; };
      lane.append(key);
    }
    row.append(label, lane); $('keyframe-tracks').append(row);
  }
  $('keyframe-detail').textContent = '0 → ' + (timelineFrames ? Math.round(clip.duration*60)+' f' : clip.duration.toFixed(2)+' s') + ' · 点击菱形定位';
}
function renderLocalCards() {
  const queue = [];
  const next = () => { const item = queue.shift(); if (item) item.frame.src = item.url; };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'maker:vector-thumbnail') return;
    const frame = [...document.querySelectorAll('iframe[data-vector-thumbnail]')]
      .find(item => item.contentWindow === event.source && item.dataset.vectorThumbnail === event.data.id);
    if (!frame || typeof event.data.image !== 'string' || !event.data.image.startsWith('data:image/png;base64,')) return;
    const image = document.createElement('img'); image.src = event.data.image; image.alt = frame.title;
    frame.replaceWith(image); next();
  });
  for (const item of localSamples) {
    const card = document.createElement('article'); card.className = 'example-card';
    const button = document.createElement('button'); button.className = 'example-open';
    button.setAttribute('aria-label','体验 '+item.name);
    const media = document.createElement('div'); media.className = 'example-media';
    const frame = document.createElement('iframe'); frame.title = item.name; frame.tabIndex = -1;
    frame.dataset.vectorThumbnail = item.id; frame.setAttribute('aria-hidden','true');
    queue.push({frame, url:item.entry+'&thumbnail=1'});
    const tag = document.createElement('span'); tag.className = 'example-id'; tag.textContent = item.id;
    const play = document.createElement('span'); play.className = 'example-play'; play.textContent = '体验 ↗';
    media.append(frame,tag,play);
    const body = document.createElement('div'); body.className = 'example-body';
    const title = document.createElement('h3'); title.textContent = item.name;
    const summary = document.createElement('p'); summary.textContent = item.summary;
    body.append(title,summary); button.append(media,body); card.append(button);
    $(item.kind==='scene'?'scenes':'transitions').append(card);
    button.onclick = () => {
      pause(); localSelection = item;
      $('open-local').hidden = false;
      $('local-viewer').removeAttribute('data-kind');
      $('local-title').textContent = item.name; $('open-local').href = item.entry;
      $('local-frame').src = item.entry + '&embed=1'; $('local-viewer').showModal();
    };
  }
  $('scenes-title').nextElementSibling.textContent = String(localSamples.filter(x=>x.kind==='scene').length).padStart(2,'0');
  next();
}
function setupLocalViewer() {
  $('close-local').onclick = () => $('local-viewer').close();
  $('local-viewer').addEventListener('close',()=>{
    if (!$('local-viewer').open) $('local-frame').removeAttribute('src');
  });
  $('use-local').onclick = () => {
    if (!localSelection) return;
    if (localSelection.kind === 'lab') {
      const lab = $('local-frame').contentWindow?.MotionLab;
      const state = lab?.state();
      const skin = lab?.skins.find(item => item.id === state?.ui?.skin);
      const effect = lab?.catalog.categories.flatMap(group => group.items).find(item => item.id === state?.id);
      $('prompt').value = [
        '参考更多动效工坊，接入用户指定的 UI 动效。',
        skin && effect ? '当前选用：'+skin.name+'（'+skin.id+'） / '+effect.title+'（'+effect.id+'）。' : '先在示例中确认所选风格与动效。',
        '本机示例项目：'+localSelection.project,
        '先读 assets/ui/motion-lab-v2/README.md 与 assets/ui/motion-lab-v1/catalog.json，选择具体条目。',
        '共 36 组动效、7 种按钮反馈；原生入口 scripts/MotionLabMain.lua。',
        '提供七套组件皮肤，先选择风格，再选择动效；不包含超级玛利奥和皮克敏。',
        'scripts/MotionLab.lua 同时供网页实时预览与游戏原生 NanoVG 使用。',
        '组件绘制与交互见 scripts/MotionLabComponents.lua；独立 PNG 与精确坐标在 assets/ui/motion-lab-v2/ 对应风格目录。',
        '保留已确认设计的组件造型、排版、材质和比例；读取 layout.json 按图层接入，勿合并为整屏截图热区。',
        '网页通过 Lua VM + Canvas2D 绘制；不是视频、截图序列或原生验收证明。',
        '此工坊没有底部时间轴；catalog.json 保留阶段时序，供 AI 研究和接入。',
        '径向菜单、弹性回弹与磁铁拖拽是自动演示，真实拖拽需另接输入。',
        '保留所选视觉设计，只修改用户指定项目，不要直接覆盖 main.lua。',
      ].join(String.fromCharCode(10));
      $('copy-status').textContent=''; $('handoff').showModal();
      return;
    }
    $('prompt').value = [
      '参考 '+localSelection.id+' '+localSelection.name+'，接入可编辑 NanoVG UI 与交互。',
      '本机示例项目：'+localSelection.project,
      '读取 assets/ui/nanovg-showcase-v1/showcase.json、对应 UI.json 和 motion/*.json。',
      '原生宿主：scripts/NanoVGShowcase.lua；入口：scripts/NanoVGShowcaseMain.lua。',
      '背景和角色使用独立 PNG，其余 UI 使用 NanoVG。保留设计和同游戏内的转场关系。',
      '关键帧读取实际动效数据；Seek 只检查姿态，不能推进业务或触发完成回调。',
      '请先研究示例，再修改用户指定的目标游戏；不要直接覆盖 main.lua。',
    ].join(String.fromCharCode(10));
    $('copy-status').textContent=''; $('handoff').showModal();
  };
}
if (motionLab) {
  $('open-motion-lab').onclick = () => {
    pause(); localSelection = {...motionLab,kind:'lab'};
    $('local-viewer').dataset.kind = 'lab';
    $('local-title').textContent = '更多动效'; $('open-local').hidden = true;
    $('local-frame').src = motionLab.entry; $('local-viewer').showModal();
  };
  window.addEventListener('message',event=>{
    if (event.origin === location.origin && event.source === $('local-frame').contentWindow &&
        event.data?.type === 'maker:motion-lab-back') $('local-viewer').close();
  });
}
if (localSamples.length || motionLab) setupLocalViewer();
let originalSelection;
function setLibrary(variant) {
  pause();
  $('original-library').hidden = variant !== 'original';
  $('vector-library').hidden = variant !== 'vector';
  const items = variant === 'vector' ? (localSamples.length ? localSamples : examples) : originals;
  const count = kind => String(items.filter(item => item.kind === kind).length).padStart(2, '0');
  document.querySelector('.page-heading .index').textContent = count('scene') + ' SCENES / ' + count('transition') + ' TRANSITIONS';
  document.querySelectorAll('[data-library]').forEach(button =>
    button.setAttribute('aria-pressed', String(button.dataset.library === variant)));
}
function originalVisibility(visible) {
  if (standalone || !originalSelection) return;
  $('original-frame').contentWindow?.postMessage(
    {type:'maker:motion-visibility', visible:visible && $('original-viewer').open}, location.origin);
}
function openOriginal(item) {
  pause();
  originalSelection = item;
  $('original-title').textContent = item.name;
  $('open-original').href = item.entry.replace('embed=1&', '');
  $('original-frame').src = item.entry;
  $('original-viewer').showModal();
}
const thumbnailQueue = [];
function nextThumbnail() {
  const next = thumbnailQueue.shift();
  if (next) next.frame.src = next.url;
}
function renderOriginalCards() {
  for (const item of originals) {
    const card = document.createElement('article');
    card.className = 'example-card';
    const button = document.createElement('button');
    button.className = 'example-open';
    button.dataset.original = item.id;
    button.setAttribute('aria-label', '体验图片 UI：' + item.name);
    button.disabled = !item.available;
    const media = document.createElement('div');
    media.className = 'example-media';
    if (item.available) {
      const preview = document.createElement('iframe');
      preview.title = item.name + '实际分层渲染预览';
      preview.dataset.thumbnail = item.id;
      preview.loading = 'lazy';
      preview.tabIndex = -1;
      preview.setAttribute('aria-hidden', 'true');
      media.append(preview);
      thumbnailQueue.push({frame:preview, url:item.preview});
    }
    const tag = document.createElement('span');
    tag.className = 'example-id';
    tag.textContent = item.id;
    const playIcon = document.createElement('span');
    playIcon.className = 'example-play';
    playIcon.textContent = item.available ? '体验 ↗' : '待接入项目';
    media.append(tag, playIcon);
    const body = document.createElement('div');
    body.className = 'example-body';
    const title = document.createElement('h3');
    title.textContent = item.name;
    const summary = document.createElement('p');
    summary.textContent = item.summary;
    body.append(title, summary);
    button.append(media, body);
    card.append(button);
    $(item.kind === 'scene' ? 'original-scenes' : 'original-transitions').append(card);
    button.onclick = () => openOriginal(item);
  }
  if (originals.some(item => !item.available))
    $('original-note').textContent = '项目素材包尚未接入；请配置本机实战项目目录后重新打开。';
  nextThumbnail();
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || !['maker:motion-thumbnail','maker:motion-thumbnail-error'].includes(event.data?.type)) return;
  const preview = [...document.querySelectorAll('iframe[data-thumbnail]')]
    .find(frame => frame.contentWindow === event.source && frame.dataset.thumbnail === event.data.id);
  if (!preview) return;
  if (event.data.type === 'maker:motion-thumbnail-error') {
    const error = document.createElement('span');
    error.textContent = '预览加载失败';
    error.title = event.data.message;
    preview.replaceWith(error);
    nextThumbnail();
    return;
  }
  if (typeof event.data.image !== 'string' || !event.data.image.startsWith('data:image/png;base64,')) return;
  const image = document.createElement('img');
  image.src = event.data.image;
  image.alt = preview.title;
  preview.replaceWith(image);
  nextThumbnail();
});
let current,
  clip,
  time = 0,
  playing = false,
  raf = 0,
  previous = 0,
  complete = null;
let state = {},
  trail = [],
  hostVisible = true,
  hotspotKey = '';
function pause() {
  playing = false;
  cancelAnimationFrame(raf);
  $('play').textContent = '播放';
  $('play').setAttribute('aria-pressed', 'false');
}
function paint() {
  if (!current) return;
  const controls = MotionDemo.render($('stage-canvas'), current, clip, time, state);
  document.querySelectorAll('#keyframe-tracks .timeline-head-marker').forEach(marker => {
    marker.style.left = time / clip.duration * 100 + '%';
  });
  $('time').textContent = time.toFixed(2) + ' / ' + clip.duration.toFixed(2) + ' s';
  $('viewer').dataset.example = current.id;
  $('stage').dataset.clip = clip.id;
  const entering = clip.id === 'entry' && time < clip.duration;
  const key = JSON.stringify(controls.map((item) => [item.action, item.disabled || entering]));
  if (key !== hotspotKey) {
    hotspotKey = key;
    const focused = document.activeElement?.dataset.action;
    $('hotspots').replaceChildren(
      ...controls.map((item) => {
        const button = document.createElement('button');
        button.className = 'hotspot';
        button.dataset.action = item.action;
        button.setAttribute('aria-label', item.label);
        button.title = item.label;
        button.style.cssText =
          'left:' +
          item.x / 12.8 +
          '%;top:' +
          item.y / 7.2 +
          '%;width:' +
          item.w / 12.8 +
          '%;height:' +
          item.h / 7.2 +
          '%;';
        button.disabled = Boolean(item.disabled || entering);
        button.onclick = () => act(item.action);
        button.onpointerenter = () => {
          if (item.action.startsWith('menu:') && !button.disabled)
            focusMenu(Number(item.action.split(':')[1]));
        };
        return button;
      }),
    );
    $('touch-actions').replaceChildren(
      ...controls.map((item) => {
        const button = document.createElement('button');
        button.textContent = item.label;
        button.disabled = Boolean(item.disabled || entering);
        button.onclick = () => act(item.action);
        return button;
      }),
    );
    if (focused)
      $('hotspots')
        .querySelector('[data-action="' + focused + '"]')
        ?.focus({ preventScroll: true });
  }
}
function tick(now) {
  if (!playing) return;
  time = Math.min(clip.duration, time + ((now - previous) / 1000) * Number($('speed').value));
  previous = now;
  paint();
  if (time >= clip.duration) {
    pause();
    const callback = complete;
    complete = null;
    if (callback) callback();
  } else raf = requestAnimationFrame(tick);
}
function play() {
  if (!current || !hostVisible || document.hidden) return;
  pause();
  if (time >= clip.duration) time = 0;
  playing = true;
  previous = performance.now();
  $('play').textContent = '暂停';
  $('play').setAttribute('aria-pressed', 'true');
  raf = requestAnimationFrame(tick);
}
function playClip(id, callback = null, auto = true) {
  pause();
  complete = callback;
  clip = current.clips.find((item) => item.id === id) || current.clips[0];
  renderTimeline();
  time = 0;
  state.notice = '';
  document
    .querySelectorAll('[data-clip]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.clip === clip.id)),
    );
  paint();
  if (auto) play();
}
function seek(value) {
  pause();
  complete = null;
  time = Math.max(0, Math.min(clip.duration, value));
  paint();
}
function load(id, callback = null) {
  pause();
  complete = null;
  current = find(id);
  hotspotKey = '';
  $('viewer-title').textContent = current.name;
  $('viewer-tag').textContent = current.kind === 'scene' ? '完整界面' : '转场';
  $('viewer-summary').textContent = current.summary;
  $('back').hidden = trail.length === 0;
  $('clips').replaceChildren(
    ...current.clips.map((item) => {
      const button = document.createElement('button');
      button.textContent = item.label;
      button.dataset.clip = item.id;
      button.onclick = () => playClip(item.id);
      return button;
    }),
  );
  $('interaction').textContent = current.interaction;
  $('source-note').textContent = contract.provenance + ' ' + contract.boundary;
  $('reference-json').textContent = JSON.stringify({ example: current, contract }, null, 2);
  $('download').href = '/ui-motion/demo?id=' + current.id;
  $('download').download = 'maker-ui-motion-' + current.id + '.html';
  playClip(current.clips[0].id, callback, !reduced.matches);
  if (reduced.matches) {
    time = clip.duration;
    paint();
  }
}
function navigate(id, callback = null) {
  if (current.kind !== 'transition') trail.push(current.id);
  load(id, callback);
}
function open(id) {
  trail = [];
  state = { focus: 0, character: 0, line: 0, skill: 0 };
  $('viewer').showModal();
  load(id);
}
function focusMenu(index) {
  if (state.focus === index || clip.id === 'confirm') return;
  state.focus = index;
  playClip('focus');
}
function act(action) {
  const [name, value] = action.split(':');
  state.notice = '';
  if (name === 'menu') {
    if (clip.id === 'confirm') return;
    state.focus = Number(value);
    if (value === '0') playClip('confirm', () => navigate('T01', () => navigate('S02')));
    else {
      playClip('focus');
      state.notice = value === '1' ? '设置入口 · 已选中' : '档案入口 · 已选中';
      paint();
    }
  } else if (name === 'avatar') {
    state.character = Number(value);
    playClip('select');
  } else if (name === 'attack') {
    state.skill = Number(value);
    playClip('attack');
  } else if (name === 'next') {
    state.line = 0;
    navigate('S03');
  } else if (name === 'dialogue') {
    if (clip.id === 'exit' || (clip.id === 'entry' && time < clip.duration)) return;
    playClip('exit', () => {
      if (state.line + 1 < MotionDemo.dialogue.length) {
        state.line++;
        playClip('entry');
      } else navigate('S04');
    });
  } else if (name === 'clap' || name === 'rabbit') playClip(name);
  else if (name === 'theater') {
    if (value === '0') navigate('T03');
    else {
      state.notice = value === '1' ? '回顾入口 · 已选中' : '轶事入口 · 已选中';
      paint();
    }
  }
}
function renderCards(kind, target) {
  for (const item of examples.filter((entry) => entry.kind === kind)) {
    const card = document.createElement('article');
    card.className = 'example-card';
    const button = document.createElement('button');
    button.className = 'example-open';
    button.setAttribute('aria-label', '体验' + item.name);
    button.dataset.example = item.id;
    const media = document.createElement('div');
    media.className = 'example-media';
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    canvas.setAttribute('aria-hidden', 'true');
    const tag = document.createElement('span');
    tag.className = 'example-id';
    tag.textContent = item.id;
    const playIcon = document.createElement('span');
    playIcon.className = 'example-play';
    playIcon.textContent = '体验 ↗';
    media.append(canvas, tag, playIcon);
    const body = document.createElement('div');
    body.className = 'example-body';
    const title = document.createElement('h3');
    title.textContent = item.name;
    const summary = document.createElement('p');
    summary.textContent = item.summary;
    body.append(title, summary);
    button.append(media, body);
    card.append(button);
    $(target).append(card);
    button.onclick = () => open(item.id);
    const entry = item.clips[0];
    MotionDemo.render(
      canvas,
      item,
      entry,
      kind === 'transition' ? entry.duration * 0.32 : entry.duration,
      {},
    );
  }
}
$('play').onclick = () => (playing ? pause() : play());
$('replay').onclick = () => playClip(clip.id);
$('previous-frame').onclick = () => seek(time - 1 / 60);
$('next-frame').onclick = () => seek(time + 1 / 60);
$('timeline-unit').onclick = () => { timelineFrames = !timelineFrames; renderTimeline(); };
$('close-viewer').onclick = () => $('viewer').close();
$('viewer').addEventListener('close', () => {
  pause();
  complete = null;
});
$('back').onclick = () => {
  complete = null;
  load(trail.pop());
};
$('close-handoff').onclick = () => $('handoff').close();
$('close-original').onclick = () => $('original-viewer').close();
$('original-viewer').addEventListener('close', () => {
  originalVisibility(false);
  $('original-frame').removeAttribute('src');
  originalSelection = null;
});
$('original-frame').addEventListener('load', () => originalVisibility(hostVisible && !document.hidden));
$('close-assets').onclick = () => $('asset-viewer').close();
$('original-assets').onclick = async () => {
  const id = originalSelection.id;
  $('asset-grid').replaceChildren();
  $('asset-status').textContent = '正在读取独立素材…';
  $('asset-viewer').showModal();
  try {
    const response = await fetch('/ui-motion/original-reference?id=' + id);
    if (!response.ok) throw Error('素材清单读取失败');
    const reference = await response.json();
    if (!$('asset-viewer').open) return;
    for (const asset of reference.assets) {
      const link = document.createElement('a');
      link.href = asset.url;
      link.target = '_blank';
      link.rel = 'noopener';
      if (['.png', '.webp', '.jpg', '.svg'].some(ext => asset.path.endsWith(ext))) {
        const image = document.createElement('img');
        image.src = asset.url;
        image.alt = asset.path;
        image.loading = 'lazy';
        link.append(image);
      }
      const name = document.createElement('span');
      name.textContent = asset.path.split('/').slice(-2).join('/');
      link.append(name);
      $('asset-grid').append(link);
    }
    $('asset-status').textContent = '独立素材 ' + reference.assets.length + ' 份 · 点开看原图 · 与演示共用';
  } catch {
    $('asset-status').textContent = '素材清单读取失败，请关闭后重新打开。';
  }
};
document.querySelectorAll('[data-library]').forEach(button => {
  button.onclick = () => setLibrary(button.dataset.library);
});
$('use-original').onclick = () => {
  const item = originalSelection;
  $('prompt').value = [
    '请参考图片 UI「' + item.id + ' ' + item.name + '」为我的游戏制作 UI 演示。',
    '先读取本机 Maker 控制台图片 UI 参考包：' + location.origin + '/ui-motion/original-reference?id=' + item.id,
    '复用本次 Maker 画布生成/分离的 UI 设计、人物、布局和时间轴；保留原设计风格。',
    '先读 manifest、UI.json、S01–S05NativeDemo.lua、NativeAttack.lua 和 NativeTransitions.lua；将独立 PNG 按 path 放入游戏。',
    '网页从同一套 PNG 和 UI.json 渲染，时间线从原生 Lua 导出；游戏接入以 Lua 和可编辑 UI.json 为准。',
    '不得使用视频、整屏参考截图、原视频抽帧或原帧人物序列。图片部件、文字、交互和动效须分别实现。',
    '先研究源码、关联界面及 manifest 的交互边界，再适配真实项目节点；保留连点保护、暂停、倒退和销毁行为。',
    'S01 双角色入场与背景推近是补充设计；S02 使用六幅生成姿态与光效，S04 使用二维轨迹网格，均为二维动作近似。',
    'S05 为制作中的交互原型，背景分离、开幕帘和齿轮图标未完成；其它角色全身、后续台词、地图和章节业务按 manifest 的边界处理。',
    '保留本次图片 UI 的设计与素材，不使用 NanoVG 绘制示例替换。不要接入真实扣费、发奖、存档或账号操作。',
  ].join(String.fromCharCode(10));
  $('handoff').showModal();
  $('copy-status').textContent = '';
};
$('use').onclick = () => {
  const online = !standalone && (location.protocol === 'http:' || location.protocol === 'https:');
  const lines = [
    '请参考 NanoVG 绘制示例「' + current.id + ' ' + current.name + '」制作 UI 演示。',
    online
      ? '先读取本机 Maker 控制台参考包：' +
        location.origin +
        '/ui-motion/reference?id=' +
        current.id
      : '请读取我提供的 maker-ui-motion HTML 文件；其中包含完整演示源码和时间线。',
    '参考包内 demo.html 可独立运行，motion.json 是实际预览使用的时间线与交互契约；先阅读源码再适配真实 UI 节点。',
    '本次动效：' + current.clips.map((item) => item.label).join('、') + '。',
    '交互：' + current.interaction,
    '实现时保留入场、反馈、退出和重复触发状态；参考包是网页示例，不假设项目已有同名函数。',
    'Maker 接入：' +
      Object.entries(contract.native)
        .map(([key, value]) => key + '：' + value)
        .join('；'),
    '先完成一个可操作 Demo，再逐项优化美术。不要接入真实扣费、发奖、存档或账号操作。',
  ];
  $('prompt').value = lines.join(String.fromCharCode(10));
  $('handoff').showModal();
  $('copy-status').textContent = '';
};
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('prompt').value);
    $('copy-status').textContent = '已复制，发给你的 AI 即可。';
  } catch (_) {
    $('prompt').focus();
    $('prompt').select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_) {}
    $('copy-status').textContent = copied
      ? '已复制，发给你的 AI 即可。'
      : '自动复制未完成，请复制选中的指令。';
  }
};
document.addEventListener('keydown', (event) => {
  if (!$('viewer').open || $('handoff').open || event.target.closest('input,textarea,select'))
    return;
  if (
    current.id === 'S01' &&
    ['ArrowUp', 'ArrowDown'].includes(event.key) &&
    clip.id !== 'confirm'
  ) {
    event.preventDefault();
    focusMenu(((state.focus || 0) + (event.key === 'ArrowDown' ? 1 : 2)) % 3);
  } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    seek(time + (event.key === 'ArrowRight' ? 1 : -1) / 60);
  } else if (event.code === 'Space' && !event.target.closest('button,a,summary')) {
    event.preventDefault();
    playing ? pause() : play();
  }
});
window.addEventListener('message', (event) => {
  if (
    event.origin === location.origin &&
    event.source === window.parent &&
    event.data?.type === 'maker:motion-visibility'
  ) {
    hostVisible = event.data.visible === true;
    if (!hostVisible) pause();
    originalVisibility(hostVisible);
    $('local-frame').contentWindow?.postMessage({type:'maker:motion-visibility',visible:hostVisible},location.origin);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  originalVisibility(hostVisible && !document.hidden);
  $('local-frame').contentWindow?.postMessage({type:'maker:motion-visibility',visible:hostVisible && !document.hidden},location.origin);
});
window.addEventListener('pagehide', pause);
if (localSamples.length) renderLocalCards();
else {
  renderCards('scene', 'scenes');
  renderCards('transition', 'transitions');
}
setLibrary('vector');
if (!standalone) renderOriginalCards();
if (standalone) {
  document.querySelector('.library-variants').hidden = true;
  $('use').textContent = 'AI 接入说明';
  $('download').hidden = true;
}
if (initialExample && find(initialExample)) open(initialExample);
`;
