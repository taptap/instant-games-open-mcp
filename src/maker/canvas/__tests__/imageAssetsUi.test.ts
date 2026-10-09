import { randomUUID } from 'node:crypto';
import { createImageAssetsUi } from '../imageAssetsUi.js';
import { emptyDocument } from '../model.js';
import { snapshotCanvasSource } from '../dependencies.js';
import { setUiRecognitionMode } from '../uiRecognition.js';
import { drawImageAtlasPreview, openImageAtlasDialog } from '../imageAtlasUi.js';

jest.mock('../imageAtlasUi.js', () => ({
  openImageAtlasDialog: jest.fn(),
  drawImageAtlasPreview: jest.fn(() => [{ name: 'item_001' }]),
}));

const globals = globalThis as any;
const originals = Object.fromEntries(
  ['document', 'createImageBitmap', 'fetch', 'crypto'].map((key) => [key, globals[key]])
);
let close: jest.Mock;
beforeEach(() => {
  close = jest.fn();
  globals.document = {
    createElement: () => ({
      toDataURL: () => 'data:image/png;base64,preview',
      getContext: () => ({ drawImage: jest.fn() }),
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
    current: () => current,
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

test.each(['revision', 'source', 'edge', 'pending', 'target', 'canvas'])(
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
    await expect(ui.confirm('target', review.reviewId)).rejects.toThrow('预览已失效');
    expect(options.store.importImage).not.toHaveBeenCalled();
  }
);

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
  await expect(ui.preview('target', { columns: 0 })).rejects.toThrow('invalid grid');
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
      if (change === 'canvas') options.current = () => emptyDocument();
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
