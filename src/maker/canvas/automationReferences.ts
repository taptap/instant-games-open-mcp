import { canvasDependents, canvasReferences } from './dependencies.js';
import type { CanvasDocument, CanvasEdge, CanvasNode } from './model.js';
import { canvasNeedsProcessing } from './templateWorkflow.js';
import { videoInputSources } from './videoInputs.js';

export interface CanvasReferencesInput {
  id: string;
  sourceIds: string[];
  includeSelf?: boolean;
}

export interface CanvasReferencesPlan {
  node: CanvasNode;
  edges: (Omit<CanvasEdge, 'id'> & { id?: string })[];
}

export function prepareCanvasReferences(
  document: CanvasDocument,
  input: CanvasReferencesInput
): CanvasReferencesPlan {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['id', 'sourceIds', 'includeSelf'].includes(key)) ||
    typeof input.id !== 'string' ||
    !input.id ||
    !Array.isArray(input.sourceIds) ||
    input.sourceIds.some((id) => typeof id !== 'string' || !id) ||
    (input.includeSelf !== undefined && typeof input.includeSelf !== 'boolean')
  )
    throw new Error('参考图输入无效。');

  const target = document.nodes.find((node) => node.id === input.id);
  if (!target || !['image', 'video', 'video-source'].includes(target.type))
    throw new Error('只能为图片或视频卡设置参考图。');
  if (new Set(input.sourceIds).size !== input.sourceIds.length)
    throw new Error('参考图片不能重复。');
  if (input.sourceIds.includes(target.id))
    throw new Error('不能把卡片连接到自身；引用当前图片请使用 includeSelf。');

  const includeSelf = input.includeSelf ?? false;
  if (includeSelf && (target.type !== 'image' || !target.assetPath))
    throw new Error('includeSelf 需要已保存的当前图片。');
  if (
    document.templateFlow?.videoId === target.id &&
    JSON.stringify(input.sourceIds) !==
      JSON.stringify(videoInputSources(document, target).map((source) => source.id))
  )
    throw new Error('旧版固定模板不支持修改视频来源，请添加新模板副本后设置参考图。');

  const parameters = target.generationDraft?.parameters || target.generation?.parameters;
  if (
    target.videoInputMode === 'first_last_frame' &&
    input.sourceIds.length !== 0 &&
    input.sourceIds.length !== 2
  )
    throw new Error('首尾帧需要按首帧、尾帧提供两张图片，或清空两者。');
  const count = input.sourceIds.length + Number(includeSelf);
  const mode =
    target.videoInputMode || parameters?.mode || (count === 1 ? 'first_frame' : 'select_mode');
  const limit =
    target.type === 'image'
      ? 14
      : mode === 'first_frame'
        ? 1
        : mode === 'first_last_frame'
          ? 2
          : parameters?.model === '2.5'
            ? 30
            : 9;
  if (count > limit) throw new Error('参考图片最多支持 ' + limit + ' 张。');

  const descendants = new Set(canvasDependents(document, target.id).map((node) => node.id));
  const sources = input.sourceIds.map((id) => {
    const source = document.nodes.find((node) => node.id === id);
    if (!source || source.type !== 'image' || !source.assetPath)
      throw new Error('参考来源必须是已保存的画布图片：' + id);
    if (descendants.has(id)) throw new Error('参考关系会形成循环：' + id);
    if (canvasNeedsProcessing(document, source))
      throw new Error('参考图片的上游尚未处理完成：' + id);
    return source;
  });

  const visited = new Set<string>();
  const upstream: CanvasNode[] = [...sources];
  for (let index = 0; index < upstream.length; index++) {
    const source = upstream[index];
    if (visited.has(source.id)) continue;
    visited.add(source.id);
    if (!source.assetPath) throw new Error('参考图片的上游尚无已保存素材：' + source.id);
    upstream.push(...canvasReferences(document, source.id));
  }

  const previous = document.edges.filter(
    (edge) =>
      edge.to === target.id &&
      ['image-variant', 'first-frame', 'image-to-video', 'frame-first', 'frame-last'].includes(
        edge.kind
      )
  );
  const kind =
    target.type === 'image'
      ? 'image-variant'
      : target.type === 'video'
        ? 'first-frame'
        : 'image-to-video';
  const edges: CanvasReferencesPlan['edges'] = [
    ...document.edges.filter((edge) => !previous.includes(edge)).map((edge) => ({ ...edge })),
    ...sources.map((source, index) => ({
      id: previous.find((edge) => edge.from === source.id)?.id,
      from: source.id,
      to: target.id,
      kind: (target.videoInputMode === 'first_last_frame'
        ? index === 0
          ? 'frame-first'
          : 'frame-last'
        : kind) as CanvasEdge['kind'],
    })),
  ];
  if (edges.length > 800) throw new Error('画布连线已达到容量限制。');
  const node: CanvasNode = JSON.parse(JSON.stringify(target));
  node.referenceInput = { includeSelf };
  if (node.generation) node.generation.referenceImagePaths = [];
  if (node.generationDraft) delete node.generationDraft.sourceImageId;
  if (node.sectionId) node.templatePending = true;
  return { node, edges };
}

export function applyCanvasReferences(
  document: CanvasDocument,
  plan: CanvasReferencesPlan,
  createId: () => string
): CanvasNode {
  const target = document.nodes.find((node) => node.id === plan.node.id);
  if (!target) throw new Error('参考图目标卡片不存在。');
  const edges = plan.edges.map((edge) => ({ ...edge, id: edge.id || createId() }));
  const node: CanvasNode = JSON.parse(JSON.stringify(plan.node));
  Object.assign(target, node);
  document.edges = edges;
  return target;
}
