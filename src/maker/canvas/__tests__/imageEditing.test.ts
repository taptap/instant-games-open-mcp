import { Script } from 'node:vm';
import { createImageEditing, type ImageEditingOptions } from '../imageEditing.js';
import type { CanvasNode } from '../model.js';

class Element extends EventTarget {
  textContent = '';
  disabled = false;
  children: Element[] = [];
  removed = false;
  constructor(readonly tag: string) {
    super();
  }
  append(...children: Element[]) {
    this.children.push(...children);
  }
  setAttribute() {}
  showModal() {}
  close() {}
  remove() {
    this.removed = true;
  }
  click() {
    if (!this.disabled) this.dispatchEvent(new Event('click'));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function fixture() {
  const body = new Element('body');
  const confirm = jest.fn(() => true);
  const factory: typeof createImageEditing = new Script(
    '(' + createImageEditing.toString() + ')'
  ).runInNewContext({
    document: { body, createElement: (tag: string) => new Element(tag) },
    window: { confirm },
    structuredClone,
    AbortController,
  });
  const node: CanvasNode = {
    id: 'source',
    type: 'image',
    title: 'hero',
    assetPath: 'assets/original.jpg',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  const original = new Blob(['original'], { type: 'image/jpeg' });
  const png = new Blob(['edited'], { type: 'image/png' });
  const load = jest.fn(async () => original);
  const save = jest.fn(async () => ({ relativePath: 'assets/local.png' }));
  const onSaved = jest.fn(async () => undefined);
  const onBusyChange = jest.fn();
  const editor = jest.fn(
    async (_options: Parameters<ImageEditingOptions['openFrameEditor']>[0]) => {}
  );
  const background = jest.fn(
    async (_options: Parameters<ImageEditingOptions['openBackgroundEditor']>[0]) => {}
  );
  const removal = {} as ImageEditingOptions['backgroundRemoval'];
  const controller = factory({
    load,
    save,
    onSaved,
    onBusyChange,
    openFrameEditor: editor,
    openBackgroundEditor: background,
    backgroundRemoval: removal,
  });
  const dialog = () => body.children[body.children.length - 1];
  const button = (label: string) =>
    dialog().children[2].children.find((element) => element.textContent === label)!;
  const apply = () => editor.mock.calls[0][0].apply([{ time: 0, blob: png }]);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    controller,
    node,
    original,
    png,
    load,
    save,
    onSaved,
    onBusyChange,
    editor,
    background,
    removal,
    dialog,
    button,
    apply,
    flush,
    confirm,
  };
}

describe('local image editing (serialized browser factory)', () => {
  test.each(['cutout', 'edit'] as const)(
    'routes %s to the injected single-image editor without saving',
    async (action) => {
      const test = fixture();
      const before = structuredClone(test.node);
      await test.controller.open(test.node, action);
      const selected = action === 'cutout' ? test.background : test.editor;
      expect(selected).toHaveBeenCalledWith(
        expect.objectContaining({
          frames: [{ time: 0, blob: test.original }],
          index: 0,
          ...(action === 'cutout' ? { removal: test.removal } : {}),
        })
      );
      expect(test.controller.isBusy).toBe(true);
      expect(test.save).not.toHaveBeenCalled();
      expect(test.node).toEqual(before);
      await test.controller.open(test.node, 'edit');
      expect(selected).toHaveBeenCalledTimes(1);
      test.button('取消').click();
      expect(test.controller.isBusy).toBe(false);
      expect(test.onBusyChange.mock.calls).toEqual([[true], [false]]);
    }
  );

  test.each(['cutout', 'edit'] as const)(
    'reopening %s keeps the cutout baseline or continues the drawing draft',
    async (action) => {
      const test = fixture();
      await test.controller.open(test.node, action);
      const selected = action === 'cutout' ? test.background : test.editor;
      selected.mock.calls[0][0].apply([{ time: 0, blob: test.png }]);
      test.button('编辑／重试').click();
      await test.flush();
      expect(selected.mock.calls[1][0].frames[0].blob).toBe(
        action === 'cutout' ? test.original : test.png
      );
      expect(test.save).not.toHaveBeenCalled();
    }
  );

  test('saves only the applied PNG and original node snapshot, then calls onSaved', async () => {
    const test = fixture();
    const before = structuredClone(test.node);
    await test.controller.open(test.node, 'edit');
    expect(test.button('保存本地 PNG').disabled).toBe(true);
    test.apply();
    test.node.assetPath = 'assets/other.png';
    test.button('保存本地 PNG').click();
    await test.flush();
    expect(test.save).toHaveBeenCalledWith(test.png, before);
    expect(test.onSaved).toHaveBeenCalledWith({ relativePath: 'assets/local.png' }, before, 'edit');
    expect(test.controller.isBusy).toBe(false);
    expect(test.dialog().removed).toBe(true);
  });

  test('load cancellation aborts input and ignores late results without reopening an editor', async () => {
    const test = fixture();
    const pending = deferred<Blob>();
    test.load.mockReturnValueOnce(pending.promise);
    const opening = test.controller.open(test.node, 'edit');
    expect(test.controller.isBusy).toBe(true);
    test.button('取消').click();
    expect((test.load.mock.calls[0] as unknown as [CanvasNode, AbortSignal])[1].aborted).toBe(true);
    await test.controller.open(test.node, 'cutout');
    pending.resolve(test.original);
    await opening;
    expect(test.editor).not.toHaveBeenCalled();
    expect(test.background).toHaveBeenCalledTimes(1);
    expect(test.controller.isBusy).toBe(true);
    expect(test.save).not.toHaveBeenCalled();
  });

  test('load and editor errors preserve the source and allow explicit retry', async () => {
    const test = fixture();
    test.load.mockRejectedValueOnce(new Error('read failed'));
    await test.controller.open(test.node, 'edit');
    expect(test.dialog().children[1].textContent).toContain('read failed');
    test.editor.mockRejectedValueOnce(new Error('decode failed'));
    test.button('编辑／重试').click();
    await test.flush();
    expect(test.dialog().children[1].textContent).toContain('decode failed');
    test.button('编辑／重试').click();
    await test.flush();
    expect(test.editor).toHaveBeenCalledTimes(2);
    expect(test.load).toHaveBeenCalledTimes(2);
    expect(test.node.assetPath).toBe('assets/original.jpg');
    expect(test.save).not.toHaveBeenCalled();
  });

  test('save failure retains the PNG for retry and serializes saves and cancellation', async () => {
    const test = fixture();
    await test.controller.open(test.node, 'edit');
    test.apply();
    test.save.mockRejectedValueOnce(new Error('disk full'));
    test.button('保存本地 PNG').click();
    await test.flush();
    expect(test.controller.isBusy).toBe(true);
    expect(test.dialog().children[1].textContent).toContain('disk full');
    const pending = deferred<{ relativePath: string }>();
    test.save.mockReturnValueOnce(pending.promise);
    test.button('保存本地 PNG').click();
    test.button('保存本地 PNG').click();
    test.dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(test.controller.isBusy).toBe(true);
    expect(test.dialog().removed).toBe(false);
    pending.resolve({ relativePath: 'assets/local.png' });
    await test.flush();
    expect(test.save).toHaveBeenCalledTimes(2);
    expect(test.onSaved).toHaveBeenCalledTimes(1);
    expect(test.controller.isBusy).toBe(false);
  });

  test('onSaved failure retries integration without importing the same PNG again', async () => {
    const test = fixture();
    await test.controller.open(test.node, 'edit');
    test.apply();
    test.onSaved.mockRejectedValueOnce(new Error('document save failed'));
    test.button('保存本地 PNG').click();
    await test.flush();
    expect(test.controller.isBusy).toBe(true);
    expect(test.button('编辑／重试').disabled).toBe(true);
    test.button('保存本地 PNG').click();
    await test.flush();
    expect(test.save).toHaveBeenCalledTimes(1);
    expect(test.onSaved).toHaveBeenCalledTimes(2);
    expect(test.controller.isBusy).toBe(false);
  });

  test('draft cancellation asks before discarding and never saves or mutates the image', async () => {
    const test = fixture();
    await test.controller.open(test.node, 'edit');
    test.apply();
    test.confirm.mockReturnValueOnce(false);
    test.button('取消').click();
    expect(test.controller.isBusy).toBe(true);
    test.button('取消').click();
    test.apply();
    expect(test.controller.isBusy).toBe(false);
    expect(test.node.assetPath).toBe('assets/original.jpg');
    expect(test.save).not.toHaveBeenCalled();
    expect(test.onSaved).not.toHaveBeenCalled();
  });

  test('rejects missing/non-image sources and non-PNG editor results', async () => {
    const test = fixture();
    await expect(
      test.controller.open({ ...test.node, assetPath: undefined }, 'edit')
    ).rejects.toThrow();
    await expect(test.controller.open({ ...test.node, type: 'video' }, 'edit')).rejects.toThrow();
    expect(test.controller.isBusy).toBe(false);
    await test.controller.open(test.node, 'edit');
    expect(() => test.editor.mock.calls[0][0].apply([{ time: 0, blob: test.original }])).toThrow(
      'PNG'
    );
    expect(test.button('保存本地 PNG').disabled).toBe(true);
    expect(test.save).not.toHaveBeenCalled();
  });
});
