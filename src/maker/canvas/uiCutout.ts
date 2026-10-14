import { chooseUiCutoutColor } from '../../../packages/maker-canvas/src/domain.js';
import { withCanvasTimeout } from './requestTimeout.js';
export type { UiCutoutColor } from '../../../packages/maker-canvas/src/domain.js';
export {
  isUiCutoutSource,
  uiCutoutRgb,
  chooseUiCutoutColor,
  uiCutoutPrompt,
} from '../../../packages/maker-canvas/src/domain.js';

export async function detectUiCutoutColor(paths: string[], mediaUrl: (path: string) => string) {
  const samples: Uint8ClampedArray[] = [];
  for (const path of [...new Set(paths)]) {
    const blob = await withCanvasTimeout(async (signal) => {
      const response = await fetch(mediaUrl(path), { signal });
      if (!response.ok) throw new Error('底色分析读取参考图失败，尚未提交生图。');
      return response.blob();
    });
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
