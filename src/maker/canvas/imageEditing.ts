import type { CanvasNode } from './model.js';
import type { createBackgroundRemoval } from './backgroundRemoval.js';
import type { openBackgroundEditor } from './backgroundUi.js';
import type { openFrameEditor } from './frameEditor.js';

export interface ImageEditingOptions {
  load: (node: Readonly<CanvasNode>, signal: AbortSignal) => Promise<Blob>;
  save: (blob: Blob, node: Readonly<CanvasNode>) => Promise<{ relativePath: string }>;
  onSaved: (
    result: { relativePath: string },
    node: Readonly<CanvasNode>,
    action: 'cutout' | 'edit'
  ) => void | Promise<void>;
  onBusyChange: (busy: boolean) => void;
  backgroundRemoval: ReturnType<typeof createBackgroundRemoval>;
  openBackgroundEditor: typeof openBackgroundEditor;
  openFrameEditor: typeof openFrameEditor;
}

export function createImageEditing(options: ImageEditingOptions) {
  let busy = false;
  async function open(input: CanvasNode, action: 'cutout' | 'edit'): Promise<void> {
    if (busy) return;
    if (input.type !== 'image' || !input.assetPath) throw new Error('请选择已有图片。');
    const node = structuredClone(input);
    const controller = new AbortController();
    const dialog = document.createElement('dialog');
    dialog.className = 'sequence-editor';
    dialog.setAttribute('aria-label', '本地图片编辑');
    const title = document.createElement('h2');
    title.textContent = '本地图片编辑 · ' + node.title;
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const footer = document.createElement('footer');
    footer.className = 'sequence-editor-footer';
    let original: Blob | undefined;
    let draft: Blob | undefined;
    let saved: { relativePath: string } | undefined;
    let closed = false;
    let saving = false;
    let loading = false;
    function button(label: string, run: () => void) {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.addEventListener('click', run);
      footer.append(element);
      return element;
    }
    function update() {
      edit.disabled = loading || saving || Boolean(saved);
      save.disabled = !draft || loading || saving;
      cancel.disabled = saving;
    }
    function close() {
      if (closed || saving) return;
      if (draft && !window.confirm('放弃未保存的本地图片结果？')) return;
      closed = true;
      controller.abort();
      dialog.close();
      dialog.remove();
      busy = false;
      options.onBusyChange(false);
    }
    async function editImage() {
      if (closed || loading || saving || saved) return;
      loading = true;
      status.textContent = '正在加载本地图片；原图不会改变。';
      update();
      try {
        original ??= await options.load(node, controller.signal);
        if (closed) return;
        const editorOptions = {
          frames: [{ time: 0, blob: action === 'cutout' ? original : draft || original }],
          index: 0,
          apply: (frames: Array<{ blob: Blob }>) => {
            if (closed) return;
            const result = frames[0]?.blob;
            if (!result || result.type !== 'image/png') throw new Error('编辑结果必须为 PNG。');
            draft = result;
            status.textContent = '本地结果已就绪；保存后接入画布，原图保留。';
            update();
          },
        };
        status.textContent = '请在编辑器中应用结果，再保存本地 PNG；取消不会改动原图。';
        if (action === 'cutout')
          await options.openBackgroundEditor({
            ...editorOptions,
            removal: options.backgroundRemoval,
          });
        else await options.openFrameEditor(editorOptions);
      } catch (error) {
        if (!closed) status.textContent = String(error) + '；原图未改变，可重试。';
      } finally {
        loading = false;
        if (!closed) update();
      }
    }
    async function saveImage() {
      if (closed || !draft || saving || loading) return;
      saving = true;
      status.textContent = '正在保存本地 PNG…';
      update();
      try {
        saved ??= await options.save(draft, node);
        await options.onSaved(saved, node, action);
        draft = undefined;
        saving = false;
        close();
      } catch (error) {
        status.textContent = String(error) + '；本地结果仍保留，请重试保存。';
      } finally {
        saving = false;
        if (!closed) update();
      }
    }
    const edit = button('编辑／重试', () => void editImage());
    const save = button('保存本地 PNG', () => void saveImage());
    const cancel = button('取消', close);
    dialog.append(title, status, footer);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener('keydown', (event) => event.stopPropagation());
    document.body.append(dialog);
    dialog.showModal();
    busy = true;
    options.onBusyChange(true);
    await editImage();
  }
  return {
    open,
    get isBusy() {
      return busy;
    },
  };
}
