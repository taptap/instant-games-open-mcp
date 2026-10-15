import {
  canvasMediaSources,
  refreshCanvasMedia,
} from '../../../../packages/maker-canvas/src/browser/mediaVersions.js';
import { canvasNodeVersion, isCanvasNodeStale, snapshotCanvasSource } from '../dependencies.js';
import { emptyDocument } from '../model.js';
import type { CanvasNode } from '../model.js';
import type { CanvasDocumentStore } from '../store.js';

function fixture() {
  const document = emptyDocument();
  const source: CanvasNode = {
    id: 'source',
    type: 'image',
    title: 'Source',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    assetPath: 'image.png',
  };
  document.nodes.push(source);
  const mediaVersions = jest.fn(async () => ({ 'image.png': 'content-a' }));
  return {
    document,
    source,
    mediaVersions,
    store: { mediaVersions } as unknown as CanvasDocumentStore,
  };
}

test('same-path replacement invalidates a captured result without replacing or regenerating it', async () => {
  const { document, source, store, mediaVersions } = fixture();
  await refreshCanvasMedia(document, store, [source], true);
  const result = {
    ...source,
    id: 'result',
    assetPath: 'result.png',
    sourceSnapshot: snapshotCanvasSource(source),
  };
  expect(isCanvasNodeStale(result, source)).toBe(false);
  mediaVersions.mockResolvedValue({ 'image.png': 'content-b' });
  expect(await refreshCanvasMedia(document, store)).toBe(true);
  expect(isCanvasNodeStale(result, source)).toBe(true);
  expect(result.assetPath).toBe('result.png');
  expect(result.sourceSnapshot?.version).toContain('content-a');
});

test('inspection never backfills legacy result identities from current bytes', async () => {
  const { document, source, store } = fixture();
  const before = snapshotCanvasSource(source);
  await refreshCanvasMedia(document, store);
  expect(source.assetVersion).toBeUndefined();
  expect(snapshotCanvasSource(source)).toEqual(before);
});

test('changed references during the read are rejected without assigning a wrong identity', async () => {
  const { document, source, store, mediaVersions } = fixture();
  mediaVersions.mockImplementation(async () => {
    source.assetPath = 'other.png';
    return { 'image.png': 'content-a' };
  });
  await expect(refreshCanvasMedia(document, store, [source], true)).rejects.toThrow('读取期间');
  expect(source.assetVersion).toBeUndefined();
});

test('a replaced path cannot inherit the previous content identity', () => {
  const { source } = fixture();
  source.assetVersion = { path: 'other.png', version: 'old' };
  expect(canvasNodeVersion(source)).not.toContain('old');
});

test('export refresh follows upstream dependencies and ignores unrelated missing media', async () => {
  const { document, source, store, mediaVersions } = fixture();
  const result = { ...source, id: 'cut', type: 'image-assets' as const, assetPath: undefined };
  document.nodes.push(result, { ...source, id: 'unrelated', assetPath: 'missing.png' });
  document.edges.push({ id: 'edge', from: source.id, to: result.id, kind: 'image-assets' });
  await refreshCanvasMedia(document, store, canvasMediaSources(document, result));
  expect(mediaVersions).toHaveBeenCalledWith(['image.png']);
});

test('incomplete host results do not partially update persisted source identities', async () => {
  const { document, source, store } = fixture();
  document.nodes.push({ ...source, id: 'second', assetPath: 'missing.png' });
  await expect(refreshCanvasMedia(document, store, document.nodes, true)).rejects.toThrow('未取得');
  expect(source.assetVersion).toBeUndefined();
});
