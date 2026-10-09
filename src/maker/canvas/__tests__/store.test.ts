import { CanvasStoreError } from '../model.js';
import {
  createBrowserCanvasDocumentStore,
  dispatchCanvasStoreRequest,
  MemoryCanvasDocumentStore,
} from '../store.js';

describe('CanvasDocumentStore port', () => {
  test('routes resource PNGs separately from project image imports', async () => {
    const memory = new MemoryCanvasDocumentStore();
    const canvas = await memory.create();
    const imported = jest.spyOn(memory, 'importImage');
    const fetcher = jest.fn(async (url: string, options?: RequestInit) =>
      dispatchCanvasStoreRequest(memory, url.slice(url.indexOf('/canvases/')), options)
    );
    const store = createBrowserCanvasDocumentStore('project', fetcher as typeof fetch);
    const bytes = new ArrayBuffer(16);
    await store.importImage(canvas.id, bytes, 'image/png', 'resource');
    expect(fetcher.mock.calls[0][0]).toContain('/resource-images');
    expect(imported).toHaveBeenLastCalledWith(canvas.id, bytes, 'image/png', 'resource');
    await store.importImage(canvas.id, bytes, 'image/png');
    expect(fetcher.mock.calls[1][0]).toContain('/images');
    expect(imported).toHaveBeenLastCalledWith(canvas.id, bytes, 'image/png', undefined);
  });

  test('forwards local abort signals without adding them to paid generation parameters', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as jest.MockedFunction<typeof fetch>;
    const store = createBrowserCanvasDocumentStore('project', fetcher);
    const controller = new AbortController();
    const input = { prompt: '原地跑步', sourceImagePath: 'assets/image/head.png' };
    await store.createVideo('canvas', input, controller.signal);
    await store.generationAction('canvas', 'attempt', 'retry', controller.signal);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify(input));
    expect(fetcher.mock.calls[1][1]?.signal).toBe(controller.signal);
    controller.abort();
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  test('dispatches create, load, save, and active-canvas operations through the port', async () => {
    const store = new MemoryCanvasDocumentStore();
    const createdResponse = await dispatchCanvasStoreRequest(store, '/canvases', {
      method: 'POST',
      body: JSON.stringify({ title: '测试画布' }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created).toMatchObject({ title: '测试画布', revision: 0 });

    const document = created as { id: string; title: string; revision: number };
    await dispatchCanvasStoreRequest(store, '/canvases/active', {
      method: 'PUT',
      body: JSON.stringify({ canvasId: document.id }),
    });
    const active = await dispatchCanvasStoreRequest(store, '/canvases/active');
    expect(await active.json()).toEqual({ canvasId: document.id });

    const loaded = await dispatchCanvasStoreRequest(store, '/canvases/' + document.id);
    expect(await loaded.json()).toEqual(created);
  });

  test('keeps revision conflicts at the store boundary', async () => {
    const store = new MemoryCanvasDocumentStore();
    const created = await store.create('冲突');
    const saved = await store.save({ ...created, title: '新版本' });
    expect(saved.revision).toBe(1);
    await expect(store.save(created)).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    } satisfies Partial<CanvasStoreError>);
    expect((await store.load(created.id)).title).toBe('新版本');
  });
});
