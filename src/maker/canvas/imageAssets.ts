import type { CanvasDocument, CanvasNode } from './model.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import { imageAtlasRegions } from './imageAtlasExport.js';
import { validateAtlasCrops } from './atlasContent.js';
import type { ImageAtlasCrop } from './atlasContent.js';
import { snapshotCanvasSource } from './dependencies.js';
import { createCanvasZip } from './zipArchive.js';
import { mergeIconNeedsGeneration } from './mergeIcons.js';
import { validateUiAtlasPlan, type UiAtlasPlan } from './uiAssetBindings.js';

export interface ImageAssetsInfo {
  uiBindingReview?: 'unreviewed' | 'confirmed' | 'recorded';
  width: number;
  height: number;
  grid: ImageAtlasGrid;
  regions?: ImageAtlasCrop[];
  background?: { color?: [number, number, number]; mode: 'all' | 'connected' };
  items: Array<{
    name: string;
    assetPath: string;
    width: number;
    height: number;
    contentRect?: [number, number, number, number];
  }>;
}

export function validateImageAssetsInfo(value: unknown): ImageAssetsInfo {
  const info = value as ImageAssetsInfo;
  if (!info || typeof info !== 'object' || !info.grid || !Array.isArray(info.items))
    throw new Error('游戏资产列表无效。');
  if (
    info.uiBindingReview !== undefined &&
    !['unreviewed', 'confirmed', 'recorded'].includes(info.uiBindingReview)
  )
    throw new Error('UI 素材绑定核对状态无效。');
  if (
    info.background !== undefined &&
    (!info.background ||
      !['all', 'connected'].includes(info.background.mode) ||
      (info.background.color !== undefined &&
        (!Array.isArray(info.background.color) ||
          info.background.color.length !== 3 ||
          !info.background.color.every(
            (channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255
          ))))
  )
    throw new Error('游戏资产背景处理设置无效。');
  const nominal = imageAtlasRegions(info.width, info.height, info.grid);
  const regions =
    info.regions !== undefined
      ? validateAtlasCrops(info.width, info.height, info.regions)
      : nominal;
  if (info.items.length !== regions.length) throw new Error('游戏资产数量与网格不一致。');
  const paths = new Set<string>();
  const items = info.items.map((item, index) => {
    const region = regions[index];
    if (
      !item ||
      item.name !== region.name ||
      item.width !==
        ('outputWidth' in region ? (region.outputWidth ?? region.width) : region.width) ||
      item.height !==
        ('outputHeight' in region ? (region.outputHeight ?? region.height) : region.height) ||
      typeof item.assetPath !== 'string' ||
      !new RegExp(
        '^(assets/image/canvas-|[.]maker/canvases/[0-9a-f-]{36}/resources/)[0-9a-f-]{36}[.]png$',
        'i'
      ).test(item.assetPath) ||
      paths.has(item.assetPath)
    )
      throw new Error('游戏资产名称、尺寸或素材路径无效。');
    paths.add(item.assetPath);
    const rect = item.contentRect;
    if (
      rect !== undefined &&
      (!Array.isArray(rect) ||
        rect.length !== 4 ||
        !rect.every(Number.isInteger) ||
        rect[0] < 0 ||
        rect[1] < 0 ||
        rect[2] <= 0 ||
        rect[3] <= 0 ||
        rect[0] + rect[2] > item.width ||
        rect[1] + rect[3] > item.height)
    )
      throw new Error('UI 素材内容框超出 PNG 范围。');
    return {
      name: item.name,
      assetPath: item.assetPath,
      width: item.width,
      height: item.height,
      ...(rect ? { contentRect: [...rect] as [number, number, number, number] } : {}),
    };
  });
  return {
    ...(info.uiBindingReview ? { uiBindingReview: info.uiBindingReview } : {}),
    width: info.width,
    height: info.height,
    ...(info.regions !== undefined
      ? { regions: validateAtlasCrops(info.width, info.height, info.regions) }
      : {}),
    ...(info.background !== undefined
      ? {
          background: {
            mode: info.background.mode,
            ...(info.background.color
              ? { color: [...info.background.color] as [number, number, number] }
              : {}),
          },
        }
      : {}),
    grid: {
      columns: info.grid.columns,
      rows: info.grid.rows,
      marginX: info.grid.marginX,
      marginY: info.grid.marginY,
      gapX: info.grid.gapX,
      gapY: info.grid.gapY,
    },
    items,
  };
}

export function imageAssetsBindingPlan(
  source: CanvasNode,
  info: ImageAssetsInfo
): UiAtlasPlan | undefined {
  if (!source.generation?.uiAtlasPlan) return;
  const plan = validateUiAtlasPlan(source.generation.uiAtlasPlan);
  if (
    plan.slots.length !== info.items.length &&
    !(
      info.uiBindingReview === 'recorded' &&
      info.items.length < plan.slots.length &&
      plan.slots.slice(info.items.length).every((slot) => slot.role === 'reserve')
    )
  )
    throw new Error('切图数量与本次生成的 UI 顺序清单不一致，不能自动绑定。');
  if (
    info.uiBindingReview !== 'recorded' &&
    (plan.grid.columns !== info.grid.columns || plan.grid.rows !== info.grid.rows)
  )
    throw new Error('UI 图集行列已变化，不能沿用原槽位绑定。');
  return plan;
}

export function applyImageAssets(
  document: CanvasDocument,
  sourceId: string,
  info: ImageAssetsInfo,
  nodeId: string,
  edgeId: string,
  targetId?: string
): CanvasNode {
  const source = document.nodes.find((node) => node.id === sourceId && node.type === 'image');
  if (!source?.assetPath || source.templatePending || mergeIconNeedsGeneration(source))
    throw new Error('请先完成道具图集，再生成游戏资产。');
  const saved = validateImageAssetsInfo(info);
  imageAssetsBindingPlan(source, saved);
  if (targetId) {
    const target = document.nodes.find(
      (node) => node.id === targetId && node.type === 'image-assets'
    );
    if (
      !target ||
      !document.edges.some(
        (edge) => edge.kind === 'image-assets' && edge.from === sourceId && edge.to === targetId
      )
    )
      throw new Error('游戏资产目标或来源已变化。');
    target.imageAssetsInfo = saved;
    target.sourceSnapshot = snapshotCanvasSource(source);
    delete target.templatePending;
    return target;
  }
  const node: CanvasNode = {
    id: nodeId,
    type: 'image-assets',
    title: '游戏资产',
    x: source.x + source.width + 64,
    y: source.y,
    width: 480,
    height: 460,
    ...(source.sectionId ? { sectionId: source.sectionId } : {}),
    imageAssetsInfo: saved,
    sourceSnapshot: snapshotCanvasSource(source),
  };
  document.nodes.push(node);
  document.edges.push({ id: edgeId, from: source.id, to: node.id, kind: 'image-assets' });
  return node;
}

export async function createImageAssetsZip(
  info: ImageAssetsInfo,
  mediaUrl: (path: string) => string
): Promise<Blob> {
  return createCanvasZip(await collectImageAssetEntries(info, mediaUrl));
}

export async function collectImageAssetEntries(
  info: ImageAssetsInfo,
  mediaUrl: (path: string) => string,
  budget = { bytes: 0 },
  readBlob?: (path: string) => Promise<Blob>
): Promise<Array<{ name: string; blob: Blob }>> {
  const saved = validateImageAssetsInfo(info);
  const entries = [];
  for (const item of saved.items) {
    const blob = readBlob
      ? await readBlob(item.assetPath)
      : await (async () => {
          const response = await fetch(mediaUrl(item.assetPath));
          if (!response.ok) throw new Error('素材读取失败，未导出文件：' + item.name);
          return response.blob();
        })();
    budget.bytes += blob.size;
    if (!blob.size || blob.size > 20 * 1024 * 1024 || budget.bytes > 128 * 1024 * 1024)
      throw new Error('素材为空或导出包过大，未导出文件。');
    const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    if (
      header.length < 24 ||
      [137, 80, 78, 71, 13, 10, 26, 10].some((byte, index) => header[index] !== byte)
    )
      throw new Error('素材不是有效 PNG，未导出文件。');
    const dimensions = new DataView(header.buffer);
    if (dimensions.getUint32(16) !== item.width || dimensions.getUint32(20) !== item.height)
      throw new Error('素材尺寸与保存记录不一致，未导出文件。');
    entries.push({ name: item.name + '.png', blob });
  }
  return entries;
}
