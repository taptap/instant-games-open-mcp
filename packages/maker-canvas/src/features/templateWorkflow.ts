import type { CanvasDocument, CanvasNode, CanvasTemplateFlow } from '../contracts.js';
import { CanvasStoreError } from '../core/errors.js';
import { canvasReferences, canvasDependents, isCanvasNodeStale } from '../core/dependencies.js';
import { framePairSources } from './framePair.js';
import { mergeIconNeedsGeneration } from './mergeIcons.js';
import { selectedUiRecognition } from './uiRecognition.js';

export function canvasNeedsProcessing(
  document: CanvasDocument,
  node: CanvasNode,
  visiting = new Set<string>()
): boolean {
  if (
    node.uiRecognition?.enabled &&
    node.uiRecognition.inputRole !== 'design' &&
    !selectedUiRecognition(node)
  )
    return true;
  if (node.templatePending || mergeIconNeedsGeneration(node)) return true;
  if (node.videoInputMode === 'first_last_frame') {
    const { first, last } = framePairSources(document, node.id);
    if (!first?.assetPath || !last?.assetPath) return true;
    if (
      node.assetPath &&
      JSON.stringify(node.generation?.sourceImageIds) !== JSON.stringify([first.id, last.id])
    )
      return true;
  }
  if (visiting.has(node.id)) return true;
  if (isCanvasNodeStale(node, canvasReferences(document, node.id))) return true;
  visiting.add(node.id);
  const pending = canvasReferences(document, node.id).some((source) =>
    canvasNeedsProcessing(document, source, visiting)
  );
  visiting.delete(node.id);
  return pending;
}

export function invalidateCanvasDependents(document: CanvasDocument, nodeId: string): void {
  for (const node of canvasDependents(document, nodeId)) {
    if (
      node.sectionId &&
      !['section', 'model', 'model-views', 'resource-bundle', 'mark'].includes(node.type)
    )
      node.templatePending = true;
  }
}

export type TemplateOutputDecision =
  | { kind: 'reuse'; nodeId: string }
  | { kind: 'create' }
  | { kind: 'blocked'; message: string };

export function parseTemplateFlow(
  value: unknown,
  document: Pick<CanvasDocument, 'nodes' | 'edges'>
): CanvasTemplateFlow | undefined {
  if (value === undefined) return;
  const flow = value as CanvasTemplateFlow;
  const hasNode = (id: string | undefined, type: string) =>
    typeof id === 'string' && document.nodes.some((node) => node.id === id && node.type === type);
  if (
    !flow ||
    typeof flow !== 'object' ||
    !hasNode(flow.imageId, 'image') ||
    !hasNode(flow.videoId, 'video-source') ||
    !hasNode(flow.sequenceId, 'sequence') ||
    (flow.animationId !== undefined && !hasNode(flow.animationId, 'animation')) ||
    !['image', 'ready', 'video', 'sequence', 'animation', 'complete'].includes(flow.stage) ||
    !Number.isInteger(flow.duration) ||
    flow.duration < 4 ||
    flow.duration > 8 ||
    !document.edges.some(
      (edge) =>
        edge.from === flow.imageId && edge.to === flow.videoId && edge.kind === 'image-to-video'
    ) ||
    !document.edges.some(
      (edge) =>
        edge.from === flow.videoId && edge.to === flow.sequenceId && edge.kind === 'sequence-source'
    ) ||
    (flow.animationId !== undefined &&
      !document.edges.some(
        (edge) =>
          edge.from === flow.sequenceId &&
          edge.to === flow.animationId &&
          edge.kind === 'sequence-animation'
      ))
  ) {
    throw new CanvasStoreError('模板流程状态无效。', 400, 'INVALID_DOCUMENT');
  }
  return {
    imageId: flow.imageId,
    videoId: flow.videoId,
    sequenceId: flow.sequenceId,
    ...(flow.animationId ? { animationId: flow.animationId } : {}),
    duration: flow.duration,
    stage: flow.stage,
  };
}
