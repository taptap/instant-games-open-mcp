import type { CanvasDocumentStore } from './store.js';
import { videoTaskTiming } from './videoTaskTiming.js';

export function createVideoHistoryUi(options: {
  store: CanvasDocumentStore;
  recover(attempt: any): Promise<boolean>;
  onBusyChange?(): void;
}) {
  let dialog: HTMLDialogElement | undefined;
  let querying = false;
  async function open() {
    if (dialog) return;
    const root = document.createElement('dialog');
    dialog = root;
    root.className = 'sequence-editor video-history';
    root.setAttribute('aria-label', '视频历史');
    const title = document.createElement('h2');
    title.textContent = '视频历史';
    const hint = document.createElement('p');
    hint.textContent =
      '提交满 10 分钟后允许生成新视频，不取消旧任务；原 taskId 在提交后 6 小时内可查询。查询不重新付费生成，运行中至少间隔 2 分钟。这是本地期限，不代表远端任务的有效期。';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const list = document.createElement('div');
    list.style.cssText = 'overflow:auto;max-height:60vh;display:grid;gap:12px';
    const footer = document.createElement('footer');
    let offset = 0;
    let total = 0;
    let loading = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    function button(parent: HTMLElement, label: string, action: () => void) {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.addEventListener('click', action);
      parent.append(element);
      return element;
    }
    function controls() {
      previous.disabled = loading || querying || offset === 0;
      next.disabled = loading || querying || offset + 30 >= total;
      refresh.disabled = loading || querying;
      close.disabled = querying;
      for (const item of Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-query]')))
        item.disabled =
          loading ||
          querying ||
          videoTaskTiming({ createdAt: item.dataset.createdAt! }).queryExpired;
    }
    async function load() {
      if (!options.store.videoHistory || loading || querying) return;
      loading = true;
      status.textContent = '正在读取…';
      controls();
      try {
        const page = await options.store.videoHistory(offset, 30);
        if (!root.isConnected) return;
        clearTimeout(refreshTimer);
        const deadlines = [...page.items, ...(page.busy ? [page.busy] : [])]
          .flatMap((attempt) => {
            const timing = videoTaskTiming(attempt);
            return [timing.waitUntil, timing.queryUntil];
          })
          .filter((value): value is number => value !== undefined && value > Date.now());
        if (deadlines.length)
          refreshTimer = setTimeout(
            () => void load(),
            Math.max(1, Math.min(...deadlines) - Date.now())
          );
        total = page.total;
        list.replaceChildren();
        status.textContent = page.busy
          ? (page.busy.projectLabel || '') +
            '：' +
            (page.busy.reason || '有视频尚未取得结果，请查询原任务。')
          : '共 ' + total + ' 条；当前没有占用中的视频任务。';
        if (!total) list.textContent = '还没有视频生成记录。';
        for (const attempt of page.items) {
          const timing = videoTaskTiming(attempt);
          const row = document.createElement('article');
          row.style.cssText =
            'padding:12px;border:1px solid #515866;border-radius:8px;overflow-wrap:anywhere';
          const heading = document.createElement('strong');
          const state = attempt.resultAssetPath
            ? '已取回本地'
            : timing.queryExpired
              ? '已超过查询期限 · 未取回视频'
              : attempt.remoteStatus === 'failed'
                ? '上游已明确失败'
                : attempt.executionState === 'not_executed' && !attempt.taskId
                  ? '未提交至上游'
                  : timing.waitExpired
                    ? '等待超时 · 未取回视频 · 已解除本地占用'
                    : attempt.taskId
                      ? '未取回视频 · 可查询原任务'
                      : '无 taskId · 请核实执行结果';
          heading.textContent = new Date(attempt.createdAt).toLocaleString() + ' · ' + state;
          const info = document.createElement('p');
          info.textContent =
            '画布 ' + attempt.canvasId + ' · 卡片 ' + (attempt.targetNodeId || '未记录');
          const task = document.createElement('p');
          task.textContent = 'taskId：' + (attempt.taskId || '未返回');
          row.append(heading, info, task);
          if (attempt.error) {
            const error = document.createElement('p');
            error.textContent = attempt.error;
            row.append(error);
          }
          if (attempt.taskId) {
            button(row, '复制 taskId', () => {
              void navigator.clipboard.writeText(attempt.taskId!).catch(() => {
                status.textContent = '复制失败，请选中 taskId 手动复制。';
              });
            });
            const query = button(row, timing.queryExpired ? '已超过查询期限' : '查询并取回', () => {
              if (querying) return;
              if (videoTaskTiming(attempt).queryExpired) {
                query.textContent = '已超过查询期限';
                controls();
                status.textContent = '已超过提交后 6 小时的查询期限；历史记录和本地结果仍保留。';
                return;
              }
              querying = true;
              options.onBusyChange?.();
              controls();
              status.textContent = '正在查询原任务，不会重新提交生成…';
              void options.store
                .generationAction(attempt.canvasId, attempt.id, 'query')
                .then(async (result) => {
                  const applied = await options.recover(result);
                  await finish();
                  status.textContent = result.resultAssetPath
                    ? applied
                      ? '视频已取回并更新原卡片。'
                      : '视频已保存本地；原卡片不在当前画布或已变更，未覆盖。'
                    : result.error || '尚未取回视频，可稍后再次查询。';
                })
                .catch(async (error) => {
                  await finish();
                  status.textContent = String(error);
                });
              async function finish() {
                querying = false;
                options.onBusyChange?.();
                await load();
                controls();
              }
            });
            query.dataset.query = 'true';
            query.dataset.createdAt = attempt.createdAt;
          }
          if (attempt.resultAssetPath) {
            const download = document.createElement('a');
            download.href = options.store.mediaUrl(attempt.resultAssetPath);
            download.download = 'video-' + attempt.id + '.mp4';
            download.textContent = '下载本地视频';
            row.append(download);
          }
          list.append(row);
        }
      } catch (error) {
        status.textContent = String(error);
      } finally {
        loading = false;
        controls();
      }
    }
    const previous = button(footer, '上一页', () => {
      offset = Math.max(0, offset - 30);
      void load();
    });
    const next = button(footer, '下一页', () => {
      offset += 30;
      void load();
    });
    const refresh = button(footer, '刷新', () => void load());
    function dismiss() {
      if (querying) return;
      clearTimeout(refreshTimer);
      root.close();
      root.remove();
      dialog = undefined;
    }
    const close = button(footer, '关闭', dismiss);
    root.addEventListener('cancel', (event) => {
      event.preventDefault();
      dismiss();
    });
    root.addEventListener('keydown', (event) => event.stopPropagation());
    root.append(title, hint, status, list, footer);
    document.body.append(root);
    root.showModal();
    await load();
  }
  return {
    open,
    get isBusy() {
      return querying;
    },
  };
}
