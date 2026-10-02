import type { CanvasNode } from './model.js';

export function canvasGroupState(states: string[], phase?: string) {
  if (states.includes('loading') || ['running', 'queued', 'waiting'].includes(phase || ''))
    return { state: 'loading', label: '执行中' };
  if (states.includes('unknown')) return { state: 'unknown', label: '结果待确认' };
  if (states.includes('failed')) return { state: 'failed', label: '处理失败' };
  if (phase === 'paused' || states.includes('paused')) return { state: 'paused', label: '已暂停' };
  if (states.includes('waiting')) return { state: 'waiting', label: '待处理' };
  return states.length
    ? { state: 'ready', label: '已就绪' }
    : { state: 'empty', label: '无生成任务' };
}

export function decorateCanvasCard(
  card: HTMLElement,
  node: CanvasNode,
  title: HTMLElement,
  openMenu: (event: MouseEvent) => void
) {
  const kinds: Record<string, string> = {
    image: '图片',
    video: '视频输入',
    'video-source': '视频',
    sequence: '序列帧',
    animation: '动画',
    section: '工作流',
    note: '便签',
  };
  card.classList.add('canvas-card');
  const header = document.createElement('div');
  header.className = 'canvas-card-header';
  const heading = document.createElement('div');
  heading.className = 'canvas-card-heading';
  title.className = 'canvas-card-title';
  title.title = title.textContent || node.title;
  const metadata = document.createElement('small');
  metadata.className = 'canvas-card-meta';
  metadata.textContent = node.frameSetInfo
    ? node.frameSetInfo.frameCount + ' 帧 · ' + node.frameSetInfo.fps + ' FPS'
    : node.videoInfo
      ? node.videoInfo.width +
        ' × ' +
        node.videoInfo.height +
        ' · ' +
        node.videoInfo.duration.toFixed(1) +
        ' 秒'
      : kinds[node.type];
  heading.append(title, metadata);
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'canvas-card-menu';
  more.textContent = '⋯';
  more.title = '卡片操作';
  more.setAttribute('aria-label', node.title + '的卡片操作');
  more.addEventListener('pointerdown', (event) => event.stopPropagation());
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    openMenu(event);
  });
  header.append(heading, more);
  if (node.type === 'section') {
    const count = card.querySelector(':scope > p');
    if (count) {
      metadata.textContent = count.textContent;
      count.remove();
    }
    const state = document.createElement('span');
    state.className = 'canvas-group-state';
    state.setAttribute('role', 'status');
    header.insertBefore(state, more);
  } else {
    const content = document.createElement('div');
    content.className = 'canvas-card-content';
    for (const child of Array.from(card.children)) {
      if (child !== title && !child.matches('.resize-handle, .port')) content.append(child);
    }
    card.prepend(content);
  }
  card.prepend(header);
}

export function refreshCanvasGroupHeaders(
  world: HTMLElement,
  nodes: CanvasNode[],
  phase: (id: string) => string | undefined
) {
  const cards = new Map(
    Array.from(world.querySelectorAll<HTMLElement>('.card[data-id]')).map((card) => [
      card.dataset.id,
      card,
    ])
  );
  for (const group of nodes.filter((node) => node.type === 'section')) {
    const badge = cards.get(group.id)?.querySelector<HTMLElement>('.canvas-group-state');
    if (!badge) continue;
    const members = nodes.filter(
      (node) => node.sectionId === group.id && !['note', 'section'].includes(node.type)
    );
    const states = members.map((node) => {
      const overlay = cards.get(node.id)?.querySelector<HTMLElement>('.card-state-overlay');
      if (overlay?.dataset.state) return overlay.dataset.state;
      const saved = Boolean(
        node.assetPath &&
          (!['sequence', 'animation'].includes(node.type) || node.frameSetInfo?.frames.length)
      );
      return saved ? 'ready' : 'waiting';
    });
    const result = canvasGroupState(states, phase(group.id));
    badge.dataset.state = result.state;
    badge.textContent = result.label;
    badge.title =
      states.filter((state) => state === 'ready').length + '/' + members.length + ' 个资源已就绪';
  }
}

export const CANVAS_CARD_UI_STYLES = `
.card.canvas-card { padding:0; gap:0; border:1px solid #475158; border-radius:9px; background:#1b2125; box-shadow:0 3px 10px #0003; }
.card.canvas-card.selected { outline:2px solid #f5dc56; outline-offset:0; border-color:#f5dc56; }
.canvas-card-header { height:40px; box-sizing:border-box; padding:5px 10px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #343d43; background:#20272b; flex:none; }
.canvas-card-heading { min-width:0; flex:1; display:flex; flex-direction:column; gap:2px; }
.card .canvas-card-title { display:block; color:#edf0ed; font-size:12px; line-height:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.canvas-card-meta { color:#9ca9af; font-size:10px; line-height:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.canvas-card-menu { width:24px; height:26px; flex:none; padding:0; border:0; border-radius:4px; background:transparent; color:#bac4c7; font:700 18px/1 sans-serif; cursor:pointer; }
.canvas-card-menu:hover { background:#374145; color:#fff; }
.canvas-card-menu:focus-visible { outline:2px solid #f5dc56; outline-offset:1px; }
.card.template-locked .canvas-card-menu, .card[aria-busy=true] .canvas-card-menu { visibility:hidden; }
.canvas-card-content { position:relative; display:flex; flex-direction:column; min-height:0; height:calc(100% - 40px); box-sizing:border-box; overflow:hidden; }
.card.image .canvas-card-content > img { width:100%; height:100%; display:block; object-fit:contain; }
.card.image .canvas-card-content, .card.animation .animation-preview, .sequence-result-grid canvas { background:repeating-conic-gradient(#252c30 0% 25%,#20262a 0% 50%) 0/16px 16px; }
.card.video-source .canvas-card-content > video { flex:1; min-height:0; width:100%; height:100%; object-fit:contain; }
.card.sequence .canvas-card-content, .card.animation .canvas-card-content, .card.note .canvas-card-content, .card.video .canvas-card-content { padding:10px; gap:8px; }
.card.note .canvas-card-content textarea { height:100%; }
.card.animation .animation-controls { flex:none; }
.card.sequence .sequence-edit-button { top:8px; right:8px; }
.card.sequence .sequence-result-grid { padding-bottom:34px; }
.card.sequence .sequence-result-empty { padding-bottom:0; }
.card .image-size-info { bottom:7px; left:8px; }
.card > .generation-credits { top:45px; }
.card .resize-handle { width:12px; height:12px; right:3px; bottom:3px; opacity:0; border-radius:0 0 4px 0; background:linear-gradient(135deg,transparent 50%,#9ca9af 50% 60%,transparent 60% 75%,#9ca9af 75% 85%,transparent 85%); }
.card:hover > .resize-handle, .card.selected > .resize-handle, .resize-handle:focus-visible { opacity:1; }
.card.section.canvas-card { background:#292a202b; border:1px solid #666047; box-shadow:none; overflow:visible; }
.card.section .canvas-card-header { border-color:#514e3e; background:#252821e8; border-radius:8px 8px 0 0; }
.canvas-group-state { display:inline-flex; align-items:center; gap:5px; flex:none; font-size:11px; color:#aeb7bb; white-space:nowrap; }
.canvas-group-state:before { content:''; width:6px; height:6px; border-radius:50%; background:currentColor; }
.canvas-group-state[data-state=ready] { color:#69d49c; }
.canvas-group-state[data-state=loading], .canvas-group-state[data-state=waiting], .canvas-group-state[data-state=unknown] { color:#edcd70; }
.canvas-group-state[data-state=failed] { color:#f29c97; }
.canvas-group-state[data-state=paused] { color:#a7bdd6; }
.card .canvas-card-content .template-example { top:8px; }
.card .group-queue { border-color:#514e3e; background:#232925f5; border-radius:7px; box-shadow:none; }
.card .group-queue button { background:#30362e; border-color:#535b4a; color:#ece2bb; }
.card .group-queue button:hover { background:#414938; }
.card .group-queue-tasks { scrollbar-color:#58614e transparent; }
.card .group-queue .group-queue-task { background:#2b3333; border-color:#455152; color:#d7dfdc; }
.card .group-queue .group-queue-status { color:#aab6b0; }
.card .card-state-overlay { background:#141a20d9; backdrop-filter:blur(2px); gap:8px; padding:42px 12px 12px; overflow:auto; justify-content:safe center; overscroll-behavior:contain; pointer-events:auto; }
.card-state-caption { position:absolute; top:10px; left:12px; right:12px; font-size:12px; font-weight:600; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#c7d0d3; }
.card .card-state-icon { width:34px; height:34px; font-size:21px; }
.card .card-state-overlay b { font-size:14px; letter-spacing:0; }
.card .card-state-hint { font-size:11px; line-height:1.5; }
.card .card-state-query { padding:5px 10px; font-size:12px; line-height:18px; border-radius:5px; }
.card .card-state-adjust { background:transparent; border-color:#52616b; color:#c5d0d5; }
.card .card-state-loading { color:#f5dc56; }
.card .card-state-waiting { color:#d9c98e; }
.card .card-state-failed { background:#25191cdd; }
.card .card-state-paused { background:#16212cdd; }
.card .card-state-unknown { background:#272319dd; }
`;
