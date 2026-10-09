declare const document: any;
import { mergeIconPrompt, configureMergeIcons } from './mergeIcons.js';
import { editMergeIcons } from './mergeIconsUi.js';
import { framePairSources, setFramePairSource, validateFramePairVideo } from './framePair.js';
import { canvasNeedsProcessing, invalidateCanvasDependents } from './templateWorkflow.js';
import {
  canvasReferences,
  isCanvasNodeStale,
  isCanvasSourceCurrent,
  snapshotCanvasSource,
} from './dependencies.js';
import { createPromptEditor, formatBuiltinPrompt } from './promptEditor.js';
import { selectedUiExtraction } from './uiRecognition.js';
import {
  IMAGE_OUTPUT_RATIOS,
  canvasOriginalImage,
  imageRatioInfo,
  resolveImageSize,
  imageResultWarning,
} from './imageSizing.js';
import { createVideoPrompts } from './videoPrompts.js';
import { videoTaskTiming } from './videoTaskTiming.js';
import type { TemplateOutputDecision } from './templateWorkflow.js';
import type { CanvasDocument, CanvasNode } from './model.js';
import type { CanvasGenerationAttempt } from '../console/canvasGeneration.js';
import { videoInputSources, videoAttemptMatchesSources } from './videoInputs.js';
import { withCanvasTimeout } from './requestTimeout.js';
import {
  isUiCutoutSource,
  detectUiCutoutColor,
  uiCutoutPrompt,
  type UiCutoutColor,
} from './uiCutout.js';

export interface CanvasWorkflowEdit {
  canSubmit: boolean;
  submit(execute: () => Promise<boolean>): Promise<void>;
}

export function imageEditSources(
  document: CanvasDocument,
  source: CanvasNode,
  targetId?: string
): CanvasNode[] {
  if (targetId !== source.id) return [source];
  const parents = document.edges
    .filter((edge) => edge.to === targetId && edge.kind === 'image-variant')
    .map((edge) =>
      document.nodes.find(
        (node) => node.id === edge.from && node.type === 'image' && node.assetPath
      )
    )
    .filter((node): node is CanvasNode => Boolean(node));
  return parents.length ? [...parents, source] : [source];
}

export interface CanvasGenerationUiOptions {
  videoPrompts?: ReturnType<typeof createVideoPrompts>;
  store: {
    importImage(
      canvasId: string,
      bytes: ArrayBuffer,
      contentType: string
    ): Promise<{ relativePath: string }>;
    mediaUrl(path: string): string;
    imageInfo?(path: string): Promise<{ width: number; height: number } | undefined>;
    listGeneration(canvasId: string): Promise<any[]>;
    videoHistory?(offset?: number, limit?: number): Promise<{ busy?: { reason?: string } }>;
    generateImage(
      canvasId: string,
      input: Record<string, unknown>,
      signal?: AbortSignal
    ): Promise<any>;
    createVideo(
      canvasId: string,
      input: Record<string, unknown>,
      signal?: AbortSignal
    ): Promise<any>;
    generationAction(
      canvasId: string,
      attemptId: string,
      action: 'query' | 'retry' | 'cancel',
      signal?: AbortSignal
    ): Promise<any>;
  };
  getDocument(): any;
  getSelected(): Set<string>;
  remember(): void;
  markDirty(): void;
  flush(): Promise<boolean>;
  render(): void;
  nextPlacement(type: string): { x: number; y: number };
  loadMedia(path: string): Promise<void>;
  requestImageImport(nodeId: string): void;
  requestVideoImport(nodeId: string): void;
  setError(message: string, level?: 'info' | 'warning' | 'error'): void;
  log?(message: string, level: 'info' | 'warning' | 'error'): void;
  createId(): string;
  resolveTarget?(
    sourceId: string,
    type: 'image' | 'video',
    preferredTargetId?: string
  ): TemplateOutputDecision | undefined;
  onGenerated?(nodeId: string, kind: string): Promise<void>;
  onVideoCreated?(nodeId: string): void;
  onGenerateStart?(): void;
  referencesBlocked?(): boolean;
}

export function createCanvasGenerationUi(options: CanvasGenerationUiOptions): {
  render(
    card: any,
    node: any,
    nodes: any[],
    operationOverride?: 'outpaint',
    workflow?: CanvasWorkflowEdit
  ): void;
  restore(): Promise<void>;
  creditsLabel(node: any): string | undefined;
  runTemplateVideo(
    nodeId: string,
    duration: number,
    userConfirmed?: boolean,
    useSavedInput?: boolean
  ): Promise<boolean>;
  runTemplateImage(nodeId: string): Promise<boolean>;
  resetDraft(nodeId: string): void;
  hasInputDraft(): boolean;
  isNodeBusy(nodeId: string): boolean;
  canStopWaiting(nodeId: string): boolean;
  stopWaiting(nodeId: string): void;
  hasUnsettledResult(nodeId: string): boolean;
  nodeState(nodeId: string): { status: string; canQuery: boolean } | undefined;
  queueBlockReason(nodeId: string): string | undefined;
  retryableImage(nodeId: string): boolean;
  queryNode(nodeId: string, throwOnError?: boolean): Promise<void>;
  recoverVideo(attempt: any): Promise<boolean>;
  imageTarget(node: any): string | undefined;
  imageSizing(nodeId: string):
    | (Pick<CanvasGenerationAttempt, 'referenceImages' | 'originalImage' | 'warnings'> & {
        requestedSize?: string;
        actual?: CanvasGenerationAttempt['resultImageInfo'];
      })
    | undefined;
  readonly isBusy: boolean;
} {
  const GAME_ASSET_CONSTRAINTS =
    '游戏素材约束：单个主体、完整不裁切、四周保留动作空间；背景均匀纯色；不出现地面、地砖、站台、展示台、底座、台阶、接触阴影、投影、反射、文字、Logo、水印或其他角色。';
  const videoPrompts = options.videoPrompts || createVideoPrompts();

  function withGameAssetConstraints(prompt: string): string {
    return prompt.includes('游戏素材约束：') ? prompt : prompt + '\n\n' + GAME_ASSET_CONSTRAINTS;
  }

  function templateVideoPrompt(prompt: unknown): string {
    return videoPrompts.prepare(String(prompt || ''));
  }

  const attempts = new Map<string, any>();
  const retryableImages = new Set<string>();
  const unconfirmedImages = new Map<string, number>();
  function recordAttempt(attempt: any) {
    attempts.set(attempt.id, attempt);
    const key = attempt.canvasId + ':' + attempt.targetNodeId;
    const started = unconfirmedImages.get(key);
    if (
      attempt.kind === 'image' &&
      started !== undefined &&
      Date.parse(attempt.createdAt) >= started
    )
      unconfirmedImages.delete(key);
  }
  const inFlight = new Set<string>();
  const drafts = new Map<string, string>();
  const references = new Map<string, string[]>();
  const removedImageSources = new Map<string, Map<string, string>>();
  const inputBaselines = new Map<string, { node: any; canvasId: string; value: string }>();
  const importingReferences = new Set<string>();
  const videoWaits = new Map<string, () => void>();
  const stoppedVideos = new Set<string>();
  const stoppedAttempts = new Set<string>();
  const videoKey = (canvasId: string, nodeId: string) => canvasId + ':' + nodeId;
  async function waitVideoRequest(
    request: Promise<any>,
    canvasId: string,
    nodeId: string,
    createdAt: string,
    attemptId?: string,
    controller?: AbortController
  ) {
    const key = videoKey(canvasId, nodeId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let stoppedAt = '';
    async function cancelAttempt(attempt: any, fromRequest = false) {
      if (attempt.kind !== 'video' || attempt.targetNodeId !== nodeId) return;
      if (!fromRequest) {
        if (attemptId ? attempt.id !== attemptId : attempt.createdAt < createdAt) return;
        if (!attemptId && attempt.createdAt >= stoppedAt) return;
      }
      stoppedAttempts.add(attempt.id);
      attempts.set(attempt.id, { ...attempt, localWaitCanceledAt: new Date().toISOString() });
      try {
        await options.store.generationAction(canvasId, attempt.id, 'cancel');
      } catch {
        options.setError('已停止本地等待，但停止标记保存失败；旧结果请从视频历史核实。', 'warning');
      }
    }
    const interrupted = new Promise<undefined>((resolve) => {
      const stop = () => {
        if (stopped) return;
        stopped = true;
        stoppedAt = new Date().toISOString();
        stoppedVideos.add(key);
        resolve(undefined);
        controller?.abort();
        void options.store
          .listGeneration(canvasId)
          .then(async (list: any[]) => {
            for (const attempt of list) await cancelAttempt(attempt);
            if (options.getDocument()?.id === canvasId) options.render();
          })
          .catch(() =>
            options.setError('已停止等待；历史暂时读取失败，请稍后刷新视频历史。', 'warning')
          );
      };
      videoWaits.set(key, stop);
      timer = setTimeout(stop, 5 * 60_000);
    });
    options.render();
    try {
      const result = await Promise.race([
        request.then((result) => {
          if (stopped && result?.id) void cancelAttempt(result, true);
          return result;
        }),
        interrupted,
      ]);
      if (!stopped && result !== undefined) return result;
      options.setError(
        '已结束本地等待；远端任务不会取消，结果可在视频历史中取回，也可明确发起新生成。',
        'warning'
      );
      return;
    } finally {
      clearTimeout(timer);
      videoWaits.delete(key);
    }
  }
  const imageSettings = new Map<
    string,
    { model: string; resolution: string; aspectRatio: string }
  >();
  const videoSettings = new Map<
    string,
    { model: string; resolution: string; duration: number; ratio: string; mode: string }
  >();

  function referenceKey(node: any): string {
    return options.getDocument().id + '/' + node.id;
  }
  function referencePaths(node: any): string[] {
    return references.get(referenceKey(node)) || node.generation?.referenceImagePaths || [];
  }
  function inputState(node: any): string {
    const image = node.type === 'image';
    const settings =
      (image ? imageSettings : videoSettings).get(referenceKey(node)) ||
      node.generationDraft?.parameters ||
      node.generation?.parameters ||
      {};
    const prompt = formatBuiltinPrompt(
      drafts.get(node.id) ?? node.generationDraft?.prompt ?? node.generation?.prompt ?? ''
    );
    return JSON.stringify({
      prompt: node.generationDraft ? undefined : image ? prompt : videoPrompts.prepare(prompt),
      model: settings.model || (image ? 'auto' : '2.0'),
      resolution: settings.resolution || (image ? '1K' : '720p'),
      ratio: image ? settings.aspectRatio || '1:1' : settings.ratio || 'adaptive',
      duration: image ? undefined : settings.duration || 4,
      mode: image ? undefined : currentVideoMode(node),
      references: referencePaths(node),
      removed: [...(removedImageSources.get(referenceKey(node)) || [])],
    });
  }
  function rememberInput(node: any): void {
    const key = referenceKey(node);
    if (!inputBaselines.has(key))
      inputBaselines.set(key, {
        node,
        canvasId: options.getDocument().id,
        value: inputState(node),
      });
  }
  function includesImageSource(node: any, source: any): boolean {
    return removedImageSources.get(referenceKey(node))?.get(source.id) !== source.assetPath;
  }
  function currentVideoMode(node: any): string {
    if (node.videoInputMode === 'first_last_frame') return 'first_last_frame';
    return (
      videoSettings.get(referenceKey(node))?.mode ||
      node.generationDraft?.parameters?.mode ||
      node.generation?.parameters?.mode ||
      (referenceSources(node).length + referencePaths(node).length === 1
        ? 'first_frame'
        : 'select_mode')
    );
  }

  function referenceLimit(node: any): number {
    if (node.type === 'image') return 14;
    const mode = currentVideoMode(node);
    const model =
      videoSettings.get(referenceKey(node))?.model ||
      node.generationDraft?.parameters?.model ||
      node.generation?.parameters?.model ||
      '2.0';
    return mode === 'first_frame' ? 1 : mode === 'first_last_frame' ? 2 : model === '2.5' ? 30 : 9;
  }

  async function importReferences(
    node: any,
    files: any[],
    canvasId: string,
    workflow?: CanvasWorkflowEdit
  ): Promise<void> {
    const current = options.getDocument();
    if (node.videoInputMode === 'first_last_frame') {
      options.setError('请在首帧、尾帧位置选择画布图片；更换文件请使用对应图片卡。');
      return;
    }
    if (
      !current ||
      !files.length ||
      current.id !== canvasId ||
      !current.nodes.some((item: any) => item.id === (node.draftSourceId || node.id))
    )
      return;
    const key = referenceKey(node);
    if (importingReferences.has(key) || inFlight.has(node.id)) return;
    const maxBytes = (node.type === 'image' ? 10 : 20) * 1024 * 1024;
    if (files.some((file) => file.size > maxBytes)) {
      options.setError('参考图片不能超过 ' + maxBytes / 1024 / 1024 + ' MiB。');
      return;
    }
    if (
      files.some(
        (file) => file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
    ) {
      options.setError('参考图只接受 PNG、JPEG 或 WebP。');
      return;
    }
    const implicitCount = referenceSources(node, Boolean(workflow)).length;
    const limit = referenceLimit(node);
    if (referencePaths(node).length + implicitCount + files.length > limit) {
      options.setError(
        '当前输入方式最多支持 ' +
          limit +
          ' 张图片（包含已连接的来源图），请调整输入方式或移除参考图。'
      );
      return;
    }
    importingReferences.add(key);
    options.render();
    try {
      for (const file of files) {
        const saved = await options.store.importImage(
          current.id,
          await file.arrayBuffer(),
          file.type || 'application/octet-stream'
        );
        if (
          options.getDocument()?.id !== current.id ||
          !options
            .getDocument()
            .nodes.some((item: any) => item.id === (node.draftSourceId || node.id))
        ) {
          options.setError('已离开原卡片，参考图未添加到其他卡片。');
          return;
        }
        rememberInput(node);
        references.set(key, [...referencePaths(node), saved.relativePath]);
      }
      options.setError('');
    } catch (error) {
      options.setError(error instanceof Error ? error.message : '参考图片导入失败，请重试。');
    } finally {
      importingReferences.delete(key);
      options.render();
    }
  }

  function referenceSources(node: any, reuseTarget = false): any[] {
    const current = options.getDocument();
    const draftSourceIds = node.generationDraft?.sourceImageIds?.length
      ? node.generationDraft.sourceImageIds
      : [];
    if (draftSourceIds.length) {
      return draftSourceIds
        .map((id: string) => current.nodes.find((item: any) => item.id === id))
        .filter((source: any) => source?.type === 'image' && source.assetPath)
        .filter((source: any) => includesImageSource(node, source));
    }
    if (node.referenceInput) {
      const sources = videoInputSources(current, node);
      if (
        node.type === 'image' &&
        node.referenceInput.includeSelf &&
        node.assetPath &&
        !sources.some((source) => source.id === node.id)
      )
        sources.push(node);
      return sources.filter((source) => includesImageSource(node, source));
    }
    if (node.type !== 'image')
      return videoInputSources(current, node).filter((source) => includesImageSource(node, source));
    const sourceId =
      node.draftSourceId ||
      node.generationDraft?.sourceImageId ||
      node.generation?.sourceImageId ||
      current.edges.find((edge: any) => edge.to === node.id)?.from;
    const source =
      node.type === 'image' && node.assetPath
        ? node
        : current.nodes.find((item: any) => item.id === sourceId);
    const decision =
      node.type === 'image'
        ? reuseTarget
          ? { kind: 'reuse', nodeId: node.id }
          : options.resolveTarget?.(source?.id || node.id, 'image', node.id)
        : undefined;
    return source?.assetPath
      ? imageEditSources(
          current,
          source,
          decision?.kind === 'reuse' ? decision.nodeId : undefined
        ).filter((item) => includesImageSource(node, item))
      : [];
  }

  function renderReferences(
    panel: any,
    node: any,
    busy: boolean,
    workflow?: CanvasWorkflowEdit
  ): void {
    const key = referenceKey(node);
    const sources = referenceSources(node, Boolean(workflow));
    const paths = referencePaths(node);
    const mode = node.type === 'image' ? undefined : currentVideoMode(node);
    const strip = document.createElement('div');
    strip.className = 'generation-references';
    function thumbnail(path: string, labelText: string, index?: number, source?: any): void {
      const tile = document.createElement('div');
      tile.className = 'generation-reference';
      const preview = document.createElement('img');
      preview.src = options.store.mediaUrl(path);
      preview.alt = labelText;
      const label = document.createElement('small');
      label.textContent = labelText;
      tile.append(preview, label);
      if (index !== undefined || source) {
        const removeLabel = source ? '移除' + labelText + '参考' : '移除参考图 ' + (index! + 1);
        const remove = button(
          '×',
          () => {
            rememberInput(node);
            if (source) {
              const removed = removedImageSources.get(key) || new Map<string, string>();
              removed.set(source.id, source.assetPath);
              removedImageSources.set(key, removed);
            } else {
              references.set(
                key,
                referencePaths(node).filter((_, position) => position !== index)
              );
            }
            options.render();
          },
          {
            className: 'generation-reference-remove',
            title: removeLabel,
            disabled: busy,
          }
        );
        remove.setAttribute('aria-label', removeLabel);
        tile.append(remove);
      }
      strip.append(tile);
    }
    function referenceLabel(position: number): string {
      return mode === 'first_last_frame'
        ? position === 0
          ? '首帧'
          : position === 1
            ? '尾帧'
            : '多余参考图'
        : mode === 'first_frame'
          ? '首帧'
          : '参考图 ' + (position + 1);
    }
    if (node.videoInputMode === 'first_last_frame') {
      const current = options.getDocument();
      const frames = framePairSources(current, node.id);
      for (const [role, label] of [
        ['first', '首帧'],
        ['last', '尾帧'],
      ] as const) {
        const source = frames[role];
        const field = selectControl(
          label + '图片',
          [
            '',
            ...current.nodes
              .filter((item: any) => item.type === 'image' && item.assetPath)
              .map((item: any) => item.id),
          ],
          source?.id || ''
        );
        field.querySelector('span').textContent = label + ' · 必填';
        const select = field.querySelector('select');
        for (const option of Array.from(select.options) as any[])
          option.textContent =
            current.nodes.find((item: any) => item.id === option.value)?.title || '请选择' + label;
        select.disabled = busy || options.referencesBlocked?.() || frameReferenceBlocked(node.id);
        if (source?.assetPath) {
          thumbnail(source.assetPath, label);
          field.prepend(strip.lastChild);
        }
        select.addEventListener('change', async () => {
          if (
            options.getDocument() !== current ||
            inFlight.has(node.id) ||
            importingReferences.has(key) ||
            options.referencesBlocked?.() ||
            frameReferenceBlocked(node.id)
          )
            return;
          try {
            const chosen = current.nodes.find((item: any) => item.id === select.value);
            if (
              chosen &&
              (canvasNeedsProcessing(current, chosen) || frameReferenceBlocked(chosen.id))
            )
              throw new Error('请先完成参考图片的生成或处理。');
            const next = { ...current, edges: current.edges.slice() };
            setFramePairSource(next, node.id, role, select.value || undefined, options.createId);
            options.remember();
            current.edges = next.edges;
            if (node.sectionId) node.templatePending = true;
            invalidateCanvasDependents(current, node.id);
            options.markDirty();
            importingReferences.add(key);
            options.render();
            if (!(await options.flush()))
              throw new Error('首尾帧设置尚未保存，请保存画布后再生成。');
            options.setError('');
          } catch (error) {
            options.setError((error as Error).message);
          } finally {
            importingReferences.delete(key);
            options.render();
          }
        });
        strip.append(field);
      }
      panel.append(strip);
      return;
    }
    sources.forEach((item: any, index: number) => {
      if (item.assetPath)
        thumbnail(
          item.assetPath,
          node.type === 'image'
            ? item.id === node.id
              ? '当前图片'
              : '来源图片 · ' + item.title
            : referenceLabel(index) + ' · ' + item.title,
          undefined,
          node.type === 'image' ? item : undefined
        );
    });
    paths.forEach((path, index) =>
      thumbnail(
        path,
        node.type === 'image' ? '参考图 ' + (index + 1) : referenceLabel(sources.length + index),
        index
      )
    );
    const full = sources.length + paths.length >= referenceLimit(node);
    const add = button(
      '+',
      () => {
        const canvasId = options.getDocument().id;
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = 'image/png,image/jpeg,image/webp';
        picker.multiple = true;
        picker.addEventListener('change', () => {
          void importReferences(node, Array.from(picker.files || []), canvasId, workflow);
        });
        picker.click();
      },
      {
        className: 'generation-reference-add',
        title: full ? '已达到当前模式的参考图上限' : '添加参考图（可多选）',
        disabled: busy || full,
      }
    );
    add.setAttribute('aria-label', '导入参考图');
    strip.append(add);
    panel.append(strip);
    if (node.type === 'image' && !sources.length && !paths.length) {
      const hint = document.createElement('small');
      hint.className = 'generation-reference-hint';
      hint.textContent = '未使用参考图，将仅根据提示词生成。';
      panel.append(hint);
    }
    if (importingReferences.has(key)) {
      const status = document.createElement('small');
      status.textContent = '参考图导入中…';
      strip.append(status);
    }
  }

  function frameReferenceBlocked(nodeId: string): boolean {
    return (
      inFlight.has(nodeId) ||
      [...attempts.values()].some(
        (attempt) =>
          attempt.canvasId === options.getDocument()?.id &&
          attempt.targetNodeId === nodeId &&
          !explicitPreExecutionRejection(attempt) &&
          ['pending', 'running', 'unknown', 'canceled'].includes(attempt.status)
      )
    );
  }

  function button(
    label: string,
    handler: () => unknown,
    buttonOptions: { className?: string; title?: string; disabled?: boolean } = {}
  ): any {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.className = buttonOptions.className || 'generation-action';
    if (buttonOptions.title) element.title = buttonOptions.title;
    element.disabled = Boolean(buttonOptions.disabled);
    element.addEventListener('click', (event: any) => {
      event.stopPropagation();
      void handler();
    });
    return element;
  }

  function startGeneration(): void {
    options.onGenerateStart?.();
  }

  function promptField(node: any, placeholder: string): any {
    const input = document.createElement('textarea');
    input.rows = 4;
    input.value = formatBuiltinPrompt(
      drafts.get(node.id) ?? node.generationDraft?.prompt ?? node.generation?.prompt ?? ''
    );
    if (node.type !== 'image') input.value = videoPrompts.prepare(input.value);
    input.placeholder = placeholder;
    input.className = 'generation-prompt';
    input.addEventListener('pointerdown', (event: any) => event.stopPropagation());
    input.addEventListener('input', () => {
      if (!node.generationDraft) rememberInput(node);
      drafts.set(node.id, input.value);
      if (node.generationDraft) {
        node.generationDraft.prompt = input.value;
        options.markDirty();
      }
    });
    return input;
  }

  function selectControl(label: string, values: string[], current: string): any {
    const wrapper = document.createElement('label');
    wrapper.className = 'generation-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    const select = document.createElement('select');
    select.className = 'generation-mode';
    select.setAttribute('aria-label', label);
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value === 'source' ? '跟随原稿' : value;
      option.selected = value === current;
      select.append(option);
    });
    select.addEventListener('pointerdown', (event: any) => event.stopPropagation());
    wrapper.append(caption, select);
    Object.defineProperty(wrapper, 'value', { get: () => select.value });
    return wrapper;
  }

  function promptFor(
    node: any,
    input: any,
    operation: 'generate' | 'variant' | 'outpaint'
  ): string {
    const defaults: Record<string, string> = {
      generate:
        '生成一个用于游戏的二次元角色、道具或怪物素材，主体完整，结构清晰，适合后续动作生成和序列帧抽取',
      variant:
        '保持参考图中的游戏素材身份、主要外观和构图，只根据输入要求生成一个可用于游戏的变体，主体完整不裁切',
      outpaint:
        '保持游戏角色主体、武器和比例不变，扩展战斗场景与背景空间，补全动作和道具区域，主体不出画面',
    };
    const value =
      input.value.trim() ||
      node.generationDraft?.prompt ||
      node.generation?.prompt ||
      defaults[operation];
    const prompt = operation === 'generate' ? withGameAssetConstraints(value) : value;
    input.value = prompt;
    drafts.set(node.id, prompt);
    return prompt;
  }

  function generationParameters(attempt: any, node?: any) {
    const { model, resolution, aspectRatio, ratio, duration, mode } =
      attempt.parameters || node?.generation?.parameters || {};
    return Object.fromEntries(
      Object.entries({ model, resolution, aspectRatio, ratio, duration, mode }).filter(
        ([, value]) => value !== undefined
      )
    );
  }

  function applyAttempt(attempt: any, persist = true, replace = false): boolean {
    const documentState = options.getDocument();
    if (!documentState || attempt.status !== 'succeeded' || !attempt.resultAssetPath) return false;
    if (documentState.deletedGenerationIds?.includes(attempt.id)) return false;
    if (
      attempt.targetNodeId &&
      !documentState.nodes.some((node: any) => node.id === attempt.targetNodeId)
    )
      return false;
    if (documentState.nodes.some((node: any) => node.generation?.attemptId === attempt.id))
      return false;
    if (attempt.kind === 'image') {
      const targetNode = attempt.targetNodeId
        ? documentState.nodes.find(
            (node: any) => node.id === attempt.targetNodeId && node.type === 'image'
          )
        : undefined;
      if (targetNode && targetNode.assetPath && !replace) return false;
      if (persist) options.remember();
      const point = options.nextPlacement('image');
      const resultNodeId = targetNode?.id || options.createId();
      const sourceImageIds = (
        attempt.sourceImageIds?.length
          ? attempt.sourceImageIds
          : attempt.sourceImageId
            ? [attempt.sourceImageId]
            : []
      ).filter((id: string) => id !== resultNodeId);
      const resultNode = targetNode || {
        id: resultNodeId,
        type: 'image',
        x: point.x,
        y: point.y,
        width: 260,
        height: 220,
        title: '生图结果',
        ...(sourceImageIds.length &&
        documentState.nodes.find((node: any) => node.id === sourceImageIds[0])?.sectionId
          ? {
              sectionId: documentState.nodes.find((node: any) => node.id === sourceImageIds[0])
                .sectionId,
            }
          : {}),
      };
      const templateTarget =
        targetNode?.sectionId &&
        documentState.nodes.some(
          (node: CanvasNode) => node.id === targetNode.sectionId && node.templateId
        );
      if (!templateTarget)
        resultNode.title = resultNode.mergeIcons
          ? '二合图标 · 已保存结果'
          : attempt.operation === 'variant'
            ? '图片变体 · 已保存结果'
            : attempt.operation === 'outpaint'
              ? '扩展画面 · 已保存结果'
              : '生图结果';
      resultNode.assetPath = attempt.resultAssetPath;
      resultNode.imageInfo = attempt.resultImageInfo;
      if (resultNode.referenceInput)
        resultNode.referenceInput = {
          includeSelf: (attempt.sourceImageIds || [attempt.sourceImageId]).includes(resultNodeId),
        };
      delete resultNode.templatePending;
      delete resultNode.generationDraft;
      resultNode.generation = {
        prompt: attempt.prompt,
        ...(attempt.cutoutColor ? { cutoutColor: attempt.cutoutColor } : {}),
        referenceImagePaths: attempt.referenceImagePaths || [],
        parameters: generationParameters(attempt, resultNode),
        operation: attempt.operation || 'generate',
        attemptId: attempt.id,
        sourceImageId: sourceImageIds[0],
        sourceImageIds: sourceImageIds.length ? sourceImageIds : undefined,
      };
      resultNode.sourceSnapshot =
        attempt.sourceSnapshot?.nodeId === sourceImageIds[0]
          ? attempt.sourceSnapshot
          : snapshotCanvasSource(
              sourceImageIds.length
                ? documentState.nodes.find((node: any) => node.id === sourceImageIds[0])
                : undefined
            );
      resultNode.sourceSnapshots = sourceImageIds
        .map(
          (id: string) =>
            attempt.sourceSnapshots?.find((snapshot: any) => snapshot.nodeId === id) ||
            (attempt.sourceSnapshot?.nodeId === id ? attempt.sourceSnapshot : undefined) ||
            snapshotCanvasSource(documentState.nodes.find((node: any) => node.id === id))
        )
        .filter(Boolean);
      if (!targetNode) documentState.nodes.push(resultNode);
      else
        documentState.edges = documentState.edges.filter(
          (edge: any) =>
            edge.to !== resultNodeId ||
            edge.kind !== 'image-variant' ||
            (resultNode.referenceInput && sourceImageIds.includes(edge.from))
        );
      for (const sourceId of sourceImageIds) {
        if (
          documentState.edges.some(
            (edge: any) =>
              edge.to === resultNodeId && edge.from === sourceId && edge.kind === 'image-variant'
          )
        )
          continue;
        documentState.edges.push({
          id: options.createId(),
          from: sourceId,
          to: resultNodeId,
          kind: 'image-variant',
        });
      }
    } else if (attempt.sourceImageId) {
      const source = documentState.nodes.find((node: any) => node.id === attempt.sourceImageId);
      const sourceImageIds = Array.from(
        new Set<string>([attempt.sourceImageId, ...(attempt.sourceImageIds || [])])
      );
      const sourceSnapshots = sourceImageIds.map((id, index) => {
        const recorded = attempt.sourceSnapshots?.find((snapshot: any) => snapshot.nodeId === id);
        if (recorded) return recorded;
        if (attempt.sourceSnapshot?.nodeId === id) return attempt.sourceSnapshot;
        const originalPath =
          attempt.sourceImagePaths?.[index] || (index === 0 ? attempt.sourceImagePath : undefined);
        return {
          nodeId: id,
          version: originalPath ? 'image|' + originalPath + '|manual-asset' : 'unknown-input',
        };
      });
      const point = source
        ? { x: source.x + source.width + 48, y: source.y }
        : options.nextPlacement('video-source');
      const resultNode = attempt.targetNodeId
        ? documentState.nodes.find(
            (node: any) =>
              node.id === attempt.targetNodeId &&
              (node.type === 'video' || node.type === 'video-source')
          )
        : undefined;
      const videoId = resultNode?.id || options.createId();
      if (persist) options.remember();
      if (resultNode) {
        if (resultNode.type === 'video') {
          resultNode.width = 300;
          resultNode.height = 250;
        }
        resultNode.type = 'video-source';
        resultNode.title = '视频结果';
        resultNode.assetPath = attempt.resultAssetPath;
        delete resultNode.generationDraft;
        delete resultNode.templatePending;
        delete resultNode.videoInfo;
        resultNode.generation = {
          prompt: attempt.prompt,
          parameters: generationParameters(attempt, resultNode),
          taskId: attempt.taskId,
          attemptId: attempt.id,
          sourceImageId: attempt.sourceImageId,
          sourceImageIds,
          referenceImagePaths: attempt.referenceImagePaths || [],
        };
        resultNode.sourceSnapshot = sourceSnapshots[0];
        resultNode.sourceSnapshots = sourceSnapshots;
      } else {
        documentState.nodes.push({
          id: videoId,
          type: 'video-source',
          x: point.x,
          y: point.y,
          width: 300,
          height: 250,
          title: '视频结果',
          assetPath: attempt.resultAssetPath,
          generation: {
            prompt: attempt.prompt,
            parameters: generationParameters(attempt),
            taskId: attempt.taskId,
            attemptId: attempt.id,
            sourceImageId: attempt.sourceImageId,
            sourceImageIds,
            referenceImagePaths: attempt.referenceImagePaths || [],
          },
          sourceSnapshot: sourceSnapshots[0],
          sourceSnapshots,
        });
      }
      if (resultNode) {
        if (resultNode.referenceInput)
          documentState.edges = documentState.edges.filter(
            (edge: any) =>
              edge.to !== videoId ||
              !['first-frame', 'image-to-video'].includes(edge.kind) ||
              sourceImageIds.includes(edge.from)
          );
        for (const edge of documentState.edges) {
          if (edge.to === videoId && edge.kind === 'first-frame') edge.kind = 'image-to-video';
        }
      }
      for (const sourceId of resultNode ? [] : sourceImageIds) {
        if (
          !documentState.nodes.some(
            (node: any) => node.id === sourceId && node.type === 'image' && node.assetPath
          )
        )
          continue;
        documentState.edges.push({
          id: options.createId(),
          from: sourceId,
          to: videoId,
          kind: 'image-to-video',
        });
      }
    }
    const output = documentState.nodes.find(
      (item: CanvasNode) => item.generation?.attemptId === attempt.id
    );
    if (output && attempt.kind === 'image' && attempt.resultImageInfo) {
      output.imageInfo = attempt.resultImageInfo;
      const warning = imageResultWarning(attempt.resultImageInfo, attempt.parameters?.targetSize);
      if (warning) {
        if (output.sectionId) output.templatePending = true;
        options.setError(warning);
      }
    }
    void options.loadMedia(attempt.resultAssetPath).then(() => options.render());
    if (persist) options.markDirty();
    if (persist) options.render();
    return true;
  }

  async function runImage(
    node: any,
    input: any,
    operation: 'generate' | 'variant' | 'outpaint' = 'generate',
    settings: {
      model?: string;
      resolution?: string;
      aspectRatio?: string;
      refreshSource?: boolean;
      templateRun?: boolean;
    } = {}
  ): Promise<void> {
    const documentState = options.getDocument();
    if (!documentState || inFlight.has(node.id) || importingReferences.has(referenceKey(node)))
      return;
    if (node.mergeIcons && operation === 'outpaint') {
      options.setError('二合图标卡用于阶段图集生成，不支持扩展画面；请使用普通图片卡。');
      return;
    }
    let selectedOperation = node.mergeIcons
      ? 'generate'
      : node.generationDraft?.operation || operation;
    const refreshUpstream = Boolean(settings.templateRun && settings.refreshSource);
    const sourceImageId = node.referenceInput
      ? referenceSources(node)[0]?.id
      : node.assetPath && !refreshUpstream
        ? node.id
        : node.generationDraft?.sourceImageId ||
          node.generation?.sourceImageId ||
          (selectedOperation !== 'generate' ? node.id : undefined);
    const source = sourceImageId
      ? documentState.nodes.find((item: any) => item.id === sourceImageId && item.type === 'image')
      : node;
    const decision = settings.templateRun
      ? { kind: 'reuse' as const, nodeId: node.id }
      : options.resolveTarget?.(source?.id || node.id, 'image', node.id);
    if (decision?.kind === 'blocked') {
      options.setError(decision.message);
      return;
    }
    const targetId = node.mergeIcons
      ? node.id
      : decision?.kind === 'reuse'
        ? decision.nodeId
        : !node.assetPath
          ? node.id
          : undefined;
    const sourceNodes = (
      node.referenceInput
        ? referenceSources(node)
        : refreshUpstream
          ? canvasReferences(documentState, node.id).length
            ? canvasReferences(documentState, node.id).filter(
                (source) => source.type === 'image' && source.assetPath
              )
            : selectedOperation !== 'generate' && source?.assetPath
              ? imageEditSources(documentState, source, targetId)
              : []
          : referenceSources(node, Boolean(settings.templateRun))
    ).filter((source) => includesImageSource(node, source));
    if (
      !sourceNodes.length &&
      (node.referenceInput || removedImageSources.has(referenceKey(node)))
    ) {
      selectedOperation = 'generate';
    }
    if (selectedOperation !== 'generate' && !sourceNodes.length) {
      options.setError('变体或扩展画面需要一张已保存的来源图片。');
      return;
    }
    if (node.mergeIcons && !sourceNodes.length && !referencePaths(node).length) {
      options.setError('二合图标需要一张风格参考图，请先引用或导入图片。');
      return;
    }
    let prompt = node.mergeIcons
      ? mergeIconPrompt(node.mergeIcons)
      : promptFor(node, input, selectedOperation);
    inFlight.add(node.id);
    if (targetId) inFlight.add(targetId);
    options.render();
    try {
      const original = canvasOriginalImage(documentState, node);
      const paths = [
        ...new Set([
          ...sourceNodes.map((item) => item.assetPath!),
          ...referencePaths(node),
          ...(original?.assetPath ? [original.assetPath] : []),
        ]),
      ];
      const sizes = new Map<string, { width: number; height: number }>();
      for (const path of paths) {
        const info = options.store.imageInfo
          ? await options.store.imageInfo(path)
          : documentState.nodes.find((item: CanvasNode) => item.assetPath === path)?.imageInfo;
        if (info) {
          sizes.set(path, info);
          const warning = imageRatioInfo(info).warning;
          if (warning) {
            options.log?.(warning, 'warning');
            options.setError(warning, 'warning');
          }
        }
      }
      const originalInfo = original?.assetPath
        ? sizes.get(original.assetPath)
        : paths.length === 1
          ? sizes.get(paths[0])
          : undefined;
      const outputSize = resolveImageSize(
        settings.aspectRatio || '1:1',
        settings.resolution,
        originalInfo
      );
      if (options.getDocument() !== documentState) return;
      let cutoutColor: UiCutoutColor | undefined;
      const extraction = selectedUiExtraction(documentState, node);
      if (extraction) {
        node.uiBaselinePrompt ??= prompt;
        const correction = (node.generationDraft?.prompt || node.generation?.prompt || '')
          .split(String.fromCharCode(10))
          .find((line: string) => line.startsWith('输出排版校正：'));
        prompt = extraction.prompt + (correction ? String.fromCharCode(10) + correction : '');
      } else if (node.uiExtraction && node.uiBaselinePrompt) prompt = node.uiBaselinePrompt;
      if (targetId && isUiCutoutSource(documentState, targetId)) {
        cutoutColor = await detectUiCutoutColor(
          [...sourceNodes.map((source) => source.assetPath), ...referencePaths(node)],
          options.store.mediaUrl
        );
        if (options.getDocument() !== documentState) return;
        prompt = uiCutoutPrompt(prompt, cutoutColor);
        const inputField = node.assetPath ? 'generation' : 'generationDraft';
        node[inputField] = {
          ...node[inputField],
          operation: selectedOperation,
          prompt,
          parameters: {
            ...node.generation?.parameters,
            ...node.generationDraft?.parameters,
            model: settings.model,
            resolution: settings.resolution,
            aspectRatio: settings.aspectRatio,
          },
        };
        drafts.set(node.id, prompt);
        input.value = prompt;
        options.markDirty();
      }
      if (!(await options.flush())) {
        options.setError('画布尚未保存，保存成功后再生成。');
        return;
      }
      if (options.getDocument()?.id !== documentState.id) return;
      options.log?.(node.title + '：开始生成图片', 'info');
      const requestKey = documentState.id + ':' + targetId;
      if (targetId) unconfirmedImages.set(requestKey, Date.now());
      const attempt = await withCanvasTimeout(
        (signal) =>
          options.store.generateImage(
            documentState.id,
            {
              prompt,
              cutoutColor,
              operation: selectedOperation,
              targetNodeId: targetId,
              model: settings.model === 'auto' ? undefined : settings.model,
              resolution: settings.resolution,
              aspectRatio: settings.aspectRatio,
              targetSize: outputSize.targetSize,
              referenceImagePaths: [...referencePaths(node)],
              ...(!sourceNodes.length
                ? {}
                : {
                    sourceImageId: sourceNodes[0].id,
                    sourceImagePath: sourceNodes[0].assetPath,
                    sourceImageIds: sourceNodes.map((source) => source.id),
                    sourceImagePaths: sourceNodes.map((source) => source.assetPath),
                  }),
            },
            signal
          ),
        5 * 60_000
      );
      unconfirmedImages.delete(requestKey);
      attempts.set(attempt.id, attempt);
      if (options.getDocument()?.id !== documentState.id) return;
      if (attempt.status !== 'failed' || attempt.taskId) inputBaselines.delete(referenceKey(node));
      if (attempt.status === 'succeeded') {
        options.log?.(node.title + '：图片生成完成', 'info');
        applyAttempt(attempt, true, Boolean(node.assetPath));
        for (const warning of attempt.warnings || []) options.log?.(warning, 'warning');
        const mismatch =
          attempt.resultImageInfo &&
          imageResultWarning(attempt.resultImageInfo, attempt.parameters?.targetSize);
        if (mismatch) {
          const result = documentState.nodes.find(
            (item: CanvasNode) => item.generation?.attemptId === attempt.id
          );
          if (result?.sectionId) result.templatePending = true;
          options.setError(mismatch);
          options.markDirty();
          await options.flush();
          return;
        }
        if (await options.flush()) {
          const result = documentState.nodes.find(
            (item: any) => item.generation?.attemptId === attempt.id
          );
          inFlight.delete(node.id);
          if (targetId) inFlight.delete(targetId);
          if (result) await options.onGenerated?.(result.id, 'image');
        }
      } else {
        if (
          attempt.kind === 'image' &&
          attempt.status === 'failed' &&
          attempt.failureStage !== 'download' &&
          attempt.remoteStatus !== 'succeeded' &&
          attempt.executionState !== 'unknown' &&
          (attempt.executionState === 'not_executed' || attempt.remoteStatus === 'failed')
        )
          retryableImages.add(node.id);
        options.setError(
          attempt.error || '图片生成未完成，请检查任务状态。',
          attempt.status === 'unknown' ? 'warning' : 'error'
        );
        options.render();
      }
    } catch (error) {
      options.setError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.delete(node.id);
      if (targetId) inFlight.delete(targetId);
      options.render();
    }
  }

  async function runVideo(
    node: any,
    input: any,
    settings: {
      model?: string;
      resolution?: string;
      duration?: number;
      ratio?: string;
      userConfirmed?: boolean;
      templateRun?: boolean;
      mode?: string;
    } = {}
  ): Promise<boolean> {
    const documentState = options.getDocument();
    const inputKey = documentState && referenceKey(node);
    if (!documentState || inFlight.has(node.id)) return false;
    if (settings.model === '2.5' && settings.userConfirmed !== true) {
      if (!window.confirm('Seedance 2.5 成本更高，实际按上游 token 扣费。确认继续吗？'))
        return false;
      settings.userConfirmed = true;
    }
    const prompt = videoPrompts.prepare(input.value);
    if (!prompt.trim()) {
      options.setError('请填写视频动作描述；不会自动添加隐藏提示词。');
      return false;
    }
    input.value = prompt;
    drafts.set(node.id, prompt);
    const sources = referenceSources(node);
    const source = sources[0];
    const importedReferences = [...referencePaths(node)];
    const mode = settings.mode || currentVideoMode(node);
    try {
      validateFramePairVideo(
        documentState,
        node.id,
        mode,
        sources.map((source) => source.id),
        importedReferences
      );
    } catch (error) {
      options.setError((error as Error).message);
      return false;
    }
    if (!['first_frame', 'first_last_frame', 'multi_modal_reference'].includes(mode)) {
      options.setError('这张视频有多张来源图，但没有保存输入方式；请先选择首尾帧或多图参考。');
      return false;
    }
    const imageCount = sources.length + importedReferences.length;
    const maxImages = settings.model === '2.5' ? 30 : 9;
    if (mode === 'multi_modal_reference' && imageCount > maxImages) {
      options.setError('当前视频模型最多支持 ' + maxImages + ' 张参考图，请移除多余引用。');
      return false;
    }
    if (
      (mode === 'first_frame' && imageCount !== 1) ||
      (mode === 'first_last_frame' && imageCount !== 2)
    ) {
      options.setError(
        mode === 'first_last_frame'
          ? '首尾帧模式需要两张图片，按首帧、尾帧顺序排列。'
          : '首帧模式只能使用一张图片，请切换为首尾帧或多图参考模式。'
      );
      return false;
    }
    if (!sources.length || sources.some((item) => !item.assetPath)) {
      options.setError('请先把一张已保存的图片连接到视频卡。');
      inFlight.delete(node.id);
      options.render();
      return false;
    }
    const requesterId = node.id;
    const decision = settings.templateRun
      ? { kind: 'reuse' as const, nodeId: node.id }
      : options.resolveTarget?.(source.id, 'video', node.draftSourceId ? undefined : node.id);
    if (decision?.kind === 'blocked') {
      options.setError(decision.message);
      return false;
    }
    if (decision?.kind === 'reuse') {
      const target = documentState.nodes.find((item: any) => item.id === decision.nodeId);
      if (!target || inFlight.has(target.id)) return false;
      if (
        target.id !== node.id &&
        (JSON.stringify(videoInputSources(documentState, target).map((item) => item.id)) !==
          JSON.stringify(sources.map((item) => item.id)) ||
          currentVideoMode(target) !== mode ||
          JSON.stringify(referencePaths(target)) !== JSON.stringify(importedReferences))
      ) {
        options.setError(
          '待处理视频卡的引用或输入方式与当前面板不同，请选择该视频卡「调整参数」后生成；不会新增卡片或覆盖原结果。'
        );
        return false;
      }
      node = target;
      drafts.set(node.id, prompt);
    } else if (node.draftSourceId || decision?.kind === 'create') {
      const constrained = node.videoInputMode === 'first_last_frame';
      options.remember();
      node = {
        id: options.createId(),
        type: 'video',
        x: source.x + source.width + 48,
        y: source.y,
        width: 360,
        height: 240,
        title: '视频生成',
        ...(constrained ? { videoInputMode: 'first_last_frame' } : {}),
        ...(source.sectionId ? { sectionId: source.sectionId } : {}),
      };
      drafts.set(node.id, prompt);
      documentState.nodes.push(node);
      for (const inputSource of sources)
        documentState.edges.push({
          id: options.createId(),
          from: inputSource.id,
          to: node.id,
          kind: constrained
            ? inputSource.id === sources[0].id
              ? 'frame-first'
              : 'frame-last'
            : 'first-frame',
        });
      options.markDirty();
    }
    options.onVideoCreated?.(node.id);
    inFlight.add(requesterId);
    inFlight.add(node.id);
    stoppedVideos.delete(videoKey(documentState.id, node.id));
    options.render();
    try {
      if (!(await options.flush()) || options.getDocument()?.id !== documentState.id) return false;
      if (stoppedVideos.has(videoKey(documentState.id, node.id))) return false;
      options.log?.(node.title + '：开始生成视频', 'info');
      const submittedAt = new Date(Date.now()).toISOString();
      const controller = new AbortController();
      const attempt = await waitVideoRequest(
        options.store.createVideo(
          documentState.id,
          {
            prompt,
            sourceImagePath: source.assetPath,
            sourceImageId: source.id,
            sourceImageIds: sources.map((item) => item.id),
            sourceImagePaths: sources.map((item) => item.assetPath),
            referenceImagePaths: importedReferences,
            mode,
            targetNodeId: node.id,
            duration: settings.duration || 4,
            model: settings.model || '2.0',
            resolution: settings.resolution || '720p',
            ratio: settings.ratio || 'adaptive',
            userConfirmed: settings.userConfirmed === true,
          },
          controller.signal
        ),
        documentState.id,
        node.id,
        submittedAt,
        undefined,
        controller
      );
      if (!attempt) return false;
      attempts.set(attempt.id, attempt);
      if (options.getDocument()?.id !== documentState.id) return false;
      if ((attempt.status !== 'failed' || attempt.taskId) && inputKey)
        inputBaselines.delete(inputKey);
      if (attempt.status === 'succeeded') {
        options.log?.(node.title + '：视频生成完成', 'info');
        if (await recoverVideo(attempt)) {
          inFlight.delete(requesterId);
          inFlight.delete(node.id);
          await options.onGenerated?.(node.id, 'video');
          return true;
        }
        options.setError('视频已保存本地；当前卡片或引用已变化，未覆盖或推进后续流程。', 'info');
      } else {
        options.setError(
          attempt.error ||
            (['pending', 'running'].includes(attempt.status)
              ? '视频正在生成，可查询原任务。'
              : '视频未完成，请检查任务状态。'),
          attempt.status === 'failed' ? 'error' : attempt.status === 'unknown' ? 'warning' : 'info'
        );
        options.render();
      }
    } catch (error) {
      options.setError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.delete(requesterId);
      inFlight.delete(node.id);
      options.render();
    }
    return false;
  }

  async function runTemplateImage(nodeId: string): Promise<boolean> {
    retryableImages.delete(nodeId);
    const current = options.getDocument();
    const node = current?.nodes.find((item: any) => item.id === nodeId);
    if (!node || node.type !== 'image') return false;
    const list = await options.store.listGeneration(current.id);
    if (options.getDocument() !== current) return false;
    for (const attempt of list) recordAttempt(attempt);
    if (
      unconfirmedImages.has(current.id + ':' + nodeId) ||
      list.some(
        (attempt: any) =>
          attempt.targetNodeId === nodeId &&
          ['pending', 'running', 'unknown', 'canceled'].includes(attempt.status) &&
          !explicitPreExecutionRejection(attempt)
      )
    ) {
      options.setError('图片存在未确认任务，请先核查原任务，不会重复生成。');
      return false;
    }
    const previous = node.generation?.attemptId;
    const latest = latestNodeAttempt(nodeId);
    if (
      latest?.status === 'succeeded' &&
      latest.id !== previous &&
      latest.prompt === (node.generationDraft?.prompt || node.generation?.prompt)
    ) {
      if (recoverImage(latest, list)) {
        const saved = await options.flush();
        return (
          saved &&
          !(
            latest.resultImageInfo &&
            imageResultWarning(latest.resultImageInfo, latest.parameters?.targetSize)
          )
        );
      }
      options.setError('原图片已生成，但卡片或输入已变化，未覆盖当前内容，也未重复生成。');
      return false;
    }
    const recorded = list.find(
      (attempt: any) => attempt.id === previous && attempt.targetNodeId === nodeId
    );
    if (!references.has(referenceKey(node)))
      references.set(referenceKey(node), [
        ...(node.generation?.referenceImagePaths ||
          (node.referenceInput ? [] : recorded?.referenceImagePaths || [])),
      ]);
    const prompt = node.mergeIcons
      ? mergeIconPrompt(node.mergeIcons)
      : node.generation?.prompt || node.generationDraft?.prompt;
    if (!prompt?.trim()) {
      options.setError('此图片没有已保存的提示词，请先编辑提示词。');
      return false;
    }
    await runImage(node, { value: prompt }, node.generation?.operation || 'variant', {
      ...generationParameters(recorded || {}, node),
      ...node.generation?.parameters,
      ...node.generationDraft?.parameters,
      refreshSource: true,
      templateRun: true,
    });
    return Boolean(
      !(
        attempts.get(node.generation?.attemptId)?.resultImageInfo &&
        imageResultWarning(
          attempts.get(node.generation?.attemptId)!.resultImageInfo!,
          attempts.get(node.generation?.attemptId)!.parameters?.targetSize
        )
      ) &&
        node.generation?.attemptId &&
        node.generation.attemptId !== previous &&
        (await options.flush())
    );
  }

  async function runTemplateVideo(
    nodeId: string,
    duration: number,
    userConfirmed = false,
    useSavedInput = false
  ): Promise<boolean> {
    const current = options.getDocument();
    if (current) stoppedVideos.delete(videoKey(current.id, nodeId));
    const node = current?.nodes.find((item: any) => item.id === nodeId);
    const sources = current && node ? referenceSources(node) : [];
    if (!node || !sources.length || sources.some((item) => !item.assetPath))
      throw new Error('视频缺少有效的来源图片，请检查引用连线。');
    const snapshots = sources.map((item) => snapshotCanvasSource(item)!);
    const mode = currentVideoMode(node);
    const referenceImages = [...referencePaths(node)];
    const matchesInputs = (item: any) =>
      videoAttemptMatchesSources(item, sources) &&
      (mode === 'select_mode' ||
        (item.parameters?.mode ||
          ((item.sourceImagePaths?.length || 1) + (item.referenceImagePaths?.length || 0) === 1
            ? 'first_frame'
            : 'multi_modal_reference')) === mode) &&
      JSON.stringify(item.referenceImagePaths || []) === JSON.stringify(referenceImages);
    const list = await options.store.listGeneration(current.id);
    if (stoppedVideos.has(videoKey(current.id, nodeId))) return false;
    if (
      options.getDocument() !== current ||
      snapshots.some(
        (snapshot) =>
          !isCanvasSourceCurrent(
            snapshot,
            current.nodes.find((item: any) => item.id === snapshot.nodeId)
          )
      ) ||
      JSON.stringify(referenceSources(node).map((item) => item.id)) !==
        JSON.stringify(sources.map((item) => item.id))
    )
      return false;
    for (const item of list) attempts.set(item.id, item);
    if (
      list.some(
        (item: any) =>
          item.targetNodeId === nodeId &&
          (['pending', 'running', 'unknown', 'canceled'].includes(item.status) ||
            (item.status === 'failed' && item.taskId)) &&
          !matchesInputs(item)
      )
    ) {
      options.setError('旧来源仍有未确认的视频任务，请先查询原任务，不会重复生成。');
      return false;
    }
    const relevant = list.filter(
      (attempt: any) =>
        attempt.kind === 'video' && attempt.targetNodeId === nodeId && matchesInputs(attempt)
    );
    let attempt = relevant
      .sort((left: any, right: any) => left.createdAt.localeCompare(right.createdAt))
      .pop();
    const recorded = list.find(
      (item: any) => item.id === node.generation?.attemptId && item.targetNodeId === nodeId
    );
    if (
      !attempt ||
      (attempt.status === 'failed' && !attempt.taskId) ||
      (attempt.status === 'succeeded' && attempt.id === node.generation?.attemptId)
    ) {
      const prompt = templateVideoPrompt(
        !useSavedInput && attempt?.status === 'failed'
          ? attempt.prompt || node.generation?.prompt
          : node.generationDraft?.prompt || node.generation?.prompt
      );
      if (
        await runVideo(
          node,
          { value: prompt },
          {
            duration,
            model: '2.0',
            resolution: '720p',
            ratio: 'adaptive',
            ...generationParameters(recorded || {}, node),
            ...node.generation?.parameters,
            ...node.generationDraft?.parameters,
            ...(!useSavedInput && attempt?.status === 'failed'
              ? generationParameters(attempt)
              : {}),
            templateRun: true,
            userConfirmed,
          }
        )
      )
        return true;
      if (stoppedVideos.has(videoKey(current.id, nodeId))) return false;
      attempt = Array.from(attempts.values())
        .filter(
          (item: any) =>
            item.canvasId === current.id && item.targetNodeId === nodeId && matchesInputs(item)
        )
        .pop();
      if (!attempt) return false;
    }
    if (
      userConfirmed &&
      attempt &&
      ['unknown', 'failed', 'canceled'].includes(attempt.status) &&
      !unsentLocalVideoFailure(attempt)
    ) {
      options.setError(
        '视频结果未确认或已失败，已暂停队列；请在视频历史核实原任务，不自动查询或重新生成。',
        'warning'
      );
      return false;
    }
    if (attempt?.status === 'failed' && attempt.taskId) {
      const next = await waitVideoRequest(
        options.store.generationAction(current.id, attempt.id, 'query'),
        current.id,
        nodeId,
        attempt.createdAt,
        attempt.id
      );
      if (!next) return false;
      attempt = next;
      attempts.set(attempt.id, attempt);
    }
    while (
      attempt &&
      ['pending', 'running', 'canceled', 'unknown'].includes(attempt.status) &&
      attempt.taskId
    ) {
      if (videoTaskTiming(attempt).queryExpired) break;
      options.setError('视频正在生成，完成后自动处理序列帧；请保持页面打开。');
      let delay: ReturnType<typeof setTimeout> | undefined;
      try {
        await waitVideoRequest(
          new Promise((resolve) => {
            delay = setTimeout(() => resolve(true), 120000);
          }),
          current.id,
          nodeId,
          attempt.createdAt,
          attempt.id
        );
      } finally {
        clearTimeout(delay);
      }
      if (stoppedVideos.has(videoKey(current.id, nodeId))) return false;
      if (options.getDocument()?.id !== current.id) return false;
      if (videoTaskTiming(attempt).queryExpired) break;
      const next = await waitVideoRequest(
        options.store.generationAction(current.id, attempt.id, 'query'),
        current.id,
        nodeId,
        attempt.createdAt,
        attempt.id
      );
      if (!next) return false;
      attempt = next;
      attempts.set(attempt.id, attempt);
      if (attempt.status === 'unknown' || attempt.status === 'failed') break;
    }
    if (attempt?.status !== 'succeeded') {
      options.setError(
        attempt?.error || '视频尚未完成，已停止后续流程；可继续查询原任务，不会自动重新付费生成。'
      );
      return false;
    }
    if (options.getDocument()?.id !== current.id) return false;
    if (!(await recoverVideo(attempt))) {
      options.setError('视频已保存本地；当前卡片或引用已变化，未覆盖或推进后续流程。', 'info');
      return false;
    }
    options.setError('');
    return true;
  }

  async function action(
    attempt: any,
    actionName: 'query' | 'retry' | 'cancel',
    throwOnError = false
  ): Promise<void> {
    const videoRetry = actionName === 'retry' && attempt.kind === 'video';
    const mergeTarget = options
      .getDocument()
      ?.nodes.find((node: any) => node.id === attempt.targetNodeId && node.mergeIcons);
    if (
      actionName === 'retry' &&
      mergeTarget &&
      attempt.executionState === 'not_executed' &&
      attempt.failureStage !== 'download'
    ) {
      if (attempt.prompt !== mergeIconPrompt(mergeTarget.mergeIcons)) {
        options.setError('阶段设置已变更，请按新设置生成图集，不会重试旧提示词。');
        return;
      }
      await runTemplateImage(mergeTarget.id);
      return;
    }
    const targetId =
      attempt.kind === 'video' && actionName !== 'cancel' ? attempt.targetNodeId : undefined;
    if (targetId && inFlight.has(targetId)) return;
    if (targetId) {
      inFlight.add(targetId);
      options.onGenerateStart?.();
      options.render();
    }
    try {
      if (actionName === 'query' && videoTaskTiming(attempt).queryExpired)
        throw new Error('已超过提交后 6 小时的查询期限；历史记录和本地结果仍保留。');
      const startedAt = new Date(Date.now()).toISOString();
      const controller = videoRetry ? new AbortController() : undefined;
      const request = controller
        ? options.store.generationAction(
            attempt.canvasId,
            attempt.id,
            actionName,
            controller.signal
          )
        : options.store.generationAction(attempt.canvasId, attempt.id, actionName);
      if (targetId) stoppedVideos.delete(videoKey(attempt.canvasId, targetId));
      const next = targetId
        ? await waitVideoRequest(
            request,
            attempt.canvasId,
            targetId,
            startedAt,
            videoRetry ? undefined : attempt.id,
            controller
          )
        : await request;
      if (!next) {
        if (throwOnError) throw new Error('本地查询等待已停止，远端结果尚未确认。');
        return;
      }
      attempts.set(next.id, next);
      if (options.getDocument()?.id !== attempt.canvasId) return;
      if (next.kind === 'video') {
        const applied = await recoverVideo(next);
        if (next.status === 'succeeded' && !applied)
          options.setError(
            '视频已保存到本地；当前卡片或引用已变化，未覆盖画布，请在视频记录中查看。',
            'info'
          );
        else if (next.error) options.setError(next.error, 'warning');
        if (videoRetry && applied && next.targetNodeId) {
          if (targetId) inFlight.delete(targetId);
          await options.onGenerated?.(next.targetNodeId, 'video');
        }
        options.render();
        return;
      }
      if (next.status === 'succeeded') {
        const target = next.targetNodeId
          ? options.getDocument()?.nodes.find((node: any) => node.id === next.targetNodeId)
          : undefined;
        applyAttempt(next, true, Boolean(target?.assetPath));
        if (await options.flush()) {
          const result = options
            .getDocument()
            .nodes.find((node: any) => node.generation?.attemptId === next.id);
          if (result) await options.onGenerated?.(result.id, next.kind);
        }
      } else options.render();
    } catch (error) {
      options.setError(error instanceof Error ? error.message : String(error));
      if (throwOnError) throw error;
    } finally {
      if (targetId) {
        inFlight.delete(targetId);
        options.render();
      }
    }
  }

  function renderAttemptStatus(container: any, node: any): void {
    const relevant = [...attempts.values()]
      .filter(
        (attempt) =>
          attempt.targetNodeId === node.id ||
          attempt.sourceImageId === node.id ||
          attempt.sourceImageIds?.includes(node.id)
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (inFlight.has(node.id)) {
      const status = document.createElement('small');
      status.className = 'generation-status generation-status-running';
      status.textContent = '正在提交…';
      container.append(status);
      return;
    }
    if (!relevant || relevant.status === 'succeeded') return;
    const status = document.createElement('small');
    status.className = 'generation-status generation-status-' + relevant.status;
    status.textContent =
      relevant.status === 'pending' || relevant.status === 'running'
        ? '生成中…'
        : relevant.status === 'unknown'
          ? '结果未知，需查询原任务'
          : relevant.status === 'failed'
            ? relevant.kind === 'image' && relevant.failureStage === 'download'
              ? '本地导入未完成'
              : '生成失败'
            : relevant.status === 'canceled'
              ? '已停止本地等待'
              : '已完成';
    container.append(status);
    if (relevant.error) {
      const detail = document.createElement('small');
      detail.className = 'generation-error';
      detail.textContent = relevant.error;
      container.append(detail);
    }
    if (relevant.kind === 'video' && relevant.taskId)
      container.append(
        button(
          videoTaskTiming(relevant).queryExpired ? '已超过查询期限' : '查询并取回',
          () => action(relevant, 'query'),
          { disabled: videoTaskTiming(relevant).queryExpired }
        )
      );
    if (
      relevant.status === 'failed' &&
      (relevant.kind !== 'video' || !relevant.taskId || relevant.remoteStatus === 'failed')
    )
      container.append(
        button(
          relevant.kind === 'image' && relevant.failureStage === 'download'
            ? '重试本地导入'
            : '重新生成（消耗积分）',
          () => action(relevant, 'retry')
        )
      );
  }

  function render(
    card: any,
    node: any,
    _nodes: any[],
    operationOverride?: 'outpaint',
    workflow?: CanvasWorkflowEdit
  ): void {
    if (node.type !== 'image' && node.type !== 'video' && node.type !== 'video-source') return;
    const stale = isCanvasNodeStale(node, canvasReferences(options.getDocument(), node.id));
    const panel = document.createElement('div');
    panel.className = 'generation-panel';
    const busy = inFlight.has(node.id) || importingReferences.has(referenceKey(node));
    const frames =
      node.videoInputMode === 'first_last_frame'
        ? framePairSources(options.getDocument(), node.id)
        : undefined;
    const missingFrame = Boolean(frames && (!frames.first?.assetPath || !frames.last?.assetPath));
    const operation =
      operationOverride ||
      node.generationDraft?.operation ||
      (node.assetPath ? 'variant' : 'generate');
    const input = promptField(
      node,
      node.type === 'image'
        ? operation === 'outpaint'
          ? '描述要扩展的游戏场景、背景或道具空间…'
          : operation === 'variant'
            ? '描述角色动作、武器、技能或外观变化…'
            : '描述要生成的游戏角色、道具或怪物…'
        : '描述游戏角色动作、镜头和特效…'
    );
    if (node.mergeIcons) {
      input.value = mergeIconPrompt(node.mergeIcons);
      input.readOnly = true;
      panel.append(
        button(
          '编辑升级阶段',
          () => {
            const current = options.getDocument();
            editMergeIcons(node.mergeIcons, async (settings) => {
              if (
                options.getDocument() !== current ||
                !current.nodes.includes(node) ||
                inFlight.has(node.id) ||
                options.referencesBlocked?.()
              )
                throw new Error('画布或任务状态已变化，请关闭后重新编辑。');
              if (JSON.stringify(settings) === JSON.stringify(node.mergeIcons)) {
                if (!(await options.flush())) throw new Error('阶段设置尚未保存，请重试保存。');
                return;
              }
              options.remember();
              configureMergeIcons(node, settings);
              drafts.delete(node.id);
              inputBaselines.delete(referenceKey(node));
              invalidateCanvasDependents(current, node.id);
              options.markDirty();
              options.render();
              if (!(await options.flush()))
                throw new Error('阶段设置尚未保存，旧素材仍保留，请重试保存。');
            });
          },
          {
            disabled:
              busy ||
              Boolean(options.referencesBlocked?.()) ||
              ['pending', 'running', 'unknown', 'canceled'].includes(
                latestNodeAttempt(node.id)?.status
              ),
          }
        )
      );
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent =
        node.mergeIcons.series.length +
        '个系列 × ' +
        node.mergeIcons.stageCount +
        '阶段 · 查看提示词';
      details.append(summary, input);
      panel.append(details);
    } else panel.append(createPromptEditor(input));
    renderReferences(panel, node, busy, workflow);
    let imageModel: any;
    let imageResolution: any;
    let imageRatio: any;
    let videoModel: any;
    let videoResolution: any;
    let videoDuration: any;
    let videoRatio: any;
    let videoMode: any;
    if (node.type === 'image') {
      const fields = document.createElement('div');
      fields.className = 'generation-fields';
      const settingsKey = referenceKey(node);
      const saved =
        imageSettings.get(settingsKey) ||
        node.generationDraft?.parameters ||
        node.generation?.parameters;
      imageModel = selectControl('模型', ['auto', 'gpt', 'nanobanana'], saved?.model || 'auto');
      imageResolution = selectControl('分辨率', ['1K', '2K'], saved?.resolution || '1K');
      imageRatio = selectControl(
        '比例',
        ['source', ...IMAGE_OUTPUT_RATIOS],
        saved?.aspectRatio || '1:1'
      );
      fields.addEventListener('change', () => {
        rememberInput(node);
        imageSettings.set(settingsKey, {
          model: imageModel.value,
          resolution: imageResolution.value,
          aspectRatio: imageRatio.value,
        });
      });
      fields.append(imageModel, imageResolution, imageRatio);
      panel.append(fields);
    } else {
      const fields = document.createElement('div');
      fields.className = 'generation-fields';
      const saved =
        videoSettings.get(referenceKey(node)) ||
        node.generationDraft?.parameters ||
        node.generation?.parameters;
      videoMode = selectControl(
        '输入方式',
        node.videoInputMode === 'first_last_frame'
          ? ['first_last_frame']
          : ['select_mode', 'first_frame', 'first_last_frame', 'multi_modal_reference'],
        currentVideoMode(node)
      );
      const modeLabels: Record<string, string> = {
        select_mode: '请选择输入方式',
        first_frame: '首帧',
        first_last_frame: '首尾帧',
        multi_modal_reference: '多图参考',
      };
      if (node.videoInputMode === 'first_last_frame')
        videoMode.querySelector('select').disabled = true;
      for (const option of Array.from(videoMode.querySelector('select').options) as any[])
        option.textContent = modeLabels[option.value];
      videoModel = selectControl('模型', ['2.0', '2.5'], saved?.model || '2.0');
      videoResolution = selectControl('分辨率', ['720p', '480p'], saved?.resolution || '720p');
      videoDuration = selectControl(
        '时长（秒）',
        ['4', '5', '6', '7', '8'],
        String(saved?.duration || 4)
      );
      const durationSelect = videoDuration.querySelector('select');
      durationSelect.style.color = Number(durationSelect.value) > 5 ? '#ef6464' : '';
      Array.from(durationSelect.options).forEach((option: any) => {
        if (Number(option.value) > 5) option.style.color = '#ef6464';
      });
      durationSelect.addEventListener('change', () => {
        durationSelect.style.color = Number(durationSelect.value) > 5 ? '#ef6464' : '';
      });
      videoRatio = selectControl(
        '比例',
        ['adaptive', '16:9', '9:16', '1:1'],
        saved?.ratio || 'adaptive'
      );
      fields.addEventListener('change', () => {
        rememberInput(node);
        videoSettings.set(referenceKey(node), {
          model: videoModel.value,
          resolution: videoResolution.value,
          duration: Number(videoDuration.value),
          ratio: videoRatio.value,
          mode: videoMode.value,
        });
        panel.querySelector('.generation-references')?.remove();
        renderReferences(panel, node, busy, workflow);
        panel.insertBefore(panel.querySelector('.generation-references'), fields);
      });
      fields.append(videoMode, videoModel, videoResolution, videoDuration, videoRatio);
      panel.append(fields);
    }
    const capabilityHint = document.createElement('small');
    capabilityHint.className = 'generation-status';
    capabilityHint.textContent =
      node.type === 'image'
        ? '分辨率与比例是生成目标，模型可能返回不同尺寸，请以实际图片为准。'
        : node.videoInputMode === 'first_last_frame'
          ? '首帧、尾帧均为必填，只使用这两张图片；更换文件请使用对应图片卡的导入入口。'
          : '已连接图片与导入参考图按显示顺序提交；首帧需1张，首尾帧需2张，多图参考按模型限制。';
    panel.append(capabilityHint);
    async function submitGeneration(): Promise<void> {
      if (workflow && !workflow.canSubmit) return;
      const execute = async () => {
        if (node.type !== 'image') {
          const completed = await runVideo(node, input, {
            model: videoModel?.value,
            resolution: videoResolution?.value,
            duration: Number(videoDuration?.value || 4),
            ratio: videoRatio?.value,
            mode: videoMode?.value,
            templateRun: Boolean(workflow),
          });
          const attempt = latestNodeAttempt(node.id);
          if (
            !completed &&
            workflow &&
            attempt?.taskId &&
            ['pending', 'running'].includes(attempt.status)
          )
            return runTemplateVideo(node.id, Number(videoDuration?.value || 4));
          return completed;
        }
        const previous = node.generation?.attemptId;
        await runImage(node, input, operation, {
          model: imageModel?.value === 'auto' ? undefined : imageModel?.value,
          resolution: imageResolution?.value,
          aspectRatio: imageRatio?.value,
          templateRun: Boolean(workflow),
        });
        return Boolean(
          node.generation?.attemptId &&
            previous !== node.generation.attemptId &&
            (await options.flush())
        );
      };
      startGeneration();
      if (workflow) await workflow.submit(execute);
      else await execute();
    }
    if (workflow) {
      const hint = document.createElement('small');
      hint.textContent = workflow.canSubmit
        ? '更新当前卡片，不新增卡片；成功后继续后续待处理步骤。'
        : '等待上游完成；当前可调整参数，暂不能生成。';
      panel.append(hint);
    }
    if (node.assetPath && stale && !workflow) {
      const staleMessage = document.createElement('small');
      staleMessage.className = 'generation-status generation-status-stale';
      staleMessage.textContent = '来源已变化，当前结果仍保留';
      panel.append(staleMessage);
      panel.append(
        button(
          '刷新结果',
          () =>
            node.type === 'image'
              ? runImage(node, input, node.generation?.operation || 'variant', {
                  model: imageModel?.value === 'auto' ? undefined : imageModel?.value,
                  resolution: imageResolution?.value,
                  aspectRatio: imageRatio?.value,
                  refreshSource: true,
                })
              : runVideo(node, input, {
                  model: videoModel?.value,
                  resolution: videoResolution?.value,
                  duration: Number(videoDuration?.value || 4),
                  ratio: videoRatio?.value,
                }),
          {
            className: 'generation-action generation-action-primary',
            disabled: busy || missingFrame,
          }
        )
      );
    } else if (node.type === 'image') {
      const actions = document.createElement('div');
      actions.className = 'generation-actions';
      actions.append(
        button(workflow ? '应用并继续' : '生成', submitGeneration, {
          className: 'generation-action generation-action-primary',
          title: '在当前图片槽中生成结果',
          disabled: busy || Boolean(workflow && !workflow.canSubmit),
        })
      );
      panel.append(actions);
    } else {
      const actions = document.createElement('div');
      actions.className = 'generation-actions';
      if (node.type === 'video' && !node.draftSourceId && !workflow) {
        actions.append(
          button('导入视频', () => options.requestVideoImport(node.id), {
            className: 'generation-action',
            title: '从本地项目导入视频到当前视频卡片',
            disabled: busy,
          })
        );
      }
      actions.append(
        button(workflow ? '应用并继续' : '生成视频', submitGeneration, {
          className: 'generation-action generation-action-primary',
          title: '从已连接图片创建视频结果',
          disabled: busy || missingFrame || Boolean(workflow && !workflow.canSubmit),
        })
      );
      panel.append(actions);
    }
    renderAttemptStatus(panel, node);
    card.append(panel);
  }

  async function restore(): Promise<void> {
    const documentState = options.getDocument();
    if (!documentState) return;
    const list = await options.store.listGeneration(documentState.id);
    if (options.getDocument()?.id !== documentState.id) return;
    list.forEach((attempt) => attempts.set(attempt.id, attempt));
    let restored = false;
    for (const node of documentState.nodes) {
      const recorded = list.find(
        (attempt) => attempt.id === node.generation?.attemptId && attempt.targetNodeId === node.id
      );
      if (!recorded) continue;
      if (!node.generation.parameters && recorded.parameters) {
        node.generation.parameters = generationParameters(recorded);
        restored = true;
      }
      if (!node.generation.referenceImagePaths && recorded.referenceImagePaths) {
        node.generation.referenceImagePaths = [...recorded.referenceImagePaths];
        restored = true;
      }
    }
    const targets = new Set<string>();
    const newest = list
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    for (const attempt of newest) {
      if (attempt.targetNodeId) {
        if (targets.has(attempt.targetNodeId)) continue;
        targets.add(attempt.targetNodeId);
      }
      if (['failed', 'unknown', 'pending', 'running', 'canceled'].includes(attempt.status)) {
        const title =
          documentState.nodes.find((node: any) => node.id === attempt.targetNodeId)?.title ||
          '生成任务';
        options.log?.(
          title +
            '：' +
            (attempt.error ||
              (attempt.status === 'unknown'
                ? '结果待确认，请核查原任务'
                : attempt.status === 'failed'
                  ? '处理失败'
                  : '原任务尚未完成')),
          attempt.status === 'failed'
            ? 'error'
            : attempt.status === 'unknown' || attempt.status === 'canceled'
              ? 'warning'
              : 'info'
        );
      }
      const flow = documentState.templateFlow;
      if (flow && [flow.imageId, flow.videoId].includes(attempt.targetNodeId)) continue;
      if (
        attempt.kind === 'video' &&
        (attempt.localWaitCanceledAt || stoppedAttempts.has(attempt.id))
      )
        continue;
      restored =
        (attempt.kind === 'video'
          ? await recoverVideo(attempt, list, false)
          : recoverImage(attempt, list, false)) || restored;
    }
    if (restored) await options.flush();
    options.render();
  }

  function explicitPreExecutionRejection(attempt: any): boolean {
    if (!attempt || attempt.taskId) return false;
    return attempt.status === 'failed' && attempt.executionState === 'not_executed';
  }
  function unsentLocalVideoFailure(attempt: any): boolean {
    return Boolean(
      attempt &&
        attempt.kind === 'video' &&
        attempt.executionState === 'not_executed' &&
        !attempt.taskId &&
        attempt.status === 'failed'
    );
  }
  function latestNodeAttempt(nodeId: string) {
    const canvasId = options.getDocument()?.id;
    return [...attempts.values()]
      .filter((attempt) => attempt.canvasId === canvasId && attempt.targetNodeId === nodeId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  function recoverImage(attempt: any, list: any[], persist = true): boolean {
    const current = options.getDocument();
    if (
      current?.id !== attempt.canvasId ||
      attempt.kind !== 'image' ||
      attempt.status !== 'succeeded' ||
      !attempt.resultAssetPath
    )
      return false;
    const target = current.nodes.find((node: any) => node.id === attempt.targetNodeId);
    if (!target?.assetPath) return applyAttempt(attempt, persist);
    if (target.generation?.attemptId === attempt.id) return false;
    if (target.type !== 'image' || latestNodeAttempt(target.id)?.id !== attempt.id) return false;
    // Legacy image attempts lack target snapshots; only a still-pending, unchanged
    // prior generated result can be replaced by their completed successor.
    const prior = list.find((item: any) => item.id === target.generation?.attemptId);
    const targetPath =
      attempt.targetAssetPath ??
      (target.templatePending &&
      prior?.targetNodeId === target.id &&
      prior.createdAt < attempt.createdAt
        ? prior.resultAssetPath
        : undefined);
    if (targetPath !== target.assetPath) return false;
    if ((target.generationDraft?.prompt || target.generation?.prompt) !== attempt.prompt)
      return false;
    if (
      Object.entries(
        generationParameters({
          parameters: { ...target.generation?.parameters, ...target.generationDraft?.parameters },
        })
      ).some(([key, value]) => {
        const recorded = generationParameters(attempt)[key];
        return key === 'model' ? (recorded || 'auto') !== (value || 'auto') : recorded !== value;
      })
    )
      return false;
    const sources = referenceSources(target);
    const ids = attempt.sourceImageIds || (attempt.sourceImageId ? [attempt.sourceImageId] : []);
    const paths =
      attempt.sourceImagePaths || (attempt.sourceImagePath ? [attempt.sourceImagePath] : []);
    if (
      sources.length !== ids.length ||
      sources.some((source, index) => source.id !== ids[index] || source.assetPath !== paths[index])
    )
      return false;
    const snapshots =
      attempt.sourceSnapshots || (attempt.sourceSnapshot ? [attempt.sourceSnapshot] : []);
    if (
      snapshots.some(
        (snapshot: any) =>
          !isCanvasSourceCurrent(
            snapshot,
            sources.find((source) => source.id === snapshot.nodeId)
          )
      )
    )
      return false;
    if (
      JSON.stringify(referencePaths(target)) !== JSON.stringify(attempt.referenceImagePaths || [])
    )
      return false;
    return applyAttempt(attempt, persist, true);
  }

  async function recoverVideo(attempt: any, knownList?: any[], persist = true): Promise<boolean> {
    attempts.set(attempt.id, attempt);
    const current = options.getDocument();
    if (current?.id !== attempt.canvasId || attempt.kind !== 'video') return false;
    if (attempt.status !== 'succeeded' || !attempt.resultAssetPath) {
      options.render();
      return false;
    }
    const list = knownList || (await options.store.listGeneration(current.id));
    if (options.getDocument() !== current) return false;
    const latest = list
      .filter((item: any) => item.targetNodeId === attempt.targetNodeId)
      .sort((left: any, right: any) => right.createdAt.localeCompare(left.createdAt))[0];
    const target = current.nodes.find((node: any) => node.id === attempt.targetNodeId);
    if (!target || latest?.id !== attempt.id || !['video', 'video-source'].includes(target.type))
      return false;
    if (target.generation?.attemptId === attempt.id) return true;
    if ((target.assetPath || '') !== (attempt.targetAssetPath ?? '')) return false;
    const sources = referenceSources(target);
    if (!videoAttemptMatchesSources(attempt, sources)) return false;
    if (
      JSON.stringify(referencePaths(target)) !== JSON.stringify(attempt.referenceImagePaths || [])
    )
      return false;
    if (attempt.parameters?.mode && currentVideoMode(target) !== attempt.parameters.mode)
      return false;
    const snapshots = attempt.sourceSnapshots?.length
      ? attempt.sourceSnapshots
      : [attempt.sourceSnapshot];
    if (
      snapshots.length !== sources.length ||
      snapshots.some(
        (snapshot: any) =>
          !snapshot ||
          !isCanvasSourceCurrent(
            snapshot,
            sources.find((source: any) => source.id === snapshot.nodeId)
          )
      )
    )
      return false;
    if (!applyAttempt(attempt, persist, Boolean(target.assetPath))) return false;
    return persist ? options.flush() : true;
  }

  function queueBlockReason(nodeId: string) {
    const state = nodeState(nodeId);
    if (!state || !['failed', 'unknown', 'timedout', 'canceled'].includes(state.status)) return;
    const latest = latestNodeAttempt(nodeId);
    if (unsentLocalVideoFailure(latest) || explicitPreExecutionRejection(latest)) return;
    return '卡片结果未确认或已失败，请先在卡片或视频历史中处理，再继续队列。';
  }
  function nodeState(nodeId: string) {
    if (unconfirmedImages.has(options.getDocument()?.id + ':' + nodeId))
      return { status: 'unknown', canQuery: true };
    const attempt = latestNodeAttempt(nodeId);
    if (!attempt) return;
    const stopped =
      attempt.kind === 'video' &&
      Boolean(attempt.localWaitCanceledAt || stoppedAttempts.has(attempt.id));
    if (
      attempt.status === 'succeeded' &&
      (attempt.kind !== 'image' ||
        options.getDocument()?.nodes.find((item: any) => item.id === nodeId)?.generation
          ?.attemptId === attempt.id) &&
      (!stopped ||
        options.getDocument()?.nodes.find((item: any) => item.id === nodeId)?.generation
          ?.attemptId === attempt.id)
    )
      return;
    if (attempt.status === 'failed') {
      const current = options.getDocument();
      const target = current?.nodes.find((item: any) => item.id === nodeId);
      if (
        attempt.kind === 'video' &&
        target &&
        !videoAttemptMatchesSources(attempt, videoInputSources(current, target))
      )
        return;
      const source = current?.nodes.find((node: any) => node.id === attempt.sourceImageId);
      if (source && attempt.sourceImagePath && source.assetPath !== attempt.sourceImagePath) return;
      if (
        source &&
        attempt.sourceSnapshot &&
        !isCanvasSourceCurrent(attempt.sourceSnapshot, source)
      )
        return;
    }
    return {
      status: stopped ? 'canceled' : attempt.status,
      canQuery:
        (attempt.kind === 'image' &&
          ['running', 'pending', 'unknown', 'succeeded'].includes(attempt.status)) ||
        (attempt.kind === 'video' &&
          Boolean(attempt.taskId) &&
          !videoTaskTiming(attempt).queryExpired &&
          (stopped ||
            ['running', 'pending', 'unknown', 'canceled', 'failed'].includes(attempt.status))),
    };
  }

  return {
    render,
    restore,
    imageSizing(nodeId: string) {
      const current = options.getDocument();
      const node = current?.nodes.find((item: CanvasNode) => item.id === nodeId);
      const attempt = attempts.get(node?.generation?.attemptId);
      if (!attempt || attempt.kind !== 'image' || attempt.canvasId !== current?.id) return;
      return {
        requestedSize: attempt.parameters?.targetSize,
        referenceImages: attempt.referenceImages,
        originalImage: attempt.originalImage,
        actual: attempt.resultImageInfo,
        warnings: attempt.warnings || [],
      };
    },
    imageTarget(node: any) {
      const attempt = attempts.get(node.generation?.attemptId);
      if (attempt?.canvasId !== options.getDocument()?.id) return;
      return attempt.parameters?.targetSize;
    },
    recoverVideo,
    creditsLabel(node: any) {
      if (!node.assetPath || !node.generation?.attemptId) return;
      const attempt = attempts.get(node.generation.attemptId);
      const credits = attempt?.canvasId === options.getDocument()?.id ? attempt.credits : undefined;
      return typeof credits === 'number' && Number.isFinite(credits) && credits >= 0
        ? '积分：' + credits.toLocaleString('zh-CN')
        : '积分：未返回';
    },
    runTemplateVideo,
    runTemplateImage,
    hasInputDraft() {
      const current = options.getDocument();
      return Boolean(
        current &&
          [...inputBaselines.values()].some(
            (entry) =>
              entry.canvasId === current.id &&
              current.nodes.some(
                (node: any) => node.id === (entry.node.draftSourceId || entry.node.id)
              ) &&
              entry.value !== inputState(entry.node)
          )
      );
    },
    resetDraft(nodeId: string) {
      const node = options.getDocument()?.nodes.find((node: any) => node.id === nodeId);
      drafts.delete(nodeId);
      if (node) {
        inputBaselines.delete(referenceKey(node));
        imageSettings.delete(referenceKey(node));
        videoSettings.delete(referenceKey(node));
        references.delete(referenceKey(node));
        removedImageSources.delete(referenceKey(node));
      }
    },
    queueBlockReason,
    retryableImage(nodeId: string) {
      return retryableImages.has(nodeId);
    },
    nodeState,
    canStopWaiting(nodeId: string) {
      return videoWaits.has(videoKey(options.getDocument()?.id, nodeId));
    },
    stopWaiting(nodeId: string) {
      const key = videoKey(options.getDocument()?.id, nodeId);
      stoppedVideos.add(key);
      videoWaits.get(key)?.();
    },
    async queryNode(nodeId: string, throwOnError = false) {
      const documentState = options.getDocument();
      if (documentState?.nodes.some((node: any) => node.id === nodeId && node.type === 'image')) {
        try {
          const list = await options.store.listGeneration(documentState.id);
          if (options.getDocument() !== documentState)
            throw new Error('画布已切换，请重新 inspect。');
          for (const item of list) recordAttempt(item);
          if (unconfirmedImages.has(documentState.id + ':' + nodeId))
            throw new Error('原图片请求尚未核实，请稍后查询；不会重新生成。');
          const image = latestNodeAttempt(nodeId);
          if (!image) throw new Error('此卡片没有原图片生成记录。');
          if (recoverImage(image, list)) {
            if (!(await options.flush())) throw new Error('图片已取回，但画布保存失败，请先保存。');
          } else if (image.status !== 'succeeded') {
            throw new Error(image.error || '原图片任务尚未完成，请稍后查询；不会重新生成。');
          } else if (
            documentState.nodes.find((node: any) => node.id === nodeId)?.generation?.attemptId !==
            image.id
          ) {
            throw new Error('原图片已保存，但卡片或输入已变化，未覆盖当前内容。');
          }
          options.render();
        } catch (error) {
          options.setError(error instanceof Error ? error.message : String(error));
          if (throwOnError) throw error;
        }
        return;
      }
      if (throwOnError) {
        const current = options.getDocument();
        if (!current) throw new Error('当前没有打开的画布。');
        const list = await options.store.listGeneration(current.id);
        if (options.getDocument() !== current) throw new Error('画布已切换，请重新 inspect。');
        for (const item of list) attempts.set(item.id, item);
        if (!nodeState(nodeId)?.canQuery)
          throw new Error('此卡片没有可查询的原视频任务；任务尚未返回 ID 时请稍后再查。');
      }
      const attempt = latestNodeAttempt(nodeId);
      if (attempt?.kind === 'video' && attempt.taskId) await action(attempt, 'query', throwOnError);
    },
    hasUnsettledResult(nodeId: string) {
      return (
        unconfirmedImages.has(options.getDocument()?.id + ':' + nodeId) ||
        [...attempts.values()].some(
          (attempt) =>
            attempt.canvasId === options.getDocument()?.id &&
            attempt.targetNodeId === nodeId &&
            !explicitPreExecutionRejection(attempt) &&
            attempt.kind !== 'video' &&
            ['pending', 'running', 'unknown', 'canceled'].includes(attempt.status)
        )
      );
    },
    isNodeBusy(nodeId: string) {
      return (
        inFlight.has(nodeId) ||
        videoWaits.has(videoKey(options.getDocument()?.id, nodeId)) ||
        importingReferences.has(referenceKey({ id: nodeId }))
      );
    },
    get isBusy() {
      return inFlight.size > 0 || videoWaits.size > 0;
    },
  };
}
