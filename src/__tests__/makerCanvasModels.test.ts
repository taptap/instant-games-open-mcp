import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CanvasModelService } from '../maker/console/canvasModels.js';
import { MakerCanvasFiles } from '../maker/canvas/files.js';
import { canvasPresets } from '../maker/canvas/presets.js';
import { createCanvasTemplateModel } from '../maker/canvas/templates.js';
import { createId, type CanvasDocument } from '../maker/canvas/model.js';
import { STARTER_IMAGE_BASE64 } from '../maker/canvas/starterImages.js';
import { RemoteProxyToolCallError } from '../maker/server/proxyAssets.js';
import type { callRemoteProxyTool } from '../maker/server/mcp.js';
import { prepareCanvasNodeUpdates } from '../maker/canvas/automation.js';

let root: string;
let files: MakerCanvasFiles;
let document: CanvasDocument;
let viewsId: string;
let modelId: string;
let characterId: string;
let invoke: jest.Mock;
let service: CanvasModelService;
const image = Buffer.from(STARTER_IMAGE_BASE64[0], 'base64');
const response = (value: unknown) => ({ content: [], structuredContent: value });

beforeEach(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-model-test-')));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
  files = new MakerCanvasFiles(root);
  document = await files.create('model test');
  const template = canvasPresets().find((item) => item.name.includes('角色模型'))!;
  const instance = createCanvasTemplateModel(createId).instantiate(template, { x: 0, y: 0 });
  document.nodes = instance.nodes;
  document.edges = instance.edges;
  viewsId = document.nodes.find((node) => node.type === 'model-views')!.id;
  modelId = document.nodes.find((node) => node.type === 'model')!.id;
  const character = document.nodes.find((node) => node.type === 'image')!;
  characterId = character.id;
  character.assetPath = (await files.importImage(image)).relativePath;
  delete character.generationDraft;
  delete character.templatePending;
  await save();
  invoke = jest.fn();
  service = new CanvasModelService(root, undefined, invoke as typeof callRemoteProxyTool);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
async function save() {
  document = await files.save(document.id, document, document.revision);
}
function start() {
  return service.execute(document.id, {
    action: 'start',
    nodeId: viewsId,
    revision: document.revision,
  });
}
function review() {
  const preview: Record<string, string> = {};
  const preview_assets: Record<string, unknown> = {};
  for (const view of ['front', 'left', 'back', 'right']) {
    const relative = 'assets/image/review-' + view + '.jpg';
    fs.writeFileSync(path.join(root, relative), image);
    preview[view] = 'https://example.test/' + view;
    preview_assets[view] = { localPath: relative };
  }
  return {
    asset_id: 'asset-test',
    status: 'waiting_user_confirmation',
    preview,
    preview_assets,
    next_action: { action: 'continue', step_id: 'multiview_review', payload: { confirm: true } },
  };
}

test('template round trips three typed cards, quality and dependencies without task identity', async () => {
  const loaded = await files.load(document.id);
  expect(loaded.nodes.map((node) => node.type)).toEqual([
    'section',
    'image',
    'model-views',
    'model',
  ]);
  expect(loaded.edges.map((edge) => edge.kind)).toEqual(['character-views', 'views-model']);
  const updates = prepareCanvasNodeUpdates(loaded, {
    nodes: [{ id: viewsId, modelQuality: 'high_quality' }],
  });
  expect(updates[0].node.modelQuality).toBe('high_quality');
  expect(() =>
    prepareCanvasNodeUpdates(loaded, { nodes: [{ id: modelId, modelQuality: 'high_quality' }] })
  ).toThrow();
  expect(() =>
    prepareCanvasNodeUpdates(loaded, { nodes: [{ id: viewsId, modelQuality: 'arbitrary' }] })
  ).toThrow();
});

test('preview exposes only files inside the delivered model package and binds the saved attempt', async () => {
  const directory = 'assets/model/preview-test';
  fs.mkdirSync(path.join(root, directory, 'Meshes'), { recursive: true });
  fs.writeFileSync(path.join(root, directory, 'Meshes/model.mdl'), 'UMD2');
  fs.writeFileSync(path.join(root, directory, 'private.html'), '<script>bad</script>');
  invoke.mockResolvedValue(
    response({
      status: 'completed',
      local_delivery: {
        status: 'success',
        model: { local_path: directory + '/Meshes/model.mdl', format: 'mdl' },
      },
      model_files: [{ targetDirectory: directory }],
    })
  );
  const attempt = await start();
  const manifest = await service.preview(document.id, modelId);
  expect(manifest.files).toEqual([{ path: 'Meshes/model.mdl', size: 4 }]);
  expect(
    (
      await service.previewFile(document.id, modelId, attempt.id, 'Meshes/model.mdl')
    ).bytes.toString()
  ).toBe('UMD2');
  await expect(
    service.previewFile(document.id, modelId, attempt.id, '../.maker-mcp/config.json')
  ).rejects.toThrow('不属于');
  await expect(
    service.previewFile(document.id, modelId, attempt.id, 'private.html')
  ).rejects.toThrow('不属于');
  await expect(
    service.previewFile(document.id, modelId, createId(), 'Meshes/model.mdl')
  ).rejects.toThrow('尚未交付');
  await expect(service.preview(document.id, characterId)).rejects.toThrow('模型卡片');
  const link = path.join(root, directory, 'escape');
  fs.symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(service.preview(document.id, modelId)).rejects.toThrow('符号链接');
});

test('preview refuses pending results rather than displaying a reference image as a model', async () => {
  invoke.mockResolvedValue(response({ status: 'processing', asset_id: 'pending' }));
  await start();
  await expect(service.preview(document.id, modelId)).rejects.toThrow('尚未交付');
});

test('start uses reviewed image workflow, renders all four views and never continues automatically', async () => {
  invoke.mockResolvedValue(response(review()));
  const result = await start();
  expect(result.status).toBe('review');
  expect(result.previews).toHaveLength(4);
  expect(result.reviewId).toHaveLength(64);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0][0].args).toEqual({
    action: 'start',
    payload: {
      generation_strategy: 'reviewed',
      quality_tier: 'balanced',
      images: { front: document.nodes.find((node) => node.id === characterId)!.assetPath },
    },
  });
  for (const preview of result.previews)
    expect(fs.existsSync(path.join(root, preview.path))).toBe(true);
  await expect(start()).rejects.toThrow('已有模型任务');
});

test('rejects missing character, wrong revision and direct model run before dispatch', async () => {
  await expect(
    service.execute(document.id, { action: 'start', nodeId: viewsId, revision: 0 })
  ).rejects.toThrow('版本');
  await expect(
    service.execute(document.id, { action: 'start', nodeId: modelId, revision: document.revision })
  ).rejects.toThrow('先生成多视图');
  delete document.nodes.find((node) => node.id === characterId)!.assetPath;
  await save();
  await expect(start()).rejects.toThrow('角色图片');
  expect(invoke).not.toHaveBeenCalled();
});

test('explicit matching confirmation submits one continue and exports complete local model package', async () => {
  invoke.mockResolvedValueOnce(response(review()));
  const first = await start();
  await expect(
    service.execute(document.id, {
      action: 'confirm',
      nodeId: modelId,
      revision: document.revision,
      reviewId: 'stale',
    })
  ).rejects.toThrow('预览');
  const directory = 'assets/model/test-model';
  fs.mkdirSync(path.join(root, directory, 'Meshes'), { recursive: true });
  fs.mkdirSync(path.join(root, directory, 'Materials'));
  fs.writeFileSync(path.join(root, directory, 'Meshes/main.mdl'), 'UMD2-test');
  fs.writeFileSync(path.join(root, directory, 'Materials/main.xml'), '<material/>');
  invoke.mockResolvedValueOnce(
    response({
      asset_id: 'asset-test',
      status: 'completed',
      local_delivery: {
        status: 'success',
        model: { local_path: directory + '/Meshes/main.mdl', format: 'mdl' },
      },
      model_files: [{ targetDirectory: directory }],
    })
  );
  const final = await service.execute(document.id, {
    action: 'confirm',
    nodeId: modelId,
    revision: document.revision,
    reviewId: first.reviewId,
  });
  expect(final.status).toBe('completed');
  expect(invoke.mock.calls[1][0].args).toEqual({
    action: 'continue',
    asset_id: 'asset-test',
    step_id: 'multiview_review',
    payload: { confirm: true },
  });
  const archive = await service.export(document.id, modelId);
  expect(archive.subarray(0, 2).toString()).toBe('PK');
  expect(archive.includes(Buffer.from(directory + '/Materials/main.xml'))).toBe(true);
  expect(archive.includes(Buffer.from(directory + '/Meshes/main.mdl'))).toBe(true);
  expect(archive.includes(Buffer.from('README.txt'))).toBe(true);
  await expect(
    service.execute(document.id, {
      action: 'confirm',
      nodeId: modelId,
      revision: document.revision,
      reviewId: first.reviewId,
    })
  ).rejects.toThrow();
  expect(invoke).toHaveBeenCalledTimes(2);
});

test.each(['image', 'quality'])(
  'changed %s invalidates confirmation but retains original task',
  async (kind) => {
    invoke.mockResolvedValue(response(review()));
    const first = await start();
    if (kind === 'image')
      document.nodes.find((node) => node.id === characterId)!.assetPath = (
        await files.importImage(image)
      ).relativePath;
    else document.nodes.find((node) => node.id === viewsId)!.modelQuality = 'high_quality';
    await save();
    await expect(
      service.execute(document.id, {
        action: 'confirm',
        nodeId: modelId,
        revision: document.revision,
        reviewId: first.reviewId,
      })
    ).rejects.toThrow('预览');
    expect(service.list(document.id)[0].assetId).toBe('asset-test');
    expect(invoke).toHaveBeenCalledTimes(1);
    await start();
    expect(service.list(document.id)).toHaveLength(2);
  }
);

test('persists raw task identity before download and recovers by query after interruption', async () => {
  invoke.mockImplementationOnce(async (options: Parameters<typeof callRemoteProxyTool>[0]) => {
    await options.onRawResult!(response({ asset_id: 'asset-raw', task_id: 'task-raw' }) as never);
    expect(service.list(document.id)[0].assetId).toBe('asset-raw');
    throw new Error('download interrupted');
  });
  const first = await start();
  expect(first.status).toBe('unknown');
  await expect(start()).rejects.toThrow('已有模型任务');
  invoke.mockResolvedValueOnce(response(review()));
  const recovered = await new CanvasModelService(
    root,
    undefined,
    invoke as typeof callRemoteProxyTool
  ).execute(document.id, { nodeId: viewsId, action: 'query' });
  expect(recovered.status).toBe('review');
  expect(invoke.mock.calls[1][0].args).toEqual({ action: 'query', asset_id: 'asset-raw' });
});

test('unknown dispatch without ID cannot be retried or misreported as completed', async () => {
  invoke.mockRejectedValue(
    new RemoteProxyToolCallError('create_3d_asset', 'unknown', new Error('transport lost'))
  );
  const first = await start();
  expect(first.status).toBe('unknown');
  expect(first.retrySafe).toBe(false);
  await expect(start()).rejects.toThrow();
  await expect(service.execute(document.id, { nodeId: viewsId, action: 'query' })).rejects.toThrow(
    '任务 ID'
  );
  expect(invoke).toHaveBeenCalledTimes(1);
});

test('pre-dispatch rejection permits explicit retry, never automatic', async () => {
  invoke.mockRejectedValueOnce(
    new RemoteProxyToolCallError('create_3d_asset', 'not_executed', new Error('not connected'))
  );
  expect((await start()).retrySafe).toBe(true);
  expect(invoke).toHaveBeenCalledTimes(1);
  invoke.mockResolvedValueOnce(response(review()));
  expect((await start()).status).toBe('review');
});

test('incomplete previews block confirmation while preserving task ID', async () => {
  const value = review();
  delete value.preview_assets.back;
  invoke.mockResolvedValue(response(value));
  const first = await start();
  expect(first.status).toBe('unknown');
  expect(first.assetId).toBe('asset-test');
  expect(first.reviewId).toBeUndefined();
});

test('completed remote task without local delivery remains recoverable, not ready', async () => {
  invoke.mockResolvedValue(
    response({ asset_id: 'asset-test', status: 'completed', local_delivery: { status: 'failed' } })
  );
  const first = await start();
  expect(first.status).toBe('unknown');
  await expect(service.export(document.id, modelId)).rejects.toThrow('尚无');
});

test('concurrent start is blocked; source edits do not unlock unknown paid work', async () => {
  let resolve: (value: unknown) => void = () => {};
  invoke.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const pending = start();
  for (let tries = 0; !invoke.mock.calls.length && tries < 50; tries++)
    await new Promise((done) => setTimeout(done, 10));
  await expect(start()).rejects.toThrow('仍在执行');
  resolve(response({ asset_id: 'asset-test', status: 'running' }));
  expect((await pending).status).toBe('pending');
  document.nodes.find((node) => node.id === viewsId)!.modelQuality = 'fast';
  await save();
  await expect(start()).rejects.toThrow('已有模型任务');
  expect(invoke).toHaveBeenCalledTimes(1);
});

test('preview paths and model attempt folder cannot escape via symlinks', async () => {
  const value = review();
  value.preview_assets.front = { localPath: 'assets/image/../../outside.jpg' };
  invoke.mockResolvedValue(response(value));
  expect((await start()).status).toBe('unknown');
  const folder = path.join(root, '.maker/canvases/model-attempts');
  fs.renameSync(folder, folder + '-original');
  fs.symlinkSync(folder + '-original', folder, 'dir');
  expect(() => service.list(document.id)).toThrow('符号链接');
});
