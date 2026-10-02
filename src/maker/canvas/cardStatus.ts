export type CanvasCardStatus = 'loading' | 'waiting' | 'paused' | 'failed' | 'unknown';

export function canvasCardStatus(input: {
  busy?: boolean;
  generation?: string;
  sequence?: string;
  template?: string;
}): CanvasCardStatus | undefined {
  if (input.busy) return 'loading';
  if (input.generation === 'timedout') return 'paused';
  if (input.generation === 'unknown') return 'unknown';
  if (input.generation === 'failed' || input.sequence === 'failed') return 'failed';
  if (input.generation === 'canceled' || input.sequence === 'cancelled') return 'paused';
  if (
    ['running', 'pending'].includes(input.generation || '') ||
    input.sequence === 'running' ||
    input.template === 'loading'
  )
    return 'loading';
  if (input.sequence === 'ready') return 'paused';
  if (input.template === 'pending') return 'waiting';
  return;
}

export function renderCanvasCardStatus(
  card: HTMLElement,
  state: CanvasCardStatus | undefined,
  options: {
    query?: () => Promise<void>;
    resume?: () => Promise<void>;
    adjust?: () => void;
    waitingForSource?: boolean;
    stoppedWaiting?: boolean;
    waitTimedOut?: boolean;
    detail?: string;
  } = {}
): void {
  if (!state) return;
  const labels = {
    loading: ['处理中', '正在处理，请勿重复操作'],
    waiting: ['待处理', '来源已变化或此步骤尚未执行，旧结果暂时保留'],
    paused: ['等待继续', '选择卡片，继续处理或调整参数'],
    failed: ['处理失败', '本次未完成，可查看原因后重试'],
    unknown: ['结果待确认', '请核查原任务，不要重复生成'],
  };
  const overlay = document.createElement('div');
  overlay.className = 'card-state-overlay card-state-' + state;
  overlay.dataset.state = state;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  const icon = document.createElement('span');
  icon.className = 'card-state-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent =
    state === 'loading'
      ? ''
      : state === 'waiting'
        ? '···'
        : state === 'paused'
          ? 'Ⅱ'
          : state === 'failed'
            ? '!'
            : '?';
  const title = document.createElement('b');
  title.textContent = labels[state][0];
  const hint = document.createElement('span');
  hint.className = 'card-state-hint';
  hint.textContent = labels[state][1];
  if (options.stoppedWaiting) {
    title.textContent = '已停止等待';
    hint.textContent = '远端任务可能仍在运行，请查询原任务';
  }
  if (options.waitTimedOut) {
    title.textContent = '等待超时';
    hint.textContent = '已解除本地占用；可调整参数生成新视频，旧任务保留在视频历史中';
  }
  if (options.waitingForSource && ['waiting', 'failed', 'paused'].includes(state)) {
    hint.textContent = options.adjust
      ? '等待上游完成后再处理，可以先调整本步骤参数'
      : '等待上游完成后，再处理当前步骤';
    if (state === 'waiting') title.textContent = '等待来源更新';
  }
  overlay.append(icon, title, hint);
  if (state === 'loading') {
    card.setAttribute('aria-busy', 'true');
    card.querySelectorAll<HTMLButtonElement>('button,input,select,textarea').forEach((control) => {
      control.disabled = true;
    });
    for (const event of ['pointerdown', 'click', 'dblclick', 'contextmenu']) {
      overlay.addEventListener(event, (event) => {
        event.stopPropagation();
        if (event.type === 'contextmenu') event.preventDefault();
      });
    }
  }
  if (options.query) {
    if (state === 'loading') hint.textContent = '后台任务进行中，可查询原任务进度';
    const query = document.createElement('button');
    query.type = 'button';
    query.className = 'card-state-query';
    query.textContent = '查询原任务';
    query.addEventListener('pointerdown', (event) => event.stopPropagation());
    query.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (query.disabled) return;
      query.disabled = true;
      query.textContent = '查询中…';
      try {
        await options.query!();
      } finally {
        query.disabled = false;
        query.textContent = '查询原任务';
      }
    });
    overlay.append(query);
  }
  if (options.resume && ['waiting', 'paused', 'failed'].includes(state)) {
    hint.textContent = '使用当前引用和已保存参数，更新此卡及后续待处理卡片';
    if (state === 'failed' && options.detail) hint.textContent = options.detail;
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'card-state-query card-state-resume';
    resume.textContent = state === 'failed' ? '重试并继续' : '处理并继续';
    resume.addEventListener('pointerdown', (event) => event.stopPropagation());
    resume.addEventListener('dblclick', (event) => event.stopPropagation());
    resume.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (resume.disabled) return;
      resume.disabled = true;
      try {
        await options.resume!();
      } finally {
        resume.disabled = false;
      }
    });
    overlay.append(resume);
  }
  if (options.adjust && ['waiting', 'paused', 'failed'].includes(state)) {
    const adjust = document.createElement('button');
    adjust.type = 'button';
    adjust.className = 'card-state-query card-state-adjust';
    adjust.textContent = '调整参数';
    adjust.addEventListener('pointerdown', (event) => event.stopPropagation());
    adjust.addEventListener('click', (event) => {
      event.stopPropagation();
      options.adjust!();
    });
    overlay.append(adjust);
  }
  card.append(overlay);
}

export const CANVAS_CARD_STATUS_STYLES = [
  '.card.template-pending { opacity:1; } .card.template-loading { animation:none; }',
  '.card-state-overlay { position:absolute; inset:0; z-index:8; box-sizing:border-box; border-radius:inherit; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:24px 16px; background:rgba(12,16,23,.76); backdrop-filter:blur(3px); color:#e9c17b; text-align:center; pointer-events:none; }',
  '.card-state-overlay b { font-size:16px; line-height:1.4; letter-spacing:1px; } .card-state-hint { max-width:240px; color:#d0d3da; font-size:12px; line-height:1.6; }',
  '.card-state-icon { display:grid; place-items:center; box-sizing:border-box; width:46px; height:46px; flex:none; border:2px solid currentColor; border-radius:50%; font:600 25px/1 sans-serif; }',
  '.card-state-loading { pointer-events:auto; cursor:wait; } .card-state-loading .card-state-icon { border:3px solid rgba(233,193,123,.23); border-top-color:#edc276; border-right-color:#edc276; animation:card-state-spin .9s linear infinite; }',
  '.card-state-waiting { background:rgba(12,16,23,.59); color:#c8bc9c; } .card-state-waiting .card-state-icon { animation:card-state-breathe 2.4s ease-in-out infinite; }',
  '.card-state-paused { color:#a9bfd9; } .card-state-paused .card-state-icon { animation:card-state-breathe 3s ease-in-out infinite; }',
  '.card-state-failed { color:#f29c97; } .card-state-failed .card-state-icon { animation:card-state-notice .32s ease-out; }',
  '.card-state-unknown { color:#ecc17a; } .card-state-unknown .card-state-icon { animation:card-state-breathe 2.4s ease-in-out 2; }',
  '.card-state-query { pointer-events:auto; padding:7px 12px; border-radius:7px; border:1px solid #8b754b; color:#f3d397; background:#302c25; cursor:pointer; } .card-state-query:disabled { opacity:.65; cursor:wait; }',
  '.card.template-locked .card-state-query { pointer-events:auto; opacity:1; }',
  '@keyframes card-state-spin { to { transform:rotate(360deg); } } @keyframes card-state-breathe { 50% { opacity:.55; transform:scale(.94); } } @keyframes card-state-notice { 25% { transform:translateX(-3px); } 75% { transform:translateX(3px); } }',
  '@media (prefers-reduced-motion:reduce) { .card-state-overlay .card-state-icon { animation:none; } }',
].join('\n');
