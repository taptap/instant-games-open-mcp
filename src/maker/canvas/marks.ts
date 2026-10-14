import type { CanvasNode } from './model.js';

export const CANVAS_MARK_COLORS = ['#ff4d4f', '#f5dc56', '#3dd68c', '#4c9aff', '#ffffff'] as const;
export const CANVAS_MARK_MIN = 8;
export const CANVAS_MARK_MAX = 8000;

export type CanvasMarkShape = 'ellipse' | 'arrow';
export type CanvasMarkPoint = 'nw' | 'ne' | 'sw' | 'se';
export type CanvasMarkDirection = 'n' | 'e' | 's' | 'w';

export interface CanvasMark {
  shape: CanvasMarkShape;
  color: string;
  stroke: number;
  /** Arrow head corner. Absent for an ellipse. */
  point?: CanvasMarkPoint;
  /** Image arrow facing. Absent for a box. */
  direction?: CanvasMarkDirection;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
}

export const MARK_POINTS: CanvasMarkPoint[] = ['nw', 'ne', 'sw', 'se'];
export const MARK_DIRECTIONS: CanvasMarkDirection[] = ['n', 'e', 's', 'w'];

export function validateCanvasMark(value: unknown): CanvasMark {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('标注样式无效。');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['shape', 'color', 'stroke', 'point', 'direction', 'from', 'to'].includes(key)
    )
  )
    throw new Error('标注样式包含不支持的字段。');
  if (input.shape !== 'ellipse' && input.shape !== 'arrow')
    throw new Error('标注形状必须是 ellipse 或 arrow。');
  const color = input.color === undefined ? CANVAS_MARK_COLORS[0] : input.color;
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))
    throw new Error('标注颜色必须是 #RRGGBB。');
  const stroke = input.stroke === undefined ? 3 : input.stroke;
  if (typeof stroke !== 'number' || !Number.isInteger(stroke) || stroke < 1 || stroke > 8)
    throw new Error('标注线宽必须是 1～8 的整数。');
  if (input.shape === 'ellipse') {
    if (
      input.point !== undefined ||
      input.direction !== undefined ||
      input.from !== undefined ||
      input.to !== undefined
    )
      throw new Error('标注框不能设置箭头方向。');
    return { shape: 'ellipse', color: color.toLowerCase(), stroke };
  }
  const point = input.point === undefined ? 'se' : input.point;
  if (!MARK_POINTS.includes(point as CanvasMarkPoint))
    throw new Error('箭头方向必须是 nw、ne、sw 或 se。');
  if (
    input.direction !== undefined &&
    !MARK_DIRECTIONS.includes(input.direction as CanvasMarkDirection)
  )
    throw new Error('箭头朝向必须是 n、e、s 或 w。');
  const direction = input.direction;
  const from = optionalMarkPoint(input.from, '箭头起点');
  const to = optionalMarkPoint(input.to, '箭头终点');
  if (Boolean(from) !== Boolean(to)) throw new Error('箭头起点和终点必须同时提供。');
  return {
    shape: 'arrow',
    color: color.toLowerCase(),
    stroke,
    point: point as CanvasMarkPoint,
    ...(input.direction === undefined ? {} : { direction: direction as CanvasMarkDirection }),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

export function optionalMarkPoint(
  value: unknown,
  label: string
): { x: number; y: number } | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(label + '无效。');
  const point = value as Record<string, unknown>;
  if (
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  )
    throw new Error(label + '无效。');
  if (Math.abs(point.x) > 20000 || Math.abs(point.y) > 20000) throw new Error(label + '无效。');
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function canvasMarkEnds(node: { width: number; height: number; mark?: CanvasMark }) {
  const mark = node.mark;
  if (mark?.from && mark.to) return { from: mark.from, to: mark.to };
  const pad = 18;
  const cx = node.width / 2;
  const cy = node.height / 2;
  if (mark?.point && !mark.direction) {
    const x = Math.min(pad, node.width / 4);
    const y = Math.min(pad, node.height / 4);
    const to = {
      x: mark.point.endsWith('e') ? node.width - x : x,
      y: mark.point.startsWith('s') ? node.height - y : y,
    };
    return { from: { x: node.width - to.x, y: node.height - to.y }, to };
  }
  if (mark?.direction === 'w')
    return { from: { x: node.width - pad, y: cy }, to: { x: pad, y: cy } };
  if (mark?.direction === 's')
    return { from: { x: cx, y: pad }, to: { x: cx, y: node.height - pad } };
  if (mark?.direction === 'n')
    return { from: { x: cx, y: node.height - pad }, to: { x: cx, y: pad } };
  return { from: { x: pad, y: cy }, to: { x: node.width - pad, y: cy } };
}

export function canvasMarkMoveEndpoint(
  node: { x: number; y: number; width: number; height: number; mark?: CanvasMark },
  which: 'from' | 'to',
  worldX: number,
  worldY: number
) {
  if (!node.mark) return;
  const ends = canvasMarkEnds(node);
  const from =
    which === 'from'
      ? { x: worldX, y: worldY }
      : { x: node.x + ends.from.x, y: node.y + ends.from.y };
  const to =
    which === 'to' ? { x: worldX, y: worldY } : { x: node.x + ends.to.x, y: node.y + ends.to.y };
  const pad = 18;
  const minX = Math.min(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const spanW = Math.max(0, Math.max(from.x, to.x) - minX);
  const spanH = Math.max(0, Math.max(from.y, to.y) - minY);
  const width = Math.min(8000, Math.max(36, spanW + pad * 2));
  const height = Math.min(8000, Math.max(36, spanH + pad * 2));
  node.x = Math.round(minX - (width - spanW) / 2);
  node.y = Math.round(minY - (height - spanH) / 2);
  node.width = Math.round(width);
  node.height = Math.round(height);
  node.mark.from = { x: Math.round(from.x - node.x), y: Math.round(from.y - node.y) };
  node.mark.to = { x: Math.round(to.x - node.x), y: Math.round(to.y - node.y) };
}

export function canvasMarkResizeEdge(
  node: { x: number; y: number; width: number; height: number },
  edge: 'left' | 'right' | 'top' | 'bottom',
  worldX: number,
  worldY: number
) {
  const min = CANVAS_MARK_MIN;
  const right = node.x + node.width;
  const bottom = node.y + node.height;
  if (edge === 'left') {
    const x = Math.min(worldX, right - min);
    node.width = Math.round(Math.min(8000, right - x));
    node.x = Math.round(right - node.width);
  } else if (edge === 'right') {
    node.width = Math.round(Math.min(8000, Math.max(min, worldX - node.x)));
  } else if (edge === 'top') {
    const y = Math.min(worldY, bottom - min);
    node.height = Math.round(Math.min(8000, bottom - y));
    node.y = Math.round(bottom - node.height);
  } else {
    node.height = Math.round(Math.min(8000, Math.max(min, worldY - node.y)));
  }
}

export function markNumber(
  value: unknown,
  fallback: number,
  label: string,
  min: number,
  max: number
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(label + '无效。');
  return Math.round(value);
}

export function canvasMarkFromInput(input: Record<string, unknown>, id: string): CanvasNode {
  if (input.shape !== 'ellipse' && input.shape !== 'arrow')
    throw new Error('标注 shape 必须是 ellipse 或 arrow。');
  const shape = input.shape;
  const mark = validateCanvasMark({
    shape,
    color: input.color,
    stroke: input.stroke,
    point: input.point,
    direction: input.direction,
    from: input.from,
    to: input.to,
  });
  return {
    id,
    type: 'mark',
    x: markNumber(input.x, 80, '标注 x', -100000, 100000),
    y: markNumber(input.y, 80, '标注 y', -100000, 100000),
    width: markNumber(
      input.width,
      shape === 'arrow' ? 180 : 140,
      '标注 width',
      CANVAS_MARK_MIN,
      CANVAS_MARK_MAX
    ),
    height: markNumber(
      input.height,
      shape === 'arrow' ? 80 : 100,
      '标注 height',
      CANVAS_MARK_MIN,
      CANVAS_MARK_MAX
    ),
    title: shape === 'arrow' ? '箭头' : '圈',
    mark,
  };
}

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
  panBy?(event: WheelEvent): void;
}) {
  type CanvasTool = 'select' | 'pan';
  let mode: CanvasTool = 'select';
  const buttons = {
    select: document.getElementById('tool-select'),
    pan: document.getElementById('tool-pan'),
    ellipse: document.getElementById('mark-ellipse'),
    arrow: document.getElementById('mark-arrow'),
  };
  function sync() {
    buttons.select?.setAttribute('aria-pressed', String(mode === 'select'));
    buttons.pan?.setAttribute('aria-pressed', String(mode === 'pan'));
    options.board().classList.toggle('pan-tool', mode === 'pan');
    if (mode !== 'pan') options.board().classList.remove('grabbing');
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
  function onPanWheel(event: WheelEvent) {
    if (mode !== 'pan' || event.ctrlKey || event.metaKey || !options.panBy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.panBy(event);
  }
  function releaseGrab() {
    options.board().classList.remove('grabbing');
  }

  let edit: {
    pointerId: number;
    id: string;
    kind: 'point' | 'edge';
    which: string;
    remembered: boolean;
  } | null = null;
  function markEditTarget(event: PointerEvent) {
    const target = event.target as Element | null;
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
    else
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
  options.board().addEventListener('wheel', onPanWheel, { capture: true, passive: false });
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
.card.canvas-mark svg { display:block; width:100%; height:100%; overflow:visible; pointer-events:none; }
.card.canvas-mark .mark-hit, .card.canvas-mark .resize-handle { pointer-events:auto; }
.card.canvas-mark .mark-box { box-sizing:border-box; width:100%; height:100%; background:transparent; border-radius:4px; }
#board.pan-tool, #board.pan-tool * { cursor:grab; }
#board.pan-tool.grabbing, #board.pan-tool.grabbing * { cursor:grabbing; }
.selection-actions .mark-color { width:22px; min-height:22px; height:22px; padding:0; border-radius:50%; border:2px solid #616875; }
.selection-actions .mark-color[aria-pressed="true"] { outline:2px solid #fff1cf; outline-offset:1px; }
`;
