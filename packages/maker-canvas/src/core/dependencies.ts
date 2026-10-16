import type { CanvasDocument, CanvasNode, CanvasSourceSnapshot } from '../contracts.js';

export function metadataVersion(node: CanvasNode): string {
  if (node.type === 'sequence' || node.type === 'animation') {
    return node.frameSetInfo ? 'saved-frame-set' : 'missing-frame-set';
  }
  if (node.type === 'image' || node.type === 'video-source') {
    const asset =
      (node.generation?.attemptId || 'manual-asset') +
      (node.generation?.uiAtlasPlan
        ? '|uiAtlas:' +
          JSON.stringify([
            node.generation.uiAtlasPlan.bbox.design.sha256,
            node.generation.uiAtlasPlan.bbox.cutSource.sha256,
            node.generation.uiAtlasPlan.grid,
            node.generation.uiAtlasPlan.slots.map((slot) => [
              slot.elementIds,
              slot.state,
              slot.role,
            ]),
          ]) +
          (node.generation.uiAtlasPlan.nativeLayout
            ? '|nativeLayout:' + JSON.stringify(node.generation.uiAtlasPlan.nativeLayout)
            : '')
        : '');
    return node.uiRecognition &&
      !node.uiRecognition.optional &&
      node.uiRecognition.inputRole !== 'design'
      ? asset +
          '|recognition:' +
          (node.uiRecognition.enabled ? node.uiRecognition.selectedId || 'pending' : 'off')
      : asset;
  }
  return 'unsupported';
}

export function canvasNodeVersion(node: CanvasNode | undefined): string | undefined {
  if (!node) return undefined;
  const version = [node.type, node.assetPath || 'missing-asset', metadataVersion(node)].join('|');
  return node.assetVersion && node.assetVersion.path === node.assetPath
    ? version + '|content:' + node.assetVersion.version
    : version;
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

export function isCanvasNodeStale(
  node: CanvasNode,
  source: CanvasNode | CanvasNode[] | undefined
): boolean {
  if (Array.isArray(source)) {
    const snapshots = node.sourceSnapshots?.length
      ? node.sourceSnapshots
      : node.sourceSnapshot
        ? [node.sourceSnapshot]
        : [];
    if (node.sourceSnapshots?.length && snapshots.length !== source.length) return true;
    return snapshots.some(
      (snapshot) =>
        !isCanvasSourceCurrent(
          snapshot,
          source.find((item) => item.id === snapshot.nodeId)
        )
    );
  }
  return Boolean(node.sourceSnapshot) && !isCanvasSourceCurrent(node.sourceSnapshot, source);
}

export function canvasReferences(document: CanvasDocument, nodeId: string): CanvasNode[] {
  const ids = new Set(document.edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from));
  return document.nodes.filter((node) => ids.has(node.id));
}

export function canvasDependents(document: CanvasDocument, nodeId: string): CanvasNode[] {
  const visited = new Set([nodeId]);
  const queue = [nodeId];
  for (let index = 0; index < queue.length; index++) {
    for (const edge of document.edges) {
      if (edge.from !== queue[index] || visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push(edge.to);
    }
  }
  return queue.slice(1).flatMap((id) => document.nodes.filter((node) => node.id === id));
}
