import { readDemoResource } from '../../demoResources.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { createId, emptyDocument } from '../model.js';
import { createCanvasTemplateModel, isBuiltinCanvasTemplate } from '../templates.js';
import { isCanvasNodeStale } from '../dependencies.js';
import { canvasNeedsProcessing, invalidateCanvasDependents } from '../templateWorkflow.js';
import { canvasPresets, builtinCanvasTemplates } from '../presets.js';
import { builtinPresetDescriptions } from '../presetDescriptions.js';

jest.setTimeout(30000);
const { PNG } = require('pngjs');

let root: string;
let files: MakerCanvasFiles;
const model = createCanvasTemplateModel();
const presetByNumber = (number: number) =>
  canvasPresets().find((preset) => preset.id.endsWith(String(number).padStart(3, '0')))!;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-presets-'));
  files = new MakerCanvasFiles(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('lists portable presets without importing assets or creating a canvas', async () => {
  const templates = await files.listTemplates();
  expect(templates.map((template) => template.name)).toEqual([
    '序列帧动画',
    '动态立绘 · 萌娘轻呼吸 Idle',
    '角色四方向',
    '首尾帧变身 · 灰狼→狼王',
    '角色模型 · 多视图确认',
    '道具生成 · 风格图→图集→游戏资产',
    '种植生长 · 作物→状态图集→游戏资产',
    'NPC批量生成 · 角色参考→职业图集→游戏资产',
    '二合图标生成 · 风格参考→升级图集→游戏资产',
    'UI风格裂变 · 同一界面→三种风格',
    '角色概念设计 · 角色参考→完整展示图',
    '游戏UI制作',
  ]);
  expect(templates.every((template) => template.builtin && !('assets' in template))).toBe(true);
  expect(await files.list()).toEqual([]);
  expect(fs.existsSync(path.join(root, 'assets'))).toBe(false);
});

test.each(['005', '006', '008', '009', '010', '011'])(
  'static template %s keeps examples visible but starts only downstream work',
  (suffix) => {
    const template = builtinCanvasTemplates().find((item) => item.id.endsWith(suffix))!;
    const original = structuredClone(template);
    const instance = model.instantiate(template, { x: 0, y: 0 });
    const document = { ...emptyDocument(), nodes: instance.nodes, edges: instance.edges };
    const reference = instance.nodes[1];
    const outputs = instance.nodes.slice(2);
    expect(reference.templatePending).toBeUndefined();
    expect(canvasNeedsProcessing(document, reference)).toBe(false);
    expect(outputs.every((node) => node.templatePending)).toBe(true);
    expect(outputs.every((node) => canvasNeedsProcessing(document, node))).toBe(true);
    expect(outputs.every((node) => node.assetPath || node.imageAssetsInfo?.items.length)).toBe(
      true
    );
    expect(instance.section.templateSkills).toBeUndefined();
    expect(template).toEqual(original);
    for (const node of outputs) delete node.templatePending;
    expect(document.nodes.every((node) => !canvasNeedsProcessing(document, node))).toBe(true);
    model.instantiate(template, { x: 1000, y: 0 });
    expect(outputs.every((node) => !node.templatePending)).toBe(true);
    if (suffix === '006') {
      expect(outputs[0].generation?.prompt).toContain('不能自行增减格数');
      expect(outputs[0].generation?.prompt).not.toContain('最终只画4列');
    }
  }
);

test.each([4, 5, 6, 7, 8])(
  'asset preset %i persists transparent generated examples with independent references',
  async (index) => {
    const preset = presetByNumber(index + 1);
    const canvas = await files.create('素材模板验证');
    const prepared = await files.prepareTemplate(preset.id, canvas.id);
    const instance = model.instantiate(prepared, { x: 0, y: 0 });
    const saved = await files.save(
      canvas.id,
      { ...canvas, nodes: instance.nodes, edges: instance.edges },
      canvas.revision
    );
    const source = saved.nodes.find((node) => node.type === 'image' && node.assetPath)!;
    const results = saved.nodes.filter((node) => node.type === 'image' && node.id !== source.id);
    expect(results).toHaveLength(1);
    expect(saved.nodes.filter((node) => node.type === 'note')).toHaveLength(0);
    expect(
      saved.nodes.every((node) => ['section', 'image-assets', 'image'].includes(node.type))
    ).toBe(true);
    expect(source.templatePending).toBeUndefined();
    expect(source.generation?.parameters).toMatchObject({ model: 'gpt', resolution: '2K' });
    const itemCount = index === 5 ? 5 : index === 7 ? 8 : index === 8 ? 15 : 12;
    expect(Object.keys(preset.assets)).toHaveLength(itemCount + 2);
    const collection = saved.nodes.find((node) => node.type === 'image-assets')!;
    expect(collection.imageAssetsInfo?.items).toHaveLength(itemCount);
    expect(collection.templatePending).toBe(true);
    expect(saved.edges).toContainEqual(
      expect.objectContaining({ kind: 'image-assets', from: results[0].id, to: collection.id })
    );
    for (const item of collection.imageAssetsInfo!.items)
      expect(fs.statSync(files.readMedia(item.assetPath).file).size).toBeGreaterThan(0);
    expect(fs.statSync(files.readMedia(source.assetPath!).file).size).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.assetPath).toBeDefined();
      expect(result.generationDraft).toBeUndefined();
      expect(result.generation?.attemptId).toBeUndefined();
      expect(result.generation?.taskId).toBeUndefined();
      expect(result.templatePending).toBe(true);
      expect(result.referenceInput).toEqual({ includeSelf: false });
      expect(result.generation?.referenceImagePaths).toEqual([]);
      expect(result.generation).toMatchObject({
        operation: 'generate',
        sourceImageId: source.id,
        parameters: { aspectRatio: index === 5 || index === 8 ? '16:9' : '4:3' },
      });
      expect(result.generation!.prompt!.length).toBeGreaterThan(20);
      expect(isCanvasNodeStale(result, [source])).toBe(false);
      expect(saved.edges).toContainEqual(
        expect.objectContaining({ kind: 'image-variant', from: source.id, to: result.id })
      );
    }
    const second = model.instantiate(prepared, { x: 1600, y: 0 });
    const otherSource = second.nodes.find((node) => node.type === 'image' && node.assetPath)!;
    expect(
      instance.nodes.every((node) => !second.nodes.some((other) => other.id === node.id))
    ).toBe(true);
    expect(
      second.nodes
        .filter((node) => node.generation?.sourceImageId)
        .every((node) => node.generation?.sourceImageId === otherSource.id)
    ).toBe(true);
    const combined = await files.save(
      canvas.id,
      {
        ...saved,
        nodes: [...saved.nodes, ...second.nodes],
        edges: [...saved.edges, ...second.edges],
      },
      saved.revision
    );
    expect((await files.load(canvas.id)).nodes).toEqual(combined.nodes);
    const custom = await files.saveTemplate(
      model.snapshot(combined, [instance.section.id], '素材副本')
    );
    expect(custom.builtin).toBeUndefined();
    await expect(files.saveTemplate({ ...prepared, name: '覆盖预设' })).rejects.toMatchObject({
      code: 'READ_ONLY_TEMPLATE',
    });
    await expect(files.deleteTemplate(preset.id, preset.revision)).rejects.toMatchObject({
      code: 'READ_ONLY_TEMPLATE',
    });
  }
);

test('full game scene retains its background; atlas and standalone items have real alpha and intact borders', async () => {
  const preset = presetByNumber(5);
  const canvas = await files.create('透明素材验证');
  const prepared = await files.prepareTemplate(preset.id, canvas.id);
  const images = prepared.nodes.filter((node) => node.type === 'image');
  expect(images).toHaveLength(2);
  const scene = PNG.sync.read(fs.readFileSync(files.readMedia(images[0].assetPath!).file));
  expect([scene.width, scene.height, scene.data[3]]).toEqual([2048, 1152, 255]);
  expect(images[0].generation?.prompt).toContain('核心玩法');
  expect(images[0].generation?.prompt).toContain('完整游戏画面');
  const collection = prepared.nodes.find((node) => node.type === 'image-assets')!;
  for (const assetPath of [
    images[1].assetPath!,
    ...collection.imageAssetsInfo!.items.map((item) => item.assetPath),
  ]) {
    const png = PNG.sync.read(fs.readFileSync(files.readMedia(assetPath).file));
    expect([png.width, png.height]).toEqual(
      assetPath === images[1].assetPath ? [2304, 1500] : [576, 500]
    );
    let transparent = 0;
    let opaque = 0;
    for (let offset = 3; offset < png.data.length; offset += 4) {
      if (png.data[offset] === 0) transparent++;
      if (png.data[offset] === 255) opaque++;
    }
    expect(transparent).toBeGreaterThan(png.width * png.height * 0.1);
    expect(opaque).toBeGreaterThan(png.width * png.height * 0.03);
    for (const pixel of [
      0,
      png.width - 1,
      png.width * (png.height - 1),
      png.width * png.height - 1,
    ])
      expect(png.data[pixel * 4 + 3]).toBe(0);
    if (png.width === 576) {
      for (let column = 0; column < png.width; column++) {
        expect(png.data[column * 4 + 3]).toBe(0);
        expect(png.data[((png.height - 1) * png.width + column) * 4 + 3]).toBe(0);
      }
      for (let row = 0; row < png.height; row++) {
        expect(png.data[row * png.width * 4 + 3]).toBe(0);
        expect(png.data[(row * png.width + png.width - 1) * 4 + 3]).toBe(0);
      }
    }
  }
  const cover = await files.readTemplateCover(preset.id, preset.revision);
  expect(['image/png', 'image/jpeg']).toContain(cover.type);
  expect(cover.bytes.length).toBeGreaterThan(0);
  expect(prepared.nodes.every((node) => !node.generationDraft)).toBe(true);
});

test('crop preset contains five aligned transparent stages whose pixels match the atlas', async () => {
  const preset = presetByNumber(6);
  const images = preset.nodes.filter((node) => node.type === 'image');
  const collection = preset.nodes.find((node) => node.type === 'image-assets')!;
  const info = collection.imageAssetsInfo!;
  expect(info.grid).toEqual({ columns: 5, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
  const decode = async (assetPath: string) =>
    PNG.sync.read(await readDemoResource(preset.assets[assetPath].resourceId));
  const reference = await decode(images[0].assetPath!);
  expect(reference.data[3]).toBe(0);
  const atlas = await decode(images[1].assetPath!);
  expect([atlas.width, atlas.height]).toEqual([2560, 800]);
  const bounds = await Promise.all(
    info.items.map(async (item, index) => {
      const png = await decode(item.assetPath);
      expect([png.width, png.height]).toEqual([512, 800]);
      let top = png.height;
      let bottom = -1;
      let mismatched = 0;
      let boundary = 0;
      for (let row = 0; row < png.height; row++) {
        for (let column = 0; column < png.width; column++) {
          const offset = (row * png.width + column) * 4;
          const original = (row * atlas.width + index * 512 + column) * 4;
          const alpha = png.data[offset + 3];
          if (alpha !== atlas.data[original + 3]) mismatched++;
          for (let channel = 0; channel < 3; channel++) {
            const difference = Math.abs(
              png.data[offset + channel] - atlas.data[original + channel]
            );
            if (alpha === 255 ? difference !== 0 : (difference * alpha) / 255 > 1) mismatched++;
          }
          if (row === 0 || row === png.height - 1 || column === 0 || column === png.width - 1)
            boundary += alpha;
          if (alpha) {
            top = Math.min(top, row);
            bottom = Math.max(bottom, row);
          }
        }
      }
      expect(mismatched).toBe(0);
      expect(boundary).toBe(0);
      expect(bottom).toBe(720);
      return { top, bottom };
    })
  );
  expect(bounds[0].top).toBeGreaterThan(bounds[1].top);
  expect(bounds[1].top).toBeGreaterThan(bounds[2].top);
  expect(bounds[2].top).toBeGreaterThan(bounds[3].top);
  const prompt = images[1].generation!.prompt!;
  for (const stage of ['播种', '幼苗', '开花', '结果', '枯萎']) expect(prompt).toContain(stage);
  expect(prompt).toContain('不能自行增减格数');
  expect(prompt).toContain('排列：5列×1行');
});

test('new game UI workflow keeps examples but starts every downstream step pending', async () => {
  const canvas = await files.create('新游戏UI流程');
  const preset = canvasPresets().find((item) => item.name === '游戏UI制作')!;
  const prepared = await files.prepareTemplate(preset.id, canvas.id);
  const before = JSON.stringify(prepared);
  const instance = model.instantiate(prepared, { x: 0, y: 0 });
  canvas.nodes = instance.nodes;
  canvas.edges = instance.edges;
  const source = canvas.nodes.find(
    (node) => node.type === 'image' && !canvas.edges.some((edge) => edge.to === node.id)
  )!;
  expect(source.assetPath).toBeTruthy();
  expect(source.uiRecognition).toBeUndefined();
  const design = canvas.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
  const clean = canvas.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
  expect(design.uiRecognition?.results).toEqual([]);
  expect(clean.uiRecognition?.results).toEqual([]);
  expect(canvasNeedsProcessing(canvas, source)).toBe(false);
  const atlases = canvas.nodes.filter((node) => node.uiAtlasGroup);
  expect(atlases).toHaveLength(6);
  for (const atlas of atlases)
    expect(canvas.edges).toContainEqual(
      expect.objectContaining({ from: clean.id, to: atlas.id, kind: 'image-variant' })
    );
  const downstream = canvas.nodes.filter((node) =>
    canvas.edges.some((edge) => edge.to === node.id)
  );
  expect(downstream).toHaveLength(17);
  for (const node of downstream) {
    expect(Boolean(node.templatePending)).toBe(node.type !== 'resource-bundle');
    expect(canvasNeedsProcessing(canvas, node)).toBe(true);
    if (node.type === 'image') expect(node.assetPath).toBeTruthy();
    if (node.type === 'image-assets') expect(node.imageAssetsInfo?.items.length).toBeGreaterThan(0);
  }
  expect(clean.templatePending).toBe(true);
  const saved = await files.save(canvas.id, canvas, canvas.revision);
  const reopened = await files.load(saved.id);
  expect(reopened.nodes.filter((node) => node.templatePending)).toHaveLength(
    downstream.filter((node) => node.type !== 'resource-bundle').length
  );
  expect(JSON.stringify(prepared)).toBe(before);
});

test.each([4, 5, 6])(
  'asset preset %i starts pending and preserves completed state until reference changes',
  async (index) => {
    const canvas = await files.create('完整素材模板');
    const prepared = await files.prepareTemplate(presetByNumber(index + 1).id, canvas.id);
    const instance = model.instantiate(prepared, { x: 0, y: 0 });
    canvas.nodes = instance.nodes;
    canvas.edges = instance.edges;
    expect(canvas.nodes.filter((node) => node.templatePending)).toHaveLength(2);
    for (const node of canvas.nodes) delete node.templatePending;
    const saved = await files.save(canvas.id, canvas, canvas.revision);
    expect((await files.load(saved.id)).nodes.every((node) => !node.templatePending)).toBe(true);
    const source = canvas.nodes.find(
      (node) => node.type === 'image' && !canvas.edges.some((edge) => edge.to === node.id)
    )!;
    invalidateCanvasDependents(canvas, source.id);
    expect(canvas.nodes.filter((node) => node.templatePending).map((node) => node.type)).toEqual([
      'image',
      'image-assets',
    ]);
  }
);

test('all presets have protected ids and descriptions without sharing mutable definitions', async () => {
  const presets = canvasPresets();
  expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
  const nodes = presets.flatMap((preset) => preset.nodes);
  expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
  expect(Object.keys(builtinPresetDescriptions)).toEqual(presets.map((preset) => preset.id));
  expect(presets.every((preset) => isBuiltinCanvasTemplate(preset.id))).toBe(true);
  expect(isBuiltinCanvasTemplate('__proto__')).toBe(false);
  expect(isBuiltinCanvasTemplate(createId())).toBe(false);
  expect(
    presets
      .slice(5)
      .every((preset) =>
        preset.nodes.every((node) => !node.generation?.taskId && !node.generation?.attemptId)
      )
  ).toBe(true);
  const before = JSON.stringify(presets.slice(5));
  presets[5].nodes[1].generation!.prompt = 'changed';
  Object.values(presets[5].assets)[0].resourceId = 'changed';
  expect(JSON.stringify(canvasPresets().slice(5))).toBe(before);
});

test.each([0, 1, 2])(
  'prepares, duplicates and persists preset %i with independent internal references',
  async (index) => {
    const listed = (await files.listTemplates()).find(
      (item) => item.id === presetByNumber(index + 1).id
    )!;
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
          .filter((edge) => ['frame-first', 'frame-last'].includes(edge.kind))
          .map((edge) => edge.from)
          .sort()
      ).toEqual(images.map((node) => node.id).sort());
      expect(video.videoInputMode).toBe('first_last_frame');
      expect(first.edges.filter((edge) => edge.to === video.id)).toHaveLength(2);
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
    expect(
      JSON.stringify((await files.listTemplates()).find((item) => item.id === listed.id))
    ).toBe(original);
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

test('four directions preserve distinct neutral examples and keep outputs explicitly pending', async () => {
  const preset = presetByNumber(2);
  const images = preset.nodes.filter((node) => node.type === 'image');
  const head = images.find((node) => node.assetPath)!;
  expect(images).toHaveLength(5);
  const references = images.filter((node) => node !== head);
  expect(new Set(references.map((node) => node.generation?.prompt)).size).toBe(4);
  for (const reference of references) {
    expect(reference.assetPath).toBeTruthy();
    expect(reference.generation?.prompt).toContain('calm neutral standing idle pose');
    expect(reference.sourceSnapshot?.nodeId).toBe(head.id);
    expect(reference.generation).toMatchObject({
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

test('preparing prompt metadata never mutates future templates', async () => {
  const first = canvasPresets();
  const before = JSON.stringify(first);
  first[1].nodes[0].title = 'changed';
  expect(JSON.stringify(canvasPresets())).toBe(before);
});

test('pending reference links still reject missing or mismatched draft sources', async () => {
  const canvas = await files.create();
  const preset = await files.prepareTemplate(presetByNumber(2).id, canvas.id);
  const instance = model.instantiate(preset, { x: 0, y: 0 });
  const reference = instance.nodes.find((node) => node.generation?.operation === 'variant')!;
  const draft = { ...reference.generation!, operation: 'variant' as const };
  delete reference.assetPath;
  delete reference.generation;
  delete reference.sourceSnapshot;
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

test('idle portrait imports a transparent full-size reference and preserves the completed animation', async () => {
  const preset = presetByNumber(14);
  expect(canvasPresets()[1].id).toBe(preset.id);
  const canvas = await files.create('动态立绘');
  const prepared = await files.prepareTemplate(preset.id, canvas.id);
  const [portrait, video, sequence, animation] = prepared.nodes;
  const png = PNG.sync.read(fs.readFileSync(files.readMedia(portrait.assetPath!).file));
  expect([png.width, png.height]).toEqual([1152, 2048]);
  expect(png.data[3]).toBe(0);
  expect(
    Array.from(png.data as Buffer).filter((value, index) => index % 4 === 3 && value === 255).length
  ).toBeGreaterThan(200000);
  expect(video.generation?.prompt).toContain('very subtle living portrait idle loop');
  expect(video.generation?.prompt).toContain('uniformly solid magenta');
  expect(video.generation?.parameters?.duration).toBe(5);
  expect(sequence.sequenceSettings).toMatchObject({ fps: 12, end: 5, width: 288, height: 512 });
  expect(sequence.frameSetInfo?.frameCount).toBe(60);
  expect(animation.assetPath).toBe(sequence.assetPath);
  expect(animation.frameSetInfo).toEqual(sequence.frameSetInfo);
  expect(preset.assets[preset.nodes[1].assetPath!].resourceId).toBe(
    'b4c0602b6aa091bfcf810643a3c0376eb03207fcafacf95f94a36749439b7b80'
  );
  const instance = model.instantiate(prepared, { x: 0, y: 0 });
  expect(instance.nodes.filter((node) => node.templatePending)).toHaveLength(3);
  const saved = await files.save(
    canvas.id,
    { ...canvas, nodes: instance.nodes, edges: instance.edges },
    canvas.revision
  );
  expect((await files.load(canvas.id)).nodes).toEqual(saved.nodes);
  expect(portrait.generation?.taskId).toBeUndefined();
  expect(video.generation?.taskId).toBeUndefined();
});
