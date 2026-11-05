import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { canvasWebBox, canvasWebCurve } from './wireUi.js';

/** Mivo's slot rule: empty slots and AI results keep the composer; plain imported images do not. */
export function canvasWebSlot(node: CanvasNode): boolean {
  return node.type === 'image' && (!node.assetPath || Boolean(node.generation));
}

/** Turns a text action into a Web icon button; the text stays as aria-label and tooltip. */
export function canvasWebIconAction(
  button: HTMLElement,
  icon:
    | 'chat'
    | 'openChat'
    | 'cutout'
    | 'chevron'
    | 'download'
    | 'trash'
    | 'image'
    | 'video'
    | 'sequence'
    | 'upload'
    | 'group'
    | 'ungroup'
    | 'sprite'
    | 'tidy'
    | 'copy'
    | 'crop'
    | 'rotate'
    | 'flipX'
    | 'flipY'
): HTMLElement {
  // Inlined here because helpers are injected into the page via toString().
  const paths = {
    // lucide message-square-plus
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/>',
    // lucide message-square-text
    openChat:
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/>',
    // lucide square-scissors
    cutout:
      '<rect width="20" height="20" x="2" y="2" rx="2"/><circle cx="8" cy="8" r="2"/><path d="M9.414 9.414 12 12"/><path d="M14.8 14.8 18 18"/><circle cx="8" cy="16" r="2"/><path d="m18 6-8.586 8.586"/>',
    // lucide chevron-down
    chevron: '<path d="m6 9 6 6 6-6"/>',
    // lucide download
    download:
      '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    // lucide trash-2
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    // lucide image
    image:
      '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    // lucide video
    video:
      '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    // lucide film
    sequence:
      '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
    // lucide upload
    upload:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    // lucide group
    group:
      '<path d="M3 7V5c0-1.1.9-2 2-2h2"/><path d="M17 3h2c1.1 0 2 .9 2 2v2"/><path d="M21 17v2c0 1.1-.9 2-2 2h-2"/><path d="M7 21H5c-1.1 0-2-.9-2-2v-2"/><rect width="7" height="5" x="7" y="7" rx="1"/><rect width="7" height="5" x="10" y="12" rx="1"/>',
    // lucide ungroup
    ungroup:
      '<rect width="8" height="6" x="5" y="4" rx="1"/><rect width="8" height="6" x="11" y="14" rx="1"/>',
    // lucide sparkles
    sprite:
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    // lucide copy
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    // lucide layout-dashboard
    tidy: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    // lucide crop
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    // lucide rotate-cw
    rotate: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    // lucide flip-horizontal-2
    flipX:
      '<path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
    // lucide flip-vertical-2
    flipY:
      '<path d="m17 3-5 5-5-5h10"/><path d="m17 21-5-5-5 5h10"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/>',
  };
  const label = button.getAttribute('aria-label') || button.textContent || '';
  button.setAttribute('aria-label', label);
  // The custom tooltip replaces the slow native title bubble.
  button.removeAttribute('title');
  button.dataset.webTip = label;
  if (icon !== 'chevron') button.classList.add('web-icon-action');
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths[icon] +
    '</svg>';
  return button;
}

/**
 * Replaces the native popup of every single-choice `<select>` on the page with a list drawn in
 * the Web menu style. The `<select>` stays the source of truth: picking an option sets its value
 * and fires `input` and `change`, so existing listeners keep working. Opens on click, Space, Enter
 * and the arrow keys; Escape, Tab, an outside click, scrolling or resizing closes it.
 */
export function installCanvasWebSelects() {
  let open: { select: HTMLSelectElement; list: HTMLElement; detach(): void } | null = null;
  function close(refocus: boolean) {
    const current = open;
    if (!current) return;
    open = null;
    current.detach();
    current.list.remove();
    if (refocus && current.select.isConnected) current.select.focus();
  }
  function show(select: HTMLSelectElement) {
    close(false);
    const list = document.createElement('div');
    list.className = 'web-select-list';
    list.setAttribute('role', 'listbox');
    const items: HTMLButtonElement[] = [];
    Array.from(select.options).forEach((option, index) => {
      if (option.hidden) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'web-select-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === select.selectedIndex));
      item.disabled = option.disabled;
      item.textContent = option.textContent;
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        if (select.isConnected && select.selectedIndex !== index) {
          select.selectedIndex = index;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        close(true);
      });
      items.push(item);
      list.append(item);
    });
    // Modal dialogs live in the top layer; the list must sit inside them to show above.
    (select.closest('dialog') || document.body).append(list);
    const rect = select.getBoundingClientRect();
    list.style.minWidth = Math.round(rect.width) + 'px';
    const height = list.offsetHeight;
    const below = window.innerHeight - rect.bottom - 8;
    const top = height <= below || rect.top < height + 8 ? rect.bottom + 4 : rect.top - height - 4;
    list.style.top = Math.max(8, Math.round(top)) + 'px';
    list.style.left =
      Math.max(8, Math.min(window.innerWidth - list.offsetWidth - 8, Math.round(rect.left))) + 'px';
    const chosen = items.find((item) => item.getAttribute('aria-selected') === 'true') || items[0];
    if (chosen) {
      chosen.scrollIntoView({ block: 'nearest' });
      chosen.focus();
    }
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (list.contains(target) || target === select)) return;
      close(false);
    };
    const dismiss = (event: Event) => {
      if (event.type === 'scroll' && list.contains(event.target as Node)) return;
      close(false);
    };
    list.addEventListener('keydown', (event) => {
      event.stopPropagation();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Tab') {
        close(false);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        for (let next = index + step; next >= 0 && next < items.length; next += step)
          if (!items[next].disabled) {
            items[next].focus();
            break;
          }
      }
    });
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    document.addEventListener('scroll', dismiss, true);
    document.addEventListener('wheel', dismiss, { capture: true, passive: true });
    open = {
      select,
      list,
      detach() {
        document.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('resize', dismiss);
        window.removeEventListener('blur', dismiss);
        document.removeEventListener('scroll', dismiss, true);
        document.removeEventListener('wheel', dismiss, true);
      },
    };
  }
  function target(event: Event): HTMLSelectElement | null {
    const element = event.target as Element | null;
    const select = element && element.closest ? element.closest('select') : null;
    return select && !select.disabled && !select.multiple && select.size <= 1 ? select : null;
  }
  document.addEventListener(
    'mousedown',
    (event) => {
      const select = target(event);
      if (!select || event.button !== 0) return;
      event.preventDefault();
      select.focus();
      if (open && open.select === select) close(false);
      else show(select);
    },
    true
  );
  document.addEventListener(
    'keydown',
    (event) => {
      const select = target(event);
      if (!select || event.target !== select || event.metaKey || event.ctrlKey) return;
      if ([' ', 'Enter', 'ArrowDown', 'ArrowUp'].indexOf(event.key) < 0) return;
      event.preventDefault();
      show(select);
    },
    true
  );
}

/**
 * Typing `@` in the generation composer's prompt lists the composer's input images (the
 * thumbnails above it, in the order they are sent) and inserts `@图N` for the chosen one, so the
 * prompt can name each image. Text typed after `@` filters by number or caption; ↑/↓ move,
 * Enter or Tab picks, Escape, a space or leaving the field closes the list.
 * Each `@图N` that matches an input image shows as a chip with that image's thumbnail. The prompt
 * stays a plain textarea (its value is what gets sent): its text is transparent and a mirror
 * behind it draws the same text, with the `@` of a token replaced by the thumbnail, so wrapping
 * and the caret line up exactly.
 */
export function installCanvasWebMentions() {
  const fields =
    '#selection-toolbar textarea.generation-prompt, #selection-toolbar .prompt-section-input';
  let open: {
    field: HTMLTextAreaElement;
    start: number;
    list: HTMLElement;
    items: Array<{ element: HTMLButtonElement; token: string }>;
    active: number;
  } | null = null;
  function close() {
    if (!open) return;
    open.list.remove();
    open = null;
  }
  const mainFields = '#selection-toolbar textarea.generation-prompt';
  function syncMirror(field: HTMLTextAreaElement) {
    const mirror = field.previousElementSibling as HTMLElement | null;
    if (!mirror || !mirror.classList.contains('web-prompt-mirror')) return;
    const style = getComputedStyle(field);
    for (const name of [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
    ] as const)
      mirror.style[name] = style[name];
    const images = tiles(field);
    mirror.replaceChildren();
    let last = 0;
    const value = field.value;
    const pattern = /@图(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value))) {
      const tile = images[Number(match[1]) - 1];
      if (!tile) continue;
      mirror.append(value.slice(last, match.index));
      const chip = document.createElement('span');
      chip.className = 'web-prompt-chip';
      const at = document.createElement('span');
      at.className = 'web-prompt-chip-image';
      at.textContent = '@';
      at.style.backgroundImage = 'url("' + tile.src.replace(/"/g, '%22') + '")';
      chip.append(at, match[0].slice(1));
      mirror.append(chip);
      last = match.index + match[0].length;
    }
    // A trailing newline needs a character after it to take up its line.
    mirror.append(value.slice(last) + (value.endsWith('\n') ? ' ' : ''));
    mirror.scrollTop = field.scrollTop;
    // Without a chip the textarea draws its own text and the mirror stays out of the way.
    const mirrored = mirror.childElementCount > 0;
    mirror.hidden = !mirrored;
    field.classList.toggle('web-prompt-mirrored', mirrored);
  }
  function wrap(field: HTMLTextAreaElement) {
    if (field.dataset.webMentions) return;
    field.dataset.webMentions = '1';
    const box = document.createElement('div');
    box.className = 'web-prompt-mention';
    const mirror = document.createElement('div');
    mirror.className = 'web-prompt-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    field.replaceWith(box);
    box.append(mirror, field);
    field.addEventListener('scroll', () => {
      mirror.scrollTop = field.scrollTop;
    });
    syncMirror(field);
  }
  // The composer is rebuilt on selection changes; wrap each new prompt once its thumbnails exist.
  // Only new prompts are handled here: syncing the mirror mutates the DOM and would loop.
  new MutationObserver(() => {
    document.querySelectorAll<HTMLTextAreaElement>(mainFields).forEach((field) => {
      if (!field.dataset.webMentions) wrap(field);
    });
  }).observe(document.body, { childList: true, subtree: true });
  function tiles(field: HTMLTextAreaElement) {
    const panel = field.closest('.generation-panel') || field.closest('#selection-toolbar');
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('.generation-references .generation-reference'))
      .map((tile) => ({
        src: (tile.querySelector('img') as HTMLImageElement | null)?.src || '',
        caption: (tile.querySelector('small')?.textContent || '').trim(),
      }))
      .filter((tile) => tile.src)
      .map((tile, index) => ({ ...tile, token: '图' + (index + 1) }));
  }
  function choose(index: number) {
    if (!open) return;
    const { field, start, items } = open;
    const item = items[index];
    if (!item) return;
    const end = field.selectionStart ?? field.value.length;
    const text = '@' + item.token + ' ';
    field.value = field.value.slice(0, start) + text + field.value.slice(end);
    const caret = start + text.length;
    field.setSelectionRange(caret, caret);
    close();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  }
  function highlight(index: number) {
    if (!open || !open.items.length) return;
    open.active = (index + open.items.length) % open.items.length;
    open.items.forEach((item, position) =>
      item.element.setAttribute('aria-selected', String(position === open!.active))
    );
    open.items[open.active].element.scrollIntoView({ block: 'nearest' });
  }
  function show(field: HTMLTextAreaElement, start: number, query: string) {
    const all = tiles(field);
    const shown = all.filter(
      (tile) =>
        !query ||
        tile.token.indexOf(query) >= 0 ||
        tile.caption.indexOf(query) >= 0 ||
        String(all.indexOf(tile) + 1) === query
    );
    if (!shown.length) {
      close();
      return;
    }
    const list = open && open.field === field ? open.list : document.createElement('div');
    list.className = 'web-select-list web-mention-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '引用输入图片');
    list.replaceChildren();
    const items = shown.map((tile, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'web-select-option web-mention-option';
      element.setAttribute('role', 'option');
      const image = document.createElement('img');
      image.src = tile.src;
      image.alt = '';
      const token = document.createElement('b');
      token.textContent = tile.token;
      const caption = document.createElement('span');
      caption.textContent = tile.caption;
      element.append(image, token, caption);
      element.addEventListener('mousedown', (event) => event.preventDefault());
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        choose(index);
      });
      list.append(element);
      return { element, token: tile.token };
    });
    if (!list.isConnected) document.body.append(list);
    open = { field, start, list, items, active: 0 };
    highlight(0);
    const rect = field.getBoundingClientRect();
    const height = list.offsetHeight;
    const top = rect.top - height - 6 >= 8 ? rect.top - height - 6 : rect.bottom + 6;
    list.style.top = Math.round(top) + 'px';
    list.style.left =
      Math.max(8, Math.min(window.innerWidth - list.offsetWidth - 8, Math.round(rect.left))) + 'px';
  }
  function update(field: HTMLTextAreaElement) {
    const caret = field.selectionStart ?? 0;
    const before = field.value.slice(0, caret);
    const at = before.lastIndexOf('@');
    const query = at >= 0 ? before.slice(at + 1) : '';
    if (at < 0 || /\s/.test(query) || query.length > 12) {
      close();
      return;
    }
    show(field, at, query);
  }
  document.addEventListener(
    'input',
    (event) => {
      const field = event.target as HTMLTextAreaElement | null;
      if (!field || !field.matches || !field.matches(fields)) return;
      if (field.dataset.webMentions) syncMirror(field);
      const typed = (event as InputEvent).data;
      if (open && open.field === field) update(field);
      else if (typed && typed.slice(-1) === '@') update(field);
    },
    true
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (!open || event.target !== open.field || event.isComposing) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        highlight(open.active + (event.key === 'ArrowDown' ? 1 : -1));
      else if (event.key === 'Enter' || event.key === 'Tab') choose(open.active);
      else if (event.key === 'Escape') close();
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
  document.addEventListener(
    'focusout',
    (event) => {
      if (open && event.target === open.field)
        setTimeout(() => {
          if (open && document.activeElement !== open.field) close();
        }, 0);
    },
    true
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (open && !open.list.contains(event.target as Node) && event.target !== open.field) close();
    },
    true
  );
}

/** Immediate tooltip for Web icon-only buttons; migrates native titles so only one bubble shows. */
export function installCanvasWebTooltips() {
  const targets =
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
    root.classList.toggle('canvas-web-keyboard', next);
    if (!next || !measure) return;
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
      element.dataset.webTip = element.title;
      if (!element.getAttribute('aria-label')) element.setAttribute('aria-label', element.title);
      element.removeAttribute('title');
    }
    return element.dataset.webTip || element.getAttribute('aria-label') || '';
  }
  function place() {
    if (!owner || !owner.isConnected) return hide();
    const box = owner.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const center = box.left + box.width / 2;
    const left = Math.max(6, Math.min(center - width / 2, window.innerWidth - 6 - width));
    const below = box.top - 8 - height < 4;
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

/** Composer identity: what the panel reads minus geometry and its own draft edits, so drags keep the DOM. */
export function canvasComposerKey(doc: CanvasDocument, node: CanvasNode, extra: unknown[]): string {
  const edges = doc.edges.filter((edge) => edge.to === node.id || edge.from === node.id);
  const linked = new Set(edges.map((edge) => (edge.to === node.id ? edge.from : edge.to)));
  const sources = doc.nodes
    .filter((item) => linked.has(item.id))
    .map((item) => [item.id, item.assetPath, item.title]);
  // The composer itself commits prompt/parameters into the draft (e.g. on blur at drag start).
  const draft = node.generationDraft && {
    ...node.generationDraft,
    prompt: undefined,
    parameters: undefined,
  };
  const content = { ...node, x: 0, y: 0, width: 0, height: 0, generationDraft: draft };
  return JSON.stringify([doc.id, content, edges, sources, extra]);
}

/** Post-render Web selection chrome: zoom-invariant sizing, corner handles and the empty-slot upload pill. */
export function decorateCanvasWebCards(options: {
  world: HTMLElement;
  doc: CanvasDocument;
  selected: Set<string>;
  busy(id: string): boolean;
  upload(id: string): void;
  resize?(event: PointerEvent, id: string, corner: string): void;
}) {
  const { world, doc, selected } = options;
  const zoom = doc.viewport.scale > 0 ? doc.viewport.scale : 1;
  // Mivo sizes handles, outline and pills in screen pixels, so world-space chrome divides by zoom.
  world.style.setProperty('--web-inv', String(1 / zoom));
  world.classList.toggle('web-multi-selection', selected.size > 1);
  // Idempotent: the video player reselects without a full render and redecorates in place.
  world.querySelectorAll('.web-node-handle, .web-slot-upload').forEach((item) => item.remove());
  world.querySelectorAll(':scope > .card[data-id] > .card-state-loading').forEach((element) => {
    // Mivo GeneratedMediaFx tip: status text and the stop action share one pill under the frame.
    const overlay = element as HTMLElement;
    if (overlay.querySelector(':scope > .web-state-tip')) return;
    const tip = document.createElement('div');
    tip.className = 'web-state-tip';
    const title = overlay.querySelector(':scope > b');
    const dots = document.createElement('span');
    dots.className = 'web-state-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = '...';
    if (title) tip.append(title, dots);
    overlay.querySelectorAll(':scope > .card-state-query').forEach((item) => tip.append(item));
    overlay.append(tip);
  });
  function handles(card: HTMLElement, node: CanvasNode, frame: HTMLElement | null, busy: boolean) {
    const box = frame
      ? { x: frame.offsetLeft, y: frame.offsetTop, w: frame.offsetWidth, h: frame.offsetHeight }
      : { x: 0, y: 0, w: card.offsetWidth, h: card.offsetHeight };
    // Groups are large rounded frames: no visible dot, only an invisible corner hit area that
    // shows the resize cursor (dots on a rounded rectangle looked off either way).
    const group = node.type === 'section';
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.tabIndex = -1;
      handle.className = 'web-node-handle is-' + corner + (group ? ' is-group' : '');
      handle.setAttribute('aria-label', node.type === 'image' ? '调整图片大小' : '调整卡片大小');
      handle.style.left = box.x + (corner[1] === 'e' ? box.w : 0) + 'px';
      handle.style.top = box.y + (corner[0] === 's' ? box.h : 0) + 'px';
      if (busy || !options.resize) handle.disabled = true;
      handle.addEventListener('pointerdown', (event) => {
        if (handle.disabled || event.button !== 0) return;
        options.resize!(event, node.id, corner);
      });
      card.append(handle);
    }
  }
  // Video, video result, sequence, animation and group frames share the image selection chrome; sections frame the whole card.
  world
    .querySelectorAll(
      ':scope > .card.video[data-id], :scope > .card.video-source[data-id], :scope > .card.section[data-id], :scope > .card.sequence[data-id], :scope > .card.animation[data-id]'
    )
    .forEach((element) => {
      const card = element as HTMLElement;
      const node = doc.nodes.find((item) => item.id === card.dataset.id);
      if (!node) return;
      card.classList.add('web-media');
      card.classList.toggle('web-empty', node.type === 'video' && !node.assetPath);
      if (selected.size !== 1 || !selected.has(node.id)) return;
      const frame =
        node.type === 'section'
          ? null
          : (card.querySelector(':scope > .canvas-card-content') as HTMLElement | null);
      handles(card, node, frame, options.busy(node.id));
    });
  world.querySelectorAll(':scope > .card.image[data-id]').forEach((element) => {
    const card = element as HTMLElement;
    const node = doc.nodes.find((item) => item.id === card.dataset.id);
    if (!node) return;
    card.classList.toggle('web-slot', canvasWebSlot(node));
    card.classList.toggle('web-empty', !node.assetPath);
    if (selected.size !== 1 || !selected.has(node.id)) return;
    const frame = card.querySelector(':scope > .canvas-card-content') as HTMLElement | null;
    const busy = options.busy(node.id);
    handles(card, node, frame, busy);
    if (node.assetPath || !frame || busy) return;
    // Mivo imageReplaceButtonScale: cap at 30x136 screen px and 20%/62% of the frame.
    const width = frame.offsetWidth * zoom;
    const height = frame.offsetHeight * zoom;
    const fit = Math.min(Math.min(30, height * 0.2) / 32, Math.min(136, width * 0.62) / 128) / zoom;
    if (!(fit > 0)) return;
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'web-slot-upload';
    upload.setAttribute('aria-label', '上传');
    upload.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.8 0L9 18"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/></svg><span>上传</span>';
    upload.style.left = frame.offsetLeft + frame.offsetWidth / 2 + 'px';
    upload.style.top = frame.offsetTop - 14 / zoom + 'px';
    upload.style.transform = 'translate(-50%, -100%) scale(' + fit + ')';
    upload.addEventListener('pointerdown', (event) => event.stopPropagation());
    upload.addEventListener('dblclick', (event) => event.stopPropagation());
    upload.addEventListener('click', (event) => {
      event.stopPropagation();
      options.upload(node.id);
    });
    card.append(upload);
  });
}

/** Anchors the 素材规范 popover above its pill, clamped to the board, without affecting composer layout. */
export function canvasWebPlacePopover(
  toolbar: HTMLElement,
  board: { left: number; top: number; right: number; bottom: number; width: number },
  gap: number
) {
  const popover = toolbar.querySelector('.generation-asset-popover') as HTMLElement | null;
  const wrap = popover && popover.parentElement;
  if (!popover || !wrap) return;
  popover.style.maxWidth = Math.max(0, board.width - gap * 2) + 'px';
  const anchor = wrap.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const left = Math.max(board.left + gap, Math.min(anchor.left, board.right - gap - width));
  const top = Math.max(
    board.top + gap,
    Math.min(anchor.top - 8 - height, board.bottom - gap - height)
  );
  // Offsets stay relative to the pill wrap, so the popover follows the composer between renders.
  popover.style.left = left - anchor.left + 'px';
  popover.style.top = top - anchor.top + 'px';
  popover.style.bottom = 'auto';
}

/** Board-local rect left after cutting away floating bars (tool dock, flow bar) on their side. */
export function canvasWebFitArea(
  board: { left: number; top: number; width: number; height: number },
  overlays: { left: number; top: number; right: number; bottom: number }[],
  margin: number
) {
  let left = board.left;
  let top = board.top;
  let right = board.left + board.width;
  let bottom = board.top + board.height;
  for (const item of overlays) {
    if (item.right <= left || item.left >= right || item.bottom <= top || item.top >= bottom)
      continue;
    // Keep the largest strip beside the bar; bars hugging an edge then trim just that edge.
    const strips = [
      { side: 'left', area: (right - item.right) * (bottom - top) },
      { side: 'right', area: (item.left - left) * (bottom - top) },
      { side: 'top', area: (bottom - item.bottom) * (right - left) },
      { side: 'bottom', area: (item.top - top) * (right - left) },
    ].sort((a, b) => b.area - a.area);
    const side = strips[0].side;
    if (side === 'left') left = Math.max(left, item.right);
    else if (side === 'right') right = Math.min(right, item.left);
    else if (side === 'top') top = Math.max(top, item.bottom);
    else bottom = Math.min(bottom, item.top);
  }
  return {
    x: left - board.left + margin,
    y: top - board.top + margin,
    width: Math.max(1, right - left - margin * 2),
    height: Math.max(1, bottom - top - margin * 2),
  };
}

/** Web-only pointer chrome: handle magnet, connection drag preview, drop target and pill selects. */
export function createCanvasWebChrome(options: {
  board: HTMLElement;
  current(): CanvasDocument | null;
}) {
  const board = options.board;
  installCanvasWebTooltips();
  installCanvasWebSelects();
  installCanvasWebMentions();
  // Web dock and tab icons: plain lucide at stroke 2, matching the Maker shell (lucide-react).
  const lucide = (paths: string, size: number) =>
    '<svg viewBox="0 0 24 24" width="' +
    size +
    '" height="' +
    size +
    '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths +
    '</svg>';
  const dockIcons: Array<[string, string]> = [
    // lucide mouse-pointer-2
    [
      '#tool-select',
      '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
    ],
    // lucide hand
    [
      '#tool-pan',
      '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    ],
    // lucide square
    ['#mark-ellipse', '<rect width="18" height="18" x="3" y="3" rx="2"/>'],
    // lucide arrow-right
    ['#mark-arrow', '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'],
    // lucide plus
    ['.workspace-add > summary', '<path d="M5 12h14"/><path d="M12 5v14"/>'],
    // lucide layout-grid
    [
      '#add-template',
      '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    ],
    // lucide save
    [
      '#save',
      '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    ],
    // lucide ellipsis
    [
      '.workspace-more > summary',
      '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    ],
  ];
  for (const [selector, paths] of dockIcons) {
    const element = document.querySelector(selector);
    if (element) element.innerHTML = lucide(paths, 20);
  }
  // lucide pencil
  const rename = document.getElementById('rename-canvas');
  if (rename)
    rename.innerHTML = lucide(
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
      16
    );
  const grip = document.querySelector('.workspace-toolbar-grip') as HTMLElement | null;
  // Arrow keys still move it; the tooltip only names the drag.
  if (grip) grip.title = '拖动工具条';
  // lucide grip-horizontal: the Braille glyph renders unevenly across system fonts.
  if (grip)
    grip.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="5" cy="9" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="19" cy="15" r="1"/><circle cx="5" cy="15" r="1"/></svg>';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'web-wire-preview');
  svg.setAttribute('aria-hidden', 'true');
  board.append(svg);
  let target: Element | null = null;
  let hot: HTMLElement | null = null;
  function line(d: string, className: string) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    return path;
  }
  function mark(next: Element | null) {
    if (target === next) return;
    if (target) target.classList.remove('web-wire-target');
    target = next;
    if (target) target.classList.add('web-wire-target');
  }
  function clear() {
    svg.replaceChildren();
    mark(null);
  }
  function rest(port: HTMLElement | null) {
    if (!port) return;
    port.classList.remove('is-magnet');
    port.style.removeProperty('--web-mx');
    port.style.removeProperty('--web-my');
  }
  /** Draws the pending wire; snaps to the facing side of an image card under the pointer. */
  function preview(drag: { id: string; reverse?: boolean }, event: PointerEvent) {
    const doc = options.current();
    const found = doc && doc.nodes.find((node) => node.id === drag.id);
    if (!doc || !found) return;
    const source = canvasWebBox(found);
    const view = doc.viewport;
    const rect = board.getBoundingClientRect();
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const card = hit && hit.closest ? hit.closest('.card[data-id]') : null;
    const id = card && card.getAttribute('data-id');
    const hitNode =
      id && id !== drag.id
        ? doc.nodes.find((item) => item.id === id && ['image', 'video'].includes(item.type))
        : undefined;
    const node = hitNode && canvasWebBox(hitNode);
    mark(node ? card : null);
    const dir = drag.reverse ? -1 : 1;
    const p0 = {
      x: drag.reverse ? source.x : source.x + source.width,
      y: source.y + source.height / 2,
    };
    const p1 = node
      ? { x: drag.reverse ? node.x + node.width : node.x, y: node.y + node.height / 2 }
      : {
          x: (event.clientX - rect.left - view.x) / view.scale,
          y: (event.clientY - rect.top - view.y) / view.scale,
        };
    const d = canvasWebCurve(p0, p1, dir, view).d;
    svg.replaceChildren(line(d, 'web-wire-preview-glow'), line(d, 'web-wire-preview-line'));
  }
  board.addEventListener('pointermove', (event) => {
    const element = event.target as HTMLElement;
    const port = event.buttons ? null : (element.closest('.canvas-port') as HTMLElement | null);
    if (hot !== port) rest(hot);
    hot = port;
    if (!port) return;
    // The ring follows the pointer inside the 80px hot zone, capped at 30px like Mivo's magnet.
    const box = port.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy);
    const limit = distance > 30 ? 30 / distance : 1;
    port.classList.add('is-magnet');
    port.style.setProperty('--web-mx', dx * limit + 'px');
    port.style.setProperty('--web-my', dy * limit + 'px');
  });
  board.addEventListener('pointerleave', () => {
    rest(hot);
    hot = null;
  });
  // The page owns drop handling; the preview only has to vanish however the gesture ends.
  for (const name of ['pointerup', 'pointercancel', 'blur'])
    window.addEventListener(name, clear, true);
  const toolbar = document.getElementById('selection-toolbar');
  const measure = document.createElement('canvas').getContext('2d');
  function fitSelects() {
    if (!toolbar || !measure) return;
    toolbar.querySelectorAll('select.generation-mode').forEach((element) => {
      const select = element as HTMLSelectElement;
      const option = select.options[select.selectedIndex];
      measure.font = getComputedStyle(select).font;
      // Native selects size to their widest option; Web pills size to the chosen label.
      const width = Math.ceil(measure.measureText(option ? option.text : '').width);
      // 28px padding + 2px border, plus slack because canvas and form-control text metrics differ.
      select.style.width = Math.min(220, width + 36) + 'px';
    });
  }
  if (toolbar) {
    new MutationObserver(fitSelects).observe(toolbar, { childList: true, subtree: true });
    toolbar.addEventListener('change', fitSelects);
  }
  return { preview, clear };
}

/** Play/pause glyph and label for the Web video card control, kept in step with the element. */
export function canvasWebSyncVideoPlay(button: HTMLElement, player: HTMLVideoElement) {
  const playing = !player.paused && !player.ended;
  const label = playing ? '暂停视频' : '播放视频';
  if (button.dataset.playing === String(playing)) return;
  button.dataset.playing = String(playing);
  button.setAttribute('aria-label', label);
  button.dataset.webTip = label;
  // lucide play / pause
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (playing
      ? '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'
      : '<polygon points="6 3 20 12 6 21 6 3"/>') +
    '</svg>';
}

/** Web video progress bar (time, seek slider, mute); built once per reused player so it survives re-renders. */
export function canvasWebVideoBar(player: HTMLVideoElement): HTMLElement {
  const owner = player as HTMLVideoElement & {
    canvasWebBar?: HTMLElement;
    canvasWebKey?: (event: KeyboardEvent) => boolean;
    canvasWebWake?: () => void;
  };
  if (owner.canvasWebBar) return owner.canvasWebBar;
  const bar = document.createElement('div');
  bar.className = 'web-video-bar';
  const time = document.createElement('span');
  time.className = 'web-video-time';
  const track = document.createElement('div');
  track.className = 'web-video-track';
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-label', '播放进度');
  track.setAttribute('aria-valuemin', '0');
  const fill = document.createElement('div');
  fill.className = 'web-video-fill';
  const thumb = document.createElement('div');
  thumb.className = 'web-video-thumb';
  track.append(fill, thumb);
  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'web-video-mute';
  bar.append(time, track, mute);
  owner.canvasWebBar = bar;
  const clock = (seconds: number) => {
    const whole = Math.max(0, Math.floor(seconds || 0));
    return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
  };
  const duration = () => (Number.isFinite(player.duration) ? player.duration : 0);
  let frame = 0;
  // While playing, the controls fade after 2s without pointer or key activity so they don't cover the picture.
  // The flag sits on the <video> so CSS can hide both the play chip and the bar that follow it.
  let idle = 0;
  const wake = () => {
    clearTimeout(idle);
    delete player.dataset.idle;
    if (player.paused || player.ended) return;
    idle = window.setTimeout(() => {
      if (!player.paused && !player.ended && !bar.dataset.seeking) player.dataset.idle = 'true';
    }, 2000);
  };
  const sync = () => {
    const total = duration();
    const now = Math.min(player.currentTime || 0, total || Infinity);
    const text = clock(now) + ' / ' + clock(total);
    const ratio = total ? Math.min(1, now / total) : 0;
    time.textContent = text;
    fill.style.width = ratio * 100 + '%';
    thumb.style.left = ratio * 100 + '%';
    track.setAttribute('aria-valuemax', String(Math.round(total * 10) / 10));
    track.setAttribute('aria-valuenow', String(Math.round(now * 10) / 10));
    track.setAttribute('aria-valuetext', text);
    bar.dataset.playing = String(!player.paused && !player.ended);
    const muted = player.muted || player.volume === 0;
    const label = muted ? '取消静音' : '静音';
    mute.setAttribute('aria-label', label);
    mute.setAttribute('aria-pressed', String(muted));
    mute.dataset.webTip = label;
    // lucide volume-2 / volume-x
    mute.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/>' +
      (muted
        ? '<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>'
        : '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.7"/>') +
      '</svg>';
  };
  // timeupdate fires ~4Hz, so a frame loop keeps the bar smooth while playing.
  const loop = () => {
    frame = 0;
    sync();
    if (!player.paused && !player.ended && player.isConnected) frame = requestAnimationFrame(loop);
  };
  const seek = (seconds: number) => {
    const total = duration();
    if (!total) return;
    player.currentTime = Math.max(0, Math.min(total, seconds));
    sync();
  };
  const seekAt = (clientX: number) => {
    const rect = track.getBoundingClientRect();
    if (rect.width > 0) seek(((clientX - rect.left) / rect.width) * duration());
  };
  // MediaRecorder WebMs report an Infinity duration until seeked past the end, which leaves nothing to seek.
  let probing = false;
  player.addEventListener('loadedmetadata', () => {
    if (player.duration !== Infinity || !player.paused || player.currentTime) return;
    probing = true;
    player.currentTime = 1e7;
  });
  player.addEventListener('durationchange', () => {
    if (!probing || !Number.isFinite(player.duration)) return;
    probing = false;
    player.currentTime = 0;
  });
  [
    'loadedmetadata',
    'durationchange',
    'timeupdate',
    'seeked',
    'pause',
    'ended',
    'volumechange',
  ].forEach((name) => player.addEventListener(name, sync));
  player.addEventListener('play', () => {
    if (!frame) frame = requestAnimationFrame(loop);
    sync();
  });
  // The card drags on pointerdown, so nothing that starts on the bar may reach it.
  ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu'].forEach((name) =>
    bar.addEventListener(name, (event) => event.stopPropagation())
  );
  track.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    track.focus({ preventScroll: true });
    track.setPointerCapture(event.pointerId);
    bar.dataset.seeking = 'true';
    seekAt(event.clientX);
  });
  track.addEventListener('pointermove', (event) => {
    if (track.hasPointerCapture(event.pointerId)) seekAt(event.clientX);
  });
  const release = (event: PointerEvent) => {
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    delete bar.dataset.seeking;
    wake();
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  // Shared by the slider, the play chip and the page's selected-card shortcut.
  const keySeek = (event: KeyboardEvent) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
    };
    if (event.key in steps) seek((player.currentTime || 0) + steps[event.key]);
    else if (event.key === 'Home') seek(0);
    else if (event.key === 'End') seek(duration());
    else return false;
    wake();
    return true;
  };
  owner.canvasWebKey = keySeek;
  owner.canvasWebWake = wake;
  track.addEventListener('keydown', (event) => {
    if (!keySeek(event)) return;
    // Canvas shortcuts (delete, selected-card seek) must not also act on the same key.
    event.preventDefault();
    event.stopPropagation();
  });
  player.addEventListener('pointermove', wake);
  bar.addEventListener('pointermove', wake);
  bar.addEventListener('focusin', wake);
  ['play', 'pause', 'ended'].forEach((name) => player.addEventListener(name, wake));
  mute.addEventListener('click', () => {
    player.muted = !(player.muted || player.volume === 0);
    if (!player.muted && player.volume === 0) player.volume = 1;
    sync();
  });
  sync();
  return bar;
}
/** Side + chooser: a small menu next to the ring; arrows move, Esc closes and refocuses the +. */
export function openCanvasWebSlotChooser(options: {
  anchor: HTMLElement;
  items: Array<{ label: string; icon: 'image' | 'video'; run(): void }>;
  restoreFocus(): void;
}) {
  document.querySelector('.web-slot-chooser')?.remove();
  // lucide image / video, same strokes as the slot glyphs.
  const icons = {
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    video:
      '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  };
  const menu = document.createElement('div');
  menu.className = 'web-slot-chooser';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '新建卡片');
  const outside = (event: Event) => {
    if (!menu.contains(event.target as Node)) close(false);
  };
  const dismiss = () => close(false);
  function close(restore: boolean) {
    if (!menu.isConnected) return;
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('wheel', dismiss, true);
    window.removeEventListener('blur', dismiss);
    if (restore) options.restoreFocus();
  }
  const buttons = options.items.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      icons[item.icon] +
      '</svg>';
    const text = document.createElement('span');
    text.textContent = item.label;
    button.append(text);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      close(false);
      item.run();
    });
    menu.append(button);
    return button;
  });
  menu.addEventListener('pointerdown', (event) => event.stopPropagation());
  menu.addEventListener('keydown', (event) => {
    // Canvas shortcuts (Delete, Space pan, undo) must not fire while the menu owns the keyboard.
    event.stopPropagation();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => {
      event.preventDefault();
      buttons[(next + buttons.length) % buttons.length].focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(buttons.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(false);
  });
  document.body.append(menu);
  // The visible ring sits 25px inside the 80px hot zone, so the menu opens just right of the ring.
  const box = options.anchor.getBoundingClientRect();
  const left = box.left + box.width / 2 - 25 + 18;
  const top = box.top + box.height / 2 - menu.offsetHeight / 2;
  menu.style.left = Math.max(8, Math.min(left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(top, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('wheel', dismiss, true);
  window.addEventListener('blur', dismiss);
  buttons[0]?.focus();
  return { close };
}
