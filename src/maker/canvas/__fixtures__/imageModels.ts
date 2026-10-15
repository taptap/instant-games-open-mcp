import type { CanvasImageModels } from '../../../../packages/maker-canvas/src/contracts.js';

export function imageModelsFixture(
  tool: CanvasImageModels['tool'] = 'generate_image'
): CanvasImageModels {
  return {
    provider: { source: 'maker', identity: 'fixture-maker' },
    tool,
    origin: 'mcp',
    label: 'Fixture Maker models',
    defaultModel: 'default',
    models: ['default', 'nanobanana', 'gpt', 'image3'].map((id) => ({ id, label: id })),
  };
}
