import { atlasLayoutError } from './atlasAlignment.js';

export interface ImageAtlasCrop {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  outputWidth?: number;
  outputHeight?: number;
  offsetX?: number;
  offsetY?: number;
  blank?: boolean;
}

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
  const rows = new Uint8Array(height);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      if (data[(row * width + column) * 4 + 3]) rows[row] = 1;
  const regions: ImageAtlasCrop[] = [];
  for (const [top, bottom] of bands(rows)) {
    const columns = new Uint8Array(width);
    for (let column = 0; column < width; column++)
      for (let row = top; row < bottom; row++)
        if (data[(row * width + column) * 4 + 3]) columns[column] = 1;
    for (const [left, right] of bands(columns)) {
      let contentTop = bottom;
      let contentBottom = top;
      for (let row = top; row < bottom; row++)
        for (let column = left; column < right; column++)
          if (data[(row * width + column) * 4 + 3]) {
            contentTop = Math.min(contentTop, row);
            contentBottom = Math.max(contentBottom, row + 1);
          }
      if (left === 0 || right === width || contentTop === 0 || contentBottom === height)
        throw atlasLayoutError('素材触及原图边界，无法确认完整；请检查原图，不会重新生图。');
      regions.push({
        name: 'item_' + String(regions.length + 1).padStart(3, '0'),
        x: left,
        y: contentTop,
        width: right - left,
        height: contentBottom - contentTop,
      });
      if (regions.length > 120)
        throw atlasLayoutError('候选区域超过120个，可能存在噪点；请先处理背景。');
    }
  }
  if (!regions.length) throw atlasLayoutError('图集没有可切分的内容。');
  return validateAtlasCrops(width, height, regions);
}
