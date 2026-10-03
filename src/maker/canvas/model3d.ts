import type { CanvasDocument, CanvasNode } from './model.js';
import { canvasNodeVersion } from './dependencies.js';

export type CanvasModelQuality = 'fast' | 'balanced' | 'high_quality';
export interface CanvasModelAttempt {
  id: string;
  canvasId: string;
  nodeId: string;
  sourceId: string;
  sourceVersion: string;
  quality: CanvasModelQuality;
  status: 'running' | 'pending' | 'review' | 'completed' | 'failed' | 'unknown';
  phase: 'views' | 'model';
  assetId?: string;
  taskId?: string;
  stepId?: string;
  reviewId?: string;
  previews: Array<{ view: string; path: string }>;
  modelPath?: string;
  modelDirectory?: string;
  format?: string;
  error?: string;
  retrySafe?: boolean;
  createdAt: string;
  updatedAt: string;
}

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

export function appendCanvasModelNode(
  document: CanvasDocument,
  type: 'model' | 'model-views',
  sourceId: string
) {
  const source = document.nodes.find((node) => node.id === sourceId);
  if (!source || source.type !== (type === 'model' ? 'model-views' : 'image'))
    throw new Error('多视图需要角色图片，模型需要多视图卡片。');
  const node: CanvasNode = {
    id: crypto.randomUUID(),
    type,
    title: type === 'model' ? '3D 模型' : '多视图确认',
    x: source.x + source.width + 80,
    y: source.y,
    width: type === 'model' ? 300 : 480,
    height: 360,
    ...(source.sectionId ? { sectionId: source.sectionId } : {}),
    ...(type === 'model-views' ? { modelQuality: 'balanced' as const } : {}),
  };
  document.nodes.push(node);
  document.edges.push({
    id: crypto.randomUUID(),
    from: source.id,
    to: node.id,
    kind: type === 'model' ? 'views-model' : 'character-views',
  });
  return node;
}
