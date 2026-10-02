import type { createBackgroundRemoval, BackgroundOptions } from './backgroundRemoval.js';
import type { SequenceFrame } from './sequence.js';

export async function openBackgroundEditor(options: {
  frames: readonly SequenceFrame[];
  currentFrames?: readonly SequenceFrame[];
  index: number;
  removal: ReturnType<typeof createBackgroundRemoval>;
  apply: (frames: SequenceFrame[]) => void;
}) {
  const source = options.frames[options.index];
  if (!source) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'sequence-editor background-editor';
  dialog.setAttribute('aria-label', '自动去背景');
  const header = document.createElement('header');
  header.className = 'sequence-editor-header';
  const title = document.createElement('h2');
  title.textContent = '去背景';
  const body = document.createElement('div');
  body.className = 'background-body';
  const canvas = document.createElement('canvas');
  canvas.className = 'sequence-editor-canvas checkerboard';
  canvas.setAttribute('aria-label', '背景处理预览');
  const panel = document.createElement('aside');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const hint = document.createElement('p');
  hint.textContent =
    '自动模式逐帧识别；识别失败可切换手动固定色，输入颜色或从原图取色。推荐边缘连通保护主体；全图同色可能误删主体。所有处理基于本轮原帧，不累积抠图。';
  const actions = document.createElement('footer');
  actions.className = 'sequence-editor-footer';
  const settings: BackgroundOptions = {
    automatic: true,
    tolerance: 32,
    softness: 24,
    despill: 0.5,
    mode: 'connected',
  };
  let revision = 0;
  let closed = false;
  let applying = false;
  let previewReady = false;
  let showOriginal = false;
  let picking = false;
  let detectedColor = '';
  let original: HTMLCanvasElement | undefined;
  let originalLoading: Promise<HTMLCanvasElement> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  function button(text: string, run: () => void, parent = actions) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.addEventListener('click', run);
    parent.append(element);
    return element;
  }
  function close() {
    if (closed) return;
    closed = true;
    revision++;
    clearTimeout(timer);
    controller.abort();
    dialog.close();
    dialog.remove();
  }
  button('取消', close, header);
  header.prepend(title);
  const current = button('应用到当前帧', () => {
    void apply(false);
  });
  const all = button('批量应用到全部帧', () => {
    void apply(true);
  });
  function update() {
    current.disabled = all.disabled = applying || !previewReady;
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >('input,select,button')
      .forEach((control) => (control.disabled = applying));
    colorInput.disabled = applying || settings.automatic;
    canvas.style.cursor = picking && !applying ? 'crosshair' : 'default';
  }
  function colorHex(color: readonly number[]) {
    return '#' + color.map((channel) => channel.toString(16).padStart(2, '0')).join('');
  }
  function manualColor(): [number, number, number] | undefined {
    const value = colorInput.value.trim();
    if (!/^#[\da-f]{6}$/i.test(value)) return;
    return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  function loadOriginal(): Promise<HTMLCanvasElement> {
    originalLoading ??= (async () => {
      const bitmap = await createImageBitmap(source.blob);
      try {
        const image = document.createElement('canvas');
        image.width = bitmap.width;
        image.height = bitmap.height;
        image.getContext('2d')!.drawImage(bitmap, 0, 0);
        original = image;
        return image;
      } finally {
        bitmap.close();
      }
    })();
    return originalLoading;
  }
  async function drawOriginal(ticket: number) {
    const image = await loadOriginal();
    if (closed || ticket !== revision) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    canvas.dataset.view = 'original';
  }
  async function preview() {
    const ticket = ++revision;
    previewReady = false;
    update();
    try {
      if (picking) {
        await drawOriginal(ticket);
        if (!closed && ticket === revision)
          status.textContent = '请点击原图中的背景取色；留白区域不会取色。';
        return;
      }
      if (!settings.automatic && !settings.color)
        throw new Error('请输入 #RRGGBB 背景色，或点击「从原图取色」。');
      const result = await options.removal.apply(source.blob, { ...settings }, controller.signal);
      if (closed || ticket !== revision) return;
      const bitmap = await createImageBitmap(showOriginal ? source.blob : result.blob);
      try {
        if (closed || ticket !== revision) return;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        canvas.dataset.view = showOriginal ? 'original' : 'result';
        if (settings.automatic) detectedColor = colorHex(result.color);
        status.textContent =
          (settings.automatic ? '当前帧自动识别：' : '手动固定色：') +
          colorHex(result.color) +
          (showOriginal ? ' · 原帧' : ' · 处理预览');
        previewReady = true;
      } finally {
        bitmap.close();
      }
    } catch (error) {
      if (!closed && ticket === revision) {
        status.textContent = error instanceof Error ? error.message : '预览失败，请重试。';
        await drawOriginal(ticket).catch(() => undefined);
      }
    } finally {
      if (!closed && ticket === revision) update();
    }
  }
  function schedule() {
    if (closed || applying) return;
    revision++;
    previewReady = false;
    update();
    clearTimeout(timer);
    timer = setTimeout(() => {
      void preview();
    }, 120);
  }
  const strategy = document.createElement('select');
  strategy.setAttribute('aria-label', '背景颜色模式');
  for (const [value, label] of [
    ['automatic', '自动逐帧识别'],
    ['manual', '手动固定色'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    strategy.append(option);
  }
  const colorInput = document.createElement('input');
  colorInput.type = 'text';
  colorInput.placeholder = '#RRGGBB';
  colorInput.maxLength = 7;
  colorInput.setAttribute('aria-label', '手动背景色 HEX');
  function selectStrategy() {
    settings.automatic = strategy.value === 'automatic';
    if (settings.automatic) delete settings.color;
    else {
      if (!colorInput.value) colorInput.value = detectedColor;
      settings.color = manualColor();
    }
    picking = false;
    showOriginal = false;
    schedule();
  }
  strategy.addEventListener('change', selectStrategy);
  colorInput.addEventListener('input', () => {
    settings.color = manualColor();
    picking = false;
    showOriginal = false;
    schedule();
  });
  panel.append(strategy, colorInput);
  button(
    '从原图取色',
    () => {
      if (closed || applying) return;
      strategy.value = 'manual';
      settings.automatic = false;
      settings.color = manualColor();
      picking = true;
      showOriginal = true;
      schedule();
    },
    panel
  );
  canvas.addEventListener('click', (event) => {
    if (closed || applying || !picking || !original || canvas.dataset.view !== 'original') return;
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.min(bounds.width / original.width, bounds.height / original.height);
    if (!(scale > 0)) return;
    const horizontal =
      (event.clientX - bounds.left - (bounds.width - original.width * scale) / 2) / scale;
    const vertical =
      (event.clientY - bounds.top - (bounds.height - original.height * scale) / 2) / scale;
    if (
      horizontal < 0 ||
      vertical < 0 ||
      horizontal >= original.width ||
      vertical >= original.height
    )
      return;
    const pixel = original
      .getContext('2d')!
      .getImageData(Math.floor(horizontal), Math.floor(vertical), 1, 1).data;
    if (!pixel[3]) {
      status.textContent = '该像素透明，请选择原图中有颜色的背景。';
      return;
    }
    settings.color = [pixel[0], pixel[1], pixel[2]];
    colorInput.value = colorHex(settings.color);
    picking = false;
    showOriginal = false;
    schedule();
  });
  function range(
    label: string,
    key: 'tolerance' | 'softness' | 'despill',
    max: number,
    step: number
  ) {
    const wrapper = document.createElement('label');
    wrapper.className = 'sequence-editor-field';
    const caption = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(max);
    input.step = String(step);
    input.value = String(settings[key]);
    input.setAttribute('aria-label', label);
    const refresh = () => {
      caption.textContent = label + ' · ' + input.value;
    };
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      refresh();
      schedule();
    });
    refresh();
    wrapper.append(caption, input);
    panel.append(wrapper);
  }
  range('颜色容差', 'tolerance', 150, 1);
  range('边缘过渡', 'softness', 80, 1);
  range('去溢色强度', 'despill', 1, 0.05);
  const mode = document.createElement('select');
  mode.setAttribute('aria-label', '背景处理范围');
  for (const [value, text] of [
    ['connected', '仅边缘连通背景（推荐）'],
    ['all', '全图同色（可能误删主体）'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    mode.append(option);
  }
  mode.addEventListener('change', () => {
    settings.mode = mode.value as BackgroundOptions['mode'];
    schedule();
  });
  panel.append(mode);
  button(
    '原帧／结果对比',
    () => {
      if (!applying) {
        picking = false;
        showOriginal = !showOriginal;
        schedule();
      }
    },
    panel
  );
  async function apply(batch: boolean) {
    if (closed || applying || !previewReady) return;
    applying = true;
    const ticket = ++revision;
    clearTimeout(timer);
    const appliedSettings = { ...settings };
    update();
    try {
      const frames = (options.currentFrames || options.frames).slice();
      for (let index = 0; index < frames.length; index++) {
        if (closed || controller.signal.aborted || ticket !== revision) return;
        if (!batch && index !== options.index) continue;
        status.textContent = '正在处理第 ' + (index + 1) + ' / ' + frames.length + ' 帧';
        try {
          const result = await options.removal.apply(
            options.frames[index].blob,
            appliedSettings,
            controller.signal
          );
          frames[index] = { ...frames[index], blob: result.blob };
        } catch (error) {
          throw new Error(
            '第 ' + (index + 1) + ' 帧：' + (error instanceof Error ? error.message : '处理失败')
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (closed || controller.signal.aborted || ticket !== revision) return;
      options.apply(frames);
      close();
    } catch (error) {
      if (!closed)
        status.textContent =
          (error instanceof Error ? error.message : '处理失败') + '；原帧集未改变。';
    } finally {
      applying = false;
      if (!closed) update();
    }
  }
  panel.prepend(hint);
  panel.append(status);
  body.append(canvas, panel);
  dialog.append(header, body, actions);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  document.body.append(dialog);
  dialog.showModal();
  await preview();
}
