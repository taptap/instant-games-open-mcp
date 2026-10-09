import data from './uiWorkflowData.json';
import type { CanvasPreset } from './presets.js';
import { snapshotCanvasSource, canvasDependents } from './dependencies.js';
import type { CanvasDocument } from './model.js';
import { canvasOriginalImage, imageResultWarning } from './imageSizing.js';

export function upgradeUiWorkflowSizing(document: Pick<CanvasDocument, 'nodes' | 'edges'>): void {
  for (const section of document.nodes.filter(
    (node) => node.templateId === data.id && (node.templateRevision || 0) < 8
  )) {
    for (const node of document.nodes.filter((node) => node.sectionId === section.id)) {
      const preset = data.nodes.find(
        (item) =>
          item.title.replace(/[ ]+·[ ]+[0-9]+[ ]*(PNG|格)$/, '') ===
          node.title.replace(/[ ]+·[ ]+[0-9]+[ ]*(PNG|格)$/, '')
      );
      const input = node.generationDraft || node.generation;
      let changed = false;
      if (
        preset?.generation?.parameters?.aspectRatio === 'source' &&
        input?.parameters?.aspectRatio === '9:16' &&
        (node.uiBaselinePrompt || input.prompt) === preset.generation.prompt
      ) {
        input.parameters.aspectRatio = 'source';
        const original = canvasOriginalImage(document as CanvasDocument, node)?.imageInfo;
        changed =
          !node.imageInfo ||
          !original ||
          Boolean(imageResultWarning(node.imageInfo, original.width + 'x' + original.height));
      }
      if (preset?.uiExtraction === 'frame' && input) {
        const oldPrompt = preset
          .generation!.prompt!.replace(
            'Use the requested output canvas dimensions',
            '1152x2048 canvas'
          )
          .replace('of at most 40% of each cell height', 'of 120 pixels maximum')
          .replace(
            'Place each thumbnail at the center of its equal-height cell, using relative positions rather than fixed pixel coordinates.',
            'Their center coordinates are exactly (576,146), (576,439), (576,731), (576,1024), (576,1316), (576,1609), (576,1901).'
          );
        if (input.prompt === oldPrompt) {
          input.prompt = preset.generation!.prompt!;
          changed = true;
        }
        if (node.uiBaselinePrompt === oldPrompt) {
          node.uiBaselinePrompt = preset.generation!.prompt!;
          changed = true;
        }
      }
      if (changed)
        for (const target of [node, ...canvasDependents(document as CanvasDocument, node.id)])
          if (target.sectionId && target.type !== 'note') target.templatePending = true;
    }
    section.templateRevision = 8;
  }
  for (const section of document.nodes.filter(
    (node) => node.templateId === data.id && (node.templateRevision || 0) < 9
  )) {
    const clean = document.nodes.find(
      (node) => node.sectionId === section.id && node.title === '② 去文字设计稿'
    );
    if (!clean) continue;
    const original = document.nodes.find(
      (node) =>
        node.sectionId === section.id &&
        node.uiRecognition &&
        node.id !== clean.id &&
        document.edges.some((edge) => edge.from === node.id && edge.to === clean.id)
    );
    // Keep an outstanding provider request recoverable until it is resolved.
    if (original?.uiRecognition?.pendingId) continue;
    clean.uiRecognition ||= original?.uiRecognition
      ? { ...original.uiRecognition, selectedId: undefined }
      : { enabled: false, results: [] };
    if (original) {
      delete original.uiRecognition;
      for (const note of document.nodes)
        if (note.uiRecognitionSourceId === original.id) note.uiRecognitionSourceId = clean.id;
      if (clean.uiRecognition.enabled)
        for (const target of canvasDependents(document as CanvasDocument, clean.id))
          if (target.sectionId && target.type !== 'note') target.templatePending = true;
    }
    section.templateRevision = 9;
  }
}

export function createUiWorkflowPreset(): CanvasPreset {
  const template = structuredClone(data) as unknown as CanvasPreset;
  for (const node of template.nodes) {
    if (node.uiExtraction || node.type === 'image-assets')
      node.title = node.title.replace(/[ ]+·[ ]+[0-9]+[ ]*(PNG|格)$/, '');
    if (node.uiExtraction) {
      const targetId = template.edges.find(
        (edge) => edge.from === node.id && edge.kind === 'image-assets'
      )?.to;
      node.uiBaselineGrid = template.nodes.find(
        (item) => item.id === targetId
      )?.imageAssetsInfo?.grid;
    }
    if (node.uiExtraction || node.uiAnnotation)
      node.uiBaselinePrompt = node.generation?.prompt || node.generationDraft?.prompt;
    const sources = template.edges
      .filter((edge) => edge.to === node.id)
      .flatMap((edge) => {
        const snapshot = snapshotCanvasSource(template.nodes.find((item) => item.id === edge.from));
        return snapshot ? [snapshot] : [];
      });
    if (sources.length) {
      node.sourceSnapshot = sources[0];
      if (node.type === 'image') {
        node.sourceSnapshots = sources;
        node.referenceInput = { includeSelf: false };
      }
    }
  }
  return template;
}
