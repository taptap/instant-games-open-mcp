import type {
  FrameSetInfo,
  SequenceSettings,
  VideoInfo,
  ImageAssetsInfo,
  MergeIconSettings,
  ImageAtlasGrid,
  CanvasImageInfo,
} from './media.js';
import type {
  UiRecognitionSettings,
  UiElementCategory,
  UiAtlasPlan,
  UiAtlasGroup,
  CanvasMark,
} from './ui.js';

export type CanvasNodeType =
  | 'image'
  | 'video'
  | 'note'
  | 'video-source'
  | 'sequence'
  | 'animation'
  | 'image-assets'
  | 'resource-bundle'
  | 'model-views'
  | 'model'
  | 'section'
  | 'mark';

export type CanvasEdgeKind =
  | 'first-frame'
  | 'image-to-video'
  | 'image-variant'
  | 'sequence-source'
  | 'character-views'
  | 'views-model'
  | 'sequence-animation'
  | 'image-assets'
  | 'resource-bundle'
  | 'frame-first'
  | 'frame-last';

export type CanvasCreateTemplate = 'starter' | 'empty' | 'sequence';

export type CanvasImageOperation = 'generate' | 'variant' | 'outpaint';

export type CanvasVideoMode =
  | 'text_to_video'
  | 'first_frame'
  | 'first_last_frame'
  | 'multi_modal_reference';

export interface CanvasGenerationResult {
  prompt: string;
  uiAtlasPlan?: UiAtlasPlan;
  cutoutColor?: '#FF00FF' | '#00FF00' | 'transparent';
  referenceImagePaths?: string[];
  parameters?: {
    model?: string;
    resolution?: string;
    aspectRatio?: string;
    ratio?: string;
    duration?: number;
    mode?: CanvasVideoMode;
    /** Whether the standard game-asset constraint block is appended to image requests. */
    assetConstraints?: boolean;
  };
  operation?: CanvasImageOperation;
  taskId?: string;
  attemptId?: string;
  sourceImageId?: string;
  sourceImageIds?: string[];
  /** Set when an agent imported the image with its prompt; the page did not run the request. */
  origin?: 'agent';
}

export interface CanvasGenerationDraft {
  operation: CanvasImageOperation;
  sourceImageId?: string;
  sourceImageIds?: string[];
  prompt?: string;
  parameters?: CanvasGenerationResult['parameters'];
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  sectionId?: string;
  modelQuality?: 'fast' | 'balanced' | 'high_quality';
  exportDirection?: 'front' | 'back' | 'left' | 'right';
  templateId?: string;
  templateRevision?: number;
  templateSkills?: string[];
  templateCliOnly?: boolean;
  templatePending?: boolean;
  /** Wall-clock start of the current template flow. Absent means the duration was not measured. */
  workStartedAt?: number;
  /** True after a flow starts until it completes. Reload uses this to resume instead of resetting. */
  workTimingOpen?: boolean;
  workDurationMs?: number;
  text?: string;
  assetPath?: string;
  /** Identity of the bytes used at this path; never infer an old result's input from it. */
  assetVersion?: { path: string; version: string };
  imageInfo?: CanvasImageInfo;
  referenceInput?: { includeSelf: boolean };
  generationDraft?: CanvasGenerationDraft;
  sourceSnapshot?: CanvasSourceSnapshot;
  sourceSnapshots?: CanvasSourceSnapshot[];
  videoInfo?: VideoInfo;
  videoInputMode?: 'first_last_frame';
  sourceVideoId?: string;
  sequenceSettings?: SequenceSettings;
  frameSetInfo?: FrameSetInfo;
  imageAssetsInfo?: ImageAssetsInfo;
  mergeIcons?: MergeIconSettings;
  generation?: CanvasGenerationResult;
  uiRecognition?: UiRecognitionSettings;
  uiRecognitionSourceId?: string;
  uiAnnotation?: UiElementCategory[];
  uiExtraction?: UiElementCategory;
  uiEmpty?: boolean;
  uiBaselinePrompt?: string;
  uiBaselineGrid?: ImageAtlasGrid;
  uiAtlasGroup?: UiAtlasGroup;
  /** Local Bbox crop/layout step; its output is a visible reference for downstream generation. */
  uiAtlasPrelayout?: boolean;
  uiArtTextId?: string;
  /** Zero-based sheet index when a group is split into 5×5 atlases. */
  uiAtlasBatch?: number;
  uiAtlasPlan?: UiAtlasPlan;
  /** Screenshot-style overlay. Not a generation card. */
  mark?: CanvasMark;
  /** On a section: the sprite-gen run it mirrors. Progress stays in sprite-gen's own files. */
  spriteGen?: CanvasSpriteGen;
  /** Read-only card mirrored from an external producer; sync owns its asset and edges. */
  mirror?: CanvasMirror;
}
export interface CanvasSpriteGen {
  /** sprite-gen sprite name; files live in .build/sprite-gen/<name>/ and assets/sprites/<name>/. */
  name: string;
  type: 'character' | 'generic';
  /** Source image card the run started from. */
  sourceId: string;
  /** Epoch milliseconds when 生成精灵 was started from the canvas. */
  startedAt: number;
  /** Mirror keys the user deleted; sync never re-adds them. */
  dismissed: string[];
}
export interface CanvasMirror {
  source: 'sprite-gen';
  name: string;
  /**
   * Position the last sync laid the card out at. While the card still sits there it follows the
   * tree layout; once the user moves it, sync leaves it where it is.
   */
  placed?: { x: number; y: number };
  /** Stable per-output key, e.g. ready, viewpoint:<path>, video:<animId>. */
  key: string;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  kind: CanvasEdgeKind;
  route?: { x: number; y: number };
}

export interface CanvasDocument {
  id: string;
  title: string;
  revision: number;
  viewport: Viewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  templateFlow?: CanvasTemplateFlow;
  deletedGenerationIds?: string[];
  /** Canvas-wide preferences; absent fields mean the built-in defaults. */
  settings?: CanvasDocumentSettings;
}
export interface CanvasDocumentSettings {
  /** Asset constraint appended to image requests; absent uses the built-in text. */
  assetConstraintText?: string;
}

export interface CanvasTemplateFlow {
  imageId: string;
  videoId: string;
  sequenceId: string;
  animationId?: string;
  duration: number;
  stage: 'image' | 'ready' | 'video' | 'sequence' | 'animation' | 'complete';
}

export interface CanvasSummary {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
}

export interface CanvasSourceSnapshot {
  nodeId: string;
  version: string;
}
