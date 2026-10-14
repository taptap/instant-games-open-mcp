import { validateResourceBundleStructure } from '../../../packages/maker-canvas/src/features/resourceBundle.js';
export {
  resourceBundleMembers,
  resourceBundleOwner,
} from '../../../packages/maker-canvas/src/features/resourceBundle.js';
export {
  addResourceBundle,
  renderResourceBundle,
} from '../../../packages/maker-canvas/src/browser/resourceBundleUi.js';
import type { CanvasDocument, CanvasNode } from './model.js';
import { canvasReferences } from './dependencies.js';
import {
  collectImageAssetEntries,
  validateImageAssetsInfo,
  imageAssetsBindingPlan,
} from './imageAssets.js';
import { createCanvasZip } from './zipArchive.js';
import { selectedUiRecognition, uiRecognitionSource } from './uiRecognition.js';
import { validateUiBbox } from './uiBbox.js';

export async function uiDataHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function uiBundleManifest(
  document: CanvasDocument,
  members: CanvasNode[],
  entries: Array<{ name: string; blob: Blob }>
) {
  let bbox: ReturnType<typeof validateUiBbox> | undefined;
  let recognitionId: string | undefined;
  const assets: Array<{
    id: string;
    path: string;
    sha256: string;
    width: number;
    height: number;
    role: 'bound' | 'reserve';
    contentRect?: [number, number, number, number];
  }> = [];
  const bindings = new Map<
    string,
    { elementId: string; assetId?: string; pressedAssetId?: string; review: string }
  >();
  const unboundCategories: string[] = [];
  const artTextBindings: Array<{ textId: string; path: string }> = [];
  let backgroundAssetId: string | undefined;
  let offset = 0;
  for (const member of members) {
    const source = canvasReferences(document, member.id).find((node) => node.type === 'image');
    const info = member.imageAssetsInfo!;
    const plan = source && imageAssetsBindingPlan(source, info);
    if (!plan) {
      if (source?.uiArtTextId && info.items.length === 1)
        artTextBindings.push({ textId: source.uiArtTextId, path: entries[offset].name });
      unboundCategories.push(member.title);
      offset += info.items.length;
      continue;
    }
    const recognitionSource = uiRecognitionSource(document, source!);
    recognitionId ||= recognitionSource?.id;
    const live = recognitionSource && selectedUiRecognition(recognitionSource)?.bbox;
    if (!live || JSON.stringify(validateUiBbox(live)) !== JSON.stringify(plan.bbox))
      throw new Error('「' + member.title + '」绑定使用的 Bbox 已变化，请重新确认。');
    if (bbox && JSON.stringify(bbox) !== JSON.stringify(plan.bbox))
      throw new Error('资源包混用了不同版本的 Bbox。');
    bbox = plan.bbox;
    for (const [index, item] of info.items.entries()) {
      const slot = plan.slots[index];
      const file = entries[offset + index];
      const id = 'asset_' + member.id + '_' + item.name;
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await file.blob.arrayBuffer()))
      )
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
      assets.push({
        id,
        path: file.name,
        sha256: hash,
        width: item.width,
        height: item.height,
        role: slot.role === 'reserve' ? 'reserve' : 'bound',
        ...(item.contentRect ? { contentRect: item.contentRect } : {}),
      });
      if (slot.role === 'background') {
        if (backgroundAssetId) throw new Error('资源包包含多个背景绑定。');
        backgroundAssetId = id;
      }
      if (slot.role === 'text') {
        artTextBindings.push({ textId: slot.elementIds[0], path: file.name });
        continue;
      }
      for (const elementId of slot.elementIds) {
        const previous = bindings.get(elementId) || {
          elementId,
          review: info.uiBindingReview || 'unreviewed',
        };
        const field = slot.state === 'pressed' ? 'pressedAssetId' : 'assetId';
        if (previous[field]) throw new Error('组件状态重复绑定：' + elementId + '/' + slot.state);
        previous[field] = id;
        if (!info.uiBindingReview || info.uiBindingReview === 'unreviewed')
          previous.review = 'unreviewed';
        bindings.set(elementId, previous);
      }
    }
    offset += info.items.length;
  }
  if (!bbox) return;
  const missingElementIds = bbox.elements
    .filter((element) => !bindings.get(element.id)?.assetId)
    .map((element) => element.id);
  return {
    bbox,
    manifest: {
      version: 1,
      ui: {
        id: document.id + '_' + recognitionId,
        canvasId: document.id,
        recognitionNodeId: recognitionId,
        title: document.title,
        bboxSha256: await uiDataHash(bbox),
      },
      assets,
      bindings: [...bindings.values()],
      backgroundAssetId,
      missingElementIds,
      unboundCategories,
      ...(artTextBindings.length ? { artTextBindings } : {}),
      confirmed:
        !missingElementIds.length &&
        !unboundCategories.length &&
        members.every((member) =>
          ['confirmed', 'recorded'].includes(member.imageAssetsInfo?.uiBindingReview || '')
        ),
    },
  };
}

export function validateResourceBundle(
  document: CanvasDocument,
  sectionId: string,
  maxFiles = 122,
  memberId?: string
): CanvasNode[] {
  return validateResourceBundleStructure(document, sectionId, maxFiles, memberId, {
    validateImageAssetsInfo,
    imageAssetsBindingPlan,
    validateUiBbox,
  });
}

export async function resourceBundleEntries(
  document: CanvasDocument,
  sectionId: string,
  mediaUrl: (path: string) => string,
  progress?: (message: string) => void,
  readBlob?: (path: string) => Promise<Blob>,
  maxFiles = 122
): Promise<Array<{ name: string; blob: Blob }>> {
  const members = validateResourceBundle(document, sectionId, maxFiles);
  if (!members.length) throw new Error('此分组没有需要导出的素材。');
  const entries: Array<{ name: string; blob: Blob }> = [];
  const budget = { bytes: 0 };
  for (const [index, member] of members.entries()) {
    progress?.('正在汇总素材 ' + (index + 1) + '/' + members.length + '：' + member.title);
    const title =
      Array.from(member.title)
        .map((character) =>
          character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? '_' : character
        )
        .join('')
        .slice(0, 60) || '素材';
    const folder = String(index + 1).padStart(2, '0') + '-' + title;
    const files = await collectImageAssetEntries(
      member.imageAssetsInfo!,
      mediaUrl,
      budget,
      readBlob
    );
    entries.push(...files.map((entry) => ({ ...entry, name: folder + '/' + entry.name })));
  }
  const metadata = await uiBundleManifest(document, members, entries);
  if (metadata) {
    for (const source of [metadata.bbox.design, metadata.bbox.cutSource]) {
      if (entries.some((entry) => entry.name === source.path)) continue;
      const blob = readBlob
        ? await readBlob(source.path)
        : await (async () => {
            const response = await fetch(mediaUrl(source.path));
            if (!response.ok) throw new Error('UI 参考图读取失败，未导出文件。');
            return response.blob();
          })();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
      )
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      if (hash !== source.sha256) throw new Error('UI 参考图已变化，不能导出旧 Bbox。');
      entries.push({ name: source.path, blob });
    }
    entries.push({
      name: 'bbox.json',
      blob: new Blob([JSON.stringify(metadata.bbox, null, 2)], { type: 'application/json' }),
    });
    entries.push({
      name: 'bindings.json',
      blob: new Blob([JSON.stringify(metadata.manifest, null, 2)], { type: 'application/json' }),
    });
  }
  if (entries.length > maxFiles)
    throw new Error('包含 Bbox 和参考图后超过单包 122 个文件，请拆分资源包。');
  return entries;
}

export async function createResourceBundleZip(
  document: CanvasDocument,
  sectionId: string,
  mediaUrl: (path: string) => string,
  progress?: (message: string) => void
): Promise<Blob> {
  return createCanvasZip(await resourceBundleEntries(document, sectionId, mediaUrl, progress));
}
