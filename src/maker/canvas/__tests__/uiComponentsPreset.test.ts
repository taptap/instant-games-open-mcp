import { canvasPresets } from '../presets.js';
import { imageAtlasRegions } from '../imageAtlasExport.js';

const { PNG } = require('pngjs');

test('UI preset preserves a complete screen and twelve independently usable alpha components', () => {
  const preset = canvasPresets().find((item) => item.id.endsWith('000007'))!;
  const [reference, atlas, collection] = preset.nodes;
  const decode = (assetPath: string) =>
    PNG.sync.read(Buffer.from(preset.assets[assetPath].data, 'base64'));
  expect(preset.nodes.map((node) => node.type)).toEqual(['image', 'image', 'image-assets']);
  expect(preset.edges.map((edge) => [edge.from, edge.to, edge.kind])).toEqual([
    [reference.id, atlas.id, 'image-variant'],
    [atlas.id, collection.id, 'image-assets'],
  ]);
  expect(decode(reference.assetPath!).data[3]).toBe(255);
  expect(reference.generation?.prompt).toContain('完整游戏界面');
  expect(atlas.referenceInput).toEqual({ includeSelf: false });
  expect(atlas.generation?.referenceImagePaths).toEqual([]);
  const info = collection.imageAssetsInfo!;
  expect(info.grid).toEqual({ columns: 4, rows: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
  const original = decode(atlas.assetPath!);
  expect([original.width, original.height]).toEqual([2560, 1728]);
  const regions = imageAtlasRegions(info.width, info.height, info.grid);
  expect(info.items).toHaveLength(12);
  for (const [index, item] of info.items.entries()) {
    const png = decode(item.assetPath);
    const region = regions[index];
    expect([png.width, png.height]).toEqual([640, 576]);
    let transparent = 0;
    let opaque = 0;
    let boundary = 0;
    let mismatch = 0;
    for (let row = 0; row < png.height; row++) {
      for (let column = 0; column < png.width; column++) {
        const offset = (row * png.width + column) * 4;
        const source = ((region.y + row) * original.width + region.x + column) * 4;
        const alpha = png.data[offset + 3];
        if (!alpha) transparent++;
        if (alpha === 255) opaque++;
        if (alpha !== original.data[source + 3]) mismatch++;
        for (let channel = 0; channel < 3; channel++) {
          const difference = Math.abs(png.data[offset + channel] - original.data[source + channel]);
          if (alpha === 255 ? difference !== 0 : difference * alpha > 255) mismatch++;
        }
        if (row === 0 || row === png.height - 1 || column === 0 || column === png.width - 1)
          boundary += alpha;
      }
    }
    expect(transparent).toBeGreaterThan(png.width * png.height * 0.15);
    expect(opaque).toBeGreaterThan(5000);
    expect(boundary).toBe(0);
    expect(mismatch).toBe(0);
    const centerAlpha =
      png.data[(Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4 + 3];
    if (index === 5) expect(centerAlpha).toBe(0);
    if ([0, 2, 3, 6, 7].includes(index)) expect(centerAlpha).toBe(255);
  }
});
