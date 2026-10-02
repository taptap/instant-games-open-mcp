import {
  canvasExportFilename,
  canvasExportIdentity,
  nextCanvasExportCode,
} from '../exportNaming.js';
import { canvasPresets } from '../presets.js';
import type { CanvasDocument, CanvasNode } from '../model.js';

function documentFor(nodes: CanvasNode[], edges: CanvasDocument['edges'] = []): CanvasDocument {
  return { id: 'canvas', title: '', revision: 0, viewport: { x: 0, y: 0, scale: 1 }, nodes, edges };
}

function card(id: string, title: string, type: CanvasNode['type'] = 'image'): CanvasNode {
  return { id, title, type, x: 0, y: 0, width: 100, height: 100 };
}

test('all four branches find the root title and direction through video, sequence and animation', () => {
  const preset = canvasPresets()[1];
  const document = documentFor(preset.nodes, preset.edges);
  const before = JSON.stringify(document);
  for (const type of ['video-source', 'sequence', 'animation']) {
    const identities = document.nodes
      .filter((node) => node.type === type)
      .map((node) => canvasExportIdentity(document, node));
    expect(identities.map((identity) => identity.direction).sort()).toEqual(
      ['前', '后', '左', '右'].sort()
    );
    expect(identities.every((identity) => identity.title === '01 蓝银战士 · 生图参考')).toBe(true);
  }
  expect(JSON.stringify(document)).toBe(before);
  for (const node of document.nodes) delete node.exportDirection;
  const directions = document.nodes
    .filter((node) => node.type === 'animation')
    .map((node) => canvasExportIdentity(document, node).direction);
  expect(directions.sort()).toEqual(['前', '后', '左', '右'].sort());
});

test('structured direction survives renamed reference cards', () => {
  const source = { ...card('source', '我的角色'), exportDirection: 'left' as const };
  const output = card('output', '动画', 'animation');
  const document = documentFor(
    [source, output],
    [{ id: 'edge', from: source.id, to: output.id, kind: 'sequence-animation' }]
  );
  expect(canvasExportIdentity(document, output)).toEqual({ title: '我的角色', direction: '左' });
});

test('first-last frame follows the explicit first image, not document ordering', () => {
  const preset = canvasPresets()[2];
  const document = documentFor([...preset.nodes].reverse(), preset.edges);
  const output = document.nodes.find((node) => node.type === 'animation')!;
  expect(canvasExportIdentity(document, output).title).toBe('首帧 · 四足灰狼');
});

test('ambiguous references, missing sources and cycles fall back without guessing prompts', () => {
  const first = card('first', '猫咪');
  const second = card('second', '豹子');
  const output = card('output', '合成结果', 'video');
  output.generation = { prompt: 'a cat facing left' };
  const document = documentFor(
    [first, second, output],
    [
      { id: 'one', from: first.id, to: output.id, kind: 'image-to-video' },
      { id: 'two', from: second.id, to: output.id, kind: 'image-to-video' },
    ]
  );
  expect(canvasExportIdentity(document, output)).toEqual({ title: '合成结果', direction: '' });
  document.edges = [{ id: 'missing', from: 'deleted', to: output.id, kind: 'image-to-video' }];
  expect(canvasExportIdentity(document, output).title).toBe(output.title);
  document.edges = [{ id: 'cycle', from: output.id, to: output.id, kind: 'image-to-video' }];
  expect(canvasExportIdentity(document, output).title).toBe(output.title);
});

test.each([
  '01 蓝银战士 · 生图参考',
  '首帧 · 四足灰狼',
  '../猫咪:run.json',
  'CON',
  '🦁🐺',
  '𠮷野角色',
  '',
])('short safe names for %s', (title) => {
  for (const extension of ['png', 'jpg', 'mp4', 'webm', 'mov', 'zip']) {
    const name = canvasExportFilename(
      { title, direction: '左' },
      extension === 'zip' ? 'atlas' : 'video',
      extension,
      'TH8K2A'
    );
    expect(name.length).toBeLessThanOrEqual(15);
    expect(name.length).toBeGreaterThanOrEqual(5);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
    expect([...name].every((character) => character.charCodeAt(0) >= 32)).toBe(true);
  }
  expect(
    canvasExportFilename({ title: '首帧 · 四足灰狼', direction: '' }, 'atlas', 'zip', 'TH8K2A')
  ).toBe('四足灰集TH8K2A.zip');
});

describe('time code allocation', () => {
  const globals = globalThis as any;
  const originalWindow = globals.window;
  let saved: string | null;
  beforeEach(() => {
    saved = null;
    globals.window = {
      localStorage: {
        getItem: () => saved,
        setItem: (_key: string, value: string) => {
          saved = value;
        },
      },
    };
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 2));
  });
  afterEach(() => {
    globals.window = originalWindow;
    jest.restoreAllMocks();
  });

  test('repeated exports, reloads and clock rollback never reuse the previous code', async () => {
    const codes = await Promise.all(Array.from({ length: 10 }, () => nextCanvasExportCode()));
    delete globals.window.__makerCanvasExportTime;
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 1));
    codes.push(await nextCanvasExportCode());
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z0-9]{6}$/.test(code))).toBe(true);
    expect(parseInt(codes[10], 36)).toBeGreaterThan(parseInt(codes[9], 36));
  });

  test('uses a browser lock to coordinate tabs', async () => {
    const request = jest.fn(async (_name, callback) => callback());
    globals.window.navigator = { locks: { request } };
    await nextCanvasExportCode();
    expect(request).toHaveBeenCalledWith('maker-canvas-export-name', expect.any(Function));
  });

  test('unavailable browser storage still supports repeated exports on this page', async () => {
    Object.defineProperty(globals.window, 'localStorage', {
      get() {
        throw new Error('denied');
      },
    });
    expect(await nextCanvasExportCode()).not.toBe(await nextCanvasExportCode());
  });
});
