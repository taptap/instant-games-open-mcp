export interface VideoPromptInput {
  kind: 'character' | 'generic';
  action: string;
  play?: 'loop' | 'once' | 'attack';
  facing?: 'reference' | 'front' | 'back' | 'left' | 'right';
  keyColor?: string;
}

export function createVideoPrompts() {
  const sourceRevision = 'd9d8b634ca164b8d1410c76861460999f4658d64';
  const characterLoop = [
    'Looping animation, start the motion immediately with no intro or transition.',
    '{ACTION}',
    'The motion repeats in a rhythmic periodic cycle, at least 2-3 full cycles throughout the entire video.',
    "2D game sprite animation, keep the reference image's art style, motion intensity follows the described action, but never freeze into a completely static frame,",
    '{FACING}',
    'Mouth closed, neutral expression.',
    'Static camera, character centered, seamless loop, strictly pure {KEY_COLOR} background.',
  ];
  const characterOnce = [
    'Start the motion immediately with no intro or transition.',
    '{ACTION}',
    'then immediately returns to completely still standing for the rest of the time.',
    'Brief single burst of motion.',
    "2D game sprite animation, keep the reference image's art style, motion intensity follows the described action,",
    '{FACING}',
    'Mouth closed, neutral expression.',
    'Static camera, character centered, strictly pure {KEY_COLOR} background.',
  ];
  const characterAttack = [
    'Start the motion immediately with no intro or transition.',
    '{ACTION}',
    'the strike happens in a split-second flash then the character slowly settles',
    'back to completely still standing for the rest of the time.',
    'Lightning-fast attack, extremely brief windup, instant strike, slow recovery.',
    "2D game sprite animation, keep the reference image's art style, snappy and punchy motion,",
    '{FACING}',
    'Mouth closed, neutral expression.',
    'Static camera, character centered, strictly pure {KEY_COLOR} background.',
  ];
  const genericLoop = [
    'Looping non-character sequence animation, start the motion immediately with no intro or transition.',
    '{ACTION}',
    'The motion repeats in a clear rhythmic cycle, at least 2-3 full cycles throughout the entire video.',
    '2D game sprite sequence, clean readable silhouette, stable scale, stable position,',
    'no character-facing requirement, no side-view requirement.',
    'Keep the exact same art style, rendering and shading as the input image.',
    'Static camera, subject centered, seamless loop, strictly pure {KEY_COLOR} background.',
  ];
  const genericOnce = [
    'Non-character sequence animation, start the motion immediately with no intro or transition.',
    '{ACTION}',
    'then settle or fade to a clean final state for the rest of the time.',
    'Brief single burst of motion with readable timing.',
    '2D game sprite sequence, clean readable silhouette, stable scale, stable position,',
    'no character-facing requirement, no side-view requirement.',
    'Keep the exact same art style, rendering and shading as the input image.',
    'Static camera, subject centered, strictly pure {KEY_COLOR} background.',
  ];
  const characterNegative = [
    'camera movement, blur, distort, low quality,',
    'shadow, drop shadow, ground shadow, cast shadow,',
    'realistic, subtle, gentle, minimal movement, slow motion,',
    'talking, mouth moving, speaking, lip sync,',
    'large visual effects, full-screen effects, environment effects',
  ];
  const genericNegative = [
    'camera movement, blur, distort, low quality, compression artifacts,',
    'shadow, drop shadow, ground shadow, cast shadow,',
    'background gradient, background texture, extra unrelated objects,',
    'cropped subject, off-center subject, changing canvas position',
  ];
  const directions = {
    reference:
      'keep the same viewpoint and facing as the reference image, character holds this orientation the whole time, no turning.',
    front:
      'front view facing the camera, character holds this orientation the whole time, no turning.',
    back: 'back view facing away from the camera, character holds this orientation the whole time, no turning.',
    left: 'strict side-view profile facing left, character always faces left, no turning.',
    right: 'strict side-view profile facing right, character always faces right, no turning.',
  };
  function build(input: VideoPromptInput): string {
    const action = input.action.trim();
    if (!action) throw new Error('请填写动作描述。');
    const play = input.play || 'loop';
    const generic = input.kind === 'generic';
    const template = generic
      ? play === 'loop'
        ? genericLoop
        : genericOnce
      : play === 'attack'
        ? characterAttack
        : play === 'once'
          ? characterOnce
          : characterLoop;
    const negative = [(generic ? genericNegative : characterNegative).join('\n')];
    if (play !== 'loop')
      negative.push(
        generic
          ? 'unwanted loop, repeated cycles after the main action, endless pulsing'
          : 'repeated motion, rhythmic movement, continuous action, multiple strikes, bobbing, swaying'
      );
    if (!generic && play === 'attack')
      negative.push(
        'slow windup, drawn out motion, sluggish, leisurely, gradual buildup, even pace, uniform speed, symmetrical timing'
      );
    const prompt = template.join('\n').replace(/\{ACTION\}|\{FACING\}|\{KEY_COLOR\}/g, (token) => {
      if (token === '{ACTION}') return action;
      if (token === '{FACING}') return directions[input.facing || 'reference'];
      return input.keyColor?.trim() || 'magenta';
    });
    return '动作描述：' + prompt + '\n\n负面提示词：' + negative.join(', ');
  }
  function referenceImage(
    facing: 'front' | 'back' | 'left' | 'right',
    keyColor = 'magenta'
  ): string {
    return [
      'Redraw this exact same character in a ' + directions[facing],
      'Keep the exact same art style, rendering and shading as the input image.',
      'Preserve all colors, clothing, accessories, hairstyle, and proportions exactly.',
      'Do not change, simplify, or add any design elements.',
      'Mouth closed, neutral expression.',
      'Reset the body to a calm neutral standing idle pose; undo any running, jumping, attacking, crouching or other dynamic action stance — both feet planted, weight balanced, limbs relaxed and close to the body.',
      'Strictly pure solid ' + keyColor + ' background, no shadow, no ground line.',
    ].join('\n');
  }
  function prepare(prompt: string): string {
    return prompt;
  }
  return { build, prepare, referenceImage, sourceRevision };
}
