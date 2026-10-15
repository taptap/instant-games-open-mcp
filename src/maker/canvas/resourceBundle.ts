import { validateResourceBundleStructure } from '../../../packages/maker-canvas/src/features/resourceBundle.js';
export {
  resourceBundleMembers,
  resourceBundleOwner,
} from '../../../packages/maker-canvas/src/features/resourceBundle.js';
export {
  addResourceBundle,
  renderResourceBundle,
} from '../../../packages/maker-canvas/src/browser/resourceBundleUi.js';
import type { CanvasDocument, CanvasNode } from './model.js';
import { validateImageAssetsInfo, imageAssetsBindingPlan } from './imageAssets.js';
import { createCanvasZip } from './zipArchive.js';
import { validateUiBbox } from './uiBbox.js';

export { uiDataHash } from '../../../packages/maker-canvas/src/browser/resourceBundle.js';
import {
  uiBundleManifestWithValidation,
  resourceBundleEntriesFromReader,
} from '../../../packages/maker-canvas/src/browser/resourceBundle.js';
export function uiBundleManifest(
  document: CanvasDocument,
  members: CanvasNode[],
  entries: Array<{ name: string; blob: Blob }>
) {
  return uiBundleManifestWithValidation(document, members, entries, {
    validateImageAssetsInfo,
    imageAssetsBindingPlan,
    validateUiBbox,
  });
}

export function validateResourceBundle(
  document: CanvasDocument,
  sectionId: string,
  maxFiles = 122,
  memberId?: string
): CanvasNode[] {
  return validateResourceBundleStructure(document, sectionId, maxFiles, memberId, {
    validateImageAssetsInfo,
    imageAssetsBindingPlan,
    validateUiBbox,
  });
}

export function resourceBundleEntries(
  document: CanvasDocument,
  sectionId: string,
  mediaUrl: (path: string) => string,
  progress?: (message: string) => void,
  readBlob?: (path: string) => Promise<Blob>,
  maxFiles = 122
): Promise<Array<{ name: string; blob: Blob }>> {
  return resourceBundleEntriesFromReader(
    document,
    sectionId,
    {
      validation: { validateImageAssetsInfo, imageAssetsBindingPlan, validateUiBbox },
      referenceEntryName: (path) => path,
      readSource:
        readBlob ||
        (async (path, failure) => {
          const response = await fetch(mediaUrl(path));
          if (!response.ok) throw new Error(failure);
          return response.blob();
        }),
    },
    progress,
    maxFiles
  );
}

export async function createResourceBundleZip(
  document: CanvasDocument,
  sectionId: string,
  mediaUrl: (path: string) => string,
  progress?: (message: string) => void
): Promise<Blob> {
  return createCanvasZip(await resourceBundleEntries(document, sectionId, mediaUrl, progress));
}
