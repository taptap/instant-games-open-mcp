import {
  createCanvasGenerationUiWithHost,
  type CanvasGenerationUiOptions as SharedOptions,
} from '../../../packages/maker-canvas/src/browser/generationUi.js';
import { detectUiCutoutColor } from './uiCutout.js';
export { imageEditSources } from '../../../packages/maker-canvas/src/browser/generationUi.js';
export type { CanvasWorkflowEdit } from '../../../packages/maker-canvas/src/browser/generationUi.js';
export type CanvasGenerationUiOptions = Omit<SharedOptions, 'detectUiCutoutColor'>;
export function createCanvasGenerationUi(options: CanvasGenerationUiOptions) {
  return createCanvasGenerationUiWithHost({ ...options, detectUiCutoutColor });
}
