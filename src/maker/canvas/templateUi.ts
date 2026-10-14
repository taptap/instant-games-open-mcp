import { createCanvasTemplateUiWithHost } from '../../../packages/maker-canvas/src/browser/templateUi.js';
export function createCanvasTemplateUi(
  options: Omit<Parameters<typeof createCanvasTemplateUiWithHost>[0], 'deliver'>
) {
  return createCanvasTemplateUiWithHost({
    ...options,
    async deliver(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
}
