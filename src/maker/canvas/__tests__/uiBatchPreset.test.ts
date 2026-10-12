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

const id = '7e1cb6ad-732f-4dc3-a951-000000000013';

test('official UI catalog replaces the classified preset with the batch workflow', () => {
  const official = builtinCanvasTemplates().filter((item) => item.name === '游戏UI制作');
  expect(official.map((item) => item.id)).toEqual([id]);
  expect(builtinCanvasTemplates().some((item) => item.id.endsWith('000012'))).toBe(false);
  expect(canvasPresets().some((item) => item.id.endsWith('000012'))).toBe(false);
  const template = official[0];
  expect(template.nodes).toHaveLength(18);
  expect(template.skills).toEqual(['maker-ui-workflow']);
  const design = template.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
  const cut = template.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
  const original = template.nodes.find((node) => node.title === '① 原始设计稿')!;
  expect(template.edges.filter((edge) => edge.to === design.id).map((edge) => edge.from)).toEqual([
    original.id,
  ]);
  expect(design.title).toBe('② 原稿与识图输入');
  expect(cut.uiRecognition?.results[0].bbox?.elements).toHaveLength(103);
  expect(cut.uiRecognition?.results[0].bbox?.texts).toHaveLength(51);
  for (const node of template.nodes.filter((node) => node.uiAtlasGroup)) {
    expect(node.generation?.prompt).toBe(node.uiBaselinePrompt);
    expect(node.generation?.prompt).not.toMatch(/E[0-9]{3}|1920x1080|2048x1152/);
    expect(node.generation?.prompt).toContain('重复素材只输出一次');
    expect(node.uiBaselineGrid).toEqual(node.uiAtlasPlan?.grid);
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
    expect(design.templatePending).toBe(true);
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
    expect(fallback).not.toHaveBeenCalled();
    expect(design.templatePending).toBeUndefined();
    // Recognition becomes available after the existing image step completes.
    delete cut.templatePending;
    delete design.templatePending;
    expect(uiRecognitionInputs(reopened, cut).design.id).toBe(design.id);
    const fresh = structuredClone(
      prepared.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!.uiRecognition!
        .results[0]
    );
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
      cut.uiRecognition = structuredClone(
        prepared.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!.uiRecognition
      );
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
