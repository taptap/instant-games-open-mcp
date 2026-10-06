import type { CanvasEdge, CanvasNode } from './model.js';

export interface CanvasWireGeometry {
  points: { x: number; y: number }[];
  handles: { x: number; y: number; axis: 'x' | 'y' }[];
}

/** Shared fan-out gutter; offsets stay relative when cards move or are copied. */
export function canvasWireGeometry(
  from: CanvasNode,
  to: CanvasNode,
  nodes: CanvasNode[],
  edges: CanvasEdge[] = [],
  route?: CanvasEdge['route']
): CanvasWireGeometry {
  const source = nodes.find((node) => node.id === from.sectionId) || from;
  const target = nodes.find((node) => node.id === to.sectionId) || to;
  const vertical = from.y + from.height + 48 < to.y;
  // Transpose horizontal connections to share the same editing rules.
  const project = (x: number, y: number) => (vertical ? { x, y } : { x: y, y: x });
  const start = vertical
    ? { x: from.x + from.width / 2, y: from.y + from.height }
    : { x: from.y + from.height / 2, y: from.x + from.width };
  const end = vertical ? { x: to.x + to.width / 2, y: to.y } : { x: to.y + to.height / 2, y: to.x };
  let middle = (start.y + end.y) / 2;
  let lane = end.x;
  if (vertical) {
    const bottom = Math.min(source.y + source.height, to.y - 48);
    const tops = edges
      .filter((edge) => edge.from === from.id)
      .map((edge) => {
        const child = nodes.find((node) => node.id === edge.to);
        if (!child || child.y <= bottom + 48) return Infinity;
        const group = nodes.find((node) => node.id === child.sectionId);
        return group && group.y > bottom + 48 ? group.y : child.y;
      });
    middle = (bottom + Math.min(target.y > bottom ? target.y : to.y, ...tops)) / 2;
    const obstacles = nodes.filter(
      (node) =>
        node.type !== 'note' &&
        node.type !== 'section' &&
        node.id !== from.id &&
        node.id !== to.id &&
        node.y + node.height > middle &&
        node.y < end.y - 32
    );
    for (const node of obstacles.sort((a, b) => a.x - b.x)) {
      if (node.x - 24 < lane && node.x + node.width + 24 > lane) lane = node.x + node.width + 48;
    }
  }
  middle += vertical ? route?.y || 0 : route?.x || 0;
  lane += vertical ? route?.x || 0 : route?.y || 0;
  const approach = end.y - 32;
  const raw = [
    start,
    { x: start.x, y: middle },
    { x: lane, y: middle },
    ...(lane === end.x
      ? []
      : [
          { x: lane, y: approach },
          { x: end.x, y: approach },
        ]),
    end,
  ];
  const points = raw
    .map((point) => project(point.x, point.y))
    .filter((point, i, all) => !i || point.x !== all[i - 1].x || point.y !== all[i - 1].y);
  return {
    points,
    handles: [
      { ...project((start.x + lane) / 2, middle), axis: vertical ? 'y' : 'x' },
      { ...project(lane, (middle + approach) / 2), axis: vertical ? 'x' : 'y' },
    ],
  };
}

export function canvasWirePath(
  from: CanvasNode,
  to: CanvasNode,
  nodes: CanvasNode[],
  view: { x: number; y: number; scale: number },
  edges: CanvasEdge[] = [],
  route?: CanvasEdge['route']
): string {
  const points = canvasWireGeometry(from, to, nodes, edges, route).points.map((point) => ({
    x: view.x + point.x * view.scale,
    y: view.y + point.y * view.scale,
  }));
  for (let i = points.length - 2; i > 0; i--) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    if (
      (a.x === b.x && b.x === c.x && (b.y - a.y) * (c.y - b.y) >= 0) ||
      (a.y === b.y && b.y === c.y && (b.x - a.x) * (c.x - b.x) >= 0)
    )
      points.splice(i, 1);
  }
  let path = 'M ' + points[0].x + ' ' + points[0].y;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const before = Math.hypot(b.x - a.x, b.y - a.y);
    const after = Math.hypot(c.x - b.x, c.y - b.y);
    const radius = Math.min(10 * view.scale, before / 2, after / 2);
    path +=
      ' L ' +
      (b.x + ((a.x - b.x) * radius) / before) +
      ' ' +
      (b.y + ((a.y - b.y) * radius) / before);
    path +=
      ' Q ' +
      b.x +
      ' ' +
      b.y +
      ' ' +
      (b.x + ((c.x - b.x) * radius) / after) +
      ' ' +
      (b.y + ((c.y - b.y) * radius) / after);
  }
  const last = points[points.length - 1];
  return path + ' L ' + last.x + ' ' + last.y;
}
