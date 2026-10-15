import type { CanvasDocument, CanvasNode } from '../contracts.js';
import type { CanvasDocumentStore } from './store.js';

/** Only refresh this export's inputs; unrelated missing media must not block delivery. */
export function canvasMediaSources(document: CanvasDocument, node?: CanvasNode): CanvasNode[] {
  if (!node) return document.nodes;
  const ids = new Set([node.id]);
  if (node.type === 'section')
    for (const item of document.nodes) if (item.sectionId === node.id) ids.add(item.id);
  const queue = [...ids];
  for (let i = 0; i < queue.length; i++) {
    for (const edge of document.edges) {
      if (edge.to !== queue[i] || ids.has(edge.from)) continue;
      ids.add(edge.from);
      queue.push(edge.from);
    }
  }
  return document.nodes.filter((item) => ids.has(item.id));
}

/** Capture only before new processing; never bless legacy results with today's source identity. */
export async function refreshCanvasMedia(
  document: CanvasDocument,
  store: Pick<CanvasDocumentStore, 'mediaVersions'>,
  nodes: CanvasNode[] = document.nodes,
  capture = false
): Promise<boolean> {
  if (!store.mediaVersions) return false;
  const sources = nodes.filter((node) => node.assetPath && node.type !== 'model');
  const paths = [...new Set(sources.map((node) => node.assetPath!))];
  if (!paths.length) return false;
  const before = sources.map((node) => ({ node, path: node.assetPath! }));
  const versions = await store.mediaVersions(paths);
  for (const { node, path } of before) {
    if (!document.nodes.includes(node) || node.assetPath !== path)
      throw new Error('素材在读取期间发生变化，请重新操作。');
    const version = versions[path];
    if (!version) throw new Error('未取得素材内容版本，请刷新后重试。');
  }
  let changed = false;
  for (const { node, path } of before) {
    const version = versions[path];
    if ((capture || node.assetVersion?.path === path) && node.assetVersion?.version !== version) {
      node.assetVersion = { path, version };
      changed = true;
    }
  }
  return changed;
}
