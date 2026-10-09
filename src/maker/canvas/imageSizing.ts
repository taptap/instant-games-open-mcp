import type { CanvasDocument, CanvasNode } from './model.js';

export interface CanvasImageInfo {
  width: number;
  height: number;
}

export const IMAGE_OUTPUT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
];
export const IMAGE_COMMON_RATIOS = [...IMAGE_OUTPUT_RATIOS, '9:21'];

export function imageRatioInfo(info: CanvasImageInfo) {
  const { width, height } = info;
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error('图片实际尺寸无效，请重新读取原图。');
  const ratio = width / height;
  const common = IMAGE_COMMON_RATIOS.find((value) => {
    const [w, h] = value.split(':').map(Number);
    return Math.abs(ratio / (w / h) - 1) <= 0.01;
  });
  let a = width,
    b = height;
  while (b) [a, b] = [b, a % b];
  return {
    ratio: width / a + ':' + height / a,
    common,
    warning: common
      ? undefined
      : '非常见图片比例 ' + width + '×' + height + '，可能影响生成构图和切图效果。',
  };
}

export function resolveImageSize(
  aspectRatio = '1:1',
  resolution = '1K',
  original?: CanvasImageInfo
) {
  let ratio = aspectRatio;
  if (ratio === 'source') {
    if (!original) throw new Error('跟随原稿需要一张尺寸明确的原图；多原稿时请手动选择输出比例。');
    const info = imageRatioInfo(original);
    if (!info.common || !IMAGE_OUTPUT_RATIOS.includes(info.common))
      throw new Error(
        (info.warning || '原图比例为 ' + info.ratio + '。') +
          ' 当前生图接口不支持跟随此比例，请在生成参数中选择可用比例；尚未提交生图。'
      );
    ratio = info.common;
  }
  if (!IMAGE_OUTPUT_RATIOS.includes(ratio)) throw new Error('不支持的图片生成比例：' + ratio);
  const [w, h] = ratio.split(':').map(Number);
  const side = resolution === '2K' ? 2048 : 1024;
  const width = Math.round((side * w) / Math.max(w, h));
  const height = Math.round((side * h) / Math.max(w, h));
  return { aspectRatio: ratio, width, height, targetSize: width + 'x' + height };
}

/** Resolve one original through existing references; ambiguous roots must not silently pick one. */
export function canvasOriginalImage(
  document: CanvasDocument,
  node: CanvasNode
): CanvasNode | undefined {
  const roots = new Map<string, CanvasNode>();
  const visited = new Set<string>();
  const queue = [node];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    const ids = document.edges.filter((edge) => edge.to === current.id).map((edge) => edge.from);
    const parents = document.nodes.filter((item) => ids.includes(item.id) && item.type === 'image');
    if (parents.length) queue.push(...parents);
    else if (current.type === 'image' && current.assetPath) roots.set(current.id, current);
  }
  return roots.size === 1 ? [...roots.values()][0] : undefined;
}

export function imageResultWarning(
  actual: CanvasImageInfo,
  targetSize?: string
): string | undefined {
  const [width, height] = (targetSize || '').split('x').map(Number);
  if (!width || !height) return;
  if (Math.abs(actual.width / actual.height / (width / height) - 1) > 0.01)
    return (
      '生成结果比例与请求不一致：实际 ' +
      actual.width +
      '×' +
      actual.height +
      '，请求 ' +
      targetSize +
      '；请核对构图后再继续。'
    );
}
