export type CanvasWheelMode = 'auto' | 'mouse' | 'trackpad';

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
