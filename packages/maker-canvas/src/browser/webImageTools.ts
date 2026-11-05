// Web image tools: crop, 90° rotation and flips for an image card.
// Both helpers are injected into the page via toString(), so they must stay self-contained.

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

/**
 * Modal crop editor for an image of `width` × `height` px shown from `url`.
 * Drag the box to move it and its corners to resize. Resolves with the chosen rectangle in source
 * pixels, or null when cancelled or when the whole image is still selected.
 */
export function openCanvasWebCropDialog(
  url: string,
  width: number,
  height: number
): Promise<CanvasCropRect | null> {
  return new Promise((resolve) => {
    const scale = Math.min(
      1,
      Math.min(960, window.innerWidth * 0.8) / width,
      (window.innerHeight * 0.7) / height
    );
    const stageWidth = Math.max(1, Math.round(width * scale));
    const stageHeight = Math.max(1, Math.round(height * scale));
    const minimum = Math.min(16, stageWidth, stageHeight);
    const rect = { x: 0, y: 0, width: stageWidth, height: stageHeight };
    const dialog = document.createElement('dialog');
    dialog.className = 'web-crop-dialog';
    dialog.setAttribute('aria-label', '裁剪图片');
    const heading = document.createElement('h2');
    heading.textContent = '裁剪图片';
    const stage = document.createElement('div');
    stage.className = 'web-crop-stage';
    stage.style.width = stageWidth + 'px';
    stage.style.height = stageHeight + 'px';
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.draggable = false;
    const box = document.createElement('div');
    box.className = 'web-crop-box';
    box.setAttribute('aria-label', '裁剪区域');
    const corners = ['nw', 'ne', 'sw', 'se'];
    for (const corner of corners) {
      const handle = document.createElement('span');
      handle.className = 'web-crop-handle web-crop-' + corner;
      handle.dataset.corner = corner;
      box.append(handle);
    }
    stage.append(image, box);
    const footer = document.createElement('footer');
    const size = document.createElement('span');
    size.className = 'web-crop-size';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'web-crop-apply';
    apply.textContent = '应用';
    footer.append(size, cancel, apply);
    dialog.append(heading, stage, footer);
    function source(): CanvasCropRect {
      const x = Math.round(rect.x / scale);
      const y = Math.round(rect.y / scale);
      return {
        x,
        y,
        width: Math.max(1, Math.min(width - x, Math.round(rect.width / scale))),
        height: Math.max(1, Math.min(height - y, Math.round(rect.height / scale))),
      };
    }
    function draw() {
      box.style.left = rect.x + 'px';
      box.style.top = rect.y + 'px';
      box.style.width = rect.width + 'px';
      box.style.height = rect.height + 'px';
      const chosen = source();
      size.textContent = chosen.width + ' × ' + chosen.height;
    }
    let done = false;
    function finish(value: CanvasCropRect | null) {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    }
    let drag: {
      id: number;
      corner: string;
      x: number;
      y: number;
      start: { x: number; y: number; width: number; height: number };
    } | null = null;
    box.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const target = event.target as HTMLElement;
      drag = {
        id: event.pointerId,
        corner: target.dataset.corner || '',
        x: event.clientX,
        y: event.clientY,
        start: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
      box.setPointerCapture(event.pointerId);
    });
    box.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const start = drag.start;
      if (!drag.corner) {
        rect.x = Math.max(0, Math.min(stageWidth - start.width, start.x + dx));
        rect.y = Math.max(0, Math.min(stageHeight - start.height, start.y + dy));
      } else {
        let left = start.x;
        let top = start.y;
        let right = start.x + start.width;
        let bottom = start.y + start.height;
        if (drag.corner.indexOf('w') >= 0) left = Math.max(0, Math.min(right - minimum, left + dx));
        if (drag.corner.indexOf('e') >= 0)
          right = Math.min(stageWidth, Math.max(left + minimum, right + dx));
        if (drag.corner.indexOf('n') >= 0) top = Math.max(0, Math.min(bottom - minimum, top + dy));
        if (drag.corner.indexOf('s') >= 0)
          bottom = Math.min(stageHeight, Math.max(top + minimum, bottom + dy));
        rect.x = left;
        rect.y = top;
        rect.width = right - left;
        rect.height = bottom - top;
      }
      draw();
    });
    const release = (event: PointerEvent) => {
      if (drag && drag.id === event.pointerId) drag = null;
    };
    box.addEventListener('pointerup', release);
    box.addEventListener('pointercancel', release);
    cancel.addEventListener('click', () => finish(null));
    apply.addEventListener('click', () => {
      const chosen = source();
      finish(chosen.width >= width && chosen.height >= height ? null : chosen);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        apply.click();
      }
    });
    draw();
    document.body.append(dialog);
    dialog.showModal();
    apply.focus();
  });
}
