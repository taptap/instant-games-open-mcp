import type { CanvasDocument, CanvasNode } from '../contracts.js';

/**
 * Layout for the whole-canvas PNG: group frames behind wires, wires behind cards, marks on top.
 * Returns null when nothing but group frames is on the canvas.
 */
export function canvasPngPlan(document: Pick<CanvasDocument, 'nodes' | 'edges'>) {
  const content = document.nodes.filter((node) => node.type !== 'section');
  if (!content.length) return null;
  const sections = document.nodes.filter((node) => node.type === 'section');
  const drawn = sections.concat(content);
  const left = Math.min(...drawn.map((node) => node.x)) - 32;
  const top = Math.min(...drawn.map((node) => node.y)) - 32;
  const right = Math.max(...drawn.map((node) => node.x + node.width)) + 32;
  const bottom = Math.max(...drawn.map((node) => node.y + node.height)) + 32;
  const ids = new Set(content.filter((node) => node.type !== 'mark').map((node) => node.id));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    scale: Math.min(2, 2400 / Math.max(1, right - left), 1600 / Math.max(1, bottom - top)),
    sections,
    cards: content.filter((node) => node.type !== 'mark'),
    marks: content.filter((node) => node.type === 'mark'),
    edges: document.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
  };
}

/** Source rect to draw from a card's saved image: an animation shows its first frame. */
export function canvasPngStill(node: CanvasNode) {
  if (node.type !== 'animation') return;
  const frame = node.frameSetInfo?.frames[0];
  return frame && { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}
