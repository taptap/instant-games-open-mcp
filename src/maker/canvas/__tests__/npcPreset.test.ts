import { createHash } from 'node:crypto';
import { canvasPresets } from '../presets.js';
import { imageAtlasRegions } from '../imageAtlasExport.js';

const { PNG } = require('pngjs');

test('NPC preset keeps a style reference and eight distinct transparent full-body assets', () => {
  const preset = canvasPresets().find((item) => item.id.endsWith('000008'))!;
  const [reference, atlas, collection] = preset.nodes;
  const decode = (assetPath: string) =>
    PNG.sync.read(Buffer.from(preset.assets[assetPath].data, 'base64'));
  expect(preset.nodes.map((node) => node.type)).toEqual(['image', 'image', 'image-assets']);
  expect(preset.nodes.every((node) => !node.templatePending && !node.generationDraft)).toBe(true);
  expect(
    preset.nodes.every((node) => !node.generation?.taskId && !node.generation?.attemptId)
  ).toBe(true);
  expect(preset.edges.map((edge) => [edge.from, edge.to, edge.kind])).toEqual([
    [reference.id, atlas.id, 'image-variant'],
    [atlas.id, collection.id, 'image-assets'],
  ]);
  expect(decode(reference.assetPath!).data[3]).toBe(0);
  expect(atlas.referenceInput).toEqual({ includeSelf: false });
  expect(atlas.generation?.referenceImagePaths).toEqual([]);
  expect(atlas.generation?.sourceImageIds).toEqual([reference.id]);
  expect(atlas.generation?.prompt).toContain('不是同一人物换装');
  for (const role of [
    '铁匠',
    '面包师',
    '草药师',
    '守卫',
    '渔夫',
    '图书管理员',
    '旅行商人',
    '旅店老板娘',
  ])
    expect(atlas.generation?.prompt).toContain(role);
  const info = collection.imageAssetsInfo!;
  expect(info.grid).toEqual({ columns: 4, rows: 2, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
  expect(info.items).toHaveLength(8);
  expect(Object.keys(preset.assets)).toHaveLength(10);
  const original = decode(atlas.assetPath!);
  expect([original.width, original.height]).toEqual([info.width, info.height]);
  const regions = imageAtlasRegions(info.width, info.height, info.grid);
  const hashes = new Set<string>();
  for (const [index, item] of info.items.entries()) {
    hashes.add(createHash('sha256').update(preset.assets[item.assetPath].data).digest('hex'));
    const png = decode(item.assetPath);
    const region = regions[index];
    expect([png.width, png.height]).toEqual([region.width, region.height]);
    expect([item.width, item.height]).toEqual([png.width, png.height]);
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
    expect(transparent).toBeGreaterThan(png.width * png.height * 0.2);
    expect(opaque).toBeGreaterThan(png.width * png.height * 0.03);
    expect(boundary).toBe(0);
    expect(mismatch).toBe(0);
  }
  expect(hashes.size).toBe(8);
});
