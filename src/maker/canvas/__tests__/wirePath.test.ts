import { Script } from 'node:vm';
import { canvasWireGeometry, canvasWirePath } from '../wirePath';
import type { CanvasEdge, CanvasNode } from '../model';
import { cloneDocument, emptyDocument } from '../model';
import { getCanvasPageHtml } from '../page';

const view = { x: 0, y: 0, scale: 1 };
const card = (id: string, x: number, y: number, sectionId?: string): CanvasNode => ({
  id,
  x,
  y,
  sectionId,
  type: 'image',
  title: id,
  width: 200,
  height: 150,
});
const link = (to: string): CanvasEdge => ({ id: to, from: 'from', to, kind: 'image-variant' });

test('siblings share a branching level even when one skips a row', () => {
  const from = card('from', 400, 0),
    near = card('near', 0, 500),
    far = card('far', 900, 1000);
  const nodes = [from, near, far],
    edges = [link('near'), link('far')];
  const a = canvasWireGeometry(from, near, nodes, edges);
  const b = canvasWireGeometry(from, far, nodes, edges);
  expect(a.points[1].y).toBe(b.points[1].y);
  expect(a.points[1].y).toBeGreaterThan(150);
  expect(a.points[1].y).toBeLessThan(500);
  expect(b.points.at(-1)).toEqual({ x: 1000, y: 1000 });
  expect(b.points.some((point) => point.x > 1100)).toBe(false);
});

test('gutter clears a group but notes and unrelated groups do not bend wires', () => {
  const from = card('from', 50, 50, 'a'),
    to = card('to', 600, 750, 'b');
  const group = { ...card('a', 0, 0), type: 'section' as const, width: 1000, height: 400 };
  const targetGroup = { ...group, id: 'b', y: 700 };
  const nodes = [from, to, group, targetGroup];
  const geometry = canvasWireGeometry(from, to, nodes);
  expect(geometry.points[1].y).toBe(550);
  const note = { ...card('note', 600, 450), type: 'note' as const };
  const unrelated = { ...group, id: 'unrelated', y: 450, height: 100 };
  expect(canvasWireGeometry(from, to, [...nodes, note, unrelated])).toEqual(geometry);
});

test('skipping a row clears actual cards on the descending leg', () => {
  const from = card('from', 0, 0),
    to = card('to', 500, 1000),
    near = card('near', 0, 400);
  const obstacle = card('obstacle', 500, 400);
  const shape = canvasWireGeometry(
    from,
    to,
    [from, to, near, obstacle],
    [link('to'), link('near')]
  );
  expect(shape.handles[1].x).toBeGreaterThan(obstacle.x + obstacle.width);
});

test.each([false, true])(
  'manual route keeps endpoints attached and respects translation (%s)',
  (horizontal) => {
    const from = card('from', 0, 0),
      to = card('to', 600, horizontal ? 0 : 750);
    const nodes = [from, to];
    const auto = canvasWireGeometry(from, to, nodes);
    const manual = canvasWireGeometry(from, to, nodes, [], { x: 80, y: 40 });
    expect(manual.points[0]).toEqual(auto.points[0]);
    expect(manual.points.at(-1)).toEqual(auto.points.at(-1));
    expect(manual.handles.find((h) => h.axis === 'x')!.x).toBe(
      auto.handles.find((h) => h.axis === 'x')!.x + 80
    );
    expect(manual.handles.find((h) => h.axis === 'y')!.y).toBe(
      auto.handles.find((h) => h.axis === 'y')!.y + 40
    );
    const moved = nodes.map((node) => ({ ...node, x: node.x + 250, y: node.y + 120 }));
    expect(canvasWireGeometry(moved[0], moved[1], moved, [], { x: 80, y: 40 }).points).toEqual(
      manual.points.map((point) => ({ x: point.x + 250, y: point.y + 120 }))
    );
  }
);

test('route clones are independent; straight wires have no redundant corners', () => {
  const doc = emptyDocument('test');
  doc.edges = [{ ...link('to'), route: { x: 10, y: 20 } }];
  const clone = cloneDocument(doc);
  clone.edges[0].route!.x = 100;
  expect(doc.edges[0].route!.x).toBe(10);
  const from = card('from', 0, 0),
    to = card('to', 0, 600);
  expect(canvasWirePath(from, to, [from, to], view)).toBe('M 100 150 L 100 600');
});

test('browser injection parses and includes route controller and shared fanout', () => {
  const html = getCanvasPageHtml();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  expect(() => new Script(script)).not.toThrow();
  expect(html).toContain(
    'canvasWirePath(from, to, documentState.nodes, view, documentState.edges, edge.route)'
  );
  expect(html).toContain('wireUi.sync()');
  expect(html).toContain('createCanvasWireUi');
  const fn = new Script(
    canvasWireGeometry.toString() + ';(' + canvasWirePath.toString() + ')'
  ).runInNewContext();
  const from = card('from', 0, 0),
    to = card('to', 600, 600);
  expect(fn(from, to, [from, to], view)).toBe(canvasWirePath(from, to, [from, to], view));
});
