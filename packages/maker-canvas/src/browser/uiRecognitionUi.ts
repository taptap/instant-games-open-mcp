import { refreshCanvasMedia } from './mediaVersions.js';
import { canvasCapabilityReason } from './capabilities.js';
import type { CanvasDocument, CanvasNode } from '../contracts.js';
import type { CanvasDocumentStore } from '../browser/store.js';
import { canvasDependents, canvasReferences, snapshotCanvasSource } from '../core/dependencies.js';
import { invalidateCanvasDependents } from '../features/templateWorkflow.js';
import {
  selectedUiRecognition,
  selectedUiExtraction,
  setUiRecognitionMode,
  uiRecognitionInputs,
  uiRecognitionPreview,
  uiRecognitionStatus,
  uiRecognitionSource,
  type UiRecognitionResult,
} from '../features/uiRecognition.js';
import { withCanvasTimeout } from '../browser/requestTimeout.js';
import { openUiBboxPreview } from '../browser/uiBboxPreview.js';
import { hasImageFeature } from '../features/imageFeatures.js';
import { selectedUiAtlasPlan } from '../features/uiAssetBindings.js';
import { renderCanvasCardStatus } from './cardStatus.js';

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

export function createUiRecognitionUiWithHost(options: {
  readSource(path: string, signal: AbortSignal): Promise<Blob>;
  webRecognitionHint: string;
  localRecognitionHint: string;
  localRecognitionViewHint: string;
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
  focus?(id: string): void;
}) {
  const webRecognitionHint = options.webRecognitionHint;
  let busy = false;
  let preparing = false;
  const errors = new Map<string, string>();
  async function sourceBlob(path: string) {
    return withCanvasTimeout(async (signal) => {
      return options.readSource(path, signal);
    });
  }
  async function checkDesign(result: UiRecognitionResult, source: CanvasNode) {
    if (!result.bbox) return;
    if (source.uiRecognition?.inputRole === 'design') {
      if (result.bbox.design.path !== source.assetPath)
        throw new Error('识图结果与当前 UI 设计稿不匹配，请重新识别。');
    } else {
      const originals = canvasReferences(options.current()!, source.id).filter(
        (node) => node.type === 'image' && node.assetPath
      );
      if (
        originals.length !== 1 ||
        originals[0].templatePending ||
        originals[0].assetPath !== result.bbox.design.path
      )
        throw new Error('原 UI 设计稿已变化，请重新运行两次识图。');
    }
    const image = await sourceBlob(result.bbox.design.path);
    await drawUiRecognition(
      image,
      {
        ...result,
        sourcePath: result.bbox.design.path,
        sourceSha256: result.bbox.design.sha256,
        width: result.bbox.design.width,
        height: result.bbox.design.height,
        elements: [],
      },
      []
    );
  }
  function invalidate(source: CanvasNode) {
    const current = options.current();
    if (!current) return;
    if (source.uiRecognition?.optional) {
      options.changed();
      return;
    }
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
  async function recognize(
    source: CanvasNode,
    confirmed: boolean,
    recover = false
  ): Promise<boolean> {
    const current = options.current();
    if (!current || !source.assetPath || !source.uiRecognition || busy) return false;
    const unavailable =
      !source.uiRecognition.pendingId && canvasCapabilityReason(options.store, 'recognition');
    if (unavailable) throw new Error(unavailable);
    const settings = source.uiRecognition;
    let model = { id: 'gpt-6.1-sol', model: 'gpt-6.1-sol' };
    if (!settings.pendingId) {
      const models = await withCanvasTimeout(() =>
        Promise.resolve(options.store.recognitionModels?.())
      );
      const configured = models?.[0];
      if (
        settings.optional &&
        (!configured || ['local', 'chatgpt-web'].includes(configured.source || ''))
      )
        throw new Error('识图服务尚未就绪；配置 Server API 或自定义 API 后可手动重试 Bbox。');
      if (configured?.source === 'chatgpt-web') throw new Error(webRecognitionHint);
      if (models && (!configured || configured.source === 'local'))
        throw new Error(options.localRecognitionHint);
      if (configured) model = configured;
    }
    if (source.templatePending && !settings.pendingId)
      throw new Error('请先完成去文字，再识别当前去文字图。');
    if (settings.results.length >= 12 && !settings.pendingId)
      throw new Error('已保存 12 次识别结果，请新建对照画布继续测试。');
    if (
      !settings.pendingId &&
      !confirmed &&
      !window.confirm(
        '使用设置中选定的模型顺序识图两次：去文字图识别 UI，原稿识别文字。可能产生两次模型费用；不会启动后续生图。'
      )
    )
      return false;
    if (!settings.enabled) {
      options.remember();
      setUiRecognitionMode(current, source, true);
      options.changed();
    }
    const querying = Boolean(settings.pendingId);
    let pendingCreated = false;
    let submitted = false;
    busy = true;
    options.render();
    try {
      if (
        !querying &&
        (await refreshCanvasMedia(
          current,
          options.store,
          [source, ...canvasReferences(current, source.id)],
          true
        ))
      )
        options.changed();
      if (options.current() !== current) throw new Error('画布已切换，未提交识图。');
      let attempt;
      if (settings.pendingId) {
        if (!options.store.recognitionStatus) throw new Error('识图接口尚未就绪。');
        attempt = await withCanvasTimeout(() =>
          options.store.recognitionStatus!(current.id, settings.pendingId!)
        );
        if (options.current() !== current || !current.nodes.includes(source)) return false;
        if (
          recover &&
          attempt.recovery &&
          (attempt.status === 'running' || attempt.status === 'unknown') &&
          window.confirm('继续原识图请求？将复用原请求编号恢复或接续文字识别，后续识别可能计费。')
        ) {
          if (!options.store.recognizeUi) throw new Error('识图接口尚未就绪。');
          attempt = await options.store.recognizeUi(current.id, {
            id: settings.pendingId,
            nodeId: source.id,
            model: attempt.model,
            revision: current.revision,
            width: attempt.recovery.width,
            height: attempt.recovery.height,
            allowPaid: true,
            recover: true,
          });
        }
      } else {
        if (!options.store.recognizeUi) throw new Error('识图接口尚未就绪。');
        const bitmap = await createImageBitmap(await sourceBlob(source.assetPath));
        const width = bitmap.width,
          height = bitmap.height;
        bitmap.close();
        if (options.current() !== current) return false;
        options.remember();
        settings.model = model.id;
        settings.pendingId = crypto.randomUUID();
        pendingCreated = true;
        options.changed();
        if (!(await options.save())) throw new Error('识图请求尚未保存，未提交模型。');
        submitted = true;
        attempt = await withCanvasTimeout(
          () =>
            options.store.recognizeUi!(current.id, {
              id: settings.pendingId!,
              nodeId: source.id,
              model: model.id,
              revision: current.revision,
              width,
              height,
              allowPaid: true,
            }),
          settings.optional ? 60_000 : 375_000
        );
      }
      if (options.current() !== current || !current.nodes.includes(source)) return false;
      if (attempt.status === 'succeeded' && attempt.result) {
        const result = attempt.result;
        await checkDesign(result, source);
        const previousSelection = settings.selectedId;
        if (!settings.results.some((item) => item.id === result.id)) settings.results.push(result);
        delete settings.pendingId;
        if (!source.templatePending && result.sourcePath === source.assetPath)
          settings.selectedId = result.id;
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
      if (pendingCreated && !submitted) {
        delete settings.pendingId;
        options.changed();
        throw error;
      }
      if (
        querying &&
        status === 404 &&
        recover &&
        window.confirm(
          '未找到原识图请求记录。是否结束本地等待？不会取消远端任务，也不会重新提交；如曾提交，请先核对服务端记录。'
        )
      ) {
        options.remember();
        delete settings.pendingId;
        options.changed();
        if (!(await options.save()))
          throw new Error('本地等待已结束，但画布尚未保存，请先保存画布。');
        options.error('已结束本地等待，未提交新的识图请求。');
        return false;
      }
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
    confirmed = false,
    completeRecognition = false
  ): Promise<boolean> {
    const current = options.current();
    const node = current?.nodes.find((item) => item.id === id);
    if (!current || !node) return false;
    if (node.uiRecognition?.enabled && node.uiRecognition.inputRole !== 'design') {
      if (node.templatePending || !node.assetPath) {
        const generated = await fallback();
        if (!generated || !completeRecognition) return generated;
        if (options.current() !== current || node.templatePending || !node.assetPath) return false;
      }
      if (selectedUiRecognition(node)) return true;
      if (node.uiRecognition.optional) {
        try {
          await recognize(node, confirmed);
        } catch (error) {
          options.error(
            'Bbox 暂未生成，继续拆图；可在去文字卡菜单手动重试。' +
              (error instanceof Error ? error.message : String(error))
          );
        }
        return options.current() === current && !node.templatePending && Boolean(node.assetPath);
      }
      return recognize(node, confirmed, true);
    }
    if (node.uiRecognition?.inputRole === 'design') {
      const references = canvasReferences(current, node.id);
      if (references.length === 1 && !node.generation && !node.generationDraft) {
        const source = references[0];
        if (source.type !== 'image' || !source.assetPath || source.templatePending)
          throw new Error('请先准备原始 UI 设计稿。');
        options.remember();
        node.assetPath = source.assetPath;
        node.imageInfo = source.imageInfo ? { ...source.imageInfo } : undefined;
        node.sourceSnapshot = snapshotCanvasSource(source);
        node.sourceSnapshots = [node.sourceSnapshot!];
        node.uiRecognition.results = [];
        delete node.uiRecognition.selectedId;
        invalidate(node);
        return options.save();
      }
      return fallback();
    }
    const source = uiRecognitionSource(current, node);
    if (source?.uiRecognition?.optional) return fallback();
    if (!source?.uiRecognition?.enabled) return fallback();
    const result = selectedUiRecognition(source);
    if (!result) throw new Error('当前原稿还没有可用的识图清单。');
    const plan = selectedUiExtraction(current, node);
    const batch = node.uiAtlasGroup && selectedUiAtlasPlan(current, node);
    if (
      (plan && !plan.elements.length) ||
      (batch && batch.slots.every((slot) => slot.role === 'reserve'))
    ) {
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
    if (node.uiAtlasPrelayout || !hasImageFeature(node, 'ui-annotation')) return fallback();
    await checkDesign(result, source);
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
  async function runRecognition(node: CanvasNode, confirmed = false): Promise<boolean> {
    if (busy || preparing || options.blocked() || !hasImageFeature(node, 'ui-recognition'))
      return false;
    const unavailable =
      !node.uiRecognition?.pendingId && canvasCapabilityReason(options.store, 'recognition');
    if (unavailable) throw new Error(unavailable);
    preparing = true;
    try {
      const current = options.current();
      if (!current) return false;
      errors.delete(current.id + ':' + node.id);
      if (node.uiRecognition?.pendingId) return await recognize(node, true, !confirmed);
      const models = await options.store.recognitionModels?.();
      const configured = models?.[0];
      if (
        node.uiRecognition?.optional &&
        (!configured || ['local', 'chatgpt-web'].includes(configured.source || ''))
      )
        throw new Error('识图服务尚未就绪；配置 Server API 或自定义 API 后可手动重试 Bbox。');
      if (configured?.source === 'chatgpt-web') throw new Error(webRecognitionHint);
      if (
        !node.uiRecognition?.pendingId &&
        models &&
        (!configured || configured.source === 'local')
      ) {
        throw new Error(options.localRecognitionViewHint);
      }
      if (
        options.current() !== current ||
        !current.nodes.includes(node) ||
        busy ||
        options.blocked()
      )
        return false;
      const source = uiRecognitionInputs(current, node).cut;
      return await recognize(source, confirmed);
    } catch (error) {
      const current = options.current();
      if (current?.nodes.includes(node))
        errors.set(
          current.id + ':' + node.id,
          error instanceof Error ? error.message : String(error)
        );
      throw error;
    } finally {
      preparing = false;
      options.render();
    }
  }
  async function runAssets(id: string, fallback: () => Promise<boolean>) {
    const current = options.current();
    const node = current?.nodes.find((item) => item.id === id);
    const source = current && canvasReferences(current, id).find((item) => item.type === 'image');
    if (!current || !node || !source) return fallback();
    const plan = selectedUiExtraction(current, source);
    const batch = source.uiAtlasGroup && selectedUiAtlasPlan(current, source);
    if (
      !(plan && !plan.elements.length) &&
      !(batch && batch.slots.every((slot) => slot.role === 'reserve'))
    ) {
      delete node.uiEmpty;
      return fallback();
    }
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
    const source = uiRecognitionSource(current, node);
    if (
      source?.uiRecognition &&
      !source.uiRecognition.optional &&
      source.uiRecognition.inputRole === 'text-free' &&
      !source.templatePending &&
      source.assetPath &&
      !selectedUiRecognition(source) &&
      !card.hasAttribute('aria-busy')
    ) {
      card.querySelector('.card-state-overlay')?.remove();
      const isSource = source.id === node.id;
      const pending = Boolean(source.uiRecognition.pendingId);
      renderCanvasCardStatus(card, 'paused', {
        title: pending ? 'Bbox 结果待确认' : '等待 Bbox 数据',
        hint:
          '去文字图片已保留；Bbox 完成后才能预排、分离和切图。' +
          (pending
            ? '请查询原识图请求，不要重复提交。'
            : '可使用识图 API，或由 AI 按模板 Skill 识图并回填；完成后继续原卡片。') +
          (errors.get(current.id + ':' + source.id)
            ? '\n' + errors.get(current.id + ':' + source.id)
            : ''),
        resumeLabel: isSource
          ? pending
            ? '查询 / 恢复 Bbox'
            : '生成 / 重试 Bbox'
          : '定位识图卡片',
        resume:
          busy || preparing || options.blocked()
            ? undefined
            : async () => {
                if (!isSource) {
                  options.focus?.(source.id);
                  return;
                }
                try {
                  await runRecognition(source);
                } catch (error) {
                  options.error(error instanceof Error ? error.message : String(error));
                }
              },
      });
    }
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
  }
  return {
    ensureNote,
    runRecognition,
    async openPreview(node: CanvasNode) {
      const current = options.current();
      if (!current) return;
      const preview = uiRecognitionPreview(current, node);
      if (!preview?.result.bbox) throw new Error('当前图片没有匹配的 Bbox，请先识别。');
      await drawUiRecognition(await sourceBlob(preview.result.sourcePath), preview.result, []);
      await checkDesign(preview.result, preview.source);
      const source = await sourceBlob(preview.result.bbox.design.path);
      if (options.current() !== current || !current.nodes.includes(node)) return;
      await openUiBboxPreview(preview.result.bbox, source);
    },
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
      await checkDesign(result, node);
    },
    render,
    runImage,
    runAssets,
    async query(id: string) {
      const source = options.current()?.nodes.find((node) => node.id === id);
      if (source?.uiRecognition?.pendingId) await recognize(source, true);
    },
    get isBusy() {
      return busy || preparing;
    },
  };
}
