import { findAtlasContentRegions, validateAtlasCrops } from '../atlasContent.js';
import { alignAtlasCells } from '../atlasAlignment.js';
import { imageAtlasManifest } from '../imageAtlasExport.js';

function fixture() {
  const width = 400,
    height = 400;
  const data = new Uint8ClampedArray(width * height * 4);
  function fill(left: number, top: number, blockWidth: number, blockHeight: number) {
    for (let row = top; row < top + blockHeight; row++)
      for (let column = left; column < left + blockWidth; column++)
        data[(row * width + column) * 4 + 3] = 255;
  }
  return { data, width, height, fill };
}

test('finds 24 mixed-size subjects without splitting wide bars into columns', () => {
  const { data, width, height, fill } = fixture();
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) fill(column * 100 + 20, row * 46 + 8, 50, 32);
  for (let row = 0; row < 5; row++) fill(20, 200 + row * 28, 360, 18);
  for (let column = 0; column < 3; column++) fill(column * 100 + 20, 356, 50, 32);
  const regions = findAtlasContentRegions(data, width, height);
  expect(regions).toHaveLength(24);
  expect(regions.slice(16, 21).every((region) => region.width === 360)).toBe(true);
  expect(regions[23].name).toBe('item_024');
  expect(regions.reduce((sum, region) => sum + region.width * region.height, 0)).toBe(
    19 * 50 * 32 + 5 * 360 * 18
  );
});

test('preserves a tall character that crosses a grid line and exceeds the nominal cell', () => {
  const { data, width, height, fill } = fixture();
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) fill(column * 100 + 20, row * 100 + 35, 50, 40);
  fill(220, 15, 50, 100);
  const aligned = alignAtlasCells(data, width, height, {
    columns: 4,
    rows: 4,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
  });
  expect(aligned).toHaveLength(16);
  expect(aligned[2]).toEqual({
    x: 220,
    y: 15,
    width: 50,
    height: 100,
    dx: 1,
    dy: 1,
    outputWidth: 52,
    outputHeight: 102,
  });
  const regions = findAtlasContentRegions(data, width, height);
  expect(regions).toHaveLength(16);
  expect(regions[0]).toEqual({ name: 'item_001', x: 220, y: 15, width: 50, height: 100 });
});

test('rejects empty sources and original-edge truncation', () => {
  const { data, width, height, fill } = fixture();
  expect(() => findAtlasContentRegions(data, width, height)).toThrow('没有');
  fill(0, 10, 40, 40);
  expect(() => findAtlasContentRegions(data, width, height)).toThrow('原图边界');
});

test('validates source crops, rejects overlap, unsafe geometry and excessive outputs', () => {
  const region = { name: 'item_001', x: 4, y: 4, width: 30, height: 50 };
  expect(validateAtlasCrops(100, 100, [region])).toEqual([region]);
  for (const invalid of [
    [],
    [{ ...region, x: -1 }],
    [{ ...region, width: 0 }],
    [{ ...region, x: 80 }],
    [{ ...region, name: 'other' }],
    [{ ...region, offsetX: -1 }],
    [{ ...region, outputWidth: 20 }],
    [{ ...region, extra: true }],
    [region, { ...region, name: 'item_002' }],
  ])
    expect(() => validateAtlasCrops(100, 100, invalid)).toThrow();
  expect(() => validateAtlasCrops(0, 100, [region])).toThrow();
});

test('exports variable-size static frames using the confirmed source coordinates', () => {
  const regions = [
    { name: 'item_001', x: 5, y: 6, width: 80, height: 15 },
    { name: 'item_002', x: 20, y: 40, width: 30, height: 45 },
  ];
  const manifest = imageAtlasManifest(
    100,
    100,
    { columns: 1, rows: 2, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
    regions
  );
  expect(manifest.frames.item_001.frame).toEqual({ x: 5, y: 6, w: 80, h: 15 });
  expect(manifest.frames.item_002.sourceSize).toEqual({ w: 30, h: 45 });
});
