import { createCanvasModelUiWithHost } from '../../../packages/maker-canvas/src/browser/model3dUi.js';
export { CANVAS_MODEL_STYLES } from '../../../packages/maker-canvas/src/browser/model3dUi.js';
export function createCanvasModelUi(
  options: Omit<
    Parameters<typeof createCanvasModelUiWithHost>[0],
    'thumbnailUrl' | 'previewOrigin' | 'deliver'
  >
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
    async deliver(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
  });
}
