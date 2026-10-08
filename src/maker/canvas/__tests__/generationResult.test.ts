import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { createId } from '../model.js';
import { recordGeneratedVideo, renderGenerationResult } from '../generationResult.js';
import { removeNodes } from '../edit.js';

test('labels image provenance without claiming the reference is a locked first frame', () => {
  expect(renderGenerationResult.toString()).toContain('图生视频 · 来源图：');
  expect(renderGenerationResult.toString()).not.toContain('图生视频 · 首帧：');
});

test('persists video provenance independently of current references and retains output after source deletion', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-generation-result-'));
  try {
    const files = new MakerCanvasFiles(root);
    const document = await files.create();
    const asset = await files.importImage(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64'
      )
    );
    document.nodes.push(
      ...['first', 'other'].map((title, index) => ({
        id: createId(),
        type: 'image' as const,
        title,
        x: index * 300,
        y: 0,
        width: 240,
        height: 240,
        assetPath: asset.relativePath,
      }))
    );
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
      sourceImageIds: [image.id],
    });
    expect(loaded.edges[0].kind).toBe('image-to-video');
    const reconnected = structuredClone(saved);
    reconnected.edges[0].from = document.nodes[1].id;
    const updated = await files.save(document.id, reconnected, saved.revision);
    expect(updated.nodes.at(-1)?.generation?.sourceImageId).toBe(image.id);
    expect(updated.edges[0].from).toBe(document.nodes[1].id);
    expect(() =>
      recordGeneratedVideo(saved, document.nodes[1].id, video.id, { prompt: 'other' }, createId())
    ).toThrow('不能改绑');
    const removed = removeNodes(saved, [image.id]);
    const next = await files.save(document.id, removed, updated.revision);
    expect(next.nodes.at(-1)?.assetPath).toBe(imported.relativePath);
    expect(next.edges).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persists two video sources, rejects invalid and duplicate edges, and keeps output after tail deletion', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-video-sources-'));
  try {
    const files = new MakerCanvasFiles(root);
    const document = await files.create();
    const asset = await files.importImage(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64'
      )
    );
    const images = ['head', 'tail', 'unrelated'].map((title, index) => ({
      id: createId(),
      type: 'image' as const,
      title,
      x: index * 300,
      y: 0,
      width: 240,
      height: 240,
      assetPath: asset.relativePath,
    }));
    const bytes = Buffer.alloc(16);
    bytes.write('ftyp', 4);
    bytes.write('isom', 8);
    const videoAsset = await files.importVideo(document.id, bytes, 'video/mp4');
    const video = {
      id: createId(),
      type: 'video-source' as const,
      title: 'transform',
      x: 300,
      y: 300,
      width: 240,
      height: 240,
      assetPath: videoAsset.relativePath,
    };
    document.nodes.push(...images, video);
    recordGeneratedVideo(
      document,
      images[0].id,
      video.id,
      {
        prompt: 'transform',
        parameters: { mode: 'first_last_frame' },
        sourceImageIds: images.slice(0, 2).map((image) => image.id),
      },
      createId()
    );
    const saved = await files.save(document.id, document, document.revision);
    const loaded = await new MakerCanvasFiles(root).load(document.id);
    expect(loaded.edges.map((edge) => edge.from)).toEqual(
      images.slice(0, 2).map((image) => image.id)
    );
    expect(loaded.nodes.at(-1)?.sourceSnapshots?.map((snapshot) => snapshot.nodeId)).toEqual(
      images.slice(0, 2).map((image) => image.id)
    );
    expect(loaded.nodes.at(-1)?.generation?.parameters?.mode).toBe('first_last_frame');
    const invalid = structuredClone(saved);
    invalid.edges[1].from = createId();
    await expect(files.save(saved.id, invalid, saved.revision)).rejects.toThrow('图生视频引用');
    const duplicate = structuredClone(saved);
    duplicate.edges.push({ ...duplicate.edges[1], id: createId() });
    await expect(files.save(saved.id, duplicate, saved.revision)).rejects.toThrow('连线不能重复');
    const legacy = structuredClone(saved);
    legacy.edges = legacy.edges.slice(0, 1);
    const legacySaved = await files.save(saved.id, legacy, saved.revision);
    expect(legacySaved.nodes.at(-1)?.generation?.sourceImageIds).toHaveLength(2);
    const removed = removeNodes(loaded, [images[1].id]);
    const final = await files.save(saved.id, removed, legacySaved.revision);
    expect(final.edges).toHaveLength(1);
    expect(final.nodes.at(-1)?.assetPath).toBe(videoAsset.relativePath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
