import { imageAtlasRegions } from '../imageAtlasExport.js';
import { randomUUID } from 'node:crypto';
import { createImageAssetsUi } from '../imageAssetsUi.js';
import { emptyDocument } from '../model.js';
import { snapshotCanvasSource, isCanvasSourceCurrent } from '../dependencies.js';
import { setUiRecognitionMode } from '../uiRecognition.js';
import { openImageAtlasDialog } from '../imageAtlasUi.js';
import { drawImageAtlasPreview } from '../../../../packages/maker-canvas/src/browser/imageAtlasUi.js';
import * as imageAtlasExport from '../../../../packages/maker-canvas/src/browser/imageAtlasExport.js';

jest.mock('../imageAtlasUi.js', () => ({
  openImageAtlasDialog: jest.fn(),
}));

jest.mock('../../../../packages/maker-canvas/src/browser/imageAtlasUi.js', () => ({
  drawImageAtlasPreview: jest.fn(
    (_canvas, _bitmap, _grid, crops) => crops || [{ name: 'item_001' }]
  ),
}));

const globals = globalThis as any;
const originals = Object.fromEntries(
  ['document', 'createImageBitmap', 'fetch', 'crypto'].map((key) => [key, globals[key]])
);
let close: jest.Mock;
let transparentAtlas = false;
beforeEach(() => {
  transparentAtlas = false;
  close = jest.fn();
  globals.document = {
    createElement: () => ({
      toDataURL: () => 'data:image/png;base64,preview',
      getContext: () => ({
        drawImage: jest.fn(),
        getImageData: () => {
          const data = new Uint8ClampedArray(80 * 60 * 4).fill(255);
          if (transparentAtlas) data[3] = 0;
          return { data };
        },
        putImageData: jest.fn(),
      }),
      toBlob: (done: (blob: Blob) => void) => done(new Blob(['png'], { type: 'image/png' })),
    }),
  };
  globals.createImageBitmap = jest.fn(async () => ({ width: 80, height: 60, close }));
  globals.fetch = jest.fn(async () => new Response(new Blob(['image'])));
  globals.crypto = { randomUUID };
});
afterEach(() => {
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globals[key];
    else globals[key] = value;
  }
  jest.clearAllMocks();
});

function fixture() {
  const current = emptyDocument();
  current.nodes.push(
    {
      id: 'source',
      type: 'image',
      title: 'atlas',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      assetPath: 'atlas.png',
    },
    { id: 'target', type: 'image-assets', title: 'assets', x: 300, y: 0, width: 200, height: 200 }
  );
  current.edges.push({ id: 'edge', kind: 'image-assets', from: 'source', to: 'target' });
  const options = {
    current: jest.fn(() => current),
    store: {
      mediaUrl: (path: string) => path,
      importImage: jest.fn(async () => ({
        relativePath: '.maker/canvases/' + current.id + '/resources/' + randomUUID() + '.png',
      })),
    },
    blocked: jest.fn(() => false),
    save: jest.fn(async () => true),
    remember: jest.fn(),
    changed: jest.fn(),
    render: jest.fn(),
    select: jest.fn(),
    error: jest.fn(),
  };
  const ui = createImageAssetsUi(options as unknown as Parameters<typeof createImageAssetsUi>[0]);
  return { current, options, ui };
}

test('preview is read-only, reports a confirmation step and releases the decoded bitmap', async () => {
  const { current, options, ui } = fixture();
  const before = JSON.stringify(current);
  const review = await ui.preview('target', { columns: 2, rows: 3, gapX: 1 });
  expect(review).toMatchObject({
    status: 'waiting_for_confirmation',
    nextAction: 'confirm-image-assets',
    grid: { columns: 2, rows: 3, gapX: 1 },
  });
  expect(JSON.stringify(current)).toBe(before);
  expect(options.store.importImage).not.toHaveBeenCalled();
  expect(options.save).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
  expect(ui.isBusy).toBe(false);
  expect(ui.reviewState('target')?.reviewId).toBe(review.reviewId);
});

test.each(['revision', 'source', 'edge', 'pending', 'target', 'canvas', 'cut'])(
  'invalidates confirmation after %s changes',
  async (change) => {
    const { current, ui, options } = fixture();
    const review = await ui.preview('target');
    if (change === 'revision') current.revision++;
    if (change === 'source') current.nodes[0].assetPath = 'replacement.png';
    if (change === 'edge') current.edges = [];
    if (change === 'pending') current.nodes[0].templatePending = true;
    if (change === 'target') current.nodes.pop();
    if (change === 'canvas') current.id = randomUUID();
    if (change === 'cut')
      current.nodes[1].imageAssetsInfo = {
        width: 80,
        height: 60,
        grid: { columns: 2, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
        items: [],
      };
    await expect(ui.confirm('target', review.reviewId)).rejects.toThrow('预览已失效');
    expect(options.store.importImage).not.toHaveBeenCalled();
  }
);

test.each(['grid', 'content'] as const)(
  '%s confirmation persists actual crop sizes and reuses the saved mode',
  async (mode) => {
    const { current, ui } = fixture();
    const prepared = {
      width: 80,
      height: 60,
      grid: { columns: 2, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
      mode,
      background: { color: [0, 255, 0] as [number, number, number], mode: 'all' as const },
      regions: [
        { name: 'item_001', x: 2, y: 2, width: 70, height: 10 },
        { name: 'item_002', x: 5, y: 20, width: 20, height: 35 },
      ],
      canvas: {} as HTMLCanvasElement,
    };
    const prepare = jest.spyOn(imageAtlasExport, 'prepareImageAtlas').mockResolvedValue(prepared);
    if (mode === 'grid') {
      current.nodes[0].generation = {
        prompt: 'test',
        uiAtlasPlan: {
          version: 1,
          grid: prepared.grid,
          bbox: {
            version: 1,
            coordinateSpace: 'design-pixels',
            bboxFormat: 'xywh',
            design: {
              path: 'assets/image/canvas-' + randomUUID() + '.png',
              sha256: 'a'.repeat(64),
              width: 80,
              height: 60,
            },
            cutSource: {
              path: 'assets/image/canvas-' + randomUUID() + '.png',
              sha256: 'b'.repeat(64),
              width: 80,
              height: 60,
            },
            elements: [
              { id: 'E001', name: '按钮', type: 'button', bbox: [2, 2, 20, 10], parent: null },
            ],
            texts: [],
          },
          slots: [
            { elementIds: ['E001'], state: 'normal', role: 'element' },
            { elementIds: ['E001'], state: 'pressed', role: 'element' },
          ],
        },
      };
    }
    const split = jest.spyOn(imageAtlasExport, 'splitImageAtlas').mockResolvedValue({
      ...prepared,
      cutMode: mode,
      items: prepared.regions.map((region) => ({
        name: region.name,
        width: region.width,
        height: region.height,
        contentRect: [0, 0, region.width, region.height] as [number, number, number, number],
        blob: new Blob(['png']),
      })),
    });
    try {
      const result = await ui.preview('target', prepared.grid, {
        mode,
        expectedCount: 2,
        regions: prepared.regions,
      });
      expect(result.regions).toEqual(prepared.regions);
      expect(result.cutMode).toBe(mode);
      await ui.confirm('target', result.reviewId);
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(split.mock.calls[0][5]).toBe(prepared);
      expect(current.nodes[1].imageAssetsInfo?.regions).toEqual(prepared.regions);
      expect(current.nodes[1].imageAssetsInfo?.background).toEqual(prepared.background);
      await ui.preview('target');
      expect(prepare).toHaveBeenLastCalledWith(
        expect.any(Blob),
        prepared.grid,
        prepared.background.color,
        'all',
        expect.objectContaining({ mode, regions: prepared.regions }),
        current.nodes[0].generation?.uiAtlasPlan
      );
    } finally {
      prepare.mockRestore();
      split.mockRestore();
    }
  }
);

test('layout failure keeps the current assets and offers local crop repair, not paid regeneration', async () => {
  const { target, options, ui } = savedGridFixture();
  const before = JSON.stringify(target);
  const split = jest
    .spyOn(imageAtlasExport, 'splitImageAtlas')
    .mockRejectedValue(Object.assign(new Error('layout'), { code: 'ATLAS_LAYOUT_INVALID' }));
  try {
    await expect(ui.runSavedGrid(target.id)).rejects.toThrow('不会自动重新生图');
    expect(JSON.stringify(target)).toBe(before);
    expect(options.store.importImage).not.toHaveBeenCalled();
  } finally {
    split.mockRestore();
  }
});

test('a new grid preview invalidates the old token and rejects unknown fields', async () => {
  const { ui } = fixture();
  const first = await ui.preview('target');
  const second = await ui.preview('target', { rows: 2 });
  expect(first.reviewId).not.toBe(second.reviewId);
  await expect(ui.confirm('target', first.reviewId)).rejects.toThrow('预览已失效');
  await expect(ui.preview('target', { row: 3 })).rejects.toThrow('grid 只接受');
});

test('source changes while loading cannot publish a review; failures release busy state', async () => {
  const { ui, current } = fixture();
  globals.fetch = jest.fn(async () => {
    current.nodes[0].assetPath = 'changed.png';
    return new Response(new Blob(['image']));
  });
  await expect(ui.preview('target')).rejects.toThrow('画布已变化');
  expect(ui.reviewState('target')).toBeUndefined();
  expect(ui.isBusy).toBe(false);
  expect(close).toHaveBeenCalledTimes(1);
});

test('grid render failures dispose the bitmap and invalidate the previous preview', async () => {
  const { ui } = fixture();
  await ui.preview('target');
  (drawImageAtlasPreview as jest.Mock).mockImplementationOnce(() => {
    throw new Error('invalid grid');
  });
  await expect(ui.preview('target', { columns: 2 })).rejects.toThrow('invalid grid');
  expect(close).toHaveBeenCalledTimes(2);
  expect(ui.reviewState('target')).toBeUndefined();
  expect(ui.isBusy).toBe(false);
});

function savedGridFixture() {
  const setup = fixture();
  const target = setup.current.nodes[1];
  target.templatePending = true;
  target.imageAssetsInfo = {
    width: 120,
    height: 80,
    grid: { columns: 2, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
    items: [1, 2].map((index) => ({
      name: 'item_00' + index,
      width: 60,
      height: 80,
      assetPath: 'assets/image/canvas-' + randomUUID() + '.png',
    })),
  };
  return { ...setup, target };
}

test('confirmed grid overrides the template for preview and subsequent atlas runs', async () => {
  const { current, target, ui } = savedGridFixture();
  const source = current.nodes[0];
  source.uiBaselineGrid = { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
  const custom = { columns: 2, rows: 2, marginX: 3, marginY: 4, gapX: 2, gapY: 2 };
  const review = await ui.preview(target.id, custom);
  await ui.confirm(target.id, review.reviewId);
  expect(source.uiBaselineGrid).toEqual(custom);
  expect((await ui.preview(target.id)).grid).toEqual(custom);
  expect(await ui.runSavedGrid(target.id)).toBe(true);
  expect(target.imageAssetsInfo!.grid).toEqual(custom);
  expect(target.imageAssetsInfo!.items).toHaveLength(4);
  source.assetPath = 'replacement-atlas.png';
  expect(await ui.runSavedGrid(target.id)).toBe(true);
  expect(target.imageAssetsInfo!.grid).toEqual(custom);
});

test('an existing confirmed grid takes precedence over a different template baseline', async () => {
  const { current, target, ui } = savedGridFixture();
  const source = current.nodes[0];
  source.uiBaselineGrid = { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
  target.sourceSnapshot = snapshotCanvasSource(source);
  const custom = { ...target.imageAssetsInfo!.grid, marginX: 3, marginY: 4, gapX: 2 };
  target.imageAssetsInfo!.grid = custom;
  expect((await ui.preview(target.id)).grid).toEqual(custom);
  expect(await ui.runSavedGrid(target.id)).toBe(true);
  expect(target.imageAssetsInfo!.grid).toEqual(custom);
  expect(source.uiBaselineGrid).toEqual(custom);
});

test.each(['open', 'preview', 'runSavedGrid'] as const)(
  '%s preserves legacy cut parameters without upgrading old output identity',
  async (entry) => {
    transparentAtlas = true;
    const { current, target, options, ui } = savedGridFixture();
    const source = current.nodes[0];
    target.sourceSnapshot = snapshotCanvasSource(source);
    const originalSnapshot = structuredClone(target.sourceSnapshot);
    target.imageAssetsInfo!.cutMode = 'content';
    target.imageAssetsInfo!.regions = [{ name: 'item_001', x: 2, y: 3, width: 30, height: 40 }];
    target.imageAssetsInfo!.background = { color: [12, 34, 56], mode: 'all' };
    const regions = structuredClone(target.imageAssetsInfo!.regions);
    Object.assign(options.store, { mediaVersions: async () => ({ 'atlas.png': 'first-hash' }) });
    globals.document.querySelector = () => null;
    const prepare = jest.spyOn(imageAtlasExport, 'prepareImageAtlas');
    const split = jest.spyOn(imageAtlasExport, 'splitImageAtlas');
    (openImageAtlasDialog as jest.Mock).mockImplementation((_source, _url, actions) =>
      actions.closed()
    );
    try {
      if (entry === 'open') {
        await ui.open(source.id, target.id);
        await ui.open(source.id, target.id);
        for (const call of (openImageAtlasDialog as jest.Mock).mock.calls)
          expect(call[2]).toMatchObject({
            cut: { mode: 'content', regions },
            backgroundColor: [12, 34, 56],
            backgroundMode: 'all',
          });
      } else if (entry === 'preview') {
        await ui.preview(target.id);
        await ui.preview(target.id);
        expect(prepare.mock.calls[1].slice(2, 5)).toEqual([
          [12, 34, 56],
          'all',
          { mode: 'content', regions, expectedCount: 1 },
        ]);
      } else {
        expect(await ui.runSavedGrid(target.id)).toBe(true);
        expect(split.mock.calls[0].slice(2, 5)).toEqual([
          [12, 34, 56],
          'all',
          { mode: 'content', regions, expectedCount: 1 },
        ]);
      }
      expect(source.assetVersion?.version).toBe('first-hash');
      if (entry !== 'runSavedGrid') {
        expect(target.sourceSnapshot).toEqual(originalSnapshot);
        expect(isCanvasSourceCurrent(target.sourceSnapshot, source)).toBe(false);
        expect(options.store.importImage).not.toHaveBeenCalled();
      } else expect(isCanvasSourceCurrent(target.sourceSnapshot, source)).toBe(true);
    } finally {
      prepare.mockRestore();
      split.mockRestore();
    }
  }
);

test('known changed content does not reuse old regions or background', async () => {
  const { current, target, options, ui } = savedGridFixture();
  const source = current.nodes[0];
  source.assetVersion = { path: source.assetPath!, version: 'old-hash' };
  target.sourceSnapshot = snapshotCanvasSource(source);
  target.imageAssetsInfo!.regions = [{ name: 'item_001', x: 2, y: 3, width: 30, height: 40 }];
  target.imageAssetsInfo!.background = { color: [12, 34, 56], mode: 'all' };
  Object.assign(options.store, { mediaVersions: async () => ({ 'atlas.png': 'new-hash' }) });
  globals.document.querySelector = () => null;
  (openImageAtlasDialog as jest.Mock).mockImplementation((_source, _url, actions) =>
    actions.closed()
  );
  await ui.open(source.id, target.id);
  const actions = (openImageAtlasDialog as jest.Mock).mock.calls[0][2];
  expect(actions.cut.regions).toBeUndefined();
  expect(actions.backgroundColor).toBeUndefined();
  expect(isCanvasSourceCurrent(target.sourceSnapshot, source)).toBe(false);
});

test('unrecognized UI sheets allow unused baseline cells but ordinary atlases do not', async () => {
  const { current, target, ui } = savedGridFixture();
  const source = current.nodes[0];
  source.uiAtlasGroup = 'icons';
  source.uiBaselineGrid = { ...target.imageAssetsInfo!.grid };
  const split = jest.spyOn(imageAtlasExport, 'splitImageAtlas');
  try {
    expect(await ui.runSavedGrid(target.id)).toBe(true);
    expect(split.mock.calls[0][4]).toMatchObject({ allowEmpty: true });
    expect(split.mock.calls[0][3]).toBe('all');
    delete source.uiAtlasGroup;
    source.assetPath = 'ordinary-atlas.png';
    expect(await ui.runSavedGrid(target.id)).toBe(true);
    expect(split.mock.calls[1][4]?.allowEmpty).toBeUndefined();
  } finally {
    split.mockRestore();
  }
});

test('new recognized atlases use recognition grids without overwriting the no-recognition grid', async () => {
  const { current, target, ui } = savedGridFixture();
  const source = current.nodes[0];
  const baseline = { columns: 2, rows: 1, marginX: 3, marginY: 4, gapX: 2, gapY: 0 };
  source.uiBaselineGrid = { ...baseline };
  source.uiExtraction = 'action';
  const id = randomUUID();
  const recognition = {
    ...source,
    id: 'recognition',
    assetPath: 'textless.png',
    uiExtraction: undefined,
    uiRecognition: {
      enabled: true,
      selectedId: id,
      results: [
        {
          id,
          model: 'test-model',
          prompt: 'recognize',
          createdAt: new Date().toISOString(),
          durationMs: 1,
          sourcePath: 'textless.png',
          sourceSha256: 'a'.repeat(64),
          width: 80,
          height: 60,
          elements: ['B32', 'B34', 'B36'].map((elementId) => ({
            id: elementId,
            name: 'button',
            category: 'action' as const,
            rect: [0, 0, 10, 10] as [number, number, number, number],
            parentId: null,
            zIndex: 1,
            states: ['normal'],
            cutout: true,
          })),
        },
      ],
    },
  };
  current.nodes.push(recognition);
  current.edges.push({
    id: 'reference',
    kind: 'image-variant',
    from: recognition.id,
    to: source.id,
  });
  target.sourceSnapshot = snapshotCanvasSource(source);
  source.assetPath = 'recognized-atlas.png';
  expect(await ui.runSavedGrid(target.id)).toBe(true);
  expect(target.imageAssetsInfo!.grid).toMatchObject({ columns: 3, rows: 2 });
  expect(source.uiBaselineGrid).toEqual(baseline);
  setUiRecognitionMode(current, recognition, false);
  source.assetPath = 'baseline-atlas.png';
  expect(await ui.runSavedGrid(target.id)).toBe(true);
  expect(target.imageAssetsInfo!.grid).toEqual(baseline);
});

test('failed save restores both the baseline grid and the previous resource card', async () => {
  const { current, target, options, ui } = savedGridFixture();
  const source = current.nodes[0];
  source.uiBaselineGrid = { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
  target.sourceSnapshot = snapshotCanvasSource(source);
  const before = structuredClone(current);
  options.save.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(ui.runSavedGrid(target.id)).rejects.toThrow('保存失败');
  expect(current).toEqual(before);
});

test('workflow prepares real items from current atlas and saved grid without a review dialog', async () => {
  const { current, target, options, ui } = savedGridFixture();
  const oldPaths = target.imageAssetsInfo!.items.map((item) => item.assetPath);
  expect(await ui.runSavedGrid(target.id)).toBe(true);
  expect(current.nodes).toHaveLength(2);
  expect(target.templatePending).toBeUndefined();
  expect(target.imageAssetsInfo).toMatchObject({
    width: 80,
    height: 60,
    items: [
      { width: 40, height: 60 },
      { width: 40, height: 60 },
    ],
  });
  expect(target.imageAssetsInfo!.items.every((item) => !oldPaths.includes(item.assetPath))).toBe(
    true
  );
  expect(options.store.importImage).toHaveBeenCalledTimes(2);
  expect(options.store.importImage).toHaveBeenCalledWith(
    current.id,
    expect.any(ArrayBuffer),
    'image/png',
    'resource'
  );
  expect(options.save).toHaveBeenCalledTimes(2);
  expect(openImageAtlasDialog).not.toHaveBeenCalled();
  expect(ui.reviewState(target.id)).toBeUndefined();
  expect(ui.isBusy).toBe(false);
});

test.each([
  ['#FF00FF', false, false],
  ['#00FF00', false, false],
  ['transparent', false, false],
  ['transparent', true, false],
  [undefined, false, false],
  ['#FF00FF', true, false],
  ['#FF00FF', true, true],
  ['#00FF00', true, true],
  ['transparent', true, true],
  [undefined, true, true],
] as const)(
  'atlas splitting selects recorded color %s, UI=%s, background=%s',
  async (cutoutColor, gameUi, background) => {
    const { current, target, ui } = savedGridFixture();
    if (gameUi) {
      target.sectionId = 'group';
      current.nodes.push({
        id: 'group',
        type: 'section',
        title: 'UI',
        x: 0,
        y: 0,
        width: 900,
        height: 600,
        templateId: '7e1cb6ad-732f-4dc3-a951-000000000013',
      });
    }
    current.nodes[0].generation = { prompt: 'atlas', ...(cutoutColor ? { cutoutColor } : {}) };
    if (background) current.nodes[0].uiAtlasGroup = 'background';
    const split = jest.spyOn(imageAtlasExport, 'splitImageAtlas').mockResolvedValue({
      width: 80,
      height: 60,
      grid: target.imageAssetsInfo!.grid,
      cutMode: 'grid',
      regions: imageAtlasRegions(80, 60, target.imageAssetsInfo!.grid),
      background: { mode: 'connected' },
      items: [1, 2].map((index) => ({
        name: 'item_00' + index,
        width: 40,
        height: 60,
        blob: new Blob(['png'], { type: 'image/png' }),
      })),
    });
    try {
      expect(await ui.runSavedGrid(target.id)).toBe(true);
      expect(split).toHaveBeenCalledWith(
        expect.any(Blob),
        target.imageAssetsInfo!.grid,
        cutoutColor === '#FF00FF' || (cutoutColor === undefined && gameUi)
          ? [255, 0, 255]
          : cutoutColor === '#00FF00'
            ? [0, 255, 0]
            : undefined,
        cutoutColor && !gameUi ? 'all' : 'connected',
        {},
        undefined,
        current.nodes[0].generation?.uiAtlasPlan
      );
      expect(target.templatePending).toBeUndefined();
    } finally {
      split.mockRestore();
    }
  }
);

test('prompt-only full backgrounds do not use the legacy default removal color', async () => {
  const { current, target, ui } = savedGridFixture();
  const source = current.nodes[0];
  source.uiAtlasGroup = 'background';
  const clean = {
    ...source,
    id: 'clean',
    uiAtlasGroup: undefined,
    uiRecognition: { enabled: true, optional: true, results: [] },
  };
  current.nodes.push(clean);
  current.edges.push({
    id: 'clean-background',
    from: clean.id,
    to: source.id,
    kind: 'image-variant',
  });
  globals.document.querySelector = () => null;
  (openImageAtlasDialog as jest.Mock).mockImplementation((_source, _url, actions) =>
    actions.closed()
  );
  await ui.open(source.id, target.id);
  const actions = (openImageAtlasDialog as jest.Mock).mock.calls[0][2];
  expect(actions.backgroundColor).toBeUndefined();
  expect(actions.backgroundMode).toBe('connected');
});

test('background atlases reuse saved removal settings for the same source', async () => {
  const { current, target, ui } = savedGridFixture();
  const source = current.nodes[0];
  source.uiAtlasGroup = 'background';
  source.generation = { prompt: 'background', cutoutColor: '#00FF00' };
  target.sourceSnapshot = snapshotCanvasSource(source);
  target.imageAssetsInfo!.background = { color: [255, 0, 255], mode: 'connected' };
  globals.document.querySelector = () => null;
  (openImageAtlasDialog as jest.Mock).mockImplementation((_source, _url, actions) =>
    actions.closed()
  );
  await ui.open(source.id, target.id);
  const actions = (openImageAtlasDialog as jest.Mock).mock.calls[0][2];
  expect(actions.backgroundColor).toEqual([255, 0, 255]);
  expect(actions.backgroundMode).toBe('connected');
});

test('workflow refuses missing or invalid grid without importing files or guessing defaults', async () => {
  const { target, options, ui } = savedGridFixture();
  target.imageAssetsInfo!.grid.columns = 0;
  await expect(ui.runSavedGrid(target.id)).rejects.toThrow('行列');
  delete target.imageAssetsInfo;
  await expect(ui.runSavedGrid(target.id)).rejects.toThrow('缺少切图参数');
  expect(options.store.importImage).not.toHaveBeenCalled();
  expect(ui.isBusy).toBe(false);
});

test.each(['source', 'grid', 'edge', 'canvas'])(
  'workflow refuses stale %s after reading media',
  async (change) => {
    const { current, target, options, ui } = savedGridFixture();
    globals.fetch = jest.fn(async () => {
      if (change === 'source') current.nodes[0].assetPath = 'new-atlas.png';
      if (change === 'grid') target.imageAssetsInfo!.grid.rows = 2;
      if (change === 'edge') current.edges = [];
      if (change === 'canvas') options.current.mockImplementation(() => emptyDocument());
      return new Response(new Blob(['image']));
    });
    await expect(ui.runSavedGrid(target.id)).rejects.toThrow('已变化');
    expect(options.store.importImage).not.toHaveBeenCalled();
    expect(ui.isBusy).toBe(false);
  }
);

test('workflow save failure restores old resource card and keeps it pending', async () => {
  const { target, options, ui } = savedGridFixture();
  const before = structuredClone(target);
  options.save.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(ui.runSavedGrid(target.id)).rejects.toThrow('保存失败');
  expect(target).toEqual(before);
  expect(ui.isBusy).toBe(false);
});
