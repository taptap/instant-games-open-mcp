import type { CanvasNode } from './model.js';

export function openAtlasCompare(options: {
  nodes: readonly CanvasNode[];
  mediaUrl: (path: string) => string;
}) {
  const nodes = options.nodes.filter(
    (node) => node.type === 'sequence' && node.assetPath && node.frameSetInfo?.frames.length
  );
  const dialog = document.createElement('dialog');
  dialog.className = 'sequence-editor atlas-compare';
  dialog.setAttribute('aria-label', '图集位置对比');
  const header = document.createElement('header');
  header.className = 'sequence-editor-header';
  const title = document.createElement('h2');
  title.textContent = '图集位置对比';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭';
  header.append(title, close);
  const intro = document.createElement('p');
  intro.textContent =
    '只读对比当前画布已保存的序列帧，最多同时显示 4 组。统一像素比例，以帧底边中心对齐；虚线是参考基线，不是自动识别的脚底。临时偏移不会保存或修改素材。';
  const toolbar = document.createElement('div');
  toolbar.className = 'frame-editor-toolbar';
  const mode = document.createElement('select');
  mode.setAttribute('aria-label', '图集对比模式');
  for (const [value, text] of [
    ['overlay', '透明叠加'],
    ['side', '并排查看'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    mode.append(option);
  }
  const list = document.createElement('div');
  list.className = 'atlas-compare-list';
  const stage = document.createElement('div');
  stage.className = 'atlas-compare-stage checkerboard';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '图集位置对比预览');
  stage.append(canvas);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const colors = ['#efc889', '#82d6cf', '#f59da7', '#a9c6ff'];
  const layers = nodes.map((node, index) => ({
    node,
    selected: index < 2,
    frame: 0,
    x: 0,
    y: 0,
    opacity: 0.65,
    color: colors[index % colors.length],
    image: undefined as HTMLImageElement | undefined,
    loading: undefined as Promise<void> | undefined,
    error: '',
  }));
  let closed = false;
  let revision = 0;
  async function render() {
    const ticket = ++revision;
    const active = layers.filter((layer) => layer.selected);
    status.textContent = active.length ? '正在读取图集…' : '请选择需要对比的图集。';
    await Promise.all(
      active.map(async (layer) => {
        if (layer.image || layer.error) return;
        layer.loading ??= (async () => {
          const image = new Image();
          image.src = options.mediaUrl(layer.node.assetPath!);
          try {
            await image.decode();
            if (!closed) layer.image = image;
          } catch {
            layer.error = layer.node.title + '：图集读取失败，请关闭后重试。';
          }
        })();
        await layer.loading;
      })
    );
    if (closed || ticket !== revision) return;
    const side = mode.value === 'side';
    const width =
      Math.max(320, ...active.map((layer) => layer.node.frameSetInfo!.frames[layer.frame].width)) +
      128;
    const height =
      Math.max(240, ...active.map((layer) => layer.node.frameSetInfo!.frames[layer.frame].height)) +
      128;
    canvas.width = width * (side ? Math.max(1, active.length) : 1);
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    for (let index = 0; index < Math.max(1, side ? active.length : 1); index++) {
      const center = index * width + width / 2;
      context.strokeStyle = '#9da9b5';
      context.setLineDash([6, 6]);
      context.beginPath();
      context.moveTo(center, 0);
      context.lineTo(center, height);
      context.moveTo(index * width, height - 64);
      context.lineTo((index + 1) * width, height - 64);
      context.stroke();
    }
    context.setLineDash([]);
    active.forEach((layer, index) => {
      if (!layer.image) return;
      const frame = layer.node.frameSetInfo!.frames[layer.frame];
      const pane = side ? index * width : 0;
      const left = pane + width / 2 - frame.width / 2 + layer.x;
      const top = height - 64 - frame.height + layer.y;
      context.save();
      context.beginPath();
      context.rect(pane, 0, width, height);
      context.clip();
      context.globalAlpha = side ? 1 : layer.opacity;
      context.drawImage(
        layer.image,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        left,
        top,
        frame.width,
        frame.height
      );
      context.globalAlpha = 1;
      context.strokeStyle = layer.color;
      context.strokeRect(left, top, frame.width, frame.height);
      context.restore();
    });
    status.textContent =
      active
        .map((layer) => layer.error)
        .filter(Boolean)
        .join('；') ||
      (active.length
        ? '相同像素比例 · 偏移仅用于本次对比 · 超出参考区域的内容会裁切显示'
        : '请选择需要对比的图集。');
  }
  const frameSync = document.createElement('input');
  frameSync.type = 'range';
  frameSync.min = '1';
  frameSync.max = String(Math.max(1, ...nodes.map((node) => node.frameSetInfo!.frames.length)));
  frameSync.value = '1';
  frameSync.setAttribute('aria-label', '同步对比帧');
  const frameInputs: HTMLInputElement[] = [];
  frameSync.addEventListener('input', () => {
    layers.forEach((layer, index) => {
      layer.frame = Math.min(
        layer.node.frameSetInfo!.frames.length - 1,
        Number(frameSync.value) - 1
      );
      frameInputs[index].value = String(layer.frame + 1);
    });
    void render();
  });
  mode.addEventListener('change', () => {
    void render();
  });
  toolbar.append(mode, '同步帧号（较短图集停在末帧）', frameSync);
  for (const layer of layers) {
    const row = document.createElement('div');
    row.className = 'atlas-compare-row';
    row.style.borderLeft = '3px solid ' + layer.color;
    const label = document.createElement('label');
    const selected = document.createElement('input');
    selected.type = 'checkbox';
    selected.checked = layer.selected;
    selected.addEventListener('change', () => {
      if (selected.checked && layers.filter((item) => item.selected).length >= 4) {
        selected.checked = false;
        status.textContent = '最多同时对比 4 组，请先取消一组。';
        return;
      }
      layer.selected = selected.checked;
      void render();
    });
    label.append(selected, layer.node.title);
    row.append(label);
    for (const [name, key, min, max, step] of [
      ['帧', 'frame', 1, layer.node.frameSetInfo!.frames.length, 1],
      ['X 偏移', 'x', -2048, 2048, 1],
      ['Y 偏移', 'y', -2048, 2048, 1],
      ['透明度', 'opacity', 0, 1, 0.05],
    ] as const) {
      const field = document.createElement('label');
      field.append(name);
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(key === 'frame' ? 1 : layer[key]);
      input.setAttribute('aria-label', layer.node.title + ' ' + name);
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        const bounded = Math.max(min, Math.min(max, key === 'opacity' ? value : Math.round(value)));
        input.value = String(bounded);
        layer[key] = key === 'frame' ? bounded - 1 : bounded;
        void render();
      });
      if (key === 'frame') frameInputs.push(input);
      field.append(input);
      row.append(field);
    }
    list.append(row);
  }
  if (!nodes.length) list.textContent = '当前画布还没有已保存的序列帧图集，请先保存序列帧结果。';
  function dispose() {
    closed = true;
    revision++;
    layers.forEach((layer) => {
      layer.image = undefined;
    });
    dialog.close();
    dialog.remove();
  }
  close.addEventListener('click', dispose);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dispose();
  });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.append(header, intro, toolbar, list, stage, status);
  document.body.append(dialog);
  dialog.showModal();
  void render();
}
