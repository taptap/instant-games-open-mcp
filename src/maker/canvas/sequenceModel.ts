export {
  MAX_SEQUENCE_FRAMES,
  MAX_SEQUENCE_SIDE,
  MAX_SEQUENCE_SOURCE_SIDE,
  MAX_SEQUENCE_PIXEL_BUDGET,
  MAX_ATLAS_SIDE,
  DEFAULT_SEQUENCE_SIDE,
  DEFAULT_SEQUENCE_FPS,
  DEFAULT_SEQUENCE_DURATION,
  defaultSequenceSettings,
  estimateSequenceFrameCount,
  maxSequenceFrameCount,
  maxSequenceInputFrameCount,
  signatureSimilarity,
  duplicateIndicesFromSignatures,
} from '../../../packages/maker-canvas/src/domain.js';
export type {
  SequenceSettings,
  VideoInfo,
  FrameSetFrame,
  FrameSetInfo,
} from '../../../packages/maker-canvas/src/contracts.js';
