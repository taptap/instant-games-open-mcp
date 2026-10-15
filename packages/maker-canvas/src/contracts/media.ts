export interface SequenceSettings {
  start: number;
  end: number;
  fps: number;
  cutout: boolean;
  cutoutMode?: 'connected' | 'chroma';
  backgroundColor: string;
  tolerance: number;
  duplicateThreshold: number;
  width: number;
  height: number;
  fit: 'contain' | 'cover' | 'stretch';
  pixel: boolean;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

export interface FrameSetFrame {
  index: number;
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameSetInfo {
  fps: number;
  frameCount: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  frames: FrameSetFrame[];
}

export interface CanvasImageInfo {
  width: number;
  height: number;
}

export interface ImageAtlasGrid {
  columns: number;
  rows: number;
  marginX: number;
  marginY: number;
  gapX: number;
  gapY: number;
}

export interface ImageAtlasCrop {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  outputWidth?: number;
  outputHeight?: number;
  offsetX?: number;
  offsetY?: number;
  blank?: boolean;
}

export interface ImageAssetsInfo {
  uiBindingReview?: 'unreviewed' | 'confirmed' | 'recorded';
  width: number;
  height: number;
  grid: ImageAtlasGrid;
  regions?: ImageAtlasCrop[];
  cutMode?: 'grid' | 'content';
  background?: { color?: [number, number, number]; mode: 'all' | 'connected' };
  items: Array<{
    name: string;
    assetPath: string;
    width: number;
    height: number;
    contentRect?: [number, number, number, number];
  }>;
}

export interface MergeIconSettings {
  stageCount: number;
  instructions: string;
  series: Array<{ name: string; stages: string[] }>;
}
