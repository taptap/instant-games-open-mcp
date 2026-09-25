import { CanvasStoreError } from '../model.js';
import { dispatchCanvasStoreRequest, MemoryCanvasDocumentStore } from '../store.js';

describe('CanvasDocumentStore port', () => {
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
