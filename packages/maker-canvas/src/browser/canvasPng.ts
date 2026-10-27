import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { canvasWireGeometry } from '../core/wirePath.js';

/**
 * Layout for the whole-canvas PNG: group frames behind wires, wires behind cards, marks on top.
 * Returns null when nothing but group frames is on the canvas.
 */
export function canvasPngPlan(document: Pick<CanvasDocument, 'nodes' | 'edges'>) {
  const content = document.nodes.filter((node) => node.type !== 'section');
  if (!content.length) return null;
  const sections = document.nodes.filter((node) => node.type === 'section');
  const ids = new Set(content.filter((node) => node.type !== 'mark').map((node) => node.id));
  const edges = document.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const boxes = sections.concat(content).map((node) => ({
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + node.height,
  }));
  // A wire whose bend was dragged past the cards must stay inside the image too.
  for (const edge of edges) {
    const from = document.nodes.find((node) => node.id === edge.from)!;
    const to = document.nodes.find((node) => node.id === edge.to)!;
    for (const point of canvasWireGeometry(from, to, document.nodes, document.edges, edge.route)
      .points)
      boxes.push({ left: point.x, top: point.y, right: point.x, bottom: point.y });
  }
  const left = Math.min(...boxes.map((box) => box.left)) - 32;
  const top = Math.min(...boxes.map((box) => box.top)) - 32;
  const right = Math.max(...boxes.map((box) => box.right)) + 32;
  const bottom = Math.max(...boxes.map((box) => box.bottom)) + 32;
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    scale: Math.min(2, 2400 / Math.max(1, right - left), 1600 / Math.max(1, bottom - top)),
    sections,
    cards: content.filter((node) => node.type !== 'mark'),
    marks: content.filter((node) => node.type === 'mark'),
    edges,
  };
}

/** Source rect to draw from a card's saved image: an animation shows its first frame. */
export function canvasPngStill(node: CanvasNode) {
  if (node.type !== 'animation') return;
  const frame = node.frameSetInfo?.frames[0];
  return frame && { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}
