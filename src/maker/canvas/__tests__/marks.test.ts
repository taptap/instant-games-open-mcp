import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvasAutomationUi } from '../automationUi.js';
import { prepareCanvasNodeUpdates } from '../automation.js';
import { MakerCanvasFiles } from '../files.js';
import { getCanvasPageHtml } from '../page.js';
import {
  canvasMarkFromInput,
  canvasMarkMoveEndpoint,
  canvasMarkResizeEdge,
  validateCanvasMark,
} from '../marks.js';
import { createId, emptyDocument } from '../model.js';

test('mark style rejects unknown fields and arrow-only direction', () => {
  expect(validateCanvasMark({ shape: 'arrow' })).toEqual({
    shape: 'arrow',
    color: '#ff4d4f',
    stroke: 3,
    point: 'se',
  });
  expect(() => validateCanvasMark({ shape: 'ellipse', point: 'se' })).toThrow('方向');
  expect(() => validateCanvasMark({ shape: 'arrow', color: 'red' })).toThrow('#RRGGBB');
  expect(canvasMarkFromInput({ shape: 'ellipse', x: 12.4, width: 90 }, 'm1')).toMatchObject({
    id: 'm1',
    type: 'mark',
    x: 12,
    width: 90,
    height: 100,
    title: '圈',
    mark: { shape: 'ellipse', stroke: 3 },
  });
});

test('saved marks round-trip and cannot be attached to other cards', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-canvas-mark-')));
  try {
    execFileSync('git', ['init'], { cwd: root });
    fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create('marks', 'empty');
    canvas.nodes = [
      canvasMarkFromInput(
        { shape: 'arrow', x: 30, y: 40, width: 180, height: 70, point: 'nw', color: '#4C9AFF' },
        createId()
      ),
    ];
    const saved = await files.save(canvas.id, canvas, canvas.revision);
    expect((await files.load(saved.id)).nodes[0].mark).toEqual({
      shape: 'arrow',
      color: '#4c9aff',
      stroke: 3,
      point: 'nw',
    });
    await expect(
      files.save(
        saved.id,
        { ...saved, nodes: [{ ...saved.nodes[0], type: 'note', text: '便签' }] },
        saved.revision
      )
    ).rejects.toThrow('只有标注');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI adds a mark and can recolor it without treating it as content', async () => {
  const globals = globalThis as { document?: unknown };
  const previousDocument = globals.document;
  globals.document = { body: { inert: false }, addEventListener: () => undefined };
  const current = emptyDocument();
  const options = {
    current: () => current,
    blocked: () => undefined,
    nodeStatus: () => ({}),
    nodeBlocked: () => false,
    remember: jest.fn(),
    changed: jest.fn(),
    render: jest.fn(),
    save: jest.fn(async () => true),
    select: jest.fn(),
    selected: () => [],
    add: jest.fn(),
    placeMark: () => ({ x: 12, y: 24, width: 180, height: 80 }),
    error: () => '',
    clearError: jest.fn(),
    busyChanged: jest.fn(),
    queue: { view: () => undefined },
  };
  const ui = createCanvasAutomationUi(options as never);
  const command = {
    pageId: 'page',
    canvasId: current.id,
    revision: 0,
    requestId: 'mark-1',
    action: 'add-node',
    input: { type: 'mark', shape: 'arrow', point: 'ne' },
  };
  await ui.execute(command);
  expect(options.add).not.toHaveBeenCalled();
  expect(current.nodes[0]).toMatchObject({
    type: 'mark',
    x: 12,
    y: 24,
    mark: { shape: 'arrow', point: 'ne' },
  });
  const updated = prepareCanvasNodeUpdates(current, {
    nodes: [{ id: current.nodes[0].id, mark: { color: '#3dd68c' }, width: 16 }],
  });
  expect(updated[0].contentChanged).toBe(false);
  expect(updated[0].node.mark).toMatchObject({ color: '#3dd68c', point: 'ne' });
  expect(updated[0].node.width).toBe(16);
  await expect(
    ui.execute({
      ...command,
      requestId: 'run-mark',
      action: 'run',
      input: { id: current.nodes[0].id },
    })
  ).rejects.toThrow('不能执行生成');
  globals.document = previousDocument;
});

test('page exposes toolbar marks and the shared draw path', () => {
  const page = getCanvasPageHtml();
  expect(page).toContain('id="tool-select"');
  expect(page).toContain('id="tool-pan"');
  expect(page).toContain('id="mark-ellipse"');
  expect(page).toContain('id="mark-arrow"');
  expect(page).toContain('function createCanvasMarks');
  expect(page).toContain('function handMode()');
  expect(page).toContain('panning: function () { return space || handMode(); }');
  expect(page).toContain('navigation: function () { return space || handMode(); }');
  expect(page).toContain('beginPan:');
  expect(page).toContain('panBy:');
  expect(page).toContain('pan-tool');
  expect(page).toContain('drawCanvasMark(context, node, x, y, width, height)');
  expect(page).toContain('鼠标');
  expect(page).toContain('拖拽画布');
  expect(page).toContain('标注框');
  expect(page).toContain('place: function (shape)');
  expect(page).toContain('箭头');
  const script = page.slice(
    page.lastIndexOf('<script>') + '<script>'.length,
    page.lastIndexOf('</script>')
  );
  expect(() => new Function(script)).not.toThrow();
});

test('arrow endpoints and box edges adjust independently', () => {
  const arrow = {
    x: 10,
    y: 20,
    width: 220,
    height: 80,
    mark: {
      shape: 'arrow' as const,
      color: '#ff4d4f',
      stroke: 4,
      point: 'se' as const,
      from: { x: 22, y: 40 },
      to: { x: 198, y: 40 },
    },
  };
  canvasMarkMoveEndpoint(arrow, 'to', 40, 180);
  expect(arrow.mark.from.x + arrow.x).toBe(32);
  expect(arrow.mark.to).toEqual({ x: expect.any(Number), y: expect.any(Number) });
  expect(arrow.x + arrow.mark.to.x).toBe(40);
  expect(arrow.y + arrow.mark.to.y).toBe(180);
  const box = { x: 0, y: 0, width: 100, height: 80 };
  canvasMarkResizeEdge(box, 'right', 160, 0);
  canvasMarkResizeEdge(box, 'bottom', 0, 140);
  expect(box).toEqual({ x: 0, y: 0, width: 160, height: 140 });
  canvasMarkResizeEdge(box, 'left', 20, 0);
  expect(box.x).toBe(20);
  expect(box.x + box.width).toBe(160);
});
