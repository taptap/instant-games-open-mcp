import { createCanvasTemplateUiWithHost } from '../../../packages/maker-canvas/src/browser/templateUi.js';
export function createCanvasTemplateUi(
  options: Parameters<typeof createCanvasTemplateUiWithHost>[0]
) {
  return createCanvasTemplateUiWithHost(options);
}
