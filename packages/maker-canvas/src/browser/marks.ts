import type { CanvasMarkShape, CanvasMark, CanvasNode } from '../contracts.js';
import { canvasMarkEnds, canvasMarkMoveEndpoint, canvasMarkResizeEdge } from '../core/marks.js';

export function renderCanvasMark(
  card: HTMLElement,
  node: { width: number; height: number; title?: string; mark?: CanvasMark }
): void {
  const mark = node.mark;
  if (!mark) return;
  const resizeHandle = card.querySelector('.resize-handle');
  card.classList.add('canvas-mark');
  card.replaceChildren();
  card.setAttribute('aria-label', node.title || (mark.shape === 'arrow' ? '箭头' : '圈'));
  if (mark.shape === 'arrow') {
    const ends = canvasMarkEnds(node);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + node.width + ' ' + node.height);
    svg.setAttribute('aria-hidden', 'true');
    const dx = ends.to.x - ends.from.x;
    const dy = ends.to.y - ends.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const head = Math.min(18, Math.max(10, length * 0.28), length * 0.45);
    const base = { x: ends.to.x - ux * head, y: ends.to.y - uy * head };
    const wing = head * 0.5;
    const hit = document.createElementNS(svg.namespaceURI, 'line');
    hit.setAttribute('class', 'mark-hit');
    hit.setAttribute('x1', String(ends.from.x));
    hit.setAttribute('y1', String(ends.from.y));
    hit.setAttribute('x2', String(ends.to.x));
    hit.setAttribute('y2', String(ends.to.y));
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '18');
    hit.setAttribute('stroke-linecap', 'round');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', String(ends.from.x));
    line.setAttribute('y1', String(ends.from.y));
    line.setAttribute('x2', String(base.x));
    line.setAttribute('y2', String(base.y));
    line.setAttribute('stroke', mark.color);
    line.setAttribute('stroke-width', String(Math.max(3, mark.stroke)));
    line.setAttribute('stroke-linecap', 'round');
    const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
    polygon.setAttribute('fill', mark.color);
    polygon.setAttribute(
      'points',
      [
        ends.to,
        { x: base.x - uy * wing, y: base.y + ux * wing },
        { x: base.x + uy * wing, y: base.y - ux * wing },
      ]
        .map((point) => point.x + ',' + point.y)
        .join(' ')
    );
    svg.append(hit, line, polygon);
    card.append(svg);
    for (const which of ['from', 'to'] as const) {
      const point = ends[which];
      const dot = document.createElement('div');
      dot.className = 'mark-point';
      dot.dataset.end = which;
      dot.style.left = point.x + 'px';
      dot.style.top = point.y + 'px';
      dot.setAttribute('aria-label', which === 'to' ? '拖动箭头终点' : '拖动箭头起点');
      card.append(dot);
    }
  } else {
    const box = document.createElement('div');
    box.className = 'mark-hit mark-box';
    box.style.border = mark.stroke + 'px solid ' + mark.color;
    card.append(box);
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      const bar = document.createElement('div');
      bar.className = 'mark-edge';
      bar.dataset.edge = edge;
      bar.setAttribute(
        'aria-label',
        '拖动' +
          ({ top: '上', right: '右', bottom: '下', left: '左' } as Record<string, string>)[edge] +
          '边'
      );
      card.append(bar);
    }
    // Corners move two edges at once, so the frame can be stretched diagonally.
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const dot = document.createElement('div');
      dot.className = 'mark-corner';
      dot.dataset.corner = corner;
      dot.setAttribute(
        'aria-label',
        '拖动' +
          ({ nw: '左上', ne: '右上', sw: '左下', se: '右下' } as Record<string, string>)[corner] +
          '角'
      );
      card.append(dot);
    }
    if (resizeHandle) card.append(resizeHandle);
  }
}

export function drawCanvasMark(
  context: CanvasRenderingContext2D,
  node: { width: number; height: number; mark?: CanvasMark },
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const mark = node.mark;
  if (!mark || width < 1 || height < 1) return;
  const scale = width / Math.max(1, node.width);
  context.save();
  context.translate(x, y);
  context.strokeStyle = mark.color;
  context.fillStyle = mark.color;
  context.lineWidth = Math.max(1, mark.stroke * scale);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (mark.shape === 'ellipse') {
    const inset = context.lineWidth / 2 + scale;
    context.strokeRect(
      inset,
      inset,
      Math.max(1, width - inset * 2),
      Math.max(1, height - inset * 2)
    );
  } else {
    const ends = canvasMarkEnds(node);
    const sx = width / Math.max(1, node.width);
    const sy = height / Math.max(1, node.height);
    const from = { x: ends.from.x * sx, y: ends.from.y * sy };
    const to = { x: ends.to.x * sx, y: ends.to.y * sy };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const head = Math.min(18 * scale, Math.max(10 * scale, length * 0.28), length * 0.45);
    context.lineWidth = Math.max(3, mark.stroke) * scale;
    const base = { x: to.x - ux * head, y: to.y - uy * head };
    const wing = head * 0.5;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(base.x, base.y);
    context.stroke();
    context.beginPath();
    context.moveTo(to.x, to.y);
    context.lineTo(base.x - uy * wing, base.y + ux * wing);
    context.lineTo(base.x + uy * wing, base.y - ux * wing);
    context.closePath();
    context.fill();
  }
  context.restore();
}

export function createCanvasMarks(options: {
  board(): HTMLElement;
  document(): { nodes: CanvasNode[] } | null;
  worldPoint(event: PointerEvent): { x: number; y: number };
  navigation(): boolean;
  blocked(): boolean;
  remember(): void;
  changed(): void;
  render(): void;
  select(id: string): void;
  place?(shape: CanvasMarkShape): void;
  beginPan?(event: PointerEvent): void;
}) {
  type CanvasTool = 'select' | 'pan';
  let mode: CanvasTool = 'select';
  const buttons = {
    select: document.getElementById('tool-select'),
    pan: document.getElementById('tool-pan'),
    ellipse: document.getElementById('mark-ellipse'),
    arrow: document.getElementById('mark-arrow'),
  };
  // Held-Space panning is temporary: the dock and cursor show the hand without changing mode.
  let previewPan = false;
  function sync() {
    const pan = mode === 'pan' || previewPan;
    buttons.select?.setAttribute('aria-pressed', String(!pan));
    buttons.pan?.setAttribute('aria-pressed', String(pan));
    options.board().classList.toggle('pan-tool', pan);
    if (!pan) options.board().classList.remove('grabbing');
  }
  function setMode(next: CanvasTool) {
    mode = next;
    sync();
  }
  function place(shape: CanvasMarkShape) {
    if (options.blocked()) return;
    setMode('select');
    options.place?.(shape);
  }
  function onPanDown(event: PointerEvent) {
    if (mode !== 'pan' || event.button !== 0 || !options.beginPan) return;
    const target = event.target as Element | null;
    if (target?.closest('dialog')) return;
    if (!options.document()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.beginPan(event);
    const board = options.board();
    board.setPointerCapture?.(event.pointerId);
    board.classList.add('grabbing');
  }
  function releaseGrab() {
    options.board().classList.remove('grabbing');
  }

  let edit: {
    pointerId: number;
    id: string;
    kind: 'point' | 'edge' | 'corner';
    which: string;
    remembered: boolean;
  } | null = null;
  function markEditTarget(event: PointerEvent) {
    const target = event.target as Element | null;
    const corner = target?.closest?.('.mark-corner');
    if (corner)
      return {
        card: corner.closest('.card[data-id]'),
        kind: 'corner' as const,
        which: corner.getAttribute('data-corner') || 'se',
      };
    const point = target?.closest?.('.mark-point');
    if (point)
      return {
        card: point.closest('.card[data-id]'),
        kind: 'point' as const,
        which: point.getAttribute('data-end') || 'to',
      };
    const edge = target?.closest?.('.mark-edge');
    if (edge)
      return {
        card: edge.closest('.card[data-id]'),
        kind: 'edge' as const,
        which: edge.getAttribute('data-edge') || 'right',
      };
    return null;
  }
  function onEditDown(event: PointerEvent) {
    if (event.button !== 0 || options.navigation() || options.blocked()) return;
    const found = markEditTarget(event);
    if (!found?.card) return;
    const node = options
      .document()
      ?.nodes.find((item) => item.id === found.card?.getAttribute('data-id'));
    if (!node) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.select(node.id);
    options.render();
    edit = {
      pointerId: event.pointerId,
      id: node.id,
      kind: found.kind,
      which: found.which,
      remembered: false,
    };
    try {
      options.board().setPointerCapture?.(event.pointerId);
    } catch {
      /* synthetic pointers have no capture */
    }
  }
  function onEditMove(event: PointerEvent) {
    if (!edit || event.pointerId !== edit.pointerId) return;
    const node = options.document()?.nodes.find((item) => item.id === edit?.id);
    if (!node) return;
    if (!edit.remembered) {
      options.remember();
      edit.remembered = true;
    }
    const point = options.worldPoint(event);
    if (edit.kind === 'point')
      canvasMarkMoveEndpoint(node, edit.which === 'to' ? 'to' : 'from', point.x, point.y);
    else if (edit.kind === 'corner') {
      canvasMarkResizeEdge(node, edit.which[1] === 'w' ? 'left' : 'right', point.x, point.y);
      canvasMarkResizeEdge(node, edit.which[0] === 'n' ? 'top' : 'bottom', point.x, point.y);
    } else
      canvasMarkResizeEdge(
        node,
        edit.which as 'left' | 'right' | 'top' | 'bottom',
        point.x,
        point.y
      );
    options.changed();
    options.render();
  }
  function onEditUp(event: PointerEvent) {
    if (edit && event.pointerId === edit.pointerId) edit = null;
  }
  buttons.select?.addEventListener('click', () => setMode('select'));
  buttons.pan?.addEventListener('click', () => setMode('pan'));
  buttons.ellipse?.addEventListener('click', () => place('ellipse'));
  buttons.arrow?.addEventListener('click', () => place('arrow'));
  options.board().addEventListener('pointerdown', onEditDown, true);
  options.board().addEventListener('pointerdown', onPanDown, true);
  options.board().addEventListener(
    'contextmenu',
    (event) => {
      if (mode !== 'pan') return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );
  document.addEventListener('pointermove', onEditMove);
  document.addEventListener('pointerup', (event) => {
    releaseGrab();
    onEditUp(event);
  });
  document.addEventListener('pointercancel', (event) => {
    releaseGrab();
    onEditUp(event);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || mode === 'select' || document.querySelector('dialog[open]'))
      return;
    if ((event.target as Element | null)?.closest?.('input,textarea,select')) return;
    setMode('select');
  });
  sync();
  return {
    panning() {
      return mode === 'pan';
    },
    preview(on: boolean) {
      if (previewPan === on) return;
      previewPan = on;
      sync();
    },
  };
}

export const CANVAS_MARK_STYLES = `
.card.canvas-mark { padding:0; border:0 !important; background:transparent !important; box-shadow:none !important; overflow:visible !important; z-index:4; pointer-events:none; }
.card.canvas-mark.selected { z-index:8; outline:none; }
.card.canvas-mark:not(.selected) .mark-point { display:none; }
.card.canvas-mark > .resize-handle { z-index:6; }
.mark-point { position:absolute; z-index:8; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; background:#fff; border:2px solid #ff4d4f; box-shadow:0 0 0 1px #0008; pointer-events:auto; cursor:grab; }
.mark-edge { position:absolute; z-index:5; pointer-events:auto; background:transparent; }
.mark-edge[data-edge="top"], .mark-edge[data-edge="bottom"] { left:0; right:0; height:14px; cursor:ns-resize; }
.mark-edge[data-edge="top"] { top:-7px; }
.mark-edge[data-edge="bottom"] { bottom:-7px; }
.mark-edge[data-edge="left"], .mark-edge[data-edge="right"] { top:0; bottom:0; width:14px; cursor:ew-resize; }
.mark-edge[data-edge="left"] { left:-7px; }
.mark-edge[data-edge="right"] { right:-7px; }
.mark-corner { position:absolute; z-index:7; width:16px; height:16px; margin:-8px 0 0 -8px; pointer-events:auto; background:transparent; }
.mark-corner[data-corner="nw"] { left:0; top:0; cursor:nwse-resize; }
.mark-corner[data-corner="ne"] { left:100%; top:0; cursor:nesw-resize; }
.mark-corner[data-corner="sw"] { left:0; top:100%; cursor:nesw-resize; }
.mark-corner[data-corner="se"] { left:100%; top:100%; cursor:nwse-resize; }
.card.canvas-mark svg { display:block; width:100%; height:100%; overflow:visible; pointer-events:none; }
.card.canvas-mark .mark-hit, .card.canvas-mark .resize-handle { pointer-events:auto; }
.card.canvas-mark .mark-box { box-sizing:border-box; width:100%; height:100%; background:transparent; border-radius:4px; }
#board.pan-tool, #board.pan-tool * { cursor:grab; }
#board.pan-tool.grabbing, #board.pan-tool.grabbing * { cursor:grabbing; }
.selection-actions .mark-color { width:22px; min-height:22px; height:22px; padding:0; border-radius:50%; border:2px solid #616875; }
.selection-actions .mark-color[aria-pressed="true"] { outline:2px solid #fff1cf; outline-offset:1px; }
`;
