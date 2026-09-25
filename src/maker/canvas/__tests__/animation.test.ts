import { appendAnimation } from '../animation.js';
import { createId, emptyDocument } from '../model.js';
import { MakerCanvasFiles } from '../files.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('animation output cards', () => {
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
    expect(appendAnimation(document, 'missing', createId(), createId())).toBeUndefined();
  });

  test('persists standalone animation snapshots and rejects invalid references', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-animation-'));
    try {
      const files = new MakerCanvasFiles(root);
      const document = await files.create();
      const image = document.nodes[0];
      const node = {
        ...image,
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
