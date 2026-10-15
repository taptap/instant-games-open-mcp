import { createId, emptyDocument } from '../model.js';
import { canvasPresets } from '../presets.js';
import { createCanvasTemplateModel } from '../templates.js';
import { ensureUiAtlasBatchCards, selectedUiAtlasPlan } from '../uiAssetBindings.js';
import { bboxRecognitionElements } from '../uiRecognition.js';
import { createUiRecognitionUi } from '../uiRecognitionUi.js';
import { canvasReferences, snapshotCanvasSource } from '../dependencies.js';
import {
  canvasNeedsProcessing,
  invalidateCanvasDependents,
  createTemplateWorkflow,
} from '../templateWorkflow.js';
import { applyImageAssets } from '../imageAssets.js';
import { validateResourceBundle } from '../resourceBundle.js';
import type { CanvasDocumentStore } from '../store.js';
import { batchRecognitionFixture } from './fixtures/uiRecognition.js';

test.each([
  ['000013', false],
  ['000013', true],
  ['000015', false],
  ['000015', true],
] as const)(
  '%s skips obsolete batches and resumes them (complete initial output: %s)',
  async (suffix, completeInitial) => {
    const preset = canvasPresets().find((item) => item.id.endsWith(suffix))!;
    const instance = createCanvasTemplateModel().instantiate(preset, { x: 0, y: 0 });
    const document = { ...emptyDocument(), nodes: instance.nodes, edges: instance.edges };
    const cut = document.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
    const design = document.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
    const recognized = batchRecognitionFixture(design, cut);
    recognized.bbox!.design.path = design.assetPath = 'assets/image/canvas-' + createId() + '.png';
    recognized.bbox!.cutSource.path =
      recognized.sourcePath =
      cut.assetPath =
        'assets/image/canvas-' + createId() + '.png';
    for (const node of [design, cut]) {
      delete node.templatePending;
      delete node.sourceSnapshot;
      delete node.sourceSnapshots;
    }
    cut.uiRecognition = {
      enabled: true,
      inputRole: 'text-free',
      selectedId: recognized.id,
      results: [recognized],
    };
    ensureUiAtlasBatchCards(document);
    const originalIds = document.nodes.map((node) => node.id);
    const complex = structuredClone(recognized);
    const controller = createUiRecognitionUi({
      current: () => document,
      store: {} as CanvasDocumentStore,
      save: async () => true,
      remember() {},
      changed() {},
      render() {},
      blocked: () => false,
      error() {},
      loadMedia: async () => {},
      openCanvas: async () => {},
    });
    const generated: string[] = [];
    const errors: string[] = [];
    const workflow = createTemplateWorkflow({
      getDocument: () => document,
      save: async () => true,
      changed() {},
      render() {},
      error: (value) => errors.push(value),
      confirm: () => true,
      video: async () => false,
      sequence: async () => {},
      animation() {},
      select() {},
      importImage() {},
      image: (id) =>
        controller.runImage(id, async () => {
          const node = document.nodes.find((item) => item.id === id)!;
          generated.push(id);
          node.assetPath = 'assets/image/canvas-' + createId() + '.png';
          const plan = selectedUiAtlasPlan(document, node);
          node.generation = { prompt: 'mock generation', uiAtlasPlan: plan };
          node.sourceSnapshots = canvasReferences(document, id).map(
            (source) => snapshotCanvasSource(source)!
          );
          delete node.templatePending;
          return true;
        }),
      assets: (id) =>
        controller.runAssets(id, async () => {
          const source = canvasReferences(document, id)[0];
          const plan = source.generation?.uiAtlasPlan;
          const layout = plan?.nativeLayout;
          const grid = plan?.grid || {
            columns: 1,
            rows: 1,
            marginX: 0,
            marginY: 0,
            gapX: 0,
            gapY: 0,
          };
          applyImageAssets(
            document,
            source.id,
            {
              width: layout?.width ?? grid.columns * 32,
              height: layout?.height ?? grid.rows * 32,
              grid,
              ...(layout
                ? { regions: structuredClone(layout.regions), cutMode: 'grid' as const }
                : {}),
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
          return true;
        }),
    });
    for (const simple of completeInitial ? [false, true, false] : [true, false]) {
      const priorImages = document.nodes
        .filter((node) => node.uiAtlasGroup && node.assetPath)
        .map((node) => [node.id, node.assetPath]);
      const next = structuredClone(complex);
      next.id = createId();
      if (simple) {
        const { width, height } = next.bbox!.design;
        next.bbox!.elements = [
          { id: 'E001', name: 'panel', type: 'panel', bbox: [0, 0, width, height], parent: null },
          { id: 'E002', name: 'button', type: 'button', bbox: [20, 20, 100, 30], parent: 'E001' },
        ];
        next.bbox!.texts = [];
      }
      next.elements = bboxRecognitionElements(next.bbox!);
      cut.uiRecognition!.results = [next];
      cut.uiRecognition!.selectedId = next.id;
      invalidateCanvasDependents(document, cut.id);
      ensureUiAtlasBatchCards(document);
      const skipped = document.nodes.filter(
        (node) =>
          node.uiAtlasGroup &&
          selectedUiAtlasPlan(document, node)!.slots.every((slot) => slot.role === 'reserve')
      );
      if (simple) expect(skipped.length).toBeGreaterThan(0);
      generated.length = 0;
      const pending = document.nodes.filter(
        (node) =>
          ['image', 'image-assets'].includes(node.type) && canvasNeedsProcessing(document, node)
      );
      while (pending.length) {
        const index = pending.findIndex((node) =>
          canvasReferences(document, node.id).every(
            (source) => !pending.some((item) => item.id === source.id)
          )
        );
        expect(index).toBeGreaterThanOrEqual(0);
        const [node] = pending.splice(index, 1);
        if (!simple && node.uiEmpty && node.type === 'image-assets')
          expect(node.templatePending).toBe(true);
        const ok = await workflow.runQueued(node.id);
        expect({ title: node.title, ok, errors }).toEqual({
          title: node.title,
          ok: true,
          errors: [],
        });
      }
      expect(errors).toEqual([]);
      for (const node of skipped) {
        expect(node.uiEmpty).toBe(true);
        expect(generated).not.toContain(node.id);
        expect(canvasNeedsProcessing(document, node)).toBe(false);
      }
      const bundle = document.nodes.find((node) => node.type === 'resource-bundle')!;
      const exported = validateResourceBundle(document, bundle.id, Number.MAX_SAFE_INTEGER);
      expect(exported.every((node) => !node.uiEmpty)).toBe(true);
      expect(exported.length).toBeGreaterThan(0);
      if (simple) {
        for (const [id, assetPath] of priorImages.filter(([id]) =>
          skipped.some((node) => node.id === id)
        ))
          expect(document.nodes.find((node) => node.id === id)!.assetPath).toBe(assetPath);
      } else {
        for (const node of document.nodes.filter(
          (node) => node.uiAtlasGroup && !skipped.includes(node)
        )) {
          expect(node.uiEmpty).toBeUndefined();
          expect(generated).toContain(node.id);
        }
        expect(exported).toHaveLength(
          document.nodes.filter((node) => node.type === 'image-assets' && !node.uiEmpty).length
        );
      }
      expect(document.nodes.map((node) => node.id)).toEqual(originalIds);
    }
  }
);
