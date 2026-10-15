import { createId, type CanvasDocument } from './model.js';
import { connectFirstFrameWithId } from '../../../packages/maker-canvas/src/core/edit.js';
export {
  pushHistory,
  undoHistory,
  redoHistory,
} from '../../../packages/maker-canvas/src/browser/history.js';
export type { HistoryStacks } from '../../../packages/maker-canvas/src/browser/history.js';
export {
  nodeOf,
  removeNodes,
  saveAcknowledgement,
  nodesInMarquee,
} from '../../../packages/maker-canvas/src/core/edit.js';
export function connectFirstFrame(
  document: CanvasDocument,
  fromId: string,
  toId: string
): CanvasDocument {
  return connectFirstFrameWithId(document, fromId, toId, createId);
}
