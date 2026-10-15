import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canvasPresets, builtinCanvasTemplates } from '../presets.js';
import { createCanvasTemplateModel } from '../templates.js';
import { MakerCanvasFiles } from '../files.js';
import { uiRecognitionInputs, selectedUiRecognition } from '../uiRecognition.js';
import { invalidateCanvasDependents } from '../templateWorkflow.js';
import { createUiRecognitionUi } from '../uiRecognitionUi.js';
import type { CanvasDocumentStore } from '../store.js';
import { ensureUiAtlasBatchCards, selectedUiAtlasPlan } from '../uiAssetBindings.js';
import { batchRecognitionFixture } from './fixtures/uiRecognition.js';

const id = '7e1cb6ad-732f-4dc3-a951-000000000013';

test('official UI catalog keeps the prompt-only workflow alongside the Bbox experiment', () => {
  const official = builtinCanvasTemplates().filter((item) => item.name.startsWith('游戏UI制作'));
  expect(official.map((item) => item.name)).toEqual([
    '游戏UI制作',
    '游戏UI制作 · Bbox预排参考图（实验）',
  ]);
  expect(official.map((item) => item.id)).toEqual([id, '7e1cb6ad-732f-4dc3-a951-000000000015']);
  expect(builtinCanvasTemplates().some((item) => item.id.endsWith('000012'))).toBe(false);
  expect(canvasPresets().some((item) => item.id.endsWith('000012'))).toBe(false);
  const template = canvasPresets().find((item) => item.id === id)!;
  expect(template.nodes).toHaveLength(20);
  expect(template.skills).toBeUndefined();
  const design = template.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
  const cut = template.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
  const original = template.nodes.find((node) => node.title === '① 原始设计稿')!;
  expect(design.id).toBe(original.id);
  expect(cut.uiRecognition?.optional).toBe(true);
  expect(cut.uiRecognition?.results).toEqual([]);
  for (const node of template.nodes.filter((node) => node.uiAtlasGroup)) {
    expect(node.generation?.prompt).toBe(node.uiBaselinePrompt);
    if (node.uiAtlasGroup === 'background') {
      expect(node.generation?.cutoutColor).toBeUndefined();
      expect(node.generation?.prompt).toContain('铺满整个画幅');
    } else {
      expect(node.generation?.cutoutColor).toBe('transparent');
      expect(node.generation?.prompt).toContain('真实 Alpha 通道');
    }
    expect(node.generation?.prompt).not.toMatch(/背景使用纯|抠图底色约定/);
    expect(node.generation?.prompt).not.toMatch(/E[0-9]{3}|1920x1080|2048x1152/);
    if (node.uiAtlasGroup !== 'background')
      expect(node.generation?.prompt).toContain('重复素材只输出一次');
    expect(node.uiAtlasPlan).toBeUndefined();
    expect(node.uiBaselineGrid).toBeDefined();
  }
  expect(template.edges.filter((edge) => edge.to === cut.id).map((edge) => edge.from)).toEqual([
    design.id,
  ]);
  for (const node of template.nodes.filter(
    (node) => node.type === 'image' && node.id !== design.id && node.id !== original.id
  )) {
    expect(node.generation?.prompt || node.generationDraft?.prompt).toBeTruthy();
  }
});

test('batch preset imports, saves and reopens with one ready original and pending outputs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-batch-'));
  try {
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create('UI batch');
    const prepared = await files.prepareTemplate(id, canvas.id);
    const instance = createCanvasTemplateModel().instantiate(prepared, { x: 0, y: 0 });
    const saved = await files.save(
      canvas.id,
      { ...canvas, nodes: instance.nodes, edges: instance.edges },
      canvas.revision
    );
    const reopened = await files.load(saved.id);
    const design = reopened.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
    const cut = reopened.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
    expect(design.templatePending).toBeUndefined();
    expect(cut.templatePending).toBe(true);
    expect(cut.uiRecognition?.results).toHaveLength(0);
    expect(reopened.nodes.filter((node) => node.uiAtlasGroup)).toHaveLength(6);
    expect(
      reopened.nodes.filter((node) => node.uiAtlasGroup).every((node) => !node.uiAtlasPlan)
    ).toBe(true);
    expect(selectedUiRecognition(cut)).toBeUndefined();
    const fallback = jest.fn(async () => true);
    const recognitionUi = createUiRecognitionUi({
      current: () => reopened,
      store: {} as CanvasDocumentStore,
      save: async () => true,
      remember: () => {},
      changed: () => {},
      render: () => {},
      blocked: () => false,
      error: () => {},
      loadMedia: async () => {},
      openCanvas: async () => {},
    });
    expect(await recognitionUi.runImage(design.id, fallback)).toBe(true);
    expect(fallback).toHaveBeenCalled();
    expect(design.templatePending).toBeUndefined();
    // Recognition becomes available after the existing image step completes.
    delete cut.templatePending;
    delete design.templatePending;
    expect(uiRecognitionInputs(reopened, cut).design.id).toBe(design.id);
    const fresh = batchRecognitionFixture(design, cut);
    fresh.sourceSha256 = 'a'.repeat(64);
    fresh.bbox!.cutSource.sha256 = fresh.sourceSha256;
    const rename = (id: string) => 'E9' + id.slice(1);
    for (const element of fresh.bbox!.elements) {
      element.id = rename(element.id);
      if (element.parent) element.parent = rename(element.parent);
    }
    for (const text of fresh.bbox!.texts) if (text.parentId) text.parentId = rename(text.parentId);
    cut.uiRecognition!.results = [fresh];
    cut.uiRecognition!.selectedId = fresh.id;
    expect(ensureUiAtlasBatchCards(reopened)).toBe(false);
    expect(
      selectedUiAtlasPlan(reopened, reopened.nodes.find((node) => node.uiAtlasGroup)!)
    ).toBeUndefined();
    cut.uiRecognition!.optional = false;
    ensureUiAtlasBatchCards(reopened);
    const plans = reopened.nodes
      .filter((node) => node.uiAtlasGroup)
      .map((node) => selectedUiAtlasPlan(reopened, node)!);
    const assigned = new Set(
      plans.flatMap((plan) => plan.slots.flatMap((slot) => slot.elementIds))
    );
    expect([...assigned].sort()).toEqual(fresh.bbox!.elements.map((element) => element.id).sort());
    expect(plans.every((plan) => plan.bbox.cutSource.sha256 === fresh.sourceSha256)).toBe(true);
    for (const node of reopened.nodes) delete node.templatePending;
    invalidateCanvasDependents(
      reopened,
      reopened.nodes.find((node) => node.title === '① 原始设计稿')!.id
    );
    expect(cut.templatePending).toBe(true);
    expect(
      reopened.nodes
        .filter((node) => node.type === 'image-assets')
        .every((node) => node.templatePending)
    ).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);

test('browser helpers expand only the requested instance and preserve generation and bundle wiring', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-page-batches-'));
  try {
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create('batches');
    const prepared = await files.prepareTemplate(id, canvas.id);
    const instances = [0, 3000].map((x) =>
      createCanvasTemplateModel().instantiate(prepared, { x, y: 0 })
    );
    for (const instance of instances) {
      canvas.nodes.push(...instance.nodes);
      canvas.edges.push(...instance.edges);
      const cut = instance.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
      const design = instance.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
      const result = batchRecognitionFixture(design, cut);
      cut.uiRecognition = {
        ...cut.uiRecognition!,
        optional: false,
        results: [result],
        selectedId: result.id,
      };
      for (const node of instance.nodes.filter((node) => node.uiRecognition))
        delete node.templatePending;
    }
    const { getCanvasPageHtml } = await import('../page.js');
    const vm = await import('node:vm');
    const crypto = await import('node:crypto');
    const html = getCanvasPageHtml();
    const start = html.indexOf('const UI_CUT_TYPES');
    const helpers = html
      .slice(start, html.indexOf('(function ()', start))
      .replace(/\b[A-Za-z0-9_]+_js_\d+\./g, '')
      .replace(/\bexports\./g, '');
    const groupId = instances[0].nodes.find((node) => node.type === 'section')!.id;
    const context = { canvas, groupId, crypto, structuredClone };
    expect(vm.runInNewContext(helpers + ';ensureUiAtlasBatchCards(canvas, groupId)', context)).toBe(
      true
    );
    const added = canvas.nodes.filter((node) => (node.uiAtlasBatch || 0) > 0);
    expect(added.length).toBeGreaterThan(0);
    for (const image of added) {
      expect(image.sectionId).toBe(groupId);
      expect(image.generationDraft?.prompt).toBeTruthy();
      expect(image.generationDraft?.parameters?.model).toBeTruthy();
      expect(image.generation).toBeUndefined();
      const assetEdge = canvas.edges.find(
        (edge) => edge.from === image.id && edge.kind === 'image-assets'
      )!;
      expect(
        canvas.edges.some(
          (edge) =>
            edge.from === assetEdge.to &&
            canvas.nodes.find((node) => node.id === edge.to)?.type === 'resource-bundle'
        )
      ).toBe(true);
    }
    expect(vm.runInNewContext('ensureUiAtlasBatchCards(canvas, groupId)', context)).toBe(false);
    const second = instances[1].nodes.find((node) => node.type === 'section')!.id;
    expect(ensureUiAtlasBatchCards(canvas, second)).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);

test('a ninth size-aware atlas batch survives save and reopen', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-nine-batches-'));
  try {
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create('nine batches');
    const prepared = await files.prepareTemplate(id, canvas.id);
    const instance = createCanvasTemplateModel().instantiate(prepared, { x: 0, y: 0 });
    canvas.nodes = instance.nodes;
    canvas.edges = instance.edges;
    const cut = canvas.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
    const design = canvas.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
    const result = batchRecognitionFixture(design, cut);
    cut.uiRecognition = {
      ...cut.uiRecognition!,
      optional: false,
      results: [result],
      selectedId: result.id,
    };
    const original = result.bbox!.elements.find((element) => element.type === 'icon')!;
    result.bbox!.elements = Array.from({ length: 41 }, (_, index) => ({
      ...original,
      id: 'E' + String(index + 1).padStart(3, '0'),
      name: 'long mark ' + index,
      bbox: [0, 0, 200, 20],
      parent: null,
      duplicateOf: undefined,
    }));
    result.bbox!.texts = [];
    cut.uiRecognition.selectedId = result.id;
    for (const node of canvas.nodes.filter((node) => node.uiRecognition))
      delete node.templatePending;
    expect(ensureUiAtlasBatchCards(canvas)).toBe(true);
    const batches = canvas.nodes.filter((node) => node.uiAtlasGroup === 'icons');
    expect(batches.map((node) => node.uiAtlasBatch || 0).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const saved = await files.save(canvas.id, canvas, canvas.revision);
    const reopened = await files.load(saved.id);
    expect(reopened.nodes.find((node) => node.uiAtlasBatch === 8)?.id).toBe(batches[8].id);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
