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
  };
  const playing = new Set<string>();
  const mounted = new Map<
    string,
    { draw: (index: number) => void; fps: number; count: number; started: number }
  >();
  // Kept inside the factory (not a page global) so the helper still works when injected via toString().
  const reused = new Map<string, Reused>();
  let request = 0;
  let generation = 0;
  function tick(now: number) {
    request = 0;
    if (!document.hidden) {
      for (const id of playing) {
        const item = mounted.get(id);
        if (item)
          item.draw(Math.floor((Math.max(0, now - item.started) * item.fps) / 1000) % item.count);
      }
    }
    if ([...playing].some((id) => mounted.has(id))) request = requestAnimationFrame(tick);
  }
  function start() {
    if (!request) request = requestAnimationFrame(tick);
  }
  return {
    beginRender(nodes: CanvasNode[]) {
      generation += 1;
      cancelAnimationFrame(request);
      request = 0;
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
          .map((frame) => [frame.x, frame.y, frame.width, frame.height].join(','))
          .join(';'),
      ].join('|');
      let entry = reused.get(node.id);
      if (!entry || entry.key !== key) {
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
        };
        reused.set(node.id, entry);
      }
      const item = entry;
      item.version = generation;
      item.card = card;
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
            index + 1 + ' / ' + info.frames.length + ' · ' + info.fps + ' FPS';
      };
      const draw = (index: number) => {
        if (item.current === index) return;
        item.current = index;
        const frame = info.frames[index];
        const context = canvas.getContext('2d')!;
        const scale = Math.min(canvas.width / frame.width, canvas.height / frame.height);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          item.atlas,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          (canvas.width - frame.width * scale) / 2,
          (canvas.height - frame.height * scale) / 2,
          frame.width * scale,
          frame.height * scale
        );
        caption(index);
        canvas.dataset.frameIndex = String(index);
      };
      const mount = () => {
        if (item.play) item.play.disabled = info.frames.length < 2;
        if (item.current < 0) draw(0);
        else caption(item.current);
        const timing = {
          draw,
          fps: info.fps,
          count: info.frames.length,
          started: item.started,
        };
        mounted.set(node.id, timing);
        if (playing.has(node.id)) start();
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
          if (timing) timing.started = item.started;
          start();
        }
      });
    },
  };
}
