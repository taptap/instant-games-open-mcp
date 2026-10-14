import type { CanvasDocument } from '../contracts.js';
import { HISTORY_LIMIT } from '../core/edit.js';
import { cloneDocument } from './document.js';

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
  const previous = stacks.past[stacks.past.length - 1];
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
