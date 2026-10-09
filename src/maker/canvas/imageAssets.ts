import type { CanvasDocument, CanvasNode } from './model.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import { imageAtlasRegions } from './imageAtlasExport.js';
import { snapshotCanvasSource } from './dependencies.js';
import { createCanvasZip } from './zipArchive.js';
import { mergeIconNeedsGeneration } from './mergeIcons.js';

export interface ImageAssetsInfo {
  width: number;
  height: number;
  grid: ImageAtlasGrid;
  items: Array<{ name: string; assetPath: string; width: number; height: number }>;
}

export function validateImageAssetsInfo(value: unknown): ImageAssetsInfo {
  const info = value as ImageAssetsInfo;
  if (!info || typeof info !== 'object' || !info.grid || !Array.isArray(info.items))
    throw new Error('游戏资产列表无效。');
  const regions = imageAtlasRegions(info.width, info.height, info.grid);
  if (info.items.length !== regions.length) throw new Error('游戏资产数量与网格不一致。');
  const paths = new Set<string>();
  const items = info.items.map((item, index) => {
    const region = regions[index];
    if (
      !item ||
      item.name !== region.name ||
      item.width !== region.width ||
      item.height !== region.height ||
      typeof item.assetPath !== 'string' ||
      !new RegExp(
        '^(assets/image/canvas-|[.]maker/canvases/[0-9a-f-]{36}/resources/)[0-9a-f-]{36}[.]png$',
        'i'
      ).test(item.assetPath) ||
      paths.has(item.assetPath)
    )
      throw new Error('游戏资产名称、尺寸或素材路径无效。');
    paths.add(item.assetPath);
    return { name: item.name, assetPath: item.assetPath, width: item.width, height: item.height };
  });
  return {
    width: info.width,
    height: info.height,
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
  const saved = validateImageAssetsInfo(info);
  const entries = [];
  let total = 0;
  for (const item of saved.items) {
    const response = await fetch(mediaUrl(item.assetPath));
    if (!response.ok) throw new Error('素材读取失败，未导出文件：' + item.name);
    const blob = await response.blob();
    total += blob.size;
    if (!blob.size || blob.size > 20 * 1024 * 1024 || total > 128 * 1024 * 1024)
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
  return createCanvasZip(entries);
}
