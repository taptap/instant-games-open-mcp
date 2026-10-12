import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MakerCanvasFiles } from '../files.js';
import { createId, type CanvasNode } from '../model.js';
import { applyImageAssets } from '../imageAssets.js';
import { addResourceBundle, validateResourceBundle } from '../resourceBundle.js';
import { validateUiAtlasPlan } from '../uiAssetBindings.js';
import { validateUiRecognition } from '../uiRecognition.js';
import { snapshotCanvasSource } from '../dependencies.js';
const { PNG } = require('pngjs');

test('archives recognition and resource snapshots independently of the canvas, preserves old versions and PNGs', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ui-archive-')));
  try {
    const files = new MakerCanvasFiles(root);
    expect(files.listUiArchives()).toEqual([]);
    expect(fs.existsSync(path.join(root, '.maker'))).toBe(false);
    let document = await files.create('inventory');
    const png = new PNG({ width: 20, height: 20 });
    png.data.fill(255);
    const bytes = PNG.sync.write(png);
    const imported = await files.importImage(bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const identity = { path: imported.relativePath, sha256, width: 20, height: 20 };
    const bbox = {
      version: 1,
      coordinateSpace: 'design-pixels',
      bboxFormat: 'xywh',
      design: identity,
      cutSource: identity,
      elements: [
        { id: 'E001', name: 'button', type: 'button', bbox: [0, 0, 20, 20], parent: null },
      ],
      texts: [],
    };
    const section: CanvasNode = {
      id: createId(),
      type: 'section',
      title: 'UI',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    };
    const original: CanvasNode = {
      ...section,
      id: createId(),
      type: 'image',
      sectionId: section.id,
      assetPath: imported.relativePath,
    };
    const resultId = createId();
    const source: CanvasNode = {
      ...original,
      id: createId(),
      uiRecognition: validateUiRecognition({
        enabled: true,
        selectedId: resultId,
        results: [
          {
            id: resultId,
            model: 'local',
            prompt: 'test',
            createdAt: new Date().toISOString(),
            durationMs: 1,
            sourcePath: imported.relativePath,
            sourceSha256: sha256,
            width: 20,
            height: 20,
            elements: [],
            bbox,
          },
        ],
      }),
    };
    source.generation = {
      prompt: 'clean',
      parameters: {},
      operation: 'variant',
      sourceImageId: original.id,
      sourceImageIds: [original.id],
    };
    document.nodes.push(section, original, source);
    document.edges.push({
      id: createId(),
      from: original.id,
      to: source.id,
      kind: 'image-variant',
    });
    document = await files.save(document.id, document, document.revision);
    const recognized = files.listUiArchives(document.id);
    expect(recognized).toHaveLength(1);
    expect(recognized[0].stage).toBe('recognized');
    const grid = { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
    const plan = validateUiAtlasPlan({
      version: 1,
      bbox,
      grid,
      slots: [{ elementIds: ['E001'], state: 'normal', role: 'element' }],
    });
    const atlas: CanvasNode = {
      ...original,
      id: createId(),
      title: 'atlas',
      generation: {
        prompt: 'test',
        parameters: {},
        operation: 'variant',
        sourceImageId: source.id,
        sourceImageIds: [source.id],
        uiAtlasPlan: plan,
      },
    };
    document.nodes.push(atlas);
    document.edges.push({ id: createId(), from: source.id, to: atlas.id, kind: 'image-variant' });
    applyImageAssets(
      document,
      atlas.id,
      {
        width: 20,
        height: 20,
        grid,
        uiBindingReview: 'confirmed',
        items: [{ name: 'item_001', width: 20, height: 20, assetPath: imported.relativePath }],
      },
      createId(),
      createId()
    );
    addResourceBundle(document, section.id);
    document = await files.save(document.id, document, document.revision);
    const resource = files
      .listUiArchives(document.id)
      .find((record) => record.stage === 'resources')!;
    expect(resource.confirmed).toBe(true);
    const bindings = JSON.parse(fs.readFileSync(path.join(root, resource.bindingsPath!), 'utf8'));
    expect(bindings.ui.id).toBe(resource.uiId);
    expect(fs.readFileSync(path.join(root, resource.directory, bindings.assets[0].path))).toEqual(
      bytes
    );
    expect(fs.readFileSync(path.join(root, resource.directory, bbox.design.path))).toEqual(bytes);
    const before = fs.statSync(path.join(root, resource.bindingsPath!)).mtimeMs;
    document.viewport.x += 1;
    document = await files.save(document.id, document, document.revision);
    await files.archiveUi(document.id);
    expect(fs.statSync(path.join(root, resource.bindingsPath!)).mtimeMs).toBe(before);
    const unboundAtlas = { ...atlas, id: createId(), generation: { ...atlas.generation! } };
    delete unboundAtlas.generation.uiAtlasPlan;
    document.nodes.push(unboundAtlas);
    document.edges.push({
      id: createId(),
      from: source.id,
      to: unboundAtlas.id,
      kind: 'image-variant',
    });
    const boundAsset = document.nodes.find((node) => node.type === 'image-assets')!;
    const bundle = document.nodes.find((node) => node.type === 'resource-bundle')!;
    let lastAsset: CanvasNode = boundAsset;
    for (let index = 0; index < 124; index++) {
      lastAsset = structuredClone(boundAsset);
      lastAsset.id = createId();
      lastAsset.title = 'unbound-' + index;
      lastAsset.sourceSnapshot = snapshotCanvasSource(unboundAtlas);
      document.nodes.push(lastAsset);
      document.edges.push(
        { id: createId(), from: unboundAtlas.id, to: lastAsset.id, kind: 'image-assets' },
        { id: createId(), from: lastAsset.id, to: bundle.id, kind: 'resource-bundle' }
      );
    }
    expect(() => validateResourceBundle(document, bundle.id)).toThrow('122');
    document = await files.save(document.id, document, document.revision);
    const largeArchive = files
      .listUiArchives(document.id)
      .find((record) => record.stage === 'resources' && record.revision !== resource.revision)!;
    expect(largeArchive).toBeDefined();
    png.data[0] = 0;
    const replacement = await files.importImage(PNG.sync.write(png));
    document.nodes.find((node) => node.id === lastAsset.id)!.imageAssetsInfo!.items[0].assetPath =
      replacement.relativePath;
    document = await files.save(document.id, document, document.revision);
    const recutArchives = files
      .listUiArchives(document.id)
      .filter((record) => record.stage === 'resources');
    expect(recutArchives).toHaveLength(3);
    expect(new Set(recutArchives.map((record) => record.revision)).size).toBe(3);
    expect(fs.existsSync(path.join(root, largeArchive.bindingsPath!))).toBe(true);
    const changed = document.nodes.find((node) => node.id === source.id)!;
    changed.uiRecognition!.results[0].bbox!.elements[0].name = 'new-name';
    document = await files.save(document.id, document, document.revision);
    expect(
      files.listUiArchives(document.id).filter((record) => record.stage === 'recognized')
    ).toHaveLength(2);
    expect(
      files.listUiArchives(document.id).filter((record) => record.stage === 'resources')
    ).toHaveLength(3);
    fs.unlinkSync(path.join(root, '.maker/canvases', document.id + '.json'));
    const reloaded = new MakerCanvasFiles(root).listUiArchives(document.id);
    expect(reloaded).toHaveLength(5);
    expect(fs.existsSync(path.join(root, resource.bboxPath))).toBe(true);
    expect(snapshotCanvasSource(atlas)).toBeDefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('archive queries reject redirected storage without creating directories', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ui-archive-link-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ui-archive-out-')));
  try {
    fs.mkdirSync(path.join(root, '.maker/canvases'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, '.maker/canvases/ui-archives'));
    expect(() => new MakerCanvasFiles(root).listUiArchives()).toThrow('符号链接');
    expect(fs.readdirSync(outside)).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
