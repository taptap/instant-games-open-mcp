import { emptyDocument, createId } from '../model.js';
import type { CanvasNode } from '../model.js';
import { applyImageAssets } from '../imageAssets.js';
import { canvasExportFormats, downloadCanvasResource } from '../resourceExport.js';
import {
  addResourceBundle,
  resourceBundleMembers,
  resourceBundleOwner,
  createResourceBundleZip,
  validateResourceBundle,
} from '../resourceBundle.js';
import { invalidateCanvasDependents } from '../templateWorkflow.js';
import { snapshotCanvasSource } from '../dependencies.js';
const { PNG } = require('pngjs');
const yauzl = require('yauzl');

function fixture() {
  const document = emptyDocument('汇总测试');
  const section: CanvasNode = {
    id: createId(),
    type: 'section',
    title: 'UI 素材',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  document.nodes.push(section);
  for (let index = 0; index < 2; index++) {
    const source: CanvasNode = {
      ...section,
      id: createId(),
      type: 'image',
      title: '按钮/图标',
      sectionId: section.id,
      assetPath: 'assets/image/canvas-' + createId() + '.png',
    };
    document.nodes.push(source);
    applyImageAssets(
      document,
      source.id,
      {
        width: 2,
        height: 2,
        grid: { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
        items: [
          {
            name: 'item_001',
            width: 2,
            height: 2,
            assetPath: 'assets/image/canvas-' + createId() + '.png',
          },
        ],
      },
      createId(),
      createId()
    );
  }
  return {
    document,
    section,
    assets: document.nodes.filter((node) => node.type === 'image-assets'),
  };
}

async function zipNames(blob: Blob): Promise<string[]> {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, {}, (error: Error, zip: any) => {
      if (error) return reject(error);
      const names: string[] = [];
      zip.on('entry', (entry: any) => names.push(entry.fileName));
      zip.on('end', () => resolve(names));
      zip.on('error', reject);
    });
  });
}

const originalFetch = globalThis.fetch;

test('terminal collects existing categories without copying or recutting their results', async () => {
  const { document, section, assets } = fixture();
  const before = structuredClone(assets);
  const bundle = addResourceBundle(document, section.id);
  expect(resourceBundleMembers(document, bundle.id)).toEqual(assets);
  expect(assets).toEqual(before);
  expect(resourceBundleOwner(document, assets[0].id)).toBe(bundle);
  expect(() => addResourceBundle(document, section.id)).toThrow('已经汇总');
  const bytes = PNG.sync.write(new PNG({ width: 2, height: 2 }));
  globalThis.fetch = jest.fn(async () => new Response(bytes));
  const pending = {
    ...assets[0],
    id: createId(),
    title: '美术字',
    imageAssetsInfo: undefined,
    templatePending: true,
  };
  document.nodes.push(pending);
  document.edges.push({ id: createId(), from: pending.id, to: bundle.id, kind: 'resource-bundle' });
  expect(canvasExportFormats(bundle, document)[0].label).toContain('已完成');
  expect(
    await zipNames(await createResourceBundleZip(document, bundle.id, (path) => path))
  ).toHaveLength(2);
  invalidateCanvasDependents(document, assets[0].sourceSnapshot!.nodeId);
  expect(bundle.templatePending).toBeUndefined();
  expect(() => validateResourceBundle(document, bundle.id)).toThrow('尚未完成');
  document.nodes = document.nodes.filter((node) => node !== bundle);
  expect(resourceBundleOwner(document, assets[0].id)).toBeUndefined();
});

test('terminal rejects lost category references and missing results', () => {
  const { document, section, assets } = fixture();
  const bundle = addResourceBundle(document, section.id);
  delete assets[0].imageAssetsInfo;
  expect(() => validateResourceBundle(document, bundle.id)).toThrow('尚未完成切图');
  document.nodes = document.nodes.filter((node) => node !== assets[0]);
  expect(() => validateResourceBundle(document, bundle.id)).toThrow('来源已丢失');
});

test('completed empty categories are skipped but stale empty branches still block export', async () => {
  const { document, section, assets } = fixture();
  const bundle = addResourceBundle(document, section.id);
  assets[0].uiEmpty = true;
  delete assets[0].imageAssetsInfo;
  expect(validateResourceBundle(document, bundle.id)).toEqual([assets[1]]);
  const bytes = PNG.sync.write(new PNG({ width: 2, height: 2 }));
  globalThis.fetch = jest.fn(async () => new Response(bytes));
  expect(await zipNames(await createResourceBundleZip(document, bundle.id, (p) => p))).toHaveLength(
    1
  );
  invalidateCanvasDependents(document, assets[0].sourceSnapshot!.nodeId);
  expect(() => validateResourceBundle(document, bundle.id)).toThrow('尚未完成');
});
const originalWindow = (globalThis as any).window;
beforeEach(() => {
  (globalThis as any).window = {};
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as any).window = originalWindow;
});

test('exports one ZIP with collision-safe folders and excludes other groups', async () => {
  const { document, section, assets } = fixture();
  assets.forEach((node) => {
    node.title = '按钮/图标';
  });
  document.nodes.push({ ...assets[0], id: createId(), sectionId: 'other', templatePending: true });
  const before = structuredClone(document);
  const bytes = PNG.sync.write(new PNG({ width: 2, height: 2 }));
  globalThis.fetch = jest.fn(async () => new Response(bytes));
  const sink = jest.fn(async (_blob: Blob, _filename: string) => undefined);
  await downloadCanvasResource(
    section,
    'bundle',
    (path) => path,
    undefined,
    undefined,
    true,
    sink,
    document
  );
  expect(sink).toHaveBeenCalledTimes(1);
  expect(await zipNames(sink.mock.calls[0][0])).toEqual([
    '01-按钮_图标/item_001.png',
    '02-按钮_图标/item_001.png',
  ]);
  expect(document).toEqual(before);
  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  expect(canvasExportFormats(section, document)[0].format).toBe('bundle');
});

test.each(['unfinished', 'stale', 'ancestor', 'missing-source', 'missing-result', 'cycle'])(
  'blocks %s before reading any PNG',
  async (state) => {
    const { document, section, assets } = fixture();
    const source = document.nodes.find((node) => node.id === assets[0].sourceSnapshot!.nodeId)!;
    if (state === 'unfinished') assets[1].templatePending = true;
    if (state === 'stale') source.assetPath = 'changed.png';
    if (state === 'missing-source')
      document.nodes = document.nodes.filter((node) => node !== source);
    if (state === 'missing-result') delete assets[1].imageAssetsInfo;
    if (state === 'ancestor') {
      const ancestor = { ...source, id: createId(), templatePending: true };
      document.nodes.push(ancestor);
      document.edges.push({
        id: createId(),
        from: ancestor.id,
        to: source.id,
        kind: 'image-variant',
      });
      source.sourceSnapshot = snapshotCanvasSource(ancestor);
    }
    if (state === 'cycle')
      document.edges.push({
        id: createId(),
        from: assets[0].id,
        to: source.id,
        kind: 'image-variant',
      });
    globalThis.fetch = jest.fn();
    await expect(createResourceBundleZip(document, section.id, (path) => path)).rejects.toThrow();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  }
);

test('blocks empty and oversized bundles without silently dropping categories', () => {
  const { document, section, assets } = fixture();
  expect(() => validateResourceBundle(document, 'missing')).toThrow('没有切图素材');
  for (let index = 0; index < 121; index++)
    document.nodes.push({ ...assets[0], id: createId(), sourceSnapshot: undefined });
  expect(() => validateResourceBundle(document, section.id)).toThrow('122');
});

test('a failed category read never delivers a partial download', async () => {
  const { document, section } = fixture();
  const bytes = PNG.sync.write(new PNG({ width: 2, height: 2 }));
  globalThis.fetch = jest
    .fn()
    .mockResolvedValueOnce(new Response(bytes))
    .mockResolvedValueOnce(new Response('', { status: 404 }));
  const sink = jest.fn();
  await expect(
    downloadCanvasResource(
      section,
      'bundle',
      (path) => path,
      undefined,
      undefined,
      true,
      sink,
      document
    )
  ).rejects.toThrow('素材读取失败');
  expect(sink).not.toHaveBeenCalled();
});
