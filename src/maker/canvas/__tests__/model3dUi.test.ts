import { createCanvasModelUi } from '../model3dUi.js';
import { canvasPresets } from '../presets.js';
import { canvasNodeVersion } from '../dependencies.js';
import { emptyDocument } from '../model.js';
import type { CanvasDocumentStore } from '../store.js';
import type { CanvasModelAttempt } from '../model3d.js';

function fixture() {
  const current = emptyDocument();
  const template = canvasPresets().find((item) => item.name.includes('角色模型'))!;
  current.nodes = structuredClone(template.nodes);
  current.edges = structuredClone(template.edges);
  const character = current.nodes[0];
  character.assetPath = 'assets/image/example.jpg';
  const views = current.nodes[1];
  const model = current.nodes[2];
  const review: CanvasModelAttempt = {
    id: 'attempt',
    canvasId: current.id,
    nodeId: views.id,
    sourceId: character.id,
    sourceVersion: canvasNodeVersion(character)!,
    quality: 'balanced',
    status: 'review',
    phase: 'views',
    assetId: 'asset',
    stepId: 'multiview_review',
    reviewId: 'token',
    previews: [{ view: 'front', path: 'assets/image/review.jpg' }],
    createdAt: '',
    updatedAt: '',
  };
  const store = {
    listModels: jest.fn(async () => [review]),
    modelAction: jest.fn(async () => review),
    mediaUrl: (path: string) => path,
  };
  const options = {
    current: () => current,
    store: store as unknown as CanvasDocumentStore,
    save: jest.fn(async () => true),
    render: jest.fn(),
    error: jest.fn(),
    blocked: () => false,
    sourceBlocked: () => false,
    remember: jest.fn(),
    changed: jest.fn(),
  };
  const ui = createCanvasModelUi(options);
  return { ui, options, store, review, views, model };
}

test('failed save prevents paid submission and releases local busy state', async () => {
  const { ui, options, store, views } = fixture();
  options.save.mockResolvedValue(false);
  await expect(ui.execute(views.id, 'start')).rejects.toThrow('未保存');
  expect(store.modelAction).not.toHaveBeenCalled();
  expect(ui.isBusy).toBe(false);
});

test('second request is blocked while first request is still saving', async () => {
  const { ui, options, store, views } = fixture();
  let release: (value: boolean) => void = () => {};
  options.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const first = ui.execute(views.id, 'start');
  await expect(ui.execute(views.id, 'start')).rejects.toThrow('当前');
  release(true);
  await first;
  expect(store.modelAction).toHaveBeenCalledTimes(1);
});

test('late local status response does not overwrite newer generation result', async () => {
  const { ui, store, views } = fixture();
  let release: (value: CanvasModelAttempt[]) => void = () => {};
  store.listModels.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const reading = ui.refresh();
  await ui.execute(views.id, 'start');
  release([]);
  await reading;
  expect(ui.state(views.id)?.assetId).toBe('asset');
});

test('stop during save prevents dispatch without canceling a remote task', async () => {
  const { ui, options, store, views } = fixture();
  let release: (value: boolean) => void = () => {};
  options.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const first = ui.execute(views.id, 'start');
  ui.stop();
  release(true);
  await expect(first).rejects.toThrow('远端任务未取消');
  expect(ui.isBusy).toBe(false);
  expect(store.modelAction).not.toHaveBeenCalled();
});

test.each([true, false])(
  'confirmation checks that every preview can decode: valid=%s',
  async (valid) => {
    const globals = globalThis as any;
    const original = globals.Image;
    globals.Image = class {
      naturalWidth = valid ? 100 : 0;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) {
        queueMicrotask(() => (valid ? this.onload?.() : this.onerror?.()));
      }
    };
    try {
      const { ui, store, model } = fixture();
      await ui.refresh();
      if (valid) {
        await ui.execute(model.id, 'confirm', 'token');
        expect(store.modelAction).toHaveBeenCalledTimes(1);
      } else {
        await expect(ui.execute(model.id, 'confirm', 'token')).rejects.toThrow('预览图片无法显示');
        expect(store.modelAction).not.toHaveBeenCalled();
      }
      expect(ui.isBusy).toBe(false);
    } finally {
      if (original === undefined) delete globals.Image;
      else globals.Image = original;
    }
  }
);
