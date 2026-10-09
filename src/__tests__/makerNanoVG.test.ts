import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runInNewContext } from 'node:vm';
import {
  checkUiDocument,
  createUiDocument,
  inspectUiDocument,
  patchUiDocument,
} from '../maker/uiEditor/documents';

const web = path.resolve(__dirname, '../maker/uiEditor/web');
const moduleObject = { exports: {} as any };
runInNewContext(
  fs.readFileSync(path.join(web, 'skills/lua-ui-to-json/scripts/ui-json-check.js'), 'utf8'),
  { module: moduleObject }
);
const checker = moduleObject.exports;
const vector = () => ({
  type: 'NanoVG',
  id: 'art',
  width: 400,
  height: 200,
  viewBox: [0, 0, 200, 100],
  commands: [
    ['save'],
    ['translate', 10, 10],
    ['beginPath'],
    ['roundedRect', 0, 0, 160, 60, 8],
    [
      'fillPaint',
      { kind: 'linearGradient', args: [0, 0, 160, 60, [245, 156, 184, 64], '#14121e'] },
    ],
    ['fill'],
    ['restore'],
  ],
});

test('browser, standalone checker and distributed Lua adapter stay identical', () => {
  expect(
    fs.readFileSync(path.join(web, 'skills/lua-ui-to-json/scripts/ui-json-check.js'), 'utf8')
  ).toBe(fs.readFileSync('skills/lua-ui-to-json/scripts/ui-json-check.cjs', 'utf8'));
  expect(fs.readFileSync(path.join(web, 'runtime/MakerNanoVG.lua'), 'utf8')).toBe(
    fs.readFileSync('skills/lua-ui-to-json/runtime/MakerNanoVG.lua', 'utf8')
  );
  const lua = fs.readFileSync('skills/lua-ui-to-json/runtime/MakerNanoVG.lua', 'utf8');
  const signatures = Object.fromEntries(
    [...lua.split('local paints')[0].matchAll(/(\w+) = "([ncsp]*)"/g)].map((m) => [m[1], m[2]])
  );
  expect(signatures).toEqual(checker.nanoOps);
});

test('checks vector data, nested resources and unsafe/unsupported commands', () => {
  expect(checker.checkDocument({ tree: vector() })).toMatchObject({ errors: 0, warnings: 0 });
  for (const commands of [
    [['restore']],
    [['save']],
    [['eval', 'alert(1)']],
    [['constructor']],
    [['circle', 0, 0, -2]],
    [['globalAlpha', 2]],
    [['fillColor', [1, 2, 3, 999]]],
    [['fillPaint', { kind: 'constructor', args: [] }]],
    [['text', 0, 0, {}]],
    [['textBox', 0, 0, 0, 'empty width']],
    [['fillPaint', { kind: 'radialGradient', args: [0, 0, 10, 5, '#ffffff', '#000000'] }]],
  ])
    expect(checker.checkDocument({ tree: { ...vector(), commands } }).errors).toBeGreaterThan(0);
  const tree = {
    ...vector(),
    commands: [
      ['fillPaint', { kind: 'imagePattern', args: [0, 0, 100, 100, 0, '../outside.png', 1] }],
    ],
  };
  expect(checker.checkDocument({ tree }).diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'UI_RESOURCE_PATH' })])
  );
});

test('CLI round trips paths and gradients and rejects missing paint resources without writing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-nanovg-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'));
    const file = 'assets/ui/vector.ui.json';
    expect(await createUiDocument(root, file, vector())).toMatchObject({ ok: true });
    const snapshot = await inspectUiDocument(root, file);
    expect(
      await patchUiDocument(root, file, snapshot.revision, {
        operations: [{ op: 'set', id: 'art', props: { left: 80, width: 600 } }],
      })
    ).toMatchObject({ ok: true });
    const next = await inspectUiDocument(root, file);
    expect(next.tree.commands).toEqual(vector().commands);
    expect(next.tree).toMatchObject({ left: 80, width: 600 });
    const commands = [
      ['fillPaint', { kind: 'imagePattern', args: [0, 0, 100, 100, 0, 'missing.png', 1] }],
    ];
    expect(
      await patchUiDocument(root, file, next.revision, {
        operations: [{ op: 'set', id: 'art', props: { commands } }],
      })
    ).toMatchObject({ ok: false, written: false });
    expect((await inspectUiDocument(root, file)).revision).toBe(next.revision);
    expect(
      await checkUiDocument(root, file, { ...vector(), viewBox: [0, 0, 0, 100] })
    ).toMatchObject({ errors: 1 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('renderer isolates transforms, preserves paths during clipping and restores on failure', () => {
  const calls: any[] = [];
  let depth = 0;
  const ctx: any = new Proxy(
    {
      globalAlpha: 0.5,
      save: () => {
        depth++;
      },
      restore: () => {
        depth--;
      },
      getTransform: () => 'current-transform',
      createLinearGradient: () => ({ addColorStop: (...a: any[]) => calls.push(['stop', ...a]) }),
    },
    {
      get(target: any, key) {
        return key in target ? target[key] : (...a: any[]) => calls.push([key, ...a]);
      },
    }
  );
  const window: any = { UrhoxUICheck: checker };
  class FakePath {
    rect() {}
  }
  runInNewContext(fs.readFileSync(path.join(web, 'src/nanovg.js'), 'utf8'), {
    window,
    Path2D: FakePath,
  });
  const node = { ...vector(), _layout: { x: 25, y: 50, w: 400, h: 200 } };
  node.commands.splice(2, 0, ['scissor', 0, 0, 150, 50]);
  window.UrhoxNanoVG.render(ctx, node, {});
  expect(depth).toBe(0);
  expect(calls).toContainEqual(['translate', 25, 50]);
  expect(calls).toContainEqual(['scale', 2, 2]);
  expect(calls.filter((c) => c[0] === 'beginPath')).toHaveLength(2);
  expect(calls.some((c) => c[0] === 'clip' && c[1] instanceof FakePath)).toBe(true);
  ctx.fill = () => {
    throw new Error('draw failure');
  };
  expect(() => window.UrhoxNanoVG.render(ctx, node, {})).toThrow('draw failure');
  expect(depth).toBe(0);
});

test('multiline text preserves explicit breaks, wraps CJK and aligns within its box', () => {
  const calls: any[] = [];
  const ctx: any = new Proxy(
    {
      globalAlpha: 1,
      getTransform: () => 'transform',
      measureText: (value: string) => ({
        width: Array.from(value).length * 10,
        fontBoundingBoxAscent: 16,
        fontBoundingBoxDescent: 4,
      }),
    },
    {
      get(target: any, key) {
        return key in target ? target[key] : (...a: any[]) => calls.push([key, ...a]);
      },
    }
  );
  const window: any = { UrhoxUICheck: checker };
  runInNewContext(fs.readFileSync(path.join(web, 'src/nanovg.js'), 'utf8'), { window });
  window.UrhoxNanoVG.render(
    ctx,
    {
      ...vector(),
      _layout: { x: 0, y: 0, w: 200, h: 100 },
      commands: [
        ['textAlign', 2 + 8],
        ['textBox', 10, 12, 30, '校园怪谈\nAB CD'],
      ],
    },
    {}
  );
  expect(calls.filter((c) => c[0] === 'fillText')).toEqual([
    ['fillText', '校园怪', 25, 12],
    ['fillText', '谈', 25, 32],
    ['fillText', 'AB', 25, 52],
    ['fillText', 'CD', 25, 72],
  ]);
});
