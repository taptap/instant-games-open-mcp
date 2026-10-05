import type { CanvasDocument, CanvasNode } from './model.js';

export function framePairSources(document: CanvasDocument, id: string) {
  const source = (kind: string) => {
    const edge = document.edges.find((edge) => edge.to === id && edge.kind === kind);
    return document.nodes.find((node) => node.id === edge?.from && node.type === 'image');
  };
  return { first: source('frame-first'), last: source('frame-last') };
}

export function videoFramePair(document: CanvasDocument, id: string): CanvasNode | undefined {
  return document.nodes.find(
    (node) => node.id === id && node.videoInputMode === 'first_last_frame'
  );
}

export function validateFramePairGraph(document: Pick<CanvasDocument, 'nodes' | 'edges'>): void {
  for (const video of document.nodes.filter((node) => node.videoInputMode === 'first_last_frame')) {
    const edges = document.edges.filter((edge) => edge.to === video.id);
    if (
      edges.some((edge) => !['frame-first', 'frame-last'].includes(edge.kind)) ||
      edges.length > 2 ||
      new Set(edges.map((edge) => edge.kind)).size !== edges.length ||
      new Set(edges.map((edge) => edge.from)).size !== edges.length
    )
      throw new Error('首尾帧只能分别设置一张图片，不能重复或增加其它参考图。');
  }
}

export function validateFramePairVideo(
  document: CanvasDocument,
  nodeId: string,
  mode: string,
  sourceIds: string[],
  referencePaths: string[]
): void {
  if (!videoFramePair(document, nodeId)) return;
  validateFramePairGraph(document);
  const { first, last } = framePairSources(document, nodeId);
  if (!first?.assetPath || !last?.assetPath || first.templatePending || last.templatePending)
    throw new Error('请先完成首帧和尾帧，两张图片均为必填。');
  if (
    mode !== 'first_last_frame' ||
    referencePaths.length ||
    sourceIds.length !== 2 ||
    sourceIds[0] !== first.id ||
    sourceIds[1] !== last.id
  )
    throw new Error('首尾帧固定按首帧、尾帧提交，只能使用这两张图片。');
}

export function setFramePairSource(
  document: CanvasDocument,
  videoId: string,
  role: 'first' | 'last',
  sourceId: string | undefined,
  createId: () => string
): void {
  if (!videoFramePair(document, videoId)) throw new Error('首尾帧视频不存在。');
  const kind = role === 'first' ? 'frame-first' : 'frame-last';
  const other = framePairSources(document, videoId)[role === 'first' ? 'last' : 'first'];
  const source = document.nodes.find((node) => node.id === sourceId);
  if (
    sourceId &&
    (!source || source.type !== 'image' || !source.assetPath || source.id === other?.id)
  )
    throw new Error('请选择另一张已保存的图片。');
  const reachable = new Set([videoId]);
  for (let index = 0; index < document.nodes.length; index++) {
    const before = reachable.size;
    for (const edge of document.edges) if (reachable.has(edge.from)) reachable.add(edge.to);
    if (before === reachable.size) break;
  }
  if (sourceId && reachable.has(sourceId)) throw new Error('参考关系不能形成循环。');
  const edges = document.edges.filter((edge) => !(edge.to === videoId && edge.kind === kind));
  if (sourceId) edges.push({ id: createId(), from: sourceId, to: videoId, kind });
  if (edges.length > 800) throw new Error('画布连线已达到容量限制。');
  document.edges = edges;
}
