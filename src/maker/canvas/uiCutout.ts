import { detectUiCutoutColorFromReader } from '../../../packages/maker-canvas/src/browser/uiCutout.js';
export type { UiCutoutColor } from '../../../packages/maker-canvas/src/domain.js';
export {
  isUiCutoutSource,
  uiCutoutRgb,
  chooseUiCutoutColor,
  uiCutoutPrompt,
} from '../../../packages/maker-canvas/src/domain.js';

export function detectUiCutoutColor(paths: string[], mediaUrl: (path: string) => string) {
  return detectUiCutoutColorFromReader(paths, async (path, signal) => {
    const response = await fetch(mediaUrl(path), { signal });
    if (!response.ok) throw new Error('底色分析读取参考图失败，尚未提交生图。');
    return response.blob();
  });
}
