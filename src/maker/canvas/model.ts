import type { CanvasDocument } from '../../../packages/maker-canvas/src/contracts.js';
export type {
  CanvasNodeType,
  CanvasEdgeKind,
  CanvasCreateTemplate,
  CanvasImageOperation,
  CanvasVideoMode,
  CanvasGenerationResult,
  CanvasGenerationDraft,
  Viewport,
  CanvasNode,
  CanvasEdge,
  CanvasDocument,
  CanvasTemplateFlow,
  CanvasSummary,
} from '../../../packages/maker-canvas/src/contracts.js';
import { randomUUID } from 'node:crypto';

export { HISTORY_LIMIT, layoutKey } from '../../../packages/maker-canvas/src/core/edit.js';
export { cloneDocument } from '../../../packages/maker-canvas/src/browser/document.js';
/**
 * One canvas document (and template). Sized to the 400-card cap: a 015 UI group with its
 * generation records is about 0.5 MB, and the largest cards are about 40 KB each.
 */
export const CANVAS_JSON_LIMIT = 16 * 1024 * 1024;

export { CanvasStoreError } from '../../../packages/maker-canvas/src/domain.js';

export function createId(): string {
  return randomUUID();
}

export function emptyDocument(title = '创作画布'): CanvasDocument {
  return {
    id: createId(),
    title: title.slice(0, 80) || '创作画布',
    revision: 0,
    viewport: { x: 48, y: 48, scale: 1 },
    nodes: [],
    edges: [],
  };
}

export function starterDocument(title?: string): CanvasDocument {
  const document = emptyDocument(title);
  document.nodes = ['示例图片 01', '示例图片 02', '示例图片 03'].map((title, index) => {
    const id = createId();
    return {
      id,
      type: 'image',
      x: index * 244,
      y: 0,
      width: 220,
      height: 360,
      title,
      assetPath: 'assets/image/canvas-' + id + '.jpg',
    };
  });
  return document;
}
