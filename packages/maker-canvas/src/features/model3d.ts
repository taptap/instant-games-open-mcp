import type { CanvasModelQuality, CanvasModelAttempt } from '../contracts.js';
export type { CanvasModelQuality, CanvasModelAttempt } from '../contracts.js';
import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { canvasNodeVersion } from '../core/dependencies.js';

export function canvasModelInput(document: CanvasDocument, id: string) {
  const target = document.nodes.find((node) => node.id === id);
  const source = (node: CanvasNode, kind: string, type: string) => {
    const edges = document.edges.filter((edge) => edge.to === node.id && edge.kind === kind);
    const result = edges.length === 1 && document.nodes.find((node) => node.id === edges[0].from);
    if (!result || result.type !== type)
      throw new Error('模型卡片缺少唯一且匹配的上游，请使用基础模型模板。');
    return result;
  };
  if (!target || !['model', 'model-views'].includes(target.type))
    throw new Error('请选择多视图或模型卡片。');
  const views = target.type === 'model' ? source(target, 'views-model', 'model-views') : target;
  const character = source(views, 'character-views', 'image');
  return {
    target,
    views,
    character,
    quality: views.modelQuality || ('balanced' as CanvasModelQuality),
  };
}

export function canvasModelIsCurrent(
  document: CanvasDocument,
  attempt: CanvasModelAttempt
): boolean {
  try {
    const input = canvasModelInput(document, attempt.nodeId);
    return (
      input.character.id === attempt.sourceId &&
      canvasNodeVersion(input.character) === attempt.sourceVersion &&
      !input.character.templatePending &&
      input.quality === attempt.quality
    );
  } catch {
    return false;
  }
}

export function canvasModelGroup(document: CanvasDocument, sectionId?: string): boolean {
  return Boolean(
    sectionId &&
      document.nodes.some(
        (node) =>
          node.sectionId === sectionId && (node.type === 'model' || node.type === 'model-views')
      )
  );
}
