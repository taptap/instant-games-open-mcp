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
    body.append(label);
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
      body.append(select);
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
        caption.textContent = preview.view;
        link.append(image, caption);
        gallery.append(link);
      }
      body.append(gallery);
      if (!value || value.stale || value.retrySafe)
        button(
          body,
          '确认角色图 · 生成多视图',
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
      button(body, '查看模型 · 旋转预览', () => {
        preview(node.id);
      });
      const output = document.createElement('code');
      output.textContent = value.modelPath;
      body.append(output);
      button(body, '复制模型路径', () => navigator.clipboard.writeText(value.modelPath!));
    }
    if (node.type === 'model' && value?.status === 'review' && !value.stale)
      button(
        body,
        '确认全部视图 · 生成模型',
        () => {
          if (!window.confirm('已检查多视图卡中的全部图片并确认外观一致？继续生成模型将消耗积分。'))
            return;
          return execute(node.id, 'confirm', value.reviewId);
        },
        waiting || loading
      );
    if (value?.assetId || value?.taskId)
      button(body, '查询原任务', () => execute(node.id, 'query'), waiting || loading);
    button(body, '刷新本地状态', refresh, loading);
    if (canStop(node.id)) button(body, '停止本地等待', () => controller?.abort());
    if (value?.error) {
      const error = document.createElement('p');
      error.textContent = value.error;
      error.className = 'model-error';
      body.append(error);
    }
    if (value) {
      const identity = document.createElement('small');
      identity.textContent = '任务 ' + (value.assetId || value.taskId || value.id);
      body.append(identity);
    }
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
  '.model-content{height:100%;overflow:auto;box-sizing:border-box;padding:8px;display:flex;flex-direction:column;gap:8px}.model-content p{margin:0}.model-content button,.model-content select{border:1px solid var(--canvas-border,#454955);border-radius:6px;background:var(--canvas-panel,#242832);color:inherit;padding:7px;font:inherit;cursor:pointer}.model-content button:disabled{opacity:.5;cursor:default}.model-views-gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.model-views-gallery a{min-width:0;color:inherit;text-align:center}.card .model-views-gallery img{height:100px;width:100%;object-fit:contain;background:#eee}.model-content code,.model-content small{overflow-wrap:anywhere;font-size:11px}.model-error{color:#d9a167}';
