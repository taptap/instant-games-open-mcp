import presetData from './presetData.json';
import type { CanvasWorkflowTemplate } from './templates.js';
import { createVideoPrompts } from './videoPrompts.js';

export interface CanvasPreset extends CanvasWorkflowTemplate {
  assets: Record<string, { type: string; data: string }>;
}

export function canvasPresets(): CanvasPreset[] {
  const prompts = createVideoPrompts();
  const sequences = (presetData as unknown as CanvasPreset[]).map((preset, index) => {
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
  const character = '7e1cb6ad-732f-4dc3-a951-000000000041';
  const views = '7e1cb6ad-732f-4dc3-a951-000000000042';
  const model = '7e1cb6ad-732f-4dc3-a951-000000000043';
  return [
    ...sequences,
    {
      id: '7e1cb6ad-732f-4dc3-a951-000000000004',
      name: '角色模型 · 多视图确认',
      revision: 1,
      assets: {},
      nodes: [
        {
          id: character,
          type: 'image',
          title: '角色原型 · 先确认外观',
          x: 0,
          y: 0,
          width: 260,
          height: 310,
          generationDraft: {
            operation: 'generate',
            prompt:
              '游戏角色，单个完整主体，正面全身，A姿势，双臂与身体分离，双脚分开，无遮挡，纯白背景，无地面、底座和文字。',
          },
        },
        {
          id: views,
          type: 'model-views',
          title: '多视图 · 确认后生模',
          x: 340,
          y: 0,
          width: 480,
          height: 360,
          modelQuality: 'balanced',
        },
        { id: model, type: 'model', title: '3D 模型', x: 900, y: 0, width: 300, height: 360 },
      ],
      edges: [
        {
          id: '7e1cb6ad-732f-4dc3-a951-000000000044',
          from: character,
          to: views,
          kind: 'character-views',
        },
        { id: '7e1cb6ad-732f-4dc3-a951-000000000045', from: views, to: model, kind: 'views-model' },
      ],
    },
  ];
}

export function builtinCanvasTemplates(): CanvasWorkflowTemplate[] {
  return canvasPresets().map(({ assets: _assets, ...template }) => ({
    ...template,
    builtin: true,
  }));
}
