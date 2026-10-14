import type { CanvasTemplateStore } from '../browser/templates.js';
import { canvasWirePath } from '../core/wirePath.js';
import { resourceBundleOwner } from '../features/resourceBundle.js';

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
      const nodes = template.nodes
        .filter((node) => !resourceBundleOwner(template, node.id))
        .map((node) =>
          node.type === 'resource-bundle'
            ? { ...node, width: Math.max(760, node.width), height: Math.max(520, node.height) }
            : node
        );
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
        if (resourceBundleOwner(template, edge.from)) continue;
        const from = nodes.find((node) => node.id === edge.from);
        const to =
          resourceBundleOwner(template, edge.to) || nodes.find((node) => node.id === edge.to);
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
          const loadImage = (
            target: HTMLElement,
            sourceId: string,
            title: string,
            itemIndex?: number,
            frameSet?: (typeof node)['frameSetInfo']
          ) => {
            target.textContent = '图片加载中…';
            jobs.set(target, async () => {
              try {
                const blob = await store.getPreviewImage!(
                  template.id,
                  template.revision,
                  sourceId,
                  abort.signal,
                  itemIndex
                );
                if (abort.signal.aborted) return;
                const url = URL.createObjectURL(blob);
                urls.add(url);
                const img = document.createElement('img');
                img.alt = title;
                img.draggable = false;
                img.onerror = () => {
                  target.textContent = '图片不可用';
                };
                if (frameSet?.frames.length) {
                  img.onload = () => {
                    const frame = frameSet.frames[0];
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    const context = canvas.getContext('2d');
                    if (!context) {
                      target.textContent = '图片不可用';
                      return;
                    }
                    // Preview images may be scaled thumbnails of the original atlas.
                    const sx = img.naturalWidth / frameSet.width;
                    const sy = img.naturalHeight / frameSet.height;
                    context.drawImage(
                      img,
                      frame.x * sx,
                      frame.y * sy,
                      frame.width * sx,
                      frame.height * sy,
                      0,
                      0,
                      frame.width,
                      frame.height
                    );
                    canvas.setAttribute('role', 'img');
                    canvas.setAttribute('aria-label', title);
                    target.replaceChildren(canvas);
                  };
                }
                img.src = url;
                target.replaceChildren(img);
              } catch {
                if (!abort.signal.aborted) target.textContent = '图片不可用';
              }
            });
            observer!.observe(target);
          };
          if (
            node.assetPath &&
            ['image', 'sequence', 'animation', 'model-views'].includes(node.type) &&
            store.getPreviewImage
          ) {
            loadImage(content, node.id, node.title);
          } else if (['video', 'video-source'].includes(node.type)) {
            const sequence = nodes.find(
              (source) =>
                source.type === 'sequence' &&
                source.sourceVideoId === node.id &&
                source.assetPath &&
                source.frameSetInfo?.frames.length
            );
            const reference = nodes.find(
              (source) =>
                source.type === 'image' &&
                source.assetPath &&
                template.edges.some(
                  (edge) =>
                    edge.from === source.id &&
                    edge.to === node.id &&
                    ['image-to-video', 'frame-first'].includes(edge.kind)
                )
            );
            const source = sequence || reference;
            if (source && store.getPreviewImage) {
              const summary = document.createElement('small');
              summary.textContent = sequence ? '视频 · 抽帧预览' : '视频 · 输入参考图';
              previewCard.insertBefore(summary, content);
              loadImage(
                content,
                source.id,
                node.title + '静态预览',
                undefined,
                sequence?.frameSetInfo
              );
            } else {
              content.textContent = '暂无视频封面，添加模板后查看或生成视频';
            }
          } else if (['image-assets', 'resource-bundle'].includes(node.type)) {
            const sources =
              node.type === 'image-assets'
                ? [node]
                : template.nodes.filter(
                    (source) =>
                      source.type === 'image-assets' &&
                      template.edges.some(
                        (edge) =>
                          edge.to === node.id &&
                          edge.from === source.id &&
                          edge.kind === 'resource-bundle'
                      )
                  );
            const items = sources.flatMap((source) =>
              (source.imageAssetsInfo?.items || []).map((item, index) => ({
                sourceId: source.id,
                item,
                index,
              }))
            );
            content.textContent = items.length ? '' : '暂无 PNG 示例，完成上游后生成';
            if (items.length && store.getPreviewImage) {
              const summary = document.createElement('small');
              summary.textContent = items.length + ' 个 PNG · 按分类展开查看全部';
              previewCard.insertBefore(summary, content);
              content.classList.add('template-preview-assets');
              content.addEventListener('wheel', (event) => event.stopPropagation());
              content.addEventListener('pointerdown', (event) => event.stopPropagation());
              const groups = sources.map((source) => {
                const origin = template.nodes.find(
                  (candidate) => candidate.id === source.sourceSnapshot?.nodeId
                );
                const large = ['background', 'panels'].includes(origin?.uiAtlasGroup || '');
                return { source, large };
              });
              groups.sort((a, b) => Number(a.large) - Number(b.large));
              for (const { source, large } of groups) {
                const section = document.createElement('section');
                section.className = 'template-preview-category' + (large ? ' large' : '');
                const entries = items.filter((entry) => entry.sourceId === source.id);
                const label = document.createElement('strong');
                label.textContent = source.title + ' · ' + entries.length;
                section.append(label);
                const grid = document.createElement('div');
                grid.className = 'template-preview-asset-grid';
                section.append(grid);
                const more = document.createElement('details');
                const toggle = document.createElement('summary');
                toggle.textContent = '查看全部 ' + entries.length + ' 件';
                const remaining = document.createElement('div');
                remaining.className = 'template-preview-asset-grid';
                more.append(toggle, remaining);
                entries.forEach((entry, index) => {
                  const cell = document.createElement('div');
                  cell.className = 'template-preview-asset';
                  cell.title = entry.item.name;
                  (index < 4 ? grid : remaining).append(cell);
                  loadImage(cell, entry.sourceId, entry.item.name, entry.index);
                });
                if (entries.length > 4) section.append(more);
                content.append(section);
              }
            }
          } else if (
            node.type === 'model' &&
            template.builtin &&
            template.id === '7e1cb6ad-732f-4dc3-a951-000000000004' &&
            store.modelPreviewUrl
          ) {
            const frame = document.createElement('iframe');
            frame.title = node.title + '真实模型预览';
            frame.src = store.modelPreviewUrl(template.id, template.revision);
            content.replaceChildren(frame);
          } else if (node.type !== 'note') {
            content.textContent =
              '暂无' + (labels[node.type] || '结果') + '示例，添加后运行此步骤生成';
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
