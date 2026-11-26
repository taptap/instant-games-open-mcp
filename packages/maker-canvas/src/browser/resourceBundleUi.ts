import type { CanvasDocument, CanvasNode } from '../contracts.js';
import {
  resourceBundleMembers,
  resourceBundleOwner,
  validateResourceBundleStructure,
} from '../features/resourceBundle.js';

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

export function configureBundleGallery(list: HTMLElement, node: CanvasNode): boolean {
  if (node.type !== 'resource-bundle' || node.width < 1200 || node.height < 700) return false;
  list.classList.add('bundle-gallery');
  list.style.setProperty('--tile', Math.min((node.height - 350) / 5.3, node.width / 15) + 'px');
  list.style.maxHeight = node.height - 100 + 'px';
  return true;
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
  const expanded = configureBundleGallery(list, node);
  const previewLimit = expanded ? count : 4;
  list.addEventListener('wheel', (event) => event.stopPropagation());
  list.addEventListener('pointerdown', (event) => event.stopPropagation());
  const groups = members.map((member) => ({
    member,
    group: current.nodes.find((source) => source.id === member.sourceSnapshot?.nodeId)
      ?.uiAtlasGroup,
  }));
  const isLarge = (group?: string) => group === 'background' || group === 'panels';
  groups.sort((a, b) => Number(isLarge(a.group)) - Number(isLarge(b.group)));
  for (const { member, group } of groups) {
    const row = document.createElement('div');
    row.className = 'resource-bundle-category' + (isLarge(group) ? ' large' : '');
    row.dataset.group = group || '';
    const label = document.createElement('strong');
    label.textContent = member.title;
    const status = document.createElement('span');
    try {
      validateResourceBundleStructure(current, node.id, 122, member.id);
      status.textContent = member.uiEmpty
        ? '无需素材'
        : member.imageAssetsInfo!.items.length + ' 张';
    } catch {
      status.textContent = '待完成';
    }
    row.append(label, status);
    const previews = document.createElement('div');
    previews.className = 'resource-bundle-previews bundle-tiles';
    const more = document.createElement('details');
    const toggle = document.createElement('summary');
    const items = member.imageAssetsInfo?.items || [];
    toggle.textContent = '再看 ' + (items.length - previewLimit) + ' 件';
    const remaining = document.createElement('div');
    remaining.className = 'resource-bundle-previews';
    more.append(toggle, remaining);
    for (const [index, item] of items.entries()) {
      const preview = document.createElement('img');
      preview.src = mediaUrl(item.assetPath);
      preview.addEventListener('error', () => {
        preview.alt = '图片丢失：' + item.name;
      });
      preview.alt = item.name;
      preview.title = member.title + ' · ' + item.name;
      preview.loading = 'lazy';
      (index < previewLimit ? previews : remaining).append(preview);
    }
    row.append(previews);
    if (items.length > previewLimit) row.append(more);
    list.append(row);
  }
  card.append(list);
}
