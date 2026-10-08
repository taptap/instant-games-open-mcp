import { createVideoPrompts } from '../videoPrompts.js';

const prompts = createVideoPrompts();

test.each(['', '  自定义火球特效，不禁止粒子。\n', '视频约束：保留用户内容', '<b>literal</b>'])(
  'prepares custom text without hidden additions or normalization: %s',
  (prompt) => {
    expect(prompts.prepare(prompt)).toBe(prompt);
    expect(prompts.prepare(prompts.prepare(prompt))).toBe(prompt);
  }
);

test('pins the sprite-gen source and remains self-contained for browser serialization', () => {
  expect(prompts.sourceRevision).toBe('d9d8b634ca164b8d1410c76861460999f4658d64');
  const browserFactory = new Function('return (' + createVideoPrompts.toString() + ')()')();
  const input = { kind: 'character' as const, action: 'Runs in place.' };
  expect(browserFactory.build(input)).toBe(prompts.build(input));
});

test('character loop retains skill constraints without fixed appearance or duration', () => {
  const prompt = prompts.build({ kind: 'character', action: 'Runs in place.' });
  for (const text of [
    'Runs in place.',
    'immediately with no intro or transition',
    'at least 2-3 full cycles',
    "reference image's art style",
    'same viewpoint and facing',
    'no turning',
    'Mouth closed',
    'Static camera',
    'seamless loop',
    '负面提示词：',
  ])
    expect(prompt).toContain(text);
  expect(prompt).not.toMatch(/4秒|1-2秒|blue|armor|sword|seconds|facing right/);
  expect(prompt.split('\n\n')).toHaveLength(2);
});

test.each(['once', 'attack'] as const)(
  'single %s starts immediately without contradictory loop instructions',
  (play) => {
    const prompt = prompts.build({ kind: 'character', action: 'Strikes once.', play });
    expect(prompt).toContain('immediately with no intro or transition');
    expect(prompt).toContain('repeated motion');
    expect(prompt).not.toContain('seamless loop');
    expect(prompt).not.toContain('stands completely still, then');
  }
);

test.each(['loop', 'once'] as const)(
  'generic %s permits effects and never inherits character constraints',
  (play) => {
    const prompt = prompts.build({
      kind: 'generic',
      action: 'A bright magic pulse.',
      play,
      keyColor: 'green',
    });
    expect(prompt).toContain('A bright magic pulse.');
    expect(prompt).toContain('pure green background');
    expect(prompt).toContain('same art style');
    expect(prompt).not.toMatch(
      /Mouth closed|no turning|large visual effects|full-screen effects|environment effects/
    );
  }
);

test('action text is preserved verbatim without recursively expanding user placeholders', () => {
  const action = 'Keep {KEY_COLOR} and $& literal.';
  expect(prompts.build({ kind: 'generic', action })).toContain(action);
  expect(() => prompts.build({ kind: 'generic', action: '  ' })).toThrow('动作描述');
});

test.each(['front', 'back', 'left', 'right'] as const)(
  'direction %s needs a neutral reference before animation',
  (facing) => {
    const reference = prompts.referenceImage(facing);
    expect(reference).toContain(facing);
    expect(reference).toContain('calm neutral standing idle pose');
    expect(reference).toContain('both feet planted');
    expect(reference).toContain('Preserve all colors');
    expect(reference).not.toMatch(/blue|silver|armor|sword/);
  }
);
