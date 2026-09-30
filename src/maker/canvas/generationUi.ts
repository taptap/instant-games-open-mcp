declare const document: any;
import { isCanvasNodeStale, snapshotCanvasSource } from './dependencies.js';

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
  setError(message: string): void;
  createId(): string;
  replaceImage?(nodeId: string): boolean;
  onGenerated?(nodeId: string, kind: string): Promise<void>;
  onVideoCreated?(nodeId: string): void;
}

export function createCanvasGenerationUi(options: CanvasGenerationUiOptions): {
  render(card: any, node: any, nodes: any[], operationOverride?: 'outpaint'): void;
  restore(): Promise<void>;
  runTemplateVideo(nodeId: string, duration: number): Promise<boolean>;
  readonly isBusy: boolean;
} {
  const attempts = new Map<string, any>();
  const inFlight = new Set<string>();
  const drafts = new Map<string, string>();
  const references = new Map<string, string[]>();
  const importingReferences = new Set<string>();
  const imageSettings = new Map<
    string,
    { model: string; resolution: string; aspectRatio: string }
  >();

  function referenceKey(node: any): string {
    return options.getDocument().id + '/' + node.id;
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
    if ((references.get(key)?.length || 0) + Number(implicitReference) >= 14) {
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
      references.set(key, [...(references.get(key) || []), saved.relativePath]);
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
    const paths = references.get(key) || [];
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
              (references.get(key) || []).filter((_, position) => position !== index)
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

  function promptField(node: any, placeholder: string): any {
    const input = document.createElement('textarea');
    input.rows = 4;
    input.value =
      drafts.get(node.id) ?? node.generationDraft?.prompt ?? node.generation?.prompt ?? '';
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
      generate: '卡通风格二次元游戏角色立绘，完整身体，纯色背景，四周保留安全留白',
      variant: '保持角色身份与构图，生成一个适合游戏开发的动作、武器或战甲变体，完整主体不裁切',
      outpaint: '保持角色主体不变，扩展画布与背景，补全武器和动作空间，主体与道具不出画面',
    };
    const value =
      input.value.trim() ||
      node.generationDraft?.prompt ||
      node.generation?.prompt ||
      defaults[operation];
    input.value = value;
    drafts.set(node.id, value);
    return value;
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
      };
      resultNode.title =
        attempt.operation === 'variant'
          ? '图片变体 · 已保存结果'
          : attempt.operation === 'outpaint'
            ? '扩展画面 · 已保存结果'
            : '生图结果';
      resultNode.assetPath = attempt.resultAssetPath;
      delete resultNode.generationDraft;
      resultNode.generation = {
        prompt: attempt.prompt,
        operation: attempt.operation || 'generate',
        attemptId: attempt.id,
        sourceImageId: sourceImageIds[0],
        sourceImageIds: sourceImageIds.length ? sourceImageIds : undefined,
      };
      resultNode.sourceSnapshot = snapshotCanvasSource(
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
        resultNode.type = 'video-source';
        resultNode.width = 300;
        resultNode.height = 250;
        resultNode.title = '视频结果';
        resultNode.assetPath = attempt.resultAssetPath;
        resultNode.generation = {
          prompt: attempt.prompt,
          taskId: attempt.taskId,
          attemptId: attempt.id,
          sourceImageId: attempt.sourceImageId,
        };
        resultNode.sourceSnapshot = snapshotCanvasSource(source);
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
            taskId: attempt.taskId,
            attemptId: attempt.id,
            sourceImageId: attempt.sourceImageId,
          },
          sourceSnapshot: snapshotCanvasSource(source),
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
    inFlight.add(node.id);
    options.render();
    try {
      if (!(await options.flush())) {
        options.setError('画布尚未保存，保存成功后再生成。');
        return;
      }
      if (options.getDocument()?.id !== documentState.id) return;
      const attempt = await options.store.generateImage(documentState.id, {
        prompt,
        operation: selectedOperation,
        targetNodeId: !node.assetPath || options.replaceImage?.(node.id) ? node.id : undefined,
        model: settings.model,
        resolution: settings.resolution,
        aspectRatio: settings.aspectRatio,
        targetSize: imageTargetSize(settings.resolution || '1K', settings.aspectRatio || '1:1'),
        referenceImagePaths: [...(references.get(referenceKey(node)) || [])],
        ...(selectedOperation === 'generate'
          ? {}
          : {
              sourceImageId: source.id,
              sourceImagePath: source.assetPath,
              sourceImageIds: [source.id],
              sourceImagePaths: [source.assetPath],
            }),
      });
      attempts.set(attempt.id, attempt);
      if (options.getDocument()?.id !== documentState.id) return;
      if (attempt.status === 'succeeded') {
        applyAttempt(attempt, true, Boolean(node.assetPath));
        if (await options.flush()) {
          const result = documentState.nodes.find(
            (item: any) => item.generation?.attemptId === attempt.id
          );
          inFlight.delete(node.id);
          if (result) await options.onGenerated?.(result.id, 'image');
        }
      } else {
        options.setError(attempt.error || '图片生成失败，请检查错误信息后再重试。');
        options.render();
      }
    } catch (error) {
      options.setError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.delete(node.id);
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
    } = {}
  ): Promise<boolean> {
    const documentState = options.getDocument();
    if (!documentState || inFlight.has(node.id)) return false;
    if (settings.model === '2.5' && settings.userConfirmed !== true) {
      if (!window.confirm('Seedance 2.5 成本更高，实际按上游 token 扣费。确认继续吗？'))
        return false;
      settings.userConfirmed = true;
    }
    const prompt =
      input.value.trim() || '保持角色身份与首帧构图，生成一段主体完整、动作清晰、固定镜头的短视频';
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
    if (node.draftSourceId) {
      options.remember();
      node = {
        id: options.createId(),
        type: 'video',
        x: source.x + source.width + 48,
        y: source.y,
        width: 360,
        height: 240,
        title: '视频生成',
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
      options.onVideoCreated?.(node.id);
    }
    inFlight.add(node.id);
    options.render();
    try {
      if (!(await options.flush()) || options.getDocument()?.id !== documentState.id) return false;
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
        applyAttempt(attempt, true, Boolean(node.assetPath));
        if (await options.flush()) {
          await options.onGenerated?.(node.id, 'video');
          return true;
        }
      } else {
        options.setError(
          attempt.error ||
            (['pending', 'running'].includes(attempt.status)
              ? '视频正在生成，可查询原任务。'
              : '视频未完成，请检查任务状态。')
        );
        options.render();
      }
    } catch (error) {
      options.setError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.delete(node.id);
      options.render();
    }
    return false;
  }

  async function runTemplateVideo(nodeId: string, duration: number): Promise<boolean> {
    const current = options.getDocument();
    const node = current?.nodes.find((item: any) => item.id === nodeId);
    const source = current?.nodes.find((item: any) => item.id === current.templateFlow?.imageId);
    if (!node || !source?.assetPath) throw new Error('模板的视频或首图已不存在。');
    const list = await options.store.listGeneration(current.id);
    const relevant = list.filter(
      (attempt: any) =>
        attempt.kind === 'video' &&
        attempt.targetNodeId === nodeId &&
        attempt.sourceImagePath === source.assetPath
    );
    let attempt = relevant
      .sort((left: any, right: any) => left.createdAt.localeCompare(right.createdAt))
      .pop();
    if (!attempt || attempt.status === 'failed') {
      if (
        await runVideo(
          node,
          { value: node.generation?.prompt || '' },
          { duration, model: '2.0', resolution: '720p', ratio: 'adaptive' }
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

  function render(card: any, node: any, _nodes: any[], operationOverride?: 'outpaint'): void {
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
          ? '描述要扩展的画面空间…'
          : operation === 'variant'
            ? '描述动作、武器或战甲变化…'
            : '描述要生成的图片…'
        : '描述动作和镜头…'
    );
    panel.append(input);
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
      const saved = imageSettings.get(settingsKey);
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
      videoModel = selectControl('模型', ['2.0', '2.5'], '2.0');
      videoResolution = selectControl('分辨率', ['720p', '480p'], '720p');
      videoDuration = selectControl('时长（秒）', ['4', '5', '6', '7', '8'], '4');
      const durationSelect = videoDuration.querySelector('select');
      Array.from(durationSelect.options).forEach((option: any) => {
        if (Number(option.value) > 5) option.style.color = '#ef6464';
      });
      durationSelect.addEventListener('change', () => {
        durationSelect.style.color = Number(durationSelect.value) > 5 ? '#ef6464' : '';
      });
      videoRatio = selectControl('比例', ['adaptive', '16:9', '9:16', '1:1'], 'adaptive');
      fields.append(videoModel, videoResolution, videoDuration, videoRatio);
      panel.append(fields);
    }
    if (node.assetPath && stale) {
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
        button(
          '生成',
          () =>
            runImage(node, input, operation, {
              model: imageModel?.value === 'auto' ? undefined : imageModel?.value,
              resolution: imageResolution?.value,
              aspectRatio: imageRatio?.value,
            }),
          {
            className: 'generation-action generation-action-primary',
            title: '在当前图片槽中生成结果',
            disabled: busy,
          }
        )
      );
      panel.append(actions);
    } else {
      const actions = document.createElement('div');
      actions.className = 'generation-actions';
      if (node.type === 'video' && !node.draftSourceId) {
        actions.append(
          button('导入视频', () => options.requestVideoImport(node.id), {
            className: 'generation-action',
            title: '从本地项目导入视频到当前视频卡片',
            disabled: busy,
          })
        );
      }
      actions.append(
        button(
          '生成视频',
          () =>
            runVideo(node, input, {
              model: videoModel?.value,
              resolution: videoResolution?.value,
              duration: Number(videoDuration?.value || 4),
              ratio: videoRatio?.value,
            }),
          {
            className: 'generation-action generation-action-primary',
            title: '从已连接图片创建视频结果',
            disabled: busy,
          }
        )
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
    const targets = new Set<string>();
    const newest = list
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    for (const attempt of newest) {
      if (attempt.targetNodeId) {
        if (targets.has(attempt.targetNodeId)) continue;
        targets.add(attempt.targetNodeId);
      }
      const flow = documentState.templateFlow;
      if (flow && [flow.imageId, flow.videoId].includes(attempt.targetNodeId)) continue;
      restored = applyAttempt(attempt, false) || restored;
    }
    if (restored) await options.flush();
    options.render();
  }

  return {
    render,
    restore,
    runTemplateVideo,
    get isBusy() {
      return inFlight.size > 0;
    },
  };
}
