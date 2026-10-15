import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { snapshotCanvasSource } from '../core/dependencies.js';

export function appendAnimation(
  document: CanvasDocument,
  sourceId: string,
  nodeId: string,
  edgeId: string,
  targetId?: string
): CanvasNode | undefined {
  const source = document.nodes.find((node) => node.id === sourceId && node.type === 'sequence');
  if (!source?.assetPath || !source.frameSetInfo) return;
  if (targetId) {
    const target = document.nodes.find((node) => node.id === targetId && node.type === 'animation');
    if (
      !target ||
      !document.edges.some(
        (edge) =>
          edge.kind === 'sequence-animation' && edge.from === sourceId && edge.to === targetId
      )
    )
      return;
    if (!refreshAnimationFromSource(document, targetId)) return;
    return target;
  }
  const node: CanvasNode = {
    id: nodeId,
    type: 'animation',
    title: '序列帧动画',
    ...(source.sectionId ? { sectionId: source.sectionId } : {}),
    x: source.x + source.width + 64,
    y: source.y,
    width: 280,
    height: 300,
    assetPath: source.assetPath,
    frameSetInfo: {
      ...source.frameSetInfo,
      frames: source.frameSetInfo.frames.map((frame) => ({ ...frame })),
    },
    sourceSnapshot: snapshotCanvasSource(source),
  };
  document.nodes.push(node);
  document.edges.push({ id: edgeId, from: source.id, to: node.id, kind: 'sequence-animation' });
  return node;
}

export function refreshAnimationFromSource(document: CanvasDocument, animationId: string): boolean {
  const animation = document.nodes.find(
    (node) => node.id === animationId && node.type === 'animation'
  );
  const edge = document.edges.find(
    (item) => item.kind === 'sequence-animation' && item.to === animationId
  );
  const source =
    edge && document.nodes.find((node) => node.id === edge.from && node.type === 'sequence');
  if (!animation || !source?.assetPath || !source.frameSetInfo) return false;
  animation.assetPath = source.assetPath;
  animation.frameSetInfo = {
    ...source.frameSetInfo,
    frames: source.frameSetInfo.frames.map((frame) => ({ ...frame })),
  };
  animation.sourceSnapshot = snapshotCanvasSource(source);
  delete animation.templatePending;
  return true;
}
