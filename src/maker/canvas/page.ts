import { createCanvasTemplateUi } from './templateUi.js';
import { getCanvasPageHtml as createSharedCanvasPage } from '../../../packages/maker-canvas/src/browser/page.js';
export { CANVAS_PAGE_MARKER } from '../../../packages/maker-canvas/src/browser/page.js';
import { consoleThemeScript } from '../webTheme.js';
import { isLocalCanvasImagePath } from './localMediaValidation.js';
import { isLocalImageAssetPath } from './localMediaValidation.js';
import { createUiRecognitionUi } from './uiRecognitionUi.js';
import { validateBboxImage } from './uiBbox.js';
import { validateUiBbox } from './uiBbox.js';
import { validateUiRecognition } from './uiRecognition.js';
import { gameUiHandoffText } from './uiWorkflowHandoff.js';
import { openGameUiHandoff } from './uiWorkflowHandoff.js';
import { canvasAutomationCapabilities } from './automation.js';
import { prepareCanvasNodeUpdates } from './automation.js';
import { connectCanvasAutomation } from './automationClient.js';
import { createLocalCanvasHost } from './localBrowserHost.js';
import { createCanvasAutomationUi } from './automationUi.js';
import { createCanvasModelUi } from './model3dUi.js';
import { prepareCanvasImportedNode } from './automationAssets.js';
import { createBrowserCanvasDocumentStore } from './store.js';
import { detectUiCutoutColor } from './uiCutout.js';
import { createSequenceUiController } from './sequenceUi.js';
import { createCanvasGenerationUi } from './generationUi.js';
import { downloadCanvasImage } from './imageExport.js';
import { openImageAtlasDialog } from './imageAtlasUi.js';
import { validateImageAssetsInfo } from './imageAssets.js';
import { imageAssetsBindingPlan } from './imageAssets.js';
import { applyImageAssets } from './imageAssets.js';
import { createImageAssetsZip } from './imageAssets.js';
import { collectImageAssetEntries } from './imageAssets.js';
import { uiBundleManifest } from './resourceBundle.js';
import { validateResourceBundle } from './resourceBundle.js';
import { createResourceBundleZip } from './resourceBundle.js';
import { resourceBundleEntries } from './resourceBundle.js';
import { uiDataHash } from './resourceBundle.js';
import { createImageAssetsUi } from './imageAssetsUi.js';
import { nextCanvasExportCode } from './exportNaming.js';
import { createSequenceExport } from './sequenceExport.js';
import { downloadCanvasResource } from './resourceExport.js';
import { createCanvasResourceExport } from './resourceExport.js';
import { validateUiAtlasPlan } from './uiAssetBindings.js';
export function getCanvasPageHtml(): string {
  const hostScript = [
    'function createCanvasHost() {',
    createCanvasTemplateUi.toString(),
    isLocalCanvasImagePath.toString(),
    isLocalImageAssetPath.toString(),
    createUiRecognitionUi.toString(),
    validateBboxImage.toString(),
    validateUiBbox.toString(),
    validateUiRecognition.toString(),
    gameUiHandoffText.toString(),
    openGameUiHandoff.toString(),
    canvasAutomationCapabilities.toString(),
    prepareCanvasNodeUpdates.toString(),
    connectCanvasAutomation.toString(),
    createLocalCanvasHost.toString(),
    createCanvasAutomationUi.toString(),
    createCanvasModelUi.toString(),
    prepareCanvasImportedNode.toString(),
    createBrowserCanvasDocumentStore.toString(),
    detectUiCutoutColor.toString(),
    createSequenceUiController.toString(),
    createCanvasGenerationUi.toString(),
    downloadCanvasImage.toString(),
    openImageAtlasDialog.toString(),
    validateImageAssetsInfo.toString(),
    imageAssetsBindingPlan.toString(),
    applyImageAssets.toString(),
    createImageAssetsZip.toString(),
    collectImageAssetEntries.toString(),
    uiBundleManifest.toString(),
    validateResourceBundle.toString(),
    createResourceBundleZip.toString(),
    resourceBundleEntries.toString(),
    uiDataHash.toString(),
    createImageAssetsUi.toString(),
    nextCanvasExportCode.toString(),
    createSequenceExport.toString(),
    downloadCanvasResource.toString(),
    createCanvasResourceExport.toString(),
    validateUiAtlasPlan.toString(),
    "const projectKey = new URLSearchParams(location.search).get('project') || '';",
    'return createLocalCanvasHost(projectKey);',
    '}',
  ].join('\n');
  return createSharedCanvasPage({ hostScript, themeScript: consoleThemeScript });
}
