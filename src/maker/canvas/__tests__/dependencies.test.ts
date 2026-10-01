import { canvasNodeVersion, isCanvasNodeStale, snapshotCanvasSource } from '../dependencies.js';
import { createId } from '../model.js';
import { canvasReferences, canvasDependents } from '../dependencies.js';

function image(assetPath: string, attemptId?: string) {
  return {
    id: createId(),
    type: 'image' as const,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    title: '图片',
    assetPath,
    ...(attemptId ? { generation: { prompt: 'test', attemptId } } : {}),
  };
}

describe('canvas dependency snapshots', () => {
  test('multi-source snapshots detect changes and relationship removal without mutating the graph', () => {
    const head = image('head.png');
    const tail = image('tail.png');
    const target = {
      ...image('video.mp4'),
      sourceSnapshots: [snapshotCanvasSource(head)!, snapshotCanvasSource(tail)!],
    };
    const document: any = {
      nodes: [head, tail, target],
      edges: [
        { from: head.id, to: target.id },
        { from: tail.id, to: target.id },
      ],
    };
    const original = JSON.stringify(document);
    expect(canvasReferences(document, target.id)).toEqual([head, tail]);
    expect(canvasDependents(document, tail.id)).toEqual([target]);
    expect(JSON.stringify(document)).toBe(original);
    expect(isCanvasNodeStale(target, canvasReferences(document, target.id))).toBe(false);
    tail.assetPath = 'new-tail.png';
    expect(isCanvasNodeStale(target, canvasReferences(document, target.id))).toBe(true);
    tail.assetPath = 'tail.png';
    document.edges.pop();
    expect(isCanvasNodeStale(target, canvasReferences(document, target.id))).toBe(true);
  });
  test('changes when the source asset or generation result changes', () => {
    const source = image('assets/image/canvas-source.png', 'attempt-1');
    const snapshot = snapshotCanvasSource(source);
    expect(snapshot).toBeDefined();
    expect(isCanvasNodeStale({ ...source, sourceSnapshot: snapshot }, source)).toBe(false);

    source.assetPath = 'assets/image/canvas-next.png';
    expect(isCanvasNodeStale({ ...source, sourceSnapshot: snapshot }, source)).toBe(true);
    expect(canvasNodeVersion(source)).not.toBe(snapshot?.version);
  });

  test('treats a missing source as stale instead of silently refreshing', () => {
    const source = image('assets/image/canvas-source.png');
    const snapshot = snapshotCanvasSource(source);
    expect(isCanvasNodeStale({ ...source, sourceSnapshot: snapshot }, undefined)).toBe(true);
  });
});
