import type { CanvasDocument, CanvasNode } from '../contracts.js';

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
  document: Pick<CanvasDocument, 'nodes' | 'edges'>,
  nodeId: string
): CanvasNode | undefined {
  const links = document.edges.filter((edge) => edge.from === nodeId);
  if (links.length !== 1 || links[0].kind !== 'resource-bundle') return undefined;
  return document.nodes.find((node) => node.id === links[0].to && node.type === 'resource-bundle');
}

import { canvasReferences, isCanvasNodeStale } from '../core/dependencies.js';
import { selectedUiRecognition } from './uiRecognition.js';
import {
  validateImageAssetsInfoStructure,
  imageAssetsBindingPlanStructure,
} from './imageAssets.js';
import { validateUiBboxStructure } from './uiBbox.js';
export function validateResourceBundleStructure(
  document: CanvasDocument,
  sectionId: string,
  maxFiles = 122,
  memberId?: string,
  validation = {
    validateImageAssetsInfo: validateImageAssetsInfoStructure,
    imageAssetsBindingPlan: imageAssetsBindingPlanStructure,
    validateUiBbox: validateUiBboxStructure,
  }
): CanvasNode[] {
  const terminal = document.nodes.some(
    (node) => node.id === sectionId && node.type === 'resource-bundle'
  );
  const target = document.nodes.find((node) => node.id === sectionId);
  const group =
    target?.type === 'section'
      ? target
      : document.nodes.find((node) => node.id === target?.sectionId);
  const completeBbox = Boolean(
    !memberId &&
      group &&
      (group.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015' ||
        (group.templateCliOnly && group.templateSkills?.includes('maker-ui-bbox-workflow')))
  );
  const members = resourceBundleMembers(document, sectionId).filter(
    (node) =>
      (!memberId || node.id === memberId) &&
      (completeBbox ||
        !terminal ||
        node.uiEmpty ||
        node.imageAssetsInfo?.items.length ||
        !node.templatePending)
  );
  if (
    completeBbox &&
    document.nodes.some(
      (node) =>
        node.sectionId === group!.id && node.type === 'image-assets' && !members.includes(node)
    )
  )
    throw new Error('实验模板有资源卡未连接到资源包，不能作为完整结果导出。');
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
      (node.type === 'image' && !node.assetPath && !node.uiEmpty)
    )
      throw new Error('「' + node.title + '」尚未完成或来源已变化，请重新生成并切图后再下载。');
    sources.forEach(check);
    checking.delete(node.id);
    checked.add(node.id);
  }
  let count = 0;
  const completed: CanvasNode[] = [];
  for (const member of members) {
    check(member);
    if (member.uiEmpty) continue;
    if (!member.imageAssetsInfo?.items.length)
      throw new Error('「' + member.title + '」尚未完成切图，未导出文件。');
    count += validation.validateImageAssetsInfo(member.imageAssetsInfo).items.length;
    completed.push(member);
  }
  if (count > maxFiles) throw new Error('素材总数超过单包上限 122 张，请按分类分别下载。');
  if (completeBbox) {
    const source = document.nodes.find(
      (node) => node.sectionId === group!.id && node.uiRecognition?.inputRole === 'text-free'
    );
    const bbox = source && selectedUiRecognition(source)?.bbox;
    if (!bbox) throw new Error('缺少当前识图结果，不能确认完整交付。');
    const coverage = new Set<string>();
    for (const member of completed) {
      const image = canvasReferences(document, member.id).find((node) => node.type === 'image')!;
      const plan = validation.imageAssetsBindingPlan(image, member.imageAssetsInfo!);
      if (!plan) {
        if (image.uiAtlasGroup) throw new Error('批次缺少生成时的槽位绑定：' + image.title);
        if (
          image.uiArtTextId &&
          (member.imageAssetsInfo!.items.length !== 1 ||
            (image.uiArtTextId !== 'main-title' &&
              !bbox.texts.some((text) => text.id === image.uiArtTextId)))
        )
          throw new Error('美术字来源或单项 PNG 数量不匹配：' + image.title);
        continue;
      }
      if (JSON.stringify(plan.bbox) !== JSON.stringify(validation.validateUiBbox(bbox)))
        throw new Error('批次绑定的识图版本已变化，请重新处理。');
      for (const slot of plan.slots.slice(0, member.imageAssetsInfo!.items.length))
        for (const id of slot.elementIds) {
          const key = id + ':' + slot.state;
          if (coverage.has(key)) throw new Error('组件状态重复绑定：' + key);
          coverage.add(key);
        }
    }
    const missing = bbox.elements.flatMap((element) => {
      const original = bbox.elements.find((item) => item.id === element.duplicateOf) || element;
      return (['button', 'tab'].includes(original.type) ? ['normal', 'pressed'] : ['normal'])
        .filter((state) => !coverage.has(element.id + ':' + state))
        .map((state) => element.id + ':' + state);
    });
    if (missing.length) throw new Error('UI 素材尚未全部完成，缺少：' + missing.join(', '));
  }
  return completed;
}
