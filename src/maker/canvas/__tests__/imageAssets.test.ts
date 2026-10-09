import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { PNG } = require('pngjs');
import { applyImageAssets, validateImageAssetsInfo, createImageAssetsZip } from '../imageAssets.js';
import { imageAtlasRegions } from '../imageAtlasExport.js';
import { emptyDocument, createId } from '../model.js';
import type { CanvasNode } from '../model.js';
import { MakerCanvasFiles } from '../files.js';
import { canvasExportFormats } from '../resourceExport.js';

const grid = { columns: 4, rows: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
const info = () => ({
  width: 80,
  height: 60,
  grid: { ...grid },
  items: imageAtlasRegions(80, 60, grid).map((region) => ({
    name: region.name,
    width: region.width,
    height: region.height,
    assetPath: 'assets/image/canvas-' + createId() + '.png',
  })),
});

test('validates each saved item, exact row-major count, dimensions and controlled paths', () => {
  const saved = info();
  expect(validateImageAssetsInfo(saved)).toEqual(saved);
  expect(validateImageAssetsInfo(saved)).not.toBe(saved);
  const invalid = [
    { ...saved, items: saved.items.slice(1) },
    { ...saved, items: [saved.items[1], ...saved.items.slice(1)] },
    { ...saved, grid: { ...grid, columns: 0 } },
    { ...saved, items: saved.items.map((item, index) => (index ? item : { ...item, width: 19 })) },
    {
      ...saved,
      items: saved.items.map((item, index) =>
        index ? item : { ...item, assetPath: '../image.png' }
      ),
    },
    {
      ...saved,
      items: saved.items.map((item, index) =>
        index ? { ...item, assetPath: saved.items[0].assetPath } : item
      ),
    },
  ];
  for (const value of invalid) expect(() => validateImageAssetsInfo(value)).toThrow();
});

test('creates a real collection with source relation; updates it without replacing layout', () => {
  const document = emptyDocument('资产');
  const source: CanvasNode = {
    id: createId(),
    type: 'image' as const,
    title: '图集',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    assetPath: 'assets/image/canvas-' + createId() + '.png',
  };
  document.nodes.push(source);
  const target = applyImageAssets(document, source.id, info(), createId(), createId());
  expect(target.type).toBe('image-assets');
  expect(target.assetPath).toBeUndefined();
  expect(target.imageAssetsInfo?.items).toHaveLength(12);
  expect(document.edges[0]).toMatchObject({ kind: 'image-assets', from: source.id, to: target.id });
  expect(canvasExportFormats(target)).toEqual([{ format: 'images', label: '独立 PNG 素材包' }]);
  target.x = 900;
  target.templatePending = true;
  const updated = applyImageAssets(document, source.id, info(), createId(), createId(), target.id);
  expect(updated).toBe(target);
  expect(target.x).toBe(900);
  expect(target.templatePending).toBeUndefined();
  expect(document.nodes).toHaveLength(2);
  expect(document.edges).toHaveLength(1);
  source.templatePending = true;
  expect(() =>
    applyImageAssets(document, source.id, info(), createId(), createId(), target.id)
  ).toThrow('先完成');
});

test.each(['legacy', 'resource'])(
  'exports %s PNGs and rejects missing or mismatched media',
  async (storage) => {
    const saved = info();
    if (storage === 'resource') {
      const canvasId = createId();
      for (const item of saved.items)
        item.assetPath = '.maker/canvases/' + canvasId + '/resources/' + createId() + '.png';
    }
    const png = PNG.sync.write(new PNG({ width: 20, height: 20 }));
    const previous = global.fetch;
    global.fetch = jest.fn(async () => new Response(png)) as typeof fetch;
    try {
      const zip = Buffer.from(
        await (await createImageAssetsZip(saved, (path) => path)).arrayBuffer()
      );
      const names = [...zip.toString('latin1').matchAll(/item_[0-9]{3}[.]png/g)].map(
        (match) => match[0]
      );
      expect(new Set(names).size).toBe(12);
      expect(zip.toString('latin1')).not.toMatch(/animation.lua|README|index.json/);
      global.fetch = jest.fn(async () => new Response('', { status: 404 })) as typeof fetch;
      await expect(createImageAssetsZip(saved, (path) => path)).rejects.toThrow('读取失败');
      global.fetch = jest.fn(
        async () => new Response(PNG.sync.write(new PNG({ width: 21, height: 20 })))
      ) as typeof fetch;
      await expect(createImageAssetsZip(saved, (path) => path)).rejects.toThrow('尺寸');
    } finally {
      global.fetch = previous;
    }
  }
);

test.each(['legacy', 'resource'])(
  'persists %s PNGs and retains them after source deletion',
  async (storage) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-image-assets-'));
    fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
    const files = new MakerCanvasFiles(root);
    try {
      let document = await files.create('资产');
      const sourceFile = await files.importImage(
        PNG.sync.write(new PNG({ width: 80, height: 60 }))
      );
      const source = {
        id: createId(),
        type: 'image' as const,
        title: '图集',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        assetPath: sourceFile.relativePath,
      };
      const saved = info();
      for (const item of saved.items)
        item.assetPath = (
          await files.importImage(
            PNG.sync.write(new PNG({ width: item.width, height: item.height })),
            storage === 'resource' ? document.id : undefined
          )
        ).relativePath;
      document.nodes.push(source);
      const target = applyImageAssets(document, source.id, saved, createId(), createId());
      document = await files.save(document.id, document, document.revision);
      expect((await files.load(document.id)).nodes[1].imageAssetsInfo).toEqual(saved);
      document.nodes = [target];
      document.edges = [];
      document = await files.save(document.id, document, document.revision);
      expect((await files.load(document.id)).nodes[0].imageAssetsInfo?.items).toHaveLength(12);
      for (const item of saved.items)
        expect(fs.existsSync(files.readMedia(item.assetPath).file)).toBe(true);
      await expect(
        files.save(
          document.id,
          {
            ...document,
            nodes: [{ ...target, imageAssetsInfo: { ...saved, items: saved.items.slice(1) } }],
          },
          document.revision
        )
      ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
);
