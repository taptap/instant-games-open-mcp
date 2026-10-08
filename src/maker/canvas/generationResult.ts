import type { CanvasDocument, CanvasGenerationResult, CanvasNode } from './model.js';
import { snapshotCanvasSource } from './dependencies.js';

export function recordGeneratedVideo(
  document: CanvasDocument,
  imageId: string,
  videoId: string,
  generation: Omit<CanvasGenerationResult, 'sourceImageId'>,
  edgeId: string
): void {
  const image = document.nodes.find(
    (node) => node.id === imageId && node.type === 'image' && node.assetPath
  );
  const video = document.nodes.find(
    (node) => node.id === videoId && node.type === 'video-source' && node.assetPath
  );
  if (!image || !video) throw new Error('记录图生视频来源需要已保存的图片和视频结果。');
  if (video.generation?.sourceImageId && video.generation.sourceImageId !== imageId) {
    throw new Error('已生成视频不能改绑另一张首帧图；请创建新的生成结果。');
  }
  const sourceIds = Array.from(new Set([imageId, ...(generation.sourceImageIds || [])]));
  if (
    sourceIds.some(
      (id) =>
        !document.nodes.some((node) => node.id === id && node.type === 'image' && node.assetPath)
    )
  )
    throw new Error('记录图生视频来源需要已保存的图片。');
  video.generation = { ...generation, sourceImageId: imageId, sourceImageIds: sourceIds };
  video.sourceSnapshots = sourceIds.map(
    (id) => snapshotCanvasSource(document.nodes.find((node) => node.id === id))!
  );
  video.sourceSnapshot = video.sourceSnapshots[0];
  document.edges = document.edges.filter((edge) => edge.to !== videoId);
  sourceIds.forEach((id, index) => {
    document.edges.push({
      id: index === 0 ? edgeId : crypto.randomUUID(),
      from: id,
      to: videoId,
      kind: 'image-to-video',
    });
  });
}

export function renderGenerationResult(
  card: HTMLElement,
  node: CanvasNode,
  nodes: CanvasNode[]
): void {
  if (!node.generation) return;
  const label = document.createElement('div');
  label.className = 'generation-result-label';
  const sourceIds = Array.from(
    new Set([
      ...(node.generation.sourceImageId ? [node.generation.sourceImageId] : []),
      ...(node.generation.sourceImageIds || []),
    ])
  );
  const sources = sourceIds.map(
    (id) => nodes.find((item) => item.id === id)?.title || '来源卡已删除'
  );
  label.textContent =
    node.type === 'image'
      ? '生图结果'
      : '图生视频 · 来源图：' + (sources.join('、') || '来源卡已删除');
  const details = document.createElement('details');
  details.className = 'generation-result-details';
  const summary = document.createElement('summary');
  summary.textContent = '生成记录';
  const prompt = document.createElement('p');
  prompt.textContent = node.generation.prompt || '未记录提示词';
  details.append(summary, prompt);
  if (node.generation.taskId) {
    const task = document.createElement('small');
    task.textContent = '任务：' + node.generation.taskId;
    details.append(task);
  }
  card.append(label, details);
}
