import type { CanvasNode } from '../contracts.js';

export function imageCardSize(width: number, imageWidth: number, imageHeight: number) {
  if (![width, imageWidth, imageHeight].every((value) => Number.isFinite(value) && value > 0))
    return;
  const ratio = imageWidth / imageHeight;
  const contentWidth = Math.min(1998, Math.max(118, width - 2));
  const contentHeight = Math.min(1558, contentWidth / ratio);
  if (contentHeight * ratio + 2 < 48) return;
  return { width: contentHeight * ratio + 2, height: contentHeight + 42 };
}

export function fitImageCard(node: CanvasNode): boolean {
  if (node.type !== 'image' || !node.assetPath || !node.imageInfo) return false;
  const size = imageCardSize(node.width, node.imageInfo.width, node.imageInfo.height);
  if (
    !size ||
    (Math.abs(size.width - node.width) < 0.01 && Math.abs(size.height - node.height) < 0.01)
  )
    return false;
  node.width = size.width;
  node.height = size.height;
  return true;
}

export function imageSizeLabel(width: number, height: number, target?: string): string {
  if (!width || !height) return '';
  const actual = width + ' × ' + height;
  const expected = target?.split('x').map(Number);
  return (
    '实际尺寸：' +
    actual +
    (expected?.length === 2 &&
    expected.every((value) => Number.isFinite(value) && value > 0) &&
    (expected[0] !== width || expected[1] !== height)
      ? ' · 与请求尺寸不一致'
      : '')
  );
}
