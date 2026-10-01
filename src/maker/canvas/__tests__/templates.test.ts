import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createId, emptyDocument, type CanvasDocument } from '../model.js';
import { createCanvasTemplateModel } from '../templates.js';
import { MakerCanvasFiles } from '../files.js';
import {
  snapshotCanvasSource,
  isCanvasNodeStale,
  invalidateCanvasDependents,
} from '../dependencies.js';
import { createTemplateWorkflow } from '../templateWorkflow.js';
import { defaultSequenceSettings } from '../sequence.js';
import { imageEditSources } from '../generationUi.js';

const model = createCanvasTemplateModel();

function fixture(): CanvasDocument {
  const document = emptyDocument('游戏角色工作流');
  const imageId = createId();
  const videoId = createId();
  const sequenceId = createId();
  const animationId = createId();
  const assetPath = 'assets/image/canvas-' + createId() + '.png';
  const frameSetInfo = {
    fps: 8,
    frameCount: 1,
    width: 64,
    height: 64,
    columns: 1,
    rows: 1,
    frames: [{ index: 0, time: 0, x: 0, y: 0, width: 64, height: 64 }],
  };
  const common = { x: 0, y: 80, width: 320, height: 320, title: '示例' };
  document.nodes = [
    {
      ...common,
      id: imageId,
      type: 'image',
      assetPath,
      generation: { prompt: '游戏剑士', attemptId: createId() },
    },
    {
      ...common,
      x: 400,
      id: videoId,
      type: 'video-source',
      assetPath: '.maker/canvases/' + document.id + '/videos/video-' + createId() + '.mp4',
      generation: {
        prompt: '原地挥剑',
        sourceImageId: imageId,
        taskId: 'old-task',
        attemptId: createId(),
      },
    },
    {
      ...common,
      x: 800,
      id: sequenceId,
      type: 'sequence',
      assetPath,
      sourceVideoId: videoId,
      sequenceSettings: defaultSequenceSettings(4, 64, 64),
      frameSetInfo,
    },
    { ...common, x: 1200, id: animationId, type: 'animation', assetPath, frameSetInfo },
  ];
  document.nodes[1].sourceSnapshot = snapshotCanvasSource(document.nodes[0]);
  document.nodes[2].sourceSnapshot = snapshotCanvasSource(document.nodes[1]);
  document.edges = [
    { id: createId(), from: imageId, to: videoId, kind: 'image-to-video' },
    { id: createId(), from: videoId, to: sequenceId, kind: 'sequence-source' },
    { id: createId(), from: sequenceId, to: animationId, kind: 'sequence-animation' },
  ];
  return document;
}

test('snapshots and instantiates independent groups without task identity or external references', () => {
  const document = fixture();
  const original = JSON.stringify(document);
  const template = model.snapshot(
    document,
    document.nodes.map((node) => node.id),
    '挥剑'
  );
  const first = model.instantiate(template, { x: 50, y: 50 });
  const second = model.instantiate(template, { x: 1800, y: 50 });
  expect(JSON.stringify(document)).toBe(original);
  expect(first.nodes.every((node) => !second.nodes.some((other) => other.id === node.id))).toBe(
    true
  );
  expect(first.nodes[2].generation).not.toHaveProperty('attemptId');
  expect(first.nodes[2].generation).not.toHaveProperty('taskId');
  expect(first.nodes[2].generation?.sourceImageId).toBe(first.nodes[1].id);
  expect(first.nodes[3].sourceVideoId).toBe(first.nodes[2].id);
  expect(first.nodes[3].sourceSnapshot?.nodeId).toBe(first.nodes[2].id);
  expect(isCanvasNodeStale(first.nodes[3], first.nodes[2])).toBe(false);
  expect(first.nodes.slice(2).every((node) => node.templatePending)).toBe(true);
  expect(first.nodes[1].templatePending).toBeUndefined();
  expect(first.nodes.slice(1).every((node) => node.sectionId === first.section.id)).toBe(true);
  first.nodes[4].frameSetInfo!.frames[0].width = 10;
  expect(second.nodes[4].frameSetInfo!.frames[0].width).toBe(64);
});

test('does not launder a stale source version or silently retain required outside dependencies', () => {
  const document = fixture();
  document.nodes[2].sourceSnapshot!.version = 'stale';
  const template = model.snapshot(
    document,
    document.nodes.map((node) => node.id),
    '挥剑'
  );
  expect(template.nodes[2].sourceSnapshot!.version).toBe('stale');
  expect(() =>
    model.snapshot(document, [document.nodes[2].id, document.nodes[3].id], '不完整')
  ).toThrow('视频');
});

test('in-place intermediate image editing references both the parent and current image', () => {
  const document = fixture();
  const parent = document.nodes[0];
  const target = {
    ...parent,
    id: createId(),
    assetPath: 'assets/image/target.png',
    generation: { prompt: '新护甲', sourceImageIds: [parent.id], operation: 'variant' as const },
  };
  document.nodes.push(target);
  document.edges.push({ id: createId(), kind: 'image-variant', from: parent.id, to: target.id });
  const sources = imageEditSources(document, target, target.id);
  expect(sources.map((node) => node.id)).toEqual([parent.id, target.id]);
  expect(sources.filter((node) => node.id !== target.id).map((node) => node.id)).toEqual([
    parent.id,
  ]);
  expect(imageEditSources(document, target).map((node) => node.id)).toEqual([target.id]);
});

test('dragging a card into and out of a group updates membership without disturbing group moves', () => {
  const document = fixture();
  const group = model.group(document.nodes, '模板');
  document.nodes.push(group);
  model.updateMembership(document, [document.nodes[0].id]);
  expect(document.nodes[0].sectionId).toBe(group.id);
  document.nodes[0].x = group.x - 1000;
  model.updateMembership(document, [document.nodes[0].id, group.id]);
  expect(document.nodes[0].sectionId).toBe(group.id);
  model.updateMembership(document, [document.nodes[0].id]);
  expect(document.nodes[0].sectionId).toBeUndefined();
});

test('file CRUD validates copies, conflicts, project isolation and keeps instance assets after deletion', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-user-template-'));
  try {
    const files = new MakerCanvasFiles(root);
    const document = fixture();
    document.nodes[1].generation!.parameters = {
      model: '2.0',
      duration: 6,
      resolution: '480p',
      ratio: '1:1',
    };
    document.nodes[0].generation!.referenceImagePaths = [document.nodes[0].assetPath!];
    for (const node of document.nodes) {
      const file = path.join(root, node.assetPath!);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from('example'));
    }
    invalidateCanvasDependents(document, document.nodes[0].id);
    expect(document.nodes.every((node) => node.templatePending === undefined)).toBe(true);
    const saved = await files.saveTemplate(
      model.snapshot(
        document,
        document.nodes.map((node) => node.id),
        '挥剑'
      )
    );
    expect(saved.revision).toBe(1);
    const copy = model.instantiate(saved, { x: 80, y: 80 });
    const canvas = await files.create('模板副本');
    const persisted = await files.save(
      canvas.id,
      { ...canvas, nodes: copy.nodes, edges: copy.edges },
      0
    );
    expect((await files.load(canvas.id)).nodes).toEqual(persisted.nodes);
    expect((await files.load(canvas.id)).nodes[2].generation?.parameters).toEqual({
      model: '2.0',
      duration: 6,
      resolution: '480p',
      ratio: '1:1',
    });
    expect((await files.load(canvas.id)).nodes[1].generation?.referenceImagePaths).toEqual([
      document.nodes[0].assetPath,
    ]);
    const changed = await files.saveTemplate({ ...saved, name: '跑步' });
    await expect(files.saveTemplate(saved)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(files.deleteTemplate(saved.id, 1)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await files.listTemplates()).find((template) => !template.builtin)?.name).toBe('跑步');
    expect((await files.load(canvas.id)).nodes[0].title).toBe('挥剑');
    await files.deleteTemplate(changed.id, changed.revision);
    expect((await files.listTemplates()).filter((template) => !template.builtin)).toEqual([]);
    await expect(files.saveTemplate(changed)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await files.load(canvas.id)).nodes[2].assetPath).toBe(copy.nodes[2].assetPath);
    const outside = {
      ...saved,
      id: createId(),
      revision: 0,
      nodes: saved.nodes.map((node) => ({ ...node, assetPath: '/tmp/unsafe.png' })),
    };
    await expect(files.saveTemplate(outside)).rejects.toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a symbolic linked template directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-user-template-link-'));
  try {
    fs.mkdirSync(path.join(root, '.maker', 'canvases'), { recursive: true });
    fs.mkdirSync(path.join(root, 'elsewhere'));
    fs.symlinkSync(
      path.join(root, 'elsewhere'),
      path.join(root, '.maker', 'canvases', 'templates')
    );
    await expect(new MakerCanvasFiles(root).listTemplates()).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('target reuse is scoped to the template instance and stops at completed or busy cards', async () => {
  const source = fixture();
  const template = model.snapshot(
    source,
    source.nodes.map((node) => node.id),
    '挥剑'
  );
  template.revision = 1;
  const first = model.instantiate(template, { x: 0, y: 0 });
  const second = model.instantiate(template, { x: 1800, y: 0 });
  const document = {
    ...emptyDocument(),
    nodes: [...first.nodes, ...second.nodes],
    edges: [...first.edges, ...second.edges],
  };
  const busy = new Set<string>();
  const flow = createTemplateWorkflow({
    getDocument: () => document,
    save: async () => true,
    changed() {},
    render() {},
    error() {},
    confirm: () => true,
    video: async () => true,
    sequence: async () => {},
    animation() {},
    select() {},
    importImage() {},
    isNodeBusy: (id) => busy.has(id),
  });
  expect(flow.resolveTarget(first.nodes[1].id, 'video')).toEqual({
    kind: 'reuse',
    nodeId: first.nodes[2].id,
  });
  expect(flow.resolveTarget(first.nodes[2].id, 'sequence')).toEqual({
    kind: 'reuse',
    nodeId: first.nodes[3].id,
  });
  busy.add(first.nodes[2].id);
  expect(flow.resolveTarget(first.nodes[1].id, 'video')?.kind).toBe('blocked');
  busy.clear();
  await flow.nodeChanged(first.nodes[2].id);
  expect(flow.resolveTarget(first.nodes[1].id, 'video')).toEqual({ kind: 'create' });
  expect(flow.resolveTarget(second.nodes[1].id, 'video')).toEqual({
    kind: 'reuse',
    nodeId: second.nodes[2].id,
  });
  const branch = { ...second.nodes[2], id: createId() };
  document.nodes.push(branch);
  document.edges.push({
    id: createId(),
    from: second.nodes[1].id,
    to: branch.id,
    kind: 'image-to-video',
  });
  expect(flow.resolveTarget(second.nodes[1].id, 'video')?.kind).toBe('blocked');
  expect(flow.resolveTarget(second.nodes[1].id, 'video', branch.id)).toEqual({
    kind: 'reuse',
    nodeId: branch.id,
  });
  busy.add(second.nodes[2].id);
  expect(flow.resolveTarget(second.nodes[1].id, 'video', branch.id)).toEqual({
    kind: 'reuse',
    nodeId: branch.id,
  });
});
