import {
  cloneDocument,
  createId,
  HISTORY_LIMIT,
  type CanvasDocument,
  type CanvasNode,
} from './model.js';
import { CanvasStoreError } from './model.js';

export interface HistoryStacks {
  past: CanvasDocument[];
  future: CanvasDocument[];
}

export function pushHistory(stacks: HistoryStacks, current: CanvasDocument): HistoryStacks {
  const past = [...stacks.past, cloneDocument(current)];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [] };
}

export function undoHistory(
  stacks: HistoryStacks,
  current: CanvasDocument
): { stacks: HistoryStacks; document: CanvasDocument } | undefined {
  const previous = stacks.past.at(-1);
  if (!previous) return undefined;
  const restored = cloneDocument(previous);
  restored.revision = current.revision;
  restored.viewport = { ...current.viewport };
  return {
    stacks: {
      past: stacks.past.slice(0, -1),
      future: [cloneDocument(current), ...stacks.future].slice(0, HISTORY_LIMIT),
    },
    document: restored,
  };
}

export function redoHistory(
  stacks: HistoryStacks,
  current: CanvasDocument
): { stacks: HistoryStacks; document: CanvasDocument } | undefined {
  const next = stacks.future[0];
  if (!next) return undefined;
  const restored = cloneDocument(next);
  restored.revision = current.revision;
  restored.viewport = { ...current.viewport };
  const past = [...stacks.past, cloneDocument(current)];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { stacks: { past, future: stacks.future.slice(1) }, document: restored };
}

export function connectFirstFrame(
  document: CanvasDocument,
  fromId: string,
  toId: string
): CanvasDocument {
  const from = document.nodes.find((node) => node.id === fromId);
  const to = document.nodes.find((node) => node.id === toId);
  if (!from || !to || fromId === toId) {
    throw new CanvasStoreError('不能连接不存在的卡片或卡片自身。', 400, 'INVALID_EDGE');
  }
  if (from.type !== 'image' || !from.assetPath) {
    throw new CanvasStoreError('只有已导入图片可以成为视频首帧。', 400, 'INVALID_EDGE');
  }
  if (to.type !== 'video') {
    throw new CanvasStoreError('首帧只能连到未提交的视频输入卡。', 400, 'INVALID_EDGE');
  }
  const edges = document.edges.filter((edge) => !(edge.kind === 'first-frame' && edge.to === toId));
  edges.push({ id: createId(), from: fromId, to: toId, kind: 'first-frame' });
  return { ...document, edges };
}

export function nodeOf(document: CanvasDocument, id: string): CanvasNode | undefined {
  return document.nodes.find((node) => node.id === id);
}

export function removeNodes(document: CanvasDocument, nodeIds: readonly string[]): CanvasDocument {
  const removed = new Set(nodeIds);
  const deletedGenerationIds = [
    ...new Set([
      ...(document.deletedGenerationIds || []),
      ...document.nodes.flatMap((node) =>
        removed.has(node.id) && node.generation?.attemptId ? [node.generation.attemptId] : []
      ),
    ]),
  ];
  return {
    ...document,
    ...(deletedGenerationIds.length ? { deletedGenerationIds } : {}),
    viewport: { ...document.viewport },
    nodes: document.nodes
      .filter((node) => !removed.has(node.id))
      .map((node) => {
        const copy = { ...node };
        if (copy.sectionId && removed.has(copy.sectionId)) {
          delete copy.sectionId;
          delete copy.templatePending;
        }
        return copy;
      }),
    edges: document.edges
      .filter((edge) => !removed.has(edge.from) && !removed.has(edge.to))
      .map((edge) => ({ ...edge })),
  };
}

export function saveAcknowledgement(input: {
  currentId: string | null;
  currentLayout: string | null;
  submittedId: string;
  submittedLayout: string;
  savedRevision: number;
}): { apply: false } | { apply: true; revision: number; savedKey: string; pending: boolean } {
  if (input.currentId !== input.submittedId) return { apply: false };
  return {
    apply: true,
    revision: input.savedRevision,
    savedKey: input.submittedLayout,
    pending: input.currentLayout !== input.submittedLayout,
  };
}

export function nodesInMarquee(
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>,
  viewport: { x: number; y: number; scale: number },
  box: { x1: number; y1: number; x2: number; y2: number }
): string[] {
  const x1 = Math.min(box.x1, box.x2);
  const y1 = Math.min(box.y1, box.y2);
  const x2 = Math.max(box.x1, box.x2);
  const y2 = Math.max(box.y1, box.y2);
  return nodes
    .filter((node) => {
      const left = viewport.x + node.x * viewport.scale;
      const top = viewport.y + node.y * viewport.scale;
      const right = left + node.width * viewport.scale;
      const bottom = top + node.height * viewport.scale;
      return left < x2 && right > x1 && top < y2 && bottom > y1;
    })
    .map((node) => node.id);
}
