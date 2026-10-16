import type { CanvasDocument } from '../contracts.js';
import { selectedUiAtlasPlan } from './uiAssetBindings.js';

/** Match the existing Maker operation selection for text removal and native atlases. */
export function canvasImageTool(
  document: CanvasDocument,
  targetId: string | undefined,
  sourceIds: string[],
  referenceCount: number
): 'generate_image' | 'edit_image' {
  const target = document.nodes.find((node) => node.id === targetId);
  const section = document.nodes.find((node) => node.id === target?.sectionId);
  const textFree = target?.uiRecognition?.inputRole === 'text-free' && referenceCount === 1;
  const backgroundPreparation =
    section?.templateId === '7e1cb6ad-732f-4dc3-a951-000000000013' &&
    referenceCount === 1 &&
    !target?.uiAtlasGroup &&
    sourceIds.some((id) =>
      document.nodes.some((node) => node.id === id && node.uiRecognition?.inputRole === 'text-free')
    ) &&
    document.edges.some((edge) => edge.from === targetId && edge.kind === 'image-variant');
  const prelayout =
    !target?.uiAtlasPrelayout &&
    sourceIds.some((id) => document.nodes.some((node) => node.id === id && node.uiAtlasPrelayout));
  return textFree ||
    backgroundPreparation ||
    (prelayout && target && selectedUiAtlasPlan(document, target)?.nativeLayout)
    ? 'edit_image'
    : 'generate_image';
}
