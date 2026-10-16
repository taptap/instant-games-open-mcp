import { randomUUID } from 'node:crypto';
import { emptyDocument, type CanvasNode } from '../model.js';
import { canvasNeedsProcessing, createTemplateWorkflow } from '../templateWorkflow.js';
import { createUiRecognitionUi } from '../uiRecognitionUi.js';
import { snapshotCanvasSource } from '../dependencies.js';
import { createCanvasGroupQueue } from '../groupQueue.js';
import {
  validateUiElements,
  validateUiRecognition,
  uiRecognitionNote,
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

test.each(['continue', 'query', 'decline', 'custom', 'cli-run', 'cli-continue'])(
  'pending recognition recovery preserves the original request and respects %s',
  async (action) => {
    const document = emptyDocument();
    const recognized = result();
    const source: CanvasNode = {
      id: randomUUID(),
      type: 'image',
      title: '识图',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      assetPath: recognized.sourcePath,
      uiRecognition: { enabled: true, pendingId: recognized.id, results: [] },
    };
    document.nodes.push(source);
    const attempt = {
      id: recognized.id,
      model: 'original-model',
      status: 'unknown',
      recovery: action === 'custom' ? undefined : { width: 1080, height: 1920 },
    };
    const submit = jest.fn(async () => ({ status: 'succeeded', result: recognized }));
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = { confirm: jest.fn(() => action !== 'decline') };
    try {
      const controller = createUiRecognitionUi({
        current: () => document,
        store: { recognitionStatus: async () => attempt, recognizeUi: submit } as any,
        save: async () => true,
        remember() {},
        changed() {},
        render() {},
        blocked: () => false,
        error() {},
        loadMedia: async () => {},
        openCanvas: async () => {},
      });
      const run =
        action === 'query'
          ? controller.query(source.id)
          : action === 'cli-continue'
            ? controller.runRecognition(source, true, true)
            : controller.runImage(source.id, async () => true, action === 'cli-run');
      if (action === 'continue' || action === 'cli-continue') {
        await run;
        expect(submit).toHaveBeenCalledWith(
          document.id,
          expect.objectContaining({
            id: recognized.id,
            nodeId: source.id,
            model: 'original-model',
            recover: true,
            allowPaid: true,
          })
        );
        expect(source.uiRecognition!.pendingId).toBeUndefined();
      } else {
        await expect(run).rejects.toThrow('识图仍在执行');
        expect(submit).not.toHaveBeenCalled();
        expect(source.uiRecognition!.pendingId).toBe(recognized.id);
      }
      expect((globalThis as any).window.confirm).toHaveBeenCalledTimes(
        action === 'continue' || action === 'decline' ? 1 : 0
      );
    } finally {
      (globalThis as any).window = previousWindow;
    }
  }
);

test('server credits survive result validation and appear once in the note', () => {
  const record = { ...result(), credits: 8 };
  const settings = validateUiRecognition({ enabled: true, results: [record] });
  expect(settings?.results[0].credits).toBe(8);
  expect(uiRecognitionNote(settings!.results[0])).toContain('8 积分');
  expect(() =>
    validateUiRecognition({ enabled: true, results: [{ ...record, credits: -1 }] })
  ).toThrow('识图记录');
});

test.each([true, false])(
  'queued text removal includes recognition and blocks downstream on failure: %s',
  async (succeeded) => {
    const document = emptyDocument();
    const recognition = result();
    const source: CanvasNode = {
      id: 'cut',
      type: 'image',
      title: '去文字',
      sectionId: 'group',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      assetPath: 'old.png',
      templatePending: true,
      uiRecognition: { enabled: true, inputRole: 'text-free', results: [] },
    };
    document.nodes = [
      {
        ...source,
        id: 'group',
        type: 'section',
        uiRecognition: undefined,
        sectionId: undefined,
        templatePending: undefined,
      },
      source,
      { ...source, id: 'atlas', uiRecognition: undefined },
    ];
    document.edges = [{ id: 'edge', from: source.id, to: 'atlas', kind: 'image-variant' }];
    const events: string[] = [];
    let clock = 1000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) } as Response);
    const previousBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = jest.fn(
      async () => ({ width: 1080, height: 1920, close() {} }) as ImageBitmap
    );
    const controller = createUiRecognitionUi({
      current: () => document,
      store: {
        mediaUrl: () => 'http://localhost/image',
        recognitionModels: async () => [{ id: 'custom', model: 'custom', source: 'custom' }],
        recognizeUi: async () => {
          events.push('recognize');
          clock += 2000;
          if (!succeeded) throw new Error('识图失败');
          return { status: 'succeeded', result: recognition };
        },
      } as any,
      save: async () => true,
      remember: () => {},
      changed: () => {},
      render: () => {},
      blocked: () => false,
      error: () => {},
      loadMedia: async () => {},
      openCanvas: async () => {},
    });
    const workflow = createTemplateWorkflow({
      getDocument: () => document,
      save: async () => true,
      changed: () => {},
      render: () => {},
      error: () => {},
      confirm: () => true,
      video: async () => false,
      sequence: async () => {},
      animation: () => {},
      select: () => {},
      importImage: () => {},
      image: (id, automatic) =>
        controller.runImage(
          id,
          async () => {
            events.push(id);
            clock += 1000;
            if (id === source.id) {
              source.assetPath = recognition.sourcePath;
              delete source.templatePending;
            }
            return true;
          },
          true,
          automatic
        ),
    });
    const queue = createCanvasGroupQueue({
      getDocument: () => document,
      needs: (id) => workflow.status(id) === 'pending',
      busy: () => workflow.isBusy,
      run: workflow.runQueued,
      save: async () => true,
      confirm: () => true,
      changed: () => {},
      error: () => {},
    });
    try {
      queue.start('group');
      await new Promise((resolve) => setImmediate(resolve));
      expect(workflow.failure('cut')).toBe(succeeded ? undefined : '识图失败');
      expect(events).toEqual(succeeded ? ['cut', 'recognize', 'atlas'] : ['cut', 'recognize']);
      expect(source.workDurationMs).toBe(3000);
      expect(document.nodes[0].workDurationMs).toBe(succeeded ? 4000 : 3000);
      expect(queue.view('group')?.phase).toBe(succeeded ? 'complete' : 'paused');
    } finally {
      queue.stop('group');
      now.mockRestore();
      fetcher.mockRestore();
      globalThis.createImageBitmap = previousBitmap;
    }
  }
);

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

test('replacing a design source updates both snapshot forms before continuing', async () => {
  const document = emptyDocument();
  const source: CanvasNode = {
    id: randomUUID(),
    type: 'image',
    title: 'new design',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    assetPath: result().sourcePath,
  };
  const oldSnapshot = snapshotCanvasSource({ ...source, assetPath: result().sourcePath });
  const design: CanvasNode = {
    ...source,
    id: randomUUID(),
    templatePending: true,
    sourceSnapshot: oldSnapshot,
    sourceSnapshots: [oldSnapshot!],
    uiRecognition: { enabled: true, inputRole: 'design', results: [] },
  };
  document.nodes.push(source, design);
  document.edges.push({ id: randomUUID(), from: source.id, to: design.id, kind: 'image-variant' });
  const fallback = jest.fn(async () => true);
  const controller = createUiRecognitionUi({
    current: () => document,
    store: {} as any,
    save: async () => true,
    remember() {},
    changed() {},
    render() {},
    blocked: () => false,
    error() {},
    loadMedia: async () => {},
    openCanvas: async () => {},
  });
  expect(await controller.runImage(design.id, fallback)).toBe(true);
  expect(fallback).not.toHaveBeenCalled();
  expect(design.sourceSnapshots).toEqual([snapshotCanvasSource(source)]);
  expect(canvasNeedsProcessing(document, design)).toBe(false);
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
