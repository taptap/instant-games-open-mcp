import type { CanvasDocument, CanvasNode } from './model.js';
import { canvasReferences } from './dependencies.js';

export interface CanvasGroupQueueState {
  groupId: string;
  pending: string[];
  completed: number;
  total: number;
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
  videoBusy(): Promise<boolean>;
  run(nodeId: string): Promise<boolean>;
  confirm(message: string): boolean;
  changed(): void;
  error(message: string): void;
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
          ['image', 'video', 'video-source', 'sequence', 'animation'].includes(node.type)
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
  function start(groupId: string) {
    sync();
    if (!documentState || (queues.get(groupId) && executing(queues.get(groupId)!))) return;
    const previous = queues.get(groupId)?.pending || [];
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
        return;
      }
      pending.push(next.id);
      remaining.delete(next.id);
    }
    if (!pending.length) {
      options.error('此分组没有待处理的步骤。');
      return;
    }
    if (
      !options.confirm(
        '按当前参数完成此分组剩余 ' +
          pending.length +
          ' 个步骤？生图和视频会消耗积分，Seedance 2.5 按较高费用计费。执行中不逐张确认参考图；失败会暂停，不自动重试。请保持页面打开。'
      )
    )
      return;
    queues.set(groupId, {
      groupId,
      pending,
      completed: 0,
      total: pending.length,
      phase: 'queued',
      message: '准备执行',
      stopping: false,
    });
    options.changed();
    void pump();
  }
  function stop(groupId: string) {
    const state = queues.get(groupId);
    if (!state || !executing(state)) return;
    state.stopping = true;
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
          const id = state.pending[0];
          const node = current.nodes.find(
            (item) => item.id === id && item.sectionId === state.groupId
          );
          if (!current.nodes.some((item) => item.id === state.groupId && item.type === 'section')) {
            state.phase = 'paused';
            state.message = '分组已移除';
            continue;
          }
          if (!node && id) {
            state.phase = 'paused';
            state.message = '卡片已移除，请重新启动队列';
            continue;
          }
          if (!id) {
            state.phase = 'complete';
            state.message = '已完成';
            continue;
          }
          const problem = options.problem?.(id);
          if (problem) {
            state.phase = 'paused';
            state.message = problem;
            options.error(problem);
            continue;
          }
          if (!options.needs(id)) {
            state.pending.shift();
            state.completed++;
            selected = state;
            break;
          }
          if (['video', 'video-source'].includes(node!.type)) {
            try {
              if (await options.videoBusy()) {
                state.phase = 'waiting';
                state.message = '等待视频名额';
                continue;
              }
            } catch (error) {
              state.phase = 'paused';
              state.message = '视频名额检查失败';
              options.error(error instanceof Error ? error.message : String(error));
              continue;
            }
          }
          if (!executing(state) || state.stopping || options.getDocument() !== current) continue;
          if (state.pending[0] !== id) {
            selected = state;
            break;
          }
          if (options.busy()) break;
          selected = state;
          state.active = id;
          state.pending.shift();
          state.phase = 'running';
          state.startedAt = Date.now();
          state.message = '正在执行';
          options.changed();
          let success = false;
          try {
            success = await options.run(id);
          } catch (error) {
            options.error(error instanceof Error ? error.message : String(error));
          }
          if (success) state.completed++;
          else state.pending.unshift(id);
          state.active = undefined;
          state.startedAt = undefined;
          state.phase =
            !success || state.stopping ? 'paused' : state.pending.length ? 'queued' : 'complete';
          state.message = !success
            ? '已暂停，请查看当前卡片及运行日志'
            : state.stopping
              ? '已停止后续'
              : state.pending.length
                ? '准备执行'
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
