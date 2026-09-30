import type { CanvasNode } from './model.js';

export interface CanvasSourceSnapshot {
  nodeId: string;
  version: string;
}

export function metadataVersion(node: CanvasNode): string {
  if (node.type === 'sequence' || node.type === 'animation') {
    return node.frameSetInfo ? 'saved-frame-set' : 'missing-frame-set';
  }
  if (node.type === 'image' || node.type === 'video-source') {
    return node.generation?.attemptId || 'manual-asset';
  }
  return 'unsupported';
}

export function canvasNodeVersion(node: CanvasNode | undefined): string | undefined {
  if (!node) return undefined;
  return [node.type, node.assetPath || 'missing-asset', metadataVersion(node)].join('|');
}

export function snapshotCanvasSource(
  node: CanvasNode | undefined
): CanvasSourceSnapshot | undefined {
  const version = canvasNodeVersion(node);
  if (!node || !version) return undefined;
  return { nodeId: node.id, version };
}

export function isCanvasSourceCurrent(
  snapshot: CanvasSourceSnapshot | undefined,
  source: CanvasNode | undefined
): boolean {
  if (!snapshot || !source || snapshot.nodeId !== source.id) return false;
  return snapshot.version === canvasNodeVersion(source);
}

export function isCanvasNodeStale(node: CanvasNode, source: CanvasNode | undefined): boolean {
  return Boolean(node.sourceSnapshot) && !isCanvasSourceCurrent(node.sourceSnapshot, source);
}
