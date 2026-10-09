import { withCanvasTimeout } from '../requestTimeout.js';
import { createBrowserCanvasDocumentStore } from '../store.js';
import { emptyDocument } from '../model.js';

afterEach(() => jest.useRealTimers());

test('a request that ignores abort still ends local waiting without replay', async () => {
  jest.useFakeTimers();
  let signal!: AbortSignal;
  const request = jest.fn((input: AbortSignal) => {
    signal = input;
    return new Promise(() => {});
  });
  const result = withCanvasTimeout(request);
  const rejected = expect(result).rejects.toMatchObject({ code: 'CANVAS_REQUEST_TIMEOUT' });
  await jest.advanceTimersByTimeAsync(60_000);
  await rejected;
  expect(signal.aborted).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});

test.each(['read', 'save', 'import'])(
  'bounds %s including response-body waiting',
  async (action) => {
    jest.useFakeTimers();
    const fetcher = jest.fn(async () => ({ ok: true, json: () => new Promise(() => {}) }));
    const store = createBrowserCanvasDocumentStore('project', fetcher as unknown as typeof fetch);
    const request =
      action === 'read'
        ? store.listGeneration('canvas')
        : action === 'save'
          ? store.save(emptyDocument())
          : store.importImage('canvas', new ArrayBuffer(16), 'image/png', 'resource');
    const rejected = expect(request).rejects.toMatchObject({ code: 'CANVAS_REQUEST_TIMEOUT' });
    await jest.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
);
