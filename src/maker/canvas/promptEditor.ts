declare const document: any;

export function formatBuiltinPrompt(value: string): string {
  return value;
}

export function createPromptEditor(input: any): any {
  const parts = String(input.value).split(/\n\n/);
  const headings =
    /^(角色外观|角色动作|镜头构图|背景限制|动作效果|画面限制|主体描述|动作描述|游戏素材约束|视频约束|负面提示词)：/;
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
