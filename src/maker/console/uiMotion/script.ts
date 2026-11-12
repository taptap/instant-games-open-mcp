export const uiMotionScript = String.raw`
const $ = (id) => document.getElementById(id);
const find = (id) => examples.find((item) => item.id === id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let timelineFrames = false;
let localSelection;
for (const [kind, title] of [['source', 'LuaTween.lua · 源码'], ['readme', 'LuaTween · 使用说明']]) {
  $('library-' + kind).onclick = event => {
    event.preventDefault();
    $('library-title').textContent = title;
    $('library-content').textContent = luaTweenReading[kind];
    $('library-viewer').showModal();
    $('library-content').scrollTop = 0;
  };
}
$('close-library').onclick = () => $('library-viewer').close();
function luaTweenHandoff() {
  return [
    '将选中的动效接入当前游戏已有 UI；只有我明确要求整套示例时才导入完整界面。目标项目或控件不明确时，先问接到哪里，不要让我选择技术方案。',
    standalone
      ? '读取我提供的离线 HTML：luaTweenLibrary 标识库版本，luaTweenDocs 包含库 README、API 与接入指南，LuaMotion 初始化参数含实际 Lua 源码。'
      : '先读取当前演示接入参考包：'+location.origin+'/ui-motion/runtime-reference。files 是 {path,content} 文件列表，assets 是素材地址与 SHA-256；不是已经安装到游戏的文件。',
    '按 taptap-maker-local 的 LuaTween UI Integration 指引接入；未安装该 Skill 时直接阅读参考包 '+luaTweenLibrary.integration+'，无需用户安装 Skill。',
    '先读 '+luaTweenLibrary.readme+' 与源码顶部使用注释，详细 API 见 '+luaTweenLibrary.api+'；运行代码来源 '+luaTweenLibrary.source+'，commit '+luaTweenLibrary.commit+'；随包仅补使用注释，文件 SHA-256 '+luaTweenLibrary.sha256+'。项目已有原版不能仅因注释导致的哈希不同就重复安装。',
    '接入前先做防重复检查：搜索整个目标项目的 LuaTween 源码、require 路径（含别名或封装）、LuaTween.Update(dt) 更新入口，以及目标控件已有的动效与事件绑定；不能只凭 scripts/LuaTween.lua 不存在就判定未接入。',
    '已接入且相同或确认兼容时，复用现有模块路径、统一更新入口与控件绑定，不重复复制库、添加调度器或绑定同一事件；部分接入只补缺失环节，同一指令重复执行也不能叠加接入。不兼容时说明冲突并确认处理方式，不覆盖用户代码。确认未接入时才将参考包 '+luaTweenLibrary.path+' 放入游戏 scripts/（已有目录规范则沿用），require("LuaTween") 使用。',
    '只取所选效果需要的 Lua 配方与适配代码；仅使用动效时保留现有美术，不导入全部皮肤、演示入口或 Fengari。实际调用原版 To/Value/Path/Sequence，禁止 JS 移植、手写缓动或仅补间时钟。',
    '接入实际控件事件和项目统一 LuaTween.Update(dt)；重触发与关闭只清理该组件的句柄，不用 KillAll/Clear，不覆盖 main.lua。',
    '在目标游戏实际操作：触发、连点、动画中关闭、重新打开；检查布局、命中、暂停和其它动效。联网项目沿用联网预览，不能只靠单元测试或截图宣称通过。',
    '最后告诉我效果接到了哪里、怎样触发、LuaTween 和接入代码的位置及验证结果；不要让我手动安装库。不要发布、提交、远端构建或调用付费生成。',
    '若控制台链接失效，用当前 Maker CLI console status/open --no-open --json 找到新地址并核对库版本；跨电脑 AI 使用下载的接入参考包，素材使用包内稳定地址并校验 SHA-256。',
  ];
}
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
  $('close-lab').onclick = () => $('local-viewer').close();
  $('local-viewer').addEventListener('close',()=>{
    clearTimeout(labLoadTimer);
    $('local-loading').hidden = true;
    $('use-local').disabled = false;
    $('local-handoff-status').textContent = '';
    if (!$('local-viewer').open) $('local-frame').removeAttribute('src');
  });
  $('use-local').onclick = () => {
    if (!localSelection) return;
    const frame = $('local-frame').contentWindow;
    let lab, snapshot;
    try {
      lab = frame?.MotionLab;
      snapshot = localSelection.kind === 'lab' ? lab?.state() : frame?.NanoVGShowcase?.getState();
    } catch { snapshot = undefined; }
    if (!snapshot) {
      $('local-handoff-status').textContent = '演示尚未加载完成，请等待后再选用；加载失败时关闭后重开。';
      return;
    }
    $('local-handoff-status').textContent = '';
    let selection;
    if (localSelection.kind === 'lab') {
      const skin = lab.skins.find(item => item.id === snapshot.ui.skin);
      const effect = lab.catalog.categories.flatMap(group => group.items).find(item => item.id === snapshot.id);
      selection = [
        '请接入当前选中的 LuaTween 动效：'+effect.title+'（'+effect.id+'）；参考皮肤：'+skin.name+'（'+skin.id+'）。',
        '效果源码 scripts/MotionLabRecipes.lua；所选阶段时序见 assets/ui/motion-lab-v1/catalog.json。默认只复用该效果，不移植整个工坊。',
        '如需复用示例 UI，先读 assets/ui/motion-lab-v2/README.md；在 assets/ui/motion-lab-v2/designs.json 中按皮肤 id '+skin.id+' 查找布局，对应生成数据为 scripts/MotionLabDesign.lua。保留分层与文字，不改成整屏截图热区。',
        '径向菜单、弹性回弹和磁铁拖拽在示例中为自动演示，真实输入需接到项目控件。',
      ];
    } else {
      selection = [
        '请接入当前选中的 LuaTween UI 动效：界面 '+snapshot.scene+'，片段 '+snapshot.clip+'。以当前选择为准，不是最初打开的演示卡片。',
        '读取 assets/ui/nanovg-showcase-v1/showcase.json 中该片段对应的 motion/*.json 与 UI.json；绘制与宿主参考 scripts/NanoVGShowcase.lua。',
        '只复用所选效果；需要整套示例 UI 时才引入其独立 PNG 和 NanoVG 布局，不改写项目入口。',
      ];
    }
    $('prompt').value = [...selection, ...luaTweenHandoff()].join(String.fromCharCode(10));
    $('copy-status').textContent=''; $('handoff').showModal();
  };
}
let labLoadTimer;
function loadMotionLab() {
  clearTimeout(labLoadTimer);
  const loading = $('local-loading');
  loading.hidden = false; loading.dataset.state = 'loading';
  loading.querySelector('span').textContent = '正在打开更多动效…';
  $('retry-local').hidden = true; $('use-local').disabled = true;
  const previous = $('local-frame'), frame = previous.cloneNode(false);
  frame.removeAttribute('src'); previous.replaceWith(frame);
  frame.src = motionLab.entry;
  labLoadTimer = setTimeout(() => {
    loading.dataset.state = 'error';
    loading.querySelector('span').textContent = '打开超时，请检查网络后重新加载。';
    $('retry-local').hidden = false;
  }, 60000);
}
if (motionLab) {
  $('retry-local').onclick = loadMotionLab;
  $('open-motion-lab').onclick = () => {
    pause(); localSelection = {...motionLab,kind:'lab'};
    $('local-viewer').dataset.kind = 'lab';
    $('local-title').textContent = '更多动效'; $('open-local').hidden = true;
    loadMotionLab(); $('local-viewer').showModal();
  };
  window.addEventListener('message',event=>{
    if (event.origin === location.origin && event.source === $('local-frame').contentWindow &&
        $('local-viewer').open && $('local-viewer').dataset.kind === 'lab' &&
        event.data?.type === 'maker:motion-lab-loading' && $('local-loading').dataset.state !== 'error') {
      clearTimeout(labLoadTimer);
      $('local-loading').hidden = true;
      $('use-local').disabled = event.data.state !== 'ready';
    }
    if (event.origin === location.origin && event.source === $('local-frame').contentWindow &&
        event.data?.type === 'maker:motion-lab-back') $('local-viewer').close();
  });
}
if (localSamples.length || motionLab) setupLocalViewer();
let originalSelection;
let originalLoadTimer;
function originalLoading(state, message) {
  clearTimeout(originalLoadTimer);
  const loading = $('original-loading');
  loading.hidden = state === 'ready';
  loading.dataset.state = state;
  loading.querySelector('span').textContent = message;
  $('retry-original').hidden = state !== 'error';
  $('use-original').disabled = state !== 'ready';
  $('original-frame').setAttribute('aria-busy', String(state === 'loading'));
  if (state === 'loading') originalLoadTimer = setTimeout(() => {
    originalLoading('error', '加载长时间无进展，请检查网络后重试。');
    $('original-frame').removeAttribute('src');
  }, 60000);
}
function setLibrary(variant) {
  pause();
  $('original-library').hidden = variant !== 'original';
  $('vector-library').hidden = variant !== 'vector';
  const items = variant === 'vector' ? (localSamples.length ? localSamples : examples) : originals;
  const count = kind => String(items.filter(item => item.kind === kind).length).padStart(2, '0');
  document.querySelector('.page-heading .index').textContent = count('scene') + ' SCENES / ' + count('transition') + ' TRANSITIONS';
  document.querySelectorAll('[data-library]').forEach(button =>
    button.setAttribute('aria-pressed', String(button.dataset.library === variant)));
  if (variant === 'original') nextThumbnail();
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
  const frame = $('original-frame');
  const replacement = frame.cloneNode(false);
  replacement.src = item.entry;
  replacement.addEventListener('load', () => originalVisibility(hostVisible && !document.hidden));
  frame.replaceWith(replacement);
  originalLoading('loading', '正在准备演示…首次使用需要下载素材');
  if (!$('original-viewer').open) $('original-viewer').showModal();
}
const thumbnailQueue = [];
const thumbnailCandidates = new Map();
const thumbnailObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const preview = thumbnailCandidates.get(entry.target);
    if (!preview) continue;
    thumbnailCandidates.delete(entry.target);
    thumbnailObserver.unobserve(entry.target);
    thumbnailQueue.push(preview);
  }
  nextThumbnail();
}, {rootMargin:'160px'});
let activeThumbnail;
function thumbnailLoading(preview, message) {
  preview.loading.querySelector('span').textContent = message;
  clearTimeout(preview.timer);
  preview.timer = setTimeout(() => finishThumbnail('加载长时间无进展，请检查网络后重试。'), 60000);
}
function finishThumbnail(error, image) {
  const preview = activeThumbnail;
  if (!preview) return;
  clearTimeout(preview.timer);
  preview.frame.remove();
  preview.media.setAttribute('aria-busy', 'false');
  preview.loading.hidden = !error;
  preview.loading.dataset.state = error ? 'error' : 'ready';
  preview.loading.querySelector('span').textContent = error ? '预览加载失败，可重试或直接体验' : '';
  preview.loading.title = error || '';
  preview.retry.hidden = !error;
  if (image) preview.media.prepend(image);
  activeThumbnail = null;
  nextThumbnail();
}
function nextThumbnail() {
  if (activeThumbnail || $('original-library').hidden) return;
  const next = thumbnailQueue.shift();
  if (!next) return;
  activeThumbnail = next;
  const frame = document.createElement('iframe');
  frame.title = next.item.name + '实际分层渲染预览';
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  next.frame = frame;
  next.loading.hidden = false;
  next.loading.dataset.state = 'loading';
  next.media.setAttribute('aria-busy', 'true');
  next.media.prepend(frame);
  thumbnailLoading(next, '正在加载预览…首次使用需要下载素材');
  frame.src = next.item.preview;
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
      const loading = document.createElement('div');
      loading.className = 'motion-loading';
      loading.setAttribute('role', 'status');
      const label = document.createElement('span');
      label.textContent = '等待加载预览…';
      loading.append(label);
      media.append(loading);
      const retry = document.createElement('button');
      retry.className = 'preview-retry';
      retry.textContent = '重试预览';
      retry.setAttribute('aria-label', '重试预览：' + item.name);
      retry.hidden = true;
      const preview = {item, media, loading, retry};
      retry.onclick = () => {
        retry.hidden = true;
        loading.dataset.state = 'loading';
        label.textContent = '等待重新加载…';
        thumbnailQueue.unshift(preview);
        nextThumbnail();
      };
      card.append(retry);
      thumbnailCandidates.set(media, preview);
      thumbnailObserver.observe(media);
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
    card.prepend(button);
    $(item.kind === 'scene' ? 'original-scenes' : 'original-transitions').append(card);
    button.onclick = () => openOriginal(item);
  }
  if (originals.some(item => !item.available))
    $('original-note').textContent = '项目素材包尚未接入；请配置本机实战项目目录后重新打开。';
  nextThumbnail();
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === 'maker:motion-loading' && typeof event.data.message === 'string') {
    if (originalSelection && $('original-loading').dataset.state === 'loading' && event.source === $('original-frame').contentWindow &&
        event.data.id === originalSelection.id && ['loading','ready','error'].includes(event.data.state)) {
      originalLoading(event.data.state, event.data.message);
    } else if (activeThumbnail && event.source === activeThumbnail.frame.contentWindow &&
        event.data.id === activeThumbnail.item.id && event.data.state === 'loading') {
      thumbnailLoading(activeThumbnail, event.data.message);
    }
    return;
  }
  if (!['maker:motion-thumbnail','maker:motion-thumbnail-error'].includes(event.data?.type)) return;
  const preview = activeThumbnail;
  if (!preview || event.source !== preview.frame.contentWindow || event.data.id !== preview.item.id) return;
  if (event.data.type === 'maker:motion-thumbnail-error') {
    finishThumbnail(event.data.message || '素材加载失败');
    return;
  }
  if (typeof event.data.image !== 'string' || !event.data.image.startsWith('data:image/png;base64,')) return;
  const image = document.createElement('img');
  image.src = event.data.image;
  image.alt = preview.frame.title;
  finishThumbnail(null, image);
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
$('retry-original').onclick = () => { if (originalSelection) openOriginal(originalSelection); };
$('original-viewer').addEventListener('close', () => {
  clearTimeout(originalLoadTimer);
  $('original-handoff-status').textContent = '';
  originalVisibility(false);
  $('original-frame').removeAttribute('src');
  originalSelection = null;
});
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
      link.href = reference.assetBase + asset.path;
      link.target = '_blank';
      link.rel = 'noopener';
      if (['.png', '.webp', '.jpg', '.svg'].some(ext => asset.path.endsWith(ext))) {
        const image = document.createElement('img');
        image.src = link.href;
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
  let snapshot;
  try { snapshot = $('original-frame').contentWindow?.nativeDemo?.getState(); }
  catch { snapshot = undefined; }
  if (!snapshot) {
    $('original-handoff-status').textContent = '演示尚未加载完成，请等待后再选用；加载失败时关闭后重开。';
    return;
  }
  $('original-handoff-status').textContent = '';
  const item = originals.find(example => example.id === snapshot.example) || originalSelection;
  $('prompt').value = [
    '请接入图片 UI「' + item.id + ' ' + item.name + '」的 LuaTween 动效。',
    '演示当前选择：角色 '+snapshot.focused+'，章节 '+snapshot.chapter+(snapshot.effect ? '，反馈 '+snapshot.effect : '')+'；仅作表现参考，不导入演示游戏业务。',
    '先读取本机 Maker 控制台图片 UI 参考包：' + location.origin + '/ui-motion/original-reference?id=' + item.id,
    '仅使用动效时保留游戏现有 UI；明确复用示例界面时才导入其独立 PNG、布局与文字，保留已选设计。',
    '先读 manifest 与所选场景的共享 Lua 配方；完整界面才需要 UI.json、对应场景脚本及独立 PNG，不要导入无关文件。',
    '必须使用原版 LuaTween.lua；Motion.lua、ClipPlayer.lua 仅在所选配方需要时引入。完整实际源码：'+location.origin+'/ui-motion/runtime-reference。',
    '网页与原生从同一份时间线生成 Lua 属性配方，使用同一套 PNG 和 UI.json；游戏接入以 Lua 和可编辑 UI.json 为准。',
    '不得使用视频、整屏参考截图、原视频抽帧或原帧人物序列。图片部件、文字、交互和动效须分别实现。',
    '先研究源码、关联界面及 manifest 的交互边界，再适配真实项目节点；保留连点保护、暂停、倒退和销毁行为。',
    'S01 双角色入场与背景推近是补充设计；S02 使用六幅生成姿态与光效，属于二维动作近似，不是骨骼动画。',
    '后续台词、地图和章节业务按 manifest 的边界处理；不得将演示交互误称为已接入真实游戏业务。',
    ...luaTweenHandoff(),
  ].join(String.fromCharCode(10));
  $('handoff').showModal();
  $('copy-status').textContent = '';
};
$('use').onclick = () => {
  const online = !standalone && (location.protocol === 'http:' || location.protocol === 'https:');
  const lines = [
    '请将 NanoVG 绘制示例「' + current.id + ' ' + current.name + '」的所选动效接入现有 UI。',
    online
      ? '先读取本机 Maker 控制台参考包：' +
        location.origin +
        '/ui-motion/reference?id=' +
        current.id
      : '请读取我提供的 maker-ui-motion HTML 文件；其中包含完整演示源码和时间线。',
    '参考包内 demo.html 可独立运行，motion.json 是实际预览使用的时间线与交互契约；先阅读源码再适配真实 UI 节点。',
    '当前片段：' + clip.id + '（' + clip.label + '）。只接入当前选择，不默认导入全部片段。',
    '交互：' + current.interaction,
    '实现时保留入场、反馈、退出和重复触发状态；参考包是网页示例，不假设项目已有同名函数。',
    'Maker 接入：' +
      Object.entries(contract.native)
        .map(([key, value]) => key + '：' + value)
        .join('；'),
    '保留游戏现有美术与业务，不增加演示中的扣费、发奖、存档或账号操作。',
    ...luaTweenHandoff(),
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
