import type { ImageAtlasGrid, ImageAtlasCrop, UiAtlasPlan } from '../contracts.js';
import {
  imageAtlasRegions,
  imageAtlasManifest,
  imageAtlasInstructions,
} from '../features/imageAtlas.js';
import { createCanvasZip } from './zipArchive.js';
import { uiBindingContentRect, validateUiNativeRegions } from '../features/uiAssetBindings.js';
import { createBackgroundRemoval } from './backgroundRemoval.js';
import {
  alignAtlasCells,
  alignNativeAtlasRegions,
  assignAtlasCellsByCenter,
  atlasLayoutError,
} from '../features/atlasAlignment.js';
import type { AtlasAlignedCell } from '../features/atlasAlignment.js';
import { findAtlasContentRegions, validateAtlasCrops } from '../features/atlasContent.js';
import type { ImageAtlasCutSettings } from '../features/atlasContent.js';

declare const document: any;
declare const createImageBitmap: any;

export interface PreparedImageAtlas {
  width: number;
  height: number;
  grid: ImageAtlasGrid;
  mode: 'grid' | 'content';
  regions: ImageAtlasCrop[];
  /** Native slot matching failed; the preview stays editable but cannot be exported. */
  alignmentError?: string;
  background: { color?: [number, number, number]; mode: 'all' | 'connected' };
  canvas: HTMLCanvasElement;
}

export async function prepareImageAtlas(
  source: Blob,
  grid: ImageAtlasGrid,
  backgroundColor?: [number, number, number],
  backgroundMode: 'all' | 'connected' = 'connected',
  cut: ImageAtlasCutSettings = {},
  nativePlan?: UiAtlasPlan,
  /** User-edited native crops use the original pixels; automatic matching must not veto them. */
  manualNative = false
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
      nativePlan?.nativeLayout ||
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
    let alignmentError: string | undefined;
    if (nativePlan?.nativeLayout) {
      const layout = nativePlan.nativeLayout;
      if (layout.width !== bitmap.width || layout.height !== bitmap.height)
        throw new Error('原尺寸状态处理必须使用生成时的图集尺寸。');
      regions = validateUiNativeRegions(nativePlan, regions);
      try {
        const aligned = manualNative
          ? undefined
          : alignNativeAtlasRegions(pixels!.data, bitmap.width, bitmap.height, nativePlan, regions);
        if (aligned) {
          // Redraw each matched subject (with its own pixel mask) inside its planned slot.
          const isolated = document.createElement('canvas');
          const isolatedContext = isolated.getContext('2d');
          context.clearRect(0, 0, canvas.width, canvas.height);
          aligned.placements.forEach((placement, index) => {
            if (!placement) return;
            const { source: from, target: to } = placement;
            isolated.width = from.width;
            isolated.height = from.height;
            const content = isolatedContext.createImageData(from.width, from.height);
            for (let y = 0; y < from.height; y++)
              for (let x = 0; x < from.width; x++) {
                const sourcePixel = (from.y + y) * bitmap.width + from.x + x;
                if (aligned.pixelOwners[sourcePixel] !== index + 1) continue;
                const targetPixel = (y * from.width + x) * 4;
                for (let channel = 0; channel < 4; channel++)
                  content.data[targetPixel + channel] = pixels!.data[sourcePixel * 4 + channel];
              }
            isolatedContext.putImageData(content, 0, 0);
            context.drawImage(
              isolated,
              0,
              0,
              from.width,
              from.height,
              to.x,
              to.y,
              to.width,
              to.height
            );
          });
        }
      } catch (error) {
        if ((error as { code?: string }).code !== 'ATLAS_LAYOUT_INVALID') throw error;
        // Keep the original image and editable boxes available in the existing preview.
        alignmentError = (error as Error).message;
      }
      nativePlan.slots.forEach((slot, index) => {
        if (alignmentError || slot.state !== 'pressed') return;
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
      ...(alignmentError ? { alignmentError } : {}),
      background: { color: backgroundColor && [...backgroundColor], mode: backgroundMode },
      canvas,
    };
  } finally {
    bitmap.close();
  }
}

export async function encodeImageAtlasRegions(prepared: PreparedImageAtlas) {
  if (prepared.alignmentError) throw atlasLayoutError(prepared.alignmentError);
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
