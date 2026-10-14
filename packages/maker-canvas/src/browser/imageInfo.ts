import type { CanvasNode } from '../contracts.js';
import { imageSizeLabel } from '../features/imageInfo.js';
import { imageRatioInfo } from '../features/imageSizing.js';

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
