import { Script } from 'node:vm';
import {
  canvasStructureKey,
  createCanvasSaveScheduler,
} from '../../../../packages/maker-canvas/src/browser/saveSchedule.js';
import { getCanvasPageHtml } from '../page.js';

describe('canvas autosave cadence', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** A canvas whose save records the text it would upload, like the page's flush(). */
  function typingCanvas() {
    const canvas = { text: '', saved: [] as string[] };
    const schedule = createCanvasSaveScheduler({ save: () => canvas.saved.push(canvas.text) });
    const type = (value: string) => {
      canvas.text = value;
      schedule.schedule();
    };
    return { canvas, schedule, type };
  }

  test('saves at most 4 times during 30s of continuous typing', () => {
    const { canvas, type } = typingCanvas();
    for (let elapsed = 0; elapsed < 30_000; elapsed += 150) {
      type('t' + elapsed);
      jest.advanceTimersByTime(150);
    }
    expect(canvas.saved.length).toBeGreaterThan(0);
    expect(canvas.saved.length).toBeLessThanOrEqual(4);
  });

  test('saves once 2s after typing stops', () => {
    const { canvas, type } = typingCanvas();
    type('a');
    jest.advanceTimersByTime(500);
    type('ab');
    jest.advanceTimersByTime(1999);
    expect(canvas.saved).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(canvas.saved).toEqual(['ab']);
    jest.advanceTimersByTime(60_000);
    expect(canvas.saved).toEqual(['ab']);
  });

  test('blur or a hidden page saves the latest text at once, and only once', () => {
    const { canvas, schedule, type } = typingCanvas();
    type('h');
    type('hello');
    expect(schedule.flushNow()).toBe(true);
    expect(canvas.saved).toEqual(['hello']);
    expect(schedule.flushNow()).toBe(false);
    jest.advanceTimersByTime(60_000);
    expect(canvas.saved).toEqual(['hello']);
  });

  test('immediate edits share one save on the next tick', () => {
    const { canvas, schedule } = typingCanvas();
    canvas.text = 'card';
    schedule.schedule(true);
    canvas.text = 'card+wire';
    schedule.schedule(true);
    jest.advanceTimersByTime(0);
    expect(canvas.saved).toEqual(['card+wire']);
  });

  test('cancel drops the waiting save', () => {
    const { canvas, schedule, type } = typingCanvas();
    type('conflict');
    schedule.cancel();
    jest.advanceTimersByTime(60_000);
    expect(canvas.saved).toEqual([]);
    expect(schedule.pending).toBe(false);
  });

  test('structure key changes only when cards or wires come and go', () => {
    const base = { nodes: [{ id: 'a', x: 0 }], edges: [] as Array<{ id: string }> };
    const moved = { nodes: [{ id: 'a', x: 40 }], edges: [] };
    const wired = { nodes: [{ id: 'a' }], edges: [{ id: 'e' }] };
    expect(canvasStructureKey(moved)).toBe(canvasStructureKey(base));
    expect(canvasStructureKey(wired)).not.toBe(canvasStructureKey(base));
  });

  test('the embedded scheduler keeps its cadence inside the page sandbox', () => {
    const html = getCanvasPageHtml();
    expect(html).toContain('function createCanvasSaveScheduler');
    expect(html).toContain('canvasSaveSchedule.schedule(');
    expect(html).toContain("document.addEventListener('focusout'");
    expect(html).toContain("window.addEventListener('pagehide'");
    expect(html).not.toContain('timer = setTimeout(function () { void flush(); }, 800);');
    const saved: number[] = [];
    const create = new Script('(' + createCanvasSaveScheduler.toString() + ')').runInNewContext({
      setTimeout,
      clearTimeout,
      Date,
    });
    const schedule = create({ save: () => saved.push(Date.now()) });
    const start = Date.now();
    schedule.schedule();
    jest.advanceTimersByTime(2000);
    expect(saved).toEqual([start + 2000]);
  });
});
