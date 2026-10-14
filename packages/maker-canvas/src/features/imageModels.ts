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
  const textFree =
    target?.uiRecognition?.inputRole === 'text-free' &&
    (section?.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015' ||
      (section?.templateCliOnly && section.templateSkills?.includes('maker-ui-bbox-workflow'))) &&
    referenceCount === 1;
  const prelayout =
    !target?.uiAtlasPrelayout &&
    sourceIds.some((id) => document.nodes.some((node) => node.id === id && node.uiAtlasPrelayout));
  return textFree || (prelayout && target && selectedUiAtlasPlan(document, target)?.nativeLayout)
    ? 'edit_image'
    : 'generate_image';
}
