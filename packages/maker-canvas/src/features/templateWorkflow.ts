import type { CanvasDocument, CanvasNode, CanvasTemplateFlow } from '../contracts.js';
import { CanvasStoreError } from '../core/errors.js';
import {
  canvasReferences,
  canvasDependents,
  isCanvasNodeStale,
  isCanvasSourceCurrent,
} from '../core/dependencies.js';
import { framePairSources } from './framePair.js';
import { mergeIconNeedsGeneration } from './mergeIcons.js';
import { selectedUiRecognition } from './uiRecognition.js';

/** False for free saved images from a local edit, cutout or plain import: there is no saved request to re-run. */
export function canvasImageHasRegeneratePath(node: CanvasNode): boolean {
  return (
    node.type !== 'image' ||
    !node.assetPath ||
    Boolean(
      // Group members are re-run by the template executor (recognition, cutout, atlas) without a prompt.
      node.sectionId ||
        node.templatePending ||
        node.mergeIcons ||
        node.uiRecognition?.enabled ||
        node.uiAtlasPrelayout ||
        node.generation?.prompt?.trim() ||
        node.generationDraft?.prompt?.trim()
    )
  );
}

export function canvasNeedsProcessing(
  document: CanvasDocument,
  node: CanvasNode,
  visiting = new Set<string>()
): boolean {
  if (
    node.uiRecognition?.enabled &&
    !node.uiRecognition.optional &&
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
  const references = canvasReferences(document, node.id);
  if (canvasImageHasRegeneratePath(node)) {
    if (isCanvasNodeStale(node, references)) return true;
  } else if (
    // A fixed image cannot re-run, so an unwired (deleted) source must not leave it stuck pending.
    (node.sourceSnapshots?.length
      ? node.sourceSnapshots
      : node.sourceSnapshot
        ? [node.sourceSnapshot]
        : []
    ).some((snapshot) => {
      const source = references.find((item) => item.id === snapshot.nodeId);
      return source && !isCanvasSourceCurrent(snapshot, source);
    })
  )
    return true;
  visiting.add(node.id);
  const pending = references.some((source) => canvasNeedsProcessing(document, source, visiting));
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
