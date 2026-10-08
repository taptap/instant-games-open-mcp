import type { CanvasNode } from './model.js';

export interface MergeIconSettings {
  stageCount: number;
  instructions: string;
  series: Array<{ name: string; stages: string[] }>;
}

export function validateMergeIcons(value: unknown): MergeIconSettings {
  const settings = value as MergeIconSettings;
  if (
    !settings ||
    typeof settings !== 'object' ||
    !Number.isInteger(settings.stageCount) ||
    settings.stageCount < 2 ||
    settings.stageCount > 33 ||
    !Array.isArray(settings.series) ||
    settings.series.length < 1 ||
    settings.series.length > 3
  )
    throw new Error('二合图标需要 1～3 个系列，每个系列 2～33 个阶段。');
  if (typeof settings.instructions !== 'string' || settings.instructions.length > 400)
    throw new Error('补充要求最多 400 字。');
  const series = settings.series.map((item) => {
    if (
      !item ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 40 ||
      !Array.isArray(item.stages) ||
      item.stages.length < settings.stageCount ||
      item.stages.length > 33 ||
      item.stages.some((stage) => typeof stage !== 'string' || stage.length > 60)
    )
      throw new Error('请填写系列名称；每阶段描述最多 60 字，留空由模型设计。');
    return { name: item.name.trim(), stages: [...item.stages] };
  });
  return { stageCount: settings.stageCount, instructions: settings.instructions.trim(), series };
}

export function mergeIconPrompt(value: MergeIconSettings): string {
  const settings = validateMergeIcons(value);
  const prompt = [
    '生成一张二合游戏升级图标图集。输入图片只作为画风参考，不复制参考图身份。统一材质、描边、视角、色彩与光照。',
    '严格' +
      settings.stageCount +
      '列×' +
      settings.series.length +
      '行，共' +
      settings.stageCount * settings.series.length +
      '个图标；每行一个系列，左到右从Lv.1逐级升级。',
    '同系列保持可识别的核心造型，按数量、结构、工艺与价值循序递进；不能只是放大或变色，不能突然变成不相关物品。相邻等级必须有明显差异。空白描述由模型合理补全，不输出文字说明。',
    ...settings.series.map(
      (item, index) =>
        '第' +
        (index + 1) +
        '行「' +
        item.name +
        '」：' +
        item.stages
          .slice(0, settings.stageCount)
          .map(
            (stage, level) => 'Lv.' + (level + 1) + '：' + (stage.trim() || '按完整升级链自动设计')
          )
          .join('；')
    ),
    settings.instructions,
    '游戏素材约束：每格仅一件完整图标组合，均匀等距网格，主体居中且四周至少15%留白。严格保持指定总数与等级顺序，不跨格、不裁切、不重复。不要等级文字、数字、标签、网格线、水印、地面或投影。全图使用均匀纯洋红#FF00FF背景，主体不用洋红，不加光晕或透明玻璃；供后续抠背景及规则网格拆分。',
  ]
    .filter(Boolean)
    .join(String.fromCharCode(10));
  if (prompt.length > 8000) throw new Error('阶段描述过长，请精简后再生成。');
  return prompt;
}

export function mergeIconGrid(settings: MergeIconSettings) {
  const saved = validateMergeIcons(settings);
  return {
    columns: saved.stageCount,
    rows: saved.series.length,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
  };
}

export function mergeIconNeedsGeneration(node: CanvasNode): boolean {
  return Boolean(
    node.mergeIcons &&
      (!node.assetPath || node.generation?.prompt !== mergeIconPrompt(node.mergeIcons))
  );
}

export function configureMergeIcons(node: CanvasNode, value: unknown) {
  if (node.type !== 'image') throw new Error('二合图标设置只能用于图片卡。');
  const settings = validateMergeIcons(value);
  const prompt = mergeIconPrompt(settings);
  node.mergeIcons = settings;
  node.referenceInput ||= { includeSelf: false };
  if (node.assetPath) {
    if (node.sectionId) node.templatePending = true;
  } else {
    node.generationDraft = {
      operation: 'generate',
      prompt,
      parameters: { ...node.generationDraft?.parameters },
    };
  }
}
