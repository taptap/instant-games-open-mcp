import type { CanvasDocument } from './model.js';
import { isGameUiResource } from './uiWorkflowHandoff.js';
import { withCanvasTimeout } from './requestTimeout.js';

export type UiCutoutColor = '#FF00FF' | '#00FF00';

export function isUiCutoutSource(canvas: CanvasDocument, id: string): boolean {
  return canvas.edges.some(
    (edge) =>
      edge.from === id &&
      edge.kind === 'image-assets' &&
      canvas.nodes.some((node) => node.id === edge.to && isGameUiResource(canvas, node))
  );
}

export function uiCutoutRgb(color?: UiCutoutColor): [number, number, number] {
  return color === '#00FF00' ? [0, 255, 0] : [255, 0, 255];
}

/** Compare saturated reference colors; neutral UI backgrounds do not decide the key. */
export function chooseUiCutoutColor(samples: ArrayLike<number>[]): UiCutoutColor {
  let magentaRisk = 0,
    greenRisk = 0;
  for (const data of samples) {
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (data[i + 3] < 128 || Math.max(r, g, b) - Math.min(r, g, b) < 40) continue;
      magentaRisk += Math.max(0, Math.min(r, b) - g) + Math.max(0, r - g - b * 0.4);
      greenRisk += Math.max(0, g - Math.max(r, b));
    }
  }
  return magentaRisk > greenRisk ? '#00FF00' : '#FF00FF';
}

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

export function uiCutoutPrompt(prompt: string, color: UiCutoutColor): string {
  const name = color === '#00FF00' ? '绿色' : '洋红';
  const rgb = uiCutoutRgb(color).join(',');
  // Normalize the template's background clauses, never replace generic subject color names.
  const base = prompt
    .replace(/\n抠图底色约定：[^\n]*/g, '')
    .replace(/使用纯(?:洋红|绿色)底便于后续透明处理/g, '使用纯' + name + '底便于后续透明处理')
    .replace(/去除与格子边界连通的(?:洋红|绿色)底/g, '去除与格子边界连通的' + name + '底')
    .replace(/(四周至少留(?:10|15)%纯)(?:洋红|绿色)空白/g, '$1' + name + '空白')
    .replace(
      /(所有格外背景必须是平涂|所有格外像素为|All pixels outside these seven small objects are exactly )RGB\([^)]*\)/g,
      '$1RGB(' + rgb + ')'
    )
    .replace(/flat solid #(?:FF00FF|00FF00) background/gi, 'flat solid ' + color + ' background')
    .replace(/(?:magenta|green) space/gi, (color === '#00FF00' ? 'green' : 'magenta') + ' space');
  return (
    base +
    '\n抠图底色约定：所有主体外背景和间隔均为平涂纯' +
    name +
    ' ' +
    color +
    '，RGB(' +
    rgb +
    ')；无背景纹理、渐变、投影或底色反光。保留主体原有配色、描边和字效，不为避开底色改变主体颜色。'
  );
}
