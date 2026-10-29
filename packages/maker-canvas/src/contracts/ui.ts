import type { ImageAtlasGrid, ImageAtlasCrop } from './media.js';

export const UI_CUT_TYPES = ['icon', 'frame', 'panel', 'button', 'tab', 'title'] as const;

export interface UiBboxImage {
  path: string;
  sha256: string;
  width: number;
  height: number;
}

export interface UiBboxElement {
  id: string;
  name: string;
  type: (typeof UI_CUT_TYPES)[number];
  bbox: [number, number, number, number];
  parent: string | null;
  /** Another element that uses the same cut asset. This instance keeps its own position. */
  duplicateOf?: string;
}

export interface UiBboxText {
  id: string;
  text: string;
  bbox: [number, number, number, number];
  parentId: string | null;
  role:
    | 'title'
    | 'tab'
    | 'button'
    | 'slot_name'
    | 'stat_name'
    | 'stat_value'
    | 'currency'
    | 'count'
    | 'caption'
    | 'other';
  align: 'left' | 'center' | 'right';
  color: string;
  bold: boolean;
  cutout: false;
}

export interface UiScreenName {
  name: string;
  /** Semantic lowercase snake_case filename stem, without the .ui.json extension. */
  key: string;
}

export interface UiBboxDocument {
  version: 1;
  coordinateSpace: 'design-pixels';
  bboxFormat: 'xywh';
  screen?: UiScreenName;
  design: UiBboxImage;
  cutSource: UiBboxImage;
  elements: UiBboxElement[];
  texts: UiBboxText[];
}

export const UI_ELEMENT_CATEGORIES = [
  'icon',
  'frame',
  'tab',
  'action',
  'shortcut',
  'close',
  'title',
  'panel',
  'art_text',
  'text',
] as const;

export type UiElementCategory = (typeof UI_ELEMENT_CATEGORIES)[number];

export interface UiElement {
  id: string;
  name: string;
  category: UiElementCategory;
  rect: [number, number, number, number];
  parentId: string | null;
  zIndex: number;
  states: string[];
  cutout: boolean;
}

export interface UiRecognitionResult {
  id: string;
  model: string;
  prompt: string;
  createdAt: string;
  durationMs: number;
  credits?: number;
  sourcePath: string;
  sourceSha256: string;
  width: number;
  height: number;
  elements: UiElement[];
  bbox?: UiBboxDocument;
}

export interface UiRecognitionSettings {
  /** Supplementary Bbox data; does not drive generation or invalidate its outputs. */
  optional?: boolean;
  enabled: boolean;
  inputRole?: 'design' | 'text-free';
  model?: string;
  selectedId?: string;
  pendingId?: string;
  results: UiRecognitionResult[];
}

export interface UiAtlasSlot {
  elementIds: string[];
  state: 'normal' | 'pressed';
  role: 'element' | 'text' | 'background' | 'reserve';
}

export interface UiAtlasPlan {
  version: 1;
  bbox: UiBboxDocument;
  grid: ImageAtlasGrid;
  slots: UiAtlasSlot[];
  nativeLayout?: { width: number; height: number; regions: ImageAtlasCrop[] };
}

export type UiAtlasGroup = 'controls' | 'icons' | 'equipment' | 'panels' | 'artwork' | 'background';

export type CanvasMarkShape = 'ellipse' | 'arrow';

export type CanvasMarkPoint = 'nw' | 'ne' | 'sw' | 'se';

export type CanvasMarkDirection = 'n' | 'e' | 's' | 'w';

export interface CanvasMark {
  shape: CanvasMarkShape;
  color: string;
  stroke: number;
  /** Arrow head corner. Absent for an ellipse. */
  point?: CanvasMarkPoint;
  /** Image arrow facing. Absent for a box. */
  direction?: CanvasMarkDirection;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
}
