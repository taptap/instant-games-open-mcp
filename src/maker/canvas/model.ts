import { randomUUID } from 'node:crypto';
import type { FrameSetInfo, SequenceSettings, VideoInfo } from './sequenceModel.js';

export const HISTORY_LIMIT = 60;

export type CanvasNodeType = 'image' | 'video' | 'note' | 'video-source' | 'sequence' | 'animation';
export type CanvasEdgeKind =
  | 'first-frame'
  | 'image-to-video'
  | 'sequence-source'
  | 'sequence-animation';

export interface CanvasGenerationResult {
  prompt: string;
  taskId?: string;
  sourceImageId?: string;
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
  text?: string;
  assetPath?: string;
  videoInfo?: VideoInfo;
  sourceVideoId?: string;
  sequenceSettings?: SequenceSettings;
  frameSetInfo?: FrameSetInfo;
  generation?: CanvasGenerationResult;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  kind: CanvasEdgeKind;
}

export interface CanvasDocument {
  id: string;
  title: string;
  revision: number;
  viewport: Viewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
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
    nodes: document.nodes.map((node) => ({ ...node })),
    edges: document.edges.map((edge) => ({ ...edge })),
  };
}

export function layoutKey(document: CanvasDocument): string {
  const { revision: _revision, ...rest } = document;
  return JSON.stringify(rest);
}
