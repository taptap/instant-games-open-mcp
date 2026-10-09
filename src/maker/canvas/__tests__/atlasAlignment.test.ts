import { alignAtlasCells } from '../atlasAlignment.js';

const grid = { columns: 2, rows: 2, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
function pixels() {
  const data = new Uint8ClampedArray(100 * 100 * 4);
  const fill = (left: number, top: number, width: number, height: number) => {
    for (let y = top; y < top + height; y++)
      for (let x = left; x < left + width; x++) data[(y * 100 + x) * 4 + 3] = 255;
  };
  return { data, fill };
}

test('finds blank separators for shifted columns without scaling or dropping pixels', () => {
  const { data, fill } = pixels();
  fill(25, 10, 30, 20);
  fill(65, 10, 20, 20);
  fill(20, 65, 35, 20);
  fill(65, 65, 20, 20);
  const cells = alignAtlasCells(data, 100, 100, grid);
  expect(cells.map((cell) => [cell.x, cell.y, cell.width, cell.height])).toEqual([
    [25, 10, 30, 20],
    [65, 10, 20, 20],
    [20, 65, 35, 20],
    [65, 65, 20, 20],
  ]);
  expect(
    cells.every(
      (cell) =>
        cell.dx > 0 && cell.dy > 0 && cell.dx + cell.width < 50 && cell.dy + cell.height < 50
    )
  ).toBe(true);
});

test('preserves placement for already aligned cells', () => {
  const { data, fill } = pixels();
  for (const x of [10, 60]) for (const y of [10, 60]) fill(x, y, 20, 20);
  expect(
    alignAtlasCells(data, 100, 100, grid).every((cell) => cell.dx === 10 && cell.dy === 10)
  ).toBe(true);
});

test.each(['empty', 'joined', 'edge', 'oversized'])(
  'rejects ambiguous or incomplete %s atlases',
  (kind) => {
    const { data, fill } = pixels();
    for (const x of [10, 60]) for (const y of [10, 60]) fill(x, y, 20, 20);
    if (kind === 'empty') data.fill(0);
    if (kind === 'joined') fill(10, 10, 80, 20);
    if (kind === 'edge') fill(0, 10, 20, 20);
    if (kind === 'oversized') fill(2, 10, 51, 20);
    expect(() => alignAtlasCells(data, 100, 100, grid)).toThrow();
    try {
      alignAtlasCells(data, 100, 100, grid);
    } catch (error) {
      expect(error).toMatchObject({ code: 'ATLAS_LAYOUT_INVALID' });
    }
  }
);
