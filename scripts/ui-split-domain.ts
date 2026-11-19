import { readFileSync } from 'node:fs';
import {
  validateCutElements,
  validateBboxTexts,
  validateUiBboxStructure,
} from '../packages/maker-canvas/src/features/uiBbox.js';
import {
  uiBatchAtlasPlans,
  uiAtlasOrderPrompt,
  uiBatchAtlasPrompt,
} from '../packages/maker-canvas/src/features/uiAssetBindings.js';
const input = JSON.parse(readFileSync(0, 'utf8'));
let result: unknown;
if (input.operation === 'cut')
  result = validateCutElements(input.elements, input.width, input.height);
else if (input.operation === 'text')
  result = validateBboxTexts(input.texts, input.width, input.height, input.elements);
else if (input.operation === 'plans') {
  const bbox = validateUiBboxStructure(input.bbox);
  result = ['controls', 'icons', 'equipment', 'panels', 'artwork', 'background'].flatMap(
    (group) => {
      const plans = uiBatchAtlasPlans(bbox, group as any);
      return plans
        .filter((plan) =>
          plan.slots.some((slot) => slot.role !== 'reserve' && slot.role !== 'background')
        )
        .map((plan) => ({
          columns: plan.grid.columns,
          rows: plan.grid.rows,
          group,
          slots: plan.slots.map((slot) => ({
            elementId: slot.elementIds[0],
            state: slot.state,
            reserve: slot.role === 'reserve',
          })),
          prompt: uiBatchAtlasPrompt(group as any, true) + '\n' + uiAtlasOrderPrompt(plan, 1, true),
        }));
    }
  );
} else throw new Error('Unsupported UI domain operation');
process.stdout.write(JSON.stringify(result));
