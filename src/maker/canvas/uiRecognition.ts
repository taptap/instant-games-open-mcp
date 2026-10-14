export {
  bboxRecognitionElements,
  validateUiElements,
  uiRecognitionInputs,
  uiRecognitionPreview,
  setUiRecognitionMode,
  selectedUiExtraction,
  selectedUiRecognition,
  uiRecognitionSource,
  uiRecognitionNote,
  uiRecognitionStatus,
  uiExtractionPlan,
} from '../../../packages/maker-canvas/src/domain.js';
export type {
  UiElementCategory,
  UiElement,
  UiRecognitionResult,
  UiRecognitionSettings,
} from '../../../packages/maker-canvas/src/contracts.js';
export { UI_ELEMENT_CATEGORIES } from '../../../packages/maker-canvas/src/contracts.js';
export { validateUiRecognition } from './localMediaValidation.js';
