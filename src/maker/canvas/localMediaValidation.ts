import type {
  ImageAssetsInfo,
  UiBboxImage,
  UiBboxDocument,
  UiRecognitionSettings,
  UiAtlasPlan,
} from '../../../packages/maker-canvas/src/contracts.js';
import {
  validateImageAssetsInfoStructure,
  validateBboxImageStructure,
  validateUiBboxStructure,
  validateUiRecognitionStructure,
  validateUiAtlasPlanStructure,
} from '../../../packages/maker-canvas/src/domain.js';

export function isLocalCanvasImagePath(path: string): boolean {
  return /^assets\/image\/canvas-[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(path);
}

export function validateBboxImage(value: UiBboxImage): UiBboxImage {
  const result = validateBboxImageStructure(value);
  if (!isLocalCanvasImagePath(result.path)) throw new Error('识图图片身份或尺寸无效。');
  return result;
}

export function validateUiBbox(value: UiBboxDocument): UiBboxDocument {
  const result = validateUiBboxStructure(value);
  validateBboxImage(result.design);
  validateBboxImage(result.cutSource);
  return result;
}

export function validateUiRecognition(value: unknown): UiRecognitionSettings {
  const result = validateUiRecognitionStructure(value);
  for (const record of result.results) {
    if (!isLocalCanvasImagePath(record.sourcePath)) throw new Error('识图记录或原稿身份无效。');
    if (record.bbox) {
      validateBboxImage(record.bbox.design);
      validateBboxImage(record.bbox.cutSource);
    }
  }
  return result;
}

export function validateUiAtlasPlan(value: unknown): UiAtlasPlan {
  const result = validateUiAtlasPlanStructure(value);
  validateBboxImage(result.bbox.design);
  validateBboxImage(result.bbox.cutSource);
  return result;
}

export function isLocalImageAssetPath(path: string): boolean {
  return new RegExp(
    '^(assets/image/canvas-|[.]maker/canvases/[0-9a-f-]{36}/resources/)[0-9a-f-]{36}[.]png$',
    'i'
  ).test(path);
}

export function validateImageAssetsInfo(value: unknown): ImageAssetsInfo {
  const result = validateImageAssetsInfoStructure(value);
  for (const item of result.items) {
    if (!isLocalImageAssetPath(item.assetPath))
      throw new Error('游戏资产名称、尺寸或素材路径无效。');
  }
  return result;
}
