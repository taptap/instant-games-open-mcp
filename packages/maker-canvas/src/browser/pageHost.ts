import type { createCanvasTemplateUiWithHost } from './templateUi.js';
import type { CanvasCommand, CanvasNode } from '../contracts.js';
import type { CanvasDocumentStore } from './store.js';
import type { createCanvasGenerationUiWithHost } from './generationUi.js';
import type { createUiRecognitionUiWithHost } from './uiRecognitionUi.js';
import type { createCanvasModelUiWithHost } from './model3dUi.js';
import type { createImageAssetsUiWithHost } from './imageAssetsUi.js';
import type { createCanvasAutomationUiWithHost } from './automationUi.js';
import type { createSequenceUiControllerWithMedia } from './sequenceUi.js';
import type { createCanvasResourceExportWithHost } from './resourceExport.js';
import type { validateUiAtlasPlanStructure } from '../features/uiAssetBindings.js';

/** Host bindings for the existing page. Factories supply host callbacks to the shared controllers. */
export interface CanvasPageHost {
  store: CanvasDocumentStore;
  deliverCanvasSnapshot(dataUrl: string, filename: string): void | Promise<void>;
  createCanvasTemplateUi(
    options: Omit<Parameters<typeof createCanvasTemplateUiWithHost>[0], 'deliver'>
  ): ReturnType<typeof createCanvasTemplateUiWithHost>;
  unavailableReason?: string;
  publishUnsaved(value: boolean): void;
  publishActivity(running: boolean, pendingImport?: boolean): void;
  readSource(path: string, signal: AbortSignal, failure: string): Promise<Blob>;
  connectAutomation(options: {
    current(): { id: string; revision: number } | null;
    execute(command: CanvasCommand): Promise<unknown>;
    error?(message: string): void;
  }): void;
  deliverAutomationExport(
    command: Pick<CanvasCommand, 'requestId' | 'pageId'>,
    blob: Blob
  ): Promise<void>;
  gameUiNextStep(canvasId: string): { skill: string; instruction: string } | undefined;
  prepareCanvasImportedNode(
    canvasId: string,
    input: Record<string, unknown>,
    mediaUrl: (path: string) => string
  ): Promise<CanvasNode>;
  validateUiAtlasPlan: typeof validateUiAtlasPlanStructure;
  downloadCanvasResource: Parameters<
    typeof createCanvasResourceExportWithHost
  >[0]['downloadResource'];
  createCanvasGenerationUi(
    options: Omit<Parameters<typeof createCanvasGenerationUiWithHost>[0], 'detectUiCutoutColor'>
  ): ReturnType<typeof createCanvasGenerationUiWithHost>;
  createUiRecognitionUi(
    options: Omit<
      Parameters<typeof createUiRecognitionUiWithHost>[0],
      'readSource' | 'webRecognitionHint' | 'localRecognitionHint' | 'localRecognitionViewHint'
    >
  ): ReturnType<typeof createUiRecognitionUiWithHost>;
  createCanvasModelUi(
    options: Omit<
      Parameters<typeof createCanvasModelUiWithHost>[0],
      'thumbnailUrl' | 'previewOrigin' | 'deliver'
    >
  ): ReturnType<typeof createCanvasModelUiWithHost>;
  createImageAssetsUi(
    options: Omit<
      Parameters<typeof createImageAssetsUiWithHost>[0],
      'applyImageAssets' | 'imageAssetsBindingPlan' | 'openImageAtlasDialog' | 'readSource'
    >
  ): ReturnType<typeof createImageAssetsUiWithHost>;
  createCanvasAutomationUi(
    options: Omit<Parameters<typeof createCanvasAutomationUiWithHost>[0], 'prepareNodeUpdates'>
  ): ReturnType<typeof createCanvasAutomationUiWithHost>;
  createSequenceUiController(
    options: Omit<Parameters<typeof createSequenceUiControllerWithMedia>[0], 'readAtlas'>
  ): ReturnType<typeof createSequenceUiControllerWithMedia>;
  createCanvasResourceExport(
    options: Omit<
      Parameters<typeof createCanvasResourceExportWithHost>[0],
      'downloadResource' | 'openHandoff' | 'openAtlas'
    >
  ): ReturnType<typeof createCanvasResourceExportWithHost>;
}
