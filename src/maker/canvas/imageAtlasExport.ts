declare const document: any;
declare const createImageBitmap: any;
import { createCanvasZip } from './zipArchive.js';
import { createBackgroundRemoval } from './backgroundRemoval.js';

export interface ImageAtlasGrid {
  columns: number;
  rows: number;
  marginX: number;
  marginY: number;
  gapX: number;
  gapY: number;
}

export function imageAtlasRegions(width: number, height: number, grid: ImageAtlasGrid) {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 4096))
    throw new Error('图集尺寸必须为 1～4096 像素。');
  if (
    ![grid.columns, grid.rows].every((value) => Number.isInteger(value) && value > 0) ||
    grid.columns * grid.rows > 120
  )
    throw new Error('行列必须为正整数，最多导出 120 个物品。');
  if (
    ![grid.marginX, grid.marginY, grid.gapX, grid.gapY].every(
      (value) => Number.isInteger(value) && value >= 0
    )
  )
    throw new Error('边距和间距必须为非负整数像素。');
  const usableWidth = width - 2 * grid.marginX - (grid.columns - 1) * grid.gapX;
  const usableHeight = height - 2 * grid.marginY - (grid.rows - 1) * grid.gapY;
  if (usableWidth < grid.columns || usableHeight < grid.rows)
    throw new Error('边距或间距过大，每格至少需要 1 像素。');
  return Array.from({ length: grid.columns * grid.rows }, (_, index) => {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    const left = Math.floor((column * usableWidth) / grid.columns);
    const top = Math.floor((row * usableHeight) / grid.rows);
    return {
      name: 'item_' + String(index + 1).padStart(3, '0'),
      x: grid.marginX + left + column * grid.gapX,
      y: grid.marginY + top + row * grid.gapY,
      width: Math.floor(((column + 1) * usableWidth) / grid.columns) - left,
      height: Math.floor(((row + 1) * usableHeight) / grid.rows) - top,
    };
  });
}

export function imageAtlasManifest(width: number, height: number, grid: ImageAtlasGrid) {
  return {
    frames: Object.fromEntries(
      imageAtlasRegions(width, height, grid).map((region) => [
        region.name,
        {
          frame: { x: region.x, y: region.y, w: region.width, h: region.height },
          sourceSize: { w: region.width, h: region.height },
          spriteSourceSize: { x: 0, y: 0, w: region.width, h: region.height },
          rotated: false,
          trimmed: false,
        },
      ])
    ),
    meta: { image: 'spritesheet.png', size: { w: width, h: height }, scale: '1' },
  };
}

export function imageAtlasInstructions(mode: 'atlas' | 'images', grid: ImageAtlasGrid) {
  return [
    '# Maker 静态物品资源',
    '',
    '排列：' + grid.columns + ' 列 × ' + grid.rows + ' 行。item_001 起，按从左到右、从上到下编号。',
    '保留每格原像素、透明度和留白，不缩放、不裁透明边、不生成动画。',
    '这是规则网格裁切，不是语义识别。导出前请核对网格；跨格、遗漏或多余物品需先调整原图。',
    '裁切不会自动抠背景；需要透明资源时先用画布已有的抠背景功能。',
    '',
    '## 使用',
    '将 items 目录完整放到 Maker 项目的 assets/image/items/；Lua 中不带 assets/ 前缀。',
    '若移动或重命名目录，请同步修改接入代码中的路径。',
    '复用游戏现有的资源预加载；不要把多个物品当作动画帧播放。',
    'local UI = require("urhox-libs/UI")',
    mode === 'atlas'
      ? 'local icon = UI.Sprite({ src = "image/items/spritesheet.json", frame = "item_001", width = 96, height = 96 })'
      : 'local icon = UI.Panel({ width = 96, height = 96, backgroundImage = "image/items/item_001.png", backgroundFit = "contain" })',
    '',
    mode === 'atlas'
      ? 'spritesheet.json 的 frames 为静态命名区域，可供 urhox-libs/Sprite/SpriteSheet 读取；不含 animations。'
      : 'item_001.png 等为独立透明 PNG；index.json 记录单图文件名及其在原图中的区域。也可接入游戏现有的图片控件。',
    '游戏物品名称、属性和上述编号的对应关系由游戏业务配置维护，本导出不会猜测道具类别。',
    '',
  ].join(String.fromCharCode(10));
}

export async function createImageAtlasExport(
  source: Blob,
  grid: ImageAtlasGrid,
  mode: 'atlas' | 'images',
  progress?: (message: string) => void
): Promise<Blob> {
  if (!['atlas', 'images'].includes(mode)) throw new Error('图集导出格式无效。');
  if (!source.size || source.size > 128 * 1024 * 1024) throw new Error('图片为空或超过 128 MiB。');
  const bitmap = await createImageBitmap(source);
  try {
    const regions = imageAtlasRegions(bitmap.width, bitmap.height, grid);
    const entries = [
      { name: 'items/README.md', blob: new Blob([imageAtlasInstructions(mode, grid)]) },
    ];
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图集导出画布。');
    const encode = () =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob: Blob | null) =>
            blob ? resolve(blob) : reject(new Error('图片编码失败，未导出文件。')),
          'image/png'
        )
      );
    if (mode === 'atlas') {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      context.drawImage(bitmap, 0, 0);
      entries.push({ name: 'items/spritesheet.png', blob: await encode() });
      entries.push({
        name: 'items/spritesheet.json',
        blob: new Blob([
          JSON.stringify(imageAtlasManifest(bitmap.width, bitmap.height, grid), null, 2),
        ]),
      });
    } else {
      let bytes = 0;
      for (const region of regions) {
        canvas.width = region.width;
        canvas.height = region.height;
        context.drawImage(
          bitmap,
          region.x,
          region.y,
          region.width,
          region.height,
          0,
          0,
          region.width,
          region.height
        );
        const blob = await encode();
        bytes += blob.size;
        if (bytes > 128 * 1024 * 1024) throw new Error('导出包超过 128 MiB，请减少行列或尺寸。');
        entries.push({ name: 'items/' + region.name + '.png', blob });
        progress?.('正在导出 ' + (entries.length - 1) + '/' + regions.length);
      }
      entries.push({
        name: 'items/index.json',
        blob: new Blob([
          JSON.stringify(
            {
              size: { width: bitmap.width, height: bitmap.height },
              grid,
              items: regions.map((region) => ({ ...region, file: region.name + '.png' })),
            },
            null,
            2
          ),
        ]),
      });
    }
    return await createCanvasZip(entries);
  } finally {
    bitmap.close();
  }
}

export async function splitImageAtlas(
  source: Blob,
  grid: ImageAtlasGrid,
  backgroundColor?: [number, number, number]
) {
  if (!source.size || source.size > 128 * 1024 * 1024) throw new Error('图片为空或超过 128 MiB。');
  const bitmap = await createImageBitmap(source);
  try {
    const regions = imageAtlasRegions(bitmap.width, bitmap.height, grid);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建素材裁切画布。');
    const removal = backgroundColor && createBackgroundRemoval();
    const items = [];
    let bytes = 0;
    for (const region of regions) {
      canvas.width = region.width;
      canvas.height = region.height;
      context.drawImage(
        bitmap,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height
      );
      if (removal) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        removal.process(pixels.data, canvas.width, canvas.height, {
          color: backgroundColor,
          automatic: false,
          mode: 'connected',
          tolerance: 24,
          softness: 12,
          despill: 0.5,
        });
        if (!pixels.data.some((value: number, index: number) => index % 4 === 3 && value > 0))
          throw new Error(
            '图集第 ' + (items.length + 1) + ' 格没有有效内容，资源包未更新。请检查图集和网格。'
          );
        // UI atlases require padding: occupied borders indicate a cut subject or unkeyed background.
        let opaqueBorder = 0;
        let borderPixels = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (x !== 0 && y !== 0 && x !== canvas.width - 1 && y !== canvas.height - 1) continue;
            borderPixels++;
            if (pixels.data[(y * canvas.width + x) * 4 + 3] >= 128) opaqueBorder++;
          }
        }
        if (opaqueBorder / borderPixels > 0.01)
          throw new Error(
            '图集第 ' +
              (items.length + 1) +
              ' 格边界仍有明显内容，可能跨格或底色未去净，资源包未更新。请调整图集或网格。'
          );
        context.putImageData(pixels, 0, 0);
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result: Blob | null) => (result ? resolve(result) : reject(new Error('素材编码失败。'))),
          'image/png'
        )
      );
      bytes += blob.size;
      if (blob.size > 20 * 1024 * 1024 || bytes > 128 * 1024 * 1024)
        throw new Error('素材过大，请减少网格数量或图集尺寸。');
      items.push({ name: region.name, width: region.width, height: region.height, blob });
    }
    return { width: bitmap.width, height: bitmap.height, grid: { ...grid }, items };
  } finally {
    bitmap.close();
  }
}
