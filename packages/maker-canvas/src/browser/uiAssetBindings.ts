import type { CanvasDocument, CanvasNode, UiAtlasPlan } from '../contracts.js';
import { uiWorkflowAtlasPlans } from '../features/uiAssetBindings.js';
import { uiRecognitionSource, selectedUiRecognition } from '../features/uiRecognition.js';

export function ensureUiAtlasBatchCards(document: CanvasDocument, groupId?: string): boolean {
  let changed = false;
  const expansions: Array<{ seed: CanvasNode; plans: UiAtlasPlan[]; sourceId: string }> = [];
  for (const seed of [...document.nodes]) {
    if (
      seed.type !== 'image' ||
      seed.uiAtlasPrelayout ||
      !seed.uiAtlasGroup ||
      (seed.uiAtlasBatch ?? 0) !== 0 ||
      (groupId && seed.sectionId !== groupId)
    )
      continue;
    const recognition = uiRecognitionSource(document, seed);
    if (recognition?.uiRecognition?.optional) continue;
    const bbox = recognition?.uiRecognition?.enabled && selectedUiRecognition(recognition)?.bbox;
    if (!bbox) continue;
    const plans = uiWorkflowAtlasPlans(document, seed, bbox);
    expansions.push({ seed, plans, sourceId: recognition.id });
  }
  // Validate every category before adding cards, so a blocked upgrade leaves no partial batches.
  for (const { seed, plans, sourceId } of expansions) {
    for (let batch = 1; batch < plans.length; batch++) {
      if (
        document.nodes.some(
          (node) =>
            node.sectionId === seed.sectionId &&
            !node.uiAtlasPrelayout &&
            node.uiAtlasGroup === seed.uiAtlasGroup &&
            uiRecognitionSource(document, node)?.id === sourceId &&
            (node.uiAtlasBatch ?? 0) === batch
        )
      )
        continue;
      cloneUiAtlasBatch(document, seed, batch);
      changed = true;
    }
  }
  return changed;
}

export function cloneUiAtlasBatch(
  document: CanvasDocument,
  seed: CanvasNode,
  batch: number
): CanvasNode {
  const imageId = crypto.randomUUID();
  const offset = batch * (seed.width + 48);
  const image: CanvasNode = {
    ...structuredClone(seed),
    id: imageId,
    x: seed.x + offset,
    title: seed.title.replace(/ · \d+$/, '') + ' · ' + (batch + 1),
    uiAtlasBatch: batch,
    templatePending: true,
  };
  delete image.workDurationMs;
  image.generationDraft = {
    operation: seed.generationDraft?.operation || seed.generation?.operation || 'variant',
    prompt: seed.uiBaselinePrompt || seed.generationDraft?.prompt || seed.generation?.prompt || '',
    parameters: structuredClone(
      seed.generationDraft?.parameters || seed.generation?.parameters || {}
    ),
  };
  delete image.generation;
  delete image.assetPath;
  delete image.imageInfo;
  delete image.sourceSnapshot;
  delete image.uiAtlasPlan;
  if (seed.uiAtlasPrelayout) {
    // Keep a preview so existing reference edges remain valid; templatePending blocks reuse.
    image.assetPath = seed.assetPath;
    image.imageInfo = seed.imageInfo ? { ...seed.imageInfo } : undefined;
    image.referenceInput = { includeSelf: false };
    if (image.assetPath) {
      image.generation = { ...image.generationDraft!, prompt: image.generationDraft!.prompt || '' };
      delete image.generationDraft;
    }
  }
  document.nodes.push(image);
  for (const edge of document.edges.filter((item) => item.to === seed.id)) {
    const source = document.nodes.find((node) => node.id === edge.from);
    const from =
      source?.uiAtlasPrelayout && !seed.uiAtlasPrelayout
        ? cloneUiAtlasBatch(document, source, batch).id
        : edge.from;
    document.edges.push({ ...structuredClone(edge), id: crypto.randomUUID(), from, to: imageId });
    if (source?.uiAtlasPrelayout && !seed.uiAtlasPrelayout) {
      image.generationDraft!.sourceImageId = from;
      image.generationDraft!.sourceImageIds = [from];
    }
  }
  const assetsEdge = document.edges.find(
    (edge) => edge.kind === 'image-assets' && edge.from === seed.id
  );
  const assets = assetsEdge && document.nodes.find((node) => node.id === assetsEdge.to);
  if (!assets) return image;
  const assetsId = crypto.randomUUID();
  const copy: CanvasNode = {
    ...structuredClone(assets),
    id: assetsId,
    x: assets.x + offset,
    title: assets.title.replace(/ · \d+$/, '') + ' · ' + (batch + 1),
    templatePending: true,
  };
  delete copy.workDurationMs;
  delete copy.imageAssetsInfo;
  delete copy.sourceSnapshot;
  document.nodes.push(copy);
  document.edges.push({
    id: crypto.randomUUID(),
    from: imageId,
    to: assetsId,
    kind: 'image-assets',
  });
  for (const edge of document.edges.filter(
    (item) =>
      item.from === assets.id &&
      document.nodes.some((node) => node.id === item.to && node.type === 'resource-bundle')
  ))
    document.edges.push({ ...structuredClone(edge), id: crypto.randomUUID(), from: assetsId });
  return image;
}
