'use strict';
const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const requestedExample = query.get('example') || 'S01';
const thumbnail = query.get('thumbnail') === '1';
if (thumbnail) document.body.classList.add('thumbnail');
else if (query.has('embed')) document.body.classList.add('embedded');
const canvas = $('stage'),
  ctx = canvas.getContext('2d');
const images = new Map(),
  scenes = new Map();
let catalog,
  timelines,
  current,
  seconds = 0,
  start = 0,
  end = 1,
  playing = false,
  raf = 0,
  previous = 0;
let pending = null,
  effect = null,
  focused = 1,
  hostVisible = true,
  activeExample = requestedExample;
let stopAt = 1,
  selectedAction = '',
  auto = false,
  toastTimer;
let dialogueEnded = false,
  chapter = 2,
  autoWait = 0;
let hoveredAction = '',
  pressedAction = '',
  keyboardAction = '';
const defaults = {
  dx: 0,
  dy: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  reveal: 1,
  revealY: 1,
};
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
async function json(path) {
  const r = await fetch(path);
  if (!r.ok) throw Error('文件加载失败：' + path);
  return r.json();
}
function sceneConfig(id) {
  return catalog.scenes.find((s) => s.id === id);
}
function ref(id) {
  return timelines.scenes[id];
}
function sample(id, t) {
  return Object.fromEntries(
    Object.entries(LuaMotion.named('ImageScene', id, t)).map(([key, value]) => [
      ref(id).bindings[key] || key,
      value,
    ])
  );
}
function color(v) {
  return Array.isArray(v) ? `rgba(${v[0]},${v[1]},${v[2]},${(v[3] ?? 255) / 255})` : v;
}
function isSelected(id, action) {
  if (id === 'S02') return action === 'select' + focused;
  if (id === 'S05') return action === 'chapter' + chapter;
  if (id === 'S03') return false;
  return current.kind === 'scene' && current.id === id && action === selectedAction;
}
function drawFeedback(id, action, w, h) {
  const selected = isSelected(id, action.action);
  const interactive =
    current.kind === 'scene' &&
    current.id === id &&
    seconds >= (current.ready ?? current.entry) &&
    !effect &&
    !(id === 'S02' && seconds > 0.6);
  const key = action.node || action.action;
  const hover = interactive && (hoveredAction === key || keyboardAction === key),
    pressed = interactive && pressedAction === key;
  if (!selected && !hover && !pressed) return;
  const [x, y, rw, rh] = action.rect || [0, 0, w, h],
    accent = id === 'S04' || id === 'S05' ? [220, 186, 113] : [255, 49, 140];
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  if (action.outline) {
    const p = action.outline;
    ctx.moveTo(p[0] * rw, p[1] * rh);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * rw, p[i + 1] * rh);
    ctx.closePath();
  } else if (action.shape === 'circle')
    ctx.arc(rw / 2, rh / 2, Math.min(rw, rh) / 2 - 4, 0, Math.PI * 2);
  else ctx.rect(0, 0, rw, rh);
  ctx.fillStyle = pressed ? '#ffffff2a' : hover ? '#ffffff12' : '#ffffff00';
  ctx.fill();
  if (selected || hover) {
    if (action.outline || action.shape) {
      ctx.lineWidth = selected ? 13 : 7;
      ctx.strokeStyle = color([...accent, selected ? 75 : 35]);
      ctx.stroke();
      ctx.lineWidth = selected ? 5 : 3;
      ctx.strokeStyle = color([...accent, 230]);
      ctx.stroke();
      if (selected) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff3fd';
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = 2;
      ctx.strokeStyle = color([...accent, 230]);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function drawImage(path, x, y, w, h, fit) {
  const image = images.get('assets/' + path);
  if (!image) return;
  if (fit === 'contain') {
    const scale = Math.min(w / image.width, h / image.height);
    const iw = image.width * scale,
      ih = image.height * scale;
    ctx.drawImage(image, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  } else if (fit === 'cover') {
    const scale = Math.max(w / image.width, h / image.height),
      sw = w / scale,
      sh = h / scale;
    ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
  } else ctx.drawImage(image, x, y, w, h);
}
function drawNode(node, state, id, t) {
  if (node.visible === false) return;
  if (ref(id).hidden?.includes(node.id)) return;
  if (id === 'S01' && node.id === 'E006') return;
  const chapters = ref(id).chapters;
  if (node.id === chapters?.cursor) return;
  const roster = ref(id).characters;
  if (roster && node.id === roster.actor && (focused !== 1 || (t > ref(id).attack.at && t < 1.4)))
    return;
  const pose = state[node.id] || defaults;
  let w = node.width || 0,
    h = node.height || 0;
  const fillIndex = roster?.fills.indexOf(node.id) ?? -1;
  if (fillIndex >= 0)
    w =
      (roster.fillWidths[fillIndex] * roster.items[focused - 1].stats[fillIndex]) /
      roster.items[0].stats[fillIndex];
  ctx.save();
  ctx.translate((node.left || 0) + pose.dx, (node.top || 0) + pose.dy);
  let rotation = (node.rotate || 0) + pose.rotation;
  const rendering = ref(id).rendering?.[node.id] || {},
    clap = ref(id).clap;
  if (node.id === clap?.node && effect?.kind === 'clap') {
    rotation += LuaMotion.named('Clap', null, effect.time).clapper.angle;
  }
  if (rendering.stretch) {
    w *= pose.scaleX;
    h *= pose.scaleY;
  }
  const origin = rendering.origin || node.transformOrigin || 'center';
  const ox = Array.isArray(origin)
      ? origin[0] * w
      : origin.includes('left')
        ? 0
        : origin.includes('right')
          ? w
          : w / 2,
    oy = Array.isArray(origin)
      ? origin[1] * h
      : origin.includes('top')
        ? 0
        : origin.includes('bottom')
          ? h
          : h / 2;
  ctx.translate(ox, oy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(
    (node.scale || 1) * pose.scale * (rendering.stretch ? 1 : pose.scaleX),
    (node.scale || 1) * pose.scale * (rendering.stretch ? 1 : pose.scaleY)
  );
  ctx.translate(-ox, -oy);
  ctx.globalAlpha *= clamp((node.opacity ?? 1) * pose.opacity);
  if (id === 'S03' && node.id === ref(id).dialoguePanel)
    ctx.globalAlpha *= dialogueEnded
      ? 0
      : effect?.kind === 'dialogue'
        ? LuaMotion.named('DialogueExit', null, effect.time).panel.opacity
        : 1;
  if (pose.reveal < 1 || pose.revealY < 1 || node.overflow === 'hidden') {
    ctx.beginPath();
    ctx.rect(0, 0, w * clamp(pose.reveal), h * clamp(pose.revealY));
    ctx.clip();
  }
  if (node.backgroundColor) {
    ctx.fillStyle = color(node.backgroundColor);
    ctx.fillRect(0, 0, w, h);
  }
  let texture = node.backgroundImage;
  const menu = ref(id).menu;
  if (menu?.ids.includes(node.id))
    texture = menu.ids[focused - 1] === node.id ? menu.primary : menu.secondary;
  if (texture) {
    ctx.save();
    ctx.globalAlpha *= node.backgroundImageOpacity ?? 1;
    const avatar = roster?.avatars.indexOf(node.id) ?? -1;
    if (avatar >= 0 && avatar !== focused - 1)
      ctx.globalAlpha *= roster.inactiveFrameOpacity[avatar];
    if (chapters?.ids.includes(node.id) && chapters.ids[chapter - 1] !== node.id)
      ctx.globalAlpha *= chapters.inactiveImageOpacity;
    if (id === 'S02' && node.id === 'E010') ctx.globalAlpha *= auto ? 1 : 0.55;
    drawImage(texture, 0, 0, w, h, node.backgroundFit);
    ctx.restore();
  }
  if (node.type === 'Label') {
    let text = node.text || '';
    const typing = ref(id).typing;
    if (typing?.id === node.id)
      text = Array.from(typing.text)
        .slice(
          0,
          Math.floor(
            Array.from(typing.text).length * LuaMotion.named('Typing', null, t).text.progress
          )
        )
        .join('');
    if (roster) {
      if (node.id === roster.name) text = roster.items[focused - 1].name;
      const i = roster.stats.indexOf(node.id);
      if (i >= 0) text = String(roster.items[focused - 1].stats[i]);
    }
    if (ref(id).chapters?.title === node.id) text = ref(id).chapters.titles[chapter - 1];
    ctx.fillStyle = color(node.fontColor || [255, 255, 255, 255]);
    ctx.font = `${node.fontWeight === 'bold' ? 'bold ' : ''}${node.fontSize || 20}px ${node.fontFamily ? JSON.stringify(node.fontFamily) : 'MakerMenu'},serif`;
    ctx.textAlign = node.textAlign || 'left';
    ctx.textBaseline = 'middle';
    const x = ctx.textAlign === 'center' ? w / 2 : ctx.textAlign === 'right' ? w : 0;
    const lines = [];
    for (const paragraph of text.split(String.fromCharCode(10))) {
      let line = '';
      for (const ch of paragraph) {
        if (node.whiteSpace === 'normal' && line && ctx.measureText(line + ch).width > w) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
      lines.push(line);
    }
    const lineHeight = (node.lineHeight || 1.25) * (node.fontSize || 20);
    const firstLine =
      node.verticalAlign === 'top'
        ? (node.fontSize || 20) / 2
        : node.verticalAlign === 'bottom'
          ? h - (node.fontSize || 20) / 2 - (lines.length - 1) * lineHeight
          : h / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, firstLine + i * lineHeight));
  }
  let children = [...(node.children || [])];
  if (node.id === 'root') {
    children = children.concat(ref(id).layers || []);
  }
  for (const child of children.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)))
    drawNode(child, state, id, t);
  if (chapters?.ids[chapter - 1] === node.id) {
    const cursor = findNode(scenes.get(id), chapters.cursor),
      r = chapters.cursorRect;
    drawImage(cursor.backgroundImage, r[0], (h - r[3]) / 2, r[2], r[3], 'contain');
  }
  for (const action of ref(id).controls || [])
    if (action.node === node.id) drawFeedback(id, action, w, h);
  ctx.restore();
}
function drawScene(id, t) {
  const scene = scenes.get(id),
    scale = Math.min(canvas.width / scene.width, canvas.height / scene.height);
  ctx.save();
  ctx.translate(
    (canvas.width - scene.width * scale) / 2,
    (canvas.height - scene.height * scale) / 2
  );
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, scene.width, scene.height);
  ctx.clip();
  drawNode(scene, sample(id, t), id, t);
  if (id === 'S01' && t >= sceneConfig(id).entry && t < 35 / 30) {
    const data = ref(id).menu,
      rect = nodeRect(scene, data.ids[focused - 1]),
      c = data.cursorRect;
    drawImage(data.cursor, rect[0] + c[0], rect[1] + (rect[3] - c[3]) / 2, c[2], c[3], 'contain');
  }
  if (id === 'S02') {
    if (focused !== 1) {
      const data = ref(id).characters,
        rect = data.previewRect;
      ctx.save();
      if (effect?.kind === 'skill') {
        const s = LuaMotion.named('Skill', null, effect.time).actor.scale;
        ctx.translate(rect[0] + rect[2] / 2, rect[1]);
        ctx.scale(s, s);
        ctx.translate(-rect[0] - rect[2] / 2, -rect[1]);
      }
      drawImage(data.items[focused - 1].image, ...rect, 'contain');
      ctx.restore();
    } else if (t > ref(id).attack.at && t < 1.4) drawAttack(ref(id).attack, t - ref(id).attack.at);
  }
  ctx.restore();
}
function polygon(points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fill();
}
function findNode(root, id) {
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const result = findNode(child, id);
    if (result) return result;
  }
}
function drawAttack(data, t) {
  const state = LuaMotion.named('ImageScene', 'Attack', t);
  ctx.save();
  ctx.scale(scenes.get('S02').width / 1280, scenes.get('S02').height / 720);
  const pose = data.poses.reduce((chosen, p) => (t >= p.at ? p : chosen), data.poses[0]),
    rect = pose.rect || data.actorRect;
  if (state.echo.opacity > 0) {
    ctx.save();
    ctx.globalAlpha = state.echo.opacity;
    drawImage(pose.image, rect[0] - 18, rect[1], rect[2], rect[3]);
    ctx.restore();
  }
  drawImage(pose.image, ...rect);
  for (const layer of data.layers) {
    const p = state[layer.id];
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.translate(...layer.pivot);
    ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
    ctx.scale(p.scale * p.scaleX, p.scale * p.scaleY);
    ctx.translate(-layer.pivot[0], -layer.pivot[1]);
    for (const shape of layer.shapes) {
      ctx.beginPath();
      for (const command of shape.path) {
        const [op, ...args] = command;
        if (op === 'M') ctx.moveTo(...args);
        else if (op === 'L') ctx.lineTo(...args);
        else if (op === 'C') ctx.bezierCurveTo(...args);
      }
      if (shape.stroke) {
        ctx.strokeStyle = color(shape.color);
        ctx.lineWidth = shape.stroke;
        ctx.stroke();
      } else {
        ctx.closePath();
        ctx.fillStyle = color(shape.color);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
function drawTransition(item, p) {
  drawScene(
    p < 0.5 ? item.from : item.to,
    p < 0.5 ? sceneConfig(item.from).settled : Math.max(0, seconds - item.duration / 2)
  );
  if (p <= 0 || p >= 1) return;
  const poses = LuaMotion.named('Transition', item.id, p);
  ctx.save();
  ctx.scale(canvas.width / 2048, canvas.height / 1152);
  if (item.id === 'T01') {
    const x = poses.mask.x;
    polygon([x, 0, x + 3000, 0, x + 2300, 1152, x - 700, 1152], '#07050e');
    polygon([x, 0, x + 26, 0, x - 674, 1152, x - 700, 1152], '#fb2680');
  }
  if (item.id === 'T02') {
    const breadth = poses.mask.breadth;
    ctx.translate(1024, 576);
    ctx.rotate(0.57);
    ctx.fillStyle = '#ff1d81';
    ctx.fillRect(-2400, -breadth / 2 - 16, 4800, breadth + 32);
    ctx.fillStyle = '#fffcfd';
    ctx.fillRect(-2400, -breadth / 2, 4800, breadth);
  }
  if (item.id === 'T03') {
    const image = images.get(catalog.card);
    if (p >= 0.5 && p <= 0.6) {
      ctx.fillStyle = '#0c0709';
      ctx.fillRect(0, 0, 2048, 1152);
    }
    for (let i = 1; i <= 10; i++) {
      const pose = poses['card' + i],
        w = 180 * pose.zoom,
        h = 260 * pose.zoom;
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle);
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    if (p >= 0.3 && p <= 0.82) {
      const w = poses.cover.width,
        h = poses.cover.height;
      ctx.translate(1024, 576);
      ctx.rotate(-0.12);
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
    }
  }
  ctx.restore();
}
function paint() {
  ctx.fillStyle = '#050409';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (current.kind === 'transition') drawTransition(current, clamp(seconds / current.duration));
  else drawScene(current.id, seconds);
  $('playhead').style.left = clamp((seconds - start) / (end - start)) * 100 + '%';
  $('time').textContent =
    'F ' + Math.round(seconds * 30) + ' / ' + Math.round(end * 30) + ' · 30 FPS';
  for (const button of $('actions').children)
    button.disabled =
      current.kind !== 'scene' ||
      seconds < (current.ready ?? current.entry) ||
      !!effect ||
      (current.id === 'S02' && seconds > 0.6);
  renderSelected();
}
function pause() {
  playing = false;
  cancelAnimationFrame(raf);
  $('play').textContent = '播放';
  $('play').setAttribute('aria-pressed', 'false');
}
function play() {
  pause();
  if (!hostVisible || document.hidden) return;
  if (seconds >= end && !effect) seconds = start;
  playing = true;
  previous = performance.now();
  $('play').textContent = '暂停';
  $('play').setAttribute('aria-pressed', 'true');
  raf = requestAnimationFrame(tick);
}
function tick(now) {
  if (!playing) return;
  const dt = Math.min(0.1, (now - previous) / 1000) * Number($('speed').value);
  previous = now;
  seconds = Math.min(stopAt, seconds + dt);
  let finished;
  if (effect) {
    effect.time += dt;
    if (effect.time >= effect.duration) {
      finished = effect.kind;
      effect = null;
    }
  }
  if (finished === 'dialogue') {
    dialogueEnded = true;
    notify('本段对话结束 · 再点重播，SKIP 返回菜单');
  }
  if (finished === 'clap') {
    goTransition('T03');
    return;
  }
  const autoDialogue = current.id === 'S03' && auto && !dialogueEnded;
  if (autoDialogue && seconds >= 28 / 30 && !effect) {
    autoWait += dt;
    if (autoWait >= 0.7) effect = { kind: 'dialogue', time: 0, duration: 0.22 };
  }
  paint();
  if (seconds >= stopAt && !effect && !autoDialogue) {
    const next = pending || (current.kind === 'transition' ? { id: current.to, auto: true } : null);
    // The destination already plays beneath the transition; keep that clock at handoff.
    const resumeAt =
      current.kind === 'transition' ? Math.max(0, seconds - current.duration / 2) : 0;
    pause();
    pending = null;
    if (next) open(next.id, next.auto, resumeAt);
    else if (current.id === 'S02' && seconds >= 1.4) {
      seconds = 0.6;
      paint();
    }
  } else raf = requestAnimationFrame(tick);
}
function seek(value) {
  pause();
  pending = null;
  effect = null;
  dialogueEnded = false;
  stopAt = end;
  seconds = clamp(value, start, end);
  paint();
}
function open(id, autoplay = true, resumeAt = 0) {
  pause();
  pending = null;
  effect = null;
  activeExample = id;
  focused = 1;
  selectedAction = '';
  hoveredAction = '';
  pressedAction = '';
  keyboardAction = '';
  auto = false;
  autoWait = 0;
  dialogueEnded = false;
  chapter = 2;
  current = catalog.transitions.find((s) => s.id === id) || sceneConfig(id);
  clearTimeout(toastTimer);
  $('toast').hidden = true;
  start = 0;
  end = current.kind === 'transition' ? current.duration : ref(id).recipe.duration;
  stopAt = current.kind === 'transition' ? end : current.entry;
  seconds = thumbnail
    ? current.kind === 'transition'
      ? current.duration * 0.35
      : current.settled
    : clamp(resumeAt, 0, stopAt);
  if (thumbnail) end = Math.max(end, seconds);
  renderActions();
  renderTimeline();
  paint();
  if (thumbnail) {
    parent.postMessage(
      { type: 'maker:motion-thumbnail', id, image: canvas.toDataURL() },
      location.origin
    );
  } else if (autoplay && !matchMedia('(prefers-reduced-motion: reduce)').matches) play();
}
function act(action) {
  if (
    current.kind !== 'scene' ||
    seconds < (current.ready ?? current.entry) ||
    effect ||
    (current.id === 'S02' && seconds > 0.6)
  )
    return false;
  selectedAction = action;
  if (current.id === 'S01') {
    if (/^menu[1-4]$/.test(action)) focused = Number(action.slice(-1));
    if (focused === 1) {
      seconds = 0.8;
      stopAt = 34 / 30;
      pending = { id: 'T01', auto: true };
      play();
    } else
      notify(['', 'START GAME', 'SETTINGS', 'GALLERY', 'ONLINE MODE'][focused] + ' · 入口已选中');
  } else if (current.id === 'S02') {
    if (/^select[1-4]$/.test(action)) {
      focused = Number(action.slice(-1));
    } else if (action === 'next') goTransition('T02');
    else if (action === 'auto') {
      auto = !auto;
      notify(auto ? 'AUTO 已开启' : 'AUTO 已关闭');
    } else if (focused === 1) {
      seconds = 0.6;
      stopAt = 1.4;
      play();
    } else {
      effect = { kind: 'skill', time: 0, duration: 0.28 };
      stopAt = seconds;
      notify(ref('S02').characters.items[focused - 1].name + ' · 技能已选中');
      play();
    }
  } else if (current.id === 'S03') {
    if (action === 'skip') {
      open('S01');
      return true;
    }
    if (action === 'auto') {
      auto = !auto;
      autoWait = 0;
      notify(auto ? 'AUTO 已开启' : 'AUTO 已关闭');
      if (auto && !dialogueEnded) play();
    } else if (dialogueEnded) {
      open('S03');
      return true;
    } else if (seconds < 28 / 30) notify('台词正在显示');
    else {
      effect = { kind: 'dialogue', time: 0, duration: 0.22 };
      play();
    }
  } else if (current.id === 'S04') {
    if (action === 'clap') {
      effect = { kind: 'clap', time: 0, duration: ref('S04').clap.duration };
      play();
    } else if (action === 'cards' || action.startsWith('episode')) {
      goTransition('T03');
      return true;
    } else if (action === 'back') {
      open('S04', false);
      seek(sceneConfig('S04').settled);
      notify('绒幕星仪剧场 · 活动主页');
      return true;
    } else if (action === 'rabbit') {
      open('S04');
      return true;
    } else notify(action === 'review' ? '回顾已选中' : '轶事已选中');
  } else if (current.id === 'S05') {
    if (action === 'back') {
      goTransition('T03', 'S05', 'S04');
      return true;
    }
    if (/^chapter[1-3]$/.test(action)) chapter = Number(action.slice(-1));
    else if (action === 'previous') chapter = ((chapter + 1) % 3) + 1;
    else if (action === 'nextChapter') chapter = (chapter % 3) + 1;
    else if (action === 'puppet') {
      seconds = 0;
      stopAt = current.entry;
      play();
    } else if (action === 'story')
      notify('进入故事 · ' + ref('S05').chapters.names[chapter - 1] + '，剧情由接入项目提供');
    else notify(action === 'currency1' ? '金币：100' : '星晶：15');
    if (action.startsWith('chapter') || ['previous', 'nextChapter'].includes(action)) {
      selectedAction = 'chapter' + chapter;
      notify(ref('S05').chapters.names[chapter - 1] + ' · 已选中');
    }
  }
  renderSelected();
  paint();
  return true;
}
function notify(message) {
  $('status').textContent = message;
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 1500);
}
function goTransition(id, from, to) {
  const source = { focused, chapter, selectedAction };
  open(id);
  if (from && to) current = { ...current, from, to };
  ({ focused, chapter, selectedAction } = source);
  pending = { id: current.to, auto: true };
  paint();
}
function nodeRect(root, id, x = 0, y = 0) {
  x += root.left || 0;
  y += root.top || 0;
  if (root.id === id) return [x, y, root.width, root.height];
  for (const child of root.children || []) {
    const rect = nodeRect(child, id, x, y);
    if (rect) return rect;
  }
}
function renderSelected() {
  for (const button of $('actions').children)
    button.setAttribute(
      'aria-pressed',
      String(
        button.dataset.action === 'auto' ? auto : isSelected(current.id, button.dataset.action)
      )
    );
}
function renderActions() {
  $('actions').replaceChildren();
  $('status').textContent = current.boundary || '独立 PNG · 可编辑 UI.json · 原生 Lua';
  if (current.kind !== 'scene') return;
  const scene = scenes.get(current.id),
    scale = Math.min(canvas.width / scene.width, canvas.height / scene.height);
  $('actions').style.setProperty(
    '--accent',
    current.id === 'S04' || current.id === 'S05' ? '#dcba71' : '#ff318c'
  );
  for (const action of ref(current.id).controls || []) {
    const base = action.node ? nodeRect(scene, action.node) : [0, 0, scene.width, scene.height];
    if (!base) throw Error('控件节点缺失：' + action.node);
    const rect = action.rect
      ? [base[0] + action.rect[0], base[1] + action.rect[1], action.rect[2], action.rect[3]]
      : base;
    const b = document.createElement('button');
    b.textContent = action.label;
    b.setAttribute('aria-label', action.label);
    b.dataset.action = action.action;
    b.onclick = () => act(action.action);
    if (action.outline) {
      const p = action.outline,
        points = [];
      for (let i = 0; i < p.length; i += 2) points.push(`${p[i] * 100}% ${p[i + 1] * 100}%`);
      b.style.clipPath = `polygon(${points.join(',')})`;
    }
    if (action.shape === 'circle') b.style.borderRadius = '50%';
    const key = action.node || action.action;
    b.onpointerenter = () => {
      hoveredAction = key;
      if (
        current.id === 'S01' &&
        seconds >= current.entry &&
        !effect &&
        /^menu[1-4]$/.test(action.action)
      )
        focused = Number(action.action.slice(-1));
      paint();
    };
    b.onpointerleave = () => {
      hoveredAction = '';
      pressedAction = '';
      paint();
    };
    b.onpointerdown = () => {
      pressedAction = key;
      paint();
    };
    b.onpointerup = b.onpointercancel = () => {
      pressedAction = '';
      paint();
    };
    b.onfocus = () => {
      keyboardAction = key;
      paint();
    };
    b.onblur = () => {
      keyboardAction = '';
      paint();
    };
    b.style.left =
      (((canvas.width - scene.width * scale) / 2 + rect[0] * scale) / canvas.width) * 100 + '%';
    b.style.top =
      (((canvas.height - scene.height * scale) / 2 + rect[1] * scale) / canvas.height) * 100 + '%';
    b.style.width = ((rect[2] * scale) / canvas.width) * 100 + '%';
    b.style.height = ((rect[3] * scale) / canvas.height) * 100 + '%';
    $('actions').append(b);
  }
}
function togglePlayback() {
  if (playing) pause();
  else {
    if (seconds >= stopAt) stopAt = end;
    play();
  }
}
function renderTimeline() {
  const labels = {
    S01: ['角色入场', '标题', '菜单', '就绪', '确认', '揭幕'],
    S02: ['头像', '立绘', '就绪', '光刃', '收势'],
    S03: ['角色', '对话框', '逐字', '继续'],
    S04: ['入场', '瓷兔', '落点', '就绪', '呼吸'],
    S05: ['开幕', '木偶', '纸卡', '就绪', '停留'],
    T01: ['斜面进入', '遮场切页', '揭幕'],
    T02: ['光刃展开', '白芯遮场', '光刃收束'],
    T03: ['飞牌', '星牌遮场', '章节揭开'],
  };
  const points = {
    S01: [0, 5 / 30, 11 / 30, 0.7, 0.8, 34 / 30],
    S02: [0, 0.16, 0.6, 0.8, 1.4],
    S03: [0, 0.25, 0.43, 28 / 30],
    S04: [0.12, 0.32, 0.78, 1.3, 5.1],
    S05: [0.08, 0.34, 0.64, 1.5, 2.4],
  };
  const frames = points[current.id] || [0, end / 2, end];
  $('markers').replaceChildren();
  frames.forEach((t, i) => {
    const button = document.createElement('button');
    button.className = 'keyframe';
    button.style.setProperty('--at', clamp(t / end) * 100 + '%');
    button.textContent = 'F' + Math.round(t * 30) + ' ' + labels[current.id][i];
    button.onclick = () => seek(t);
    $('markers').append(button);
  });
}
$('play').onclick = togglePlayback;
// A transition card still replays its transition after entering the destination scene.
$('replay').onclick = () =>
  open(
    catalog.transitions.some((item) => item.id === requestedExample)
      ? requestedExample
      : activeExample
  );
$('timeline').onclick = (e) => {
  if (e.target.closest('button')) return;
  const r = e.currentTarget.getBoundingClientRect();
  seek(Math.round(clamp((e.clientX - r.left) / r.width) * end * 30) / 30);
};
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input,select,button')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    seek(seconds + (e.key === 'ArrowRight' ? 1 : -1) / 30);
  } else if (e.code === 'Space') {
    e.preventDefault();
    togglePlayback();
  }
});
window.addEventListener('message', (e) => {
  if (
    e.source === parent &&
    e.origin === location.origin &&
    e.data?.type === 'maker:motion-visibility'
  ) {
    hostVisible = e.data.visible === true;
    if (!hostVisible) pause();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('pagehide', pause);
(async () => {
  [catalog, timelines] = await Promise.all([json('catalog.json'), json('timelines.json')]);
  const transition = catalog.transitions.find((s) => s.id === activeExample);
  const required = thumbnail
    ? new Set(transition ? [transition.from, transition.to] : [activeExample])
    : new Set(catalog.scenes.map((s) => s.id));
  const paths = new Set();
  function collect(node) {
    for (const key of ['backgroundImage', 'pressedBackgroundImage', 'image'])
      if (node[key]) paths.add('assets/' + node[key]);
    for (const child of node.children || []) collect(child);
  }
  await Promise.all(
    catalog.scenes
      .filter((s) => required.has(s.id))
      .map(async (s) => {
        const ui = await json(s.ui);
        scenes.set(s.id, ui);
        collect(ui);
      })
  );
  for (const id of required) {
    const data = ref(id);
    for (const layer of data.layers || []) collect(layer);
    for (const pose of data.attack?.poses || []) paths.add('assets/' + pose.image);
    for (const character of data.characters?.items || []) paths.add('assets/' + character.image);
  }
  if (!thumbnail || transition?.id === 'T03') paths.add(catalog.card);
  const queue = [...paths];
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const path = queue.shift();
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(Error('图片加载失败：' + path));
          image.src = path;
        });
        images.set(path, image);
      }
    })
  );
  await Promise.all([
    document.fonts.load('20px MakerMenu'),
    document.fonts.load('20px "Fonts/NotoSerifSC-Regular.ttf"'),
  ]);
  await document.fonts.ready;
  open(activeExample);
  window.nativeDemo = {
    open,
    seek,
    pause,
    act,
    getState: () => ({
      example: activeExample,
      seconds,
      playing,
      focused,
      chapter,
      effect: effect?.kind,
      images: images.size,
    }),
  };
})().catch((error) => {
  $('status').textContent = '演示加载失败：' + error.message;
  console.error(error);
  if (thumbnail)
    parent.postMessage(
      { type: 'maker:motion-thumbnail-error', id: activeExample, message: error.message },
      location.origin
    );
});
