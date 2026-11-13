/** Self-contained because Canvas serializes browser installers into its page. */
export function installWebToolbarDrag(
  toolbar: HTMLElement,
  area: HTMLElement,
  grip: HTMLElement,
  options: {
    inset?: number;
    onStart?: () => void;
    onPosition?: () => void;
  } = {}
) {
  let position: { x: number; y: number } | null = null;
  let drag: { id: number; x: number; y: number } | null = null;
  const inset = options.inset || 0;
  function place() {
    if (position) {
      position.x = Math.max(
        inset,
        Math.min(position.x, area.clientWidth - toolbar.offsetWidth - inset)
      );
      position.y = Math.max(
        inset,
        Math.min(position.y, area.clientHeight - toolbar.offsetHeight - inset)
      );
      toolbar.style.left = position.x + 'px';
      toolbar.style.top = position.y + 'px';
      toolbar.style.transform = 'none';
    }
    if (options.onPosition) options.onPosition();
  }
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const box = toolbar.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX - box.left, y: event.clientY - box.top };
    if (options.onStart) options.onStart();
    grip.setPointerCapture(event.pointerId);
    grip.classList.add('dragging');
  });
  grip.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const box = area.getBoundingClientRect();
    position = { x: event.clientX - box.left - drag.x, y: event.clientY - box.top - drag.y };
    place();
  });
  function stop() {
    drag = null;
    grip.classList.remove('dragging');
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    grip.addEventListener(type, stop);
  grip.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const box = toolbar.getBoundingClientRect();
    const bounds = area.getBoundingClientRect();
    position = {
      x:
        box.left -
        bounds.left +
        (event.key === 'ArrowRight' ? 10 : event.key === 'ArrowLeft' ? -10 : 0),
      y:
        box.top - bounds.top + (event.key === 'ArrowDown' ? 10 : event.key === 'ArrowUp' ? -10 : 0),
    };
    place();
  });
  new ResizeObserver(place).observe(area);
  return {
    reset() {
      position = null;
      toolbar.style.left = '';
      toolbar.style.top = '';
      toolbar.style.transform = '';
    },
  };
}

export function webToolbarStyles(M: string) {
  return `${M} .maker-toolbar { width: 48px; padding: 7px 5px; gap: 0; border: 1px solid var(--web-line); border-radius: 24px; background: var(--web-panel); box-shadow: var(--web-shadow); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
${M} .maker-toolbar .maker-toolbar-grip { display: flex; align-items: center; justify-content: center; height: 16px; min-height: 16px; margin-bottom: 2px; padding: 0; border: 0; background: transparent; color: var(--web-muted); font-size: 0; line-height: 0; }
${M} .maker-toolbar .maker-toolbar-grip:hover:not(:disabled), ${M} .maker-toolbar .maker-toolbar-grip:active:not(:disabled) { background: transparent; color: var(--web-text); }
${M} .maker-toolbar .maker-toolbar-grip svg { display: block; }
${M} .maker-toolbar-actions { gap: 0; align-items: center; }
${M} .maker-toolbar-actions > * + * { margin-top: 4px; }
${M} .maker-toolbar-actions > button, ${M} .maker-toolbar-actions summary { box-sizing: border-box; width: 36px; height: 36px; min-height: 36px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--web-muted); font-weight: 400; }
${M} .maker-toolbar-actions > button:hover:not(:disabled), ${M} .maker-toolbar-actions summary:hover { background: var(--web-wash); color: var(--web-text); }
${M} .maker-toolbar-actions > button[aria-pressed="true"], ${M} .maker-toolbar-actions > button[aria-pressed="true"]:hover:not(:disabled), ${M} .maker-toolbar-actions .maker-toolbar-add[open] > summary { background: var(--web-text); color: var(--web-panel); }
${M} .maker-toolbar-sep { width: 20px; height: 1px; margin: 6px auto; background: var(--web-line); }
${M} .maker-toolbar-actions > button:active:not(:disabled), ${M} .maker-toolbar-actions > button[aria-expanded="true"], ${M} .maker-toolbar-actions > button[aria-expanded="true"]:hover:not(:disabled) { background: var(--web-text); color: var(--web-panel); transition: none; }
${M} .maker-toolbar-menu { padding: 6px; border: 1px solid var(--web-line); border-radius: 12px; background: var(--web-panel); box-shadow: var(--web-shadow); }
${M} .maker-toolbar-menu button { border: 0; border-radius: 8px; background: transparent; color: var(--web-text); padding: 8px 10px; }
${M} .maker-toolbar-menu button:hover:not(:disabled) { background: var(--web-wash); }
`;
}
