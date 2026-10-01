import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { createId } from '../model.js';
import { templateCoverSource } from '../templates.js';
import { readTemplatePage } from '../templateCatalog.js';

let root: string;
let files: MakerCanvasFiles;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-template-catalog-'));
  files = new MakerCanvasFiles(root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('500 templates use paged summaries, cached parsing, global search and no count limit', async () => {
  const canvas = await files.create();
  const builtin = (await files.listTemplates())[0];
  const template = await files.prepareTemplate(builtin.id, canvas.id);
  const folder = path.join(root, '.maker/canvases/templates');
  for (let index = 0; index < 500; index++) {
    const id = createId();
    fs.writeFileSync(
      path.join(folder, id + '.json'),
      JSON.stringify({ ...template, id, builtin: undefined, name: '游戏动作 ' + index })
    );
  }
  const read = jest.fn((id: string) => files.getTemplate(id));
  const first = await readTemplatePage(folder, read, 1, '');
  expect(first.total).toBe(500);
  expect(first.items).toHaveLength(24);
  expect(first.presets).toHaveLength(2);
  expect(first.items.every((item) => !('nodes' in item) && !('edges' in item))).toBe(true);
  expect(read).toHaveBeenCalledTimes(500);
  const second = await readTemplatePage(folder, read, 2, '');
  expect(read).toHaveBeenCalledTimes(500);
  expect(first.items.every((item) => !second.items.some((other) => other.id === item.id))).toBe(
    true
  );
  expect((await files.listTemplatePage(999)).page).toBe(21);
  expect((await files.listTemplatePage(1, '游戏动作 499')).total).toBe(1);
  const custom = await files.saveTemplate({
    ...template,
    id: createId(),
    revision: 0,
    name: '第501个模板',
  });
  expect((await files.listTemplatePage()).total).toBe(501);
  const changed = await files.saveTemplate({ ...custom, name: '改名成功' });
  expect((await files.listTemplatePage(1, '改名成功')).items[0].revision).toBe(changed.revision);
  await files.deleteTemplate(changed.id, changed.revision);
  expect((await files.listTemplatePage()).total).toBe(500);
});

test('bad files and symbolic links do not break the library or expose outside templates', async () => {
  await files.listTemplatePage();
  const folder = path.join(root, '.maker/canvases/templates');
  fs.writeFileSync(path.join(folder, createId() + '.json'), '{broken');
  const target = path.join(root, 'other.json');
  fs.writeFileSync(target, '{}');
  fs.symlinkSync(target, path.join(folder, createId() + '.json'));
  const result = await files.listTemplatePage();
  expect(result.skipped).toBe(2);
  expect(result.items).toEqual([]);
  expect(result.presets).toHaveLength(2);
});

test('cover source chooses a starting image, falling back to a stable image or no cover', async () => {
  const template = (await files.listTemplates())[0];
  const source = template.nodes[0];
  const derived = { ...source, id: createId(), x: source.x - 300, assetPath: 'derived.png' };
  const branch = { ...source, id: createId(), x: source.x + 300, assetPath: 'branch.png' };
  const workflow = {
    ...template,
    nodes: [branch, derived, source],
    edges: [{ id: createId(), from: source.id, to: derived.id, kind: 'image-variant' as const }],
  };
  expect(templateCoverSource(workflow)).toBe(source.assetPath);
  expect(templateCoverSource({ ...workflow, nodes: [derived] })).toBe('derived.png');
  expect(templateCoverSource({ ...workflow, nodes: [] })).toBeUndefined();
});

test('revision-bound thumbnails are small, isolated, invalidate on replace and reject unsafe paths', async () => {
  const builtin = (await files.listTemplates())[0];
  const source = files.readTemplateCover(builtin.id, builtin.revision);
  expect(source.source).toBe(true);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64'
  );
  files.saveTemplateCover(builtin.id, builtin.revision, png);
  expect(files.readTemplateCover(builtin.id, builtin.revision).bytes).toEqual(png);
  expect(files.readTemplateCover(builtin.id, builtin.revision).source).toBe(false);
  expect(() => files.saveTemplateCover('../outside', 1, png)).toThrow();
  expect(() => files.saveTemplateCover(builtin.id, 999, png)).toThrow('更新');
  expect(() => files.saveTemplateCover(builtin.id, 1, Buffer.alloc(400000))).toThrow();
  const oversized = Buffer.from(png);
  oversized.writeUInt32BE(257, 16);
  expect(() => files.saveTemplateCover(builtin.id, 1, oversized)).toThrow();
  const canvas = await files.create();
  const prepared = await files.prepareTemplate(builtin.id, canvas.id);
  const custom = await files.saveTemplate({ ...prepared, id: createId(), revision: 0 });
  files.saveTemplateCover(custom.id, custom.revision, png);
  const replaced = await files.saveTemplate({ ...custom, name: '更新的模板' });
  expect(files.readTemplateCover(replaced.id, replaced.revision).source).toBe(true);
  expect(() => files.saveTemplateCover(custom.id, custom.revision, png)).toThrow('更新');
  files.saveTemplateCover(replaced.id, replaced.revision, png);
  await files.deleteTemplate(replaced.id, replaced.revision);
  expect(
    fs.existsSync(
      path.join(
        root,
        '.maker/canvases/templates',
        replaced.id + '-cover-' + replaced.revision + '.png'
      )
    )
  ).toBe(false);
  const cache = path.join(
    root,
    '.maker/canvases/templates',
    builtin.id + '-cover-' + builtin.revision + '.png'
  );
  fs.unlinkSync(cache);
  const external = path.join(root, 'outside.png');
  fs.writeFileSync(external, png);
  fs.symlinkSync(external, cache);
  expect(() => files.readTemplateCover(builtin.id, builtin.revision)).toThrow('链接');
});
