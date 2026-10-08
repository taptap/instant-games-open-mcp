import { mergeIconPrompt, validateMergeIcons, type MergeIconSettings } from './mergeIcons.js';

export function editMergeIcons(
  settings: MergeIconSettings,
  apply: (settings: MergeIconSettings) => void | Promise<void>
) {
  if (document.querySelector('[data-merge-icons-editor]')) return;
  const draft = structuredClone(settings);
  const dialog = document.createElement('dialog');
  dialog.className = 'workflow-template-dialog merge-icons-editor';
  dialog.dataset.mergeIconsEditor = 'true';
  dialog.style.cssText =
    'width:min(760px,92vw);max-height:88vh;box-sizing:border-box;overflow:auto;padding:24px;border:1px solid #3c414c;border-radius:14px;background:#17191f;color:#f1ece3';
  dialog.innerHTML =
    '<h2>二合图标生成器</h2><p>同一系列逐级升级；参考图只决定画风。描述留空时由模型设计。</p><div data-counts style="display:flex;gap:16px;flex-wrap:wrap"></div><p data-density role="status"></p><div data-series></div><label>补充要求<textarea data-instructions rows="2" maxlength="400" style="display:block;width:100%;box-sizing:border-box"></textarea></label><p data-error role="alert"></p><div style="display:flex;gap:12px"><button data-apply>应用阶段设置</button><button data-cancel>取消</button></div>';
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('keyup', (event) => event.stopPropagation());
  const countField = (label: string, value: number, min: number, max: number) => {
    const wrapper = document.createElement('label');
    wrapper.textContent = label + ' ';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(value);
    input.setAttribute('aria-label', label);
    input.style.width = '70px';
    wrapper.append(input);
    dialog.querySelector('[data-counts]')!.append(wrapper);
    return input;
  };
  const count = countField('阶段数', draft.stageCount, 2, 33);
  const seriesCount = countField('系列数', draft.series.length, 1, 3);
  const instructions = dialog.querySelector<HTMLTextAreaElement>('[data-instructions]')!;
  instructions.value = draft.instructions;
  const render = () => {
    const total = Number(count.value),
      seriesTotal = Number(seriesCount.value);
    if (
      !Number.isInteger(total) ||
      total < 2 ||
      total > 33 ||
      !Number.isInteger(seriesTotal) ||
      seriesTotal < 1 ||
      seriesTotal > 3
    ) {
      dialog.querySelector('[data-error]')!.textContent = '阶段数为2～33，系列数为1～3。';
      return;
    }
    dialog.querySelector('[data-error]')!.textContent = '';
    draft.stageCount = total;
    while (draft.series.length < seriesTotal) draft.series.push({ name: '', stages: [] });
    const container = dialog.querySelector('[data-series]')!;
    container.replaceChildren();
    dialog.querySelector('[data-density]')!.textContent =
      total +
      '列 × ' +
      seriesTotal +
      '行 · ' +
      total * seriesTotal +
      '张图标' +
      (total > 8
        ? '。阶段较多，每格像素会减少，模型不保证数量与细节准确；建议减少单次阶段数并逐格核对。'
        : '。导出顺序为逐行、从低级到高级。');
    draft.series.slice(0, seriesTotal).forEach((item, seriesIndex) => {
      while (item.stages.length < total) item.stages.push('');
      const group = document.createElement('fieldset');
      group.style.margin = '12px 0';
      const legend = document.createElement('legend');
      legend.textContent = '系列 ' + (seriesIndex + 1);
      const name = document.createElement('input');
      name.style.cssText = 'width:100%;min-width:0;box-sizing:border-box';
      name.value = item.name;
      name.maxLength = 40;
      name.placeholder = '例如：面包、工具箱、镜子';
      name.setAttribute('aria-label', legend.textContent + '名称');
      name.addEventListener('input', () => {
        item.name = name.value;
      });
      group.append(legend, name);
      for (let index = 0; index < total; index++) {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px';
        label.textContent = 'Lv.' + (index + 1);
        const input = document.createElement('input');
        input.style.cssText = 'flex:1;min-width:0';
        input.maxLength = 60;
        input.value = item.stages[index];
        input.placeholder = '留空自动设计，可描述形态、数量、材质和装饰';
        input.setAttribute('aria-label', '系列' + (seriesIndex + 1) + '阶段' + (index + 1));
        input.addEventListener('input', () => {
          item.stages[index] = input.value;
        });
        label.append(input);
        group.append(label);
      }
      container.append(group);
    });
  };
  count.addEventListener('input', render);
  seriesCount.addEventListener('input', render);
  let saving = false;
  const close = () => {
    if (!saving) dialog.remove();
  };
  dialog.querySelector('[data-cancel]')!.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.querySelector('[data-apply]')!.addEventListener('click', async () => {
    if (saving) return;
    try {
      if (
        !Number.isInteger(Number(seriesCount.value)) ||
        Number(seriesCount.value) < 1 ||
        Number(seriesCount.value) > 3
      )
        throw new Error('系列数为1～3。');
      const next = validateMergeIcons({
        stageCount: Number(count.value),
        instructions: instructions.value,
        series: draft.series.slice(0, Number(seriesCount.value)),
      });
      mergeIconPrompt(next);
      saving = true;
      for (const control of dialog.querySelectorAll<
        HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement
      >('input,button,textarea'))
        control.disabled = true;
      await apply(next);
      dialog.remove();
    } catch (error) {
      dialog.querySelector('[data-error]')!.textContent = (error as Error).message;
    } finally {
      saving = false;
      for (const control of dialog.querySelectorAll<
        HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement
      >('input,button,textarea'))
        control.disabled = false;
    }
  });
  render();
  document.body.append(dialog);
  dialog.showModal();
}
