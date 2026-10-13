import type { CanvasDocument, CanvasNode } from './model.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import { imageAtlasRegions } from './imageAtlasExport.js';
import { validateUiBbox, type UiBboxDocument } from './uiBbox.js';
import {
  selectedUiExtraction,
  selectedUiRecognition,
  uiRecognitionSource,
  uiRecognitionInputs,
} from './uiRecognition.js';

export interface UiAtlasSlot {
  elementIds: string[];
  state: 'normal' | 'pressed';
  role: 'element' | 'background' | 'reserve';
}

export interface UiAtlasPlan {
  version: 1;
  bbox: UiBboxDocument;
  grid: ImageAtlasGrid;
  slots: UiAtlasSlot[];
}

export type UiAtlasGroup = 'controls' | 'icons' | 'equipment' | 'panels' | 'artwork' | 'background';

export function validateUiAtlasGroup(value: unknown): UiAtlasGroup {
  if (
    !['controls', 'icons', 'equipment', 'panels', 'artwork', 'background'].includes(value as string)
  )
    throw new Error('UI 合批分类无效。');
  return value as UiAtlasGroup;
}

export function uiAtlasElementGroup(
  element: UiBboxDocument['elements'][number],
  bbox: UiBboxDocument
): UiAtlasGroup {
  const [left, top, width, height] = element.bbox;
  if (element.type === 'panel')
    return left === 0 &&
      top === 0 &&
      width >= bbox.design.width * 0.95 &&
      height >= bbox.design.height * 0.95
      ? 'background'
      : 'panels';
  if (element.type === 'icon') {
    if (/头像|人物|角色|立绘|插画|portrait|character|illustration/i.test(element.name))
      return 'artwork';
    if (
      /装备|武器|头盔|胸甲|护臂|靴子|项链|戒指|weapon|equipment|armor/i.test(element.name) &&
      !/星|star/i.test(element.name)
    )
      return 'equipment';
    return 'icons';
  }
  if (element.type === 'frame')
    return width / height > 3 || height / width > 3 ? 'controls' : 'equipment';
  return 'controls';
}

export const UI_ATLAS_MAX_EDGE = 5;
export const UI_ATLAS_MAX_CELLS = UI_ATLAS_MAX_EDGE * UI_ATLAS_MAX_EDGE;

export function uiAtlasElementSlots(bbox: UiBboxDocument, group: UiAtlasGroup): UiAtlasSlot[] {
  return bbox.elements
    .filter((element) => !element.duplicateOf && uiAtlasElementGroup(element, bbox) === group)
    .flatMap((element) => {
      const states: UiAtlasSlot['state'][] = ['button', 'tab'].includes(element.type)
        ? ['normal', 'pressed']
        : ['normal'];
      const elementIds = [
        element.id,
        ...bbox.elements.filter((item) => item.duplicateOf === element.id).map((item) => item.id),
      ];
      return states.map((state) => ({
        elementIds: [...elementIds],
        state,
        role: 'element' as const,
      }));
    });
}

export function uiAtlasSheet(count: number, aspect = 1): { columns: number; rows: number } {
  const size = Math.max(1, Math.min(UI_ATLAS_MAX_CELLS, count));
  let best = { columns: 1, rows: 1 };
  let score = Infinity;
  for (let columns = 1; columns <= UI_ATLAS_MAX_EDGE; columns++) {
    const rows = Math.ceil(size / columns);
    if (rows > UI_ATLAS_MAX_EDGE) continue;
    // Template atlases are square: a cell has aspect rows / columns.
    const candidate = Math.abs(Math.log(rows / columns / aspect)) + (columns * rows - size) / size;
    if (candidate < score) {
      best = { columns, rows };
      score = candidate;
    }
  }
  return best;
}

export function uiBatchAtlasPlans(bbox: UiBboxDocument, group: UiAtlasGroup): UiAtlasPlan[] {
  const slots = uiAtlasElementSlots(bbox, group);
  if (slots.length > 120) throw new Error('此分类超过 120 格上限，请先拆分清单。');
  if (group === 'background' && !slots.length)
    return [
      validateUiAtlasPlan({
        version: 1,
        bbox,
        grid: { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
        slots: [{ elementIds: [], state: 'normal', role: 'background' }],
      }),
    ];
  const dimensions = (slot: UiAtlasSlot) => {
    const element = bbox.elements.find((item) => item.id === slot.elementIds[0])!;
    const width = element.bbox[2],
      height = element.bbox[3];
    return {
      width,
      height,
      shape: width / height >= 3 ? 'wide' : height / width >= 3 ? 'tall' : 'regular',
    };
  };
  const chunks: UiAtlasSlot[][] = [];
  // Group similar source dimensions, keeping identity/state on the slot itself.
  for (const slot of [...slots].sort((a, b) => {
    const first = dimensions(a),
      second = dimensions(b);
    return second.width * second.height - first.width * first.height;
  })) {
    const current = dimensions(slot);
    const chunk = chunks.find(
      (items) =>
        items.length < (current.shape === 'regular' ? UI_ATLAS_MAX_CELLS : UI_ATLAS_MAX_EDGE) &&
        items.every((item) => {
          const other = dimensions(item);
          const widthRatio =
            Math.max(current.width, other.width) / Math.min(current.width, other.width);
          const heightRatio =
            Math.max(current.height, other.height) / Math.min(current.height, other.height);
          const aspectRatio = current.width / current.height / (other.width / other.height);
          return (
            current.shape === other.shape &&
            widthRatio <= 4 &&
            heightRatio <= 4 &&
            aspectRatio >= 1 / 3 &&
            aspectRatio <= 3
          );
        })
    );
    if (chunk) chunk.push(slot);
    else chunks.push([slot]);
  }
  if (!chunks.length) chunks.push([]);
  return chunks.map((chunk) => {
    const aspects = chunk
      .map((slot) => {
        const size = dimensions(slot);
        return size.width / size.height;
      })
      .sort((a, b) => a - b);
    const grid = uiAtlasSheet(
      Math.max(1, chunk.length),
      aspects[Math.floor(aspects.length / 2)] || 1
    );
    const sheet = [...chunk];
    while (sheet.length < grid.columns * grid.rows)
      sheet.push({ elementIds: [], state: 'normal', role: 'reserve' });
    return validateUiAtlasPlan({
      version: 1,
      bbox,
      grid: { ...grid, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
      slots: sheet,
    });
  });
}

export function uiBatchAtlasPlan(bbox: UiBboxDocument, group: UiAtlasGroup): UiAtlasPlan {
  return uiBatchAtlasPlans(bbox, group)[0];
}

export function uiBatchAtlasPrompt(group: UiAtlasGroup): string {
  const lines =
    group === 'background'
      ? [
          '游戏素材约束：输出一张完整环境背景，用来替换界面背后的场景。',
          '补全被界面挡住的环境，保留场景的光影和材质。',
          '画面四周留出纯色边，场景主体不贴边。',
          '外部背景使用纯绿色 RGB(0,255,0)。',
          '不要画界面、按钮、图标、人物或文字。',
        ]
      : [
          '任务：按槽位清单把素材画成可直接切图的等分网格。',
          '游戏素材约束：本张最多 5 列 × 5 行。每格只放清单中的一个素材，中心对准格子中心。',
          '素材外接框留在本格内，四周至少留 10% 空白。备用格留空。',
          '每个素材独立等比缩放到本格可用区域，允许各格缩放倍率不同；长条缩小到整条放入一格，人物缩小到全身放入一格。不要保留素材之间在原界面的相对大小。',
          '正常态保留原轮廓和配色。按下态只压暗内底、收紧高光，轮廓和锚点与正常态一致。',
          '保留：每个素材自身的轮廓、长宽比例、配色和细节；长条与人物保持原比例，不拉伸填满方格。',
          '分层：严格按每格指定的素材类型提取；前景和底板分别输出，不把参考图后面的底框合入前景。',
          '外部背景使用纯绿色 RGB(0,255,0)。',
          group === 'panels'
            ? '只提取空面板底板。不要画角色、图标或道具，不要重绘整张界面，不要跨格。'
            : '不要按参考图的界面位置摆放，不要重绘整张界面，不要跨格，不要添加清单之外的装饰、编号或网格线。清单指定的装饰本身应完整提取。底板不要带图标、人物或物品。',
        ];
  return lines.join('\n');
}

export function validateUiAtlasPlan(value: unknown): UiAtlasPlan {
  const plan = value as UiAtlasPlan;
  if (!plan || plan.version !== 1 || !plan.grid || !Array.isArray(plan.slots))
    throw new Error('UI 图集顺序清单无效。');
  const bbox = validateUiBbox(plan.bbox);
  const grid = plan.grid;
  imageAtlasRegions(4096, 4096, grid);
  if (plan.slots.length !== grid.columns * grid.rows)
    throw new Error('UI 顺序清单数量与图集格数不一致。');
  const ids = new Set(bbox.elements.map((element) => element.id));
  const assigned = new Set<string>();
  const slots = plan.slots.map((slot) => {
    if (
      !slot ||
      !['normal', 'pressed'].includes(slot.state) ||
      !['element', 'background', 'reserve'].includes(slot.role) ||
      !Array.isArray(slot.elementIds) ||
      (slot.role === 'element' ? !slot.elementIds.length : slot.elementIds.length > 0)
    )
      throw new Error('UI 槽位用途或状态无效。');
    for (const id of slot.elementIds) {
      const key = id + ':' + slot.state;
      if (!ids.has(id) || assigned.has(key)) throw new Error('UI 组件绑定重复或不存在：' + id);
      assigned.add(key);
    }
    return { elementIds: [...slot.elementIds], state: slot.state, role: slot.role };
  });
  return { version: 1, bbox, grid: { ...grid }, slots };
}

export function uiWorkflowAtlasPlans(
  current: CanvasDocument,
  node: CanvasNode,
  bbox: UiBboxDocument
): UiAtlasPlan[] {
  const planned = uiBatchAtlasPlans(bbox, node.uiAtlasGroup!);
  const sourceId = uiRecognitionSource(current, node)?.id;
  const recorded = current.nodes
    .filter(
      (item) =>
        item.type === 'image' &&
        item.sectionId === node.sectionId &&
        item.uiAtlasGroup === node.uiAtlasGroup &&
        (!item.templatePending || Boolean(item.generation?.attemptId)) &&
        uiRecognitionSource(current, item)?.id === sourceId &&
        item.generation?.uiAtlasPlan &&
        JSON.stringify(item.generation.uiAtlasPlan.bbox) === JSON.stringify(bbox)
    )
    .map((item) => ({
      index: item.uiAtlasBatch ?? 0,
      plan: validateUiAtlasPlan(item.generation!.uiAtlasPlan),
    }))
    .sort((a, b) => a.index - b.index);
  if (recorded.every(({ index, plan }) => JSON.stringify(plan) === JSON.stringify(planned[index])))
    return planned;
  const identities = (slots: UiAtlasSlot[]) =>
    slots
      .flatMap((slot) =>
        slot.role === 'reserve'
          ? []
          : slot.elementIds.length
            ? slot.elementIds.map((id) => id + ':' + slot.state)
            : [slot.role + ':' + slot.state]
      )
      .sort();
  // Completed historical batches remain one coherent plan after planner upgrades.
  if (
    recorded.every((item, index) => item.index === index) &&
    JSON.stringify(identities(recorded.flatMap((item) => item.plan.slots))) ===
      JSON.stringify(identities(planned.flatMap((plan) => plan.slots)))
  )
    return recorded.map((item) => item.plan);
  throw new Error(
    '已生成图集与当前分批规则不一致，且旧批次尚不完整。已保留原结果并停止新增批次；请在新模板中使用当前分批规则，避免重复生图。'
  );
}

export function selectedUiAtlasPlan(
  current: CanvasDocument,
  node: CanvasNode
): UiAtlasPlan | undefined {
  const source = uiRecognitionSource(current, node);
  const result = source && selectedUiRecognition(source);
  if (node.uiAtlasGroup) {
    if (!source?.uiRecognition?.enabled) return;
    if (!result?.bbox) throw new Error('请先完成当前去文字图的识图，再拆图。');
    if (uiRecognitionInputs(current, source!).design.assetPath !== result.bbox.design.path)
      throw new Error('原 UI 设计稿已变化，请重新识别再拆图。');
    const plans = uiWorkflowAtlasPlans(current, node, result.bbox);
    const plan = plans[node.uiAtlasBatch ?? 0];
    if (!plan) throw new Error('当前识图清单已不需要此续批，请移除多余续批及其资源卡后继续。');
    return plan;
  }
  if (node.uiAtlasPlan) {
    const plan = validateUiAtlasPlan(node.uiAtlasPlan);
    if (!result?.bbox || JSON.stringify(plan.bbox) !== JSON.stringify(validateUiBbox(result.bbox)))
      throw new Error('UI 排版清单与当前识图结果不一致，请重新规划槽位；不会套用旧绑定。');
    return plan;
  }
  const extraction = selectedUiExtraction(current, node);
  if (!extraction || !result?.bbox || !extraction.slots.length) return;
  return validateUiAtlasPlan({
    version: 1,
    bbox: result.bbox,
    grid: extraction.grid,
    slots: extraction.slots.map((slot) => ({
      elementIds: slot.reserve ? [] : [slot.elementId],
      state: slot.state,
      role: slot.reserve ? 'reserve' : 'element',
    })),
  });
}

export function uiAtlasOrderPrompt(plan: UiAtlasPlan, outputAspect = 1): string {
  const bbox = plan.bbox;
  return [
    'UI 槽位绑定：',
    '按下面的行列放入等分格子。一格一个，中心对齐，不跨格。',
    '输出区域以整张输出图左上角为原点，用宽高百分比表示；这是输出位置，和后面的参考图像素框分开使用。每格可用区域之外全部保留纯底色，不能合并格子或让长条贯穿整行。',
    '清单已合并重复素材：每格只画代表实例一次，不按它在原稿中的出现次数复制。名称只用于定位，框内主体才是提取对象；星星所在装备、图标所在底框不属于该主体。',
    '本张是 ' +
      plan.grid.columns +
      ' 列 × ' +
      plan.grid.rows +
      ' 行，不超过 5×5。坐标只用来辨认参考图上的素材，不是输出位置。',
    ...plan.slots.map((slot, index) => {
      const column = index % plan.grid.columns;
      const row = Math.floor(index / plan.grid.columns);
      const area = [
        (column + 0.1) / plan.grid.columns,
        (row + 0.1) / plan.grid.rows,
        (column + 0.9) / plan.grid.columns,
        (row + 0.9) / plan.grid.rows,
      ].map((value) => (value * 100).toFixed(2) + '%');
      const element = bbox.elements.find((item) => item.id === slot.elementIds[0]);
      const aspect = element ? element.bbox[2] / element.bbox[3] : 1;
      const fitWidth = Math.min(
        0.8 / plan.grid.columns,
        ((0.8 / plan.grid.rows) * aspect) / outputAspect
      );
      const fitHeight = (fitWidth * outputAspect) / aspect;
      const rect = element?.bbox.map((value, axis) =>
        Math.round(
          value *
            (axis % 2
              ? bbox.cutSource.height / bbox.design.height
              : bbox.cutSource.width / bbox.design.width)
        )
      );
      return (
        '第' +
        (Math.floor(index / plan.grid.columns) + 1) +
        '行第' +
        ((index % plan.grid.columns) + 1) +
        '列（输出可用区域：左 ' +
        area[0] +
        '，上 ' +
        area[1] +
        '，右 ' +
        area[2] +
        '，下 ' +
        area[3] +
        '）：' +
        (element
          ? element.id +
            ' ' +
            element.name +
            ' [' +
            rect!.join(',') +
            '] ' +
            slot.state +
            '；主体目标宽 ' +
            (fitWidth * 100).toFixed(2) +
            '%、高 ' +
            (fitHeight * 100).toFixed(2) +
            '%，中心位于整图 (' +
            (((column + 0.5) / plan.grid.columns) * 100).toFixed(2) +
            '%,' +
            (((row + 0.5) / plan.grid.rows) * 100).toFixed(2) +
            '%)，保持原宽高比 ' +
            aspect.toFixed(2) +
            ':1，不加厚长条、不放大填满格子' +
            (element.type === 'icon'
              ? '；仅保留前景主体，移除背后的面板、槽框、底色和文字；不添加任何外框。'
              : element.bbox[2] >= bbox.design.width * 0.95 &&
                  element.bbox[3] >= bbox.design.height * 0.95
                ? '；仅保留环境背景。'
                : '；仅保留底板本体、边框和底纹，移除覆盖的图标、人物、物品和文字。')
          : slot.role === 'background'
            ? '完整环境背景'
            : '备用格，不绑定 UI 组件')
      );
    }),
  ].join('\n');
}

export function ensureUiAtlasBatchCards(document: CanvasDocument, groupId?: string): boolean {
  let changed = false;
  const expansions: Array<{ seed: CanvasNode; plans: UiAtlasPlan[]; sourceId: string }> = [];
  for (const seed of [...document.nodes]) {
    if (
      seed.type !== 'image' ||
      !seed.uiAtlasGroup ||
      (seed.uiAtlasBatch ?? 0) !== 0 ||
      (groupId && seed.sectionId !== groupId)
    )
      continue;
    const recognition = uiRecognitionSource(document, seed);
    const bbox = recognition?.uiRecognition?.enabled && selectedUiRecognition(recognition)?.bbox;
    if (!bbox) continue;
    const plans = uiWorkflowAtlasPlans(document, seed, bbox);
    expansions.push({ seed, plans, sourceId: recognition.id });
  }
  // Validate every category before adding cards, so a blocked upgrade leaves no partial batches.
  for (const { seed, plans, sourceId } of expansions) {
    for (let batch = 1; batch < plans.length; batch++) {
      if (
        document.nodes.some(
          (node) =>
            node.sectionId === seed.sectionId &&
            node.uiAtlasGroup === seed.uiAtlasGroup &&
            uiRecognitionSource(document, node)?.id === sourceId &&
            (node.uiAtlasBatch ?? 0) === batch
        )
      )
        continue;
      cloneUiAtlasBatch(document, seed, batch);
      changed = true;
    }
  }
  return changed;
}

export function cloneUiAtlasBatch(document: CanvasDocument, seed: CanvasNode, batch: number) {
  const imageId = crypto.randomUUID();
  const offset = batch * (seed.width + 48);
  const image: CanvasNode = {
    ...structuredClone(seed),
    id: imageId,
    x: seed.x + offset,
    title: seed.title.replace(/ · \d+$/, '') + ' · ' + (batch + 1),
    uiAtlasBatch: batch,
    templatePending: true,
  };
  delete image.workDurationMs;
  image.generationDraft = {
    operation: seed.generationDraft?.operation || seed.generation?.operation || 'variant',
    prompt: seed.uiBaselinePrompt || seed.generationDraft?.prompt || seed.generation?.prompt || '',
    parameters: structuredClone(
      seed.generationDraft?.parameters || seed.generation?.parameters || {}
    ),
  };
  delete image.generation;
  delete image.assetPath;
  delete image.imageInfo;
  delete image.sourceSnapshot;
  delete image.uiAtlasPlan;
  document.nodes.push(image);
  for (const edge of document.edges.filter((item) => item.to === seed.id))
    document.edges.push({ ...structuredClone(edge), id: crypto.randomUUID(), to: imageId });
  const assetsEdge = document.edges.find(
    (edge) => edge.kind === 'image-assets' && edge.from === seed.id
  );
  const assets = assetsEdge && document.nodes.find((node) => node.id === assetsEdge.to);
  if (!assets) return;
  const assetsId = crypto.randomUUID();
  const copy: CanvasNode = {
    ...structuredClone(assets),
    id: assetsId,
    x: assets.x + offset,
    title: assets.title.replace(/ · \d+$/, '') + ' · ' + (batch + 1),
    templatePending: true,
  };
  delete copy.workDurationMs;
  delete copy.imageAssetsInfo;
  delete copy.sourceSnapshot;
  document.nodes.push(copy);
  document.edges.push({
    id: crypto.randomUUID(),
    from: imageId,
    to: assetsId,
    kind: 'image-assets',
  });
  for (const edge of document.edges.filter(
    (item) =>
      item.from === assets.id &&
      document.nodes.some((node) => node.id === item.to && node.type === 'resource-bundle')
  ))
    document.edges.push({ ...structuredClone(edge), id: crypto.randomUUID(), from: assetsId });
}

export function uiBindingContentRect(
  data: Uint8ClampedArray,
  width: number,
  height: number
): [number, number, number, number] {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      if (data[(row * width + column) * 4 + 3] < 8) continue;
      left = Math.min(left, column);
      top = Math.min(top, row);
      right = Math.max(right, column);
      bottom = Math.max(bottom, row);
    }
  if (right < 0) throw new Error('UI 素材为空，不能保存绑定。');
  return [left, top, right - left + 1, bottom - top + 1];
}
