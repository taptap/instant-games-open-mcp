import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { drawCanvasMark } from './marks.js';

/** The host owns storage; preview and submission share the same rasterized PNG. */
export function createCanvasReferenceImages(options: {
  current(): CanvasDocument | null;
  mediaUrl(path: string): string;
  prepareMedia(path: string): Promise<void>;
  upload(blob: Blob): Promise<{ relativePath: string }>;
}) {
  type Entry = { blob: Blob; url: string; path?: string; uploading?: Promise<string> };
  const cache = new Map<string, Promise<Entry>>();
  let disposed = false;
  function clear() {
    for (const value of cache.values())
      void value.then(
        (entry) => URL.revokeObjectURL(entry.url),
        () => {}
      );
    cache.clear();
  }
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true;
      clear();
    },
    { once: true }
  );
  async function capture(source: CanvasNode): Promise<Entry | undefined> {
    const current = options.current();
    if (!current || !source.assetPath) return;
    const candidates = current.nodes.filter(
      (node) =>
        node.type === 'mark' &&
        node.mark &&
        node.x >= source.x &&
        node.y >= source.y &&
        node.x + node.width <= source.x + source.width &&
        node.y + node.height <= source.y + source.height
    );
    if (!candidates.length) return;
    await options.prepareMedia(source.assetPath);
    if (disposed || options.current() !== current) throw new Error('画布已切换，未准备参考图。');
    const pixels = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        pixels.src = '';
        reject(new Error('参考图像素读取超时。'));
      }, 15000);
      pixels.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      pixels.onerror = () => {
        clearTimeout(timer);
        reject(new Error('参考图像素读取失败。'));
      };
      pixels.src = options.mediaUrl(source.assetPath!);
    });
    if (disposed || options.current() !== current) throw new Error('画布已切换，未准备参考图。');
    const card = Array.from(document.querySelectorAll<HTMLElement>('.card[data-id]')).find(
      (item) => item.dataset.id === source.id
    );
    const image = card?.querySelector<HTMLImageElement>('img');
    if (!card || !image || !pixels.naturalWidth) throw new Error('参考图片尚未加载，请稍后重试。');
    const cardBox = card.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    const scale = current.viewport.scale;
    const fit = Math.min(
      imageBox.width / pixels.naturalWidth,
      imageBox.height / pixels.naturalHeight
    );
    if (!Number.isFinite(fit) || fit <= 0 || scale <= 0)
      throw new Error('参考图片尚未显示，无法合成标注。');
    const box = {
      x:
        source.x +
        (imageBox.left - cardBox.left + (imageBox.width - pixels.naturalWidth * fit) / 2) / scale,
      y:
        source.y +
        (imageBox.top - cardBox.top + (imageBox.height - pixels.naturalHeight * fit) / 2) / scale,
      width: (pixels.naturalWidth * fit) / scale,
      height: (pixels.naturalHeight * fit) / scale,
    };
    // A standalone mark belongs to this reference only when wholly inside its image pixels.
    const marks = candidates.filter(
      (node) =>
        node.x >= box.x &&
        node.y >= box.y &&
        node.x + node.width <= box.x + box.width &&
        node.y + node.height <= box.y + box.height
    );
    if (!marks.length) return;
    const key = JSON.stringify([
      current.id,
      source.id,
      source.assetPath,
      source.assetVersion,
      box,
      marks.map((node) => [node.x, node.y, node.width, node.height, node.mark]),
    ]);
    const prior = cache.get(key);
    if (prior) return prior;
    const operation = (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = pixels.naturalWidth;
      canvas.height = pixels.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建标注参考图。');
      context.drawImage(pixels, 0, 0);
      const ratio = pixels.naturalWidth / box.width;
      for (const mark of marks)
        drawCanvasMark(
          context,
          mark,
          (mark.x - box.x) * ratio,
          (mark.y - box.y) * ratio,
          mark.width * ratio,
          mark.height * ratio
        );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('标注参考图合成失败。'))),
          'image/png'
        )
      );
      if (disposed) throw new Error('画布已关闭。');
      return { blob, url: URL.createObjectURL(blob) };
    })();
    cache.set(key, operation);
    // Bounded, discardable preview cache; uploaded paths remain in the submitted task.
    while (cache.size > 24) {
      const first = cache.keys().next().value as string;
      const value = cache.get(first)!;
      cache.delete(first);
      void value.then(
        (entry) => URL.revokeObjectURL(entry.url),
        () => {}
      );
    }
    try {
      return await operation;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  }
  return {
    async preview(source: CanvasNode) {
      return (await capture(source))?.url;
    },
    async prepare(sources: CanvasNode[], references: string[]): Promise<string[]> {
      const current = options.current();
      const result: string[] = [];
      for (const source of sources) {
        const entry = await capture(source);
        if (!current || disposed || options.current() !== current)
          throw new Error('画布已切换，未提交生成。');
        if (!entry) result.push(source.assetPath!);
        else {
          if (!entry.path) {
            entry.uploading ||= options
              .upload(entry.blob)
              .then((saved) => {
                entry.path = saved.relativePath;
                return saved.relativePath;
              })
              .finally(() => {
                entry.uploading = undefined;
              });
            await entry.uploading;
          }
          result.push(entry.path!);
        }
      }
      if (disposed || options.current() !== current) throw new Error('画布已切换，未提交生成。');
      return [...result, ...references];
    },
  };
}
