import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

class El {
  tag: string;
  children: El[] = [];
  parent: El | null = null;
  className = '';
  textContent = '';
  value = '';
  type = '';
  attributes: Record<string, string> = {};
  listeners: Record<string, Array<(event: any) => void>> = {};
  constructor(tag: string) { this.tag = tag; }
  append(...nodes: El[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  addEventListener(type: string, fn: (event: any) => void) { (this.listeners[type] ||= []).push(fn); }
  remove() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); }
  showModal() { this.attributes.open = 'true'; }
  close() { delete this.attributes.open; }
  focus() {}
  select() {}
  click() { for (const fn of this.listeners.click || []) fn({ preventDefault() {}, stopPropagation() {} }); }
  dispatch(type: string, event: any) { for (const fn of this.listeners[type] || []) fn(event); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector: string): El[] {
    const out: El[] = [];
    const visit = (node: El) => {
      if (node.tag === selector) out.push(node);
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return out;
  }
}

test('new canvas dialog submits a trimmed name and cancel does not create', () => {
  const body = new El('body');
  (globalThis as any).document = { body, createElement: (tag: string) => new El(tag) };
  const source = readFileSync(new URL('./src/browser/workspaceUi.ts', import.meta.url), 'utf8');
  const start = source.indexOf('function openCanvasCreateDialog()');
  const end = source.indexOf('function button(label: string');
  if (start < 0 || end < 0) throw new Error('dialog source missing');
  const created: string[] = [];
  const dialogs: El[] = [];
  const make = document.createElement.bind(document);
  document.createElement = ((tag: string) => {
    const el = make(tag);
    if (tag === 'dialog') dialogs.push(el);
    return el;
  }) as typeof document.createElement;
  const options = { create: async (title: string) => { created.push(title); return true; } };
  const transition = async (action: () => Promise<boolean>) => action();
  const open = new Function('document', 'options', 'transition', source.slice(start, end) + String.fromCharCode(10) + 'return openCanvasCreateDialog;')(document, options, transition) as () => void;
  open();
  const input = dialogs[0].querySelector('input')!;
  const confirm = dialogs[0].querySelectorAll('button').find((button) => button.textContent === '创建')!;
  input.value = '   ';
  confirm.click();
  assert.deepEqual(created, []);
  input.value = '  关卡一  ';
  input.dispatch('keydown', { key: 'Enter', isComposing: false, preventDefault() {} });
  assert.deepEqual(created, ['关卡一']);
  open();
  dialogs[1].dispatch('cancel', { preventDefault() {} });
  assert.deepEqual(created, ['关卡一']);
  assert.equal(dialogs[1].attributes.open, undefined);
});
