import type {
  UiElementCategory,
  UiElement,
  UiRecognitionResult,
  UiRecognitionSettings,
} from '../contracts.js';
import { UI_ELEMENT_CATEGORIES } from '../contracts.js';
export type {
  UiElementCategory,
  UiElement,
  UiRecognitionResult,
  UiRecognitionSettings,
} from '../contracts.js';
export { UI_ELEMENT_CATEGORIES } from '../contracts.js';
import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { canvasDependents, canvasReferences } from '../core/dependencies.js';
import { scaleCutElements, validateUiBboxStructure } from './uiBbox.js';
import type { UiBboxDocument } from '../contracts.js';
import { hasImageFeature } from './imageFeatures.js';

export function bboxRecognitionElements(bbox: UiBboxDocument): UiElement[] {
  return scaleCutElements(bbox.elements, bbox.design, bbox.cutSource).map((element, index) => ({
    id: element.id,
    name: element.name,
    category: element.type === 'button' ? 'action' : element.type,
    rect: element.bbox,
    parentId: element.parent,
    zIndex: index,
    states: ['normal'],
    cutout: true,
  }));
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

export function validateUiRecognitionStructure(value: unknown): UiRecognitionSettings {
  const input = value as UiRecognitionSettings;
  if (
    !input ||
    typeof input.enabled !== 'boolean' ||
    (input.optional !== undefined && typeof input.optional !== 'boolean') ||
    (input.inputRole !== undefined && !['design', 'text-free'].includes(input.inputRole)) ||
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
      result.prompt.length > 200000 ||
      typeof result.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(result.createdAt)) ||
      !Number.isFinite(result.durationMs) ||
      result.durationMs < 0 ||
      (result.credits !== undefined && (!Number.isFinite(result.credits) || result.credits < 0)) ||
      typeof result.sourcePath !== 'string' ||
      !result.sourcePath.trim() ||
      !/^[a-f0-9]{64}$/.test(result.sourceSha256)
    )
      throw new Error('识图记录或原稿身份无效。');
    ids.add(result.id);
    const bbox = result.bbox ? validateUiBboxStructure(result.bbox) : undefined;
    if (
      bbox &&
      (bbox.cutSource.path !== result.sourcePath ||
        bbox.cutSource.sha256 !== result.sourceSha256 ||
        bbox.cutSource.width !== result.width ||
        bbox.cutSource.height !== result.height)
    )
      throw new Error('识图 Bbox 与去文字图片身份不一致。');
    return {
      id: result.id,
      model: result.model,
      prompt: result.prompt,
      createdAt: result.createdAt,
      durationMs: result.durationMs,
      ...(result.credits !== undefined ? { credits: result.credits } : {}),
      sourcePath: result.sourcePath,
      sourceSha256: result.sourceSha256,
      width: result.width,
      height: result.height,
      elements: validateUiElements(
        bbox ? bboxRecognitionElements(bbox) : result.elements,
        result.width,
        result.height
      ),
      ...(bbox ? { bbox } : {}),
    };
  });
  if (input.selectedId !== undefined && !ids.has(input.selectedId))
    throw new Error('所选识图结果不存在。');
  if (input.pendingId !== undefined && !/^[a-f0-9-]{36}$/.test(input.pendingId))
    throw new Error('识图请求标识无效。');
  return {
    enabled: input.enabled,
    ...(input.optional === undefined ? {} : { optional: input.optional }),
    ...(input.inputRole ? { inputRole: input.inputRole } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.pendingId ? { pendingId: input.pendingId } : {}),
    ...(input.selectedId ? { selectedId: input.selectedId } : {}),
    results,
  };
}

export function uiRecognitionInputs(document: CanvasDocument, node: CanvasNode) {
  const designInput = node.uiRecognition?.inputRole === 'design';
  const cut = designInput
    ? document.nodes.filter(
        (candidate) =>
          candidate.type === 'image' &&
          candidate.uiRecognition &&
          candidate.uiRecognition.inputRole !== 'design' &&
          canvasReferences(document, candidate.id).some((source) => source.id === node.id)
      )
    : [node];
  if (cut.length !== 1 || !cut[0].assetPath || cut[0].templatePending)
    throw new Error('请先准备一张去文字稿，并从原 UI 设计稿连线到它，再执行识别。');
  const originals = canvasReferences(document, cut[0].id).filter(
    (source) => source.type === 'image' && source.assetPath
  );
  if (originals.length !== 1 || originals[0].templatePending)
    throw new Error('去文字稿需要连线引用唯一的原 UI 设计稿。');
  return { design: originals[0], cut: cut[0] };
}

export function uiRecognitionPreview(document: CanvasDocument, node: CanvasNode) {
  const direct = selectedUiRecognition(node);
  if (
    node.uiRecognition?.inputRole === 'design' &&
    direct?.bbox &&
    direct.bbox.design.path === node.assetPath
  )
    return { source: node, result: direct };
  try {
    const inputs = uiRecognitionInputs(document, node);
    const result = selectedUiRecognition(inputs.cut);
    if (result?.bbox && result.bbox.design.path === inputs.design.assetPath)
      return { source: inputs.cut, result };
  } catch {
    return undefined;
  }
  return undefined;
}

export function setUiRecognitionMode(
  document: CanvasDocument,
  source: CanvasNode,
  enabled: boolean
): void {
  if (!source.uiRecognition || source.uiRecognition.enabled === enabled) return;
  source.uiRecognition.enabled = enabled;
  if (source.uiRecognition.optional) return;
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
  if (!hasImageFeature(node, 'ui-extraction')) return;
  const source = uiRecognitionSource(document, node);
  if (source?.uiRecognition?.optional) return;
  if (!source?.uiRecognition?.enabled) return;
  const result = selectedUiRecognition(source);
  if (!result) throw new Error('请先完成当前去文字图的识图，再拆图。');
  if (
    result.bbox &&
    uiRecognitionInputs(document, source).design.assetPath !== result.bbox.design.path
  )
    throw new Error('原 UI 设计稿已变化，请重新识别再拆图。');
  return uiExtractionPlan(result, node.uiExtraction!);
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
    if (node.uiArtTextId && current?.uiRecognition?.inputRole === 'design') {
      const sources = document.nodes.filter(
        (candidate) =>
          candidate.sectionId === node.sectionId &&
          candidate.uiRecognition?.inputRole === 'text-free' &&
          document.edges.some(
            (edge) =>
              edge.from === current.id && edge.to === candidate.id && edge.kind === 'image-variant'
          )
      );
      if (sources.length === 1) return sources[0];
    }
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
      ' 个元素' +
      (result.durationMs > 0 ? ' · ' + (result.durationMs / 1000).toFixed(1) + ' 秒' : '') +
      (result.credits !== undefined ? ' · ' + result.credits + ' 积分' : ''),
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
  if (settings.optional)
    return {
      status: 'not-ready',
      label: 'Bbox 可选',
      text: 'Bbox 尚未生成，不影响拆图与资源包。可从去文字卡菜单选择“生成 / 重试 Bbox”。',
    };
  return {
    status: 'not-ready',
    label: '尚未完成',
    text: '当前去文字图尚无已选用的识图清单。请通过 Server API 或自定义 API 识图；接口未就绪时检查设置，恢复后继续。旧图片结果不可用于当前拆图。',
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
