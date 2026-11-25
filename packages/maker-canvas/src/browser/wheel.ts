export type CanvasWheelMode = 'auto' | 'mouse' | 'trackpad';

/**
 * Smooth zoom step for one wheel event. Trackpad pinch arrives as ctrl+wheel with small pixel
 * deltas and felt sluggish at the wheel rate, so it zooms 2.5x faster; ctrl + mouse wheel
 * notches (|deltaY| >= 50) keep the wheel rate. Self-contained: the canvas page inlines it.
 */
export function canvasWheelZoomFactor(event: {
  deltaY: number;
  deltaMode: number;
  ctrlKey?: boolean;
}): number {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
  const pinch = Boolean(event.ctrlKey) && event.deltaMode === 0 && Math.abs(event.deltaY) < 50;
  return Math.exp(-event.deltaY * unit * (pinch ? 0.005 : 0.002));
}

/** WheelEvent has no device identity; keep momentum with a detected trackpad gesture. */
export function createCanvasWheelInput() {
  let trackpadUntil = 0;
  return (
    event: {
      deltaX: number;
      deltaY: number;
      deltaMode: number;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
    },
    mode: CanvasWheelMode = 'auto',
    now = Date.now()
  ): 'pan' | 'zoom' => {
    if (event.ctrlKey || event.metaKey) return 'zoom';
    if (event.shiftKey || !event.deltaY) return 'pan';
    if (mode === 'trackpad') return 'pan';
    if (mode === 'mouse' || event.deltaMode !== 0) return 'zoom';
    const smooth =
      event.deltaX !== 0 || !Number.isInteger(event.deltaY) || Math.abs(event.deltaY) < 40;
    if (smooth || now < trackpadUntil) {
      trackpadUntil = now + 300;
      return 'pan';
    }
    return 'zoom';
  };
}
