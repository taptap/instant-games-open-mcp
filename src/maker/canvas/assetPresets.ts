import assetPresetData from './assetPresetData.json';
import type { CanvasPreset } from './presets.js';
import { uiBatchAtlasPrompt } from './uiAssetBindings.js';

export function createAssetPresets(): CanvasPreset[] {
  return (assetPresetData as unknown as CanvasPreset[]).map(({ assets, ...definition }) => {
    const template = structuredClone(definition);
    let correctedReferences = false;
    for (const node of template.nodes) {
      const usesPrelayout =
        node.uiAtlasPrelayout ||
        template.edges.some(
          (edge) =>
            edge.to === node.id &&
            template.nodes.some((source) => source.id === edge.from && source.uiAtlasPrelayout)
        );
      if (node.uiAtlasGroup && !usesPrelayout) {
        const category = {
          controls: '按钮、页签、标题底板和细长条；不含文字和上层图标',
          icons: '独立小图标、星星、箭头和背包物品；不含底框',
          equipment: '装备物品与槽框，物品和空槽框分别占格',
          panels: '大面板底板；不含文字、人物和上层控件',
          artwork: '头像、人物立绘和插画；不含背后的面板和框',
          background: '完整环境背景',
        }[node.uiAtlasGroup];
        const grid = node.uiAtlasPlan?.grid;
        if (grid) node.uiBaselineGrid = { ...grid };
        node.uiBaselinePrompt = [
          uiBatchAtlasPrompt(node.uiAtlasGroup),
          '提取范围：' + category + '。仅依据当前参考图，不沿用示例清单。',
          '相同形状、颜色和状态的重复素材只输出一次；不同颜色或状态分别保留。',
          ...(grid && node.uiAtlasGroup !== 'background'
            ? [
                '无识图时使用 ' +
                  grid.columns +
                  ' 列 × ' +
                  grid.rows +
                  ' 行，按从左到右、从上到下排布，不足的格留空。',
              ]
            : []),
        ].join('\n');
        if (node.generation) node.generation.prompt = node.uiBaselinePrompt;
      }
      if (!node.referenceInput || !node.generation?.referenceImagePaths?.length) continue;
      const sources = new Set(
        template.edges
          .filter((edge) => edge.to === node.id && edge.kind === 'image-variant')
          .map((edge) => template.nodes.find((source) => source.id === edge.from)?.assetPath)
      );
      const references = node.generation.referenceImagePaths.filter((path) => !sources.has(path));
      if (references.length !== node.generation.referenceImagePaths.length) {
        node.generation.referenceImagePaths = references;
        correctedReferences = true;
      }
    }
    if (correctedReferences) template.revision++;
    return {
      ...template,
      assets: Object.fromEntries(
        Object.entries(assets).map(([path, asset]) => [path, { ...asset }])
      ),
    };
  });
}
