import type { CanvasDocument, CanvasNode } from './model.js';

export function appendAnimation(
  document: CanvasDocument,
  sourceId: string,
  nodeId: string,
  edgeId: string
): CanvasNode | undefined {
  const source = document.nodes.find((node) => node.id === sourceId && node.type === 'sequence');
  if (!source?.assetPath || !source.frameSetInfo) return;
  const node: CanvasNode = {
    id: nodeId,
    type: 'animation',
    title: '序列帧动画',
    x: source.x + source.width + 64,
    y: source.y,
    width: 280,
    height: 300,
    assetPath: source.assetPath,
    frameSetInfo: {
      ...source.frameSetInfo,
      frames: source.frameSetInfo.frames.map((frame) => ({ ...frame })),
    },
  };
  document.nodes.push(node);
  document.edges.push({ id: edgeId, from: source.id, to: node.id, kind: 'sequence-animation' });
  return node;
}

export function createAnimationCards(mediaUrl: (path: string) => string) {
  const playing = new Set<string>();
  const mounted = new Map<
    string,
    { draw: (index: number) => void; fps: number; count: number; started: number }
  >();
  let request = 0;
  let generation = 0;
  function tick(now: number) {
    request = 0;
    if (!document.hidden) {
      for (const id of playing) {
        const item = mounted.get(id);
        if (item) item.draw(Math.floor(((now - item.started) * item.fps) / 1000) % item.count);
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
    },
    render(card: HTMLElement, node: CanvasNode) {
      const info = node.frameSetInfo;
      if (!info || !node.assetPath || !info.frames.length) return;
      const version = generation;
      const canvas = document.createElement('canvas');
      canvas.className = 'animation-preview checkerboard';
      canvas.width = 320;
      canvas.height = 240;
      const label = document.createElement('span');
      label.className = 'animation-caption';
      const controls = document.createElement('div');
      controls.className = 'animation-controls';
      const play = document.createElement('button');
      play.type = 'button';
      play.textContent = playing.has(node.id) ? '暂停' : '播放动画';
      play.disabled = true;
      controls.append(play, label);
      card.append(canvas, controls);
      const atlas = new Image();
      let current = -1;
      const draw = (index: number) => {
        if (current === index) return;
        current = index;
        const frame = info.frames[index];
        const context = canvas.getContext('2d')!;
        const scale = Math.min(canvas.width / frame.width, canvas.height / frame.height);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          atlas,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          (canvas.width - frame.width * scale) / 2,
          (canvas.height - frame.height * scale) / 2,
          frame.width * scale,
          frame.height * scale
        );
        label.textContent = index + 1 + ' / ' + info.frames.length + ' · ' + info.fps + ' FPS';
        canvas.dataset.frameIndex = String(index);
      };
      atlas.onload = () => {
        if (version !== generation || !card.isConnected) return;
        play.disabled = info.frames.length < 2;
        draw(0);
        mounted.set(node.id, {
          draw,
          fps: info.fps,
          count: info.frames.length,
          started: performance.now(),
        });
        if (playing.has(node.id)) start();
      };
      atlas.onerror = () => {
        if (version === generation) label.textContent = '图集读取失败，请检查素材。';
      };
      atlas.src = mediaUrl(node.assetPath);
      play.addEventListener('click', (event) => {
        event.stopPropagation();
        if (playing.has(node.id)) {
          playing.delete(node.id);
          play.textContent = '播放动画';
        } else {
          playing.add(node.id);
          play.textContent = '暂停';
          const item = mounted.get(node.id);
          if (item) item.started = performance.now();
          start();
        }
      });
    },
  };
}
