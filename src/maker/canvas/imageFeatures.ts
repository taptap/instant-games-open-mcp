import type { CanvasNode } from './model.js';

export type ImageFeatureId =
  | 'ui-recognition'
  | 'ui-extraction'
  | 'ui-annotation'
  | 'merge-icons'
  | 'ui-atlas';
export type ImageFeatureAction = 'recognize-ui' | 'view-bbox';

export interface ImageFeatureDefinition {
  id: ImageFeatureId;
  field:
    | 'uiRecognition'
    | 'uiExtraction'
    | 'uiAnnotation'
    | 'mergeIcons'
    | 'uiAtlasPlan'
    | 'uiAtlasPrelayout'
    | 'uiAtlasGroup';
  actions: readonly ImageFeatureAction[];
  blocksOutpaint?: boolean;
}

export const IMAGE_FEATURES: readonly ImageFeatureDefinition[] = [
  { id: 'ui-atlas', field: 'uiAtlasPrelayout', actions: [], blocksOutpaint: true },
  { id: 'ui-atlas', field: 'uiAtlasGroup', actions: [], blocksOutpaint: true },
  { id: 'ui-atlas', field: 'uiAtlasPlan', actions: [], blocksOutpaint: true },
  { id: 'ui-recognition', field: 'uiRecognition', actions: ['recognize-ui', 'view-bbox'] },
  { id: 'ui-extraction', field: 'uiExtraction', actions: [] },
  { id: 'ui-annotation', field: 'uiAnnotation', actions: [] },
  { id: 'merge-icons', field: 'mergeIcons', actions: [], blocksOutpaint: true },
];

export function imageFeatures(node: CanvasNode): readonly ImageFeatureDefinition[] {
  return node.type === 'image'
    ? IMAGE_FEATURES.filter((feature) => node[feature.field] !== undefined)
    : [];
}

export function hasImageFeature(node: CanvasNode, id: ImageFeatureId): boolean {
  return imageFeatures(node).some((feature) => feature.id === id);
}

export function imageAllowsOutpaint(node: CanvasNode): boolean {
  return node.type === 'image' && !imageFeatures(node).some((feature) => feature.blocksOutpaint);
}

export function resetImageFeatureCopy(node: CanvasNode, template: boolean): void {
  if (!hasImageFeature(node, 'ui-recognition')) return;
  const settings = node.uiRecognition!;
  delete settings.pendingId;
  if (template) {
    settings.results = [];
    delete settings.selectedId;
  }
}
