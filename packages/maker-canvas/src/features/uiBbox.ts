import type {
  UiBboxImage,
  UiBboxElement,
  UiBboxText,
  UiBboxDocument,
  UiScreenName,
} from '../contracts.js';
import { UI_CUT_TYPES } from '../contracts.js';

export function validateBboxRect(
  value: unknown,
  width: number,
  height: number
): [number, number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
    throw new Error('识图 bbox 必须是像素 [x,y,w,h]。');
  const [left, top, rectWidth, rectHeight] = value;
  if (
    left < 0 ||
    top < 0 ||
    rectWidth <= 0 ||
    rectHeight <= 0 ||
    left + rectWidth > width ||
    top + rectHeight > height
  )
    throw new Error('识图 bbox 超出图片范围。');
  return [left, top, rectWidth, rectHeight];
}

export function validateBboxImageStructure(value: UiBboxImage): UiBboxImage {
  if (
    !value ||
    typeof value.path !== 'string' ||
    !value.path.trim() ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    ![value.width, value.height].every(
      (entry) => Number.isInteger(entry) && entry > 0 && entry <= 16384
    )
  )
    throw new Error('识图图片身份或尺寸无效。');
  return { path: value.path, sha256: value.sha256, width: value.width, height: value.height };
}

export function validateCutElements(
  value: unknown,
  width: number,
  height: number
): UiBboxElement[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500)
    throw new Error('识图切图清单必须包含 1～500 个元素。');
  const ids = new Set<string>();
  const elements = value.map((entry): UiBboxElement => {
    if (
      !entry ||
      !/^E[0-9]{3,}$/.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      entry.name.length > 200 ||
      !UI_CUT_TYPES.includes(entry.type) ||
      (entry.parent !== null && typeof entry.parent !== 'string')
    )
      throw new Error('识图切图元素编号、类型或父级无效。');
    ids.add(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      bbox: validateBboxRect(entry.bbox, width, height),
      parent: entry.parent,
      ...(entry.duplicateOf === undefined ? {} : { duplicateOf: entry.duplicateOf }),
    };
  });
  const byId = new Map(elements.map((entry) => [entry.id, entry]));
  for (const entry of elements) {
    const visited = new Set([entry.id]);
    let parent = entry.parent;
    while (parent !== null) {
      if (visited.has(parent) || !byId.has(parent)) throw new Error('识图切图父级缺失或存在循环。');
      visited.add(parent);
      parent = byId.get(parent)!.parent;
    }
    if (entry.duplicateOf === undefined) continue;
    if (!/^E[0-9]{3,}$/.test(entry.duplicateOf) || entry.duplicateOf === entry.id)
      throw new Error('重复素材引用无效。');
    const source = byId.get(entry.duplicateOf);
    if (!source || source.duplicateOf || source.type !== entry.type)
      throw new Error('重复素材必须引用同类型的原始元素。');
  }
  return elements;
}

export function validateBboxTexts(
  value: unknown,
  width: number,
  height: number,
  elements: UiBboxElement[]
): UiBboxText[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('识图文字清单无效。');
  const ids = new Set<string>();
  const elementIds = new Set(elements.map((entry) => entry.id));
  return value.map((entry): UiBboxText => {
    const color = typeof entry?.color === 'string' ? entry.color.replace(/\s/g, '') : '';
    if (entry && !/^#[a-f0-9]{6}$/i.test(color))
      throw new Error('识图文字 ' + String(entry.id) + ' 的 color 无效，必须为 #RRGGBB。');
    if (
      !entry ||
      !/^T[0-9]{3,}$/.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.text !== 'string' ||
      !entry.text.trim() ||
      entry.text.length > 2000 ||
      (entry.parentId !== null && !elementIds.has(entry.parentId)) ||
      ![
        'title',
        'tab',
        'button',
        'slot_name',
        'stat_name',
        'stat_value',
        'currency',
        'count',
        'caption',
        'other',
      ].includes(entry.role) ||
      !['left', 'center', 'right'].includes(entry.align) ||
      typeof entry.bold !== 'boolean' ||
      entry.cutout !== false
    )
      throw new Error('识图文字编号、父级、样式或 cutout 无效；文字只还原为 Label。');
    ids.add(entry.id);
    return {
      id: entry.id,
      text: entry.text,
      bbox: validateBboxRect(entry.bbox, width, height),
      parentId: entry.parentId,
      role: entry.role,
      align: entry.align,
      color,
      bold: entry.bold,
      cutout: false,
    };
  });
}

export function scaleCutElements(
  elements: UiBboxElement[],
  source: { width: number; height: number },
  design: { width: number; height: number }
): UiBboxElement[] {
  return elements.map((entry) => ({
    ...entry,
    bbox: entry.bbox.map(
      (value, index) =>
        value * (index % 2 === 0 ? design.width / source.width : design.height / source.height)
    ) as UiBboxElement['bbox'],
  }));
}

/** Naming is supplementary: an absent/invalid model suggestion must not retry paid recognition. */
export function parseUiScreenName(value: unknown): UiScreenName | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { name, key } = value as Partial<UiScreenName>;
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 80 ||
    typeof key !== 'string' ||
    key.length > 64 ||
    !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(key) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(key)
  )
    return undefined;
  return { name: name.trim(), key };
}

export function validateUiBboxStructure(value: UiBboxDocument): UiBboxDocument {
  if (
    !value ||
    value.version !== 1 ||
    value.coordinateSpace !== 'design-pixels' ||
    value.bboxFormat !== 'xywh'
  )
    throw new Error('识图 Bbox JSON 版本或坐标格式无效。');
  const design = validateBboxImageStructure(value.design);
  const cutSource = validateBboxImageStructure(value.cutSource);
  const elements = validateCutElements(value.elements, design.width, design.height);
  const screen = parseUiScreenName(value.screen);
  return {
    version: 1,
    coordinateSpace: 'design-pixels',
    bboxFormat: 'xywh',
    ...(screen ? { screen } : {}),
    design,
    cutSource,
    elements,
    texts: validateBboxTexts(value.texts, design.width, design.height, elements),
  };
}
