import type { CanvasTemplateStore } from '../browser/templates.js';
import { renderCanvasMark } from './marks.js';
import { canvasWirePath } from '../core/wirePath.js';
import { resourceBundleOwner } from '../features/resourceBundle.js';
import { configureBundleGallery } from './resourceBundleUi.js';
import { mountTemplateReader } from './templateReader.js';

export function openCanvasTemplatePreview(
  store: CanvasTemplateStore,
  id: string,
  name: string,
  use?: () => void
) {
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
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.className = 'template-close';
  close.setAttribute('aria-label', '关闭');
  close.title = '关闭';
  close.onclick = () => dialog.close();
  heading.after(close);
  if (use) {
    // Adding stays with the library card, so its busy state and errors are the same ones.
    const add = button('使用模板', () => {
      dialog.close();
      use();
    });
    add.className = 'template-add';
  }
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
    if (
      event.button !== 0 ||
      (event.target instanceof Element && event.target.closest('button,summary'))
    )
      return;
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
      if (template.description)
        help.textContent = template.description + ' · 只读预览，滚轮缩放，拖动查看';
      if (template.workflowOverview && store.getPreviewImage) {
        const map = new Image();
        map.alt = template.name + ' · 完整画布结构图';
        map.draggable = false;
        let started = false;
        fit = () => {
          if (!viewport.clientWidth || !viewport.clientHeight) return;
          if (!started) void loadOverview();
          if (!map.naturalWidth) return;
          scale = Math.min(
            1,
            (viewport.clientWidth - 16) / map.naturalWidth,
            (viewport.clientHeight - 16) / map.naturalHeight
          );
          x = (viewport.clientWidth - map.naturalWidth * scale) / 2;
          y = (viewport.clientHeight - map.naturalHeight * scale) / 2;
          paintPreview();
        };
        const loadOverview = async () => {
          started = true;
          status.textContent = '正在加载完整画布结构图…';
          try {
            const blob = await store.getPreviewImage!(
              id,
              template.revision,
              'workflow-overview',
              abort.signal
            );
            if (abort.signal.aborted) return;
            const url = URL.createObjectURL(blob);
            urls.add(url);
            await new Promise<void>((resolve, reject) => {
              map.onload = () => resolve();
              map.onerror = () => reject(new Error('流程图不可用'));
              map.src = url;
            });
            if (abort.signal.aborted) return;
            previewWorld.append(map);
            status.textContent = '';
            fit();
          } catch {
            if (abort.signal.aborted) return;
            const retry = document.createElement('button');
            retry.textContent = '流程图未能加载 · 重试';
            retry.onclick = () => void loadOverview();
            status.replaceChildren(retry);
          }
        };
        resize = new ResizeObserver(fit);
        resize.observe(viewport);
        mountTemplateReader(template, store, dialog, toolbar, viewport, help, abort.signal, fit);
        return;
      }
      const nodes = template.nodes
        .filter((node) => !resourceBundleOwner(template, node.id))
        .map((node) =>
          node.type === 'resource-bundle'
            ? { ...node, width: Math.max(760, node.width), height: Math.max(520, node.height) }
            : node
        );
      const guide = nodes.find((node) => node.type === 'note');
      const cover = nodes.find(
        (node) => node.id === template.coverNodeId && node.title === '示例封面'
      );
      const result = nodes.find((node) => node.id === template.edges[0]?.to);
      const inputs = nodes.filter((node) => template.edges.some((edge) => edge.from === node.id));
      const comparison =
        !!guide &&
        !!result?.imageInfo &&
        inputs.length > 0 &&
        inputs.every((node) => node.type === 'image' && node.imageInfo) &&
        template.edges.every((edge) => edge.kind === 'image-variant' && edge.to === result.id) &&
        nodes.every(
          (node) => node === guide || node === cover || node === result || inputs.includes(node)
        );
      const voxel = template.modelExample === 'voxel';
      const compact = comparison || voxel;
      const cards = new Map<string, HTMLElement>();
      const displayNodes = compact
        ? nodes
            .filter(
              (node) =>
                node !== cover &&
                (!voxel ||
                  node.type !== 'image' ||
                  template.edges.some((edge) => edge.from === node.id || edge.to === node.id))
            )
            .map((node) => ({ ...node }))
        : nodes;
      const inputColumn = document.createElement('div');
      const outputColumn = document.createElement('div');
      if (compact) {
        viewport.classList.add('template-comparison-viewport');
        previewWorld.classList.add('template-comparison');
        if (voxel) previewWorld.classList.add('template-voxel-flow');
        else {
          inputColumn.className = 'template-flow-inputs';
          outputColumn.className = 'template-flow-result';
          if (inputs.length >= 3) inputColumn.classList.add('multiple');
          previewWorld.append(inputColumn, outputColumn);
        }
      }
      fit = () => {
        if (!viewport.clientWidth || !viewport.clientHeight) return;
        if (compact) {
          for (const node of displayNodes) {
            const card = cards.get(node.id)!;
            Object.assign(node, {
              x: card.offsetLeft,
              y: card.offsetTop,
              width: card.offsetWidth,
              height: card.offsetHeight,
            });
          }
          drawWires();
        }
        const left = Math.min(...displayNodes.map((node) => node.x));
        const top = Math.min(...displayNodes.map((node) => node.y));
        const width = Math.max(...displayNodes.map((node) => node.x + node.width)) - left;
        const height = Math.max(...displayNodes.map((node) => node.y + node.height)) - top;
        const padding = compact ? 28 : 64;
        scale = Math.min(
          1,
          Math.max(
            0.02,
            Math.min(
              (viewport.clientWidth - padding) / width,
              (viewport.clientHeight - padding) / height
            )
          )
        );
        x = (viewport.clientWidth - width * scale) / 2 - left * scale;
        y = (viewport.clientHeight - height * scale) / 2 - top * scale;
        paintPreview();
      };
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('template-preview-wires');
      function drawWires() {
        svg.replaceChildren();
        for (const edge of template.edges) {
          if (resourceBundleOwner(template, edge.from)) continue;
          const from = displayNodes.find((node) => node.id === edge.from);
          const to =
            resourceBundleOwner(template, edge.to) ||
            displayNodes.find((node) => node.id === edge.to);
          if (!from || !to) continue;
          const path = document.createElementNS(svg.namespaceURI, 'path');
          path.setAttribute(
            'd',
            canvasWirePath(
              from,
              to,
              displayNodes,
              { x: 0, y: 0, scale: 1 },
              template.edges,
              edge.route
            )
          );
          svg.append(path);
        }
      }
      if (!compact) drawWires();
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
      for (const node of displayNodes) {
        const previewCard = document.createElement('article');
        previewCard.className =
          'template-preview-card' + (node.type === 'section' ? ' preview-section' : '');
        let parent = previewWorld;
        if (compact) {
          cards.set(node.id, previewCard);
          if (voxel) {
            const area =
              node.type === 'model-views'
                ? 'views'
                : node.type === 'model'
                  ? 'model'
                  : node.type === 'note'
                    ? 'guide'
                    : node.id === result?.id
                      ? 'style'
                      : 'input';
            previewCard.style.gridArea = area;
          } else {
            parent = node.id === result?.id || node.id === guide?.id ? outputColumn : inputColumn;
            if (
              parent === inputColumn &&
              node.imageInfo &&
              node.imageInfo.height > node.imageInfo.width
            )
              previewCard.classList.add('portrait-input');
          }
        } else
          Object.assign(previewCard.style, {
            left: node.x + 'px',
            top: node.y + 'px',
            width: node.width + 'px',
            height: node.height + 'px',
          });
        if (node.type === 'mark' && node.mark) {
          renderCanvasMark(previewCard, node);
          previewWorld.append(previewCard);
          continue;
        }
        const title = document.createElement('strong');
        title.textContent = node.title;
        previewCard.append(title);
        if (node.type !== 'section') {
          const content = document.createElement('div');
          content.className = 'template-preview-content';
          if (compact && node.imageInfo)
            content.style.aspectRatio = node.imageInfo.width + ' / ' + node.imageInfo.height;
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
            const retry = () => {
              if (abort.signal.aborted) return;
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = '图片未能显示 · 重试';
              button.onclick = () => {
                queue.push(load);
                pump();
              };
              target.replaceChildren(button);
            };
            const load = async () => {
              target.textContent = '图片加载中…';
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
                img.onerror = retry;
                img.onload = () => target.replaceChildren(img);
                if (frameSet?.frames.length) {
                  img.onload = () => {
                    // Keep a readable resting image instead of shrinking the whole atlas.
                    // Score only tiny samples; never scan the original full-resolution frames.
                    const probe = document.createElement('canvas');
                    probe.width = probe.height = 32;
                    const pixels = probe.getContext('2d', { willReadFrequently: true });
                    const sx = img.naturalWidth / frameSet.width;
                    const sy = img.naturalHeight / frameSet.height;
                    let frame = frameSet.frames[0];
                    let most = -1;
                    if (pixels)
                      for (const candidate of frameSet.frames) {
                        pixels.clearRect(0, 0, 32, 32);
                        pixels.drawImage(
                          img,
                          candidate.x * sx,
                          candidate.y * sy,
                          candidate.width * sx,
                          candidate.height * sy,
                          0,
                          0,
                          32,
                          32
                        );
                        const data = pixels.getImageData(0, 0, 32, 32).data;
                        let shown = 0;
                        for (let offset = 0; offset < data.length; offset += 4)
                          shown +=
                            data[offset + 3] *
                            (64 + Math.max(data[offset], data[offset + 1], data[offset + 2]));
                        if (shown > most) {
                          most = shown;
                          frame = candidate;
                        }
                      }
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    const context = canvas.getContext('2d');
                    if (!context) {
                      target.textContent = '图片不可用';
                      return;
                    }
                    // Preview images may be scaled thumbnails of the original atlas.
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
              } catch {
                retry();
              }
            };
            if (compact) {
              queue.push(load);
              pump();
            } else {
              jobs.set(target, load);
              observer!.observe(target);
            }
          };
          if (
            voxel &&
            (node.type === 'model-views' || node.type === 'model') &&
            store.getPreviewImage
          ) {
            content.style.aspectRatio = node.type === 'model' ? '1' : '960 / 680';
            loadImage(
              content,
              node.id,
              node.type === 'model' ? '塔拉拉最终模型渲染' : '塔拉拉正面、背面、左侧和右侧审核图'
            );
            if (node.type === 'model' && store.modelPreviewUrl) {
              const toggle = document.createElement('button');
              toggle.type = 'button';
              toggle.textContent = '旋转查看 3D 模型';
              toggle.className = 'template-model-toggle';
              toggle.onclick = () => {
                const existing = previewCard.querySelector('iframe');
                if (existing) existing.remove();
                else {
                  const frame = document.createElement('iframe');
                  frame.title = '塔拉拉真实模型预览';
                  frame.src = store.modelPreviewUrl!(template.id, template.revision);
                  previewCard.insertBefore(frame, toggle);
                }
                content.hidden = !existing;
                toggle.textContent = existing ? '旋转查看 3D 模型' : '返回模型渲染图';
              };
              previewCard.append(toggle);
            }
          } else if (
            node.assetPath &&
            ['image', 'sequence', 'animation', 'model-views'].includes(node.type) &&
            store.getPreviewImage
          ) {
            loadImage(
              content,
              node.id,
              node.title,
              undefined,
              ['sequence', 'animation'].includes(node.type) ? node.frameSetInfo : undefined
            );
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
              const gallery = configureBundleGallery(content, node);
              summary.textContent =
                items.length + (gallery ? ' 个 PNG · 分类平铺' : ' 个 PNG · 按分类展开查看全部');
              previewCard.insertBefore(summary, content);
              content.classList.add('template-preview-assets');
              content.addEventListener('wheel', (event) => event.stopPropagation());
              content.addEventListener('pointerdown', (event) => event.stopPropagation());
              const groups = sources.map((source) => {
                const origin = template.nodes.find(
                  (candidate) => candidate.id === source.sourceSnapshot?.nodeId
                );
                const large = ['background', 'panels'].includes(origin?.uiAtlasGroup || '');
                return { source, large, group: origin?.uiAtlasGroup };
              });
              groups.sort((a, b) => Number(a.large) - Number(b.large));
              for (const { source, large, group } of groups) {
                const section = document.createElement('section');
                section.className = 'template-preview-category' + (large ? ' large' : '');
                section.dataset.group = group || '';
                const entries = items.filter((entry) => entry.sourceId === source.id);
                const label = document.createElement('strong');
                label.textContent = source.title + ' · ' + entries.length;
                section.append(label);
                const grid = document.createElement('div');
                grid.className = 'template-preview-asset-grid bundle-tiles';
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
                  (gallery || index < 4 ? grid : remaining).append(cell);
                  loadImage(cell, entry.sourceId, entry.item.name, entry.index);
                });
                if (!gallery && entries.length > 4) section.append(more);
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
        parent.append(previewCard);
      }
      resize = new ResizeObserver(() => fit());
      resize.observe(viewport);
      fit();
      mountTemplateReader(template, store, dialog, toolbar, viewport, help, abort.signal, fit);
    })
    .catch((error) => {
      if (!abort.signal.aborted)
        status.textContent =
          '模板加载失败，请关闭后重试。' + (error instanceof Error ? error.message : '');
    });
}
