import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { createCanvasTemplateModel } from '../templates.js';
import { createUiWorkflowPreset } from '../uiWorkflowPresets.js';

const presetId = '7e1cb6ad-732f-4dc3-a951-000000000012';

test('BikeKingBanana UI workflow has four screens, three review passes and explicit gates', async () => {
  const preset = createUiWorkflowPreset();
  const refs = preset.nodes.filter(
    (node) => node.type === 'image' && node.title.includes('image-2 设计稿')
  );
  expect(refs).toHaveLength(4);
  expect(
    refs.every(
      (node) =>
        node.assetPath &&
        node.generation?.parameters?.model === 'gpt' &&
        node.generation.operation === 'generate'
    )
  ).toBe(true);
  expect(preset.nodes.filter((node) => node.title.includes('识别候选'))).toHaveLength(12);
  expect(preset.nodes.filter((node) => node.type === 'image-assets')).toHaveLength(8);
  expect(preset.nodes.filter((node) => node.type === 'note')).toHaveLength(7);
  expect(preset.edges.filter((edge) => edge.kind === 'image-variant')).toHaveLength(32);
  expect(preset.edges.filter((edge) => edge.kind === 'image-assets')).toHaveLength(8);
  expect(Object.keys(preset.assets)).toHaveLength(4);
  for (const node of preset.nodes.filter((item) => item.type === 'image' && !item.assetPath)) {
    expect(node.referenceInput).toEqual({ includeSelf: false });
    expect(node.generationDraft?.parameters?.model).toBe('gpt');
  }
});

test('BikeKingBanana UI workflow prepares real references without faking downstream results', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-bike-ui-workflow-'));
  try {
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create('BikeKingBanana UI 研究');
    const prepared = await files.prepareTemplate(presetId, canvas.id);
    const model = createCanvasTemplateModel();
    const instance = model.instantiate(prepared, { x: 0, y: 0 });
    const references = instance.nodes.filter(
      (node) => node.type === 'image' && node.title.includes('image-2 设计稿')
    );
    expect(references).toHaveLength(4);
    expect(references.every((node) => node.assetPath?.startsWith('assets/image/'))).toBe(true);
    expect(instance.nodes.filter((node) => node.templatePending)).toHaveLength(40);
    const consensus = instance.nodes.find((node) => node.title.includes('共识复核板'))!;
    const consensusSources = consensus.generationDraft?.sourceImageIds || [];
    expect(consensusSources).toHaveLength(4);
    expect(consensusSources.every((id) => instance.nodes.some((node) => node.id === id))).toBe(
      true
    );
    const iconSplit = instance.nodes.find((node) => node.title.includes('Icon + 按钮拆分'))!;
    expect(iconSplit.generationDraft?.sourceImageIds).toEqual(
      expect.arrayContaining([
        instance.nodes.find((node) => node.title.includes('去普通文字'))!.id,
        consensus.id,
      ])
    );
    expect(
      instance.nodes
        .filter((node) => node.type === 'image-assets')
        .every((node) => node.imageAssetsInfo === undefined)
    ).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
