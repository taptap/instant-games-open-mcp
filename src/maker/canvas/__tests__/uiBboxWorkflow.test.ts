import { canvasPresets } from '../presets.js';
import { createCanvasTemplateModel } from '../templates.js';
import { createId, emptyDocument, type CanvasDocument } from '../model.js';
import { remapTemplateAssets, templateAssetPaths } from '../templateArchive.js';
import { syncUiBboxWorkflow } from '../uiBboxWorkflow.js';
import { bboxRecognitionElements } from '../uiRecognition.js';
import { ensureUiAtlasBatchCards, selectedUiAtlasPlan } from '../uiAssetBindings.js';
import { createCanvasGroupQueue } from '../groupQueue.js';
import { createTemplateWorkflow, canvasNeedsProcessing } from '../templateWorkflow.js';
import { canvasReferences, snapshotCanvasSource } from '../dependencies.js';
import { applyImageAssets } from '../imageAssets.js';
import { resourceBundleEntries, validateResourceBundle } from '../resourceBundle.js';
import { createCanvasZip } from '../zipArchive.js';
import { demoResourceInfo } from '../../demoResources.js';
import { createHash } from 'node:crypto';
const { PNG } = require('pngjs');
import { MakerCanvasFiles } from '../files.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fixture(simple = true) {
  const preset = canvasPresets().find((item) => item.id.endsWith('000015'))!;
  const paths = new Map(
    templateAssetPaths(preset).map((file) => [file, 'assets/image/canvas-' + createId() + '.png'])
  );
  const media = new Map(
    [...paths].map(([file, mapped]) => [
      mapped,
      path.join(
        process.cwd(),
        'resources/maker-demo',
        demoResourceInfo(preset.assets[file].resourceId).file
      ),
    ])
  );
  remapTemplateAssets(preset, paths);
  const copy = createCanvasTemplateModel().instantiate(preset, { x: 0, y: 0 });
  const current: CanvasDocument = { ...emptyDocument(), nodes: copy.nodes, edges: copy.edges };
  const cut = current.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
  const result = structuredClone(
    preset.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!.uiRecognition!
      .results[0]
  );
  current.nodes = current.nodes.filter(
    (node) =>
      node.type === 'section' ||
      node.uiRecognition ||
      (node.type === 'image' && !current.edges.some((edge) => edge.to === node.id))
  );
  current.edges = current.edges.filter(
    (edge) =>
      current.nodes.some((node) => node.id === edge.from) &&
      current.nodes.some((node) => node.id === edge.to)
  );
  if (simple) {
    result.bbox!.elements = [
      { id: 'E001', name: 'panel', type: 'panel', bbox: [20, 20, 200, 200], parent: null },
      { id: 'E002', name: 'button', type: 'button', bbox: [30, 100, 100, 30], parent: 'E001' },
    ];
    result.bbox!.texts = [];
  }
  result.elements = bboxRecognitionElements(result.bbox!);
  cut.uiRecognition!.results = [result];
  cut.uiRecognition!.selectedId = result.id;
  for (const node of current.nodes) delete node.templatePending;
  return { current, group: copy.section, cut, media };
}

test('default complex design completes the real queue and export logic with simulated model and cutting results', async () => {
  const { current, group, cut, media } = fixture(false);
  const bbox = cut.uiRecognition!.results[0].bbox!;
  for (const source of [bbox.design, bbox.cutSource])
    source.sha256 = createHash('sha256')
      .update(fs.readFileSync(media.get(source.path)!))
      .digest('hex');
  cut.uiRecognition!.results[0].sourceSha256 = bbox.cutSource.sha256;
  const recognition = JSON.stringify(cut.uiRecognition);
  const artIds = bbox.texts.filter((text) => text.role === 'title').map((text) => text.id);
  expect(artIds.length).toBeGreaterThan(0);
  syncUiBboxWorkflow(current, group.id, artIds, true);
  const bundle = current.nodes.find((node) => node.type === 'resource-bundle')!;
  const atlas = current.nodes.filter((node) => node.uiAtlasGroup && !node.uiAtlasPrelayout);
  const expected = bbox.elements
    .flatMap((element) => {
      const original = bbox.elements.find((item) => item.id === element.duplicateOf) || element;
      return (['button', 'tab'].includes(original.type) ? ['normal', 'pressed'] : ['normal']).map(
        (state) => element.id + ':' + state
      );
    })
    .sort();
  const planned = atlas
    .flatMap((node) =>
      selectedUiAtlasPlan(current, node)!.slots.flatMap((slot) =>
        slot.elementIds.map((id) => id + ':' + slot.state)
      )
    )
    .sort();
  expect(planned).toEqual(expected);
  expect(syncUiBboxWorkflow(current, group.id, artIds, true)).toEqual([]);
  expect(() => validateResourceBundle(current, bundle.id)).toThrow('尚未完成');
  const errors: string[] = [];
  const calls: string[] = [];
  let failOnce = atlas[1].id;
  const workflow = createTemplateWorkflow({
    getDocument: () => current,
    save: async () => true,
    changed() {},
    render() {},
    error: (message) => errors.push(message),
    confirm: () => true,
    video: async () => false,
    sequence: async () => {},
    animation() {},
    select() {},
    importImage() {},
    image: async (id) => {
      if (id === failOnce) {
        failOnce = '';
        throw new Error('simulated definite image failure');
      }
      const node = current.nodes.find((item) => item.id === id)!;
      expect(node.uiRecognition).toBeUndefined();
      expect(
        canvasReferences(current, id).every((source) => !canvasNeedsProcessing(current, source))
      ).toBe(true);
      const plan = selectedUiAtlasPlan(current, node);
      calls.push(id);
      node.assetPath = 'assets/image/canvas-' + createId() + '.png';
      node.generation = { prompt: 'SIMULATED, not visual acceptance', uiAtlasPlan: plan };
      delete node.generationDraft;
      node.sourceSnapshots = canvasReferences(current, id).map(
        (source) => snapshotCanvasSource(source)!
      );
      delete node.templatePending;
      return true;
    },
    assets: async (id) => {
      const source = canvasReferences(current, id)[0];
      const grid = source.generation?.uiAtlasPlan?.grid || source.uiBaselineGrid!;
      const layout = source.generation?.uiAtlasPlan?.nativeLayout;
      applyImageAssets(
        current,
        source.id,
        {
          width: layout?.width ?? grid.columns * 32,
          height: layout?.height ?? grid.rows * 32,
          grid,
          ...(layout ? { regions: structuredClone(layout.regions), cutMode: 'grid' as const } : {}),
          items: Array.from({ length: grid.columns * grid.rows }, (_, index) => ({
            name: 'item_' + String(index + 1).padStart(3, '0'),
            width: layout?.regions[index].width ?? 32,
            height: layout?.regions[index].height ?? 32,
            assetPath: 'assets/image/canvas-' + createId() + '.png',
          })),
        },
        createId(),
        createId(),
        id
      );
      calls.push(id);
      return true;
    },
  });
  const queue = createCanvasGroupQueue({
    getDocument: () => current,
    needs: (id) => canvasNeedsProcessing(current, current.nodes.find((node) => node.id === id)!),
    busy: () => false,
    parallel: () => true,
    save: async () => true,
    run: (id) => workflow.runQueued(id),
    expand: (id) => {
      ensureUiAtlasBatchCards(current, id);
    },
    confirm: () => true,
    changed() {},
    error: (message) => errors.push(message),
  });
  const network = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('Simulation must never use network');
  });
  jest.useFakeTimers();
  try {
    expect(queue.start(group.id, true)).toBe(true);
    await jest.advanceTimersByTimeAsync(10000);
    expect(queue.view(group.id)?.phase).toBe('paused');
    expect(() => validateResourceBundle(current, bundle.id)).toThrow('尚未完成');
    const successful = [...calls];
    expect(queue.start(group.id, true)).toBe(true);
    await jest.advanceTimersByTimeAsync(10000);
    expect(queue.view(group.id)?.phase).toBe('complete');
    jest.clearAllTimers();
    jest.useRealTimers();
    expect(new Set(calls).size).toBe(calls.length);
    expect(calls.filter((id) => successful.includes(id))).toEqual(successful);
    const exported = validateResourceBundle(current, bundle.id);
    expect(exported).toHaveLength(atlas.length + artIds.length);
    expect(
      current.nodes.filter((node) => node.sectionId === group.id && node.templatePending)
    ).toEqual([]);
    const entries = await resourceBundleEntries(
      current,
      bundle.id,
      () => {
        throw new Error('No network URL');
      },
      undefined,
      async (file) => {
        if (media.has(file)) return new Blob([new Uint8Array(fs.readFileSync(media.get(file)!))]);
        const item = current.nodes
          .flatMap((node) => node.imageAssetsInfo?.items || [])
          .find((item) => item.assetPath === file);
        if (!item) throw new Error('Unknown simulated resource: ' + file);
        return new Blob(
          [new Uint8Array(PNG.sync.write(new PNG({ width: item.width, height: item.height })))],
          { type: 'image/png' }
        );
      }
    );
    const manifest = JSON.parse(
      await entries.find((entry) => entry.name === 'bindings.json')!.blob.text()
    );
    expect(manifest.missingElementIds).toEqual([]);
    expect(manifest.artTextBindings.map((item: { textId: string }) => item.textId).sort()).toEqual(
      [...artIds].sort()
    );
    expect(
      manifest.artTextBindings.every((item: { path: string }) =>
        entries.some((entry) => entry.name === item.path)
      )
    ).toBe(true);
    expect(
      manifest.bindings
        .flatMap((binding: { elementId: string; assetId?: string; pressedAssetId?: string }) => [
          ...(binding.assetId ? [binding.elementId + ':normal'] : []),
          ...(binding.pressedAssetId ? [binding.elementId + ':pressed'] : []),
        ])
        .sort()
    ).toEqual(expected);
    expect(
      JSON.parse(await entries.find((entry) => entry.name === 'bbox.json')!.blob.text()).texts
    ).toEqual(bbox.texts);
    expect((await createCanvasZip(entries)).size).toBeGreaterThan(0);
    const broken = structuredClone(current);
    broken.edges = broken.edges.filter((edge) => edge.from !== exported[0].id);
    expect(() => validateResourceBundle(broken, bundle.id)).toThrow('未连接');
    const missing = structuredClone(current);
    const missingImage = missing.nodes.find((node) => node.id === atlas[0].id)!;
    const missingAssets = missing.nodes.find((node) =>
      missing.edges.some(
        (edge) =>
          edge.from === missingImage.id && edge.to === node.id && edge.kind === 'image-assets'
      )
    )!;
    missing.nodes = missing.nodes.filter((node) => node.id !== missingAssets.id);
    missing.edges = missing.edges.filter(
      (edge) => edge.from !== missingAssets.id && edge.to !== missingAssets.id
    );
    expect(() => validateResourceBundle(missing, bundle.id)).toThrow('缺少');
    expect(syncUiBboxWorkflow(current, group.id, artIds, true)).toEqual([]);
    expect(JSON.stringify(cut.uiRecognition)).toBe(recognition);
    expect(network).not.toHaveBeenCalled();
    expect(bbox.elements).toHaveLength(119);
    expect(bbox.texts).toHaveLength(50);
    expect(expected).toHaveLength(127);
    // Duplicate elements share PNGs, so binding count is not the ZIP file count.
    expect(entries.length).toBeLessThanOrEqual(122);
    expect(exported.reduce((count, node) => count + node.imageAssetsInfo!.items.length, 0)).toBe(
      atlas.reduce((count, node) => count + node.generation!.uiAtlasPlan!.slots.length, 0) +
        artIds.length
    );
    expect(calls).toHaveLength(3 * (atlas.length + artIds.length));
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
    network.mockRestore();
  }
});

test('creates only required batches, keeps recognition and is idempotent', () => {
  const { current, group, cut } = fixture();
  const recognition = JSON.stringify(cut.uiRecognition);
  expect(syncUiBboxWorkflow(current, group.id, false)).toHaveLength(7);
  expect(current.nodes.filter((node) => node.uiAtlasPrelayout)).toHaveLength(2);
  const images = current.nodes.filter((node) => node.uiAtlasGroup && !node.uiAtlasPrelayout);
  expect(images.map((node) => node.uiAtlasGroup)).toEqual(['controls', 'panels']);
  expect(
    images
      .flatMap((node) => selectedUiAtlasPlan(current, node)!.slots)
      .filter((slot) => slot.role === 'element')
  ).toHaveLength(3);
  expect(syncUiBboxWorkflow(current, group.id, false)).toEqual([]);
  expect(JSON.stringify(cut.uiRecognition)).toBe(recognition);
  expect(syncUiBboxWorkflow(current, group.id, true)).toHaveLength(2);
  expect(syncUiBboxWorkflow(current, group.id, true)).toEqual([]);
  expect(syncUiBboxWorkflow(current, group.id, true, true)).toHaveLength(3);
  expect(
    current.nodes.find((node) => node.title === '美术字提取')?.generationDraft?.prompt
  ).toContain('纯绿色');
});

test('complex inputs expand beyond the simple case without duplicating existing work', () => {
  const { current, group } = fixture(false);
  syncUiBboxWorkflow(current, group.id, true);
  expect(current.nodes.filter((node) => node.uiAtlasPrelayout).length).toBeGreaterThan(2);
  const before = JSON.stringify(current);
  expect(syncUiBboxWorkflow(current, group.id, true)).toEqual([]);
  expect(JSON.stringify(current)).toBe(before);
});

test('retires unselected art text branches and restores them without deleting previous assets', () => {
  const { current, group, cut } = fixture();
  const texts = fixture(false).cut.uiRecognition!.results[0].bbox!.texts.slice(0, 2);
  const bbox = cut.uiRecognition!.results[0].bbox!;
  bbox.texts = [texts[0]];
  syncUiBboxWorkflow(current, group.id, [texts[0].id]);
  const branch = current.nodes.filter((node) => node.uiArtTextId === texts[0].id);
  const image = branch.find((node) => !node.uiAtlasPrelayout)!;
  const assets = current.nodes.find((node) =>
    current.edges.some(
      (edge) => edge.from === image.id && edge.to === node.id && edge.kind === 'image-assets'
    )
  )!;
  assets.imageAssetsInfo = {
    width: 32,
    height: 32,
    grid: { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
    items: [{ name: 'title', width: 32, height: 32, assetPath: 'old-title.png' }],
  };
  const previousAssets = structuredClone(assets.imageAssetsInfo);
  bbox.texts = [texts[1]];
  syncUiBboxWorkflow(current, group.id, [texts[1].id]);
  for (const node of [...branch, assets]) {
    expect(node.uiEmpty).toBe(true);
    expect(canvasNeedsProcessing(current, node)).toBe(false);
  }
  expect(assets.imageAssetsInfo).toEqual(previousAssets);
  bbox.texts = texts;
  expect(syncUiBboxWorkflow(current, group.id, [texts[0].id])).toEqual([]);
  for (const node of [...branch, assets]) {
    expect(node.uiEmpty).toBeUndefined();
    expect(node.templatePending).toBe(true);
  }
  expect(assets.imageAssetsInfo).toEqual(previousAssets);
});

test('refuses missing recognition, ordinary templates and overflow without partial changes', () => {
  const { current, group, cut } = fixture();
  cut.templatePending = true;
  expect(() => syncUiBboxWorkflow(current, group.id, false)).toThrow('识图');
  delete cut.templatePending;
  group.templateId = 'ordinary';
  delete group.templateCliOnly;
  expect(() => syncUiBboxWorkflow(current, group.id, false)).toThrow('仅 Bbox');
  group.templateId = '7e1cb6ad-732f-4dc3-a951-000000000015';
  while (current.nodes.length < 398)
    current.nodes.push({ ...cut, id: 'filler-' + current.nodes.length, sectionId: undefined });
  const before = JSON.stringify(current);
  expect(() => syncUiBboxWorkflow(current, group.id, true)).toThrow('容量');
  expect(JSON.stringify(current)).toBe(before);
});

test('dynamic cards survive controlled canvas parsing and preserve the CLI marker', () => {
  const { current, group } = fixture();
  syncUiBboxWorkflow(current, group.id, true);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbox-sync-'));
  try {
    const files = new MakerCanvasFiles(root);
    const parsed = (
      files as unknown as { parse(input: CanvasDocument, id: string): CanvasDocument }
    ).parse(current, current.id);
    expect(parsed.nodes).toHaveLength(current.nodes.length);
    expect(parsed.nodes.find((node) => node.id === group.id)?.templateCliOnly).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
