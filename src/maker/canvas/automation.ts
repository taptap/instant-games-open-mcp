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
    multiProject: {
      pages: 'canvas pages --target-dir PATH',
      sessions: 'canvas sessions --target-dir PATH',
      policy:
        'Different projects share one compatible console service and use their own canvases. Pass --session-id ID with project-scoped canvas CLI calls, reusing the same conversation ID across canvases. If unavailable, generate one ID for the conversation. The service stores only sessionId and lastOperationAt per project, using server UTC time at invocation; this does not require a browser. sessions is read-only, even with --session-id. capabilities is project-independent and does not register. Calls without --session-id keep existing behavior and are not recorded. Entries last until the service restarts; no occupancy, timeout or access decisions are made. Agents read the records and decide whether to proceed. Existing command execution requirements still apply. Do not stop the shared service when your task ends.',
    },
    modelSettings: {
      command: 'canvas model-settings --target-dir PATH',
      policy:
        'Read effective image generation and vision API settings for the target project before invoking a model. Vision supports Server API (default) and custom API only. Legacy local/chatgpt-web selections resolve to Server API; unavailable APIs never fall back to client AI or websites. Follow the configured API and query submitted tasks without replay. Generation settings are independent. API keys are never returned.',
    },
    uiArchives: {
      list: 'canvas ui-archives --target-dir PATH [--canvas-id ID]',
      archiveSaved: 'canvas archive-ui --target-dir PATH --canvas-id ID',
      lifecycle:
        'Recognition and completed resource bundles are archived locally on save. Commands work without a browser or model. ui-archives is read-only; archive-ui snapshots saved data, never unsaved drafts. Use bboxPath and bindingsPath from the same revision; never guess the latest file.',
    },
    actions: [...CANVAS_COMMAND_ACTIONS],
    recovery: {
      save: 'save with empty input retries saving the current page without rerunning tasks. Requires the current revision; does not bypass active tasks, dialogs, or uncommitted editor drafts.',
      recognition:
        'recognize-ui with input {id: recognition card ID} and --allow-paid generates Bbox only, preserving existing images. For pending requests it queries the original request; query is also available without --allow-paid. To resume Server API work, pass recover:true with --allow-paid; this reuses the original request and skips completed passes without a browser dialog. If an older client cleared pendingId, also pass the original attemptId. Recovery never creates a new attempt when the original is missing. Local or web recognition remains an external Agent workflow.',
      status:
        'status, wait and export --output-dir exit nonzero for failed or unknown operations. Unknown does not mean failed; inspect the original card and request before any retry. A failed operation with code INVALID_ARGS (arguments or page state) or NOT_FOUND (canvas, card or edge missing) was refused before any change: fix the cause and submit with a new request-id. A failed operation without code may have started work (for example a 015 run or a save after an edit): inspect before deciding; never resubmit paid steps blindly.',
    },
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
        'Run a template group once with --allow-paid for the workflow requested by the user; do not ask again at each step. Images execute in dependency order, then resource cards use their current saved grid or confirmed content regions. Definite image generation failures allow at most two retries per source. Atlas slicing failures keep the existing image and assets and require local crop review; they do not trigger regeneration. Unknown tasks and download/save failures are never regenerated. Independent branches continue. Completion means saved assets, not visual approval or installation into the game.',
      steps:
        'preview-image-assets -> inspect the returned grid preview -> confirm-image-assets -> export images',
      confirmation:
        'Preview/run on an image-assets card completes the command with result.status=waiting_for_confirmation, not final assets. Use the current reviewId and revision after visually checking every cell. New previews, edits and page reloads invalidate old confirmation. Game UI atlases with default grids use transparent separators for lossless alignment; explicit margins/gaps remain fixed. No semantic naming.',
    },
    templateSkills: {
      source: 'templates.presets/items[].skills and inspect.skills / section.templateSkills',
      instruction:
        'Before executing a template, read its associated Skills using the paths in Maker status or the current project Skill directories. If unavailable, report the missing Skill; do not claim to have followed it. Skills guide the Agent, not automatic console execution, and preserve review requirements and the user-requested scope.',
    },
    uiWorkflow: {
      bboxWorkflow:
        'For the 015 Bbox template (and copies linked to maker-ui-bbox-workflow), one run of the section with --allow-paid drives the whole group without stopping: text removal, both recognition passes, batches, prelayout, separation, cutting, then assembly, resource meta and the reference check. It returns only when the run has finished: workflow.status=ready with workflow.current.stage=assemble, or the operation fails with the reason. Defaults: Bbox texts with role=title become art text, and the environment background is restored when recognition found none; pass input.artText (text IDs, [] for none) and input.background to choose otherwise. Each failing step is retried at most twice in total (recognition reuses its original request; an image result is queried first, a task still running on the server is waited for, and only an unknown or failed one is resubmitted, which may cost one extra generation). Cuts are assembled unreviewed; canvas ui-delivery reports delivery.review (unreviewed, missing, unbound). Then review every batch with preview-image-assets / confirm-image-assets, repair as the Skill describes and run canvas assemble-ui --new-version.',
      assembleUi:
        'canvas assemble-ui --target-dir PATH --canvas-id ID --id BUNDLE_ID [--new-version] imports the confirmed resources archive of the saved canvas into assets/ui/<ui>/<version>/ (images, reserve, source, ui), assembles <screen-key>.ui.json and its matching reference PNG with Label text, art text images, background and button states, then explicitly generates resource meta and runs ui check. The same archive returns the existing delivery or resumes meta/check; --new-version writes another folder. Existing files are never overwritten. Names come from bbox.screen {name, key}; --ui-title TITLE --ui-name KEY overrides them without recognition. Use --new-version to name a previously delivered UI. Read delivery.uiFile instead of assuming a filename. canvas ui-delivery reads the status. ASSETS_UNCONFIRMED and ASSEMBLY_BUSY are not failures of generation.',
      syncBboxBatches:
        'sync-ui-batches input: {id: section ID, artText: string[] | boolean, background: boolean}. Bbox experimental template only; run with artText/background does the same. Pass Bbox text IDs for all required art text (one PNG per ID); [] means none, true retains the legacy main-title branch. Unselected art text and the extra background are retired (kept, excluded from export) and restored when selected again. Requires current validated recognition and revision. Creates missing batch cards and links without model calls, preserves existing work. Reinspect after saving; never replay submitted jobs.',
      skill: 'maker-ui-workflow',
      prelayoutSkill: 'maker-ui-bbox-workflow',
      imageSizing:
        'imageInfo reports actual image pixels and ratio, not card geometry. originalImage traces the unique original through existing references. Use parameters.aspectRatio=source to preserve the exact original ratio, or a positive integer width:height ratio for atlases. Preset choices are examples, not a whitelist. Uncommon ratios carry warnings; actual provider constraints are checked before submission. Generation history separates referenceImages, originalImage, parameters.targetSize, resultImageInfo and submittedPrompt. Never infer actual dimensions from requested size.',
      recognition:
        'Vision uses Server API by default or the selected custom API. Local AI and website recognition are retired; do not use them as fallbacks. If an API is unavailable, report the error and restore the API configuration. Use existing task authorization for both recognition passes. CLI run enables recognition for text-free cards; input.recognition=false disables it. Two-pass API recognition requires a text-free image linked from the original design: detect UI elements first, then original text. Export version=1 Bbox JSON with coordinateSpace=design-pixels, bboxFormat=xywh, design/cutSource identities, elements and texts. Submitted and unknown requests must be queried, never replayed or switched to another provider.',
      steps:
        'design/layout -> reviewed PNG assets -> import into project -> generate_resource_meta -> assemble-ui.mjs -> console UI editor comparison. For 015 groups canvas assemble-ui performs the import, assembly, meta and check steps.',
      completion:
        'For an editable game UI request, PNG export is an intermediate result: the Agent continues with the Skill through assembly and editor verification. Stop at PNG only when the user requests extraction alone. Do not ask the user to copy a handoff prompt when the Agent is already operating the CLI. A generated UI file is not visual approval.',
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
      'recognize-ui': {
        id: 'text-free recognition card ID',
        recover:
          'optional boolean; true explicitly resumes the original Server API request with --allow-paid',
        attemptId:
          'optional original recognition attempt UUID, only with recover:true; restores a lost pendingId after checking canvas, card and source identity',
      },
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
        cut: 'optional object: mode=grid/content; content detects transparent separators without AI. expectedCount=0..120 (0 unrestricted); regions optionally provides source-pixel rectangles {name:item_001...,x,y,width,height} for manual corrections; manualNative=true preserves manually edited native UI crops and bypasses automatic slot alignment. Rectangles must not overlap. Native Bbox atlases require mode=grid and the complete original slot order, names and sizes; only x/y may change. Confirmed crops are reused only for an unchanged source. Missing content reports slot/element IDs: repair the affected separation card, never substitute the unseparated prelayout. Always inspect the actual preview before confirmation.',
      },
      'confirm-image-assets': {
        id: 'image-assets card ID',
        reviewId: 'current preview token; only confirm after inspecting the returned grid image',
      },
      'preview-model': {
        id: 'completed model card ID; opens read-only rotation preview, no generation request',
      },
      inspect: { id: 'optional node or group ID; includes direct upstream' },
      'confirm-model': {
        id: 'model card ID',
        reviewId: 'current review token; requires explicit user approval of all returned previews',
      },
      import: {
        file: 'CLI --file: absolute local path; page hosts pass assetPath (project-relative, any Unicode file name)',
        kind: 'optional image/video; default image',
        title: 'optional 1..80 chars; default the file name without extension',
        prompt:
          'optional 1..8000 chars, image only: records it as the generation prompt so selecting the card reopens the composer prefilled. Nothing is generated.',
        sourceId:
          'optional saved image ID, image only: places the new card beside it and adds an image-variant edge source -> new card',
      },
      'set-references': {
        id: 'target image/video ID',
        sourceIds: 'ordered image IDs; [] clears',
        includeSelf: 'optional boolean, image only; default false',
      },
      connect: {
        from: 'saved image ID',
        to: 'video input card ID (first frame), or image ID: appends from as an image reference; an empty image (slot) then submits every connected image in order',
      },
      disconnect: {
        edgeId:
          'image reference (image-variant) or first-frame edge ID; same result as deleting the wire on the page: draft references to that source are cleared, template members are marked pending and downstream results become stale',
      },
      undo: {
        note: 'empty input; reverts the latest page edit, INVALID_ARGS when nothing to undo. Also allowed when the page cannot save its pending edit, so the edit that breaks saving can be reverted; tasks, dialogs, drafts and other pages still block it.',
      },
      redo: { note: 'empty input; reapplies the latest undone edit' },
      'fill-slot': {
        id: 'empty image card (slot) ID',
        assetPath:
          'assetPath of an image already on this canvas (local hosts accept canvas images only: assets/image/canvas-<id>.png or .maker/canvases/images/canvas-<id>.png, as returned by import); this command does not upload, so bring other files in with import --file first. Fills the slot in place, keeping id, position, width and edges. No generation.',
        prompt: 'optional; same as import prompt',
      },
      'replace-image': {
        id: 'image card ID that already has an image; empty slots use fill-slot',
        assetPath:
          'canvas image path, same rule as fill-slot; replaces the image in place, keeping id, position, width, title and edges; height follows the image ratio. Undoable; downstream results become stale like a manual image change. No generation.',
        prompt:
          'optional; same as import prompt. Without it, previous generation metadata is cleared',
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
