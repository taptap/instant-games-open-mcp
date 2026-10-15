import type { CanvasNode } from '../contracts.js';

export function canvasFlowDuration(
  node: Pick<CanvasNode, 'workStartedAt' | 'workDurationMs' | 'workTimingOpen'> | undefined,
  live?: { elapsedMs: number; runStartedAt?: number },
  now = Date.now()
): number | undefined {
  // A saved number without a recorded start is an old partial segment, not a measured flow.
  if (!node?.workStartedAt) return live ? live.elapsedMs : undefined;
  if (live)
    return (
      live.elapsedMs + (live.runStartedAt === undefined ? 0 : Math.max(0, now - live.runStartedAt))
    );
  if (node.workTimingOpen) return node.workDurationMs;
  return node.workDurationMs;
}

export function formatCanvasWorkDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  return (
    Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (seconds % 60).toString().padStart(2, '0')
  );
}

export function renderCanvasWorkTiming(
  card: HTMLElement,
  node: CanvasNode,
  durationMs: number | undefined
) {
  if (durationMs === undefined || node.type === 'section') return;
  const time = document.createElement('span');
  time.className = 'canvas-work-time';
  time.dataset.workTime = node.id;
  time.textContent = '耗时 ' + formatCanvasWorkDuration(durationMs);
  card.append(time);
}
