/**
 * 「生成精灵」 dialog: sprite name and asset type, then 取消 / 开始. Self-contained because it is
 * injected into the page via toString(). `start` resolves to an error message to keep the dialog
 * open, or undefined to close it.
 */
export function openCanvasSpriteGenDialog(options: {
  uiSplit?: boolean;
  defaultName: string;
  start(input: {
    name: string;
    type: 'character' | 'generic';
  }): Promise<string | undefined> | string | undefined;
}): void {
  const titleText = options.uiSplit ? 'UI 切分' : '生成精灵';
  const nameTextLabel = options.uiSplit ? '任务名' : '精灵名';
  const dialog = document.createElement('dialog');
  dialog.className = 'sequence-editor video-history sprite-gen-dialog';
  dialog.setAttribute('aria-label', titleText);
  const heading = document.createElement('h2');
  heading.textContent = titleText;
  const intro = document.createElement('p');
  intro.textContent = options.uiSplit
    ? '将在新对话中预填切分指令和设计稿，发送后开始；进度会同步回画布。'
    : '会把这张图片放进分组「精灵：<名>」并在新对话里开始生成；进度同步回分组。';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'sprite-gen-field';
  const nameText = document.createElement('span');
  nameText.textContent = nameTextLabel;
  const name = document.createElement('input');
  name.type = 'text';
  name.name = 'sprite-name';
  name.maxLength = 40;
  name.autocomplete = 'off';
  name.spellcheck = false;
  name.placeholder = options.uiSplit ? '例如 inventory_ui' : '例如 hero_walk';
  name.value = options.defaultName;
  nameLabel.append(nameText, name);
  const hint = document.createElement('small');
  hint.textContent = '1–40 个字符：中英文、数字、_ 或 -。';
  const typeGroup = document.createElement('fieldset');
  typeGroup.className = 'sprite-gen-field';
  const legend = document.createElement('legend');
  legend.textContent = '素材类型';
  typeGroup.append(legend);
  const types: Array<['character' | 'generic', string, string]> = [
    ['character', '角色/对象动画', '有固定姿态的角色、怪物、道具'],
    ['generic', '通用序列帧', '特效、场景等无固定姿态的素材'],
  ];
  const choices = document.createElement('div');
  choices.className = 'sprite-gen-choices';
  typeGroup.append(choices);
  const radios = types.map(([value, text, detail], index) => {
    const option = document.createElement('label');
    option.className = 'sprite-gen-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'sprite-type';
    radio.value = value;
    radio.checked = index === 0;
    // The radio stays focusable for the keyboard; the card next to it shows the choice.
    const caption = document.createElement('span');
    caption.className = 'sprite-gen-choice';
    const title = document.createElement('strong');
    title.textContent = text;
    const note = document.createElement('small');
    note.textContent = detail;
    caption.append(title, note);
    option.append(radio, caption);
    choices.append(option);
    return radio;
  });
  const message = document.createElement('p');
  message.className = 'sprite-gen-error';
  message.setAttribute('role', 'alert');
  const footer = document.createElement('footer');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '取消';
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'primary';
  start.textContent = '开始';
  footer.append(cancel, start);
  dialog.append(heading, intro, nameLabel, hint);
  if (!options.uiSplit) dialog.append(typeGroup);
  dialog.append(message, footer);
  let busy = false;
  const close = () => {
    if (busy) return;
    dialog.close();
    dialog.remove();
  };
  const valid = () => /^[\p{L}\p{N}_-]{1,40}$/u.test(name.value);
  const check = () => {
    const ok = valid();
    name.setAttribute('aria-invalid', String(!ok && name.value !== ''));
    message.textContent =
      ok || name.value === ''
        ? ''
        : nameTextLabel + '只能包含中英文、数字、_ 或 -，最多 40 个字符。';
    return ok;
  };
  name.addEventListener('input', check);
  const submit = async () => {
    if (busy) return;
    if (!check()) {
      if (!name.value) message.textContent = '请填写' + nameTextLabel + '。';
      name.focus();
      return;
    }
    const chosen = radios.find((radio) => radio.checked);
    busy = true;
    start.disabled = true;
    cancel.disabled = true;
    try {
      const failure = await options.start({
        name: name.value,
        type: chosen && chosen.value === 'generic' ? 'generic' : 'character',
      });
      busy = false;
      if (failure) {
        message.textContent = failure;
        return;
      }
      close();
    } catch (caught) {
      busy = false;
      message.textContent = (caught as Error).message || '未能开始' + titleText + '。';
    } finally {
      start.disabled = false;
      cancel.disabled = false;
    }
  };
  cancel.addEventListener('click', close);
  start.addEventListener('click', () => void submit());
  name.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      void submit();
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.body.append(dialog);
  dialog.showModal();
  name.focus();
  name.select();
  check();
}
