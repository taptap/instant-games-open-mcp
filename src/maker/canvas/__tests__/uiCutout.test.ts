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

test.each([
  ['背景纯洋红 RGB(255,0,255)', '#00FF00', '绿色 #00FF00 RGB(0,255,0)'],
  ['外部背景使用纯绿色 RGB(0,255,0)', '#FF00FF', '洋红 #FF00FF RGB(255,0,255)'],
] as const)('normalizes current UI template background clauses: %s', (clause, color, expected) => {
  const prompt = uiCutoutPrompt('保留主体配色。' + clause + '，不新增装饰。', color);
  expect(prompt).toContain(expected);
  expect(prompt).not.toContain(color === '#00FF00' ? 'RGB(255,0,255)' : 'RGB(0,255,0)');
  expect(prompt).toContain('，不新增装饰。');
});
