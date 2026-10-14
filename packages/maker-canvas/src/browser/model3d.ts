import type { CanvasDocument, CanvasNode } from '../contracts.js';

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
