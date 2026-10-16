import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { imageFeatures, imageAllowsOutpaint, resetImageFeatureCopy } from '../imageFeatures.js';
import { emptyDocument, type CanvasNode } from '../model.js';
import { MakerCanvasFiles } from '../files.js';
import {
  uiRecognitionInputs,
  uiRecognitionPreview,
  selectedUiExtraction,
  validateUiRecognition,
} from '../uiRecognition.js';
import { createCanvasTemplateModel } from '../templates.js';
import { createUiRecognitionUi } from '../uiRecognitionUi.js';

describe('recognition user action recovery', () => {
  const globals = globalThis as any;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  beforeEach(() => {
    for (const name of ['window', 'document', 'fetch', 'createImageBitmap', 'crypto'])
      originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    globals.window = { confirm: jest.fn(() => true) };
    globals.document = {
      createElement: () => ({ getContext: () => ({ scale() {}, drawImage() {} }) }),
    };
    globals.fetch = async () => ({ ok: true, blob: async () => new Blob(['fixture']) });
    globals.createImageBitmap = async () => ({ width: 400, height: 300, close() {} });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID, subtle: webcrypto.subtle },
    });
  });
  afterEach(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globals[name];
    }
  });
  function setup() {
    const state = fixture();
    const hash = createHash('sha256').update('fixture').digest('hex');
    state.result.sourceSha256 = hash;
    state.result.bbox.design.sha256 = hash;
    state.result.bbox.cutSource.sha256 = hash;
    const next = { ...state.result, id: randomUUID() };
    const store = {
      mediaUrl: (value: string) => value,
      recognitionModels: async () => [{ id: 'custom', model: 'custom', source: 'custom' }],
      recognizeUi: jest.fn(async () => ({ status: 'succeeded', result: next })),
      recognitionStatus: jest.fn(async () => ({ status: 'succeeded', result: next })),
    };
    const save = jest.fn(async () => true);
    const changed = jest.fn();
    const controller = createUiRecognitionUi({
      current: () => state.document,
      store: store as any,
      save,
      changed,
      remember: jest.fn(),
      render: jest.fn(),
      blocked: () => false,
      error: jest.fn(),
      loadMedia: async () => {},
      openCanvas: async () => {},
    });
    return { ...state, next, store, save, changed, controller };
  }
  test('selects the new result after recognizing the same image again', async () => {
    const { controller, cut, next, document } = setup();
    await controller.runRecognition(cut);
    expect(cut.uiRecognition!.selectedId).toBe(next.id);
    expect(uiRecognitionPreview(document, cut)?.result.id).toBe(next.id);
  });
  test('available server recognition uses the existing two-pass execution entry', async () => {
    const { controller, cut, store, next } = setup();
    store.recognitionModels = async () => [
      { id: 'gpt-6.1-sol', model: 'gpt-6.1-sol', source: 'server' },
    ];
    await controller.runRecognition(cut);
    expect(store.recognizeUi).toHaveBeenCalledTimes(1);
    expect(cut.uiRecognition!.selectedId).toBe(next.id);
  });
  test.each(['false', 'throw'])('clears an unsubmitted request after save %s', async (failure) => {
    const { controller, cut, store, save, next } = setup();
    if (failure === 'false') save.mockResolvedValueOnce(false);
    else save.mockRejectedValueOnce(new Error('save failed'));
    await expect(controller.runRecognition(cut)).rejects.toThrow();
    expect(cut.uiRecognition!.pendingId).toBeUndefined();
    expect(store.recognizeUi).not.toHaveBeenCalled();
    await controller.runRecognition(cut);
    expect(store.recognizeUi).toHaveBeenCalledTimes(1);
    expect(cut.uiRecognition!.selectedId).toBe(next.id);
  });
  test('clears local waiting when server becomes unavailable before submission', async () => {
    const { controller, cut, store } = setup();
    store.recognizeUi.mockRejectedValueOnce(
      Object.assign(new Error('ChatGPT 网页识图'), { status: 409 })
    );
    await expect(controller.runRecognition(cut)).rejects.toThrow('ChatGPT 网页识图');
    expect(cut.uiRecognition!.pendingId).toBeUndefined();
    expect(store.recognitionStatus).not.toHaveBeenCalled();
  });
  test('starts recognition without an extra confirmation dialog', async () => {
    const { controller, cut, store, next } = setup();
    cut.uiRecognition!.enabled = false;
    globals.window.confirm.mockReturnValue(false);
    expect(await controller.runRecognition(cut)).toBe(true);
    expect(globals.window.confirm).not.toHaveBeenCalled();
    expect(store.recognizeUi).toHaveBeenCalledTimes(1);
    expect(cut.uiRecognition!.enabled).toBe(true);
    expect(cut.uiRecognition!.selectedId).toBe(next.id);
  });
  test('unknown requests remain pending and are queried rather than replayed', async () => {
    const { controller, cut, store } = setup();
    store.recognizeUi.mockRejectedValueOnce(new Error('network interrupted'));
    await expect(controller.runRecognition(cut)).rejects.toThrow('network interrupted');
    expect(cut.uiRecognition!.pendingId).toBeDefined();
    await controller.runRecognition(cut);
    expect(store.recognizeUi).toHaveBeenCalledTimes(1);
    expect(store.recognitionStatus).toHaveBeenCalledTimes(1);
  });
  test('failed validation releases the card and allows an explicit new recognition', async () => {
    const { controller, cut, store, save, next } = setup();
    const id = randomUUID();
    const selectedId = cut.uiRecognition!.selectedId;
    cut.uiRecognition!.pendingId = id;
    store.recognitionStatus.mockResolvedValueOnce({
      id,
      status: 'failed',
      error: '识图文字 T012 的 color 无效',
      recovery: { width: 400, height: 300 },
    } as any);
    await expect(controller.query(cut.id)).rejects.toThrow(id);
    expect(cut.uiRecognition!.pendingId).toBeUndefined();
    expect(cut.uiRecognition!.selectedId).toBe(selectedId);
    expect(store.recognizeUi).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(await controller.runRecognition(cut)).toBe(true);
    expect(store.recognizeUi).toHaveBeenCalledTimes(1);
    expect(store.recognizeUi.mock.calls[0]).toEqual([
      expect.any(String),
      expect.objectContaining({ id: expect.not.stringMatching(id) }),
    ]);
    expect(cut.uiRecognition!.selectedId).toBe(next.id);
  });
  test.each([false, true])(
    'missing request is cleared only with explicit confirmation: %s',
    async (accept) => {
      const { controller, cut, store } = setup();
      cut.uiRecognition!.pendingId = randomUUID();
      globals.window.confirm.mockReturnValue(accept);
      store.recognitionStatus.mockRejectedValueOnce(
        Object.assign(new Error('missing'), { status: 404 })
      );
      if (accept) expect(await controller.runRecognition(cut)).toBe(false);
      else await expect(controller.runRecognition(cut)).rejects.toThrow('missing');
      expect(Boolean(cut.uiRecognition!.pendingId)).toBe(!accept);
      expect(store.recognizeUi).not.toHaveBeenCalled();
    }
  );
});

function fixture() {
  const document = emptyDocument();
  const design: CanvasNode = {
    id: randomUUID(),
    type: 'image',
    title: '设计稿',
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    assetPath: 'assets/image/canvas-' + randomUUID() + '.png',
    uiRecognition: { enabled: false, inputRole: 'design', results: [] },
  };
  const cut: CanvasNode = {
    ...design,
    id: randomUUID(),
    assetPath: 'assets/image/canvas-' + randomUUID() + '.png',
    uiRecognition: { enabled: true, inputRole: 'text-free', results: [] },
  };
  const identity = { path: design.assetPath!, sha256: 'a'.repeat(64), width: 400, height: 300 };
  const result = {
    id: randomUUID(),
    model: 'test',
    prompt: 'fixture',
    createdAt: new Date().toISOString(),
    durationMs: 0,
    sourcePath: cut.assetPath!,
    sourceSha256: 'b'.repeat(64),
    width: 400,
    height: 300,
    elements: [],
    bbox: {
      version: 1 as const,
      coordinateSpace: 'design-pixels' as const,
      bboxFormat: 'xywh' as const,
      design: identity,
      cutSource: { ...identity, path: cut.assetPath!, sha256: 'b'.repeat(64) },
      elements: [
        {
          id: 'E001',
          name: '按钮',
          type: 'button' as const,
          bbox: [10, 20, 80, 40] as [number, number, number, number],
          parent: null,
        },
      ],
      texts: [],
    },
  };
  cut.uiRecognition = validateUiRecognition({
    ...cut.uiRecognition,
    results: [result],
    selectedId: result.id,
  });
  document.nodes.push(design, cut);
  document.edges.push({ id: randomUUID(), from: design.id, to: cut.id, kind: 'image-variant' });
  return { document, design, cut, result };
}

test('ordinary images and resource cards do not acquire UI actions from media or generation data', () => {
  const { design } = fixture();
  const ordinary = {
    ...design,
    uiRecognition: undefined,
    generation: { prompt: 'UI design reference' },
  };
  expect(imageFeatures(ordinary)).toEqual([]);
  expect(imageFeatures({ ...design, type: 'image-assets' })).toEqual([]);
  expect(imageFeatures(design).flatMap((feature) => feature.actions)).toEqual([
    'recognize-ui',
    'view-bbox',
  ]);
  const merged = {
    ...ordinary,
    mergeIcons: {
      stageCount: 2,
      instructions: '',
      series: [{ name: 'coin', stages: ['one', 'two'] }],
    },
  };
  expect(imageAllowsOutpaint(ordinary)).toBe(true);
  expect(imageAllowsOutpaint(merged)).toBe(false);
});

test('original and text-free cards share one result; replacing either input invalidates its preview', () => {
  const { document, design, cut, result } = fixture();
  expect(uiRecognitionInputs(document, design)).toEqual({ design, cut });
  expect(uiRecognitionPreview(document, design)?.result.id).toBe(result.id);
  expect(uiRecognitionPreview(document, cut)?.result.id).toBe(result.id);
  const originalPath = design.assetPath;
  design.assetPath = 'assets/image/replaced.png';
  expect(uiRecognitionPreview(document, cut)).toBeUndefined();
  const extraction = {
    ...cut,
    id: randomUUID(),
    uiRecognition: undefined,
    uiExtraction: 'action' as const,
  };
  document.nodes.push(extraction);
  document.edges.push({ id: randomUUID(), from: cut.id, to: extraction.id, kind: 'image-variant' });
  expect(() => selectedUiExtraction(document, extraction)).toThrow('原 UI 设计稿已变化');
  design.assetPath = originalPath;
  cut.assetPath = 'assets/image/replaced.png';
  expect(uiRecognitionPreview(document, design)).toBeUndefined();
});

test('API recognition requires a distinct ready text-free input, including for design cards', () => {
  const { document, design, cut } = fixture();
  cut.templatePending = true;
  expect(() => uiRecognitionInputs(document, design)).toThrow('去文字稿');
  delete cut.templatePending;
  document.edges = [];
  expect(() => uiRecognitionInputs(document, design)).toThrow('去文字稿');
});

test('duplicates retain examples but new template instances clear recognition results', () => {
  const { document, cut, result } = fixture();
  cut.uiRecognition!.pendingId = randomUUID();
  const duplicate = structuredClone(cut);
  resetImageFeatureCopy(duplicate, false);
  expect(duplicate.uiRecognition!.pendingId).toBeUndefined();
  expect(duplicate.uiRecognition!.selectedId).toBe(result.id);
  expect(cut.uiRecognition!.pendingId).toBeDefined();
  const model = createCanvasTemplateModel();
  const template = model.snapshot(
    document,
    document.nodes.map((node) => node.id),
    'UI'
  );
  const instantiated = model.instantiate(template, { x: 0, y: 0 });
  const settings = instantiated.nodes
    .filter((node) => node.uiRecognition)
    .map((node) => node.uiRecognition!);
  expect(settings.map((item) => item.inputRole)).toEqual(['design', 'text-free']);
  expect(settings[1].results).toHaveLength(0);
  expect(settings[1].selectedId).toBeUndefined();
  expect(
    instantiated.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')
      ?.templatePending
  ).toBe(true);
  expect(settings.every((item) => !item.pendingId)).toBe(true);
});

test('legacy special cards migrate on save without dropping results or changing placement', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-image-feature-')));
  try {
    const files = new MakerCanvasFiles(root);
    const saved = await files.create('legacy', 'empty');
    const { design } = fixture();
    delete design.assetPath;
    saved.nodes.push(Object.assign(design, { uiRecognitionCard: true }));
    const result = await files.save(saved.id, saved, saved.revision);
    expect(result.nodes[0]).not.toHaveProperty('uiRecognitionCard');
    expect(result.nodes[0].uiRecognition?.inputRole).toBe('design');
    expect(result.nodes[0].x).toBe(design.x);
    expect((await files.load(saved.id)).nodes[0]).toEqual(result.nodes[0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.each(['local', 'chatgpt-web'] as const)(
  'unavailable browser source %s does not create a pending request',
  async (source) => {
    const { document, cut } = fixture();
    const recognizeUi = jest.fn();
    const save = jest.fn(async () => true);
    const controller = createUiRecognitionUi({
      current: () => document,
      store: {
        recognitionModels: async () => [{ id: 'gpt-6.1-sol', model: 'gpt-6.1-sol', source }],
        recognizeUi,
      } as any,
      save,
      remember: jest.fn(),
      changed: jest.fn(),
      render: jest.fn(),
      blocked: () => false,
      error: jest.fn(),
      loadMedia: async () => {},
      openCanvas: async () => {},
    });
    cut.uiRecognition!.results = [];
    delete cut.uiRecognition!.selectedId;
    await expect(controller.runImage(cut.id, async () => true)).rejects.toThrow(
      source === 'local' ? 'AI 客户端' : 'ChatGPT'
    );
    expect(recognizeUi).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(cut.uiRecognition!.pendingId).toBeUndefined();
  }
);
