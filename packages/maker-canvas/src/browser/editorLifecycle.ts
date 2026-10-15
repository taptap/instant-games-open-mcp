import type { CanvasDocument } from '../contracts.js';
import type { CanvasEditorDraft } from './pageHost.js';

/** Match the editor's persisted-content comparison, excluding lazy image metadata. */
export function canvasEditorLayout(document: CanvasDocument): string {
  const copy: Partial<CanvasDocument> = JSON.parse(JSON.stringify(document));
  delete copy.revision;
  copy.nodes?.forEach((node) => {
    delete node.imageInfo;
  });
  return JSON.stringify(copy);
}

/** Restore only after host authorization; an old baseline must retain its conflict revision. */
export function restoreCanvasEditorDraft(
  loaded: CanvasDocument,
  draft?: CanvasEditorDraft | null
): CanvasEditorDraft {
  const savedLayout = canvasEditorLayout(loaded);
  if (!draft) return { document: loaded, savedLayout };
  if (draft.document.id !== loaded.id || typeof draft.savedLayout !== 'string')
    throw new Error('草稿不属于当前画布，未恢复。');
  if (canvasEditorLayout(draft.document) === savedLayout) return { document: loaded, savedLayout };
  const document = structuredClone(draft.document);
  if (draft.savedLayout === savedLayout) document.revision = loaded.revision;
  return { document, savedLayout: draft.savedLayout };
}
