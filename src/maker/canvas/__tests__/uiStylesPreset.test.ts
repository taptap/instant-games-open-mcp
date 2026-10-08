import { readDemoResource } from '../../demoResources.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canvasPresets } from '../presets.js';
import { MakerCanvasFiles } from '../files.js';
import { createCanvasTemplateModel } from '../templates.js';
import { isCanvasNodeStale } from '../dependencies.js';
import { invalidateCanvasDependents } from '../templateWorkflow.js';

jest.setTimeout(30000);

const { PNG } = require('pngjs');
const presetId = '7e1cb6ad-732f-4dc3-a951-000000000010';

test('UI styles preset is one complete reference and three independently generated style branches', async () => {
  const preset = canvasPresets().find((item) => item.id === presetId)!;
  const [reference, ...variants] = preset.nodes;
  expect(preset.nodes.map((node) => node.type)).toEqual(['image', 'image', 'image', 'image']);
  expect(preset.edges).toHaveLength(3);
  expect(Object.keys(preset.assets)).toHaveLength(4);
  expect(reference.generation?.prompt).toContain('完整游戏UI设计稿');
  expect(reference.generation?.prompt).toContain('每日签到');
  const hashes = new Set<string>();
  for (const node of preset.nodes) {
    expect(node.templatePending).toBeUndefined();
    expect(node.generationDraft).toBeUndefined();
    expect(node.generation?.taskId).toBeUndefined();
    expect(node.generation?.attemptId).toBeUndefined();
    expect(node.mergeIcons).toBeUndefined();
    expect(node.generation?.parameters).toMatchObject({
      model: 'gpt',
      resolution: '2K',
      aspectRatio: '16:9',
    });
    const bytes = await readDemoResource(preset.assets[node.assetPath!].resourceId);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
    const png = PNG.sync.read(bytes);
    expect([png.width, png.height]).toEqual([2048, 1152]);
    expect(png.data.every((value: number, index: number) => index % 4 !== 3 || value === 255)).toBe(
      true
    );
  }
  expect(hashes.size).toBe(4);
  for (const [index, node] of variants.entries()) {
    expect(node.referenceInput).toEqual({ includeSelf: false });
    expect(node.generation?.referenceImagePaths).toEqual([]);
    expect(node.generation?.sourceImageId).toBe(reference.id);
    expect(node.generation?.sourceImageIds).toEqual([reference.id]);
    expect(node.generation?.prompt).toContain(
      ['温暖手绘风格', '暗黑奇幻风格', '科幻终端风格'][index]
    );
    expect(node.generation?.prompt).toContain('不强制七天或固定格数');
    expect(node.generation?.prompt).toContain('不重排格子');
    expect(node.generation?.prompt).toContain('游戏素材约束：');
    expect(node.generation?.prompt).toContain('输出单张完整设计稿');
    expect(node.generation?.prompt).toContain('保留界面背景');
    expect(isCanvasNodeStale(node, [reference])).toBe(false);
    expect(preset.edges).toContainEqual(
      expect.objectContaining({ from: reference.id, to: node.id, kind: 'image-variant' })
    );
  }
});

test('UI styles instances persist real assets and isolate source replacement and branch changes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-styles-'));
  try {
    const files = new MakerCanvasFiles(root);
    const model = createCanvasTemplateModel();
    const canvas = await files.create('UI风格裂变');
    const prepared = await files.prepareTemplate(presetId, canvas.id);
    const custom = model.instantiate({ ...prepared, builtin: undefined }, { x: 0, y: 0 });
    expect(custom.nodes.filter((node) => node.templatePending)).toHaveLength(3);
    const incomplete = structuredClone(prepared);
    delete incomplete.nodes[1].assetPath;
    expect(
      model.instantiate(incomplete, { x: 0, y: 0 }).nodes.filter((node) => node.templatePending)
    ).toHaveLength(3);
    const first = model.instantiate(prepared, { x: 0, y: 0 });
    const second = model.instantiate(prepared, { x: 1800, y: 0 });
    const saved = await files.save(
      canvas.id,
      {
        ...canvas,
        nodes: [...first.nodes, ...second.nodes],
        edges: [...first.edges, ...second.edges],
      },
      canvas.revision
    );
    const document = await files.load(canvas.id);
    expect(document.nodes).toEqual(saved.nodes);
    const firstImages = document.nodes.filter((node) => node.sectionId === first.section.id);
    const secondImages = document.nodes.filter((node) => node.sectionId === second.section.id);
    const [reference, ...variants] = firstImages;
    for (const node of [...firstImages, ...secondImages]) {
      expect(fs.statSync(files.readMedia(node.assetPath!).file).size).toBeGreaterThan(10000);
      expect(node.templatePending).toBeUndefined();
    }
    for (const variant of variants) {
      expect(variant.generation?.sourceImageIds).toEqual([reference.id]);
      expect(isCanvasNodeStale(variant, [reference])).toBe(false);
    }
    invalidateCanvasDependents(document, variants[0].id);
    expect(document.nodes.some((node) => node.templatePending)).toBe(false);
    const oldAssets = variants.map((node) => node.assetPath);
    reference.assetPath = secondImages[1].assetPath;
    invalidateCanvasDependents(document, reference.id);
    expect(variants.every((node) => node.templatePending)).toBe(true);
    expect(variants.map((node) => node.assetPath)).toEqual(oldAssets);
    expect(secondImages.every((node) => !node.templatePending)).toBe(true);
    expect(variants.every((node) => isCanvasNodeStale(node, [reference]))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
