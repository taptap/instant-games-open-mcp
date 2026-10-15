import { createCanvasModelUiWithHost } from '../../../packages/maker-canvas/src/browser/model3dUi.js';
export { CANVAS_MODEL_STYLES } from '../../../packages/maker-canvas/src/browser/model3dUi.js';
export function createCanvasModelUi(
  options: Omit<Parameters<typeof createCanvasModelUiWithHost>[0], 'thumbnailUrl' | 'previewOrigin'>
) {
  return createCanvasModelUiWithHost({
    ...options,
    thumbnailUrl(base, attemptId) {
      const url = new URL(base, location.href);
      url.searchParams.set('mode', 'thumbnail');
      url.searchParams.set('attemptId', attemptId);
      return url.href;
    },
    previewOrigin() {
      return location.origin;
    },
  });
}
