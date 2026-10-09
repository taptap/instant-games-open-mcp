import { randomUUID } from 'node:crypto';
import { emptyDocument, type CanvasNode } from '../model.js';
import { canvasNeedsProcessing, createTemplateWorkflow } from '../templateWorkflow.js';
import { createUiRecognitionUi } from '../uiRecognitionUi.js';
import { snapshotCanvasSource } from '../dependencies.js';
import {
  validateUiElements,
  validateUiRecognition,
  selectedUiRecognition,
  uiRecognitionStatus,
  setUiRecognitionMode,
  uiExtractionPlan,
  type UiElement,
  type UiRecognitionResult,
} from '../uiRecognition.js';

const element = (id: string): UiElement => ({
  id,
  name: '黄色购买按钮',
  category: 'action',
  rect: [10, 20, 100, 50],
  parentId: null,
  zIndex: 1,
  states: ['normal'],
  cutout: true,
});
const result = (): UiRecognitionResult => ({
  id: randomUUID(),
  model: 'model-a',
  prompt: 'same prompt',
  createdAt: new Date().toISOString(),
  durationMs: 1200,
  sourcePath: 'assets/image/canvas-' + randomUUID() + '.png',
  sourceSha256: 'a'.repeat(64),
  width: 1080,
  height: 1920,
  elements: ['B32', 'B34', 'B36'].map(element),
});

test('all button IDs survive into extraction slots and count, instead of the example 2x2', () => {
  const plan = uiExtractionPlan(result(), 'action');
  expect(plan.grid).toMatchObject({ columns: 3, rows: 2 });
  expect(plan.slots.map((slot) => slot.elementId)).toEqual([
    'B32',
    'B34',
    'B36',
    'B32',
    'B34',
    'B36',
  ]);
  for (const id of ['B32', 'B34', 'B36']) expect(plan.prompt).toContain(id);
});

test('invalid, empty, duplicate, out-of-bounds and cyclic results cannot be used', () => {
  const invalid = [
    [],
    [element('B1'), element('B1')],
    [{ ...element('B1'), rect: [1000, 0, 100, 20] }],
    [{ ...element('B1'), parentId: 'B2' }],
    [{ ...element('B1'), parentId: 'B1' }],
  ];
  for (const values of invalid) expect(() => validateUiElements(values, 1080, 1920)).toThrow();
});

test('model results are independent and a replaced design cannot reuse old recognition', () => {
  const a = result();
  const b = { ...a, id: randomUUID(), model: 'model-b', elements: [element('C1')] };
  const settings = validateUiRecognition({ enabled: true, selectedId: a.id, results: [a, b] });
  const node = { assetPath: a.sourcePath, uiRecognition: settings } as CanvasNode;
  expect(selectedUiRecognition(node)?.elements).toHaveLength(3);
  settings.selectedId = b.id;
  expect(selectedUiRecognition(node)?.elements).toHaveLength(1);
  node.assetPath = 'assets/image/canvas-' + randomUUID() + '.png';
  expect(selectedUiRecognition(node)).toBeUndefined();
});

test('recognition status distinguishes disabled, missing, pending, ready and replaced originals', () => {
  const a = result();
  const node = {
    assetPath: a.sourcePath,
    uiRecognition: { enabled: false, results: [a], selectedId: a.id },
  } as CanvasNode;
  expect(uiRecognitionStatus(node).status).toBe('disabled');
  node.uiRecognition!.enabled = true;
  expect(uiRecognitionStatus(node)).toMatchObject({ status: 'ready', label: '3 个元素' });
  expect(uiRecognitionStatus(node).text).toContain('B36');
  node.uiRecognition!.pendingId = 'pending';
  expect(uiRecognitionStatus(node).status).toBe('pending');
  delete node.uiRecognition!.pendingId;
  node.assetPath = 'replacement.png';
  expect(uiRecognitionStatus(node).status).toBe('not-ready');
  expect(uiRecognitionStatus(node).text).not.toContain('B36');
  expect(uiRecognitionStatus().status).toBe('unavailable');
});

test('off bypasses recognition; toggling marks dependents pending without dropping results or moving canvas', () => {
  const document = emptyDocument();
  const a = result();
  const source: CanvasNode = {
    id: randomUUID(),
    type: 'image',
    title: '原稿',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    sectionId: randomUUID(),
    assetPath: a.sourcePath,
    uiRecognition: { enabled: false, results: [a] },
  };
  const target: CanvasNode = {
    ...source,
    id: randomUUID(),
    title: '切图',
    uiRecognition: undefined,
    sourceSnapshot: snapshotCanvasSource(source),
  };
  document.nodes.push(source, target);
  document.edges.push({ id: randomUUID(), from: source.id, to: target.id, kind: 'image-variant' });
  const viewport = { ...document.viewport };
  expect(canvasNeedsProcessing(document, source)).toBe(false);
  setUiRecognitionMode(document, source, true);
  expect(canvasNeedsProcessing(document, source)).toBe(true);
  expect(target.templatePending).toBe(true);
  setUiRecognitionMode(document, source, false);
  expect(canvasNeedsProcessing(document, source)).toBe(false);
  expect(source.uiRecognition?.results).toHaveLength(1);
  expect(document.viewport).toEqual(viewport);
});

test('no elements in a category means no cutouts, not invented filler', () => {
  expect(uiExtractionPlan(result(), 'icon').slots).toEqual([]);
});

test('observed selected states are preserved in addition to the template default/pressed pair', () => {
  const recognized = result();
  recognized.elements[0].states.push('selected');
  const plan = uiExtractionPlan(recognized, 'action');
  expect(plan.grid.rows).toBe(3);
  expect(plan.slots.some((slot) => slot.elementId === 'B32' && slot.state === 'selected')).toBe(
    true
  );
});

test('an empty branch completes through the real template executor without exporting old example assets', async () => {
  const document = emptyDocument();
  const recognized = result();
  const groupId = randomUUID();
  const source: CanvasNode = {
    id: randomUUID(),
    type: 'image',
    title: '原稿',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    sectionId: groupId,
    assetPath: recognized.sourcePath,
    uiRecognition: { enabled: true, selectedId: recognized.id, results: [recognized] },
  };
  const atlas: CanvasNode = {
    ...source,
    id: randomUUID(),
    title: 'Icon',
    uiRecognition: undefined,
    uiExtraction: 'icon',
    templatePending: true,
  };
  const assets: CanvasNode = {
    ...atlas,
    id: randomUUID(),
    type: 'image-assets',
    uiExtraction: undefined,
    assetPath: undefined,
  };
  document.nodes.push(
    {
      id: groupId,
      type: 'section',
      templateId: randomUUID(),
      title: 'UI',
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    },
    source,
    atlas,
    assets
  );
  document.edges.push(
    { id: randomUUID(), from: source.id, to: atlas.id, kind: 'image-variant' },
    { id: randomUUID(), from: atlas.id, to: assets.id, kind: 'image-assets' }
  );
  const fallback = jest.fn(async () => {
    throw new Error('empty categories must not generate/export');
  });
  const controller = createUiRecognitionUi({
    current: () => document,
    store: {} as any,
    save: async () => true,
    remember: () => {},
    changed: () => {},
    render: () => {},
    blocked: () => false,
    error: () => {},
    loadMedia: async () => {},
    openCanvas: async () => {},
  });
  const errors: string[] = [];
  const workflow = createTemplateWorkflow({
    getDocument: () => document,
    save: async () => true,
    changed: () => {},
    render: () => {},
    error: (value) => errors.push(value),
    confirm: () => true,
    video: async () => false,
    sequence: async () => {},
    animation: () => {},
    select: () => {},
    importImage: () => {},
    image: (id) => controller.runImage(id, fallback),
    assets: (id) => controller.runAssets(id, fallback),
  });
  expect(await workflow.runQueued(atlas.id)).toBe(true);
  expect(await workflow.runQueued(assets.id)).toBe(true);
  expect(errors).toEqual([]);
  expect(fallback).not.toHaveBeenCalled();
  expect(assets.uiEmpty).toBe(true);
  expect(assets.imageAssetsInfo).toBeUndefined();
  expect(canvasNeedsProcessing(document, assets)).toBe(false);
});
