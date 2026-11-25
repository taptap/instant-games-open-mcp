import { runInNewContext } from 'node:vm';
import {
  prepareCanvasImportedNodeFromMedia,
  validateImportedFrameSet,
  importedCanvasMediaPatch,
} from '../../../../packages/maker-canvas/src/browser/automationAssets.js';
import { emptyDocument } from '../model.js';

const atlas = () => ({
  fps: 20,
  frameCount: 2,
  width: 32,
  height: 16,
  columns: 2,
  rows: 1,
  frames: [
    { index: 0, time: 0, x: 0, y: 0, width: 16, height: 16, duration: 50 },
    { index: 1, time: 0.05, x: 16, y: 0, width: 16, height: 16, duration: 150 },
  ],
});

test('imports explicit durations without turning the atlas into a static image', async () => {
  const document = {
    createElement: () => ({
      naturalWidth: 32,
      naturalHeight: 16,
      set src(_value: string) {
        queueMicrotask(() => (this as any).onload());
      },
      removeAttribute() {},
    }),
  };
  const prepare = runInNewContext('(' + prepareCanvasImportedNodeFromMedia.toString() + ')', {
    document,
    validateImportedFrameSet,
    crypto: { randomUUID: () => 'new-id' },
    setTimeout,
    clearTimeout,
  });
  const result = await prepare({ assetPath: 'atlas.png', frameSetInfo: atlas() }, (s: string) => s);
  expect(result.type).toBe('animation');
  expect(result.frameSetInfo.frames.map((f: { duration: number }) => f.duration)).toEqual([
    50, 150,
  ]);
  expect(result.imageInfo).toBeUndefined();
  await expect(
    prepare({ assetPath: 'atlas.png', frameSetInfo: { ...atlas(), width: 64 } }, (s: string) => s)
  ).rejects.toThrow('实际图片尺寸');
});

test('rejects out-of-bounds, trimmed and invalid timing data before import', () => {
  for (const patch of [
    { x: 24 },
    { duration: 0 },
    { duration: NaN },
    { offsetX: 0 },
    { index: 4 },
  ]) {
    const value = atlas();
    Object.assign(value.frames[1], patch);
    expect(() => validateImportedFrameSet(value)).toThrow();
  }
  expect(() => validateImportedFrameSet({ ...atlas(), frameCount: 121 })).toThrow();
  const safe = validateImportedFrameSet(atlas());
  safe.frames[0].duration = 900;
  expect(atlas().frames[0].duration).toBe(50);
});

test('postprocessed standalone media keeps its card identity and geometry; tasks and edges reject', () => {
  const doc = emptyDocument();
  const target = {
    id: 'original',
    type: 'animation' as const,
    title: 'keep',
    x: 10,
    y: 20,
    width: 520,
    height: 580,
    sectionId: 'group',
    assetPath: 'old.png',
    frameSetInfo: atlas(),
  };
  doc.nodes.push(target);
  const prepared = { ...target, id: 'discard-new-id', x: 0, y: 0, assetPath: 'new.png' };
  const before = JSON.stringify(doc);
  const patch = importedCanvasMediaPatch(doc, target, prepared);
  expect(JSON.stringify(doc)).toBe(before);
  expect(patch).toEqual({ assetPath: 'new.png', assetVersion: undefined, frameSetInfo: atlas() });
  Object.assign(target, patch);
  expect(target).toMatchObject({
    id: 'original',
    title: 'keep',
    x: 10,
    y: 20,
    width: 520,
    height: 580,
    sectionId: 'group',
  });
  for (const state of [
    { generation: { prompt: 'paid' } },
    { templatePending: true },
    { sourceSnapshot: { id: 'source' } },
    { generationDraft: { operation: 'generate' } },
  ]) {
    const protectedTarget = { ...target, ...state } as typeof target;
    doc.nodes[0] = protectedTarget;
    expect(() => importedCanvasMediaPatch(doc, protectedTarget, prepared)).toThrow('无任务');
  }
  doc.nodes[0] = target;
  doc.edges.push({ id: 'dep', from: 'source', to: target.id, kind: 'sequence-frames' });
  expect(() => importedCanvasMediaPatch(doc, target, prepared)).toThrow('无依赖');
  doc.edges = [];
  expect(() =>
    importedCanvasMediaPatch(doc, target, { ...prepared, type: 'video-source' })
  ).toThrow();
});
