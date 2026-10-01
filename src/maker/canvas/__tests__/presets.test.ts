import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { createId } from '../model.js';
import { createCanvasTemplateModel } from '../templates.js';
import { isCanvasNodeStale } from '../dependencies.js';

let root: string;
let files: MakerCanvasFiles;
const model = createCanvasTemplateModel();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-presets-'));
  files = new MakerCanvasFiles(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('lists both portable presets without importing assets or creating a canvas', async () => {
  const templates = await files.listTemplates();
  expect(templates.map((template) => template.name)).toEqual(['序列帧动画', '角色四方向']);
  expect(templates.every((template) => template.builtin && !('assets' in template))).toBe(true);
  expect(await files.list()).toEqual([]);
  expect(fs.existsSync(path.join(root, 'assets'))).toBe(false);
});

test.each([0, 1])(
  'prepares, duplicates and persists preset %i with independent internal references',
  async (index) => {
    const listed = (await files.listTemplates())[index];
    const original = JSON.stringify(listed);
    const canvas = await files.create('预设验证');
    const prepared = await files.prepareTemplate(listed.id, canvas.id);
    expect(prepared.nodes).toHaveLength(index === 0 ? 4 : 13);
    expect(prepared.edges).toHaveLength(index === 0 ? 3 : 12);
    expect(prepared.nodes.filter((node) => node.type === 'video-source')).toHaveLength(
      index === 0 ? 1 : 4
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
    expect(first.nodes.filter((node) => node.templatePending)).toHaveLength(index === 0 ? 3 : 12);
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
