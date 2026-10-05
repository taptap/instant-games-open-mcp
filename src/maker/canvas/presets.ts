import presetData from './presetData.json';
import modelPresetData from './modelPresetData.json';
import type { CanvasWorkflowTemplate } from './templates.js';
import { createVideoPrompts } from './videoPrompts.js';
import { createAssetPresets } from './assetPresets.js';
import { createUiWorkflowPreset } from './uiWorkflowPresets.js';

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
    if (index === 2) {
      const video = videos[0];
      const images = template.nodes.filter((node) => node.type === 'image');
      template.revision = 3;
      video.videoInputMode = 'first_last_frame';
      video.generation!.prompt =
        '单只四足灰狼从首帧姿态开始，身体与四肢连续变化，逐渐直立成为尾帧的人形狼王。结束时接近尾帧的外观、朝向、姿势和构图，最后半秒保持尾帧姿态。只发生一次变身，不溶解叠化，不新增角色，不淡出或消失。固定镜头、全身完整，沿用参考图的美术风格和纯色背景。';
      template.edges = template.edges.map((edge) =>
        edge.to === video.id
          ? { ...edge, kind: edge.from === images[0].id ? 'frame-first' : 'frame-last' }
          : edge
      );
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
  const characterPath = 'assets/image/preset-model-cat-reference.png';
  return [
    ...sequences,
    {
      id: '7e1cb6ad-732f-4dc3-a951-000000000004',
      name: '角色模型 · 多视图确认',
      revision: 3,
      assets: { [characterPath]: { ...modelPresetData.asset } },
      nodes: [
        {
          id: character,
          type: 'image',
          title: '角色原型 · 先确认外观',
          x: 0,
          y: 0,
          width: 260,
          height: 310,
          assetPath: characterPath,
          generation: { ...structuredClone(modelPresetData.generation), operation: 'generate' },
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
    ...createAssetPresets(),
    createUiWorkflowPreset(),
  ];
}

export function builtinCanvasTemplates(): CanvasWorkflowTemplate[] {
  return canvasPresets().map(({ assets: _assets, ...template }) => ({
    ...template,
    builtin: true,
  }));
}
