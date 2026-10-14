export {
  CANVAS_MARK_COLORS,
  CANVAS_MARK_MIN,
  CANVAS_MARK_MAX,
  MARK_POINTS,
  MARK_DIRECTIONS,
  validateCanvasMark,
  optionalMarkPoint,
  canvasMarkEnds,
  canvasMarkMoveEndpoint,
  canvasMarkResizeEdge,
  markNumber,
  canvasMarkFromInput,
} from '../../../packages/maker-canvas/src/domain.js';
export {
  renderCanvasMark,
  drawCanvasMark,
  createCanvasMarks,
  CANVAS_MARK_STYLES,
} from '../../../packages/maker-canvas/src/browser.js';
export type {
  CanvasMarkShape,
  CanvasMarkPoint,
  CanvasMarkDirection,
  CanvasMark,
} from '../../../packages/maker-canvas/src/contracts.js';
