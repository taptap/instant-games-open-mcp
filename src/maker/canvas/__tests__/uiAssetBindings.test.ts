import { bboxFixture } from './uiBbox.test.js';
import { emptyDocument, createId, type CanvasNode } from '../model.js';
import { validateUiRecognition } from '../uiRecognition.js';
import {
  selectedUiAtlasPlan,
  validateUiAtlasPlan,
  uiAtlasOrderPrompt,
} from '../uiAssetBindings.js';
import { imageAssetsBindingPlan } from '../imageAssets.js';
import { uiBundleManifest } from '../resourceBundle.js';
import { snapshotCanvasSource, isCanvasNodeStale } from '../dependencies.js';
import { createCanvasTemplateModel } from '../templates.js';

function fixture() {
  const bbox = bboxFixture();
  const document = emptyDocument('bindings');
  const id = createId();
  const clean: CanvasNode = {
    id: createId(),
    type: 'image',
    title: 'clean',
    x: 0,
    y: 0,
    width: 100,
    height: 200,
    assetPath: bbox.cutSource.path,
    uiRecognition: validateUiRecognition({
      enabled: true,
      selectedId: id,
      results: [
        {
          id,
          sourcePath: bbox.cutSource.path,
          sourceSha256: bbox.cutSource.sha256,
          width: 200,
          height: 400,
          model: 'test',
          prompt: 'test',
          durationMs: 1,
          createdAt: new Date().toISOString(),
          elements: [],
          bbox,
        },
      ],
    }),
  };
  const atlas: CanvasNode = {
    ...clean,
    id: createId(),
    title: 'atlas',
    uiRecognition: undefined,
    uiRecognitionSourceId: clean.id,
    uiExtraction: 'action',
  };
  const original: CanvasNode = {
    ...clean,
    id: createId(),
    assetPath: bbox.design.path,
    uiRecognition: { enabled: true, inputRole: 'design', results: [] },
  };
  document.nodes.push(original, clean, atlas);
  document.edges.push({ id: createId(), from: original.id, to: clean.id, kind: 'image-variant' });
  document.edges.push({ id: createId(), from: clean.id, to: atlas.id, kind: 'image-variant' });
  return { document, clean, atlas };
}

test('template I derives ordered IDs; template II explicit plan rejects changed Bbox', () => {
  const { document, atlas, clean } = fixture();
  const plan = selectedUiAtlasPlan(document, atlas)!;
  expect(plan.slots.map((slot) => slot.elementIds)).toContainEqual(['E001']);
  expect(uiAtlasOrderPrompt(plan)).toContain('E001 按钮 [20,40,160,80]');
  atlas.uiAtlasPlan = plan;
  expect(selectedUiAtlasPlan(document, atlas)).toEqual(plan);
  clean.uiRecognition!.results[0].bbox!.elements[0].name = 'changed';
  expect(() => selectedUiAtlasPlan(document, atlas)).toThrow('不一致');
});

test('frozen slots validate counts and survive template snapshot; changed slots invalidate cuts', () => {
  const { document, atlas } = fixture();
  const plan = selectedUiAtlasPlan(document, atlas)!;
  atlas.generation = { prompt: 'test', parameters: {}, attemptId: createId(), uiAtlasPlan: plan };
  const info = {
    width: 200,
    height: 400,
    grid: plan.grid,
    uiBindingReview: 'confirmed' as const,
    items: plan.slots.map((_, index) => ({
      name: 'item_' + index,
      width: 20,
      height: 20,
      assetPath: atlas.assetPath!,
    })),
  };
  expect(imageAssetsBindingPlan(atlas, info)).toEqual(plan);
  expect(() => imageAssetsBindingPlan(atlas, { ...info, items: [] })).toThrow('数量');
  expect(() => validateUiAtlasPlan({ ...plan, slots: [] })).toThrow('格数');
  const cut: CanvasNode = {
    ...atlas,
    id: createId(),
    type: 'image-assets',
    generation: undefined,
    uiExtraction: undefined,
    imageAssetsInfo: info,
    sourceSnapshot: snapshotCanvasSource(atlas),
  };
  document.nodes.push(cut);
  document.edges.push({ id: createId(), from: atlas.id, to: cut.id, kind: 'image-assets' });
  const template = createCanvasTemplateModel().snapshot(
    document,
    document.nodes.map((node) => node.id),
    'test'
  );
  expect(
    isCanvasNodeStale(
      template.nodes.find((node) => node.id === cut.id)!,
      template.nodes.find((node) => node.id === atlas.id)
    )
  ).toBe(false);
  atlas.generation.uiAtlasPlan = { ...plan, slots: [...plan.slots].reverse() };
  expect(isCanvasNodeStale(cut, atlas)).toBe(true);
});

test('manifest exports actual paths and normal/pressed IDs and flags unreviewed bindings', async () => {
  const { document, atlas } = fixture();
  const plan = selectedUiAtlasPlan(document, atlas)!;
  atlas.generation = { prompt: 'test', parameters: {}, uiAtlasPlan: plan };
  const member: CanvasNode = {
    ...atlas,
    id: createId(),
    type: 'image-assets',
    generation: undefined,
    imageAssetsInfo: {
      width: 200,
      height: 400,
      grid: plan.grid,
      uiBindingReview: 'confirmed',
      items: plan.slots.map((_, index) => ({
        name: 'item_' + index,
        width: 20,
        height: 20,
        assetPath: atlas.assetPath!,
        contentRect: [1, 1, 18, 18],
      })),
    },
  };
  document.nodes.push(member);
  document.edges.push({ id: createId(), from: atlas.id, to: member.id, kind: 'image-assets' });
  const entries = member.imageAssetsInfo!.items.map((item) => ({
    name: '01-controls/' + item.name + '.png',
    blob: new Blob(['png']),
  }));
  const result = (await uiBundleManifest(document, [member], entries))!;
  expect(result.manifest.confirmed).toBe(true);
  expect(result.manifest.assets[0].path).toBe(entries[0].name);
  expect(result.manifest.bindings[0]).toMatchObject({
    elementId: 'E001',
    assetId: expect.any(String),
    pressedAssetId: expect.any(String),
  });
  member.imageAssetsInfo!.uiBindingReview = 'unreviewed';
  expect((await uiBundleManifest(document, [member], entries))!.manifest.confirmed).toBe(false);
});
