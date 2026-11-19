import {
  uiRecognitionPrompt,
  uiTextRecognitionPrompt,
} from '../packages/maker-canvas/src/features/serverRecognition.ts';
import { uiBatchAtlasPrompt } from '../packages/maker-canvas/src/features/uiAssetBindings.ts';
process.stdout.write(
  JSON.stringify(
    {
      source: 'taptap/instant-games-open-mcp/packages/maker-canvas',
      cut: uiRecognitionPrompt(1234567, 7654321),
      text: uiTextRecognitionPrompt(1234567, 7654321, []),
      atlas: uiBatchAtlasPrompt('controls', true),
    },
    null,
    2
  ) + '\n'
);
