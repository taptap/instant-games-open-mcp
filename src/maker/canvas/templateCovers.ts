import type {
  CanvasTemplateStore,
  CanvasTemplateSummary,
  CanvasTemplateCoverAnimation,
} from './templates.js';

export function createTemplateCovers(store: CanvasTemplateStore) {
  let stopped = false;
  let active = 0;
  const abort = new AbortController();
  const urls = new Set<string>();
  const bitmaps = new Set<ImageBitmap>();
  const visible = new Set<Element>();
  const cleanup: Array<() => void> = [];
  const models = new Map<Element, (visible: boolean) => void>();
  let playing:
    | {
        container: HTMLElement;
        draw(index: number): void;
        animation: CanvasTemplateCoverAnimation;
        started: number;
      }
    | undefined;
  let request = 0;
  function stop(): void {
    cancelAnimationFrame(request);
    request = 0;
    playing?.draw(0);
    playing = undefined;
  }
  function tick(now: number): void {
    if (!playing || stopped || document.hidden || !visible.has(playing.container)) {
      stop();
      return;
    }
    playing.draw(
      Math.floor((Math.max(0, now - playing.started) * playing.animation.fps) / 1000) %
        playing.animation.frames.length
    );
    request = requestAnimationFrame(tick);
  }
  function visibilityChanged(): void {
    if (document.hidden) stop();
  }
  document.addEventListener('visibilitychange', visibilityChanged);
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
      models.get(entry.target)?.(entry.isIntersecting && !document.hidden);
      if (!entry.isIntersecting) {
        visible.delete(entry.target);
        if (playing?.container === entry.target) stop();
        continue;
      }
      visible.add(entry.target);
      const job = waiting.get(entry.target);
      if (job) queue.push(job);
      waiting.delete(entry.target);
    }
    pump();
  });
  async function load(
    summary: Pick<CanvasTemplateSummary, 'id' | 'revision'>,
    slot = 0
  ): Promise<{ blob: Blob; animation?: CanvasTemplateCoverAnimation }> {
    const result = await store.getCover(summary.id, summary.revision, abort.signal, slot);
    if (!result.source) return result;
    const bitmap = await createImageBitmap(result.blob);
    let thumbnail: Blob;
    let animation = result.animation;
    try {
      const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      if (animation) {
        canvas.width = Math.min(8, animation.frames.length) * 128;
        canvas.height = Math.ceil(animation.frames.length / 8) * 128;
        const context = canvas.getContext('2d')!;
        const frames = animation.frames.map((frame, index) => {
          const target = {
            x: (index % 8) * 128,
            y: Math.floor(index / 8) * 128,
            width: 128,
            height: 128,
          };
          const ratio = Math.min(128 / frame.width, 128 / frame.height);
          const width = frame.width * ratio;
          const height = frame.height * ratio;
          context.drawImage(
            bitmap,
            frame.x,
            frame.y,
            frame.width,
            frame.height,
            target.x + (128 - width) / 2,
            target.y + (128 - height) / 2,
            width,
            height
          );
          return target;
        });
        animation = { ...animation, frames };
      } else {
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      }
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
        .saveCover(summary.id, summary.revision, thumbnail, abort.signal, slot)
        .catch(() => undefined);
    return { blob: thumbnail, animation };
  }
  return {
    observeModel(container: HTMLElement, summary: CanvasTemplateSummary) {
      const url = store.modelPreviewUrl?.(summary.id, summary.revision);
      if (!url) {
        container.textContent = '模型预览暂不可用';
        return;
      }
      let frame: HTMLIFrameElement | undefined;
      const show = (visible: boolean) => {
        if (!visible || stopped) {
          frame?.remove();
          frame = undefined;
          container.textContent = '模型结果预览';
        } else if (!frame) {
          frame = document.createElement('iframe');
          frame.title = summary.name + '真实模型预览';
          frame.src = url;
          const hint = document.createElement('span');
          hint.className = 'template-animation-hint';
          hint.textContent = '拖拽旋转';
          container.replaceChildren(frame, hint);
        }
      };
      const visibility = () => show(!document.hidden && visible.has(container));
      document.addEventListener('visibilitychange', visibility);
      cleanup.push(() => {
        document.removeEventListener('visibilitychange', visibility);
        show(false);
      });
      models.set(container, show);
      container.classList.add('cover-model');
      observer.observe(container);
    },
    observe(container: HTMLElement, summary: CanvasTemplateSummary, slot = 0, target = container) {
      if (!summary.hasCover) return;
      container.classList.add('cover-loading');
      waiting.set(container, async () => {
        try {
          const { blob, animation } = await load(summary, slot);
          if (stopped || !container.isConnected) return;
          if (animation) {
            const bitmap = await createImageBitmap(blob);
            if (stopped || !container.isConnected) {
              bitmap.close();
              return;
            }
            bitmaps.add(bitmap);
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            canvas.tabIndex = 0;
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', summary.name + '动画结果预览，悬停或聚焦播放');
            canvas.title = '悬停卡片播放动画';
            const context = canvas.getContext('2d')!;
            let current = -1;
            const draw = (index: number): void => {
              if (current === index) return;
              current = index;
              const frame = animation!.frames[index];
              context.clearRect(0, 0, 128, 128);
              context.drawImage(
                bitmap,
                frame.x,
                frame.y,
                frame.width,
                frame.height,
                0,
                0,
                128,
                128
              );
            };
            const play = (): void => {
              if (
                stopped ||
                document.hidden ||
                !visible.has(container) ||
                matchMedia('(prefers-reduced-motion: reduce)').matches
              )
                return;
              if (playing?.container === container) return;
              stop();
              playing = { container, draw, animation: animation!, started: performance.now() };
              request = requestAnimationFrame(tick);
            };
            const pause = (): void => {
              if (playing?.container === container) stop();
            };
            const update = () => {
              if (target.matches(':hover') || target.contains(document.activeElement)) play();
              else pause();
            };
            const blur = (event: FocusEvent) => {
              if (!target.matches(':hover') && !target.contains(event.relatedTarget as Node | null))
                pause();
            };
            target.addEventListener('mouseenter', update);
            target.addEventListener('mouseleave', update);
            target.addEventListener('focusin', play);
            target.addEventListener('focusout', blur);
            cleanup.push(() => {
              target.removeEventListener('mouseenter', update);
              target.removeEventListener('mouseleave', update);
              target.removeEventListener('focusin', play);
              target.removeEventListener('focusout', blur);
            });
            container.classList.add('cover-animation');
            container.classList.remove('cover-loading');
            const hint = document.createElement('span');
            hint.className = 'template-animation-hint';
            hint.textContent = '悬停卡片播放';
            container.replaceChildren(canvas, hint);
            draw(0);
            update();
            return;
          }
          const url = URL.createObjectURL(blob);
          urls.add(url);
          const image = document.createElement('img');
          image.alt = summary.name + '静态预览';
          image.decoding = 'async';
          image.onload = () => container.classList.remove('cover-loading');
          image.onerror = () => {
            container.textContent = '预览暂不可用';
            container.classList.remove('cover-loading');
          };
          image.src = url;
          container.replaceChildren(image);
        } catch {
          container.classList.remove('cover-loading');
          container.textContent = '预览暂不可用';
        }
      });
      observer.observe(container);
    },
    warm: load,
    dispose() {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', visibilityChanged);
      observer.disconnect();
      abort.abort();
      waiting.clear();
      queue.length = 0;
      visible.clear();
      cleanup.splice(0).forEach((dispose) => dispose());
      models.clear();
      for (const bitmap of bitmaps) bitmap.close();
      bitmaps.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
