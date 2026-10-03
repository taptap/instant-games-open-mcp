import { runInNewContext } from 'node:vm';
import { connectCanvasAutomation } from '../automationClient.js';

afterEach(() => jest.useRealTimers());

test('expired sessions stop polling and surface refresh guidance without replaying a command', async () => {
  jest.useFakeTimers();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pageId: 'page', acknowledged: [], commands: [] }),
    })
    .mockResolvedValue({ ok: false, json: async () => ({ code: 'CANVAS_PAGE_EXPIRED' }) });
  const error = jest.fn();
  const execute = jest.fn();
  const connect = runInNewContext('(' + connectCanvasAutomation.toString() + ')', {
    fetch: fetcher,
    AbortSignal,
    setTimeout,
    window: { addEventListener: jest.fn() },
  });
  connect({
    projectKey: 'project',
    current: () => ({ id: 'canvas', revision: 0 }),
    execute,
    error,
  });
  await jest.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('刷新页面'));
  expect(execute).not.toHaveBeenCalled();
});

test('temporary network failures retain the session and retry only the exchange', async () => {
  jest.useFakeTimers();
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({
      ok: true,
      json: async () => ({ pageId: 'page', acknowledged: [], commands: [] }),
    });
  const error = jest.fn();
  const execute = jest.fn();
  let close!: () => void;
  const connect = runInNewContext('(' + connectCanvasAutomation.toString() + ')', {
    fetch: fetcher,
    AbortSignal,
    setTimeout,
    window: {
      addEventListener: (_name: string, callback: () => void) => {
        close = callback;
      },
    },
  });
  connect({
    projectKey: 'project',
    current: () => ({ id: 'canvas', revision: 0 }),
    execute,
    error,
  });
  await jest.advanceTimersByTimeAsync(1000);
  close();
  await jest.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(error).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
