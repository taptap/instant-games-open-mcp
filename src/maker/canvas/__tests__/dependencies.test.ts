import { canvasNodeVersion, isCanvasNodeStale, snapshotCanvasSource } from '../dependencies.js';
import { createId } from '../model.js';

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
