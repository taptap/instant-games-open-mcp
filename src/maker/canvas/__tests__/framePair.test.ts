import {
  framePairSources,
  setFramePairSource,
  validateFramePairGraph,
  validateFramePairVideo,
} from '../framePair.js';
import { canvasPresets } from '../presets.js';
import { createCanvasTemplateModel } from '../templates.js';
import { createId, emptyDocument } from '../model.js';
import {
  canvasNeedsProcessing,
  invalidateCanvasDependents,
  createTemplateWorkflow,
} from '../templateWorkflow.js';
import { videoInputSources } from '../videoInputs.js';
import { prepareCanvasReferences } from '../automationReferences.js';
import { prepareCanvasNodeUpdates } from '../automation.js';

function fixture() {
  const instance = createCanvasTemplateModel().instantiate(
    { ...canvasPresets()[2], builtin: true },
    { x: 0, y: 0 }
  );
  const document = { ...emptyDocument(), nodes: instance.nodes, edges: instance.edges };
  document.nodes.forEach((node) => delete node.templatePending);
  const video = document.nodes.find((node) => node.type === 'video-source')!;
  const images = document.nodes.filter((node) => node.type === 'image');
  return { document, pair: video, video, images };
}

test('CLI preserves explicit roles and rejects mode changes without changing old results', () => {
  const { document, video, images } = fixture();
  const plan = prepareCanvasReferences(document, {
    id: video.id,
    sourceIds: images.map((image) => image.id).reverse(),
  });
  expect(
    plan.edges.filter((edge) => edge.to === video.id).map((edge) => [edge.from, edge.kind])
  ).toEqual([
    [images[1].id, 'frame-first'],
    [images[0].id, 'frame-last'],
  ]);
  const before = JSON.stringify(document);
  expect(() =>
    prepareCanvasNodeUpdates(document, {
      nodes: [{ id: video.id, parameters: { mode: 'multi_modal_reference' } }],
    })
  ).toThrow('固定');
  expect(JSON.stringify(document)).toBe(before);
  expect(() =>
    prepareCanvasNodeUpdates(document, { nodes: [{ id: video.id, parameters: { duration: 4 } }] })
  ).not.toThrow();
});

test('roles survive shuffled storage and removing first never promotes last', () => {
  const { document, pair, video, images } = fixture();
  document.edges.reverse();
  document.nodes.reverse();
  expect(videoInputSources(document, video)).toEqual(images);
  expect(canvasNeedsProcessing(document, video)).toBe(false);
  setFramePairSource(document, pair.id, 'first', undefined, createId);
  expect(framePairSources(document, pair.id)).toEqual({ first: undefined, last: images[1] });
  expect(canvasNeedsProcessing(document, video)).toBe(true);
  expect(() =>
    validateFramePairVideo(document, video.id, 'first_last_frame', [images[1].id], [])
  ).toThrow('必填');
  expect(video.assetPath).toBeTruthy();
});

test('two required slots reject extra references, alternate modes, reversed order and duplicate sources', () => {
  const { document, pair, video, images } = fixture();
  const ids = images.map((node) => node.id);
  expect(() =>
    validateFramePairVideo(document, video.id, 'first_last_frame', ids, [])
  ).not.toThrow();
  for (const [mode, sourceIds, references] of [
    ['first_frame', ids, []],
    ['multi_modal_reference', ids, []],
    ['first_last_frame', ids, ['extra.png']],
    ['first_last_frame', [...ids].reverse(), []],
  ] as [string, string[], string[]][])
    expect(() => validateFramePairVideo(document, video.id, mode, sourceIds, references)).toThrow();
  expect(() => setFramePairSource(document, pair.id, 'first', images[1].id, createId)).toThrow();
  document.edges.push({ id: createId(), from: images[0].id, to: pair.id, kind: 'frame-first' });
  expect(() => validateFramePairGraph(document)).toThrow();
});

test('swapping roles invalidates results even when image set is unchanged', () => {
  const { document, pair, video, images } = fixture();
  for (const edge of document.edges.filter((edge) => edge.to === pair.id))
    edge.kind = edge.kind === 'frame-first' ? 'frame-last' : 'frame-first';
  expect(videoInputSources(document, video)).toEqual([...images].reverse());
  expect(canvasNeedsProcessing(document, video)).toBe(true);
});

test('changing either source invalidates only results, and CLI cannot bypass paired input', () => {
  const { document, pair, video, images } = fixture();
  invalidateCanvasDependents(document, images[1].id);
  expect(video.templatePending).toBe(true);
  expect(document.nodes.find((node) => node.type === 'sequence')?.templatePending).toBe(true);
  expect(() =>
    prepareCanvasReferences(document, { id: video.id, sourceIds: [images[0].id] })
  ).toThrow('两张');
});

test('template execution passes through paired input instead of treating it as a missing image', async () => {
  const { document, video } = fixture();
  video.templatePending = true;
  const runVideo = jest.fn(async () => true);
  const workflow = createTemplateWorkflow({
    getDocument: () => document,
    save: async () => true,
    changed: () => {},
    render: () => {},
    error: (message) => {
      throw new Error(message);
    },
    confirm: () => true,
    video: runVideo,
    sequence: async () => {},
    animation: () => {},
    select: () => {},
    importImage: () => {},
  });
  expect(await workflow.runQueued(video.id)).toBe(true);
  expect(runVideo).toHaveBeenCalledWith(video.id, 5, true);
});
