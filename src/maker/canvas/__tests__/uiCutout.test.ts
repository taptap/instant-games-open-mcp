import { chooseUiCutoutColor, uiCutoutPrompt } from '../uiCutout.js';

test.each([
  [[255, 0, 0, 255], '#00FF00'],
  [[230, 40, 180, 255], '#00FF00'],
  [[0, 220, 40, 255], '#FF00FF'],
  [[30, 30, 30, 255], '#FF00FF'],
  [[255, 0, 255, 0], '#FF00FF'],
] as const)('chooses the less conflicting key for %j', (pixel, expected) => {
  expect(chooseUiCutoutColor([pixel])).toBe(expected);
});

test('keeps explicit subject colors intact while changing the background', () => {
  const subject = '保留：绿色底框 #00FF00，洋红底板 RGB(255,0,255)。';
  expect(uiCutoutPrompt(subject, '#00FF00')).toContain(subject);
  expect(uiCutoutPrompt(subject, '#FF00FF')).toContain(subject);
});
