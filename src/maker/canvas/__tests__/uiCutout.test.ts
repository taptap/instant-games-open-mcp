import { chooseUiCutoutColor, uiCutoutPrompt, uiCutoutRgb } from '../uiCutout.js';
import data from '../uiWorkflowData.json';

test.each([
  [[255, 0, 0, 255], '#00FF00'],
  [[230, 40, 180, 255], '#00FF00'],
  [[0, 220, 40, 255], '#FF00FF'],
  [[30, 30, 30, 255], '#FF00FF'],
  [[255, 0, 255, 0], '#FF00FF'],
] as const)('chooses the less conflicting key for %j', (pixel, expected) => {
  expect(chooseUiCutoutColor([pixel])).toBe(expected);
});

test('compiles every UI atlas prompt consistently, including repeat and switched-color retries', () => {
  const sources = data.edges
    .filter((edge) => edge.kind === 'image-assets')
    .map((edge) => edge.from);
  for (const node of data.nodes.filter((node) => sources.includes(node.id))) {
    const prompt = node.generation!.prompt;
    const green = uiCutoutPrompt(prompt, '#00FF00');
    expect(green).not.toMatch(/洋红|magenta|#FF00FF|RGB\(255,0,255\)/i);
    expect(green).toContain('#00FF00');
    expect(uiCutoutPrompt(green, '#00FF00')).toBe(green);
    const magenta = uiCutoutPrompt(green, '#FF00FF');
    expect(magenta).not.toMatch(/#00FF00|RGB\(0,255,0\)|green space/i);
    expect(magenta.match(/抠图底色约定/g)).toHaveLength(1);
  }
  expect(uiCutoutRgb()).toEqual([255, 0, 255]);
  expect(uiCutoutRgb('#00FF00')).toEqual([0, 255, 0]);
});

test('keeps explicit subject colors intact while changing the background', () => {
  const subject = '保留：绿色底框 #00FF00，洋红底板 RGB(255,0,255)。';
  expect(uiCutoutPrompt(subject, '#00FF00')).toContain(subject);
  expect(uiCutoutPrompt(subject, '#FF00FF')).toContain(subject);
});
