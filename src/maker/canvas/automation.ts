import type { CanvasDocument } from './model.js';
import { canvasParameterSchema } from './automationInfo.js';
import { validateUiRecognition } from './uiRecognition.js';
import { validateUiAtlasPlan } from './uiAssetBindings.js';
import {
  CANVAS_COMMAND_ACTIONS,
  CANVAS_SEQUENCE_SETTING_FIELDS,
  prepareCanvasNodeUpdatesWithValidation,
} from '../../../packages/maker-canvas/src/features/automation.js';
export type {
  CanvasCommand,
  CanvasOperation,
} from '../../../packages/maker-canvas/src/contracts.js';
export {
  canvasAutomationSnapshot,
  validateCanvasCommandStructure as validateCanvasCommand,
} from '../../../packages/maker-canvas/src/features/automation.js';
export function canvasAutomationCapabilities() {
  return {
    modelSettings: {
      command: 'canvas model-settings --target-dir PATH',
      policy:
        'Read effective image generation and vision choices for the target project before invoking any model. Default vision is Server API; a read-only availability check resolves it to chatgpt-web when unavailable, without changing the saved selection. Explicit user choices take precedence. Follow vision.source; never switch providers yourself or replay submitted tasks. Local means the current AI client executes its own capability; browser run cannot invoke it. Import client-generated images with canvas import; import creates a new card and does not complete an existing workflow node. API keys are never returned.',
    },
    uiArchives: {
      list: 'canvas ui-archives --target-dir PATH [--canvas-id ID]',
      archiveSaved: 'canvas archive-ui --target-dir PATH --canvas-id ID',
      lifecycle:
        'Recognition and completed resource bundles are archived locally on save. Commands work without a browser or model. ui-archives is read-only; archive-ui snapshots saved data, never unsaved drafts. Use bboxPath and bindingsPath from the same revision; never guess the latest file.',
    },
    actions: [...CANVAS_COMMAND_ACTIONS],
    nodeTypes: ['image', 'video', 'note', 'mark', 'sequence', 'animation', 'model-views', 'model'],
    editable: [
      'title',
      'text',
      'mark',
      'x',
      'y',
      'width',
      'height',
      'prompt',
      'parameters',
      'sequenceSettings',
      'modelQuality',
      'mergeIcons',
      'uiRecognition',
      'uiAtlasPlan',
      'uiAtlasPrelayout',
    ],
    modelWorkflow: {
      quality: ['fast', 'balanced', 'high_quality'],
      steps:
        'character image -> run model-views with --allow-paid -> query -> show ALL previews -> explicit user approval -> confirm-model with --allow-paid -> query',
      confirmation:
        'Never approve automatically or use group run to bypass review. confirm-model requires the current reviewId from inspect state.model or models. Final model paths are already inside assets/model.',
      history:
        'canvas models --canvas-id ID reads persisted local attempts without a page; query on model cards contacts the original upstream task.',
    },
    imageAssetsWorkflow: {
      groupRun:
        'Run a template group once with --allow-paid after user authorization. Images execute in dependency order, then resource cards use their current saved grid or confirmed content regions. Definite image generation failures allow at most two paid retries per source. Atlas slicing failures keep the existing image and assets and require local crop review; they do not trigger paid regeneration. Unknown tasks and download/save failures are never regenerated. Independent branches continue. Completion means saved assets, not visual approval or installation into the game.',
      steps:
        'preview-image-assets -> inspect the returned grid preview -> confirm-image-assets -> export images',
      confirmation:
        'Preview/run on an image-assets card completes the command with result.status=waiting_for_confirmation, not final assets. Use the current reviewId and revision after visually checking every cell. New previews, edits and page reloads invalidate old confirmation. Game UI atlases with default grids use transparent separators for lossless alignment; explicit margins/gaps remain fixed. No semantic naming.',
    },
    templateSkills: {
      source: 'templates.presets/items[].skills and inspect.skills / section.templateSkills',
      instruction:
        'Before executing a template, read its associated Skills using the paths in Maker status or the current project Skill directories. If unavailable, report the missing Skill; do not claim to have followed it. Skills guide the Agent, not automatic console execution, and do not bypass review or paid-operation confirmation.',
    },
    uiWorkflow: {
      syncBboxBatches:
        'sync-ui-batches input: {id: section ID, artText: string[] | boolean, background: boolean}. Bbox experimental template only. Pass Bbox text IDs for all required art text (one PNG per ID); [] means none, true retains the legacy main-title branch. Requires current validated recognition and revision. Creates missing batch cards and links without model calls, preserves existing work. Skill decides art text and unlisted environment background. Reinspect after saving; never replay paid jobs.',
      skill: 'maker-ui-workflow',
      prelayoutSkill: 'maker-ui-bbox-workflow',
      imageSizing:
        'imageInfo reports actual image pixels and ratio, not card geometry. originalImage traces the unique original through existing references. Use parameters.aspectRatio=source for full-screen processing, or a supported fixed ratio for atlases. Uncommon input ratios carry warnings; unsupported source ratios stop before billing. Generation history separates referenceImages, originalImage, parameters.targetSize, resultImageInfo and submittedPrompt. Never infer actual dimensions from requested size.',
      recognition:
        'Default vision uses Server API when the target project availability check succeeds, otherwise chatgpt-web. Explicit choices take precedence. For local, read images with the client vision capability and submit uiRecognition.result via update-nodes; the browser cannot invoke the client model. Server and custom API calls require paid authorization. When vision.source=chatgpt-web, follow the current section.templateSkills with the host Agent browser, reuse its session and current model/effort, and submit validated Bbox via update-nodes. No executor installation. Login is optional: if logged out, explain that model selection is unavailable and recognition quality/Bbox accuracy may vary, then offer continue without login or login first. Honor the choice without repeated prompts. Never bypass an actual login/captcha/upload restriction. Prepare prompts with canvas recognition-input; validate both replies with canvas recognition-result. Images are uploaded to ChatGPT and subject to website quota. CLI run enables recognition for text-free cards; input.recognition=false disables it. Two-pass API recognition requires a text-free image linked from the original design: detect UI elements first, then original text. Export version=1 Bbox JSON with coordinateSpace=design-pixels, bboxFormat=xywh, design/cutSource identities, elements and texts. Submitted and unknown requests must be queried, never replayed or switched to another provider.',
      steps:
        'design/layout -> reviewed PNG assets -> import into project -> generate_resource_meta -> assemble-ui.mjs -> console UI editor comparison',
      completion:
        'For an editable game UI request, PNG export is an intermediate result: the Agent continues with the Skill through assembly and editor verification. Stop at PNG only when the user requests extraction alone. Do not ask the user to copy a handoff prompt when the Agent is already operating the CLI.',
      boundary:
        'Enabled CLI recognition follows the selected vision source and saves the same two-pass Bbox JSON; assembly remains a separate Skill task. Read every resource card and pending state; one successful export does not mean all assets or the UI are complete. Use saved Bbox coordinates and explicit PNG bindings before assembly.',
    },
    sequenceSettings: [...CANVAS_SEQUENCE_SETTING_FIELDS],
    unsupported: [
      'brush',
      'per-frame-editing',
      'automatic-duplicate-removal',
      'headless-execution',
      'template-library-mutation',
    ],
    requiresConnectedPage: true,
    paidExecutionRequiresAllowPaid: true,
    parameterSchema: canvasParameterSchema(),
    inputs: {
      run: {
        id: 'node or group ID',
        recognition:
          'optional boolean for UI groups/images; defaults true in CLI automation. Set false explicitly for a no-recognition comparison. The setting is saved to the source card; browser group buttons use the saved switch without applying this CLI default.',
      },
      'update-nodes': {
        nodes:
          'Array of patches with id and editable fields. width/height resize only the card, not the image or viewport (width 48..2000, height 36..1600; sections up to 100000; marks 8..8000). For image cards with known pixels, set width OR height and the other axis follows the image ratio including the header; if both are supplied they must match. Layout-only changes do not invalidate generated results. mark patches accept shape ellipse/arrow, color #RRGGBB, stroke 1..8, and paired from/to {x,y} endpoints in local coordinates for arrows.',
      },
      'preview-image-assets': {
        id: 'image-assets card ID; read-only preview, no final files',
        grid: 'optional object: columns/rows positive integers (at most 120 cells); marginX/marginY/gapX/gapY nonnegative integer pixels; omitted fields use saved/default grid',
        cut: 'optional object: mode=grid/content; content detects transparent separators without AI. expectedCount=0..120 (0 unrestricted); regions optionally provides confirmed source-pixel rectangles {name:item_001...,x,y,width,height} for manual corrections. Rectangles must not overlap. Existing confirmed content regions are reused only for an unchanged source. Always inspect the actual preview before confirmation.',
      },
      'confirm-image-assets': {
        id: 'image-assets card ID',
        reviewId: 'current preview token; only confirm after inspecting the returned grid image',
      },
      'preview-model': {
        id: 'completed model card ID; opens read-only rotation preview, no paid request',
      },
      inspect: { id: 'optional node or group ID; includes direct upstream' },
      'confirm-model': {
        id: 'model card ID',
        reviewId: 'current review token; requires explicit user approval of all returned previews',
      },
      import: { file: 'CLI --file: absolute local path', title: 'optional title in input JSON' },
      'set-references': {
        id: 'target image/video ID',
        sourceIds: 'ordered image IDs; [] clears',
        includeSelf: 'optional boolean, image only; default false',
      },
      'add-node': {
        type: 'image/video/note/mark/sequence/animation/model-views/model',
        shape: 'ellipse or arrow when type is mark',
        x: 'optional mark origin; omitted marks use a visible default in the current view',
        y: 'optional mark origin',
        width: 'optional mark width, 8..8000',
        height: 'optional mark height, 8..8000',
        color: 'optional #RRGGBB; default #ff4d4f',
        stroke: 'optional integer 1..8; default 3',
        point: 'legacy arrow head corner nw/ne/sw/se; not accepted by ellipse',
        direction: 'optional initial arrow direction n/e/s/w; not accepted by ellipse',
        from: 'optional local start {x,y}; requires to; not accepted by ellipse',
        to: 'optional local end {x,y}; requires from; not accepted by ellipse',
        sourceId: 'required for sequence/animation/model-views/model; not accepted by mark',
      },
      export: {
        id: 'result node ID',
        format: 'png/jpg/video/atlas/frames/model/images/bundle',
        loop: 'optional boolean; default true',
      },
      download: {
        operationId: 'CLI --operation-id',
        outputDir: 'CLI --output-dir: existing absolute directory',
      },
    },
    exportFormats: {
      'resource-bundle': ['bundle'],
      section: ['bundle'],
      'image-assets': ['images'],
      model: ['model'],
      image: ['png', 'jpg'],
      video: ['video'],
      sequence: ['atlas', 'frames'],
      animation: ['atlas', 'frames'],
    },
  };
}
export function prepareCanvasNodeUpdates(document: CanvasDocument, input: Record<string, unknown>) {
  return prepareCanvasNodeUpdatesWithValidation(document, input, {
    validateUiRecognition,
    validateUiAtlasPlan,
  });
}
