import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { createCanvasTemplateModel } from '../templates.js';
import { createUiWorkflowPreset } from '../uiWorkflowPresets.js';
import { invalidateCanvasDependents } from '../templateWorkflow.js';
import * as resources from '../../demoResources.js';
import { isGameUiResource, gameUiHandoffText } from '../uiWorkflowHandoff.js';

const presetId = '7e1cb6ad-732f-4dc3-a951-000000000012';

test('game UI template promotes the complete banana example with explicit handoff', () => {
  const preset = createUiWorkflowPreset();
  expect(preset.name).toBe('游戏UI制作');
  expect(preset.skills).toEqual(['maker-ui-workflow']);
  expect(preset.nodes.filter((n) => n.type === 'image')).toHaveLength(15);
  const exports = preset.nodes.filter((n) => n.type === 'image-assets');
  expect(exports).toHaveLength(9);
  expect(exports.flatMap((n) => n.imageAssetsInfo!.items)).toHaveLength(52);
  expect(preset.nodes.find((n) => n.type === 'note')?.text).toContain('maker-ui-workflow');
  for (const node of preset.nodes.filter((n) => n.type === 'image' && n !== preset.nodes[0])) {
    expect(node.generation?.prompt).toBeTruthy();
    expect(node.generation?.taskId).toBeUndefined();
    expect(node.generation?.attemptId).toBeUndefined();
    expect(node.generation?.sourceImageIds).toEqual(
      preset.edges.filter((e) => e.to === node.id).map((e) => e.from)
    );
  }
  const paths = preset.nodes.flatMap((n) => [
    ...(n.assetPath ? [n.assetPath] : []),
    ...(n.imageAssetsInfo?.items.map((item) => item.assetPath) || []),
  ]);
  for (const file of paths) expect(preset.assets[file]?.resourceId).toMatch(/^[a-f0-9]{64}$/);
});

test('official assets import locally, replacing the source invalidates all example results', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-game-ui-'));
  try {
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create('游戏UI制作');
    const prepared = await files.prepareTemplate(presetId, canvas.id);
    const model = createCanvasTemplateModel();
    const instance = model.instantiate(prepared, { x: 0, y: 0 });
    const saved = await files.save(
      canvas.id,
      { ...canvas, nodes: instance.nodes, edges: instance.edges },
      canvas.revision
    );
    expect(saved.nodes.some((n) => n.templatePending)).toBe(false);
    const source = saved.nodes.find((n) => n.type === 'image')!;
    source.assetPath = 'assets/image/replaced.png';
    invalidateCanvasDependents(saved, source.id);
    expect(
      saved.nodes.filter((n) => n.type === 'image-assets').every((n) => n.templatePending)
    ).toBe(true);
    expect(saved.nodes.find((n) => n.title.includes('背景准备'))?.templatePending).toBe(true);
    expect(isGameUiResource(saved, saved.nodes.find((n) => n.type === 'image-assets')!)).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('custom template save, read, preview and delete never access official CDN resources', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-local-template-'));
  const remote = jest
    .spyOn(resources, 'readDemoResource')
    .mockRejectedValue(new Error('Network forbidden'));
  const network = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network forbidden'));
  try {
    const files = new MakerCanvasFiles(root);
    const template = createUiWorkflowPreset();
    const localPaths = new Map<string, string>();
    // Copy existing bytes to this local fixture, without the official resource loader.
    for (const [relative, asset] of Object.entries(template.assets)) {
      const file = resources.demoResourceInfo(asset.resourceId).file;
      const imported = await files.importImage(
        fs.readFileSync(path.resolve(__dirname, '../../../../resources/maker-demo', file))
      );
      localPaths.set(relative, imported.relativePath);
    }
    for (const node of template.nodes) {
      if (node.assetPath) node.assetPath = localPaths.get(node.assetPath)!;
      for (const item of node.imageAssetsInfo?.items || [])
        item.assetPath = localPaths.get(item.assetPath)!;
      delete node.sourceSnapshot;
      delete node.sourceSnapshots;
    }
    const { assets: _assets, ...definition } = template;
    const custom = await files.saveTemplate({
      ...definition,
      id: '12345678-1234-4234-a234-123456789abc',
      revision: 0,
      name: '用户自己的模板',
    });
    expect(files.getTemplate(custom.id).builtin).toBeFalsy();
    await files.readTemplatePreviewImage(custom.id, custom.revision, custom.nodes[0].id);
    await files.readTemplateCover(custom.id, custom.revision);
    await files.deleteTemplate(custom.id, custom.revision);
    expect(remote).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, custom.nodes[0].assetPath!))).toBe(true);
  } finally {
    remote.mockRestore();
    network.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('handoff names the exact project and canvas, requires layout, and forbids uploading user assets', () => {
  const text = gameUiHandoffText('canvas-test', 'project-test');
  expect(text).toContain('canvas-test');
  expect(text).toContain('project-test');
  expect(text).toContain('没有时先对照原稿补录');
  expect(text).toContain('不上传用户素材');
  expect(isGameUiResource(undefined, createUiWorkflowPreset().nodes[14])).toBe(false);
});
