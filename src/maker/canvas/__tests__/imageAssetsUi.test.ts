import { randomUUID } from 'node:crypto';
import { createImageAssetsUi } from '../imageAssetsUi.js';
import { emptyDocument } from '../model.js';
import { drawImageAtlasPreview } from '../imageAtlasUi.js';

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
    createElement: () => ({ toDataURL: () => 'data:image/png;base64,preview' }),
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
    store: { mediaUrl: (path: string) => path, importImage: jest.fn() },
    blocked: jest.fn(() => false),
    save: jest.fn(async () => true),
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
