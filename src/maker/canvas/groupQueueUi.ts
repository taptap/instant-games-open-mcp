import type { CanvasNode } from './model.js';
import type { createCanvasGroupQueue } from './groupQueue.js';

export const GROUP_QUEUE_STYLES = [
  '.card.section:has(.group-queue) { overflow:visible; }',
  '.group-queue { position:absolute; top:calc(100% + 8px); left:0; width:100%; min-height:42px; box-sizing:border-box; display:flex; align-items:center; gap:10px; padding:7px 10px; border:1px solid #655337; border-radius:9px; background:#24221eee; color:#d5c8ad; box-shadow:0 5px 14px #0003; font-size:12px; cursor:default; }',
  '.group-queue button { height:28px; flex-shrink:0; border:1px solid #66553a; border-radius:6px; background:#3a3021; color:#f4d398; padding:3px 9px; font-size:12px; cursor:pointer; }',
  '.group-queue button:hover { background:#514029; } .group-queue button:focus-visible { outline:2px solid #e6b15c; outline-offset:2px; }',
  '.group-queue .group-queue-current { min-width:100px; max-width:30%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
  '.group-queue .group-queue-status { color:#b3a995; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
  '.group-queue-tasks { flex:1; min-width:30px; display:flex; align-items:center; gap:6px; overflow-x:auto; scrollbar-width:thin; scrollbar-color:#655337 transparent; padding:2px; }',
  '.group-queue .group-queue-task { max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-color:#514939; color:#cbc4b6; background:#302c25; cursor:grab; }',
  '.group-queue-task[data-drop] { border-left:3px solid #ffce76; } .group-queue-count { font-variant-numeric:tabular-nums; color:#a99d86; white-space:nowrap; }',
  '.group-queue-spinner { flex:none; width:12px; height:12px; border:2px solid #715c35; border-top-color:#f0c273; border-radius:50%; animation:group-queue-spin 1s linear infinite; }',
  '.group-queue[data-phase=paused] { flex-wrap:wrap; align-items:flex-start; border-color:#886143; } .group-queue[data-confirming=true] { border-color:#e6b15c; background:#3a2e1c; } .group-queue .group-queue-status.group-queue-detail { flex:1 0 100%; white-space:normal; overflow:visible; text-overflow:unset; color:#f0c273; line-height:1.45; } @keyframes group-queue-spin { to { transform:rotate(360deg); } }',
  '@media(prefers-reduced-motion:reduce) { .group-queue-spinner { animation:none; } }',
].join('\n');

export function createCanvasGroupQueueUi(options: {
  queue: ReturnType<typeof createCanvasGroupQueue>;
  node(id: string): CanvasNode | undefined;
  focus(id: string): void;
  scale?(): number;
}) {
  const views = new Map<string, HTMLElement>();
  const confirming = new Set<string>();
  let dragged: { groupId: string; nodeId: string } | undefined;
  function title(id: string): string {
    const node = options.node(id);
    const action =
      node?.type === 'image'
        ? '生图'
        : ['video', 'video-source'].includes(node?.type || '')
          ? '视频'
          : node?.type === 'sequence'
            ? '抽帧'
            : '动画';
    return (node?.title || '卡片') + ' · ' + action;
  }
  function elapsed(startedAt?: number): string {
    const seconds = Math.max(0, Math.floor((Date.now() - (startedAt || Date.now())) / 1000));
    return (
      Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0') +
      ':' +
      (seconds % 60).toString().padStart(2, '0')
    );
  }
  function paint(root: HTMLElement, groupId: string) {
    const scroll = root.querySelector('.group-queue-tasks')?.scrollLeft || 0;
    const previousPhase = root.dataset.phase;
    root.replaceChildren();
    const state = options.queue.view(groupId);
    root.dataset.phase = state?.phase || 'idle';
    root.dataset.confirming = confirming.has(groupId) ? 'true' : 'false';
    function button(label: string, action: () => void, className = '') {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.className = className;
      element.addEventListener('click', action);
      return element;
    }
    const active = state && ['queued', 'running', 'waiting'].includes(state.phase);
    if (state?.active) {
      const spinner = document.createElement('span');
      spinner.className = 'group-queue-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      const current = button(
        title(state.active),
        () => options.focus(state.active!),
        'group-queue-current'
      );
      current.title = title(state.active) + '（点击定位卡片）';
      const time = document.createElement('span');
      time.className = 'group-queue-count';
      time.dataset.elapsed = groupId;
      time.textContent = elapsed(state.startedAt);
      root.append(spinner, current, time);
    } else if (!active && !options.queue.remaining(groupId)) {
      const done = document.createElement('span');
      done.className = 'group-queue-count';
      done.textContent = '✓ 已完成';
      root.append(done);
    } else if (!active && confirming.has(groupId)) {
      root.append(
        button('确认执行', () => {
          confirming.delete(groupId);
          options.queue.start(groupId, true);
        }),
        button('取消', () => {
          confirming.delete(groupId);
          paint(root, groupId);
        })
      );
      const hint = document.createElement('span');
      hint.className = 'group-queue-status';
      hint.textContent = '生图和视频会消耗积分；失败会暂停，不自动重试。';
      root.append(hint);
    } else {
      root.append(
        button(
          active ? state!.message : state?.phase === 'paused' ? '继续剩余流程' : '▶ 完成剩余流程',
          () => {
            if (active) return;
            confirming.add(groupId);
            paint(root, groupId);
          }
        )
      );
      (root.firstElementChild as HTMLButtonElement).disabled = Boolean(active);
    }
    const tasks = document.createElement('div');
    tasks.className = 'group-queue-tasks';
    tasks.setAttribute('aria-label', '待执行任务，拖动调整顺序');
    for (const id of state?.pending || []) {
      const item = button('⠿ ' + title(id), () => options.focus(id), 'group-queue-task');
      item.dataset.nodeId = id;
      item.draggable = true;
      item.title = title(id) + '（拖动排序；左右方向键调整）';
      item.addEventListener('dragstart', (event) => {
        dragged = { groupId, nodeId: id };
        event.stopPropagation();
        event.dataTransfer?.setData('text/plain', id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragover', (event) => {
        if (dragged?.groupId === groupId) {
          event.preventDefault();
          event.stopPropagation();
          item.dataset.drop = 'true';
        }
      });
      item.addEventListener('dragleave', () => delete item.dataset.drop);
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const source = dragged;
        dragged = undefined;
        if (source?.groupId === groupId) options.queue.move(groupId, source.nodeId, id);
        delete item.dataset.drop;
      });
      item.addEventListener('dragend', () => {
        dragged = undefined;
        delete item.dataset.drop;
      });
      item.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const pending = options.queue.view(groupId)?.pending || [];
        const index = pending.indexOf(id);
        if (event.key === 'ArrowLeft' && index > 0)
          options.queue.move(groupId, id, pending[index - 1]);
        if (event.key === 'ArrowRight' && index < pending.length - 1)
          options.queue.move(groupId, id, pending[index + 2]);
        root.querySelector<HTMLButtonElement>('[data-node-id="' + id + '"]')?.focus();
      });
      tasks.append(item);
    }
    tasks.addEventListener('dragover', (event) => {
      if (dragged?.groupId === groupId) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    tasks.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = dragged;
      dragged = undefined;
      if (source?.groupId === groupId) options.queue.move(groupId, source.nodeId);
    });
    if (!state?.pending.length) {
      const hint = document.createElement('span');
      hint.className = 'group-queue-status';
      hint.textContent = state ? state.message : '按连线顺序完成此分组；可拖动待执行任务';
      tasks.append(hint);
    }
    root.append(tasks);
    tasks.scrollLeft = scroll;
    if (state) {
      const count = document.createElement('span');
      count.className = 'group-queue-count';
      count.textContent = state.completed + '/' + state.total;
      count.title = state.message;
      root.append(count);
      if (state.phase === 'paused') {
        const hint = document.createElement('span');
        hint.className = 'group-queue-status';
        hint.textContent = '已暂停';
        hint.title = state.message;
        root.append(hint);
        if (state.message) {
          const detail = document.createElement('span');
          detail.className = 'group-queue-status group-queue-detail';
          detail.textContent = state.message;
          root.append(detail);
        }
      }
    }
    if (active) {
      const stop = button(state.stopping ? '正在停止后续' : '停止后续', () =>
        options.queue.stop(groupId)
      );
      stop.disabled = state.stopping;
      stop.title = '不取消当前已提交的远端任务';
      root.append(stop);
    }
    if (state?.phase === 'paused' && previousPhase !== 'paused') {
      root.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  return {
    render(card: HTMLElement, group: CanvasNode) {
      const root = document.createElement('div');
      root.className = 'group-queue';
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', group.title + '执行队列');
      const scale = options.scale?.() || 1;
      root.style.width = group.width * scale + 'px';
      root.style.transformOrigin = 'top left';
      root.style.transform = 'scale(' + 1 / scale + ')';
      for (const eventName of [
        'pointerdown',
        'click',
        'dblclick',
        'contextmenu',
        'keydown',
        'wheel',
      ])
        root.addEventListener(eventName, (event) => event.stopPropagation());
      views.set(group.id, root);
      card.append(root);
      paint(root, group.id);
    },
    refresh() {
      for (const [id, root] of views) {
        if (!root.isConnected) views.delete(id);
        else if (!dragged) paint(root, id);
      }
    },
    tick() {
      for (const [id, root] of views) {
        if (!root.isConnected) {
          views.delete(id);
          continue;
        }
        const time = root.querySelector<HTMLElement>('[data-elapsed]');
        if (time) time.textContent = elapsed(options.queue.view(id)?.startedAt);
      }
    },
  };
}
