import type { CanvasDocument } from '../contracts.js';

export function cloneDocument(document: CanvasDocument): CanvasDocument {
  return {
    ...document,
    viewport: { ...document.viewport },
    nodes: document.nodes.map((node) => ({
      ...node,
      ...(node.mark ? { mark: { ...node.mark } } : {}),
      ...(node.referenceInput ? { referenceInput: { ...node.referenceInput } } : {}),
      ...(node.mergeIcons ? { mergeIcons: structuredClone(node.mergeIcons) } : {}),
      ...(node.sourceSnapshot ? { sourceSnapshot: { ...node.sourceSnapshot } } : {}),
    })),
    edges: document.edges.map((edge) => ({
      ...edge,
      ...(edge.route ? { route: { ...edge.route } } : {}),
    })),
  };
}
