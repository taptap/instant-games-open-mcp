import assetPresetData from './assetPresetData.json';
import type { CanvasPreset } from './presets.js';
import { uiBatchAtlasPrompt, uiNativeAtlasPrompt } from './uiAssetBindings.js';

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
      if (node.uiAtlasGroup && usesPrelayout) {
        node.uiBaselinePrompt = uiNativeAtlasPrompt();
        if (node.generation) {
          const order = node.generation.prompt.split('UI 槽位绑定：')[1];
          node.generation.prompt =
            node.uiBaselinePrompt +
            (order ? '\nUI 槽位绑定：' + order.split('\n抠图底色约定：')[0] : '');
        }
      }
      if (node.uiAtlasGroup && !usesPrelayout) {
        const promptOnly = definition.id === '7e1cb6ad-732f-4dc3-a951-000000000013';
        const category = {
          controls: '按钮、页签、标题底板和细长条；不含文字和上层图标',
          icons: '独立小图标、星星、箭头和背包物品；不含底框',
          equipment: promptOnly
            ? '装备物品本体；不含槽框、星级和底板'
            : '装备物品与槽框，物品和空槽框分别占格',
          panels: promptOnly
            ? '完整外围主面板、各分区面板、标题底板和长条底板；各层独立，不嵌套叠放'
            : '大面板底板；不含文字、人物和上层控件',
          artwork: '头像、人物立绘和插画；不含背后的面板和框',
          background: '完整环境背景',
        }[node.uiAtlasGroup];
        const grid = node.uiAtlasPlan?.grid;
        if (grid) node.uiBaselineGrid = { ...grid };
        node.uiBaselinePrompt = [
          ...(promptOnly
            ? [
                '任务：只从参考图提取【' + category + '】，禁止输出其它分类。',
                '保留：本分类素材的完整轮廓、原比例、颜色和材质；底板与所属边框保持一体。',
                '移除：所有普通文字、数字，以及本分类之外的背景、底板或前景叠加物。空底板不得带图标、物品或人物；前景不得带底框。',
                ...(node.uiAtlasGroup === 'controls'
                  ? [
                      '每种按钮和页签分别输出正常与按下状态，两态轮廓、尺寸和锚点一致；进度轨道与填充分层。',
                    ]
                  : []),
                ...(node.uiAtlasGroup === 'panels'
                  ? [
                      '每块面板内部只保留底板纹理，移除全部子槽框、头像框、按钮、进度条和分区子面板并补底。主面板与各子面板必须独立输出，禁止嵌套，禁止保留整屏布局。',
                    ]
                  : []),
                ...(node.uiAtlasGroup === 'artwork'
                  ? [
                      '仅提取原稿实际存在的人物或头像，不额外生成同一人物的半身像、头像或其它姿态。头像去掉外围装饰框。所有主体单行横向排列，等比缩小以完整放入画幅，各主体矩形包围框之间至少留 48 像素透明间隔；不得上下错位、穿插或跨列。',
                    ]
                  : []),
                '输出：带真实 Alpha 通道的透明 PNG。素材逐行独立排列，同一行上下对齐，不跨行；行间和素材之间至少留 24 像素完全透明间隔，画面四边至少留 32 像素透明边距。不得画网格线、编号或棋盘格。',
                ...(node.uiAtlasGroup === 'background'
                  ? ['只输出一张补全遮挡的环境背景，保留场景本体，移除全部 UI 和人物。']
                  : []),
              ]
            : [uiBatchAtlasPrompt(node.uiAtlasGroup)]),
          '提取范围：' + category + '。仅依据当前参考图，不沿用示例清单。',
          '相同形状、颜色和状态的重复素材只输出一次；不同颜色或状态分别保留。',
          ...(grid && node.uiAtlasGroup !== 'background' && !promptOnly
            ? [
                '无识图时使用 ' +
                  grid.columns +
                  ' 列 × ' +
                  grid.rows +
                  ' 行，按从左到右、从上到下排布，不足的格留空。',
              ]
            : []),
        ].join('\n');
        if (promptOnly && node.uiAtlasGroup === 'background') {
          node.uiBaselinePrompt = [
            '任务：从背景准备图恢复一张完整的环境背景。',
            '保留：原场景的构图、光照、颜色和纹理，保持参考图宽高比。',
            '移除：全部 UI，包括顶部标题栏、底部栏、四周金属边框、四角齿轮与装饰花纹、主面板、底板、槽框、长条和按钮。四角装饰属于界面，不属于场景。清除后用场景纹理自然补全到四个角和四条边。',
            '输出：一张铺满整个画幅的完整背景 PNG，四边延伸到图像边缘，不透明，不留空白，不做透明图集，不裁切或缩小场景。',
          ].join('\n');
          if (node.generation) delete node.generation.cutoutColor;
        }
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
