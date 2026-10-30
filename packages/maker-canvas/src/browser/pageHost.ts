import type { CanvasExportDelivery } from './exportDelivery.js';
import type { CanvasPageFeatures } from './capabilities.js';
import type { createCanvasTemplateUiWithHost } from './templateUi.js';
import type { CanvasCommand, CanvasDocument, CanvasNode } from '../contracts.js';
import type { CanvasDocumentStore } from './store.js';
import type { createCanvasGenerationUiWithHost } from './generationUi.js';
import type { createUiRecognitionUiWithHost } from './uiRecognitionUi.js';
import type { createCanvasModelUiWithHost } from './model3dUi.js';
import type { createImageAssetsUiWithHost } from './imageAssetsUi.js';
import type { createCanvasAutomationUiWithHost } from './automationUi.js';
import type { createSequenceUiControllerWithMedia } from './sequenceUi.js';
import type { createCanvasResourceExportWithHost } from './resourceExport.js';
import type { validateUiAtlasPlanStructure } from '../features/uiAssetBindings.js';

/** Document-only draft; dialogs, frame buffers and active requests are not serialized. */
export interface CanvasEditorDraft {
  document: CanvasDocument;
  savedLayout: string;
}

export interface CanvasEditorHandle {
  current(): CanvasDocument | null;
  draft(): CanvasEditorDraft | null;
  save(): Promise<boolean>;
  /** Call before unmounting; false means the editor must remain mounted. */
  prepareLeave(): Promise<boolean>;
  execute(command: CanvasCommand): Promise<unknown>;
  /** Human asset selection may extend a dirty document; automation keeps its dirty guard. */
  importProjectAsset(input: {
    assetPath: string;
    kind: 'image' | 'video';
    title: string;
  }): Promise<void>;
  /**
   * Re-reads sprite-gen progress for every sprite group on the open canvas and mirrors new
   * outputs (e.g. after an Agent tool call). Resolves when done; a no-op unless features.spriteGen
   * is on and store.readProjectJson exists. Mirror edits autosave and are not undo steps.
   */
  syncSprites(): Promise<void>;
  /**
   * The host shows or hides the canvas panel without unloading it. While hidden the page stops
   * sprite polling, animation frames and video playback; showing it again syncs sprites at once.
   */
  setPanelVisible(visible: boolean): void;
}
/** Payload of CanvasPageHost.startSpriteGen. */
export interface CanvasSpriteGenStart {
  canvasId: string;
  /** Source image card inside the sprite group. */
  nodeId: string;
  /** Matches /^[\p{L}\p{N}_-]{1,40}$/u; sprite-gen files go to .build/sprite-gen/<name>/. */
  spriteName: string;
  spriteType: 'character' | 'generic';
  /** Workspace-relative asset path of the source image. */
  sourcePath: string;
}

/** Host bindings for the existing page. Factories supply host callbacks to the shared controllers. */
export interface CanvasPageHost {
  store: CanvasDocumentStore;
  /** Hides page entry points; absent keeps every existing entry. Commands are not filtered. */
  features?: CanvasPageFeatures;
  /** Visual skin only; absent or 'default' keeps the local console look. */
  appearance?: 'default' | 'web';
  /** Optional: shows 「加入对话」 for selected image cards; absent hides the button. */
  addToChat?(items: { nodeId: string; assetPath: string }[]): Promise<void> | void;
  /**
   * Optional: shows 「从素材库添加」 in the blank-canvas menu; paths go through prepareCanvasImportedNode.
   * `kind` absent means image, except paths under assets/video/.
   */
  pickProjectImages?(): Promise<{ path: string; name: string; kind?: 'image' | 'video' }[]>;
  /**
   * Optional (with features.spriteGen): called after 「生成精灵」 has created and saved the group
   * 「精灵：<名>」. The host opens a new chat and prefills the sprite-gen prompt; the page never
   * drives sprite-gen itself. Rejections are shown as the page error; the group stays.
   * Resolves with the new chat's id once it exists (stored on the group for 「打开生成对话」).
   */
  startSpriteGen?(input: CanvasSpriteGenStart): Promise<{ chatId?: string } | void>;
  /** Optional: 「打开生成对话」 in a sprite group header switches to that chat. */
  openSpriteChat?(chatId: string): Promise<void> | void;
  onReady?(editor: CanvasEditorHandle): void;
  /** Called only after the normal authorized load. Scope drafts by user, project and canvas. */
  recoverDraft?(loaded: CanvasDocument): Promise<CanvasEditorDraft | null | undefined>;
  deliverExport: CanvasExportDelivery;
  createCanvasTemplateUi(
    options: Parameters<typeof createCanvasTemplateUiWithHost>[0]
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
    blob: Blob,
    filename: string
  ): Promise<{ path?: string } | void>;
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
      'thumbnailUrl' | 'previewOrigin'
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
