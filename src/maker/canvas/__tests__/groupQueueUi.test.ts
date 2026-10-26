import { createCanvasGroupQueueUi } from '../groupQueueUi.js';
import type { CanvasNode } from '../model.js';

class Element {
  children: Element[] = [];
  dataset: Record<string, string> = {};
  style = {};
  className = '';
  textContent = '';
  isConnected = true;
  disabled = false;
  listeners: Record<string, () => void> = {};
  constructor(public tag = 'div') {}
  get firstElementChild() {
    return this.children[0];
  }
  replaceChildren() {
    this.children = [];
  }
  append(...items: Element[]) {
    this.children.push(...items);
  }
  querySelector() {
    return undefined;
  }
  setAttribute() {}
  addEventListener(event: string, action: () => void) {
    this.listeners[event] = action;
  }
}

test.each([false, true])('only CLI-only groups hide start and resume (%s)', (cliOnly) => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => new Element(tag),
    },
  });
  try {
    const group: CanvasNode = {
      id: 'group',
      type: 'section',
      title: 'test',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      templateCliOnly: cliOnly,
    };
    let state: unknown;
    const start = jest.fn();
    const stop = jest.fn();
    const ui = createCanvasGroupQueueUi({
      node: () => group,
      focus() {},
      queue: { view: () => state, remaining: () => 1, start, stop } as unknown as Parameters<
        typeof createCanvasGroupQueueUi
      >[0]['queue'],
    });
    const card = new Element();
    ui.render(card as unknown as HTMLElement, group);
    const root = card.children[0];
    // Buttons sit in the bar's rows (one level down).
    const buttons = () =>
      root.children
        .flatMap((item) => (item.tag === 'button' ? [item] : item.children))
        .filter((item) => item.tag === 'button');
    expect(buttons().some((item) => item.textContent.includes('完成剩余'))).toBe(!cliOnly);
    if (!cliOnly) {
      buttons()[0].listeners.click();
      buttons()
        .find((item) => item.textContent === '确认执行')!
        .listeners.click();
      expect(start).toHaveBeenCalledWith('group', true);
    }
    state = {
      phase: 'paused',
      pending: [],
      running: {},
      completed: 0,
      total: 1,
      message: 'paused',
    };
    ui.refresh();
    expect(buttons().some((item) => item.textContent === '继续剩余流程')).toBe(!cliOnly);
    state = {
      phase: 'running',
      pending: [],
      running: {},
      completed: 0,
      total: 1,
      message: 'running',
    };
    ui.refresh();
    buttons()
      .find((item) => item.textContent === '停止后续')!
      .listeners.click();
    expect(stop).toHaveBeenCalledWith('group');
  } finally {
    if (prior) Object.defineProperty(globalThis, 'document', prior);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
