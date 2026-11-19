import type { CanvasExportDelivery, CanvasExportResult } from './exportDelivery.js';
import { refreshCanvasMedia } from './mediaVersions.js';
import { canvasCapabilityReason } from './capabilities.js';
import type { CanvasDocument, CanvasNode } from '../contracts.js';
import type { CanvasDocumentStore } from '../browser/store.js';
import {
  canvasModelInput,
  canvasModelIsCurrent,
  type CanvasModelAttempt,
} from '../features/model3d.js';

export function createCanvasModelUiWithHost(options: {
  thumbnailUrl(base: string, attemptId: string): string;
  showDownload?: boolean;
  autoPoll?: boolean;
  confirm?(message: string): Promise<boolean>;
  createModel?(viewsId: string): string;
  openImages?(images: string[], index: number): void;
  previewOrigin(url: string): string;
  deliver: CanvasExportDelivery;
  current(): CanvasDocument | null;
  store: CanvasDocumentStore;
  save(): Promise<boolean>;
  render(): void;
  error(message: string): void;
  blocked(): boolean;
  sourceBlocked(id: string): boolean;
  remember(): void;
  changed(): void;
}) {
  let canvasId = '';
  let attempts: CanvasModelAttempt[] = [];
  let waiting = false;
  let activeAction: 'start' | 'query' | 'confirm' | undefined;
  let activeMenu: { element: HTMLElement; nodeId: string } | undefined;
  let loading = false;
  let controller: AbortController | undefined;
  let readVersion = 0;
  let activeViewsId: string | undefined;
  let activeNodeId: string | undefined;
  const stoppedViews = new Set<string>();
  let activeSourceId: string | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let pollController: AbortController | undefined;
  let pollingPaused = false;
  const contents = new Map<
    string,
    { key: string; node: CanvasNode; body: HTMLElement; state: string }
  >();
  function pendingAttempt(value: CanvasModelAttempt, current: CanvasDocument) {
    return (
      !stoppedViews.has(value.nodeId) &&
      current.nodes.some((node) => node.id === value.nodeId) &&
      ['pending', 'running'].includes(value.status) &&
      (value.assetId || value.taskId)
    );
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!options.autoPoll || pollingPaused) return;
    if (
      waiting ||
      pollController ||
      !attempts.some((value) => {
        const current = options.current();
        return current && pendingAttempt(value, current);
      })
    )
      return;
    pollTimer = setTimeout(() => {
      void poll();
    }, 5000);
  }
  async function poll() {
    const current = options.current();
    if (!current || waiting || !options.store.modelAction) {
      schedulePoll();
      return;
    }
    const pending = attempts.filter((value) => pendingAttempt(value, current));
    const abort = new AbortController();
    pollController = abort;
    try {
      for (const value of pending) {
        if (abort.signal.aborted || options.current()?.id !== current.id) break;
        if (!pendingAttempt(value, current)) continue;
        const result = await options.store.modelAction(
          current.id,
          { nodeId: value.nodeId, action: 'query' },
          abort.signal
        );
        if (
          !abort.signal.aborted &&
          options.current()?.id === current.id &&
          !stoppedViews.has(value.nodeId)
        ) {
          attempts = [result, ...attempts.filter((item) => item.nodeId !== result.nodeId)];
          options.render();
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        pollingPaused = true;
        options.error((error as Error).message);
      }
    } finally {
      if (pollController === abort) {
        pollController = undefined;
        schedulePoll();
      }
    }
  }
  window.addEventListener(
    'pagehide',
    () => {
      clearTimeout(pollTimer);
      pollController?.abort();
    },
    { once: true }
  );
  const thumbnails = new Map<
    string,
    {
      image?: string;
      error?: string;
      targets: Set<HTMLButtonElement>;
    }
  >();
  let thumbnailJob: { frame: HTMLIFrameElement; finish(): void } | undefined;
  function clearThumbnails() {
    thumbnails.clear();
    thumbnailJob?.finish();
  }
  function paintThumbnail(target: HTMLButtonElement, value: { image?: string; error?: string }) {
    target.replaceChildren();
    target.dataset.state = value.image ? 'ready' : value.error ? 'error' : 'loading';
    if (value.image) {
      const image = document.createElement('img');
      image.src = value.image;
      image.alt = '真实模型 · 固定视角预览';
      target.append(image);
    }
    const hint = document.createElement('span');
    hint.textContent = value.image
      ? '点击旋转预览'
      : value.error
        ? '预览暂不可用 · 点击查看详情'
        : '正在渲染模型…';
    target.title = value.error || '打开模型旋转预览';
    target.append(hint);
  }
  function pumpThumbnails() {
    if (thumbnailJob) return;
    for (const [url, entry] of thumbnails) {
      entry.targets = new Set([...entry.targets].filter((target) => target.isConnected));
      if (entry.image || entry.error || !entry.targets.size) continue;
      const frame = document.createElement('iframe');
      frame.className = 'model-thumbnail-worker';
      frame.title = '模型缩略图渲染';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      const finish = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', receive);
        frame.remove();
        thumbnailJob = undefined;
        for (const target of entry.targets) {
          if (target.isConnected) paintThumbnail(target, entry);
        }
        entry.targets.clear();
        while (thumbnails.size > 24) {
          const completed = [...thumbnails].find(([, value]) => value.image || value.error);
          if (!completed) break;
          thumbnails.delete(completed[0]);
        }
        requestAnimationFrame(pumpThumbnails);
      };
      const receive = (event: MessageEvent) => {
        if (
          event.origin !== options.previewOrigin(url) ||
          event.source !== frame.contentWindow ||
          event.data?.type !== 'maker:model-thumbnail'
        )
          return;
        const { image, error } = event.data;
        if (
          typeof image === 'string' &&
          image.startsWith('data:image/png;base64,') &&
          image.length < 8 * 1024 * 1024
        )
          entry.image = image;
        else entry.error = typeof error === 'string' ? error : '模型缩略图无效。';
        finish();
      };
      const timeout = setTimeout(() => {
        entry.error = '模型预览加载超时，可在菜单中重试预览；不会重新生成模型。';
        finish();
      }, 65000);
      thumbnailJob = { frame, finish };
      window.addEventListener('message', receive);
      frame.src = url;
      document.body.append(frame);
      return;
    }
  }
  function thumbnailUrl(id: string, value: CanvasModelAttempt) {
    const current = options.current();
    if (!current || !options.store.modelPreviewUrl) return;
    return options.thumbnailUrl(options.store.modelPreviewUrl(current.id, id), value.id);
  }
  function showThumbnail(parent: HTMLElement, id: string, value: CanvasModelAttempt) {
    const target = button(
      parent,
      '',
      () => { preview(id); },
      false,
      options.store.platform === 'web'
    );
    target.className = 'model-thumbnail';
    target.setAttribute('aria-label', '查看模型 · 旋转预览');
    const url = thumbnailUrl(id, value);
    if (!url) {
      paintThumbnail(target, { error: '模型预览尚未就绪。' });
      return;
    }
    if (!thumbnails.has(url)) thumbnails.set(url, { targets: new Set() });
    const entry = thumbnails.get(url)!;
    entry.targets = new Set([...entry.targets].filter((item) => item.isConnected));
    entry.targets.add(target);
    paintThumbnail(target, entry);
    requestAnimationFrame(pumpThumbnails);
  }
  function preview(id: string) {
    const current = options.current();
    if (!current || !options.store.modelPreviewUrl) throw new Error('模型预览尚未就绪。');
    if (canvasModelInput(current, id).target.type !== 'model' || !state(id)?.modelPath)
      throw new Error('模型尚未交付，不能预览。');
    const dialog = document.createElement('dialog');
    dialog.className = 'model-preview-dialog';
    dialog.setAttribute('aria-label', '3D 模型旋转预览');
    const frame = document.createElement('iframe');
    frame.title = '3D 模型旋转预览';
    const url = new URL(options.store.modelPreviewUrl(current.id, id), location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    hash.set('close', '1');
    url.hash = hash.toString();
    frame.src = url.href;
    const receive = (event: MessageEvent) => {
      if (
        event.source === frame.contentWindow &&
        event.origin === options.previewOrigin(frame.src) &&
        event.data?.type === 'maker:model-close'
      )
        dialog.close();
    };
    window.addEventListener('message', receive);
    dialog.append(frame);
    const release = () => {
      window.removeEventListener('message', receive);
      frame.remove();
      dialog.remove();
    };
    dialog.addEventListener('close', release, { once: true });
    dialog.addEventListener('pointerdown', (event) => event.stopPropagation());
    dialog.addEventListener('wheel', (event) => event.stopPropagation());
    document.body.append(dialog);
    dialog.showModal();
    return { opened: true, url: frame.src };
  }
  function canStop(id: string) {
    if (waiting && activeAction !== 'query' && activeNodeId === id) return true;
    const current = options.current();
    const node = current?.nodes.find((item) => item.id === id);
    const value = state(id);
    return Boolean(
      options.autoPoll &&
        value &&
        !stoppedViews.has(value.nodeId) &&
        ['pending', 'running'].includes(value.status) &&
        node?.type === (value.phase === 'views' ? 'model-views' : 'model')
    );
  }
  function stop(id: string) {
    if (!canStop(id)) return;
    const current = options.current();
    if (!current) return;
    const { views } = canvasModelInput(current, id);
    stoppedViews.add(views.id);
    if (activeNodeId === id) controller?.abort();
    else {
      schedulePoll();
      options.render();
    }
  }
  function protects(id: string) {
    if (!waiting) return false;
    if (id === activeSourceId) return true;
    const current = options.current();
    if (!current) return false;
    try {
      return canvasModelInput(current, id).views.id === activeViewsId;
    } catch {
      return false;
    }
  }
  async function refresh() {
    const current = options.current();
    if (!current || !options.store.listModels) return;
    const id = current.id;
    pollingPaused = false;
    const version = ++readVersion;
    loading = true;
    try {
      const result = await options.store.listModels(id);
      if (options.current()?.id === id && version === readVersion) attempts = result;
    } finally {
      if (version === readVersion) loading = false;
      schedulePoll();
      options.render();
    }
  }
  function sync() {
    const current = options.current();
    if (!current || canvasId === current.id) return;
    canvasId = current.id;
    clearTimeout(pollTimer);
    pollController?.abort();
    pollController = undefined;
    contents.clear();
    clearThumbnails();
    readVersion++;
    attempts = [];
    if (current.nodes.some((node) => node.type === 'model-views'))
      void refresh().catch((error) => options.error(error.message));
  }
  function state(id: string) {
    const current = options.current();
    if (!current) return;
    try {
      const { views } = canvasModelInput(current, id);
      const attempt = attempts.find((item) => item.nodeId === views.id);
      return attempt ? { ...attempt, stale: !canvasModelIsCurrent(current, attempt) } : undefined;
    } catch {
      return undefined;
    }
  }
  async function execute(id: string, action: 'start' | 'query' | 'confirm', reviewId?: string) {
    const unavailable = action !== 'query' && canvasCapabilityReason(options.store, 'model');
    if (unavailable) throw new Error(unavailable);
    if (waiting || options.blocked()) throw new Error('请先完成当前画布操作。');
    const current = options.current();
    if (!current || !options.store.modelAction) throw new Error('模型功能尚未就绪。');
    const input = canvasModelInput(current, id);
    if (action !== 'query' && options.sourceBlocked(input.character.id))
      throw new Error('角色图片仍有未确认任务或编辑草稿，请先处理。');
    waiting = true;
    activeAction = action;
    pollingPaused = false;
    clearTimeout(pollTimer);
    pollController?.abort();
    pollController = undefined;
    activeViewsId = input.views.id;
    activeNodeId = id;
    activeSourceId = input.character.id;
    readVersion++;
    loading = false;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 5 * 60 * 1000);
    options.render();
    try {
      if (action !== 'query' && options.store.mediaVersions) {
        if (await refreshCanvasMedia(current, options.store, [input.character], action === 'start'))
          options.changed();
        if (options.current() !== current) throw new Error('画布已切换，未提交模型请求。');
      }
      if (controller.signal.aborted) throw new Error('已停止等待。');
      let targetId = id;
      if (action === 'confirm') {
        const review = state(id);
        if (
          review?.status !== 'review' ||
          review.stale ||
          !reviewId ||
          review.reviewId !== reviewId ||
          !review.previews.length
        )
          throw new Error('请先查询当前预览，并确认全部视图。');
        const signal = controller.signal;
        await Promise.all(
          review.previews.map(
            (preview) =>
              new Promise<void>((resolve, reject) => {
                const image = new Image();
                const finish = (error?: string) => {
                  clearTimeout(timer);
                  image.onload = null;
                  image.onerror = null;
                  signal.removeEventListener('abort', abort);
                  if (error) reject(new Error(error));
                  else resolve();
                };
                const abort = () => finish('已停止检查预览。');
                const timer = setTimeout(
                  () => finish('预览图片加载超时，请查询原任务恢复后再确认。'),
                  15000
                );
                image.onload = () => finish(image.naturalWidth ? undefined : '预览图片无效。');
                image.onerror = () => finish('预览图片无法显示，请查询原任务恢复，不能跳过确认。');
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) abort();
                else image.src = options.store.mediaUrl(preview.path);
              })
          )
        );
        if (options.current() !== current || state(id)?.reviewId !== reviewId)
          throw new Error('多视图已变化，请重新确认。');
        if (input.target.type === 'model-views' && options.createModel) {
          targetId = options.createModel(input.views.id);
          activeNodeId = targetId;
          options.render();
        }
      }
      if (controller.signal.aborted) throw new Error('已停止等待。');
      if (!(await options.save())) throw new Error('画布未保存，不提交模型请求。');
      if (options.current() !== current) throw new Error('画布已切换，请重新查询状态。');
      if (controller.signal.aborted) throw new Error('已停止等待。');
      const result = await options.store.modelAction(
        current.id,
        {
          nodeId: targetId,
          action,
          revision: current.revision,
          ...(reviewId ? { reviewId } : {}),
        },
        controller.signal
      );
      if (options.current()?.id === current.id) {
        readVersion++;
        loading = false;
        stoppedViews.delete(input.views.id);
        attempts = [result, ...attempts.filter((item) => item.nodeId !== result.nodeId)];
      }
      if (result.error) throw new Error(result.error);
      return result;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error('已停止本地等待，远端任务未取消。请刷新状态或查询原任务，不要重新生成。');
      throw error;
    } finally {
      clearTimeout(timeout);
      waiting = false;
      activeAction = undefined;
      activeViewsId = undefined;
      activeNodeId = undefined;
      activeSourceId = undefined;
      controller = undefined;
      schedulePoll();
      options.render();
    }
  }
  function button(
    parent: HTMLElement,
    label: string,
    action: () => void | Promise<unknown>,
    disabled = false,
    allowCardDrag = false
  ) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.disabled = disabled;
    if (!allowCardDrag)
      element.addEventListener('pointerdown', (event) => event.stopPropagation());
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      void Promise.resolve()
        .then(action)
        .catch((error) => options.error(error.message));
    });
    parent.append(element);
    return element;
  }
  function contextMenu(menu: HTMLElement, card?: HTMLElement | null) {
    activeMenu = undefined;
    menu.querySelectorAll('[data-menu-scope="model"]').forEach((item) => item.remove());
    if (!card || !['model', 'model-views'].some((type) => card.classList.contains(type))) return;
    activeMenu = { element: menu, nodeId: card.dataset.id || '' };
    const entries = document.createDocumentFragment();
    menu.querySelector('[data-resource-export]')?.remove();
    const body = contents.get(card.dataset.id || '')?.body || card;
    body.querySelectorAll<HTMLButtonElement>('.model-menu-actions > button').forEach((source) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = source.textContent;
      item.disabled = source.disabled || waiting;
      item.dataset.menuScope = 'model';
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.hidden = true;
        source.click();
      });
      entries.append(item);
    });
    const separator = document.createElement('div');
    separator.className = 'canvas-menu-separator';
    separator.setAttribute('role', 'separator');
    separator.dataset.menuScope = 'model';
    entries.append(separator);
    menu.prepend(entries);
  }
  function refreshContextMenu(card: HTMLElement) {
    if (activeMenu && !activeMenu.element.hidden && activeMenu.nodeId === card.dataset.id)
      contextMenu(activeMenu.element, card);
  }
  async function download(
    id: string,
    sink?: (blob: Blob, filename: string) => Promise<void>
  ): Promise<CanvasExportResult> {
    const current = options.current();
    const value = state(id);
    if (
      !current ||
      !value ||
      value.status !== 'completed' ||
      value.stale ||
      !options.store.exportModel
    )
      throw new Error('模型结果尚未就绪。');
    const filename = 'mdl' + Date.now().toString(36).slice(-8) + '.zip';
    const produce = async () => {
      const { character } = canvasModelInput(current, id);
      if (await refreshCanvasMedia(current, options.store, [character])) {
        options.changed();
        options.render();
      }
      if (options.current() !== current || state(id)?.stale || state(id)?.id !== value.id)
        throw new Error('模型来源或结果已变化，请重新核对。');
      return options.store.exportModel!(current.id, id);
    };
    if (sink) {
      await sink(await produce(), filename);
      return { status: 'saved' };
    }
    return options.deliver({ filename, mime: 'application/zip', produce });
  }
  function render(card: HTMLElement, node: CanvasNode) {
    if (!['model', 'model-views'].includes(node.type)) return;
    const current = options.current();
    if (!current) return;
    const value = state(node.id);
    let viewsId = node.id;
    try {
      viewsId = canvasModelInput(current, node.id).views.id;
    } catch {
      // A disconnected card can render its empty state without an upstream.
    }
    const stopped =
      stoppedViews.has(viewsId) && (!value || ['running', 'pending', 'unknown'].includes(value.status));
    const stoppedHere = stopped && node.type === (value?.phase === 'model' ? 'model' : 'model-views');
    const active = waiting && activeAction !== 'query' && activeNodeId === node.id;
    const key = JSON.stringify([
      current.id,
      value && { ...value, updatedAt: undefined },
      canStop(node.id),
      active,
      stoppedHere,
      waiting,
      loading,
      node.modelQuality,
      node.assetPath,
    ]);
    const cached = contents.get(node.id);
    if (cached?.key === key && cached.node === node) {
      card.dataset.state = cached.state;
      card.append(cached.body);
      refreshContextMenu(card);
      return;
    }
    for (const id of contents.keys())
      if (!current.nodes.some((item) => item.id === id)) contents.delete(id);
    const body = document.createElement('div');
    body.className = 'model-content';
    body.addEventListener(
      'wheel',
      (event) => {
        if (body.scrollHeight > body.clientHeight) event.stopPropagation();
      },
      { passive: true }
    );
    const label = document.createElement('p');
    const labels = {
      running: '请求执行中',
      pending:
        (value?.phase === 'views' ? '多视图生成中' : '模型生成中') +
        (options.autoPoll ? ' · 自动更新进度' : ' · 可查询进度'),
      review: '请检查全部视图',
      completed: '模型已保存到项目',
      failed: '生成失败',
      unknown: '结果待确认 · 请查询原任务',
    };
    const viewsReady =
      node.type === 'model-views' &&
      Boolean(value?.previews.length) &&
      (value?.phase === 'model' || value?.status === 'review');
    label.textContent = stoppedHere
      ? '已停止等待 · 可查询原任务'
      : value?.stale
      ? '角色或质量已变化 · 旧结果保留'
      : viewsReady
        ? value?.status === 'review'
          ? '请检查全部视图'
          : '多视图已完成'
        : node.type === 'model' && value?.phase === 'views'
          ? '等待多视图确认'
          : value
            ? labels[value.status]
            : node.type === 'model'
              ? '等待多视图确认'
              : '先完成角色图，再生成多视图';
    const toolbar = document.createElement('div');
    toolbar.className = 'model-toolbar';
    label.className = 'model-status';
    toolbar.append(label);
    const menu = document.createElement('details');
    menu.className = 'model-menu';
    const summary = document.createElement('summary');
    summary.textContent = '⋯';
    summary.setAttribute('aria-label', '模型选项');
    summary.title = '模型选项';
    const actions = document.createElement('div');
    actions.className = 'model-menu-actions';
    menu.append(summary, actions);
    menu.addEventListener('pointerdown', (event) => event.stopPropagation());
    menu.addEventListener('click', (event) => event.stopPropagation());
    menu.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
    toolbar.append(menu);
    body.append(toolbar);
    const unavailable = canvasCapabilityReason(options.store, 'model');
    if (unavailable) {
      const hint = document.createElement('p');
      hint.textContent = unavailable;
      body.append(hint);
    }
    const footer = document.createElement('div');
    footer.className = 'model-footer';
    card.dataset.state =
      !stoppedHere &&
      (active ||
        (!viewsReady &&
          node.type === (value?.phase === 'model' ? 'model' : 'model-views') &&
          value &&
          ['pending', 'running'].includes(value.status)))
        ? 'loading'
        : value?.stale
          ? 'waiting'
          : viewsReady ||
              value?.status === 'completed' ||
              (node.type === 'model-views' && value?.status === 'review')
            ? 'ready'
            : value?.status === 'failed'
              ? 'failed'
              : value?.status === 'unknown'
                ? 'unknown'
                : 'waiting';
    if (node.type === 'model-views') {
      const select = document.createElement('select');
      select.setAttribute('aria-label', '模型质量');
      for (const [quality, text] of [
        ['fast', '草稿'],
        ['balanced', '均衡（默认）'],
        ['high_quality', '高质量'],
      ]) {
        const option = document.createElement('option');
        option.value = quality;
        option.textContent = text;
        select.append(option);
      }
      select.value = node.modelQuality || 'balanced';
      select.disabled =
        waiting ||
        loading ||
        Boolean(value && ['running', 'pending', 'unknown'].includes(value.status));
      select.addEventListener('pointerdown', (event) => event.stopPropagation());
      select.addEventListener('change', () => {
        options.remember();
        node.modelQuality = select.value as CanvasNode['modelQuality'];
        options.changed();
        void options
          .save()
          .then(() => options.render())
          .catch((error) => options.error(error.message));
      });
      select.classList.add('model-quality');
      actions.append(select);
      const gallery = document.createElement('div');
      gallery.className = 'model-views-gallery';
      for (const preview of value?.previews || []) {
        const tile = document.createElement('figure');
        tile.className = 'model-view-tile';
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'model-view';
        link.addEventListener('click', (event) => {
          event.stopPropagation();
          if (options.openImages)
            options.openImages(
              (value?.previews || []).map((item) => options.store.mediaUrl(item.path)),
              (value?.previews || []).indexOf(preview)
            );
          else window.open(options.store.mediaUrl(preview.path), '_blank', 'noopener');
        });
        link.addEventListener('pointerdown', (event) => event.stopPropagation());
        const image = document.createElement('img');
        image.src = options.store.mediaUrl(preview.path);
        image.alt = '';
        const caption = document.createElement('figcaption');
        caption.textContent =
          ({ front: '正面', left: '左侧', back: '背面', right: '右侧' } as Record<string, string>)[
            preview.view
          ] || preview.view;
        link.setAttribute('aria-label', '查看' + caption.textContent + '视图');
        const loading = document.createElement('small');
        loading.textContent = '正在加载视图…';
        const timer = setTimeout(() => {
          loading.textContent = '加载超时，请查询原任务或重新打开';
        }, 15000);
        image.addEventListener('load', () => {
          clearTimeout(timer);
          loading.remove();
        });
        image.addEventListener('error', () => {
          clearTimeout(timer);
          loading.textContent = '视图加载失败，请查询原任务';
        });
        link.append(image, loading);
        tile.append(link, caption);
        gallery.append(tile);
      }
      body.append(gallery);
      if (!value && node.assetPath) {
        const example = document.createElement('a');
        example.style.gridArea = '1 / 1 / -1 / -1';
        example.href = options.store.mediaUrl(node.assetPath);
        example.target = '_blank';
        example.rel = 'noopener';
        const image = document.createElement('img');
        image.src = example.href;
        image.alt = '模板多视图示例';
        const caption = document.createElement('small');
        caption.textContent = '模板示例 · 生成后替换，仍需确认多视图';
        example.append(image, caption);
        gallery.append(example);
      } else if (!value?.previews.length) {
        const placeholder = document.createElement('span');
        placeholder.className = 'model-empty';
        placeholder.textContent = '多视图预览';
        gallery.append(placeholder);
      }
      if (!stoppedHere && (!value || value.stale || value.retrySafe))
        button(
          footer,
          value?.retrySafe ? '重试生成多视图' : '生成多视图',
          async () => {
            if (
              !options.createModel &&
              !(await (options.confirm?.(
                '确认以当前角色图生成多视图？生成后需检查预览，不会自动生成模型。'
              ) ?? Promise.resolve(window.confirm('确认生成多视图？'))))
            )
              return;
            return execute(node.id, 'start');
          },
          Boolean(unavailable) || waiting || loading
        );
    } else if (value?.modelPath) {
      showThumbnail(body, node.id, value);
      const output = document.createElement('code');
      output.textContent = value.modelPath;
      output.className = 'model-output-path';
      output.hidden = true;
      actions.append(output);
      if (options.showDownload && options.store.exportModel)
        button(
          actions,
          '下载模型包',
          () => download(node.id),
          value.status !== 'completed' || value.stale || waiting || loading
        );
      button(actions, '复制模型路径', () => navigator.clipboard.writeText(value.modelPath!));
      button(actions, '重试预览', () => {
        const url = thumbnailUrl(node.id, value);
        if (url) {
          if (thumbnailJob?.frame.src === url) thumbnailJob.finish();
          thumbnails.delete(url);
        }
        options.render();
      });
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'model-empty';
      placeholder.textContent = '3D 模型预览';
      body.append(placeholder);
    }
    if (card.dataset.state === 'loading') {
      label.textContent = node.type === 'model-views' ? '正在生成多视图' : '正在生成模型';
      label.classList.add('model-status-loading');
      const empty = body.querySelector('.model-empty');
      if (empty) {
        empty.textContent = node.type === 'model-views' ? '正在生成多视图…' : '正在生成模型…';
        empty.classList.add('model-empty-loading');
      }
    }
    if (
      node.type === (options.createModel ? 'model-views' : 'model') &&
      value?.status === 'review' &&
      !value.stale
    )
      button(
        footer,
        options.createModel ? '确认并生成模型' : '确认视图并生成',
        async () => {
          if (
            !options.createModel &&
            !(await (options.confirm?.(
              '已检查多视图卡中的全部图片并确认外观一致？确认后生成模型。'
            ) ?? Promise.resolve(window.confirm('确认生成模型？'))))
          )
            return;
          return execute(node.id, 'confirm', value.reviewId);
        },
        Boolean(unavailable) || waiting || loading
      );
    if (value?.assetId || value?.taskId)
      button(
        stoppedHere ? footer : actions,
        stoppedHere ? '查询原任务' : '更新任务进度',
        () => execute(node.id, 'query'),
        waiting || loading
      );
    else if (stoppedHere) button(footer, '刷新本地状态', refresh, loading);
    button(actions, '刷新本地状态', refresh, loading);
    if (canStop(node.id)) {
      const control = button(footer, '停止等待', () => stop(node.id));
      control.dataset.modelStop = 'true';
      if (options.store.platform === 'web') control.hidden = true;
    }
    if (value?.error) {
      const error = document.createElement('p');
      error.textContent = value.error;
      error.className = 'model-error';
      body.append(error);
    }
    if (value) {
      const identity = document.createElement('small');
      identity.textContent = '任务 ' + (value.assetId || value.taskId || value.id);
      identity.hidden = true;
      actions.append(identity);
    }
    button(actions, '详情', () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'model-details-dialog';
      const heading = document.createElement('h2');
      heading.textContent = node.title + ' · 详情';
      const header = document.createElement('div');
      header.className = 'model-details-header';
      const close = button(header, '', () => dialog.close());
      close.className = 'model-details-close';
      close.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
      close.setAttribute('aria-label', '关闭详情');
      close.title = '关闭详情';
      header.prepend(heading);
      dialog.append(header);
      const fields = [
        ['状态', label.textContent || ''],
        ['任务 ID', value?.assetId || value?.taskId || value?.id || '尚未提交'],
        ['模型路径', value?.modelPath || '尚未生成'],
      ];
      for (const [name, text] of fields) {
        const field = document.createElement('p');
        const title = document.createElement('strong');
        title.textContent = name;
        const content = document.createElement('span');
        content.textContent = text;
        field.append(title, content);
        dialog.append(field);
      }
      const quality = actions.querySelector<HTMLSelectElement>('.model-quality');
      if (quality) {
        const field = document.createElement('label');
        field.textContent = '模型质量';
        const control = quality.cloneNode(true) as HTMLSelectElement;
        control.value = quality.value;
        control.addEventListener('change', () => {
          quality.value = control.value;
          quality.dispatchEvent(new Event('change'));
          dialog.close();
        });
        field.append(control);
        dialog.append(field);
      }
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      document.body.append(dialog);
      dialog.showModal();
    });
    body.append(footer);
    card.append(body);
    contents.set(node.id, { key, node, body, state: card.dataset.state || 'waiting' });
    refreshContextMenu(card);
  }
  return {
    contextMenu,
    preview,
    sync,
    canStop,
    protects,
    refresh,
    state,
    execute,
    render,
    download,
    stop,
    get isBusy() {
      return waiting;
    },
  };
}

export const CANVAS_MODEL_STYLES =
  '.model-details-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}.model-details-dialog .model-details-header h2{margin:0;min-width:0}.model-details-dialog .model-details-header button{flex:none;width:28px;height:28px;margin-left:12px;padding:0;border:0;background:transparent;font-size:24px;line-height:1}.model-views-gallery small{box-sizing:border-box;width:100%;text-align:center}' +
  '.model-details-dialog{box-sizing:border-box;width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:20px;border:1px solid var(--canvas-line);border-radius:12px;background:var(--canvas-panel);color:var(--canvas-text);font:inherit}.model-details-dialog::backdrop{background:#0006}.model-details-dialog h2{margin:0 0 20px;font-size:16px}.model-details-dialog p,.model-details-dialog label{display:flex;flex-direction:column;gap:6px;margin:0 0 16px;font-size:12px;overflow-wrap:anywhere}.model-details-dialog p strong{color:var(--canvas-muted);font-weight:500}.model-details-dialog button,.model-details-dialog select{padding:8px 12px;border:1px solid var(--canvas-line);border-radius:6px;background:var(--canvas-panel);color:inherit;font:inherit}.model-details-dialog>button{display:block;margin-left:auto}' +
  '.model-preview-dialog{box-sizing:border-box}' +
  '.model-preview-dialog{width:min(960px,94vw);height:min(760px,90vh);max-width:none;max-height:none;padding:12px;border:1px solid #536367;border-radius:12px;background:#182022;color:#e3e9e8}.model-preview-dialog[open]{display:flex;flex-direction:column;gap:10px}.model-preview-dialog::backdrop{background:#000a}.model-preview-dialog>button{align-self:flex-end;background:#293739;color:inherit;border:1px solid #536367;border-radius:6px;padding:7px 14px;cursor:pointer}.model-preview-dialog iframe{border:0;width:100%;flex:1;min-height:0;border-radius:8px}' +
  '.model-content{height:100%;min-height:0;overflow:hidden;position:relative;box-sizing:border-box;padding:10px;display:flex;flex-direction:column;gap:10px}.model-content p{margin:0}.model-content button,.model-content select{border:1px solid var(--canvas-border,#454955);border-radius:6px;background:var(--canvas-panel,#242832);color:inherit;padding:5px 9px;font:inherit;font-size:11px;cursor:pointer}.model-content button:disabled{opacity:.5;cursor:default}' +
  '.model-toolbar{display:flex;align-items:center;gap:8px;min-height:24px}.model-toolbar .model-status{flex:1;font-size:11px;color:var(--canvas-muted,#a1a7b2);line-height:1.5}.model-menu{flex:none}.model-menu summary{list-style:none;cursor:pointer;border-radius:6px;padding:0 6px;font-size:20px;line-height:24px}.model-menu summary::-webkit-details-marker{display:none}.model-menu summary:hover,.model-menu[open] summary{background:var(--canvas-panel,#242832)}.model-menu-actions{position:absolute;z-index:5;right:10px;top:40px;width:min(240px,calc(100% - 20px));max-height:calc(100% - 50px);overflow:auto;box-sizing:border-box;padding:10px;display:flex;flex-direction:column;gap:8px;border:1px solid var(--canvas-border,#454955);border-radius:8px;background:var(--canvas-panel,#242832);box-shadow:0 10px 25px #0004}.model-menu-actions button{text-align:left}' +
  '.model-views-gallery{display:grid;flex:1;min-height:0;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:8px}.model-view-tile{margin:0;min-width:0;min-height:0;display:flex;flex-direction:column;gap:4px}.model-content button.model-view{flex:1;padding:6px}.model-view-tile figcaption{text-align:center;color:var(--canvas-muted,#a1a7b2);font-size:11px;line-height:1.4}.model-views-gallery :is(a,.model-view){min-width:0;min-height:0;display:flex;flex-direction:column;color:inherit;text-decoration:none;border:1px solid var(--canvas-border,#454955);border-radius:8px;overflow:hidden;background:linear-gradient(145deg,#ffffff08,#00000008)}.card .model-views-gallery img{flex:1;min-height:0;height:0;width:100%;object-fit:contain}.model-views-gallery small{padding:4px 8px;color:var(--canvas-muted,#a1a7b2)}.model-content code,.model-content small{overflow-wrap:anywhere;font-size:11px}.model-error{color:#d9a167;font-size:11px;max-height:48px;overflow:auto}' +
  '.model-empty{flex:1;min-height:0;display:grid;place-items:center;color:var(--canvas-muted,#a1a7b2);font-size:12px;background:linear-gradient(145deg,#ffffff06,#00000006);border:1px dashed var(--canvas-border,#454955);border-radius:8px}.model-views-gallery>.model-empty{grid-column:1/-1;grid-row:1/-1}.model-footer{display:flex;flex-wrap:wrap;gap:6px}.model-footer:empty{display:none}' +
  '.model-content .model-thumbnail{position:relative;flex:1;min-height:0;width:100%;padding:0;border:0;overflow:hidden;border-radius:8px;background:radial-gradient(ellipse at 50% 35%,#29383a,#182022);color:#d4dfdf}.card .model-thumbnail img{width:100%;height:100%;object-fit:contain;display:block}.model-thumbnail span{position:absolute;bottom:10px;left:0;right:0;font-size:11px;text-align:center;pointer-events:none}.model-thumbnail:not([data-state=ready]) span{position:static;display:block;padding:12px}.model-thumbnail-worker{position:fixed;left:-2000px;top:0;width:360px;height:400px;border:0;pointer-events:none}';
