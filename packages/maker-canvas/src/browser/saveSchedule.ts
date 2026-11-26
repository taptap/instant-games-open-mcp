/** Timing for {@link createCanvasSaveScheduler}; both values are in milliseconds. */
export interface CanvasSaveScheduleOptions {
  /** Called when a scheduled save is due. The page passes its `flush()`. */
  save: () => void;
  /** Quiet time after the last edit before saving. Defaults to 2000. */
  idleMs?: number;
  /** Longest a burst of edits waits before it is saved anyway. Defaults to 10000. */
  maxWaitMs?: number;
}

export interface CanvasSaveSchedule {
  /**
   * Record an edit. Saves after `idleMs` of quiet, but no later than `maxWaitMs` after the first
   * unsaved edit. `immediate` saves on the next tick, so several synchronous edits still share
   * one save.
   */
  schedule(immediate?: boolean): void;
  /** Save now when an edit is waiting; returns whether a save was started. */
  flushNow(): boolean;
  /** Drop the waiting save, for example after a version conflict. */
  cancel(): void;
  /** Whether an edit is waiting for its save. */
  readonly pending: boolean;
}

/**
 * Debounce for canvas autosave. Every save uploads the whole canvas file, so typing must not save
 * on each pause. The canvas page embeds this function through `toString()`: keep it free of
 * imports and outer references.
 */
export function createCanvasSaveScheduler(options: CanvasSaveScheduleOptions): CanvasSaveSchedule {
  const idleMs = options.idleMs ?? 2000;
  const maxWaitMs = options.maxWaitMs ?? 10000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstEditAt = 0;
  let waiting = false;

  function clear() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function fire() {
    clear();
    waiting = false;
    options.save();
  }
  return {
    schedule(immediate?: boolean) {
      const now = Date.now();
      if (!waiting) firstEditAt = now;
      waiting = true;
      clear();
      const delay = immediate ? 0 : Math.max(0, Math.min(idleMs, firstEditAt + maxWaitMs - now));
      timer = setTimeout(fire, delay);
    },
    flushNow() {
      if (!waiting) return false;
      fire();
      return true;
    },
    cancel() {
      clear();
      waiting = false;
    },
    get pending() {
      return waiting;
    },
  };
}

/** Node and edge ids: a change means cards or wires were added or removed. */
export function canvasStructureKey(
  document: { nodes?: Array<{ id: string }>; edges?: Array<{ id: string }> } | null | undefined
): string {
  if (!document) return '';
  const nodes = (document.nodes || []).map((node) => node.id).join(',');
  const edges = (document.edges || []).map((edge) => edge.id).join(',');
  return nodes + '|' + edges;
}
