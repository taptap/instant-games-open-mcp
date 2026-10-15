import { deliverCanvasExport } from './exportDelivery.js';
import type {
  CanvasExportDelivery,
  CanvasExportResult,
} from '../../../packages/maker-canvas/src/browser/exportDelivery.js';
import type { CanvasDocument, CanvasNode } from './model.js';
import { canvasExportIdentity, nextCanvasExportCode } from './exportNaming.js';
import { openImageAtlasDialog } from './imageAtlasUi.js';
import { createImageAssetsZip } from './imageAssets.js';
import { openGameUiHandoff } from './uiWorkflowHandoff.js';
import { createResourceBundleZip, validateResourceBundle } from './resourceBundle.js';

export { canvasExportFormats } from '../../../packages/maker-canvas/src/features/resourceExport.js';
import { createCanvasResourceExportWithHost } from '../../../packages/maker-canvas/src/browser/resourceExport.js';

import { downloadCanvasResourceWithHost } from '../../../packages/maker-canvas/src/browser/resourceDownload.js';
export async function downloadCanvasResource(
  node: CanvasNode,
  format: string,
  mediaUrl: (path: string) => string,
  progress?: (message: string) => void,
  identity = canvasExportIdentity(undefined, node),
  loop = true,
  sink?: (blob: Blob, filename: string) => Promise<void>,
  current?: CanvasDocument,
  deliver: CanvasExportDelivery = deliverCanvasExport
): Promise<CanvasExportResult> {
  return downloadCanvasResourceWithHost(
    node,
    format,
    {
      mediaUrl,
      deliver,
      nextCode: nextCanvasExportCode,
      validateBundle: validateResourceBundle,
      createBundle: (document, id, notify) =>
        createResourceBundleZip(document, id, mediaUrl, notify),
      createImageAssets: (info) => createImageAssetsZip(info, mediaUrl),
      readSource: async (path, failure) => {
        const response = await fetch(mediaUrl(path));
        if (!response.ok) throw new Error(failure);
        return response.blob();
      },
    },
    progress,
    identity,
    loop,
    sink,
    current
  );
}

export function createCanvasResourceExport(
  options: Omit<
    Parameters<typeof createCanvasResourceExportWithHost>[0],
    'downloadResource' | 'openHandoff' | 'openAtlas'
  >
) {
  return createCanvasResourceExportWithHost({
    ...options,
    downloadResource: downloadCanvasResource,
    openHandoff: openGameUiHandoff,
    openAtlas: (node, mediaUrl) => openImageAtlasDialog(node, mediaUrl, undefined, options.deliver),
  });
}
