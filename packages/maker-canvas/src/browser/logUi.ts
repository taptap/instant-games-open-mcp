export type CanvasLogLevel = 'info' | 'warning' | 'error';
export interface CanvasLogEntry {
  message: string;
  level: CanvasLogLevel;
  time: string;
}

export function canvasLogLevel(message: string): CanvasLogLevel {
  if (/execution.state.{0,8}unknown|execution state is unknown|结果未知|结果待确认/i.test(message))
    return 'warning';
  if (/\berror\b|\bfatal\b|失败|错误|异常/i.test(message)) return 'error';
  if (/\bwarn(?:ing)?\b|警告|注意|请先|尚未|已停止|不能|无法/i.test(message)) return 'warning';
  return 'info';
}

export function createCanvasLog(
  root: HTMLElement,
  actions: HTMLElement[] = [],
  storage: {
    read?(canvasId: string): CanvasLogEntry[];
    write?(canvasId: string, entries: CanvasLogEntry[]): void;
  } = {}
) {
  type Entry = CanvasLogEntry;
  let entries: Entry[] = [];
  const histories = new Map<string, Entry[]>();
  const enabled = new Set<CanvasLogLevel>(['error', 'warning', 'info']);
  const labels = { error: '错误', warning: '警告', info: '普通' };
  let context: string | undefined;
  const details = document.createElement('details');
  details.className = 'canvas-log';
  const summary = document.createElement('summary');
  summary.textContent = '运行日志';
  const preview = document.createElement('div');
  preview.className = 'canvas-log-preview';
  preview.setAttribute('aria-live', 'polite');
  const filters = document.createElement('div');
  filters.className = 'canvas-log-filters';
  const list = document.createElement('div');
  list.className = 'canvas-log-list';
  list.setAttribute('role', 'log');
  list.setAttribute('aria-label', '画布运行日志');
  for (const level of ['error', 'warning', 'info'] as const) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) enabled.add(level);
      else enabled.delete(level);
      render();
    });
    label.append(checkbox, labels[level]);
    filters.append(label);
  }
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = '清空记录';
  clear.addEventListener('click', () => {
    entries.length = 0;
    if (context) persist(context, entries);
    render();
  });
  const actionGroup = document.createElement('div');
  actionGroup.className = 'canvas-log-actions';
  actionGroup.append(...actions, clear);
  filters.append(actionGroup);
  details.append(summary, filters, list);
  root.replaceChildren(details, preview);
  details.addEventListener('toggle', () => {
    preview.hidden = details.open;
    summary.textContent =
      '运行日志 · ' + entries.length + (details.open ? ' · 点击收起' : ' · 点击展开');
    if (details.open) list.scrollTop = list.scrollHeight;
  });
  function row(entry: Entry, compact: boolean): HTMLElement {
    const element = document.createElement('div');
    element.className = 'canvas-log-row canvas-log-' + entry.level;
    const unknown =
      /execution.state.{0,8}unknown|execution state is unknown|结果未知|结果待确认/i.test(
        entry.message
      );
    const message =
      compact && unknown ? '执行结果尚未确认，请核查原任务，不要重复生成。' : entry.message;
    element.textContent =
      new Date(entry.time).toLocaleString('zh-CN', { hour12: false }) +
      ' [' +
      labels[entry.level] +
      '] ' +
      message;
    return element;
  }
  function render() {
    const follow = list.scrollHeight - list.scrollTop - list.clientHeight < 32;
    const scrollTop = list.scrollTop;
    const visible = entries.filter((entry) => enabled.has(entry.level));
    summary.textContent =
      '运行日志 · ' + entries.length + (details.open ? ' · 点击收起' : ' · 点击展开');
    list.replaceChildren(...visible.map((entry) => row(entry, false)));
    preview.replaceChildren(...visible.slice(-1).map((entry) => row(entry, true)));
    if (!visible.length) {
      list.textContent = preview.textContent = entries.length
        ? '当前筛选无匹配日志'
        : '暂无运行日志';
    }
    list.scrollTop = follow ? list.scrollHeight : scrollTop;
  }
  render();
  function history(id: string): Entry[] {
    const cached = histories.get(id);
    if (cached) return cached;
    let saved: Entry[] = [];
    try {
      const raw = storage.read?.(id);
      if (Array.isArray(raw))
        saved = raw
          .filter(
            (entry) =>
              entry &&
              typeof entry.message === 'string' &&
              typeof entry.time === 'string' &&
              Number.isFinite(Date.parse(entry.time)) &&
              ['info', 'warning', 'error'].includes(entry.level)
          )
          .slice(-200)
          .map((entry) => ({ ...entry, message: entry.message.slice(0, 8000) }));
    } catch {
      /* Optional local history never blocks editing. */
    }
    histories.set(id, saved);
    return saved;
  }
  function persist(id: string, value: Entry[]) {
    try {
      storage.write?.(id, value);
    } catch {
      /* Storage may be full or disabled. */
    }
  }
  return {
    setContext(id: string) {
      if (context === id) return;
      context = id;
      entries = history(id);
      render();
    },
    add(message: string, level = canvasLogLevel(message), canvasId = context) {
      if (!message.trim()) return;
      const target = canvasId ? history(canvasId) : entries;
      const previous = target[target.length - 1];
      const bounded =
        message.length > 8000 ? message.slice(0, 8000) + '\n…日志过长，已截断' : message;
      if (previous?.message === bounded && previous.level === level) return;
      target.push({
        message: bounded,
        level,
        time: new Date().toISOString(),
      });
      if (target.length > 200) target.shift();
      if (canvasId) persist(canvasId, target);
      if (!canvasId || canvasId === context) render();
    },
  };
}

export const CANVAS_LOG_STYLES = [
  '#canvas-log { flex:none; padding:4px 12px 6px; border-bottom:1px solid #30343d; background:#13161c; color:#c7ccd6; font-size:12px; }',
  '.canvas-log summary { cursor:pointer; padding:3px 0; color:#aeb8cb; }',
  '.canvas-log-preview { max-height:40px; line-height:20px; overflow:hidden; } .canvas-log-preview .canvas-log-row { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0; }',
  '.canvas-log-list { max-height:min(240px,32vh); min-height:40px; overflow:auto; overscroll-behavior:contain; line-height:1.6; }',
  '.canvas-log-row { padding:3px 0; white-space:pre-wrap; overflow-wrap:anywhere; font-family:ui-monospace,monospace; }',
  '.canvas-log-error { color:#f29c97; } .canvas-log-warning { color:#e5bd78; } .canvas-log-info { color:#d0d6df; }',
  '.canvas-log-filters { display:flex; align-items:center; flex-wrap:wrap; gap:14px; padding:5px 0; } .canvas-log-filters label { display:flex; align-items:center; gap:4px; } .canvas-log-actions { display:flex; align-items:center; gap:10px; margin-left:auto; } .canvas-log-filters button { background:transparent; color:inherit; border:1px solid #454d5d; border-radius:5px; cursor:pointer; }',
].join('\n');
