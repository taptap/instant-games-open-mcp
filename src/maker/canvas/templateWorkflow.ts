/// <reference lib="dom" />
import type {
  CanvasDocument,
  CanvasNode,
  CanvasTemplateFlow,
  CanvasNodeType,
  CanvasEdgeKind,
} from './model.js';
import { CanvasStoreError } from './model.js';
import { canvasReferences, canvasDependents, isCanvasNodeStale } from './dependencies.js';

export function canvasNeedsProcessing(
  document: CanvasDocument,
  node: CanvasNode,
  visiting = new Set<string>()
): boolean {
  if (node.templatePending) return true;
  if (visiting.has(node.id)) return true;
  if (isCanvasNodeStale(node, canvasReferences(document, node.id))) return true;
  visiting.add(node.id);
  const pending = canvasReferences(document, node.id).some((source) =>
    canvasNeedsProcessing(document, source, visiting)
  );
  visiting.delete(node.id);
  return pending;
}

export function invalidateCanvasDependents(document: CanvasDocument, nodeId: string): void {
  for (const node of canvasDependents(document, nodeId)) {
    if (node.sectionId && node.type !== 'section') node.templatePending = true;
  }
}

export type TemplateOutputDecision =
  | { kind: 'reuse'; nodeId: string }
  | { kind: 'create' }
  | { kind: 'blocked'; message: string };

export function parseTemplateFlow(
  value: unknown,
  document: Pick<CanvasDocument, 'nodes' | 'edges'>
): CanvasTemplateFlow | undefined {
  if (value === undefined) return;
  const flow = value as CanvasTemplateFlow;
  const hasNode = (id: string | undefined, type: string) =>
    typeof id === 'string' && document.nodes.some((node) => node.id === id && node.type === type);
  if (
    !flow ||
    typeof flow !== 'object' ||
    !hasNode(flow.imageId, 'image') ||
    !hasNode(flow.videoId, 'video-source') ||
    !hasNode(flow.sequenceId, 'sequence') ||
    (flow.animationId !== undefined && !hasNode(flow.animationId, 'animation')) ||
    !['image', 'ready', 'video', 'sequence', 'animation', 'complete'].includes(flow.stage) ||
    !Number.isInteger(flow.duration) ||
    flow.duration < 4 ||
    flow.duration > 8 ||
    !document.edges.some(
      (edge) =>
        edge.from === flow.imageId && edge.to === flow.videoId && edge.kind === 'image-to-video'
    ) ||
    !document.edges.some(
      (edge) =>
        edge.from === flow.videoId && edge.to === flow.sequenceId && edge.kind === 'sequence-source'
    ) ||
    (flow.animationId !== undefined &&
      !document.edges.some(
        (edge) =>
          edge.from === flow.sequenceId &&
          edge.to === flow.animationId &&
          edge.kind === 'sequence-animation'
      ))
  ) {
    throw new CanvasStoreError('模板流程状态无效。', 400, 'INVALID_DOCUMENT');
  }
  return {
    imageId: flow.imageId,
    videoId: flow.videoId,
    sequenceId: flow.sequenceId,
    ...(flow.animationId ? { animationId: flow.animationId } : {}),
    duration: flow.duration,
    stage: flow.stage,
  };
}

export function createTemplateWorkflow(options: {
  getDocument(): CanvasDocument | null;
  save(): Promise<boolean>;
  changed(): void;
  render(): void;
  error(message: string): void;
  confirm(message: string): boolean;
  video(nodeId: string, duration: number, userConfirmed?: boolean): Promise<boolean>;
  sequence(nodeId: string): Promise<void>;
  animation(flow: CanvasTemplateFlow): void;
  select(nodeId: string): void;
  importImage(nodeId: string): void;
  isNodeBusy?(nodeId: string): boolean;
  hasUnsettledResult?(nodeId: string): boolean;
  hasFailure?(nodeId: string): boolean;
  image?(nodeId: string): Promise<boolean>;
  refreshAnimation?(nodeId: string): void;
  isQueued?(nodeId: string): boolean;
}) {
  let running = false;
  let activeNodeId: string | undefined;
  const protectedNodes = new Set<string>();
  function isMember(id: string): boolean {
    const document = options.getDocument();
    const node = document?.nodes.find((node) => node.id === id);
    const flow = document?.templateFlow;
    return Boolean(
      node &&
        ((node.sectionId &&
          document?.nodes.some((section) => section.id === node.sectionId && section.templateId)) ||
          (flow && [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].includes(id)))
    );
  }
  function canAdjust(id: string): boolean {
    const node = options.getDocument()?.nodes.find((node) => node.id === id);
    return Boolean(
      node &&
        isMember(id) &&
        ['image', 'video', 'video-source', 'sequence'].includes(node.type) &&
        (node.type !== 'sequence' || !waitingForSource(id)) &&
        !running &&
        !options.isQueued?.(id) &&
        !options.isNodeBusy?.(id) &&
        !options.hasUnsettledResult?.(id)
    );
  }
  function waitingForSource(id: string): boolean {
    const document = options.getDocument();
    if (!document) return true;
    return canvasReferences(document, id).some(
      (source) =>
        !source.assetPath ||
        status(source.id) === 'pending' ||
        options.isNodeBusy?.(source.id) ||
        options.hasUnsettledResult?.(source.id)
    );
  }
  type TemplateNodeStatus = 'editable' | 'pending' | 'loading' | 'complete';
  function templateMember(id: string) {
    const document = options.getDocument();
    const flow = document?.templateFlow;
    if (
      flow &&
      flow.stage !== 'complete' &&
      [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].includes(id)
    )
      return;
    const node = document?.nodes.find((node) => node.id === id);
    return node?.sectionId &&
      document?.nodes.some((section) => section.id === node.sectionId && section.templateId)
      ? node
      : undefined;
  }
  function canEditImage(id: string): boolean {
    if (protectedNodes.has(id)) return false;
    const member = templateMember(id);
    if (member?.type === 'image' && !options.isNodeBusy?.(id) && !options.hasUnsettledResult?.(id))
      return true;
    const flow = options.getDocument()?.templateFlow;
    return Boolean(
      flow && flow.imageId === id && ['image', 'ready'].includes(flow.stage) && !running
    );
  }
  function canEditVideo(id: string): boolean {
    if (protectedNodes.has(id)) return false;
    const member = templateMember(id);
    if (
      member &&
      ['video', 'video-source'].includes(member.type) &&
      !options.isNodeBusy?.(id) &&
      !options.hasUnsettledResult?.(id)
    )
      return true;
    const flow = options.getDocument()?.templateFlow;
    return Boolean(
      flow && flow.videoId === id && ['image', 'ready'].includes(flow.stage) && !running
    );
  }
  function locked(id: string): boolean {
    if (options.isQueued?.(id)) return true;
    if (protectedNodes.has(id)) return true;
    const flow = options.getDocument()?.templateFlow;
    if (!flow || flow.stage === 'complete') return false;
    if (running && [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].includes(id))
      return true;
    return (
      [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].includes(id) &&
      !canEditImage(id) &&
      !canEditVideo(id) &&
      status(id) !== 'complete'
    );
  }
  function loadingNodeId(flow: CanvasTemplateFlow): string | undefined {
    if (!running || protectedNodes.size) return;
    if (flow.stage === 'ready' || flow.stage === 'video') return flow.videoId;
    if (flow.stage === 'sequence') return flow.sequenceId;
    if (flow.stage === 'animation') return flow.animationId || flow.sequenceId;
    return;
  }
  function status(id: string): TemplateNodeStatus | undefined {
    if (activeNodeId === id) return 'loading';
    if (isMember(id) && options.hasFailure?.(id)) return 'pending';
    const document = options.getDocument();
    const node = document?.nodes.find((node) => node.id === id);
    const member = templateMember(id);
    if (member)
      return options.isNodeBusy?.(id)
        ? 'loading'
        : canvasNeedsProcessing(document!, member)
          ? 'pending'
          : 'complete';
    const flow = options.getDocument()?.templateFlow;
    if (!flow || ![flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].includes(id))
      return node && document && canvasNeedsProcessing(document, node) ? 'pending' : undefined;
    if (options.isNodeBusy?.(id)) return 'loading';
    if (loadingNodeId(flow) === id) return 'loading';
    if (node && document && canvasNeedsProcessing(document, node)) return 'pending';
    if (flow.stage === 'complete') return 'complete';
    if (id === flow.imageId) {
      return canEditImage(id) ? 'editable' : 'complete';
    }
    if (loadingNodeId(flow) === id) return 'loading';
    const order = [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId];
    const step = { image: 0, ready: 1, video: 1, sequence: 2, animation: 3 }[flow.stage];
    return order.indexOf(id) < step ? 'complete' : 'pending';
  }
  function resolveTarget(
    sourceId: string,
    type: CanvasNodeType,
    preferredTargetId?: string
  ): TemplateOutputDecision | undefined {
    const document = options.getDocument();
    const flow = document?.templateFlow;
    if (!document) return;
    const member = templateMember(sourceId);
    const members = flow ? [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId] : [];
    if (!member && !members.includes(sourceId)) return;
    const blocked: TemplateOutputDecision = {
      kind: 'blocked',
      message: '模板相关卡片正在处理或结果尚未确认，请先完成或查询原任务。',
    };
    if (running || options.isNodeBusy?.(sourceId) || options.hasUnsettledResult?.(sourceId))
      return blocked;
    if (
      type === 'image' &&
      canEditImage(sourceId) &&
      (!member || member.templatePending || !document.edges.some((edge) => edge.to === sourceId)) &&
      (!preferredTargetId || preferredTargetId === sourceId)
    )
      return { kind: 'reuse', nodeId: sourceId };
    const kinds: Partial<Record<CanvasNodeType, CanvasEdgeKind[]>> = {
      image: ['image-variant'],
      video: ['first-frame', 'image-to-video'],
      'video-source': ['first-frame', 'image-to-video'],
      sequence: ['sequence-source'],
      animation: ['sequence-animation'],
    };
    const targets = document.nodes.filter(
      (node) =>
        (!member || node.sectionId === member.sectionId) &&
        (node.type === type || (type === 'video' && node.type === 'video-source')) &&
        (type !== 'sequence' || node.sourceVideoId === sourceId) &&
        document.edges.some(
          (edge) =>
            edge.from === sourceId && edge.to === node.id && kinds[type]?.includes(edge.kind)
        )
    );
    const preferred = preferredTargetId && targets.find((node) => node.id === preferredTargetId);
    const candidates = preferred ? [preferred] : targets;
    if (
      candidates.some(
        (node) =>
          options.isNodeBusy?.(node.id) ||
          options.hasUnsettledResult?.(node.id) ||
          status(node.id) === 'loading'
      )
    )
      return blocked;
    const available = candidates.filter(
      (node) => status(node.id) === 'pending' || (!node.assetPath && !node.frameSetInfo)
    );
    if (available.length > 1)
      return { kind: 'blocked', message: '有多个待处理目标，请先选择具体下游卡片编辑。' };
    const target = available[0];
    return target ? { kind: 'reuse', nodeId: target.id } : { kind: 'create' };
  }
  async function run(): Promise<void> {
    const document = options.getDocument();
    const flow = document?.templateFlow;
    if (
      !document ||
      !flow ||
      running ||
      options.isQueued?.(flow.videoId) ||
      flow.stage === 'image' ||
      flow.stage === 'complete'
    )
      return;
    if (
      [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].some(
        (id) => id && options.isNodeBusy?.(id)
      )
    ) {
      options.error('模板相关卡片正在处理或结果尚未确认，请先完成或查询原任务。');
      return;
    }
    running = true;
    options.render();
    async function stage(next: CanvasTemplateFlow['stage']): Promise<void> {
      if (options.getDocument()?.id !== document!.id) throw new Error('已离开模板画布，流程停止。');
      const previous = flow!.stage;
      flow!.stage = next;
      options.changed();
      if (!(await options.save())) {
        flow!.stage = previous;
        options.changed();
        throw new Error('模板进度保存失败，请保存后继续。');
      }
      options.render();
    }
    try {
      if (flow.stage === 'ready' || flow.stage === 'video') {
        await stage('video');
        if (!(await options.video(flow.videoId, flow.duration))) return;
        delete document.nodes.find((node) => node.id === flow.videoId)?.templatePending;
        await stage('sequence');
      }
      if (flow.stage === 'sequence') {
        await options.sequence(flow.sequenceId);
        await stage('animation');
      }
      if (flow.stage === 'animation') {
        options.animation(flow);
        delete document.nodes.find((node) => node.id === flow.animationId)?.templatePending;
        await stage('complete');
        options.select(flow.animationId || flow.sequenceId);
      }
    } catch (error) {
      options.error(error instanceof Error ? error.message : '模板流程失败，已保留当前结果。');
    } finally {
      running = false;
      options.render();
    }
  }
  async function headChanged(nodeId: string): Promise<void> {
    await nodeChanged(nodeId);
  }
  async function videoChanged(nodeId: string): Promise<void> {
    await nodeChanged(nodeId);
  }
  async function nodeChanged(nodeId: string): Promise<void> {
    const document = options.getDocument();
    const node = document?.nodes.find((node) => node.id === nodeId);
    if (document && node) {
      delete node.templatePending;
      invalidateCanvasDependents(document, nodeId);
    }
    const flow = document?.templateFlow;
    if (
      !flow ||
      running ||
      ![flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].includes(nodeId)
    ) {
      options.changed();
      await options.save();
      options.render();
      return;
    }
    const order = [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId];
    const index = order.indexOf(nodeId);
    if (index < 0) return;
    const next: CanvasTemplateFlow['stage'][] = ['ready', 'sequence', 'animation', 'complete'];
    const previous = flow.stage;
    flow.stage = next[index];
    options.changed();
    if (!(await options.save())) {
      flow.stage = previous;
      options.changed();
      return;
    }
    options.render();
  }
  function canContinue(id: string, requireReady = true): boolean {
    const document = options.getDocument();
    const node = document?.nodes.find((node) => node.id === id);
    return Boolean(
      document &&
        node &&
        status(id) === 'pending' &&
        ['image', 'video', 'video-source', 'sequence', 'animation'].includes(node.type) &&
        (canvasReferences(document, id).length || node.type === 'image') &&
        !running &&
        (!requireReady || !waitingForSource(id)) &&
        !options.isNodeBusy?.(id) &&
        !options.hasUnsettledResult?.(id)
    );
  }
  async function runFrom(
    id: string,
    firstStep?: () => Promise<boolean>,
    automatic = false
  ): Promise<boolean> {
    const document = options.getDocument();
    const start = document?.nodes.find((node) => node.id === id);
    if (!automatic && options.isQueued?.(id)) return false;
    if (!document || !start || !(firstStep ? canAdjust(id) : canContinue(id, false))) return false;
    const candidates = [start, ...(automatic ? [] : canvasDependents(document, id))].filter(
      (node) => node.sectionId === start.sectionId
    );
    const remaining = new Set(candidates.map((node) => node.id));
    const ordered: typeof candidates = [];
    while (remaining.size) {
      const next = candidates.find(
        (node) =>
          remaining.has(node.id) &&
          !canvasReferences(document, node.id).some((source) => remaining.has(source.id))
      );
      if (!next) {
        options.error('引用关系存在循环，请调整连线后继续。');
        return false;
      }
      ordered.push(next);
      remaining.delete(next.id);
    }
    running = true;
    for (const node of candidates) protectedNodes.add(node.id);
    for (const node of candidates)
      for (const source of canvasReferences(document, node.id)) protectedNodes.add(source.id);
    try {
      if (!(await options.save())) throw new Error('画布尚未保存，请保存后继续。');
      for (const node of ordered) {
        if (options.getDocument() !== document) throw new Error('已离开原画布，后续处理停止。');
        if (status(node.id) !== 'pending' && !(node.id === id && firstStep)) continue;
        const sources = canvasReferences(document, node.id);
        if (
          (!sources.length && node.type !== 'image') ||
          sources.some(
            (source) =>
              !source.assetPath ||
              status(source.id) === 'pending' ||
              canvasNeedsProcessing(document, source) ||
              options.isNodeBusy?.(source.id) ||
              options.hasUnsettledResult?.(source.id)
          )
        )
          throw new Error('请先完成此卡片的上游待处理步骤，再继续。');
        if (options.isNodeBusy?.(node.id) || options.hasUnsettledResult?.(node.id))
          throw new Error('卡片存在未确认任务，请先查询原任务，不会重复生成。');
        if (
          !automatic &&
          ['video', 'video-source'].includes(node.type) &&
          sources.some(
            (source) => source.type === 'image' && canvasReferences(document, source.id).length > 0
          ) &&
          !options.confirm(
            '请核对来源参考图的朝向、稳定站姿及完整构图。确认这些图片正确，并继续生成视频吗？'
          )
        )
          return false;
        activeNodeId = node.id;
        options.render();
        if (node.id === id && firstStep) {
          if (!(await firstStep())) return false;
        } else if (node.type === 'video' || node.type === 'video-source') {
          if (
            !(await options.video(
              node.id,
              node.generation?.parameters?.duration || document.templateFlow?.duration || 4,
              automatic
            ))
          )
            return false;
        } else if (node.type === 'image' && options.image) {
          if (!(await options.image(node.id))) return false;
        } else if (node.type === 'sequence') await options.sequence(node.id);
        else if (node.type === 'animation' && options.refreshAnimation)
          options.refreshAnimation(node.id);
        else throw new Error('此卡片暂不支持直接继续，请手动处理。');
        if (options.getDocument() !== document) throw new Error('已离开原画布，后续处理停止。');
        delete node.templatePending;
        invalidateCanvasDependents(document, node.id);
        if (canvasNeedsProcessing(document, node))
          throw new Error('来源在处理期间发生变化，请核查后重新处理。');
        const flow = document.templateFlow;
        if (flow) {
          const index = [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].indexOf(
            node.id
          );
          if (index >= 0)
            flow.stage = (['ready', 'sequence', 'animation', 'complete'] as const)[index];
        }
        options.changed();
        if (!(await options.save())) throw new Error('结果保存失败，已停止后续步骤，请先保存。');
        activeNodeId = undefined;
        if (node.type === 'image') {
          options.select(node.id);
          return true;
        }
      }
      options.select(ordered[ordered.length - 1].id);
      return true;
    } catch (error) {
      options.error(error instanceof Error ? error.message : '处理未完成，已保留旧结果。');
      return false;
    } finally {
      activeNodeId = undefined;
      protectedNodes.clear();
      running = false;
      options.render();
    }
  }
  function render(container: HTMLElement): void {
    container.replaceChildren();
    const documentState = options.getDocument();
    const flow = documentState?.templateFlow;
    const headBusy = Boolean(flow && options.isNodeBusy?.(flow.imageId));
    container.hidden = !flow || flow.stage === 'complete';
    if (!flow || flow.stage === 'complete') {
      const readyImage =
        !running &&
        documentState?.nodes.some(
          (node) =>
            node.type === 'image' &&
            node.assetPath &&
            isMember(node.id) &&
            status(node.id) === 'complete' &&
            documentState.edges.some((edge) => edge.from === node.id && canContinue(edge.to))
        );
      if (readyImage) {
        container.hidden = false;
        const hint = document.createElement('span');
        hint.textContent =
          '图片已就绪。请先核对朝向、站姿与完整构图，再点击下游待处理卡片的「处理并继续」。';
        container.append(hint);
      }
      return;
    }
    const label = document.createElement('span');
    const labels = {
      image: '可编辑首图或视频动作；后续卡片会在确认后按模板生成',
      ready: '首图已完成，请核对图片后点击「继续后续流程」；后续卡片暂为待定',
      video: '第 2 步：生成视频',
      sequence: '第 3 步：抽帧、抠图和图集',
      animation: '第 4 步：更新序列帧动画',
      complete: '模板流程已完成，卡片已解锁',
    };
    label.textContent =
      (headBusy && flow.stage === 'image' ? '首图生成中…' : labels[flow.stage]) +
      (running ? ' · 处理中…' : '');
    container.append(label);
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = running || headBusy;
    button.textContent = headBusy
      ? '生成中…'
      : flow.stage === 'image'
        ? '替换首图'
        : flow.stage === 'ready'
          ? '继续后续流程'
          : '继续当前步骤';
    button.onclick = () => {
      if (flow.stage === 'image') options.importImage(flow.imageId);
      else void run();
    };
    container.append(button);
  }
  return {
    isMember,
    canAdjust,
    waitingForSource,
    resolveTarget,
    canContinue,
    runFrom,
    runQueued: (id: string) => runFrom(id, undefined, true),
    nodeChanged,
    canEditImage,
    canEditVideo,
    locked,
    status,
    isNodeLoading(id: string) {
      const flow = options.getDocument()?.templateFlow;
      return activeNodeId === id || Boolean(flow && loadingNodeId(flow) === id);
    },
    headChanged,
    videoChanged,
    render,
    run,
    get isBusy() {
      return running;
    },
  };
}
