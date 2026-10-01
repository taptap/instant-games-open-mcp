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
  title.textContent = '自动去背景';
  const body = document.createElement('div');
  body.className = 'background-body';
  const canvas = document.createElement('canvas');
  canvas.className = 'sequence-editor-canvas checkerboard';
  const panel = document.createElement('aside');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const hint = document.createElement('p');
  hint.textContent =
    '自动识别大面积纯色背景，不需要点击取色。全图模式可处理封闭空隙；角色与背景同色时仍可能误删。预览基于本轮原帧，不累积抠图。';
  const actions = document.createElement('footer');
  actions.className = 'sequence-editor-footer';
  const settings: BackgroundOptions = {
    automatic: true,
    tolerance: 32,
    softness: 24,
    despill: 0.5,
    mode: 'all',
  };
  let revision = 0;
  let closed = false;
  let applying = false;
  let previewReady = false;
  let showOriginal = false;
  let smart = true;
  let color: [number, number, number] | undefined;
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
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')
      .forEach((input) => (input.disabled = applying));
  }
  async function preview() {
    const ticket = ++revision;
    previewReady = false;
    update();
    try {
      const result = await options.removal.apply(source.blob, { ...settings }, controller.signal);
      const bitmap = await createImageBitmap(showOriginal ? source.blob : result.blob);
      try {
        if (closed || ticket !== revision) return;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        color = result.color;
        status.textContent =
          '识别背景：#' +
          color.map((channel) => channel.toString(16).padStart(2, '0')).join('') +
          (showOriginal ? ' · 原帧' : ' · 处理预览');
        previewReady = true;
      } finally {
        bitmap.close();
      }
    } catch (error) {
      if (!closed && ticket === revision) {
        status.textContent = error instanceof Error ? error.message : '预览失败，请重试。';
        const original = await createImageBitmap(source.blob).catch(() => undefined);
        if (original) {
          if (!closed && ticket === revision) {
            canvas.width = original.width;
            canvas.height = original.height;
            canvas.getContext('2d')!.drawImage(original, 0, 0);
          }
          original.close();
        }
      }
    } finally {
      if (!closed && ticket === revision) update();
    }
  }
  function schedule() {
    revision++;
    previewReady = false;
    update();
    clearTimeout(timer);
    timer = setTimeout(() => {
      void preview();
    }, 120);
  }
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
    ['all', '全图同色（含封闭空隙）'],
    ['connected', '仅边缘连通背景'],
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
  const smartLabel = document.createElement('label');
  smartLabel.className = 'sequence-editor-check';
  const smartInput = document.createElement('input');
  smartInput.type = 'checkbox';
  smartInput.checked = true;
  smartInput.addEventListener('change', () => {
    smart = smartInput.checked;
  });
  smartLabel.append(smartInput, '逐帧智能匹配背景色');
  panel.append(smartLabel);
  button(
    '原帧／结果对比',
    () => {
      if (!applying) {
        showOriginal = !showOriginal;
        schedule();
      }
    },
    panel
  );
  async function apply(batch: boolean) {
    if (applying || !previewReady || !color) return;
    applying = true;
    update();
    try {
      const frames = (options.currentFrames || options.frames).slice();
      for (let index = 0; index < frames.length; index++) {
        if (!batch && index !== options.index) continue;
        status.textContent = '正在处理第 ' + (index + 1) + ' / ' + frames.length + ' 帧';
        try {
          const result = await options.removal.apply(
            options.frames[index].blob,
            { ...settings, automatic: smart, color },
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
      if (closed) return;
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
