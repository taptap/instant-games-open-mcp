import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyCanvasReferences, prepareCanvasReferences } from '../automationReferences.js';
import { MakerCanvasFiles } from '../files.js';
import { createId, type CanvasNode } from '../model.js';
import { createCanvasGenerationUi } from '../generationUi.js';
import { isCanvasNodeStale, snapshotCanvasSource, canvasReferences } from '../dependencies.js';
import { videoInputSources } from '../videoInputs.js';
import { createCanvasTemplateModel } from '../templates.js';
import { defaultSequenceSettings } from '../sequence.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function fixture(type: 'image' | 'video' | 'video-source' = 'image') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-references-')));
  roots.push(root);
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(path.join(root, '.gitignore'), '.maker');
  const files = new MakerCanvasFiles(root);
  let document = await files.create();
  const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
  const videoBytes = Buffer.alloc(16);
  videoBytes.write('ftyp', 4, 'ascii');
  videoBytes.write('isom', 8, 'ascii');
  async function image(title: string): Promise<CanvasNode> {
    return {
      id: createId(),
      type: 'image',
      title,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      assetPath: (await files.importImage(imageBytes)).relativePath,
    };
  }
  const old = await image('旧来源');
  const first = await image('首帧');
  const last = await image('尾帧');
  const target = await image('目标');
  target.type = type;
  if (type === 'video') delete target.assetPath;
  if (type === 'video-source')
    target.assetPath = (await files.importVideo(document.id, videoBytes, 'video/mp4')).relativePath;
  const parameters =
    type === 'image' ? { model: 'gpt' } : { mode: 'first_last_frame' as const, model: '2.0' };
  if (type === 'video') {
    target.generationDraft = { operation: 'generate', prompt: '挥剑', parameters };
  } else {
    target.generation = {
      prompt: '挥剑',
      operation: 'variant',
      attemptId: createId(),
      parameters,
      sourceImageId: old.id,
      sourceImageIds: [old.id],
      referenceImagePaths: [old.assetPath!],
    };
    target.sourceSnapshot = snapshotCanvasSource(old);
    target.sourceSnapshots = [snapshotCanvasSource(old)!];
  }
  document.nodes = [old, first, last, target];
  document.edges = [
    {
      id: createId(),
      from: old.id,
      to: target.id,
      kind:
        type === 'image' ? 'image-variant' : type === 'video' ? 'first-frame' : 'image-to-video',
    },
  ];
  document = await files.save(document.id, document, document.revision);
  const attempts: any[] = target.generation
    ? [
        {
          ...target.generation,
          id: target.generation.attemptId,
          canvasId: document.id,
          targetNodeId: target.id,
          kind: type === 'image' ? 'image' : 'video',
          status: 'succeeded',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ]
    : [];
  const makeAttempt = async (kind: 'image' | 'video', canvasId: string, input: any) => {
    const attempt = {
      ...input,
      id: createId(),
      canvasId,
      kind,
      status: 'succeeded',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetAssetPath:
        document.nodes.find((node) => node.id === input.targetNodeId)?.assetPath || '',
      resultAssetPath:
        kind === 'image'
          ? (await files.importImage(imageBytes)).relativePath
          : (await files.importVideo(document.id, videoBytes, 'video/mp4')).relativePath,
      sourceSnapshots: (input.sourceImageIds || []).map((id: string) =>
        snapshotCanvasSource(document.nodes.find((node) => node.id === id))
      ),
      parameters:
        kind === 'image' ? { model: input.model } : { model: input.model, mode: input.mode },
    };
    attempts.push(attempt);
    return attempt;
  };
  const options = {
    store: {
      listGeneration: jest.fn(async () => attempts),
      generateImage: jest.fn((canvasId: string, input: any) =>
        makeAttempt('image', canvasId, input)
      ),
      createVideo: jest.fn((canvasId: string, input: any) => makeAttempt('video', canvasId, input)),
      generationAction: jest.fn(),
      importImage: jest.fn(),
      mediaUrl: (value: string) => value,
    },
    getDocument: () => document,
    getSelected: () => new Set<string>(),
    remember: jest.fn(),
    markDirty: jest.fn(),
    render: jest.fn(),
    flush: async () => {
      const saved = await files.save(document.id, document, document.revision);
      document.revision = saved.revision;
      return true;
    },
    nextPlacement: () => ({ x: 0, y: 0 }),
    loadMedia: async () => {},
    requestImageImport: jest.fn(),
    requestVideoImport: jest.fn(),
    setError: jest.fn(),
    createId,
  };
  return {
    files,
    options,
    old,
    first,
    last,
    targetId: target.id,
    get document() {
      return document;
    },
    async reload() {
      document = await files.load(document.id);
      return document;
    },
  };
}

test.each([false, true])(
  'saved explicit image inputs drive generation after reload (self=%s)',
  async (includeSelf) => {
    const setup = await fixture();
    const { targetId, last, first, options } = setup;
    const before = structuredClone(setup.document.nodes.find((node) => node.id === targetId)!);
    applyCanvasReferences(
      setup.document,
      prepareCanvasReferences(setup.document, {
        id: targetId,
        sourceIds: [last.id, first.id],
        includeSelf,
      }),
      createId
    );
    await options.flush();
    await setup.reload();
    const target = setup.document.nodes.find((node) => node.id === targetId)!;
    expect(target.generation).toEqual({ ...before.generation, referenceImagePaths: [] });
    expect(target.sourceSnapshot).toEqual(before.sourceSnapshot);
    expect(target.assetPath).toBe(before.assetPath);
    const edgeIds = setup.document.edges.map((edge) => edge.id);
    const ui = createCanvasGenerationUi(options);
    await ui.restore();
    expect(await ui.runTemplateImage(targetId)).toBe(true);
    expect(options.setError).not.toHaveBeenCalled();
    expect(options.store.generateImage.mock.calls[0][1]).toMatchObject({
      targetNodeId: targetId,
      operation: 'variant',
      referenceImagePaths: [],
      sourceImageIds: [last.id, first.id, ...(includeSelf ? [targetId] : [])],
      sourceImagePaths: [
        last.assetPath,
        first.assetPath,
        ...(includeSelf ? [before.assetPath] : []),
      ],
    });
    await setup.reload();
    const result = setup.document.nodes.find((node) => node.id === targetId)!;
    expect(result.referenceInput).toEqual({ includeSelf });
    expect(setup.document.edges.map((edge) => edge.id)).toEqual(edgeIds);
    expect(result.sourceSnapshots?.map((snapshot) => snapshot.nodeId)).toEqual([last.id, first.id]);
    expect(isCanvasNodeStale(result, canvasReferences(setup.document, targetId))).toBe(false);
  }
);

test.each([false, true])(
  'clearing image inputs survives reload and submits text only (empty slot=%s)',
  async (emptySlot) => {
    const setup = await fixture();
    const { targetId, options } = setup;
    const target = setup.document.nodes.find((node) => node.id === targetId)!;
    if (emptySlot) {
      delete target.assetPath;
      delete target.generation;
      delete target.sourceSnapshot;
      target.generationDraft = {
        operation: 'variant',
        sourceImageId: setup.old.id,
        prompt: '猫咪',
      };
    }
    applyCanvasReferences(
      setup.document,
      prepareCanvasReferences(setup.document, { id: targetId, sourceIds: [] }),
      createId
    );
    await options.flush();
    await setup.reload();
    const ui = createCanvasGenerationUi(options);
    await ui.restore();
    expect(await ui.runTemplateImage(targetId)).toBe(true);
    expect(options.store.generateImage.mock.calls[0][1]).toMatchObject({
      operation: 'generate',
      referenceImagePaths: [],
    });
    expect(options.store.generateImage.mock.calls[0][1].sourceImageIds).toBeUndefined();
    expect(options.setError).not.toHaveBeenCalled();
    await setup.reload();
    expect(setup.document.edges).toEqual([]);
    const result = setup.document.nodes.find((node) => node.id === targetId)!;
    expect(result.sourceSnapshot).toBeUndefined();
    expect(result.sourceSnapshots).toEqual([]);
    expect(isCanvasNodeStale(result, [])).toBe(false);
    expect(setup.document.nodes.find((node) => node.id === targetId)?.referenceInput).toEqual({
      includeSelf: false,
    });
  }
);

test.each(['video', 'video-source'] as const)(
  'saved %s uses edge order and never historical image refs',
  async (type) => {
    const setup = await fixture(type);
    const { targetId, last, first, options } = setup;
    const previous = setup.document.nodes.find((node) => node.id === targetId)!;
    if (previous.generation) {
      previous.generation.sourceImageId = first.id;
      previous.generation.sourceImageIds = [first.id, last.id];
    }
    applyCanvasReferences(
      setup.document,
      prepareCanvasReferences(setup.document, { id: targetId, sourceIds: [last.id, first.id] }),
      createId
    );
    await options.flush();
    await setup.reload();
    const target = setup.document.nodes.find((node) => node.id === targetId)!;
    expect(videoInputSources(setup.document, target).map((source) => source.id)).toEqual([
      last.id,
      first.id,
    ]);
    const ui = createCanvasGenerationUi(options);
    await ui.restore();
    expect(await ui.runTemplateVideo(targetId, 4, true, true)).toBe(true);
    expect(options.setError).not.toHaveBeenCalled();
    expect(options.store.createVideo.mock.calls[0][1]).toMatchObject({
      sourceImageIds: [last.id, first.id],
      sourceImagePaths: [last.assetPath, first.assetPath],
      referenceImagePaths: [],
      mode: 'first_last_frame',
    });
    await setup.reload();
    expect(setup.document.edges.map((edge) => edge.kind)).toEqual([
      'image-to-video',
      'image-to-video',
    ]);
    expect(setup.document.nodes.find((node) => node.id === targetId)?.referenceInput).toEqual({
      includeSelf: false,
    });
    applyCanvasReferences(
      setup.document,
      prepareCanvasReferences(setup.document, { id: targetId, sourceIds: [] }),
      createId
    );
    await options.flush();
    await setup.reload();
    await expect(
      createCanvasGenerationUi(options).runTemplateVideo(targetId, 4, true)
    ).rejects.toThrow('来源图片');
    expect(options.store.createVideo).toHaveBeenCalledTimes(1);
  }
);

test('newly saved manual reference images remain available after explicit CLI inputs and reload', async () => {
  const setup = await fixture();
  applyCanvasReferences(
    setup.document,
    prepareCanvasReferences(setup.document, {
      id: setup.targetId,
      sourceIds: [setup.last.id],
    }),
    createId
  );
  const target = setup.document.nodes.find((node) => node.id === setup.targetId)!;
  target.generation!.referenceImagePaths = [setup.first.assetPath!];
  await setup.options.flush();
  await setup.reload();
  const ui = createCanvasGenerationUi(setup.options);
  await ui.restore();
  expect(await ui.runTemplateImage(setup.targetId)).toBe(true);
  expect(setup.options.store.generateImage.mock.calls[0][1]).toMatchObject({
    referenceImagePaths: [setup.first.assetPath],
    sourceImageIds: [setup.last.id],
  });
});

test('file parsing limits explicit reference input and preserves legacy provenance checks', async () => {
  const setup = await fixture();
  const { files, targetId, first } = setup;
  const document = setup.document;
  const target = document.nodes.find((node) => node.id === targetId)!;
  document.edges[0].from = first.id;
  await expect(files.save(document.id, document, document.revision)).rejects.toThrow(
    '图片派生关系'
  );
  for (const referenceInput of [
    null,
    [],
    {},
    { includeSelf: 'false' },
    { includeSelf: false, sourceIds: [] },
  ]) {
    (target as any).referenceInput = referenceInput;
    await expect(files.save(document.id, document, document.revision)).rejects.toThrow(
      '显式参考输入'
    );
  }
  target.referenceInput = { includeSelf: false };
  await setup.options.flush();
  await setup.reload();
  const invalid = structuredClone(setup.document);
  invalid.nodes.find((node) => node.id === first.id)!.type = 'note';
  delete invalid.nodes.find((node) => node.id === first.id)!.assetPath;
  await expect(files.save(invalid.id, invalid, invalid.revision)).rejects.toThrow('图片派生关系');
  const missingAsset = structuredClone(setup.document);
  delete missingAsset.nodes.find((node) => node.id === first.id)!.assetPath;
  await expect(files.save(missingAsset.id, missingAsset, missingAsset.revision)).rejects.toThrow(
    '图片派生关系'
  );
  const unsupported = structuredClone(setup.document);
  unsupported.nodes.push({
    id: createId(),
    type: 'note',
    title: 'note',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    referenceInput: { includeSelf: false },
  });
  await expect(files.save(unsupported.id, unsupported, unsupported.revision)).rejects.toThrow(
    '显式参考输入'
  );
});

test('explicit refs survive template save and ID remapping without copying history relationships', async () => {
  const setup = await fixture();
  const { targetId, first, last } = setup;
  applyCanvasReferences(
    setup.document,
    prepareCanvasReferences(setup.document, {
      id: targetId,
      sourceIds: [last.id, first.id],
      includeSelf: true,
    }),
    createId
  );
  const model = createCanvasTemplateModel(createId);
  const template = await setup.files.saveTemplate(
    model.snapshot(setup.document, [targetId, first.id, last.id], '参考图模板')
  );
  const copy = model.instantiate(template, { x: 0, y: 0 });
  const copiedTarget = copy.nodes.find((node) => node.title === '目标')!;
  expect(copiedTarget.referenceInput).toEqual({ includeSelf: true });
  expect(copy.edges.map((edge) => copy.nodes.find((node) => node.id === edge.from)?.title)).toEqual(
    ['尾帧', '首帧']
  );
  expect(copy.edges.every((edge) => edge.to === copiedTarget.id)).toBe(true);
  copiedTarget.referenceInput!.includeSelf = false;
  expect(template.nodes.find((node) => node.id === targetId)?.referenceInput?.includeSelf).toBe(
    true
  );
});

test('legacy fixed template rejects changed video sources before mutation and still accepts unchanged sources', async () => {
  const setup = await fixture('video-source');
  const { document, old, targetId, options } = setup;
  const sequence: CanvasNode = {
    id: createId(),
    type: 'sequence',
    title: '序列帧',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    sourceVideoId: targetId,
    sequenceSettings: defaultSequenceSettings(),
  };
  document.nodes.push(sequence);
  document.edges.push({ id: createId(), from: targetId, to: sequence.id, kind: 'sequence-source' });
  document.templateFlow = {
    imageId: old.id,
    videoId: targetId,
    sequenceId: sequence.id,
    duration: 4,
    stage: 'video',
  };
  const before = JSON.stringify(document);
  for (const sourceIds of [[], [setup.first.id], [old.id, setup.first.id]]) {
    expect(() => prepareCanvasReferences(document, { id: targetId, sourceIds })).toThrow(
      '新模板副本'
    );
    expect(JSON.stringify(document)).toBe(before);
  }
  applyCanvasReferences(
    document,
    prepareCanvasReferences(document, { id: targetId, sourceIds: [old.id] }),
    createId
  );
  await options.flush();
  expect((await setup.reload()).templateFlow).toEqual(document.templateFlow);
  setup.document.edges = setup.document.edges.filter((edge) => edge.to !== targetId);
  await expect(options.flush()).rejects.toThrow('模板流程状态无效');
});
