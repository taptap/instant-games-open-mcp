import { readDemoResource } from '../../demoResources.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  configureMergeIcons,
  mergeIconGrid,
  mergeIconPrompt,
  validateMergeIcons,
} from '../mergeIcons.js';
import { cloneDocument, createId, emptyDocument } from '../model.js';
import { MakerCanvasFiles } from '../files.js';
import { createCanvasTemplateModel } from '../templates.js';
import { canvasPresets } from '../presets.js';
import { imageAtlasRegions } from '../imageAtlasExport.js';
import { canvasNeedsProcessing } from '../templateWorkflow.js';

test('built-in merge example contains fifteen real alpha assets matching its five-stage settings', async () => {
  const { PNG } = require('pngjs');
  const preset = canvasPresets().find((entry) => entry.id.endsWith('000009'))!;
  const [reference, atlas, assets] = preset.nodes;
  const decode = async (assetPath: string) =>
    PNG.sync.read(await readDemoResource(preset.assets[assetPath].resourceId));
  expect(preset.nodes.map((node) => node.type)).toEqual(['image', 'image', 'image-assets']);
  expect(preset.edges).toHaveLength(2);
  expect(atlas.generation?.prompt).toBe(mergeIconPrompt(atlas.mergeIcons!));
  expect(atlas.generationDraft).toBeUndefined();
  expect(atlas.generation?.attemptId).toBeUndefined();
  expect((await decode(reference.assetPath!)).data[3]).toBe(0);
  const info = assets.imageAssetsInfo!;
  expect(info.grid).toEqual(mergeIconGrid(atlas.mergeIcons!));
  expect(info.items).toHaveLength(15);
  expect(Object.keys(preset.assets)).toHaveLength(17);
  const original = await decode(atlas.assetPath!);
  const regions = imageAtlasRegions(info.width, info.height, info.grid);
  for (const [index, item] of info.items.entries()) {
    const image = await decode(item.assetPath);
    const region = regions[index];
    expect([image.width, image.height]).toEqual([region.width, region.height]);
    let opaque = 0,
      transparent = 0,
      mismatch = 0,
      boundary = 0;
    for (let row = 0; row < image.height; row++)
      for (let column = 0; column < image.width; column++) {
        const offset = (row * image.width + column) * 4;
        const source = ((row + region.y) * original.width + column + region.x) * 4;
        const alpha = image.data[offset + 3];
        if (alpha === 0) transparent++;
        if (alpha === 255) opaque++;
        if (alpha !== original.data[source + 3]) mismatch++;
        if (
          alpha === 255 &&
          image.data
            .subarray(offset, offset + 3)
            .compare(original.data.subarray(source, source + 3))
        )
          mismatch++;
        if (row === 0 || column === 0 || row === image.height - 1 || column === image.width - 1)
          boundary += alpha;
      }
    expect(opaque).toBeGreaterThan(1000);
    expect(transparent).toBeGreaterThan(image.width * image.height * 0.2);
    expect(boundary).toBe(0);
    expect(mismatch).toBe(0);
  }
});

const settings = {
  stageCount: 5,
  instructions: '保持手绘风格',
  series: [{ name: '面包', stages: ['一只', '两只', '一篮', '礼篮', '豪华礼篮'] }],
};

test('builds ordered stage prompts, retains hidden descriptions, and matches the split grid', async () => {
  const prompt = mergeIconPrompt(settings);
  expect(prompt).toContain('严格5列×1行，共5个图标');
  expect(prompt).toContain('Lv.5：豪华礼篮');
  const fewer = validateMergeIcons({ ...settings, stageCount: 3 });
  expect(fewer.series[0].stages).toHaveLength(5);
  expect(mergeIconPrompt(fewer)).not.toContain('Lv.4');
  expect(mergeIconGrid(fewer)).toMatchObject({ columns: 3, rows: 1 });
  const maximum = {
    stageCount: 33,
    instructions: '',
    series: Array.from({ length: 3 }, (_, index) => ({
      name: '系列' + index,
      stages: Array(33).fill(''),
    })),
  };
  expect(mergeIconPrompt(maximum)).toContain('共99个图标');
  expect(mergeIconPrompt(maximum)).toContain('Lv.33');
});

test.each([
  null,
  {},
  { ...settings, stageCount: 1 },
  { ...settings, stageCount: 34 },
  { ...settings, stageCount: 2.5 },
  { ...settings, series: [] },
  { ...settings, series: [{ name: '', stages: [] }] },
  { ...settings, series: [{ name: '面包', stages: Array(5).fill('长'.repeat(61)) }] },
])('rejects invalid settings %j', (value) => {
  expect(() => validateMergeIcons(value)).toThrow();
});

test('configuration preserves old pixels and generation evidence until explicit regeneration', async () => {
  const doc = emptyDocument();
  const node = {
    id: createId(),
    type: 'image' as const,
    title: '二合',
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    assetPath: 'old.png',
    generation: { prompt: '旧提示词', attemptId: 'old-attempt' },
  };
  doc.nodes.push(node);
  configureMergeIcons(node, settings);
  expect(node.assetPath).toBe('old.png');
  expect(node.generation).toEqual({ prompt: '旧提示词', attemptId: 'old-attempt' });
  expect(canvasNeedsProcessing(doc, doc.nodes[0])).toBe(true);
  expect(doc.nodes[0].templatePending).toBeUndefined();
  expect(doc.nodes[0].generationDraft).toBeUndefined();
  expect(mergeIconPrompt(doc.nodes[0].mergeIcons!)).toContain('严格5列');
  const copy = cloneDocument(doc);
  copy.nodes[0].mergeIcons!.series[0].stages[0] = '更改';
  expect(doc.nodes[0].mergeIcons!.series[0].stages[0]).toBe('一只');
});

test('settings survive save, reload and template copies; other card types reject them', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-merge-icons-'));
  try {
    const files = new MakerCanvasFiles(root);
    const doc = await files.create('二合');
    doc.nodes.push({
      id: createId(),
      type: 'image',
      title: '二合',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    });
    configureMergeIcons(doc.nodes[0], settings);
    const target = doc.nodes[0];
    const preparedReference = await files.prepareTemplate(
      '7e1cb6ad-732f-4dc3-a951-000000000005',
      doc.id
    );
    const reference = { ...preparedReference.nodes[0], id: createId() };
    doc.nodes.push(reference);
    doc.edges.push({ id: createId(), from: reference.id, to: target.id, kind: 'image-variant' });
    const saved = await files.save(doc.id, doc, doc.revision);
    expect((await files.load(doc.id)).nodes[0].mergeIcons).toEqual(settings);
    const model = createCanvasTemplateModel();
    const template = await files.saveTemplate(
      model.snapshot(
        saved,
        saved.nodes.map((node) => node.id),
        '二合副本'
      )
    );
    const prepared = await files.readTemplate(template.id);
    const first = model.instantiate(prepared, { x: 0, y: 0 });
    const second = model.instantiate(prepared, { x: 500, y: 0 });
    const image = first.nodes.find((node) => node.mergeIcons)!;
    image.mergeIcons!.series[0].name = '变化';
    expect(second.nodes.find((node) => node.mergeIcons)!.mergeIcons!.series[0].name).toBe('面包');
    await expect(
      files.save(doc.id, { ...saved, nodes: [{ ...saved.nodes[0], type: 'note' }] }, saved.revision)
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
