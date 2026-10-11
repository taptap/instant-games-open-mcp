import type { CanvasDocument, CanvasNode } from './model.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import { imageAtlasRegions } from './imageAtlasExport.js';
import { validateUiBbox, type UiBboxDocument } from './uiBbox.js';
import {
  selectedUiExtraction,
  selectedUiRecognition,
  uiRecognitionSource,
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

export function selectedUiAtlasPlan(
  current: CanvasDocument,
  node: CanvasNode
): UiAtlasPlan | undefined {
  const source = uiRecognitionSource(current, node);
  const result = source && selectedUiRecognition(source);
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

export function uiAtlasOrderPrompt(plan: UiAtlasPlan): string {
  const bbox = plan.bbox;
  return [
    'UI 槽位绑定：严格按以下顺序输出，不按外观重新排序；每格居中且不跨格，不画编号或名称。',
    '输出 ' +
      plan.grid.columns +
      ' 列 × ' +
      plan.grid.rows +
      ' 行。以下坐标属于去文字参考图像素 [x,y,宽,高]。',
    ...plan.slots.map((slot, index) => {
      const element = bbox.elements.find((item) => item.id === slot.elementIds[0]);
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
        '列：' +
        (element
          ? element.id + ' ' + element.name + ' [' + rect!.join(',') + '] ' + slot.state
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
