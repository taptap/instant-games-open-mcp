import type { CanvasDocument, CanvasEdge } from './model.js';
import { canvasWireGeometry, canvasWirePath } from './wirePath.js';

export function createCanvasWireUi(options: {
  board: HTMLElement;
  current(): CanvasDocument | null;
  blocked(): boolean;
  panning(): boolean;
  select(): void;
  remember(): void;
  changed(): void;
  render(): void;
}) {
  const overlay = document.createElement('div');
  overlay.className = 'wire-controls';
  options.board.append(overlay);
  let selectedId = '';
  let canvasId = '';
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
    const from = doc?.nodes.find((node) => node.id === item.from);
    const to = doc?.nodes.find((node) => node.id === item.to);
    return doc && from && to
      ? canvasWireGeometry(from, to, doc.nodes, doc.edges, item.route)
      : null;
  }
  function sync() {
    const doc = options.current();
    if (doc?.id !== canvasId) {
      canvasId = doc?.id || '';
      selectedId = '';
    }
    overlay.replaceChildren();
    const item = edge();
    const shape = item && geometry(item);
    if (!doc || !item || !shape) return;
    const view = doc.viewport;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    const from = doc.nodes.find((node) => node.id === item.from)!;
    const to = doc.nodes.find((node) => node.id === item.to)!;
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
  }
  // Hit-test only empty canvas/group space. Cards keep their normal pointer behavior.
  options.board.addEventListener(
    'pointerdown',
    (event) => {
      if (moving || options.panning() || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('.wire-controls')) return;
      const card = target.closest('.card');
      if (
        (card && !(card === target && card.classList.contains('section'))) ||
        target.closest('button,input,textarea,select')
      ) {
        if (selectedId) {
          selectedId = '';
          sync();
        }
        return;
      }
      const doc = options.current();
      if (!doc || options.blocked()) return;
      const rect = options.board.getBoundingClientRect();
      const px = event.clientX - rect.left,
        py = event.clientY - rect.top;
      let best = 9,
        found = '';
      for (const item of doc.edges) {
        const shape = geometry(item);
        if (!shape) continue;
        for (let i = 1; i < shape.points.length; i++) {
          const a = shape.points[i - 1],
            b = shape.points[i];
          const ax = doc.viewport.x + a.x * doc.viewport.scale,
            ay = doc.viewport.y + a.y * doc.viewport.scale;
          const dx = (b.x - a.x) * doc.viewport.scale,
            dy = (b.y - a.y) * doc.viewport.scale;
          const t = Math.max(
            0,
            Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
          );
          const distance = Math.hypot(px - ax - t * dx, py - ay - t * dy);
          if (distance < best) {
            best = distance;
            found = item.id;
          }
        }
      }
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
  +'.wire-controls { position:absolute; inset:0; pointer-events:none; z-index:5; overflow:hidden; }' +
  '.wire-controls svg { position:absolute; width:100%; height:100%; }' +
  '.wire-handle { position:absolute; width:18px; height:18px; padding:0; border:2px solid #ffe0a0; border-radius:6px; background:#594d34; transform:translate(-50%,-50%); pointer-events:auto; touch-action:none; }' +
  '.wire-handle[data-axis=x] { cursor:ew-resize; } .wire-handle[data-axis=y] { cursor:ns-resize; }' +
  '.wire-reset { position:absolute; pointer-events:auto; padding:5px 9px; font-size:11px; }';
