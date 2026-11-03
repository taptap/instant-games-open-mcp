/** Immediate tooltip for Web icon-only buttons; migrates native titles so only one bubble shows. */
export function installCanvasWebTooltips(
  options: {
    targets?: string;
    labelAttribute?: string;
    keyboardClass?: string;
    boundary?: { targets: string; container: string };
  } = {}
) {
  const targets =
    options.targets ||
    '[data-web-tip], .workspace-actions > button, .workspace-actions summary, .workspace-toolbar-grip, .wire-controls .wire-scissors, .card .canvas-card-menu, .workspace-tab #rename-canvas';
  const tip = document.createElement('div');
  tip.className = 'web-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  document.body.append(tip);
  let owner: HTMLElement | null = null;
  let timer = 0;
  let keyboard = false;
  let lastHide = 0;
  const root = document.documentElement;
  const measure = document.createElement('canvas').getContext('2d');
  /** Mirrors the flag on :root so CSS shows focus rings for keyboard focus only (no :focus-visible on Chrome 74). */
  function setKeyboard(next: boolean) {
    if (keyboard === next) return;
    keyboard = next;
    root.classList.toggle(options.keyboardClass || 'canvas-web-keyboard', next);
    if (!next || !measure || options.keyboardClass) return;
    // The ring is the live host accent at 60%; canvas normalises any CSS color, as color-mix is unavailable.
    measure.fillStyle = '#6957e8';
    measure.fillStyle = getComputedStyle(root).getPropertyValue('--web-accent').trim() || '#6957e8';
    const color = String(measure.fillStyle);
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
    root.style.setProperty(
      '--web-focus-ring',
      hex
        ? 'rgba(' + [hex[1], hex[2], hex[3]].map((part) => parseInt(part, 16)).join(',') + ',.6)'
        : color.replace(/,\s*[\d.]+\)$/, ',.6)')
    );
  }
  function label(element: HTMLElement) {
    if (element.title) {
      // Moving title into data keeps the text while stopping the native delayed tooltip.
      element.setAttribute(options.labelAttribute || 'data-web-tip', element.title);
      if (!element.getAttribute('aria-label')) element.setAttribute('aria-label', element.title);
      element.removeAttribute('title');
    }
    return (
      element.getAttribute(options.labelAttribute || 'data-web-tip') ||
      element.getAttribute('aria-label') ||
      ''
    );
  }
  function place() {
    if (!owner || !owner.isConnected) return hide();
    const box = owner.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const center = box.left + box.width / 2;
    const boundary =
      options.boundary && owner.closest(options.boundary.targets)
        ? document.querySelector(options.boundary.container)?.getBoundingClientRect()
        : null;
    const minX = boundary ? boundary.left + 6 : 6;
    const maxX = boundary ? boundary.right - 6 : window.innerWidth - 6;
    const minY = boundary ? boundary.top + 4 : 4;
    const left = Math.max(minX, Math.min(center - width / 2, maxX - width));
    const below = box.top - 8 - height < minY;
    tip.dataset.side = below ? 'below' : 'above';
    tip.style.left = left + 'px';
    tip.style.top = (below ? box.bottom + 8 : box.top - 8 - height) + 'px';
    tip.style.setProperty(
      '--web-tip-arrow',
      Math.max(10, Math.min(width - 10, center - left)) + 'px'
    );
  }
  function show(element: HTMLElement) {
    const text = label(element);
    if (!text) return hide();
    owner = element;
    clearTimeout(timer);
    // Like shadcn's skip-delay: moving between buttons right after one closed shows at once.
    const delay = tip.dataset.open === 'true' || Date.now() - lastHide < 300 ? 0 : 150;
    timer = window.setTimeout(() => {
      if (owner !== element || !element.isConnected) return;
      tip.textContent = text;
      tip.hidden = false;
      place();
      tip.dataset.open = 'true';
    }, delay);
  }
  function hide() {
    clearTimeout(timer);
    if (tip.dataset.open === 'true') lastHide = Date.now();
    owner = null;
    tip.dataset.open = 'false';
    tip.hidden = true;
  }
  function find(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    return element && element.closest ? (element.closest(targets) as HTMLElement | null) : null;
  }
  document.addEventListener(
    'pointerover',
    (event) => {
      const element = find(event.target);
      if (element) {
        if (element !== owner) show(element);
      } else if (owner) hide();
    },
    true
  );
  document.addEventListener(
    'pointerout',
    (event) => {
      if (owner && !owner.contains(event.relatedTarget as Node | null)) hide();
    },
    true
  );
  // Only keyboard focus shows it; Chrome 74 lacks :focus-visible, so the last input type decides.
  document.addEventListener(
    'keydown',
    (event) => {
      const target = event.target as HTMLElement | null;
      const typing =
        Boolean(target?.closest?.('textarea, input, [contenteditable="true"]')) &&
        event.key !== 'Tab';
      // Typing in a clicked field or pressing a bare modifier is not keyboard navigation.
      if (!typing && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) setKeyboard(true);
      if (event.key === 'Escape') hide();
    },
    true
  );
  document.addEventListener(
    'pointerdown',
    () => {
      setKeyboard(false);
      hide();
    },
    true
  );
  document.addEventListener('focusin', (event) => {
    const element = find(event.target);
    if (element && keyboard) show(element);
  });
  document.addEventListener('focusout', (event) => {
    if (owner && event.target === owner) hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('wheel', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide);
  return { hide };
}

export function canvasWebTooltipStyles(M: string, L: string): string {
  return `/* Tooltip = Mivo .canvas-tooltip-host bubble: small dark pill above the target, shown by JS after 150ms. */
${M} .web-tooltip { position: fixed; left: 0; top: 0; z-index: 2147483000; box-sizing: border-box; max-width: 220px; padding: 5px 9px; border: 1px solid rgba(255,250,240,.1); border-radius: 7px; background: rgba(28,28,27,.98); color: #fffaf0; box-shadow: 0 10px 24px rgba(0,0,0,.28); font-size: 12px; font-weight: 600; line-height: 1.35; text-align: center; white-space: nowrap; pointer-events: none; opacity: 0; -webkit-transform: translateY(3px); transform: translateY(3px); transition: opacity .12s ease, transform .12s ease; }
${M} .web-tooltip[data-open="true"] { opacity: 1; -webkit-transform: none; transform: none; }
${M} .web-tooltip[hidden] { display: none; }
${M} .web-tooltip::after { content: ''; position: absolute; left: var(--web-tip-arrow, 50%); top: 100%; width: 8px; height: 8px; margin: -4px 0 0 -4px; box-sizing: border-box; border-right: 1px solid rgba(255,250,240,.1); border-bottom: 1px solid rgba(255,250,240,.1); background: inherit; -webkit-transform: rotate(45deg); transform: rotate(45deg); }
${M} .web-tooltip[data-side="below"]::after { top: 0; -webkit-transform: rotate(225deg); transform: rotate(225deg); }
${L} .web-tooltip { border-color: rgba(37,46,41,.9); background: rgba(37,46,41,.96); color: #ffffff; box-shadow: 0 8px 20px rgba(35,35,35,.16); }
${L} .web-tooltip::after { border-color: rgba(37,46,41,.9); }
@media (prefers-reduced-motion: reduce) { ${M} .web-tooltip { transition: none; } }`;
}
