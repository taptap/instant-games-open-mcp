import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { createId } from '../model.js';
import { recordGeneratedVideo } from '../generationResult.js';
import { removeNodes } from '../edit.js';

test('persists image-to-video provenance, rejects wrong sources, and retains output after source deletion', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-generation-result-'));
  try {
    const files = new MakerCanvasFiles(root);
    const document = await files.create();
    const image = document.nodes[0];
    image.generation = { prompt: 'warrior on green' };
    const bytes = Buffer.alloc(16);
    bytes.write('ftyp', 4);
    bytes.write('isom', 8);
    const imported = await files.importVideo(document.id, bytes, 'video/mp4');
    const video = {
      id: createId(),
      type: 'video-source' as const,
      x: 300,
      y: 0,
      width: 240,
      height: 300,
      title: 'attack',
      assetPath: imported.relativePath,
    };
    document.nodes.push(video);
    recordGeneratedVideo(
      document,
      image.id,
      video.id,
      { prompt: 'attack right', taskId: 'real-task' },
      createId()
    );
    const saved = await files.save(document.id, document, 0);
    const loaded = await new MakerCanvasFiles(root).load(document.id);
    expect(loaded.nodes.at(-1)?.generation).toEqual({
      prompt: 'attack right',
      taskId: 'real-task',
      sourceImageId: image.id,
    });
    expect(loaded.edges[0].kind).toBe('image-to-video');
    const wrong = structuredClone(saved);
    wrong.edges[0].from = document.nodes[1].id;
    await expect(files.save(document.id, wrong, saved.revision)).rejects.toThrow('来源图片');
    expect(() =>
      recordGeneratedVideo(saved, document.nodes[1].id, video.id, { prompt: 'other' }, createId())
    ).toThrow('不能改绑');
    const removed = removeNodes(saved, [image.id]);
    const next = await files.save(document.id, removed, saved.revision);
    expect(next.nodes.at(-1)?.assetPath).toBe(imported.relativePath);
    expect(next.edges).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
