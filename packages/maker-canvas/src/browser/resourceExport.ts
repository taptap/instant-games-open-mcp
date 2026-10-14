declare const document: any;
declare const window: any;
import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { canvasExportIdentity } from '../features/exportNaming.js';
import { canvasExportFormats } from '../features/resourceExport.js';
import { isGameUiResource } from '../features/uiWorkflow.js';

export function createCanvasResourceExportWithHost(options: {
  downloadResource(
    node: CanvasNode,
    format: string,
    mediaUrl: (path: string) => string,
    progress?: (message: string) => void,
    identity?: { title: string; direction: string },
    loop?: boolean,
    sink?: (blob: Blob, filename: string) => Promise<void>,
    current?: CanvasDocument
  ): Promise<void>;
  openHandoff(canvasId: string): void;
  openAtlas(node: CanvasNode, mediaUrl: (path: string) => string): void;
  getDocument(): CanvasDocument | undefined;
  mediaUrl(path: string): string;
  error(message: string): void;
  progress?(message: string): void;
  model?: { ready(id: string): boolean; download(id: string): Promise<void> };
  assets?: { open(id: string, targetId?: string): Promise<boolean> };
}) {
  let busy = false;
  async function download(node: CanvasNode, format: string, loop = true) {
    if (busy) return;
    busy = true;
    const saved = structuredClone(node);
    try {
      if (saved.type === 'model') {
        if (!options.model || format !== 'model') throw new Error('模型导出尚未就绪。');
        await options.model.download(saved.id);
        return;
      }
      const identity = canvasExportIdentity(options.getDocument(), saved);
      const document = options.getDocument();
      const current = document && structuredClone(document);
      const handoff = isGameUiResource(current, saved);
      let downloaded = false;
      await options.downloadResource(
        saved,
        format,
        options.mediaUrl,
        (message) => {
          downloaded ||= message.startsWith('导出完成：') || message.startsWith('已发起下载：');
          options.progress?.(message);
        },
        identity,
        loop,
        undefined,
        current
      );
      if (downloaded && handoff && current?.id === options.getDocument()?.id)
        options.openHandoff(current!.id);
    } catch (error) {
      options.error((error as Error).message || '资源导出失败，请重试。');
    } finally {
      busy = false;
    }
  }
  return {
    download,
    context(menu: HTMLElement, node?: CanvasNode) {
      menu.querySelector('[data-resource-export]')?.remove();
      const formats = canvasExportFormats(node, options.getDocument());
      if (!node || !formats.length) return;
      const saved = structuredClone(node);
      const group = document.createElement('div');
      group.dataset.resourceExport = 'true';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = '导出资源 ▸';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.disabled =
        busy ||
        (saved.type === 'section'
          ? false
          : saved.type === 'model'
            ? !options.model?.ready(saved.id)
            : (!saved.assetPath &&
                !(saved.type === 'image-assets' && saved.imageAssetsInfo?.items.length)) ||
              Boolean(saved.templatePending) ||
              (['sequence', 'animation'].includes(saved.type) &&
                !saved.frameSetInfo?.frames.length));
      toggle.title = busy
        ? '资源正在导出，请稍候'
        : toggle.disabled
          ? '尚无已保存的生成结果'
          : '导出当前已保存的资源，不包含未保存的处理草稿';
      if (saved.type === 'image-assets' || saved.type === 'section') {
        toggle.textContent =
          saved.type === 'section' ? '下载全部素材（PNG ZIP）' : '下载素材（PNG ZIP）';
        toggle.removeAttribute('aria-expanded');
        toggle.addEventListener('click', () => {
          menu.hidden = true;
          void download(saved, saved.type === 'section' ? 'bundle' : 'images');
        });
        group.append(toggle);
        if (options.assets && saved.type === 'image-assets') {
          const adjust = document.createElement('button');
          adjust.type = 'button';
          adjust.textContent = '调整切图参数';
          const current = options.getDocument();
          const edge = current?.edges.find(
            (item) => item.kind === 'image-assets' && item.to === saved.id
          );
          const source = current?.nodes.find(
            (item) => item.id === edge?.from && item.type === 'image'
          );
          adjust.disabled = busy || !source?.assetPath || Boolean(source.templatePending);
          adjust.addEventListener('click', () => {
            menu.hidden = true;
            if (source)
              void options.assets!.open(source.id, saved.id).catch((error) => {
                options.error((error as Error).message);
              });
          });
          group.append(adjust);
        }
        if (isGameUiResource(options.getDocument(), saved)) {
          const next = document.createElement('button');
          next.type = 'button';
          next.textContent = '下一步：组装游戏 UI';
          next.onclick = () => {
            menu.hidden = true;
            const current = options.getDocument();
            if (current) options.openHandoff(current.id);
          };
          group.append(next);
        }
        menu.append(group);
        return;
      }
      const items = document.createElement('div');
      let loop = true;
      if (formats.some((option) => option.format === 'atlas')) {
        const label = document.createElement('label');
        label.style.cssText =
          'display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;cursor:pointer';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.addEventListener('change', () => {
          loop = checkbox.checked;
        });
        label.append(checkbox, '循环播放');
        label.title = '取消勾选后，导出的动画播放一次并停在末帧；不改变画布播放状态。';
        items.append(label);
      }
      items.hidden = true;
      items.style.paddingLeft = '10px';
      toggle.addEventListener('click', () => {
        items.hidden = !items.hidden;
        toggle.setAttribute('aria-expanded', String(!items.hidden));
        toggle.textContent = items.hidden ? '导出资源 ▸' : '导出资源 ▾';
        const rect = menu.getBoundingClientRect();
        menu.style.top =
          Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8)) + 'px';
      });
      for (const option of formats) {
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = option.label;
        if (option.format === 'atlas' || option.format === 'frames')
          item.title =
            option.format === 'atlas'
              ? '下载 ZIP：Maker spritesheet.png、spritesheet.json 和接入说明。需游戏支持 UI.Sprite。'
              : '下载 ZIP：连续 PNG、animation.lua 配置和接入说明，供游戏现有播放器使用。';
        item.addEventListener('click', () => {
          if (busy) return;
          menu.hidden = true;
          void download(saved, option.format, loop);
        });
        items.append(item);
      }
      if (saved.type === 'image') {
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = '图集解析 / 导出单图';
        item.addEventListener('click', () => {
          if (busy) return;
          menu.hidden = true;
          try {
            if (options.assets) void options.assets.open(saved.id);
            else options.openAtlas(saved, options.mediaUrl);
          } catch (error) {
            options.error((error as Error).message);
          }
        });
        items.append(item);
      }
      group.append(toggle, items);
      menu.prepend(group);
    },
  };
}
