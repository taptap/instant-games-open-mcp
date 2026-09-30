import {
  nodesInMarquee,
  removeNodes,
  redoHistory,
  saveAcknowledgement,
  undoHistory,
} from '../edit.js';
import { emptyDocument } from '../model.js';
import { getCanvasPageHtml } from '../page.js';

describe('canvas edit acknowledgements', () => {
  test('does not mark later edits saved and ignores another canvas', () => {
    const pending = saveAcknowledgement({
      currentId: 'a',
      currentLayout: 'newer',
      submittedId: 'a',
      submittedLayout: 'older',
      savedRevision: 2,
    });
    expect(pending).toEqual({ apply: true, revision: 2, savedKey: 'older', pending: true });
    expect(
      saveAcknowledgement({
        currentId: 'b',
        currentLayout: 'other',
        submittedId: 'a',
        submittedLayout: 'older',
        savedRevision: 2,
      })
    ).toEqual({ apply: false });
  });

  test('selects every card intersecting the marquee', () => {
    const ids = nodesInMarquee(
      [
        { id: 'in', x: 10, y: 10, width: 40, height: 40 },
        { id: 'out', x: 400, y: 400, width: 20, height: 20 },
      ],
      { x: 0, y: 0, scale: 1 },
      { x1: 0, y1: 0, x2: 30, y2: 30 }
    );
    expect(ids).toEqual(['in']);
  });

  test('removes selected nodes and their edges without mutating the saved asset reference', () => {
    const document = emptyDocument();
    const image = {
      id: 'image',
      type: 'image' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      title: 'image',
      assetPath: 'assets/image/canvas-00000000-0000-4000-8000-000000000000.png',
    };
    const video = {
      id: 'video',
      type: 'video' as const,
      x: 200,
      y: 0,
      width: 100,
      height: 100,
      title: 'video',
    };
    document.nodes = [image, video];
    document.edges = [{ id: 'edge', from: image.id, to: video.id, kind: 'first-frame' }];
    const removed = removeNodes(document, [image.id]);
    expect(removed.nodes.map((node) => node.id)).toEqual([video.id]);
    expect(removed.edges).toEqual([]);
    expect(document.nodes).toHaveLength(2);
    expect(image.assetPath).toBe('assets/image/canvas-00000000-0000-4000-8000-000000000000.png');
  });

  test('undo and redo retain the current viewport', () => {
    const before = emptyDocument();
    const after = { ...before, title: 'edited', viewport: { x: 1, y: 2, scale: 2 } };
    const current = { ...after, viewport: { x: 50, y: 60, scale: 1.5 } };
    expect(undoHistory({ past: [before], future: [] }, current)?.document).toMatchObject({
      title: before.title,
      viewport: current.viewport,
    });
    expect(redoHistory({ past: [before], future: [after] }, current)?.document).toMatchObject({
      title: after.title,
      viewport: current.viewport,
    });
  });

  test('deletion records generated results without changing the undo snapshot', () => {
    const document = emptyDocument();
    document.nodes = [
      {
        id: 'image',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        title: 'generated',
        generation: { attemptId: 'attempt', prompt: 'image' },
      },
    ];
    const removed = removeNodes(document, ['image']);
    expect(removed.deletedGenerationIds).toEqual(['attempt']);
    expect(document.deletedGenerationIds).toBeUndefined();
    expect(removeNodes(removed, ['image']).deletedGenerationIds).toEqual(['attempt']);
    expect(
      undoHistory({ past: [document], future: [] }, removed)?.document.deletedGenerationIds
    ).toBeUndefined();
  });

  test('ships the selection and save guards in the page script', () => {
    const html = getCanvasPageHtml();
    expect(html).toContain('function saveAcknowledgement');
    expect(html).toContain('function nodesInMarquee');
    expect(html).toContain('function removeNodes');
    expect(html).toContain('makerCanvasUnsaved');
    expect(html).toContain('makerCanvasPendingImport');
    expect(html).toContain('waitForPendingAssets()');
    expect(html).toContain('window.makerCanvasUnsaved = dirty() || pendingAssetImports > 0');
    expect(html).toContain('if (!drag.additive) selected.clear()');
    expect(html).toContain('if (space || event.button === 1) return;');
    expect(html).toContain("event.key.toLowerCase() === 'z'");
    expect(html).toContain('previous.viewport = { ...documentState.viewport }');
    expect(html).toContain('next.viewport = { ...documentState.viewport }');
    expect(html).toContain("'/canvas-media?path=' + encodeURIComponent(assetPath)");
    expect(html).toContain('URL.revokeObjectURL');
    expect(html).not.toContain('generate_image');
  });
});
