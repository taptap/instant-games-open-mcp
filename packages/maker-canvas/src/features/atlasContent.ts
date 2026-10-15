import type { ImageAtlasCrop } from '../contracts.js';
export type { ImageAtlasCrop } from '../contracts.js';
import { atlasLayoutError } from './atlasAlignment.js';

export interface ImageAtlasCutSettings {
  mode?: 'grid' | 'content';
  regions?: ImageAtlasCrop[];
  expectedCount?: number;
  allowEmpty?: boolean;
}

export function validateAtlasCrops(
  width: number,
  height: number,
  input: unknown
): ImageAtlasCrop[] {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 4096))
    throw new Error('图集尺寸必须为 1～4096 像素。');
  if (!Array.isArray(input) || !input.length || input.length > 120)
    throw new Error('裁切区域必须为 1～120 个。');
  let pixels = 0;
  return input.map((region, index) => {
    if (
      !region ||
      typeof region !== 'object' ||
      Object.keys(region).some(
        (key) =>
          ![
            'name',
            'x',
            'y',
            'width',
            'height',
            'outputWidth',
            'outputHeight',
            'offsetX',
            'offsetY',
            'blank',
          ].includes(key)
      ) ||
      region.name !== 'item_' + String(index + 1).padStart(3, '0') ||
      ![region.x, region.y, region.width, region.height].every(Number.isInteger) ||
      region.x < 0 ||
      region.y < 0 ||
      region.width < 1 ||
      region.height < 1 ||
      region.x + region.width > width ||
      region.y + region.height > height
    )
      throw new Error('裁切区域名称、坐标或尺寸无效。');
    const outputWidth = region.outputWidth ?? region.width;
    const outputHeight = region.outputHeight ?? region.height;
    const offsetX = region.offsetX ?? 0;
    const offsetY = region.offsetY ?? 0;
    if (
      ![outputWidth, outputHeight, offsetX, offsetY].every(Number.isInteger) ||
      outputWidth > 4096 ||
      outputHeight > 4096 ||
      offsetX < 0 ||
      offsetY < 0 ||
      region.width + offsetX > outputWidth ||
      region.height + offsetY > outputHeight
    )
      throw new Error('裁切输出尺寸或偏移无效。');
    pixels += outputWidth * outputHeight;
    if (pixels > 4096 * 4096) throw new Error('裁切输出总像素超过限制。');
    if (region.blank) return { ...region, blank: true };
    for (const previous of input.slice(0, index)) {
      if (previous.blank) continue;
      if (
        region.x < previous.x + previous.width &&
        previous.x < region.x + region.width &&
        region.y < previous.y + previous.height &&
        previous.y < region.y + region.height
      )
        throw new Error('裁切区域重叠，请先合并或调整。');
    }
    return { ...region };
  });
}

export function findAtlasContentRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number
): ImageAtlasCrop[] {
  if (data.length !== width * height * 4) throw new Error('图集像素尺寸无效。');
  function bands(occupied: Uint8Array) {
    const result: Array<[number, number]> = [];
    let start = -1;
    let last = -1;
    for (let position = 0; position < occupied.length; position++) {
      if (!occupied[position]) continue;
      if (start < 0) start = position;
      else if (position - last > 3) {
        result.push([start, last + 1]);
        start = position;
      }
      last = position;
    }
    if (start >= 0) result.push([start, last + 1]);
    return result;
  }
  const regions: ImageAtlasCrop[] = [];
  function split(left: number, top: number, right: number, bottom: number) {
    const rows = new Uint8Array(bottom - top);
    const columns = new Uint8Array(right - left);
    for (let row = top; row < bottom; row++)
      for (let column = left; column < right; column++)
        if (data[(row * width + column) * 4 + 3] >= 8) {
          rows[row - top] = 1;
          columns[column - left] = 1;
        }
    const ys = bands(rows);
    const xs = bands(columns);
    if (!ys.length || !xs.length) return;
    // Recheck both axes inside each strip: a tall sprite must not join stacked neighbors.
    if (ys.length > 1) {
      for (const [start, end] of ys) split(left, top + start, right, top + end);
      return;
    }
    if (xs.length > 1) {
      for (const [start, end] of xs) split(left + start, top, left + end, bottom);
      return;
    }
    const x = left + xs[0][0];
    const y = top + ys[0][0];
    const w = xs[0][1] - xs[0][0];
    const h = ys[0][1] - ys[0][0];
    if (x === 0 || y === 0 || x + w === width || y + h === height)
      throw atlasLayoutError('素材触及原图边界，无法确认完整；请检查原图，不会重新生图。');
    regions.push({ name: '', x, y, width: w, height: h });
    if (regions.length > 120)
      throw atlasLayoutError('候选区域超过120个，可能存在噪点；请先处理背景。');
  }
  split(0, 0, width, height);
  regions.sort((a, b) => a.y - b.y || a.x - b.x);
  regions.forEach((region, index) => {
    region.name = 'item_' + String(index + 1).padStart(3, '0');
  });
  if (!regions.length) throw atlasLayoutError('图集没有可切分的内容。');
  return validateAtlasCrops(width, height, regions);
}
