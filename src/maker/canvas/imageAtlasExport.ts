declare const document: any;
declare const createImageBitmap: any;
import { createCanvasZip } from './zipArchive.js';
import { uiBindingContentRect } from './uiAssetBindings.js';
import type { UiAtlasPlan } from './uiAssetBindings.js';
import { createBackgroundRemoval } from './backgroundRemoval.js';
import { alignAtlasCells, assignAtlasCellsByCenter, atlasLayoutError } from './atlasAlignment.js';
import type { AtlasAlignedCell } from './atlasAlignment.js';
import { findAtlasContentRegions, validateAtlasCrops } from './atlasContent.js';
import type { ImageAtlasCrop, ImageAtlasCutSettings } from './atlasContent.js';

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

export interface PreparedImageAtlas {
  width: number;
  height: number;
  grid: ImageAtlasGrid;
  mode: 'grid' | 'content';
  regions: ImageAtlasCrop[];
  background: { color?: [number, number, number]; mode: 'all' | 'connected' };
  canvas: HTMLCanvasElement;
}

export async function prepareImageAtlas(
  source: Blob,
  grid: ImageAtlasGrid,
  backgroundColor?: [number, number, number],
  backgroundMode: 'all' | 'connected' = 'connected',
  cut: ImageAtlasCutSettings = {},
  nativePlan?: UiAtlasPlan
): Promise<PreparedImageAtlas> {
  if (!source.size || source.size > 128 * 1024 * 1024) throw new Error('图片为空或超过 128 MiB。');
  if (cut.mode && !['grid', 'content'].includes(cut.mode)) throw new Error('切图模式无效。');
  if (
    cut.expectedCount !== undefined &&
    (!Number.isInteger(cut.expectedCount) || cut.expectedCount < 0 || cut.expectedCount > 120)
  )
    throw new Error('预期数量必须为0～120，0表示不限制。');
  const bitmap = await createImageBitmap(source);
  try {
    const nominal = imageAtlasRegions(bitmap.width, bitmap.height, grid);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建素材裁切画布。');
    context.drawImage(bitmap, 0, 0);
    let pixels: ImageData | undefined;
    if (
      backgroundColor ||
      cut.mode === 'content' ||
      (!grid.marginX && !grid.marginY && !grid.gapX && !grid.gapY)
    ) {
      pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
      if (backgroundColor) {
        createBackgroundRemoval().process(pixels!.data, bitmap.width, bitmap.height, {
          color: backgroundColor,
          automatic: false,
          mode: backgroundMode,
          tolerance: 48,
          softness: 16,
          despill: 0.5,
          edgeDespill: Boolean(nativePlan?.nativeLayout),
        });
        context.putImageData(pixels!, 0, 0);
      }
    }
    const transparent = pixels?.data.some((value, index) => index % 4 === 3 && value === 0);
    let regions: ImageAtlasCrop[] = nominal;
    if (cut.regions !== undefined && cut.mode === 'grid') {
      regions = validateAtlasCrops(bitmap.width, bitmap.height, cut.regions);
      if (regions.length !== nominal.length) throw new Error('规则切图区域数量与网格不一致。');
    } else if (cut.mode === 'content') {
      if (!transparent) throw atlasLayoutError('按内容切图需要透明间隔，请先去除纯色背景。');
      regions =
        cut.regions !== undefined
          ? validateAtlasCrops(bitmap.width, bitmap.height, cut.regions)
          : findAtlasContentRegions(pixels!.data, bitmap.width, bitmap.height);
      if (cut.expectedCount && regions.length !== cut.expectedCount)
        throw atlasLayoutError(
          '预期 ' +
            cut.expectedCount +
            ' 件，实际找到 ' +
            regions.length +
            ' 个候选区域；请调整裁切框或确认数量，不会重新生图。'
        );
    } else if (grid.columns === 1 && grid.rows === 1 && backgroundColor && !cut.mode) {
      // A single background is the whole keyed image. Edge contact is the scene, not a clipped cell.
      regions = [
        {
          name: nominal[0].name,
          x: 0,
          y: 0,
          width: bitmap.width,
          height: bitmap.height,
        },
      ];
    } else if (transparent && !grid.marginX && !grid.marginY && !grid.gapX && !grid.gapY) {
      let aligned: AtlasAlignedCell[];
      try {
        aligned = alignAtlasCells(pixels!.data, bitmap.width, bitmap.height, grid, cut.allowEmpty);
      } catch (error) {
        // Only UI slot sheets may recover. Content order and margin grids stay unchanged.
        if (
          !cut.allowEmpty ||
          !(error instanceof Error) ||
          (error as { code?: string }).code !== 'ATLAS_LAYOUT_INVALID' ||
          (error as { reason?: string }).reason !== 'missing-separator'
        )
          throw error;
        aligned = assignAtlasCellsByCenter(pixels!.data, bitmap.width, bitmap.height, grid, true);
      }
      regions = aligned.map((cell, index) =>
        cell.empty
          ? {
              name: nominal[index].name,
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              outputWidth: nominal[index].width,
              outputHeight: nominal[index].height,
              blank: true,
            }
          : {
              name: nominal[index].name,
              x: cell.x,
              y: cell.y,
              width: cell.width,
              height: cell.height,
              outputWidth: cell.outputWidth ?? nominal[index].width,
              outputHeight: cell.outputHeight ?? nominal[index].height,
              offsetX: cell.dx,
              offsetY: cell.dy,
            }
      );
    } else if (backgroundColor) {
      for (const region of regions) {
        let occupied = false;
        let border = 0;
        for (let row = region.y; row < region.y + region.height; row++)
          for (let column = region.x; column < region.x + region.width; column++) {
            const alpha = pixels!.data[(row * bitmap.width + column) * 4 + 3];
            if (alpha) occupied = true;
            if (
              alpha >= 128 &&
              (row === region.y ||
                column === region.x ||
                row === region.y + region.height - 1 ||
                column === region.x + region.width - 1)
            )
              border++;
          }
        if (!occupied || border / (2 * region.width + 2 * region.height) > 0.01)
          throw atlasLayoutError(
            '图集 ' + region.name + ' 为空或边界穿过素材，请调整裁切框，原资产未替换。'
          );
      }
    }
    if (nativePlan?.nativeLayout) {
      const layout = nativePlan.nativeLayout;
      if (
        layout.width !== bitmap.width ||
        layout.height !== bitmap.height ||
        JSON.stringify(regions) !== JSON.stringify(layout.regions)
      )
        throw new Error('原尺寸状态处理必须使用生成时的图集尺寸与裁切坐标。');
      nativePlan.slots.forEach((slot, index) => {
        if (slot.state !== 'pressed') return;
        const normalIndex = nativePlan.slots.findIndex(
          (candidate) =>
            candidate.state === 'normal' && candidate.elementIds[0] === slot.elementIds[0]
        );
        if (normalIndex < 0) return;
        const normal = regions[normalIndex];
        const pressed = regions[index];
        if (normal.width !== pressed.width || normal.height !== pressed.height)
          throw new Error('按下态与正常态尺寸不一致，不能缩放派生。');
        const statePixels = context.getImageData(normal.x, normal.y, normal.width, normal.height);
        for (let offset = 0; offset < statePixels.data.length; offset += 4) {
          for (let channel = 0; channel < 3; channel++)
            statePixels.data[offset + channel] = Math.round(
              statePixels.data[offset + channel] * 0.8
            );
        }
        context.putImageData(statePixels, pressed.x, pressed.y);
      });
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      grid: { ...grid },
      mode: cut.mode || 'grid',
      regions: validateAtlasCrops(bitmap.width, bitmap.height, regions),
      background: { color: backgroundColor && [...backgroundColor], mode: backgroundMode },
      canvas,
    };
  } finally {
    bitmap.close();
  }
}

export async function encodeImageAtlasRegions(prepared: PreparedImageAtlas) {
  const regions = validateAtlasCrops(prepared.width, prepared.height, prepared.regions);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建素材裁切画布。');
  const items: Array<{
    name: string;
    width: number;
    height: number;
    blob: Blob;
    contentRect?: [number, number, number, number];
  }> = [];
  let bytes = 0;
  for (const region of regions) {
    canvas.width = region.outputWidth ?? region.width;
    canvas.height = region.outputHeight ?? region.height;
    if (!region.blank)
      context.drawImage(
        prepared.canvas,
        region.x,
        region.y,
        region.width,
        region.height,
        region.offsetX || 0,
        region.offsetY || 0,
        region.width,
        region.height
      );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result: Blob | null) => (result ? resolve(result) : reject(new Error('素材编码失败。'))),
        'image/png'
      )
    );
    bytes += blob.size;
    if (blob.size > 20 * 1024 * 1024 || bytes > 128 * 1024 * 1024)
      throw new Error('素材过大，请减少数量或图集尺寸。');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const contentRect = pixels.some((value: number, index: number) => index % 4 === 3 && value >= 8)
      ? uiBindingContentRect(pixels, canvas.width, canvas.height)
      : undefined;
    items.push({
      name: region.name,
      width: canvas.width,
      height: canvas.height,
      blob,
      contentRect,
    });
  }
  return {
    width: prepared.width,
    height: prepared.height,
    grid: { ...prepared.grid },
    regions,
    cutMode: prepared.mode,
    background: structuredClone(prepared.background),
    items,
  };
}

export async function createImageAtlasExport(
  source: Blob,
  grid: ImageAtlasGrid,
  mode: 'atlas' | 'images',
  progress?: (message: string) => void,
  settings: ImageAtlasCutSettings & {
    backgroundColor?: [number, number, number];
    backgroundMode?: 'all' | 'connected';
  } = {},
  reviewed?: PreparedImageAtlas
): Promise<Blob> {
  if (!['atlas', 'images'].includes(mode)) throw new Error('图集导出格式无效。');
  if (!source.size || source.size > 128 * 1024 * 1024) throw new Error('图片为空或超过 128 MiB。');
  const prepared =
    reviewed ||
    (await prepareImageAtlas(
      source,
      grid,
      settings.backgroundColor,
      settings.backgroundMode,
      settings
    ));
  const entries = [
    {
      name: 'items/README.md',
      blob: new Blob([imageAtlasInstructions(mode, grid, prepared.mode)]),
    },
  ];
  if (mode === 'atlas') {
    const blob = await new Promise<Blob>((resolve, reject) =>
      prepared.canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('图集编码失败。'))),
        'image/png'
      )
    );
    entries.push({ name: 'items/spritesheet.png', blob });
    entries.push({
      name: 'items/spritesheet.json',
      blob: new Blob([
        JSON.stringify(
          imageAtlasManifest(prepared.width, prepared.height, grid, prepared.regions),
          null,
          2
        ),
      ]),
    });
  } else {
    const result = await encodeImageAtlasRegions(prepared);
    for (const item of result.items) {
      entries.push({ name: 'items/' + item.name + '.png', blob: item.blob });
      progress?.('正在导出 ' + (entries.length - 1) + '/' + result.items.length);
    }
    entries.push({
      name: 'items/index.json',
      blob: new Blob([
        JSON.stringify(
          {
            size: { width: prepared.width, height: prepared.height },
            grid,
            mode: prepared.mode,
            items: prepared.regions.map((region) => ({ ...region, file: region.name + '.png' })),
          },
          null,
          2
        ),
      ]),
    });
  }
  return createCanvasZip(entries);
}

export async function splitImageAtlas(
  source: Blob,
  grid: ImageAtlasGrid,
  backgroundColor?: [number, number, number],
  backgroundMode: 'all' | 'connected' = 'connected',
  cut: ImageAtlasCutSettings = {},
  reviewed?: PreparedImageAtlas,
  nativePlan?: UiAtlasPlan
) {
  return encodeImageAtlasRegions(
    reviewed ||
      (await prepareImageAtlas(source, grid, backgroundColor, backgroundMode, cut, nativePlan))
  );
}
