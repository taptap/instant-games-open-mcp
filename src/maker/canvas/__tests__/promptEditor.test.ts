import { formatBuiltinPrompt } from '../promptEditor';

test.each([
  '火球从中心炸开，散成粒子。不出现角色或地面。',
  '自定义标题：第一行\n第二行\n\n角色动作：用户自己的描述',
  '<img src=x onerror=alert(1)>',
  '',
])('does not classify or rewrite custom prompts: %s', (prompt) => {
  expect(formatBuiltinPrompt(prompt)).toBe(prompt);
});

test.each([
  ['正面朝向镜头，清楚呈现脸、胸甲、双肩和双腿正面', '正面方向，不转身、不侧身、不镜像冒充'],
  [
    '背面朝向镜头，清楚呈现后脑、后颈、背甲、披带/围巾背面和双腿背面',
    '背面方向，不转身、不侧身、不镜像冒充',
  ],
  [
    '左侧面朝向画面左侧，清楚呈现左脸/左肩、左侧胸甲、左臂和双腿的左侧姿态',
    '左侧方向，不转身、不正面、不右侧面、不镜像冒充',
  ],
  [
    '右侧面朝向画面右侧，清楚呈现右脸/右肩、右侧胸甲、右臂和双腿的右侧姿态',
    '右侧方向，不转身、不正面、不左侧面、不镜像冒充',
  ],
])('sections the built-in running prompt without changing its body (%s)', (view, direction) => {
  const original =
    '同一位蓝银金属盔甲、红围巾、深色靴子、银色长剑的卡通二次元战士，角色' +
    view +
    '；做4秒真正的原地跑步循环，连续交替抬腿、摆臂和身体上下起伏，至少完成两次自然步态循环，始终保持' +
    direction +
    '。剑收在身体侧边并完整可见但不攻击。固定远景正交镜头，人物连同脚和剑只占画面约45%-50%，四周保持宽阔留白，完整头脚武器全程不出框。纯色 #ff00ff 平坦背景，无地面、无阴影、无纹理、无渐变、无镜头缩放/位移/跟随、无额外角色、无文字、水印、裁切、冻结或静帧伪造。';
  const formatted = formatBuiltinPrompt(original);
  expect(formatted.split('\n\n')).toHaveLength(4);
  expect(
    formatted.replace(/^(角色外观|角色动作|镜头构图|背景限制)：/gm, '').replace(/\n\n/g, '')
  ).toBe(original);
  expect(formatBuiltinPrompt(formatted)).toBe(formatted);
  expect(formatBuiltinPrompt(original + '用户补充要求。')).toBe(original + '用户补充要求。');
});
