import { emptyDocument, type CanvasDocument } from '../model.js';
import { getCanvasPageHtml } from '../page.js';
import { saveAcknowledgement } from '../edit.js';
import { canvasFlowDuration, formatCanvasWorkDuration } from '../workTiming.js';

test('does not present a missing or legacy partial flow time as a measured total', () => {
  expect(canvasFlowDuration(undefined)).toBeUndefined();
  expect(canvasFlowDuration({ workDurationMs: 141429 })).toBeUndefined();
  expect(canvasFlowDuration({ workDurationMs: 0 })).toBeUndefined();
  expect(
    canvasFlowDuration({ workStartedAt: 1_000, workTimingOpen: true, workDurationMs: 1200 })
  ).toBe(1200);
  expect(
    canvasFlowDuration(
      { workStartedAt: 1_000, workTimingOpen: true, workDurationMs: 1200 },
      { elapsedMs: 1200, runStartedAt: 5_000 },
      6_500
    )
  ).toBe(2700);
});

test('formats elapsed work time without adding other metrics', () => {
  expect(formatCanvasWorkDuration(0)).toBe('00:00');
  expect(formatCanvasWorkDuration(15999)).toBe('00:15');
  expect(formatCanvasWorkDuration(125000)).toBe('02:05');
  expect(formatCanvasWorkDuration(3600000)).toBe('60:00');
});

function saveRuntime(document: CanvasDocument, request: (...args: unknown[]) => Promise<unknown>) {
  const html = getCanvasPageHtml();
  const start = html.indexOf('  let pendingSave = null;');
  const end = html.indexOf('  function mediaUrl(', start);
  expect(start).toBeGreaterThan(0);
  const script = html.slice(start, end);
  const layout = (value: CanvasDocument) => JSON.stringify({ ...value, revision: undefined });
  const runtime = { document, request, layout };
  return new Function(
    'runtime',
    'saveAcknowledgement',
    'let documentState = runtime.document; let savedKey = ""; const groupQueue = null;' +
      'const layout = runtime.layout; const dirty = () => layout(documentState) !== savedKey;' +
      'const request = runtime.request; const setStatus = () => {}; const setError = () => {};' +
      script +
      'return { flush, saveOnce, failed: () => saveFailed };'
  )(runtime, saveAcknowledgement) as {
    flush(): Promise<boolean>;
    saveOnce(): Promise<boolean>;
    failed(): boolean;
  };
}

test('the actual page save queue serializes concurrent card results using the latest revision', async () => {
  const document = emptyDocument();
  const requests: Array<{ snapshot: CanvasDocument; resolve(value: unknown): void }> = [];
  const request = jest.fn(async (...args: unknown[]) => {
    const input = args[1] as { body: string };
    return new Promise((resolve) => {
      requests.push({ snapshot: JSON.parse(input.body), resolve });
    });
  });
  const runtime = saveRuntime(document, request);
  const first = runtime.flush();
  document.title = 'first image finished';
  const second = runtime.flush();
  document.title = 'second image finished';
  const third = runtime.flush();
  expect(request).toHaveBeenCalledTimes(1);
  requests[0].resolve({ ...requests[0].snapshot, revision: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  expect(request).toHaveBeenCalledTimes(2);
  expect(requests[1].snapshot).toMatchObject({ title: 'second image finished', revision: 1 });
  requests[1].resolve({ ...requests[1].snapshot, revision: 2 });
  expect(await Promise.all([first, second, third])).toEqual([true, true, true]);
  expect(document.revision).toBe(2);
  expect(runtime.failed()).toBe(false);
});

test('the page distinguishes a real save failure from concurrent dirty edits', async () => {
  const request = jest.fn<Promise<unknown>, unknown[]>(async () => {
    throw new Error('CONFLICT');
  });
  const runtime = saveRuntime(emptyDocument(), request);
  expect(await runtime.flush()).toBe(false);
  expect(runtime.failed()).toBe(true);
  request.mockImplementation(async (...args: unknown[]) => ({
    ...JSON.parse((args[1] as { body: string }).body),
    revision: 1,
  }));
  expect(await runtime.flush()).toBe(true);
  expect(runtime.failed()).toBe(false);
});
