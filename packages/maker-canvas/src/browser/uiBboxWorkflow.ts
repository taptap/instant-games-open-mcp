import type { CanvasDocument, CanvasNode, CanvasEdge, UiAtlasGroup } from '../contracts.js';
import { selectedUiRecognition, uiRecognitionInputs } from '../features/uiRecognition.js';
import { imageRatioInfo } from '../features/imageSizing.js';
import { canvasReferences, snapshotCanvasSource } from '../core/dependencies.js';
import { resourceBundleOwner } from '../features/resourceBundle.js';
import {
  uiWorkflowAtlasPlans,
  uiBatchAtlasPrompt,
  uiNativeAtlasPrompt,
  uiAtlasElementGroup,
} from '../features/uiAssetBindings.js';

export function syncUiBboxWorkflow(
  current: CanvasDocument,
  groupId: string,
  artText: boolean | string[],
  background = false
) {
  const group = current.nodes.find((node) => node.id === groupId && node.type === 'section');
  if (
    !group ||
    !(
      group.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015' ||
      (group.templateCliOnly && group.templateSkills?.includes('maker-ui-bbox-workflow'))
    )
  )
    throw new Error('仅 Bbox 预排实验模板支持按需编排。');
  const members = current.nodes.filter((node) => node.sectionId === groupId);
  const sources = members.filter((node) => node.uiRecognition?.inputRole === 'text-free');
  if (sources.length !== 1) throw new Error('分组需要唯一的去文字识图输入。');
  const source = sources[0];
  const result = selectedUiRecognition(source);
  const bbox = result?.bbox;
  if (!bbox) throw new Error('请先完成当前设计稿的识图，再同步批次。');
  const design = uiRecognitionInputs(current, source).design;
  if (design.templatePending || design.assetPath !== bbox.design.path)
    throw new Error('原稿已变化，请先更新识图结果。');
  const textIds = Array.isArray(artText) ? [...new Set(artText)] : [];
  const wantedArtText = textIds.length ? textIds : artText === true ? ['main-title'] : [];
  if (textIds.some((id) => !bbox.texts.some((text) => text.id === id)))
    throw new Error('美术字 ID 不在当前识图文字清单中。');
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const labels: Record<UiAtlasGroup, string> = {
    controls: '控件与状态',
    icons: '图标与背包',
    equipment: '装备与槽框',
    panels: '面板与长条',
    artwork: '角色与插画',
    background: '环境背景',
  };
  // Initial positions only; layoutUiWorkflowGroup places every card below.
  const baseY = group.y + 56;
  const baseX = group.x + 28;
  function card(type: CanvasNode['type'], title: string, column: number, row: number): CanvasNode {
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type,
      title,
      sectionId: groupId,
      x: baseX + column * 360,
      y: baseY + row * 370,
      width: 300,
      height: 300,
      templatePending: true,
    };
    nodes.push(node);
    return node;
  }
  function connect(from: CanvasNode, to: CanvasNode, kind: CanvasEdge['kind']) {
    if (
      !current.edges.some(
        (edge) => edge.from === from.id && edge.to === to.id && edge.kind === kind
      )
    )
      edges.push({ id: crypto.randomUUID(), from: from.id, to: to.id, kind });
  }
  const bundle =
    members.find((node) => node.type === 'resource-bundle') ||
    card('resource-bundle', 'UI 资源包', 2, 0);
  let row = 0;
  for (const category of Object.keys(labels) as UiAtlasGroup[]) {
    if (
      category === 'background' &&
      !background &&
      !bbox.elements.some((element) => uiAtlasElementGroup(element, bbox) === 'background')
    )
      continue;
    const probe: CanvasNode = { ...source, id: 'bbox-plan-probe', uiAtlasGroup: category };
    delete probe.uiRecognition;
    const planning = {
      ...current,
      nodes: [...current.nodes, probe],
      edges: [
        ...current.edges,
        { id: 'bbox-plan-source', from: source.id, to: probe.id, kind: 'image-variant' as const },
      ],
    };
    const plans = uiWorkflowAtlasPlans(planning, probe, bbox);
    for (const [batch, plan] of plans.entries()) {
      if (plan.slots.every((slot) => slot.role === 'reserve')) continue;
      const existing = members.find(
        (node) =>
          node.type === 'image' &&
          !node.uiAtlasPrelayout &&
          node.uiAtlasGroup === category &&
          (node.uiAtlasBatch ?? 0) === batch
      );
      if (existing) {
        const prelayout = current.edges
          .filter((edge) => edge.to === existing.id)
          .map((edge) => members.find((node) => node.id === edge.from && node.uiAtlasPrelayout))
          .filter((node): node is CanvasNode => Boolean(node));
        if (
          prelayout.length !== 1 ||
          !current.edges.some((edge) => edge.from === source.id && edge.to === prelayout[0].id)
        )
          throw new Error('已有批次预排连线不完整，请修复后继续：' + existing.title);
        const assets = current.edges
          .filter((edge) => edge.from === existing.id && edge.kind === 'image-assets')
          .map((edge) =>
            members.find((node) => node.id === edge.to && node.type === 'image-assets')
          )
          .filter((node): node is CanvasNode => Boolean(node));
        if (assets.length !== 1)
          throw new Error('已有批次切图连线不完整，请修复后继续：' + existing.title);
        connect(assets[0], bundle, 'resource-bundle');
        continue;
      }
      const title = labels[category] + ' · ' + (batch + 1);
      const prelayout = card('image', '预排 · ' + title, 0, row);
      const image = card('image', '分离 · ' + title, 1, row);
      const assets = card('image-assets', title, 2, row++);
      const prompt = plan.nativeLayout ? uiNativeAtlasPrompt() : uiBatchAtlasPrompt(category, true);
      for (const node of [prelayout, image]) {
        node.uiAtlasGroup = category;
        node.uiAtlasBatch = batch;
        node.uiBaselinePrompt = prompt;
        node.uiBaselineGrid = { ...plan.grid };
        node.referenceInput = { includeSelf: false };
        node.generationDraft = {
          operation: 'variant',
          prompt,
          parameters: {
            model: 'gpt',
            resolution:
              plan.nativeLayout &&
              Math.max(plan.nativeLayout.width, plan.nativeLayout.height) <= 1024
                ? '1K'
                : '2K',
            aspectRatio: plan.nativeLayout ? imageRatioInfo(plan.nativeLayout).common! : '1:1',
          },
        };
      }
      prelayout.uiAtlasPrelayout = true;
      prelayout.generation = { ...prelayout.generationDraft!, prompt };
      delete prelayout.generationDraft;
      prelayout.assetPath = source.assetPath;
      prelayout.imageInfo = source.imageInfo ? { ...source.imageInfo } : undefined;
      connect(source, prelayout, 'image-variant');
      connect(prelayout, image, 'image-variant');
      connect(image, assets, 'image-assets');
      connect(assets, bundle, 'resource-bundle');
    }
  }
  function connectArtText(image: CanvasNode, textId: string) {
    if (!bbox!.texts.some((text) => text.id === textId)) {
      connect(design, image, 'image-variant');
      return;
    }
    if (
      current.edges.some(
        (edge) =>
          edge.to === image.id &&
          members.some((node) => node.id === edge.from && node.uiAtlasPrelayout)
      )
    )
      return;
    const prelayout = card('image', '预排 · 美术字 · ' + textId, 0, row);
    prelayout.y = image.y;
    prelayout.uiAtlasPrelayout = true;
    prelayout.uiArtTextId = textId;
    prelayout.assetPath = design.assetPath;
    prelayout.imageInfo = design.imageInfo ? { ...design.imageInfo } : undefined;
    prelayout.referenceInput = { includeSelf: false };
    prelayout.generation = { operation: 'variant', prompt: uiNativeAtlasPrompt() };
    current.edges = current.edges.filter(
      (edge) => !(edge.from === design.id && edge.to === image.id && edge.kind === 'image-variant')
    );
    connect(design, prelayout, 'image-variant');
    connect(prelayout, image, 'image-variant');
  }
  for (const textId of wantedArtText) {
    const text = bbox.texts.find((item) => item.id === textId);
    const existing = members.find(
      (node) =>
        node.type === 'image' &&
        (node.uiArtTextId === textId || (textId === 'main-title' && !node.uiArtTextId)) &&
        !node.uiAtlasGroup &&
        current.edges.some((edge) => edge.from === node.id && edge.kind === 'image-assets')
    );
    if (existing) {
      const assets = members.find(
        (node) =>
          node.type === 'image-assets' &&
          current.edges.some(
            (edge) =>
              edge.from === existing.id && edge.to === node.id && edge.kind === 'image-assets'
          )
      )!;
      connectArtText(existing, textId);
      connect(assets, bundle, 'resource-bundle');
      continue;
    }
    const image = card('image', text ? '美术字 · ' + textId : '美术字提取', 1, row);
    const assets = card('image-assets', text ? '美术字资源 · ' + textId : '美术字资源', 2, row++);
    image.uiArtTextId = textId;
    image.referenceInput = { includeSelf: false };
    image.uiBaselineGrid = { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
    image.generationDraft = {
      operation: 'variant',
      prompt:
        (text
          ? '提取目标：' +
            textId +
            '，文字“' +
            text.text +
            '”，原稿像素框 [x,y,w,h]：' +
            text.bbox.join(',') +
            '。'
          : '') +
        '保留：仅指定文字（未指定时为主标题）的字形、颜色、描边和字效。移除：底板、框、图标、人物及其它文字。输出：一组完整字形居中，保持比例，充分留白，纯绿色 RGB(0,255,0) 背景，不新增内容。',
      parameters: { model: 'gpt', resolution: '2K', aspectRatio: '1:1' },
    };
    connectArtText(image, textId);
    connect(image, assets, 'image-assets');
    connect(assets, bundle, 'resource-bundle');
  }
  if (current.nodes.length + nodes.length > 400 || current.edges.length + edges.length > 800)
    throw new Error('批次超过当前画布容量，未创建卡片；请拆到另一个画布处理。');
  if (nodes.length) bundle.y = baseY + row * 370;
  delete bundle.templatePending;
  group.templateCliOnly = true;
  current.nodes.push(...nodes);
  current.edges.push(...edges);
  // Keep previous artwork and connections, but retire unselected branches until requested again.
  // The extra environment background follows the same rule unless the Bbox itself needs it.
  const backgroundActive =
    background ||
    bbox.elements.some((element) => uiAtlasElementGroup(element, bbox) === 'background');
  for (const image of current.nodes.filter(
    (node) =>
      node.sectionId === groupId &&
      node.type === 'image' &&
      (node.uiArtTextId || node.uiAtlasGroup === 'background')
  )) {
    const active = image.uiArtTextId ? wantedArtText.includes(image.uiArtTextId) : backgroundActive;
    const branch = [
      image,
      ...current.nodes.filter(
        (node) =>
          node.sectionId === groupId &&
          node.type === 'image-assets' &&
          current.edges.some(
            (edge) => edge.from === image.id && edge.to === node.id && edge.kind === 'image-assets'
          )
      ),
    ];
    for (const node of branch) {
      if (active) {
        if (!node.uiEmpty) continue;
        delete node.uiEmpty;
        node.templatePending = true;
      } else {
        node.uiEmpty = true;
        delete node.templatePending;
        const sources = canvasReferences(current, node.id);
        if (node.type === 'image-assets') {
          // Cut cards record their single source with sourceSnapshot; the saved document rejects
          // sourceSnapshots on them, which made unticking a branch fail to save.
          const source = sources.find((item) => item.type === 'image');
          if (source) node.sourceSnapshot = snapshotCanvasSource(source);
          delete node.sourceSnapshots;
        } else {
          node.sourceSnapshots = sources.map((source) => snapshotCanvasSource(source)!);
          delete node.sourceSnapshot;
        }
      }
    }
  }
  layoutUiWorkflowGroup(current, groupId);
  return nodes.map((node) => node.id);
}

/**
 * Arrange one 015 group from its fixed origin using real card sizes: inputs on the first row,
 * then three "prelayout → separation" flows per row (cut cards stay collapsed into the bundle),
 * then the resource bundle. Re-running never drifts. Returns true when anything moved.
 */
export function layoutUiWorkflowGroup(document: CanvasDocument, groupId: string): boolean {
  const group = document.nodes.find((node) => node.id === groupId && node.type === 'section');
  if (
    !group ||
    !(
      group.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015' ||
      group.templateSkills?.includes('maker-ui-bbox-workflow')
    )
  )
    return false;
  const before = JSON.stringify(
    document.nodes
      .filter((node) => node.sectionId === groupId || node.id === groupId)
      .map((node) => [node.x, node.y, node.width, node.height])
  );
  const members = document.nodes.filter((node) => node.sectionId === groupId);
  const visible = members.filter((node) => !resourceBundleOwner(document, node.id));
  const placed = new Set<string>();
  const left = group.x + 28;
  let y = group.y + 56;
  function row(nodes: CanvasNode[], x = left) {
    let bottom = y;
    for (const node of nodes) {
      node.x = x;
      node.y = y;
      x += node.width + 28;
      bottom = Math.max(bottom, y + node.height);
      placed.add(node.id);
    }
    return bottom;
  }
  const inputs = ['design', 'text-free'].flatMap((role) =>
    visible.filter((node) => node.uiRecognition?.inputRole === role)
  );
  const designs = inputs.flatMap((input) =>
    canvasReferences(document, input.id).filter(
      (node) => node.sectionId === groupId && node.type === 'image' && !inputs.includes(node)
    )
  );
  y = row([...new Set([...designs, ...inputs])]) + 80;
  const categories = ['controls', 'icons', 'equipment', 'panels', 'artwork', 'background'];
  const rank = (node: CanvasNode) =>
    categories.indexOf(node.uiAtlasGroup || '') < 0 ? 6 : categories.indexOf(node.uiAtlasGroup!);
  const sources = visible
    .filter(
      (node) =>
        node.type === 'image' &&
        !node.uiAtlasPrelayout &&
        !placed.has(node.id) &&
        document.edges.some(
          (edge) =>
            edge.from === node.id &&
            members.some((item) => item.id === edge.to && item.type === 'image-assets')
        )
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.uiAtlasBatch || 0) - (b.uiAtlasBatch || 0) ||
        (a.uiArtTextId || a.id).localeCompare(b.uiArtTextId || b.id)
    );
  const flows = sources.map((source) => [
    ...canvasReferences(document, source.id).filter(
      (node) => node.sectionId === groupId && node.uiAtlasPrelayout
    ),
    source,
  ]);
  const widths = [0, 0, 0];
  flows.forEach((nodes, index) => {
    widths[index % 3] = Math.max(
      widths[index % 3],
      nodes.reduce((sum, node) => sum + node.width + 28, 0)
    );
  });
  for (let index = 0; index < flows.length; index += 3) {
    let x = left;
    let bottom = y;
    for (let column = 0; column < 3 && index + column < flows.length; column++) {
      bottom = Math.max(bottom, row(flows[index + column], x));
      x += widths[column] + 52;
    }
    y = bottom + 80;
  }
  const remaining = visible.filter(
    (node) => !placed.has(node.id) && node.type !== 'resource-bundle'
  );
  if (remaining.length) y = row(remaining) + 80;
  row(visible.filter((node) => node.type === 'resource-bundle'));
  // Collapsed resource cards sit on their source and reserve no space.
  for (const node of members.filter((item) => resourceBundleOwner(document, item.id))) {
    const source = canvasReferences(document, node.id).find((item) => placed.has(item.id));
    if (source) {
      node.x = source.x;
      node.y = source.y;
    }
  }
  group.width = Math.max(240, ...visible.map((node) => node.x + node.width + 28 - group.x));
  group.height = Math.max(160, ...visible.map((node) => node.y + node.height + 28 - group.y));
  return (
    before !==
    JSON.stringify(
      document.nodes
        .filter((node) => node.sectionId === groupId || node.id === groupId)
        .map((node) => [node.x, node.y, node.width, node.height])
    )
  );
}
