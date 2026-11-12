import { createCanvasWheelInput } from '../../../../packages/maker-canvas/src/browser/wheel.js';

const wheel = { deltaX: 0, deltaY: 100, deltaMode: 0 };

test('discrete wheel events zoom while smooth two-finger gestures and momentum pan', () => {
  const input = createCanvasWheelInput();
  expect(input(wheel, 'auto', 1000)).toBe('zoom');
  expect(input({ ...wheel, deltaY: 3, deltaMode: 1 }, 'auto', 1001)).toBe('zoom');
  expect(input({ ...wheel, deltaY: 1.5 }, 'auto', 2000)).toBe('pan');
  expect(input({ ...wheel, deltaY: 100 }, 'auto', 2050)).toBe('pan');
  expect(input(wheel, 'auto', 3000)).toBe('zoom');
  expect(input({ ...wheel, deltaX: 20 }, 'auto', 4000)).toBe('pan');
});

test('manual device modes override heuristics, with pinch and Shift navigation preserved', () => {
  const input = createCanvasWheelInput();
  expect(input(wheel, 'trackpad')).toBe('pan');
  expect(input({ ...wheel, deltaY: 1 }, 'mouse')).toBe('zoom');
  expect(input({ ...wheel, ctrlKey: true }, 'trackpad')).toBe('zoom');
  expect(input({ ...wheel, metaKey: true }, 'auto')).toBe('zoom');
  expect(input({ ...wheel, shiftKey: true }, 'mouse')).toBe('pan');
});
