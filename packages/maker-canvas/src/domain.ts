export {
  metadataVersion,
  canvasNodeVersion,
  snapshotCanvasSource,
  isCanvasSourceCurrent,
  isCanvasNodeStale,
  canvasReferences,
  canvasDependents,
} from './core/dependencies.js';

export { canvasWireGeometry, canvasWirePath } from './core/wirePath.js';
export type { CanvasWireGeometry } from './core/wirePath.js';

export { nodeOf, removeNodes, saveAcknowledgement, nodesInMarquee } from './core/edit.js';

export {
  framePairSources,
  videoFramePair,
  validateFramePairGraph,
  validateFramePairVideo,
  setFramePairSource,
} from './features/framePair.js';

export { videoInputSources, videoAttemptMatchesSources } from './features/videoInputs.js';

export {
  IMAGE_FEATURES,
  imageFeatures,
  hasImageFeature,
  imageAllowsOutpaint,
  resetImageFeatureCopy,
} from './features/imageFeatures.js';
export type {
  ImageFeatureId,
  ImageFeatureAction,
  ImageFeatureDefinition,
} from './features/imageFeatures.js';

export {
  IMAGE_OUTPUT_RATIOS,
  IMAGE_COMMON_RATIOS,
  imageRatioInfo,
  resolveImageSize,
  canvasOriginalImage,
  imageResultWarning,
} from './features/imageSizing.js';

export {
  MAX_SEQUENCE_FRAMES,
  MAX_SEQUENCE_SIDE,
  MAX_SEQUENCE_SOURCE_SIDE,
  MAX_SEQUENCE_PIXEL_BUDGET,
  MAX_ATLAS_SIDE,
  DEFAULT_SEQUENCE_SIDE,
  DEFAULT_SEQUENCE_FPS,
  DEFAULT_SEQUENCE_DURATION,
  defaultSequenceSettings,
  estimateSequenceFrameCount,
  maxSequenceFrameCount,
  maxSequenceInputFrameCount,
  signatureSimilarity,
  duplicateIndicesFromSignatures,
} from './features/sequenceModel.js';

export {
  validateMergeIcons,
  mergeIconPrompt,
  mergeIconGrid,
  mergeIconNeedsGeneration,
  configureMergeIcons,
} from './features/mergeIcons.js';

export {
  validateBboxRect,
  validateBboxImageStructure,
  // Compatibility name: structure validation only; hosts validate media access.
  validateBboxImageStructure as validateBboxImage,
  validateCutElements,
  validateBboxTexts,
  parseUiScreenName,
  scaleCutElements,
  validateUiBboxStructure,
  // Compatibility name: structure validation only; hosts validate media access.
  validateUiBboxStructure as validateUiBbox,
} from './features/uiBbox.js';

export { createVideoPrompts } from './features/videoPrompts.js';
export type { VideoPromptInput } from './features/videoPrompts.js';

export { videoTaskTiming } from './features/videoTaskTiming.js';

export {
  CANVAS_MARK_COLORS,
  CANVAS_MARK_MIN,
  CANVAS_MARK_MAX,
  MARK_POINTS,
  MARK_DIRECTIONS,
  validateCanvasMark,
  optionalMarkPoint,
  canvasMarkEnds,
  canvasMarkMoveEndpoint,
  canvasMarkResizeEdge,
  markNumber,
  canvasMarkFromInput,
} from './core/marks.js';

export { imageCardSize, fitImageCard, imageSizeLabel } from './features/imageInfo.js';

export {
  bboxRecognitionElements,
  validateUiElements,
  validateUiRecognitionStructure,
  // Compatibility name: structure validation only; hosts validate media access.
  validateUiRecognitionStructure as validateUiRecognition,
  uiRecognitionInputs,
  uiRecognitionPreview,
  setUiRecognitionMode,
  selectedUiExtraction,
  selectedUiRecognition,
  uiRecognitionSource,
  uiRecognitionNote,
  uiRecognitionStatus,
  uiExtractionPlan,
} from './features/uiRecognition.js';

export {
  atlasLayoutError,
  assignAtlasCellsByCenter,
  alignAtlasCells,
} from './features/atlasAlignment.js';
export type { AtlasAlignedCell } from './features/atlasAlignment.js';

export { validateAtlasCrops, findAtlasContentRegions } from './features/atlasContent.js';
export type { ImageAtlasCutSettings } from './features/atlasContent.js';

export { createFrameCollection } from './features/frameCollection.js';

export { applyLocalImageResult } from './features/localImageResult.js';

export {
  imageAtlasRegions,
  imageAtlasManifest,
  imageAtlasInstructions,
} from './features/imageAtlas.js';

export { CanvasStoreError } from './core/errors.js';

export {
  validateUiAtlasGroup,
  uiAtlasElementGroup,
  UI_ATLAS_MAX_EDGE,
  UI_ATLAS_MAX_CELLS,
  uiAtlasElementSlots,
  uiAtlasSheet,
  uiBatchAtlasPlans,
  uiBatchAtlasPlan,
  uiNativeAtlasPlans,
  uiNativeArtTextPlan,
  uiNativeSlotPlans,
  uiNativeAtlasPrompt,
  uiBatchAtlasPrompt,
  validateUiAtlasPlanStructure,
  // Compatibility name: structure validation only; hosts validate media access.
  validateUiAtlasPlanStructure as validateUiAtlasPlan,
  uiWorkflowAtlasPlans,
  selectedUiAtlasPlan,
  uiAtlasOrderPrompt,
  uiBindingContentRect,
} from './features/uiAssetBindings.js';

export {
  canvasNeedsProcessing,
  invalidateCanvasDependents,
  parseTemplateFlow,
} from './features/templateWorkflow.js';
export type { TemplateOutputDecision } from './features/templateWorkflow.js';
export {
  validateImageAssetsInfoStructure,
  imageAssetsBindingPlanStructure,
  applyImageAssetsToDocument,
} from './features/imageAssets.js';
export { isGameUiResource } from './features/uiWorkflow.js';
export type { UiCutoutColor } from './features/uiCutout.js';
export {
  isUiCutoutSource,
  uiCutoutRgb,
  chooseUiCutoutColor,
  uiCutoutPrompt,
} from './features/uiCutout.js';
export { appendAnimation, refreshAnimationFromSource } from './features/animation.js';
export type { SequenceExportPlayback } from './features/sequenceExport.js';
export {
  sequenceExportManifest,
  sequenceExportLua,
  sequenceExportInstructions,
} from './features/sequenceExport.js';
export { builtinPresetDescriptions } from './features/presetDescriptions.js';
export { templateCategories, templatePresentation } from './features/templatePresentation.js';
export {
  canvasGenerationParameterChoices,
  canvasParameterSchema,
  selectCanvasSnapshot,
} from './features/automationInfo.js';
export type {
  CanvasInfoNode,
  CanvasInfoSnapshot,
  CanvasSnapshotGuidance,
} from './features/automationInfo.js';
export { prepareCanvasReferences, applyCanvasReferences } from './features/automationReferences.js';
export type {
  CanvasReferencesInput,
  CanvasReferencesPlan,
} from './features/automationReferences.js';
export { canvasModelInput, canvasModelIsCurrent, canvasModelGroup } from './features/model3d.js';

export { resourceBundleMembers, resourceBundleOwner } from './features/resourceBundle.js';
export { canvasExportIdentity, canvasExportFilename } from './features/exportNaming.js';
export { canvasExportFormats } from './features/resourceExport.js';

export {
  CANVAS_COMMAND_ACTIONS,
  CANVAS_SEQUENCE_SETTING_FIELDS,
  validateCanvasCommandStructure,
  canvasAutomationSnapshot,
  prepareCanvasNodeUpdatesWithValidation,
} from './features/automation.js';

export { validateResourceBundleStructure } from './features/resourceBundle.js';

export { HISTORY_LIMIT, layoutKey, connectFirstFrameWithId } from './core/edit.js';
export { canvasImageTool } from './features/imageModels.js';

export * from './features/serverRecognition.js';
export * from './features/recognitionRequest.js';
