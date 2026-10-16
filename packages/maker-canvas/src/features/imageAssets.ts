import type { ImageAssetsInfo, CanvasDocument, CanvasNode, UiAtlasPlan } from '../contracts.js';
import { imageAtlasRegions } from './imageAtlas.js';
import { validateAtlasCrops } from './atlasContent.js';
import { snapshotCanvasSource } from '../core/dependencies.js';
import { mergeIconNeedsGeneration } from './mergeIcons.js';
import { validateUiAtlasPlanStructure, validateUiNativeRegions } from './uiAssetBindings.js';

export function validateImageAssetsInfoStructure(value: unknown): ImageAssetsInfo {
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
  if (info.cutMode !== undefined && !['grid', 'content'].includes(info.cutMode))
    throw new Error('游戏资产切图模式无效。');
  const regions =
    info.regions !== undefined
      ? validateAtlasCrops(info.width, info.height, info.regions)
      : nominal;
  if (info.items.length !== regions.length) throw new Error('游戏资产数量与网格不一致。');
  if (info.cutMode === 'grid' && regions.length !== nominal.length)
    throw new Error('规则切图区域数量与网格不一致。');
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
      !item.assetPath.trim() ||
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
    ...(info.cutMode ? { cutMode: info.cutMode } : {}),
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

export function imageAssetsBindingPlanStructure(
  source: CanvasNode,
  info: ImageAssetsInfo
): UiAtlasPlan | undefined {
  if (!source.generation?.uiAtlasPlan) return;
  const plan = validateUiAtlasPlanStructure(source.generation.uiAtlasPlan);
  if (plan.nativeLayout) {
    const layout = plan.nativeLayout;
    validateUiNativeRegions(plan, info.regions);
    if (
      info.width !== layout.width ||
      info.height !== layout.height ||
      info.items.length !== layout.regions.length ||
      info.items.some(
        (item, index) =>
          item.width !== layout.regions[index].width || item.height !== layout.regions[index].height
      )
    )
      throw new Error('原尺寸切图与已记录的位置或尺寸不一致，不能沿用绑定。');
  }
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

export function applyImageAssetsToDocument(
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
  const saved = validateImageAssetsInfoStructure(info);
  imageAssetsBindingPlanStructure(source, saved);
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
