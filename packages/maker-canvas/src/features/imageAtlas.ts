import type { ImageAtlasGrid, ImageAtlasCrop } from '../contracts.js';
import { validateAtlasCrops } from './atlasContent.js';

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

export function imageAtlasManifest(
  width: number,
  height: number,
  grid: ImageAtlasGrid,
  crops?: ImageAtlasCrop[]
) {
  return {
    frames: Object.fromEntries(
      (crops
        ? validateAtlasCrops(width, height, crops)
        : imageAtlasRegions(width, height, grid)
      ).map((region: ImageAtlasCrop) => [
        region.name,
        {
          frame: { x: region.x, y: region.y, w: region.width, h: region.height },
          sourceSize: {
            w: region.outputWidth ?? region.width,
            h: region.outputHeight ?? region.height,
          },
          spriteSourceSize: {
            x: region.offsetX || 0,
            y: region.offsetY || 0,
            w: region.width,
            h: region.height,
          },
          rotated: false,
          trimmed:
            (region.outputWidth ?? region.width) !== region.width ||
            (region.outputHeight ?? region.height) !== region.height,
        },
      ])
    ),
    meta: { image: 'spritesheet.png', size: { w: width, h: height }, scale: '1' },
  };
}

export function imageAtlasInstructions(
  mode: 'atlas' | 'images',
  grid: ImageAtlasGrid,
  cutMode: 'grid' | 'content' = 'grid'
) {
  return [
    '# Maker 静态物品资源',
    '',
    cutMode === 'content'
      ? '按已确认的内容区域切图，各图尺寸可能不同，编号顺序与预览一致。'
      : '排列：' +
        grid.columns +
        ' 列 × ' +
        grid.rows +
        ' 行。item_001 起，按从左到右、从上到下编号。',
    '保留原像素与透明度，不缩放、不重绘、不生成动画；规则模式保留单格尺寸。',
    '裁切不识别物品语义，按预览确认的实际区域导出；请核对主体完整、数量和边缘。',
    '选择去底时复用本地纯色去底，未选择时保留原图透明度。',
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
