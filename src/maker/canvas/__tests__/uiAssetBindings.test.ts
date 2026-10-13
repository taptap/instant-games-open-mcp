import { bboxFixture } from './uiBbox.test.js';
import { emptyDocument, createId, type CanvasNode } from '../model.js';
import { validateUiRecognition } from '../uiRecognition.js';
import {
  selectedUiAtlasPlan,
  validateUiAtlasPlan,
  uiAtlasOrderPrompt,
  uiBatchAtlasPlan,
  uiBatchAtlasPlans,
  uiBatchAtlasPrompt,
  ensureUiAtlasBatchCards,
} from '../uiAssetBindings.js';
import { imageAssetsBindingPlan } from '../imageAssets.js';
import { uiBundleManifest } from '../resourceBundle.js';
import { snapshotCanvasSource, isCanvasNodeStale } from '../dependencies.js';
import { createCanvasTemplateModel } from '../templates.js';
import { isGameUiResource } from '../uiWorkflowHandoff.js';

test('personal UI atlas resources retain cutout semantics without an official template id', () => {
  const { document, atlas } = fixture();
  atlas.uiAtlasGroup = 'icons';
  atlas.generation = { prompt: 'test', uiAtlasPlan: selectedUiAtlasPlan(document, atlas) };
  const assets: CanvasNode = {
    id: createId(),
    type: 'image-assets',
    title: 'resources',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
  };
  document.nodes.push(assets);
  document.edges.push({ id: createId(), from: atlas.id, to: assets.id, kind: 'image-assets' });
  expect(isGameUiResource(document, assets)).toBe(true);
  atlas.uiAtlasPrelayout = true;
  expect(isGameUiResource(document, assets)).toBe(false);
  delete atlas.uiAtlasPrelayout;
  delete atlas.uiAtlasGroup;
  expect(isGameUiResource(document, assets)).toBe(false);
});

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

test('automatic batch plans use current recognition instead of stale example slots', () => {
  const { document, atlas, clean } = fixture();
  atlas.uiAtlasPlan = selectedUiAtlasPlan(document, atlas);
  atlas.uiAtlasGroup = 'controls';
  const bbox = clean.uiRecognition!.results[0].bbox!;
  bbox.elements[0].id = 'E999';
  bbox.texts.forEach((text) => {
    text.parentId = 'E999';
  });
  const plan = selectedUiAtlasPlan(document, atlas)!;
  expect(
    plan.slots.filter((slot) => slot.role === 'element').map((slot) => slot.elementIds)
  ).toEqual([['E999'], ['E999']]);
  expect(uiAtlasOrderPrompt(plan)).toContain('E999');
  expect(uiAtlasOrderPrompt(plan)).not.toContain('E001');
  expect(uiBatchAtlasPrompt('controls')).not.toContain('E001');
  expect(uiBatchAtlasPrompt('controls').indexOf('每格只放')).toBeLessThan(
    uiBatchAtlasPrompt('controls').indexOf('不要按参考图')
  );
  expect(uiBatchAtlasPrompt('panels')).toContain('不要画角色');
  expect(uiBatchAtlasPrompt('controls')).toContain('5 列 × 5 行');
  clean.templatePending = true;
  expect(() => selectedUiAtlasPlan(document, atlas)).toThrow('请先完成');
});

test('splits a large sheet into 5 by 5 pages without reordering slots', () => {
  const bbox = bboxFixture();
  bbox.texts = [];
  bbox.elements = Array.from({ length: 26 }, (_, index) => ({
    id: 'E' + String(index + 1).padStart(3, '0'),
    name: '底板' + (index + 1),
    type: 'title' as const,
    bbox: [10, 10, 80, 80] as [number, number, number, number],
    parent: null,
  }));
  const plans = uiBatchAtlasPlans(bbox, 'controls');
  expect(plans).toHaveLength(2);
  expect(plans.every((plan) => plan.grid.columns <= 5 && plan.grid.rows <= 5)).toBe(true);
  expect(plans[0].slots.filter((slot) => slot.role === 'element')).toHaveLength(25);
  expect(plans[1].slots[0].elementIds).toEqual(['E026']);
  expect(uiAtlasOrderPrompt(plans[0])).toContain('不是输出位置');
});

test('foreground slots exclude backing panels while control slots retain only their base', () => {
  const bbox = bboxFixture();
  bbox.elements = [
    { id: 'E001', name: '人物', type: 'icon', bbox: [0, 0, 30, 90], parent: null },
    { id: 'E002', name: '按钮', type: 'button', bbox: [40, 0, 50, 20], parent: null },
  ];
  bbox.texts = [];
  expect(uiAtlasOrderPrompt(uiBatchAtlasPlan(bbox, 'artwork'))).toContain('不添加任何外框');
  expect(uiAtlasOrderPrompt(uiBatchAtlasPlan(bbox, 'controls'))).toContain('移除覆盖的图标');
  expect(uiBatchAtlasPrompt('artwork')).not.toContain('并补上底色');
});

test('empty batch categories have only reserved slots and background remains explicit', () => {
  const bbox = bboxFixture();
  expect(uiBatchAtlasPlan(bbox, 'icons').slots).toEqual([
    { elementIds: [], state: 'normal', role: 'reserve' },
  ]);
  expect(uiBatchAtlasPlan(bbox, 'background').slots).toEqual([
    { elementIds: [], state: 'normal', role: 'background' },
  ]);
});

test('mixed-shape panel slots have separate output bounds and independent scaling', () => {
  const bbox = bboxFixture();
  bbox.texts = [];
  bbox.elements = [
    { id: 'E001', name: '导航长条', type: 'panel', bbox: [0, 0, 90, 4], parent: null },
    { id: 'E002', name: '竖面板', type: 'panel', bbox: [10, 10, 20, 70], parent: null },
  ];
  const plans = uiBatchAtlasPlans(bbox, 'panels');
  expect(plans).toHaveLength(2);
  const plan = plans[0];
  expect(plan.grid).toMatchObject({ columns: 1, rows: 1 });
  const prompt = uiAtlasOrderPrompt(plan);
  expect(prompt).toContain('左 10.00%，上 10.00%，右 90.00%，下 90.00%');
  expect(plans.flatMap((item) => item.slots.flatMap((slot) => slot.elementIds)).sort()).toEqual([
    'E001',
    'E002',
  ]);
  expect(uiBatchAtlasPrompt('panels')).toContain('允许各格缩放倍率不同');
  expect(uiBatchAtlasPrompt('icons')).not.toContain('不要画四角装饰');
  expect(uiBatchAtlasPrompt('icons')).toContain('清单指定的装饰本身应完整提取');
});

test('wide strips use one-column sheets, and different source sizes stay separate', () => {
  const bbox = bboxFixture();
  bbox.texts = [];
  bbox.elements = Array.from({ length: 6 }, (_, index) => ({
    id: 'E' + String(index + 1).padStart(3, '0'),
    name: '进度条',
    type: 'frame' as const,
    bbox: [0, 0, 80, 8] as [number, number, number, number],
    parent: null,
  }));
  bbox.elements.push({ id: 'E007', name: '小条', type: 'frame', bbox: [0, 0, 8, 1], parent: null });
  const plans = uiBatchAtlasPlans(bbox, 'controls');
  expect(plans).toHaveLength(3);
  expect(plans[0].grid).toMatchObject({ columns: 1, rows: 5 });
  expect(uiAtlasOrderPrompt(plans[0])).toContain('主体目标宽 80.00%、高 8.00%');
  expect(uiAtlasOrderPrompt(plans[0], 2)).toContain('主体目标宽 80.00%、高 16.00%');
  expect(uiBatchAtlasPrompt('panels')).toContain('游戏素材约束：');
  expect(plans[2].slots[0].elementIds).toEqual(['E007']);
});

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

test('completed historical batches keep their frozen slots instead of adding duplicate size batches', () => {
  const { document, atlas, clean } = fixture();
  atlas.uiAtlasGroup = 'panels';
  const bbox = clean.uiRecognition!.results[0].bbox!;
  bbox.texts = [];
  bbox.elements = [
    { id: 'E001', name: '长条', type: 'panel', bbox: [0, 0, 90, 4], parent: null },
    { id: 'E002', name: '竖面板', type: 'panel', bbox: [10, 10, 20, 70], parent: null },
  ];
  const old = validateUiAtlasPlan({
    version: 1,
    bbox,
    grid: { columns: 2, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
    slots: bbox.elements.map((item) => ({
      elementIds: [item.id],
      state: 'normal',
      role: 'element',
    })),
  });
  atlas.generation = { prompt: 'old atlas', uiAtlasPlan: old };
  expect(uiBatchAtlasPlans(bbox, 'panels')).toHaveLength(2);
  const before = JSON.stringify(document);
  expect(selectedUiAtlasPlan(document, atlas)).toEqual(old);
  expect(ensureUiAtlasBatchCards(document)).toBe(false);
  expect(JSON.stringify(document)).toBe(before);
  // A partial old layout cannot be mixed with a newly packed remainder.
  old.slots[1] = { elementIds: [], state: 'normal', role: 'reserve' };
  const partial = JSON.stringify(document);
  expect(() => selectedUiAtlasPlan(document, atlas)).toThrow('旧批次尚不完整');
  expect(() => ensureUiAtlasBatchCards(document)).toThrow('旧批次尚不完整');
  expect(JSON.stringify(document)).toBe(partial);
  // Fresh recognition invalidates the old identity and uses the current planner.
  bbox.elements[0].name = '新的长条';
  expect(selectedUiAtlasPlan(document, atlas)).toEqual(uiBatchAtlasPlans(bbox, 'panels')[0]);
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

test('duplicate instances share both button states without losing any instance binding', () => {
  const bbox = bboxFixture();
  bbox.elements.push({
    ...bbox.elements[0],
    id: 'E002',
    bbox: [10, 80, 80, 40],
    duplicateOf: 'E001',
  });
  const plan = uiBatchAtlasPlan(bbox, 'controls');
  expect(plan.slots).toEqual([
    { elementIds: ['E001', 'E002'], state: 'normal', role: 'element' },
    { elementIds: ['E001', 'E002'], state: 'pressed', role: 'element' },
  ]);
});

test('24 repeated stars export one PNG and 24 explicit bindings without merging colored frames', async () => {
  const { document, atlas, clean } = fixture();
  const bbox = clean.uiRecognition!.results[0].bbox!;
  bbox.texts = [];
  bbox.elements = Array.from({ length: 24 }, (_, index) => ({
    id: 'E' + String(index + 1).padStart(3, '0'),
    name: '金色五角星',
    type: 'icon' as const,
    bbox: [(index % 8) * 10, Math.floor(index / 8) * 10, 8, 8] as [number, number, number, number],
    parent: null,
    ...(index ? { duplicateOf: 'E001' } : {}),
  }));
  atlas.uiAtlasGroup = 'icons';
  const plan = selectedUiAtlasPlan(document, atlas)!;
  expect(plan.slots).toHaveLength(1);
  expect(plan.slots[0].elementIds).toHaveLength(24);
  atlas.generation = { prompt: 'test', uiAtlasPlan: plan };
  const member: CanvasNode = {
    ...atlas,
    id: createId(),
    type: 'image-assets',
    generation: undefined,
    imageAssetsInfo: {
      width: 32,
      height: 32,
      grid: plan.grid,
      uiBindingReview: 'confirmed',
      items: [{ name: 'star', width: 8, height: 8, assetPath: atlas.assetPath! }],
    },
  };
  document.nodes.push(member);
  document.edges.push({ id: createId(), from: atlas.id, to: member.id, kind: 'image-assets' });
  const result = (await uiBundleManifest(
    document,
    [member],
    [{ name: 'icons/star.png', blob: new Blob(['png']) }]
  ))!;
  expect(result.manifest.assets).toHaveLength(1);
  expect(result.manifest.bindings).toHaveLength(24);
  expect(new Set(result.manifest.bindings.map((binding) => binding.assetId)).size).toBe(1);
  expect(result.manifest.missingElementIds).toEqual([]);
  expect(result.manifest.confirmed).toBe(true);
  bbox.elements.push(
    { id: 'E025', name: '紫色装备框', type: 'frame', bbox: [0, 40, 10, 10], parent: null },
    { id: 'E026', name: '金色装备框', type: 'frame', bbox: [20, 40, 10, 10], parent: null }
  );
  expect(uiBatchAtlasPlan(bbox, 'equipment').slots.map((slot) => slot.elementIds)).toEqual([
    ['E025'],
    ['E026'],
  ]);
});
