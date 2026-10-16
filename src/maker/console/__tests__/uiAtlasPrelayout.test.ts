import * as imageModelDiscovery from '../canvasImageModels.js';
import { imageModelsFixture } from '../../canvas/__fixtures__/imageModels.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
// @ts-expect-error pngjs has no declarations.
import pngjs from 'pngjs';
import { MakerCanvasFiles } from '../../canvas/files.js';
import { createId, type CanvasNode } from '../../canvas/model.js';
import { createCanvasTemplateModel } from '../../canvas/templates.js';
import {
  cloneUiAtlasBatch,
  uiAtlasOrderPrompt,
  type UiAtlasPlan,
} from '../../canvas/uiAssetBindings.js';
import { prepareUiAtlasReference } from '../uiAtlasPrelayout.js';
import { CanvasGenerationService } from '../canvasGeneration.js';
import * as bindings from '../../canvas/uiAssetBindings.js';
import * as settings from '../visionSettings.js';
import { callRemoteProxyTool } from '../../server/mcp.js';

const discoverImageModels = imageModelDiscovery.canvasImageModels;

jest.mock('../../server/mcp.js', () => ({ callRemoteProxyTool: jest.fn() }));

const PNG = pngjs.PNG;
let root: string;
let files: MakerCanvasFiles;
let plan: UiAtlasPlan;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-prelayout-'));
  jest
    .spyOn(imageModelDiscovery, 'canvasImageModels')
    .mockImplementation((root, manager, tool, configured) => {
      if (configured?.source === 'maker')
        return Promise.resolve({
          ...imageModelsFixture(tool),
          provider: {
            source: 'maker',
            identity: imageModelDiscovery.canvasImageProviderIdentity(configured),
          },
        });
      return discoverImageModels(root, manager, tool, configured);
    });

  execFileSync('git', ['init'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
  files = new MakerCanvasFiles(root);
  const raster = new PNG({ width: 80, height: 40 });
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 80; x++) {
      const i = (y * 80 + x) * 4;
      raster.data[i] = x < 40 ? 255 : 0;
      raster.data[i + 2] = x >= 40 ? 255 : 0;
      raster.data[i + 3] = 255;
    }
  const bytes = PNG.sync.write(raster);
  const cutSource = {
    path: (await files.importImage(bytes)).relativePath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: 80,
    height: 40,
  };
  const designBytes = PNG.sync.write(new PNG({ width: 40, height: 20 }));
  const design = {
    path: (await files.importImage(designBytes)).relativePath,
    sha256: createHash('sha256').update(designBytes).digest('hex'),
    width: 40,
    height: 20,
  };
  plan = {
    version: 1,
    bbox: {
      version: 1,
      coordinateSpace: 'design-pixels',
      bboxFormat: 'xywh',
      design,
      cutSource,
      texts: [],
      elements: [
        { id: 'E001', name: 'wide', type: 'button', bbox: [0, 0, 20, 4], parent: null },
        { id: 'E002', name: 'tall', type: 'icon', bbox: [30, 0, 4, 20], parent: null },
      ],
    },
    grid: { columns: 2, rows: 2, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
    slots: [
      { elementIds: ['E001'], state: 'normal', role: 'element' },
      { elementIds: ['E001'], state: 'pressed', role: 'element' },
      { elementIds: ['E002'], state: 'normal', role: 'element' },
      { elementIds: [], state: 'normal', role: 'reserve' },
    ],
  };
  plan = bindings.validateUiAtlasPlan(plan);
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

test('local preparation works without an image provider and records a visible reusable result', async () => {
  jest
    .spyOn(settings, 'generationProvider')
    .mockReturnValue({ source: 'local', profile: undefined });
  jest.spyOn(bindings, 'selectedUiAtlasPlan').mockImplementation(() => plan);
  const remote = jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('must not call network'));
  let doc = await files.create('local step', 'empty');
  const source: CanvasNode = {
    id: createId(),
    type: 'image',
    title: 'source',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    assetPath: plan.bbox.cutSource.path,
  };
  const target: CanvasNode = {
    ...source,
    id: createId(),
    title: 'prelayout',
    assetPath: undefined,
    uiAtlasPrelayout: true,
    generationDraft: { operation: 'variant', prompt: 'prepare', sourceImageId: source.id },
  };
  doc.nodes = [source, target];
  doc.edges = [{ id: createId(), from: source.id, to: target.id, kind: 'image-variant' }];
  doc = await files.save(doc.id, doc, doc.revision);
  const service = new CanvasGenerationService(root, {} as any);
  const input = {
    canvasId: doc.id,
    targetNodeId: target.id,
    sourceImageId: source.id,
    sourceImagePath: source.assetPath,
    resolution: '1K',
    aspectRatio: '1:1',
    prompt: uiAtlasOrderPrompt(plan),
  };
  const result = await service.generateImage(input);
  expect(result).toMatchObject({
    provider: 'local',
    toolName: 'prepare_ui_atlas',
    status: 'succeeded',
    resultImageInfo: { width: 1024, height: 1024 },
  });
  expect(result.sourceSnapshot?.nodeId).toBe(source.id);
  expect(result.uiAtlasPlan).toEqual(plan);
  expect(files.readMedia(result.resultAssetPath!).type).toBe('image/png');
  expect(remote).not.toHaveBeenCalled();
  target.assetPath = result.resultAssetPath;
  target.generation = {
    prompt: result.prompt,
    operation: 'variant',
    uiAtlasPlan: plan,
    sourceImageId: source.id,
    sourceImageIds: [source.id],
    attemptId: result.id,
  };
  target.sourceSnapshot = result.sourceSnapshot;
  delete target.generationDraft;
  const consumer: CanvasNode = {
    id: createId(),
    type: 'image',
    title: 'separate',
    x: 500,
    y: 0,
    width: 200,
    height: 200,
    referenceInput: { includeSelf: false },
    generationDraft: { operation: 'variant', sourceImageId: target.id, prompt: 'separate' },
  };
  doc.nodes = [source, target, consumer];
  doc.edges.push({ id: createId(), from: target.id, to: consumer.id, kind: 'image-variant' });
  doc = await files.save(doc.id, doc, doc.revision);
  jest.mocked(settings.generationProvider).mockReturnValue({ source: 'maker', profile: undefined });
  const submit = jest.mocked(callRemoteProxyTool);
  submit.mockResolvedValue({ structuredContent: { localPath: plan.bbox.cutSource.path } } as any);
  const next = {
    ...input,
    targetNodeId: consumer.id,
    sourceImageId: target.id,
    sourceImagePath: target.assetPath,
    prompt: uiAtlasOrderPrompt(plan, 1, true),
  };
  await expect(service.generateImage({ ...next, aspectRatio: '16:9' })).rejects.toThrow(
    '输出比例与预排图不一致'
  );
  expect(submit).not.toHaveBeenCalled();
  const separated = await service.generateImage(next);
  expect(separated.referenceImages?.map((image) => image.assetPath)).toEqual([target.assetPath]);
  expect(submit.mock.calls[0][0].args?.reference_images).toEqual([target.assetPath]);
  plan.bbox.cutSource.sha256 = '0'.repeat(64);
  const stale = service.generateImage(next);
  await expect(stale).rejects.toThrow('预排');
  await expect(stale).rejects.toMatchObject({
    code: 'CANVAS_IMAGE_NOT_SUBMITTED',
    executionState: 'not_executed',
  });
  expect(submit).toHaveBeenCalledTimes(1);
  jest.mocked(settings.generationProvider).mockReturnValue({ source: 'local', profile: undefined });
  await expect(
    service.generateImage({ ...input, prompt: uiAtlasOrderPrompt(plan) })
  ).rejects.toThrow('来源已变化');
  expect(remote).not.toHaveBeenCalled();
});

test('scales design Bboxes to cut-source pixels, fits wide/tall crops and leaves reserve cells empty', async () => {
  const result = await prepareUiAtlasReference(files, plan, 128, 128);
  const image = PNG.sync.read(fs.readFileSync(files.readMedia(result).file));
  const pixel = (x: number, y: number) => [
    ...image.data.subarray((y * 128 + x) * 4, (y * 128 + x) * 4 + 4),
  ];
  expect(pixel(32, 32)).toEqual([255, 0, 0, 255]);
  expect(pixel(96, 32)).toEqual([255, 0, 0, 255]);
  expect(pixel(32, 96)).toEqual([0, 0, 255, 255]);
  expect(pixel(96, 96)).toEqual([0, 0, 0, 0]);
  expect(pixel(32, 20)).toEqual([0, 0, 0, 0]);
  expect(pixel(20, 96)).toEqual([0, 0, 0, 0]);
  const updated = structuredClone(plan);
  updated.bbox.elements[0].bbox = [30, 0, 4, 20];
  const next = await prepareUiAtlasReference(files, updated, 128, 128, '#FF00FF');
  const nextImage = PNG.sync.read(fs.readFileSync(files.readMedia(next).file));
  expect([...nextImage.data.subarray((32 * 128 + 32) * 4, (32 * 128 + 32) * 4 + 4)]).toEqual([
    0, 0, 255, 255,
  ]);
  const prompt = uiAtlasOrderPrompt(updated, 1, true);
  expect(prompt).toContain('参考图同一格');
  expect(prompt).not.toContain('[30,0,4,20]');
  expect(prompt).toContain('pressed');
});

test('refuses replaced files and mismatched dimensions before producing a reference', async () => {
  plan.bbox.design.width = 41;
  await expect(prepareUiAtlasReference(files, plan, 128, 128, '#00FF00')).rejects.toThrow(
    '来源已变化'
  );
  plan.bbox.design.width = 40;
  fs.writeFileSync(
    files.readMedia(plan.bbox.cutSource.path).file,
    PNG.sync.write(new PNG({ width: 80, height: 40 }))
  );
  await expect(prepareUiAtlasReference(files, plan, 128, 128, '#00FF00')).rejects.toThrow(
    '来源已变化'
  );
});

test('personal-template save, instantiate and continuation batches preserve the opt-in', async () => {
  const doc = await files.create('test', 'empty');
  const source: CanvasNode = {
    id: createId(),
    type: 'image',
    title: 'source',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    assetPath: plan.bbox.cutSource.path,
  };
  const target: CanvasNode = {
    ...source,
    id: createId(),
    x: 300,
    title: 'atlas',
    assetPath: undefined,
    uiAtlasGroup: 'controls',
    uiAtlasPrelayout: true,
    generationDraft: { operation: 'variant', sourceImageId: source.id, prompt: 'test' },
  };
  doc.nodes = [source, target];
  doc.edges = [{ id: createId(), from: source.id, to: target.id, kind: 'image-variant' }];
  const model = createCanvasTemplateModel();
  const saved = await files.saveTemplate(model.snapshot(doc, [source.id, target.id], 'prelayout'));
  const template = files.getTemplate(saved.id);
  expect(template.nodes.find((n) => n.uiAtlasGroup)?.uiAtlasPrelayout).toBe(true);
  const instance = model.instantiate(template, { x: 0, y: 0 });
  doc.nodes = instance.nodes;
  doc.edges = instance.edges;
  const seed = doc.nodes.find((n) => n.uiAtlasGroup)!;
  cloneUiAtlasBatch(doc, seed, 1);
  expect(doc.nodes.filter((n) => n.uiAtlasGroup).every((n) => n.uiAtlasPrelayout)).toBe(true);
  seed.assetPath = source.assetPath;
  seed.referenceInput = { includeSelf: false };
  seed.generation = { ...seed.generationDraft!, prompt: 'test' };
  delete seed.generationDraft;
  const consumer: CanvasNode = {
    ...seed,
    id: createId(),
    uiAtlasPrelayout: undefined,
    assetPath: undefined,
    generation: undefined,
    referenceInput: { includeSelf: false },
    generationDraft: { operation: 'variant', prompt: 'separate', sourceImageId: seed.id },
  };
  doc.nodes.push(consumer);
  doc.edges.push({ id: createId(), from: seed.id, to: consumer.id, kind: 'image-variant' });
  const continuation = cloneUiAtlasBatch(doc, consumer, 2);
  const upstream = doc.nodes.find((n) => n.id === continuation.generationDraft?.sourceImageId)!;
  expect(upstream).toMatchObject({
    uiAtlasPrelayout: true,
    uiAtlasBatch: 2,
    templatePending: true,
  });
  expect(upstream.id).not.toBe(seed.id);
  expect(upstream.assetPath).toBe(seed.assetPath);
  await expect(files.save(doc.id, doc, doc.revision)).resolves.toMatchObject({ id: doc.id });
});
