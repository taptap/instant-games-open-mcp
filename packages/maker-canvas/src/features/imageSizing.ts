import type { CanvasImageInfo } from '../contracts.js';
import type { CanvasDocument, CanvasNode } from '../contracts.js';

// Presets for the picker, not a provider capability whitelist.
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
    ratio = imageRatioInfo(original).ratio;
  }
  if (!/^[1-9]\d*:[1-9]\d*$/.test(ratio)) throw new Error('图片生成比例无效：' + ratio);
  const [w, h] = ratio.split(':').map(Number);
  if (![w, h].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new Error('图片生成比例无效：' + ratio);
  if (resolution !== '1K' && resolution !== '2K') throw new Error('图片分辨率无效：' + resolution);
  const side = resolution === '2K' ? 2048 : 1024;
  const width = Math.round((side * w) / Math.max(w, h));
  const height = Math.round((side * h) / Math.max(w, h));
  if (width < 1 || height < 1)
    throw new Error('当前分辨率无法保留此比例：输出短边不足 1 像素，请调整分辨率或比例。');
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
