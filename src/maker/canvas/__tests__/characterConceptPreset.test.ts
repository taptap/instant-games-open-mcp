import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canvasPresets } from '../presets.js';
import { MakerCanvasFiles } from '../files.js';
import { createCanvasTemplateModel } from '../templates.js';
import { isCanvasNodeStale } from '../dependencies.js';
import { invalidateCanvasDependents } from '../templateWorkflow.js';

const { PNG } = require('pngjs');
const presetId = '7e1cb6ad-732f-4dc3-a951-000000000011';

test('character concept uses a real transparent reference and one complete presentation sheet', () => {
  const preset = canvasPresets().find((item) => item.id === presetId)!;
  const [reference, sheet] = preset.nodes;
  expect(preset.nodes.map((node) => node.type)).toEqual(['image', 'image']);
  expect(Object.keys(preset.assets)).toHaveLength(2);
  expect(preset.edges).toEqual([
    expect.objectContaining({ from: reference.id, to: sheet.id, kind: 'image-variant' }),
  ]);
  expect(sheet.referenceInput).toEqual({ includeSelf: false });
  expect(sheet.generation?.sourceImageIds).toEqual([reference.id]);
  expect(sheet.generation?.referenceImagePaths).toEqual([]);
  expect(isCanvasNodeStale(sheet, [reference])).toBe(false);
  for (const node of preset.nodes) {
    expect(node.templatePending).toBeUndefined();
    expect(node.generationDraft).toBeUndefined();
    expect(node.generation?.taskId).toBeUndefined();
    expect(node.generation?.attemptId).toBeUndefined();
    expect(node.generation?.parameters).toMatchObject({ model: 'gpt', resolution: '2K' });
  }
  for (const term of [
    '正面',
    '侧面',
    '背面',
    '微笑',
    '大笑',
    '愤怒',
    '悲伤',
    '惊讶',
    '冷峻',
    '同一个角色',
    '静态动作立绘',
    '游戏素材约束：',
  ])
    expect(sheet.generation?.prompt).toContain(term);
  const source = PNG.sync.read(Buffer.from(preset.assets[reference.assetPath!].data, 'base64'));
  expect(source.height).toBeGreaterThan(source.width);
  let transparent = 0;
  let opaque = 0;
  for (let row = 0; row < source.height; row++)
    for (let column = 0; column < source.width; column++) {
      const alpha = source.data[(row * source.width + column) * 4 + 3];
      if (!alpha) transparent++;
      if (alpha === 255) opaque++;
      if (!row || row === source.height - 1 || !column || column === source.width - 1)
        expect(alpha).toBe(0);
    }
  expect(transparent).toBeGreaterThan(source.width * source.height * 0.2);
  expect(opaque).toBeGreaterThan(10000);
  const result = PNG.sync.read(Buffer.from(preset.assets[sheet.assetPath!].data, 'base64'));
  expect([result.width, result.height]).toEqual([2048, 1152]);
  expect(
    result.data.every((value: number, offset: number) => offset % 4 !== 3 || value === 255)
  ).toBe(true);
});

test('concept preset reloads ready, remaps its reference, and preserves old art on replacement', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-concept-'));
  try {
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create('角色概念');
    const prepared = await files.prepareTemplate(presetId, canvas.id);
    const instance = createCanvasTemplateModel().instantiate(prepared, { x: 0, y: 0 });
    await files.save(
      canvas.id,
      { ...canvas, nodes: instance.nodes, edges: instance.edges },
      canvas.revision
    );
    const loaded = await files.load(canvas.id);
    const [reference, sheet] = loaded.nodes.filter((node) => node.type === 'image');
    expect(loaded.nodes).toHaveLength(3);
    expect(loaded.nodes.every((node) => !node.templatePending)).toBe(true);
    expect(sheet.generation?.sourceImageIds).toEqual([reference.id]);
    expect(isCanvasNodeStale(sheet, [reference])).toBe(false);
    for (const node of [reference, sheet])
      expect(fs.statSync(files.readMedia(node.assetPath!).file).size).toBeGreaterThan(10000);
    const original = sheet.assetPath;
    reference.assetPath = sheet.assetPath;
    invalidateCanvasDependents(loaded, reference.id);
    expect(sheet.templatePending).toBe(true);
    expect(sheet.assetPath).toBe(original);
    expect(isCanvasNodeStale(sheet, [reference])).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
