declare const document: any;

export function formatBuiltinPrompt(value: string): string {
  const views = [
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
  ];
  const presets: Array<Array<[string, string]>> = views.map(([view, direction]) => [
    [
      '角色外观',
      '同一位蓝银金属盔甲、红围巾、深色靴子、银色长剑的卡通二次元战士，角色' + view + '；',
    ],
    [
      '角色动作',
      '做4秒真正的原地跑步循环，连续交替抬腿、摆臂和身体上下起伏，至少完成两次自然步态循环，始终保持' +
        direction +
        '。剑收在身体侧边并完整可见但不攻击。',
    ],
    [
      '镜头构图',
      '固定远景正交镜头，人物连同脚和剑只占画面约45%-50%，四周保持宽阔留白，完整头脚武器全程不出框。',
    ],
    [
      '背景限制',
      '纯色 #ff00ff 平坦背景，无地面、无阴影、无纹理、无渐变、无镜头缩放/位移/跟随、无额外角色、无文字、水印、裁切、冻结或静帧伪造。',
    ],
  ]);
  presets.push([
    ['镜头构图', '保持输入首帧的主体大小、左置位置、纯 #ff00ff 方形背景和固定远景构图。'],
    [
      '角色动作',
      '蓝银盔甲战士用朴素物理短剑向画面右侧做一次斜下挥砍：前段蓄力，中段1-2秒出现攻击峰值，随后完整回到预备姿势。',
    ],
    [
      '动作效果',
      '剑身只产生一段紧贴刀刃的短小弧形拖影，动作清楚、连续、有真实挥砍速度；整个人物、剑尖和拖影全程远离边界。',
    ],
    ['画面限制', '无魔法爆发、无光束、无巨大光环、无镜头放大、无镜头位移。'],
  ]);
  const preset = presets.find((parts) => parts.map(([, body]) => body).join('') === value);
  return preset ? preset.map(([title, body]) => title + '：' + body).join('\n\n') : value;
}

export function createPromptEditor(input: any): any {
  const parts = String(input.value).split(/\n\n/);
  const headings =
    /^(角色外观|角色动作|镜头构图|背景限制|动作效果|画面限制|主体描述|动作描述|游戏素材约束|视频约束)：/;
  if (!parts.some((part) => headings.test(part))) return input;
  const editor = document.createElement('div');
  editor.className = 'prompt-editor';
  input.hidden = true;
  editor.append(input);
  const fields: Array<{ prefix: string; field: any }> = [];
  for (const part of parts) {
    const prefix = part.match(headings)?.[0] || '';
    const section = document.createElement('label');
    section.className = 'prompt-section';
    if (prefix) {
      const heading = document.createElement('strong');
      heading.className = 'prompt-heading';
      heading.textContent = prefix;
      section.append(heading);
    }
    const field = document.createElement('textarea');
    field.value = part.slice(prefix.length);
    field.rows = 2;
    field.className = 'prompt-section-input';
    field.setAttribute('aria-label', prefix || '提示词正文');
    field.addEventListener('pointerdown', (event: any) => event.stopPropagation());
    field.addEventListener('input', () => {
      input.value = fields.map((item) => item.prefix + item.field.value).join('\n\n');
      input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
      resize();
    });
    const resize = (): void => {
      if (!field.isConnected || !field.clientWidth) return;
      field.style.height = 'auto';
      field.style.height = field.scrollHeight + 'px';
    };
    let lastWidth = 0;
    const observer = new input.ownerDocument.defaultView.ResizeObserver(() => {
      if (!editor.isConnected) {
        observer.disconnect();
        return;
      }
      if (field.clientWidth !== lastWidth) {
        lastWidth = field.clientWidth;
        resize();
      }
    });
    observer.observe(section);
    section.append(field);
    fields.push({ prefix, field });
    editor.append(section);
  }
  return editor;
}
