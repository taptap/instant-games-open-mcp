import type { ImageAtlasGrid } from './imageAtlasExport.js';

export function atlasLayoutError(message: string, reason?: 'missing-separator'): Error {
  return Object.assign(new Error(message), {
    code: 'ATLAS_LAYOUT_INVALID',
    ...(reason ? { reason } : {}),
  });
}

export interface AtlasAlignedCell {
  x: number;
  y: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  empty?: boolean;
  outputWidth?: number;
  outputHeight?: number;
}

/**
 * When a keyed atlas has no full gutter, assign each separated sprite to the planned
 * cell that contains its center. Slot order stays row-major; overlapping or extra
 * sprites in one cell fail instead of being renumbered.
 */
export function assignAtlasCellsByCenter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  grid: ImageAtlasGrid,
  allowEmpty = false
): AtlasAlignedCell[] {
  if (data.length !== width * height * 4) throw new Error('图集像素尺寸无效。');
  const occupied = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel++)
    occupied[pixel] = data[pixel * 4 + 3] >= 8 ? 1 : 0;
  const seen = new Uint8Array(width * height);
  const parts: Array<{
    cx: number;
    cy: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    edge: boolean;
  }> = [];
  for (let start = 0; start < width * height; start++) {
    if (!occupied[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let edge = false;
    while (stack.length) {
      const pixel = stack.pop()!;
      const x = pixel % width;
      const y = (pixel - x) / width;
      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true;
      const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width];
      for (const next of neighbors) {
        if (next < 0 || next >= width * height || seen[next] || !occupied[next]) continue;
        if (Math.abs((next % width) - x) > 1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    // Ignore keying specks. A real UI piece is larger than a few isolated pixels.
    if (area < 24) continue;
    parts.push({ cx: sumX / area, cy: sumY / area, minX, minY, maxX, maxY, edge });
  }
  const cellWidth = width / grid.columns;
  const cellHeight = height / grid.rows;
  const owners: Array<(typeof parts)[number] | undefined> = Array.from(
    { length: grid.columns * grid.rows },
    () => undefined
  );
  for (const part of parts) {
    if (grid.columns * grid.rows > 1 && part.edge)
      throw atlasLayoutError('素材触及原图边界，无法确认主体完整，资源包未更新。');
    const column = Math.min(grid.columns - 1, Math.max(0, Math.floor(part.cx / cellWidth)));
    const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(part.cy / cellHeight)));
    const localX = part.cx - column * cellWidth;
    const localY = part.cy - row * cellHeight;
    const xMargin = Math.max(3, cellWidth * 0.03);
    const yMargin = Math.max(3, cellHeight * 0.03);
    if (
      (column > 0 && localX < xMargin) ||
      (column < grid.columns - 1 && cellWidth - localX < xMargin) ||
      (row > 0 && localY < yMargin) ||
      (row < grid.rows - 1 && cellHeight - localY < yMargin)
    )
      throw atlasLayoutError('素材中心贴在格子线上，无法确定所属槽位，不能改顺序。');
    const index = row * grid.columns + column;
    if (owners[index])
      throw atlasLayoutError('图集第 ' + (index + 1) + ' 格有多块素材，不能合并或改顺序。');
    owners[index] = part;
  }
  return owners.map((part, index) => {
    if (!part) {
      if (!allowEmpty) throw atlasLayoutError('图集第 ' + (index + 1) + ' 格没有有效内容。');
      return { x: 0, y: 0, width: 0, height: 0, dx: 0, dy: 0, empty: true };
    }
    const contentWidth = part.maxX - part.minX + 1;
    const contentHeight = part.maxY - part.minY + 1;
    return {
      x: part.minX,
      y: part.minY,
      width: contentWidth,
      height: contentHeight,
      dx: 1,
      dy: 1,
      outputWidth: contentWidth + 2,
      outputHeight: contentHeight + 2,
    };
  });
}

/** Find empty separators in a keyed UI atlas, retaining the configured row-major order. */
export function alignAtlasCells(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  grid: ImageAtlasGrid,
  allowEmpty = false
) {
  const alpha = (x: number, y: number) => data[(y * width + x) * 4 + 3];
  function cuts(length: number, count: number, occupied: Uint8Array): number[] {
    const result = [0];
    for (let i = 1; i < count; i++) {
      const ideal = Math.floor((i * length) / count);
      const low = Math.max(result[i - 1] + 1, Math.floor(((i - 0.45) * length) / count));
      const high = Math.min(length - 1, Math.ceil(((i + 0.45) * length) / count));
      let best = -1;
      for (let x = low; x < high; x++) {
        if (occupied[x - 1] || occupied[x] || occupied[x + 1]) continue;
        if (best < 0 || Math.abs(x - ideal) < Math.abs(best - ideal)) best = x;
      }
      if (best < 0)
        throw atlasLayoutError('素材之间没有可靠的透明分隔，无法完整切图。', 'missing-separator');
      result.push(best);
    }
    result.push(length);
    return result;
  }
  const rows = new Uint8Array(height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (alpha(x, y)) {
        rows[y] = 1;
        break;
      }
  const ys = cuts(height, grid.rows, rows);
  const cells = [];
  for (let row = 0; row < grid.rows; row++) {
    const columns = new Uint8Array(width);
    for (let x = 0; x < width; x++)
      for (let y = ys[row]; y < ys[row + 1]; y++)
        if (alpha(x, y)) {
          columns[x] = 1;
          break;
        }
    const xs = cuts(width, grid.columns, columns);
    for (let column = 0; column < grid.columns; column++) {
      let left = width,
        top = height,
        right = -1,
        bottom = -1;
      for (let y = ys[row]; y < ys[row + 1]; y++)
        for (let x = xs[column]; x < xs[column + 1]; x++)
          if (alpha(x, y)) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      if (right < 0) {
        if (!allowEmpty)
          throw atlasLayoutError('图集第 ' + (cells.length + 1) + ' 格没有有效内容。');
        cells.push({ x: 0, y: 0, width: 0, height: 0, dx: 0, dy: 0, empty: true });
        continue;
      }
      if (
        grid.columns * grid.rows > 1 &&
        (left === 0 || top === 0 || right === width - 1 || bottom === height - 1)
      )
        throw atlasLayoutError('素材触及原图边界，无法确认主体完整，资源包未更新。');
      const x = Math.floor((column * width) / grid.columns);
      const y = Math.floor((row * height) / grid.rows);
      const w = Math.floor(((column + 1) * width) / grid.columns) - x;
      const h = Math.floor(((row + 1) * height) / grid.rows) - y;
      const contentWidth = right - left + 1,
        contentHeight = bottom - top + 1;
      // A sprite isolated by separators is exported whole, even if it is larger than the equal cell.
      const fits = contentWidth <= w - 2 && contentHeight <= h - 2;
      cells.push({
        x: left,
        y: top,
        width: contentWidth,
        height: contentHeight,
        dx: fits ? Math.max(1, Math.min(w - contentWidth - 1, left - x)) : 1,
        dy: fits ? Math.max(1, Math.min(h - contentHeight - 1, top - y)) : 1,
        ...(fits ? {} : { outputWidth: contentWidth + 2, outputHeight: contentHeight + 2 }),
      });
    }
  }
  return cells;
}
