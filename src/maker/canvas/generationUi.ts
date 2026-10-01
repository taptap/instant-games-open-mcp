declare const document: any;
import {
  canvasReferences,
  isCanvasNodeStale,
  isCanvasSourceCurrent,
  snapshotCanvasSource,
} from './dependencies.js';
import { createPromptEditor, formatBuiltinPrompt } from './promptEditor.js';
import type { TemplateOutputDecision } from './templateWorkflow.js';
import type { CanvasDocument, CanvasNode } from './model.js';

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
  store: {
    importImage(
      canvasId: string,
      bytes: ArrayBuffer,
      contentType: string
    ): Promise<{ relativePath: string }>;
    mediaUrl(path: string): string;
    listGeneration(canvasId: string): Promise<any[]>;
    generateImage(canvasId: string, input: Record<string, unknown>): Promise<any>;
    createVideo(canvasId: string, input: Record<string, unknown>): Promise<any>;
    generationAction(
      canvasId: string,
      attemptId: string,
      action: 'query' | 'retry' | 'cancel'
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
  runTemplateVideo(nodeId: string, duration: number): Promise<boolean>;
  runTemplateImage(nodeId: string): Promise<boolean>;
  isNodeBusy(nodeId: string): boolean;
  hasUnsettledResult(nodeId: string): boolean;
  nodeState(nodeId: string): { status: string; canQuery: boolean } | undefined;
  queryNode(nodeId: string): Promise<void>;
  readonly isBusy: boolean;
} {
  const GAME_ASSET_CONSTRAINTS =
    '游戏素材约束：单个主体、完整不裁切、四周保留动作空间；背景均匀纯色；不出现地面、地砖、站台、展示台、底座、台阶、接触阴影、投影、反射、文字、Logo、水印或其他角色。';
  const DEFAULT_VIDEO_PROMPT =
    '动作描述：只根据参考图中的游戏角色或游戏素材生成动作，保持外观、比例和构图稳定；\n\n镜头构图：主体完整、动作清晰、固定镜头，不新增环境物体或大面积特效。';
  const TEMPLATE_VIDEO_PROMPT =
    '角色动作：参考图中的游戏角色进行一次夸张、干脆的战斗动作；动作有短暂蓄力、快速爆发和明确收招。';

  function withGameAssetConstraints(prompt: string): string {
    return prompt.includes('游戏素材约束：') ? prompt : prompt + '\n\n' + GAME_ASSET_CONSTRAINTS;
  }

  function templateVideoPrompt(prompt: unknown): string {
    const action = formatBuiltinPrompt(String(prompt || '').trim()) || TEMPLATE_VIDEO_PROMPT;
    if (action.includes('视频约束：')) return action;
    return (
      action +
      '\n\n视频约束：只控制参考图中的动作，不重复设计角色外观；固定镜头，主体居中，位置和比例稳定，完整留在画面内；不新增地面、地砖、站台、展示台、底座、环境、文字或视觉特效。'
    );
  }

  const attempts = new Map<string, any>();
  const inFlight = new Set<string>();
  const drafts = new Map<string, string>();
  const references = new Map<string, string[]>();
  const importingReferences = new Set<string>();
  const imageSettings = new Map<
    string,
    { model: string; resolution: string; aspectRatio: string }
  >();
  const videoSettings = new Map<
    string,
    { model: string; resolution: string; duration: number; ratio: string }
  >();

  function referenceKey(node: any): string {
    return options.getDocument().id + '/' + node.id;
  }
  function referencePaths(node: any): string[] {
    return references.get(referenceKey(node)) || node.generation?.referenceImagePaths || [];
  }

  async function importReference(node: any, file: any, canvasId: string): Promise<void> {
    const current = options.getDocument();
    if (
      !current ||
      !file ||
      current.id !== canvasId ||
      !current.nodes.some((item: any) => item.id === node.id)
    )
      return;
    const key = referenceKey(node);
    if (importingReferences.has(key) || inFlight.has(node.id)) return;
    if (file.size > 20 * 1024 * 1024) {
      options.setError('参考图片不能超过 20 MiB。');
      return;
    }
    if (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      options.setError('参考图只接受 PNG、JPEG 或 WebP。');
      return;
    }
    const implicitReference = Boolean(node.assetPath || node.generationDraft?.sourceImageId);
    if (referencePaths(node).length + Number(implicitReference) >= 14) {
      options.setError('最多支持 14 张参考图（包含当前图片）。');
      return;
    }
    importingReferences.add(key);
    options.render();
    try {
      const saved = await options.store.importImage(
        current.id,
        await file.arrayBuffer(),
        file.type || 'application/octet-stream'
      );
      if (
        options.getDocument()?.id !== current.id ||
        !options.getDocument().nodes.some((item: any) => item.id === node.id)
      ) {
        options.setError('已离开原卡片，参考图未添加到其他卡片。');
        return;
      }
      references.set(key, [...referencePaths(node), saved.relativePath]);
      options.setError('');
    } catch (error) {
      options.setError(error instanceof Error ? error.message : '参考图片导入失败，请重试。');
    } finally {
      importingReferences.delete(key);
      options.render();
    }
  }

  function renderReferences(panel: any, node: any, nodes: any[], busy: boolean): void {
    const key = referenceKey(node);
    const sourceId =
      node.draftSourceId ||
      node.generationDraft?.sourceImageId ||
      node.generation?.sourceImageId ||
      options.getDocument().edges.find((edge: any) => edge.to === node.id)?.from;
    const source =
      node.type === 'image' && node.assetPath
        ? node
        : nodes.find((item: any) => item.id === sourceId);
    const paths = referencePaths(node);
    const strip = document.createElement('div');
    strip.className = 'generation-references';
    function thumbnail(path: string, index?: number): void {
      const tile = document.createElement('div');
      tile.className = 'generation-reference';
      const preview = document.createElement('img');
      preview.src = options.store.mediaUrl(path);
      preview.alt = index === undefined ? '当前图片参考' : '导入的参考图 ' + (index + 1);
      const label = document.createElement('small');
      label.textContent = index === undefined ? '当前图片' : '参考图 ' + (index + 1);
      tile.append(preview, label);
      if (index !== undefined) {
        const remove = button(
          '×',
          () => {
            references.set(
              key,
              referencePaths(node).filter((_, position) => position !== index)
            );
            options.render();
          },
          {
            className: 'generation-reference-remove',
            title: '移除参考图 ' + (index + 1),
            disabled: busy,
          }
        );
        remove.setAttribute('aria-label', '移除参考图 ' + (index + 1));
        tile.append(remove);
      }
      strip.append(tile);
    }
    if (source?.assetPath) thumbnail(source.assetPath);
    paths.forEach((path, index) => thumbnail(path, index));
    if (importingReferences.has(key)) {
      const status = document.createElement('small');
      status.textContent = '参考图导入中…';
      strip.append(status);
    }
    panel.append(strip);
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
    input.placeholder = placeholder;
    input.className = 'generation-prompt';
    input.addEventListener('pointerdown', (event: any) => event.stopPropagation());
    input.addEventListener('input', () => {
      drafts.set(node.id, input.value);
      if (node.generationDraft) {
        node.generationDraft.prompt = input.value;
        options.markDirty();
      }
    });
    return input;
  }

  function imageTargetSize(resolution: string, ratio: string): string {
    const side = resolution === '2K' ? 2048 : 1024;
    const shapes: Record<string, [number, number]> = {
      '1:1': [1, 1],
      '16:9': [16, 9],
      '9:16': [9, 16],
      '4:3': [4, 3],
      '3:4': [3, 4],
      '3:2': [3, 2],
      '2:3': [2, 3],
    };
    const shape = shapes[ratio] || shapes['1:1'];
    const width = shape[0] >= shape[1] ? side : Math.round((side * shape[0]) / shape[1]);
    const height = shape[1] >= shape[0] ? side : Math.round((side * shape[1]) / shape[0]);
    return width + 'x' + height;
  }

  function selectControl(label: string, values: string[], current: string): any {
    const wrapper = document.createElement('label');
    wrapper.className = 'generation-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    const select = document.createElement('select');
    select.className = 'generation-mode';
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
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
    const prompt = operation === 'outpaint' ? value : withGameAssetConstraints(value);
    input.value = prompt;
    drafts.set(node.id, prompt);
    return prompt;
  }

  function generationParameters(attempt: any, node?: any) {
    const { model, resolution, aspectRatio, ratio, duration } =
      attempt.parameters || node?.generation?.parameters || {};
    return Object.fromEntries(
      Object.entries({ model, resolution, aspectRatio, ratio, duration }).filter(
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
      resultNode.title =
        attempt.operation === 'variant'
          ? '图片变体 · 已保存结果'
          : attempt.operation === 'outpaint'
            ? '扩展画面 · 已保存结果'
            : '生图结果';
      resultNode.assetPath = attempt.resultAssetPath;
      delete resultNode.templatePending;
      delete resultNode.generationDraft;
      resultNode.generation = {
        prompt: attempt.prompt,
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
      if (!targetNode) documentState.nodes.push(resultNode);
      else
        documentState.edges = documentState.edges.filter(
          (edge: any) => edge.to !== resultNodeId || edge.kind !== 'image-variant'
        );
      for (const sourceId of sourceImageIds) {
        documentState.edges.push({
          id: options.createId(),
          from: sourceId,
          to: resultNodeId,
          kind: 'image-variant',
        });
      }
    } else if (attempt.sourceImageId) {
      const source = documentState.nodes.find((node: any) => node.id === attempt.sourceImageId);
      if (!source) return false;
      const point = { x: source.x + source.width + 48, y: source.y };
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
        delete resultNode.templatePending;
        delete resultNode.videoInfo;
        resultNode.generation = {
          prompt: attempt.prompt,
          parameters: generationParameters(attempt, resultNode),
          taskId: attempt.taskId,
          attemptId: attempt.id,
          sourceImageId: attempt.sourceImageId,
        };
        resultNode.sourceSnapshot = attempt.sourceSnapshot || snapshotCanvasSource(source);
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
          },
          sourceSnapshot: attempt.sourceSnapshot || snapshotCanvasSource(source),
        });
      }
      documentState.edges = documentState.edges.filter((edge: any) => edge.to !== videoId);
      documentState.edges.push({
        id: options.createId(),
        from: source.id,
        to: videoId,
        kind: 'image-to-video',
      });
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
    const selectedOperation = node.generationDraft?.operation || operation;
    const sourceImageId =
      node.assetPath && !settings.refreshSource
        ? node.id
        : node.generationDraft?.sourceImageId ||
          node.generation?.sourceImageId ||
          (selectedOperation !== 'generate' ? node.id : undefined);
    const source = sourceImageId
      ? documentState.nodes.find((item: any) => item.id === sourceImageId && item.type === 'image')
      : node;
    const prompt = promptFor(node, input, selectedOperation);
    if (selectedOperation !== 'generate' && !source?.assetPath) {
      options.setError('变体或扩展画面需要一张已保存的来源图片。');
      return;
    }
    const decision = settings.templateRun
      ? { kind: 'reuse' as const, nodeId: node.id }
      : options.resolveTarget?.(source?.id || node.id, 'image', node.id);
    if (decision?.kind === 'blocked') {
      options.setError(decision.message);
      return;
    }
    const targetId =
      decision?.kind === 'reuse' ? decision.nodeId : !node.assetPath ? node.id : undefined;
    const sourceNodes =
      settings.templateRun &&
      settings.refreshSource &&
      canvasReferences(documentState, node.id).length
        ? canvasReferences(documentState, node.id).filter(
            (source) => source.type === 'image' && source.assetPath
          )
        : selectedOperation !== 'generate'
          ? imageEditSources(documentState, source, targetId)
          : [];
    inFlight.add(node.id);
    if (targetId) inFlight.add(targetId);
    options.render();
    try {
      if (!(await options.flush())) {
        options.setError('画布尚未保存，保存成功后再生成。');
        return;
      }
      if (options.getDocument()?.id !== documentState.id) return;
      options.log?.(node.title + '：开始生成图片', 'info');
      const attempt = await options.store.generateImage(documentState.id, {
        prompt,
        operation: selectedOperation,
        targetNodeId: targetId,
        model: settings.model,
        resolution: settings.resolution,
        aspectRatio: settings.aspectRatio,
        targetSize: imageTargetSize(settings.resolution || '1K', settings.aspectRatio || '1:1'),
        referenceImagePaths: [...referencePaths(node)],
        ...(!sourceNodes.length
          ? {}
          : {
              sourceImageId: sourceNodes[0].id,
              sourceImagePath: sourceNodes[0].assetPath,
              sourceImageIds: sourceNodes.map((source) => source.id),
              sourceImagePaths: sourceNodes.map((source) => source.assetPath),
            }),
      });
      attempts.set(attempt.id, attempt);
      if (options.getDocument()?.id !== documentState.id) return;
      if (attempt.status === 'succeeded') {
        options.log?.(node.title + '：图片生成完成', 'info');
        applyAttempt(attempt, true, Boolean(node.assetPath));
        if (await options.flush()) {
          const result = documentState.nodes.find(
            (item: any) => item.generation?.attemptId === attempt.id
          );
          inFlight.delete(node.id);
          if (targetId) inFlight.delete(targetId);
          if (result) await options.onGenerated?.(result.id, 'image');
        }
      } else {
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
    } = {}
  ): Promise<boolean> {
    const documentState = options.getDocument();
    if (!documentState || inFlight.has(node.id)) return false;
    if (settings.model === '2.5' && settings.userConfirmed !== true) {
      if (!window.confirm('Seedance 2.5 成本更高，实际按上游 token 扣费。确认继续吗？'))
        return false;
      settings.userConfirmed = true;
    }
    const prompt = input.value.trim() || DEFAULT_VIDEO_PROMPT;
    input.value = prompt;
    drafts.set(node.id, prompt);
    const edge = documentState.edges.find(
      (item: any) => item.to === node.id && item.kind !== 'sequence-source'
    );
    const source = documentState.nodes.find(
      (item: any) => item.id === (node.draftSourceId || edge?.from)
    );
    if (!source?.assetPath) {
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
      node = target;
      drafts.set(node.id, prompt);
    } else if (node.draftSourceId || decision?.kind === 'create') {
      options.remember();
      node = {
        id: options.createId(),
        type: 'video',
        x: source.x + source.width + 48,
        y: source.y,
        width: 360,
        height: 240,
        title: '视频生成',
        ...(source.sectionId ? { sectionId: source.sectionId } : {}),
      };
      drafts.set(node.id, prompt);
      documentState.nodes.push(node);
      documentState.edges.push({
        id: options.createId(),
        from: source.id,
        to: node.id,
        kind: 'first-frame',
      });
      options.markDirty();
    }
    options.onVideoCreated?.(node.id);
    inFlight.add(requesterId);
    inFlight.add(node.id);
    options.render();
    try {
      if (!(await options.flush()) || options.getDocument()?.id !== documentState.id) return false;
      options.log?.(node.title + '：开始生成视频', 'info');
      const attempt = await options.store.createVideo(documentState.id, {
        prompt,
        sourceImagePath: source.assetPath,
        sourceImageId: source.id,
        targetNodeId: node.id,
        duration: settings.duration || 4,
        model: settings.model || '2.0',
        resolution: settings.resolution || '720p',
        ratio: settings.ratio || 'adaptive',
        userConfirmed: settings.userConfirmed === true,
      });
      attempts.set(attempt.id, attempt);
      if (options.getDocument()?.id !== documentState.id) return false;
      if (attempt.status === 'succeeded') {
        options.log?.(node.title + '：视频生成完成', 'info');
        applyAttempt(attempt, true, Boolean(node.assetPath));
        if (await options.flush()) {
          inFlight.delete(requesterId);
          inFlight.delete(node.id);
          await options.onGenerated?.(node.id, 'video');
          return true;
        }
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
    const current = options.getDocument();
    const node = current?.nodes.find((item: any) => item.id === nodeId);
    if (!node || node.type !== 'image') return false;
    const list = await options.store.listGeneration(current.id);
    if (options.getDocument() !== current) return false;
    for (const attempt of list) attempts.set(attempt.id, attempt);
    if (
      list.some(
        (attempt: any) =>
          attempt.targetNodeId === nodeId &&
          ['pending', 'running', 'unknown', 'canceled'].includes(attempt.status)
      )
    ) {
      options.setError('图片存在未确认任务，请先核查原任务，不会重复生成。');
      return false;
    }
    const previous = node.generation?.attemptId;
    const recorded = list.find(
      (attempt: any) => attempt.id === previous && attempt.targetNodeId === nodeId
    );
    references.set(referenceKey(node), [
      ...(node.generation?.referenceImagePaths || recorded?.referenceImagePaths || []),
    ]);
    const prompt = node.generation?.prompt || node.generationDraft?.prompt;
    if (!prompt?.trim()) {
      options.setError('此图片没有已保存的提示词，请先编辑提示词。');
      return false;
    }
    await runImage(node, { value: prompt }, node.generation?.operation || 'variant', {
      ...generationParameters(recorded || {}, node),
      ...node.generation?.parameters,
      refreshSource: true,
      templateRun: true,
    });
    return Boolean(
      node.generation?.attemptId &&
        node.generation.attemptId !== previous &&
        (await options.flush())
    );
  }

  async function runTemplateVideo(nodeId: string, duration: number): Promise<boolean> {
    const current = options.getDocument();
    const node = current?.nodes.find((item: any) => item.id === nodeId);
    const sources = current
      ? canvasReferences(current, nodeId).filter((source) => source.type === 'image')
      : [];
    const source = sources[0];
    if (!node || sources.length !== 1 || !source?.assetPath)
      throw new Error('视频需要一张有效的来源图片，请检查引用连线。');
    const snapshot = snapshotCanvasSource(source);
    const list = await options.store.listGeneration(current.id);
    if (options.getDocument() !== current || !isCanvasSourceCurrent(snapshot, source)) return false;
    for (const item of list) attempts.set(item.id, item);
    if (
      list.some(
        (item: any) =>
          item.targetNodeId === nodeId &&
          ['pending', 'running', 'unknown', 'canceled'].includes(item.status) &&
          item.sourceImagePath !== source.assetPath
      )
    ) {
      options.setError('旧来源仍有未确认的视频任务，请先查询原任务，不会重复生成。');
      return false;
    }
    const relevant = list.filter(
      (attempt: any) =>
        attempt.kind === 'video' &&
        attempt.targetNodeId === nodeId &&
        attempt.sourceImagePath === source.assetPath
    );
    let attempt = relevant
      .sort((left: any, right: any) => left.createdAt.localeCompare(right.createdAt))
      .pop();
    const recorded = list.find(
      (item: any) => item.id === node.generation?.attemptId && item.targetNodeId === nodeId
    );
    if (
      !attempt ||
      attempt.status === 'failed' ||
      (attempt.status === 'succeeded' && attempt.id === node.generation?.attemptId)
    ) {
      const prompt = templateVideoPrompt(
        attempt?.status === 'failed'
          ? attempt.prompt || node.generation?.prompt
          : node.generation?.prompt
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
            ...(attempt?.status === 'failed' ? generationParameters(attempt) : {}),
            templateRun: true,
          }
        )
      )
        return true;
      attempt = Array.from(attempts.values())
        .filter(
          (item: any) =>
            item.canvasId === current.id &&
            item.targetNodeId === nodeId &&
            item.sourceImagePath === source.assetPath
        )
        .pop();
    }
    while (
      attempt &&
      ['pending', 'running', 'canceled', 'unknown'].includes(attempt.status) &&
      attempt.taskId
    ) {
      options.setError('视频正在生成，完成后自动处理序列帧；请保持页面打开。');
      await new Promise((resolve) => setTimeout(resolve, 120000));
      if (options.getDocument()?.id !== current.id) return false;
      attempt = await options.store.generationAction(current.id, attempt.id, 'query');
      attempts.set(attempt.id, attempt);
      if (attempt.status === 'unknown') break;
    }
    if (attempt?.status !== 'succeeded') {
      options.setError(
        attempt?.error || '视频尚未完成，已停止后续流程；可继续查询原任务，不会自动重新付费生成。'
      );
      return false;
    }
    if (options.getDocument()?.id !== current.id) return false;
    applyAttempt(attempt, true, true);
    options.setError('');
    return options.flush();
  }

  async function action(attempt: any, actionName: 'query' | 'retry' | 'cancel'): Promise<void> {
    try {
      const next = await options.store.generationAction(attempt.canvasId, attempt.id, actionName);
      attempts.set(next.id, next);
      if (options.getDocument()?.id !== attempt.canvasId) return;
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
            ? '生成失败'
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
    if (
      (relevant.status === 'pending' || relevant.status === 'running') &&
      relevant.kind === 'video' &&
      relevant.taskId
    )
      container.append(button('查询', () => action(relevant, 'query')));
    else if (relevant.status === 'unknown' && relevant.kind === 'video' && relevant.taskId)
      container.append(button('查询原任务', () => action(relevant, 'query')));
    else if (relevant.status === 'failed')
      container.append(button('重试', () => action(relevant, 'retry')));
    else if (relevant.status === 'canceled' && relevant.kind === 'video' && relevant.taskId)
      container.append(button('查询原任务', () => action(relevant, 'query')));
  }

  function render(
    card: any,
    node: any,
    _nodes: any[],
    operationOverride?: 'outpaint',
    workflow?: CanvasWorkflowEdit
  ): void {
    if (node.type !== 'image' && node.type !== 'video' && node.type !== 'video-source') return;
    const source = node.sourceSnapshot?.nodeId
      ? _nodes.find((item: any) => item.id === node.sourceSnapshot.nodeId)
      : undefined;
    const stale = isCanvasNodeStale(node, source);
    const panel = document.createElement('div');
    panel.className = 'generation-panel';
    const busy = inFlight.has(node.id) || importingReferences.has(referenceKey(node));
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
    panel.append(createPromptEditor(input));
    renderReferences(panel, node, _nodes, busy);
    let imageModel: any;
    let imageResolution: any;
    let imageRatio: any;
    let videoModel: any;
    let videoResolution: any;
    let videoDuration: any;
    let videoRatio: any;
    if (node.type === 'image') {
      const fields = document.createElement('div');
      fields.className = 'generation-fields';
      const settingsKey = referenceKey(node);
      const saved = imageSettings.get(settingsKey) || node.generation?.parameters;
      imageModel = selectControl('模型', ['auto', 'gpt', 'nanobanana'], saved?.model || 'auto');
      imageResolution = selectControl('分辨率', ['1K', '2K'], saved?.resolution || '1K');
      imageRatio = selectControl(
        '比例',
        ['1:1', '16:9', '9:16', '4:3', '3:4'],
        saved?.aspectRatio || '1:1'
      );
      fields.addEventListener('change', () =>
        imageSettings.set(settingsKey, {
          model: imageModel.value,
          resolution: imageResolution.value,
          aspectRatio: imageRatio.value,
        })
      );
      fields.append(imageModel, imageResolution, imageRatio);
      panel.append(fields);
    } else {
      const fields = document.createElement('div');
      fields.className = 'generation-fields';
      const saved = videoSettings.get(referenceKey(node)) || node.generation?.parameters;
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
      fields.addEventListener('change', () =>
        videoSettings.set(referenceKey(node), {
          model: videoModel.value,
          resolution: videoResolution.value,
          duration: Number(videoDuration.value),
          ratio: videoRatio.value,
        })
      );
      fields.append(videoModel, videoResolution, videoDuration, videoRatio);
      panel.append(fields);
    }
    async function submitGeneration(): Promise<void> {
      if (workflow && !workflow.canSubmit) return;
      const execute = async () => {
        if (node.type !== 'image') {
          const completed = await runVideo(node, input, {
            model: videoModel?.value,
            resolution: videoResolution?.value,
            duration: Number(videoDuration?.value || 4),
            ratio: videoRatio?.value,
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
          { className: 'generation-action generation-action-primary', disabled: busy }
        )
      );
    } else if (node.type === 'image') {
      const actions = document.createElement('div');
      actions.className = 'generation-actions';
      actions.append(
        button(
          '导入参考图',
          () => {
            const canvasId = options.getDocument().id;
            const picker = document.createElement('input');
            picker.type = 'file';
            picker.accept = 'image/png,image/jpeg,image/webp';
            picker.addEventListener('change', () => {
              void importReference(node, picker.files?.[0], canvasId);
            });
            picker.click();
          },
          {
            className: 'generation-action',
            title: '导入生图参考，不替换当前卡片图片',
            disabled: busy,
          }
        ),
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
          disabled: busy || Boolean(workflow && !workflow.canSubmit),
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
      restored = applyAttempt(attempt, false) || restored;
    }
    if (restored) await options.flush();
    options.render();
  }

  function latestNodeAttempt(nodeId: string) {
    const canvasId = options.getDocument()?.id;
    return [...attempts.values()]
      .filter((attempt) => attempt.canvasId === canvasId && attempt.targetNodeId === nodeId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  return {
    render,
    restore,
    runTemplateVideo,
    runTemplateImage,
    nodeState(nodeId: string) {
      const attempt = latestNodeAttempt(nodeId);
      if (!attempt || attempt.status === 'succeeded') return;
      if (attempt.status === 'failed') {
        const current = options.getDocument();
        const source = current?.nodes.find((node: any) => node.id === attempt.sourceImageId);
        if (source && attempt.sourceImagePath && source.assetPath !== attempt.sourceImagePath)
          return;
        if (
          source &&
          attempt.sourceSnapshot &&
          !isCanvasSourceCurrent(attempt.sourceSnapshot, source)
        )
          return;
      }
      return {
        status: attempt.status,
        canQuery:
          attempt.kind === 'video' &&
          Boolean(attempt.taskId) &&
          ['running', 'pending', 'unknown', 'canceled'].includes(attempt.status),
      };
    },
    async queryNode(nodeId: string) {
      const attempt = latestNodeAttempt(nodeId);
      if (attempt?.kind === 'video' && attempt.taskId) await action(attempt, 'query');
    },
    hasUnsettledResult(nodeId: string) {
      return [...attempts.values()].some(
        (attempt) =>
          attempt.canvasId === options.getDocument()?.id &&
          attempt.targetNodeId === nodeId &&
          ['pending', 'running', 'unknown', 'canceled'].includes(attempt.status)
      );
    },
    isNodeBusy(nodeId: string) {
      return inFlight.has(nodeId) || importingReferences.has(referenceKey({ id: nodeId }));
    },
    get isBusy() {
      return inFlight.size > 0;
    },
  };
}
