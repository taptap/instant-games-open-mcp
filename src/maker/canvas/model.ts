import { randomUUID } from 'node:crypto';
import type { FrameSetInfo, SequenceSettings, VideoInfo } from './sequenceModel.js';
import type { CanvasSourceSnapshot } from './dependencies.js';
import type { ImageAssetsInfo } from './imageAssets.js';
import type { MergeIconSettings } from './mergeIcons.js';
import type { UiRecognitionSettings, UiElementCategory } from './uiRecognition.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import type { CanvasImageInfo } from './imageSizing.js';
import type { UiAtlasPlan, UiAtlasGroup } from './uiAssetBindings.js';
import type { CanvasMark } from './marks.js';

export const HISTORY_LIMIT = 60;
export const CANVAS_JSON_LIMIT = 2 * 1024 * 1024;

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
  templatePending?: boolean;
  /** Wall-clock start of the current template flow. Absent means the duration was not measured. */
  workStartedAt?: number;
  /** True after a flow starts until it completes. Reload uses this to resume instead of resetting. */
  workTimingOpen?: boolean;
  workDurationMs?: number;
  text?: string;
  assetPath?: string;
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

export class CanvasStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'CanvasStoreError';
  }
}

export function createId(): string {
  return randomUUID();
}

export function emptyDocument(title = '创作画布'): CanvasDocument {
  return {
    id: createId(),
    title: title.slice(0, 80) || '创作画布',
    revision: 0,
    viewport: { x: 48, y: 48, scale: 1 },
    nodes: [],
    edges: [],
  };
}

export function starterDocument(title?: string): CanvasDocument {
  const document = emptyDocument(title);
  document.nodes = ['示例图片 01', '示例图片 02', '示例图片 03'].map((title, index) => {
    const id = createId();
    return {
      id,
      type: 'image',
      x: index * 244,
      y: 0,
      width: 220,
      height: 360,
      title,
      assetPath: 'assets/image/canvas-' + id + '.jpg',
    };
  });
  return document;
}

export function cloneDocument(document: CanvasDocument): CanvasDocument {
  return {
    ...document,
    viewport: { ...document.viewport },
    nodes: document.nodes.map((node) => ({
      ...node,
      ...(node.mark ? { mark: { ...node.mark } } : {}),
      ...(node.referenceInput ? { referenceInput: { ...node.referenceInput } } : {}),
      ...(node.mergeIcons ? { mergeIcons: structuredClone(node.mergeIcons) } : {}),
      ...(node.sourceSnapshot ? { sourceSnapshot: { ...node.sourceSnapshot } } : {}),
    })),
    edges: document.edges.map((edge) => ({
      ...edge,
      ...(edge.route ? { route: { ...edge.route } } : {}),
    })),
  };
}

export function layoutKey(document: CanvasDocument): string {
  const { revision: _revision, ...rest } = document;
  return JSON.stringify(rest);
}
