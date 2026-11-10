(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id),
    canvas = $('screen'),
    ctx = canvas.getContext('2d'),
    M = DATA.manifest,
    images = {},
    trees = DATA.trees;
  const params = new URLSearchParams(location.search),
    thumbnail = params.has('thumbnail'),
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (params.has('embed') && !thumbnail) document.body.classList.add('embedded');
  const S = {
    scene: 'S01',
    clip: 'S01.entry',
    time: 0,
    playing: false,
    inspect: false,
    transitionDemo: false,
    selected: 1,
    character: 0,
    chapter: 1,
    line: 0,
    auto: false,
    autoClock: 0,
    idle: true,
    beacon: true,
    idleClock: 0,
    pressed: null,
    modal: null,
    reference: false,
    unit: 'seconds',
    key: null,
  };
  const scene = (id) => M.scenes.find((x) => x.id === id),
    clip = () => DATA.clips[S.clip],
    walk = (n, f) => {
      f(n);
      (n.children || []).forEach((x) => walk(x, f));
    };
  const indexes = {};
  for (const [id, tree] of Object.entries(trees)) {
    indexes[id] = new Map();
    walk(tree, (n) => indexes[id].set(n.id, n));
  }
  // Image.decode() can stall in a hidden embedded WebView; load also works before the dialog opens.
  for (const [path, src] of Object.entries(DATA.images)) {
    const im = new Image();
    await new Promise((resolve, reject) => {
      im.onload = resolve;
      im.onerror = () => reject(new Error('Cannot load image: ' + path));
      im.src = src;
    });
    images[path] = im;
  }
  for (const [path, src] of Object.entries(DATA.fonts)) {
    const font = new FontFace(path, 'url(' + src + ')');
    await font.load();
    document.fonts.add(font);
  }
  window.UrhoxAssets = { loadImage: (path) => images[path] };
  const app = { draw: () => render() };
  function sample(q, t) {
    return LuaMotion.sample(q, t);
  }
  function posesFor(id) {
    const base = sample(DATA.clips[scene(id).entry], 30);
    if (clip().category !== 'transition' && id === S.scene)
      Object.assign(base, sample(clip(), S.time));
    return base;
  }
  function visible(n, id) {
    if (n.id === 'modal') return !!S.modal;
    if (n.id === 'setting-motion' || n.id === 'setting-beacon') return S.modal?.kind === 'settings';
    if (n.id === 'beacon') return S.beacon;
    let m = /^menu([1-3])-selected$/.exec(n.id);
    if (m) return +m[1] === S.selected;
    m = /^portrait([1-3])-selected$/.exec(n.id);
    if (m) return +m[1] === S.character + 1;
    m = /^chapter([1-3])-selected$/.exec(n.id);
    if (m) return +m[1] === S.chapter;
    if (n.id === 'attack')
      return clip().category === 'interaction' && !!clip().skill && id === 'S02';
    if (['slash', 'flash', 'fragments', 'ring'].includes(n.id) && clip().skill) {
      const k = clip().skill;
      return (
        n.id === 'ring' ||
        (k === 1 ? n.id === 'slash' : k === 2 ? n.id !== 'slash' : n.id !== 'ring')
      );
    }
    if (n.id === 'wipe') return clip().style === 'slab';
    if (n.id === 'transition-slash') return clip().style === 'slash';
    if (n.id === 'transition-cards') return clip().style === 'cards';
    if (n.id.startsWith('wipe-')) return n.id === 'wipe-' + clip().style;
    return n.visible !== false;
  }
  function nodeText(n) {
    if (n.id === 'modal-title') return S.modal?.title || '';
    if (n.id === 'modal-body') return S.modal?.body || '';
    if (n.id === 'character-name' || n.id === 'speaker') return M.characters[S.character].name;
    if (n.id === 'character-role') return M.characters[S.character].role;
    if (n.id === 'dialogue-text') return M.dialogue[S.line];
    if (n.id === 'auto-label') return S.auto ? '▷ AUTO ON' : '▷ AUTO';
    if (n.id === 'setting-motion-text') return '待机动画：' + (S.idle ? '开' : '关');
    if (n.id === 'setting-beacon-text') return '灯塔光芒：' + (S.beacon ? '开' : '关');
    return n.text || '';
  }
  const hitButtons = new Map();
  let hitScene = '',
    touchKey = '';
  function buildHits(id) {
    if (hitScene === id) return;
    hitScene = id;
    hitButtons.clear();
    $('hits').replaceChildren();
    walk(trees[id], (n) => {
      if (n.type !== 'Button') return;
      const b = document.createElement('button');
      b.dataset.control = n.id;
      b.setAttribute(
        'aria-label',
        indexes[id].get(n.id + '-label')?.text ||
          indexes[id].get(n.id + '-text')?.text ||
          {
            menu1: '开始旅程',
            menu2: '旅程设置',
            menu3: '旅行档案',
            portrait1: '选择 NOVA',
            portrait2: '选择 MOSS',
            portrait3: '选择 SOL',
            chapter1: '月光来信',
            chapter2: '齿轮之心',
            chapter3: '最后的魔术',
            'rabbit-button': '礼帽兔子',
            clapper: '场记板',
          }[n.id] ||
          n.id
      );
      b.onpointerenter = () => {
        if (/^menu[1-3]$/.test(n.id) && canInteract()) S.selected = +n.id.slice(-1);
      };
      b.onpointerdown = () => {
        S.pressed = n.id;
        render();
      };
      for (const event of ['pointerup', 'pointercancel', 'pointerleave'])
        b.addEventListener(event, () => {
          S.pressed = null;
          render();
        });
      b.onclick = () => activate(n.id);
      $('hits').append(b);
      hitButtons.set(n.id, b);
    });
  }
  function canInteract() {
    return (
      !S.inspect &&
      !S.reference &&
      clip().category !== 'transition' &&
      !(clip().category === 'entry' && S.time < clip().duration)
    );
  }
  function drawText(n, value, w, h) {
    ctx.fillStyle = n.fontColor || '#fff0cf';
    ctx.font = (n.fontSize || 18) + 'px "' + (n.fontFamily || 'Fonts/Showcase-Serif.ttf') + '"';
    ctx.textBaseline = 'middle';
    ctx.textAlign = n.textAlign || 'left';
    const size = n.fontSize || 18,
      lines = [];
    for (const paragraph of value.split('\n')) {
      let current = '';
      for (const ch of paragraph) {
        if (current && ctx.measureText(current + ch).width > w) {
          lines.push(current);
          current = ch;
        } else current += ch;
      }
      lines.push(current);
    }
    const lh = n.lineHeight || size * 1.45;
    for (let i = 0; i < lines.length; i++)
      ctx.fillText(
        lines[i],
        n.textAlign === 'center' ? w / 2 : n.textAlign === 'right' ? w : 0,
        (h - (lines.length - 1) * lh) / 2 + i * lh
      );
  }
  function drawNode(n, poses, id, parentVisible = true) {
    if (!parentVisible || !visible(n, id)) return;
    const p = poses[n.id] || {},
      w = n.id.startsWith('stat-fill') ? M.characters[S.character].stats[+n.id.slice(-1)] : n.width,
      h = n.height;
    let x = (n.left || 0) + (p.dx || 0),
      y = (n.top || 0) + (p.dy || 0),
      scale = p.scale ?? 1,
      rotation = (n.rotate || 0) + (p.rotation || 0);
    const ready = canInteract();
    if (n.id === 'actor' && S.idle && !S.inspect && ready)
      y += LuaMotion.named('Idle', null, S.idleClock).actor.dy;
    if (n.type === 'Button') {
      if (S.pressed === n.id) scale *= 0.985;
      else if (/^menu[1-3]$/.test(n.id) && +n.id.slice(-1) === S.selected && ready) scale *= 1.025;
    }
    ctx.save();
    ctx.translate(x, y);
    let ox = w / 2,
      oy = h / 2;
    if (n.transformOrigin === 'left') {
      ox = 0;
      oy = h / 2;
    }
    ctx.translate(ox, oy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.translate(-ox, -oy);
    ctx.globalAlpha *= Math.max(0, Math.min(1, (n.opacity ?? 1) * (p.opacity ?? 1)));
    if (n.id === 'beacon')
      ctx.globalAlpha *= LuaMotion.named('Idle', null, S.idleClock).beacon.opacity;
    if (n.overflow === 'hidden' || (p.reveal ?? 1) < 1 || (p.revealY ?? 1) < 1) {
      ctx.beginPath();
      ctx.rect(0, 0, w * (p.reveal ?? 1), h * (p.revealY ?? 1));
      ctx.clip();
    }
    if (n.backgroundColor) {
      ctx.fillStyle = n.backgroundColor;
      ctx.fillRect(0, 0, w, h);
    }
    let path = n.backgroundImage;
    if (n.id === 'actor' && (id === 'S02' || id === 'S03')) path = M.characters[S.character].image;
    if (path) {
      const im = images[path],
        s =
          n.backgroundFit === 'contain'
            ? Math.min(w / im.width, h / im.height)
            : Math.max(w / im.width, h / im.height);
      ctx.drawImage(
        im,
        (w - im.width * s) / 2,
        (h - im.height * s) / 2,
        im.width * s,
        im.height * s
      );
    }
    if (n.id.startsWith('stat-fill')) {
      const width = M.characters[S.character].stats[+n.id.slice(-1)];
      ctx.beginPath();
      ctx.rect(0, 0, width, h);
      ctx.clip();
    }
    if (n.type === 'NanoVG')
      window.UrhoxNanoVG.render(ctx, Object.assign({}, n, { _layout: { x: 0, y: 0, w, h } }), app);
    if (n.type === 'Label') {
      let text = nodeText(n);
      if (n.id === 'dialogue-text' && clip().category === 'entry') text = '';
      if (p.textProgress !== undefined)
        text = Array.from(text)
          .slice(0, Math.floor(Array.from(text).length * p.textProgress + 1e-9))
          .join('');
      drawText(n, text, w, h);
    }
    if (n.type === 'Button' && id === hitScene) {
      const b = hitButtons.get(n.id),
        matrix = ctx.getTransform(),
        sx = $('hits').clientWidth / 1280,
        sy = $('hits').clientHeight / 720;
      b.hidden = false;
      b.style.width = w + 'px';
      b.style.height = h + 'px';
      b.style.transform =
        'matrix(' +
        [
          matrix.a * sx,
          matrix.b * sy,
          matrix.c * sx,
          matrix.d * sy,
          matrix.e * sx,
          matrix.f * sy,
        ].join(',') +
        ')';
      const isModal = n.id.startsWith('modal-') || n.id.startsWith('setting-');
      b.disabled = !ready || (!!S.modal && !isModal);
    }
    for (const c of [...(n.children || [])].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)))
      drawNode(c, poses, id);
    ctx.restore();
  }
  function render() {
    const q = clip(),
      transition = q.category === 'transition',
      visual = transition ? (S.time >= q.swapAt ? q.target : q.source) : S.scene;
    buildHits(visual);
    for (const b of hitButtons.values()) b.hidden = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 1280, 720);
    drawNode(trees[visual], posesFor(visual), visual);
    if (transition) drawNode(DATA.overlay, sample(q, S.time), 'overlay');
    $('time').textContent =
      S.unit === 'frames'
        ? Math.round(S.time * M.fps) + ' / ' + Math.round(q.duration * M.fps) + ' f'
        : S.time.toFixed(2) + ' / ' + q.duration.toFixed(2) + ' s';
    $('play').textContent = S.playing ? '暂停' : '播放';
    $('play').setAttribute('aria-pressed', String(S.playing));
    $('ready').hidden = !S.inspect && !(S.transitionDemo && S.time >= q.duration);
    $('ready').textContent = transition ? '进入界面' : '返回交互';
    document
      .querySelectorAll('.playhead')
      .forEach((n) => (n.style.left = Math.min(100, (S.time / q.duration) * 100) + '%'));
    document
      .querySelectorAll('.lane')
      .forEach((n) => n.setAttribute('aria-valuenow', String(S.time)));
    const list = [...hitButtons.values()].filter((b) => !b.hidden && !b.disabled);
    const key =
      visual +
      '|' +
      list.map((b) => b.dataset.control + ':' + b.getAttribute('aria-label')).join('|');
    if (key !== touchKey) {
      touchKey = key;
      $('touch-actions').replaceChildren(
        ...list.map((b) => {
          const x = document.createElement('button');
          x.textContent = b.getAttribute('aria-label');
          x.onclick = () => activate(b.dataset.control);
          return x;
        })
      );
    }
  }
  function setScene(id, entry = true) {
    S.scene = id;
    S.line = 0;
    S.auto = false;
    S.modal = null;
    S.reference = false;
    S.pressed = null;
    S.transitionDemo = false;
    $('reference').hidden = true;
    $('compare').setAttribute('aria-pressed', 'false');
    S.clip = scene(id).entry;
    S.time = entry && !reduced ? 0 : clip().duration;
    S.playing = entry && !reduced;
    S.inspect = false;
    refreshControls();
    render();
  }
  function run(id, transitionDemo = false) {
    S.reference = false;
    $('reference').hidden = true;
    $('compare').setAttribute('aria-pressed', 'false');
    const q = DATA.clips[id];
    if (q.category === 'transition') S.scene = q.source;
    S.transitionDemo = q.category === 'transition' && transitionDemo;
    S.modal = null;
    S.clip = id;
    S.time = 0;
    S.playing = true;
    S.inspect = false;
    S.key = null;
    S.autoClock = 0;
    refreshControls();
    render();
  }
  function ready() {
    if (clip().category === 'transition') {
      setScene(S.time >= clip().swapAt ? clip().target : clip().source, false);
      return;
    }
    S.clip = scene(S.scene).entry;
    S.time = clip().duration;
    S.playing = false;
    S.inspect = false;
    S.key = null;
    refreshControls();
    render();
  }
  function showModal(title, body, kind = 'info') {
    S.modal = { title, body, kind };
    render();
  }
  function nextLine() {
    if (S.clip === 'S03.type' && S.time < clip().duration) {
      S.time = clip().duration;
      S.playing = false;
      render();
      return;
    }
    if (S.line < M.dialogue.length - 1) {
      S.line++;
      run('S03.type');
    } else
      showModal(
        '旅程已准备就绪',
        '同行者：' + M.characters[S.character].name + '\n向着灯塔出发吧。'
      );
  }
  function activate(id) {
    if (!canInteract()) return;
    if (S.modal && !id.startsWith('modal-') && !id.startsWith('setting-')) return;
    let m;
    if (id === 'modal-close') {
      S.modal = null;
      render();
      return;
    }
    if (id === 'modal-action') {
      run(scene(S.scene).entry);
      return;
    }
    if (id === 'setting-motion') {
      S.idle = !S.idle;
      render();
      return;
    }
    if (id === 'setting-beacon') {
      S.beacon = !S.beacon;
      render();
      return;
    }
    if ((m = /^menu([1-3])$/.exec(id))) {
      S.selected = +m[1];
      if (S.selected === 1) run('T01');
      else if (S.selected === 2)
        showModal('旅程设置', '即时切换灯塔光芒与角色待机动画。', 'settings');
      else
        showModal(
          '旅行档案',
          '航海日志 / 第 01 站：灯塔港\n同行者：' + M.characters[S.character].name
        );
    } else if ((m = /^portrait([1-3])$/.exec(id))) {
      S.character = +m[1] - 1;
      run('S02.select');
    } else if ((m = /^skill([1-3])$/.exec(id))) run('S02.skill' + m[1]);
    else if (id === 'story') run('T02');
    else if (id === 'continue') nextLine();
    else if (id === 'auto') {
      S.auto = !S.auto;
      S.autoClock = 0;
      render();
    } else if (id === 'skip') {
      S.line = M.dialogue.length - 1;
      run('S03.type');
      S.time = clip().duration;
      S.playing = false;
    } else if (id === 'back')
      setScene(S.scene === 'S03' ? 'S02' : S.scene === 'S05' ? 'S04' : 'S01');
    else if (id === 'theater1') run('T03');
    else if (id === 'theater2') showModal('往日回顾', 'ACT 01 / 月光来信\n首演记录已收录。');
    else if (id === 'theater3') showModal('剧院轶事', '每一次谢幕，都是下一场魔术的开始。');
    else if (id === 'rabbit-button') run('S04.rabbit');
    else if (id === 'clapper') run('S04.clap');
    else if ((m = /^chapter([1-3])$/.exec(id))) {
      S.chapter = +m[1];
      run(S.chapter === 1 ? 'S05.select' : 'S05.select' + S.chapter);
    } else if (id === 'chapter-enter')
      showModal('即将开演', 'ACT 0' + S.chapter + ' / ' + M.chapters[S.chapter - 1]);
    render();
  }
  function refreshControls() {
    const sc = scene(S.scene),
      ids = [...sc.clips, ...M.transitions.filter((x) => x.source === sc.id).map((x) => x.id)];
    $('animation').replaceChildren(
      ...ids.map((id) => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = DATA.clips[id].name;
        o.selected = id === S.clip;
        return o;
      })
    );
    $('heading').textContent = sc.game + ' / ' + sc.name;
    document
      .querySelectorAll('[data-scene]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === S.scene)));
    $('compare').disabled = clip().category === 'transition' || !DATA.references[S.scene];
    buildTimeline();
  }
  function locate(t, key) {
    S.time = Math.max(0, Math.min(clip().duration, t));
    S.playing = false;
    S.inspect = true;
    S.key = key || null;
    S.auto = false;
    S.pressed = null;
    document
      .querySelectorAll('.keyframe')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
    if (!key)
      $('key-detail').textContent =
        '定位预览 · ' +
        (S.unit === 'frames' ? Math.round(S.time * M.fps) + ' f' : S.time.toFixed(2) + ' s') +
        ' · 返回交互后继续体验';
    render();
  }
  function buildTimeline() {
    const q = clip();
    $('clip-name').textContent = q.name;
    $('timeline-body').replaceChildren();
    const rulerRow = document.createElement('div');
    rulerRow.className = 'ruler-row';
    const caption = document.createElement('span');
    caption.className = 'track-name';
    caption.textContent = S.unit === 'frames' ? '60 FPS / 帧' : '时间 / 秒';
    const ruler = document.createElement('div');
    ruler.className = 'ruler';
    for (let i = 0; i <= 4; i++) {
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.style.left = i * 25 + '%';
      tick.textContent =
        S.unit === 'frames'
          ? Math.round((q.duration * M.fps * i) / 4) + 'f'
          : ((q.duration * i) / 4).toFixed(2) + 's';
      ruler.append(tick);
    }
    rulerRow.append(caption, ruler);
    $('timeline-body').append(rulerRow);
    const groups = q.nodes.map((node) => ({
      node,
      tracks: q.tracks.filter((t) => t.node === node.id),
    }));
    if (q.category === 'transition')
      groups.unshift({
        node: { id: 'scene-change', name: '界面切换' },
        tracks: [],
        events: q.cues || [
          { time: q.covered[0], label: '遮场完成' },
          { time: q.swapAt, label: q.source + ' → ' + q.target + ' · 遮挡中换页' },
          { time: q.covered[1], label: '开始揭开目标界面' },
        ],
      });
    for (const { node: n, tracks, events } of groups) {
      const points = new Map();
      for (const t of tracks)
        for (const [at, value] of [
          [t.at, t.from],
          [t.at + t.duration, t.to],
        ]) {
          const key = at.toFixed(5);
          if (!points.has(key)) points.set(key, { time: at, props: {} });
          points.get(key).props[t.prop] = value;
        }
      for (const event of events || []) points.set(event.time.toFixed(5), { ...event, props: {} });
      const row = document.createElement('div');
      row.className = 'track-row';
      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = n.name || n.id;
      name.title = n.id;
      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.tabIndex = 0;
      lane.role = 'slider';
      lane.setAttribute('aria-label', (n.name || n.id) + '时间定位');
      lane.setAttribute('aria-valuemin', '0');
      lane.setAttribute('aria-valuemax', String(q.duration));
      lane.onclick = (e) => {
        if (e.target.closest('button')) return;
        const b = lane.getBoundingClientRect();
        locate(((e.clientX - b.left) / b.width) * q.duration);
      };
      lane.onkeydown = (e) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          locate(
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? q.duration
                : S.time + (e.key === 'ArrowLeft' ? -1 : 1) / M.fps
          );
        }
      };
      const times = [...points.values()].sort((a, b) => a.time - b.time);
      if (times.length) {
        const seg = document.createElement('i');
        seg.className = 'segment';
        seg.style.left = (times[0].time / q.duration) * 100 + '%';
        seg.style.width = ((times.at(-1).time - times[0].time) / q.duration) * 100 + '%';
        lane.append(seg);
      }
      const head = document.createElement('i');
      head.className = 'playhead';
      lane.append(head);
      for (const p of times) {
        const b = document.createElement('button');
        b.className = 'keyframe';
        b.style.left = (p.time / q.duration) * 100 + '%';
        b.dataset.key = n.id + '@' + p.time;
        const values =
            p.label ||
            Object.entries(p.props)
              .map(([k, v]) => k + ' ' + Number(v.toFixed(2)))
              .join(' · '),
          label =
            (n.name || n.id) +
            ' / ' +
            Math.round(p.time * M.fps) +
            ' f / ' +
            p.time.toFixed(2) +
            ' s / ' +
            values;
        b.title = label;
        b.setAttribute('aria-label', label);
        b.setAttribute('aria-pressed', 'false');
        b.onclick = (e) => {
          e.stopPropagation();
          locate(p.time, b.dataset.key);
          $('key-detail').textContent = label;
        };
        lane.append(b);
      }
      row.append(name, lane);
      $('timeline-body').append(row);
    }
    $('key-detail').textContent =
      q.category === 'transition'
        ? '遮场 → 遮挡中换页 → 揭开 · 点击关键帧检查'
        : '点击菱形查看姿态 · ← → 逐帧定位';
  }
  for (const sc of M.scenes) {
    const b = document.createElement('button');
    b.textContent = sc.name;
    b.dataset.scene = sc.id;
    b.onclick = () => setScene(sc.id);
    $('scene-nav').append(b);
  }
  $('animation').onchange = (e) => run(e.target.value, true);
  $('replay').onclick = () => run(S.clip, S.transitionDemo);
  $('play').onclick = () => {
    if (S.time >= clip().duration) {
      run(S.clip, S.transitionDemo);
      return;
    }
    S.playing = !S.playing;
    render();
  };
  $('ready').onclick = ready;
  $('prev').onclick = () => locate(S.time - 1 / M.fps);
  $('next').onclick = () => locate(S.time + 1 / M.fps);
  $('unit').onclick = () => {
    S.unit = S.unit === 'seconds' ? 'frames' : 'seconds';
    $('unit').textContent = S.unit === 'seconds' ? '秒 → 帧' : '帧 → 秒';
    buildTimeline();
    render();
  };
  $('compare').onclick = () => {
    S.reference = !S.reference;
    S.playing = false;
    $('reference').src = DATA.references[S.scene] || '';
    $('reference').hidden = !S.reference;
    $('compare').setAttribute('aria-pressed', String(S.reference));
    render();
  };
  $('assets').onclick = () => {
    const paths = new Set();
    walk(trees[S.scene], (n) => {
      if (n.backgroundImage) paths.add(n.backgroundImage);
    });
    $('asset-grid').replaceChildren(
      ...[...paths].map((path) => {
        const f = document.createElement('figure'),
          im = document.createElement('img'),
          cap = document.createElement('figcaption');
        im.src = DATA.images[path];
        im.alt = path;
        cap.textContent =
          path.split('/').at(-1) + ' · ' + images[path].width + ' × ' + images[path].height;
        f.append(im, cap);
        return f;
      })
    );
    $('asset-dialog').showModal();
  };
  $('close-assets').onclick = () => $('asset-dialog').close();
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('button,select,[role=slider]') || $('asset-dialog').open) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      locate(S.time + (e.key === 'ArrowLeft' ? -1 : 1) / M.fps);
    } else if (e.key === 'Escape') {
      S.modal = null;
      ready();
    } else if (e.key.toLowerCase() === 'r') run(S.clip, S.transitionDemo);
    else if (e.key === ' ') {
      e.preventDefault();
      $('play').click();
    } else if (e.key === 'Enter') {
      if (S.scene === 'S01') activate('menu' + S.selected);
      else if (S.scene === 'S03') activate('continue');
    } else if (e.key === 'ArrowDown' && S.scene === 'S01') {
      S.selected = (S.selected % 3) + 1;
      render();
    } else if (e.key === 'ArrowUp' && S.scene === 'S01') {
      S.selected = ((S.selected + 1) % 3) + 1;
      render();
    }
  });
  let prior = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - prior) / 1000);
    prior = now;
    if (!document.hidden && !S.reference) {
      if (!S.inspect) S.idleClock += dt;
      if (S.playing) {
        S.time = Math.min(clip().duration, S.time + dt);
        if (S.time >= clip().duration) {
          S.playing = false;
          if (!S.inspect) {
            if (clip().category === 'transition' && !S.transitionDemo) {
              setScene(clip().target, false);
              if (S.scene === 'S03') run('S03.type');
            } else if (S.scene === 'S03' && clip().category === 'entry') run('S03.type');
          }
        }
      }
      if (S.auto && S.scene === 'S03' && !S.playing && !S.inspect && !S.modal) {
        S.autoClock += dt;
        if (S.autoClock > 0.85) {
          S.autoClock = 0;
          nextLine();
        }
      }
      render();
    }
    if (!thumbnail) requestAnimationFrame(tick);
  }
  if (thumbnail) document.body.classList.add('thumbnail');
  setScene(scene(params.get('scene')) ? params.get('scene') : 'S01', !thumbnail);
  if (params.get('clip') && DATA.clips[params.get('clip')]) {
    run(params.get('clip'), true);
    if (thumbnail) {
      S.time =
        clip().thumbnailAt ??
        (clip().category === 'transition'
          ? (clip().covered[1] + clip().duration) / 2
          : clip().duration);
      S.playing = false;
    }
  }
  if (thumbnail) {
    render();
    window.parent.postMessage(
      {
        type: 'maker:vector-thumbnail',
        id: params.get('clip') || S.scene,
        image: canvas.toDataURL('image/png'),
      },
      location.origin
    );
  } else requestAnimationFrame(tick);
  window.addEventListener('message', (e) => {
    if (
      e.source === window.parent &&
      e.origin === location.origin &&
      e.data?.type === 'maker:motion-visibility' &&
      !e.data.visible
    ) {
      S.playing = false;
      S.auto = false;
      render();
    }
  });
  window.NanoVGShowcase = {
    getState: () => ({ ...S }),
    sample: (id, t) => sample(DATA.clips[id], t),
    scene: setScene,
    run,
    seek: locate,
    ready,
    activate,
    render,
  };
  window.SignalSample = window.NanoVGShowcase;
  window.addEventListener('resize', render);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      S.playing = false;
      S.auto = false;
    }
  });
})().catch((e) => {
  const p = document.createElement('p');
  p.textContent = '演示加载失败：' + e.message + '。请刷新页面重试。';
  document.querySelector('main').append(p);
  console.error(e);
});
