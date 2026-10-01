import type { CanvasTemplateStore, CanvasTemplateSummary } from './templates.js';

export function createTemplateCovers(store: CanvasTemplateStore) {
  let stopped = false;
  let active = 0;
  const abort = new AbortController();
  const urls = new Set<string>();
  const waiting = new Map<Element, () => Promise<void>>();
  const queue: (() => Promise<void>)[] = [];
  function pump(): void {
    while (!stopped && active < 2 && queue.length) {
      active++;
      void queue.shift()!().finally(() => {
        active--;
        pump();
      });
    }
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const job = waiting.get(entry.target);
      if (job) queue.push(job);
      waiting.delete(entry.target);
      observer.unobserve(entry.target);
    }
    pump();
  });
  async function load(summary: Pick<CanvasTemplateSummary, 'id' | 'revision'>): Promise<Blob> {
    const result = await store.getCover(summary.id, summary.revision, abort.signal);
    if (!result.source) return result.blob;
    const bitmap = await createImageBitmap(result.blob);
    let thumbnail: Blob;
    try {
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      thumbnail = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('无法生成缩略图'))),
          'image/png'
        )
      );
    } finally {
      bitmap.close();
    }
    if (!stopped)
      await store
        .saveCover(summary.id, summary.revision, thumbnail, abort.signal)
        .catch(() => undefined);
    return thumbnail;
  }
  return {
    observe(container: HTMLElement, summary: CanvasTemplateSummary) {
      if (!summary.hasCover) return;
      container.classList.add('cover-loading');
      waiting.set(container, async () => {
        try {
          const blob = await load(summary);
          if (stopped || !container.isConnected) return;
          const url = URL.createObjectURL(blob);
          urls.add(url);
          const image = document.createElement('img');
          image.alt = summary.name + '首图缩略图';
          image.decoding = 'async';
          image.onload = () => container.classList.remove('cover-loading');
          image.onerror = () => {
            container.textContent = '暂无预览';
            container.classList.remove('cover-loading');
          };
          image.src = url;
          container.replaceChildren(image);
        } catch {
          container.classList.remove('cover-loading');
          container.textContent = '暂无预览';
        }
      });
      observer.observe(container);
    },
    warm: load,
    dispose() {
      stopped = true;
      observer.disconnect();
      abort.abort();
      waiting.clear();
      queue.length = 0;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
