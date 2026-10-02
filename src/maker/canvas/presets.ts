import presetData from './presetData.json';
import type { CanvasWorkflowTemplate } from './templates.js';
import { createVideoPrompts } from './videoPrompts.js';

export interface CanvasPreset extends CanvasWorkflowTemplate {
  assets: Record<string, { type: string; data: string }>;
}

export function canvasPresets(): CanvasPreset[] {
  const prompts = createVideoPrompts();
  return (presetData as unknown as CanvasPreset[]).map((preset, index) => {
    const template = { ...preset, nodes: structuredClone(preset.nodes) };
    const videos = template.nodes.filter((node) => node.type === 'video-source');
    for (const video of videos) {
      video.generation = {
        ...video.generation,
        prompt: prompts.build({
          kind: index === 2 ? 'generic' : 'character',
          play: index === 0 ? 'attack' : index === 1 ? 'loop' : 'once',
          action: video.generation?.prompt || '',
          keyColor: index === 2 ? 'green' : 'magenta',
        }),
      };
    }
    if (index === 1) {
      const directions = ['front', 'back', 'left', 'right'] as const;
      for (const [directionIndex, direction] of directions.entries()) {
        const reference = template.nodes.find(
          (node) => node.id === '7e1cb6ad-732f-4dc3-a951-00000000001' + directionIndex
        );
        if (reference) {
          reference.exportDirection = direction;
          reference.generationDraft = {
            operation: 'variant',
            sourceImageId: reference.generationDraft?.sourceImageId,
            prompt: prompts.referenceImage(direction),
          };
        }
      }
    }
    const assetPaths = new Set(
      template.nodes.flatMap((node) => [
        ...(node.assetPath ? [node.assetPath] : []),
        ...(node.generation?.referenceImagePaths || []),
      ])
    );
    template.assets = Object.fromEntries(
      Object.entries(preset.assets).filter(([assetPath]) => assetPaths.has(assetPath))
    );
    return template;
  });
}

export function builtinCanvasTemplates(): CanvasWorkflowTemplate[] {
  return canvasPresets().map(({ assets: _assets, ...template }) => ({
    ...template,
    builtin: true,
  }));
}
