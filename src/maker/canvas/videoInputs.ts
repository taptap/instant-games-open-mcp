import { canvasReferences } from './dependencies.js';
import type { CanvasDocument, CanvasNode } from './model.js';

export function videoInputSources(
  document: CanvasDocument,
  node: CanvasNode & { draftSourceId?: string }
): CanvasNode[] {
  if (node.draftSourceId && !node.referenceInput)
    return document.nodes.filter(
      (source) => source.id === node.draftSourceId && source.type === 'image'
    );
  const sources = canvasReferences(document, node.id).filter((source) => source.type === 'image');
  const preferred = [
    ...new Set(
      [node.generation?.sourceImageId, ...(node.generation?.sourceImageIds || [])].filter(Boolean)
    ),
  ];
  const connected = document.edges.filter((edge) => edge.to === node.id).map((edge) => edge.from);
  const order = [...new Set(node.referenceInput ? connected : [...preferred, ...connected])];
  return sources.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
}

export function videoAttemptMatchesSources(
  attempt: {
    sourceImageId?: string;
    sourceImageIds?: string[];
    sourceImagePath?: string;
    sourceImagePaths?: string[];
  },
  sources: CanvasNode[]
): boolean {
  const ids = attempt.sourceImageIds?.length ? attempt.sourceImageIds : [attempt.sourceImageId];
  const paths = attempt.sourceImagePaths?.length
    ? attempt.sourceImagePaths
    : [attempt.sourceImagePath];
  return (
    ids.length === sources.length &&
    paths.length === sources.length &&
    sources.every((source, index) => source.id === ids[index] && source.assetPath === paths[index])
  );
}
