import { runInNewContext } from 'node:vm';
import { openImageAtlasDialogWithHost as openImageAtlasDialog } from '../../../../packages/maker-canvas/src/browser/imageAtlasUi.js';
import { validateAtlasCrops, type ImageAtlasCrop } from '../atlasContent.js';

test('manual crop resize drops old padding while preserving unedited neighbors and validation', () => {
  const first: ImageAtlasCrop = {
    name: 'item_001',
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    outputWidth: 22,
    outputHeight: 22,
    offsetX: 1,
    offsetY: 1,
  };
  const second: ImageAtlasCrop = { ...first, name: 'item_002', x: 100 };
  const prepared = { regions: [first, second] };
  const source = openImageAtlasDialog.toString();
  const start = source.indexOf('function commit(');
  const end = source.indexOf('for (const [key, labelText]', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const context = {
    prepared,
    regions: prepared.regions,
    busy: false,
    mode: { value: 'slots' },
    bindingPlan: { slots: [{}, {}] },
    draw: jest.fn(),
  };
  const commit = runInNewContext('(' + source.slice(start, end).trim() + ')', context);
  commit([{ ...first, width: 60, height: 40 }, second]);
  expect(prepared.regions[0]).toEqual({ name: 'item_001', x: 10, y: 10, width: 60, height: 40 });
  expect(prepared.regions[1]).toEqual(second);
  expect(validateAtlasCrops(200, 100, prepared.regions)).toEqual(prepared.regions);
  commit([{ ...prepared.regions[0], width: 110 }, prepared.regions[1]]);
  expect(() => validateAtlasCrops(200, 100, prepared.regions)).toThrow('重叠');
  commit([{ ...prepared.regions[0], x: -1 }, prepared.regions[1]]);
  expect(() => validateAtlasCrops(200, 100, prepared.regions)).toThrow('坐标');
});
