import { refreshCanvasMedia } from './mediaVersions.js';
import type { CanvasExportDelivery } from './exportDelivery.js';
declare const document: any;
import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { selectedUiExtraction, uiRecognitionSource } from '../features/uiRecognition.js';
import type { CanvasDocumentStore } from '../browser/store.js';
import type { ImageAtlasGrid } from '../contracts.js';
import { splitImageAtlas, prepareImageAtlas } from '../browser/imageAtlasExport.js';
import type { PreparedImageAtlas } from '../browser/imageAtlasExport.js';
import type { ImageAtlasCutSettings } from '../features/atlasContent.js';
import type {
  applyImageAssetsToDocument,
  imageAssetsBindingPlanStructure,
} from '../features/imageAssets.js';
import { canvasNodeVersion, isCanvasSourceCurrent } from '../core/dependencies.js';
import { drawImageAtlasPreview } from '../browser/imageAtlasUi.js';
import type { ImageAtlasDialogActions } from '../browser/imageAtlasUi.js';
import { mergeIconGrid, mergeIconNeedsGeneration } from '../features/mergeIcons.js';
import { isGameUiResource } from '../features/uiWorkflow.js';
import { withCanvasTimeout } from '../browser/requestTimeout.js';
import { uiCutoutRgb } from '../features/uiCutout.js';
import { validateUiNativeRegions } from '../features/uiAssetBindings.js';

export function createImageAssetsUiWithHost(options: {
  deliver: CanvasExportDelivery;
  applyImageAssets: typeof applyImageAssetsToDocument;
  imageAssetsBindingPlan: typeof imageAssetsBindingPlanStructure;
  openImageAtlasDialog(
    node: CanvasNode,
    mediaUrl: (path: string) => string,
    actions?: ImageAtlasDialogActions
  ): void;
  readSource(path: string, signal: AbortSignal, failure: string): Promise<Blob>;
  current(): CanvasDocument | null;
  store: CanvasDocumentStore;
  remember(): void;
  changed(): void;
  save(): Promise<boolean>;
  render(): void;
  select(id: string): void;
  blocked(id: string): boolean;
  resolve(sourceId: string): { kind: string; nodeId?: string; message?: string } | undefined;
  error(message: string): void;
  log?(message: string, level?: 'info' | 'warning' | 'error'): void;
}) {
  let busy = false;
  let review:
    | {
        id: string;
        canvasId: string;
        revision: number;
        targetId: string;
        source: CanvasNode;
        blob: Blob;
        grid: ImageAtlasGrid;
        prepared: PreparedImageAtlas;
        targetInfo: string;
      }
    | undefined;
  function canReuseSettings(source: CanvasNode, target?: CanvasNode) {
    // Legacy parameters remain editable; this does not validate or upgrade old output files.
    return (
      isCanvasSourceCurrent(target?.sourceSnapshot, source) ||
      isCanvasSourceCurrent(target?.sourceSnapshot, { ...source, assetVersion: undefined })
    );
  }
  function savedGrid(current: CanvasDocument, source: CanvasNode, target?: CanvasNode) {
    if (source.mergeIcons) return mergeIconGrid(source.mergeIcons);
    const plan = selectedUiExtraction(current, source);
    // A confirmed grid belongs to this atlas; new atlases use the active mode's grid.
    if (target?.imageAssetsInfo && canReuseSettings(source, target))
      return target.imageAssetsInfo.grid;
    if (source.generation?.uiAtlasPlan) return source.generation.uiAtlasPlan.grid;
    return plan?.grid || source.uiBaselineGrid || target?.imageAssetsInfo?.grid;
  }
  function backgroundFor(source: CanvasNode, target?: CanvasNode) {
    if (target?.imageAssetsInfo?.background && canReuseSettings(source, target))
      return target.imageAssetsInfo.background;
    const current = options.current();
    if (
      source.uiAtlasGroup === 'background' &&
      !source.generation?.cutoutColor &&
      current &&
      uiRecognitionSource(current, source)?.uiRecognition?.optional
    )
      return { color: undefined, mode: 'connected' as const };
    const gameUi = Boolean(target && isGameUiResource(options.current() || undefined, target));
    return {
      color:
        source.generation?.cutoutColor || gameUi
          ? uiCutoutRgb(source.generation?.cutoutColor)
          : undefined,
      mode:
        (source.uiAtlasGroup && source.uiAtlasGroup !== 'background') ||
        (source.generation?.cutoutColor && !gameUi)
          ? ('all' as const)
          : ('connected' as const),
    };
  }
  function savedCut(source: CanvasNode, target?: CanvasNode): ImageAtlasCutSettings {
    const layout = source.generation?.uiAtlasPlan?.nativeLayout;
    if (layout)
      return {
        mode: 'grid',
        regions: structuredClone(
          target?.imageAssetsInfo?.regions && canReuseSettings(source, target)
            ? target.imageAssetsInfo.regions
            : layout.regions
        ),
        expectedCount: layout.regions.length,
        allowEmpty: true,
      };
    const allowEmpty = Boolean(
      source.generation?.uiAtlasPlan || (source.uiAtlasGroup && source.uiBaselineGrid)
    );
    const current = options.current();
    if (
      current &&
      source.uiAtlasGroup !== 'background' &&
      !source.generation?.uiAtlasPlan &&
      uiRecognitionSource(current, source)?.uiRecognition?.optional &&
      !(target?.imageAssetsInfo?.regions && canReuseSettings(source, target))
    )
      return { mode: 'content' };
    return target?.imageAssetsInfo?.regions && canReuseSettings(source, target)
      ? {
          mode: target.imageAssetsInfo.cutMode || 'content',
          regions: structuredClone(target.imageAssetsInfo.regions),
          expectedCount: target.imageAssetsInfo.regions.length,
          ...(allowEmpty ? { allowEmpty } : {}),
        }
      : allowEmpty
        ? { allowEmpty }
        : {};
  }
  function reviewed(id: string) {
    const current = options.current();
    if (!review || review.targetId !== id) return;
    const source = current?.nodes.find((node) => node.id === review!.source.id);
    if (
      current?.id !== review.canvasId ||
      current.revision !== review.revision ||
      canvasNodeVersion(source) !== canvasNodeVersion(review.source) ||
      source?.templatePending ||
      JSON.stringify(current?.nodes.find((node) => node.id === id)?.imageAssetsInfo) !==
        review.targetInfo ||
      !current.nodes.some((node) => node.id === id && node.type === 'image-assets') ||
      !current.edges.some(
        (edge) => edge.kind === 'image-assets' && edge.from === source?.id && edge.to === id
      )
    ) {
      review = undefined;
      return;
    }
    return review;
  }
  function reviewState(id: string) {
    const value = reviewed(id);
    return (
      value && {
        status: 'waiting_for_confirmation',
        reviewId: value.id,
        grid: { ...value.grid },
        bindings: value.source.generation?.uiAtlasPlan?.slots,
        cutMode: value.prepared.mode,
        nextAction: 'confirm-image-assets',
        message:
          '请查看网格预览，核对每格物品完整且不跨格，再携带当前 reviewId 显式确认。参数变化需重新预览。',
      }
    );
  }
  async function preview(id: string, input?: unknown, cutInput?: unknown) {
    const current = options.current();
    const target = current?.nodes.find((node) => node.id === id && node.type === 'image-assets');
    const edge = current?.edges.find((edge) => edge.kind === 'image-assets' && edge.to === id);
    const source = current?.nodes.find((node) => node.id === edge?.from && node.type === 'image');
    if (
      !current ||
      !target ||
      !source?.assetPath ||
      source.templatePending ||
      mergeIconNeedsGeneration(source) ||
      options.blocked(source.id) ||
      busy
    )
      throw new Error('请先完成并保存来源图集，再预览游戏资产卡。');
    if (
      input !== undefined &&
      (!input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some(
          (key) => !['columns', 'rows', 'marginX', 'marginY', 'gapX', 'gapY'].includes(key)
        ))
    )
      throw new Error('grid 只接受 columns、rows、marginX、marginY、gapX、gapY。');
    if (
      cutInput !== undefined &&
      (!cutInput ||
        typeof cutInput !== 'object' ||
        Array.isArray(cutInput) ||
        Object.keys(cutInput).some((key) => !['mode', 'regions', 'expectedCount'].includes(key)))
    )
      throw new Error('cut 只接受 mode、regions、expectedCount。');
    if (
      cutInput &&
      (cutInput as ImageAtlasCutSettings).regions !== undefined &&
      !['grid', 'content'].includes((cutInput as ImageAtlasCutSettings).mode || '')
    )
      throw new Error('自定义区域必须指定切图方式。');
    const grid = {
      columns: 4,
      rows: 3,
      marginX: 0,
      marginY: 0,
      gapX: 0,
      gapY: 0,
      ...savedGrid(current, source, target),
      ...(input as Partial<ImageAtlasGrid> | undefined),
    };
    review = undefined;
    let revision = current.revision;
    let saved = structuredClone(source);
    busy = true;
    try {
      if (await refreshCanvasMedia(current, options.store, [source], true)) {
        options.changed();
        if (!(await options.save())) throw new Error('来源版本未保存，请保存画布后重新预览。');
        revision = current.revision;
      }
      if (options.current() !== current) throw new Error('画布已切换，请重新预览。');
      saved = structuredClone(source);
      const blob = await withCanvasTimeout(async (signal) => {
        return options.readSource(saved.assetPath!, signal, '图片读取失败，请重新预览。');
      });
      if (!blob.size || blob.size > 128 * 1024 * 1024) throw new Error('图片为空或超过 128 MiB。');
      const background = backgroundFor(saved, target);
      const cut =
        cutInput === undefined ? savedCut(saved, target) : (cutInput as ImageAtlasCutSettings);
      if (saved.generation?.uiAtlasPlan?.nativeLayout)
        validateUiNativeRegions(saved.generation.uiAtlasPlan, cut.regions);
      const layout = saved.generation?.uiAtlasPlan?.nativeLayout;
      const prepared = await prepareImageAtlas(
        blob,
        grid,
        background.color,
        background.mode,
        cut,
        saved.generation?.uiAtlasPlan
      );
      if (layout && (prepared.width !== layout.width || prepared.height !== layout.height))
        throw new Error('实际图集尺寸与预排记录不一致，不能按原尺寸坐标切图。');
      if (saved.generation?.uiAtlasPlan && cut.mode === 'content')
        throw new Error('UI 顺序绑定请使用规则网格预览，不能按内容检测顺序自动配对。');
      const canvas = document.createElement('canvas');
      const regions = drawImageAtlasPreview(
        canvas,
        prepared.canvas,
        grid,
        prepared.regions,
        saved.generation?.uiAtlasPlan?.slots.map((slot) => slot.elementIds.join('/') || slot.role)
      );
      review = {
        id: crypto.randomUUID(),
        canvasId: current.id,
        revision,
        targetId: id,
        source: saved,
        blob,
        grid,
        prepared,
        targetInfo: JSON.stringify(target.imageAssetsInfo),
      };
      const state = reviewState(id);
      if (!state || options.blocked(source.id)) throw new Error('图集或画布已变化，请重新预览。');
      return {
        ...state,
        canvasId: current.id,
        nodeId: id,
        revision,
        width: prepared.width,
        height: prepared.height,
        regions,
        preview: { mimeType: 'image/png', dataUrl: canvas.toDataURL('image/png') },
      };
    } catch (error) {
      review = undefined;
      throw error;
    } finally {
      busy = false;
    }
  }
  async function confirm(id: string, reviewId: string) {
    const value = reviewed(id);
    if (!value || value.id !== reviewId || options.blocked(value.source.id) || busy)
      throw new Error('解析预览已失效或未完成，请重新 preview-image-assets 并核对网格。');
    // 确认只使用本次已预览的字节与参数；成功或失败后都不能重放旧确认。
    review = undefined;
    if (!(await generate(value.source, value.blob, value.grid, id, undefined, value.prepared)))
      throw new Error('游戏资产未生成，请检查画布后重新预览。');
    const node = options.current()?.nodes.find((node) => node.id === id);
    return {
      status: 'completed',
      nodeId: id,
      revision: options.current()?.revision,
      items: node?.imageAssetsInfo?.items,
      nextAction: 'export',
      format: 'images',
    };
  }
  async function runSavedGrid(id: string): Promise<boolean> {
    const current = options.current();
    const target = current?.nodes.find((node) => node.id === id && node.type === 'image-assets');
    const edge = current?.edges.find((edge) => edge.kind === 'image-assets' && edge.to === id);
    const source = current?.nodes.find((node) => node.id === edge?.from && node.type === 'image');
    if (
      !current ||
      !target ||
      !source?.assetPath ||
      source.templatePending ||
      mergeIconNeedsGeneration(source) ||
      options.blocked(source.id) ||
      busy
    )
      throw new Error('请先完成并保存来源图集，再处理资源包。');
    const configuredGrid = savedGrid(current, source, target);
    if (!configuredGrid) throw new Error('资源卡缺少切图参数，请先调整并保存网格后继续。');
    const grid = { ...configuredGrid };
    let savedSource = structuredClone(source);
    const targetGrid = JSON.stringify({
      grid: target.imageAssetsInfo?.grid,
      regions: target.imageAssetsInfo?.regions,
      background: target.imageAssetsInfo?.background,
    });
    function checkTarget() {
      if (
        options.current() !== current ||
        !current!.nodes.includes(target!) ||
        JSON.stringify({
          grid: target!.imageAssetsInfo?.grid,
          regions: target!.imageAssetsInfo?.regions,
          background: target!.imageAssetsInfo?.background,
        }) !== targetGrid ||
        !current!.edges.some(
          (item) => item.kind === 'image-assets' && item.from === source!.id && item.to === id
        )
      )
        throw new Error('资源卡、网格或画布已变化，原有资源包已保留。');
    }
    review = undefined;
    busy = true;
    let blob: Blob;
    try {
      if (await refreshCanvasMedia(current, options.store, [source], true)) options.changed();
      checkTarget();
      savedSource = structuredClone(source);
      blob = await withCanvasTimeout(async (signal) => {
        return options.readSource(
          savedSource.assetPath!,
          signal,
          '来源图集读取失败，资源包未更新。'
        );
      });
      checkTarget();
    } finally {
      busy = false;
    }
    return generate(savedSource, blob, grid, id, checkTarget);
  }
  async function generate(
    source: CanvasNode,
    blob: Blob,
    grid: ImageAtlasGrid,
    targetId?: string,
    checkTarget?: () => void,
    prepared?: PreparedImageAtlas
  ) {
    const canvasId = options.current()?.id;
    const version = canvasNodeVersion(source);
    function currentSource() {
      checkTarget?.();
      const current = options.current();
      const input = current?.nodes.find((node) => node.id === source.id);
      if (
        !current ||
        current.id !== canvasId ||
        canvasNodeVersion(input) !== version ||
        input?.templatePending ||
        options.blocked(source.id)
      )
        throw new Error('图集或当前画布已变化，原有资产未替换，请重新打开解析。');
      return current;
    }
    if (busy) return false;
    busy = true;
    try {
      currentSource();
      const target = options.current()?.nodes.find((node) => node.id === targetId);
      const background = backgroundFor(source, target);
      if (
        source.generation?.uiAtlasPlan &&
        (prepared?.mode === 'content' || (!prepared && savedCut(source, target).mode === 'content'))
      )
        throw new Error('UI 顺序绑定只支持规则网格确认，请先重新预览；旧素材已保留。');
      const split = await splitImageAtlas(
        blob,
        grid,
        background.color,
        background.mode,
        savedCut(source, target),
        prepared,
        source.generation?.uiAtlasPlan
      );
      currentSource();
      options.imageAssetsBindingPlan(source, {
        ...split,
        items: split.items.map((item) => ({ ...item, assetPath: '' })),
      });
      if (source.generation?.uiAtlasPlan) {
        const slots = source.generation.uiAtlasPlan.slots;
        const missing = split.items.flatMap((item, index) =>
          !item.contentRect && slots[index].role !== 'reserve'
            ? [
                item.name +
                  '（' +
                  slots[index].elementIds.join('/') +
                  ' / ' +
                  slots[index].state +
                  '）',
              ]
            : []
        );
        const message =
          'UI 图集的组件格为空：' +
          missing.join('、') +
          '；原图和绑定已保留。先 preview-image-assets 查看；素材移位时调整裁框，真正缺失时只修复此分离卡（' +
          source.id +
          '），再确认切图并继续原分组。预排图不能直接代替透明素材。';
        // Native (015) batches finish with empty slots so the run reaches the UI; the review
        // prompt lists every unreviewed batch. Other UI templates keep the hard stop.
        if (missing.length && !source.generation.uiAtlasPlan.nativeLayout) throw new Error(message);
        if (missing.length) options.log?.(source.title + '：' + message, 'warning');
      }
      if (split.alignmentWarning)
        options.log?.(
          source.title + '：自动校正未通过，已按原槽位裁切，需复核：' + split.alignmentWarning,
          'warning'
        );
      const items = [];
      for (const item of split.items) {
        currentSource();
        const imported = await options.store.importImage(
          canvasId!,
          await item.blob.arrayBuffer(),
          'image/png',
          'resource'
        );
        items.push({
          name: item.name,
          width: item.width,
          height: item.height,
          assetPath: imported.relativePath,
          ...(source.generation?.uiAtlasPlan ? { contentRect: item.contentRect } : {}),
        });
      }
      if (!(await options.save())) throw new Error('画布保存失败，原有游戏资产未替换。');
      const current = currentSource();
      const previous =
        targetId && structuredClone(current.nodes.find((node) => node.id === targetId));
      const nodeId = crypto.randomUUID();
      const edgeId = crypto.randomUUID();
      options.remember();
      const result = options.applyImageAssets(
        current,
        source.id,
        {
          width: split.width,
          height: split.height,
          grid: split.grid,
          ...(split.regions ? { regions: split.regions } : {}),
          cutMode: split.cutMode,
          background: split.background,
          ...(source.generation?.uiAtlasPlan
            ? { uiBindingReview: prepared ? ('confirmed' as const) : ('unreviewed' as const) }
            : {}),
          items,
        },
        nodeId,
        edgeId,
        targetId
      );
      const liveSource = current.nodes.find((node) => node.id === source.id)!;
      const previousGrid = liveSource.uiBaselineGrid;
      if (liveSource.uiBaselineGrid && !selectedUiExtraction(current, liveSource))
        liveSource.uiBaselineGrid = { ...split.grid };
      options.changed();
      if (!(await options.save())) {
        liveSource.uiBaselineGrid = previousGrid;
        if (previous) {
          for (const key of Object.keys(result))
            delete (result as unknown as Record<string, unknown>)[key];
          Object.assign(result, previous);
        } else {
          current.nodes = current.nodes.filter((node) => node.id !== result.id);
          current.edges = current.edges.filter((edge) => edge.id !== edgeId);
        }
        options.changed();
        options.render();
        throw new Error('游戏资产保存失败，原有资产已保留，请先保存画布后重试。');
      }
      options.select(result.id);
      options.render();
      return true;
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'ATLAS_LAYOUT_INVALID')
        (error as Error).message += source.generation?.uiAtlasPlan
          ? ' 请核对图集的槽位数量、顺序和主体完整性，修正图集后重试；原有资产保留，不会自动重新生图。'
          : ' 请打开「调整参数」选择「按内容切图」并核对裁切框；原有资产保留，不会自动重新生图。';
      options.error((error as Error).message);
      throw error;
    } finally {
      busy = false;
    }
  }
  async function open(sourceId: string, targetId?: string): Promise<boolean> {
    const current = options.current();
    const source = current?.nodes.find((node) => node.id === sourceId && node.type === 'image');
    if (
      !source?.assetPath ||
      source.templatePending ||
      mergeIconNeedsGeneration(source) ||
      options.blocked(sourceId) ||
      busy
    ) {
      options.error('请先完成并保存道具图集，再生成游戏资产。');
      return Promise.resolve(false);
    }
    if (!targetId) {
      const decision = options.resolve(sourceId);
      if (decision?.kind === 'blocked') {
        options.error(decision.message!);
        return Promise.resolve(false);
      }
      if (decision?.kind === 'reuse') targetId = decision.nodeId;
    }
    if (document.querySelector('[data-image-atlas-dialog]')) return Promise.resolve(false);
    busy = true;
    try {
      if (await refreshCanvasMedia(current!, options.store, [source], true)) options.changed();
      if (options.current() !== current) throw new Error('画布已切换，请重新打开解析。');
    } finally {
      busy = false;
    }
    const saved = structuredClone(source);
    const target = current?.nodes.find((node) => node.id === targetId);
    const targetInfo = JSON.stringify(target?.imageAssetsInfo);
    return new Promise((resolve) => {
      let succeeded = false;
      options.openImageAtlasDialog(saved, options.store.mediaUrl, {
        grid: savedGrid(current!, source, target),
        cut: {
          ...savedCut(source, target),
          expectedCount: target?.imageAssetsInfo?.items.length || 0,
        },
        backgroundColor: backgroundFor(saved, target).color,
        backgroundMode: backgroundFor(saved, target).mode,
        create: async (blob, grid, prepared) => {
          succeeded = await generate(
            saved,
            blob,
            grid,
            targetId,
            () => {
              if (
                options.current() !== current ||
                (target &&
                  (!current!.nodes.includes(target) ||
                    JSON.stringify(target.imageAssetsInfo) !== targetInfo))
              )
                throw new Error('目标资源卡已变化，请重新打开解析，原有资产已保留。');
            },
            prepared
          );
          return succeeded;
        },
        closed: () => resolve(succeeded),
      });
    });
  }
  return {
    open,
    runSavedGrid,
    preview,
    confirm,
    reviewState,
    get isBusy() {
      return busy;
    },
    run(id: string) {
      const current = options.current();
      const edge = current?.edges.find((edge) => edge.kind === 'image-assets' && edge.to === id);
      if (!edge) {
        options.error('来源图集不存在，已保存素材仍可下载。');
        return Promise.resolve(false);
      }
      return open(edge.from, id);
    },
    render(card: HTMLElement, node: CanvasNode) {
      const content = document.createElement('div');
      content.className = 'image-assets-content';
      const items = node.imageAssetsInfo?.items || [];
      const heading = document.createElement('small');
      heading.textContent = items.length ? items.length + ' 张独立 PNG' : '等待解析道具图集';
      const grid = document.createElement('div');
      grid.className = 'image-assets-grid';
      grid.style.gridTemplateColumns =
        'repeat(' + Math.min(6, node.imageAssetsInfo?.grid.columns || 4) + ', minmax(64px, 1fr))';
      for (const item of items) {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = options.store.mediaUrl(item.assetPath);
        image.alt = item.name;
        image.loading = 'lazy';
        image.draggable = false;
        const name = document.createElement('figcaption');
        name.textContent = item.name + '.png';
        figure.append(image, name);
        grid.append(figure);
      }
      content.append(heading, grid);
      card.append(content);
    },
  };
}

export const IMAGE_ASSETS_STYLES =
  '.card.image-assets { display:flex;flex-direction:column; } .image-assets-content { display:flex;flex-direction:column;gap:8px;min-height:0;flex:1;margin-top:8px; } .image-assets-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px;overflow:auto;min-height:0;flex:1; } .image-assets-grid figure { margin:0;min-width:0; } .image-assets-grid img { display:block;width:100%;height:90px;object-fit:contain;background:repeating-conic-gradient(#30343d 0% 25%,#24272e 0% 50%) 0 0/14px 14px;border-radius:6px; } .image-assets-grid figcaption { font-size:11px;text-align:center;color:#c8c3ba; }';
