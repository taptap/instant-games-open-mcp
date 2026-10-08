declare const document: any;
declare const window: any;
import type { CanvasDocument, CanvasNode } from './model.js';
import {
  canvasExportIdentity,
  canvasExportFilename,
  nextCanvasExportCode,
} from './exportNaming.js';
import { downloadCanvasImage } from './imageExport.js';
import { createSequenceExport } from './sequenceExport.js';
import { openImageAtlasDialog } from './imageAtlasUi.js';
import { createImageAssetsZip } from './imageAssets.js';
import { isGameUiResource, openGameUiHandoff } from './uiWorkflowHandoff.js';

export function canvasExportFormats(node?: CanvasNode): Array<{ format: string; label: string }> {
  if (node?.type === 'image-assets') return [{ format: 'images', label: '独立 PNG 素材包' }];
  if (node?.type === 'model') return [{ format: 'model', label: 'Maker 模型包（含材质贴图）' }];
  if (!node || !['image', 'video', 'video-source', 'sequence', 'animation'].includes(node.type))
    return [];
  if (node.type === 'image')
    return [
      { format: 'png', label: 'PNG 图片' },
      { format: 'jpg', label: 'JPG 图片' },
    ];
  if (node.type === 'video' || node.type === 'video-source')
    return [{ format: 'video', label: '视频原文件' }];
  return [
    { format: 'atlas', label: 'Maker 图集包（推荐）' },
    { format: 'frames', label: 'Maker 单图包' },
  ];
}

export async function downloadCanvasResource(
  node: CanvasNode,
  format: string,
  mediaUrl: (path: string) => string,
  progress?: (message: string) => void,
  identity = canvasExportIdentity(undefined, node),
  loop = true,
  sink?: (blob: Blob, filename: string) => Promise<void>
): Promise<void> {
  if (
    (!node.assetPath && !(node.type === 'image-assets' && node.imageAssetsInfo?.items.length)) ||
    node.templatePending ||
    !canvasExportFormats(node).some((item) => item.format === format)
  )
    throw new Error('此卡片尚无可导出的生成结果。');
  const sequence = node.type === 'sequence' || node.type === 'animation';
  const assets = node.type === 'image-assets';
  if (sequence && !node.frameSetInfo?.frames.length)
    throw new Error('请先完成并保存序列帧结果，再导出。');
  if (format === 'png' || format === 'jpg') {
    const filename = canvasExportFilename(identity, format, format, await nextCanvasExportCode());
    await downloadCanvasImage(
      mediaUrl(node.assetPath!),
      filename.slice(0, -(format.length + 1)),
      format,
      sink
    );
    return;
  }
  const extension = sequence || assets ? 'zip' : node.assetPath!.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    zip: 'application/zip',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  if (!extension || !types[extension]) throw new Error('当前视频格式暂不支持导出。');
  const mime = types[extension];
  const filename = canvasExportFilename(identity, format, extension, await nextCanvasExportCode());
  const folder = filename.slice(0, -(extension.length + 1));
  let handle: any;
  try {
    if (!sink && typeof window.showSaveFilePicker === 'function') {
      handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: sequence ? '序列帧资源包' : assets ? '独立 PNG 素材包' : '视频原文件',
            accept: { [mime]: ['.' + extension] },
          },
        ],
      });
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') return;
    throw error;
  }
  let blob: Blob;
  if (sequence) {
    progress?.('正在准备序列帧导出包…');
    blob = await createSequenceExport(
      mediaUrl(node.assetPath!),
      node.frameSetInfo!,
      format as 'atlas' | 'frames',
      folder,
      progress,
      {
        name:
          ({ 前: 'front', 后: 'back', 左: 'left', 右: 'right' } as Record<string, string>)[
            identity.direction
          ] || 'default',
        loop,
      }
    );
  } else if (assets) {
    blob = await createImageAssetsZip(node.imageAssetsInfo!, mediaUrl);
  } else {
    const response = await fetch(mediaUrl(node.assetPath!));
    if (!response.ok) throw new Error('视频读取失败，未导出文件，请重试。');
    blob = await response.blob();
    if (!blob.size) throw new Error('视频文件为空，未导出文件。');
  }
  if (sink) {
    await sink(blob, filename);
    return;
  }
  if (handle) {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
      progress?.('导出完成：' + filename);
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  progress?.('已发起下载：' + filename + '，请查看浏览器下载记录。');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function createCanvasResourceExport(options: {
  getDocument(): CanvasDocument | undefined;
  mediaUrl(path: string): string;
  error(message: string): void;
  progress?(message: string): void;
  model?: { ready(id: string): boolean; download(id: string): Promise<void> };
  assets?: { open(id: string): Promise<boolean> };
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
      const current = options.getDocument();
      const handoff = isGameUiResource(current, saved);
      let downloaded = false;
      await downloadCanvasResource(
        saved,
        format,
        options.mediaUrl,
        (message) => {
          downloaded ||= message.startsWith('导出完成：') || message.startsWith('已发起下载：');
          options.progress?.(message);
        },
        identity,
        loop
      );
      if (downloaded && handoff && current?.id === options.getDocument()?.id)
        openGameUiHandoff(current!.id);
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
      const formats = canvasExportFormats(node);
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
        (saved.type === 'model'
          ? !options.model?.ready(saved.id)
          : (!saved.assetPath &&
              !(saved.type === 'image-assets' && saved.imageAssetsInfo?.items.length)) ||
            Boolean(saved.templatePending) ||
            (['sequence', 'animation'].includes(saved.type) && !saved.frameSetInfo?.frames.length));
      toggle.title = busy
        ? '资源正在导出，请稍候'
        : toggle.disabled
          ? '尚无已保存的生成结果'
          : '导出当前已保存的资源，不包含未保存的处理草稿';
      if (saved.type === 'image-assets') {
        toggle.textContent = '下载素材（PNG ZIP）';
        toggle.removeAttribute('aria-expanded');
        toggle.addEventListener('click', () => {
          menu.hidden = true;
          void download(saved, 'images');
        });
        group.append(toggle);
        if (isGameUiResource(options.getDocument(), saved)) {
          const next = document.createElement('button');
          next.type = 'button';
          next.textContent = '下一步：组装游戏 UI';
          next.onclick = () => {
            menu.hidden = true;
            const current = options.getDocument();
            if (current) openGameUiHandoff(current.id);
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
            else openImageAtlasDialog(saved, options.mediaUrl);
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
