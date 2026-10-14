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
  list.addEventListener('wheel', (event) => event.stopPropagation());
  list.addEventListener('pointerdown', (event) => event.stopPropagation());
  const groups = members.map((member) => ({
    member,
    large: ['background', 'panels'].includes(
      current.nodes.find((source) => source.id === member.sourceSnapshot?.nodeId)?.uiAtlasGroup ||
        ''
    ),
  }));
  groups.sort((a, b) => Number(a.large) - Number(b.large));
  for (const { member, large } of groups) {
    const row = document.createElement('div');
    row.className = 'resource-bundle-category' + (large ? ' large' : '');
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
    previews.className = 'resource-bundle-previews';
    const more = document.createElement('details');
    const toggle = document.createElement('summary');
    toggle.textContent = '查看全部 ' + (member.imageAssetsInfo?.items.length || 0) + ' 件';
    const remaining = document.createElement('div');
    remaining.className = 'resource-bundle-previews';
    more.append(toggle, remaining);
    for (const [index, item] of (member.imageAssetsInfo?.items || []).entries()) {
      const preview = document.createElement('img');
      preview.src = mediaUrl(item.assetPath);
      preview.alt = item.name;
      preview.loading = 'lazy';
      (index < 4 ? previews : remaining).append(preview);
    }
    row.append(previews);
    if ((member.imageAssetsInfo?.items.length || 0) > 4) row.append(more);
    list.append(row);
  }
  card.append(list);
}
