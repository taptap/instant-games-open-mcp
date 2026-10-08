import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import archiver from 'archiver';
import { MakerCanvasFiles } from '../files.js';
import { createId } from '../model.js';
import { createCanvasTemplateModel } from '../templates.js';
import {
  exportTemplateArchive,
  readTemplateArchive,
  templateAssetPaths,
} from '../templateArchive.js';
import { imageAtlasRegions } from '../imageAtlasExport.js';
import { snapshotCanvasSource } from '../dependencies.js';
const { PNG } = require('pngjs');

let root: string, source: MakerCanvasFiles, target: MakerCanvasFiles;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-template-archive-'));
  for (const name of ['source', 'target']) fs.mkdirSync(path.join(root, name));
  source = new MakerCanvasFiles(path.join(root, 'source'));
  target = new MakerCanvasFiles(path.join(root, 'target'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function fixture() {
  const png = PNG.sync.write({ width: 2, height: 1, data: Buffer.alloc(8, 255) });
  const input = await source.importImage(png);
  const output = await source.importImage(png);
  const grid = { columns: 2, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
  const first = {
    id: createId(),
    type: 'image' as const,
    title: '原稿',
    x: 0,
    y: 0,
    width: 240,
    height: 200,
    assetPath: input.relativePath,
  };
  const second = {
    ...first,
    id: createId(),
    type: 'image-assets' as const,
    title: '资源',
    x: 300,
    assetPath: undefined,
    sourceSnapshot: snapshotCanvasSource(first),
    imageAssetsInfo: {
      width: 2,
      height: 1,
      grid,
      items: imageAtlasRegions(2, 1, grid).map((region, index) => ({
        name: region.name,
        width: region.width,
        height: region.height,
        assetPath: index ? output.relativePath : input.relativePath,
      })),
    },
  };
  const template = await source.saveTemplate({
    id: createId(),
    name: '分享模板',
    revision: 0,
    skills: ['maker-ui-workflow'],
    nodes: [first, second],
    edges: [{ id: createId(), from: first.id, to: second.id, kind: 'image-assets' }],
  });
  return { template, png };
}

test('ZIP shares assets across projects, preserves skills and allows identical cutouts without overwriting', async () => {
  const { template, png } = await fixture();
  const zip = await source.exportTemplate(template.id, template.revision);
  const decoded = await readTemplateArchive(zip);
  expect(decoded.assets.size).toBe(2);
  expect(new Set(decoded.assets.values()).size).toBe(1);
  const imported = await target.importTemplate(zip);
  expect(imported.id).not.toBe(template.id);
  expect(imported.skills).toEqual(template.skills);
  expect(imported.builtin).toBeUndefined();
  expect(templateAssetPaths(imported)).toHaveLength(2);
  for (const asset of templateAssetPaths(imported)) {
    expect(templateAssetPaths(template)).not.toContain(asset);
    expect(fs.readFileSync(target.readMedia(asset).file)).toEqual(png);
  }
  expect(imported.nodes[1].sourceSnapshot).toEqual(snapshotCanvasSource(imported.nodes[0]));
  const second = await target.importTemplate(zip);
  expect(second.id).not.toBe(imported.id);
  expect(target.getTemplate(imported.id)).toEqual(imported);
  const canvas = await target.create();
  const instance = createCanvasTemplateModel().instantiate(imported, { x: 0, y: 0 });
  await target.save(
    canvas.id,
    { ...canvas, nodes: instance.nodes, edges: instance.edges },
    canvas.revision
  );
  expect((await target.load(canvas.id)).nodes[0].templateSkills).toEqual(template.skills);
});

test('video bytes are imported without creating an extra canvas or retaining task identities', async () => {
  const { template } = await fixture();
  const canvas = await source.create();
  const bytes = Buffer.from('0000ftypisom00000000');
  const video = await source.importVideo(canvas.id, bytes, 'video/mp4');
  template.nodes.push({
    id: createId(),
    type: 'video-source',
    title: '视频',
    x: 600,
    y: 0,
    width: 240,
    height: 200,
    assetPath: video.relativePath,
    generation: { prompt: '动作', taskId: 'remote-secret', attemptId: createId() },
  });
  const saved = await source.saveTemplate(template);
  const imported = await target.importTemplate(
    await source.exportTemplate(saved.id, saved.revision)
  );
  const node = imported.nodes.find((item) => item.type === 'video-source')!;
  expect(node.generation?.taskId).toBeUndefined();
  expect(node.generation?.attemptId).toBeUndefined();
  expect(fs.readFileSync(target.readMedia(node.assetPath!).file)).toEqual(bytes);
  expect(await target.list()).toEqual([]);
});

test('export rejects missing media and stale revision; failed imports remove newly copied media', async () => {
  const { template } = await fixture();
  await expect(source.exportTemplate(template.id, 99)).rejects.toThrow('更新');
  const invalidFile = path.join(root, 'invalid.png');
  fs.writeFileSync(invalidFile, 'not a real image');
  const zip = await exportTemplateArchive(template, (relative) =>
    relative === templateAssetPaths(template)[1]
      ? { file: invalidFile, type: 'image/png' }
      : source.readMedia(relative)
  );
  await expect(target.importTemplate(zip)).rejects.toThrow('PNG');
  expect(fs.readdirSync(path.join(root, 'target/assets/image'))).toEqual([]);
  expect((await target.listTemplatePage()).items).toEqual([]);
  fs.unlinkSync(source.readMedia(templateAssetPaths(template)[0]).file);
  await expect(source.exportTemplate(template.id, template.revision)).rejects.toThrow('素材不存在');
});

function pack(entries: Array<[string, Buffer | string]>, symlink = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = archiver('zip');
    const chunks: Buffer[] = [];
    zip.on('data', (chunk) => chunks.push(chunk));
    zip.on('error', reject);
    zip.on('end', () => resolve(Buffer.concat(chunks)));
    for (const [name, bytes] of entries) {
      if (symlink) zip.symlink(name, '../../outside');
      else zip.append(bytes, { name });
    }
    void zip.finalize().catch(reject);
  });
}

test('invalid ZIP, missing media, duplicate files, symlinks and corrupt media are rejected', async () => {
  const { template, png } = await fixture();
  const name = 'media/' + createHash('sha256').update(png).digest('hex') + '.png';
  const manifest = JSON.stringify({
    format: 'maker-canvas-template',
    version: 1,
    template,
    assets: Object.fromEntries(templateAssetPaths(template).map((file) => [file, name])),
  });
  const archives = [
    Buffer.from('not zip'),
    await pack([['template.json', manifest]]),
    await pack([
      ['template.json', manifest],
      ['template.json', manifest],
    ]),
    await pack([[name, png]], true),
    await pack([
      ['template.json', manifest],
      [name, 'broken'],
    ]),
    await pack([['unexpected.exe', 'not allowed']]),
  ];
  for (const zip of archives) await expect(target.importTemplate(zip)).rejects.toThrow();
  expect(fs.readdirSync(path.join(root, 'target'))).toEqual([]);
});
