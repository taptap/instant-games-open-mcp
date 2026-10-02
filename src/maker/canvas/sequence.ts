/// <reference lib="dom" />
import type { FrameSetFrame, FrameSetInfo, SequenceSettings } from './sequenceModel.js';
import { backgroundColorsDiffer, stableBackgroundColor } from './backgroundRemoval.js';
export {
  DEFAULT_SEQUENCE_SIDE,
  MAX_ATLAS_SIDE,
  MAX_SEQUENCE_FRAMES,
  MAX_SEQUENCE_PIXEL_BUDGET,
  MAX_SEQUENCE_SIDE,
  MAX_SEQUENCE_SOURCE_SIDE,
  defaultSequenceSettings,
  duplicateIndicesFromSignatures,
  estimateSequenceFrameCount,
  maxSequenceFrameCount,
  maxSequenceInputFrameCount,
  signatureSimilarity,
} from './sequenceModel.js';
export type { FrameSetFrame, FrameSetInfo, SequenceSettings, VideoInfo } from './sequenceModel.js';

export interface SequenceFrame {
  time: number;
  blob: Blob;
}

export interface SequenceRunView {
  status: 'running' | 'ready' | 'failed' | 'cancelled' | 'complete';
  stage: 'extract' | 'cutout' | 'dedupe' | 'dedupe-review' | 'resize' | 'save' | 'complete';
  uploading?: boolean;
  progress: number;
  total: number;
  frames: SequenceFrame[];
  originalFrames?: SequenceFrame[];
  previewFrame?: SequenceFrame;
  candidates: Array<{ index: number; similarity: number }>;
  removed: number[];
  error?: string;
  boundaryFrames?: number[];
}

export interface SequenceCardSource {
  id: string;
  title: string;
  assetPath?: string;
}

export interface SequenceActionOption {
  label: string;
  action: string;
  disabled?: boolean;
}

export function sequenceActionsForCard(
  run: SequenceRunView | undefined,
  hasSavedFrameSet: boolean,
  cutoutEnabled: boolean,
  sourceStale = false
): SequenceActionOption[] {
  if (run?.status === 'running') {
    return [
      {
        label: run.uploading ? '正在写入…' : '取消当前步骤',
        action: 'cancel',
        disabled: Boolean(run.uploading),
      },
    ];
  }
  if (hasSavedFrameSet && (!run || run.status === 'complete')) {
    return [{ label: sourceStale ? '刷新序列帧' : '从源视频重新处理', action: 'reset' }];
  }
  if (!run) return [{ label: '开始抽帧', action: 'extract' }];

  const retrying = run.status === 'failed' || run.status === 'cancelled';
  let actions: SequenceActionOption[];
  switch (run.stage) {
    case 'extract':
      actions = [{ label: retrying ? '重试抽帧' : '开始抽帧', action: 'extract' }];
      break;
    case 'cutout':
      actions = cutoutEnabled
        ? [
            { label: retrying ? '重试统一抠图' : '统一抠图', action: 'cutout' },
            { label: '跳过抠图', action: 'skip-cutout' },
          ]
        : [{ label: '继续分析重复帧', action: 'dedupe' }];
      break;
    case 'dedupe':
      actions = [{ label: retrying ? '重试分析重复帧' : '分析重复帧', action: 'dedupe' }];
      break;
    case 'dedupe-review':
      actions = [
        { label: '移除勾选并继续', action: 'apply-dedupe' },
        { label: '保留全部帧', action: 'keep-all' },
      ];
      break;
    case 'resize':
      actions = [{ label: retrying ? '重试统一缩放' : '统一缩放', action: 'resize' }];
      break;
    case 'save':
      actions = [{ label: retrying ? '重试保存帧集' : '保存帧集到画布', action: 'save' }];
      break;
    case 'complete':
      actions = [{ label: '从视频重新处理', action: 'reset' }];
      break;
  }
  if (run.frames.length && run.status !== 'complete')
    actions.push({ label: '放弃本次帧集', action: 'discard' });
  return actions;
}

export function renderSequenceCard(
  card: HTMLElement,
  node: {
    title: string;
    sequenceSettings: SequenceSettings;
    frameSetInfo?: FrameSetInfo;
    assetPath?: string;
    sourceStale?: boolean;
  },
  source: SequenceCardSource | undefined,
  run: SequenceRunView | undefined,
  atlasUrl: string | undefined,
  onSetting: (key: keyof SequenceSettings, value: unknown) => void,
  onAction: (action: string, value?: number) => void
): void {
  card.classList.add('sequence-card');
  const settings = node.sequenceSettings;
  const content = document.createElement('div');
  content.className = 'sequence-content';
  const drawThumbnail = (
    canvas: HTMLCanvasElement,
    frame: SequenceFrame,
    width: number,
    height: number
  ) => {
    void createImageBitmap(frame.blob)
      .then((bitmap) => {
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
      })
      .catch(() => {});
  };
  const heading = document.createElement('div');
  heading.className = 'sequence-heading';
  const sourceLabel = document.createElement('span');
  sourceLabel.textContent = source ? '视频源：' + source.title : '视频来源缺失';
  heading.append(sourceLabel);
  const stageNames: Record<SequenceRunView['stage'], string> = {
    extract: '抽帧',
    cutout: '统一抠图',
    dedupe: '重复帧分析',
    'dedupe-review': '重复帧确认',
    resize: '尺寸调整',
    save: '预览与保存',
    complete: '完成',
  };
  const status = document.createElement('span');
  status.className = 'sequence-status';
  status.textContent =
    run?.status === 'running'
      ? run.uploading
        ? '正在写入项目文件'
        : '处理中 · ' + stageNames[run.stage]
      : run?.status === 'failed'
        ? '步骤失败'
        : run?.status === 'cancelled'
          ? '已取消'
          : node.frameSetInfo
            ? '帧集已保存'
            : run?.status === 'ready'
              ? '等待确认'
              : '等待开始';
  heading.append(status);
  content.append(heading);
  if (node.sourceStale && node.frameSetInfo && (!run || run.status === 'complete')) {
    const stale = document.createElement('p');
    stale.className = 'sequence-error';
    stale.textContent = '视频源已变化，当前帧集仍保留；点击“刷新序列帧”后重新处理。';
    content.append(stale);
  }

  const stageIds = ['extract', 'cutout', 'dedupe', 'resize', 'save'];
  const stageLabels = ['分帧', '统一抠图', '重复帧确认', '尺寸统一', '预览/保存'];
  const stageIndex = run
    ? Math.max(0, stageIds.indexOf(run.stage === 'dedupe-review' ? 'dedupe' : run.stage))
    : 0;
  const steps = document.createElement('div');
  steps.className = 'sequence-steps';
  stageIds.forEach((id, index) => {
    const item = document.createElement('span');
    item.className =
      'sequence-step' +
      (index < stageIndex || run?.status === 'complete'
        ? ' complete'
        : index === stageIndex
          ? ' active'
          : '');
    item.textContent =
      (index < stageIndex || run?.status === 'complete' ? '✓ ' : '') + stageLabels[index];
    steps.append(item);
  });
  content.append(steps);

  if (run?.status === 'running') {
    const progress = document.createElement('div');
    progress.className = 'sequence-progress';
    const label = document.createElement('span');
    label.textContent = run.total ? run.progress + ' / ' + run.total + ' 帧' : '正在准备视频';
    const meter = document.createElement('progress');
    meter.max = Math.max(1, run.total);
    meter.value = Math.min(meter.max, run.progress);
    progress.append(label, meter);
    content.append(progress);
  }
  if (run?.error) {
    const error = document.createElement('p');
    error.className = 'sequence-error';
    error.textContent = run.error;
    content.append(error);
  }

  const settingsPanel = document.createElement('details');
  settingsPanel.className = 'sequence-settings';
  const currentStage = run?.stage || 'extract';
  const hasFrames = Boolean(run?.frames.length);
  const canEdit = (key: keyof SequenceSettings) => {
    if (run?.status === 'running' || node.frameSetInfo) return false;
    if (!hasFrames) return true;
    if (key === 'backgroundColor' || key === 'tolerance' || key === 'cutout')
      return currentStage === 'cutout';
    if (key === 'duplicateThreshold')
      return currentStage === 'dedupe' || currentStage === 'dedupe-review';
    if (key === 'width' || key === 'height' || key === 'fit' || key === 'pixel')
      return currentStage === 'resize';
    return false;
  };
  settingsPanel.open = !node.frameSetInfo && (!hasFrames || currentStage !== 'save');
  const summary = document.createElement('summary');
  summary.textContent = '处理设置';
  settingsPanel.append(summary);
  const fields = document.createElement('div');
  fields.className = 'sequence-fields';
  const addField = (
    labelText: string,
    key: keyof SequenceSettings,
    value: string,
    type = 'number',
    min?: string,
    max?: string,
    step?: string
  ) => {
    const label = document.createElement('label');
    label.className = 'sequence-field';
    const text = document.createElement('span');
    text.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    if (step !== undefined) input.step = step;
    input.value = value;
    input.disabled = !canEdit(key);
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    input.addEventListener('change', () =>
      onSetting(key, type === 'number' || type === 'range' ? Number(input.value) : input.value)
    );
    label.append(text, input);
    fields.append(label);
  };
  addField('起始秒', 'start', String(settings.start), 'number', '0', undefined, '0.1');
  addField('结束秒（0=全片）', 'end', String(settings.end), 'number', '0', undefined, '0.1');
  addField('目标 FPS', 'fps', String(settings.fps), 'number', '1', '30', '1');
  addField('背景色', 'backgroundColor', settings.backgroundColor, 'color');
  addField('抠图容差', 'tolerance', String(settings.tolerance), 'range', '0', '255', '1');
  addField(
    '重复阈值',
    'duplicateThreshold',
    String(settings.duplicateThreshold),
    'range',
    '0.8',
    '0.999',
    '0.001'
  );
  addField('输出宽', 'width', String(settings.width), 'number', '1', '2048', '1');
  addField('输出高', 'height', String(settings.height), 'number', '1', '2048', '1');
  const cutoutLabel = document.createElement('label');
  cutoutLabel.className = 'sequence-check';
  const cutout = document.createElement('input');
  cutout.type = 'checkbox';
  cutout.checked = settings.cutout;
  cutout.disabled = !canEdit('cutout');
  cutout.addEventListener('pointerdown', (event) => event.stopPropagation());
  cutout.addEventListener('change', () => onSetting('cutout', cutout.checked));
  cutoutLabel.append(cutout, document.createTextNode('将同一背景样本应用到全部帧'));
  fields.append(cutoutLabel);
  const pixelLabel = document.createElement('label');
  pixelLabel.className = 'sequence-check';
  const pixel = document.createElement('input');
  pixel.type = 'checkbox';
  pixel.checked = settings.pixel;
  pixel.disabled = !canEdit('pixel');
  pixel.addEventListener('pointerdown', (event) => event.stopPropagation());
  pixel.addEventListener('change', () => onSetting('pixel', pixel.checked));
  pixelLabel.append(pixel, document.createTextNode('像素清晰缩放'));
  fields.append(pixelLabel);
  const fitLabel = document.createElement('label');
  fitLabel.className = 'sequence-field';
  const fitText = document.createElement('span');
  fitText.textContent = '画面适配';
  const fit = document.createElement('select');
  fit.innerHTML =
    '<option value="contain">完整显示</option><option value="cover">铺满裁切</option><option value="stretch">拉伸</option>';
  fit.value = settings.fit;
  fit.disabled = !canEdit('fit');
  fit.addEventListener('pointerdown', (event) => event.stopPropagation());
  fit.addEventListener('change', () => onSetting('fit', fit.value));
  fitLabel.append(fitText, fit);
  fields.append(fitLabel);
  settingsPanel.append(fields);
  content.append(settingsPanel);

  if (run?.stage === 'cutout' && run.frames.length) {
    const sampling = document.createElement('div');
    sampling.className = 'sequence-sampling';
    const prompt = document.createElement('span');
    prompt.textContent = '点击首帧背景取样，统一应用到整段视频';
    const sample = document.createElement('canvas');
    sample.className = 'sequence-sampler';
    sample.tabIndex = 0;
    sample.setAttribute('role', 'button');
    sample.setAttribute('aria-label', '从首帧采样要抠除的背景颜色');
    sample.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const rectangle = sample.getBoundingClientRect();
      if (!rectangle.width || !rectangle.height) return;
      const x = Math.max(
        0,
        Math.min(
          sample.width - 1,
          Math.floor(((event.clientX - rectangle.left) / rectangle.width) * sample.width)
        )
      );
      const y = Math.max(
        0,
        Math.min(
          sample.height - 1,
          Math.floor(((event.clientY - rectangle.top) / rectangle.height) * sample.height)
        )
      );
      const pixel = sample.getContext('2d')?.getImageData(x, y, 1, 1).data;
      if (!pixel || pixel[3] < 16) return;
      const hex =
        '#' +
        [pixel[0], pixel[1], pixel[2]]
          .map((channel) => channel.toString(16).padStart(2, '0'))
          .join('');
      onSetting('backgroundColor', hex);
    });
    sampling.append(prompt, sample);
    content.append(sampling);
    void createImageBitmap(run.frames[0].blob)
      .then((bitmap) => {
        if (!sample.isConnected) {
          bitmap.close();
          return;
        }
        sample.width = bitmap.width;
        sample.height = bitmap.height;
        sample.getContext('2d')?.drawImage(bitmap, 0, 0);
        bitmap.close();
      })
      .catch(() => {});
  }

  if (run?.frames.length) {
    const distribution = document.createElement('p');
    distribution.className = 'sequence-info';
    distribution.textContent =
      run.frames.length +
      ' 帧 · ' +
      settings.fps +
      ' FPS · ' +
      settings.width +
      '×' +
      settings.height +
      ' / 帧';
    content.append(distribution);
  }

  if (run?.candidates?.length) {
    const duplicateInfo = document.createElement('p');
    duplicateInfo.className = 'sequence-info';
    duplicateInfo.textContent =
      '发现 ' + run.candidates.length + ' 个相邻疑似重复帧；勾选项会在确认后移除。';
    content.append(duplicateInfo);
    const candidates = document.createElement('div');
    candidates.className = 'sequence-candidates';
    for (const candidate of run.candidates) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = run.removed.includes(candidate.index);
      checkbox.addEventListener('pointerdown', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => onAction('toggle-duplicate', candidate.index));
      const sample = document.createElement('canvas');
      sample.width = 64;
      sample.height = 48;
      const frame = run.frames[candidate.index];
      if (frame) drawThumbnail(sample, frame, 64, 48);
      const caption = document.createElement('span');
      caption.textContent =
        '帧 ' + (candidate.index + 1) + ' · ' + Math.round(candidate.similarity * 100) + '%';
      label.append(checkbox, sample, caption);
      candidates.append(label);
    }
    content.append(candidates);
  }

  const thumbnails = document.createElement('div');
  thumbnails.className = 'sequence-thumbnails';
  const frames = run?.status === 'running' ? [] : run?.frames || [];
  if (run?.previewFrame) {
    const current = document.createElement('canvas');
    current.width = 112;
    current.height = 72;
    drawThumbnail(current, run.previewFrame, 112, 72);
    const currentLabel = document.createElement('span');
    currentLabel.textContent = '当前 ' + run.previewFrame.time.toFixed(2) + 's';
    thumbnails.append(current, currentLabel);
  }
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const tile = document.createElement('figure');
    tile.className = 'sequence-frame-tile';
    const thumb = document.createElement('canvas');
    thumb.width = 80;
    thumb.height = 60;
    drawThumbnail(thumb, frame, 80, 60);
    const label = document.createElement('figcaption');
    label.textContent = String(index + 1);
    tile.append(thumb, label);
    thumbnails.append(tile);
  }
  if (frames.length) content.append(thumbnails);

  if (node.frameSetInfo && atlasUrl) {
    const atlas = document.createElement('img');
    atlas.className = 'sequence-atlas';
    atlas.src = atlasUrl;
    atlas.alt = '帧集图集预览';
    const distribution = document.createElement('div');
    distribution.className = 'sequence-output-frames';
    const drawAtlasFrames = () => {
      if (!atlas.complete || !atlas.naturalWidth) return;
      node.frameSetInfo!.frames.forEach((frame, index) => {
        const canvas = distribution.querySelectorAll('canvas')[index];
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          atlas,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          0,
          0,
          canvas.width,
          canvas.height
        );
      });
    };
    for (const frame of node.frameSetInfo.frames) {
      const tile = document.createElement('figure');
      tile.className = 'sequence-frame-tile';
      const thumb = document.createElement('canvas');
      thumb.width = 64;
      thumb.height = 48;
      const label = document.createElement('figcaption');
      label.textContent = String(frame.index + 1);
      tile.append(thumb, label);
      distribution.append(tile);
    }
    atlas.addEventListener('load', drawAtlasFrames, { once: true });
    content.append(atlas, distribution);
    drawAtlasFrames();
    const info = document.createElement('p');
    info.className = 'sequence-info';
    info.textContent =
      node.frameSetInfo.frameCount +
      ' 帧 · ' +
      node.frameSetInfo.fps +
      ' FPS · ' +
      node.frameSetInfo.width +
      '×' +
      node.frameSetInfo.height;
    content.append(info);
  }

  const actions = document.createElement('div');
  actions.className = 'sequence-actions';
  const addButton = (label: string, action: string, disabled = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onAction(action);
    });
    actions.append(button);
  };
  for (const action of sequenceActionsForCard(
    run,
    Boolean(node.frameSetInfo),
    settings.cutout,
    Boolean(node.sourceStale)
  )) {
    addButton(action.label, action.action, action.disabled);
  }
  content.append(actions);
  card.append(content);
}

export interface SequenceProcessorOptions {
  backgroundRemoval?: ReturnType<typeof import('./backgroundRemoval.js').createBackgroundRemoval>;
  maxSourceSide: number;
  maxOutputSide: number;
  maxAtlasSide: number;
  estimateFrameCount: (start: number, end: number, fps: number) => number;
  maxAtlasFrameCount: (width: number, height: number) => number;
  duplicateFrameIndices: (
    signatures: readonly Uint8Array[],
    threshold: number
  ) => Array<{ index: number; similarity: number }>;
}

export async function removeConnectedBackgroundPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  color: readonly [number, number, number],
  tolerance: number,
  signal: AbortSignal,
  yieldControl: () => Promise<void>
): Promise<number> {
  const total = width * height;
  if (data.length !== total * 4) throw new Error('帧像素尺寸无效。');
  const limit = Math.max(0, Math.min(255, tolerance));
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let read = 0;
  let write = 0;
  const matches = (pixel: number) =>
    data[pixel * 4 + 3] > 0 &&
    Math.max(
      Math.abs(data[pixel * 4] - color[0]),
      Math.abs(data[pixel * 4 + 1] - color[1]),
      Math.abs(data[pixel * 4 + 2] - color[2])
    ) <= limit;
  const seed = (pixel: number) => {
    if (visited[pixel] || !matches(pixel)) return;
    visited[pixel] = 1;
    queue[write++] = pixel;
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (read < write) {
    const batchEnd = read + 32768;
    while (read < batchEnd && read < write) {
      if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
      const pixel = queue[read++];
      data[pixel * 4 + 3] = 0;
      const x = pixel % width;
      if (x > 0) seed(pixel - 1);
      if (x < width - 1) seed(pixel + 1);
      if (pixel >= width) seed(pixel - width);
      if (pixel + width < total) seed(pixel + width);
    }
    if (read < write) await yieldControl();
  }
  return write;
}

export async function removeChromaBackgroundPixels(
  data: Uint8ClampedArray,
  color: readonly [number, number, number],
  tolerance: number,
  signal: AbortSignal,
  yieldControl: () => Promise<void>
): Promise<void> {
  if (data.length % 4 !== 0) throw new Error('帧像素尺寸无效。');
  const high = [0, 1, 2].filter((channel) => color[channel] >= 128);
  const low = [0, 1, 2].filter((channel) => color[channel] < 128);
  const keyDifference =
    high.length && low.length
      ? Math.min(...high.map((channel) => color[channel])) -
        Math.max(...low.map((channel) => color[channel]))
      : 0;
  const limit = Math.max(0, Math.min(255, tolerance));
  for (let offset = 0; offset < data.length; offset += 4) {
    if (offset % 131072 === 0) {
      if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
      await yieldControl();
    }
    if (!data[offset + 3]) continue;
    const distance = Math.max(
      ...[0, 1, 2].map((channel) => Math.abs(data[offset + channel] - color[channel]))
    );
    if (distance <= limit) {
      data.fill(0, offset, offset + 4);
      continue;
    }
    if (keyDifference < 32) continue;
    const difference =
      Math.min(...high.map((channel) => data[offset + channel])) -
      Math.max(...low.map((channel) => data[offset + channel]));
    const spill = Math.max(0, Math.min(1, difference / keyDifference));
    const alpha = 1 - spill;
    if (alpha <= 0.01) {
      data.fill(0, offset, offset + 4);
      continue;
    }
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = Math.max(
        0,
        Math.min(255, (data[offset + channel] - color[channel] * spill) / alpha)
      );
    }
    data[offset + 3] = Math.round(data[offset + 3] * alpha);
  }
}

export function hasOpaqueBoundary(data: Uint8ClampedArray, width: number, height: number): boolean {
  if (data.length !== width * height * 4 || width < 1 || height < 1) return false;
  let count = 0;
  for (let column = 0; column < width; column++) {
    if (data[column * 4 + 3] > 80) count++;
    if (data[((height - 1) * width + column) * 4 + 3] > 80) count++;
  }
  for (let row = 1; row < height - 1; row++) {
    if (data[row * width * 4 + 3] > 80) count++;
    if (data[(row * width + width - 1) * 4 + 3] > 80) count++;
  }
  return count >= 3;
}

export function createSequenceProcessor(options: SequenceProcessorOptions) {
  function delayFrame(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function seek(video: HTMLVideoElement, time: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
    const target = Math.min(video.duration, Math.max(0.001, time));
    if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.001)
      return;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error('等待视频解码超时。')), 15000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
      };
      const finish = (error?: Error) => {
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onLoaded = () => {
        if (!video.seeking && video.readyState >= 2) finish();
      };
      const onSeeked = () => onLoaded();
      const onError = () =>
        finish(new Error('视频当前帧无法解码；请尝试转为 MP4（H.264、yuv420p）后重新导入。'));
      const onAbort = () => finish(new DOMException('处理已取消。', 'AbortError'));
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('error', onError, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        video.currentTime = target;
      } catch {
        finish(new Error('无法定位视频帧；请重新导入可播放的视频。'));
      }
    });
  }

  async function extract(
    video: HTMLVideoElement,
    start: number,
    end: number,
    fps: number,
    signal: AbortSignal,
    onProgress: (current: number, total: number, time: number, preview: SequenceFrame) => void
  ): Promise<SequenceFrame[]> {
    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      !Number.isFinite(video.videoWidth) ||
      video.videoWidth <= 0 ||
      !Number.isFinite(video.videoHeight) ||
      video.videoHeight <= 0
    )
      throw new Error(
        '视频没有有效画面或时长；请检查视频轨道，或转为 MP4（H.264、yuv420p）后重新导入。'
      );
    const count = options.estimateFrameCount(start, end, fps);
    const canvas = document.createElement('canvas');
    const scale = Math.min(
      1,
      options.maxSourceSide / Math.max(video.videoWidth, video.videoHeight)
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d', { alpha: true });
    if (!context || !canvas.width || !canvas.height) throw new Error('视频没有可用画面。');
    const frames: SequenceFrame[] = [];
    video.pause();
    try {
      for (let index = 0; index < count; index += 1) {
        if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
        const time = start + index / fps;
        await seek(video, time, signal);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('无法生成视频帧。'))),
            'image/png'
          );
        });
        const frame = { time, blob };
        frames.push(frame);
        onProgress(index + 1, count, time, frame);
        await delayFrame();
      }
      return frames;
    } catch (error) {
      frames.length = 0;
      throw error;
    }
  }

  function parseColor(value: string): [number, number, number] {
    const match = value.match(/^#([0-9a-f]{6})$/i);
    if (!match) throw new Error('背景色必须是 6 位十六进制颜色。');
    const color = match[1];
    return [
      parseInt(color.slice(0, 2), 16),
      parseInt(color.slice(2, 4), 16),
      parseInt(color.slice(4, 6), 16),
    ];
  }

  async function cutout(
    frames: SequenceFrame[],
    colorHex: string,
    tolerance: number,
    signal: AbortSignal,
    onProgress: (current: number, total: number) => void,
    mode: 'connected' | 'chroma' = 'connected'
  ): Promise<SequenceFrame[]> {
    if (options.backgroundRemoval) {
      const detected: Array<{ color: [number, number, number]; coverage: number } | undefined> = [];
      for (const frame of frames) {
        if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
        detected.push(await options.backgroundRemoval.identify(frame.blob));
      }
      const stable = stableBackgroundColor(detected.map((sample) => sample?.color));
      if (!stable) {
        throw new Error('未可靠识别到大面积纯色背景，可能已经透明或背景过于复杂；原帧集未改变。');
      }
      let startIndex = 0;
      while (startIndex < frames.length - 1) {
        const sample = detected[startIndex];
        if (!sample || !backgroundColorsDiffer(sample.color, stable)) break;
        const neutral = Math.max(...sample.color) - Math.min(...sample.color) <= 12;
        const blank =
          sample.color.every((channel) => channel >= 240) ||
          sample.color.every((channel) => channel <= 16);
        if (
          !neutral ||
          !blank ||
          sample.coverage < 0.995 ||
          frames[startIndex].time - frames[0].time >= 0.5
        )
          break;
        startIndex++;
      }
      for (let index = startIndex; index < frames.length; index++) {
        const sample = detected[index];
        if (!sample || backgroundColorsDiffer(sample.color, stable)) {
          throw new Error(
            '第 ' +
              (index + 1) +
              ' 帧背景无法可靠识别或发生明显变化；原帧集未改变，请在编辑器调整背景或跳过抠图。'
          );
        }
      }
      const selected = frames.slice(startIndex);
      const output: SequenceFrame[] = [];
      for (let index = 0; index < selected.length; index++) {
        if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
        const color = detected[startIndex + index]!.color;
        try {
          const result = await options.backgroundRemoval.apply(
            selected[index].blob,
            {
              automatic: false,
              color,
              tolerance,
              softness: 24,
              despill: 0.5,
              mode: mode === 'connected' ? 'connected' : 'all',
            },
            signal
          );
          output.push({ ...selected[index], blob: result.blob });
          onProgress(index + 1, selected.length);
          await delayFrame();
        } catch (error) {
          if (signal.aborted) throw error;
          throw new Error(
            '第 ' +
              (startIndex + index + 1) +
              ' 帧：' +
              (error instanceof Error ? error.message : '自动去背景失败')
          );
        }
      }
      return output;
    }
    const color = parseColor(colorHex);
    const output: SequenceFrame[] = [];
    for (let index = 0; index < frames.length; index += 1) {
      if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
      const source = await createImageBitmap(frames[index].blob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('无法处理帧图像。');
        context.drawImage(source, 0, 0);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        if (mode === 'chroma')
          await removeChromaBackgroundPixels(image.data, color, tolerance, signal, delayFrame);
        else
          await removeConnectedBackgroundPixels(
            image.data,
            canvas.width,
            canvas.height,
            color,
            tolerance,
            signal,
            delayFrame
          );
        context.putImageData(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('无法生成透明帧。'))),
            'image/png'
          );
        });
        output.push({ time: frames[index].time, blob });
        onProgress(index + 1, frames.length);
      } finally {
        source.close();
      }
    }
    return output;
  }

  async function signature(frame: SequenceFrame): Promise<Uint8Array> {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('无法分析重复帧。');
    const bitmap = await createImageBitmap(frame.blob);
    try {
      context.drawImage(bitmap, 0, 0, 16, 16);
      return new Uint8Array(context.getImageData(0, 0, 16, 16).data);
    } finally {
      bitmap.close();
    }
  }

  async function findDuplicates(
    frames: SequenceFrame[],
    threshold: number,
    signal: AbortSignal,
    onProgress: (current: number, total: number) => void
  ): Promise<Array<{ index: number; similarity: number }>> {
    const signatures: Uint8Array[] = [];
    for (let index = 0; index < frames.length; index += 1) {
      if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
      signatures.push(await signature(frames[index]));
      onProgress(index + 1, frames.length);
      await delayFrame();
    }
    return options.duplicateFrameIndices(signatures, threshold);
  }

  async function resize(
    frames: SequenceFrame[],
    width: number,
    height: number,
    fit: 'contain' | 'cover' | 'stretch',
    pixel: boolean,
    signal: AbortSignal,
    onProgress: (current: number, total: number) => void
  ): Promise<SequenceFrame[]> {
    const targetWidth = Math.max(1, Math.min(options.maxOutputSide, Math.round(width)));
    const targetHeight = Math.max(1, Math.min(options.maxOutputSide, Math.round(height)));
    const output: SequenceFrame[] = [];
    for (let index = 0; index < frames.length; index += 1) {
      if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
      const source = await createImageBitmap(frames[index].blob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法调整帧尺寸。');
        context.imageSmoothingEnabled = !pixel;
        context.clearRect(0, 0, targetWidth, targetHeight);
        if (fit === 'stretch') {
          context.drawImage(source, 0, 0, targetWidth, targetHeight);
        } else {
          const scale =
            fit === 'cover'
              ? Math.max(targetWidth / source.width, targetHeight / source.height)
              : Math.min(targetWidth / source.width, targetHeight / source.height);
          const drawWidth = source.width * scale;
          const drawHeight = source.height * scale;
          context.drawImage(
            source,
            (targetWidth - drawWidth) / 2,
            (targetHeight - drawHeight) / 2,
            drawWidth,
            drawHeight
          );
        }
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('无法生成缩放帧。'))),
            'image/png'
          );
        });
        output.push({ time: frames[index].time, blob });
        onProgress(index + 1, frames.length);
      } finally {
        source.close();
      }
      await delayFrame();
    }
    return output;
  }

  async function packAtlas(
    frames: SequenceFrame[],
    fps: number,
    signal?: AbortSignal,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ blob: Blob; info: FrameSetInfo }> {
    if (!frames.length) throw new Error('没有可保存的帧。');
    const firstFrame = await createImageBitmap(frames[0].blob);
    const frameWidth = firstFrame.width;
    const frameHeight = firstFrame.height;
    firstFrame.close();
    const columnsAvailable = Math.floor(options.maxAtlasSide / frameWidth);
    const rowsAvailable = Math.floor(options.maxAtlasSide / frameHeight);
    if (frames.length > options.maxAtlasFrameCount(frameWidth, frameHeight)) {
      throw new Error(
        '当前帧尺寸超过单张 ' +
          options.maxAtlasSide +
          '×' +
          options.maxAtlasSide +
          ' 图集容量，请缩小帧尺寸或减少帧数。'
      );
    }
    const minimumColumns = Math.ceil(frames.length / rowsAvailable);
    const columns = Math.min(
      columnsAvailable,
      Math.max(minimumColumns, Math.ceil(Math.sqrt(frames.length)))
    );
    const rows = Math.ceil(frames.length / columns);
    const width = columns * frameWidth;
    const height = rows * frameHeight;
    if (width > options.maxAtlasSide || height > options.maxAtlasSide) {
      throw new Error(
        '图集超过 ' +
          options.maxAtlasSide +
          '×' +
          options.maxAtlasSide +
          '。请降低统一帧尺寸或减少帧数。'
      );
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法生成帧集图集。');
    const metadata: FrameSetFrame[] = [];
    for (let index = 0; index < frames.length; index += 1) {
      if (signal?.aborted) throw new DOMException('处理已取消。', 'AbortError');
      const frame = frames[index];
      const x = (index % columns) * frameWidth;
      const y = Math.floor(index / columns) * frameHeight;
      const bitmap = await createImageBitmap(frame.blob);
      try {
        context.drawImage(bitmap, x, y);
      } finally {
        bitmap.close();
      }
      metadata.push({ index, time: frame.time, x, y, width: frameWidth, height: frameHeight });
      onProgress?.(index + 1, frames.length);
      if (index % 4 === 3) await delayFrame();
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('无法保存帧集图集。'))),
        'image/png'
      );
    });
    return {
      blob,
      info: { fps, frameCount: frames.length, width, height, columns, rows, frames: metadata },
    };
  }

  function dispose(frames: SequenceFrame[]): void {
    frames.length = 0;
  }

  async function boundaryFrames(frames: SequenceFrame[], signal: AbortSignal): Promise<number[]> {
    const indices: number[] = [];
    for (let index = 0; index < frames.length; index++) {
      if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
      const bitmap = await createImageBitmap(frames[index].blob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        if (
          hasOpaqueBoundary(
            context.getImageData(0, 0, canvas.width, canvas.height).data,
            canvas.width,
            canvas.height
          )
        )
          indices.push(index);
      } finally {
        bitmap.close();
      }
      await delayFrame();
    }
    return indices;
  }

  return { extract, cutout, findDuplicates, resize, packAtlas, dispose, boundaryFrames };
}
