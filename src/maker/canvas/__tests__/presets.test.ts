import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { createId } from '../model.js';
import { createCanvasTemplateModel } from '../templates.js';
import { isCanvasNodeStale } from '../dependencies.js';
import { canvasPresets } from '../presets.js';

let root: string;
let files: MakerCanvasFiles;
const model = createCanvasTemplateModel();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-presets-'));
  files = new MakerCanvasFiles(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('lists portable presets without importing assets or creating a canvas', async () => {
  const templates = await files.listTemplates();
  expect(templates.map((template) => template.name)).toEqual([
    '序列帧动画',
    '角色四方向',
    '首尾帧变身 · 灰狼→狼王',
  ]);
  expect(templates.every((template) => template.builtin && !('assets' in template))).toBe(true);
  expect(await files.list()).toEqual([]);
  expect(fs.existsSync(path.join(root, 'assets'))).toBe(false);
});

test.each([0, 1, 2])(
  'prepares, duplicates and persists preset %i with independent internal references',
  async (index) => {
    const listed = (await files.listTemplates())[index];
    const original = JSON.stringify(listed);
    const canvas = await files.create('预设验证');
    const prepared = await files.prepareTemplate(listed.id, canvas.id);
    expect(prepared.nodes).toHaveLength([4, 17, 5][index]);
    expect(prepared.edges).toHaveLength([3, 16, 4][index]);
    expect(prepared.nodes.filter((node) => node.type === 'video-source')).toHaveLength(
      index === 1 ? 4 : 1
    );
    if (index === 1) {
      for (const direction of ['前', '后', '左', '右'])
        expect(
          prepared.nodes.some(
            (node) => node.type === 'video-source' && node.title.includes(direction)
          )
        ).toBe(true);
    }
    for (const node of prepared.nodes) {
      if (node.assetPath)
        expect(fs.statSync(files.readMedia(node.assetPath).file).size).toBeGreaterThan(0);
      expect(node.generation?.attemptId).toBeUndefined();
      expect(node.generation?.taskId).toBeUndefined();
      if (node.sourceSnapshot) {
        const source = prepared.nodes.find(
          (candidate) => candidate.id === node.sourceSnapshot!.nodeId
        );
        expect(source).toBeDefined();
        expect(isCanvasNodeStale(node, source)).toBe(false);
      }
    }
    const first = model.instantiate(prepared, { x: 0, y: 0 });
    const second = model.instantiate(await files.prepareTemplate(listed.id, canvas.id), {
      x: 2000,
      y: 0,
    });
    expect(first.nodes.every((node) => !second.nodes.some((other) => other.id === node.id))).toBe(
      true
    );
    const saved = await files.save(
      canvas.id,
      {
        ...canvas,
        nodes: [...first.nodes, ...second.nodes],
        edges: [...first.edges, ...second.edges],
      },
      canvas.revision
    );
    expect((await files.load(canvas.id)).nodes).toEqual(saved.nodes);
    if (index === 1) {
      expect(saved.nodes.filter((node) => node.exportDirection)).toHaveLength(8);
      expect(new Set(saved.nodes.map((node) => node.exportDirection).filter(Boolean)).size).toBe(4);
    }
    expect(first.nodes.filter((node) => node.templatePending)).toHaveLength(index === 1 ? 16 : 3);
    if (index === 2) {
      const video = first.nodes.find((node) => node.type === 'video-source')!;
      const images = first.nodes.filter((node) => node.type === 'image');
      expect(video.generation?.parameters?.mode).toBe('first_last_frame');
      expect(video.generation?.sourceImageIds).toEqual(images.map((node) => node.id));
      expect(video.sourceSnapshots?.map((snapshot) => snapshot.nodeId)).toEqual(
        images.map((node) => node.id)
      );
      expect(
        first.edges
          .filter((edge) => edge.to === video.id)
          .map((edge) => edge.from)
          .sort()
      ).toEqual(images.map((node) => node.id).sort());
      expect(images.every((node) => !node.templatePending && node.generation?.prompt)).toBe(true);
      expect(isCanvasNodeStale(video, images)).toBe(false);
      const previousPath = images[1].assetPath;
      images[1].assetPath = 'assets/image/changed-tail.png';
      expect(isCanvasNodeStale(video, images)).toBe(true);
      images[1].assetPath = previousPath;
      await expect(files.deleteTemplate(listed.id, listed.revision)).rejects.toMatchObject({
        code: 'READ_ONLY_TEMPLATE',
      });
      await expect(files.saveTemplate({ ...prepared, name: '覆盖预设' })).rejects.toMatchObject({
        code: 'READ_ONLY_TEMPLATE',
      });
    }
    const custom = await files.saveTemplate(
      model.snapshot(saved, [first.section.id], '我的预设副本')
    );
    expect(custom.id).not.toBe(listed.id);
    expect(custom.builtin).toBeUndefined();
    expect(JSON.stringify((await files.listTemplates())[index])).toBe(original);
  }
);

test('protects builtins and rejects invalid preparation before importing media', async () => {
  const builtin = (await files.listTemplates())[0];
  await expect(files.saveTemplate({ ...builtin, name: '覆盖' })).rejects.toMatchObject({
    code: 'READ_ONLY_TEMPLATE',
  });
  await expect(files.deleteTemplate(builtin.id, builtin.revision)).rejects.toMatchObject({
    code: 'READ_ONLY_TEMPLATE',
  });
  await expect(files.prepareTemplate(builtin.id, createId())).rejects.toThrow();
  const canvas = await files.create();
  await expect(files.prepareTemplate(createId(), canvas.id)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(fs.existsSync(path.join(root, 'assets'))).toBe(false);
});

test('four directions use distinct empty neutral references and keep old results explicitly pending', () => {
  const preset = canvasPresets()[1];
  const images = preset.nodes.filter((node) => node.type === 'image');
  const head = images.find((node) => node.assetPath)!;
  expect(images).toHaveLength(5);
  const references = images.filter((node) => node !== head);
  expect(new Set(references.map((node) => node.generationDraft?.prompt)).size).toBe(4);
  for (const reference of references) {
    expect(reference.assetPath).toBeUndefined();
    expect(reference.generationDraft?.prompt).toContain('calm neutral standing idle pose');
    expect(reference.generation).toBeUndefined();
    expect(reference.generationDraft).toMatchObject({
      operation: 'variant',
      sourceImageId: head.id,
    });
    expect(preset.edges).toContainEqual(
      expect.objectContaining({
        from: head.id,
        to: reference.id,
        kind: 'image-variant',
      })
    );
    const videos = preset.nodes.filter((node) => node.generation?.sourceImageId === reference.id);
    expect(videos).toHaveLength(1);
    expect(videos[0].generation?.parameters?.mode).toBe('first_frame');
    expect(videos[0].generation?.prompt).toContain(
      'same viewpoint and facing as the reference image'
    );
    expect(preset.edges).toContainEqual(
      expect.objectContaining({
        from: reference.id,
        to: videos[0].id,
        kind: 'image-to-video',
      })
    );
  }
  const instance = model.instantiate(preset, { x: 0, y: 0 });
  const instanceHead = instance.nodes.find((node) => node.type === 'image' && node.assetPath)!;
  for (const node of instance.nodes.filter(
    (node) => node.type !== 'section' && node !== instanceHead
  )) {
    expect(node.templatePending).toBe(true);
    if (node.type !== 'image') {
      expect(node.assetPath).toBeTruthy();
      expect(node.title).toContain('初始为旧示例');
    }
  }
  expect(preset.edges.some((edge) => edge.from === head.id && edge.kind === 'image-to-video')).toBe(
    false
  );
});

test('preparing prompt metadata never mutates future templates', () => {
  const first = canvasPresets();
  const before = JSON.stringify(first);
  first[1].nodes[0].title = 'changed';
  expect(JSON.stringify(canvasPresets())).toBe(before);
});

test('pending reference links still reject missing or mismatched draft sources', async () => {
  const canvas = await files.create();
  const preset = await files.prepareTemplate(canvasPresets()[1].id, canvas.id);
  const instance = model.instantiate(preset, { x: 0, y: 0 });
  const reference = instance.nodes.find((node) => node.generationDraft)!;
  const draft = reference.generationDraft!;
  delete reference.generationDraft;
  await expect(
    files.save(canvas.id, { ...canvas, ...instance }, canvas.revision)
  ).rejects.toMatchObject({ code: 'INVALID_EDGE' });
  reference.generationDraft = { ...draft, sourceImageId: createId() };
  await expect(
    files.save(canvas.id, { ...canvas, ...instance }, canvas.revision)
  ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  reference.generationDraft = { ...draft, operation: 'outpaint' };
  await expect(
    files.save(canvas.id, { ...canvas, ...instance }, canvas.revision)
  ).rejects.toMatchObject({ code: 'INVALID_EDGE' });
  reference.generationDraft = draft;
  const saved = await files.save(canvas.id, { ...canvas, ...instance }, canvas.revision);
  expect(saved.nodes.find((node) => node.id === reference.id)?.assetPath).toBeUndefined();
});
