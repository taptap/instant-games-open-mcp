import { chooseUiCutoutColor } from '../features/uiCutout.js';
import { withCanvasTimeout } from './requestTimeout.js';
export async function detectUiCutoutColorFromReader(
  paths: string[],
  readSource: (path: string, signal: AbortSignal) => Promise<Blob>
) {
  const samples: Uint8ClampedArray[] = [];
  for (const path of [...new Set(paths)]) {
    const blob = await withCanvasTimeout((signal) => readSource(path, signal));
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法分析参考图底色。');
      ctx.drawImage(bitmap, 0, 0, 128, 128);
      samples.push(ctx.getImageData(0, 0, 128, 128).data);
    } finally {
      bitmap.close();
    }
  }
  return chooseUiCutoutColor(samples);
}
