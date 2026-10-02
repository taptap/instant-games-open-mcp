import { formatBuiltinPrompt } from '../promptEditor';

test.each([
  '火球从中心炸开，散成粒子。不出现角色或地面。',
  '自定义标题：第一行\n第二行\n\n角色动作：用户自己的描述',
  '<img src=x onerror=alert(1)>',
  '',
])('does not classify or rewrite custom prompts: %s', (prompt) => {
  expect(formatBuiltinPrompt(prompt)).toBe(prompt);
});

test('leaves old built-in prompts unchanged instead of silently migrating saved canvases', () => {
  const prompt = '同一位蓝银金属盔甲战士，做4秒真正的原地跑步循环。';
  expect(formatBuiltinPrompt(prompt)).toBe(prompt);
});
