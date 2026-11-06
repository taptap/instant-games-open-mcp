import type { CanvasNode } from '../contracts.js';
import { isCanvasNodeStale } from '../core/dependencies.js';
export function createAnimationCards(
  mediaUrl: (path: string) => string,
  onRefresh?: (animationId: string) => void
) {
  type Reused = {
    key: string;
    canvas: HTMLCanvasElement;
    atlas: HTMLImageElement;
    ready: boolean;
    failed: boolean;
    current: number;
    started: number;
    label?: HTMLElement;
    play?: HTMLButtonElement;
    card?: HTMLElement;
    version: number;
    visible: boolean;
  };
  const playing = new Set<string>();
  const mounted = new Map<
    string,
    {
      draw: (index: number) => void;
      fps: number;
      count: number;
      started: number;
      previewTick: number;
      /** Cumulative end times (ms) when frames carry their own duration. */
      ends?: number[];
    }
  >();
  // Kept inside the factory (not a page global) so the helper still works when injected via toString().
  const reused = new Map<string, Reused>();
  const observed = new Map<Element, string>();
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const id = observed.get(entry.target);
            const item = id && reused.get(id);
            if (item) item.visible = entry.isIntersecting;
          }
          schedule();
        });
  let request = 0;
  let generation = 0;
  // Host panel closed: stop the frame loop entirely (document.hidden stays false in an iframe the
  // host only hides with CSS).
  let paused = false;
  function active() {
    return [...playing].some((id) => reused.get(id)?.visible && (mounted.get(id)?.count || 0) > 1);
  }
  function schedule() {
    if (paused || document.hidden || !active()) {
      cancelAnimationFrame(request);
      request = 0;
    } else if (!request) request = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', schedule);
  function tick(now: number) {
    request = 0;
    if (paused) return;
    if (!document.hidden) {
      for (const id of playing) {
        const item = mounted.get(id);
        if (!item || !reused.get(id)?.visible || item.count < 2) continue;
        const elapsed = Math.max(0, now - item.started);
        // Card previews draw at most 12 times per second without slowing the source timeline.
        const previewTick = Math.floor((elapsed * 12) / 1000);
        if (item.previewTick === previewTick) continue;
        item.previewTick = previewTick;
        if (item.ends) {
          const at = elapsed % item.ends[item.ends.length - 1];
          let index = 0;
          while (index < item.ends.length - 1 && at >= item.ends[index]) index += 1;
          item.draw(index);
        } else item.draw(Math.floor((elapsed * item.fps) / 1000) % item.count);
      }
    }
    schedule();
  }
  return {
    setPaused(value: boolean) {
      paused = value;
      schedule();
    },
    beginRender(nodes: CanvasNode[]) {
      generation += 1;
      cancelAnimationFrame(request);
      request = 0;
      observer?.disconnect();
      observed.clear();
      mounted.clear();
      for (const id of playing)
        if (!nodes.some((node) => node.id === id && node.type === 'animation')) playing.delete(id);
      for (const id of [...reused.keys()])
        if (!nodes.some((node) => node.id === id && node.type === 'animation')) reused.delete(id);
    },
    render(card: HTMLElement, node: CanvasNode, source?: CanvasNode) {
      const info = node.frameSetInfo;
      if (!info || !node.assetPath || !info.frames.length) return;
      const url = mediaUrl(node.assetPath);
      const key = [
        url,
        info.fps,
        info.frames
          .map((frame) =>
            [
              frame.x,
              frame.y,
              frame.width,
              frame.height,
              frame.sourceWidth,
              frame.sourceHeight,
              frame.offsetX,
              frame.offsetY,
              frame.duration,
            ].join(',')
          )
          .join(';'),
      ].join('|');
      let entry = reused.get(node.id);
      // Playback preference is local to this opened canvas, never part of exported assets.
      if (!entry && info.frames.length > 1) playing.add(node.id);
      if (!entry || entry.key !== key || entry.failed) {
        const canvas = document.createElement('canvas');
        canvas.className = 'animation-preview checkerboard';
        canvas.width = 320;
        canvas.height = 240;
        entry = {
          key,
          canvas,
          atlas: new Image(),
          ready: false,
          failed: false,
          current: -1,
          started: performance.now(),
          version: generation,
          visible: !observer,
        };
        reused.set(node.id, entry);
      }
      const item = entry;
      item.version = generation;
      item.card = card;
      if (observer) {
        observed.set(card, node.id);
        observer.observe(card);
      }
      const canvas = item.canvas;
      const label = document.createElement('span');
      label.className = 'animation-caption';
      const controls = document.createElement('div');
      controls.className = 'animation-controls';
      const play = document.createElement('button');
      play.type = 'button';
      play.textContent = playing.has(node.id) ? '暂停' : '播放动画';
      play.disabled = true;
      item.label = label;
      item.play = play;
      controls.append(play, label);
      card.append(canvas, controls);
      if (source && isCanvasNodeStale(node, source)) {
        const stale = document.createElement('small');
        stale.className = 'generation-status generation-status-stale';
        stale.textContent = '序列帧已变化，动画仍保留当前版本';
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.textContent = '刷新动画';
        refresh.className = 'generation-action generation-action-primary';
        refresh.addEventListener('click', (event) => {
          event.stopPropagation();
          onRefresh?.(node.id);
        });
        controls.append(stale, refresh);
      }
      const caption = (index: number) => {
        if (item.label)
          item.label.textContent =
            index +
            1 +
            ' / ' +
            info.frames.length +
            ' · ' +
            info.fps +
            ' FPS' +
            (info.pages && info.pages > 1 ? ' · 共 ' + info.pages + ' 页，仅预览第 1 页' : '');
      };
      const draw = (index: number) => {
        if (item.current === index) return;
        item.current = index;
        const frame = info.frames[index];
        const context = canvas.getContext('2d')!;
        // Trimmed frames sit at their offset inside the untrimmed source box, so the sprite keeps
        // its place across frames instead of each crop being centred on its own.
        const boxWidth = frame.sourceWidth || frame.width;
        const boxHeight = frame.sourceHeight || frame.height;
        const scale = Math.min(canvas.width / boxWidth, canvas.height / boxHeight);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          item.atlas,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          (canvas.width - boxWidth * scale) / 2 + (frame.offsetX || 0) * scale,
          (canvas.height - boxHeight * scale) / 2 + (frame.offsetY || 0) * scale,
          frame.width * scale,
          frame.height * scale
        );
        caption(index);
        canvas.dataset.frameIndex = String(index);
      };
      const mount = () => {
        if (item.play) item.play.disabled = info.frames.length < 2;
        // Arrival animations often begin transparent; keep a settled poster before playback.
        if (item.current < 0) draw(info.frames.length - 1);
        else caption(item.current);
        let total = 0;
        const ends = info.frames.some((frame) => frame.duration)
          ? info.frames.map((frame) => (total += frame.duration || 1000 / info.fps))
          : undefined;
        const timing = {
          draw,
          fps: info.fps,
          count: info.frames.length,
          started: item.started,
          previewTick: -1,
          ends,
        };
        mounted.set(node.id, timing);
        schedule();
      };
      if (item.ready) mount();
      else if (item.failed) label.textContent = '图集读取失败，请检查素材。';
      else if (!item.atlas.onload) {
        item.atlas.onload = () => {
          item.ready = true;
          if (item.version !== generation || !item.card?.isConnected) return;
          mount();
        };
        item.atlas.onerror = () => {
          item.failed = true;
          if (item.version === generation && item.label)
            item.label.textContent = '图集读取失败，请检查素材。';
        };
        item.atlas.src = url;
      }
      play.addEventListener('click', (event) => {
        event.stopPropagation();
        if (playing.has(node.id)) {
          playing.delete(node.id);
          play.textContent = '播放动画';
        } else {
          playing.add(node.id);
          play.textContent = '暂停';
          item.started = performance.now();
          const timing = mounted.get(node.id);
          if (timing) {
            timing.started = item.started;
            timing.previewTick = -1;
          }
        }
        schedule();
      });
    },
  };
}
