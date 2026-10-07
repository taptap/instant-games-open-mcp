import type { CanvasTemplateStore } from './templates.js';
import { canvasWirePath } from './wirePath.js';

export function openCanvasTemplatePreview(store: CanvasTemplateStore, id: string, name: string) {
  const dialog = document.createElement('dialog');
  dialog.className = 'workflow-template-dialog template-workflow-preview';
  dialog.setAttribute('aria-label', '模板流程预览');
  const heading = document.createElement('h2');
  heading.textContent = name;
  const help = document.createElement('p');
  help.textContent = '只读预览 · 滚轮缩放，拖动画面查看流程';
  const toolbar = document.createElement('div');
  toolbar.className = 'template-preview-toolbar';
  const viewport = document.createElement('div');
  viewport.className = 'template-preview-viewport';
  const previewWorld = document.createElement('div');
  previewWorld.className = 'template-preview-world';
  viewport.append(previewWorld);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = '正在加载模板…';
  dialog.append(heading, help, toolbar, viewport, status);
  const abort = new AbortController();
  const urls = new Set<string>();
  let observer: IntersectionObserver | undefined;
  let resize: ResizeObserver | undefined;
  let fit = () => {};
  let scale = 1,
    x = 0,
    y = 0;
  const meter = document.createElement('span');
  function paintPreview() {
    previewWorld.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
    meter.textContent = Math.round(scale * 100) + '%';
  }
  function zoom(factor: number, px = viewport.clientWidth / 2, py = viewport.clientHeight / 2) {
    const next = Math.min(3, Math.max(0.02, scale * factor));
    x = px - ((px - x) * next) / scale;
    y = py - ((py - y) * next) / scale;
    scale = next;
    paintPreview();
  }
  function button(label: string, action: () => void) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.onclick = action;
    toolbar.append(element);
    return element;
  }
  button('−', () => zoom(1 / 1.25)).setAttribute('aria-label', '缩小');
  toolbar.append(meter);
  button('＋', () => zoom(1.25)).setAttribute('aria-label', '放大');
  button('全景', () => fit());
  const expand = button('铺满窗口', () => {
    const expanded = dialog.classList.toggle('expanded');
    expand.textContent = expanded ? '还原窗口' : '铺满窗口';
    fit();
  });
  const close = button('关闭', () => dialog.close());
  close.className = 'template-preview-close';
  // Keep the underlying canvas shortcuts from editing the document behind the modal.
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('keyup', (event) => event.stopPropagation());
  dialog.addEventListener(
    'close',
    () => {
      abort.abort();
      observer?.disconnect();
      resize?.disconnect();
      for (const url of urls) URL.revokeObjectURL(url);
      dialog.remove();
    },
    { once: true }
  );
  let drag: { x: number; y: number; ox: number; oy: number } | undefined;
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, ox: x, oy: y };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!drag) return;
    x = drag.ox + event.clientX - drag.x;
    y = drag.oy + event.clientY - drag.y;
    paintPreview();
  });
  viewport.addEventListener('lostpointercapture', () => {
    drag = undefined;
  });
  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoom(event.deltaY > 0 ? 1 / 1.12 : 1.12, event.clientX - rect.left, event.clientY - rect.top);
    },
    { passive: false }
  );
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
  void store
    .getTemplate(id)
    .then((template) => {
      if (abort.signal.aborted) return;
      if (!template.nodes.length) {
        status.textContent = '模板暂无卡片。';
        return;
      }
      status.textContent = '';
      const nodes = template.nodes;
      const left = Math.min(...nodes.map((node) => node.x));
      const top = Math.min(...nodes.map((node) => node.y));
      const width = Math.max(...nodes.map((node) => node.x + node.width)) - left;
      const height = Math.max(...nodes.map((node) => node.y + node.height)) - top;
      fit = () => {
        scale = Math.min(
          1,
          Math.max(
            0.02,
            Math.min((viewport.clientWidth - 64) / width, (viewport.clientHeight - 64) / height)
          )
        );
        x = (viewport.clientWidth - width * scale) / 2 - left * scale;
        y = (viewport.clientHeight - height * scale) / 2 - top * scale;
        paintPreview();
      };
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('template-preview-wires');
      for (const edge of template.edges) {
        const from = nodes.find((node) => node.id === edge.from);
        const to = nodes.find((node) => node.id === edge.to);
        if (!from || !to) continue;
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute(
          'd',
          canvasWirePath(from, to, nodes, { x: 0, y: 0, scale: 1 }, template.edges, edge.route)
        );
        svg.append(path);
      }
      previewWorld.append(svg);
      const queue: Array<() => Promise<void>> = [];
      const jobs = new Map<Element, () => Promise<void>>();
      let active = 0;
      function pump() {
        while (!abort.signal.aborted && active < 3 && queue.length) {
          active++;
          void queue.shift()!().finally(() => {
            active--;
            pump();
          });
        }
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const job = jobs.get(entry.target);
            if (!entry.isIntersecting || !job) continue;
            jobs.delete(entry.target);
            observer!.unobserve(entry.target);
            queue.push(job);
          }
          pump();
        },
        { root: viewport }
      );
      const labels: Record<string, string> = {
        image: '图片',
        sequence: '序列帧图集',
        animation: '动画图集',
        'video-source': '视频',
        video: '视频',
        model: '3D 模型',
        'model-views': '多视图',
        'image-assets': 'PNG 资源',
        note: '便签',
      };
      for (const node of nodes) {
        const previewCard = document.createElement('article');
        previewCard.className =
          'template-preview-card' + (node.type === 'section' ? ' preview-section' : '');
        Object.assign(previewCard.style, {
          left: node.x + 'px',
          top: node.y + 'px',
          width: node.width + 'px',
          height: node.height + 'px',
        });
        const title = document.createElement('strong');
        title.textContent = node.title;
        previewCard.append(title);
        if (node.type !== 'section') {
          const content = document.createElement('div');
          content.className = 'template-preview-content';
          content.textContent =
            node.type === 'note' ? node.text || '' : labels[node.type] || node.type;
          previewCard.append(content);
          if (
            node.assetPath &&
            ['image', 'sequence', 'animation'].includes(node.type) &&
            store.getPreviewImage
          ) {
            content.textContent = '图片加载中…';
            jobs.set(previewCard, async () => {
              try {
                const blob = await store.getPreviewImage!(
                  template.id,
                  template.revision,
                  node.id,
                  abort.signal
                );
                if (abort.signal.aborted) return;
                const url = URL.createObjectURL(blob);
                urls.add(url);
                const img = document.createElement('img');
                img.alt = node.title;
                img.draggable = false;
                img.onerror = () => {
                  content.textContent = '图片不可用';
                };
                img.src = url;
                content.replaceChildren(img);
              } catch {
                if (!abort.signal.aborted) content.textContent = '图片不可用';
              }
            });
            observer.observe(previewCard);
          }
        }
        previewWorld.append(previewCard);
      }
      resize = new ResizeObserver(() => fit());
      resize.observe(viewport);
      fit();
    })
    .catch((error) => {
      if (!abort.signal.aborted)
        status.textContent =
          '模板加载失败，请关闭后重试。' + (error instanceof Error ? error.message : '');
    });
}
