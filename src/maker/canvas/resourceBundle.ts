import type { CanvasDocument, CanvasNode } from './model.js';
import { canvasReferences, isCanvasNodeStale } from './dependencies.js';
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
  let backgroundAssetId: string | undefined;
  let offset = 0;
  for (const member of members) {
    const source = canvasReferences(document, member.id).find((node) => node.type === 'image');
    const info = member.imageAssetsInfo!;
    const plan = source && imageAssetsBindingPlan(source, info);
    if (!plan) {
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
      confirmed:
        !missingElementIds.length &&
        !unboundCategories.length &&
        members.every((member) =>
          ['confirmed', 'recorded'].includes(member.imageAssetsInfo?.uiBindingReview || '')
        ),
    },
  };
}

export function resourceBundleMembers(document: CanvasDocument, sectionId: string): CanvasNode[] {
  if (document.nodes.some((node) => node.id === sectionId && node.type === 'resource-bundle')) {
    const ids = new Set(
      document.edges
        .filter((edge) => edge.to === sectionId && edge.kind === 'resource-bundle')
        .map((edge) => edge.from)
    );
    return document.nodes.filter((node) => ids.has(node.id) && node.type === 'image-assets');
  }
  if (!document.nodes.some((node) => node.id === sectionId && node.type === 'section')) return [];
  return document.nodes.filter(
    (node) => node.sectionId === sectionId && node.type === 'image-assets'
  );
}

export function resourceBundleOwner(
  document: CanvasDocument,
  nodeId: string
): CanvasNode | undefined {
  const links = document.edges.filter((edge) => edge.from === nodeId);
  if (links.length !== 1 || links[0].kind !== 'resource-bundle') return undefined;
  return document.nodes.find((node) => node.id === links[0].to && node.type === 'resource-bundle');
}

export function addResourceBundle(current: CanvasDocument, sectionId: string): CanvasNode {
  const members = resourceBundleMembers(current, sectionId);
  if (!members.length) throw new Error('此分组还没有切图素材。');
  const existing = members.map((member) => resourceBundleOwner(current, member.id));
  if (existing.some(Boolean)) throw new Error('这些素材已经汇总到资源包。');
  const node: CanvasNode = {
    id: crypto.randomUUID(),
    type: 'resource-bundle',
    title: 'UI 资源包',
    sectionId,
    x: Math.min(...members.map((member) => member.x)),
    y: Math.max(...members.map((member) => member.y)),
    width: 920,
    height: 420,
  };
  current.nodes.push(node);
  for (const member of members)
    current.edges.push({
      id: crypto.randomUUID(),
      from: member.id,
      to: node.id,
      kind: 'resource-bundle',
    });
  return node;
}

export function renderResourceBundle(
  card: HTMLElement,
  node: CanvasNode,
  current: CanvasDocument,
  mediaUrl: (path: string) => string
): void {
  const members = resourceBundleMembers(current, node.id);
  const summary = document.createElement('p');
  const count = members.reduce(
    (sum, member) => sum + (member.imageAssetsInfo?.items.length || 0),
    0
  );
  summary.textContent = 'END · ' + members.length + ' 个分类 · ' + count + ' 张素材';
  card.append(summary);
  const list = document.createElement('div');
  list.className = 'resource-bundle-list';
  for (const member of members) {
    const row = document.createElement('div');
    row.className = 'resource-bundle-category';
    const label = document.createElement('strong');
    label.textContent = member.title;
    const status = document.createElement('span');
    try {
      validateResourceBundle(
        {
          ...current,
          edges: current.edges.filter((edge) => edge.to !== node.id || edge.from === member.id),
        },
        node.id
      );
      status.textContent = member.imageAssetsInfo!.items.length + ' 张';
    } catch {
      status.textContent = '待完成';
    }
    row.append(label, status);
    const previews = document.createElement('div');
    previews.className = 'resource-bundle-previews';
    for (const item of (member.imageAssetsInfo?.items || []).slice(0, 5)) {
      const preview = document.createElement('img');
      preview.src = mediaUrl(item.assetPath);
      preview.alt = item.name;
      preview.loading = 'lazy';
      previews.append(preview);
    }
    row.append(previews);
    list.append(row);
  }
  card.append(list);
}

export function validateResourceBundle(
  document: CanvasDocument,
  sectionId: string,
  maxFiles = 122
): CanvasNode[] {
  const terminal = document.nodes.some(
    (node) => node.id === sectionId && node.type === 'resource-bundle'
  );
  const members = resourceBundleMembers(document, sectionId).filter(
    (node) => !terminal || node.imageAssetsInfo?.items.length || !node.templatePending
  );
  if (
    terminal &&
    document.edges.some(
      (edge) =>
        edge.to === sectionId &&
        !document.nodes.some((node) => node.id === edge.from && node.type === 'image-assets')
    )
  )
    throw new Error('资源包的分类来源已丢失，请检查连线。');
  if (!members.length) throw new Error('此分组还没有切图素材，请先完成切图。');
  const checked = new Set<string>();
  const checking = new Set<string>();
  function check(node: CanvasNode): void {
    if (checking.has(node.id)) throw new Error('素材连线形成循环，请检查流程。');
    if (checked.has(node.id)) return;
    checking.add(node.id);
    const sources = canvasReferences(document, node.id);
    if (
      node.templatePending ||
      isCanvasNodeStale(node, sources) ||
      document.edges.some(
        (edge) => edge.to === node.id && !sources.some((source) => source.id === edge.from)
      ) ||
      (node.type === 'image' && !node.assetPath)
    )
      throw new Error('「' + node.title + '」尚未完成或来源已变化，请重新生成并切图后再下载。');
    sources.forEach(check);
    checking.delete(node.id);
    checked.add(node.id);
  }
  let count = 0;
  for (const member of members) {
    check(member);
    if (!member.imageAssetsInfo?.items.length)
      throw new Error('「' + member.title + '」尚未完成切图，未导出文件。');
    count += validateImageAssetsInfo(member.imageAssetsInfo).items.length;
  }
  if (count > maxFiles) throw new Error('素材总数超过单包上限 122 张，请按分类分别下载。');
  return members;
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
