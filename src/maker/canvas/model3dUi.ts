import type { CanvasDocument, CanvasNode } from './model.js';
import type { CanvasDocumentStore } from './store.js';
import { canvasModelInput, canvasModelIsCurrent, type CanvasModelAttempt } from './model3d.js';

export function createCanvasModelUi(options: {
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
  let loading = false;
  let controller: AbortController | undefined;
  let readVersion = 0;
  let activeViewsId: string | undefined;
  let activeSourceId: string | undefined;
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
          event.origin !== location.origin ||
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
    const url = new URL(options.store.modelPreviewUrl(current.id, id), location.href);
    url.searchParams.set('mode', 'thumbnail');
    url.searchParams.set('attemptId', value.id);
    return url.href;
  }
  function showThumbnail(parent: HTMLElement, id: string, value: CanvasModelAttempt) {
    const target = button(parent, '', () => {
      preview(id);
    });
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
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭预览';
    const frame = document.createElement('iframe');
    frame.title = '3D 模型旋转预览';
    frame.src = options.store.modelPreviewUrl(current.id, id);
    dialog.append(close, frame);
    const release = () => {
      frame.remove();
      dialog.remove();
    };
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', release, { once: true });
    dialog.addEventListener('pointerdown', (event) => event.stopPropagation());
    dialog.addEventListener('wheel', (event) => event.stopPropagation());
    document.body.append(dialog);
    dialog.showModal();
    return { opened: true, url: frame.src };
  }
  function canStop(id: string) {
    if (!waiting || !options.current()) return false;
    try {
      return canvasModelInput(options.current()!, id).views.id === activeViewsId;
    } catch {
      return false;
    }
  }
  function protects(id: string) {
    return waiting && (id === activeSourceId || canStop(id));
  }
  async function refresh() {
    const current = options.current();
    if (!current || !options.store.listModels) return;
    const id = current.id;
    const version = ++readVersion;
    loading = true;
    try {
      const result = await options.store.listModels(id);
      if (options.current()?.id === id && version === readVersion) attempts = result;
    } finally {
      if (version === readVersion) loading = false;
      options.render();
    }
  }
  function sync() {
    const current = options.current();
    if (!current || canvasId === current.id) return;
    canvasId = current.id;
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
    if (waiting || options.blocked()) throw new Error('请先完成当前画布操作。');
    const current = options.current();
    if (!current || !options.store.modelAction) throw new Error('模型功能尚未就绪。');
    const input = canvasModelInput(current, id);
    if (action !== 'query' && options.sourceBlocked(input.character.id))
      throw new Error('角色图片仍有未确认任务或编辑草稿，请先处理。');
    waiting = true;
    activeViewsId = input.views.id;
    activeSourceId = input.character.id;
    readVersion++;
    loading = false;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 5 * 60 * 1000);
    options.render();
    try {
      if (!(await options.save())) throw new Error('画布未保存，不提交模型请求。');
      if (options.current() !== current) throw new Error('画布已切换，请重新查询状态。');
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
      }
      if (controller.signal.aborted) throw new Error('已停止等待。');
      const result = await options.store.modelAction(
        current.id,
        {
          nodeId: id,
          action,
          revision: current.revision,
          ...(reviewId ? { reviewId } : {}),
        },
        controller.signal
      );
      if (options.current()?.id === current.id) {
        readVersion++;
        loading = false;
        attempts = [result, ...attempts.filter((item) => item.id !== result.id)];
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
      activeViewsId = undefined;
      activeSourceId = undefined;
      controller = undefined;
      options.render();
    }
  }
  function button(
    parent: HTMLElement,
    label: string,
    action: () => void | Promise<unknown>,
    disabled = false
  ) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.disabled = disabled;
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
  async function download(id: string, sink?: (blob: Blob, filename: string) => Promise<void>) {
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
    const blob = await options.store.exportModel(current.id, id);
    if (sink) return sink(blob, filename);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function render(card: HTMLElement, node: CanvasNode) {
    if (!['model', 'model-views'].includes(node.type)) return;
    const current = options.current();
    if (!current) return;
    const value = state(node.id);
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
      pending: '生成中 · 可查询进度',
      review: '请检查全部视图',
      completed: '模型已保存到项目',
      failed: '生成失败',
      unknown: '结果待确认 · 请查询原任务',
    };
    label.textContent = value?.stale
      ? '角色或质量已变化 · 旧结果保留'
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
    const footer = document.createElement('div');
    footer.className = 'model-footer';
    card.dataset.state = canStop(node.id)
      ? 'loading'
      : value?.stale
        ? 'waiting'
        : value?.status === 'completed'
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
      actions.append(select);
      const gallery = document.createElement('div');
      gallery.className = 'model-views-gallery';
      for (const preview of value?.previews || []) {
        const link = document.createElement('a');
        link.href = options.store.mediaUrl(preview.path);
        link.target = '_blank';
        link.rel = 'noopener';
        link.addEventListener('pointerdown', (event) => event.stopPropagation());
        const image = document.createElement('img');
        image.src = link.href;
        image.alt = preview.view;
        const caption = document.createElement('small');
        caption.textContent =
          ({ front: '正面', left: '左侧', back: '背面', right: '右侧' } as Record<string, string>)[
            preview.view
          ] || preview.view;
        link.append(image, caption);
        gallery.append(link);
      }
      body.append(gallery);
      if (!value?.previews.length) {
        const placeholder = document.createElement('span');
        placeholder.className = 'model-empty';
        placeholder.textContent = '多视图预览';
        gallery.append(placeholder);
      }
      if (!value || value.stale || value.retrySafe)
        button(
          footer,
          '生成多视图',
          () => {
            if (
              !window.confirm(
                '确认以当前角色图生成多视图？将消耗积分；生成后仍需检查预览，不会自动生成模型。'
              )
            )
              return;
            return execute(node.id, 'start');
          },
          waiting || loading
        );
    } else if (value?.modelPath) {
      showThumbnail(body, node.id, value);
      const output = document.createElement('code');
      output.textContent = value.modelPath;
      actions.append(output);
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
    if (node.type === 'model' && value?.status === 'review' && !value.stale)
      button(
        footer,
        '确认视图并生成',
        () => {
          if (!window.confirm('已检查多视图卡中的全部图片并确认外观一致？继续生成模型将消耗积分。'))
            return;
          return execute(node.id, 'confirm', value.reviewId);
        },
        waiting || loading
      );
    if (value?.assetId || value?.taskId)
      button(actions, '查询原任务', () => execute(node.id, 'query'), waiting || loading);
    button(actions, '刷新本地状态', refresh, loading);
    if (canStop(node.id)) button(footer, '停止本地等待', () => controller?.abort());
    if (value?.error) {
      const error = document.createElement('p');
      error.textContent = value.error;
      error.className = 'model-error';
      body.append(error);
    }
    if (value) {
      const identity = document.createElement('small');
      identity.textContent = '任务 ' + (value.assetId || value.taskId || value.id);
      actions.append(identity);
    }
    body.append(footer);
    card.append(body);
  }
  return {
    preview,
    sync,
    canStop,
    protects,
    refresh,
    state,
    execute,
    render,
    download,
    stop: () => controller?.abort(),
    get isBusy() {
      return waiting;
    },
  };
}

export const CANVAS_MODEL_STYLES =
  '.model-preview-dialog{box-sizing:border-box}' +
  '.model-preview-dialog{width:min(960px,94vw);height:min(760px,90vh);max-width:none;max-height:none;padding:12px;border:1px solid #536367;border-radius:12px;background:#182022;color:#e3e9e8}.model-preview-dialog[open]{display:flex;flex-direction:column;gap:10px}.model-preview-dialog::backdrop{background:#000a}.model-preview-dialog>button{align-self:flex-end;background:#293739;color:inherit;border:1px solid #536367;border-radius:6px;padding:7px 14px;cursor:pointer}.model-preview-dialog iframe{border:0;width:100%;flex:1;min-height:0;border-radius:8px}' +
  '.model-content{height:100%;min-height:0;overflow:hidden;position:relative;box-sizing:border-box;padding:10px;display:flex;flex-direction:column;gap:10px}.model-content p{margin:0}.model-content button,.model-content select{border:1px solid var(--canvas-border,#454955);border-radius:6px;background:var(--canvas-panel,#242832);color:inherit;padding:5px 9px;font:inherit;font-size:11px;cursor:pointer}.model-content button:disabled{opacity:.5;cursor:default}' +
  '.model-toolbar{display:flex;align-items:center;gap:8px;min-height:24px}.model-toolbar .model-status{flex:1;font-size:11px;color:var(--canvas-muted,#a1a7b2);line-height:1.5}.model-menu{flex:none}.model-menu summary{list-style:none;cursor:pointer;border-radius:6px;padding:0 6px;font-size:20px;line-height:24px}.model-menu summary::-webkit-details-marker{display:none}.model-menu summary:hover,.model-menu[open] summary{background:var(--canvas-panel,#242832)}.model-menu-actions{position:absolute;z-index:5;right:10px;top:40px;width:min(240px,calc(100% - 20px));max-height:calc(100% - 50px);overflow:auto;box-sizing:border-box;padding:10px;display:flex;flex-direction:column;gap:8px;border:1px solid var(--canvas-border,#454955);border-radius:8px;background:var(--canvas-panel,#242832);box-shadow:0 10px 25px #0004}.model-menu-actions button{text-align:left}' +
  '.model-views-gallery{display:grid;flex:1;min-height:0;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:8px}.model-views-gallery a{min-width:0;min-height:0;display:flex;flex-direction:column;color:inherit;text-decoration:none;border:1px solid var(--canvas-border,#454955);border-radius:8px;overflow:hidden;background:linear-gradient(145deg,#ffffff08,#00000008)}.card .model-views-gallery img{flex:1;min-height:0;height:0;width:100%;object-fit:contain}.model-views-gallery small{padding:4px 8px;color:var(--canvas-muted,#a1a7b2)}.model-content code,.model-content small{overflow-wrap:anywhere;font-size:11px}.model-error{color:#d9a167;font-size:11px;max-height:48px;overflow:auto}' +
  '.model-empty{flex:1;min-height:0;display:grid;place-items:center;color:var(--canvas-muted,#a1a7b2);font-size:12px;background:linear-gradient(145deg,#ffffff06,#00000006);border:1px dashed var(--canvas-border,#454955);border-radius:8px}.model-views-gallery>.model-empty{grid-column:1/-1;grid-row:1/-1}.model-footer{display:flex;flex-wrap:wrap;gap:6px}.model-footer:empty{display:none}' +
  '.model-content .model-thumbnail{position:relative;flex:1;min-height:0;width:100%;padding:0;border:0;overflow:hidden;border-radius:8px;background:radial-gradient(ellipse at 50% 35%,#29383a,#182022);color:#d4dfdf}.card .model-thumbnail img{width:100%;height:100%;object-fit:contain;display:block}.model-thumbnail span{position:absolute;bottom:10px;left:0;right:0;font-size:11px;text-align:center;pointer-events:none}.model-thumbnail:not([data-state=ready]) span{position:static;display:block;padding:12px}.model-thumbnail-worker{position:fixed;left:-2000px;top:0;width:360px;height:400px;border:0;pointer-events:none}';
