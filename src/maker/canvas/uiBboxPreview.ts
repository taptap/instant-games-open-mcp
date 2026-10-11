import type { UiBboxDocument } from './uiBbox.js';

export async function openUiBboxPreview(bbox: UiBboxDocument, source: Blob): Promise<void> {
  if (document.querySelector('[data-ui-bbox-preview]')) return;
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await source.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
  if (hash !== bbox.design.sha256) throw new Error('设计稿内容已变化，请重新识别后查看标注。');
  const bitmap = await createImageBitmap(source);
  const matches = bitmap.width === bbox.design.width && bitmap.height === bbox.design.height;
  bitmap.close();
  if (!matches) throw new Error('设计稿尺寸与 Bbox 不匹配，请重新识别。');
  if (document.querySelector('[data-ui-bbox-preview]')) return;
  const dialog = document.createElement('dialog');
  dialog.dataset.uiBboxPreview = 'true';
  dialog.setAttribute('aria-label', 'UI 标注');
  dialog.style.cssText =
    'width:96vw;max-width:1800px;height:92vh;max-height:92vh;box-sizing:border-box;padding:16px;border:1px solid var(--canvas-line,#52606b);border-radius:12px;background:var(--canvas-panel,#151a20);color:var(--canvas-text,#edf2f5)';
  const layout = document.createElement('div');
  layout.style.cssText = 'display:flex;flex-direction:column;gap:12px;height:100%;min-height:0';
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;align-items:center;gap:16px;flex-wrap:wrap';
  const title = document.createElement('strong');
  title.textContent = 'UI 标注';
  controls.append(title);
  const viewport = document.createElement('div');
  viewport.style.cssText =
    'flex:1;min-height:0;overflow:auto;position:relative;background:#0d1117;border-radius:6px';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + bbox.design.width + ' ' + bbox.design.height);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'UI 设计稿与识别标注');
  const url = URL.createObjectURL(source);
  const picture = document.createElementNS(svg.namespaceURI, 'image');
  picture.setAttribute('href', url);
  picture.setAttribute('width', String(bbox.design.width));
  picture.setAttribute('height', String(bbox.design.height));
  svg.append(picture);
  const labels: Element[] = [];
  const addLayer = (items: Array<{ id: string; name: string; bbox: number[] }>, color: string) => {
    const group = document.createElementNS(svg.namespaceURI, 'g');
    for (const item of items) {
      const [left, top, width, height] = item.bbox;
      const box = document.createElementNS(svg.namespaceURI, 'rect');
      for (const [key, value] of Object.entries({ x: left, y: top, width, height }))
        box.setAttribute(key, String(value));
      box.setAttribute('fill', 'none');
      box.setAttribute('stroke', color);
      box.setAttribute('stroke-width', '1.5');
      box.setAttribute('vector-effect', 'non-scaling-stroke');
      const label = document.createElementNS(svg.namespaceURI, 'text');
      label.textContent = item.id + ' · ' + item.name;
      label.setAttribute('x', String(left + 2));
      label.setAttribute('y', String(Math.max(15, top - 4)));
      label.setAttribute('fill', color);
      label.setAttribute('font-size', '15');
      label.setAttribute('stroke', '#101419');
      label.setAttribute('stroke-width', '3');
      label.setAttribute('paint-order', 'stroke');
      labels.push(label);
      group.append(box, label);
    }
    svg.append(group);
    return group;
  };
  const uiLayer = addLayer(bbox.elements, '#36d399');
  const textLayer = addLayer(
    bbox.texts.map((text) => ({ ...text, name: text.text })),
    '#ffd166'
  );
  const checkbox = (name: string, change: (checked: boolean) => void) => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:5px';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.onchange = () => change(input.checked);
    label.append(input, document.createTextNode(name));
    controls.append(label);
  };
  checkbox('UI', (checked) => uiLayer.setAttribute('display', checked ? '' : 'none'));
  checkbox('文本', (checked) => textLayer.setAttribute('display', checked ? '' : 'none'));
  checkbox('名称和编号', (checked) => {
    for (const label of labels) label.setAttribute('display', checked ? '' : 'none');
  });
  let native = false;
  const size = document.createElement('button');
  size.type = 'button';
  size.style.marginLeft = 'auto';
  const resize = () => {
    const scale = native
      ? 1
      : Math.min(
          1,
          viewport.clientWidth / bbox.design.width,
          viewport.clientHeight / bbox.design.height
        );
    svg.style.cssText =
      'display:block;margin:0 auto;width:' +
      bbox.design.width * scale +
      'px;height:' +
      bbox.design.height * scale +
      'px';
    size.textContent = native ? '适应窗口' : '原图尺寸';
  };
  size.onclick = () => {
    native = !native;
    resize();
  };
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭';
  close.onclick = () => dialog.close();
  controls.append(size, close);
  viewport.append(svg);
  layout.append(controls, viewport);
  dialog.append(layout);
  const observer = new ResizeObserver(resize);
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('keyup', (event) => event.stopPropagation());
  dialog.addEventListener(
    'close',
    () => {
      observer.disconnect();
      URL.revokeObjectURL(url);
      dialog.remove();
    },
    { once: true }
  );
  document.body.append(dialog);
  dialog.showModal();
  observer.observe(viewport);
  resize();
}
