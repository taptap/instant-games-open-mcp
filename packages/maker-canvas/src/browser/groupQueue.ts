import type {
  CanvasDocument,
  CanvasNode,
  CanvasGroupQueueState,
  CanvasWorkflowState,
} from '../contracts.js';
import { canvasReferences, canvasDependents } from '../core/dependencies.js';

export function createCanvasGroupQueue(options: {
  getDocument(): CanvasDocument | null;
  needs(nodeId: string): boolean;
  problem?(nodeId: string): string | undefined;
  busy(): boolean;
  parallel?(nodeId: string): boolean;
  imageConcurrency?(nodeId: string): number;
  save?(): Promise<boolean>;
  run(nodeId: string): Promise<boolean>;
  retryTarget?(nodeId: string): string | undefined;
  prepareRetry?(nodeId: string, failedNodeId: string): void;
  expand?(groupId: string): void;
  stopActive?(nodeId: string): void;
  confirm(message: string): boolean;
  changed(): void;
  error(message: string): void;
  haltReason?(): string | undefined;
}) {
  const queues = new Map<string, CanvasGroupQueueState>();
  /** Run tokens discarded by deletion; a later run of the same ID gets a new token. */
  const removed = new Map<string, number>();
  const settling = new Set<CanvasGroupQueueState>();
  let documentState: CanvasDocument | null = null;
  let pumping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const executingPhase = (phase: string) => ['queued', 'running', 'waiting'].includes(phase);
  const executing = (state: CanvasGroupQueueState) => executingPhase(state.phase);
  /** Same canvas edits (delete, sync) replace the document object but keep queue ownership. */
  const sameCanvas = (left: CanvasDocument | null, right: CanvasDocument | null) =>
    Boolean(left && right && (left === right || left.id === right.id));
  function sync() {
    const next = options.getDocument();
    if (documentState === next) return;
    if (sameCanvas(documentState, next)) {
      documentState = next;
      return;
    }
    queues.clear();
    removed.clear();
    settling.clear();
    clearTimeout(timer);
    documentState = next;
  }
  function savedQueueState(group: CanvasNode): CanvasGroupQueueState | undefined {
    const saved = group.workflowState;
    if (!saved) return undefined;
    // A reloaded page has no executor; an executing phase means "stopped by reload".
    const reloaded = executingPhase(saved.phase);
    return {
      groupId: group.id,
      pending: [...saved.pending],
      completed: saved.completed.length,
      total: saved.completed.length + saved.pending.length,
      finished: [...saved.completed],
      failures: { ...saved.failures },
      retries: { ...saved.retries },
      running: {},
      elapsedMs: group.workDurationMs || 0,
      runStartedAt: undefined,
      phase: reloaded ? 'paused' : saved.phase,
      message: reloaded
        ? '页面已重新打开，执行已停止；点击继续核对原任务并完成剩余步骤'
        : saved.message,
      stopping: false,
      ...(saved.pauseReason && !reloaded ? { pauseReason: saved.pauseReason } : {}),
    };
  }
  function members(groupId: string): CanvasNode[] {
    return (
      documentState?.nodes.filter(
        (node) =>
          node.sectionId === groupId &&
          ['image', 'video', 'video-source', 'sequence', 'animation', 'image-assets'].includes(
            node.type
          )
      ) || []
    );
  }
  function validOrder(ids: string[]): boolean {
    if (!documentState) return false;
    const positions = new Map(ids.map((id, index) => [id, index]));
    return ids.every((id, index) =>
      canvasReferences(documentState!, id).every(
        (source) => !positions.has(source.id) || positions.get(source.id)! < index
      )
    );
  }
  /** Prelayout scope: local layout only, never the paid separation or its cut. */
  function inScope(state: { scope?: 'prelayout' }, nodeId: string): boolean {
    if (state.scope !== 'prelayout') return true;
    const node = documentState?.nodes.find((item) => item.id === nodeId);
    if (!node) return false;
    if (node.type === 'image-assets') return false;
    if (node.type !== 'image') return false;
    return Boolean(node.uiAtlasPrelayout) || (!node.uiAtlasGroup && !node.uiArtTextId);
  }
  function start(groupId: string, alreadyConfirmed = false, scope?: 'prelayout') {
    sync();
    if (!documentState || (queues.get(groupId) && executing(queues.get(groupId)!))) return false;
    const group = documentState.nodes.find((node) => node.id === groupId);
    if (!group) return false;
    const prior = queues.get(groupId) || savedQueueState(group);
    const previous = prior?.pending || [];
    const candidates = members(groupId).filter(
      (node) =>
        inScope({ scope }, node.id) && (options.needs(node.id) || options.problem?.(node.id))
    );
    candidates.sort((left, right) => {
      const rank = (id: string) => (previous.includes(id) ? previous.indexOf(id) : previous.length);
      return rank(left.id) - rank(right.id);
    });
    const remaining = new Set(candidates.map((node) => node.id));
    const pending: string[] = [];
    while (remaining.size) {
      const next = candidates.find(
        (node) =>
          remaining.has(node.id) &&
          !canvasReferences(documentState!, node.id).some((source) => remaining.has(source.id))
      );
      if (!next) {
        options.error('分组内存在循环引用，请先调整连线。');
        return false;
      }
      pending.push(next.id);
      remaining.delete(next.id);
    }
    if (!pending.length) {
      options.error('此分组没有待处理的步骤。');
      return false;
    }
    if (
      !alreadyConfirmed &&
      !options.confirm(
        '按当前参数完成此分组剩余 ' +
          pending.length +
          ' 个步骤？生图确定失败时最多重新生图2次；切图失败保留原图，调整裁切框，不自动重新生图。结果未知不重提。失败只阻塞依赖分支，其余继续。请保持页面打开。'
      )
    )
      return false;
    const resumingMemory = prior?.phase === 'paused';
    const resumingSaved = !resumingMemory && Boolean(group.workTimingOpen && group.workStartedAt);
    const resuming = resumingMemory || resumingSaved;
    const finished = (resumingMemory ? prior.finished : []).filter(
      (id) => members(groupId).some((node) => node.id === id) && !pending.includes(id)
    );
    if (!resuming) {
      group.workStartedAt = Date.now();
      delete group.workDurationMs;
      for (const node of candidates) delete node.workDurationMs;
    } else if (!group.workStartedAt) group.workStartedAt = Date.now();
    group.workTimingOpen = true;
    const persistedDuration = group.workDurationMs || 0;
    queues.set(groupId, {
      groupId,
      pending,
      completed: finished.length,
      total: finished.length + pending.length,
      finished,
      // A resumed queue re-evaluates failures against the current card state.
      // Persisted failures remain visible before Continue, but must not deadlock recovery.
      failures: {},
      retries: resumingMemory ? { ...(prior?.retries || {}) } : {},
      running: {},
      // A recognition result may have increased the saved total after the last pause.
      elapsedMs: resumingMemory
        ? Math.max(prior?.elapsedMs || 0, persistedDuration)
        : resuming
          ? persistedDuration
          : 0,
      runStartedAt: Date.now(),
      phase: 'queued',
      message: scope === 'prelayout' ? '执行本地预排' : '准备执行',
      stopping: false,
      ...(scope ? { scope } : {}),
    });
    persistState(queues.get(groupId)!);
    options.changed();
    void pump();
    return true;
  }
  /** Record a deliberate checkpoint without running anything (all prior work already exists). */
  function hold(groupId: string, reason: 'prelayout-review', message: string): boolean {
    sync();
    const group = documentState?.nodes.find((node) => node.id === groupId);
    const current = queues.get(groupId);
    if (!group || (current && executing(current))) return false;
    const state: CanvasGroupQueueState = {
      ...(current ||
        savedQueueState(group) || {
          groupId,
          pending: [],
          completed: 0,
          total: 0,
          finished: [],
          failures: {},
          retries: {},
          running: {},
          elapsedMs: group.workDurationMs || 0,
          stopping: false,
        }),
      phase: 'paused',
      message,
      pauseReason: reason,
      runStartedAt: undefined,
    } as CanvasGroupQueueState;
    delete state.scope;
    queues.set(groupId, state);
    persistState(state);
    options.changed();
    return true;
  }
  function stop(groupId: string) {
    const state = queues.get(groupId);
    if (!state || !executing(state)) return;
    state.stopping = true;
    for (const id of Object.keys(state.running)) options.stopActive?.(id);
    state.message = state.active ? '当前步骤结束后停止；不取消远端任务' : '已停止后续';
    persistState(state);
    if (!state.active) void settle(state, 'paused', '已停止后续');
    options.changed();
  }
  /**
   * Call before the nodes leave the document. Only runs of deleted cards and their dependents
   * are discarded; other running results are still accepted and unrelated groups continue.
   */
  function remove(nodeIds: string[]) {
    sync();
    if (!documentState) return;
    const ids = new Set(nodeIds);
    const affected = new Set(ids);
    for (const id of ids)
      for (const node of canvasDependents(documentState, id)) affected.add(node.id);
    for (const state of queues.values()) {
      const affectsGroup =
        ids.has(state.groupId) || members(state.groupId).some((node) => ids.has(node.id));
      const discarded = Object.keys(state.running).filter((id) => affected.has(id));
      if (!affectsGroup && !discarded.length) continue;
      for (const id of discarded) {
        removed.set(id, state.running[id]);
        options.stopActive?.(id);
      }
      state.pending = state.pending.filter((id) => !ids.has(id));
      state.finished = state.finished.filter((id) => !ids.has(id));
      for (const id of ids) delete state.failures[id];
      if (executing(state)) {
        state.stopping = true;
        state.message = '已删除相关卡片：停止此分组后续，忽略被删卡片的迟到结果';
      }
      updateCounts(state);
      persistState(state);
      if (executing(state) && !Object.keys(state.running).length)
        void settle(state, 'paused', state.message);
    }
    options.changed();
  }
  function move(groupId: string, nodeId: string, beforeId?: string): boolean {
    sync();
    const state = queues.get(groupId);
    if (!state || !state.pending.includes(nodeId) || beforeId === nodeId) return false;
    const next = state.pending.filter((id) => id !== nodeId);
    const index = beforeId === undefined ? next.length : next.indexOf(beforeId);
    if (index < 0) return false;
    next.splice(index, 0, nodeId);
    if (!validOrder(next)) {
      options.error('不能排在前置任务之前，或排在依赖它的任务之后。');
      return false;
    }
    state.pending = next;
    options.changed();
    return true;
  }
  function lane(nodeId: string): 'image' | 'local' | 'exclusive' {
    if (options.parallel?.(nodeId)) return 'image';
    const node = documentState?.nodes.find((item) => item.id === nodeId);
    if (
      (node?.type === 'image-assets' || (node?.type === 'image' && node.uiAtlasPrelayout)) &&
      node.sectionId &&
      members(node.sectionId).some((item) => options.parallel?.(item.id))
    )
      return 'local';
    return 'exclusive';
  }
  function activeIds(): string[] {
    return [...queues.values()].flatMap((state) => Object.keys(state.running));
  }
  function available(nodeId: string): boolean {
    const active = activeIds();
    const kind = lane(nodeId);
    if (kind === 'exclusive') return active.length === 0;
    if (active.some((id) => lane(id) === 'exclusive')) return false;
    const limit = kind === 'image' ? (options.imageConcurrency?.(nodeId) ?? 3) : 1;
    return active.filter((id) => lane(id) === kind).length < limit;
  }
  function updateCounts(state: CanvasGroupQueueState) {
    state.completed = state.finished.length;
    state.total = state.completed + state.pending.length + Object.keys(state.running).length;
    state.active = Object.keys(state.running)[0];
    state.startedAt = state.active ? state.running[state.active] : undefined;
  }
  /** Persist a bounded checkpoint; full failure text stays in the run log. */
  function persistState(
    state: CanvasGroupQueueState,
    phase: CanvasWorkflowState['phase'] = state.phase,
    message = state.message
  ) {
    const group = documentState?.nodes.find((node) => node.id === state.groupId);
    if (!group || group.type !== 'section') return;
    const ids = new Set(documentState!.nodes.map((node) => node.id));
    const workflowState: CanvasWorkflowState = {
      phase,
      message: message.slice(0, 400),
      completed: state.finished.filter((id) => ids.has(id)),
      pending: [...state.pending, ...Object.keys(state.running)].filter((id) => ids.has(id)),
      failures: Object.fromEntries(
        Object.entries(state.failures)
          .filter(([id]) => ids.has(id))
          .map(([id, text]) => [id, text.length > 300 ? text.slice(0, 299) + '…' : text])
      ),
      retries: Object.fromEntries(
        Object.entries(state.retries)
          .filter(([id]) => ids.has(id))
          .map(([id, count]) => [id, Math.min(2, count)])
      ),
      updatedAt: Date.now(),
      ...(phase === 'paused' && state.pauseReason ? { pauseReason: state.pauseReason } : {}),
    };
    group.workflowState = workflowState;
  }
  function checkpoint() {
    sync();
    const now = Date.now();
    for (const state of queues.values()) {
      const group = documentState?.nodes.find((node) => node.id === state.groupId);
      if (!group) continue;
      state.elapsedMs = Math.max(state.elapsedMs, group.workDurationMs || 0);
      if (state.runStartedAt !== undefined) {
        state.elapsedMs += Math.max(0, now - state.runStartedAt);
        state.runStartedAt = now;
        group.workDurationMs = state.elapsedMs;
      }
    }
  }
  async function settle(
    state: CanvasGroupQueueState,
    phase: 'paused' | 'complete',
    message: string,
    pauseReason?: 'prelayout-review'
  ) {
    if (settling.has(state)) return;
    settling.add(state);
    checkpoint();
    const current = documentState;
    if (state.runStartedAt !== undefined) {
      state.elapsedMs += Math.max(0, Date.now() - state.runStartedAt);
      state.runStartedAt = undefined;
    }
    const group = current?.nodes.find((node) => node.id === state.groupId);
    if (group) {
      group.workDurationMs = state.elapsedMs;
      group.workTimingOpen = phase !== 'complete';
      if (!group.workStartedAt)
        group.workStartedAt = state.elapsedMs ? Date.now() - state.elapsedMs : Date.now();
    }
    if (pauseReason) state.pauseReason = pauseReason;
    else delete state.pauseReason;
    delete state.scope;
    // Save the final phase itself, so a reload never restores a phantom running executor.
    persistState(state, phase, message);
    state.phase = 'waiting';
    state.message = '保存执行结果';
    options.changed();
    let saved = false;
    try {
      saved = !options.save || (await options.save());
    } catch (error) {
      options.error(error instanceof Error ? error.message : String(error));
    } finally {
      settling.delete(state);
    }
    if (!sameCanvas(options.getDocument(), current) || queues.get(state.groupId) !== state) return;
    sync();
    state.phase = saved ? phase : 'paused';
    state.message = saved ? message : '画布保存失败，请先保存再继续';
    if (!saved) delete state.pauseReason;
    if (!saved) {
      for (const queued of queues.values()) {
        if (!executing(queued) || queued === state) continue;
        queued.stopping = true;
        queued.message = state.message;
      }
      for (const queued of queues.values())
        if (queued !== state && executing(queued) && !Object.keys(queued.running).length)
          void settle(queued, 'paused', state.message);
      options.error(state.message);
      persistState(state);
    }
    options.changed();
    void pump();
  }
  async function execute(state: CanvasGroupQueueState, id: string, initial: CanvasDocument) {
    let success = false;
    let failure = '';
    const token = state.running[id];
    const discarded = () => removed.get(id) === token;
    try {
      success = await options.run(id);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      if (!discarded()) options.error(failure);
    }
    if (!sameCanvas(options.getDocument(), initial) || queues.get(state.groupId) !== state) {
      if (discarded()) removed.delete(id);
      return;
    }
    sync();
    const current = documentState!;
    if (state.running[id] !== token) {
      if (discarded()) removed.delete(id);
      return;
    }
    delete state.running[id];
    if (discarded()) {
      removed.delete(id);
      updateCounts(state);
      persistState(state);
      if (!Object.keys(state.running).length) void settle(state, 'paused', state.message);
      else void pump();
      return;
    }
    const halt = options.haltReason?.();
    if (halt) {
      state.pending.unshift(id);
      updateCounts(state);
      for (const queued of queues.values()) {
        if (!executing(queued)) continue;
        queued.stopping = true;
        queued.message = halt;
      }
      for (const queued of queues.values())
        if (executing(queued) && !Object.keys(queued.running).length)
          void settle(queued, 'paused', halt);
      options.error(halt);
      return;
    }
    if (success) state.finished.push(id);
    else {
      state.pending.unshift(id);
      state.failures[id] = failure || '步骤未完成，请查看卡片和运行日志';
      const retry = !state.stopping && options.retryTarget?.(id);
      if (
        retry &&
        (state.retries[retry] || 0) < 2 &&
        current.nodes.some((node) => node.id === retry && node.sectionId === state.groupId)
      ) {
        options.prepareRetry?.(retry, id);
        state.retries[retry] = (state.retries[retry] || 0) + 1;
        delete state.failures[id];
        const affected = new Set([
          retry,
          ...canvasDependents(current, retry).map((node) => node.id),
        ]);
        const redo = members(state.groupId).filter(
          (node) => affected.has(node.id) && options.needs(node.id)
        );
        const waitingIds = new Set([...redo.map((node) => node.id), retry]);
        const ordered: string[] = [];
        while (waitingIds.size) {
          const next = [...waitingIds].find(
            (nodeId) =>
              !canvasReferences(current, nodeId).some((source) => waitingIds.has(source.id))
          );
          if (!next) throw new Error('重试分支存在循环引用');
          ordered.push(next);
          waitingIds.delete(next);
        }
        state.pending = [
          ...state.pending.filter((nodeId) => !ordered.includes(nodeId)),
          ...ordered,
        ];
        state.finished = state.finished.filter((nodeId) => !ordered.includes(nodeId));
      }
    }
    updateCounts(state);
    state.phase = Object.keys(state.running).length ? 'running' : 'queued';
    state.message = state.stopping ? '已停止后续' : '继续可执行分支';
    persistState(state);
    options.changed();
    void pump();
  }
  async function pump() {
    if (pumping) return;
    pumping = true;
    clearTimeout(timer);
    try {
      sync();
      const current = documentState;
      let progressed = true;
      while (current && options.getDocument() === current && progressed) {
        // Same-canvas edits replace the document object; pump restarts on the next tick.
        progressed = false;
        for (const state of queues.values()) {
          if (!executing(state) || settling.has(state)) continue;
          if (state.stopping) {
            if (!Object.keys(state.running).length) void settle(state, 'paused', state.message);
            continue;
          }
          try {
            options.expand?.(state.groupId);
          } catch (error) {
            state.stopping = true;
            state.message = error instanceof Error ? error.message : String(error);
            options.error(state.message);
            if (!Object.keys(state.running).length) void settle(state, 'paused', state.message);
            continue;
          }
          const known = new Set([
            ...state.pending,
            ...state.finished,
            ...Object.keys(state.running),
          ]);
          for (const node of members(state.groupId)) {
            if (known.has(node.id) || !inScope(state, node.id) || !options.needs(node.id)) continue;
            state.pending.push(node.id);
            updateCounts(state);
          }
          const active = activeIds();
          if (state.stopping) {
            if (!Object.keys(state.running).length) void settle(state, 'paused', state.message);
            continue;
          }
          if (!state.pending.length && !Object.keys(state.running).length) {
            if (state.scope === 'prelayout' && !Object.keys(state.failures).length)
              void settle(
                state,
                'paused',
                '预排已就绪：请查看各批预排图和识图标注，确认后点击继续分离生图',
                'prelayout-review'
              );
            else void settle(state, 'complete', '已完成');
            continue;
          }
          if (!current.nodes.some((item) => item.id === state.groupId && item.type === 'section')) {
            state.stopping = true;
            state.message = '分组已移除';
            progressed = true;
            continue;
          }
          if (!active.length && options.busy()) {
            state.phase = 'waiting';
            state.message = '等待当前步骤完成';
            continue;
          }
          const blocked = new Set(Object.keys(state.failures));
          for (const failed of Object.keys(state.failures))
            for (const node of canvasDependents(current, failed)) blocked.add(node.id);
          const pending = new Set([...queues.values()].flatMap((queued) => queued.pending));
          const id = state.pending.find(
            (nodeId) =>
              !blocked.has(nodeId) &&
              available(nodeId) &&
              canvasReferences(current, nodeId).every(
                (source) => !pending.has(source.id) && !active.includes(source.id)
              )
          );
          if (!id) {
            if (
              !Object.keys(state.running).length &&
              (!active.length || state.pending.every((nodeId) => blocked.has(nodeId)))
            ) {
              const reason = Object.entries(state.failures)
                .map(
                  ([nodeId, message]) =>
                    (current.nodes.find((node) => node.id === nodeId)?.title || nodeId) +
                    '：' +
                    message
                )
                .join('；');
              const review = !state.pending.length && state.scope === 'prelayout' && !reason;
              void settle(
                state,
                state.pending.length || review ? 'paused' : 'complete',
                state.pending.length
                  ? reason || '等待上游完成，请核查卡片状态'
                  : review
                    ? '预排已就绪：请查看各批预排图和识图标注，确认后点击继续分离生图'
                    : '已完成',
                review ? 'prelayout-review' : undefined
              );
            }
            continue;
          }
          const node = current.nodes.find(
            (item) => item.id === id && item.sectionId === state.groupId
          );
          const retrying = (state.retries[id] || 0) > 0 && options.retryTarget?.(id) === id;
          const problem = !node
            ? '卡片已移除，请重新启动队列'
            : retrying
              ? undefined
              : options.problem?.(id);
          if (problem) {
            state.failures[id] = problem;
            options.error(problem);
            progressed = true;
            continue;
          }
          state.pending.splice(state.pending.indexOf(id), 1);
          if (!options.needs(id)) {
            state.finished.push(id);
            updateCounts(state);
            progressed = true;
            continue;
          }
          state.running[id] = Date.now();
          updateCounts(state);
          state.phase = 'running';
          state.message = '正在执行';
          options.changed();
          void execute(state, id, current).catch((error) => {
            if (!sameCanvas(options.getDocument(), current)) return;
            state.stopping = true;
            state.message = '队列检查失败，请查看运行日志';
            options.error(error instanceof Error ? error.message : String(error));
            void pump();
          });
          progressed = true;
        }
      }
    } catch (error) {
      for (const state of queues.values()) {
        if (!executing(state)) continue;
        state.stopping = true;
        state.message = '队列检查失败，请查看运行日志';
      }
      options.error(error instanceof Error ? error.message : String(error));
    } finally {
      pumping = false;
      checkpoint();
      options.changed();
      if ([...queues.values()].some(executing)) timer = setTimeout(() => void pump(), 2000);
    }
  }
  return {
    checkpoint,
    completed(nodeId: string) {
      sync();
      for (const state of queues.values()) {
        if (state.phase !== 'paused' || !state.pending.includes(nodeId)) continue;
        if (options.needs(nodeId) || options.problem?.(nodeId)) continue;
        state.pending = state.pending.filter((id) => id !== nodeId);
        delete state.failures[nodeId];
        if (!state.finished.includes(nodeId)) state.finished.push(nodeId);
        updateCounts(state);
        state.message = '失败步骤已恢复，可继续剩余流程';
        persistState(state);
        if (!state.pending.length) void settle(state, 'complete', '已完成');
        else options.changed();
      }
    },
    start,
    hold,
    stop,
    remove,
    move,
    remaining(groupId: string) {
      sync();
      return members(groupId).filter((node) => options.needs(node.id) || options.problem?.(node.id))
        .length;
    },
    view(groupId: string) {
      sync();
      const group = documentState?.nodes.find((node) => node.id === groupId);
      // Saved checkpoints are a read-only projection; they never claim a live executor.
      const state = queues.get(groupId) || (group ? savedQueueState(group) : undefined);
      if (state && state.runStartedAt === undefined)
        state.elapsedMs = Math.max(state.elapsedMs, group?.workDurationMs || 0);
      return state;
    },
    blockedBy(groupId: string, nodeId: string) {
      sync();
      return Object.keys(queues.get(groupId)?.failures || {}).find(
        (id) =>
          id !== nodeId &&
          documentState &&
          canvasDependents(documentState, id).some((node) => node.id === nodeId)
      );
    },
    protects(id: string) {
      sync();
      return [...queues.values()].some(
        (state) =>
          executing(state) &&
          (state.groupId === id ||
            members(state.groupId).some(
              (node) =>
                node.id === id ||
                canvasReferences(documentState!, node.id).some((source) => source.id === id)
            ))
      );
    },
    get isBusy() {
      sync();
      return [...queues.values()].some(executing);
    },
  };
}
