import type { CanvasDocument, CanvasNode } from './model.js';
import { canvasReferences, canvasDependents } from './dependencies.js';

export interface CanvasGroupQueueState {
  groupId: string;
  pending: string[];
  completed: number;
  total: number;
  finished: string[];
  failures: Record<string, string>;
  retries: Record<string, number>;
  active?: string;
  startedAt?: number;
  phase: 'queued' | 'running' | 'waiting' | 'paused' | 'complete';
  message: string;
  stopping: boolean;
}

export function createCanvasGroupQueue(options: {
  getDocument(): CanvasDocument | null;
  needs(nodeId: string): boolean;
  problem?(nodeId: string): string | undefined;
  busy(): boolean;
  run(nodeId: string): Promise<boolean>;
  retryTarget?(nodeId: string): string | undefined;
  prepareRetry?(nodeId: string, failedNodeId: string): void;
  stopActive?(nodeId: string): void;
  confirm(message: string): boolean;
  changed(): void;
  error(message: string): void;
  haltReason?(): string | undefined;
}) {
  const queues = new Map<string, CanvasGroupQueueState>();
  let documentState: CanvasDocument | null = null;
  let pumping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const executing = (state: CanvasGroupQueueState) =>
    ['queued', 'running', 'waiting'].includes(state.phase);
  function sync() {
    if (documentState === options.getDocument()) return;
    queues.clear();
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
          ' 个步骤？识图按模型服务计费；生图和视频会消耗积分，Seedance 2.5 按较高费用计费。生图确定失败或图集排版无法切分时最多重新生图2次；结果未知不重提。失败只阻塞依赖分支，其余继续。请保持页面打开。'
      )
    )
      return false;
    const finished = (prior?.finished || []).filter(
      (id) => members(groupId).some((node) => node.id === id) && !pending.includes(id)
    );
    queues.set(groupId, {
      groupId,
      pending,
      completed: finished.length,
      total: finished.length + pending.length,
      finished,
      failures: {},
      retries: { ...prior?.retries },
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
    if (state.active) options.stopActive?.(state.active);
    state.message = state.active ? '当前步骤结束后停止；不取消远端任务' : '已停止后续';
    if (!state.active) state.phase = 'paused';
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
  async function pump() {
    if (pumping) return;
    pumping = true;
    clearTimeout(timer);
    try {
      sync();
      const current = documentState;
      while (current && options.getDocument() === current) {
        const waiting = [...queues.values()].filter(executing);
        if (!waiting.length) return;
        if (options.busy()) {
          for (const state of waiting) {
            state.phase = 'waiting';
            state.message = '等待当前步骤完成';
          }
          break;
        }
        let selected: CanvasGroupQueueState | undefined;
        for (const state of waiting) {
          if (state.stopping) {
            state.phase = 'paused';
            continue;
          }
          if (!current.nodes.some((item) => item.id === state.groupId && item.type === 'section')) {
            state.phase = 'paused';
            state.message = '分组已移除';
            continue;
          }
          const blocked = new Set(Object.keys(state.failures));
          for (const failed of Object.keys(state.failures))
            for (const node of canvasDependents(current, failed)) blocked.add(node.id);
          const id = state.pending.find((id) => !blocked.has(id));
          if (!id) {
            state.phase = state.pending.length ? 'paused' : 'complete';
            state.message = state.pending.length
              ? Object.entries(state.failures)
                  .map(
                    ([id, reason]) =>
                      (current.nodes.find((node) => node.id === id)?.title || id) + '：' + reason
                  )
                  .join('；')
              : '已完成';
            continue;
          }
          selected = state;
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
            break;
          }
          if (!options.needs(id)) {
            state.pending.splice(state.pending.indexOf(id), 1);
            state.finished.push(id);
            state.completed = state.finished.length;
            break;
          }
          selected = state;
          state.active = id;
          state.pending.splice(state.pending.indexOf(id), 1);
          state.phase = 'running';
          state.startedAt = Date.now();
          state.message = '正在执行';
          options.changed();
          let success = false;
          let failure = '';
          try {
            success = await options.run(id);
          } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
            options.error(failure);
          }
          if (options.getDocument() !== current) return;
          const halt = options.haltReason?.();
          if (halt) {
            state.pending.unshift(id);
            state.active = undefined;
            state.startedAt = undefined;
            state.phase = 'paused';
            state.message = halt;
            for (const queued of queues.values()) {
              if (executing(queued)) {
                queued.phase = 'paused';
                queued.message = halt;
              }
            }
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
              // Re-run the source and invalidated descendants in dependency order.
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
          state.completed = state.finished.length;
          state.total = state.completed + state.pending.length;
          state.active = undefined;
          state.startedAt = undefined;
          state.phase = state.stopping ? 'paused' : state.pending.length ? 'queued' : 'complete';
          state.message = state.stopping
            ? '已停止后续'
            : state.pending.length
              ? '继续可执行分支'
              : '已完成';
          break;
        }
        options.changed();
        if (!selected) break;
      }
    } catch (error) {
      for (const state of queues.values())
        if (executing(state)) {
          state.phase = 'paused';
          state.message = '队列检查失败，请查看运行日志';
        }
      options.error(error instanceof Error ? error.message : String(error));
    } finally {
      pumping = false;
      options.changed();
      if ([...queues.values()].some(executing)) timer = setTimeout(() => void pump(), 2000);
    }
  }
  return {
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
