import type { CanvasDocument, CanvasNode, CanvasGroupQueueState } from '../contracts.js';
import { canvasReferences, canvasDependents } from '../core/dependencies.js';

export function createCanvasGroupQueue(options: {
  getDocument(): CanvasDocument | null;
  needs(nodeId: string): boolean;
  problem?(nodeId: string): string | undefined;
  busy(): boolean;
  parallel?(nodeId: string): boolean;
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
  const settling = new Set<CanvasGroupQueueState>();
  let documentState: CanvasDocument | null = null;
  let pumping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const executing = (state: CanvasGroupQueueState) =>
    ['queued', 'running', 'waiting'].includes(state.phase);
  function sync() {
    if (documentState === options.getDocument()) return;
    queues.clear();
    settling.clear();
    clearTimeout(timer);
    documentState = options.getDocument();
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
  function start(groupId: string, alreadyConfirmed = false) {
    sync();
    if (!documentState || (queues.get(groupId) && executing(queues.get(groupId)!))) return false;
    const prior = queues.get(groupId);
    const previous = prior?.pending || [];
    const candidates = members(groupId).filter(
      (node) => options.needs(node.id) || options.problem?.(node.id)
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
          ' 个步骤？识图按模型服务计费；生图和视频会消耗积分，Seedance 2.5 按较高费用计费。生图确定失败时最多重新生图2次；切图失败保留原图，调整裁切框，不自动重新生图。结果未知不重提。失败只阻塞依赖分支，其余继续。请保持页面打开。'
      )
    )
      return false;
    const group = documentState.nodes.find((node) => node.id === groupId)!;
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
    const persisted = group.workDurationMs || 0;
    queues.set(groupId, {
      groupId,
      pending,
      completed: finished.length,
      total: finished.length + pending.length,
      finished,
      failures: {},
      retries: resumingMemory ? { ...prior.retries } : {},
      running: {},
      // A recognition result may have increased the saved total after the last pause.
      elapsedMs: resumingMemory ? Math.max(prior.elapsedMs, persisted) : resuming ? persisted : 0,
      runStartedAt: Date.now(),
      phase: 'queued',
      message: '准备执行',
      stopping: false,
    });
    options.changed();
    void pump();
    return true;
  }
  function stop(groupId: string) {
    const state = queues.get(groupId);
    if (!state || !executing(state)) return;
    state.stopping = true;
    for (const id of Object.keys(state.running)) options.stopActive?.(id);
    state.message = state.active ? '当前步骤结束后停止；不取消远端任务' : '已停止后续';
    if (!state.active) void settle(state, 'paused', '已停止后续');
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
    return active.filter((id) => lane(id) === kind).length < (kind === 'image' ? 3 : 1);
  }
  function updateCounts(state: CanvasGroupQueueState) {
    state.completed = state.finished.length;
    state.total = state.completed + state.pending.length + Object.keys(state.running).length;
    state.active = Object.keys(state.running)[0];
    state.startedAt = state.active ? state.running[state.active] : undefined;
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
    message: string
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
    if (options.getDocument() !== current || queues.get(state.groupId) !== state) return;
    state.phase = saved ? phase : 'paused';
    state.message = saved ? message : '画布保存失败，请先保存再继续';
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
    }
    options.changed();
    void pump();
  }
  async function execute(state: CanvasGroupQueueState, id: string, current: CanvasDocument) {
    let success = false;
    let failure = '';
    try {
      success = await options.run(id);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      options.error(failure);
    }
    if (options.getDocument() !== current || queues.get(state.groupId) !== state) return;
    delete state.running[id];
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
            if (known.has(node.id) || !options.needs(node.id)) continue;
            state.pending.push(node.id);
            updateCounts(state);
          }
          const active = activeIds();
          if (state.stopping) {
            if (!Object.keys(state.running).length) void settle(state, 'paused', state.message);
            continue;
          }
          if (!state.pending.length && !Object.keys(state.running).length) {
            void settle(state, 'complete', '已完成');
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
              void settle(
                state,
                state.pending.length ? 'paused' : 'complete',
                state.pending.length ? reason || '等待上游完成，请核查卡片状态' : '已完成'
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
            if (options.getDocument() !== current) return;
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
    start,
    stop,
    move,
    remaining(groupId: string) {
      sync();
      return members(groupId).filter((node) => options.needs(node.id) || options.problem?.(node.id))
        .length;
    },
    view(groupId: string) {
      sync();
      const state = queues.get(groupId);
      const group = documentState?.nodes.find((node) => node.id === groupId);
      if (state && state.runStartedAt === undefined)
        state.elapsedMs = Math.max(state.elapsedMs, group?.workDurationMs || 0);
      return queues.get(groupId);
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
