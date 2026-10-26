import { canvasMediaSources, refreshCanvasMedia } from './mediaVersions.js';
import { canvasCapabilityReason, canvasFeatureEnabled } from './capabilities.js';
import { canvasSupportsPlatform, validateCanvasPlatforms } from '../contracts/platform.js';
import { installCanvasPolyfills } from './polyfills.js';
import { nextCanvasExportCode } from './exportNaming.js';
import { downloadCanvasResourceWithHost } from './resourceDownload.js';
import {
  uiDataHash,
  uiBundleManifestWithValidation,
  resourceBundleEntriesFromReader,
  createResourceBundleZipWithHost,
} from './resourceBundle.js';
import { detectUiCutoutColorFromReader } from './uiCutout.js';
import { prepareCanvasImportedNodeFromMedia } from './automationAssets.js';
import { canvasEditorLayout, restoreCanvasEditorDraft } from './editorLifecycle.js';
import { canvasImageTool } from '../features/imageModels.js';
import { createCanvasResourceExportWithHost } from './resourceExport.js';
import { createImageAssetsUiWithHost } from './imageAssetsUi.js';
import { createCanvasGenerationUiWithHost } from './generationUi.js';
import { createUiRecognitionUiWithHost } from './uiRecognitionUi.js';
import { createCanvasModelUiWithHost } from './model3dUi.js';
import { createSequenceUiControllerWithMedia } from './sequenceUi.js';
import { createSequenceExportFromReader } from './sequenceExport.js';
import { validateImageAssetsInfoStructure } from '../features/imageAssets.js';
import { imageAssetsBindingPlanStructure } from '../features/imageAssets.js';
import { applyImageAssetsToDocument } from '../features/imageAssets.js';
import { validateBboxImageStructure } from '../features/uiBbox.js';
import { validateUiBboxStructure } from '../features/uiBbox.js';
import { validateUiRecognitionStructure } from '../features/uiRecognition.js';
import { validateUiAtlasPlanStructure } from '../features/uiAssetBindings.js';
import { collectImageAssetEntriesFromReader } from './imageAssets.js';
import { nodesInMarquee } from '../core/edit.js';
import { removeNodes } from '../core/edit.js';
import { saveAcknowledgement } from '../core/edit.js';
import { canvasFlowDuration } from './workTiming.js';
import { formatCanvasWorkDuration } from './workTiming.js';
import { renderCanvasWorkTiming } from './workTiming.js';
import { CANVAS_THEME_STYLES } from './themeStyles.js';
import { CANVAS_WEB_STYLES } from './webStyles.js';
import { canvasWireGeometry } from '../core/wirePath.js';
import { canvasWirePath } from '../core/wirePath.js';
import { canvasWebBox, canvasWebCurve, canvasWebWire, createCanvasWireUi } from './wireUi.js';
import {
  canvasWebFitArea,
  canvasWebPlacePopover,
  canvasComposerKey,
  canvasWebIconAction,
  canvasWebSlot,
  installCanvasWebTooltips,
  createCanvasWebChrome,
  decorateCanvasWebCards,
} from './webChrome.js';
import { CANVAS_WIRE_STYLES } from './wireUi.js';
import { drawUiRecognition } from './uiRecognitionUi.js';
import { IMAGE_FEATURES } from '../features/imageFeatures.js';
import { imageFeatures } from '../features/imageFeatures.js';
import { hasImageFeature } from '../features/imageFeatures.js';
import { imageAllowsOutpaint } from '../features/imageFeatures.js';
import { resetImageFeatureCopy } from '../features/imageFeatures.js';
import { openUiBboxPreview } from './uiBboxPreview.js';
import { UI_CUT_TYPES } from '../contracts.js';
import { validateBboxRect } from '../features/uiBbox.js';
import { validateCutElements } from '../features/uiBbox.js';
import { validateBboxTexts } from '../features/uiBbox.js';
import { scaleCutElements } from '../features/uiBbox.js';
import { UI_ELEMENT_CATEGORIES } from '../contracts.js';
import { bboxRecognitionElements } from '../features/uiRecognition.js';
import { validateUiElements } from '../features/uiRecognition.js';
import { selectedUiRecognition } from '../features/uiRecognition.js';
import { uiRecognitionSource } from '../features/uiRecognition.js';
import { uiRecognitionNote } from '../features/uiRecognition.js';
import { uiRecognitionStatus } from '../features/uiRecognition.js';
import { uiRecognitionInputs } from '../features/uiRecognition.js';
import { uiRecognitionPreview } from '../features/uiRecognition.js';
import { uiExtractionPlan } from '../features/uiRecognition.js';
import { selectedUiExtraction } from '../features/uiRecognition.js';
import { setUiRecognitionMode } from '../features/uiRecognition.js';
import { createCanvasTemplateModel } from './templates.js';
import { isBuiltinCanvasTemplate } from './templates.js';
import { createCanvasTemplateUiWithHost } from './templateUi.js';
import { openCanvasTemplatePreview } from './templatePreview.js';
import { isGameUiResource } from '../features/uiWorkflow.js';
import { builtinPresetDescriptions } from '../features/presetDescriptions.js';
import { templateCategories } from '../features/templatePresentation.js';
import { templatePresentation } from '../features/templatePresentation.js';
import { canvasAutomationSnapshot } from '../features/automation.js';
import { validateCanvasCommandStructure as validateCanvasCommand } from '../features/automation.js';
import { syncUiBboxWorkflow, layoutUiWorkflowGroup } from './uiBboxWorkflow.js';
import { createUi015Workflow } from './ui015Workflow.js';
import { designPngData } from './designPng.js';
import { CANVAS_MODEL_STYLES } from './model3dUi.js';
import { canvasModelInput } from '../features/model3d.js';
import { canvasModelIsCurrent } from '../features/model3d.js';
import { canvasModelGroup } from '../features/model3d.js';
import { appendCanvasModelNode } from './model3d.js';
import { applyCanvasReferences } from '../features/automationReferences.js';
import { prepareCanvasReferences } from '../features/automationReferences.js';
import { canvasGenerationParameterChoices } from '../features/automationInfo.js';
import { canvasParameterSchema } from '../features/automationInfo.js';
import { selectCanvasSnapshot } from '../features/automationInfo.js';
import { createTemplateCovers } from './templateCovers.js';
import { TEMPLATE_LIBRARY_STYLES } from './templateStyles.js';
import { canvasCardStatus } from './cardStatus.js';
import { renderCanvasCardStatus } from './cardStatus.js';
import { CANVAS_CARD_STATUS_STYLES } from './cardStatus.js';
import { createCanvasLog } from './logUi.js';
import { canvasLogLevel } from './logUi.js';
import { CANVAS_LOG_STYLES } from './logUi.js';
import { createCanvasWorkspace } from './workspaceUi.js';
import { CANVAS_WORKSPACE_STYLES } from './workspaceUi.js';
import { CANVAS_MARK_COLORS } from '../core/marks.js';
import { CANVAS_MARK_MIN } from '../core/marks.js';
import { CANVAS_MARK_MAX } from '../core/marks.js';
import { MARK_POINTS } from '../core/marks.js';
import { MARK_DIRECTIONS } from '../core/marks.js';
import { optionalMarkPoint } from '../core/marks.js';
import { markNumber } from '../core/marks.js';
import { validateCanvasMark } from '../core/marks.js';
import { CANVAS_MARK_STYLES } from './marks.js';
import { canvasMarkEnds } from '../core/marks.js';
import { canvasMarkMoveEndpoint } from '../core/marks.js';
import { canvasMarkResizeEdge } from '../core/marks.js';
import { canvasMarkFromInput } from '../core/marks.js';
import { renderCanvasMark } from './marks.js';
import { drawCanvasMark } from './marks.js';
import { createCanvasMarks } from './marks.js';
import { decorateCanvasCard } from './cardUi.js';
import { refreshCanvasGroupHeaders } from './cardUi.js';
import { canvasGroupState } from './cardUi.js';
import { CANVAS_CARD_UI_STYLES } from './cardUi.js';
import { dispatchCanvasStoreRequest } from './store.js';
import { withCanvasTimeout } from './requestTimeout.js';
import { isUiCutoutSource } from '../features/uiCutout.js';
import { uiCutoutRgb } from '../features/uiCutout.js';
import { chooseUiCutoutColor } from '../features/uiCutout.js';
import { uiCutoutPrompt } from '../features/uiCutout.js';
import { createSequenceProcessor } from './sequence.js';
import { defaultSequenceSettings } from '../features/sequenceModel.js';
import { duplicateIndicesFromSignatures } from '../features/sequenceModel.js';
import { estimateSequenceFrameCount } from '../features/sequenceModel.js';
import { maxSequenceFrameCount } from '../features/sequenceModel.js';
import { maxSequenceInputFrameCount } from '../features/sequenceModel.js';
import { removeConnectedBackgroundPixels } from './sequence.js';
import { removeChromaBackgroundPixels } from './sequence.js';
import { hasOpaqueBoundary } from './sequence.js';
import { sequenceActionsForCard } from './sequence.js';
import { signatureSimilarity } from '../features/sequenceModel.js';
import { DEFAULT_SEQUENCE_SIDE } from '../features/sequenceModel.js';
import { MAX_ATLAS_SIDE } from '../features/sequenceModel.js';
import { MAX_SEQUENCE_FRAMES } from '../features/sequenceModel.js';
import { MAX_SEQUENCE_PIXEL_BUDGET } from '../features/sequenceModel.js';
import { MAX_SEQUENCE_SIDE } from '../features/sequenceModel.js';
import { MAX_SEQUENCE_SOURCE_SIDE } from '../features/sequenceModel.js';
import { createSequenceEditor } from './sequenceEditor.js';
import { renderSequenceResult } from './sequenceEditor.js';
import { SEQUENCE_EDITOR_STYLES } from './sequenceEditorStyles.js';
import { videoCardSize } from './videoCard.js';
import { createPromptEditor } from './promptEditor.js';
import { formatBuiltinPrompt } from './promptEditor.js';
import { appendAnimation } from '../features/animation.js';
import { createAnimationCards } from './animation.js';
import { refreshAnimationFromSource } from '../features/animation.js';
import { renderGenerationResult } from './generationResult.js';
import { DEFAULT_SEQUENCE_FPS } from '../features/sequenceModel.js';
import { DEFAULT_SEQUENCE_DURATION } from '../features/sequenceModel.js';
import { applyFrameOperations } from './frameEditor.js';
import { openFrameEditor } from './frameEditor.js';
import { backgroundColorsDiffer } from './backgroundRemoval.js';
import { CANVAS_BACKGROUND_DEFAULTS, createBackgroundRemoval } from './backgroundRemoval.js';
import { stableBackgroundColor } from './backgroundRemoval.js';
import { openBackgroundEditor } from './backgroundUi.js';
import { createFrameCollection } from '../features/frameCollection.js';
import { imageEditSources } from './generationUi.js';
import { imageAtlasRegions } from '../features/imageAtlas.js';
import { imageAtlasManifest } from '../features/imageAtlas.js';
import { imageAtlasInstructions } from '../features/imageAtlas.js';
import { createImageAtlasExport } from './imageAtlasExport.js';
import { drawImageAtlasPreview } from './imageAtlasUi.js';
import { openImageAtlasDialogWithHost } from './imageAtlasUi.js';
import { validateMergeIcons } from '../features/mergeIcons.js';
import { mergeIconPrompt } from '../features/mergeIcons.js';
import { mergeIconGrid } from '../features/mergeIcons.js';
import { mergeIconNeedsGeneration } from '../features/mergeIcons.js';
import { configureMergeIcons } from '../features/mergeIcons.js';
import { editMergeIcons } from './mergeIconsUi.js';
import { resourceBundleMembers } from '../features/resourceBundle.js';
import { resourceBundleOwner } from '../features/resourceBundle.js';
import { renderResourceBundle } from './resourceBundleUi.js';
import { addResourceBundle } from './resourceBundleUi.js';
import { splitImageAtlas } from './imageAtlasExport.js';
import { prepareImageAtlas } from './imageAtlasExport.js';
import { encodeImageAtlasRegions } from './imageAtlasExport.js';
import { findAtlasContentRegions } from '../features/atlasContent.js';
import { validateAtlasCrops } from '../features/atlasContent.js';
import { alignAtlasCells } from '../features/atlasAlignment.js';
import { alignNativeAtlasRegions, findNativeAtlasComponents } from '../features/atlasAlignment.js';
import { assignAtlasCellsByCenter } from '../features/atlasAlignment.js';
import { atlasLayoutError } from '../features/atlasAlignment.js';
import { IMAGE_ASSETS_STYLES } from './imageAssetsUi.js';
import { canvasExportIdentity } from '../features/exportNaming.js';
import { canvasExportFilename } from '../features/exportNaming.js';
import { createCanvasZip } from './zipArchive.js';
import { sequenceExportManifest } from '../features/sequenceExport.js';
import { sequenceExportLua } from '../features/sequenceExport.js';
import { sequenceExportInstructions } from '../features/sequenceExport.js';
import { canvasExportFormats } from '../features/resourceExport.js';
import { imageCardSize } from '../features/imageInfo.js';
import { fitImageCard } from '../features/imageInfo.js';
import { imageSizeLabel } from '../features/imageInfo.js';
import { renderImageInfo } from './imageInfo.js';
import { IMAGE_OUTPUT_RATIOS } from '../features/imageSizing.js';
import { IMAGE_COMMON_RATIOS } from '../features/imageSizing.js';
import { imageRatioInfo } from '../features/imageSizing.js';
import { resolveImageSize } from '../features/imageSizing.js';
import { canvasOriginalImage } from '../features/imageSizing.js';
import { imageResultWarning } from '../features/imageSizing.js';
import { createImageEditing } from './imageEditing.js';
import { applyLocalImageResult } from '../features/localImageResult.js';
import { createVideoHistoryUi } from './videoHistoryUi.js';
import { createVideoPrompts } from '../features/videoPrompts.js';
import { videoTaskTiming } from '../features/videoTaskTiming.js';
import { createCanvasGroupQueue } from './groupQueue.js';
import { createCanvasGroupQueueUi } from './groupQueueUi.js';
import { GROUP_QUEUE_STYLES } from './groupQueueUi.js';
import { createTemplateWorkflow } from './templateWorkflow.js';
import {
  canvasImageHasRegeneratePath,
  canvasNeedsProcessing,
} from '../features/templateWorkflow.js';
import { invalidateCanvasDependents } from '../features/templateWorkflow.js';
import { videoInputSources } from '../features/videoInputs.js';
import { videoAttemptMatchesSources } from '../features/videoInputs.js';
import { framePairSources } from '../features/framePair.js';
import { videoFramePair } from '../features/framePair.js';
import { validateFramePairVideo } from '../features/framePair.js';
import { validateFramePairGraph } from '../features/framePair.js';
import { setFramePairSource } from '../features/framePair.js';
import { canvasNodeVersion } from '../core/dependencies.js';
import { canvasReferences } from '../core/dependencies.js';
import { canvasDependents } from '../core/dependencies.js';
import { isCanvasNodeStale } from '../core/dependencies.js';
import { isCanvasSourceCurrent } from '../core/dependencies.js';
import { metadataVersion } from '../core/dependencies.js';
import { snapshotCanvasSource } from '../core/dependencies.js';
import { selectedUiAtlasPlan } from '../features/uiAssetBindings.js';
import { uiAtlasOrderPrompt } from '../features/uiAssetBindings.js';
import { uiBindingContentRect, validateUiNativeRegions } from '../features/uiAssetBindings.js';
import { validateUiAtlasGroup } from '../features/uiAssetBindings.js';
import { uiAtlasElementGroup } from '../features/uiAssetBindings.js';
import { uiAtlasElementSlots } from '../features/uiAssetBindings.js';
import { uiAtlasSheet } from '../features/uiAssetBindings.js';
import { cloneUiAtlasBatch } from './uiAssetBindings.js';
import { UI_ATLAS_MAX_EDGE } from '../features/uiAssetBindings.js';
import { UI_ATLAS_MAX_CELLS } from '../features/uiAssetBindings.js';
import { uiBatchAtlasPlan } from '../features/uiAssetBindings.js';
import { uiBatchAtlasPlans } from '../features/uiAssetBindings.js';
import { uiNativeAtlasPlans } from '../features/uiAssetBindings.js';
import { uiNativeArtTextPlan } from '../features/uiAssetBindings.js';
import { uiNativeSlotPlans } from '../features/uiAssetBindings.js';
import { uiNativeAtlasPrompt } from '../features/uiAssetBindings.js';
import { uiWorkflowAtlasPlans } from '../features/uiAssetBindings.js';
import { ensureUiAtlasBatchCards } from './uiAssetBindings.js';
import { uiBatchAtlasPrompt } from '../features/uiAssetBindings.js';
import {
  CANVAS_COMMAND_ACTIONS,
  CANVAS_SEQUENCE_SETTING_FIELDS,
  prepareCanvasNodeUpdatesWithValidation,
} from '../features/automation.js';
import { createCanvasAutomationUiWithHost } from './automationUi.js';
import { validateResourceBundleStructure } from '../features/resourceBundle.js';
import { encodeCanvasImage, deliverCanvasImage } from './imageExport.js';
export const CANVAS_PAGE_MARKER = 'maker-canvas-page';

function replaceCanvasPageText(page: string, search: string, replacement: string): string {
  if (!page.includes(search))
    throw new Error('Canvas page template is out of sync: ' + search.slice(0, 96));
  return page.replace(search, () => replacement);
}

const template =
  "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title data-maker-canvas=\"maker-canvas-page\">创作画布</title>\n<style>\n:root { color-scheme: light dark; font-family: sans-serif; }\nbody { margin: 0; height: 100vh; display: flex; flex-direction: column; background: #101114; color: #f4f1ea; }\nheader { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #2a2d34; }\nheader button, header select { background: #1c1f26; color: inherit; border: 1px solid #3a3f4a; border-radius: 6px; padding: 6px 8px; }\n#status { margin-left: auto; font-size: 13px; }\n#error { min-height: 1.2em; padding: 0 12px; color: #e6b15c; font-size: 13px; }\n#board { position: relative; flex: 1; overflow: hidden; background-image: radial-gradient(#2c3038 1px, transparent 1px); background-size: 22px 22px; touch-action: none; }\n#wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }\n.wire { fill: none; stroke: #d7b56d; stroke-width: 2; }\n#world { position: absolute; inset: 0; transform-origin: 0 0; }\n.card { position: absolute; box-sizing: border-box; border: 1px solid #3d4250; border-radius: 10px; background: #1a1d24; padding: 8px; overflow: hidden; }\n.card.selected { outline: 2px solid #e6b15c; }\n.card img { width: 100%; height: calc(100% - 28px); object-fit: contain; }\n.card p { margin: 8px 0 0; color: #b7b1a6; font-size: 13px; }\n.port { position: absolute; right: -10px; top: 50%; width: 22px; height: 22px; border-radius: 50%; border: 0; background: #e6b15c; color: #1a1d24; }\n#marquee { position: absolute; border: 1px solid #e6b15c; background: rgba(230,177,92,.15); pointer-events: none; }\n</style>\n</head>\n<body>\n<header>\n  <strong>创作画布</strong>\n  <select id=\"canvases\" aria-label=\"画布\"></select>\n  <button id=\"new-canvas\" type=\"button\">新建</button>\n  <button id=\"add-image\" type=\"button\">导入图片</button>\n  <button id=\"add-video\" type=\"button\">视频输入卡</button>\n  <button id=\"add-note\" type=\"button\">便签</button>\n  <button id=\"tool-select\" type=\"button\" aria-pressed=\"true\">鼠标</button>\n  <button id=\"tool-pan\" type=\"button\">拖拽</button>\n  <button id=\"mark-ellipse\" type=\"button\">圈选</button>\n  <button id=\"mark-arrow\" type=\"button\">箭头</button>\n  <button id=\"undo\" type=\"button\">撤销</button>\n  <button id=\"redo\" type=\"button\">重做</button>\n  <button id=\"save\" type=\"button\">保存</button>\n  <span id=\"status\">未保存</span>\n</header>\n<p id=\"error\"></p>\n<div id=\"board\"><svg id=\"wires\"></svg><div id=\"world\"></div><div id=\"marquee\" hidden></div></div>\n<input id=\"file\" type=\"file\" accept=\"image/png,image/jpeg,image/webp\" hidden>\n<script>/*__HELPERS__*/\n\n(function () {\n  const host = createCanvasHost();\n  const store = host.store;\n  const board = document.getElementById('board');\n  const world = document.getElementById('world');\n  const wires = document.getElementById('wires');\n  const status = document.getElementById('status');\n  const error = document.getElementById('error');\n  const select = document.getElementById('canvases');\n  const file = document.getElementById('file');\n  let documentState = null;\n  let savedKey = '';\n  let past = [];\n  let future = [];\n  let timer = 0;\n  let drag = null;\n  let space = false;\n  function handMode() { return Boolean(canvasMarks && canvasMarks.panning()); }\n  let opening = null;\n  const media = {};\n  const selected = new Set();\n  host.publishUnsaved(false);\n\n  function layout(value) {\n    return canvasEditorLayout(value);\n  }\n  function dirty() {\n    return Boolean(documentState) && layout(documentState) !== savedKey;\n  }\n  function publishDirty() {\n    host.publishUnsaved(dirty());\n  }\n  function setStatus(text) { status.textContent = text; publishDirty(); }\n  function setError(text) { error.textContent = text || ''; }\n  function remember() {\n    past.push(JSON.parse(JSON.stringify(documentState)));\n    if (past.length > 60) past.shift();\n    future = [];\n  }\n  async function request(path, options) {\n    const response = await dispatchCanvasStoreRequest(store, path, options);\n    const body = await response.json();\n    if (!response.ok) throw Object.assign(new Error(body.error || '请求失败 ' + response.status), { status: response.status });\n    return body;\n  }\n  function render() {\n    if (!documentState) return;\n    const view = documentState.viewport;\n    world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';\n    world.replaceChildren();\n    for (const node of documentState.nodes) {\n      const card = document.createElement('article');\n      card.className = 'card ' + node.type + (selected.has(node.id) ? ' selected' : '');\n      card.dataset.id = node.id;\n      card.style.left = node.x + 'px';\n      card.style.top = node.y + 'px';\n      card.style.width = node.width + 'px';\n      card.style.height = node.height + 'px';\n      const title = document.createElement('strong');\n      title.textContent = node.title || '未命名';\n      card.append(title);\n      if (node.type === 'image' && node.assetPath && media[node.assetPath]) {\n        const img = document.createElement('img');\n        img.alt = node.title;\n        img.src = media[node.assetPath];\n        card.append(img);\n      }\n      if (node.type === 'note') {\n        const text = document.createElement('p');\n        text.textContent = node.text || '便签';\n        card.append(text);\n      }\n      if (node.type === 'video') {\n        const hint = document.createElement('p');\n        hint.textContent = '视频输入卡。生视频将在下一阶段接入。';\n        card.append(hint);\n      }\n      if (node.type === 'image' && node.assetPath) {\n        const port = document.createElement('button');\n        port.type = 'button';\n        port.className = 'port';\n        port.textContent = '+';\n        port.title = '拖到视频输入卡，保存为首帧';\n        port.addEventListener('pointerdown', function (event) { startWire(event, node.id); });\n        card.append(port);\n      }\n      card.addEventListener('pointerdown', function (event) {\n        if (event.target.classList.contains('port')) return;\n        selectNode(node.id, event.shiftKey);\n        startDrag(event, node.id);\n      });\n      world.append(card);\n    }\n    wires.setAttribute('viewBox', '0 0 ' + board.clientWidth + ' ' + board.clientHeight);\n    wires.replaceChildren();\n    for (const edge of documentState.edges) {\n      const from = documentState.nodes.find(function (node) { return node.id === edge.from; });\n      const to = documentState.nodes.find(function (node) { return node.id === edge.to; });\n      if (!from || !to) continue;\n      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');\n      const x1 = view.x + (from.x + from.width) * view.scale;\n      const y1 = view.y + (from.y + from.height / 2) * view.scale;\n      const x2 = view.x + to.x * view.scale;\n      const y2 = view.y + (to.y + to.height / 2) * view.scale;\n      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 40) + ' ' + y1 + ', ' + (x2 - 40) + ' ' + y2 + ', ' + x2 + ' ' + y2);\n      path.setAttribute('class', 'wire');\n      wires.append(path);\n    }\n    if (layout(documentState) === savedKey) setStatus('已保存');\n    else if (status.textContent !== '保存中…') setStatus('未保存');\n    else publishDirty();\n  }\n  function selectNode(id, shift) {\n    if (!shift) selected.clear();\n    if (selected.has(id) && shift) selected.delete(id);\n    else selected.add(id);\n    render();\n  }\n  function localPoint(event) {\n    const rect = board.getBoundingClientRect();\n    return { x: event.clientX - rect.left, y: event.clientY - rect.top };\n  }\n  function startDrag(event, id) {\n    if (space) return;\n    const node = documentState.nodes.find(function (item) { return item.id === id; });\n    drag = { kind: 'move', id: id, x: event.clientX, y: event.clientY, ox: node.x, oy: node.y, moved: false };\n    board.setPointerCapture(event.pointerId);\n  }\n  function startWire(event, id) {\n    event.stopPropagation();\n    drag = { kind: 'wire', id: id };\n    board.setPointerCapture(event.pointerId);\n  }\n  board.addEventListener('pointerdown', function (event) {\n    if (event.target !== board && event.target !== world) return;\n    if (space || event.button === 1) {\n      drag = { kind: 'pan', x: event.clientX, y: event.clientY, ox: documentState.viewport.x, oy: documentState.viewport.y };\n      return;\n    }\n    const point = localPoint(event);\n    drag = { kind: 'marquee', x: point.x, y: point.y };\n    selected.clear();\n    render();\n  });\n  board.addEventListener('pointermove', function (event) {\n    if (!drag || !documentState) return;\n    if (drag.kind === 'move') {\n      const dx = (event.clientX - drag.x) / documentState.viewport.scale;\n      const dy = (event.clientY - drag.y) / documentState.viewport.scale;\n      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) {\n        remember();\n        drag.moved = true;\n      }\n      const node = documentState.nodes.find(function (item) { return item.id === drag.id; });\n      node.x = drag.ox + dx;\n      node.y = drag.oy + dy;\n      markDirty();\n      render();\n    } else if (drag.kind === 'marquee') {\n      const box = document.getElementById('marquee');\n      const point = localPoint(event);\n      box.hidden = false;\n      box.style.left = Math.min(drag.x, point.x) + 'px';\n      box.style.top = Math.min(drag.y, point.y) + 'px';\n      box.style.width = Math.abs(point.x - drag.x) + 'px';\n      box.style.height = Math.abs(point.y - drag.y) + 'px';\n    } else if (drag.kind === 'pan') {\n      documentState.viewport.x = drag.ox + event.clientX - drag.x;\n      documentState.viewport.y = drag.oy + event.clientY - drag.y;\n      markDirty();\n      render();\n    }\n  });\n  board.addEventListener('pointerup', function (event) {\n    if (!drag) return;\n    if (drag.kind === 'marquee') {\n      const point = localPoint(event);\n      selected.clear();\n      for (const id of nodesInMarquee(documentState.nodes, documentState.viewport, { x1: drag.x, y1: drag.y, x2: point.x, y2: point.y })) {\n        selected.add(id);\n      }\n      document.getElementById('marquee').hidden = true;\n      render();\n    }\n    if (drag.kind === 'wire') {\n      const hit = document.elementFromPoint(event.clientX, event.clientY);\n      const card = hit && hit.closest ? hit.closest('[data-id]') : null;\n      if (card) connect(drag.id, card.dataset.id);\n    }\n    drag = null;\n  });\n  board.addEventListener('wheel', function (event) {\n    if (!documentState) return;\n    event.preventDefault();\n    const point = localPoint(event);\n    const before = documentState.viewport.scale;\n    const next = Math.min(4, Math.max(0.15, before * (event.deltaY > 0 ? 0.9 : 1.1)));\n    const worldX = (point.x - documentState.viewport.x) / before;\n    const worldY = (point.y - documentState.viewport.y) / before;\n    documentState.viewport.scale = next;\n    documentState.viewport.x = point.x - worldX * next;\n    documentState.viewport.y = point.y - worldY * next;\n    markDirty();\n    render();\n  }, { passive: false });\n  function markDirty() {\n    setStatus('未保存');\n    clearTimeout(timer);\n    timer = setTimeout(function () { void flush(); }, 800);\n  }\n  function connect(fromId, toId) {\n    const from = documentState.nodes.find(function (node) { return node.id === fromId; });\n    const to = documentState.nodes.find(function (node) { return node.id === toId; });\n    if (!from || !to || from.type !== 'image' || !from.assetPath || to.type !== 'video') {\n      setError('首帧线只能从已导入图片连到视频输入卡。');\n      return;\n    }\n    remember();\n    documentState.edges = documentState.edges.filter(function (edge) { return edge.to !== toId; });\n    documentState.edges.push({ id: crypto.randomUUID(), from: fromId, to: toId, kind: 'first-frame' });\n    setError('');\n    markDirty();\n    render();\n  }\n  function add(type, point) {\n    remember();\n    const node = {\n      id: crypto.randomUUID(),\n      type: type,\n      x: point.x,\n      y: point.y,\n      width: type === 'note' ? 180 : 220,\n      height: type === 'note' ? 120 : 150,\n      title: type === 'image' ? '图片' : type === 'video' ? '视频输入' : '便签',\n    };\n    if (type === 'note') node.text = '便签';\n    documentState.nodes.push(node);\n    selected.clear();\n    selected.add(node.id);\n    markDirty();\n    render();\n  }\n  async function saveOnce() {\n    if (!documentState) return true;\n    const submittedId = documentState.id;\n    const snapshot = JSON.parse(JSON.stringify(documentState));\n    const submittedLayout = layout(snapshot);\n    if (submittedLayout === savedKey) {\n      if (documentState && documentState.id === submittedId && layout(documentState) === submittedLayout) setStatus('已保存');\n      return true;\n    }\n    setStatus('保存中…');\n    try {\n      const saved = await request('/canvases/' + submittedId, {\n        method: 'PUT',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify(snapshot),\n      });\n      const ack = saveAcknowledgement({\n        currentId: documentState ? documentState.id : null,\n        currentLayout: documentState ? layout(documentState) : null,\n        submittedId: submittedId,\n        submittedLayout: submittedLayout,\n        savedRevision: saved.revision,\n      });\n      if (!ack.apply) return true;\n      documentState.revision = ack.revision;\n      savedKey = ack.savedKey;\n      setStatus(ack.pending ? '未保存' : '已保存');\n      setError('');\n      return !ack.pending;\n    } catch (caught) {\n      if (!documentState || documentState.id !== submittedId) return false;\n      setStatus('未保存');\n      setError(caught.message || '保存失败');\n      return false;\n    }\n  }\n  async function flush() {\n    let guard = 0;\n    while (dirty() && guard < 5) {\n      guard += 1;\n      const ok = await saveOnce();\n      if (!ok) return false;\n    }\n    return !dirty();\n  }\n  function mediaUrl(assetPath) {\n    return store.mediaUrl(assetPath);\n  }\n  async function loadMedia(assetPath) {\n    media[assetPath] = mediaUrl(assetPath);\n  }\n  async function openDocument(id) {\n    const token = {};\n    opening = token;\n    const loaded = await request('/canvases/' + id);\n    if (opening !== token) return;\n    documentState = loaded;\n    savedKey = restored.savedLayout;\n    past = [];\n    future = [];\n    selected.clear();\n    select.value = id;\n    for (const node of documentState.nodes) {\n      if (node.assetPath) await loadMedia(node.assetPath);\n      if (opening !== token) return;\n    }\n    setStatus(dirty() ? '未保存' : '已保存');\n    setError('');\n    render();\n  }\n  async function leaveCurrent() {\n    const id = documentState && documentState.id;\n    const ok = await flush();\n    if (documentState && documentState.id === id && dirty()) {\n      setError('当前画布还有未保存编辑，已留在此画布。');\n      if (id) select.value = id;\n      return false;\n    }\n    return ok;\n  }\n  async function boot() {\n    if (host.unavailableReason) {\n      setError(host.unavailableReason);\n      return;\n    }\n    let list = await request('/canvases');\n    if (!list.length) {\n      const created = await request('/canvases', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ title: '创作画布' }),\n      });\n      list = [{ id: created.id, title: created.title }];\n    }\n    select.replaceChildren();\n    for (const item of list) {\n      const option = document.createElement('option');\n      option.value = item.id;\n      option.textContent = item.title;\n      select.append(option);\n    }\n    await openDocument(list[0].id);\n  }\n  select.addEventListener('change', function () {\n    const next = select.value;\n    const current = documentState && documentState.id;\n    if (next === current) return;\n    void leaveCurrent().then(function (ok) {\n      if (!ok) return;\n      void openDocument(next);\n    });\n  });\n  document.getElementById('new-canvas').addEventListener('click', function () {\n    void leaveCurrent().then(async function (ok) {\n      if (!ok || (documentState && dirty())) return;\n      const created = await request('/canvases', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ title: '创作画布' }),\n      });\n      if (documentState && dirty()) return;\n      const option = document.createElement('option');\n      option.value = created.id;\n      option.textContent = created.title;\n      select.append(option);\n      await openDocument(created.id);\n    });\n  });\n  document.getElementById('add-note').addEventListener('click', function () { add('note', { x: 80, y: 80 }); });\n  document.getElementById('add-video').addEventListener('click', function () { add('video', { x: 360, y: 80 }); });\n  document.getElementById('add-image').addEventListener('click', function () { file.click(); });\n  function requestImageImport(nodeId) {\n    if (!documentState) return;\n    if (generationUi && generationUi.isBusy) { setError(\"请等待当前生成完成后再替换图片。\"); return; }\n    pendingImageImport = { canvasId: documentState.id, nodeId: nodeId };\n    file.click();\n  }\n  async function importImageFile(chosen, request) {\n    if (!chosen || !request || !documentState) return;\n    if (chosen.size > 20 * 1024 * 1024) { setError(\"图片不能超过 20 MiB。\"); return; }\n    if (chosen.type && [\"image/png\", \"image/jpeg\", \"image/webp\"].indexOf(chosen.type) < 0) { setError(\"只接受 PNG、JPEG 或 WebP。\"); return; }\n    pendingAssetImports += 1;\n    publishDirty();\n    try {\n      const saved = await store.importImage(request.canvasId, await chosen.arrayBuffer(), chosen.type || \"application/octet-stream\");\n      if (!documentState || documentState.id !== request.canvasId) {\n        setError(\"已离开原画布。图片已写入当前项目，但没有放进其他画布。\");\n        return;\n      }\n      const recognitionCard = Boolean(request.createUiRecognition);\n      let node = documentState.nodes.find(function (item) { return item.id === request.nodeId && item.type === \"image\"; });\n      if (!recognitionCard && (!node || (node.assetPath && !templateWorkflow.canEditImage(node.id)))) { setError(\"图片卡已被修改，导入结果未挂载。\"); return; }\n      remember();\n      if (recognitionCard) {\n        const bitmap = await createImageBitmap(chosen);\n        const scale = Math.min(1, 1080 / Math.max(bitmap.width, 1));\n        const point = nextPlacement(\"image\");\n        node = { id: crypto.randomUUID(), type: \"image\", x: point.x, y: point.y, width: Math.max(320, Math.round(bitmap.width * scale)), height: Math.max(240, Math.round(bitmap.height * scale) + 42), title: \"UI 设计稿\", assetPath: saved.relativePath, uiRecognition: { enabled: true, inputRole: \"design\", results: [] } };\n        bitmap.close();\n        documentState.nodes.push(node);\n      } else {\n        node.title = (chosen.name.replace(/\\.[^.]+$/, \"\") || \"图片\").slice(0, 80);\n        node.assetPath = saved.relativePath;\n        delete node.generationDraft;\n        delete node.generation;\n        delete node.sourceSnapshot;\n        delete node.sourceSnapshots;\n      }\n      await loadMedia(saved.relativePath);\n      selected.clear();\n      selected.add(node.id);\n      setError(\"\");\n      markDirty();\n      render();\n    } catch (caught) { setError(caught.message || \"图片导入失败\"); return; } finally { finishAssetImport(); }\n    selectionAction = \"\";\n    if (!request.createUiRecognition && request.nodeId) await templateWorkflow.headChanged(request.nodeId);\n  }\n  file.addEventListener(\"cancel\", function () {\n    pendingImageImport = null;\n    publishDirty();\n  });\n  file.addEventListener(\"change\", function () {\n    const chosen = file.files && file.files[0];\n    file.value = \"\";\n    const request = pendingImageImport;\n    pendingImageImport = null;\n    if (chosen) void importImageFile(chosen, request);\n  });\n  function requestVideoImport(nodeId) {\n    if (!documentState) return;\n    pendingVideoImport = { canvasId: documentState.id, nodeId: nodeId };\n    videoFile.click();\n  }\n  async function importVideoFile(chosen, request) {\n    if (!chosen || !documentState) return;\n    if (chosen.size > 100 * 1024 * 1024) { setError('视频不能超过 100 MiB。'); return; }\n    if (chosen.type && !['video/mp4', 'video/quicktime', 'video/webm'].includes(chosen.type)) { setError('只接受 MP4、MOV 或 WebM 视频。'); return; }\n    const canvasId = request && request.canvasId ? request.canvasId : documentState.id;\n    pendingAssetImports += 1;\n    publishDirty();\n    try {\n      const saved = await store.importVideo(canvasId, chosen, chosen.type || '');\n      if (!documentState || documentState.id !== canvasId) { setError('已离开原画布。视频已写入项目，但没有添加到其他画布。'); return; }\n      const target = request && request.nodeId ? documentState.nodes.find(function (item) { return item.id === request.nodeId && item.type === \"video\"; }) : null;\n      const point = request && request.point ? request.point : nextPlacement('video-source');\n      const node = target || { id: crypto.randomUUID(), type: 'video-source', x: point.x, y: point.y, width: 240, height: 210, title: (chosen.name.replace(/\\.[^.]+$/, '') || '视频').slice(0, 80), assetPath: saved.relativePath };\n      remember();\n      node.type = 'video-source';\n      node.width = 240;\n      node.height = 210;\n      node.title = (chosen.name.replace(/\\.[^.]+$/, '') || '视频').slice(0, 80);\n      node.assetPath = saved.relativePath;\n      delete node.generationDraft;\n      delete node.generation;\n      delete node.sourceSnapshot;\n      documentState.edges = documentState.edges.filter(function (edge) { return edge.to !== node.id; });\n      if (!target) documentState.nodes.push(node);\n      selected.clear();\n      selected.add(node.id);\n      setError('');\n      markDirty();\n      render();\n    } catch (caught) { setError(caught.message || '视频导入失败'); } finally { finishAssetImport(); }\n  }\n  videoFile.addEventListener(\"cancel\", function () {\n    pendingVideoImport = null;\n    publishDirty();\n  });\n  videoFile.addEventListener(\"change\", function () {\n    const chosen = videoFile.files && videoFile.files[0];\n    videoFile.value = \"\";\n    const request = pendingVideoImport;\n    pendingVideoImport = null;\n    if (chosen) void importVideoFile(chosen, request);\n  });\n  document.getElementById('undo').addEventListener('click', function () {\n    const previous = past.pop();\n    if (!previous || !documentState) return;\n    future.unshift(JSON.parse(JSON.stringify(documentState)));\n    previous.revision = documentState.revision;\n    documentState = previous;\n    markDirty();\n    render();\n  });\n  document.getElementById('redo').addEventListener('click', function () {\n    const next = future.shift();\n    if (!next || !documentState) return;\n    past.push(JSON.parse(JSON.stringify(documentState)));\n    next.revision = documentState.revision;\n    documentState = next;\n    markDirty();\n    render();\n  });\n  window.addEventListener('keydown', function (event) {\n    if (event.code === 'Space') space = true;\n    const meta = event.metaKey || event.ctrlKey;\n    if (meta && event.key === 'z') {\n      event.preventDefault();\n      document.getElementById(event.shiftKey ? 'redo' : 'undo').click();\n    }\n  });\n  window.addEventListener('keyup', function (event) { if (event.code === 'Space') space = false; });\n  document.getElementById('save').addEventListener('click', function () { void flush(); });\n  void boot().catch(function (caught) { setError(caught.message); });\n})();\n</script>\n</body>\n</html>\n";

/** Image slots, image-to-image connectors, undo/redo/fill-slot commands and host feature gating. */
function applyImageSlotPatches(source: string): string {
  let page = source;
  const patch = (search: string, replacement: string) => {
    page = replaceCanvasPageText(page, search, replacement);
  };
  patch(
    '.port { display: none !important; }',
    [
      '.port { display: none !important; }',
      '.card .port.canvas-port { display: grid !important; place-items: center; position: absolute; top: 50%; width: 22px; height: 22px; margin-top: -11px; padding: 0; border: 0; border-radius: 50%; background: #e6b15c; color: #1a1d24; font: 600 16px/1 sans-serif; z-index: 6; cursor: crosshair; touch-action: none; }',
      '.card .port.canvas-port-output { right: 2px; left: auto; }',
      '.card .port.canvas-port-input { left: 2px; right: auto; }',
    ].join('\n')
  );
  patch(
    [
      "      if (node.type === 'image' && node.assetPath) {",
      "        const port = document.createElement('button');",
      "        port.type = 'button';",
      "        port.className = 'port';",
    ].join('\n'),
    [
      "      if (node.type === 'image' && canvasFeatureEnabled(host, 'connectors')) {",
      "        const inputPort = document.createElement('button');",
      "        inputPort.type = 'button';",
      "        inputPort.className = 'port canvas-port canvas-port-input';",
      "        inputPort.textContent = '+';",
      "        inputPort.title = '点击在左侧新建图片槽连入；拖到另一张图片：把它连为当前图片的参考图';",
      "        inputPort.setAttribute('aria-label', '连接参考图');",
      "        inputPort.addEventListener('pointerdown', function (event) { if (space || handMode() || event.button === 1) return; startWire(event, node.id, true); });",
      // Pointer clicks resolve on pointerup; detail 0 is a keyboard activation that never starts a wire.
      "        inputPort.addEventListener('click', function (event) { event.stopPropagation(); if (event.detail === 0) createLinkedSlot(node.id, true); });",
      '        card.append(inputPort);',
      '        if (!node.assetPath) {',
      "          const outputPort = document.createElement('button');",
      "          outputPort.type = 'button';",
      "          outputPort.className = 'port canvas-port canvas-port-output';",
      "          outputPort.textContent = '+';",
      "          outputPort.title = '点击在右侧新建图片槽；拖到另一张图片：生成或上传后作为它的参考图';",
      "          outputPort.setAttribute('aria-label', '连接到其他图片');",
      "          outputPort.addEventListener('pointerdown', function (event) { if (space || handMode() || event.button === 1) return; startWire(event, node.id); });",
      "          outputPort.addEventListener('click', function (event) { event.stopPropagation(); if (event.detail === 0) createLinkedSlot(node.id); });",
      '          card.append(outputPort);',
      '        }',
      '      }',
      "      if (node.type === 'image' && node.assetPath) {",
      "        const port = document.createElement('button');",
      "        port.type = 'button';",
      "        port.className = canvasFeatureEnabled(host, 'connectors') ? 'port canvas-port canvas-port-output' : 'port';",
    ].join('\n')
  );
  patch(
    "port.title = '点击创建图片变体；拖到视频输入卡可设置首帧';",
    "port.title = canvasFeatureEnabled(host, 'connectors') ? '点击在右侧新建图片槽；拖到另一张图片：把它连为参考图' : '点击创建图片变体；拖到视频输入卡可设置首帧';"
  );
  patch('  function startWire(event, id) {', '  function startWire(event, id, reverse) {');
  patch(
    "    drag = { kind: 'wire', id: id, x: event.clientX, y: event.clientY, moved: false };",
    "    drag = { kind: 'wire', id: id, x: event.clientX, y: event.clientY, moved: false, reverse: Boolean(reverse) };"
  );
  patch(
    '              event.stopPropagation();\n              createImageSlot(node);',
    // Connector clicks are handled on pointerup; keep the variant click only for the default host.
    "              event.stopPropagation();\n              if (!canvasFeatureEnabled(host, 'connectors')) createImageSlot(node);\n              else if (event.detail === 0) createLinkedSlot(node.id);"
  );
  patch(
    '      if (card) connect(drag.id, card.dataset.id);\n      else if (drag.moved) {',
    [
      "      if (card) { if (card.dataset.id !== drag.id) { if (drag.reverse) connect(card.dataset.id, drag.id); else connect(drag.id, card.dataset.id); } else if (!drag.moved && canvasFeatureEnabled(host, 'connectors')) createLinkedSlot(drag.id, drag.reverse); }",
      "      else if (drag.moved && !drag.reverse && canvasFeatureEnabled(host, 'video') && documentState.nodes.some(function (item) { return item.id === drag.id && item.assetPath; })) {",
    ].join('\n')
  );
  patch(
    [
      "    if (!from || !to || from.type !== 'image' || !from.assetPath || to.type !== 'video') {",
      "      setError('首帧线只能从已导入图片连到视频输入卡。');",
    ].join('\n'),
    [
      "    if (from && to && from.type === 'image' && to.type === 'image') { connectImages(from, to, shouldRemember); return; }",
      "    if (!from || !to || from.type !== 'image' || !from.assetPath || to.type !== 'video') {",
      "      setError(canvasFeatureEnabled(host, 'video') ? '首帧线只能从已导入图片连到视频输入卡。' : '连线只能连接两张图片。');",
    ].join('\n')
  );
  patch(
    '  function createImageSlot(source) {',
    [
      '  function createLinkedSlot(id, left) {',
      '    const card = documentState && documentState.nodes.find(function (node) { return node.id === id; });',
      "    if (!card || card.type !== 'image') return;",
      "    if (documentState.nodes.length >= 400) { setError('画布卡片已达到容量限制。'); return; }",
      '    const width = 220; const height = 150; const gap = 48;',
      '    const point = { x: left ? card.x - width - gap : card.x + card.width + gap, y: card.y };',
      '    for (let tries = 0; tries < 20 && documentState.nodes.some(function (node) { return node.type !== "section" && point.x < node.x + node.width + 24 && node.x < point.x + width + 24 && point.y < node.y + node.height + 24 && node.y < point.y + height + 24; }); tries++) point.y += height + 32;',
      "    add('image', point, true);",
      '    const slot = documentState.nodes[documentState.nodes.length - 1];',
      "    slot.title = '图片生成槽 · 待生成';",
      "    slot.generationDraft = { operation: 'generate' };",
      '    if (left) connectImages(slot, card, false, true); else connectImages(card, slot, false, true);',
      '    if (documentState.edges.some(function (edge) { return edge.from === (left ? slot.id : card.id) && edge.to === (left ? card.id : slot.id); })) return;',
      '    // Connection was refused: drop the slot and its undo entry so the click leaves no trace.',
      '    const reason = error.textContent;',
      '    documentState.nodes = documentState.nodes.filter(function (node) { return node !== slot; });',
      '    past.pop(); selected.clear(); selected.add(card.id); markDirty(); render(); setError(reason);',
      '  }',
      '  function connectImages(from, to, shouldRemember, allowEmptySource) {',
      "    if (from.id === to.id) { setError('不能把图片连到自身。'); return; }",
      "    if (!from.assetPath && !allowEmptySource) { setError('请先生成或上传这张图片，再把它连为参考图。'); return; }",
      "    if (canvasNeedsProcessing(documentState, from)) { setError('请先完成参考图片的生成或处理。'); return; }",
      "    if ((generationUi && (generationUi.isNodeBusy(to.id) || generationUi.hasUnsettledResult(to.id))) || (groupQueue && groupQueue.protects(to.id))) { setError('目标图片正在生成或有未确认的任务，请稍后再连线。'); return; }",
      "    if (documentState.edges.some(function (edge) { return edge.from === from.id && edge.to === to.id; })) { setError(''); return; }",
      "    if (canvasDependents(documentState, to.id).some(function (node) { return node.id === from.id; })) { setError('连线会形成循环引用。'); return; }",
      "    const inputs = documentState.edges.filter(function (edge) { return edge.to === to.id && edge.kind === 'image-variant'; });",
      "    const implicit = !to.assetPath && to.generationDraft && to.generationDraft.sourceImageId !== from.id && !inputs.some(function (edge) { return edge.from === to.generationDraft.sourceImageId; }) && documentState.nodes.find(function (node) { return node.id === to.generationDraft.sourceImageId && node.type === 'image'; });",
      "    if (inputs.length + 1 + (implicit ? 1 : 0) + (to.referenceInput && to.referenceInput.includeSelf ? 1 : 0) > 14) { setError('参考图片最多支持 14 张。'); return; }",
      "    if (documentState.edges.length >= 799) { setError('画布连线已达到容量限制。'); return; }",
      '    if (shouldRemember !== false) remember();',
      '    if (!to.assetPath) {',
      '      // Explicit edges replace the single draft source, so every connected image is submitted in order.',
      "      if (implicit) documentState.edges.push({ id: crypto.randomUUID(), from: implicit.id, to: to.id, kind: 'image-variant' });",
      '      if (to.generationDraft) delete to.generationDraft.sourceImageId;',
      '      to.referenceInput = { includeSelf: false };',
      '    }',
      "    documentState.edges.push({ id: crypto.randomUUID(), from: from.id, to: to.id, kind: 'image-variant' });",
      '    if (to.sectionId) to.templatePending = true;',
      '    invalidateCanvasDependents(documentState, to.id);',
      "    setError('');",
      '    markDirty();',
      '    render();',
      '  }',
      '  function createImageSlot(source) {',
    ].join('\n')
  );
  patch(
    "  document.getElementById('redo').addEventListener('click', function () {\n",
    "  document.getElementById('redo').addEventListener('click', function () { redoEdit(); });\n  function redoEdit() {\n"
  );
  patch(
    '    documentState = next;\n    markDirty();\n    render();\n  });\n',
    '    documentState = next;\n    markDirty();\n    render();\n  }\n'
  );
  patch(
    "  document.getElementById('undo').addEventListener('click', function () {\n",
    "  document.getElementById('undo').addEventListener('click', function () { undoEdit(); });\n  function undoEdit() {\n"
  );
  patch(
    '    documentState = previous;\n    markDirty();\n    render();\n  });\n',
    '    documentState = previous;\n    markDirty();\n    render();\n  }\n'
  );
  patch(
    'group: createSection, connect: connect,',
    'group: createSection, connect: connect, undo: function () { const count = past.length; undoEdit(); return past.length < count; }, redo: function () { const count = future.length; redoEdit(); return future.length < count; }, fillSlot: fillImageSlot, replaceImage: function (id, assetPath) { return placeImageInCard(id, assetPath, true); }, disconnect: function (edge) { if (groupQueue && (groupQueue.protects(edge.from) || groupQueue.protects(edge.to))) return "引用卡片尚未就绪，请稍后再删除连线。"; remember(); unwireEdge(edge); },'
  );
  patch(
    '  const automation = createCanvasAutomationUi({',
    [
      '  function fillImageSlot(id, assetPath) { return placeImageInCard(id, assetPath, false); }',
      '  async function placeImageInCard(id, assetPath, replace) {',
      '    const current = documentState;',
      '    const slot = current && current.nodes.find(function (node) { return node.id === id; });',
      "    if (!slot) throw Object.assign(new Error('图片卡不存在。'), { code: 'NOT_FOUND' });",
      '    const previous = slot.assetPath;',
      "    if (slot.type !== 'image' || Boolean(previous) !== replace) throw Object.assign(new Error(replace ? '只能替换已有图片。' : '只能回填空图片槽。'), { code: 'INVALID_ARGS' });",
      "    const title = (assetPath.split('/').pop().replace(/\\.[^.]+$/, '') || '图片').slice(0, 80);",
      '    // Nothing has changed yet, so host rejections and decode failures mean "not executed".',
      "    const rejected = function (error) { if (error && !error.code) error.code = 'INVALID_ARGS'; throw error; };",
      '    const versions = store.mediaVersions ? await store.mediaVersions([assetPath]).catch(rejected) : undefined;',
      "    const prepared = await prepareCanvasImportedNode(current.id, { assetPath: assetPath, kind: 'image', title: title }, store.mediaUrl).catch(rejected);",
      "    if (prepared.type !== 'image' || !prepared.assetPath) throw Object.assign(new Error('宿主没有返回图片素材。'), { code: 'INVALID_ARGS' });",
      '    await loadMedia(prepared.assetPath);',
      "    if (documentState !== current || !current.nodes.includes(slot) || slot.assetPath !== previous) throw Object.assign(new Error('画布或图片卡已变化，未写入。'), { code: 'NOT_FOUND' });",
      '    remember();',
      '    // In place: id, position, width and connections stay; height follows the image ratio.',
      '    if (!replace) slot.title = prepared.title || title;',
      '    slot.assetPath = prepared.assetPath;',
      '    if (prepared.imageInfo) slot.imageInfo = prepared.imageInfo; else delete slot.imageInfo;',
      '    if (versions && versions[prepared.assetPath]) slot.assetVersion = { path: prepared.assetPath, version: versions[prepared.assetPath] }; else delete slot.assetVersion;',
      '    delete slot.generationDraft;',
      '    delete slot.generation;',
      '    delete slot.sourceSnapshot;',
      '    delete slot.sourceSnapshots;',
      '    fitImageCard(slot);',
      '  }',
      '  const automation = createCanvasAutomationUi({',
    ].join('\n')
  );
  patch(
    'query: generationState && generationState.canQuery && !nodeBusy ? function () { return generationUi.queryNode(node.id); } : undefined });',
    "query: generationState && generationState.canQuery && !nodeBusy ? function () { return generationUi.queryNode(node.id); } : undefined, retry: node.type === 'image' && generationState && generationState.status === 'failed' && !nodeBusy && !templateWorkflow.isMember(node.id) ? function () { return generationUi.retryImage(node.id); } : undefined });"
  );
  patch(
    '  wireUi = createCanvasWireUi({',
    [
      '  function removeEdge(edge) {',
      '    if (!documentState || documentState.edges.indexOf(edge) < 0) return;',
      "    if (['first-frame', 'image-variant'].indexOf(edge.kind) < 0) { setError('只能删除图片参考连线，派生产物来源请保留。'); return; }",
      "    if ((groupQueue && (groupQueue.protects(edge.from) || groupQueue.protects(edge.to))) || (generationUi && (generationUi.isNodeBusy(edge.to) || generationUi.hasUnsettledResult(edge.to)))) { setError('引用卡片尚未就绪，请稍后再删除连线。'); return; }",
      '    remember();',
      '    unwireEdge(edge);',
      "    setError('');",
      '    markDirty();',
      '    render();',
      '  }',
      // Shared by the wire UI and the Agent disconnect command so one host gives one result.
      '  function unwireEdge(edge) {',
      '    documentState.edges = documentState.edges.filter(function (item) { return item !== edge; });',
      '    const target = documentState.nodes.find(function (node) { return node.id === edge.to; });',
      '    const unwired = target && !documentState.edges.some(function (item) { return item.from === edge.from && item.to === edge.to; });',
      // A draft source would otherwise re-add the deleted reference on the next generation.
      '    if (unwired && target.generationDraft) { if (target.generationDraft.sourceImageId === edge.from) delete target.generationDraft.sourceImageId; if (target.generationDraft.sourceImageIds) { target.generationDraft.sourceImageIds = target.generationDraft.sourceImageIds.filter(function (id) { return id !== edge.from; }); if (!target.generationDraft.sourceImageIds.length) delete target.generationDraft.sourceImageIds; } }',
      // Local template members (no draft) keep their original upstream input rule.
      "    if (unwired && !target.assetPath && target.type === 'image' && (canvasWeb || target.generationDraft)) target.referenceInput = target.referenceInput || { includeSelf: false };",
      '    if (canvasWeb) {',
      // Web wires are relationships: forget the source snapshot so the kept image and its dependents stay current.
      '      if (unwired && target.sourceSnapshots) { target.sourceSnapshots = target.sourceSnapshots.filter(function (item) { return item.nodeId !== edge.from; }); if (!target.sourceSnapshots.length) delete target.sourceSnapshots; }',
      '      if (unwired && target.sourceSnapshot && target.sourceSnapshot.nodeId === edge.from) { if (target.sourceSnapshots) target.sourceSnapshot = target.sourceSnapshots[0]; else delete target.sourceSnapshot; }',
      '    } else {',
      '      if (target && target.sectionId) target.templatePending = true;',
      '      invalidateCanvasDependents(documentState, edge.to);',
      '    }',
      '  }',
      '  wireUi = createCanvasWireUi({',
    ].join('\n')
  );
  patch(
    '    select: function () { selected.clear(); }, remember: remember, changed: markDirty, render: render });',
    "    select: function () { selected.clear(); }, remember: remember, changed: markDirty, render: render, remove: canvasFeatureEnabled(host, 'connectors') ? removeEdge : undefined });"
  );
  patch(
    '    templateUi.context(contextMenu);',
    "    if (canvasFeatureEnabled(host, 'templates')) templateUi.context(contextMenu);"
  );
  patch(
    'resourceExport.context(contextMenu, card && selected.size === 1 ? documentState.nodes.find(function (node) { return node.id === card.dataset.id; }) : undefined);',
    "resourceExport.context(contextMenu, card && selected.size === 1 ? documentState.nodes.find(function (node) { return node.id === card.dataset.id && ((node.type === 'image' && !canvasWeb) || canvasFeatureEnabled(host, 'resourceExport')); }) : undefined);"
  );
  patch(
    '  resourceExport = createCanvasResourceExport({ deliver: deliverResource,',
    "  resourceExport = createCanvasResourceExport({ uiEditor: canvasFeatureEnabled(host, 'uiEditor'), deliver: deliverResource,"
  );
  patch(
    '      if (modelUi) modelUi.render(card, node);',
    "      if (modelUi && canvasFeatureEnabled(host, 'model3d')) modelUi.render(card, node);"
  );
  patch(
    '  void boot().catch',
    [
      "  [['templates', ['add-template']], ['uiRecognition', ['add-ui-recognition']], ['video', ['add-video-source', 'add-video', 'video-history']], ['sections', ['create-section']]].forEach(function (entry) {",
      '    if (canvasFeatureEnabled(host, entry[0])) return;',
      '    entry[1].forEach(function (id) { const element = document.getElementById(id); if (element) { element.hidden = true; element.style.display = "none"; } });',
      '  });',
      "  if (!canvasFeatureEnabled(host, 'video')) contextMenu.querySelectorAll('[data-canvas-action=\"add-video\"]').forEach(function (item) { item.remove(); });",
      '  void boot().catch',
    ].join('\n')
  );
  return page;
}
/** Web-only interaction: four-corner resize, chat/cutout actions, blank menu, fit area, dock state. */
function applyWebInteractionPatches(source: string): string {
  let page = source;
  const patch = (search: string, replacement: string) => {
    page = replaceCanvasPageText(page, search, replacement);
  };
  patch('  function startResize(event, id) {', '  function startResize(event, id, corner) {');
  patch(
    "drag = { kind: 'resize', id: id, x: event.clientX, y: event.clientY, width: node.width, height: node.height, moved: false };",
    "drag = { kind: 'resize', id: id, x: event.clientX, y: event.clientY, width: node.width, height: node.height, left: node.x, top: node.y, corner: corner || 'se', moved: false };"
  );
  patch(
    [
      '        const widthDelta = dimensions && dimensions.height > 0 && Math.abs(dy) > Math.abs(dx) ? dy * dimensions.width / dimensions.height : dx;',
      '        const markSize = node.type === "mark";',
      '        node.width = Math.min(markSize ? 8000 : 2000, Math.max(markSize ? 8 : 120, drag.width + widthDelta));',
      '        node.height = Math.min(markSize ? 8000 : 2000, Math.max(markSize ? 8 : 100, drag.height + dy));',
    ].join('\n'),
    [
      "        const corner = drag.corner || 'se'; const sx = corner.indexOf('w') >= 0 ? -1 : 1; const sy = corner.indexOf('n') >= 0 ? -1 : 1;",
      '        const ex = dx * sx; const ey = dy * sy;',
      '        const widthDelta = dimensions && dimensions.height > 0 && Math.abs(ey) > Math.abs(ex) ? ey * dimensions.width / dimensions.height : ex;',
      '        const markSize = node.type === "mark";',
      '        node.width = Math.min(markSize ? 8000 : 2000, Math.max(markSize ? 8 : 120, drag.width + widthDelta));',
      '        node.height = Math.min(markSize ? 8000 : 2000, Math.max(markSize ? 8 : 100, drag.height + ey));',
      // West/north corners pin the opposite edge, so the ratio-fitted size must be known first.
      '        if (sx < 0 || sy < 0) { fitImageCard(node); if (sx < 0) node.x = drag.left + drag.width - node.width; if (sy < 0) node.y = drag.top + drag.height - node.height; }',
    ].join('\n')
  );
  patch(
    'upload: requestImageImport, busy:',
    'upload: requestImageImport, resize: function (event, id, corner) { startResize(event, id, corner); }, busy:'
  );
  // Selection menu: optional chat hand-off and the cutout feature key.
  patch(
    "if (canvasFeatureEnabled(host, 'imageEditing')) actionButton('去纯色背景', function () { void openLocalImage(node, 'cutout'); });",
    // Web 抠图 is one click with the editor defaults; the default page keeps the full editor.
    "if (host.addToChat) { const chat = actionButton('加入对话', function () { void addSelectionToChat([node]); }); if (canvasWeb) canvasWebIconAction(chat, 'chat'); }\n        if (canvasFeatureEnabled(host, 'cutout')) { const cutout = actionButton(canvasWeb ? '抠图' : '去纯色背景', function () { if (canvasWeb) void quickCutout(node); else void openLocalImage(node, 'cutout'); }); if (canvasWeb) { canvasWebIconAction(cutout, 'cutout'); const adjust = actionButton('调整抠图', function () { void adjustCutout(node); }); adjust.classList.add('web-cutout-adjust'); canvasWebIconAction(adjust, 'chevron'); } }"
  );
  patch(
    'if (chosen.length !== 1 || !generationUi || ',
    "if (chosen.length > 1 && host.addToChat && chosen.some(function (item) { return item.type === 'image' && item.assetPath; })) { selectionToolbar.hidden = true; selectionMenu.hidden = false; const actions = document.createElement('div'); actions.className = 'selection-actions'; const button = document.createElement('button'); button.type = 'button'; button.textContent = '加入对话'; if (canvasWeb) canvasWebIconAction(button, 'chat'); button.addEventListener('click', function (event) { event.stopPropagation(); void addSelectionToChat(chosen); }); actions.append(button); selectionMenu.append(actions); positionSelectionToolbar(); return; }\n      if (chosen.length !== 1 || !generationUi || "
  );
  patch(
    [
      "    const card = world.querySelector('.card.selected');",
      '    if (!card) { selectionMenu.hidden = true; selectionToolbar.hidden = true; return; }',
      '    const bounds = board.getBoundingClientRect();',
      '    const anchor = card.getBoundingClientRect();',
    ].join('\n'),
    [
      "    const cards = Array.from(world.querySelectorAll('.card.selected'));",
      '    if (!cards.length) { selectionMenu.hidden = true; selectionToolbar.hidden = true; return; }',
      '    const bounds = board.getBoundingClientRect();',
      // A multi-selection menu centres over the whole group; one card yields its own rect.
      '    const rects = cards.map(function (item) { return item.getBoundingClientRect(); });',
      '    const anchorLeft = Math.min.apply(null, rects.map(function (rect) { return rect.left; })); const anchorTop = Math.min.apply(null, rects.map(function (rect) { return rect.top; }));',
      '    const anchorRight = Math.max.apply(null, rects.map(function (rect) { return rect.right; })); const anchorBottom = Math.max.apply(null, rects.map(function (rect) { return rect.bottom; }));',
      '    const anchor = { left: anchorLeft, top: anchorTop, right: anchorRight, bottom: anchorBottom, width: anchorRight - anchorLeft, height: anchorBottom - anchorTop };',
    ].join('\n')
  );
  patch(
    '  async function importProjectAsset(input) {',
    [
      '  async function addSelectionToChat(nodes) {',
      "    const items = nodes.filter(function (item) { return item.type === 'image' && item.assetPath && !(generationUi && generationUi.isNodeBusy(item.id)); }).map(function (item) { return { nodeId: item.id, assetPath: item.assetPath }; });",
      "    if (!items.length) { setError('请选择已有图片的卡片。'); return; }",
      "    try { await host.addToChat(items); setError('已加入对话：' + items.length + ' 张图片', 'info'); } catch (caught) { setError((caught && caught.message) || '加入对话失败'); }",
      '  }',
      '  async function addPickedProjectImages(point) {',
      '    if (!host.pickProjectImages || !documentState) return;',
      '    const reason = hostEditBlocked(); if (reason) { setError(reason); return; }',
      '    let picked;',
      "    try { picked = await host.pickProjectImages(); } catch (caught) { setError((caught && caught.message) || '素材库读取失败'); return; }",
      '    if (!Array.isArray(picked) || !picked.length) return;',
      '    const current = documentState;',
      '    let at = point || nextPlacement("image"); let added = 0;',
      '    pendingAssetImports++; publishDirty();',
      '    try {',
      '      for (const item of picked.slice(0, 20)) {',
      '        if (documentState !== current) break;',
      "        const named = typeof item.name === 'string' ? item.name.trim().replace(/\\.[^.]+$/, '') : '';",
      "        const title = (named || String(item.path || '').split('/').pop().replace(/\\.[^.]+$/, '') || '图片').slice(0, 80);",
      "        await importProjectAsset({ assetPath: item.path, kind: 'image', title: title }, at);",
      '        const node = current.nodes[current.nodes.length - 1];',
      '        at = { x: node.x + node.width + 32, y: node.y }; added++;',
      '      }',
      "      setError('');",
      "    } catch (caught) { setError((added ? '已添加 ' + added + ' 张；' : '') + ((caught && caught.message) || '素材导入失败')); }",
      '    finally { finishAssetImport(); render(); }',
      '  }',
      '  async function importProjectAsset(input, at) {',
    ].join('\n')
  );
  patch(
    'const point = nextPlacement(node.type); node.x = point.x;',
    'const point = at || nextPlacement(node.type); node.x = point.x;'
  );
  // Web image-card menu mirrors the selection icons; hidden for other cards and the blank canvas.
  patch(
    '<button type="button" data-canvas-action="duplicate" data-menu-scope="card">复制卡片</button>',
    '<button type="button" data-canvas-action="add-to-chat" data-menu-scope="image" hidden>加入对话</button><button type="button" data-canvas-action="quick-cutout" data-menu-scope="image" hidden>抠图</button><button type="button" data-canvas-action="adjust-cutout" data-menu-scope="image" hidden>调整抠图</button><button type="button" data-canvas-action="download-image" data-menu-scope="image" hidden>下载</button><button type="button" data-canvas-action="download-image-jpg" data-menu-scope="image" hidden>下载 JPG</button><button type="button" data-canvas-action="duplicate" data-menu-scope="card">复制卡片</button>'
  );
  patch(
    '    cardActions.forEach(function (item) { item.hidden = !card; });',
    [
      '    cardActions.forEach(function (item) { item.hidden = !card; });',
      '    const menuNode = card && documentState && documentState.nodes.find(function (item) { return item.id === card.dataset.id; });',
      "    contextImage = canvasWeb && menuNode && menuNode.type === 'image' && menuNode.assetPath && !(generationUi && generationUi.isNodeBusy(menuNode.id)) ? menuNode : null;",
      "    contextMenu.querySelectorAll('[data-menu-scope=image]').forEach(function (item) { const kind = item.dataset.canvasAction; item.hidden = !contextImage || (kind === 'add-to-chat' && !host.addToChat) || ((kind === 'quick-cutout' || kind === 'adjust-cutout') && !canvasFeatureEnabled(host, 'cutout')); });",
    ].join('\n')
  );
  patch(
    '  function hideContextMenu() { contextMenu.hidden = true; }',
    '  let contextImage = null;\n  function hideContextMenu() { contextMenu.hidden = true; }'
  );
  patch(
    "    if (value === 'duplicate') { duplicateSelected(); return; }",
    [
      "    if (value === 'add-to-chat') { if (contextImage && host.addToChat) void addSelectionToChat([contextImage]); return; }",
      "    if (value === 'quick-cutout') { if (contextImage) void quickCutout(contextImage); return; }",
      "    if (value === 'adjust-cutout') { if (contextImage) void adjustCutout(contextImage); return; }",
      "    if (value === 'download-image') { if (contextImage) void resourceExport.download(contextImage, 'png'); return; }",
      "    if (value === 'download-image-jpg') { if (contextImage) void resourceExport.download(contextImage, 'jpg'); return; }",
      "    if (value === 'duplicate') { duplicateSelected(); return; }",
    ].join('\n')
  );
  // Blank-canvas menu: click-point slot, local upload and the optional project-asset picker.
  patch(
    'data-canvas-action="add-generation" data-menu-scope="blank">新建图片卡片</button>',
    'data-canvas-action="add-generation" data-menu-scope="blank">新建图片卡片</button><button type="button" data-canvas-action="upload-image" data-menu-scope="blank">上传图片</button><button type="button" data-canvas-action="pick-project-images" data-menu-scope="blank">从素材库添加</button>'
  );
  patch(
    "if (value === 'add-generation') { createBlankImageSlot(); return; }",
    [
      "if (value === 'add-generation') { if (canvasWeb && pendingPlacement) createImageSlotAt(pendingPlacement); else createBlankImageSlot(); pendingPlacement = null; return; }",
      "    if (value === 'upload-image') { if (documentState) { pendingImageImport = { canvasId: documentState.id, create: true, point: pendingPlacement }; file.click(); } pendingPlacement = null; return; }",
      "    if (value === 'pick-project-images') { const point = pendingPlacement; pendingPlacement = null; void addPickedProjectImages(point); return; }",
    ].join('\n')
  );
  patch(
    "  function createBlankImageSlot() {\n    add('image', nextPlacement('image'), true);",
    "  function createBlankImageSlot() { createImageSlotAt(nextPlacement('image')); }\n  function createImageSlotAt(point) {\n    add('image', point, true);"
  );
  patch(
    'request.create && documentState && documentState.id === request.canvasId) { createBlankImageSlot();',
    'request.create && documentState && documentState.id === request.canvasId) { if (request.point) createImageSlotAt(request.point); else createBlankImageSlot();'
  );
  patch(
    "  if (!canvasFeatureEnabled(host, 'video')) contextMenu.querySelectorAll",
    [
      '  if (!canvasWeb) contextMenu.querySelectorAll(\'[data-canvas-action="upload-image"]\').forEach(function (item) { item.remove(); });',
      '  if (!host.pickProjectImages) contextMenu.querySelectorAll(\'[data-canvas-action="pick-project-images"]\').forEach(function (item) { item.remove(); });',
      "  if (!canvasFeatureEnabled(host, 'video')) contextMenu.querySelectorAll",
    ].join('\n')
  );
  // Web slots render at a CSS min size above node.width/height, so fit must use the drawn size.
  patch(
    [
      '    const right = Math.max.apply(null, documentState.nodes.map(function (node) { return node.x + node.width; }));',
      '    const bottom = Math.max.apply(null, documentState.nodes.map(function (node) { return node.y + node.height; }));',
    ].join('\n'),
    [
      "    const drawn = function (node, key) { const card = world.querySelector('.card[data-id=\"' + node.id + '\"]'); return Math.max(node[key], canvasWeb && card ? (key === 'width' ? card.offsetWidth : card.offsetHeight) : 0); };",
      "    const right = Math.max.apply(null, documentState.nodes.map(function (node) { return node.x + drawn(node, 'width'); }));",
      "    const bottom = Math.max.apply(null, documentState.nodes.map(function (node) { return node.y + drawn(node, 'height'); }));",
    ].join('\n')
  );
  // Fit: Web floats the dock (and flow bar) over the board, so fit into what stays visible.
  // The default area equals the original 32px margins; group bars are still reserved below.
  patch(
    [
      '    function place(bar) {',
      '      const scale = Math.min(4, Math.max(0.15, Math.min((board.clientWidth - 64) / width, (board.clientHeight - 64 - bar) / height)));',
      '      documentState.viewport.scale = scale;',
      '      documentState.viewport.x = (board.clientWidth - width * scale) / 2 - left * scale;',
      '      documentState.viewport.y = (board.clientHeight - bar - height * scale) / 2 - top * scale;',
    ].join('\n'),
    [
      '    const boardRect = board.getBoundingClientRect();',
      "    const area = canvasWeb ? canvasWebFitArea({ left: boardRect.left, top: boardRect.top, width: board.clientWidth, height: board.clientHeight }, Array.from(document.querySelectorAll('.workspace-toolbar, #template-flow:not([hidden])')).map(function (item) { return item.getBoundingClientRect(); }).filter(function (rect) { return rect.width > 0 && rect.height > 0; }), 32) : { x: 32, y: 32, width: board.clientWidth - 64, height: board.clientHeight - 64 };",
      '    function place(bar) {',
      '      const scale = Math.min(4, Math.max(0.15, Math.min(area.width / width, (area.height - bar) / height)));',
      '      documentState.viewport.scale = scale;',
      '      documentState.viewport.x = area.x + (area.width - width * scale) / 2 - left * scale;',
      '      documentState.viewport.y = area.y + (area.height - bar - height * scale) / 2 - top * scale;',
    ].join('\n')
  );
  // Dock save button carries the save state; the separate status glyph is hidden in Web.
  patch(
    'function setStatus(text) { status.textContent = text;',
    [
      'var canvasSaveFailed = false;',
      '  function syncCanvasSaveState(text) {',
      "    const button = canvasWeb && document.getElementById('save'); if (!button) return;",
      "    const state = text === '保存中…' ? 'saving' : text === '已保存' ? 'saved' : canvasSaveFailed ? 'failed' : 'unsaved';",
      "    const label = { saving: '正在保存…', saved: '已保存', failed: '保存失败，点击重试', unsaved: '有未保存修改，点击保存' }[state];",
      "    button.dataset.saveState = state; button.title = label; button.setAttribute('aria-label', '保存画布：' + label);",
      '  }',
      '  function setStatus(text) { syncCanvasSaveState(text); status.textContent = text;',
    ].join('\n')
  );
  patch(
    'saveFailed = false; setStatus(',
    'saveFailed = false; canvasSaveFailed = false; setStatus('
  );
  patch(
    "      setStatus('未保存');\n      saveFailed = true;",
    "      canvasSaveFailed = true; setStatus('未保存');\n      saveFailed = true;"
  );
  // Space-to-pan: a focused dock button must not swallow Space, and the dock shows the hand.
  patch(
    "if (event.target.closest && event.target.closest('textarea, input, select, button')) return;",
    [
      "if (canvasWeb && event.code === 'Space' && event.target.closest && event.target.closest('.workspace-actions button, .workspace-actions summary')) { event.preventDefault(); space = true; if (canvasMarks) canvasMarks.preview(true); return; }",
      "    if (event.target.closest && event.target.closest('textarea, input, select, button')) return;",
      "    if (canvasWeb && event.code === 'Space' && canvasMarks) canvasMarks.preview(true);",
    ].join('\n')
  );
  patch(
    "window.addEventListener('keyup', function (event) { if (event.code === 'Space') space = false; });",
    [
      "window.addEventListener('keyup', function (event) { if (event.code !== 'Space') return; space = false; if (canvasWeb && canvasMarks) { canvasMarks.preview(false); if (event.target.closest && event.target.closest('.workspace-actions button, .workspace-actions summary')) event.preventDefault(); } });",
      "  if (canvasWeb) window.addEventListener('blur', function () { space = false; if (canvasMarks) canvasMarks.preview(false); });",
    ].join('\n')
  );
  patch(
    "    if (space || event.button === 1) {\n      if (event.target.closest && event.target.closest('textarea, input, button')) return;\n",
    "    if (space || event.button === 1) {\n      if (event.target.closest && event.target.closest('textarea, input, button')) return;\n      if (canvasWeb) board.classList.add('grabbing');\n"
  );
  // The <details> menu is fixed-positioned, but the frosted menu's backdrop-filter re-anchors and clips it, so Web downloads PNG directly.
  patch(
    '        download.append(trigger, formats); actions.append(download);',
    "        if (canvasWeb) canvasWebIconAction(actionButton('下载图片', function () { void resourceExport.download(node, 'png'); }), 'download'); else { download.append(trigger, formats); actions.append(download); }"
  );
  return page;
}
export interface CanvasPageIntegration {
  /** Trusted host adapter code defining createCanvasHost(): CanvasPageHost. */
  hostScript: string;
  themeScript?: string;
}

export function getCanvasPageHtml(integration: CanvasPageIntegration): string {
  const helpers = [
    installCanvasPolyfills.toString(),
    'installCanvasPolyfills();',
    'const CANVAS_SEQUENCE_SETTING_FIELDS = ' +
      JSON.stringify(CANVAS_SEQUENCE_SETTING_FIELDS) +
      ';',
    'const CANVAS_COMMAND_ACTIONS = ' + JSON.stringify(CANVAS_COMMAND_ACTIONS) + ';',
    prepareCanvasNodeUpdatesWithValidation.toString(),
    createCanvasAutomationUiWithHost.toString(),
    validateResourceBundleStructure.toString(),
    encodeCanvasImage.toString(),
    deliverCanvasImage.toString(),
    canvasEditorLayout.toString(),
    restoreCanvasEditorDraft.toString(),
    prepareCanvasImportedNodeFromMedia.toString(),
    detectUiCutoutColorFromReader.toString(),
    uiDataHash.toString(),
    uiBundleManifestWithValidation.toString(),
    resourceBundleEntriesFromReader.toString(),
    createResourceBundleZipWithHost.toString(),
    downloadCanvasResourceWithHost.toString(),
    canvasMediaSources.toString(),
    refreshCanvasMedia.toString(),
    nextCanvasExportCode.toString(),
    validateCanvasPlatforms.toString(),
    canvasSupportsPlatform.toString(),
    canvasCapabilityReason.toString(),
    canvasFeatureEnabled.toString(),
    integration.hostScript,
    'const IMAGE_FEATURES = ' + JSON.stringify(IMAGE_FEATURES) + ';',
    imageFeatures.toString(),
    hasImageFeature.toString(),
    imageAllowsOutpaint.toString(),
    resetImageFeatureCopy.toString(),
    uiRecognitionInputs.toString(),
    uiRecognitionPreview.toString(),
    openUiBboxPreview.toString(),
    'const UI_CUT_TYPES = ' + JSON.stringify(UI_CUT_TYPES) + ';',
    validateImageAssetsInfoStructure.toString(),
    imageAssetsBindingPlanStructure.toString(),
    applyImageAssetsToDocument.toString(),
    collectImageAssetEntriesFromReader.toString(),
    validateBboxImageStructure.toString(),
    validateUiBboxStructure.toString(),
    validateUiRecognitionStructure.toString(),
    validateUiAtlasPlanStructure.toString(),
    validateBboxRect.toString(),
    validateCutElements.toString(),
    validateBboxTexts.toString(),
    scaleCutElements.toString(),
    bboxRecognitionElements.toString(),
    'const UI_ELEMENT_CATEGORIES = ' + JSON.stringify(UI_ELEMENT_CATEGORIES) + ';',
    validateUiElements.toString(),
    selectedUiRecognition.toString(),
    uiRecognitionSource.toString(),
    uiRecognitionNote.toString(),
    uiRecognitionStatus.toString(),
    uiExtractionPlan.toString(),
    selectedUiExtraction.toString(),
    setUiRecognitionMode.toString(),
    drawUiRecognition.toString(),
    createUiRecognitionUiWithHost.toString(),
    canvasWireGeometry.toString(),
    canvasWirePath.toString(),
    createCanvasWireUi.toString(),
    canvasWebCurve.toString(),
    canvasWebBox.toString(),
    canvasWebWire.toString(),
    createCanvasWebChrome.toString(),
    canvasWebSlot.toString(),
    canvasComposerKey.toString(),
    canvasWebIconAction.toString(),
    installCanvasWebTooltips.toString(),
    decorateCanvasWebCards.toString(),
    canvasWebFitArea.toString(),
    canvasWebPlacePopover.toString(),
    framePairSources.toString(),
    videoFramePair.toString(),
    validateFramePairVideo.toString(),
    validateFramePairGraph.toString(),
    setFramePairSource.toString(),
    createCanvasModelUiWithHost.toString(),
    canvasModelInput.toString(),
    canvasModelIsCurrent.toString(),
    canvasModelGroup.toString(),
    appendCanvasModelNode.toString(),
    canvasGenerationParameterChoices.toString(),
    canvasParameterSchema.toString(),
    selectCanvasSnapshot.toString(),
    canvasAutomationSnapshot.toString(),
    validateCanvasCommand.toString(),
    syncUiBboxWorkflow.toString(),
    layoutUiWorkflowGroup.toString(),
    createUi015Workflow.toString(),
    designPngData.toString(),
    prepareCanvasReferences.toString(),
    applyCanvasReferences.toString(),
    decorateCanvasCard.toString(),
    refreshCanvasGroupHeaders.toString(),
    canvasGroupState.toString(),
    'const CANVAS_MARK_COLORS = ' + JSON.stringify(CANVAS_MARK_COLORS) + ';',
    'const CANVAS_MARK_MIN = ' + CANVAS_MARK_MIN + ';',
    'const CANVAS_MARK_MAX = ' + CANVAS_MARK_MAX + ';',
    'const MARK_POINTS = ' + JSON.stringify(MARK_POINTS) + ';',
    'const MARK_DIRECTIONS = ' + JSON.stringify(MARK_DIRECTIONS) + ';',
    optionalMarkPoint.toString(),
    markNumber.toString(),
    validateCanvasMark.toString(),
    canvasMarkEnds.toString(),
    canvasMarkMoveEndpoint.toString(),
    canvasMarkResizeEdge.toString(),
    canvasMarkFromInput.toString(),
    renderCanvasMark.toString(),
    drawCanvasMark.toString(),
    createCanvasMarks.toString(),
    createCanvasWorkspace.toString(),
    createCanvasLog.toString(),
    canvasLogLevel.toString(),
    canvasCardStatus.toString(),
    renderCanvasCardStatus.toString(),
    createCanvasTemplateModel.toString(),
    'const builtinPresetDescriptions = ' + JSON.stringify(builtinPresetDescriptions) + ';',
    'const templateCategories = ' + JSON.stringify(templateCategories) + ';',
    templatePresentation.toString(),
    isBuiltinCanvasTemplate.toString(),
    createCanvasTemplateUiWithHost.toString(),
    openCanvasTemplatePreview.toString(),
    createTemplateCovers.toString(),
    'const DEFAULT_SEQUENCE_FPS = ' + DEFAULT_SEQUENCE_FPS + ';',
    'const DEFAULT_SEQUENCE_DURATION = ' + DEFAULT_SEQUENCE_DURATION + ';',
    applyFrameOperations.toString(),
    openFrameEditor.toString(),
    'const CANVAS_BACKGROUND_DEFAULTS = ' + JSON.stringify(CANVAS_BACKGROUND_DEFAULTS) + ';',
    createBackgroundRemoval.toString(),
    openBackgroundEditor.toString(),
    createFrameCollection.toString(),
    'function __name(target) { return target; }',
    'const MAX_SEQUENCE_FRAMES = ' + MAX_SEQUENCE_FRAMES + ';',
    'const MAX_SEQUENCE_SIDE = ' + MAX_SEQUENCE_SIDE + ';',
    'const MAX_SEQUENCE_SOURCE_SIDE = ' + MAX_SEQUENCE_SOURCE_SIDE + ';',
    'const MAX_SEQUENCE_PIXEL_BUDGET = ' + MAX_SEQUENCE_PIXEL_BUDGET + ';',
    'const MAX_ATLAS_SIDE = ' + MAX_ATLAS_SIDE + ';',
    'const DEFAULT_SEQUENCE_SIDE = ' + DEFAULT_SEQUENCE_SIDE + ';',
    estimateSequenceFrameCount.toString(),
    maxSequenceFrameCount.toString(),
    maxSequenceInputFrameCount.toString(),
    signatureSimilarity.toString(),
    duplicateIndicesFromSignatures.toString(),
    defaultSequenceSettings.toString(),
    sequenceActionsForCard.toString(),
    removeConnectedBackgroundPixels.toString(),
    removeChromaBackgroundPixels.toString(),
    hasOpaqueBoundary.toString(),
    backgroundColorsDiffer.toString(),
    stableBackgroundColor.toString(),
    createSequenceProcessor.toString(),
    renderSequenceResult.toString(),
    createSequenceEditor.toString(),
    appendAnimation.toString(),
    refreshAnimationFromSource.toString(),
    createAnimationCards.toString(),
    renderGenerationResult.toString(),
    videoCardSize.toString(),
    formatBuiltinPrompt.toString(),
    createPromptEditor.toString(),
    createCanvasGenerationUiWithHost.toString(),
    canvasImageTool.toString(),
    imageEditSources.toString(),
    createTemplateWorkflow.toString(),
    createCanvasZip.toString(),
    sequenceExportManifest.toString(),
    sequenceExportLua.toString(),
    sequenceExportInstructions.toString(),
    createSequenceExportFromReader.toString(),
    imageAtlasRegions.toString(),
    imageAtlasManifest.toString(),
    imageAtlasInstructions.toString(),
    createImageAtlasExport.toString(),
    openImageAtlasDialogWithHost.toString(),
    drawImageAtlasPreview.toString(),
    validateMergeIcons.toString(),
    mergeIconPrompt.toString(),
    mergeIconGrid.toString(),
    mergeIconNeedsGeneration.toString(),
    configureMergeIcons.toString(),
    editMergeIcons.toString(),
    splitImageAtlas.toString(),
    prepareImageAtlas.toString(),
    encodeImageAtlasRegions.toString(),
    findAtlasContentRegions.toString(),
    validateAtlasCrops.toString(),
    alignAtlasCells.toString(),
    alignNativeAtlasRegions.toString(),
    findNativeAtlasComponents.toString(),
    assignAtlasCellsByCenter.toString(),
    atlasLayoutError.toString(),
    selectedUiAtlasPlan.toString(),
    validateUiAtlasGroup.toString(),
    uiAtlasElementGroup.toString(),
    uiAtlasElementSlots.toString(),
    uiAtlasSheet.toString(),
    cloneUiAtlasBatch.toString(),
    `const UI_ATLAS_MAX_EDGE = ${UI_ATLAS_MAX_EDGE}; const UI_ATLAS_MAX_CELLS = ${UI_ATLAS_MAX_CELLS};`,
    uiBatchAtlasPlan.toString(),
    uiBatchAtlasPlans.toString(),
    uiNativeAtlasPlans.toString(),
    uiNativeArtTextPlan.toString(),
    uiNativeSlotPlans.toString(),
    uiNativeAtlasPrompt.toString(),
    uiWorkflowAtlasPlans.toString(),
    ensureUiAtlasBatchCards.toString(),
    uiBatchAtlasPrompt.toString(),
    uiAtlasOrderPrompt.toString(),
    uiBindingContentRect.toString(),
    validateUiNativeRegions.toString(),
    resourceBundleMembers.toString(),
    resourceBundleOwner.toString(),
    renderResourceBundle.toString(),
    addResourceBundle.toString(),
    createImageAssetsUiWithHost.toString(),
    canvasExportFormats.toString(),
    canvasExportFilename.toString(),
    canvasExportIdentity.toString(),
    createCanvasResourceExportWithHost.toString(),
    isGameUiResource.toString(),
    'const IMAGE_OUTPUT_RATIOS = ' + JSON.stringify(IMAGE_OUTPUT_RATIOS) + ';',
    'const IMAGE_COMMON_RATIOS = ' + JSON.stringify(IMAGE_COMMON_RATIOS) + ';',
    imageRatioInfo.toString(),
    resolveImageSize.toString(),
    canvasOriginalImage.toString(),
    imageResultWarning.toString(),
    imageCardSize.toString(),
    fitImageCard.toString(),
    imageSizeLabel.toString(),
    renderImageInfo.toString(),
    createImageEditing.toString(),
    applyLocalImageResult.toString(),
    createVideoHistoryUi.toString(),
    createVideoPrompts.toString(),
    videoTaskTiming.toString(),
    createCanvasGroupQueue.toString(),
    canvasFlowDuration.toString(),
    formatCanvasWorkDuration.toString(),
    renderCanvasWorkTiming.toString(),
    createCanvasGroupQueueUi.toString(),
    metadataVersion.toString(),
    canvasNodeVersion.toString(),
    isCanvasNodeStale.toString(),
    isCanvasSourceCurrent.toString(),
    snapshotCanvasSource.toString(),
    canvasReferences.toString(),
    canvasDependents.toString(),
    canvasImageHasRegeneratePath.toString(),
    canvasNeedsProcessing.toString(),
    videoInputSources.toString(),
    videoAttemptMatchesSources.toString(),
    invalidateCanvasDependents.toString(),
    createSequenceUiControllerWithMedia.toString(),
    withCanvasTimeout.toString(),
    isUiCutoutSource.toString(),
    uiCutoutRgb.toString(),
    chooseUiCutoutColor.toString(),
    uiCutoutPrompt.toString(),
    dispatchCanvasStoreRequest.toString(),
    saveAcknowledgement.toString(),
    nodesInMarquee.toString(),
    removeNodes.toString(),
  ].join('\n');
  let page = template;
  page = replaceCanvasPageText(
    page,
    '  <button id="add-image" type="button">导入图片</button>',
    '  <button id="add-image" type="button">导入图片</button>\n  <button id="add-video-source" type="button">导入视频</button>'
  );
  page = replaceCanvasPageText(
    page,
    '<input id="file" type="file" accept="image/png,image/jpeg,image/webp" hidden>',
    '<input id="file" type="file" accept="image/png,image/jpeg,image/webp" hidden>\n<input id="video-file" type="file" accept="video/mp4,video/webm,video/quicktime" hidden>\n<video id="sequence-source" hidden playsinline></video>'
  );
  page = replaceCanvasPageText(
    page,
    '<strong>创作画布</strong>',
    '<span class="canvas-heading"><strong id="canvas-title">创作画布</strong><button id="rename-canvas" type="button" title="修改画布名称" aria-label="修改画布名称"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg></button></span>'
  );
  page = replaceCanvasPageText(
    page,
    '  <button id="new-canvas" type="button">新建</button>',
    '  <button id="new-canvas" type="button">新建</button>\n  <button id="add-generation" type="button">图片生成卡</button>\n  <button id="add-ui-recognition" type="button">导入 UI 设计稿</button>\n  <button id="refresh-media" type="button">刷新素材</button><button id="fit-canvas" type="button">适配内容</button>\n  <button id="create-section" type="button">新建分区</button>\n  <button id="duplicate-selected" type="button">复制选中</button>\n  <button id="delete-selected" type="button">删除选中</button>\n  <button id="export-canvas" type="button">导出 PNG</button>'
  );
  page = replaceCanvasPageText(
    page,
    '.card p { margin: 8px 0 0; color: #b7b1a6; font-size: 13px; }',
    '.card p { margin: 8px 0 0; color: #b7b1a6; font-size: 13px; }\n.card textarea { box-sizing: border-box; width: 100%; height: calc(100% - 28px); resize: none; border: 0; background: transparent; color: inherit; font: inherit; }\n.card.video img { height: 72px; object-fit: cover; }\n.card.video-source { padding: 0; }\n.video-source-preview { display: block; width: 100%; height: 100%; object-fit: contain; background: #090a0c; }\n.card.sequence { display: flex; flex-direction: column; padding: 12px; overflow: auto; }\n.sequence-content { display: flex; flex-direction: column; gap: 8px; height: 100%; }\n.sequence-heading, .sequence-progress, .sequence-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }\n.sequence-status, .sequence-info { color: #b7b1a6; font-size: 12px; }\n.sequence-steps { display: flex; flex-wrap: wrap; gap: 5px; }\n.sequence-step { padding: 3px 6px; border-radius: 10px; background: #262a33; color: #aaa; font-size: 11px; }\n.sequence-step.active { background: #604c2b; color: #ffe2a5; }\n.sequence-step.complete { background: #254a3c; color: #b9f0d3; }\n.sequence-fields { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 6px; max-height: 108px; overflow: auto; }\n.sequence-field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #bbb; }\n.sequence-field input, .sequence-field select { min-width: 0; width: 100%; box-sizing: border-box; }\n.sequence-check { font-size: 11px; display: flex; align-items: center; gap: 4px; }\n.sequence-thumbnails, .sequence-candidates { display: flex; flex-wrap: wrap; gap: 5px; }\n.sequence-thumbnails canvas, .sequence-candidates canvas { width: 64px; height: 48px; object-fit: contain; background: #090a0c; }\n.sequence-candidates label { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; }\n.sequence-atlas { max-width: 100%; max-height: 140px; object-fit: contain; }\n.sequence-error { color: #ff9c8a; }\n.sequence-actions button { background: #1c1f26; color: inherit; border: 1px solid #3a3f4a; border-radius: 6px; padding: 5px 8px; }\n.sequence-progress { font-size: 12px; }\n.sequence-progress progress { flex: 1; }\n.resize-handle { position: absolute; right: 2px; bottom: 2px; width: 14px; height: 14px; padding: 0; border: 0; background: #e6b15c; cursor: nwse-resize; }\n#board.drop-target { outline: 2px solid #e6b15c; outline-offset: -4px; }'
  );
  page = replaceCanvasPageText(
    page,
    '  const store = host.store;',
    [
      '  const store = host.store;',
      '  const { createCanvasTemplateUi, createUiRecognitionUi, createCanvasAutomationUi, createCanvasModelUi, prepareCanvasImportedNode, createSequenceUiController, createCanvasGenerationUi, createImageAssetsUi, downloadCanvasResource, createCanvasResourceExport, validateUiAtlasPlan } = host;',
      '  let pendingExports = 0; let resourceExport;',
      '  async function refreshSources(node) { const current = documentState; if (!current) return; const changed = await refreshCanvasMedia(current, store, canvasMediaSources(current, node)); if (current !== documentState) throw new Error("画布已切换。"); for (const node of current.nodes) if (node.assetPath) media[node.assetPath] = store.mediaUrl(node.assetPath); if (changed) markDirty(); render(); }',
      '  async function deliverExport(request) { pendingExports++; publishDirty(); try { return await host.deliverExport(request); } finally { pendingExports--; publishDirty(); } }',
      '  function deliverResource(request, node) { const current = documentState; const identities = function () { return JSON.stringify(current && canvasMediaSources(current, node).map(function (node) { return [node.id, node.assetPath, node.assetVersion]; })); }; const before = identities(); return deliverExport({ ...request, produce: async function () { await refreshSources(node); if (current !== documentState || before !== identities()) throw new Error("素材内容或引用已变化，请核对画布后重新导出。"); return request.produce(); } }); }',
      '  const backgroundRemoval = createBackgroundRemoval(); const frameCollection = createFrameCollection();',
      '  const sequenceProcessor = createSequenceProcessor({ backgroundRemoval, maxSourceSide: MAX_SEQUENCE_SOURCE_SIDE, maxOutputSide: MAX_SEQUENCE_SIDE, maxAtlasSide: MAX_ATLAS_SIDE, estimateFrameCount: estimateSequenceFrameCount, maxAtlasFrameCount: maxSequenceFrameCount, duplicateFrameIndices: duplicateIndicesFromSignatures });',
      '  let sequenceUi = null; let generationUi = null;',
      "  const selectionToolbar = document.getElementById('selection-toolbar');",
      "  const selectionMenu = document.getElementById('selection-menu');",
      "  let selectionAction = '';",
      '  [selectionToolbar, selectionMenu].forEach(function (surface) {',
      "    surface.addEventListener('pointerdown', function (event) { event.stopPropagation(); });",
      "    surface.addEventListener('wheel', function (event) { event.stopPropagation(); }, { passive: true });",
      "    surface.addEventListener('contextmenu', function (event) { event.stopPropagation(); });",
      '  });',
      '  function positionSelectionToolbar() {',
      '    if (selectionMenu.hidden && selectionToolbar.hidden) return;',
      "    const card = world.querySelector('.card.selected');",
      '    if (!card) { selectionMenu.hidden = true; selectionToolbar.hidden = true; return; }',
      '    const bounds = board.getBoundingClientRect();',
      '    const anchor = card.getBoundingClientRect();',
      '    const gap = 12;',
      '    const cardLeft = anchor.left - bounds.left;',
      '    const cardTop = anchor.top - bounds.top;',
      '    selectionMenu.style.maxWidth = Math.max(0, bounds.width - gap * 2) + "px";',
      '    const menuWidth = selectionMenu.offsetWidth;',
      '    const menuHeight = selectionMenu.offsetHeight;',
      '    const menuTop = Math.max(gap, cardTop - menuHeight - gap);',
      '    const rail = document.querySelector(".workspace-toolbar")?.getBoundingClientRect();',
      '    const menuMinLeft = rail && menuTop < rail.bottom - bounds.top && menuTop + menuHeight > rail.top - bounds.top ? Math.max(gap, rail.right - bounds.left + gap) : gap;',
      '    selectionMenu.style.maxWidth = Math.max(0, bounds.width - menuMinLeft - gap) + "px";',
      '    const menuLeft = cardLeft + (anchor.width - menuWidth) / 2;',
      '    selectionMenu.style.left = Math.max(menuMinLeft, Math.min(menuLeft, bounds.width - menuWidth - gap)) + "px";',
      '    selectionMenu.style.top = menuTop + "px";',
      '    if (selectionToolbar.hidden) return;',
      // Web: a left-docked rail narrows the usable board, so the composer never spills past the right edge.
      '    const dockInset = canvasWeb && rail && rail.left - bounds.left < bounds.width / 2 ? Math.max(0, rail.right - bounds.left) : 0;',
      '    selectionToolbar.style.width = Math.min(canvasWeb ? Math.max(640, anchor.width + 80) : 440, Math.max(0, bounds.width - dockInset - gap * 2)) + "px";',
      '    selectionToolbar.style.maxHeight = Math.max(0, bounds.height - gap * 2) + "px";',
      '    const width = selectionToolbar.offsetWidth;',
      '    const height = selectionToolbar.offsetHeight;',
      '    let left = canvasWeb ? cardLeft + (anchor.width - width) / 2 : cardLeft;',
      '    let top = anchor.bottom - bounds.top + gap;',
      '    if (canvasWeb && top + height > bounds.height - gap) {',
      '      top = cardTop - (selectionMenu.hidden ? 0 : menuHeight + gap) - gap - height;',
      '      const minLeft = Math.max(gap, dockInset + gap);',
      '      selectionToolbar.style.left = Math.max(minLeft, Math.min(left, bounds.width - width - gap)) + "px";',
      '      selectionToolbar.style.top = Math.max(gap, Math.min(top, bounds.height - height - gap)) + "px";',
      '      canvasWebPlacePopover(selectionToolbar, bounds, gap);',
      '      return;',
      '    }',
      '    if (top + height > bounds.height - gap) {',
      '      if (anchor.right - bounds.left + gap + width <= bounds.width - gap) {',
      '        left = anchor.right - bounds.left + gap; top = cardTop;',
      '      } else if (cardLeft - gap - width >= gap) {',
      '        left = cardLeft - gap - width; top = cardTop;',
      '      } else { top = cardTop - menuHeight - gap * 2 - height; }',
      '    }',
      '    // The wide Web composer must clear the floating tool rail, as the selection menu does.',
      '    const toolbarMinLeft = canvasWeb && rail && top < rail.bottom - bounds.top && top + height > rail.top - bounds.top ? Math.max(gap, rail.right - bounds.left + gap) : gap;',
      '    selectionToolbar.style.left = Math.max(toolbarMinLeft, Math.min(left, bounds.width - width - gap)) + "px";',
      '    selectionToolbar.style.top = Math.max(gap, Math.min(top, bounds.height - height - gap)) + "px";',
      '    if (canvasWeb) canvasWebPlacePopover(selectionToolbar, bounds, gap);',
      '  }',
      '  const selectionResize = new ResizeObserver(positionSelectionToolbar);',
      "  selectionResize.observe(document.getElementById('board'));",
      '  selectionResize.observe(selectionToolbar);',
      '  selectionResize.observe(selectionMenu);',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  const file = document.getElementById('file');",
    "  const file = document.getElementById('file');\n  const videoFile = document.getElementById('video-file');\n  const sequenceVideo = document.getElementById('sequence-source');"
  );
  page = replaceCanvasPageText(
    page,
    '  const selected = new Set();',
    '  const selected = new Set();\n  const videoDimensions = new Map();\n  let pendingAssetImports = 0;\n  let pendingImageImport = null;\n  let pendingVideoImport = null;\n  const pendingImportWaiters = [];\n  host.publishActivity(false);'
  );
  page = replaceCanvasPageText(
    page,
    '  let opening = null;',
    [
      '  let opening = null;',
      '  let activeCanvasWrite = Promise.resolve();',
      '  function persistActiveCanvas(id) {',
      '    const next = activeCanvasWrite.catch(function () {}).then(function () { return store.setActiveCanvasId(id); });',
      '    activeCanvasWrite = next;',
      '    return next;',
      '  }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    [
      "      if (node.type === 'note') {",
      "        const text = document.createElement('p');",
      "        text.textContent = node.text || '便签';",
      '        card.append(text);',
      '      }',
    ].join('\n'),
    [
      "      if (node.type === 'note') {",
      "        const editor = document.createElement('textarea');",
      "        editor.value = node.text || '便签';",
      "        editor.setAttribute('aria-label', '便签内容');",
      "        editor.addEventListener('focus', function () { editor.dataset.historyRecorded = ''; editor.dataset.originalValue = node.text || '便签'; });",
      "        editor.addEventListener('input', function () {",
      '          if (editor.value === node.text) return;',
      "          if (!editor.dataset.historyRecorded && editor.value !== editor.dataset.originalValue) { remember(); editor.dataset.historyRecorded = 'true'; }",
      '          node.text = editor.value;',
      '          markDirty();',
      '        });',
      "        editor.addEventListener('pointerdown', function (event) { event.stopPropagation(); });",
      '        card.append(editor);',
      '      }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    [
      "      if (node.type === 'video') {",
      "        const hint = document.createElement('p');",
      "        hint.textContent = '视频输入卡。生视频将在下一阶段接入。';",
      '        card.append(hint);',
      '      }',
    ].join('\n'),
    [
      "      if (node.type === 'video') {",
      '        const edge = documentState.edges.find(function (item) { return item.to === node.id; });',
      '        const source = edge && documentState.nodes.find(function (item) { return item.id === edge.from; });',
      '        if (source && source.assetPath && media[source.assetPath]) {',
      "          const preview = document.createElement('img');",
      "          preview.alt = '首帧来源：' + source.title;",
      '          preview.src = media[source.assetPath];',
      '          card.append(preview);',
      '        }',
      "        const hint = document.createElement('p');",
      "        hint.textContent = source ? '首帧：' + source.title : '拖入已导入图片作为首帧，然后在卡片内生成视频。';",
      '        card.append(hint);',
      '        if (edge) {',
      "          const disconnect = document.createElement('button');",
      "          disconnect.type = 'button';",
      "          disconnect.textContent = '断开首帧';",
      "          disconnect.addEventListener('click', function (event) { event.stopPropagation(); remember(); documentState.edges = documentState.edges.filter(function (item) { return item.id !== edge.id; }); markDirty(); render(); });",
      '          card.append(disconnect);',
      '        }',
      '      }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "      if (node.type === 'image' && node.assetPath) {\n        const port = document.createElement('button');",
    [
      "      if (node.type === 'video-source' && node.assetPath) {",
      "        const player = document.createElement('video');",
      "        player.className = 'video-source-preview';",
      '        player.controls = true;',
      "        player.preload = 'metadata';",
      '        player.playsInline = true;',
      "        player.addEventListener('pointerdown', function (event) {",
      '          if (handMode() || event.button !== 0 || selected.has(node.id) || generationUi && generationUi.isNodeBusy(node.id) || templateWorkflow && templateWorkflow.locked(node.id)) return;',
      "          selected.clear(); selected.add(node.id); selectionAction = '';",
      "          world.querySelectorAll('.card.selected').forEach(function (item) { item.classList.remove('selected'); });",
      "          card.classList.add('selected'); renderSelectionToolbar();",
      '        });',
      '        player.src = media[node.assetPath] || store.mediaUrl(node.assetPath);',
      "        player.addEventListener('loadedmetadata', function () {",
      '          if (!card.isConnected || !documentState.nodes.includes(node)) return;',
      '          videoDimensions.set(node.assetPath, { width: player.videoWidth, height: player.videoHeight });',
      '          if (fitVideoCard(node)) render();',
      '        });',
      '        card.append(player);',
      '      }',
      "      if (node.type === 'sequence') {",
      '        const sourceVideo = documentState.nodes.find(function (item) { return item.id === node.sourceVideoId; });',
      '        sequenceUi.renderCard(card, node, sourceVideo);',
      '      }',
      "      if (node.type === 'image' && node.assetPath) {",
      "        const port = document.createElement('button');",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "        port.addEventListener('pointerdown', function (event) { startWire(event, node.id); });",
    [
      "        port.addEventListener('pointerdown', function (event) { startWire(event, node.id); });",
      "            port.addEventListener('click', function (event) {",
      '              event.stopPropagation();',
      '              createImageSlot(node);',
      '            });',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "      card.addEventListener('pointerdown', function (event) {",
    [
      "      if (node.type !== 'mark' || node.mark?.shape === 'ellipse') {",
      "      const resizeHandle = document.createElement('button');",
      "      resizeHandle.type = 'button';",
      "      resizeHandle.className = 'resize-handle';",
      "      resizeHandle.setAttribute('aria-label', '调整卡片大小');",
      "      resizeHandle.addEventListener('pointerdown', function (event) { startResize(event, node.id); });",
      '      card.append(resizeHandle); }',
      "      card.addEventListener('pointerdown', function (event) {",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "        if (event.target.classList.contains('port')) return;",
    "        if (event.target.closest('textarea, input, select, button, video')) return;"
  );
  page = replaceCanvasPageText(
    page,
    [
      '    if (!shift) selected.clear();',
      '    if (selected.has(id) && shift) selected.delete(id);',
      '    else selected.add(id);',
    ].join('\n'),
    [
      '    if (shift && selected.has(id)) selected.delete(id);',
      '    else {',
      '      if (!shift && !selected.has(id)) selected.clear();',
      '      selected.add(id);',
      '    }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "    const node = documentState.nodes.find(function (item) { return item.id === id; });\n    drag = { kind: 'move', id: id, x: event.clientX, y: event.clientY, ox: node.x, oy: node.y, moved: false };",
    [
      '    const dragged = documentState.nodes.find(function (item) { return item.id === id; });',
      "    const dragIds = dragged && dragged.type === 'section' ? documentState.nodes.filter(function (item) { return item.sectionId === id || item.id === id; }).map(function (item) { return item.id; }) : Array.from(selected);",
      '    const positions = documentState.nodes.filter(function (item) { return dragIds.indexOf(item.id) >= 0; }).map(function (item) { return { id: item.id, x: item.x, y: item.y }; });',
      '    if (!positions.some(function (item) { return item.id === id; })) return;',
      "    drag = { kind: 'move', x: event.clientX, y: event.clientY, positions: positions, moved: false };",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function startWire(event, id) {',
    [
      '  function startResize(event, id) {',
      '    if (handMode()) return;',
      '    event.stopPropagation();',
      '    const node = documentState.nodes.find(function (item) { return item.id === id; });',
      "    drag = { kind: 'resize', id: id, x: event.clientX, y: event.clientY, width: node.width, height: node.height, moved: false };",
      '    board.setPointerCapture(event.pointerId);',
      '  }',
      '  function startWire(event, id) {',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "    drag = { kind: 'wire', id: id };",
    "    drag = { kind: 'wire', id: id, x: event.clientX, y: event.clientY, moved: false };"
  );
  page = replaceCanvasPageText(
    page,
    [
      '      const node = documentState.nodes.find(function (item) { return item.id === drag.id; });',
      '      node.x = drag.ox + dx;',
      '      node.y = drag.oy + dy;',
    ].join('\n'),
    [
      '      for (const position of drag.positions) {',
      '        const node = documentState.nodes.find(function (item) { return item.id === position.id; });',
      '        if (node) { node.x = position.x + dx; node.y = position.y + dy; }',
      '      }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "    } else if (drag.kind === 'marquee') {",
    [
      "    } else if (drag.kind === 'resize') {",
      '      const dx = (event.clientX - drag.x) / documentState.viewport.scale;',
      '      const dy = (event.clientY - drag.y) / documentState.viewport.scale;',
      '      if (!drag.moved && Math.hypot(dx, dy) > 2) { remember(); drag.moved = true; }',
      '      if (drag.moved) {',
      '        const node = documentState.nodes.find(function (item) { return item.id === drag.id; });',
      "        const dimensions = node.type === 'image' && node.assetPath ? node.imageInfo : node.type === 'video-source' && (videoDimensions.get(node.assetPath) || node.videoInfo);",
      '        const widthDelta = dimensions && dimensions.height > 0 && Math.abs(dy) > Math.abs(dx) ? dy * dimensions.width / dimensions.height : dx;',
      '        const markSize = node.type === "mark";',
      '        node.width = Math.min(markSize ? 8000 : 2000, Math.max(markSize ? 8 : 120, drag.width + widthDelta));',
      '        node.height = Math.min(markSize ? 8000 : 2000, Math.max(markSize ? 8 : 100, drag.height + dy));',
      '        markDirty();',
      '        render();',
      '      }',
      "    } else if (drag.kind === 'wire') {",
      '      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true;',
      "    } else if (drag.kind === 'marquee') {",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function connect(fromId, toId) {',
    '  function connect(fromId, toId, shouldRemember) {'
  );
  page = replaceCanvasPageText(
    page,
    '    remember();\n    documentState.edges = documentState.edges.filter(function (edge) { return edge.to !== toId; });',
    [
      "    if (documentState.edges.some(function (edge) { return edge.to === toId && edge.from === fromId; })) { setError(''); return; }",
      '    if (shouldRemember !== false) remember();',
      '    documentState.edges = documentState.edges.filter(function (edge) { return !(edge.to === toId && edge.from === fromId); });',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function add(type, point) {\n    remember();',
    [
      '  function createImageSlot(source) {',
      "    add('image', { x: source.x + source.width + 48, y: source.y }, true);",
      '    const slot = documentState.nodes.find(function (item) { return selected.has(item.id); });',
      '    if (!slot) return;',
      "    slot.title = '图片变体 · 待生成';",
      "    slot.generationDraft = { operation: 'variant', sourceImageId: source.id };",
      "    setError('已创建图片生成槽：填写提示词后点击“生成”。');",
      '    render();',
      '  }',
      '  function createVideoSlot(source) {',
      "    if (!documentState || !source || !source.assetPath) { setError('请先选择一张已保存的图片。'); return; }",
      "    selectionAction = selectionAction === 'video' ? '' : 'video'; render();",
      '  }',
      '  function createBlankImageSlot() {',
      "    add('image', nextPlacement('image'), true);",
      '    const slot = documentState.nodes.find(function (item) { return selected.has(item.id); });',
      '    if (!slot) return;',
      "    slot.title = '图片生成槽 · 待生成';",
      "    slot.generationDraft = { operation: 'generate' };",
      '    render();',
      '  }',
      '  function nextPlacement(type) {',
      "    const width = type === 'sequence' ? 480 : type === 'note' ? 180 : type === 'video' ? 220 : 240;",
      "    const height = type === 'sequence' ? 300 : type === 'note' ? 120 : type === 'video' ? 150 : type === 'video-source' ? 210 : 190;",
      '    const view = documentState.viewport;',
      '    const centerX = (board.clientWidth / 2 - view.x) / view.scale - width / 2;',
      '    const centerY = (board.clientHeight / 2 - view.y) / view.scale - height / 2;',
      '    const minimumX = (24 - view.x) / view.scale;',
      '    const maximumX = (board.clientWidth - 24 - view.x) / view.scale - width;',
      '    const minimumY = (24 - view.y) / view.scale;',
      '    const maximumY = (board.clientHeight - 24 - view.y) / view.scale - height;',
      '    const offsets = [0, -1, 1, -2, 2, -3, 3, -4, 4];',
      '    for (let row = 0; row < 12; row++) {',
      '      const y = centerY + row * (height + 32);',
      '      if (y < minimumY || y > maximumY) continue;',
      '      for (const offset of offsets) {',
      '        const candidate = { x: centerX + offset * (width + 32), y: y };',
      '        if (candidate.x < minimumX || candidate.x > maximumX) continue;',
      '        const free = documentState.nodes.every(function (node) { return candidate.x + width + 24 <= node.x || node.x + node.width + 24 <= candidate.x || candidate.y + height + 24 <= node.y || node.y + node.height + 24 <= candidate.y; });',
      '        if (free) return candidate;',
      '      }',
      '    }',
      '    const bottom = Math.max(centerY, ...documentState.nodes.map(function (node) { return node.y + node.height; }));',
      '    return { x: centerX, y: bottom + 32 };',
      '  }',
      '  function add(type, point, shouldRemember) {',
      '    if (shouldRemember !== false) remember();',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('add-note').addEventListener('click', function () { add('note', { x: 80, y: 80 }); });",
    "  document.getElementById('add-note').addEventListener('click', function () { add('note', nextPlacement('note')); });"
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('add-video').addEventListener('click', function () { add('video', { x: 360, y: 80 }); });",
    "  document.getElementById('add-video').addEventListener('click', function () { add('video', nextPlacement('video')); });"
  );
  page = replaceCanvasPageText(
    page,
    [
      "    if (drag.kind === 'wire') {",
      '      const hit = document.elementFromPoint(event.clientX, event.clientY);',
      "      const card = hit && hit.closest ? hit.closest('[data-id]') : null;",
      '      if (card) connect(drag.id, card.dataset.id);',
      '    }',
    ].join('\n'),
    [
      "    if (drag.kind === 'wire') {",
      '      const hit = document.elementFromPoint(event.clientX, event.clientY);',
      "      const card = hit && hit.closest ? hit.closest('[data-id]') : null;",
      '      if (card) connect(drag.id, card.dataset.id);',
      '      else if (drag.moved) {',
      '        const point = localPoint(event);',
      '        const x = (point.x - documentState.viewport.x) / documentState.viewport.scale;',
      '        const y = (point.y - documentState.viewport.y) / documentState.viewport.scale;',
      "        add('video', { x: x, y: y }, true);",
      '        connect(drag.id, selected.values().next().value, false);',
      '      }',
      '    }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function publishDirty() {\n    host.publishUnsaved(dirty());\n  }',
    [
      '  function publishDirty() {',
      '    const sequenceRunning = Boolean((groupQueue && groupQueue.isBusy) || (imageEditing && imageEditing.isBusy) || (videoHistory && videoHistory.isBusy) || (sequenceUi && sequenceUi.isBusy) || (templateWorkflow && templateWorkflow.isBusy) || (generationUi && generationUi.isBusy));',
      '    const pendingFrames = Boolean(sequenceUi && sequenceUi.hasUnsavedFrames);',
      '    host.publishActivity(sequenceRunning, pendingAssetImports > 0 || sequenceRunning);',
      '    host.publishUnsaved(dirty() || pendingAssetImports > 0 || sequenceRunning || pendingFrames);',
      '  }',
      '  function waitForPendingAssets() {',
      '    if (!pendingAssetImports) return Promise.resolve();',
      '    return new Promise(function (resolve) { pendingImportWaiters.push(resolve); });',
      '  }',
      '  function finishAssetImport() {',
      '    pendingAssetImports -= 1;',
      '    publishDirty();',
      '    if (!pendingAssetImports) pendingImportWaiters.splice(0).forEach(function (resolve) { resolve(); });',
      '  }',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  async function saveOnce() {',
    [
      '  function deleteSelected() {',
      '    if (!documentState || !selected.size) return;',
      '    const queued = Boolean(groupQueue && Array.from(selected).some(function (id) { return groupQueue.protects(id); }));',
      '    if (queued && !confirm("所选卡片正在执行，删除后将停止相关后续并忽略迟到结果，已提交远端任务不会取消。继续删除？")) return;',
      '    if (protectTemplateSelection()) return;',
      "    if (!sequenceUi.deleteNodes(Array.from(selected))) { setError('拆帧任务运行中，请先取消后再删除。'); return; }",
      '    if (groupQueue) groupQueue.remove(Array.from(selected));',
      '    remember();',
      '    documentState = removeNodes(documentState, Array.from(selected));',
      '    if (documentState.templateFlow && documentState.templateFlow.stage === "complete") delete documentState.templateFlow;',
      '    selected.clear();',
      '    markDirty();',
      '    render();',
      '  }',
      '  function createSection() {',
      "    const members = documentState && documentState.nodes.filter(function (node) { return selected.has(node.id) && node.type !== 'section'; });",
      "    if (!members || !members.length) { setError('请先选择要放入分区的卡片。'); return; }",
      '    if (groupQueue && members.some(function (node) { return groupQueue.protects(node.id); })) { setError("请先停止相关队列，再调整分组。"); return; }',
      '    const padding = 28;',
      '    const left = Math.min.apply(null, members.map(function (node) { return node.x; })) - padding;',
      '    const top = Math.min.apply(null, members.map(function (node) { return node.y; })) - padding - 28;',
      '    const right = Math.max.apply(null, members.map(function (node) { return node.x + node.width; })) + padding;',
      '    const bottom = Math.max.apply(null, members.map(function (node) { return node.y + node.height; })) + padding;',
      '    remember();',
      "    const section = { id: crypto.randomUUID(), type: 'section', x: left, y: top, width: Math.max(240, right - left), height: Math.max(160, bottom - top), title: '新分区' };",
      '    documentState.nodes.push(section);',
      '    members.forEach(function (node) { node.sectionId = section.id; });',
      '    selected.clear(); selected.add(section.id); markDirty(); render();',
      '  }',
      '  function duplicateSelected() {',
      '    if (protectTemplateSelection()) return;',
      "    if (!documentState || !selected.size) { setError('请先选择要复制的卡片。'); return; }",
      "    const copies = documentState.nodes.filter(function (node) { return selected.has(node.id) && node.type !== 'section'; }).map(function (node) {",
      '      const copy = JSON.parse(JSON.stringify(node));',
      '      resetImageFeatureCopy(copy, false);',
      '      copy.id = crypto.randomUUID(); copy.x += 36; copy.y += 36; delete copy.sectionId; delete copy.templatePending;',
      "      if (copy.generation) copy.generation = { prompt: copy.generation.prompt, operation: 'generate' };",
      '      return copy;',
      '    });',
      "    if (!copies.length) { setError('当前选择没有可复制的卡片。'); return; }",
      '    remember(); documentState.nodes.push.apply(documentState.nodes, copies); selected.clear(); copies.forEach(function (node) { selected.add(node.id); }); markDirty(); render();',
      '  }',
      '  async function exportCanvasPng() {',
      '    if (!documentState) return;',
      '    const snapshot = structuredClone(documentState);',
      "    const nodes = snapshot.nodes.filter(function (node) { return node.type !== 'section'; }).sort(function (left, right) { return (left.type === 'mark' ? 1 : 0) - (right.type === 'mark' ? 1 : 0); });",
      "    if (!nodes.length) { setError('画布没有可导出的内容。'); return; }",
      '    return deliverResource({ filename: (snapshot.title || "canvas") + ".png", mime: "image/png", produce: async function () {',
      '    const left = Math.min.apply(null, nodes.map(function (node) { return node.x; })) - 32;',
      '    const top = Math.min.apply(null, nodes.map(function (node) { return node.y; })) - 32;',
      '    const right = Math.max.apply(null, nodes.map(function (node) { return node.x + node.width; })) + 32;',
      '    const bottom = Math.max.apply(null, nodes.map(function (node) { return node.y + node.height; })) + 32;',
      '    const scale = Math.min(2, 2400 / Math.max(1, right - left), 1600 / Math.max(1, bottom - top));',
      "    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round((right - left) * scale)); canvas.height = Math.max(1, Math.round((bottom - top) * scale));",
      "    const context = canvas.getContext('2d'); context.fillStyle = '#101114'; context.fillRect(0, 0, canvas.width, canvas.height); context.font = '14px sans-serif';",
      '    for (const node of nodes) {',
      '      const x = (node.x - left) * scale; const y = (node.y - top) * scale; const width = node.width * scale; const height = node.height * scale;',
      "      if (node.type === 'mark') { drawCanvasMark(context, node, x, y, width, height); continue; }",
      "context.fillStyle = '#1a1d24'; context.strokeStyle = '#3d4250'; context.lineWidth = Math.max(1, scale); context.fillRect(x, y, width, height); context.strokeRect(x, y, width, height);",
      "      context.fillStyle = '#f4f1ea'; context.fillText(node.title || '未命名', x + 8 * scale, y + 18 * scale);",
      "      if (node.assetPath && media[node.assetPath] && (node.type === 'image' || node.type === 'sequence')) {",
      '        await new Promise(function (resolve) { const image = new Image(); image.onload = function () { const ratio = Math.min((width - 16 * scale) / image.naturalWidth, (height - 32 * scale) / image.naturalHeight); const drawWidth = image.naturalWidth * ratio; const drawHeight = image.naturalHeight * ratio; context.drawImage(image, x + (width - drawWidth) / 2, y + 24 * scale + (height - 24 * scale - drawHeight) / 2, drawWidth, drawHeight); resolve(); }; image.onerror = resolve; image.src = media[node.assetPath]; });',
      "      } else { context.fillStyle = '#b7b1a6'; context.fillText(node.type === 'video-source' ? '视频结果' : node.type === 'animation' ? '序列帧动画' : node.text || '', x + 8 * scale, y + 42 * scale); }",
      '    }',
      '    return new Promise(function (resolve, reject) { canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error("画布截图编码失败。")); }, "image/png"); });',
      '    } });',
      '  }',
      '  async function saveOnce() {',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function markDirty() {',
    [
      '  function fitAll() {',
      '    if (!documentState) return;',
      '    if (!documentState.nodes.length) { documentState.viewport = { x: 0, y: 0, scale: 1 }; markDirty(); render(); return; }',
      '    const left = Math.min.apply(null, documentState.nodes.map(function (node) { return node.x; }));',
      '    const top = Math.min.apply(null, documentState.nodes.map(function (node) { return node.y; }));',
      '    const right = Math.max.apply(null, documentState.nodes.map(function (node) { return node.x + node.width; }));',
      '    const bottom = Math.max.apply(null, documentState.nodes.map(function (node) { return node.y + node.height; }));',
      '    const width = Math.max(1, right - left);',
      '    const height = Math.max(1, bottom - top);',
      '    // Group bars hang below their group at screen size and get taller when the zoom narrows',
      '    // them: place, measure at the new zoom, and place again until the bar fits (a few rounds).',
      '    function barHeight() { return Math.max.apply(null, [0].concat(Array.from(world.querySelectorAll(".group-queue")).map(function (item) { return item.offsetHeight + 12; }))); }',
      '    function place(bar) {',
      '      const scale = Math.min(4, Math.max(0.15, Math.min((board.clientWidth - 64) / width, (board.clientHeight - 64 - bar) / height)));',
      '      documentState.viewport.scale = scale;',
      '      documentState.viewport.x = (board.clientWidth - width * scale) / 2 - left * scale;',
      '      documentState.viewport.y = (board.clientHeight - bar - height * scale) / 2 - top * scale;',
      '      markDirty();',
      '      render();',
      '    }',
      '    let reserved = barHeight();',
      '    place(reserved);',
      '    for (let round = 0; round < 4 && barHeight() > reserved + 1; round++) { reserved = barHeight(); place(reserved); }',
      '  }',
      '  function markDirty() {',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '    documentState = loaded;',
    [
      '    const recovered = host.recoverDraft ? await host.recoverDraft(structuredClone(loaded)) : null;',
      '    if (opening !== token) return;',
      '    const restored = restoreCanvasEditorDraft(loaded, recovered);',
      '    sequenceUi.clear();',
      '    documentState = restored.document;',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '    select.value = id;',
    "    if (!Array.from(select.options).some(function (option) { return option.value === id; })) { const option = document.createElement('option'); option.value = id; select.append(option); }\n    select.value = id;\n    document.getElementById('canvas-title').textContent = documentState.title;\n    select.options[select.selectedIndex].textContent = documentState.title;"
  );
  page = replaceCanvasPageText(
    page,
    "    setError('');\n    render();\n  }\n  async function leaveCurrent() {",
    "    if (generationUi && !dirty()) await generationUi.restore().catch(function () {});\n    setError(dirty() ? '已恢复未保存编辑，请手动保存；版本冲突时请先保留草稿。' : '');\n    void persistActiveCanvas(id).catch(function (caught) { if (opening === token) setError(caught.message); });\n    render();\n  }\n  async function leaveCurrent() {"
  );
  page = replaceCanvasPageText(
    page,
    '    const id = documentState && documentState.id;\n    const ok = await flush();',
    [
      '    const id = documentState && documentState.id;',
      '    if (generationUi && generationUi.isBusy) { setError("生成任务正在运行，请等待完成后再切换画布。"); return false; }',
      '    if (groupQueue && groupQueue.isBusy) { setError("请先停止分组队列，再切换画布。"); return false; }',
      '    if (imageEditing && imageEditing.isBusy || videoHistory && videoHistory.isBusy) { setError("请先完成或关闭当前编辑／查询。"); return false; }',
      "    if (templateWorkflow && templateWorkflow.isBusy) { setError('模板流程正在运行，请等待本轮完成。'); return false; }",
      "    if (sequenceUi.isBusy) { setError('拆帧正在运行，请先等待或取消当前步骤。'); return false; }",
      "    if (sequenceUi.hasUnsavedFrames) { setError('帧集尚未保存，请先保存帧集或放弃本次处理。'); return false; }",
      '    await waitForPendingAssets();',
      '    const ok = await flush();',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('new-canvas').addEventListener('click', function () {",
    [
      "  document.getElementById('rename-canvas').addEventListener('click', function () {",
      '    if (!documentState) return;',
      "    const value = window.prompt('画布名称', documentState.title);",
      '    if (value === null) return;',
      '    const title = value.trim().slice(0, 80);',
      "    if (!title) { setError('画布名称不能为空。'); return; }",
      '    if (title === documentState.title) return;',
      '    remember();',
      '    documentState.title = title;',
      '    select.options[select.selectedIndex].textContent = title;',
      "    document.getElementById('canvas-title').textContent = title;",
      "    setError('');",
      '    markDirty();',
      '  });',
      "  document.getElementById('fit-canvas').addEventListener('click', fitAll);",
      "  document.getElementById('add-generation').addEventListener('click', createBlankImageSlot);",
      "  document.getElementById('create-section').addEventListener('click', createSection);",
      "  document.getElementById('duplicate-selected').addEventListener('click', duplicateSelected);",
      "  document.getElementById('delete-selected').addEventListener('click', deleteSelected);",
      "  document.getElementById('export-canvas').addEventListener('click', function () { void exportCanvasPng().catch(function (caught) { setError(caught.message); }); });",
      "  document.getElementById('new-canvas').addEventListener('click', function () {",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  window.addEventListener('keydown', function (event) {\n    if (event.code === 'Space') space = true;",
    "  window.addEventListener('keydown', function (event) {\n    if (event.target.closest && event.target.closest('textarea, input, select, button')) return;\n    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); return; }\n    if (event.code === 'Space') space = true;"
  );
  page = replaceCanvasPageText(
    page,
    "if (meta && event.key === 'z')",
    "if (meta && event.key.toLowerCase() === 'z')"
  );
  page = page.replace(
    'header { display: flex; gap: 8px;',
    'header { display: flex; flex-wrap: wrap; gap: 8px;'
  );
  page = page.replace(
    '</style>',
    [
      '.sequence-sampling { display: flex; align-items: center; gap: 8px; color: #d6d0c4; font-size: 12px; }',
      '.sequence-sampler { max-width: 55%; max-height: 96px; width: auto; height: auto; border: 1px solid #6a707e; object-fit: contain; cursor: crosshair; }',
      '.sequence-thumbnails { flex-wrap: nowrap; overflow-x: auto; min-height: 76px; }',
      '.sequence-frame-tile { flex: 0 0 auto; margin: 0; text-align: center; color: #a8a399; font-size: 10px; }',
      '.sequence-frame-tile figcaption { line-height: 1.2; }',
      '.sequence-candidates { max-height: 90px; overflow: auto; align-content: flex-start; }',
      '.card img.sequence-atlas { display: block; width: auto; height: auto; max-width: 100%; max-height: 88px; object-fit: contain; }',
      '.sequence-output-frames { display: flex; flex-wrap: nowrap; gap: 4px; overflow-x: auto; min-height: 58px; }',
      '.sequence-output-frames canvas { width: 48px; height: 48px; background: #090a0c; object-fit: contain; }',
      '.sequence-content { min-height: 0; }',
      '.generation-panel { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }',
      '.generation-prompt { width: 100%; box-sizing: border-box; background: #11141a; color: inherit; border: 1px solid #3a3f4a; border-radius: 5px; padding: 5px 6px; }',
      '.generation-mode { width: 100%; box-sizing: border-box; background: #11141a; color: inherit; border: 1px solid #3a3f4a; border-radius: 5px; padding: 5px 6px; }',
      '.generation-actions { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; }',
      '.generation-action { min-width: 0; background: #20242d; color: #e8e3d8; border: 1px solid #414957; border-radius: 7px; padding: 6px 5px; font-size: 11px; cursor: pointer; }',
      '.generation-action:hover { background: #2b313d; border-color: #d1a75e; }',
      '.generation-action-primary { background: #5b4728; border-color: #c99649; color: #fff1cf; }',
      '.generation-action:disabled { cursor: wait; opacity: .55; }',
      '.generation-status { color: #b7b1a6; font-size: 12px; }',
      '.generation-credits { position:absolute; top:8px; right:8px; max-width:calc(100% - 16px); box-sizing:border-box; padding:3px 7px; border-radius:5px; background:#171b24dc; color:#e5dfd2; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '.image-size-info { position:absolute; left:6px; bottom:6px; max-width:calc(100% - 24px); padding:3px 6px; border-radius:4px; background:#171b24dc; color:#d8d4ca; font-size:10px; pointer-events:none; }',
      '.generation-status-failed, .generation-status-unknown { color: #ff9c8a; }',
      '.generation-status-succeeded { color: #b9f0d3; }',
      '.generation-status-running { color: #f1d18f; }',
      '.generation-error { color: #ffb2a5; font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }',
      '.card.section { background: rgba(92,76,43,.18); border: 1px dashed #b58c4a; z-index: 0; }',
      '.card.section strong { color: #f1d18f; }',
      '.card.section p { color: #c5b58e; }',
      '.resource-bundle-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); align-items:start; gap:12px; padding:12px 0; max-height:300px; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; } .resource-bundle-category.large { grid-column:1/-1; } .resource-bundle-category summary { cursor:pointer; margin-top:6px; font-size:12px; } .resource-bundle-category { background:#ffffff08; border:1px solid #ffffff12; border-radius:8px; padding:10px; } .resource-bundle-category strong { font-size:14px; } .resource-bundle-category span { float:right; font-size:12px; color:#b7b1a6; } .resource-bundle-previews { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; margin-top:8px; } .card .resource-bundle-previews img { width:100%; height:60px; object-fit:contain; } .card .resource-bundle-category.large img { height:100px; }',
      '</style>',
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '  function localPoint(event) {',
    [
      '  function worldPoint(event) {',
      '    const point = localPoint(event);',
      '    return { x: (point.x - documentState.viewport.x) / documentState.viewport.scale, y: (point.y - documentState.viewport.y) / documentState.viewport.scale };',
      '  }',
      '  function localPoint(event) {',
    ].join('\n')
  );

  page = replaceCanvasPageText(
    page,
    [
      '    if (event.target !== board && event.target !== world) return;',
      '    if (space || event.button === 1) {',
      "      drag = { kind: 'pan', x: event.clientX, y: event.clientY, ox: documentState.viewport.x, oy: documentState.viewport.y };",
      '      return;',
      '    }',
    ].join('\n'),
    [
      '    if (handMode() && event.button === 0) {',
      '      if (drag) return;',
      "      drag = { kind: 'pan', x: event.clientX, y: event.clientY, ox: documentState.viewport.x, oy: documentState.viewport.y };",
      '      board.setPointerCapture(event.pointerId);',
      '      return;',
      '    }',
      '    if (space || event.button === 1) {',
      "      if (event.target.closest && event.target.closest('textarea, input, button')) return;",
      "      drag = { kind: 'pan', x: event.clientX, y: event.clientY, ox: documentState.viewport.x, oy: documentState.viewport.y };",
      '      board.setPointerCapture(event.pointerId);',
      '      return;',
      '    }',
      '    if (event.target !== board && event.target !== world) return;',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    [
      '    const point = localPoint(event);',
      "    drag = { kind: 'marquee', x: point.x, y: point.y };",
      '    selected.clear();',
      '    render();',
    ].join('\n'),
    [
      '    const point = localPoint(event);',
      '    const additive = event.shiftKey || event.metaKey || event.ctrlKey;',
      "    drag = { kind: 'marquee', x: point.x, y: point.y, additive: additive };",
      '    if (!additive) selected.clear();',
      '    render();',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '      selected.clear();\n      for (const id of nodesInMarquee',
    '      if (!drag.additive) selected.clear();\n      for (const id of nodesInMarquee'
  );
  page = replaceCanvasPageText(
    page,
    [
      "        if (event.target.closest('textarea, input, select, button, video')) return;",
      '        selectNode(node.id, event.shiftKey);',
      '        startDrag(event, node.id);',
    ].join('\n'),
    [
      "        if (event.target.closest('textarea, input, select, button, video')) return;",
      '        if (space || handMode() || event.button !== 0) return;',
      '        selectNode(node.id, event.shiftKey || event.metaKey || event.ctrlKey);',
      '        startDrag(event, node.id);',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "port.addEventListener('pointerdown', function (event) { startWire(event, node.id); });",
    "port.addEventListener('pointerdown', function (event) { if (space || handMode() || event.button === 1) return; startWire(event, node.id); });"
  );
  page = replaceCanvasPageText(
    page,
    '    previous.revision = documentState.revision;\n    documentState = previous;',
    '    previous.revision = documentState.revision;\n    previous.viewport = { ...documentState.viewport };\n    documentState = previous;'
  );
  page = replaceCanvasPageText(
    page,
    '    next.revision = documentState.revision;\n    documentState = next;',
    '    next.revision = documentState.revision;\n    next.viewport = { ...documentState.viewport };\n    documentState = next;'
  );
  page = page.replace(
    "if (meta && event.key === 'z')",
    "if (meta && event.key.toLowerCase() === 'z')"
  );

  page = page.replace(
    'await openDocument(list[0].id);',
    [
      'const activeId = await store.getActiveCanvasId();',
      'const selectedId = list.some(function (item) { return item.id === activeId; }) ? activeId : list[0].id;',
      'await openDocument(selectedId);',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('save').addEventListener('click', function () { void flush(); });",
    [
      '  sequenceUi = createSequenceUiController({',
      '    store: store,',
      '    processor: sequenceProcessor,',
      '    renderCard: renderSequenceResult,',
      '    onOpen: function (id) { sequenceEditor.open(id); },',
      '    resolveTarget: function (id, type, targetId) { return templateWorkflow.resolveTarget(id, type, targetId); },',
      '    onSaved: function (id) { return templateWorkflow.nodeChanged(id); },',
      '    onChange: function (id) { sequenceEditor.refresh(id); },',
      '    onAnimation: async function (id) {',
      '      const source = documentState.nodes.find(function (node) { return node.id === id; });',
      '      if (!source || !source.frameSetInfo || !source.assetPath) return;',
      '      const decision = templateWorkflow.resolveTarget(id, "animation");',
      '      if (decision && decision.kind === "blocked") { setError(decision.message); return; }',
      '      remember();',
      '      const node = appendAnimation(documentState, id, crypto.randomUUID(), crypto.randomUUID(), decision && decision.kind === "reuse" ? decision.nodeId : undefined);',
      '      if (!node) { setError("动画来源或目标已变化，请重新打开卡片。"); return; }',
      '      selected.clear(); selected.add(node.id); markDirty(); render();',
      '      await templateWorkflow.nodeChanged(node.id);',
      '    },',
      '    getDocument: function () { return documentState; },',
      '    createId: function () { return crypto.randomUUID(); },',
      '    nextPlacement: nextPlacement,',
      '    video: sequenceVideo,',
      '    remember: remember,',
      '    markDirty: markDirty,',
      '    flush: flush,',
      '    render: render,',
      '    refreshCard: function () { render(); },',
      '    publishState: publishDirty,',
      '    setError: setError,',
      '    defaultSettings: defaultSequenceSettings,',
      '    estimateFrameCount: estimateSequenceFrameCount,',
      '    maxFrameCount: maxSequenceFrameCount,',
      '    maxInputFrameCount: maxSequenceInputFrameCount,',
      '  });',
      '  generationUi = createCanvasGenerationUi({',
      '    web: canvasWeb,',
      '    videoPrompts: createVideoPrompts(),',
      '    referencesBlocked: function () { return canvasAutomationBusy || generationUi.isBusy || groupQueue.isBusy; },',
      '    store: store,',
      '    getDocument: function () { return documentState; },',
      '    getSelected: function () { return selected; },',
      '    remember: remember,',
      '    markDirty: markDirty,',
      '    flush: flush,',
      '    render: render,',
      '    nextPlacement: nextPlacement,',
      '    loadMedia: loadMedia,',
      '    requestImageImport: requestImageImport,',
      '    requestVideoImport: requestVideoImport,',
      '    setError: setError,',
      '    log: function (message, level) { canvasLogs.add(message, level); },',
      '    createId: function () { return crypto.randomUUID(); },',
      '    resolveTarget: function (id, type, targetId) { return templateWorkflow.resolveTarget(id, type, targetId); },',
      '    onVideoCreated: function (id) { selected.clear(); selected.add(id); selectionAction = ""; },',
      '    onGenerateStart: function () { selectionAction = ""; },',
      '    onGenerated: async function (id, kind) { selectionAction = ""; selected.clear(); selected.add(id); render(); if (kind === "image") await templateWorkflow.headChanged(id); if (kind === "video") await templateWorkflow.videoChanged(id); },',
      '  });',
      '  templateWorkflow = createTemplateWorkflow({',
      '    getDocument: function () { return documentState; }, save: flush, changed: markDirty, render: render, error: setError,',
      '    confirm: function (message) { return window.confirm(message); },',
      '    isNodeBusy: function (id) { return generationUi.isNodeBusy(id) || sequenceUi.isNodeBusy(id); },',
      '    hasUnsettledResult: function (id) { return generationUi.hasUnsettledResult(id); },',
      '    isQueued: function (id) { return Boolean(groupQueue && groupQueue.protects(id)); },',
      '    hasFailure: function (id) { return Boolean(generationUi.nodeState(id)) || sequenceUi.view(id).run?.status === "failed"; },',
      '    failure: function (id) { return generationUi.failure(id); },',
      '    completed: function (id) { if (groupQueue) groupQueue.completed(id); },',
      '    video: function (id, duration, confirmed) { return generationUi.runTemplateVideo(id, duration, confirmed, canvasAutomationBusy); }, sequence: sequenceUi.runTemplate, importImage: requestImageImport,',
      '    image: function (id, automatic) { return uiRecognitionUi.runImage(id, function () { return generationUi.runTemplateImage(id); }, Boolean((groupQueue && groupQueue.isBusy) || canvasAutomationBusy), automatic); },',
      '    assets: function (id) { return uiRecognitionUi.runAssets(id, function () { return imageAssetsUi.runSavedGrid(id); }); },',
      '    refreshAnimation: function (id) { if (!refreshAnimationFromSource(documentState, id)) throw new Error("动画来源图集或连线尚未就绪。"); markDirty(); },',
      '    select: function (id) { selected.clear(); selected.add(id); render(); },',
      '    animation: function (flow) {',
      '      past = []; future = [];',
      '      const node = appendAnimation(documentState, flow.sequenceId, crypto.randomUUID(), crypto.randomUUID(), flow.animationId);',
      '      if (!node) throw new Error("动画来源图集或连线尚未就绪。");',
      '      flow.animationId = node.id;',
      '      markDirty();',
      '    }',
      '  });',
      "  document.getElementById('save').addEventListener('click', function () { void flush(); });",
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '  let sequenceUi = null; let generationUi = null;',
    '  let sequenceUi = null; let generationUi = null; let sequenceEditor; let templateWorkflow = null; let imageEditing = null; let videoHistory = null; let groupQueue = null; let groupQueueUi = null; let modelUi = null; let imageAssetsUi = null; let canvasAutomationBusy = false; let canvasOpening = 0;'
  );
  page = replaceCanvasPageText(
    page,
    '  async function saveOnce() {',
    [
      '  let pendingSave = null;',
      '  let saveFailed = false;',
      '  function saveOnce() {',
      '    if (!pendingSave) pendingSave = saveSnapshot().finally(function () { pendingSave = null; });',
      '    return pendingSave;',
      '  }',
      '  async function saveSnapshot() {',
      '    if (groupQueue) groupQueue.checkpoint();',
      '    const peer = peerBlock();',
      '    if (peer) { setStatus("未保存"); setError(peer); return false; }',
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(page, '      return !ack.pending;', '      return true;');
  page = page.replace(
    '  void boot().catch',
    '  sequenceEditor = createSequenceEditor({ maxFrames: MAX_SEQUENCE_FRAMES, controller: sequenceUi, frameCollection, backgroundRemoval, openBackgroundEditor, openFrameEditor, mediaUrl: store.mediaUrl, actions: sequenceActionsForCard }); void boot().catch'
  );
  page = page.replace(
    "window.addEventListener('keydown', function (event) {",
    "window.addEventListener('keydown', function (event) { if (sequenceEditor && sequenceEditor.isOpen) return;"
  );
  page = page.replace(
    '</style>',
    SEQUENCE_EDITOR_STYLES +
      '.sequence-editor[aria-label="本地图片编辑"] { width: min(560px, calc(100vw - 32px)); height: auto; padding: 20px; box-sizing: border-box; }' +
      '#peer-block { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 60; display: flex; gap: 12px; align-items: center; max-width: min(760px, calc(100% - 32px)); box-sizing: border-box; padding: 10px 14px; border-radius: 8px; background: #8a2c1c; color: #fff4ea; font-size: 13px; line-height: 1.5; box-shadow: 0 6px 18px rgba(0,0,0,.35); }' +
      '#peer-block[hidden] { display: none; }' +
      '#board[data-peer-blocked] #world { pointer-events: none; opacity: .6; }' +
      '#peer-block button { flex: none; border: 1px solid #ffd2c2; border-radius: 6px; background: transparent; color: inherit; padding: 4px 10px; cursor: pointer; }' +
      '</style>'
  );
  page = replaceCanvasPageText(
    page,
    '  const store = host.store;',
    [
      '  const store = host.store;',
      '  const animationCards = createAnimationCards(store.mediaUrl, function (animationId) {',
      '    if (!documentState) return;',
      '    remember();',
      "    if (!refreshAnimationFromSource(documentState, animationId)) { setError('序列帧来源不存在，无法刷新动画。'); return; }",
      '    markDirty();',
      '    render();',
      '  });',
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '    world.replaceChildren();',
    '    animationCards.beginRender(documentState.nodes); world.replaceChildren();'
  );
  page = replaceCanvasPageText(
    page,
    "      if (node.type === 'sequence') {",
    "      if (node.type === 'animation') animationCards.render(card, node, documentState.nodes.find(function (source) { return documentState.edges.some(function (edge) { return edge.kind === 'sequence-animation' && edge.from === source.id && edge.to === node.id; }) && source.type === 'sequence'; }));\n      if (node.type === 'sequence') {"
  );
  page = replaceCanvasPageText(
    page,
    '    for (const node of documentState.nodes) {',
    "    const orderedNodes = documentState.nodes.filter(function (node) { return !resourceBundleOwner(documentState, node.id) || selected.has(node.id); }).sort(function (left, right) { return (left.type === 'section' ? -1 : 0) - (right.type === 'section' ? -1 : 0); });\n    for (const node of orderedNodes) {\n      if (node.type === 'video-source') fitVideoCard(node);\n      if (fitImageCard(node)) { markDirty(); if (node.sectionId && layoutUiWorkflowGroup(documentState, node.sectionId)) requestAnimationFrame(render); }"
  );
  page = replaceCanvasPageText(
    page,
    '  function render() {',
    [
      '  function fitVideoCard(node) {',
      '    const dimensions = videoDimensions.get(node.assetPath) || node.videoInfo;',
      '    if (!dimensions) return false;',
      '    const size = videoCardSize(node.width, dimensions.width, dimensions.height);',
      '    if (!size || Math.abs(size.width - node.width) < .01 && Math.abs(size.height - node.height) < .01) return false;',
      '    node.width = size.width; node.height = size.height;',
      '    markDirty();',
      '    return true;',
      '  }',
      '  function render() {',
    ].join('\n')
  );
  // The browser page receives helper functions through `toString()`.  When
  // tsx transpiles a helper, references to imported modules are emitted as
  // `import_<module>.<export>`, but those module namespaces do not exist in
  // the standalone browser script.  Every referenced export is injected into
  // the same helper scope above, so strip only the generated namespace prefix
  // before embedding the source.
  const helperSource = helpers.replace(/\bimport_[A-Za-z0-9_$]+\./g, '');
  page = replaceCanvasPageText(
    page,
    "      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 40) + ' ' + y1 + ', ' + (x2 - 40) + ' ' + y2 + ', ' + x2 + ' ' + y2);",
    "      path.setAttribute('d', canvasWirePath(from, to, documentState.nodes, view, documentState.edges, edge.route));"
  );
  page = replaceCanvasPageText(
    page,
    '      const to = documentState.nodes.find(function (node) { return node.id === edge.to; });',
    '      if (resourceBundleOwner(documentState, edge.from) && !selected.has(edge.from)) continue; const to = (!selected.has(edge.to) && resourceBundleOwner(documentState, edge.to)) || documentState.nodes.find(function (node) { return node.id === edge.to; });'
  );
  page = replaceCanvasPageText(
    page,
    '    wires.replaceChildren();',
    [
      '    wires.replaceChildren();',
      "    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');",
      `    defs.innerHTML = '<marker id="canvas-wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="context-stroke" stroke-width="2" /></marker>';`,
      '    wires.append(defs);',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "      path.setAttribute('class', 'wire');",
    [
      '      const related = selected.has(from.id) || selected.has(to.id) || selected.has(from.sectionId) || selected.has(to.sectionId);',
      "      path.setAttribute('class', 'wire' + (selected.size ? (related ? ' wire-focused' : ' wire-muted') : ''));",
      '      path.dataset.from = from.id; path.dataset.to = to.id;',
      "      path.setAttribute('marker-end', 'url(#canvas-wire-arrow)');",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '.wire { fill: none; stroke: #d7b56d; stroke-width: 2; }',
    '.wire { fill: none; stroke: #d7b56d; stroke-width: 2; stroke-linejoin: round; opacity: .65; } .wire-focused { stroke: #ffe0a0; stroke-width: 3; opacity: 1; } .wire-muted { opacity: .12; }'
  );
  page = replaceCanvasPageText(
    page,
    '      card.append(title);',
    "      if (node.type !== 'image' || !node.assetPath) card.append(title); if (node.type === 'section') { const info = document.createElement('p'); info.textContent = documentState.nodes.filter(function (item) { return item.sectionId === node.id; }).length + ' 个节点'; card.append(info); } if (node.type === 'image' && !node.assetPath) { const empty = document.createElement('button'); empty.type = 'button'; empty.className = 'image-empty'; empty.setAttribute('aria-label', '导入图片'); empty.innerHTML = '<span>＋</span><small>图片</small>'; empty.addEventListener('click', function (event) { event.stopPropagation(); selectNode(node.id, false); requestImageImport(node.id); }); card.append(empty); }"
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);\n    }\n    wires.setAttribute',
    [
      '      world.append(card);',
      '      if (node.type === "image" && node.assetPath) renderImageInfo(card, generationUi.imageTarget(node), node, function () {',
      '        if (!card.isConnected || !documentState || !documentState.nodes.includes(node)) return;',
      '        if (fitImageCard(node)) { markDirty(); if (node.sectionId) layoutUiWorkflowGroup(documentState, node.sectionId); requestAnimationFrame(render); }',
      '      });',
      '    }',
      '    function renderSelectionToolbar() {',
      '      selectionToolbar.replaceChildren();',
      '      selectionMenu.replaceChildren();',
      '      const chosen = documentState.nodes.filter(function (item) { return selected.has(item.id); });',
      '      if (chosen.length === 1 && ["section", "resource-bundle"].includes(chosen[0].type) && canvasFeatureEnabled(host, "resourceExport") && resourceBundleMembers(documentState, chosen[0].id).length) { selectionToolbar.hidden = true; selectionMenu.hidden = false; const actions = document.createElement("div"); actions.className = "selection-actions"; const button = document.createElement("button"); button.type = "button"; button.textContent = chosen[0].type === "resource-bundle" ? "导出已完成素材" : "导出资源包"; button.onclick = function () { void resourceExport.download(chosen[0], "bundle"); }; actions.append(button); if (chosen[0].type === "section" && !resourceBundleMembers(documentState, chosen[0].id).some(function (member) { return resourceBundleOwner(documentState, member.id); })) { const merge = document.createElement("button"); merge.type = "button"; merge.textContent = "汇总资源"; merge.onclick = function () { remember(); const bundle = addResourceBundle(documentState, chosen[0].id); selected.clear(); selected.add(bundle.id); markDirty(); render(); }; actions.append(merge); } selectionMenu.append(actions); positionSelectionToolbar(); return; }',
      '      if (chosen.length === 1 && chosen[0].type === "mark") { selectionToolbar.hidden = true; selectionMenu.hidden = false; const actions = document.createElement("div"); actions.className = "selection-actions"; const label = document.createElement("span"); label.className = "selection-label"; label.textContent = "颜色"; actions.append(label); for (const color of CANVAS_MARK_COLORS) { const button = document.createElement("button"); button.type = "button"; button.className = "mark-color"; button.title = color; button.setAttribute("aria-label", "标注颜色 " + color); button.setAttribute("aria-pressed", String(chosen[0].mark && chosen[0].mark.color === color)); button.style.background = color; button.addEventListener("click", function (event) { event.stopPropagation(); if (!chosen[0].mark || chosen[0].mark.color === color) return; remember(); chosen[0].mark.color = color; markDirty(); render(); }); actions.append(button); } selectionMenu.append(actions); positionSelectionToolbar(); return; }',
      "      if (chosen.length !== 1 || !generationUi || !['image', 'video', 'video-source'].includes(chosen[0].type)) { selectionMenu.hidden = true; selectionToolbar.hidden = true; return; }",
      '      const node = chosen[0];',
      '      const nodeBusy = Boolean((modelUi && modelUi.protects(node.id)) || (generationUi && generationUi.isNodeBusy(node.id)) || (templateWorkflow && templateWorkflow.isNodeLoading(node.id)) || (canvasCutoutBusy && canvasCutoutBusy.has(node.id)));',
      '      const remoteState = generationUi.nodeState(node.id);',
      '      const workflowMember = templateWorkflow.isMember(node.id);',
      '      const restricted = workflowMember && (templateWorkflow.status(node.id) === "pending" || remoteState && ["failed", "unknown", "canceled", "timedout"].includes(remoteState.status));',
      '      const adjusting = selectionAction === "workflow" && templateWorkflow.canAdjust(node.id);',
      '      if (nodeBusy || node.type === "image" && remoteState && ["running", "pending", "unknown", "canceled"].includes(remoteState.status) || templateWorkflow.locked(node.id) && !adjusting) { selectionMenu.hidden = true; selectionToolbar.hidden = true; return; }',
      "      const emptyImage = node.type === 'image' && !node.assetPath;",
      '      selectionMenu.hidden = emptyImage || restricted;',
      '      const panelOpen = restricted ? adjusting : emptyImage || Boolean(selectionAction);',
      '      selectionToolbar.hidden = !panelOpen;',
      "      const actions = document.createElement('div'); actions.className = 'selection-actions';",
      "      function actionButton(text, action, active, unavailable) { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; if (active) button.className = 'active'; if (unavailable) { button.disabled = true; button.title = unavailable; } button.addEventListener('click', function (event) { event.stopPropagation(); action(); }); actions.append(button); return button; }",
      "      if (node.type === 'image' && !emptyImage) {",
      '        for (const feature of canvasFeatureEnabled(host, "uiRecognition") ? imageFeatures(node) : []) for (const action of feature.actions) {',
      '          if (action === "recognize-ui") { const button = actionButton(node.uiRecognition?.pendingId ? "查询识图" : node.uiRecognition?.optional ? "生成 / 重试 Bbox" : "识别 UI", function () { void uiRecognitionUi.runRecognition(node).catch(function (error) { setError(error.message); }); }, false, (!node.uiRecognition?.pendingId && canvasCapabilityReason(store, "recognition")) || (uiRecognitionUi.isBusy ? "识图进行中" : undefined)); if (!node.uiRecognition?.optional && !node.uiRecognition?.pendingId && !canvasCapabilityReason(store, "recognition")) { button.hidden = true; if (store.recognitionModels) void store.recognitionModels().then(function (models) { if (!button.isConnected) return; button.hidden = !models.some(function (model) { return model.source === "custom" || model.source === "server"; }); positionSelectionToolbar(); }).catch(function (error) { if (button.isConnected) setError(error.message); }); } }',
      '          if (action === "view-bbox" && uiRecognitionPreview(documentState, node)) actionButton("查看标注", function () { void uiRecognitionUi.openPreview(node).catch(function (error) { setError(error.message); }); });',
      '        }',
      "        if (templateWorkflow.canEditImage(node.id)) actionButton('替换图片', function () { requestImageImport(node.id); });",
      "        if (canvasFeatureEnabled(host, 'imageEditing')) actionButton('快速编辑', function () { selectionAction = selectionAction === 'image' ? '' : 'image'; render(); }, selectionAction === 'image');",
      "        if (canvasFeatureEnabled(host, 'video')) actionButton('视频生成', function () { createVideoSlot(node); }, selectionAction === 'video');",
      "        if (canvasFeatureEnabled(host, 'imageEditing')) actionButton('去纯色背景', function () { void openLocalImage(node, 'cutout'); });",
      "        if (canvasFeatureEnabled(host, 'imageEditing') && imageAllowsOutpaint(node)) actionButton('扩展画面（AI）', function () { selectionAction = selectionAction === 'outpaint' ? '' : 'outpaint'; render(); }, selectionAction === 'outpaint');",
      "        if (canvasFeatureEnabled(host, 'imageEditing')) actionButton('本地编辑', function () { void openLocalImage(node, 'edit'); });",
      "        const download = document.createElement('details'); download.className = 'image-download';",
      "        const trigger = document.createElement('summary'); trigger.setAttribute('aria-label', '下载图片'); trigger.title = '下载图片'; trigger.innerHTML = '<svg width=18 height=18 viewBox=\"0 0 24 24\" fill=none stroke=currentColor stroke-width=1.8 aria-hidden=true><path d=\"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5\"/></svg>';",
      "        const formats = document.createElement('div'); formats.className = 'image-download-options';",
      "        ['png', 'jpg'].forEach(function (format) {",
      "          const item = document.createElement('button'); item.type = 'button'; item.textContent = '导出为 ' + format.toUpperCase();",
      "          item.addEventListener('click', function () { download.open = false; void resourceExport.download(node, format); });",
      '          formats.append(item);',
      '        });',
      "        download.addEventListener('toggle', function () { if (!download.open) return; const rect = trigger.getBoundingClientRect(); formats.style.left = Math.max(8, rect.right - 144) + 'px'; formats.style.top = rect.bottom + 6 + 'px'; });",
      '        download.append(trigger, formats); actions.append(download);',
      '      }',
      "      else if (node.type !== 'image') { const editingTemplateVideo = node.type === 'video-source' && templateWorkflow && templateWorkflow.canEditVideo(node.id); actionButton(editingTemplateVideo ? '编辑视频' : '生成视频', function () { selectionAction = selectionAction === 'video' ? '' : 'video'; render(); }, selectionAction === 'video'); if (node.type === 'video-source' && node.assetPath && canvasFeatureEnabled(host, 'sequence')) actionButton('拆序列帧', function () { sequenceUi.createFromVideo(node.id); }); }",
      '      selectionMenu.append(actions);',
      "      if (panelOpen) { const panel = document.createElement('div'); panel.className = 'selection-panel'; const panelNode = node.type === 'image' && selectionAction === 'video' ? { id: 'video-draft:' + node.id, type: 'video', draftSourceId: node.id } : node; const workflowEdit = workflowMember && panelNode === node ? { canSubmit: !templateWorkflow.waitingForSource(node.id), submit: function (execute) { return templateWorkflow.runFrom(node.id, execute); } } : undefined; generationUi.render(panel, panelNode, documentState.nodes, selectionAction === 'outpaint' ? 'outpaint' : undefined, workflowEdit); selectionToolbar.append(panel); }",
      '      positionSelectionToolbar();',
      '    }',
      '    renderSelectionToolbar();',
      '    wires.setAttribute',
    ].join('\n')
  );
  page = page
    .split("event.target.closest('textarea, input, select, button, video')")
    .join("event.target.closest('textarea, input, select, button, video, details')");
  page = page.replace(
    '  <button id="new-canvas" type="button">新建</button>',
    '  <select id="new-canvas" aria-label="新建画布"><option value="">新建画布…</option><option value="empty">新建空白画布</option></select>'
  );
  page = page.replace(
    '<div id="board"><svg id="wires"></svg><div id="world"></div><div id="marquee" hidden></div></div>',
    '<div id="board"><div id="selection-menu" role="toolbar" aria-label="卡片功能菜单" hidden></div><div id="selection-toolbar" role="region" aria-label="卡片生成面板" hidden></div><svg id="wires"></svg><div id="world"></div><div id="marquee" hidden></div></div>\n<div id="canvas-context-menu" hidden role="menu"><button type="button" data-canvas-action="add-generation" data-menu-scope="blank">新建图片卡片</button><button type="button" data-canvas-action="add-video" data-menu-scope="blank">新建视频卡片</button><button type="button" data-canvas-action="duplicate" data-menu-scope="card">复制卡片</button><button type="button" data-canvas-action="delete" data-menu-scope="card">删除卡片</button></div>'
  );
  page = page.replace(
    '</style>',
    '.canvas-heading { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: min(280px, 100%); }\n#canvas-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n#rename-canvas { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 30px; width: 30px; height: 30px; padding: 0; border-color: transparent; background: transparent; color: #b7b1a6; cursor: pointer; }\n#rename-canvas:hover { background: #2c333e; color: #e6b15c; }\n#rename-canvas:focus-visible { outline: 2px solid #e6b15c; outline-offset: 2px; }\n#canvas-context-menu { position: fixed; z-index: 30; min-width: 168px; padding: 6px; border: 1px solid #4a5260; border-radius: 10px; background: #171a20; box-shadow: 0 12px 32px rgba(0,0,0,.38); }\n#canvas-context-menu button { display: block; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: inherit; text-align: left; cursor: pointer; }\n#canvas-context-menu button:hover { background: #2c333e; }\n.card { cursor: grab; user-select: none; }\n.card:active { cursor: grabbing; }\n.card img { user-select: none; -webkit-user-drag: none; }\n</style>'
  );
  page = page.replace(
    '</style>',
    '#selection-toolbar { position: absolute; z-index: 20; box-sizing: border-box; display: flex; flex-direction: column; align-items: stretch; gap: 10px; padding: 12px; border: 1px solid #414957; border-radius: 12px; background: #17191f; box-shadow: 0 12px 32px rgba(0,0,0,.4); overflow: auto; overscroll-behavior: contain; }\n#selection-menu { position: absolute; z-index: 21; box-sizing: border-box; width: max-content; padding: 6px; border: 1px solid #414957; border-radius: 10px; background: #202228; box-shadow: 0 6px 20px rgba(0,0,0,.35); overflow-x: auto; overscroll-behavior: contain; }\n#selection-menu .selection-actions { flex-wrap: nowrap; }\n#selection-menu button { white-space: nowrap; border-color: transparent; background: transparent; font-weight: 600; }\n#selection-menu button:hover, #selection-menu button.active { background: #5b4728; border-color: #c99649; }\n#selection-menu button:disabled { opacity: .4; cursor: not-allowed; background: transparent; border-color: transparent; }\n.image-download summary { display: flex; align-items: center; justify-content: center; width: 34px; height: 32px; cursor: pointer; border-left: 1px solid #414957; list-style: none; }\n.image-download summary::-webkit-details-marker { display: none; }\n.image-download-options { position: fixed; z-index: 40; width: 144px; padding: 5px; box-sizing: border-box; border: 1px solid #414957; border-radius: 8px; background: #202228; box-shadow: 0 8px 24px rgba(0,0,0,.4); }\n.image-download-options button { display: block; width: 100%; text-align: left; }\n#selection-menu[hidden], #selection-toolbar[hidden] { display: none; }\n.selection-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }\n.selection-actions button { background: #20242d; color: #e8e3d8; border: 1px solid #414957; border-radius: 7px; padding: 7px 10px; cursor: pointer; }\n.selection-actions button:hover, .selection-actions button.active { background: #5b4728; border-color: #c99649; color: #fff1cf; }\n.selection-label { color: #b7b1a6; font-size: 12px; margin-right: 4px; }\n.selection-panel { min-width: 0; }\n.image-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 84px; height: 84px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 0; background: #1a1d24; color: #aaa79f; cursor: pointer; }\n.image-empty:hover { background: #232832; color: #e6b15c; }\n.image-empty span { font-size: 30px; line-height: 1; }\n.image-empty small { font-size: 12px; }\n.card.image { padding: 0; min-width: 280px; min-height: 220px; }\n.card.image > img { display: block; width: 100%; height: 100%; object-fit: contain; }\n.card.image > strong, .card.video > strong, .card.video-source > strong { display: none; }\n.port { display: none !important; }\n.generation-panel { margin-top: 0; display: grid; grid-template-columns: minmax(0,1fr); align-items: end; gap: 8px; }\n.generation-panel > .generation-prompt { min-height: 96px; resize: vertical; font: inherit; font-size: 13px; line-height: 1.5; padding: 10px; }\n.generation-references { display: flex; align-items: flex-start; gap: 10px; flex-wrap: nowrap; overflow-x: auto; min-width: 0; max-width: 100%; padding: 6px 6px 4px; box-sizing: border-box; overscroll-behavior-x: contain; scrollbar-width: thin; }\n.generation-references:empty { display: none; }\n.generation-reference { position: relative; flex: 0 0 68px; width: 68px; display: flex; flex-direction: column; gap: 4px; text-align: center; }\n.generation-reference img { display: block; width: 68px; height: 60px; object-fit: contain; border: 1px solid #414957; border-radius: 6px; background: #101114; }\n.generation-reference small { font-size: 10px; color: #b7b1a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.generation-reference-remove { position: absolute; top: -5px; right: -5px; width: 20px; height: 20px; padding: 0; border-radius: 50%; border: 1px solid #616875; background: #303640; color: white; cursor: pointer; }\n.generation-reference-add { flex: 0 0 68px; height: 62px; display: grid; place-items: center; padding: 0; border: 1px dashed #616875; border-radius: 6px; background: #161a21; color: #aeb8cb; font-size: 28px; cursor: pointer; } .generation-reference-add:hover:not(:disabled), .generation-reference-add:focus-visible { border-color: #e6b15c; color: #e6b15c; background: #252320; } .generation-reference-add:disabled { opacity: .45; cursor: not-allowed; } .generation-reference-hint { color: #aaa79f; font-size: 11px; }\n.generation-reference-remove:disabled { opacity: .4; cursor: wait; }\n.generation-fields { display: grid; grid-template-columns: repeat(3,minmax(80px,1fr)); gap: 6px; }\n.generation-field { display: flex; flex-direction: column; gap: 3px; color: #aaa79f; font-size: 11px; }\n.generation-field .generation-mode { width: 100%; }\n.generation-actions { display: flex; justify-content: flex-end; gap: 6px; }\n.generation-actions .generation-action { white-space: nowrap; }\n@media (max-width: 760px) { .generation-panel { grid-template-columns: 1fr; } .generation-fields { grid-template-columns: repeat(2,minmax(80px,1fr)); } }\n</style>'
  );
  page = page.replace(
    '        card.append(img);',
    "        img.draggable = false; img.addEventListener('dragstart', function (event) { event.preventDefault(); });\n        card.append(img);"
  );
  page = page.replace(
    "      card.addEventListener('pointerdown', function (event) {",
    "      card.addEventListener('dragstart', function (event) { event.preventDefault(); });\n      card.addEventListener('pointerdown', function (event) { if (event.button !== 2 && ((templateWorkflow && templateWorkflow.locked(node.id)) || (templateWorkflow && templateWorkflow.isNodeLoading(node.id)) || (generationUi && generationUi.isNodeBusy(node.id)))) { event.preventDefault(); event.stopPropagation(); return; }"
  );
  page = page.replace(
    "port.title = '拖到视频输入卡，保存为首帧';",
    "port.title = '点击创建图片变体；拖到视频输入卡可设置首帧';"
  );
  page = page.replace(
    'if (chosen) void importVideoFile(chosen);',
    'if (chosen) void importVideoFile(chosen, pendingPlacement || undefined); pendingPlacement = null;'
  );
  page = page.replace(
    / {2}document\.getElementById\('new-canvas'\)\.addEventListener\('click', function \(\) \{[\s\S]*?\n {2}\}\);\n {2}document\.getElementById\('add-note'\)/,
    [
      "  document.getElementById('new-canvas').addEventListener('change', function (event) {",
      '    const template = event.target.value;',
      "    event.target.value = '';",
      '    if (!template) return;',
      '    void leaveCurrent().then(async function (ok) {',
      '      if (!ok || (documentState && dirty())) return;',
      "      const title = template === 'sequence' ? '序列帧模板画布' : '空白画布';",
      "      const created = await request('/canvases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title, template: template }) });",
      "      const option = document.createElement('option');",
      '      option.value = created.id; option.textContent = created.title; select.append(option);',
      '      await openDocument(created.id);',
      "    }).catch(function (caught) { setError(caught.message || '新建画布失败。'); });",
      '  });',
      "  document.getElementById('add-note')",
    ].join('\n')
  );
  page = page.replace(
    "  document.getElementById('add-note').addEventListener('click', function () { add('note', nextPlacement('note')); });",
    [
      '  let pendingPlacement = null;',
      "  const contextMenu = document.getElementById('canvas-context-menu');",
      '  imageAssetsUi = createImageAssetsUi({ deliver: deliverExport, current: function () { return documentState; }, store: store, remember: remember, changed: markDirty, save: flush, render: render, select: function (id) { selected.clear(); selected.add(id); }, blocked: function (id) { return generationUi.isNodeBusy(id) || generationUi.hasUnsettledResult(id) || generationUi.hasInputDraft() || sequenceUi.hasUnsavedFrames; }, resolve: function (id) { return templateWorkflow.resolveTarget(id, "image-assets"); }, error: setError, log: function (message, level) { canvasLogs.add(message, level); } });',
      '  resourceExport = createCanvasResourceExport({ deliver: deliverResource, onBusyChange: publishDirty, getDocument: function () { return documentState; }, mediaUrl: function (path) { return store.mediaUrl(path); }, error: setError, progress: function (message) { setError(message, "info"); }, assets: imageAssetsUi, model: { ready: function (id) { const state = modelUi && modelUi.state(id); return state && state.status === "completed" && !state.stale; }, download: function (id) { return modelUi.download(id); } } });',
      '  function hideContextMenu() { contextMenu.hidden = true; }',
      '  function showContextMenu(event) {',
      '    if (handMode()) { event.preventDefault(); return; }',
      '    event.preventDefault();',
      "    const anchor = event.type === 'click' && event.target.closest('.canvas-card-menu');",
      '    const bounds = anchor && anchor.getBoundingClientRect();',
      '    const position = bounds ? { clientX: bounds.left, clientY: bounds.bottom } : event;',
      "    const card = event.target.closest && event.target.closest('.card[data-id]');",
      "    const blankActions = contextMenu.querySelectorAll('[data-menu-scope=blank]');",
      "    const cardActions = contextMenu.querySelectorAll('[data-menu-scope=card]');",
      '    blankActions.forEach(function (item) { item.hidden = Boolean(card); });',
      '    cardActions.forEach(function (item) { item.hidden = !card; });',
      '    if (card && !selected.has(card.dataset.id)) selectNode(card.dataset.id, false);',
      '    if (!card && selected.size < 2) { selected.clear(); render(); }',
      '    templateUi.context(contextMenu);',
      '    resourceExport.context(contextMenu, card && selected.size === 1 ? documentState.nodes.find(function (node) { return node.id === card.dataset.id; }) : undefined);',
      '    pendingPlacement = documentState ? worldPoint(event) : null;',
      '    contextMenu.hidden = false;',
      "    contextMenu.style.left = Math.min(position.clientX, window.innerWidth - 190) + 'px';",
      "    contextMenu.style.top = Math.min(position.clientY, window.innerHeight - 300) + 'px';",
      '  }',
      "  board.addEventListener('contextmenu', showContextMenu);",
      "  contextMenu.addEventListener('click', function (event) {",
      "    const action = event.target.closest && event.target.closest('[data-canvas-action]');",
      '    if (!action) return;',
      '    const value = action.dataset.canvasAction;',
      '    hideContextMenu();',
      "    if (value === 'add-video') { add('video', pendingPlacement || nextPlacement('video')); pendingPlacement = null; return; }",
      "    if (value === 'add-generation') { createBlankImageSlot(); return; }",
      "    if (value === 'duplicate') { duplicateSelected(); return; }",
      "    if (value === 'delete') deleteSelected();",
      '  });',
      "  document.addEventListener('pointerdown', function (event) { if (!contextMenu.hidden && !contextMenu.contains(event.target)) hideContextMenu(); });",
      "  document.getElementById('add-note').addEventListener('click', function () { add('note', nextPlacement('note')); });",
    ].join('\n')
  );
  page = page.replace('</header><div id="template-flow" hidden></div>', '</header>');
  page = page.replace(
    '<div id="marquee" hidden></div></div>\n<div id="canvas-context-menu"',
    '<div id="marquee" hidden></div><div id="template-flow" hidden></div></div>\n<div id="canvas-context-menu"'
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    '#canvas-context-menu button[hidden] { display: none; }</style>'
  );
  page = replaceCanvasPageText(
    page,
    "  board.addEventListener('pointerdown', function (event) {",
    "  board.addEventListener('pointerdown', function (event) {\n    if (event.button === 2) return;"
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    '#template-flow:not([hidden]) { position:absolute; z-index:25; left:50%; bottom:24px; transform:translateX(-50%); display:flex; align-items:center; gap:14px; box-sizing:border-box; width:min(560px, calc(100% - 32px)); padding:12px 14px; border:1px solid #6d5b3b; border-radius:12px; background:#25251fee; color:#e6c18a; font-size:13px; box-shadow:0 10px 28px rgba(0,0,0,.34); } #template-flow span { flex:1; line-height:1.45; } #template-flow button { flex:0 0 auto; } #template-flow button:disabled { opacity:.55; cursor:wait; } .template-locked button, .template-locked input, .template-locked select, .template-locked textarea { pointer-events:none; opacity:.35; } .template-example { position:absolute; top:8px; left:8px; padding:3px 7px; background:#222c; color:#ddd; border-radius:4px; font-size:11px; pointer-events:none; } .card.template-pending { border-color:#6d5b3b; opacity:.72; } .card.template-loading { border-color:#e6b15c; box-shadow:0 0 0 2px rgba(230,177,92,.3), 0 0 24px rgba(230,177,92,.18); animation:template-card-pulse 1.4s ease-in-out infinite; } .card.template-loading button, .card.template-loading input, .card.template-loading select, .card.template-loading textarea { pointer-events:none; opacity:.45; } @keyframes template-card-pulse { 50% { box-shadow:0 0 0 4px rgba(230,177,92,.18), 0 0 30px rgba(230,177,92,.28); } }</style>'
  );
  page = replaceCanvasPageText(
    page,
    '  function render() {\n    if (!documentState) return;',
    [
      '  function protectTemplateSelection() {',
      '    const flow = documentState && documentState.templateFlow;',
      '    if (!flow || flow.stage === "complete") return false;',
      '    if (![flow.imageId, flow.videoId, flow.sequenceId, flow.animationId].some(function (id) { return selected.has(id); })) return false;',
      '    setError("模板流程完成前请保留流程卡片；首图可快速编辑或替换。"); return true;',
      '  }',
      '  function render() {',
      '    if (!documentState) return;',
      '    if (templateWorkflow) templateWorkflow.render(document.getElementById("template-flow"));',
      '    publishDirty();',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);',
    [
      '      if (modelUi) modelUi.render(card, node);',
      '      if (node.type === "mark") renderCanvasMark(card, node); else decorateCanvasCard(card, node, title, showContextMenu);',
      '      if (node.type === "image-assets" && imageAssetsUi) { card.querySelector(".canvas-card-content")?.remove(); imageAssetsUi.render(card, node); }',
      '      if (node.type === "resource-bundle") { card.querySelector(".canvas-card-content")?.remove(); renderResourceBundle(card, node, documentState, store.mediaUrl); }',
      '      const templateStatus = templateWorkflow && templateWorkflow.status(node.id);',
      '      const creditsLabel = generationUi && generationUi.creditsLabel(node); if (creditsLabel) { const credits = document.createElement("small"); credits.className = "generation-credits"; credits.textContent = creditsLabel; credits.title = "当前结果的 MCP 返回积分，不是累计消耗或余额；未返回表示暂无数据。"; card.append(credits); }',
      '      const nodeBusy = Boolean((generationUi && generationUi.isNodeBusy(node.id)) || (templateWorkflow && templateWorkflow.isNodeLoading(node.id)) || (canvasCutoutBusy && canvasCutoutBusy.has(node.id)));',
      '      const generationState = generationUi && generationUi.nodeState(node.id);',
      '      const sequenceState = node.type === "sequence" && sequenceUi.view(node.id).run;',
      '      const overlayState = node.type !== "section" && node.type !== "mark" ? canvasCardStatus({ busy: nodeBusy || sequenceUi.isNodeBusy(node.id), generation: generationState && generationState.status || (templateStatus === "pending" && templateWorkflow.failure(node.id) ? "failed" : undefined), sequence: sequenceState && sequenceState.status, template: templateStatus }) : undefined;',
      '      if (templateStatus === "pending") card.classList.add("template-pending");',
      '      if (templateStatus === "loading" || nodeBusy) card.classList.add("template-loading");',
      '      if (node.type !== "section" && node.type !== "mark" && (templateWorkflow && templateWorkflow.locked(node.id) || nodeBusy || templateWorkflow.isMember(node.id) && overlayState)) {',
      '        card.classList.add("template-locked");',
      '        card.querySelectorAll("button,input,select,textarea").forEach(function (control) { control.disabled = true; });',
      '        card.addEventListener("dblclick", function (event) { event.stopImmediatePropagation(); }, true);',
      '      }',
      '      renderCanvasCardStatus(card, overlayState, { stopWaiting: generationUi.canStopWaiting(node.id) ? function () { generationUi.stopWaiting(node.id); } : undefined, waitingForSource: templateWorkflow.waitingForSource(node.id), adjust: templateWorkflow.canAdjust(node.id) ? function () { selected.clear(); selected.add(node.id); if (node.type === "sequence") { sequenceUi.beginEdit(node.id); sequenceEditor.open(node.id); } else if (node.type === "image-assets") { void imageAssetsUi.run(node.id).catch(function (caught) { setError(caught.message); }); } else { selectionAction = "workflow"; render(); } } : undefined, waitTimedOut: generationState && generationState.status === "timedout", resume: (!generationState || generationState.status !== "timedout") && templateWorkflow.canContinue(node.id) ? function () { selectionAction = ""; return templateWorkflow.runFrom(node.id); } : undefined, detail: templateWorkflow.failure(node.id) || sequenceState && sequenceState.error, stoppedWaiting: generationState && generationState.status === "canceled", query: generationState && generationState.canQuery && !nodeBusy ? function () { return generationUi.queryNode(node.id); } : undefined });',
      '      world.append(card);',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function selectNode(id, shift) {',
    '  function selectNode(id, shift) {\n    if (!selected.has(id)) selectionAction = "";'
  );
  page = replaceCanvasPageText(
    page,
    '    if (event.target !== board && event.target !== world) return;',
    "    if (event.target !== board && event.target !== world) return;\n    selectionAction = ''; "
  );
  page = replaceCanvasPageText(
    page,
    '    const previous = past.pop();',
    '    if (documentState && documentState.templateFlow && documentState.templateFlow.stage !== "complete") { setError("模板流程中暂不撤销，以免回退已提交的生成任务。"); return; }\n    const previous = past.pop();'
  );
  page = replaceCanvasPageText(
    page,
    '    const next = future.shift();',
    '    if (documentState && documentState.templateFlow && documentState.templateFlow.stage !== "complete") return;\n    const next = future.shift();'
  );
  page = replaceCanvasPageText(
    page,
    '<button id="create-section"',
    '<button id="add-template" type="button">添加模板</button><button id="create-section"'
  );
  page = replaceCanvasPageText(page, '</style>', TEMPLATE_LIBRARY_STYLES + '</style>');
  page = replaceCanvasPageText(
    page,
    'void boot().catch(function (caught) { setError(caught.message); });',
    [
      '  const templateModel = createCanvasTemplateModel();',
      '  const templateUi = createCanvasTemplateUi({ deliver: deliverExport, platform: store.platform,',
      '    store: store.templates, exchangeUnavailableReason: canvasCapabilityReason(store, "templateExchange"), model: templateModel, getDocument: function () { return documentState; }, selected: selected,',
      '    remember: remember, changed: markDirty, render: render, save: flush, error: setError,',
      '    busy: function (id) { return pendingAssetImports > 0 || Boolean(groupQueue && groupQueue.protects(id)) || sequenceUi.isBusy || generationUi.isNodeBusy(id) || generationUi.hasUnsettledResult(id) || templateWorkflow.isNodeLoading(id); },',
      '    placement: function () { const nodes = documentState.nodes; return nodes.length ? { x: Math.max.apply(null, nodes.map(function (node) { return node.x + node.width; })) + 80, y: Math.min.apply(null, nodes.map(function (node) { return node.y; })) + 56 } : { x: 80, y: 80 }; },',
      '    deleteSelected: deleteSelected, loadMedia: loadMedia,',
      '    reveal: function (group) { const scale = Math.min(1, Math.max(.15, Math.min((board.clientWidth - 100) / group.width, (board.clientHeight - 100) / group.height))); documentState.viewport = { scale: scale, x: (board.clientWidth - group.width * scale) / 2 - group.x * scale, y: (board.clientHeight - group.height * scale) / 2 - group.y * scale }; },',
      '  });',
      '  document.getElementById("add-template").addEventListener("click", function () { void templateUi.library(); });',
      '  videoHistory = createVideoHistoryUi({ store: store, deliver: deliverExport, readSource: function (path) { return host.readSource(path, AbortSignal.timeout(60000), "视频读取失败。"); }, onBusyChange: publishDirty, recover: function (attempt) { return generationUi.recoverVideo(attempt); } });',
      '  document.getElementById("video-history").addEventListener("click", function () { void videoHistory.open(); });',
      '  let videoTimingState = "";',
      '  setInterval(function () { if (!documentState || !generationUi) return; const next = documentState.id + documentState.nodes.filter(function (node) { return node.type === "video" || node.type === "video-source"; }).map(function (node) { const state = generationUi.nodeState(node.id); return node.id + (state ? state.status + state.canQuery : ""); }).join("|"); if (videoTimingState !== next) render(); videoTimingState = next; }, 1000);',
      '  async function openLocalImage(node, action) {',
      '    if (imageEditing && imageEditing.isBusy) return;',
      '    if (node.mergeIcons && (node.templatePending || mergeIconNeedsGeneration(node))) { setError("阶段设置或参考已变更，请先生成新图集，不能处理旧图。"); return; }',
      '    const current = documentState;',
      '    const decision = templateWorkflow.resolveTarget(node.id, "image", node.id);',
      '    if (decision && decision.kind === "blocked") { setError(decision.message); return; }',
      '    const targetId = node.mergeIcons ? node.id : decision && decision.kind === "reuse" ? decision.nodeId : undefined;',
      '    imageEditing = createImageEditing({',
      '      prepareSource: async function (source, signal) {',
      '        const live = current.nodes.find(function (item) { return item.id === source.id; });',
      '        if (documentState !== current || !live || live.assetPath !== source.assetPath) throw new Error("图片来源已变化，请重新打开编辑器。");',
      '        if (await refreshCanvasMedia(current, store, [live], true)) markDirty();',
      '        signal.throwIfAborted();',
      '        if (documentState !== current) throw new Error("画布已切换。");',
      '        return structuredClone(live);',
      '      },',
      '      load: async function (source, signal) { return host.readSource(source.assetPath, signal, "图片读取失败"); },',
      '      save: async function (blob) { if (documentState !== current) throw new Error("画布已切换"); return store.importImage(current.id, await blob.arrayBuffer(), "image/png"); },',
      '      onSaved: async function (result, source) {',
      '        if (documentState !== current) throw new Error("画布已切换，未覆盖原卡片");',
      '        if (!(await flush())) throw new Error("请先解决画布保存错误，再重试");',
      // Cards only draw an <img> once media[] knows the path; without this the result stays blank until reload.
      '        await loadMedia(result.relativePath);',
      '        if (documentState !== current) throw new Error("画布已切换，未覆盖原卡片");',
      '        const previous = { nodes: structuredClone(current.nodes), edges: structuredClone(current.edges) };',
      '        let applied;',
      '        try { applied = applyLocalImageResult(current, source, result.relativePath, targetId, function () { return crypto.randomUUID(); }); invalidateCanvasDependents(current, applied.id); if (!(await flush())) throw new Error("画布保存失败，原结果仍保留，可重试保存"); }',
      '        catch (caught) { Object.assign(current, previous); render(); throw caught; }',
      '        const committed = { nodes: current.nodes, edges: current.edges }; Object.assign(current, previous); remember(); Object.assign(current, committed);',
      '        selected.clear(); selected.add(applied.id); selectionAction = ""; render();',
      '      },',
      '      onBusyChange: publishDirty, backgroundRemoval: backgroundRemoval, openBackgroundEditor: openBackgroundEditor, openFrameEditor: openFrameEditor,',
      '    });',
      '    try { await imageEditing.open(node, action); } catch (caught) { setError(caught.message); }',
      '  }',
      // var: render() reads it for the busy overlay and may run before this line is reached.
      '  var canvasCutoutBusy = new Set();',
      '  async function quickCutout(node) {',
      '    if ((imageEditing && imageEditing.isBusy) || pendingAssetImports || canvasCutoutBusy.size || !documentState) return;',
      '    if (node.type !== "image" || !node.assetPath) { setError("请选择已有图片。"); return; }',
      '    if (generationUi && (generationUi.isNodeBusy(node.id) || generationUi.hasUnsettledResult(node.id))) { setError("图片仍在生成中，请稍后再抠图。"); return; }',
      '    if (node.mergeIcons && (node.templatePending || mergeIconNeedsGeneration(node))) { setError("阶段设置或参考已变更，请先生成新图集，不能处理旧图。"); return; }',
      '    const decision = templateWorkflow.resolveTarget(node.id, "image", node.id);',
      '    if (decision && decision.kind === "blocked") { setError(decision.message); return; }',
      '    const current = documentState; const sourceId = node.id; const sourcePath = node.assetPath;',
      '    const live = function () { const item = current.nodes.find(function (entry) { return entry.id === sourceId; }); if (documentState !== current || !item || item.assetPath !== sourcePath) throw new Error("来源图片已变化，未创建抠图结果。"); return item; };',
      // Shares the import counter so every existing busy/blocked check also waits for the cutout.
      '    pendingAssetImports++; canvasCutoutBusy.add(sourceId); publishDirty(); setError(""); render();',
      '    try {',
      '      if (await refreshCanvasMedia(current, store, [live()], true)) markDirty();',
      '      const blob = await host.readSource(sourcePath, AbortSignal.timeout(60000), "图片读取失败");',
      '      const detected = await backgroundRemoval.identify(blob);',
      '      if (!detected) throw new Error("未识别到纯色背景，可用「调整抠图」手动取色");',
      '      const cut = await backgroundRemoval.apply(blob, Object.assign({}, CANVAS_BACKGROUND_DEFAULTS, { automatic: false, color: detected.color }));',
      '      await commitCanvasCutout(current, live, cut.blob);',
      '    } catch (caught) {',
      '      setError("抠图失败：" + ((caught && caught.message) || "处理出错"));',
      '    } finally {',
      '      canvasCutoutBusy.delete(sourceId); finishAssetImport(); render();',
      '    }',
      '  }',
      '  async function commitCanvasCutout(current, live, blob) {',
      '    live();',
      '    const saved = await store.importImage(current.id, await blob.arrayBuffer(), "image/png");',
      '    await loadMedia(saved.relativePath);',
      '    const source = live();',
      '    remember();',
      '    const applied = applyLocalImageResult(current, source, saved.relativePath, undefined, function () { return crypto.randomUUID(); });',
      '    applied.title = (source.title + " · 抠图").slice(0, 80);',
      '    invalidateCanvasDependents(current, applied.id);',
      '    selected.clear(); selected.add(applied.id); selectionAction = ""; markDirty();',
      '  }',
      // Web 调整抠图: only the 去背景 dialog; 保存 commits like one-click 抠图 instead of the two-step local editor.
      '  async function adjustCutout(node) {',
      '    if ((imageEditing && imageEditing.isBusy) || pendingAssetImports || canvasCutoutBusy.size || !documentState) return;',
      '    if (node.type !== "image" || !node.assetPath) { setError("请选择已有图片。"); return; }',
      '    if (generationUi && (generationUi.isNodeBusy(node.id) || generationUi.hasUnsettledResult(node.id))) { setError("图片仍在生成中，请稍后再抠图。"); return; }',
      '    if (node.mergeIcons && (node.templatePending || mergeIconNeedsGeneration(node))) { setError("阶段设置或参考已变更，请先生成新图集，不能处理旧图。"); return; }',
      '    const decision = templateWorkflow.resolveTarget(node.id, "image", node.id);',
      '    if (decision && decision.kind === "blocked") { setError(decision.message); return; }',
      '    const current = documentState; const sourceId = node.id; const sourcePath = node.assetPath;',
      '    const live = function () { const item = current.nodes.find(function (entry) { return entry.id === sourceId; }); if (documentState !== current || !item || item.assetPath !== sourcePath) throw new Error("来源图片已变化，未创建抠图结果。"); return item; };',
      '    const hold = function () { pendingAssetImports++; canvasCutoutBusy.add(sourceId); publishDirty(); render(); };',
      '    const release = function () { canvasCutoutBusy.delete(sourceId); finishAssetImport(); render(); };',
      '    let blob;',
      '    hold(); setError("");',
      '    try { if (await refreshCanvasMedia(current, store, [live()], true)) markDirty(); blob = await host.readSource(sourcePath, AbortSignal.timeout(60000), "图片读取失败"); live(); }',
      '    catch (caught) { setError("抠图失败：" + ((caught && caught.message) || "处理出错")); return; }',
      '    finally { release(); }',
      '    try {',
      '      await openBackgroundEditor({ frames: [{ time: 0, blob: blob }], index: 0, removal: backgroundRemoval,',
      '        confirm: { label: "保存", hint: "自动识别背景色；识别失败可切换手动固定色，输入颜色或从原图取色。推荐边缘连通保护主体；全图同色可能误删主体。保存后在右侧新建抠图卡片，原图保留。" },',
      '        apply: async function (frames) { hold(); try { await commitCanvasCutout(current, live, frames[0].blob); } finally { release(); } } });',
      '    } catch (caught) { setError("抠图失败：" + ((caught && caught.message) || "处理出错")); }',
      '  }',
      '  void boot().catch(function (caught) { setError(caught.message); });',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  board.addEventListener('pointerup', function (event) {",
    "  board.addEventListener('pointerup', function (event) {\n    if (drag && drag.kind === 'move' && drag.moved) { templateModel.updateMembership(documentState, drag.positions.map(function (item) { return item.id; })); markDirty(); render(); }"
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);',
    '      if (node.type === "section" && node.templateId) title.textContent += " · 模板";\n      world.append(card);'
  );
  page = replaceCanvasPageText(
    page,
    '<p id="error"></p>',
    '<p id="error" hidden aria-hidden="true"></p><section id="canvas-log" aria-label="运行日志"></section>'
  );
  page = replaceCanvasPageText(
    page,
    "  const error = document.getElementById('error');",
    [
      "  const error = document.getElementById('error');",
      "  const videoHistoryButton = document.createElement('button');",
      "  videoHistoryButton.id = 'video-history'; videoHistoryButton.type = 'button'; videoHistoryButton.textContent = '视频历史';",
      "  const canvasLogs = createCanvasLog(document.getElementById('canvas-log'), [videoHistoryButton]);",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    "  function setError(text) { error.textContent = text || ''; }",
    "  function setError(text, level) { error.textContent = text || ''; canvasLogs.add(text || '', level); }"
  );
  page = replaceCanvasPageText(
    page,
    '    const view = documentState.viewport;',
    '    canvasLogs.setContext(documentState.id);\n    const view = documentState.viewport;'
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    CANVAS_CARD_STATUS_STYLES + CANVAS_LOG_STYLES + GROUP_QUEUE_STYLES + '</style>'
  );
  page = replaceCanvasPageText(
    page,
    '    const previous = past.pop();',
    '    if (groupQueue && groupQueue.isBusy) { setError("请先停止队列并等待当前步骤结束，再撤销。"); return; }\n    const previous = past.pop();'
  );
  page = replaceCanvasPageText(
    page,
    '    const next = future.shift();',
    '    if (groupQueue && groupQueue.isBusy) { setError("请先停止队列并等待当前步骤结束，再重做。"); return; }\n    const next = future.shift();'
  );
  page = replaceCanvasPageText(
    page,
    '  function connect(fromId, toId, shouldRemember) {',
    '  function connect(fromId, toId, shouldRemember) {\n    if (groupQueue && (groupQueue.protects(fromId) || groupQueue.protects(toId))) { setError("请先停止相关队列，再修改引用连线。"); return; }'
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);',
    '      if (node.type === "section" && node.templateId && groupQueueUi && !canvasModelGroup(documentState, node.id)) groupQueueUi.render(card, node);\n      world.append(card);'
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('save').addEventListener",
    [
      '  groupQueue = createCanvasGroupQueue({',
      '    getDocument: function () { return documentState; },',
      '    needs: function (id) { return templateWorkflow.status(id) === "pending"; },',
      '    parallel: function (id) { const node = documentState && documentState.nodes.find(function (item) { return item.id === id; }); const group = node && documentState.nodes.find(function (item) { return item.id === node.sectionId; }); return Boolean(group && (["7e1cb6ad-732f-4dc3-a951-000000000013", "7e1cb6ad-732f-4dc3-a951-000000000015"].includes(group.templateId) || (group.templateCliOnly && group.templateSkills?.includes("maker-ui-bbox-workflow"))) && node.type === "image" && (!node.uiRecognition || node.uiRecognition.optional) && !node.uiAtlasPrelayout && canvasReferences(documentState, id).length); },',
      // Each image request holds one of the browser's 6 connections to the console until the
      // picture is done; 4 leaves room for saves, media and the CLI heartbeat (else ~30 s stall).
      '    imageConcurrency: function () { return 4; },',
      '    save: flush,',
      '    problem: function (id) { if (sequenceUi.hasDraft(id)) return "此卡片有未保存的帧处理，请先保存或放弃后再继续队列。"; return generationUi.queueBlockReason(id); },',
      '    busy: function () { return templateWorkflow.isBusy || generationUi.isBusy || imageAssetsUi.isBusy || sequenceUi.isBusy || Boolean(sequenceEditor && sequenceEditor.isOpen) || Boolean(imageEditing && imageEditing.isBusy) || Boolean(videoHistory && videoHistory.isBusy) || pendingAssetImports > 0; },',
      '    stopActive: function (id) { generationUi.stopWaiting(id); },',
      '    retryTarget: function (id) { return generationUi.retryableImage(id) ? id : undefined; },',
      '    prepareRetry: function (id) { const node = documentState.nodes.find(function (item) { return item.id === id; }); if (!node) return; node.templatePending = true; invalidateCanvasDependents(documentState, id); markDirty(); canvasLogs.add(node.title + "：重新生图（每次分组运行最多2次），其余分支保留", "warning"); },',
      '    run: async function (id) { const ok = await templateWorkflow.runQueued(id); if (ok) return true; throw new Error(templateWorkflow.failure(id) || "步骤未完成，已暂停。请查看此卡片状态和运行日志。"); },',
      '    confirm: function (message) { return window.confirm(message); }, error: setError,',
      '    haltReason: function () { return saveFailed ? "画布结果尚未保存，已停止后续生成；请先保存再继续。" : peerBlock() || undefined; },',
      '    blocked: function () { return peerBlock() || undefined; },',
      '    expand: function (id) { if (documentState && ensureUiAtlasBatchCards(documentState, id)) markDirty(); },',
      '    settled: function (id, phase) { if (ui015Workflow) ui015Workflow.settled(id, phase); },',
      '    changed: function () { if (dirty()) markDirty(); if (groupQueueUi) groupQueueUi.refresh(); if (documentState) refreshCanvasGroupHeaders(world, documentState.nodes, function (id) { return ui015Workflow && ui015Workflow.isActive(id) ? "running" : groupQueue && groupQueue.view(id)?.phase; }); publishDirty(); },',
      '  });',
      '  groupQueueUi = createCanvasGroupQueueUi({ queue: groupQueue, node: function (id) { return documentState && documentState.nodes.find(function (node) { return node.id === id; }); }, scale: function () { return documentState && documentState.viewport.scale || 1; }, workflow: { view: function (id) { return ui015Workflow ? ui015Workflow.view(id) : undefined; } }, notice: function () { return peerReason; },',
      '    focus: function (id) { const node = documentState && documentState.nodes.find(function (node) { return node.id === id; }); if (!node) return; const view = documentState.viewport; view.x = board.clientWidth / 2 - (node.x + node.width / 2) * view.scale; view.y = board.clientHeight / 2 - (node.y + (node.height || 200) / 2) * view.scale; selected.clear(); selected.add(id); selectionAction = ""; render(); },',
      '  });',
      '  setInterval(function () { groupQueueUi.tick(); }, 1000);',
      "  document.getElementById('save').addEventListener",
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    CANVAS_WORKSPACE_STYLES + CANVAS_CARD_UI_STYLES + CANVAS_MARK_STYLES + '</style>'
  );
  page = replaceCanvasPageText(
    page,
    '    function renderSelectionToolbar() {',
    '    refreshCanvasGroupHeaders(world, documentState.nodes, function (id) { return ui015Workflow && ui015Workflow.isActive(id) ? "running" : groupQueue && groupQueue.view(id)?.phase; });\n    function renderSelectionToolbar() {'
  );
  page = replaceCanvasPageText(
    page,
    "  document.getElementById('add-image').addEventListener('click', function () { file.click(); });",
    "  document.getElementById('add-image').addEventListener('click', function () { if (!documentState) return; pendingImageImport = { canvasId: documentState.id, create: true }; file.click(); });\n  document.getElementById('add-ui-recognition').addEventListener('click', function () { if (!documentState) return; pendingImageImport = { canvasId: documentState.id, createUiRecognition: true }; file.click(); });\n  document.getElementById('add-video-source').addEventListener('click', function () { if (!documentState) return; pendingVideoImport = { canvasId: documentState.id, point: nextPlacement('video-source') }; videoFile.click(); });"
  );
  page = replaceCanvasPageText(
    page,
    '    if (chosen) void importImageFile(chosen, request);',
    '    if (chosen && request && request.create && documentState && documentState.id === request.canvasId) { createBlankImageSlot(); request.nodeId = Array.from(selected)[0]; }\n    if (chosen) void importImageFile(chosen, request);'
  );
  page = replaceCanvasPageText(
    page,
    "  const sequenceVideo = document.getElementById('sequence-source');",
    "  const sequenceVideo = document.getElementById('sequence-source');\n  let workspace = null;\n  let canvasMarks = null;"
  );
  page = replaceCanvasPageText(
    page,
    '  function render() {\n    if (!documentState) return;',
    '  function render() {\n    if (!documentState) return;\n    if (workspace) workspace.sync();'
  );
  page = replaceCanvasPageText(
    page,
    '  function setStatus(text) { status.textContent = text; publishDirty(); }',
    '  function setStatus(text) { status.textContent = text; status.dataset.state = text === "已保存" ? "saved" : text.includes("失败") ? "error" : "pending"; publishDirty(); if (workspace) workspace.sync(); }'
  );
  const switchStart = page.indexOf("  select.addEventListener('change', function () {");
  const switchEnd = page.indexOf("  document.getElementById('rename-canvas')", switchStart);
  if (switchStart < 0 || switchEnd < 0) throw new Error('Canvas switch binding is missing');
  page =
    page.slice(0, switchStart) +
    "  select.addEventListener('change', function () { void workspace.activate(select.value); });\n" +
    page.slice(switchEnd);
  const newStart = page.indexOf("  document.getElementById('new-canvas').addEventListener");
  const newEnd = page.indexOf('  let pendingPlacement = null;', newStart);
  if (newStart < 0 || newEnd < 0) throw new Error('Canvas creation binding is missing');
  page = page.slice(0, newStart) + page.slice(newEnd);
  page = replaceCanvasPageText(
    page,
    '  void boot().catch',
    [
      '  workspace = createCanvasWorkspace({',
      '    current: function () { return documentState; },',
      '    activate: async function (id) {',
      '      if (!documentState || documentState.id === id) return true;',
      '      if (!(await leaveCurrent())) return false;',
      '      await openDocument(id); return documentState.id === id;',
      '    },',
      '    create: async function () {',
      '      if (!(await leaveCurrent())) return false;',
      '      const created = await request("/canvases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "空白画布", template: "empty" }) });',
      '      const option = document.createElement("option"); option.value = created.id; option.textContent = created.title; select.append(option);',
      '      await openDocument(created.id); return documentState.id === created.id;',
      '    },',
      '    zoom: function (factor) {',
      '      if (!documentState) return;',
      '      const view = documentState.viewport; const scale = Math.max(0.15, Math.min(4, view.scale * factor));',
      '      const centerX = board.clientWidth / 2; const centerY = board.clientHeight / 2;',
      '      view.x = centerX - (centerX - view.x) * scale / view.scale;',
      '      view.y = centerY - (centerY - view.y) * scale / view.scale;',
      '      view.scale = scale; markDirty(); render();',
      '    },',
      '    error: setError',
      '  });',
      '  workspace.sync();',
      '  void boot().catch',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  void boot().catch',
    [
      '  modelUi = createCanvasModelUi({ deliver: deliverExport, current: function () { return documentState; }, store: store, save: flush, render: render, error: setError, remember: remember, changed: markDirty,',
      '    blocked: function () { return canvasOpening || generationUi.isBusy || sequenceUi.isBusy || templateWorkflow.isBusy || groupQueue.isBusy || pendingAssetImports || Boolean(imageEditing && imageEditing.isBusy); },',
      '    sourceBlocked: function (id) { return generationUi.isNodeBusy(id) || generationUi.hasUnsettledResult(id) || generationUi.hasInputDraft() || sequenceUi.hasUnsavedFrames; } });',
      '  async function importProjectAsset(input) {',
      '      const current = documentState;',
      '      if (!current || current.nodes.length >= 400) throw new Error("画布未就绪或卡片已达到容量限制。");',
      '      // Nothing has changed yet, so host rejections and decode failures mean "not executed".',
      '      const rejected = function (error) { if (error && !error.code) error.code = "INVALID_ARGS"; throw error; };',
      '      const versions = store.mediaVersions && typeof input.assetPath === "string" ? await store.mediaVersions([input.assetPath]).catch(rejected) : undefined;',
      '      const node = await prepareCanvasImportedNode(current.id, input, store.mediaUrl).catch(rejected);',
      '      if (versions && versions[node.assetPath]) node.assetVersion = { path: node.assetPath, version: versions[node.assetPath] };',
      '      if (documentState !== current) throw new Error("画布已切换，素材没有添加到其它画布。");',
      '      const point = nextPlacement(node.type); node.x = point.x; node.y = point.y;',
      '      if (node.type === "image") await loadMedia(node.assetPath);',
      '      remember(); current.nodes.push(node); selected.clear(); selected.add(node.id); markDirty();',
      '  }',
      '  const automation = createCanvasAutomationUi({',
      '    capabilities: store.capabilities, platform: store.platform,',
      '    checkRecognition: function (node) { return uiRecognitionUi.checkRecognition(node); },',
      '    ensureRecognitionNote: function (node) { uiRecognitionUi.ensureNote(node); },',
      '    recognizeUi: function (node, recover, attemptId) { return uiRecognitionUi.runRecognition(node, true, recover, attemptId); },',
      '    current: function () { return documentState; },',
      '    blocked: function (allowUnsaved) {',
      '      if (pendingExports || (resourceExport && resourceExport.isBusy)) return "资源正在导出，请等待完成。";',
      '      if (canvasOpening) return "画布正在加载，请稍后重新 inspect。";',
      '      const peer = peerBlock(); if (peer) return peer;',
      '      if (modelUi.isBusy) return "模型请求等待中，可停止本地等待后查询原任务。";',
      '      if (!allowUnsaved && (dirty() || pendingSave)) return "画布有未保存修改，请等待保存完成后重试。";',
      '      if (generationUi.hasInputDraft()) return "存在尚未提交的人工生成参数草稿；请先手动完成生成，或刷新页面明确放弃草稿。关闭面板不会丢弃草稿。";',
      '      if (drag || pendingAssetImports || pendingImageImport || pendingVideoImport || document.querySelector("dialog[open]") || selectionAction || sequenceUi.hasUnsavedFrames) return "请先完成或关闭正在编辑的面板、草稿和导入操作。";',
      '      if (generationUi.isBusy || sequenceUi.isBusy || templateWorkflow.isBusy || groupQueue.isBusy || (imageEditing && imageEditing.isBusy) || (videoHistory && videoHistory.isBusy)) return "当前画布任务执行中，请等待完成。";',
      '    },',
      '    nodeStatus: function (id) { const run = sequenceUi.view(id).run; const saved = documentState.nodes.find(function (node) { return node.id === id; })?.frameSetInfo; return { imageSizing: generationUi.imageSizing(id), imageAssets: imageAssetsUi.reviewState(id), model: modelUi.state(id), workflow: templateWorkflow.status(id), generation: generationUi.nodeState(id), sequence: run && { status: run.status, stage: run.stage, error: run.error, frameCount: run.status === "complete" && saved ? saved.frameCount : run.frames.length }, canStop: generationUi.canStopWaiting(id) || modelUi.canStop(id) }; },',
      '    nodeBlocked: function (id) { return generationUi.isNodeBusy(id) || generationUi.hasUnsettledResult(id) || Boolean(generationUi.queueBlockReason(id)) || sequenceUi.hasDraft(id) || templateWorkflow.locked(id); },',
      '    remember: remember, changed: markDirty, render: render, save: flush,',
      '    select: function (ids) { selected.clear(); ids.forEach(function (id) { selected.add(id); }); }, selected: function () { return Array.from(selected); },',
      '    open: openDocument,',
      '    create: async function (title) { const created = await store.create(title, "empty"); const option = document.createElement("option"); option.value = created.id; option.textContent = created.title; select.append(option); await openDocument(created.id); },',
      '    add: function (type) { if (type === "image") createBlankImageSlot(); else add(type, nextPlacement(type)); },',
      '    placeMark: function (shape) {',
      '      const width = shape === "arrow" ? 180 : 140;',
      '      const height = shape === "arrow" ? 80 : 100;',
      '      const view = documentState.viewport;',
      '      return { x: (board.clientWidth / 2 - view.x) / view.scale - width / 2, y: (board.clientHeight / 2 - view.y) / view.scale - height / 2, width: width, height: height };',
      '    },',
      '    addDerived: function (type, sourceId) {',
      '      let id;',
      '      if (type === "model" || type === "model-views") { remember(); id = appendCanvasModelNode(documentState, type, sourceId).id; }',
      '      else if (type === "sequence") id = sequenceUi.createFromVideo(sourceId, false);',
      '      else {',
      '        const decision = templateWorkflow.resolveTarget(sourceId, "animation");',
      '        if (decision && decision.kind === "blocked") throw new Error(decision.message);',
      '        remember();',
      '        const created = appendAnimation(documentState, sourceId, crypto.randomUUID(), crypto.randomUUID(), decision && decision.kind === "reuse" ? decision.nodeId : undefined);',
      '        id = created && created.id;',
      '      }',
      '      if (!id) throw new Error(error.textContent || "来源尚未就绪，未创建派生卡片。");',
      '      selected.clear(); selected.add(id); markDirty();',
      '    },',
      '    importAsset: importProjectAsset,',
      '    exportAsset: async function (command, node) {',
      '      await refreshSources(node);',
      '      if (node.type !== "model" && canvasNeedsProcessing(documentState, node)) throw new Error("来源或参数已变化，请先完成处理再导出。");',
      '      const saved = structuredClone(node); let exported;',
      '      const download = saved.type === "model" ? function (node, format, media, progress, identity, loop, sink) { if (format !== "model") throw new Error("模型导出格式必须为 model。"); return modelUi.download(node.id, sink); } : downloadCanvasResource;',
      '      await download(saved, command.input.format, store.mediaUrl, undefined, canvasExportIdentity(documentState, saved), command.input.loop !== false, async function (blob, filename) {',
      '        const delivery = await host.deliverAutomationExport(command, blob, filename);',
      '        exported = { ...(delivery && typeof delivery.path === "string" ? { path: delivery.path } : {}), filename: filename, size: blob.size, format: command.input.format, frameCount: saved.frameSetInfo && saved.frameSetInfo.frameCount, width: saved.frameSetInfo && saved.frameSetInfo.width, height: saved.frameSetInfo && saved.frameSetInfo.height };',
      '      }, documentState);',
      '      const nextStep = isGameUiResource(documentState, saved) ? host.gameUiNextStep(command.canvasId) : undefined;',
      '      return { export: exported, canvasId: documentState.id, nodeId: node.id, revision: documentState.revision, ...(nextStep ? { nextStep: nextStep } : {}) };',
      '    },',
      '    addTemplate: templateUi.addById, deleteSelected: deleteSelected, duplicate: duplicateSelected, group: createSection, connect: connect,',
      '    resetDraft: function (id) { generationUi.resetDraft(id); sequenceUi.discardEdit(id); }, stop: function (id) { if (modelUi.canStop(id)) modelUi.stop(); else generationUi.stopWaiting(id); }, canStop: function (id) { return modelUi.canStop(id) || generationUi.canStopWaiting(id); },',
      '    confirmModel: function (id, reviewId) { return modelUi.execute(id, "confirm", reviewId); },',
      '    previewModel: function (id) { return modelUi.preview(id); },',
      '    previewImageAssets: function (id, grid, cut) { return imageAssetsUi.preview(id, grid, cut); },',
      '    confirmImageAssets: function (id, reviewId) { return imageAssetsUi.confirm(id, reviewId); },',
      '    run: async function (id) {',
      '      const modelNode = documentState.nodes.find(function (item) { return item.id === id; });',
      '      if (modelNode && modelNode.type === "model") throw new Error("请展示全部多视图并取得用户确认后使用 confirm-model，不允许直接 run 模型。");',
      '      if (modelNode && modelNode.type === "model-views") { await modelUi.execute(id, "start"); return true; }',
      '      if (templateWorkflow.isMember(id)) return templateWorkflow.runQueued(id);',
      '      const node = documentState.nodes.find(function (item) { return item.id === id; });',
      '      if (!node || generationUi.queueBlockReason(id)) throw new Error("请先处理原任务，不会重复生成。");',
      '      let ok = false;',
      '      if (node.type === "image") ok = await uiRecognitionUi.runImage(id, function () { return generationUi.runTemplateImage(id); }, true);',
      '      else if (node.type === "video" || node.type === "video-source") ok = await generationUi.runTemplateVideo(id, node.generation?.parameters?.duration || 4, true, true);',
      '      else if (node.type === "sequence") { await sequenceUi.runTemplate(id); ok = true; }',
      '      else if (node.type === "animation") ok = refreshAnimationFromSource(documentState, id);',
      '      if (ok) { invalidateCanvasDependents(documentState, id); markDirty(); render(); }',
      '      return ok;',
      '    },',
      '    query: async function (id) { const node = documentState.nodes.find(function (item) { return item.id === id; }); if (node && node.uiRecognition?.pendingId) await uiRecognitionUi.query(id); else if (node && ["model", "model-views"].includes(node.type)) await modelUi.execute(id, "query"); else await generationUi.queryNode(id, true); },',
      '    error: function () { return error.textContent; }, clearError: function () { error.textContent = ""; }, queue: groupQueue,',
      '    ui015: { isWorkflowGroup: function (id) { return ui015Workflow.isWorkflowGroup(id); }, advance: function (id, input) { return ui015Workflow.advance(id, input || {}); }, inspect: function (id) { const view = ui015Workflow.inspect(id); return view && { stage: view.stage, message: view.message }; }, active: function (id) { return ui015Workflow.isActive(id); }, outcome: function (id) { return ui015Workflow.outcome(id); } },',
      '    busyChanged: function (busy) { canvasAutomationBusy = busy; publishDirty(); }',
      '  });',
      '  document.getElementById("refresh-media").addEventListener("click", function () { const reason = hostEditBlocked(); if (reason) { setError(reason); return; } pendingExports++; publishDirty(); void refreshSources().then(function () { const unknown = documentState.nodes.some(function (node) { return node.assetPath && !node.assetVersion; }); setError(unknown ? "素材已刷新；旧结果未记录内容版本，来源待核实，不会自动重新生成。" : "素材已刷新，来源变化的结果需要重新处理。", "info"); }).catch(function (caught) { setError(caught.message); }).finally(function () { pendingExports--; publishDirty(); }); });',
      '  let canvasPeers = { canvasId: "", revision: 0, busyPeers: 0 };',
      '  let peerReason = "";',
      '  const peerBanner = document.createElement("div");',
      '  peerBanner.id = "peer-block"; peerBanner.hidden = true; peerBanner.setAttribute("role", "alert");',
      '  board.append(peerBanner);',
      '  function localCanvasBusy() { return Boolean((groupQueue && groupQueue.isBusy) || (ui015Workflow && ui015Workflow.active) || (templateWorkflow && templateWorkflow.isBusy) || (generationUi && generationUi.isBusy) || (uiRecognitionUi && uiRecognitionUi.isBusy) || (imageAssetsUi && imageAssetsUi.isBusy)); }',
      '  /** Another page on this canvas saved newer content or is executing: this page must not save or run. */',
      '  function peerBlock() {',
      '    if (!documentState || canvasPeers.canvasId !== documentState.id) return "";',
      '    if (canvasPeers.revision > documentState.revision) return "此画布已在另一个页面保存了更新内容，本页显示的是旧版本，不会保存也不能执行。请刷新本页查看最新状态，或关闭本页。";',
      '    if (canvasPeers.busyPeers && !localCanvasBusy()) return "此画布正在另一个页面执行任务。本页只读，进度以执行中的页面为准；该页面完成后请刷新本页。";',
      '    return "";',
      '  }',
      '  function updatePeerBlock() {',
      '    const reason = peerBlock();',
      '    if (reason === peerReason) return;',
      '    peerReason = reason;',
      '    peerBanner.replaceChildren();',
      '    peerBanner.hidden = !reason;',
      '    board.toggleAttribute("data-peer-blocked", Boolean(reason));',
      '    if (reason) { const text = document.createElement("span"); text.textContent = reason; const reload = document.createElement("button"); reload.type = "button"; reload.textContent = "刷新本页"; reload.addEventListener("click", function () { location.reload(); }); peerBanner.append(text, reload); canvasLogs.add(reason, "warning"); }',
      '    if (groupQueueUi) groupQueueUi.refresh();',
      '  }',
      '  host.connectAutomation({ current: function () { return documentState; }, execute: automation.execute, error: setError, busy: localCanvasBusy, peers: function (info) { canvasPeers = info; updatePeerBlock(); } });',
      '  const editorHandle = {',
      '    current: function () { return documentState ? structuredClone(documentState) : null; },',
      '    draft: function () { return dirty() ? { document: structuredClone(documentState), savedLayout: savedKey } : null; },',
      '    save: flush,',
      '    prepareLeave: async function () {',
      '      const reason = hostEditBlocked(); if (reason) { setError(reason); return false; }',
      '      const leaving = documentState; const leavingOpening = opening;',
      '      if (!(await leaveCurrent())) return false;',
      '      const blocked = hostEditBlocked(); if (blocked) { setError(blocked); return false; }',
      '      if (documentState !== leaving || opening !== leavingOpening || dirty()) { setError("画布在保存期间发生变化，请确认当前编辑后再离开。"); return false; }',
      '      return true;',
      '    },',
      '    execute: automation.execute,',
      '    importProjectAsset: async function (input) {',
      '      const reason = hostEditBlocked(); if (reason) throw new Error(reason);',
      '      pendingAssetImports++; publishDirty();',
      '      try { await importProjectAsset(input); render(); } finally { finishAssetImport(); }',
      '      if (!(await flush())) throw new Error("素材已添加，但画布保存失败，请手动保存。");',
      '    }',
      '  };',
      '  function hostEditBlocked() {',
      '    if (pendingExports || (resourceExport && resourceExport.isBusy)) return "请等待资源导出完成。";',
      '    if (!documentState || canvasOpening) return "画布正在加载，请稍后再试。";',
      '    if (canvasAutomationBusy || pendingAssetImports || pendingImageImport || pendingVideoImport || drag || (wireUi && wireUi.isBusy) || document.querySelector("dialog[open]") || selectionAction || generationUi.hasInputDraft() || sequenceUi.hasUnsavedFrames) return "请先完成或关闭当前编辑、草稿和导入操作。";',
      '    if (generationUi.isBusy || sequenceUi.isBusy || modelUi.isBusy || imageAssetsUi.isBusy || uiRecognitionUi.isBusy || templateWorkflow.isBusy || groupQueue.isBusy || (imageEditing && imageEditing.isBusy) || (videoHistory && videoHistory.isBusy)) return "当前画布任务执行中，请等待完成。";',
      '  }',
      '  void boot().catch',
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    'const sequenceRunning = Boolean(',
    'const sequenceRunning = Boolean(pendingExports > 0 || (resourceExport && resourceExport.isBusy) || canvasAutomationBusy || (imageAssetsUi && imageAssetsUi.isBusy) || (modelUi && modelUi.isBusy) || '
  );
  page = replaceCanvasPageText(
    page,
    '    media[assetPath] = mediaUrl(assetPath);',
    '    if (store.mediaVersions) { const current = documentState; const matching = current ? current.nodes.filter(function (node) { return node.assetPath === assetPath; }) : []; if (current) { try { await refreshCanvasMedia(current, store, matching); } catch (caught) { setError(caught.message); } } } media[assetPath] = mediaUrl(assetPath);'
  );
  page = replaceCanvasPageText(
    page,
    '  async function openDocument(id) {',
    [
      '  async function openDocument(id) { canvasOpening++; try { await loadCanvasDocument(id); } finally { canvasOpening--; } }',
      '  async function loadCanvasDocument(id) {',
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    CANVAS_MODEL_STYLES + IMAGE_ASSETS_STYLES + '</style>'
  );
  page = replaceCanvasPageText(
    page,
    '    canvasLogs.setContext(documentState.id);',
    '    if (modelUi) modelUi.sync();\n    canvasLogs.setContext(documentState.id);'
  );
  page = replaceCanvasPageText(
    page,
    '      renderCanvasCardStatus(card, overlayState,',
    '      if (!["model", "model-views"].includes(node.type)) renderCanvasCardStatus(card, overlayState,'
  );
  page = replaceCanvasPageText(
    page,
    '  function protectTemplateSelection() {',
    '  function protectTemplateSelection() {\n    if (pendingExports || (resourceExport && resourceExport.isBusy)) { setError("请等待资源导出完成。"); return true; }\n    if (imageAssetsUi && imageAssetsUi.isBusy) { setError("请等待游戏资产保存完成，再修改卡片。"); return true; }\n    if (modelUi && modelUi.isBusy) { setError("请先停止模型的本地等待，再修改卡片。"); return true; }'
  );
  page = replaceCanvasPageText(
    page,
    '  async function leaveCurrent() {',
    '  async function leaveCurrent() {\n    if (pendingExports || (resourceExport && resourceExport.isBusy)) { setError("请等待资源导出完成，再切换画布。"); return false; }\n    if (imageAssetsUi && imageAssetsUi.isBusy) { setError("请等待游戏资产保存完成，再切换画布。"); return false; }\n    if (modelUi && modelUi.isBusy) { setError("请先停止模型的本地等待，再切换画布。"); return false; }'
  );
  page = replaceCanvasPageText(
    page,
    '  function requestImageImport(nodeId) {',
    '  function requestImageImport(nodeId) {\n    if (modelUi && modelUi.isBusy) { setError("请先停止模型的本地等待，再替换角色图片。"); return; }'
  );
  page = replaceCanvasPageText(
    page,
    '    const previous = past.pop();',
    '    if (imageAssetsUi && imageAssetsUi.isBusy) { setError("请等待游戏资产保存完成，再撤销。"); return; }\n    if (modelUi && modelUi.isBusy) { setError("请先停止模型的本地等待，再撤销。"); return; }\n    const previous = past.pop();'
  );
  page = replaceCanvasPageText(
    page,
    '    const next = future.shift();',
    '    if (imageAssetsUi && imageAssetsUi.isBusy) { setError("请等待游戏资产保存完成，再重做。"); return; }\n    if (modelUi && modelUi.isBusy) { setError("请先停止模型的本地等待，再重做。"); return; }\n    const next = future.shift();'
  );
  page = replaceCanvasPageText(
    page,
    '  function duplicateSelected() {',
    '  function duplicateSelected() {\n    if (documentState && documentState.nodes.some(function (node) { return selected.has(node.id) && ["model", "model-views"].includes(node.type); })) { setError("模型卡片依赖完整来源，请通过添加模板或另存模板创建独立流程。"); return; }'
  );
  page = replaceCanvasPageText(page, '</style>', CANVAS_WIRE_STYLES + '</style>');
  page = replaceCanvasPageText(
    page,
    '  void boot().catch',
    [
      '  wireUi = createCanvasWireUi({ board: board, current: function () { return documentState; },',
      '    panning: function () { return space || handMode(); },',
      '    blocked: function () { return canvasOpening || canvasAutomationBusy || drag || pendingAssetImports || pendingImageImport || pendingVideoImport || selectionAction || document.querySelector("dialog[open]") || generationUi.isBusy || sequenceUi.isBusy || templateWorkflow.isBusy || groupQueue.isBusy || modelUi.isBusy || imageAssetsUi.isBusy || (imageEditing && imageEditing.isBusy); },',
      '    select: function () { selected.clear(); }, remember: remember, changed: markDirty, render: render });',
      '  canvasMarks = createCanvasMarks({',
      '    board: function () { return board; },',
      '    document: function () { return documentState; },',
      '    worldPoint: worldPoint,',
      '    navigation: function () { return space || handMode(); },',
      '    blocked: function () { return Boolean(canvasOpening || canvasAutomationBusy || drag || document.querySelector("dialog[open]")); },',
      '    remember: remember,',
      '    changed: function () { markDirty(); },',
      '    render: render,',
      '    select: function (id) { selected.clear(); selected.add(id); selectionAction = ""; },',
      '    place: function (shape) {',
      '      if (!documentState) { setError("请先打开画布。"); return; }',
      '      if (documentState.nodes.length >= 400) { setError("画布卡片已达到容量限制。"); return; }',
      '      var arrow = shape === "arrow";',
      '      var placed = workspace.placeMark(shape);',
      '      if (!placed) return;',
      '      remember();',
      '      var node = { id: crypto.randomUUID(), type: "mark", x: placed.x, y: placed.y, width: placed.width, height: placed.height, title: arrow ? "箭头" : "标注框", mark: { shape: arrow ? "arrow" : "ellipse", color: "#ff4d4f", stroke: 4 } };',
      '      if (arrow) { node.mark.point = "se"; node.mark.from = { x: placed.width * .1, y: placed.height / 2 }; node.mark.to = { x: placed.width * .9, y: placed.height / 2 }; }',
      '      documentState.nodes.push(node);',
      '      selected.clear(); selected.add(node.id); selectionAction = "";',
      '      setError(""); markDirty(); render();',
      '    },',
      '    beginPan: function (event) {',
      '      if (!documentState || drag) return;',
      "      drag = { kind: 'pan', x: event.clientX, y: event.clientY, ox: documentState.viewport.x, oy: documentState.viewport.y };",
      '      if (board.setPointerCapture) board.setPointerCapture(event.pointerId);',
      '    },',
      '  });',
      '  void boot().catch',
    ].join('\n')
  );
  page = replaceCanvasPageText(
    page,
    '  function render() {',
    '  var wireUi;\n  function render() {'
  );
  page = replaceCanvasPageText(
    page,
    '    if (layout(documentState) === savedKey)',
    '    if (wireUi) wireUi.sync();\n    if (layout(documentState) === savedKey)'
  );
  page = replaceCanvasPageText(
    page,
    'const sequenceRunning = Boolean(',
    'const sequenceRunning = Boolean((wireUi && wireUi.isBusy) || '
  );
  page = replaceCanvasPageText(
    page,
    '      if (drag || pendingAssetImports',
    '      if ((wireUi && wireUi.isBusy) || drag || pendingAssetImports'
  );
  page = replaceCanvasPageText(
    page,
    '  async function leaveCurrent() {',
    '  async function leaveCurrent() { if (wireUi && wireUi.isBusy) return false;'
  );
  page = replaceCanvasPageText(
    page,
    '  let sequenceUi = null;',
    '  let ui015Workflow = null; let uiRecognitionUi = null; let sequenceUi = null;'
  );
  page = replaceCanvasPageText(
    page,
    '  groupQueue = createCanvasGroupQueue({',
    [
      '  uiRecognitionUi = createUiRecognitionUi({ current: function () { return documentState; }, store: store, save: flush, remember: remember, changed: markDirty, render: render, error: setError, loadMedia: loadMedia,',
      '    blocked: function () { return Boolean(groupQueue && groupQueue.isBusy) || generationUi.isBusy || sequenceUi.isBusy || pendingAssetImports > 0; },',
      '    autoRunning: function (node) { return Boolean(ui015Workflow && node.sectionId && ui015Workflow.isActive(node.sectionId)); },',
      '    focus: function (id) { const node = documentState.nodes.find(function (item) { return item.id === id; }); if (!node) return; const view = documentState.viewport; view.x = board.clientWidth / 2 - (node.x + node.width / 2) * view.scale; view.y = board.clientHeight / 2 - (node.y + node.height / 2) * view.scale; selected.clear(); selected.add(id); selectionAction = ""; markDirty(); render(); },',
      '    openCanvas: async function (id) { const saved = await store.load(id); const option = document.createElement("option"); option.value = id; option.textContent = saved.title; select.append(option); await openDocument(id); },',
      '  });',
      '  ui015Workflow = createUi015Workflow({ current: function () { return documentState; }, store: store,',
      '    needs: function (id) { return templateWorkflow.status(id) === "pending"; }, problem: function (id) { return generationUi.queueBlockReason(id); },',
      '    runImage: function (id) { return uiRecognitionUi.runImage(id, function () { return generationUi.runTemplateImage(id); }, true, true); },',
      '    recognize: function (id, recover) { const node = documentState.nodes.find(function (item) { return item.id === id; }); return node ? uiRecognitionUi.runRecognition(node, true, recover) : Promise.resolve(false); },',
      '    recoverImage: function (id, force) { return generationUi.recoverForRetry(id, force); },',
      '    recoverRecognition: function (id, force) { return uiRecognitionUi.recoverForRetry(id, force); },',
      '    chooseDesign: requestImageImport, sync: syncUiBboxWorkflow,',
      '    queue: { start: function (id, confirmed) { return groupQueue.start(id, confirmed); }, spendRetry: function (id, nodeId) { return groupQueue.spendRetry(id, nodeId); }, view: function (id) { return groupQueue.view(id); }, remaining: function (id) { return groupQueue.remaining(id); } },',
      '    focus: function (id) { const node = documentState && documentState.nodes.find(function (item) { return item.id === id; }); if (!node) return; const view = documentState.viewport; view.x = board.clientWidth / 2 - (node.x + node.width / 2) * view.scale; view.y = board.clientHeight / 2 - (node.y + (node.height || 200) / 2) * view.scale; selected.clear(); selected.add(id); selectionAction = ""; render(); },',
      '    log: function (message, level) { canvasLogs.add(message, level || "info"); }, failure: function () { return error.textContent; },',
      '    remember: remember, save: flush, changed: markDirty, render: render, error: setError, blocked: peerBlock',
      '  });',
      '  groupQueue = createCanvasGroupQueue({',
    ].join(String.fromCharCode(10))
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);',
    '      if (uiRecognitionUi) uiRecognitionUi.render(card, node);' +
      String.fromCharCode(10) +
      '      world.append(card);'
  );
  page = replaceCanvasPageText(
    page,
    'const sequenceRunning = Boolean(',
    'const sequenceRunning = Boolean((uiRecognitionUi && uiRecognitionUi.isBusy) || '
  );
  page = replaceCanvasPageText(
    page,
    '    busy: function () { return templateWorkflow.isBusy',
    '    busy: function () { return (uiRecognitionUi && uiRecognitionUi.isBusy) || templateWorkflow.isBusy'
  );
  page = replaceCanvasPageText(
    page,
    '  async function leaveCurrent() {',
    '  async function leaveCurrent() { if (uiRecognitionUi && uiRecognitionUi.isBusy) { setError("识图仍在执行，请等待结果保存后再切换画布。"); return false; }'
  );
  page = applyImageSlotPatches(page);
  page = replaceCanvasPageText(page, '<script>', '<script>' + (integration.themeScript || ''));
  page = replaceCanvasPageText(
    page,
    '      if (generationUi.isBusy || sequenceUi.isBusy || templateWorkflow.isBusy || groupQueue.isBusy',
    '      if ((uiRecognitionUi && uiRecognitionUi.isBusy) || generationUi.isBusy || sequenceUi.isBusy || templateWorkflow.isBusy || groupQueue.isBusy'
  );
  page = replaceCanvasPageText(
    page,
    '    referencesBlocked: function () { return canvasAutomationBusy ||',
    '    referencesBlocked: function () { return (uiRecognitionUi && uiRecognitionUi.isBusy) || canvasAutomationBusy ||'
  );
  page = replaceCanvasPageText(page, '</style>', CANVAS_THEME_STYLES + '</style>');
  page = replaceCanvasPageText(page, '</style>', CANVAS_WEB_STYLES + '</style>');
  page = replaceCanvasPageText(
    page,
    '  const host = createCanvasHost();',
    "  const host = createCanvasHost();\n  const canvasWeb = host.appearance === 'web';\n  if (canvasWeb) document.documentElement.classList.add('canvas-appearance-web');"
  );
  // Web draws image references as side-to-side curves without arrowheads.
  page = replaceCanvasPageText(
    page,
    "      path.setAttribute('marker-end', 'url(#canvas-wire-arrow)');",
    "      if (canvasWeb && edge.kind === 'image-variant') path.setAttribute('d', canvasWebWire(from, to, view).d); else path.setAttribute('marker-end', 'url(#canvas-wire-arrow)');"
  );
  // Web opens the composer for AI slots (empty or generated); plain imported images only get the menu.
  page = replaceCanvasPageText(
    page,
    '      const panelOpen = restricted ? adjusting : emptyImage || Boolean(selectionAction);',
    '      const panelOpen = restricted ? adjusting : emptyImage || Boolean(selectionAction) || (canvasWeb && canvasWebSlot(node));'
  );
  // Bug fix (all appearances): drags re-render per pointermove, which rebuilt the open composer and reset its selects.
  page = replaceCanvasPageText(
    page,
    '    function renderSelectionToolbar() {\n      selectionToolbar.replaceChildren();',
    "    function renderSelectionToolbar() {\n      const previousComposer = composerHold || (drag && drag.moved && ['move', 'resize', 'pan'].includes(drag.kind)) ? selectionToolbar.querySelector(':scope > .selection-panel') : null;\n      selectionToolbar.replaceChildren();"
  );
  // Pressing the already-selected card starts a drag; its selection render must not rebuild the composer either.
  page = replaceCanvasPageText(
    page,
    '        selectNode(node.id, event.shiftKey || event.metaKey || event.ctrlKey);\n        startDrag(event, node.id);',
    '        composerHold = !(event.shiftKey || event.metaKey || event.ctrlKey) && selected.size === 1 && selected.has(node.id);\n        try { selectNode(node.id, event.shiftKey || event.metaKey || event.ctrlKey); } finally { composerHold = false; }\n        startDrag(event, node.id);'
  );
  page = replaceCanvasPageText(
    page,
    '  let drag = null;',
    '  let drag = null;\n  let composerHold = false;'
  );
  page = replaceCanvasPageText(
    page,
    "      if (panelOpen) { const panel = document.createElement('div');",
    "      const composerKey = panelOpen ? canvasComposerKey(documentState, node, [selectionAction, remoteState && remoteState.status, generationUi.isNodeBusy(node.id), restricted, adjusting]) : '';\n      if (panelOpen && previousComposer && previousComposer.dataset.composerKey === composerKey) { selectionToolbar.append(previousComposer); positionSelectionToolbar(); return; }\n      if (panelOpen) { const panel = document.createElement('div'); panel.dataset.composerKey = composerKey;"
  );
  page = replaceCanvasPageText(
    page,
    '    renderSelectionToolbar();\n    wires.setAttribute',
    '    if (canvasWeb) decorateCanvasWebCards({ world: world, doc: documentState, selected: selected, upload: requestImageImport, busy: function (id) { return Boolean(generationUi && (generationUi.isNodeBusy(id) || generationUi.hasUnsettledResult(id))); } });\n    renderSelectionToolbar();\n    wires.setAttribute'
  );
  page = replaceCanvasPageText(
    page,
    '    select: function () { selected.clear(); }, remember: remember, changed: markDirty, render: render, remove:',
    '    web: canvasWeb, select: function () { selected.clear(); }, remember: remember, changed: markDirty, render: render, remove:'
  );
  page = replaceCanvasPageText(
    page,
    '  canvasMarks = createCanvasMarks({',
    '  var webChrome = canvasWeb ? createCanvasWebChrome({ board: board, current: function () { return documentState; } }) : null;\n  canvasMarks = createCanvasMarks({'
  );
  page = replaceCanvasPageText(
    page,
    "    } else if (drag.kind === 'wire') {\n      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true;",
    "    } else if (drag.kind === 'wire') {\n      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true;\n      if (webChrome && drag.moved) webChrome.preview(drag, event);"
  );
  page = replaceCanvasPageText(
    page,
    "      setStatus(ack.pending ? '未保存' : '已保存');",
    "      saveFailed = false; setStatus(ack.pending ? '未保存' : '已保存');"
  );
  page = replaceCanvasPageText(
    page,
    "      setError(caught.message || '保存失败');",
    "      saveFailed = true; setError(caught.message || '保存失败');"
  );
  page = replaceCanvasPageText(
    page,
    '      world.append(card);',
    '      if (templateWorkflow) renderCanvasWorkTiming(card, node, templateWorkflow.workDuration(node.id));\n      world.append(card);'
  );
  page = replaceCanvasPageText(
    page,
    '  setInterval(function () { groupQueueUi.tick(); }, 1000);',
    '  setInterval(function () { groupQueueUi.tick(); world.querySelectorAll("[data-work-time]").forEach(function (time) { const duration = templateWorkflow.workDuration(time.dataset.workTime); if (duration !== undefined) time.textContent = "耗时 " + formatCanvasWorkDuration(duration); }); }, 1000);'
  );
  page = replaceCanvasPageText(
    page,
    '</style>',
    '.canvas-work-time { position:absolute; right:8px; bottom:8px; padding:2px 6px; border-radius:4px; background:var(--canvas-panel, #24221e); color:var(--canvas-text, #d5c8ad); font-size:12px; font-variant-numeric:tabular-nums; pointer-events:none; }\n</style>'
  );
  page = replaceCanvasPageText(
    page,
    'void boot().catch',
    'void boot().then(function () { if (host.onReady && documentState) host.onReady(editorHandle); }).catch'
  );
  page = applyWebInteractionPatches(page);
  // Keep template anchors from rewriting function bodies inside injected helpers.
  page = page.replace('/*__HELPERS__*/', () => helperSource);
  return page.replace(
    '<title data-maker-canvas="maker-canvas-page">创作画布</title>',
    '<title data-maker-canvas="maker-canvas-page">序列帧动画</title>'
  );
}
