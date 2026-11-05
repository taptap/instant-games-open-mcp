// Web image tools: crop, 90° rotation and flips for an image card.
// These helpers are injected into the page via toString(), so they must stay self-contained.

/** A pixel rectangle in the source image. */
export interface CanvasCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One local edit applied to the whole image. */
export type CanvasImageTransform =
  | { type: 'rotate' | 'flip-x' | 'flip-y' }
  | ({ type: 'crop' } & CanvasCropRect);

/**
 * Draws `source` with one transform into a new canvas.
 * `rotate` turns the image 90° clockwise; `flip-x` mirrors it left to right; `flip-y` flips it
 * top to bottom; `crop` keeps the given rectangle (clamped to the image, at least 1 px).
 */
export function canvasTransformedImage(
  source: CanvasImageSource & { width: number; height: number },
  transform: CanvasImageTransform
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理图片。');
  const width = source.width;
  const height = source.height;
  if (transform.type === 'crop') {
    const x = Math.max(0, Math.min(width - 1, Math.round(transform.x)));
    const y = Math.max(0, Math.min(height - 1, Math.round(transform.y)));
    const cropWidth = Math.max(1, Math.min(width - x, Math.round(transform.width)));
    const cropHeight = Math.max(1, Math.min(height - y, Math.round(transform.height)));
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    context.drawImage(source, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return canvas;
  }
  canvas.width = transform.type === 'rotate' ? height : width;
  canvas.height = transform.type === 'rotate' ? width : height;
  if (transform.type === 'rotate') {
    context.translate(height, 0);
    context.rotate(Math.PI / 2);
  } else if (transform.type === 'flip-x') {
    context.translate(width, 0);
    context.scale(-1, 1);
  } else {
    context.translate(0, height);
    context.scale(1, -1);
  }
  context.drawImage(source, 0, 0);
  return canvas;
}

/** A crop box in fractions (0–1) of the image width and height. */
export interface CanvasCropFraction {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The largest box with pixel aspect `ratio` (width / height) that fits the image, centred on
 * `rect`'s centre and moved back inside the image when it would stick out. `width` × `height` is
 * the image size in pixels.
 */
export function canvasCropRatioRect(
  rect: CanvasCropFraction,
  ratio: number,
  width: number,
  height: number
): CanvasCropFraction {
  let w = 1;
  let h = width / ratio / height;
  if (h > 1) {
    h = 1;
    w = (height * ratio) / width;
  }
  const centreX = rect.x + rect.w / 2;
  const centreY = rect.y + rect.h / 2;
  return {
    x: Math.max(0, Math.min(1 - w, centreX - w / 2)),
    y: Math.max(0, Math.min(1 - h, centreY - h / 2)),
    w,
    h,
  };
}
