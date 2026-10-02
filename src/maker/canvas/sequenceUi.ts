/// <reference lib="dom" />
import type { CanvasDocument, CanvasNode } from './model.js';
import type { CanvasDocumentStore } from './store.js';
import {
  defaultSequenceSettings,
  estimateSequenceFrameCount,
  maxSequenceFrameCount,
  renderSequenceCard,
  type FrameSetInfo,
  type SequenceFrame,
  type SequenceRunView,
  type SequenceSettings,
} from './sequence.js';
import { createSequenceProcessor } from './sequence.js';
import { isCanvasNodeStale, snapshotCanvasSource } from './dependencies.js';
import type { TemplateOutputDecision } from './templateWorkflow.js';

export interface SequenceUiOptions {
  store: CanvasDocumentStore;
  processor: ReturnType<typeof createSequenceProcessor>;
  renderCard: typeof renderSequenceCard;
  getDocument: () => CanvasDocument | null;
  createId: () => string;
  nextPlacement: (type: string) => { x: number; y: number };
  video: HTMLVideoElement;
  remember: () => void;
  markDirty: () => void;
  flush: (allowSequenceCommit?: boolean) => Promise<boolean>;
  render: () => void;
  refreshCard: (nodeId: string) => void;
  publishState: () => void;
  setError: (message: string, level?: 'info' | 'warning' | 'error') => void;
  onChange?: (nodeId: string) => void;
  onOpen?: (nodeId: string) => void;
  resolveTarget?: (sourceId: string, type: 'sequence') => TemplateOutputDecision | undefined;
  onSaved?: (nodeId: string) => Promise<void>;
  onAnimation?: (nodeId: string) => void;
  defaultSettings: typeof defaultSequenceSettings;
  estimateFrameCount: typeof estimateSequenceFrameCount;
  maxFrameCount: typeof maxSequenceFrameCount;
  maxInputFrameCount: (width: number, height: number) => number;
}

type SequenceRun = SequenceRunView & {
  sourceFrames: SequenceFrame[];
  backgroundFrames?: SequenceFrame[];
  outputPath?: string;
  atlas?: { blob: Blob; info: FrameSetInfo };
  editPast?: SequenceFrame[][];
  editFuture?: SequenceFrame[][];
  extractionKey?: string;
  inputSourceSnapshot?: CanvasNode['sourceSnapshot'];
};

export function createSequenceUiController(options: SequenceUiOptions) {
  const runs = new Map<string, SequenceRun>();
  const controllers = new Map<string, AbortController>();
  const drafts = new Map<string, CanvasNode>();

  function refresh(nodeId: string): void {
    options.refreshCard(nodeId);
    options.onChange?.(nodeId);
  }

  function persistedNode(nodeId: string): CanvasNode | undefined {
    return documentState()?.nodes.find((node) => node.id === nodeId && node.type === 'sequence');
  }

  function beginEdit(nodeId: string): void {
    const node = persistedNode(nodeId);
    if (!node || drafts.has(nodeId)) return;
    drafts.set(nodeId, { ...node, sequenceSettings: { ...node.sequenceSettings! } });
  }

  function documentState(): CanvasDocument | null {
    return options.getDocument();
  }

  function sequenceNode(nodeId: string): CanvasNode | undefined {
    return drafts.get(nodeId) || persistedNode(nodeId);
  }

  function findSource(node: CanvasNode): CanvasNode | undefined {
    return documentState()?.nodes.find(
      (item) => item.id === node.sourceVideoId && item.type === 'video-source'
    );
  }

  function getRun(nodeId: string): SequenceRun {
    let run = runs.get(nodeId);
    if (!run) {
      run = {
        status: 'ready',
        stage: 'extract',
        progress: 0,
        total: 0,
        frames: [],
        sourceFrames: [],
        candidates: [],
        removed: [],
      };
      runs.set(nodeId, run);
    }
    return run;
  }

  function extractionKey(node: CanvasNode): string {
    const settings = node.sequenceSettings;
    return JSON.stringify([
      snapshotCanvasSource(findSource(node)),
      settings?.start,
      settings?.end,
      settings?.fps,
    ]);
  }

  function assertExtractionCurrent(node: CanvasNode, run: SequenceRun): void {
    if (
      run.extractionKey &&
      (run.extractionKey !== extractionKey(node) ||
        persistedNode(node.id)?.sourceVideoId !== node.sourceVideoId)
    )
      throw new Error('视频来源或抽帧参数已变化，请重新抽帧；原结果仍保留。');
  }

  function clearRun(nodeId: string): void {
    const run = runs.get(nodeId);
    if (run) {
      options.processor.dispose(run.frames);
      options.processor.dispose(run.sourceFrames);
    }
    runs.delete(nodeId);
    options.publishState();
    refresh(nodeId);
  }

  async function loadVideo(source: CanvasNode, signal: AbortSignal): Promise<HTMLVideoElement> {
    if (!source.assetPath) throw new Error('视频素材路径缺失。');
    const url = options.store.mediaUrl(source.assetPath);
    const video = options.video;
    if (video.dataset.assetPath === source.assetPath && video.readyState >= 1 && !video.error)
      return video;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error('读取视频信息超时。')), 15000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
      };
      const finish = (error?: Error) => {
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onLoaded = () => finish();
      const onError = () =>
        finish(
          new Error(
            '当前浏览器无法解码该视频；请转为 MP4（H.264、yuv420p）后重新导入，仅修改扩展名无效。'
          )
        );
      const onAbort = () => finish(new DOMException('处理已取消。', 'AbortError'));
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
      video.dataset.assetPath = source.assetPath;
      video.preload = 'metadata';
      video.src = url;
      video.load();
    });
    return video;
  }

  function renderCard(card: HTMLElement, node: CanvasNode, source?: CanvasNode): void {
    if (node.type !== 'sequence' || !node.sequenceSettings) return;
    const run = runs.get(node.id);
    options.renderCard(
      card,
      {
        title: node.title,
        sequenceSettings: node.sequenceSettings,
        frameSetInfo: node.frameSetInfo,
        assetPath: node.assetPath,
        sourceStale: isCanvasNodeStale(node, source || undefined),
      },
      source || findSource(node),
      run,
      node.assetPath ? options.store.mediaUrl(node.assetPath) : undefined,
      (key, value) => updateSetting(node.id, key, value),
      (action, value) => {
        if (action === 'edit') options.onOpen?.(node.id);
        else if (action === 'animation') options.onAnimation?.(node.id);
        else void actionSequence(node.id, action, value);
      }
    );
  }

  function createFromVideo(sourceId: string): void {
    const document = documentState();
    const source = document?.nodes.find(
      (node) => node.id === sourceId && node.type === 'video-source'
    );
    if (!document || !source) return;
    if (controllers.size) {
      options.setError('已有拆帧步骤正在运行，请等待完成。');
      return;
    }
    const decision = options.resolveTarget?.(sourceId, 'sequence');
    if (decision?.kind === 'blocked') {
      options.setError(decision.message);
      return;
    }
    const targets = document.nodes.filter(
      (node) =>
        node.type === 'sequence' &&
        node.sourceVideoId === sourceId &&
        document.edges.some(
          (edge) => edge.kind === 'sequence-source' && edge.from === sourceId && edge.to === node.id
        )
    );
    const pending =
      decision?.kind === 'reuse'
        ? targets.find((node) => node.id === decision.nodeId)
        : decision?.kind === 'create'
          ? undefined
          : targets.find((node) => !node.assetPath && !node.frameSetInfo);
    if (pending) {
      if (!drafts.has(pending.id) && !runs.has(pending.id)) {
        beginEdit(pending.id);
        const draft = drafts.get(pending.id)!;
        delete draft.assetPath;
        delete draft.frameSetInfo;
        delete draft.sourceSnapshot;
      }
      options.onOpen?.(pending.id);
      return;
    }
    options.remember();
    const position = options.nextPlacement('sequence');
    const settings = options.defaultSettings(
      source.videoInfo?.duration || 0,
      source.videoInfo?.width || 512,
      source.videoInfo?.height || 512
    );
    const node: CanvasNode = {
      id: options.createId(),
      type: 'sequence',
      x: position.x,
      y: position.y,
      width: 480,
      height: 300,
      title: '视频转序列帧',
      ...(source.sectionId ? { sectionId: source.sectionId } : {}),
      sourceVideoId: source.id,
      sequenceSettings: settings,
    };
    document.nodes.push(node);
    document.edges.push({
      id: options.createId(),
      from: source.id,
      to: node.id,
      kind: 'sequence-source',
    });
    options.markDirty();
    options.render();
    options.onOpen?.(node.id);
  }

  async function runStage(
    nodeId: string,
    stage: SequenceRunView['stage'],
    operation: (run: SequenceRun, signal: AbortSignal) => Promise<void>
  ): Promise<void> {
    if (controllers.size) {
      options.setError('已有拆帧步骤正在运行。');
      return;
    }
    const node = sequenceNode(nodeId);
    if (!node) return;
    const run = getRun(nodeId);
    const controller = new AbortController();
    if (stage !== 'save') {
      run.atlas = undefined;
      run.outputPath = undefined;
    }
    controllers.set(nodeId, controller);
    run.status = 'running';
    run.stage = stage;
    run.progress = 0;
    run.total = 0;
    run.error = undefined;
    options.publishState();
    refresh(nodeId);
    try {
      await operation(run, controller.signal);
      if (runs.get(nodeId) !== run) return;
      if (run.status === 'running') run.status = 'ready';
    } catch (error) {
      run.status =
        error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
      run.error = error instanceof Error ? error.message : '序列帧处理失败。';
      if (stage === 'extract') run.previewFrame = undefined;
    } finally {
      if (controllers.get(nodeId) === controller) controllers.delete(nodeId);
      if (runs.get(nodeId) === run) {
        options.publishState();
        refresh(nodeId);
      }
    }
  }

  async function startExtraction(nodeId: string): Promise<void> {
    const node = sequenceNode(nodeId);
    const source = node && findSource(node);
    if (!node) return;
    if (!source)
      return runStage(nodeId, 'extract', async () => {
        throw new Error('视频来源已不存在，请重新连接来源视频。');
      });
    if (controllers.size) {
      options.setError('已有拆帧步骤正在运行。');
      return;
    }
    const run = getRun(nodeId);
    options.processor.dispose(run.frames);
    options.processor.dispose(run.sourceFrames);
    run.frames = [];
    run.sourceFrames = [];
    run.originalFrames = [];
    run.backgroundFrames = undefined;
    run.boundaryFrames = undefined;
    run.candidates = [];
    run.removed = [];
    run.atlas = undefined;
    run.outputPath = undefined;
    run.editPast = [];
    run.editFuture = [];
    run.extractionKey = undefined;
    run.inputSourceSnapshot = snapshotCanvasSource(source);
    await runStage(nodeId, 'extract', async (activeRun, signal) => {
      const video = await loadVideo(source, signal);
      if (signal.aborted || sequenceNode(nodeId) !== node)
        throw new DOMException('处理已取消。', 'AbortError');
      if (
        JSON.stringify(activeRun.inputSourceSnapshot) !==
          JSON.stringify(snapshotCanvasSource(findSource(node))) ||
        persistedNode(nodeId)?.sourceVideoId !== node.sourceVideoId
      )
        throw new Error('读取期间视频来源已变化，请重新抽帧；原结果仍保留。');
      if (!Number.isFinite(video.duration) || video.duration <= 0)
        throw new Error('视频时长无效。');
      if (!video.videoWidth || !video.videoHeight)
        throw new Error('视频没有可解码的画面轨道；请转为 MP4（H.264、yuv420p）后重新导入。');
      const hadVideoInfo = Boolean(source.videoInfo);
      if (
        !source.videoInfo ||
        source.videoInfo.duration !== video.duration ||
        source.videoInfo.width !== video.videoWidth ||
        source.videoInfo.height !== video.videoHeight
      ) {
        options.remember();
        source.videoInfo = {
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        };
        options.markDirty();
      }
      if (!node.sequenceSettings)
        node.sequenceSettings = options.defaultSettings(
          video.duration,
          video.videoWidth,
          video.videoHeight
        );
      else if (!hadVideoInfo) {
        const defaults = options.defaultSettings(
          video.duration,
          video.videoWidth,
          video.videoHeight
        );
        node.sequenceSettings = {
          ...node.sequenceSettings,
          end: node.sequenceSettings.end <= 0 ? defaults.end : node.sequenceSettings.end,
        };
      }
      const start = Math.min(node.sequenceSettings.start, video.duration);
      const end =
        node.sequenceSettings.end <= start || node.sequenceSettings.end > video.duration
          ? video.duration
          : node.sequenceSettings.end;
      if (start >= video.duration) throw new Error('起始时间必须早于视频结束时间。');
      if (start !== node.sequenceSettings.start || end !== node.sequenceSettings.end) {
        if (!drafts.has(nodeId)) options.remember();
        node.sequenceSettings = { ...node.sequenceSettings, start, end };
        if (!drafts.has(nodeId)) options.markDirty();
      }
      const settings = node.sequenceSettings;
      const count = options.estimateFrameCount(settings.start, settings.end, settings.fps);
      const atlasCapacity = options.maxFrameCount(settings.width, settings.height);
      const inputCapacity = options.maxInputFrameCount(video.videoWidth, video.videoHeight);
      const capacity = Math.min(atlasCapacity, inputCapacity);
      if (count > capacity) {
        throw new Error(
          '当前视频尺寸与输出图集最多处理 ' + capacity + ' 帧；请缩短区间、降低帧率或缩小输出尺寸。'
        );
      }
      activeRun.total = count;
      activeRun.extractionKey = extractionKey(node);
      activeRun.frames = await options.processor.extract(
        video,
        settings.start,
        settings.end,
        settings.fps,
        signal,
        (current, total, _time, preview) => {
          activeRun.progress = current;
          activeRun.total = total;
          activeRun.previewFrame = preview;
          if (current === total || current % 3 === 0) refresh(nodeId);
        }
      );
      assertExtractionCurrent(node, activeRun);
      activeRun.sourceFrames = activeRun.frames.slice();
      activeRun.originalFrames = activeRun.frames.slice();
      activeRun.previewFrame = undefined;
      activeRun.stage = 'cutout';
    });
  }

  async function actionSequence(nodeId: string, action: string, value?: number): Promise<void> {
    if (action !== 'create') beginEdit(nodeId);
    const node = sequenceNode(nodeId);
    if (!node) return;
    const run = runs.get(nodeId);
    if (action === 'extract') return startExtraction(nodeId);
    if (action === 'cancel') {
      if (run?.uploading) {
        options.setError('图集正在写入项目文件，不能在写入中中断。');
        return;
      }
      controllers.get(nodeId)?.abort();
      return;
    }
    if (action === 'create') return createFromVideo(nodeId);
    if (action === 'discard') {
      if (controllers.has(nodeId)) return;
      clearRun(nodeId);
      return;
    }
    if (action === 'reset') {
      if (controllers.has(nodeId)) return;
      clearRun(nodeId);
      return startExtraction(nodeId);
    }
    if (!run) return;
    if (
      action === 'organize-cutout' ||
      action === 'organize-dedupe' ||
      action === 'organize-resize'
    ) {
      if (controllers.size || !run.frames.length) return;
      run.stage =
        action === 'organize-cutout'
          ? 'cutout'
          : action === 'organize-dedupe'
            ? 'dedupe'
            : 'resize';
      run.status = 'ready';
      run.error = undefined;
      refresh(nodeId);
      return;
    }
    if (action === 'remove-frame') {
      if (
        controllers.size ||
        !['cutout', 'dedupe', 'dedupe-review', 'resize'].includes(run.stage) ||
        !Number.isInteger(value) ||
        value! < 0 ||
        value! >= run.frames.length ||
        run.frames.length < 2
      )
        return;
      const removed = run.frames[value!];
      run.editPast ??= [];
      run.editPast.push(run.frames.slice());
      if (run.editPast.length > 12) run.editPast.shift();
      run.editFuture = [];
      run.frames = run.frames.filter((_frame, index) => index !== value);
      run.backgroundFrames = run.backgroundFrames?.filter((_frame, index) => index !== value);
      run.boundaryFrames = run.boundaryFrames
        ?.filter((index) => index !== value)
        .map((index) => (index > value! ? index - 1 : index));
      run.sourceFrames = run.sourceFrames.filter((frame) => frame.time !== removed.time);
      run.candidates = [];
      run.removed = [];
      if (run.stage === 'dedupe-review') run.stage = 'dedupe';
      run.status = 'ready';
      run.error = undefined;
      refresh(nodeId);
      return;
    }
    if (action === 'toggle-duplicate' && typeof value === 'number') {
      run.removed = run.removed.includes(value)
        ? run.removed.filter((index) => index !== value)
        : [...run.removed, value];
      refresh(nodeId);
      return;
    }
    if (action === 'skip-cutout') {
      options.processor.dispose(run.sourceFrames);
      run.sourceFrames = [];
      run.stage = 'dedupe';
      run.status = 'ready';
      refresh(nodeId);
      return;
    }
    if (action === 'cutout') {
      return runStage(nodeId, 'cutout', async (activeRun, signal) => {
        const baseline =
          activeRun.backgroundFrames ||
          (activeRun.sourceFrames.length ? activeRun.sourceFrames : activeRun.frames);
        activeRun.frames = await options.processor.cutout(
          baseline,
          node.sequenceSettings!.backgroundColor,
          node.sequenceSettings!.tolerance,
          signal,
          (current, total) => {
            activeRun.progress = current;
            activeRun.total = total;
            if (current === total || current % 3 === 0) refresh(nodeId);
          },
          node.sequenceSettings!.cutoutMode || 'connected'
        );
        activeRun.backgroundFrames = baseline.slice();
        if (activeRun.frames.length < baseline.length)
          options.setError(
            '已跳过片头 ' +
              (baseline.length - activeRun.frames.length) +
              ' 帧近乎纯白或纯黑的闪帧；原视频保留，结果请预览确认。',
            'warning'
          );
        activeRun.boundaryFrames = options.processor.boundaryFrames
          ? await options.processor.boundaryFrames(activeRun.frames, signal)
          : undefined;
        options.processor.dispose(activeRun.sourceFrames);
        activeRun.sourceFrames = [];
        activeRun.stage = 'dedupe';
      });
    }
    if (action === 'dedupe') {
      return runStage(nodeId, 'dedupe', async (activeRun, signal) => {
        activeRun.candidates = await options.processor.findDuplicates(
          activeRun.frames,
          node.sequenceSettings!.duplicateThreshold,
          signal,
          (current, total) => {
            activeRun.progress = current;
            activeRun.total = total;
            if (current === total || current % 3 === 0) refresh(nodeId);
          }
        );
        activeRun.removed = activeRun.candidates.map((candidate) => candidate.index);
        options.processor.dispose(activeRun.sourceFrames);
        activeRun.sourceFrames = [];
        activeRun.stage = 'dedupe-review';
      });
    }
    if (action === 'apply-dedupe' || action === 'keep-all') {
      if (action === 'apply-dedupe') {
        run.editPast ??= [];
        run.editPast.push(run.frames.slice());
        if (run.editPast.length > 12) run.editPast.shift();
        run.editFuture = [];
        const removed = new Set(run.removed);
        const boundaries = new Set(run.boundaryFrames || []);
        run.boundaryFrames = run.frames
          .map((_frame, index) => index)
          .filter((index) => !removed.has(index))
          .flatMap((index, position) => (boundaries.has(index) ? [position] : []));
        run.frames = run.frames.filter((_frame, index) => !removed.has(index));
        run.backgroundFrames = run.backgroundFrames?.filter((_frame, index) => !removed.has(index));
      }
      run.candidates = [];
      run.removed = [];
      run.stage = 'resize';
      run.status = 'ready';
      refresh(nodeId);
      return;
    }
    if (action === 'resize') {
      return runStage(nodeId, 'resize', async (activeRun, signal) => {
        activeRun.frames = await options.processor.resize(
          activeRun.frames,
          node.sequenceSettings!.width,
          node.sequenceSettings!.height,
          node.sequenceSettings!.fit,
          node.sequenceSettings!.pixel,
          signal,
          (current, total) => {
            activeRun.progress = current;
            activeRun.total = total;
            if (current === total || current % 3 === 0) refresh(nodeId);
          }
        );
        activeRun.stage = 'save';
        activeRun.boundaryFrames = options.processor.boundaryFrames
          ? await options.processor.boundaryFrames(activeRun.frames, signal)
          : undefined;
      });
    }
    if (action === 'save') {
      return runStage(nodeId, 'save', async (activeRun, signal) => {
        assertExtractionCurrent(node, activeRun);
        if (!activeRun.frames.length) throw new Error('没有可保存的帧。');
        const document = documentState();
        if (!document) throw new Error('画布已关闭。');
        const source = findSource(node);
        if (!source) throw new Error('视频来源已不存在，无法保存序列帧。');
        activeRun.atlas ??= await options.processor.packAtlas(
          activeRun.frames,
          node.sequenceSettings!.fps,
          signal,
          (current, total) => {
            activeRun.progress = current;
            activeRun.total = total;
            if (current === total || current % 4 === 0) refresh(nodeId);
          }
        );
        if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
        if (!activeRun.outputPath) {
          activeRun.uploading = true;
          options.publishState();
          refresh(nodeId);
          try {
            const saved = await options.store.importImage(
              document.id,
              await activeRun.atlas.blob.arrayBuffer(),
              'image/png'
            );
            activeRun.outputPath = saved.relativePath;
          } finally {
            activeRun.uploading = false;
            options.publishState();
          }
        }
        const current = persistedNode(nodeId);
        if (!current) throw new Error('画布节点已不存在。');
        const previous = {
          assetPath: current.assetPath,
          frameSetInfo: current.frameSetInfo,
          sequenceSettings: current.sequenceSettings,
          sourceSnapshot: current.sourceSnapshot,
        };
        activeRun.uploading = true;
        options.publishState();
        try {
          if (!(await options.flush())) throw new Error('请先解决画布保存错误，再重试保存帧集。');
          assertExtractionCurrent(node, activeRun);
          current.assetPath = activeRun.outputPath;
          current.frameSetInfo = activeRun.atlas.info;
          current.sequenceSettings = { ...node.sequenceSettings! };
          current.sourceSnapshot = activeRun.inputSourceSnapshot;
          if (!(await options.flush(true))) throw new Error('画布保存失败，请重试；原结果仍保留。');
        } catch (error) {
          Object.assign(current, previous);
          throw error;
        } finally {
          activeRun.uploading = false;
        }
        const committed = {
          assetPath: current.assetPath,
          frameSetInfo: current.frameSetInfo,
          sequenceSettings: current.sequenceSettings,
          sourceSnapshot: current.sourceSnapshot,
        };
        Object.assign(current, previous);
        options.remember();
        Object.assign(current, committed);
        node.assetPath = current.assetPath;
        node.frameSetInfo = current.frameSetInfo;
        node.sourceSnapshot = current.sourceSnapshot;
        options.processor.dispose(activeRun.frames);
        options.processor.dispose(activeRun.sourceFrames);
        activeRun.frames = [];
        activeRun.sourceFrames = [];
        activeRun.atlas = undefined;
        activeRun.originalFrames = [];
        activeRun.backgroundFrames = undefined;
        activeRun.editPast = [];
        activeRun.editFuture = [];
        activeRun.status = 'complete';
        activeRun.stage = 'complete';
        await options.onSaved?.(nodeId);
      });
    }
  }

  function updateSetting(nodeId: string, key: keyof SequenceSettings, value: unknown): void {
    beginEdit(nodeId);
    const node = sequenceNode(nodeId);
    if (!node || controllers.size || !node.sequenceSettings) return;
    const run = runs.get(nodeId);
    if (node.frameSetInfo && !run?.frames.length) return;
    if (run?.frames.length) {
      const stage = run.stage;
      const allowed =
        stage === 'cutout'
          ? key === 'backgroundColor' ||
            key === 'tolerance' ||
            key === 'cutout' ||
            key === 'cutoutMode'
          : stage === 'dedupe' || stage === 'dedupe-review'
            ? key === 'duplicateThreshold'
            : stage === 'resize'
              ? key === 'width' ||
                key === 'height' ||
                key === 'fit' ||
                key === 'pixel' ||
                key === 'fps'
              : false;
      if (!allowed) return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    if (
      key === 'fps' &&
      (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 30)
    )
      return;
    if (!drafts.has(nodeId)) options.remember();
    const currentInput = run?.extractionKey === extractionKey(node);
    node.sequenceSettings = { ...node.sequenceSettings, [key]: value };
    if (run && currentInput && key === 'fps' && run.stage === 'resize')
      run.extractionKey = extractionKey(node);
    if (run && key === 'duplicateThreshold' && run.stage === 'dedupe-review') {
      run.candidates = [];
      run.removed = [];
      run.stage = 'dedupe';
      run.status = 'ready';
    }
    if (!drafts.has(nodeId)) options.markDirty();
    options.publishState();
    refresh(nodeId);
  }

  function deleteNodes(nodeIds: string[]): boolean {
    if (nodeIds.some((id) => controllers.has(id))) return false;
    for (const id of nodeIds) {
      const run = runs.get(id);
      if (run) {
        options.processor.dispose(run.frames);
        options.processor.dispose(run.sourceFrames);
      }
      runs.delete(id);
      drafts.delete(id);
    }
    return true;
  }

  function clear(): void {
    for (const controller of controllers.values()) controller.abort();
    for (const run of runs.values()) {
      options.processor.dispose(run.frames);
      options.processor.dispose(run.sourceFrames);
    }
    controllers.clear();
    runs.clear();
    drafts.clear();
  }

  function replaceFrames(nodeId: string, frames: SequenceFrame[]): void {
    const run = runs.get(nodeId);
    const node = sequenceNode(nodeId);
    if (!run || !node || controllers.size || !frames.length) return;
    const settings = node.sequenceSettings!;
    const source = findSource(node);
    const limit = Math.min(
      options.maxFrameCount(settings.width, settings.height),
      options.maxInputFrameCount(
        source?.videoInfo?.width || settings.width,
        source?.videoInfo?.height || settings.height
      )
    );
    if (frames.length > limit)
      throw new Error('帧数超过当前图集或处理容量上限（' + limit + ' 帧）。');
    run.editPast ??= [];
    run.editPast.push(run.frames.slice());
    if (run.editPast.length > 12) run.editPast.shift();
    run.editFuture = [];
    run.frames = frames.slice();
    invalidateEditedRun(node, run);
    options.publishState();
    refresh(nodeId);
  }

  function invalidateEditedRun(node: CanvasNode, run: SequenceRun): void {
    run.backgroundFrames = undefined;
    run.boundaryFrames = undefined;
    delete node.frameSetInfo;
    delete node.assetPath;
    delete node.sourceSnapshot;
    run.sourceFrames = [];
    run.candidates = [];
    run.removed = [];
    run.atlas = undefined;
    run.outputPath = undefined;
    run.stage = 'resize';
    run.status = 'ready';
    run.error = undefined;
  }

  function undoFrames(nodeId: string, redo = false): void {
    const run = runs.get(nodeId);
    const node = sequenceNode(nodeId);
    if (!run || !node || controllers.size) return;
    const source = redo ? run.editFuture : run.editPast;
    const previous = source?.pop();
    if (!previous) return;
    const target = redo ? (run.editPast ??= []) : (run.editFuture ??= []);
    target.push(run.frames.slice());
    run.frames = previous;
    invalidateEditedRun(node, run);
    options.publishState();
    refresh(nodeId);
  }

  async function editableFrames(nodeId: string): Promise<SequenceFrame[]> {
    beginEdit(nodeId);
    if (controllers.size) return [];
    const node = sequenceNode(nodeId);
    if (!node) return [];
    const existing = runs.get(nodeId);
    if (existing?.frames.length) return existing.frames;
    if (!node.frameSetInfo || !node.assetPath) return [];
    const info = node.frameSetInfo;
    const path = node.assetPath;
    const inputSourceSnapshot = node.sourceSnapshot;
    const inputKey =
      inputSourceSnapshot && !isCanvasNodeStale(node, findSource(node))
        ? extractionKey(node)
        : undefined;
    await runStage(nodeId, 'save', async (run, signal) => {
      const response = await fetch(options.store.mediaUrl(path), { signal });
      if (!response.ok) throw new Error('无法读取已保存图集。');
      const bitmap = await createImageBitmap(await response.blob());
      const frames: SequenceFrame[] = [];
      try {
        for (const frame of info.frames) {
          if (signal.aborted) throw new DOMException('处理已取消。', 'AbortError');
          const canvas = document.createElement('canvas');
          canvas.width = frame.width;
          canvas.height = frame.height;
          canvas
            .getContext('2d')!
            .drawImage(
              bitmap,
              frame.x,
              frame.y,
              frame.width,
              frame.height,
              0,
              0,
              frame.width,
              frame.height
            );
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) => (value ? resolve(value) : reject(new Error('读取帧失败。'))),
              'image/png'
            )
          );
          frames.push({ time: frame.time, blob });
        }
      } finally {
        bitmap.close();
      }
      run.frames = frames;
      run.originalFrames = frames.slice();
      run.inputSourceSnapshot = inputSourceSnapshot;
      run.extractionKey = inputKey;
      invalidateEditedRun(node, run);
    });
    return runs.get(nodeId)?.frames || [];
  }

  return {
    backgroundInput(nodeId: string): SequenceFrame[] | undefined {
      return runs.get(nodeId)?.backgroundFrames;
    },
    replaceBackgroundFrames(
      nodeId: string,
      frames: SequenceFrame[],
      baseline: SequenceFrame[]
    ): void {
      replaceFrames(nodeId, frames);
      const run = runs.get(nodeId);
      if (
        run &&
        !controllers.size &&
        run.frames.length === frames.length &&
        run.frames.every((frame, index) => frame === frames[index])
      )
        run.backgroundFrames = baseline.slice();
    },
    async runTemplate(nodeId: string): Promise<void> {
      if (controllers.size) throw new Error('已有序列帧处理正在运行，请等待完成。');
      beginEdit(nodeId);
      const node = sequenceNode(nodeId);
      if (!node?.sequenceSettings) throw new Error('模板缺少序列帧设置。');
      const previous = runs.get(nodeId);
      if (previous?.frames.length && !previous.extractionKey)
        throw new Error(
          '当前图集草稿缺少有效的视频来源记录，请先在编辑器保存修改，或明确重新抽帧。'
        );
      const sourceChanged = persistedNode(nodeId)?.sourceVideoId !== node.sourceVideoId;
      if (sourceChanged) node.sourceVideoId = persistedNode(nodeId)?.sourceVideoId;
      if (
        !previous?.frames.length ||
        previous.stage === 'extract' ||
        sourceChanged ||
        previous.extractionKey !== extractionKey(node)
      ) {
        await actionSequence(nodeId, 'extract');
        const extracted = runs.get(nodeId);
        if (!extracted || extracted.status === 'failed' || extracted.status === 'cancelled')
          throw new Error(extracted?.error || '模板视频未完成抽帧。');
      }
      const actions: Record<string, string> = {
        cutout: node.sequenceSettings.cutout ? 'cutout' : 'skip-cutout',
        dedupe: 'dedupe',
        'dedupe-review': 'keep-all',
        resize: 'resize',
        save: 'save',
      };
      for (let step = 0; step < 5; step++) {
        const stage = runs.get(nodeId)?.stage;
        if (stage === 'complete') break;
        const action = stage && actions[stage];
        if (!action) throw new Error('序列帧处理阶段无效，请重新抽帧。');
        await actionSequence(nodeId, action);
        const run = runs.get(nodeId);
        if (!run || run.status === 'failed' || run.status === 'cancelled')
          throw new Error(run?.error || '模板序列帧处理未完成。');
      }
      if (runs.get(nodeId)?.status !== 'complete') throw new Error('模板图集未保存，流程已停止。');
      if (runs.get(nodeId)?.boundaryFrames?.length)
        options.setError(
          '检测到部分帧内容接触边缘，请检查动画是否裁切；检测结果不代表视觉验收通过。'
        );
    },
    editableFrames,
    replaceFrames,
    undoFrames,
    beginEdit,
    view(nodeId: string) {
      const node = sequenceNode(nodeId);
      return { node, source: node && findSource(node), run: runs.get(nodeId) };
    },
    discardEdit(nodeId: string): boolean {
      if (controllers.has(nodeId)) return false;
      drafts.delete(nodeId);
      clearRun(nodeId);
      options.publishState();
      return true;
    },
    hasDraft(nodeId: string): boolean {
      const draft = drafts.get(nodeId);
      const original = persistedNode(nodeId);
      const run = runs.get(nodeId);
      return (
        Boolean(run && run.status !== 'complete') ||
        Boolean(
          draft &&
            original &&
            JSON.stringify(draft.sequenceSettings) !== JSON.stringify(original.sequenceSettings)
        )
      );
    },
    renderCard,
    createFromVideo,
    isNodeBusy(nodeId: string) {
      return controllers.has(nodeId);
    },
    updateSetting,
    action: actionSequence,
    deleteNodes,
    clear,
    get isBusy() {
      return controllers.size > 0;
    },
    get hasUnsavedFrames() {
      return (
        [...runs.values()].some((run) => run.status !== 'complete') ||
        [...drafts].some(
          ([id, node]) =>
            JSON.stringify(node.sequenceSettings) !==
            JSON.stringify(persistedNode(id)?.sequenceSettings)
        )
      );
    },
  };
}
