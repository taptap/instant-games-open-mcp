import type { SequenceFrame } from './sequence.js';

export type FrameOperation =
  | {
      type: 'brush' | 'erase';
      points: Array<{ x: number; y: number }>;
      size: number;
      color: string;
    }
  | { type: 'fill' | 'key'; x: number; y: number; tolerance: number }
  | { type: 'flip-x' | 'flip-y' | 'rotate' | 'brightness'; amount: number };

export async function applyFrameOperations(
  blob: Blob,
  operations: readonly FrameOperation[]
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('无法打开帧编辑器。');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  for (const operation of operations) {
    if (operation.type === 'brush' || operation.type === 'erase') {
      context.save();
      context.globalCompositeOperation =
        operation.type === 'erase' ? 'destination-out' : 'source-over';
      context.strokeStyle = operation.color;
      context.fillStyle = operation.color;
      context.lineWidth = Math.max(1, operation.size * Math.min(canvas.width, canvas.height));
      context.lineCap = 'round';
      context.lineJoin = 'round';
      const first = operation.points[0];
      if (first) {
        context.beginPath();
        context.arc(
          first.x * canvas.width,
          first.y * canvas.height,
          context.lineWidth / 2,
          0,
          Math.PI * 2
        );
        context.fill();
        context.beginPath();
        context.moveTo(first.x * canvas.width, first.y * canvas.height);
        for (const point of operation.points)
          context.lineTo(point.x * canvas.width, point.y * canvas.height);
        context.stroke();
      }
      context.restore();
    } else if (operation.type === 'fill' || operation.type === 'key') {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      const start =
        Math.min(canvas.height - 1, Math.max(0, Math.floor(operation.y * canvas.height))) *
          canvas.width +
        Math.min(canvas.width - 1, Math.max(0, Math.floor(operation.x * canvas.width)));
      const color = data.slice(start * 4, start * 4 + 4);
      const matches = (index: number) =>
        Math.max(
          ...[0, 1, 2, 3].map((channel) => Math.abs(data[index * 4 + channel] - color[channel]))
        ) <= operation.tolerance;
      if (operation.type === 'key') {
        for (let index = 0; index < canvas.width * canvas.height; index++)
          if (matches(index)) data[index * 4 + 3] = 0;
      } else {
        const visited = new Uint8Array(canvas.width * canvas.height);
        const queue = new Int32Array(visited.length);
        let read = 0;
        let write = 0;
        const visit = (index: number) => {
          if (visited[index]) return;
          visited[index] = 1;
          if (matches(index)) queue[write++] = index;
        };
        visit(start);
        while (read < write) {
          const index = queue[read++];
          data[index * 4 + 3] = 0;
          const column = index % canvas.width;
          if (column > 0) visit(index - 1);
          if (column < canvas.width - 1) visit(index + 1);
          if (index >= canvas.width) visit(index - canvas.width);
          if (index + canvas.width < visited.length) visit(index + canvas.width);
        }
      }
      context.putImageData(pixels, 0, 0);
    } else if (operation.type === 'brightness') {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        for (let channel = 0; channel < 3; channel++)
          pixels.data[offset + channel] += operation.amount;
      }
      context.putImageData(pixels, 0, 0);
    } else {
      const source = document.createElement('canvas');
      source.width = canvas.width;
      source.height = canvas.height;
      source.getContext('2d')!.drawImage(canvas, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      if (operation.type === 'rotate') {
        context.rotate(Math.PI / 2);
        const scale = Math.min(canvas.width / canvas.height, canvas.height / canvas.width);
        context.scale(scale, scale);
      } else
        context.scale(operation.type === 'flip-x' ? -1 : 1, operation.type === 'flip-y' ? -1 : 1);
      context.drawImage(source, -source.width / 2, -source.height / 2);
      context.restore();
    }
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('无法编码编辑结果。'))),
      'image/png'
    )
  );
}

export async function openFrameEditor(options: {
  frames: readonly SequenceFrame[];
  index: number;
  apply: (frames: SequenceFrame[]) => void;
}) {
  const original = options.frames[options.index];
  if (!original) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'sequence-editor frame-editor';
  dialog.setAttribute('aria-label', '单帧编辑');
  const header = document.createElement('header');
  header.className = 'sequence-editor-header';
  const title = document.createElement('h2');
  title.textContent = '编辑第 ' + (options.index + 1) + ' 帧';
  const toolbar = document.createElement('div');
  toolbar.className = 'frame-editor-toolbar';
  const stage = document.createElement('div');
  stage.className = 'frame-editor-stage checkerboard';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '单帧编辑画板');
  stage.append(canvas);
  const footer = document.createElement('footer');
  footer.className = 'sequence-editor-footer';
  const message = document.createElement('span');
  message.className = 'sequence-editor-status';
  const actions = document.createElement('div');
  actions.className = 'sequence-editor-actions';
  let operations: FrameOperation[] = [];
  let future: FrameOperation[] = [];
  let tool: 'brush' | 'erase' | 'fill' | 'key' = 'erase';
  let busy = false;
  let cancelBatch = false;
  let preview: Blob = original.blob;
  let previewValid = false;
  let points: Array<{ x: number; y: number }> | undefined;
  function button(label: string, action: () => void, parent: HTMLElement = toolbar) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', action);
    parent.append(element);
    return element;
  }
  function controlsDisabled(value: boolean) {
    busy = value;
    for (const element of Array.from(
      dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input')
    ))
      element.disabled = value;
    cancel.disabled = false;
  }
  async function repaint() {
    controlsDisabled(true);
    previewValid = false;
    try {
      preview = await applyFrameOperations(original.blob, operations);
      const bitmap = await createImageBitmap(preview);
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      previewValid = true;
      message.textContent = operations.length + ' 个操作 · 批量按相同位置重放，请检查动作位移';
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : '编辑失败';
    } finally {
      controlsDisabled(false);
      for (const element of Array.from(actions.querySelectorAll<HTMLButtonElement>('button')))
        element.disabled = !previewValid;
    }
  }
  async function commit(operation: FrameOperation) {
    if (busy || operations.length >= 60) return;
    operations.push(operation);
    future = [];
    await repaint();
  }
  function close() {
    if (busy) {
      cancelBatch = true;
      return;
    }
    if (operations.length && !window.confirm('放弃这张帧的未应用编辑？')) return;
    dialog.close();
    dialog.remove();
  }
  header.append(title);
  const cancel = button('取消', close, header);
  for (const [label, value] of [
    ['画笔', 'brush'],
    ['橡皮', 'erase'],
    ['连通透明填充', 'fill'],
    ['全图同色去除', 'key'],
  ] as const) {
    const choice = button(label, () => {
      tool = value;
      updateTools();
    });
    choice.dataset.tool = value;
  }
  function updateTools() {
    for (const element of Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-tool]'))) {
      element.classList.toggle('primary', element.dataset.tool === tool);
      element.setAttribute('aria-pressed', String(element.dataset.tool === tool));
    }
  }
  const color = document.createElement('input');
  color.type = 'color';
  color.value = '#ffffff';
  color.setAttribute('aria-label', '画笔颜色');
  const size = document.createElement('input');
  size.type = 'range';
  size.min = '1';
  size.max = '80';
  size.value = '12';
  size.setAttribute('aria-label', '笔刷尺寸');
  const tolerance = document.createElement('input');
  tolerance.type = 'range';
  tolerance.min = '0';
  tolerance.max = '150';
  tolerance.value = '48';
  tolerance.setAttribute('aria-label', '填充容差');
  toolbar.append('颜色', color, '笔刷', size, '容差', tolerance);
  for (const [label, type, amount] of [
    ['水平翻转', 'flip-x', 0],
    ['垂直翻转', 'flip-y', 0],
    ['旋转 90°', 'rotate', 0],
    ['提亮', 'brightness', 12],
    ['压暗', 'brightness', -12],
  ] as const) {
    button(label, () => {
      void commit({ type, amount });
    });
  }
  button('撤销', () => {
    const last = operations.pop();
    if (last) {
      future.push(last);
      void repaint();
    }
  });
  button('重做', () => {
    const next = future.pop();
    if (next) {
      operations.push(next);
      void repaint();
    }
  });
  button('重置', () => {
    operations = [];
    future = [];
    void repaint();
  });
  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (busy || event.button !== 0) return;
    event.preventDefault();
    if (tool === 'fill' || tool === 'key') {
      void commit({ type: tool, ...point(event), tolerance: Number(tolerance.value) });
      return;
    }
    points = [point(event)];
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!points || busy) return;
    const previous = points[points.length - 1];
    const current = point(event);
    points.push(current);
    const context = canvas.getContext('2d')!;
    context.save();
    context.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    context.lineWidth = Number(size.value);
    context.lineCap = 'round';
    context.strokeStyle = color.value;
    context.beginPath();
    context.moveTo(previous.x * canvas.width, previous.y * canvas.height);
    context.lineTo(current.x * canvas.width, current.y * canvas.height);
    context.stroke();
    context.restore();
  });
  canvas.addEventListener('pointerup', () => {
    if (!points) return;
    const stroke = points;
    points = undefined;
    if (tool === 'brush' || tool === 'erase')
      void commit({
        type: tool,
        points: stroke,
        size: Number(size.value) / Math.min(canvas.width, canvas.height),
        color: color.value,
      });
  });
  canvas.addEventListener('pointercancel', () => {
    points = undefined;
    void repaint();
  });
  button(
    '应用到当前帧',
    () => {
      const frames = options.frames.map((frame, index) =>
        index === options.index ? { ...frame, blob: preview } : frame
      );
      options.apply(frames);
      dialog.close();
      dialog.remove();
    },
    actions
  );
  button(
    '批量应用到全部帧',
    () => {
      if (!operations.length) return;
      if (
        !window.confirm(
          '将这 ' +
            operations.length +
            ' 个操作按相同相对位置应用到全部 ' +
            options.frames.length +
            ' 帧？角色移动时请检查结果。'
        )
      )
        return;
      void (async () => {
        controlsDisabled(true);
        cancelBatch = false;
        try {
          const frames: SequenceFrame[] = [];
          for (let index = 0; index < options.frames.length; index++) {
            if (cancelBatch) throw new Error('批量应用已取消，原帧集未改变。');
            message.textContent = '批量应用 ' + (index + 1) + ' / ' + options.frames.length;
            frames.push({
              ...options.frames[index],
              blob: await applyFrameOperations(options.frames[index].blob, operations),
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          if (cancelBatch) throw new Error('批量应用已取消，原帧集未改变。');
          options.apply(frames);
          dialog.close();
          dialog.remove();
        } catch (error) {
          message.textContent =
            error instanceof Error ? error.message : '批量应用失败，原帧集未改变。';
        } finally {
          controlsDisabled(false);
        }
      })();
    },
    actions
  );
  footer.append(message, actions);
  dialog.append(header, toolbar, stage, footer);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  document.body.append(dialog);
  dialog.showModal();
  updateTools();
  await repaint();
}
