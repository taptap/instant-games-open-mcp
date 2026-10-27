import { appendAnimation, createAnimationCards, refreshAnimationFromSource } from '../animation.js';
import { createId, emptyDocument } from '../model.js';
import { MakerCanvasFiles } from '../files.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';

describe('animation output cards', () => {
  test('keeps the first frame valid when the animation timestamp predates playback or remount', () => {
    let now = 1000;
    let nextRequest = 0;
    const pending = new Map<number, (timestamp: number) => void>();
    const elements: Array<{
      tag: string;
      textContent: string;
      dataset: Record<string, string>;
      listeners: Map<string, (event: { stopPropagation: () => void }) => void>;
    }> = [];
    const drawing = { clearRect: jest.fn(), drawImage: jest.fn() };
    const factory = new Script('(' + createAnimationCards.toString() + ')').runInNewContext({
      document: {
        hidden: false,
        createElement: (tag: string) => {
          const element = {
            tag,
            textContent: '',
            dataset: {} as Record<string, string>,
            listeners: new Map<string, (event: { stopPropagation: () => void }) => void>(),
            append: jest.fn(),
            getContext: () => drawing,
            addEventListener(
              name: string,
              callback: (event: { stopPropagation: () => void }) => void
            ) {
              this.listeners.set(name, callback);
            },
          };
          elements.push(element);
          return element;
        },
      },
      Image: class {
        onload?: () => void;
        set src(_value: string) {
          this.onload?.();
        }
      },
      performance: { now: () => now },
      requestAnimationFrame: (callback: (timestamp: number) => void) => {
        pending.set(++nextRequest, callback);
        return nextRequest;
      },
      cancelAnimationFrame: (request: number) => pending.delete(request),
    });
    const controller: ReturnType<typeof createAnimationCards> = factory(() => '/atlas.png');
    const node = {
      id: createId(),
      type: 'animation' as const,
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      assetPath: 'assets/image/atlas.png',
      frameSetInfo: {
        fps: 4,
        frameCount: 2,
        width: 128,
        height: 64,
        columns: 2,
        rows: 1,
        frames: [0, 1].map((index) => ({
          index,
          time: index / 4,
          x: index * 64,
          y: 0,
          width: 64,
          height: 64,
        })),
      },
    };
    const card = { isConnected: true, append: jest.fn() } as unknown as HTMLElement;
    const frame = (timestamp: number) => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(timestamp);
    };
    controller.beginRender([node]);
    controller.render(card, node);
    elements.find((element) => element.tag === 'button')!.listeners.get('click')!({
      stopPropagation: jest.fn(),
    });
    expect(() => frame(now - 0.5)).not.toThrow();
    expect(elements.find((element) => element.tag === 'canvas')!.dataset.frameIndex).toBe('0');
    frame(now + 250);
    expect(elements.find((element) => element.tag === 'canvas')!.dataset.frameIndex).toBe('1');
    now = 2000;
    controller.beginRender([node]);
    controller.render(card, node);
    expect(() => frame(now - 0.5)).not.toThrow();
    expect(['0', '1']).toContain(
      elements.filter((element) => element.tag === 'canvas').at(-1)!.dataset.frameIndex
    );
    expect(pending.size).toBe(1);
  });
  test('reuses the painted canvas and decoded atlas across renders until the asset changes', () => {
    const elements: Array<{ tag: string; dataset: Record<string, string> }> = [];
    const drawing = { clearRect: jest.fn(), drawImage: jest.fn() };
    const loads: Array<() => void> = [];
    let images = 0;
    const factory = new Script('(' + createAnimationCards.toString() + ')').runInNewContext({
      document: {
        hidden: false,
        createElement: (tag: string) => {
          const element = {
            tag,
            textContent: '',
            dataset: {} as Record<string, string>,
            append: jest.fn(),
            getContext: () => drawing,
            addEventListener: jest.fn(),
          };
          elements.push(element);
          return element;
        },
      },
      Image: class {
        onload?: () => void;
        constructor() {
          images += 1;
        }
        set src(_value: string) {
          loads.push(() => this.onload?.());
        }
      },
      performance: { now: () => 0 },
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
    });
    const controller: ReturnType<typeof createAnimationCards> = factory(
      (assetPath: string) => '/' + assetPath
    );
    const node = {
      id: createId(),
      type: 'animation' as const,
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      assetPath: 'assets/image/atlas.png',
      frameSetInfo: {
        fps: 4,
        frameCount: 1,
        width: 64,
        height: 64,
        columns: 1,
        rows: 1,
        frames: [{ index: 0, time: 0, x: 0, y: 0, width: 64, height: 64 }],
      },
    };
    const cardAppends: unknown[][] = [];
    const render = () => {
      const card = {
        isConnected: true,
        append: (...children: unknown[]) => cardAppends.push(children),
      } as unknown as HTMLElement;
      controller.beginRender([node]);
      controller.render(card, node);
    };
    render();
    render();
    loads.splice(0).forEach((load) => load());
    const canvases = () => elements.filter((element) => element.tag === 'canvas');
    expect(canvases()).toHaveLength(1);
    expect(canvases()[0].dataset.frameIndex).toBe('0');
    render();
    expect(images).toBe(1);
    expect(canvases()).toHaveLength(1);
    expect(cardAppends.at(-1)![0]).toBe(canvases()[0]);
    expect(canvases()[0].dataset.frameIndex).toBe('0');
    expect(drawing.drawImage).toHaveBeenCalledTimes(1);
    node.assetPath = 'assets/image/atlas-2.png';
    render();
    expect(images).toBe(2);
    expect(canvases()).toHaveLength(2);
  });

  test('copies a saved result without linking its mutable frame metadata', () => {
    const document = emptyDocument();
    const source = {
      id: createId(),
      type: 'sequence' as const,
      title: 'source',
      x: 10,
      y: 20,
      width: 480,
      height: 300,
      assetPath: 'assets/image/atlas.png',
      frameSetInfo: {
        fps: 8,
        frameCount: 1,
        width: 64,
        height: 64,
        columns: 1,
        rows: 1,
        frames: [{ index: 0, time: 0, x: 0, y: 0, width: 64, height: 64 }],
      },
    };
    document.nodes.push(source);
    const animation = appendAnimation(document, source.id, createId(), createId())!;
    expect(animation.type).toBe('animation');
    expect(document.edges[0]).toMatchObject({
      from: source.id,
      to: animation.id,
      kind: 'sequence-animation',
    });
    source.frameSetInfo.frames[0].width = 32;
    source.assetPath = 'assets/image/changed.png';
    expect(animation.frameSetInfo?.frames[0].width).toBe(64);
    expect(animation.assetPath).toBe('assets/image/atlas.png');
    expect(animation.sourceSnapshot).toBeDefined();
    const originalId = animation.id;
    const edgeId = document.edges[0].id;
    const position = {
      x: animation.x,
      y: animation.y,
      width: animation.width,
      height: animation.height,
    };
    const reused = appendAnimation(document, source.id, createId(), createId(), animation.id)!;
    expect(reused.id).toBe(originalId);
    expect(reused).toMatchObject(position);
    expect(reused.assetPath).toBe(source.assetPath);
    expect(document.nodes).toHaveLength(2);
    expect(document.edges).toHaveLength(1);
    expect(document.edges[0].id).toBe(edgeId);
    expect(appendAnimation(document, source.id, createId(), createId(), 'missing')).toBeUndefined();
    expect(appendAnimation(document, 'missing', createId(), createId())).toBeUndefined();
  });

  test('refreshes an animation only from its linked saved sequence', () => {
    const document = emptyDocument();
    const source = {
      id: createId(),
      type: 'sequence' as const,
      title: 'source',
      x: 0,
      y: 0,
      width: 480,
      height: 300,
      assetPath: 'assets/image/atlas-1.png',
      frameSetInfo: {
        fps: 8,
        frameCount: 1,
        width: 64,
        height: 64,
        columns: 1,
        rows: 1,
        frames: [{ index: 0, time: 0, x: 0, y: 0, width: 64, height: 64 }],
      },
    };
    document.nodes.push(source);
    const animation = appendAnimation(document, source.id, createId(), createId())!;
    source.assetPath = 'assets/image/atlas-2.png';
    expect(refreshAnimationFromSource(document, animation.id)).toBe(true);
    expect(animation.assetPath).toBe(source.assetPath);
    expect(animation.sourceSnapshot?.nodeId).toBe(source.id);
  });

  test('persists standalone animation snapshots and rejects invalid references', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-animation-'));
    try {
      const files = new MakerCanvasFiles(root);
      const document = await files.create(undefined, 'starter');
      const image = document.nodes[0];
      const node = {
        ...image,
        imageInfo: undefined,
        id: createId(),
        type: 'animation' as const,
        frameSetInfo: {
          fps: 8,
          frameCount: 1,
          width: 64,
          height: 64,
          columns: 1,
          rows: 1,
          frames: [{ index: 0, time: 0, x: 0, y: 0, width: 64, height: 64 }],
        },
      };
      document.nodes.push(node);
      const saved = await files.save(document.id, document, 0);
      expect((await new MakerCanvasFiles(root).load(document.id)).nodes.at(-1)).toEqual(node);
      const invalid = JSON.parse(JSON.stringify(saved));
      delete invalid.nodes.at(-1).frameSetInfo;
      await expect(files.save(document.id, invalid, saved.revision)).rejects.toThrow('动画卡必须');
      const badEdge = {
        ...saved,
        edges: [{ id: createId(), from: image.id, to: node.id, kind: 'sequence-animation' }],
      };
      await expect(files.save(document.id, badEdge, saved.revision)).rejects.toThrow(
        '动画关系必须'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
