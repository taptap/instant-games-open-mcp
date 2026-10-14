import { createCanvasAutomationUiWithHost } from '../../../packages/maker-canvas/src/browser/automationUi.js';
import { prepareCanvasNodeUpdates } from './automation.js';
export function createCanvasAutomationUi(
  options: Omit<Parameters<typeof createCanvasAutomationUiWithHost>[0], 'prepareNodeUpdates'>
) {
  return createCanvasAutomationUiWithHost({
    ...options,
    prepareNodeUpdates: prepareCanvasNodeUpdates,
  });
}
