import {
  imageAtlasRegions,
  imageAtlasManifest,
  imageAtlasInstructions,
  createImageAtlasExport,
} from '../imageAtlasExport.js';
import type { ImageAtlasGrid } from '../imageAtlasExport.js';
import { openImageAtlasDialog } from '../imageAtlasUi.js';

const grid: ImageAtlasGrid = { columns: 4, rows: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };

test('covers an uneven-sized grid exactly, with stable row-major keys and no pixel loss', () => {
  const regions = imageAtlasRegions(101, 80, grid);
  expect(regions).toHaveLength(12);
  expect(regions[0]).toEqual({ name: 'item_001', x: 0, y: 0, width: 25, height: 26 });
  expect(regions[11]).toEqual({ name: 'item_012', x: 75, y: 53, width: 26, height: 27 });
  expect(regions.reduce((area, region) => area + region.width * region.height, 0)).toBe(101 * 80);
  const coverage = new Uint8Array(101 * 80);
  for (const region of regions)
    for (let row = region.y; row < region.y + region.height; row++)
      for (let column = region.x; column < region.x + region.width; column++)
        coverage[row * 101 + column]++;
  expect(coverage.every((count) => count === 1)).toBe(true);
});

test('honors explicit margins and gaps without resizing the object pixels', () => {
  expect(
    imageAtlasRegions(110, 65, { columns: 2, rows: 2, marginX: 3, marginY: 4, gapX: 4, gapY: 5 })
  ).toEqual([
    { name: 'item_001', x: 3, y: 4, width: 50, height: 26 },
    { name: 'item_002', x: 57, y: 4, width: 50, height: 26 },
    { name: 'item_003', x: 3, y: 35, width: 50, height: 26 },
    { name: 'item_004', x: 57, y: 35, width: 50, height: 26 },
  ]);
});

test.each([
  { columns: 0 },
  { rows: -1 },
  { columns: 1.5 },
  { columns: NaN },
  { rows: Infinity },
  { columns: 11, rows: 11 },
  { marginX: -1 },
  { gapY: 0.5 },
  { marginY: 100 },
  { gapX: 100 },
])('rejects invalid grid settings %j', (settings) => {
  expect(() => imageAtlasRegions(100, 100, { ...grid, ...settings })).toThrow();
});

test.each([0, -1, NaN, Infinity, 4097, 12.5])(
  'rejects unsupported source dimension %s',
  (width) => {
    expect(() => imageAtlasRegions(width, 100, grid)).toThrow('尺寸');
  }
);

test('exports Maker static frames, not fake animation clips', () => {
  const before = structuredClone(grid);
  const manifest = imageAtlasManifest(2304, 1536, grid);
  expect(Object.keys(manifest.frames)).toHaveLength(12);
  expect(manifest.frames.item_012).toEqual({
    frame: { x: 1728, y: 1024, w: 576, h: 512 },
    sourceSize: { w: 576, h: 512 },
    spriteSourceSize: { x: 0, y: 0, w: 576, h: 512 },
    rotated: false,
    trimmed: false,
  });
  expect(manifest.meta).toEqual({
    image: 'spritesheet.png',
    size: { w: 2304, h: 1536 },
    scale: '1',
  });
  expect(manifest).not.toHaveProperty('animations');
  expect(grid).toEqual(before);
  expect(imageAtlasInstructions('atlas', grid)).toContain('frame = "item_001"');
  expect(imageAtlasInstructions('images', grid)).toContain(
    'backgroundImage = "image/items/item_001.png"'
  );
});

test('blocks empty source and invalid formats before decoding', async () => {
  await expect(createImageAtlasExport(new Blob([]), grid, 'images')).rejects.toThrow('图片为空');
  await expect(createImageAtlasExport(new Blob(['x']), grid, 'unknown' as any)).rejects.toThrow(
    '格式'
  );
});

test('blocks missing or pending results before constructing the dialog', () => {
  const node = {
    id: 'image',
    type: 'image' as const,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    title: '图集',
  };
  expect(() => openImageAtlasDialog(node, (path) => path)).toThrow('保存图片');
  expect(() =>
    openImageAtlasDialog({ ...node, assetPath: 'image.png', templatePending: true }, (path) => path)
  ).toThrow('保存图片');
});
