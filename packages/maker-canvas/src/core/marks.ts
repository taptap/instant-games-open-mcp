import type { CanvasMarkPoint, CanvasMarkDirection, CanvasMark, CanvasNode } from '../contracts.js';

export const CANVAS_MARK_COLORS = ['#ff4d4f', '#f5dc56', '#3dd68c', '#4c9aff', '#ffffff'] as const;
export const CANVAS_MARK_MIN = 8;
export const CANVAS_MARK_MAX = 8000;

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
