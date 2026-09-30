/// <reference lib="dom" />
import type { CanvasDocument, CanvasTemplateFlow } from './model.js';
import { CanvasStoreError } from './model.js';

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
  video(nodeId: string, duration: number): Promise<boolean>;
  sequence(nodeId: string): Promise<void>;
  animation(flow: CanvasTemplateFlow): void;
  select(nodeId: string): void;
  importImage(nodeId: string): void;
}) {
  let running = false;
  function canEditImage(id: string): boolean {
    const flow = options.getDocument()?.templateFlow;
    return Boolean(
      flow && flow.imageId === id && ['image', 'ready'].includes(flow.stage) && !running
    );
  }
  function locked(id: string): boolean {
    const flow = options.getDocument()?.templateFlow;
    if (!flow || flow.stage === 'complete') return false;
    return (
      [flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].includes(id) &&
      !canEditImage(id)
    );
  }
  async function run(): Promise<void> {
    const document = options.getDocument();
    const flow = document?.templateFlow;
    if (!document || !flow || running || flow.stage === 'image' || flow.stage === 'complete')
      return;
    if (flow.stage === 'ready' || flow.stage === 'video') {
      if (
        !options.confirm(
          '继续按模板完成视频、抽帧、抠图和序列帧动画？\n视频使用 Seedance 2.0，' +
            flow.duration +
            ' 秒，粗估 ' +
            flow.duration * 200 +
            ' 积分，实际按上游 token 计费。\n已有未完成任务只查询，不重复提交；失败时停止，不自动重试。'
        )
      )
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
        await stage('sequence');
      }
      if (flow.stage === 'sequence') {
        await options.sequence(flow.sequenceId);
        await stage('animation');
      }
      if (flow.stage === 'animation') {
        options.animation(flow);
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
    if (!canEditImage(nodeId)) return;
    const flow = options.getDocument()!.templateFlow!;
    flow.stage = 'ready';
    options.changed();
    if (!(await options.save())) return;
    options.render();
    await run();
  }
  function render(container: HTMLElement): void {
    container.replaceChildren();
    const flow = options.getDocument()?.templateFlow;
    container.hidden = !flow;
    if (!flow) return;
    const label = document.createElement('span');
    const labels = {
      image: '第 1 步：编辑或替换首图，其余卡片暂为示例',
      ready: '首图已就绪，可继续完成模板流程',
      video: '第 2 步：生成视频',
      sequence: '第 3 步：抽帧、抠图和图集',
      animation: '第 4 步：更新序列帧动画',
      complete: '模板流程已完成，卡片已解锁',
    };
    label.textContent = labels[flow.stage] + (running ? ' · 处理中…' : '');
    container.append(label);
    if (flow.stage === 'complete') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = running;
    button.textContent =
      flow.stage === 'image'
        ? '替换首图'
        : flow.stage === 'ready'
          ? '完成后续流程'
          : '继续当前步骤';
    button.onclick = () => {
      if (flow.stage === 'image') options.importImage(flow.imageId);
      else void run();
    };
    container.append(button);
  }
  return {
    canEditImage,
    locked,
    headChanged,
    render,
    run,
    get isBusy() {
      return running;
    },
  };
}
