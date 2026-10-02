import type { CanvasDocument, CanvasNode } from './model.js';
import { snapshotCanvasSource } from './dependencies.js';

export function applyLocalImageResult(
  document: CanvasDocument,
  source: Readonly<CanvasNode>,
  path: string,
  targetId: string | undefined,
  createId: () => string
): CanvasNode {
  const saved = document.nodes.find((node) => node.type === 'image' && node.assetPath === path);
  if (saved) return saved;
  const current = document.nodes.find((node) => node.id === source.id);
  if (!current || current.assetPath !== source.assetPath)
    throw new Error('来源图片已变更，未覆盖卡片；本地结果仍保留。');
  let target = targetId ? document.nodes.find((node) => node.id === targetId) : undefined;
  if (targetId && (!target || target.type !== 'image')) throw new Error('目标图片卡已变更。');
  if (!target) {
    target = {
      id: createId(),
      type: 'image',
      title: source.title + ' · 本地编辑',
      x: source.x + source.width + 48,
      y: source.y,
      width: source.width,
      height: source.height,
      ...(source.sectionId ? { sectionId: source.sectionId } : {}),
    };
    document.nodes.push(target);
  }
  target.assetPath = path;
  delete target.templatePending;
  if (target.generation) {
    delete target.generation.attemptId;
    delete target.generation.taskId;
  }
  if (target.id !== source.id) {
    target.sourceSnapshot = snapshotCanvasSource(current);
    target.sourceSnapshots = target.sourceSnapshot ? [target.sourceSnapshot] : undefined;
    if (!document.edges.some((edge) => edge.from === source.id && edge.to === target!.id))
      document.edges.push({
        id: createId(),
        from: source.id,
        to: target.id,
        kind: 'image-variant',
      });
  }
  return target;
}
