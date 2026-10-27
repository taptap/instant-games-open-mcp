/** One decoded <img> per URL across renders, so rebuilt previews draw at once instead of blanking. */
export function canvasCachedImage(url: string): HTMLImageElement {
  // Stored on the function itself because page helpers are injected via toString().
  const owner = canvasCachedImage as unknown as { cache?: Map<string, HTMLImageElement> };
  const cache = owner.cache || (owner.cache = new Map());
  let image = cache.get(url);
  if (image) {
    cache.delete(url);
  } else {
    image = new Image();
    image.decoding = 'async';
    image.src = url;
    if (cache.size >= 48) cache.delete(cache.keys().next().value as string);
  }
  cache.set(url, image);
  return image;
}

/** Runs draw now when the image is decoded, otherwise once it loads; fail runs on a load error. */
export function canvasWhenImageReady(
  image: HTMLImageElement,
  draw: () => void,
  fail?: () => void
): void {
  if (image.complete && image.naturalWidth > 0) {
    draw();
    return;
  }
  if (image.complete && image.src) {
    fail?.();
    return;
  }
  image.addEventListener('load', draw, { once: true });
  if (fail) image.addEventListener('error', fail, { once: true });
}
