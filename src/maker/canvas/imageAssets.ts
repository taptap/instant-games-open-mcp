import type { ImageAssetsInfo } from '../../../packages/maker-canvas/src/contracts.js';
export type { ImageAssetsInfo } from '../../../packages/maker-canvas/src/contracts.js';
import type { CanvasDocument, CanvasNode } from './model.js';
import {
  imageAssetsBindingPlanStructure,
  applyImageAssetsToDocument,
} from '../../../packages/maker-canvas/src/domain.js';
import { collectImageAssetEntriesFromReader } from '../../../packages/maker-canvas/src/browser.js';
import { validateImageAssetsInfo } from './localMediaValidation.js';
export { validateImageAssetsInfo } from './localMediaValidation.js';
import { createCanvasZip } from './zipArchive.js';
import { validateUiAtlasPlan, type UiAtlasPlan } from './uiAssetBindings.js';

export function imageAssetsBindingPlan(
  source: CanvasNode,
  info: ImageAssetsInfo
): UiAtlasPlan | undefined {
  if (source.generation?.uiAtlasPlan) validateUiAtlasPlan(source.generation.uiAtlasPlan);
  return imageAssetsBindingPlanStructure(source, info);
}

export function applyImageAssets(
  document: CanvasDocument,
  sourceId: string,
  info: ImageAssetsInfo,
  nodeId: string,
  edgeId: string,
  targetId?: string
): CanvasNode {
  const saved = validateImageAssetsInfo(info);
  const source = document.nodes.find((node) => node.id === sourceId && node.type === 'image');
  if (source) imageAssetsBindingPlan(source, saved);
  return applyImageAssetsToDocument(document, sourceId, saved, nodeId, edgeId, targetId);
}

export async function createImageAssetsZip(
  info: ImageAssetsInfo,
  mediaUrl: (path: string) => string
): Promise<Blob> {
  return createCanvasZip(await collectImageAssetEntries(info, mediaUrl));
}

export async function collectImageAssetEntries(
  info: ImageAssetsInfo,
  mediaUrl: (path: string) => string,
  budget = { bytes: 0 },
  readBlob?: (path: string) => Promise<Blob>
): Promise<Array<{ name: string; blob: Blob }>> {
  const saved = validateImageAssetsInfo(info);
  return collectImageAssetEntriesFromReader(
    saved,
    readBlob ||
      (async (path, name) => {
        const response = await fetch(mediaUrl(path));
        if (!response.ok) throw new Error('素材读取失败，未导出文件：' + name);
        return response.blob();
      }),
    budget
  );
}
