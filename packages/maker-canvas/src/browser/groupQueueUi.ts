import type { CanvasNode } from '../contracts.js';
import type { createCanvasGroupQueue } from './groupQueue.js';
import { canvasFlowDuration, formatCanvasWorkDuration } from './workTiming.js';

export const GROUP_QUEUE_STYLES = [
  '.card.section:has(.group-queue) { overflow:visible; }',
  '.group-queue { position:absolute; top:calc(100% + 8px); left:0; width:100%; min-height:42px; box-sizing:border-box; display:flex; flex-direction:column; align-items:stretch; gap:6px; padding:7px 10px; border:1px solid #655337; border-radius:9px; background:#24221eee; color:#d5c8ad; box-shadow:0 5px 14px #0003; font-size:12px; cursor:default; }',
  '.group-queue button { height:28px; flex-shrink:0; border:1px solid #66553a; border-radius:6px; background:#3a3021; color:#f4d398; padding:3px 9px; font-size:12px; cursor:pointer; }',
  '.group-queue button:hover { background:#514029; } .group-queue button:focus-visible { outline:2px solid #e6b15c; outline-offset:2px; }',
  '.group-queue .group-queue-current { min-width:100px; max-width:30%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
  '.group-queue .group-queue-status { color:#b3a995; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
  // Each row is one line; a crowded row scrolls sideways instead of wrapping.
  '.group-queue-row { display:flex; flex-wrap:nowrap; align-items:center; gap:10px; min-width:0; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }',
  '.group-queue-row::-webkit-scrollbar { display:none; } .group-queue-row > .group-queue-status { flex:1 1 auto; min-width:40px; } .group-queue-stop { margin-left:auto; }',
  '.group-queue-tasks { flex:1 1 auto; min-width:60px; display:flex; flex-wrap:nowrap; align-items:center; gap:6px; padding:2px; overflow-x:auto; overflow-y:hidden; scrollbar-width:thin; }',
  '.group-queue .group-queue-task { max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-color:#514939; color:#cbc4b6; background:#302c25; cursor:grab; }',
  '.group-queue-task[data-drop] { border-left:3px solid #ffce76; } .group-queue-count { font-variant-numeric:tabular-nums; color:#a99d86; white-space:nowrap; }',
  '.group-queue-spinner { flex:none; width:12px; height:12px; border:2px solid #715c35; border-top-color:#f0c273; border-radius:50%; animation:group-queue-spin 1s linear infinite; }',
  '.group-queue[data-phase=paused] { border-color:#886143; } .group-queue[data-confirming=true] { border-color:#e6b15c; background:#3a2e1c; } .group-queue .group-queue-status.group-queue-detail { white-space:normal; overflow:visible; text-overflow:unset; color:#f0c273; line-height:1.45; } @keyframes group-queue-spin { to { transform:rotate(360deg); } }',
  '.group-queue .group-queue-primary { border-color:#e6b15c; background:#5a4423; color:#ffe0a6; font-weight:600; } .group-queue button:disabled { opacity:.55; cursor:default; }',
  // Progress colours: running yellow, done green, failed red (chips and the count text).
  // ":root .card.section" outranks the card and light-theme overrides of the same elements.
  '.group-queue .group-queue-chip { max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }',
  ':root .card.section .group-queue .group-queue-chip[data-state=running] { border-color:#a07a2c; background:#3a2f17; color:#f0c273; }',
  ':root .card.section .group-queue .group-queue-task[data-state=failed] { border-color:#9a4040; background:#3a1f1f; color:#ff9b9b; }',
  ':root .card.section .group-queue .group-queue-done { color:#4fc28b; } :root .card.section .group-queue .group-queue-running { color:#e0a83c; } :root .card.section .group-queue .group-queue-failed { color:#e46b6b; }',
  '@media(prefers-reduced-motion:reduce) { .group-queue-spinner { animation:none; } }',
].join('\n');

export function createCanvasGroupQueueUi(options: {
  queue: ReturnType<typeof createCanvasGroupQueue>;
  node(id: string): CanvasNode | undefined;
  focus(id: string): void;
  scale?(): number;
  /** Template-specific stage view; undefined keeps the generic queue controls. */
  workflow?: {
    view(groupId: string):
      | {
          stage: string;
          primary?: { label: string; run(): unknown; disabled?: boolean; title?: string };
          extra: Array<{ label: string; run(): unknown }>;
          hint?: string;
          /** The template run is still going although the queue itself is not executing. */
          active?: boolean;
        }
      | undefined;
  };
  /** Page-level notice (e.g. another page owns this canvas); replaces every group's controls. */
  notice?(): string | undefined;
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
          : node?.type === 'image-assets'
            ? '切图'
            : node?.type === 'sequence'
              ? '抽帧'
              : '动画';
    return (node?.title || '卡片') + ' · ' + action;
  }
  function stage(id: string): string {
    const node = options.node(id);
    if (!node) return '执行';
    if (node.uiRecognition) return '识图';
    if (node.uiAtlasPrelayout) return '预排切图';
    if (node.type === 'image-assets') return '切图';
    if (node.type === 'resource-bundle') return '组装交付';
    return node.type === 'image' ? '生图' : '处理';
  }
  function totalDuration(groupId: string): string | undefined {
    const state = options.queue.view(groupId);
    const node = options.node(groupId);
    const duration = canvasFlowDuration(
      node,
      state ? { elapsedMs: state.elapsedMs, runStartedAt: state.runStartedAt } : undefined
    );
    if (duration === undefined) return;
    return '总耗时 ' + formatCanvasWorkDuration(duration);
  }
  function paint(root: HTMLElement, groupId: string) {
    root.replaceChildren();
    // Two fixed rows: actions and one status line on top; time, progress and the task strip
    // below. Neither row wraps; the task strip (and a crowded action row) scrolls sideways.
    const head = document.createElement('div');
    head.className = 'group-queue-row group-queue-head';
    const info = document.createElement('div');
    info.className = 'group-queue-row group-queue-info';
    let status: HTMLElement | undefined;
    function setStatus(text: string, className = '') {
      status = document.createElement('span');
      status.className = 'group-queue-status ' + className;
      status.textContent = text;
      status.title = text;
    }
    const state = options.queue.view(groupId);
    const group = options.node(groupId);
    const workflowView = options.workflow?.view(groupId);
    root.dataset.phase = workflowView?.active ? 'running' : state?.phase || 'idle';
    const interactive015 = Boolean(workflowView);
    const cliOnly = Boolean(group?.templateCliOnly) && !interactive015;
    if (cliOnly || workflowView) confirming.delete(groupId);
    root.dataset.confirming = confirming.has(groupId) ? 'true' : 'false';
    root.dataset.workflow = workflowView ? 'true' : 'false';
    const notice = options.notice?.();
    if (notice) {
      // A stale or read-only page must not show its snapshot as if it were the live run.
      root.dataset.phase = 'blocked';
      const label = document.createElement('span');
      label.className = 'group-queue-status group-queue-detail';
      label.textContent = notice;
      root.append(label);
      return;
    }
    function scrollSideways(element: HTMLElement) {
      // The bar swallows wheel events (no canvas zoom); a vertical wheel scrolls sideways.
      element.addEventListener('wheel', (event) => {
        if (element.scrollWidth <= element.clientWidth) return;
        element.scrollLeft += event.deltaX || event.deltaY;
        event.preventDefault();
      });
    }
    function button(label: string, action: () => void, className = '') {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.className = className;
      element.addEventListener('click', action);
      return element;
    }
    const active = state && ['queued', 'running', 'waiting'].includes(state.phase);
    if (cliOnly) {
      const label = document.createElement('span');
      label.className = 'group-queue-count';
      label.textContent = '仅 CLI 执行';
      label.title = '由 Skill 按当前设计稿编排；单张卡片仍可独立操作';
      head.append(label);
    }
    if (state?.active) {
      const spinner = document.createElement('span');
      spinner.className = 'group-queue-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      head.append(spinner);
      // One stable label: parallel runs are listed as yellow chips in the task strip.
      const ids = Object.keys(state.running);
      const first = ids[0] || state.active;
      const current = button(
        workflowView?.stage ||
          stage(first) + ' · ' + title(first) + (ids.length > 1 ? ' 等 ' + ids.length + ' 项' : ''),
        () => options.focus(first),
        'group-queue-current'
      );
      current.title = '进行中：' + ids.map(title).join('、') + '（点击定位第一项）';
      head.append(current);
    } else if (workflowView && !active) {
      if (workflowView.active) {
        const spinner = document.createElement('span');
        spinner.className = 'group-queue-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        head.append(spinner);
      }
      const stageLabel = document.createElement('span');
      stageLabel.className = 'group-queue-count';
      stageLabel.textContent = workflowView.stage;
      head.append(stageLabel);
      if (workflowView.primary) {
        const primary = workflowView.primary;
        const action = button(primary.label, () => void primary.run(), 'group-queue-primary');
        action.disabled = Boolean(primary.disabled);
        if (primary.title) action.title = primary.title;
        head.append(action);
      }
      for (const extra of workflowView.extra)
        head.append(button(extra.label, () => void extra.run()));
      if (workflowView.hint) setStatus(workflowView.hint);
    } else if (!active && !options.queue.remaining(groupId)) {
      const done = document.createElement('span');
      done.className = 'group-queue-count';
      done.textContent = '✓ 已完成';
      head.append(done);
    } else if (!cliOnly && !active && confirming.has(groupId)) {
      head.append(
        button('确认执行', () => {
          confirming.delete(groupId);
          if (
            options.node(groupId)?.templateCliOnly ||
            options.node(groupId)?.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015'
          )
            return;
          options.queue.start(groupId, true);
        }),
        button('取消', () => {
          confirming.delete(groupId);
          paint(root, groupId);
        })
      );
      setStatus(
        '生图确定失败时最多重新生图2次；切图失败保留原图，调整裁切框，不自动重新生图。未知结果不重提。失败只阻塞依赖分支，其余继续。请保持页面打开。'
      );
    } else if (!cliOnly) {
      const continuing =
        state?.phase === 'paused' || (!state && options.node(groupId)?.workTimingOpen);
      const start = button(
        active ? state!.message : continuing ? '继续剩余流程' : '▶ 完成剩余流程',
        () => {
          if (active) return;
          confirming.add(groupId);
          paint(root, groupId);
        }
      );
      start.disabled = Boolean(active);
      head.append(start);
    }
    const durationLabel = totalDuration(groupId);
    if (durationLabel) {
      const time = document.createElement('span');
      time.className = 'group-queue-count';
      time.dataset.elapsed = groupId;
      time.textContent = durationLabel;
      info.append(time);
    }
    const tasks = document.createElement('div');
    tasks.className = 'group-queue-tasks';
    tasks.setAttribute('aria-label', '进行中与待执行任务，拖动待执行任务调整顺序');
    scrollSideways(tasks);
    for (const id of Object.keys(state?.running || {})) {
      const chip = button(title(id), () => options.focus(id), 'group-queue-chip');
      chip.dataset.state = 'running';
      chip.title = '进行中：' + title(id) + '（点击定位卡片）';
      tasks.append(chip);
    }
    for (const id of state?.pending || []) {
      const failure = state?.failures?.[id];
      const blocked = options.queue.blockedBy(groupId, id);
      const item = button(
        (failure ? '失败 · ' : blocked ? '等待上游 · ' : '⠿ ') + title(id),
        () => options.focus(id),
        'group-queue-task'
      );
      item.dataset.nodeId = id;
      if (failure) item.dataset.state = 'failed';
      item.draggable = true;
      item.title =
        failure ||
        (blocked ? '等待 ' + title(blocked) + ' 恢复' : title(id) + '（拖动排序；左右方向键调整）');
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
    if (
      !state?.pending.length &&
      !Object.keys(state?.running || {}).length &&
      !(workflowView && !state) &&
      !workflowView?.active &&
      state?.phase !== 'complete'
    ) {
      if (!status && !workflowView)
        setStatus(
          state
            ? state.message
            : cliOnly
              ? '由 CLI 按需编排；单卡仍可独立操作'
              : '按连线顺序完成此分组；可拖动待执行任务'
        );
    }
    if (state) {
      const count = document.createElement('span');
      count.className = 'group-queue-count';
      const inProgress = Object.keys(state.running).length;
      const failures = Object.keys(state.failures || {}).length;
      const part = (text: string, className: string) => {
        const element = document.createElement('span');
        element.className = className;
        element.textContent = text;
        return element;
      };
      // Weak-signal progress: one compact count; zero running/failed parts are left out.
      count.append(part('完成 ' + state.completed + '/' + state.total, 'group-queue-done'));
      if (inProgress) count.append(' · ', part('进行中 ' + inProgress, 'group-queue-running'));
      if (failures) count.append(' · ', part('失败 ' + failures, 'group-queue-failed'));
      Object.assign(count.dataset, {
        done: String(state.completed),
        total: String(state.total),
        running: String(inProgress),
        failed: String(failures),
      });
      count.title =
        '已完成 ' +
        state.completed +
        '/' +
        state.total +
        ' · 进行中 ' +
        inProgress +
        ' · 失败 ' +
        failures;
      if (state.total) info.append(count);
      if (state.active && state.retries?.[state.active]) {
        const retry = document.createElement('span');
        retry.className = 'group-queue-count';
        retry.textContent = '重新生图 ' + state.retries[state.active] + '/2';
        info.append(retry);
      }
      // A template view already explains a pause; other groups show the queue's own reason.
      if (state.phase === 'paused' && !workflowView && !status)
        setStatus('已暂停' + (state.message ? '：' + state.message : ''));
    }
    // The status line sits on top when the strip has tasks, else it fills the second row.
    if (tasks.children.length) {
      if (status) head.append(status);
      info.append(tasks);
    } else if (status) info.append(status);
    if (active) {
      const stop = button(
        state.stopping ? '正在停止后续' : '停止后续',
        () => options.queue.stop(groupId),
        'group-queue-stop'
      );
      stop.disabled = state.stopping;
      stop.title = '不取消当前已提交的远端任务';
      head.append(stop);
    }
    scrollSideways(head);
    if (head.children.length) root.append(head);
    if (info.children.length) root.append(info);
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
        const label = totalDuration(id);
        if (time && label) time.textContent = label;
      }
    },
  };
}
