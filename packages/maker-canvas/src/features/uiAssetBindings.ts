import type {
  UiAtlasSlot,
  UiAtlasPlan,
  UiAtlasGroup,
  CanvasDocument,
  CanvasNode,
  ImageAtlasCrop,
  UiBboxDocument,
} from '../contracts.js';
import { imageAtlasRegions } from './imageAtlas.js';
import { validateAtlasCrops } from './atlasContent.js';
import { validateUiBboxStructure } from './uiBbox.js';
import {
  selectedUiExtraction,
  selectedUiRecognition,
  uiRecognitionSource,
  uiRecognitionInputs,
} from './uiRecognition.js';

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
      validateUiAtlasPlanStructure({
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
    return validateUiAtlasPlanStructure({
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

export function uiNativeAtlasPlans(bbox: UiBboxDocument, group: UiAtlasGroup): UiAtlasPlan[] {
  const slots = uiAtlasElementSlots(bbox, group);
  if (slots.length > 120) throw new Error('此分类超过 120 个素材，请先拆分清单。');
  if (!slots.length && group === 'background')
    slots.push({ elementIds: [], state: 'normal', role: 'background' });
  return uiNativeSlotPlans(bbox, slots);
}

export function uiNativeArtTextPlan(bbox: UiBboxDocument, textId: string): UiAtlasPlan {
  if (!bbox.texts.some((text) => text.id === textId))
    throw new Error('美术字 ID 不在当前识图文字清单中。');
  return uiNativeSlotPlans(bbox, [{ elementIds: [textId], state: 'normal', role: 'text' }])[0];
}

export function uiNativeSlotPlans(bbox: UiBboxDocument, slots: UiAtlasSlot[]): UiAtlasPlan[] {
  const size = (slot: UiAtlasSlot) => {
    const element = (slot.role === 'text' ? bbox.texts : bbox.elements).find(
      (item) => item.id === slot.elementIds[0]
    );
    return {
      width: Math.max(1, Math.round(element?.bbox[2] ?? bbox.design.width)),
      height: Math.max(1, Math.round(element?.bbox[3] ?? bbox.design.height)),
    };
  };
  const sheets: Array<{
    slots: UiAtlasSlot[];
    regions: ImageAtlasCrop[];
    rows: Array<{ y: number; height: number; right: number }>;
  }> = [];
  for (const slot of [...slots].sort(
    (first, second) =>
      size(second).height - size(first).height || size(second).width - size(first).width
  )) {
    const { width, height } = size(slot);
    if (width > 2048 || height > 2048)
      throw new Error(
        '素材 ' +
          (slot.elementIds[0] || '背景') +
          ' 超过 2048 像素，不能原尺寸放入图集；未缩小或截断。'
      );
    let sheet = sheets.find(
      (candidate) =>
        candidate.rows.some((row) => height <= row.height && row.right + 8 + width <= 2048) ||
        candidate.rows[candidate.rows.length - 1].y +
          candidate.rows[candidate.rows.length - 1].height +
          8 +
          height <=
          2048
    );
    if (!sheet) {
      sheet = { slots: [], regions: [], rows: [] };
      sheets.push(sheet);
    }
    let row = sheet.rows.find((item) => height <= item.height && item.right + 8 + width <= 2048);
    const x = row ? row.right + 8 : 0;
    if (!row) {
      const previous = sheet.rows[sheet.rows.length - 1];
      row = { y: previous ? previous.y + previous.height + 8 : 0, height, right: 0 };
      sheet.rows.push(row);
    }
    sheet.slots.push(slot);
    sheet.regions.push({
      name: 'item_' + String(sheet.slots.length).padStart(3, '0'),
      x,
      y: row.y,
      width,
      height,
    });
    row.right = x + width;
  }
  return sheets.map((sheet) => {
    let layout = { width: 2048, height: 2048, regions: sheet.regions };
    const minimumWidth = Math.max(...sheet.regions.map((region) => region.width));
    const margin = Math.min(
      8,
      Math.floor((2048 - minimumWidth) / 2),
      Math.floor((2048 - Math.max(...sheet.regions.map((region) => region.height))) / 2)
    );
    for (let limit = minimumWidth; limit <= 2048; limit = Math.min(2048, limit + 32)) {
      const rows: Array<{ y: number; height: number; right: number }> = [];
      const regions = sheet.regions.map((region) => {
        let row = rows.find(
          (item) => region.height <= item.height && item.right + 8 + region.width <= limit
        );
        const left = row ? row.right + 8 : 0;
        if (!row) {
          const previous = rows[rows.length - 1];
          row = {
            y: previous ? previous.y + previous.height + 8 : 0,
            height: region.height,
            right: 0,
          };
          rows.push(row);
        }
        row.right = left + region.width;
        return { ...region, x: left + margin, y: row.y + margin };
      });
      const usedWidth = Math.max(...regions.map((region) => region.x + region.width)) + margin;
      const usedHeight = Math.max(...regions.map((region) => region.y + region.height)) + margin;
      for (const [ratioWidth, ratioHeight] of [
        [1, 1],
        [3, 2],
        [2, 3],
      ]) {
        const unit =
          Math.ceil(Math.max(usedWidth / ratioWidth, usedHeight / ratioHeight) / 16) * 16;
        const width = unit * ratioWidth;
        const height = unit * ratioHeight;
        if (width <= 2048 && height <= 2048 && width * height < layout.width * layout.height)
          layout = { width, height, regions };
      }
      if (limit === 2048) break;
    }
    return validateUiAtlasPlanStructure({
      version: 1,
      bbox,
      slots: sheet.slots,
      grid: { columns: 1, rows: sheet.slots.length, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
      nativeLayout: layout,
    });
  });
}

export function uiNativeAtlasPrompt(): string {
  return [
    '任务：在预排参考图上逐项清理 UI 素材，输出尺寸与参考图完全相同，不重新排版。',
    '保留：每个主体的像素位置、宽高、轮廓、颜色和细节，包括最细小的分隔线。只处理清单指定的矩形区域，不移动、不缩放、不拉伸、不旋转，不省略任何一项。',
    '移除：前景素材背后的底板、槽框和背景；底板上覆盖的图标、人物、物品和文字。保留底板本体、边框和底纹为一体，并补齐遮挡。',
    '状态：正常态保持原样；按下态只改变明暗，不改变尺寸或位置。环境背景只补全场景，不保留界面控件。',
    '输出：保持原尺寸坐标布局，输出带真实 Alpha 通道的透明背景 PNG，所有主体外背景与间隔为 Alpha=0；保留主体的半透明边缘，不填充纯色底或绘制棋盘格。不是等分网格，不添加编号、分割线或清单外素材。',
  ].join('\n');
}

export function uiBatchAtlasPrompt(group: UiAtlasGroup, prelayout = false): string {
  const lines =
    group === 'background'
      ? [
          '游戏素材约束：输出一张完整环境背景，用来替换界面背后的场景。',
          '补全被界面挡住的环境，保留场景的光影和材质。',
          '画面四周留出透明边，保留场景本身，场景主体不贴边。',
          '输出带真实 Alpha 通道的透明背景 PNG，场景外留白为 Alpha=0，不填充纯色底或绘制棋盘格。',
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
          '输出带真实 Alpha 通道的透明背景 PNG，所有主体外背景、素材间隔和备用格均为 Alpha=0；保留半透明边缘，不填充纯色底或绘制棋盘格。',
          group === 'panels'
            ? '只提取空面板底板。不要画角色、图标或道具，不要重绘整张界面，不要跨格。'
            : (prelayout
                ? '保持预排参考图中各素材的格位和中心。'
                : '不要按参考图的界面位置摆放，') +
              '不要重绘整张界面，不要跨格，不要添加清单之外的装饰、编号或网格线。清单指定的装饰本身应完整提取。底板不要带图标、人物或物品。',
        ];
  return lines.join('\n');
}

export function validateUiAtlasPlanStructure(value: unknown): UiAtlasPlan {
  const plan = value as UiAtlasPlan;
  if (!plan || plan.version !== 1 || !plan.grid || !Array.isArray(plan.slots))
    throw new Error('UI 图集顺序清单无效。');
  const bbox = validateUiBboxStructure(plan.bbox);
  const grid = plan.grid;
  imageAtlasRegions(4096, 4096, grid);
  if (plan.slots.length !== grid.columns * grid.rows)
    throw new Error('UI 顺序清单数量与图集格数不一致。');
  const ids = new Set(bbox.elements.map((element) => element.id));
  const textIds = new Set(bbox.texts.map((text) => text.id));
  const assigned = new Set<string>();
  const slots = plan.slots.map((slot) => {
    if (
      !slot ||
      !['normal', 'pressed'].includes(slot.state) ||
      !['element', 'text', 'background', 'reserve'].includes(slot.role) ||
      !Array.isArray(slot.elementIds) ||
      (['element', 'text'].includes(slot.role)
        ? !slot.elementIds.length
        : slot.elementIds.length > 0) ||
      (slot.role === 'text' &&
        (!plan.nativeLayout || slot.state !== 'normal' || slot.elementIds.length !== 1))
    )
      throw new Error('UI 槽位用途或状态无效。');
    for (const id of slot.elementIds) {
      const key = id + ':' + slot.state;
      if (!(slot.role === 'text' ? textIds : ids).has(id) || assigned.has(key))
        throw new Error('UI 组件绑定重复或不存在：' + id);
      assigned.add(key);
    }
    return { elementIds: [...slot.elementIds], state: slot.state, role: slot.role };
  });
  const nativeLayout = plan.nativeLayout;
  if (nativeLayout) {
    if (
      ![nativeLayout.width, nativeLayout.height].every(
        (value) => Number.isSafeInteger(value) && value > 0 && value <= 2048
      )
    )
      throw new Error('原尺寸预排图集每边必须为 1 到 2048 像素。');
    const regions = validateAtlasCrops(
      nativeLayout.width,
      nativeLayout.height,
      nativeLayout.regions
    );
    if (regions.length !== slots.length) throw new Error('原尺寸坐标与素材数量不一致。');
    regions.forEach((region, index) => {
      const element = (slots[index].role === 'text' ? bbox.texts : bbox.elements).find(
        (item) => item.id === slots[index].elementIds[0]
      );
      if (
        slots[index].role === 'reserve' ||
        region.blank ||
        region.outputWidth !== undefined ||
        region.outputHeight !== undefined ||
        region.offsetX !== undefined ||
        region.offsetY !== undefined ||
        region.width !== Math.max(1, Math.round(element?.bbox[2] ?? bbox.design.width)) ||
        region.height !== Math.max(1, Math.round(element?.bbox[3] ?? bbox.design.height))
      )
        throw new Error('原尺寸区域与 Bbox 尺寸不一致，不能缩放或补齐输出。');
    });
    return {
      version: 1,
      bbox,
      grid: { ...grid },
      slots,
      nativeLayout: { width: nativeLayout.width, height: nativeLayout.height, regions },
    };
  }
  return { version: 1, bbox, grid: { ...grid }, slots };
}

export function uiWorkflowAtlasPlans(
  current: CanvasDocument,
  node: CanvasNode,
  bbox: UiBboxDocument
): UiAtlasPlan[] {
  const group = current.nodes.find((item) => item.id === node.sectionId && item.type === 'section');
  const native =
    group?.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015' ||
    (group?.templateCliOnly && group.templateSkills?.includes('maker-ui-bbox-workflow'));
  const planned = native
    ? uiNativeAtlasPlans(bbox, node.uiAtlasGroup!)
    : uiBatchAtlasPlans(bbox, node.uiAtlasGroup!);
  const sourceId = uiRecognitionSource(current, node)?.id;
  const recorded = current.nodes
    .filter(
      (item) =>
        item.type === 'image' &&
        !item.uiAtlasPrelayout &&
        item.sectionId === node.sectionId &&
        item.uiAtlasGroup === node.uiAtlasGroup &&
        (!item.templatePending || Boolean(item.generation?.attemptId)) &&
        uiRecognitionSource(current, item)?.id === sourceId &&
        item.generation?.uiAtlasPlan &&
        JSON.stringify(item.generation.uiAtlasPlan.bbox) === JSON.stringify(bbox)
    )
    .map((item) => ({
      index: item.uiAtlasBatch ?? 0,
      plan: validateUiAtlasPlanStructure(item.generation!.uiAtlasPlan),
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
  if (source?.uiRecognition?.optional) return;
  const result = source && selectedUiRecognition(source);
  const section = current.nodes.find((item) => item.id === node.sectionId);
  if (
    node.uiArtTextId &&
    node.uiArtTextId !== 'main-title' &&
    (section?.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015' ||
      (section?.templateCliOnly && section.templateSkills?.includes('maker-ui-bbox-workflow')))
  ) {
    if (!result?.bbox) throw new Error('请先完成当前设计稿识图，再提取美术字。');
    if (uiRecognitionInputs(current, source!).design.assetPath !== result.bbox.design.path)
      throw new Error('原 UI 设计稿已变化，请重新识别再提取美术字。');
    return uiNativeArtTextPlan(result.bbox, node.uiArtTextId);
  }
  if (node.uiAtlasGroup) {
    if (!source?.uiRecognition?.enabled) return;
    if (!result?.bbox) throw new Error('请先完成当前去文字图的识图，再拆图。');
    if (uiRecognitionInputs(current, source!).design.assetPath !== result.bbox.design.path)
      throw new Error('原 UI 设计稿已变化，请重新识别再拆图。');
    const plans = uiWorkflowAtlasPlans(current, node, result.bbox);
    // A smaller input can leave saved batch cards behind; treat them as an empty branch.
    return (
      plans[node.uiAtlasBatch ?? 0] || {
        version: 1,
        bbox: result.bbox,
        grid: { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
        slots: [{ elementIds: [], state: 'normal', role: 'reserve' }],
      }
    );
  }
  if (node.uiAtlasPlan) {
    const plan = validateUiAtlasPlanStructure(node.uiAtlasPlan);
    if (
      !result?.bbox ||
      JSON.stringify(plan.bbox) !== JSON.stringify(validateUiBboxStructure(result.bbox))
    )
      throw new Error('UI 排版清单与当前识图结果不一致，请重新规划槽位；不会套用旧绑定。');
    return plan;
  }
  const extraction = selectedUiExtraction(current, node);
  if (!extraction || !result?.bbox || !extraction.slots.length) return;
  return validateUiAtlasPlanStructure({
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

export function uiAtlasOrderPrompt(plan: UiAtlasPlan, outputAspect = 1, prelayout = false): string {
  const bbox = plan.bbox;
  if (plan.nativeLayout)
    return [
      'UI 槽位绑定：',
      '原尺寸图集为 ' +
        plan.nativeLayout.width +
        '×' +
        plan.nativeLayout.height +
        '；以下为输出像素矩形 [x,y,w,h]，不是原稿位置。保持每个矩形内的主体位置与尺寸。',
      '每个矩形只输出清单指定的层。同一图集可同时包含空底板和前景物品；不能因为裁片中物品醒目就把底板任务改成物品任务。不要放大、居中重排或裁断主体。',
      ...plan.slots.map((slot, index) => {
        const element = bbox.elements.find((item) => item.id === slot.elementIds[0]);
        const region = plan.nativeLayout!.regions[index];
        if (slot.role === 'text') {
          const text = bbox.texts.find((item) => item.id === slot.elementIds[0])!;
          return (
            text.id +
            ' 美术字“' +
            text.text +
            '” [' +
            [region.x, region.y, region.width, region.height].join(',') +
            ']；仅保留此文字的完整字形、配色、描边和字效；移除底板、花叶装饰、其它图案与背景。保持字形原尺寸、位置，不放大、不缩小、不居中重排。'
          );
        }
        const children = element && bbox.elements.filter((item) => item.parent === element.id);
        return (
          (element
            ? element.id + ' ' + element.name + '（type=' + element.type + '）'
            : '环境背景') +
          ' ' +
          slot.state +
          (slot.state === 'pressed'
            ? '（按下态：相对同 ID 的 normal 内底明显压暗约 20%，收紧高光；不要原样复制 normal，不移动轮廓）'
            : '') +
          ' [' +
          [region.x, region.y, region.width, region.height].join(',') +
          ']；' +
          (slot.role === 'background' ||
          (element && uiAtlasElementGroup(element, bbox) === 'background')
            ? '仅保留环境场景与外围装饰；移除全部 UI 面板、边框、按钮、槽框、图标、人物和文字，补全被遮挡场景。'
            : element && /填充|分隔线|横线|fill|separator|divider/i.test(element.name)
              ? '此项是前景填充或线条，不是空底板。完整保留参考图中的颜色、渐变、细线和长度；深灰色细线也必须输出，不得清空、增粗或改色。只移除它背后的面板，不要移除此项本身。'
              : element && /覆盖层|选中.*描边|角标/i.test(element.name)
                ? '仅保留名称指定的前景标记（角标色带或选中描边），不是整个裁片底板。移除后方卡片、物品和其它背景，标记外侧与内部孔洞使用抠图底色；不要保留裁框带入的矩形底色或物品碎片。'
                : element?.type === 'icon'
                  ? '仅保留名称指定的前景图案；严格保持原有颜色与形状，移除后方底框、底板和背景。外框若单列则不得粘在图案上。'
                  : element && /轨道|底槽|track/i.test(element.name)
                    ? '仅保留全长的空轨道及边框。轨道内部从左到右均为空槽的底色和纹理，不得出现任何彩色进度填充。彻底移除覆盖其上的彩色填充、数值和图标；填充已在其它矩形单独输出，不能再烘焙到底槽里。'
                    : region.height <= 16 || region.width <= 16
                      ? '保留此项完整的细线或装饰，包括深色细线；不要将它当作背景删除。'
                      : '此项要的是空底板，不是其上的物品。保留完整外边框和内部底色、底纹为一体；清空覆盖其上的子控件、槽框、按钮、图标、人物、物品和文字，补齐被遮住的底板。禁止用前景物品代替空底板。') +
          (children?.length
            ? '必须删除的独立子层：' +
              children.map((child) => child.id + ' ' + child.name).join('、') +
              '。这些子层会另行提取，本槽不得保留。'
            : '')
        );
      }),
    ].join('\n');
  return [
    'UI 槽位绑定：',
    ...(prelayout
      ? [
          '参考图已经按 Bbox 裁片并预排到输出格位。直接逐格编辑，不要重新查找原界面位置或重新排列。',
          '保留：每格指定主体的中心、比例、轮廓、颜色和细节。裁片仍包含原图背景和遮挡物，不是已完成的切图。',
          '移除：按下列逐格要求清理非主体内容，并补齐被遮挡的主体。输出保持同样网格和纯色底，不画编号、分割线。',
        ]
      : []),
    '按下面的行列放入等分格子。一格一个，中心对齐，不跨格。',
    '输出区域以整张输出图左上角为原点，用宽高百分比表示；这是输出位置，和后面的参考图像素框分开使用。每格可用区域之外全部保留纯底色，不能合并格子或让长条贯穿整行。',
    '清单已合并重复素材：每格只画代表实例一次，不按它在原稿中的出现次数复制。名称只用于定位，框内主体才是提取对象；星星所在装备、图标所在底框不属于该主体。',
    '本张是 ' +
      plan.grid.columns +
      ' 列 × ' +
      plan.grid.rows +
      (prelayout
        ? ' 行，不超过 5×5。参考图与输出的格位一一对应。'
        : ' 行，不超过 5×5。坐标只用来辨认参考图上的素材，不是输出位置。'),
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
            (prelayout ? '（参考图同一格） ' : ' [' + rect!.join(',') + '] ') +
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
