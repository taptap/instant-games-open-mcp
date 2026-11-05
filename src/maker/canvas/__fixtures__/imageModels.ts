import type { CanvasImageModels } from '../../../../packages/maker-canvas/src/contracts.js';
import { IMAGE_OUTPUT_RATIOS } from '../imageSizing.js';

export function imageModelsFixture(
  tool: CanvasImageModels['tool'] = 'generate_image'
): CanvasImageModels {
  return {
    provider: { source: 'maker', identity: 'fixture-maker' },
    tool,
    origin: 'mcp',
    label: 'Fixture Maker models',
    defaultModel: 'default',
    aspectRatio: { required: false, values: [...IMAGE_OUTPUT_RATIOS] },
    models: ['default', 'nanobanana', 'gpt', 'image3'].map((id) => ({ id, label: id })),
  };
}
