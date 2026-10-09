declare const document: any;
import type { CanvasDocument, CanvasNode } from './model.js';
import { selectedUiExtraction } from './uiRecognition.js';
import type { CanvasDocumentStore } from './store.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import { splitImageAtlas } from './imageAtlasExport.js';
import { applyImageAssets } from './imageAssets.js';
import { canvasNodeVersion } from './dependencies.js';
import { openImageAtlasDialog, drawImageAtlasPreview } from './imageAtlasUi.js';
import { mergeIconGrid, mergeIconNeedsGeneration } from './mergeIcons.js';
import { isGameUiResource } from './uiWorkflowHandoff.js';
import { withCanvasTimeout } from './requestTimeout.js';
import { uiCutoutRgb, uiCutoutPrompt } from './uiCutout.js';

export function createImageAssetsUi(options: {
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
}) {
  let busy = false;
  let failedAtlas:
    | { targetId: string; canvasId: string; sourceId: string; version?: string }
    | undefined;
  let review:
    | {
        id: string;
        canvasId: string;
        revision: number;
        targetId: string;
        source: CanvasNode;
        blob: Blob;
        grid: ImageAtlasGrid;
      }
    | undefined;
  function reviewed(id: string) {
    const current = options.current();
    if (!review || review.targetId !== id) return;
    const source = current?.nodes.find((node) => node.id === review!.source.id);
    if (
      current?.id !== review.canvasId ||
      current.revision !== review.revision ||
      canvasNodeVersion(source) !== canvasNodeVersion(review.source) ||
      source?.templatePending ||
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
        nextAction: 'confirm-image-assets',
        message:
          '请查看网格预览，核对每格物品完整且不跨格，再携带当前 reviewId 显式确认。参数变化需重新预览。',
      }
    );
  }
  async function preview(id: string, input?: unknown) {
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
    const grid = {
      columns: 4,
      rows: 3,
      marginX: 0,
      marginY: 0,
      gapX: 0,
      gapY: 0,
      ...(source.mergeIcons
        ? mergeIconGrid(source.mergeIcons)
        : source.uiBaselineGrid || target.imageAssetsInfo?.grid),
      ...selectedUiExtraction(current, source)?.grid,
      ...(input as Partial<ImageAtlasGrid> | undefined),
    };
    review = undefined;
    const revision = current.revision;
    const saved = structuredClone(source);
    busy = true;
    try {
      const blob = await withCanvasTimeout(async (signal) => {
        const response = await fetch(options.store.mediaUrl(saved.assetPath!), { signal });
        if (!response.ok) throw new Error('图片读取失败，请重新预览。');
        return response.blob();
      });
      if (!blob.size || blob.size > 128 * 1024 * 1024) throw new Error('图片为空或超过 128 MiB。');
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement('canvas');
        const regions = drawImageAtlasPreview(canvas, bitmap, grid);
        review = {
          id: crypto.randomUUID(),
          canvasId: current.id,
          revision,
          targetId: id,
          source: saved,
          blob,
          grid,
        };
        const state = reviewState(id);
        if (!state || options.blocked(source.id)) throw new Error('图集或画布已变化，请重新预览。');
        return {
          ...state,
          canvasId: current.id,
          nodeId: id,
          revision,
          width: bitmap.width,
          height: bitmap.height,
          regions,
          preview: { mimeType: 'image/png', dataUrl: canvas.toDataURL('image/png') },
        };
      } finally {
        bitmap.close();
      }
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
    if (!(await generate(value.source, value.blob, value.grid, id)))
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
    failedAtlas = undefined;
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
    const savedGrid = source.mergeIcons
      ? mergeIconGrid(source.mergeIcons)
      : selectedUiExtraction(current, source)?.grid ||
        source.uiBaselineGrid ||
        target.imageAssetsInfo?.grid;
    if (!savedGrid) throw new Error('资源卡缺少切图参数，请先调整并保存网格后继续。');
    const grid = { ...savedGrid };
    const savedSource = structuredClone(source);
    const targetGrid = JSON.stringify(target.imageAssetsInfo?.grid);
    function checkTarget() {
      if (
        options.current() !== current ||
        !current!.nodes.includes(target!) ||
        JSON.stringify(target!.imageAssetsInfo?.grid) !== targetGrid ||
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
      blob = await withCanvasTimeout(async (signal) => {
        const response = await fetch(options.store.mediaUrl(savedSource.assetPath!), { signal });
        if (!response.ok) throw new Error('来源图集读取失败，资源包未更新。');
        return response.blob();
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
    checkTarget?: () => void
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
      // The game UI template explicitly generates magenta-backed atlases.
      const background =
        target && isGameUiResource(options.current() || undefined, target)
          ? uiCutoutRgb(source.generation?.cutoutColor)
          : undefined;
      let split: Awaited<ReturnType<typeof splitImageAtlas>>;
      try {
        split = await splitImageAtlas(blob, grid, background);
      } catch (error) {
        currentSource();
        if (
          background &&
          targetId &&
          (error as Error & { code?: string }).code === 'ATLAS_LAYOUT_INVALID'
        )
          failedAtlas = { targetId, canvasId: canvasId!, sourceId: source.id, version };
        throw error;
      }
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
        });
      }
      if (!(await options.save())) throw new Error('画布保存失败，原有游戏资产未替换。');
      const current = currentSource();
      const previous =
        targetId && structuredClone(current.nodes.find((node) => node.id === targetId));
      const nodeId = crypto.randomUUID();
      const edgeId = crypto.randomUUID();
      options.remember();
      const result = applyImageAssets(
        current,
        source.id,
        { width: split.width, height: split.height, grid: split.grid, items },
        nodeId,
        edgeId,
        targetId
      );
      options.changed();
      if (!(await options.save())) {
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
      options.error((error as Error).message);
      throw error;
    } finally {
      busy = false;
    }
  }
  function open(sourceId: string, targetId?: string): Promise<boolean> {
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
    const saved = structuredClone(source);
    const target = current?.nodes.find((node) => node.id === targetId);
    return new Promise((resolve) => {
      let succeeded = false;
      openImageAtlasDialog(saved, options.store.mediaUrl, {
        grid: source.mergeIcons ? mergeIconGrid(source.mergeIcons) : target?.imageAssetsInfo?.grid,
        create: async (blob, grid) => {
          succeeded = await generate(saved, blob, grid, targetId);
          return succeeded;
        },
        closed: () => resolve(succeeded),
      });
    });
  }
  return {
    open,
    runSavedGrid,
    retryPrompt(id: string) {
      const current = options.current();
      const target = current?.nodes.find((node) => node.id === id);
      const source = current?.nodes.find((node) => node.id === failedAtlas?.sourceId);
      const grid =
        current && source
          ? selectedUiExtraction(current, source)?.grid ||
            source.uiBaselineGrid ||
            target?.imageAssetsInfo?.grid
          : undefined;
      if (failedAtlas?.targetId !== id || !grid) return '';
      return uiCutoutPrompt(
        '输出排版校正：必须恰好 ' +
          grid.columns * grid.rows +
          ' 个完整独立素材，' +
          grid.columns +
          ' 列 × ' +
          grid.rows +
          ' 行，每格只包含一个完整对象，不得在同一格摆放多个独立对象或减少格子数量。' +
          '保持本步骤要求的素材类别及保留、移除规则。每格四周至少留15%纯洋红空白，' +
          '所有格外像素为RGB(255,0,255)，不要噪点、渐变、网格线；保持每个主体完整。',
        source?.generation?.cutoutColor || '#FF00FF'
      );
    },
    retrySource(id: string) {
      const current = options.current();
      const source = current?.nodes.find((node) => node.id === failedAtlas?.sourceId);
      if (
        failedAtlas?.targetId === id &&
        current?.id === failedAtlas.canvasId &&
        source?.generation?.prompt &&
        canvasNodeVersion(source) === failedAtlas.version &&
        current.edges.some(
          (edge) => edge.from === source.id && edge.to === id && edge.kind === 'image-assets'
        )
      )
        return source.id;
    },
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
