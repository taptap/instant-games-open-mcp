import { imageRatioInfo } from './imageSizing.js';
import type { CanvasNode } from './model.js';

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

export function renderImageInfo(
  card: HTMLElement,
  target?: string,
  node?: CanvasNode,
  onSize?: () => void
): void {
  const image = card.querySelector('img');
  if (!image) return;
  const label = document.createElement('small');
  label.className = 'image-size-info';
  const assetPath = node?.assetPath;
  const update = () => {
    label.textContent = imageSizeLabel(image.naturalWidth, image.naturalHeight, target);
    if (image.naturalWidth && image.naturalHeight) {
      const info = { width: image.naturalWidth, height: image.naturalHeight };
      const ratio = imageRatioInfo(info);
      if (node && node.assetPath === assetPath) {
        node.imageInfo = info;
        onSize?.();
      }
      label.textContent +=
        ' · ' +
        (ratio.common || ratio.ratio) +
        (ratio.warning ? ' · 非常见比例，可能影响结果' : '');
    }
    label.title = label.textContent + (target ? '；请求：' + target : '');
    label.hidden = !label.textContent;
  };
  image.addEventListener('load', update, { once: true });
  update();
  card.append(label);
}
