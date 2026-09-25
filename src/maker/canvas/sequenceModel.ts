export const MAX_SEQUENCE_FRAMES = 120;
export const MAX_SEQUENCE_SIDE = 2048;
export const MAX_SEQUENCE_SOURCE_SIDE = 1024;
export const MAX_SEQUENCE_PIXEL_BUDGET = 48_000_000;
export const MAX_ATLAS_SIDE = 4096;
export const DEFAULT_SEQUENCE_SIDE = 512;

export interface SequenceSettings {
  start: number;
  end: number;
  fps: number;
  cutout: boolean;
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

export function defaultSequenceSettings(duration = 0, width = 512, height = 512): SequenceSettings {
  const scale = Math.min(1, DEFAULT_SEQUENCE_SIDE / Math.max(1, width, height));
  return {
    start: 0,
    end: Math.max(0, duration),
    fps: 8,
    cutout: false,
    backgroundColor: '#00ff00',
    tolerance: 48,
    duplicateThreshold: 0.985,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    fit: 'contain',
    pixel: false,
  };
}

export function estimateSequenceFrameCount(start: number, end: number, fps: number): number {
  if (
    ![start, end, fps].every(Number.isFinite) ||
    start < 0 ||
    end <= start ||
    fps < 1 ||
    fps > 30
  ) {
    throw new Error('请检查视频区间和帧率。');
  }
  const count = Math.ceil((end - start) * fps - 1e-8);
  if (count > MAX_SEQUENCE_FRAMES) {
    throw new Error(
      '预计 ' +
        count +
        ' 帧，超过首版单次处理上限 ' +
        MAX_SEQUENCE_FRAMES +
        ' 帧。请缩短区间或降低帧率。'
    );
  }
  return count;
}

export function maxSequenceFrameCount(width: number, height: number): number {
  if (![width, height].every(Number.isFinite) || width < 1 || height < 1) return 0;
  return Math.min(
    MAX_SEQUENCE_FRAMES,
    Math.floor(MAX_ATLAS_SIDE / Math.round(width)) * Math.floor(MAX_ATLAS_SIDE / Math.round(height))
  );
}

export function maxSequenceInputFrameCount(width: number, height: number): number {
  if (![width, height].every(Number.isFinite) || width < 1 || height < 1) return 0;
  const scale = Math.min(1, MAX_SEQUENCE_SOURCE_SIDE / Math.max(width, height));
  const pixels = Math.max(1, Math.round(width * scale)) * Math.max(1, Math.round(height * scale));
  return Math.min(MAX_SEQUENCE_FRAMES, Math.floor(MAX_SEQUENCE_PIXEL_BUDGET / pixels));
}

export function signatureSimilarity(left: Uint8Array, right: Uint8Array): number {
  if (left.length !== right.length || !left.length || left.length % 4 !== 0) return 0;
  let difference = 0;
  let pixels = 0;
  for (let offset = 0; offset < left.length; offset += 4) {
    const leftAlpha = left[offset + 3];
    const rightAlpha = right[offset + 3];
    if (leftAlpha < 8 && rightAlpha < 8) continue;
    difference += Math.abs(left[offset] - right[offset]);
    difference += Math.abs(left[offset + 1] - right[offset + 1]);
    difference += Math.abs(left[offset + 2] - right[offset + 2]);
    difference += Math.abs(leftAlpha - rightAlpha);
    pixels += 4;
  }
  return pixels ? 1 - difference / (pixels * 255) : 1;
}

export function duplicateIndicesFromSignatures(
  signatures: readonly Uint8Array[],
  threshold: number
): Array<{ index: number; similarity: number }> {
  const candidates: Array<{ index: number; similarity: number }> = [];
  const limit = Math.max(0.8, Math.min(0.999, threshold));
  let anchor = signatures[0];
  for (let index = 1; index < signatures.length; index += 1) {
    const previousSimilarity = signatureSimilarity(signatures[index - 1], signatures[index]);
    const anchorSimilarity = signatureSimilarity(anchor, signatures[index]);
    if (Math.min(previousSimilarity, anchorSimilarity) >= limit) {
      candidates.push({ index, similarity: Math.min(previousSimilarity, anchorSimilarity) });
    } else {
      anchor = signatures[index];
    }
  }
  return candidates;
}
