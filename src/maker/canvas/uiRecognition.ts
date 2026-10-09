import type { CanvasDocument, CanvasNode } from './model.js';
import { canvasDependents } from './dependencies.js';

export const UI_ELEMENT_CATEGORIES = [
  'icon',
  'frame',
  'tab',
  'action',
  'shortcut',
  'close',
  'title',
  'panel',
  'art_text',
  'text',
] as const;
export type UiElementCategory = (typeof UI_ELEMENT_CATEGORIES)[number];

export interface UiElement {
  id: string;
  name: string;
  category: UiElementCategory;
  rect: [number, number, number, number];
  parentId: string | null;
  zIndex: number;
  states: string[];
  cutout: boolean;
}

export interface UiRecognitionResult {
  id: string;
  model: string;
  prompt: string;
  createdAt: string;
  durationMs: number;
  sourcePath: string;
  sourceSha256: string;
  width: number;
  height: number;
  elements: UiElement[];
}

export interface UiRecognitionSettings {
  enabled: boolean;
  model?: string;
  selectedId?: string;
  pendingId?: string;
  results: UiRecognitionResult[];
}

export function validateUiElements(value: unknown, width: number, height: number): UiElement[] {
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 16384))
    throw new Error('识图原稿尺寸无效。');
  if (!Array.isArray(value) || !value.length || value.length > 500)
    throw new Error('识图必须返回 1～500 个元素，空清单不能继续拆图。');
  const ids = new Set<string>();
  const elements = value.map((item): UiElement => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 200 ||
      !UI_ELEMENT_CATEGORIES.includes(item.category) ||
      !Array.isArray(item.rect) ||
      item.rect.length !== 4 ||
      !item.rect.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) ||
      (item.parentId !== null && typeof item.parentId !== 'string') ||
      !Number.isInteger(item.zIndex) ||
      Math.abs(item.zIndex) > 10000 ||
      typeof item.cutout !== 'boolean' ||
      !Array.isArray(item.states) ||
      item.states.length > 8 ||
      item.states.some((s: unknown) => typeof s !== 'string' || !s.trim() || s.length > 40)
    )
      throw new Error('识图元素格式无效：请检查编号、分类、坐标、层级和状态。');
    const [x, y, w, h] = item.rect;
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > width || y + h > height)
      throw new Error('识图元素超出原稿范围：' + item.id);
    if (item.category === 'text' && item.cutout)
      throw new Error('普通文字应记录为布局元素，不能作为切图：' + item.id);
    ids.add(item.id);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      rect: [x, y, w, h],
      parentId: item.parentId,
      zIndex: item.zIndex,
      states: [...new Set<string>(item.states)],
      cutout: item.cutout,
    };
  });
  const byId = new Map(elements.map((item) => [item.id, item]));
  for (const item of elements) {
    const visited = new Set([item.id]);
    let parent = item.parentId;
    while (parent !== null) {
      if (visited.has(parent) || !byId.has(parent))
        throw new Error('识图父子关系缺失或存在循环：' + item.id);
      visited.add(parent);
      parent = byId.get(parent)!.parentId;
    }
  }
  return elements;
}

export function validateUiRecognition(value: unknown): UiRecognitionSettings {
  const input = value as UiRecognitionSettings;
  if (
    !input ||
    typeof input.enabled !== 'boolean' ||
    !Array.isArray(input.results) ||
    input.results.length > 12 ||
    (input.model !== undefined &&
      (typeof input.model !== 'string' || !input.model || input.model.length > 120))
  )
    throw new Error('识图配置无效；每张原稿最多保留 12 次识别结果。');
  const ids = new Set<string>();
  const results = input.results.map((result): UiRecognitionResult => {
    if (
      !result ||
      typeof result.id !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(result.id) ||
      ids.has(result.id) ||
      typeof result.model !== 'string' ||
      !result.model ||
      result.model.length > 240 ||
      typeof result.prompt !== 'string' ||
      result.prompt.length > 16000 ||
      typeof result.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(result.createdAt)) ||
      !Number.isFinite(result.durationMs) ||
      result.durationMs < 0 ||
      typeof result.sourcePath !== 'string' ||
      !/^assets\/image\/canvas-[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(result.sourcePath) ||
      !/^[a-f0-9]{64}$/.test(result.sourceSha256)
    )
      throw new Error('识图记录或原稿身份无效。');
    ids.add(result.id);
    return {
      id: result.id,
      model: result.model,
      prompt: result.prompt,
      createdAt: result.createdAt,
      durationMs: result.durationMs,
      sourcePath: result.sourcePath,
      sourceSha256: result.sourceSha256,
      width: result.width,
      height: result.height,
      elements: validateUiElements(result.elements, result.width, result.height),
    };
  });
  if (input.selectedId !== undefined && !ids.has(input.selectedId))
    throw new Error('所选识图结果不存在。');
  if (input.pendingId !== undefined && !/^[a-f0-9-]{36}$/.test(input.pendingId))
    throw new Error('识图请求标识无效。');
  return {
    enabled: input.enabled,
    ...(input.model ? { model: input.model } : {}),
    ...(input.pendingId ? { pendingId: input.pendingId } : {}),
    ...(input.selectedId ? { selectedId: input.selectedId } : {}),
    results,
  };
}

export function setUiRecognitionMode(
  document: CanvasDocument,
  source: CanvasNode,
  enabled: boolean
): void {
  if (!source.uiRecognition || source.uiRecognition.enabled === enabled) return;
  source.uiRecognition.enabled = enabled;
  for (const node of canvasDependents(document, source.id)) {
    if (node.sectionId && node.type !== 'note') node.templatePending = true;
    delete node.uiEmpty;
    if (!enabled && node.uiBaselinePrompt) {
      const input = node.generationDraft || node.generation;
      if (input) input.prompt = node.uiBaselinePrompt;
    }
  }
}

export function selectedUiExtraction(document: CanvasDocument, node: CanvasNode) {
  if (!node.uiExtraction) return;
  const source = uiRecognitionSource(document, node);
  if (!source?.uiRecognition?.enabled) return;
  const result = selectedUiRecognition(source);
  if (!result) throw new Error('请先完成当前去文字图的识图，再拆图。');
  return uiExtractionPlan(result, node.uiExtraction);
}

export function selectedUiRecognition(node: CanvasNode): UiRecognitionResult | undefined {
  const settings = node.uiRecognition;
  if (!settings?.enabled || node.templatePending) return;
  return settings.results.find(
    (result) => result.id === settings.selectedId && result.sourcePath === node.assetPath
  );
}

export function uiRecognitionSource(
  document: CanvasDocument,
  node: CanvasNode
): CanvasNode | undefined {
  const visited = new Set<string>();
  const pending = [node.id];
  while (pending.length) {
    const id = pending.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const current = document.nodes.find((item) => item.id === id);
    if (current?.uiRecognition) return current;
    pending.push(...document.edges.filter((edge) => edge.to === id).map((edge) => edge.from));
  }
  return;
}

export function uiRecognitionNote(result: UiRecognitionResult): string {
  return [
    result.model +
      ' · ' +
      result.elements.length +
      ' 个元素 · ' +
      (result.durationMs / 1000).toFixed(1) +
      ' 秒',
    '坐标为识别输入图像素 [x, y, 宽, 高]；模型识别结果仍需核对。',
    ...result.elements.map(
      (item) =>
        item.id +
        ' | ' +
        item.category +
        ' | ' +
        item.name +
        ' | [' +
        item.rect.join(', ') +
        '] | 层级 ' +
        item.zIndex +
        (item.cutout ? ' | 切图' : ' | 不切图')
    ),
  ].join('\n');
}

export function uiRecognitionStatus(source?: CanvasNode) {
  const settings = source?.uiRecognition;
  if (!settings)
    return { status: 'unavailable', label: '来源不可用', text: '识图原稿不存在或未设置识图。' };
  if (!settings.enabled)
    return {
      status: 'disabled',
      label: '未启用',
      text: '识图已关闭：当前流程不执行元素识别，标注图片不等于元素清单。已有识图记录不用于当前拆图。',
    };
  if (settings.pendingId)
    return {
      status: 'pending',
      label: '结果待查询',
      text: '识图请求已提交，结果尚未确认。请查询原请求，不要重复提交。',
    };
  const selected = selectedUiRecognition(source!);
  if (selected)
    return {
      status: 'ready',
      label: selected.elements.length + ' 个元素',
      text: uiRecognitionNote(selected),
    };
  return {
    status: 'not-ready',
    label: '尚未完成',
    text: '当前去文字图尚无已选用的识图清单。请由当前 AI 看图，通过 CLI update-nodes 写入 uiRecognition.result；无需配置独立识图服务。旧图片结果不可用于当前拆图。',
  };
}

export function uiExtractionPlan(result: UiRecognitionResult, category: UiElementCategory) {
  const elements = result.elements.filter((item) => item.cutout && item.category === category);
  const dual = ['tab', 'action', 'shortcut', 'close'].includes(category);
  const states = [...new Set(['normal', 'pressed', ...elements.flatMap((item) => item.states)])];
  const required = dual
    ? states.flatMap((state) => elements.map((item) => ({ elementId: item.id, state })))
    : elements.flatMap((item) =>
        (item.states.length ? item.states : ['normal']).map((state) => ({
          elementId: item.id,
          state,
        }))
      );
  const count = required.length;
  if (count > 120) throw new Error('此分类超过单张图集 120 格上限，请先拆分清单。');
  // Keep every instance; duplicate assets are preferable to silently dropping controls.
  const columns = dual ? Math.max(1, elements.length) : Math.min(4, Math.max(1, count));
  const rows = dual ? states.length : Math.max(1, Math.ceil(count / columns));
  const slots = Array.from({ length: count ? rows * columns : 0 }, (_, index) => {
    return {
      ...required[index % count],
      reserve: index >= count,
    };
  });
  const grid = { columns, rows, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
  const prompt = [
    '参考与目标：严格根据原设计稿和以下元素清单提取 UI 素材，原图尺寸 ' +
      result.width +
      '×' +
      result.height +
      '。',
    '保留：保持每个元素的颜色、材质、完整轮廓、边框和所属底色；不同颜色的按钮分别保留。不得按相似名称省略。',
    category === 'art_text'
      ? '保留：美术字的字形、描边和字效。移除：美术字后方的底板、背景、图标和标框。'
      : category === 'icon'
        ? '保留：独立图标或装饰主体。移除：按钮底板、面板、文字、数字、编号、标框和背景。'
        : '保留：底板本体、所属边框和内部填色，保持一体。移除：其上的图标、文字、数字、其它叠加控件、编号、标框和外部背景。',
    '输出：' +
      columns +
      '列×' +
      rows +
      '行，每格一个独立素材，主体居中且四周至少留10%纯洋红空白，不跨格、不画网格线。',
    '使用纯洋红底便于后续透明处理。所有格外背景必须是平涂RGB(255,0,255)。不添加清单外的组件。',
    '元素清单（坐标为原图 x,y,宽,高）：',
    ...elements.map(
      (item) =>
        item.id +
        '：' +
        item.name +
        '；位置=[' +
        item.rect.join(',') +
        ']；原稿状态=' +
        item.states.join('/')
    ),
    '槽位顺序（从左到右、从上到下）：',
    ...slots.map(
      (slot, index) =>
        index +
        1 +
        '：' +
        slot.elementId +
        '/' +
        slot.state +
        (slot.reserve ? '（重复备用素材）' : '')
    ),
    dual ? '各行依次为 ' + states.join('、') + ' 状态；同一列的各状态尺寸、锚点一致。' : '',
    '全部编号必须覆盖；不把两个独立元素合为一格，保留所有不同配色的版本。',
  ]
    .filter(Boolean)
    .join('\n');
  return { elements, grid, slots, prompt };
}
