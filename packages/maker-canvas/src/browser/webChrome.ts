import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { canvasWebBox, canvasWebCurve } from './wireUi.js';

/** Mivo's slot rule: empty slots and AI results keep the composer; plain imported images do not. */
export function canvasWebSlot(node: CanvasNode): boolean {
  return node.type === 'image' && (!node.assetPath || Boolean(node.generation));
}

/** Turns a text action into a Web icon button; the text stays as aria-label and tooltip. */
export function canvasWebIconAction(
  button: HTMLElement,
  icon:
    | 'chat'
    | 'cutout'
    | 'chevron'
    | 'download'
    | 'trash'
    | 'video'
    | 'sequence'
    | 'upload'
    | 'group'
    | 'ungroup'
): HTMLElement {
  // Inlined here because helpers are injected into the page via toString().
  const paths = {
    // lucide message-square-plus
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/>',
    // lucide square-scissors
    cutout:
      '<rect width="20" height="20" x="2" y="2" rx="2"/><circle cx="8" cy="8" r="2"/><path d="M9.414 9.414 12 12"/><path d="M14.8 14.8 18 18"/><circle cx="8" cy="16" r="2"/><path d="m18 6-8.586 8.586"/>',
    // lucide chevron-down
    chevron: '<path d="m6 9 6 6 6-6"/>',
    // Same glyph as the default page's download summary.
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    // lucide trash-2
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    // lucide video
    video:
      '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    // lucide film
    sequence:
      '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
    // lucide upload
    upload:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    // lucide group
    group:
      '<path d="M3 7V5c0-1.1.9-2 2-2h2"/><path d="M17 3h2c1.1 0 2 .9 2 2v2"/><path d="M21 17v2c0 1.1-.9 2-2 2h-2"/><path d="M7 21H5c-1.1 0-2-.9-2-2v-2"/><rect width="7" height="5" x="7" y="7" rx="1"/><rect width="7" height="5" x="10" y="12" rx="1"/>',
    // lucide ungroup
    ungroup:
      '<rect width="8" height="6" x="5" y="4" rx="1"/><rect width="8" height="6" x="11" y="14" rx="1"/>',
  };
  const label = button.getAttribute('aria-label') || button.textContent || '';
  button.setAttribute('aria-label', label);
  // The custom tooltip replaces the slow native title bubble.
  button.removeAttribute('title');
  button.dataset.webTip = label;
  if (icon !== 'chevron') button.classList.add('web-icon-action');
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths[icon] +
    '</svg>';
  return button;
}

/** Immediate tooltip for Web icon-only buttons; migrates native titles so only one bubble shows. */
export function installCanvasWebTooltips() {
  const targets =
    '[data-web-tip], .workspace-actions > button, .workspace-actions summary, .workspace-toolbar-grip, .wire-controls .wire-scissors, .card .canvas-card-menu, .workspace-tab #rename-canvas';
  const tip = document.createElement('div');
  tip.className = 'web-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  document.body.append(tip);
  let owner: HTMLElement | null = null;
  let timer = 0;
  let keyboard = false;
  let lastHide = 0;
  const root = document.documentElement;
  const measure = document.createElement('canvas').getContext('2d');
  /** Mirrors the flag on :root so CSS shows focus rings for keyboard focus only (no :focus-visible on Chrome 74). */
  function setKeyboard(next: boolean) {
    if (keyboard === next) return;
    keyboard = next;
    root.classList.toggle('canvas-web-keyboard', next);
    if (!next || !measure) return;
    // The ring is the live host accent at 60%; canvas normalises any CSS color, as color-mix is unavailable.
    measure.fillStyle = '#6957e8';
    measure.fillStyle = getComputedStyle(root).getPropertyValue('--web-accent').trim() || '#6957e8';
    const color = String(measure.fillStyle);
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
    root.style.setProperty(
      '--web-focus-ring',
      hex
        ? 'rgba(' + [hex[1], hex[2], hex[3]].map((part) => parseInt(part, 16)).join(',') + ',.6)'
        : color.replace(/,\s*[\d.]+\)$/, ',.6)')
    );
  }
  function label(element: HTMLElement) {
    if (element.title) {
      // Moving title into data keeps the text while stopping the native delayed tooltip.
      element.dataset.webTip = element.title;
      if (!element.getAttribute('aria-label')) element.setAttribute('aria-label', element.title);
      element.removeAttribute('title');
    }
    return element.dataset.webTip || element.getAttribute('aria-label') || '';
  }
  function place() {
    if (!owner || !owner.isConnected) return hide();
    const box = owner.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const center = box.left + box.width / 2;
    const left = Math.max(6, Math.min(center - width / 2, window.innerWidth - 6 - width));
    const below = box.top - 8 - height < 4;
    tip.dataset.side = below ? 'below' : 'above';
    tip.style.left = left + 'px';
    tip.style.top = (below ? box.bottom + 8 : box.top - 8 - height) + 'px';
    tip.style.setProperty(
      '--web-tip-arrow',
      Math.max(10, Math.min(width - 10, center - left)) + 'px'
    );
  }
  function show(element: HTMLElement) {
    const text = label(element);
    if (!text) return hide();
    owner = element;
    clearTimeout(timer);
    // Like shadcn's skip-delay: moving between buttons right after one closed shows at once.
    const delay = tip.dataset.open === 'true' || Date.now() - lastHide < 300 ? 0 : 150;
    timer = window.setTimeout(() => {
      if (owner !== element || !element.isConnected) return;
      tip.textContent = text;
      tip.hidden = false;
      place();
      tip.dataset.open = 'true';
    }, delay);
  }
  function hide() {
    clearTimeout(timer);
    if (tip.dataset.open === 'true') lastHide = Date.now();
    owner = null;
    tip.dataset.open = 'false';
    tip.hidden = true;
  }
  function find(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    return element && element.closest ? (element.closest(targets) as HTMLElement | null) : null;
  }
  document.addEventListener(
    'pointerover',
    (event) => {
      const element = find(event.target);
      if (element) {
        if (element !== owner) show(element);
      } else if (owner) hide();
    },
    true
  );
  document.addEventListener(
    'pointerout',
    (event) => {
      if (owner && !owner.contains(event.relatedTarget as Node | null)) hide();
    },
    true
  );
  // Only keyboard focus shows it; Chrome 74 lacks :focus-visible, so the last input type decides.
  document.addEventListener(
    'keydown',
    (event) => {
      const target = event.target as HTMLElement | null;
      const typing =
        Boolean(target?.closest?.('textarea, input, [contenteditable="true"]')) &&
        event.key !== 'Tab';
      // Typing in a clicked field or pressing a bare modifier is not keyboard navigation.
      if (!typing && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) setKeyboard(true);
      if (event.key === 'Escape') hide();
    },
    true
  );
  document.addEventListener(
    'pointerdown',
    () => {
      setKeyboard(false);
      hide();
    },
    true
  );
  document.addEventListener('focusin', (event) => {
    const element = find(event.target);
    if (element && keyboard) show(element);
  });
  document.addEventListener('focusout', (event) => {
    if (owner && event.target === owner) hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('wheel', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide);
  return { hide };
}

/** Composer identity: what the panel reads minus geometry and its own draft edits, so drags keep the DOM. */
export function canvasComposerKey(doc: CanvasDocument, node: CanvasNode, extra: unknown[]): string {
  const edges = doc.edges.filter((edge) => edge.to === node.id || edge.from === node.id);
  const linked = new Set(edges.map((edge) => (edge.to === node.id ? edge.from : edge.to)));
  const sources = doc.nodes
    .filter((item) => linked.has(item.id))
    .map((item) => [item.id, item.assetPath, item.title]);
  // The composer itself commits prompt/parameters into the draft (e.g. on blur at drag start).
  const draft = node.generationDraft && {
    ...node.generationDraft,
    prompt: undefined,
    parameters: undefined,
  };
  const content = { ...node, x: 0, y: 0, width: 0, height: 0, generationDraft: draft };
  return JSON.stringify([doc.id, content, edges, sources, extra]);
}

/** Post-render Web selection chrome: zoom-invariant sizing, corner handles and the empty-slot upload pill. */
export function decorateCanvasWebCards(options: {
  world: HTMLElement;
  doc: CanvasDocument;
  selected: Set<string>;
  busy(id: string): boolean;
  upload(id: string): void;
  resize?(event: PointerEvent, id: string, corner: string): void;
}) {
  const { world, doc, selected } = options;
  const zoom = doc.viewport.scale > 0 ? doc.viewport.scale : 1;
  // Mivo sizes handles, outline and pills in screen pixels, so world-space chrome divides by zoom.
  world.style.setProperty('--web-inv', String(1 / zoom));
  world.classList.toggle('web-multi-selection', selected.size > 1);
  // Idempotent: the video player reselects without a full render and redecorates in place.
  world.querySelectorAll('.web-node-handle, .web-slot-upload').forEach((item) => item.remove());
  world.querySelectorAll(':scope > .card[data-id] > .card-state-loading').forEach((element) => {
    // Mivo GeneratedMediaFx tip: status text and the stop action share one pill under the frame.
    const overlay = element as HTMLElement;
    if (overlay.querySelector(':scope > .web-state-tip')) return;
    const tip = document.createElement('div');
    tip.className = 'web-state-tip';
    const title = overlay.querySelector(':scope > b');
    const dots = document.createElement('span');
    dots.className = 'web-state-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = '...';
    if (title) tip.append(title, dots);
    overlay.querySelectorAll(':scope > .card-state-query').forEach((item) => tip.append(item));
    overlay.append(tip);
  });
  function handles(card: HTMLElement, node: CanvasNode, frame: HTMLElement | null, busy: boolean) {
    const box = frame
      ? { x: frame.offsetLeft, y: frame.offsetTop, w: frame.offsetWidth, h: frame.offsetHeight }
      : { x: 0, y: 0, w: card.offsetWidth, h: card.offsetHeight };
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.tabIndex = -1;
      handle.className = 'web-node-handle is-' + corner;
      handle.setAttribute('aria-label', node.type === 'image' ? '调整图片大小' : '调整卡片大小');
      handle.style.left = box.x + (corner[1] === 'e' ? box.w : 0) + 'px';
      handle.style.top = box.y + (corner[0] === 's' ? box.h : 0) + 'px';
      if (busy || !options.resize) handle.disabled = true;
      handle.addEventListener('pointerdown', (event) => {
        if (handle.disabled || event.button !== 0) return;
        options.resize!(event, node.id, corner);
      });
      card.append(handle);
    }
  }
  // Video, video result and group frames share the image selection chrome; sections frame the whole card.
  world
    .querySelectorAll(
      ':scope > .card.video[data-id], :scope > .card.video-source[data-id], :scope > .card.section[data-id]'
    )
    .forEach((element) => {
      const card = element as HTMLElement;
      const node = doc.nodes.find((item) => item.id === card.dataset.id);
      if (!node) return;
      card.classList.add('web-media');
      card.classList.toggle('web-empty', node.type === 'video' && !node.assetPath);
      if (selected.size !== 1 || !selected.has(node.id)) return;
      const frame =
        node.type === 'section'
          ? null
          : (card.querySelector(':scope > .canvas-card-content') as HTMLElement | null);
      handles(card, node, frame, options.busy(node.id));
    });
  world.querySelectorAll(':scope > .card.image[data-id]').forEach((element) => {
    const card = element as HTMLElement;
    const node = doc.nodes.find((item) => item.id === card.dataset.id);
    if (!node) return;
    card.classList.toggle('web-slot', canvasWebSlot(node));
    card.classList.toggle('web-empty', !node.assetPath);
    if (selected.size !== 1 || !selected.has(node.id)) return;
    const frame = card.querySelector(':scope > .canvas-card-content') as HTMLElement | null;
    const busy = options.busy(node.id);
    handles(card, node, frame, busy);
    if (node.assetPath || !frame || busy) return;
    // Mivo imageReplaceButtonScale: cap at 30x136 screen px and 20%/62% of the frame.
    const width = frame.offsetWidth * zoom;
    const height = frame.offsetHeight * zoom;
    const fit = Math.min(Math.min(30, height * 0.2) / 32, Math.min(136, width * 0.62) / 128) / zoom;
    if (!(fit > 0)) return;
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'web-slot-upload';
    upload.setAttribute('aria-label', '上传');
    upload.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.8 0L9 18"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/></svg><span>上传</span>';
    upload.style.left = frame.offsetLeft + frame.offsetWidth / 2 + 'px';
    upload.style.top = frame.offsetTop - 14 / zoom + 'px';
    upload.style.transform = 'translate(-50%, -100%) scale(' + fit + ')';
    upload.addEventListener('pointerdown', (event) => event.stopPropagation());
    upload.addEventListener('dblclick', (event) => event.stopPropagation());
    upload.addEventListener('click', (event) => {
      event.stopPropagation();
      options.upload(node.id);
    });
    card.append(upload);
  });
}

/** Anchors the 素材规范 popover above its pill, clamped to the board, without affecting composer layout. */
export function canvasWebPlacePopover(
  toolbar: HTMLElement,
  board: { left: number; top: number; right: number; bottom: number; width: number },
  gap: number
) {
  const popover = toolbar.querySelector('.generation-asset-popover') as HTMLElement | null;
  const wrap = popover && popover.parentElement;
  if (!popover || !wrap) return;
  popover.style.maxWidth = Math.max(0, board.width - gap * 2) + 'px';
  const anchor = wrap.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const left = Math.max(board.left + gap, Math.min(anchor.left, board.right - gap - width));
  const top = Math.max(
    board.top + gap,
    Math.min(anchor.top - 8 - height, board.bottom - gap - height)
  );
  // Offsets stay relative to the pill wrap, so the popover follows the composer between renders.
  popover.style.left = left - anchor.left + 'px';
  popover.style.top = top - anchor.top + 'px';
  popover.style.bottom = 'auto';
}

/** Board-local rect left after cutting away floating bars (tool dock, flow bar) on their side. */
export function canvasWebFitArea(
  board: { left: number; top: number; width: number; height: number },
  overlays: { left: number; top: number; right: number; bottom: number }[],
  margin: number
) {
  let left = board.left;
  let top = board.top;
  let right = board.left + board.width;
  let bottom = board.top + board.height;
  for (const item of overlays) {
    if (item.right <= left || item.left >= right || item.bottom <= top || item.top >= bottom)
      continue;
    // Keep the largest strip beside the bar; bars hugging an edge then trim just that edge.
    const strips = [
      { side: 'left', area: (right - item.right) * (bottom - top) },
      { side: 'right', area: (item.left - left) * (bottom - top) },
      { side: 'top', area: (bottom - item.bottom) * (right - left) },
      { side: 'bottom', area: (item.top - top) * (right - left) },
    ].sort((a, b) => b.area - a.area);
    const side = strips[0].side;
    if (side === 'left') left = Math.max(left, item.right);
    else if (side === 'right') right = Math.min(right, item.left);
    else if (side === 'top') top = Math.max(top, item.bottom);
    else bottom = Math.min(bottom, item.top);
  }
  return {
    x: left - board.left + margin,
    y: top - board.top + margin,
    width: Math.max(1, right - left - margin * 2),
    height: Math.max(1, bottom - top - margin * 2),
  };
}

/** Web-only pointer chrome: handle magnet, connection drag preview, drop target and pill selects. */
export function createCanvasWebChrome(options: {
  board: HTMLElement;
  current(): CanvasDocument | null;
}) {
  const board = options.board;
  installCanvasWebTooltips();
  const grip = document.querySelector('.workspace-toolbar-grip');
  // lucide grip-horizontal: the Braille glyph renders unevenly across system fonts.
  if (grip)
    grip.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="5" cy="9" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="19" cy="15" r="1"/><circle cx="5" cy="15" r="1"/></svg>';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'web-wire-preview');
  svg.setAttribute('aria-hidden', 'true');
  board.append(svg);
  let target: Element | null = null;
  let hot: HTMLElement | null = null;
  function line(d: string, className: string) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    return path;
  }
  function mark(next: Element | null) {
    if (target === next) return;
    if (target) target.classList.remove('web-wire-target');
    target = next;
    if (target) target.classList.add('web-wire-target');
  }
  function clear() {
    svg.replaceChildren();
    mark(null);
  }
  function rest(port: HTMLElement | null) {
    if (!port) return;
    port.classList.remove('is-magnet');
    port.style.removeProperty('--web-mx');
    port.style.removeProperty('--web-my');
  }
  /** Draws the pending wire; snaps to the facing side of an image card under the pointer. */
  function preview(drag: { id: string; reverse?: boolean }, event: PointerEvent) {
    const doc = options.current();
    const found = doc && doc.nodes.find((node) => node.id === drag.id);
    if (!doc || !found) return;
    const source = canvasWebBox(found);
    const view = doc.viewport;
    const rect = board.getBoundingClientRect();
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const card = hit && hit.closest ? hit.closest('.card[data-id]') : null;
    const id = card && card.getAttribute('data-id');
    const hitNode =
      id && id !== drag.id
        ? doc.nodes.find((item) => item.id === id && ['image', 'video'].includes(item.type))
        : undefined;
    const node = hitNode && canvasWebBox(hitNode);
    mark(node ? card : null);
    const dir = drag.reverse ? -1 : 1;
    const p0 = {
      x: drag.reverse ? source.x : source.x + source.width,
      y: source.y + source.height / 2,
    };
    const p1 = node
      ? { x: drag.reverse ? node.x + node.width : node.x, y: node.y + node.height / 2 }
      : {
          x: (event.clientX - rect.left - view.x) / view.scale,
          y: (event.clientY - rect.top - view.y) / view.scale,
        };
    const d = canvasWebCurve(p0, p1, dir, view).d;
    svg.replaceChildren(line(d, 'web-wire-preview-glow'), line(d, 'web-wire-preview-line'));
  }
  board.addEventListener('pointermove', (event) => {
    const element = event.target as HTMLElement;
    const port = event.buttons ? null : (element.closest('.canvas-port') as HTMLElement | null);
    if (hot !== port) rest(hot);
    hot = port;
    if (!port) return;
    // The ring follows the pointer inside the 80px hot zone, capped at 30px like Mivo's magnet.
    const box = port.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy);
    const limit = distance > 30 ? 30 / distance : 1;
    port.classList.add('is-magnet');
    port.style.setProperty('--web-mx', dx * limit + 'px');
    port.style.setProperty('--web-my', dy * limit + 'px');
  });
  board.addEventListener('pointerleave', () => {
    rest(hot);
    hot = null;
  });
  // The page owns drop handling; the preview only has to vanish however the gesture ends.
  for (const name of ['pointerup', 'pointercancel', 'blur'])
    window.addEventListener(name, clear, true);
  const toolbar = document.getElementById('selection-toolbar');
  const measure = document.createElement('canvas').getContext('2d');
  function fitSelects() {
    if (!toolbar || !measure) return;
    toolbar.querySelectorAll('select.generation-mode').forEach((element) => {
      const select = element as HTMLSelectElement;
      const option = select.options[select.selectedIndex];
      measure.font = getComputedStyle(select).font;
      // Native selects size to their widest option; Web pills size to the chosen label.
      const width = Math.ceil(measure.measureText(option ? option.text : '').width);
      // 28px padding + 2px border, plus slack because canvas and form-control text metrics differ.
      select.style.width = Math.min(220, width + 36) + 'px';
    });
  }
  if (toolbar) {
    new MutationObserver(fitSelects).observe(toolbar, { childList: true, subtree: true });
    toolbar.addEventListener('change', fitSelects);
  }
  return { preview, clear };
}

/** Play/pause glyph and label for the Web video card control, kept in step with the element. */
export function canvasWebSyncVideoPlay(button: HTMLElement, player: HTMLVideoElement) {
  const playing = !player.paused && !player.ended;
  const label = playing ? '暂停视频' : '播放视频';
  if (button.dataset.playing === String(playing)) return;
  button.dataset.playing = String(playing);
  button.setAttribute('aria-label', label);
  button.dataset.webTip = label;
  // lucide play / pause
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (playing
      ? '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'
      : '<polygon points="6 3 20 12 6 21 6 3"/>') +
    '</svg>';
}

/** Web video progress bar (time, seek slider, mute); built once per reused player so it survives re-renders. */
export function canvasWebVideoBar(player: HTMLVideoElement): HTMLElement {
  const owner = player as HTMLVideoElement & { canvasWebBar?: HTMLElement };
  if (owner.canvasWebBar) return owner.canvasWebBar;
  const bar = document.createElement('div');
  bar.className = 'web-video-bar';
  const time = document.createElement('span');
  time.className = 'web-video-time';
  const track = document.createElement('div');
  track.className = 'web-video-track';
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-label', '播放进度');
  track.setAttribute('aria-valuemin', '0');
  const fill = document.createElement('div');
  fill.className = 'web-video-fill';
  const thumb = document.createElement('div');
  thumb.className = 'web-video-thumb';
  track.append(fill, thumb);
  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'web-video-mute';
  bar.append(time, track, mute);
  owner.canvasWebBar = bar;
  const clock = (seconds: number) => {
    const whole = Math.max(0, Math.floor(seconds || 0));
    return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
  };
  const duration = () => (Number.isFinite(player.duration) ? player.duration : 0);
  let frame = 0;
  const sync = () => {
    const total = duration();
    const now = Math.min(player.currentTime || 0, total || Infinity);
    const text = clock(now) + ' / ' + clock(total);
    const ratio = total ? Math.min(1, now / total) : 0;
    time.textContent = text;
    fill.style.width = ratio * 100 + '%';
    thumb.style.left = ratio * 100 + '%';
    track.setAttribute('aria-valuemax', String(Math.round(total * 10) / 10));
    track.setAttribute('aria-valuenow', String(Math.round(now * 10) / 10));
    track.setAttribute('aria-valuetext', text);
    bar.dataset.playing = String(!player.paused && !player.ended);
    const muted = player.muted || player.volume === 0;
    const label = muted ? '取消静音' : '静音';
    mute.setAttribute('aria-label', label);
    mute.setAttribute('aria-pressed', String(muted));
    mute.dataset.webTip = label;
    // lucide volume-2 / volume-x
    mute.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/>' +
      (muted
        ? '<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>'
        : '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.7"/>') +
      '</svg>';
  };
  // timeupdate fires ~4Hz, so a frame loop keeps the bar smooth while playing.
  const loop = () => {
    frame = 0;
    sync();
    if (!player.paused && !player.ended && player.isConnected) frame = requestAnimationFrame(loop);
  };
  const seek = (seconds: number) => {
    const total = duration();
    if (!total) return;
    player.currentTime = Math.max(0, Math.min(total, seconds));
    sync();
  };
  const seekAt = (clientX: number) => {
    const rect = track.getBoundingClientRect();
    if (rect.width > 0) seek(((clientX - rect.left) / rect.width) * duration());
  };
  // MediaRecorder WebMs report an Infinity duration until seeked past the end, which leaves nothing to seek.
  let probing = false;
  player.addEventListener('loadedmetadata', () => {
    if (player.duration !== Infinity || !player.paused || player.currentTime) return;
    probing = true;
    player.currentTime = 1e7;
  });
  player.addEventListener('durationchange', () => {
    if (!probing || !Number.isFinite(player.duration)) return;
    probing = false;
    player.currentTime = 0;
  });
  [
    'loadedmetadata',
    'durationchange',
    'timeupdate',
    'seeked',
    'pause',
    'ended',
    'volumechange',
  ].forEach((name) => player.addEventListener(name, sync));
  player.addEventListener('play', () => {
    if (!frame) frame = requestAnimationFrame(loop);
    sync();
  });
  // The card drags on pointerdown, so nothing that starts on the bar may reach it.
  ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu'].forEach((name) =>
    bar.addEventListener(name, (event) => event.stopPropagation())
  );
  track.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    track.focus({ preventScroll: true });
    track.setPointerCapture(event.pointerId);
    bar.dataset.seeking = 'true';
    seekAt(event.clientX);
  });
  track.addEventListener('pointermove', (event) => {
    if (track.hasPointerCapture(event.pointerId)) seekAt(event.clientX);
  });
  const release = (event: PointerEvent) => {
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    delete bar.dataset.seeking;
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  track.addEventListener('keydown', (event) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
    };
    if (event.key in steps) seek((player.currentTime || 0) + steps[event.key]);
    else if (event.key === 'Home') seek(0);
    else if (event.key === 'End') seek(duration());
    else return;
    // Canvas shortcuts (arrow nudge, delete) must not also act on the selected card.
    event.preventDefault();
    event.stopPropagation();
  });
  mute.addEventListener('click', () => {
    player.muted = !(player.muted || player.volume === 0);
    if (!player.muted && player.volume === 0) player.volume = 1;
    sync();
  });
  sync();
  return bar;
}
/** Side + chooser: a small menu next to the ring; arrows move, Esc closes and refocuses the +. */
export function openCanvasWebSlotChooser(options: {
  anchor: HTMLElement;
  items: Array<{ label: string; icon: 'image' | 'video'; run(): void }>;
  restoreFocus(): void;
}) {
  document.querySelector('.web-slot-chooser')?.remove();
  // lucide image / video, same strokes as the slot glyphs.
  const icons = {
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    video:
      '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  };
  const menu = document.createElement('div');
  menu.className = 'web-slot-chooser';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '新建卡片');
  const outside = (event: Event) => {
    if (!menu.contains(event.target as Node)) close(false);
  };
  const dismiss = () => close(false);
  function close(restore: boolean) {
    if (!menu.isConnected) return;
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('wheel', dismiss, true);
    window.removeEventListener('blur', dismiss);
    if (restore) options.restoreFocus();
  }
  const buttons = options.items.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      icons[item.icon] +
      '</svg>';
    const text = document.createElement('span');
    text.textContent = item.label;
    button.append(text);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      close(false);
      item.run();
    });
    menu.append(button);
    return button;
  });
  menu.addEventListener('pointerdown', (event) => event.stopPropagation());
  menu.addEventListener('keydown', (event) => {
    // Canvas shortcuts (Delete, Space pan, undo) must not fire while the menu owns the keyboard.
    event.stopPropagation();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      buttons[(next + buttons.length) % buttons.length].focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(buttons.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(false);
  });
  document.body.append(menu);
  // The visible ring sits 25px inside the 80px hot zone, so the menu opens just right of the ring.
  const box = options.anchor.getBoundingClientRect();
  const left = box.left + box.width / 2 - 25 + 18;
  const top = box.top + box.height / 2 - menu.offsetHeight / 2;
  menu.style.left = Math.max(8, Math.min(left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(top, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('wheel', dismiss, true);
  window.addEventListener('blur', dismiss);
  buttons[0]?.focus();
  return { close };
}
