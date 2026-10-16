import fs from 'node:fs';
import { createHash } from 'node:crypto';
// @ts-expect-error pngjs does not ship declarations.
import pngjs from 'pngjs';
import type { MakerCanvasFiles } from '../canvas/files.js';
import { validateUiAtlasPlan, type UiAtlasPlan } from '../canvas/uiAssetBindings.js';
import { imageAtlasRegions } from '../canvas/imageAtlasExport.js';

interface Raster {
  width: number;
  height: number;
  data: Buffer;
}
const PNG = pngjs.PNG as { sync: { read(bytes: Buffer): Raster; write(image: Raster): Buffer } };

export function assertUiAtlasSources(files: MakerCanvasFiles, plan: UiAtlasPlan): void {
  for (const source of [plan.bbox.design, plan.bbox.cutSource]) {
    const bytes = fs.readFileSync(files.readMedia(source.path).file);
    const info = files.imageInfo(source.path);
    if (
      createHash('sha256').update(bytes).digest('hex') !== source.sha256 ||
      info?.width !== source.width ||
      info?.height !== source.height
    )
      throw new Error('Bbox 预排来源已变化，请重新识图；尚未提交生图。');
  }
}

/** Derived references never replace the design/cut-source identity used by bindings. */
export async function prepareUiAtlasReference(
  files: MakerCanvasFiles,
  input: UiAtlasPlan,
  width: number,
  height: number,
  color: '#00FF00' | '#FF00FF' | 'transparent' = 'transparent'
): Promise<string> {
  const plan = validateUiAtlasPlan(input);
  if ([plan.grid.marginX, plan.grid.marginY, plan.grid.gapX, plan.grid.gapY].some(Boolean))
    throw new Error('Bbox 预排使用无间距的等分网格，请重新按当前清单分批。');
  if (
    plan.nativeLayout &&
    (width !== plan.nativeLayout.width || height !== plan.nativeLayout.height)
  )
    throw new Error('预排输出尺寸与原尺寸排版不一致，不会缩放坐标。');
  const regions = plan.nativeLayout?.regions || imageAtlasRegions(width, height, plan.grid);
  assertUiAtlasSources(files, plan);
  const textOnly = plan.slots.every((slot) => slot.role === 'text');
  const bytes = fs.readFileSync(
    files.readMedia(textOnly ? plan.bbox.design.path : plan.bbox.cutSource.path).file
  );
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error('Bbox 预排实验模板需要 PNG 去文字图，请转换后重新识图；尚未提交生图。');
  const source = PNG.sync.read(bytes);
  const background = color === '#00FF00' ? [0, 255, 0] : [255, 0, 255];
  const data = Buffer.alloc(width * height * 4);
  if (color !== 'transparent')
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = background[0];
      data[offset + 1] = background[1];
      data[offset + 2] = background[2];
      data[offset + 3] = 255;
    }
  plan.slots.forEach((slot, index) => {
    if (slot.role === 'reserve') return;
    const element = (slot.role === 'text' ? plan.bbox.texts : plan.bbox.elements).find(
      (entry) => entry.id === slot.elementIds[0]
    );
    const rect = element?.bbox || [0, 0, plan.bbox.design.width, plan.bbox.design.height];
    const region = regions[index];
    const scale = Math.min((region.width * 0.8) / rect[2], (region.height * 0.8) / rect[3]);
    const outWidth = plan.nativeLayout ? region.width : Math.max(1, Math.round(rect[2] * scale));
    const outHeight = plan.nativeLayout ? region.height : Math.max(1, Math.round(rect[3] * scale));
    const left = region.x + Math.floor((region.width - outWidth) / 2);
    const top = region.y + Math.floor((region.height - outHeight) / 2);
    const sx = source.width / plan.bbox.design.width;
    const sy = source.height / plan.bbox.design.height;
    const x0 = Math.floor(rect[0] * sx),
      y0 = Math.floor(rect[1] * sy);
    const x1 = Math.min(source.width - 1, Math.ceil((rect[0] + rect[2]) * sx) - 1);
    const y1 = Math.min(source.height - 1, Math.ceil((rect[1] + rect[3]) * sy) - 1);
    for (let y = 0; y < outHeight; y++) {
      for (let x = 0; x < outWidth; x++) {
        const px = Math.max(
          x0,
          Math.min(x1, (rect[0] + ((x + 0.5) * rect[2]) / outWidth) * sx - 0.5)
        );
        const py = Math.max(
          y0,
          Math.min(y1, (rect[1] + ((y + 0.5) * rect[3]) / outHeight) * sy - 0.5)
        );
        const ix = Math.floor(px),
          iy = Math.floor(py);
        const dx = px - ix,
          dy = py - iy;
        const samples = [
          [ix, iy, (1 - dx) * (1 - dy)],
          [Math.min(x1, ix + 1), iy, dx * (1 - dy)],
          [ix, Math.min(y1, iy + 1), (1 - dx) * dy],
          [Math.min(x1, ix + 1), Math.min(y1, iy + 1), dx * dy],
        ];
        const dest = ((top + y) * width + left + x) * 4;
        // Interpolate premultiplied colors, then restore straight alpha for PNG.
        const alpha = samples.reduce(
          (sum, [rx, ry, weight]) =>
            sum + (weight * source.data[(ry * source.width + rx) * 4 + 3]) / 255,
          0
        );
        data[dest + 3] = color === 'transparent' ? Math.round(alpha * 255) : 255;
        for (let channel = 0; channel < 3; channel++) {
          let value = 0;
          for (const [rx, ry, weight] of samples) {
            const offset = (ry * source.width + rx) * 4;
            const sampleAlpha = source.data[offset + 3] / 255;
            value +=
              weight *
              (source.data[offset + channel] * sampleAlpha +
                (color === 'transparent' ? 0 : background[channel] * (1 - sampleAlpha)));
          }
          data[dest + channel] = Math.round(
            color === 'transparent' ? (alpha ? value / alpha : 0) : value
          );
        }
      }
    }
  });
  return (await files.importImage(PNG.sync.write({ width, height, data }))).relativePath;
}
