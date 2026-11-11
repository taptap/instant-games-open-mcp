import { canvasPresets } from '../presets.js';
import { createCanvasTemplateModel } from '../templates.js';
import { createId, emptyDocument, type CanvasDocument } from '../model.js';
import { remapTemplateAssets, templateAssetPaths } from '../templateArchive.js';
import { syncUiBboxWorkflow } from '../uiBboxWorkflow.js';
import { createUi015Workflow } from '../../../../packages/maker-canvas/src/browser/ui015Workflow.js';
import { bboxRecognitionElements } from '../uiRecognition.js';
import {
  ensureUiAtlasBatchCards,
  selectedUiAtlasPlan,
  uiAtlasOrderPrompt,
} from '../uiAssetBindings.js';
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

// The complex fixture encodes native-size PNGs and exports the complete ZIP.
jest.setTimeout(60000);

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

test.each([false, true])(
  '015 preserves default background choice and full-screen UI panels: %s',
  async (fullPanel) => {
    const { current, group, cut } = fixture();
    const bbox = cut.uiRecognition!.results[0].bbox!;
    if (fullPanel) bbox.elements[0].bbox = [0, 0, bbox.design.width, bbox.design.height];
    const workflow = createUi015Workflow({
      current: () => current,
      needs: () => false,
      runImage: async () => true,
      recognize: async () => true,
      recoverImage: async () => 'recovered',
      recoverRecognition: async () => 'released',
      chooseDesign() {},
      sync: syncUiBboxWorkflow,
      queue: { start: () => true, spendRetry: () => 0, view: () => undefined, remaining: () => 1 },
      focus() {},
      remember() {},
      save: async () => true,
      changed() {},
      render() {},
      error: (message) => {
        throw new Error(message);
      },
      log() {},
      store: {},
    });
    const result = await workflow.advance(group.id);
    expect(result.status).toBe('started');
    // A full-screen UI panel already fills the background branch; nothing extra is added.
    expect(result.choice?.background).toBe(!fullPanel);
    const backgrounds = current.nodes.filter(
      (node) => node.uiAtlasGroup === 'background' && !node.uiEmpty
    );
    expect(backgrounds.length > 0).toBe(true);
    const prelayout = backgrounds.find((node) => node.uiAtlasPrelayout)!;
    const backgroundPlan = selectedUiAtlasPlan(current, prelayout)!;
    const references = canvasReferences(current, prelayout.id);
    expect(references).toHaveLength(1);
    expect(references[0].assetPath).toBe(fullPanel ? bbox.cutSource.path : bbox.design.path);
    expect(backgroundPlan.slots[0].role).toBe(fullPanel ? 'element' : 'background');
    if (fullPanel) expect(backgroundPlan.nativeLayout).toBeDefined();
    else {
      expect(backgroundPlan.nativeLayout).toBeUndefined();
      expect(prelayout.generation?.parameters?.aspectRatio).toBe('source');
    }
    const ids = current.nodes
      .filter(
        (node) =>
          node.type === 'image' && node.uiAtlasGroup && !node.uiAtlasPrelayout && !node.uiEmpty
      )
      .flatMap((node) =>
        selectedUiAtlasPlan(current, node)!.slots.flatMap((slot) => slot.elementIds)
      );
    expect(ids).toContain('E001');
    expect(ids).toContain('E002');
  }
);

test('stopping during preparation prevents recovery, batch creation and queue start', async () => {
  const { current, group, cut } = fixture();
  delete cut.uiRecognition!.selectedId;
  cut.uiRecognition!.results = [];
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const sync = jest.fn(syncUiBboxWorkflow);
  const start = jest.fn(() => true);
  const recoverImage = jest.fn(async () => 'recovered' as const);
  const workflow = createUi015Workflow({
    current: () => current,
    needs: () => false,
    runImage: async (_id, shouldContinue) => {
      await pending;
      return shouldContinue!();
    },
    recognize: async () => true,
    recoverImage,
    recoverRecognition: async () => 'released',
    chooseDesign() {},
    sync,
    queue: { start, spendRetry: () => 0, view: () => undefined, remaining: () => 1 },
    focus() {},
    remember() {},
    save: async () => true,
    changed() {},
    render() {},
    error() {},
    log() {},
    store: {},
  });
  const run = workflow.advance(group.id);
  expect(workflow.isActive(group.id)).toBe(true);
  workflow.stop(group.id);
  finish();
  expect((await run).status).toBe('waiting');
  expect(workflow.isActive(group.id)).toBe(false);
  expect(sync).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  expect(recoverImage).not.toHaveBeenCalled();
});

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
  const texts = fixture(false)
    .cut.uiRecognition!.results[0].bbox!.texts.slice(0, 2)
    .map((text) => ({ ...text, parentId: null }));
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

test('hollow frames never receive the filled-panel slot instruction', () => {
  const { current, group, cut } = fixture();
  cut.uiRecognition!.results[0].bbox!.elements = [
    { id: 'E001', name: '目标锁定框', type: 'frame', bbox: [100, 100, 80, 80], parent: null },
  ];
  syncUiBboxWorkflow(current, group.id, [], false);
  const image = current.nodes.find(
    (node) => node.uiAtlasGroup === 'equipment' && !node.uiAtlasPrelayout
  )!;
  const prompt = uiAtlasOrderPrompt(selectedUiAtlasPlan(current, image)!);
  expect(prompt).toContain('空心锁定框、准星框内部必须 Alpha=0');
  expect(prompt).not.toContain('此项要的是空底板');
});

test('015 fixed background card is the sole background resource source', () => {
  const { current, group, cut } = fixture();
  const design = current.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
  const background = {
    id: createId(),
    type: 'image' as const,
    x: design.x + design.width * 3 + 60,
    y: design.y,
    width: design.width,
    height: design.height,
    title: '④ 独立背景图',
    sectionId: group.id,
    templatePending: true,
    uiBackground: true,
    uiAtlasGroup: 'background' as const,
    uiAtlasBatch: 0,
    referenceInput: { includeSelf: false },
    generationDraft: {
      operation: 'variant' as const,
      prompt: '完整环境背景',
      parameters: { resolution: '2K' as const, aspectRatio: 'source' as const },
    },
  };
  current.nodes.push(background);
  current.edges.push({
    id: createId(),
    from: design.id,
    to: background.id,
    kind: 'image-variant',
  });
  syncUiBboxWorkflow(current, group.id, [], false);
  const backgroundAssets = current.nodes.filter(
    (node) => node.type === 'image-assets' && node.title === '环境背景 · 1'
  );
  expect(backgroundAssets).toHaveLength(1);
  expect(
    current.edges.some(
      (edge) =>
        edge.from === background.id &&
        edge.to === backgroundAssets[0].id &&
        edge.kind === 'image-assets'
    )
  ).toBe(true);
  expect(
    current.nodes.some(
      (node) => node.uiAtlasGroup === 'background' && node.uiAtlasPrelayout && !node.uiBackground
    )
  ).toBe(false);
  expect(selectedUiAtlasPlan(current, background)!.slots[0].role).toBe('background');
  expect(cut.uiRecognition?.results).toHaveLength(1);
});

test('an unresolved image stops 015 with its original error instead of attempting assembly', async () => {
  const { current, group } = fixture();
  let failedId = '';
  const assembleUi = jest.fn();
  const workflow = createUi015Workflow({
    current: () => current,
    needs: (id) => Boolean(current.nodes.find((n) => n.id === id)?.templatePending),
    runImage: async () => true,
    recognize: async () => true,
    recoverImage: async () => 'blocked',
    recoverRecognition: async () => 'released',
    chooseDesign() {},
    sync: syncUiBboxWorkflow,
    queue: {
      start: () => true,
      spendRetry: () => 0,
      remaining: () => 1,
      view: () =>
        failedId ? { phase: 'complete', failures: { [failedId]: 'upstream unknown' } } : undefined,
    },
    focus() {},
    remember() {},
    save: async () => true,
    changed() {},
    render() {},
    error() {},
    log() {},
    failure: () => 'upstream unknown',
    store: { assembleUi },
  });
  expect((await workflow.advance(group.id)).status).toBe('started');
  failedId = current.nodes.find((n) => n.uiAtlasGroup && !n.uiAtlasPrelayout)!.id;
  workflow.settled(group.id);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(workflow.outcome(group.id)).toMatchObject({
    status: 'failed',
    stage: 'generation',
    message: 'upstream unknown',
  });
  expect(assembleUi).not.toHaveBeenCalled();
});

test('fixed environment and full-screen UI panel retain distinct plans and survive repeated sync', () => {
  const { current, group, cut } = fixture();
  const design = current.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
  const bbox = cut.uiRecognition!.results[0].bbox!;
  bbox.elements[0].bbox = [0, 0, bbox.design.width, bbox.design.height];
  const background = {
    ...design,
    id: createId(),
    title: 'environment',
    sectionId: group.id,
    uiRecognition: undefined,
    uiBackground: true,
    uiAtlasGroup: 'background' as const,
    uiAtlasBatch: 0,
    generation: undefined,
    generationDraft: {
      operation: 'variant' as const,
      prompt: 'scene',
      parameters: { aspectRatio: 'source' },
    },
  };
  current.nodes.push(background);
  current.edges.push({ id: createId(), from: design.id, to: background.id, kind: 'image-variant' });
  syncUiBboxWorkflow(current, group.id, [], true);
  expect(selectedUiAtlasPlan(current, background)!.slots).toEqual([
    { elementIds: [], state: 'normal', role: 'background' },
  ]);
  const panel = current.nodes.find(
    (node) => node.uiAtlasGroup === 'background' && node.uiAtlasPrelayout
  )!;
  expect(selectedUiAtlasPlan(current, panel)!.slots[0].elementIds).toEqual(['E001']);
  expect(canvasReferences(current, panel.id).map((node) => node.id)).toEqual([cut.id]);
  const count = current.nodes.length;
  syncUiBboxWorkflow(current, group.id, [], true);
  expect(current.nodes).toHaveLength(count);
  expect(selectedUiAtlasPlan(current, background)!.slots[0].role).toBe('background');
});

test.each([false, true])(
  'legacy background source is migrated only before generation: %s',
  (completed) => {
    const { current, group, cut } = fixture();
    const design = current.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
    syncUiBboxWorkflow(current, group.id, [], true);
    const prelayout = current.nodes.find(
      (node) => node.uiAtlasGroup === 'background' && node.uiAtlasPrelayout
    )!;
    const edge = current.edges.find((edge) => edge.to === prelayout.id)!;
    edge.from = cut.id;
    prelayout.assetPath = cut.assetPath;
    if (completed) {
      delete prelayout.templatePending;
      prelayout.generation!.attemptId = createId();
      prelayout.sourceSnapshot = snapshotCanvasSource(cut);
    }
    const before = structuredClone(prelayout);
    expect(() => syncUiBboxWorkflow(current, group.id, [], true)).not.toThrow();
    expect(edge.from).toBe(completed ? cut.id : design.id);
    if (completed) expect(prelayout).toEqual(before);
  }
);
