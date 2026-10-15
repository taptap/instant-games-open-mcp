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

export type CanvasVideoMode = 'first_frame' | 'first_last_frame' | 'multi_modal_reference';

export interface CanvasGenerationResult {
  prompt: string;
  uiAtlasPlan?: UiAtlasPlan;
  cutoutColor?: '#FF00FF' | '#00FF00';
  referenceImagePaths?: string[];
  parameters?: {
    model?: string;
    resolution?: string;
    aspectRatio?: string;
    ratio?: string;
    duration?: number;
    mode?: CanvasVideoMode;
  };
  operation?: CanvasImageOperation;
  taskId?: string;
  attemptId?: string;
  sourceImageId?: string;
  sourceImageIds?: string[];
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
