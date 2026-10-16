import type { CanvasDocument } from '../contracts.js';
import { isGameUiResource } from './uiWorkflow.js';

export type UiCutoutColor = '#FF00FF' | '#00FF00' | 'transparent';

export function isUiCutoutSource(canvas: CanvasDocument, id: string): boolean {
  if (canvas.nodes.find((node) => node.id === id)?.uiAtlasGroup === 'background') return false;
  return canvas.edges.some(
    (edge) =>
      edge.from === id &&
      edge.kind === 'image-assets' &&
      canvas.nodes.some((node) => node.id === edge.to && isGameUiResource(canvas, node))
  );
}

export function uiCutoutRgb(color?: UiCutoutColor): [number, number, number] | undefined {
  if (color === 'transparent') return;
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

export function uiCutoutPrompt(prompt: string, color: UiCutoutColor): string {
  if (color === 'transparent')
    return (
      prompt
        .replace(/\n(?:抠图底色约定|透明输出约定)：[^\n]*/g, '')
        .replace(
          /背景(?:使用|为)?(?:平涂)?纯(?:洋红|绿色)(?:\s*#(?:FF00FF|00FF00))?(?:\s*[，,]?\s*RGB\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))?/gi,
          '背景透明（Alpha=0）'
        )
        .replace(/使用纯(?:洋红|绿色)底便于后续透明处理/g, '直接输出透明背景 PNG')
        .replace(
          /资源卡会自动去除与格子边界连通的(?:洋红|绿色)底再裁切/g,
          '资源卡保留原始透明度裁切'
        )
        .replace(/(四周至少留(?:10|15)%)纯(?:洋红|绿色)空白/g, '$1透明空白')
        .replace(/所有格外背景必须是平涂RGB\([^)]*\)/g, '所有主体外背景和间隔必须透明（Alpha=0）')
        .replace(/flat solid #(?:FF00FF|00FF00) background/gi, 'transparent background (alpha=0)')
        .replace(/(?:magenta|green) space/gi, 'transparent space')
        .replace(
          /All pixels outside these seven small objects are exactly RGB\([^)]*\)/g,
          'All pixels outside these seven small objects have alpha=0'
        ) +
      '\n透明输出约定：输出带真实 Alpha 通道的透明背景 PNG。所有主体外背景、素材间隔和备用格均为 Alpha=0；保留主体原有配色、描边、半透明边缘和字效。不得填充纯色底、白底、黑底或画出棋盘格，不添加背景纹理、渐变、投影或底色反光。环境场景本身属于主体，只将场景外留白透明化。'
    );
  const name = color === '#00FF00' ? '绿色' : '洋红';
  const rgb = uiCutoutRgb(color)!.join(',');
  // Normalize the template's background clauses, never replace generic subject color names.
  const base = prompt
    .replace(/\n抠图底色约定：[^\n]*/g, '')
    .replace(
      /(背景(?:使用|为)?(?:平涂)?纯)(?:洋红|绿色)(?:\s*#(?:FF00FF|00FF00))?(?:\s*[，,]?\s*RGB\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))?/gi,
      '$1' + name + ' ' + color + ' RGB(' + rgb + ')'
    )
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
