declare const document: any;
import type { CanvasDocument, CanvasNode } from './model.js';
import type { CanvasDocumentStore } from './store.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import { splitImageAtlas } from './imageAtlasExport.js';
import { applyImageAssets } from './imageAssets.js';
import { canvasNodeVersion } from './dependencies.js';
import { openImageAtlasDialog } from './imageAtlasUi.js';
import { mergeIconGrid, mergeIconNeedsGeneration } from './mergeIcons.js';

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
  async function generate(source: CanvasNode, blob: Blob, grid: ImageAtlasGrid, targetId?: string) {
    const canvasId = options.current()?.id;
    const version = canvasNodeVersion(source);
    function currentSource() {
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
      const split = await splitImageAtlas(blob, grid);
      const items = [];
      for (const item of split.items) {
        currentSource();
        const imported = await options.store.importImage(
          canvasId!,
          await item.blob.arrayBuffer(),
          'image/png'
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
