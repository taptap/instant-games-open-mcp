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

export function renderImageInfo(card: HTMLElement, target?: string): void {
  const image = card.querySelector('img');
  if (!image) return;
  const label = document.createElement('small');
  label.className = 'image-size-info';
  const update = () => {
    label.textContent = imageSizeLabel(image.naturalWidth, image.naturalHeight, target);
    label.title = label.textContent + (target ? '；请求：' + target : '');
    label.hidden = !label.textContent;
  };
  image.addEventListener('load', update, { once: true });
  update();
  card.append(label);
}
