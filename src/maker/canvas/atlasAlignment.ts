import type { ImageAtlasGrid } from './imageAtlasExport.js';

export function atlasLayoutError(message: string): Error {
  return Object.assign(new Error(message), { code: 'ATLAS_LAYOUT_INVALID' });
}

/** Find empty separators in a keyed UI atlas, retaining the configured row-major order. */
export function alignAtlasCells(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  grid: ImageAtlasGrid
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
      if (best < 0) throw atlasLayoutError('素材之间没有可靠的透明分隔，无法完整切图。');
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
      if (right < 0) throw atlasLayoutError('图集第 ' + (cells.length + 1) + ' 格没有有效内容。');
      if (left === 0 || top === 0 || right === width - 1 || bottom === height - 1)
        throw atlasLayoutError('素材触及原图边界，无法确认主体完整，资源包未更新。');
      const x = Math.floor((column * width) / grid.columns);
      const y = Math.floor((row * height) / grid.rows);
      const w = Math.floor(((column + 1) * width) / grid.columns) - x;
      const h = Math.floor(((row + 1) * height) / grid.rows) - y;
      const contentWidth = right - left + 1,
        contentHeight = bottom - top + 1;
      if (contentWidth > w - 2 || contentHeight > h - 2)
        throw atlasLayoutError(
          '图集第 ' + (cells.length + 1) + ' 格素材超过格子容量，无法无损对齐。'
        );
      // Preserve original placement whenever it fits; translate only overflowing content.
      cells.push({
        x: left,
        y: top,
        width: contentWidth,
        height: contentHeight,
        dx: Math.max(1, Math.min(w - contentWidth - 1, left - x)),
        dy: Math.max(1, Math.min(h - contentHeight - 1, top - y)),
      });
    }
  }
  return cells;
}
