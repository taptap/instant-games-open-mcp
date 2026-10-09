import type { CanvasDocument, CanvasNode } from './model.js';
import type { CanvasDocumentStore } from './store.js';
import { canvasDependents, canvasReferences, snapshotCanvasSource } from './dependencies.js';
import { invalidateCanvasDependents } from './templateWorkflow.js';
import {
  selectedUiRecognition,
  selectedUiExtraction,
  setUiRecognitionMode,
  uiRecognitionNote,
  uiRecognitionStatus,
  uiRecognitionSource,
  type UiRecognitionResult,
} from './uiRecognition.js';
import { withCanvasTimeout } from './requestTimeout.js';

export async function drawUiRecognition(
  source: Blob,
  result: UiRecognitionResult,
  categories?: string[]
): Promise<HTMLCanvasElement> {
  const digest = await crypto.subtle.digest('SHA-256', await source.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  if (hash !== result.sourceSha256) throw new Error('原稿内容已变化，不能套用旧识图坐标。');
  const bitmap = await createImageBitmap(source);
  try {
    if (bitmap.width !== result.width || bitmap.height !== result.height)
      throw new Error('识图坐标与原稿尺寸不一致。');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法绘制识图标注。');
    context.scale(scale, scale);
    context.drawImage(bitmap, 0, 0);
    const fontSize = Math.max(14, Math.round(result.width / 60));
    context.lineWidth = Math.max(2, result.width / 500);
    context.font = 'bold ' + fontSize + 'px sans-serif';
    for (const element of result.elements) {
      if (categories && !categories.includes(element.category)) continue;
      const [x, y, w, h] = element.rect;
      context.strokeStyle = '#ff3535';
      context.fillStyle = '#9b1515';
      context.strokeRect(x, y, w, h);
      const labelWidth = context.measureText(element.id).width + 8;
      const labelX = Math.min(x, result.width - labelWidth);
      const labelY = Math.max(0, y - fontSize - 6);
      context.fillRect(labelX, labelY, labelWidth, fontSize + 6);
      context.fillStyle = '#ffffff';
      context.fillText(element.id, labelX + 4, labelY + fontSize);
    }
    return canvas;
  } finally {
    bitmap.close();
  }
}

export function createUiRecognitionUi(options: {
  current(): CanvasDocument | null;
  store: CanvasDocumentStore;
  save(): Promise<boolean>;
  remember(): void;
  changed(): void;
  render(): void;
  blocked(): boolean;
  error(message: string): void;
  loadMedia(path: string): Promise<void>;
  openCanvas(id: string): Promise<void>;
}) {
  let busy = false;
  async function sourceBlob(path: string) {
    return withCanvasTimeout(async (signal) => {
      const response = await fetch(options.store.mediaUrl(path), { signal });
      if (!response.ok) throw new Error('无法读取识图原稿。');
      return response.blob();
    });
  }
  function invalidate(source: CanvasNode) {
    const current = options.current();
    if (!current) return;
    invalidateCanvasDependents(current, source.id);
    for (const node of canvasDependents(current, source.id)) {
      const input = node.generationDraft || node.generation;
      if (input && node.uiBaselinePrompt) input.prompt = node.uiBaselinePrompt;
      delete node.uiEmpty;
    }
    delete source.templatePending;
    options.changed();
  }
  function ensureNote(source: CanvasNode) {
    const current = options.current()!;
    if (current.nodes.some((node) => node.uiRecognitionSourceId === source.id)) return;
    if (current.nodes.length >= 400) throw new Error('画布卡片已达到容量限制。');
    current.nodes.push({
      id: crypto.randomUUID(),
      type: 'note',
      title: '识图元素清单',
      x: source.x,
      y: source.y + source.height + 32,
      width: Math.max(360, source.width),
      height: 300,
      sectionId: source.sectionId,
      uiRecognitionSourceId: source.id,
    });
  }
  async function recognize(source: CanvasNode, confirmed: boolean): Promise<boolean> {
    const current = options.current();
    if (!current || !source.assetPath || !source.uiRecognition || busy) return false;
    const settings = source.uiRecognition;
    if (source.templatePending && !settings.pendingId)
      throw new Error('请先完成去文字，再识别当前去文字图。');
    if (settings.results.length >= 12 && !settings.pendingId)
      throw new Error('已保存 12 次识别结果，请新建对照画布继续测试。');
    if (
      !settings.pendingId &&
      !confirmed &&
      !window.confirm('仅运行一次元素识图，可能产生模型费用；不会启动后续生图。')
    )
      return false;
    busy = true;
    options.render();
    try {
      let attempt;
      if (settings.pendingId) {
        if (!options.store.recognitionStatus) throw new Error('识图接口尚未就绪。');
        attempt = await options.store.recognitionStatus(current.id, settings.pendingId);
      } else {
        const models = (await options.store.recognitionModels?.()) || [];
        const model =
          models.find((model) => model.id === settings.model) ||
          (models.length === 1 ? models[0] : undefined);
        if (!model || !options.store.recognizeUi)
          throw new Error('请先配置并选择识图模型。识图关闭时仍可运行原图片流程。');
        const bitmap = await createImageBitmap(await sourceBlob(source.assetPath));
        const width = bitmap.width,
          height = bitmap.height;
        bitmap.close();
        if (options.current() !== current) return false;
        options.remember();
        settings.model = model.id;
        settings.pendingId = crypto.randomUUID();
        options.changed();
        if (!(await options.save())) throw new Error('识图请求尚未保存，未提交模型。');
        attempt = await options.store.recognizeUi(current.id, {
          id: settings.pendingId,
          nodeId: source.id,
          model: model.id,
          revision: current.revision,
          width,
          height,
          allowPaid: true,
        });
      }
      if (options.current() !== current || !current.nodes.includes(source)) return false;
      if (attempt.status === 'succeeded' && attempt.result) {
        const result = attempt.result;
        const previousSelection = settings.selectedId;
        if (!settings.results.some((item) => item.id === result.id)) settings.results.push(result);
        delete settings.pendingId;
        if (
          !source.templatePending &&
          result.sourcePath === source.assetPath &&
          !settings.results.some(
            (item) => item.id === settings.selectedId && item.sourcePath === source.assetPath
          )
        )
          settings.selectedId = result.id;
        ensureNote(source);
        if (settings.enabled && settings.selectedId !== previousSelection) invalidate(source);
        else options.changed();
        if (!(await options.save()))
          throw new Error('识图完成，画布尚未保存；结果可通过原请求恢复。');
        return result.sourcePath === source.assetPath;
      }
      if (attempt.status === 'failed') {
        delete settings.pendingId;
        options.changed();
        await options.save();
      }
      throw new Error(attempt.error || '识图仍在执行，请查询原请求；不会重复提交。');
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 400 || status === 409) {
        delete settings.pendingId;
        options.changed();
        await options.save();
      }
      throw error;
    } finally {
      busy = false;
      options.render();
    }
  }
  async function runImage(
    id: string,
    fallback: () => Promise<boolean>,
    confirmed = false
  ): Promise<boolean> {
    const current = options.current();
    const node = current?.nodes.find((item) => item.id === id);
    if (!current || !node) return false;
    if (node.uiRecognition?.enabled) {
      if (node.templatePending || !node.assetPath) return fallback();
      return selectedUiRecognition(node) ? true : recognize(node, confirmed);
    }
    const source = uiRecognitionSource(current, node);
    if (!source?.uiRecognition?.enabled) return fallback();
    const result = selectedUiRecognition(source);
    if (!result) throw new Error('当前原稿还没有可用的识图清单。');
    const plan = selectedUiExtraction(current, node);
    if (plan && !plan.elements.length) {
      options.remember();
      node.uiEmpty = true;
      delete node.templatePending;
      node.sourceSnapshots = canvasReferences(current, id).map(
        (source) => snapshotCanvasSource(source)!
      );
      for (const edge of current.edges.filter(
        (edge) => edge.from === id && edge.kind === 'image-assets'
      )) {
        const target = current.nodes.find((item) => item.id === edge.to)!;
        target.uiEmpty = true;
        delete target.templatePending;
        delete target.imageAssetsInfo;
        target.sourceSnapshot = snapshotCanvasSource(node);
      }
      options.changed();
      const saved = await options.save();
      options.render();
      return saved;
    }
    delete node.uiEmpty;
    if (!node.uiAnnotation) return fallback();
    node.uiBaselinePrompt ??= node.generationDraft?.prompt || node.generation?.prompt || '';
    busy = true;
    try {
      const canvas = await drawUiRecognition(
        await sourceBlob(source.assetPath!),
        result,
        node.uiAnnotation
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('标注图编码失败。'))),
          'image/png'
        )
      );
      const saved = await options.store.importImage(
        current.id,
        await blob.arrayBuffer(),
        'image/png'
      );
      if (options.current() !== current) return false;
      options.remember();
      node.assetPath = saved.relativePath;
      delete node.generationDraft;
      node.generation = {
        prompt: '由识图清单按原图坐标绘制标框',
        operation: 'variant',
        sourceImageIds: canvasReferences(current, id)
          .filter((item) => item.type === 'image')
          .map((item) => item.id),
      };
      node.sourceSnapshots = canvasReferences(current, id).map(
        (item) => snapshotCanvasSource(item)!
      );
      delete node.templatePending;
      invalidateCanvasDependents(current, node.id);
      options.changed();
      await options.loadMedia(saved.relativePath);
      return await options.save();
    } finally {
      busy = false;
      options.render();
    }
  }
  async function open(source: CanvasNode) {
    if (busy || options.blocked()) return;
    const current = options.current()!;
    if (!source.uiRecognition) {
      options.remember();
      source.uiRecognition = { enabled: false, results: [] };
      options.changed();
    }
    const settings = source.uiRecognition;
    const dialog = document.createElement('dialog');
    dialog.className = 'workflow-template-dialog ui-recognition-dialog';
    dialog.style.cssText = 'width:min(1100px,94vw);max-height:90vh;overflow:auto';
    const heading = document.createElement('h2');
    heading.textContent = '元素识图 / 模型对比';
    const label = document.createElement('label');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = settings.enabled;
    label.append(toggle, document.createTextNode(' 启用识图清单（关闭后按原图片流程执行）'));
    toggle.onchange = () => {
      options.remember();
      setUiRecognitionMode(current, source, toggle.checked);
      options.changed();
      options.render();
      void options.save().catch((error) => options.error(error.message));
    };
    const model = document.createElement('select');
    model.setAttribute('aria-label', '识图模型');
    model.onchange = () => {
      options.remember();
      settings.model = model.value;
      options.changed();
      void options.save().catch((error) => options.error(error.message));
    };
    const hint = document.createElement('p');
    hint.textContent = '同一原稿使用相同识图提示词；编号各自独立。只识图不生成素材。';
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    const history = document.createElement('div');
    history.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px';
    const drawHistory = () => {
      history.replaceChildren();
      for (const result of settings.results) {
        const panel = document.createElement('section');
        const title = document.createElement('strong');
        title.textContent = result.model + ' · ' + result.createdAt;
        const details = document.createElement('pre');
        details.textContent = uiRecognitionNote(result);
        details.style.cssText =
          'white-space:pre-wrap;max-height:220px;overflow:auto;font-size:12px';
        const use = document.createElement('button');
        use.textContent = settings.selectedId === result.id ? '已选用' : '用于后续拆图';
        use.disabled =
          source.templatePending ||
          result.sourcePath !== source.assetPath ||
          settings.selectedId === result.id ||
          busy;
        use.onclick = async () => {
          if (busy || options.blocked() || source.templatePending) return;
          options.remember();
          settings.selectedId = result.id;
          if (settings.enabled) invalidate(source);
          else options.changed();
          await options.save();
          drawHistory();
          options.render();
        };
        const download = document.createElement('button');
        download.textContent = '下载清单 JSON';
        download.onclick = () => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = 'ui-elements-' + result.id + '.json';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        panel.append(title, use, download, details);
        history.append(panel);
        void sourceBlob(result.sourcePath)
          .then((blob) => drawUiRecognition(blob, result))
          .then((canvas) => {
            canvas.style.cssText = 'width:100%;height:auto';
            if (panel.isConnected) panel.append(canvas);
          })
          .catch(() => {
            details.textContent += '（原稿预览暂不可用）';
          });
      }
    };
    const run = document.createElement('button');
    run.textContent = settings.pendingId ? '查询原识图请求' : '仅运行识图';
    const release = document.createElement('button');
    release.textContent = '结束本地等待';
    release.hidden = !settings.pendingId;
    release.onclick = async () => {
      if (
        busy ||
        !settings.pendingId ||
        !window.confirm(
          '这不会取消远端请求。请先核对模型服务记录；以后重新识图可能重复计费。确认结束本地等待？'
        )
      )
        return;
      options.remember();
      delete settings.pendingId;
      options.changed();
      if (await options.save()) {
        release.hidden = true;
        run.textContent = '仅运行识图';
        message.textContent = '本地等待已结束，原请求记录仍保留。';
      }
    };
    run.onclick = async () => {
      run.disabled = true;
      toggle.disabled = true;
      model.disabled = true;
      message.textContent = '正在识图或查询原请求，请等待结果；不会启动后续生图。';
      run.textContent = '识图处理中…';
      try {
        settings.model = model.value || settings.model;
        const completed = await recognize(source, false);
        message.textContent = completed ? '识图结果已保存。' : '已取消识图或原稿已变化。';
      } catch (error) {
        message.textContent = (error as Error).message;
      } finally {
        run.disabled = false;
        toggle.disabled = false;
        model.disabled = false;
        run.textContent = settings.pendingId ? '查询原识图请求' : '仅运行识图';
        release.hidden = !settings.pendingId;
        drawHistory();
      }
    };
    const copy = document.createElement('button');
    copy.textContent = '新建对照画布（保留本页结果）';
    copy.onclick = async () => {
      if (busy || options.blocked()) return;
      copy.disabled = true;
      try {
        if (!(await options.save())) throw new Error('请先保存当前画布。');
        const created = await options.store.create(current.title + ' · 对照', 'empty');
        const duplicate = structuredClone(current);
        duplicate.id = created.id;
        duplicate.title = created.title;
        duplicate.revision = created.revision;
        for (const node of duplicate.nodes)
          if (node.uiRecognition) {
            delete node.uiRecognition.pendingId;
            node.uiRecognition.results = [];
            delete node.uiRecognition.selectedId;
          }
        const root = duplicate.nodes.find((node) => node.id === source.id)!;
        setUiRecognitionMode(duplicate, root, !settings.enabled);
        await options.store.save(duplicate);
        dialog.close();
        await options.openCanvas(created.id);
      } catch (error) {
        message.textContent = (error as Error).message;
        copy.disabled = false;
      }
    };
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.onclick = () => {
      if (!busy) dialog.close();
    };
    dialog.addEventListener('cancel', (event) => {
      if (busy) event.preventDefault();
    });
    dialog.addEventListener('keydown', (event) => event.stopPropagation());
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.append(heading, label, hint, model, run, release, copy, close, message, history);
    document.body.append(dialog);
    dialog.showModal();
    drawHistory();
    try {
      const models = (await options.store.recognitionModels?.()) || [];
      for (const item of models) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.id + ' / ' + item.model;
        model.append(option);
      }
      if (settings.model) model.value = settings.model;
      if (!models.length) {
        model.hidden = true;
        run.hidden = !settings.pendingId;
        message.textContent =
          '由当前对话 AI 看图，通过 CLI 写入元素清单即可；无需配置独立识图服务。换模型后写入新清单，可在此对比。';
      }
    } catch (error) {
      message.textContent = (error as Error).message;
    }
  }
  async function runAssets(id: string, fallback: () => Promise<boolean>) {
    const current = options.current();
    const node = current?.nodes.find((item) => item.id === id);
    const source = current && canvasReferences(current, id).find((item) => item.type === 'image');
    if (!current || !node || !source) return fallback();
    const plan = selectedUiExtraction(current, source);
    if (!plan || plan.elements.length) return fallback();
    options.remember();
    node.uiEmpty = true;
    delete node.imageAssetsInfo;
    delete node.templatePending;
    node.sourceSnapshot = snapshotCanvasSource(source);
    options.changed();
    const saved = await options.save();
    options.render();
    return saved;
  }
  function render(card: HTMLElement, node: CanvasNode) {
    const current = options.current();
    if (!current) return;
    if (node.uiEmpty && !node.templatePending) {
      const content = card.querySelector('.canvas-card-content');
      if (content) {
        content.replaceChildren();
        const text = document.createElement('p');
        text.textContent = '识图清单无此类元素，无需生成。';
        content.append(text);
      }
    }
    if (node.uiRecognitionSourceId) {
      const source = current.nodes.find((item) => item.id === node.uiRecognitionSourceId);
      const editor = card.querySelector('textarea');
      if (editor) {
        editor.readOnly = true;
        editor.classList.add('ui-recognition-note');
        editor.value = uiRecognitionStatus(source).text;
      }
    }
    if (node.type !== 'image' || !node.assetPath || !node.uiRecognition) return;
    const button = document.createElement('button');
    button.className = 'ui-recognition-open';
    button.style.cssText =
      'position:relative;z-index:9;pointer-events:auto;opacity:1;flex:none;font-size:11px;padding:4px 6px';
    button.textContent = '识图：' + (node.uiRecognition?.enabled ? '开' : '关') + ' · 对比';
    button.disabled = busy || options.blocked();
    button.onpointerdown = (event) => event.stopPropagation();
    button.onclick = (event) => {
      event.stopPropagation();
      void open(node).catch((error) => options.error(error.message));
    };
    (card.querySelector('.canvas-card-header') || card).append(button);
    const status = document.createElement('small');
    status.className = 'ui-recognition-status';
    status.setAttribute('role', 'status');
    const recognition = uiRecognitionStatus(node);
    status.textContent = '元素识图：' + recognition.label;
    status.title = recognition.text;
    status.style.cssText =
      'position:absolute;top:44px;left:6px;z-index:9;padding:3px 6px;border-radius:4px;background:#202630e8;color:#e5eaf0;max-width:calc(100% - 24px);font-size:11px';
    card.append(status);
  }
  return {
    ensureNote,
    async checkRecognition(node: CanvasNode) {
      const result = node.uiRecognition?.results.find(
        (item) => item.id === node.uiRecognition?.selectedId
      );
      if (!result || result.sourcePath !== node.assetPath)
        throw new Error('识图清单与当前原稿不匹配。');
      const current = options.current()!;
      if (
        current.nodes.length >= 400 &&
        !current.nodes.some((item) => item.uiRecognitionSourceId === node.id)
      )
        throw new Error('画布卡片已达到容量限制，无法写入识图便签。');
      // Reuse the annotation guard to verify bytes and pixel coordinates before saving.
      await drawUiRecognition(await sourceBlob(result.sourcePath), result, []);
    },
    render,
    runImage,
    runAssets,
    async query(id: string) {
      const source = options.current()?.nodes.find((node) => node.id === id);
      if (source?.uiRecognition?.pendingId) await recognize(source, true);
    },
    get isBusy() {
      return busy;
    },
  };
}
