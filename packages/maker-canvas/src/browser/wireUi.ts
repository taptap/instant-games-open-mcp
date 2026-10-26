import type { CanvasDocument, CanvasEdge } from '../contracts.js';
import { canvasWireGeometry, canvasWirePath } from '../core/wirePath.js';
import { resourceBundleOwner } from '../features/resourceBundle.js';

type CanvasPoint = { x: number; y: number };
type CanvasView = { x: number; y: number; scale: number };
/** Mivo-style horizontal cubic in world space; d is projected to board pixels. */
export function canvasWebCurve(p0: CanvasPoint, p1: CanvasPoint, dir: number, view: CanvasView) {
  // Mivo's curvature rule: tangents leave each side horizontally, clamp(len * .45, 40, 200).
  const reach = Math.min(200, Math.max(40, Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.45));
  const c1 = { x: p0.x + dir * reach, y: p0.y };
  const c2 = { x: p1.x - dir * reach, y: p1.y };
  const points: CanvasPoint[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const m = 1 - t;
    const a = m * m * m,
      b = 3 * m * m * t,
      c = 3 * m * t * t,
      d = t * t * t;
    points.push({
      x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
    });
  }
  const screen = (p: CanvasPoint) => view.x + p.x * view.scale + ' ' + (view.y + p.y * view.scale);
  return {
    d: 'M ' + screen(p0) + ' C ' + screen(c1) + ', ' + screen(c2) + ', ' + screen(p1),
    points,
    mid: points[12],
  };
}
type CanvasBox = CanvasPoint & { id?: string; width: number; height: number };
/** Rendered image-frame box in world units; Mivo anchors to the frame, not the caption row above it. */
export function canvasWebBox(node: CanvasBox): CanvasBox {
  const card =
    node.id &&
    (document.querySelector(
      '#world > .card[data-id="' + CSS.escape(node.id) + '"]'
    ) as HTMLElement);
  if (!card) return node;
  const frame = card.querySelector(':scope > .canvas-card-content') as HTMLElement | null;
  return frame
    ? {
        x: node.x + frame.offsetLeft,
        y: node.y + frame.offsetTop,
        width: frame.offsetWidth,
        height: frame.offsetHeight,
      }
    : { x: node.x, y: node.y, width: card.offsetWidth, height: card.offsetHeight };
}
/** Joins the facing side centers, like Mivo's left/right derivation bindings. */
export function canvasWebWire(fromNode: CanvasBox, toNode: CanvasBox, view: CanvasView) {
  const from = canvasWebBox(fromNode);
  const to = canvasWebBox(toNode);
  const forward = to.x + to.width / 2 >= from.x + from.width / 2;
  return canvasWebCurve(
    { x: forward ? from.x + from.width : from.x, y: from.y + from.height / 2 },
    { x: forward ? to.x : to.x + to.width, y: to.y + to.height / 2 },
    forward ? 1 : -1,
    view
  );
}

export function createCanvasWireUi(options: {
  board: HTMLElement;
  current(): CanvasDocument | null;
  blocked(): boolean;
  panning(): boolean;
  select(): void;
  remember(): void;
  changed(): void;
  render(): void;
  /** Deletes a reference edge; absent keeps edges removable only through cards and commands. */
  remove?(edge: CanvasEdge): void;
  /** Web skin: image references draw as curves with hover glow and a scissors cut. */
  web?: boolean;
}) {
  const overlay = document.createElement('div');
  overlay.className = 'wire-controls';
  options.board.append(overlay);
  let selectedId = '';
  let canvasId = '';
  let hoverId = '';
  let cutId = '';
  let hoverTimer = 0;
  const removable = (item: CanvasEdge) =>
    Boolean(options.remove) && ['image-variant', 'first-frame'].includes(item.kind);
  const curved = (item: CanvasEdge) => Boolean(options.web) && item.kind === 'image-variant';
  function ends(doc: CanvasDocument, item: CanvasEdge) {
    if (resourceBundleOwner(doc, item.from)) return null;
    const from = doc.nodes.find((node) => node.id === item.from);
    const to = resourceBundleOwner(doc, item.to) || doc.nodes.find((node) => node.id === item.to);
    return from && to ? { from, to } : null;
  }
  function curve(doc: CanvasDocument, item: CanvasEdge) {
    const pair = ends(doc, item);
    return pair ? canvasWebWire(pair.from, pair.to, doc.viewport) : null;
  }
  let moving: {
    pointer: number;
    axis: 'x' | 'y';
    start: number;
    offset: number;
    moved: boolean;
  } | null = null;
  function edge() {
    return options.current()?.edges.find((item) => item.id === selectedId);
  }
  function geometry(item: CanvasEdge) {
    const doc = options.current();
    if (doc && resourceBundleOwner(doc, item.from)) return null;
    const from = doc?.nodes.find((node) => node.id === item.from);
    const to =
      doc && (resourceBundleOwner(doc, item.to) || doc.nodes.find((node) => node.id === item.to));
    if (doc && from && to && curved(item))
      return { points: canvasWebWire(from, to, { x: 0, y: 0, scale: 1 }).points, handles: [] };
    return doc && from && to
      ? canvasWireGeometry(from, to, doc.nodes, doc.edges, item.route)
      : null;
  }
  function drawActive(svg: SVGSVGElement, d: string) {
    // Mivo's comet glow table [length, head offset, alpha] over a 260px flowing cycle.
    const layers = [
      [100, 0, 0.1],
      [78, 22, 0.14],
      [58, 42, 0.18],
      [40, 60, 0.26],
      [24, 76, 0.38],
      [11, 89, 0.55],
    ];
    const line = document.createElementNS(svg.namespaceURI, 'path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'wire wire-active');
    svg.append(line);
    for (const [length, offset, alpha] of layers) {
      const glow = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement;
      glow.setAttribute('d', d);
      glow.setAttribute('class', 'wire-glow');
      glow.setAttribute('stroke-dasharray', length + ' ' + (260 - length));
      glow.style.opacity = String(alpha);
      // Negative delay = head offset plus a wall-clock phase, so re-renders continue the flow instead of restarting it.
      glow.style.animationDelay = -((offset / 260) * 1.08 + ((Date.now() / 1000) % 1.08)) + 's';
      svg.append(glow);
    }
  }
  function syncCurves(doc: CanvasDocument) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.append(svg);
    for (const id of hoverId && hoverId !== selectedId ? [selectedId, hoverId] : [selectedId]) {
      const item = doc.edges.find((entry) => entry.id === id);
      const shape = item && curved(item) && curve(doc, item);
      if (!item || !shape) continue;
      drawActive(svg, shape.d);
      if (!removable(item) || (id !== selectedId && id !== cutId)) continue;
      const cut = document.createElement('button');
      cut.type = 'button';
      cut.className = 'wire-remove wire-scissors';
      cut.setAttribute('aria-label', '删除连线');
      cut.dataset.webTip = '删除连线';
      cut.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>';
      cut.style.left = doc.viewport.x + shape.mid.x * doc.viewport.scale + 'px';
      cut.style.top = doc.viewport.y + shape.mid.y * doc.viewport.scale + 'px';
      cut.addEventListener('pointerdown', (event) => event.stopPropagation());
      cut.addEventListener('click', (event) => {
        event.stopPropagation();
        if (options.blocked()) return;
        selectedId = hoverId = cutId = '';
        options.remove!(item);
      });
      overlay.append(cut);
    }
  }
  function sync() {
    const doc = options.current();
    if (doc?.id !== canvasId) {
      canvasId = doc?.id || '';
      selectedId = hoverId = cutId = '';
    }
    overlay.replaceChildren();
    if (doc && options.web) syncCurves(doc);
    const item = edge();
    if (item && curved(item)) return;
    const shape = item && geometry(item);
    if (!doc || !item || !shape) return;
    const view = doc.viewport;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    const from = doc.nodes.find((node) => node.id === item.from)!;
    const to = resourceBundleOwner(doc, item.to) || doc.nodes.find((node) => node.id === item.to)!;
    path.setAttribute('d', canvasWirePath(from, to, doc.nodes, view, doc.edges, item.route));
    path.setAttribute('class', 'wire wire-focused');
    svg.append(path);
    overlay.append(svg);
    for (const handle of shape.handles) {
      const button = document.createElement('button');
      button.className = 'wire-handle';
      button.dataset.axis = handle.axis;
      button.title = handle.axis === 'x' ? '左右拖动竖段' : '上下拖动横段';
      button.setAttribute('aria-label', button.title);
      button.style.left = view.x + handle.x * view.scale + 'px';
      button.style.top = view.y + handle.y * view.scale + 'px';
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || options.panning() || options.blocked()) return;
        event.preventDefault();
        event.stopPropagation();
        moving = {
          pointer: event.pointerId,
          axis: handle.axis,
          start: handle.axis === 'x' ? event.clientX : event.clientY,
          offset: item.route?.[handle.axis] || 0,
          moved: false,
        };
        options.board.setPointerCapture(event.pointerId);
      });
      overlay.append(button);
    }
    const reset = document.createElement('button');
    reset.className = 'wire-reset';
    reset.textContent = '恢复自动走线';
    reset.disabled = !item.route;
    reset.style.left =
      Math.max(
        8,
        Math.min(options.board.clientWidth - 125, view.x + shape.handles[0].x * view.scale + 18)
      ) + 'px';
    reset.style.top =
      Math.max(
        8,
        Math.min(options.board.clientHeight - 40, view.y + shape.handles[0].y * view.scale - 40)
      ) + 'px';
    reset.addEventListener('click', () => {
      if (options.blocked() || !item.route) return;
      options.remember();
      delete item.route;
      options.changed();
      options.render();
    });
    overlay.append(reset);
    if (options.remove && ['image-variant', 'first-frame'].includes(item.kind)) {
      const remove = document.createElement('button');
      remove.className = 'wire-reset wire-remove';
      remove.textContent = '删除连线';
      remove.style.left = reset.style.left;
      remove.style.top = parseFloat(reset.style.top) + 32 + 'px';
      remove.addEventListener('click', () => {
        if (options.blocked()) return;
        selectedId = '';
        options.remove!(item);
      });
      overlay.append(remove);
    }
  }
  function overCard(target: HTMLElement) {
    const card = target.closest('.card');
    return Boolean(
      (card && !(card === target && card.classList.contains('section'))) ||
        target.closest('button,input,textarea,select')
    );
  }
  function nearest(doc: CanvasDocument, event: PointerEvent, only?: (item: CanvasEdge) => boolean) {
    const rect = options.board.getBoundingClientRect();
    const px = event.clientX - rect.left,
      py = event.clientY - rect.top;
    let best = 9,
      found = '';
    for (const item of doc.edges) {
      const shape = (!only || only(item)) && geometry(item);
      if (!shape) continue;
      for (let i = 1; i < shape.points.length; i++) {
        const a = shape.points[i - 1],
          b = shape.points[i];
        const ax = doc.viewport.x + a.x * doc.viewport.scale,
          ay = doc.viewport.y + a.y * doc.viewport.scale;
        const dx = (b.x - a.x) * doc.viewport.scale,
          dy = (b.y - a.y) * doc.viewport.scale;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        const distance = Math.hypot(px - ax - t * dx, py - ay - t * dy);
        if (distance < best) {
          best = distance;
          found = item.id;
        }
      }
    }
    return found;
  }
  // Hit-test only empty canvas/group space. Cards keep their normal pointer behavior.
  options.board.addEventListener(
    'pointerdown',
    (event) => {
      if (moving || options.panning() || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('.wire-controls')) return;
      if (overCard(target)) {
        if (selectedId) {
          selectedId = '';
          sync();
        }
        return;
      }
      const doc = options.current();
      if (!doc || options.blocked()) return;
      const found = nearest(doc, event);
      selectedId = found;
      if (found) {
        event.preventDefault();
        event.stopImmediatePropagation();
        options.select();
        options.render();
      } else sync();
    },
    true
  );
  if (options.web)
    options.board.addEventListener('pointermove', (event) => {
      if (moving || event.buttons) return;
      const target = event.target as HTMLElement;
      if (target.closest('.wire-controls')) return;
      const doc = options.current();
      const next = doc && !overCard(target) ? nearest(doc, event, curved) : '';
      if (next === hoverId) return;
      hoverId = next;
      cutId = '';
      clearTimeout(hoverTimer);
      // Mivo reveals the cut button only after a deliberate 1s hover, so passing over a wire stays quiet.
      if (next)
        hoverTimer = window.setTimeout(() => {
          if (hoverId !== next) return;
          cutId = next;
          sync();
        }, 1000);
      sync();
    });
  options.board.addEventListener(
    'pointermove',
    (event) => {
      if (!moving || event.pointerId !== moving.pointer) return;
      event.stopImmediatePropagation();
      const item = edge(),
        doc = options.current();
      if (!item || !doc) return;
      const delta = (moving.axis === 'x' ? event.clientX : event.clientY) - moving.start;
      if (!moving.moved && Math.abs(delta) < 3) return;
      if (!moving.moved) {
        options.remember();
        moving.moved = true;
      }
      item.route = {
        x: item.route?.x || 0,
        y: item.route?.y || 0,
        [moving.axis]: Math.max(
          -100000,
          Math.min(100000, moving.offset + delta / doc.viewport.scale)
        ),
      };
      options.render();
    },
    true
  );
  function finish(event?: PointerEvent) {
    if (!moving || (event && event.pointerId !== moving.pointer)) return;
    event?.stopImmediatePropagation();
    const state = moving;
    moving = null;
    if (options.board.hasPointerCapture(state.pointer))
      options.board.releasePointerCapture(state.pointer);
    if (state.moved) options.changed();
    options.render();
  }
  options.board.addEventListener('pointerup', finish, true);
  options.board.addEventListener('pointercancel', finish, true);
  options.board.addEventListener('lostpointercapture', finish);
  window.addEventListener('blur', () => finish());
  options.board.addEventListener(
    'wheel',
    (event) => {
      if (moving) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true, passive: false }
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (moving) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === 'Escape') {
        selectedId = '';
        sync();
      }
      const target = event.target as HTMLElement | null;
      const item = edge();
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        options.remove &&
        item &&
        ['image-variant', 'first-frame'].includes(item.kind) &&
        !target?.closest?.('textarea, input, select') &&
        !options.blocked()
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectedId = '';
        options.remove(item);
      }
    },
    true
  );
  return {
    sync,
    get isBusy() {
      return Boolean(moving);
    },
  };
}

export const CANVAS_WIRE_STYLES =
  '.wire-controls { position:absolute; inset:0; pointer-events:none; z-index:5; overflow:hidden; }' +
  '.wire-controls svg { position:absolute; width:100%; height:100%; }' +
  '.wire-handle { position:absolute; width:18px; height:18px; padding:0; border:2px solid #ffe0a0; border-radius:6px; background:#594d34; transform:translate(-50%,-50%); pointer-events:auto; touch-action:none; }' +
  '.wire-handle[data-axis=x] { cursor:ew-resize; } .wire-handle[data-axis=y] { cursor:ns-resize; }' +
  '.wire-reset { position:absolute; pointer-events:auto; padding:5px 9px; font-size:11px; }';
