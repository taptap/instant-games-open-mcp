import assert from 'node:assert/strict';
import test from 'node:test';

class El {
  tag: string;
  children: El[] = [];
  parent: El | null = null;
  isConnected = true;
  get parentElement() {
    return this.parent;
  }
  className = '';
  get classList() {
    const el = this;
    return {
      add(...names: string[]) {
        const have = new Set(el.className.split(' ').filter(Boolean));
        for (const name of names) have.add(name);
        el.className = Array.from(have).join(' ');
      },
    };
  }
  textContent = '';
  dataset: Record<string, string> = {};
  disabled = false;
  type = '';
  value = '';
  style: Record<string, string> = {};
  listeners: Record<string, Array<(event: any) => void>> = {};
  attributes: Record<string, string> = {};
  constructor(tag: string) {
    this.tag = tag;
  }
  append(...nodes: El[]) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  after(node: El) {
    const parent = this.parent;
    if (!parent) throw new Error('no parent');
    node.parent = parent;
    const index = parent.children.indexOf(this);
    parent.children.splice(index + 1, 0, node);
  }
  closest(selector: string) {
    let current: El | null = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parent;
    }
    return null;
  }
  matches(selector: string) {
    if (selector === '.card') return this.className.split(' ').includes('card');
    return false;
  }
  querySelector(selector: string) {
    const found = this.querySelectorAll(selector);
    return found[0] || null;
  }
  querySelectorAll(selector: string): El[] {
    const out: El[] = [];
    const visit = (node: El) => {
      if (match(node, selector)) out.push(node);
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return out;
  }
  addEventListener(type: string, fn: (event: any) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
    if (name === 'class') this.className = value;
  }
  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  click() {
    for (const fn of this.listeners.click || [])
      fn({ stopPropagation() {}, preventDefault() {}, key: 'Enter', isComposing: false });
  }
  getContext() {
    return { clearRect() {}, drawImage() {} };
  }
}
function match(node: El, selector: string) {
  if (selector === 'button') return node.tag === 'button';
  if (selector.startsWith(':scope > ')) return false;
  if (selector.includes('.canvas-group-state'))
    return node.className.split(' ').includes('canvas-group-state');
  if (selector === '.canvas-sprite-chat')
    return node.className.split(' ').includes('canvas-sprite-chat');
  if (selector === '.card') return node.className.split(' ').includes('card');
  return false;
}
function installDom() {
  const root = new El('div');
  (globalThis as any).document = {
    hidden: false,
    body: root,
    addEventListener() {},
    createElement: (tag: string) => new El(tag),
  };
  (globalThis as any).CSS = { escape: (value: string) => value };
  (globalThis as any).performance = { now: () => (globalThis as any).__now || 0 };
  const queued: Array<(now: number) => void> = [];
  (globalThis as any).__frames = queued;
  (globalThis as any).requestAnimationFrame = (fn: (now: number) => void) => {
    queued.push(fn);
    return queued.length;
  };
  (globalThis as any).cancelAnimationFrame = () => {
    queued.length = 0;
  };
  (globalThis as any).__step = () => {
    const fn = queued.shift();
    if (!fn) return;
    (globalThis as any).__now = ((globalThis as any).__now || 0) + 200;
    fn((globalThis as any).__now);
  };
  (globalThis as any).Image = class {
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
  return root;
}

test('sprite preview opens paused on the first frame and re-renders keep playback', async () => {
  installDom();
  const { createAnimationCards } = await import('./src/browser/animation.ts');
  const frames = [0, 1, 2, 3].map((index) => ({
    x: 0,
    y: 0,
    width: 8,
    height: 8,
    sourceWidth: 8,
    sourceHeight: 8,
    duration: 0,
  }));
  const node = {
    id: 'anim-1',
    type: 'animation',
    assetPath: 'assets/sprites/hero/sheet.png',
    frameSetInfo: { fps: 8, frames, frameCount: 4 },
  };
  const cards = createAnimationCards(() => 'blob:sheet');
  const card = new El('div');
  cards.beginRender([node as any]);
  cards.render(card as any, node as any);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const buttons = () => card.querySelectorAll('button');
  const canvases = () => card.children.filter((child) => child.tag === 'canvas');
  const play = buttons()[buttons().length - 1];
  const canvas = canvases()[canvases().length - 1];
  assert.equal(play.textContent, '播放');
  assert.equal(canvas.dataset.frameIndex, '0');
  assert.equal((globalThis as any).__frames.length, 0);
  play.click();
  assert.equal(play.textContent, '暂停');
  assert.equal(canvas.dataset.frameIndex, '0');
  (globalThis as any).__step();
  assert.notEqual(canvas.dataset.frameIndex, '0');
  const held = canvas.dataset.frameIndex;
  cards.beginRender([node as any]);
  cards.render(card as any, node as any);
  const again = buttons()[buttons().length - 1];
  const canvas2 = canvases()[canvases().length - 1];
  assert.equal(again.textContent, '暂停');
  assert.equal(canvas2.dataset.frameIndex, held);
  again.click();
  assert.equal(again.textContent, '播放');
  const paused = canvas2.dataset.frameIndex;
  cards.beginRender([node as any]);
  cards.render(card as any, node as any);
  assert.equal(buttons()[buttons().length - 1].textContent, '播放');
  assert.equal(canvases()[canvases().length - 1].dataset.frameIndex, paused);
  const reopened = createAnimationCards(() => 'blob:sheet');
  const fresh = new El('div');
  reopened.beginRender([node as any]);
  reopened.render(fresh as any, node as any);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fresh.querySelectorAll('button')[0].textContent, '播放');
  assert.equal(fresh.children.find((child) => child.tag === 'canvas')!.dataset.frameIndex, '0');
});

test('ui split header follows the sprite cluster and keeps the editor out of it', async () => {
  installDom();
  const root = (globalThis as any).document.body as El;
  const { createCanvasUiSplitController } = await import('./src/browser/uiSplit.ts');
  const card = new El('div');
  card.className = 'card';
  card.dataset.id = 'group-1';
  card.attributes['data-id'] = 'group-1';
  const header = new El('div');
  header.className = 'canvas-card-header';
  const heading = new El('div');
  heading.className = 'canvas-card-heading';
  const title = new El('strong');
  title.className = 'canvas-card-title';
  title.textContent = 'UI 切分：inventory';
  const meta = new El('small');
  meta.className = 'canvas-card-meta';
  meta.textContent = '4 个节点';
  heading.append(title, meta);
  const badge = new El('span');
  badge.className = 'canvas-group-state';
  const menu = new El('button');
  menu.className = 'canvas-card-menu';
  menu.textContent = '⋯';
  header.append(heading, badge, menu);
  card.append(header);
  card.style.width = '960px';
  root.append(card);
  const original = root.querySelector.bind(root);
  root.querySelector = (selector: string) => {
    if (selector.includes('group-1') && selector.includes('canvas-group-state')) return badge;
    return original(selector);
  };
  root.querySelectorAll = (selector: string) => {
    if (selector === ':scope > .ui-split-actions')
      return card.children.filter((child) => child.className.includes('ui-split-actions'));
    if (selector === '.canvas-sprite-chat')
      return header.children.filter((child) =>
        child.className.split(' ').includes('canvas-sprite-chat')
      );
    return [];
  };
  card.querySelectorAll = root.querySelectorAll;
  header.querySelectorAll = (selector: string) =>
    selector === '.canvas-sprite-chat'
      ? header.children.filter((child) => child.className.split(' ').includes('canvas-sprite-chat'))
      : [];
  let renders = 0;
  const controller = createCanvasUiSplitController({
    current: () => ({
      id: 'canvas',
      title: '画布',
      nodes: [
        {
          id: 'group-1',
          uiSplit: {
            name: 'inventory',
            sourcePath: 'assets/a.png',
            phase: '已完成',
            chatId: 'chat-1',
          },
        },
      ],
    }),
    store: {},
    host: { openSpriteChat() {}, openUiSplitEditor() {}, downloadUiSplit() {} },
    save: async () => true,
    changed() {},
    render() {
      renders += 1;
    },
    remember() {},
    createId: () => 'id',
    error() {},
  });
  controller.decorate(root as any);
  assert.deepEqual(
    header.children.map((child) => child.className.split(' ')[0]),
    ['canvas-card-heading', 'canvas-group-state', 'canvas-sprite-chat', 'canvas-card-menu']
  );
  assert.equal(header.children[1].textContent, '已完成');
  assert.equal(header.children[2].textContent, '打开会话');
  assert.equal(header.children[3].textContent, '⋯');
  assert.equal(card.className.includes('canvas-sprite-group'), true);
  assert.equal(
    header.children.some((child) => child.textContent === '重新整理'),
    false
  );
  assert.equal(
    header.children.some((child) => child.textContent === '打开 UI 编辑器'),
    false
  );
  const bar = card.children.find((child) => child.className.includes('ui-split-actions'));
  assert.ok(bar);
  assert.equal(bar!.parent, card);
  assert.notEqual(bar!.parent, header);
  const primary = bar!.children[0].children.find((button) =>
    button.className.includes('group-queue-primary')
  );
  assert.equal(primary?.textContent, '打开 UI 编辑器');
  const state = controller.actions({ id: 'group-1', uiSplit: { phase: '已完成' } });
  assert.equal(state.tidy.disabled, false);
  assert.equal(state.editor.disabled, false);
  assert.equal(renders, 0);
});
