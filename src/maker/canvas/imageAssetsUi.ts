import { createImageAssetsUiWithHost } from '../../../packages/maker-canvas/src/browser/imageAssetsUi.js';
import { applyImageAssets, imageAssetsBindingPlan } from './imageAssets.js';
import { openImageAtlasDialog } from './imageAtlasUi.js';
export { IMAGE_ASSETS_STYLES } from '../../../packages/maker-canvas/src/browser/imageAssetsUi.js';
export function createImageAssetsUi(
  options: Omit<
    Parameters<typeof createImageAssetsUiWithHost>[0],
    'applyImageAssets' | 'imageAssetsBindingPlan' | 'openImageAtlasDialog' | 'readSource'
  >
) {
  return createImageAssetsUiWithHost({
    ...options,
    applyImageAssets,
    imageAssetsBindingPlan,
    openImageAtlasDialog,
    async readSource(path, signal, failure) {
      const response = await fetch(options.store.mediaUrl(path), { signal });
      if (!response.ok) throw new Error(failure);
      return response.blob();
    },
  });
}
