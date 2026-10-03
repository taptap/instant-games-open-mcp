import { runInNewContext } from 'node:vm';
import {
  canvasGenerationParameterChoices,
  canvasParameterSchema,
  selectCanvasSnapshot,
  type CanvasInfoNode,
  type CanvasInfoSnapshot,
} from '../automationInfo.js';
import { canvasAutomationCapabilities, prepareCanvasNodeUpdates } from '../automation.js';
import { emptyDocument } from '../model.js';
import { defaultSequenceSettings } from '../sequenceModel.js';

function node(id: string, type: CanvasInfoNode['type'], extra: Partial<CanvasInfoNode> = {}) {
  return { id, type, title: id, x: 0, y: 0, width: 240, height: 200, ...extra };
}

function fixture(): CanvasInfoSnapshot & { title: string; capturedAt: string } {
  return {
    id: 'canvas',
    title: 'Original canvas',
    revision: 42,
    source: 'live',
    capturedAt: '2026-10-04T00:00:00.000Z',
    blocked: 'Unsaved panel draft',
    nodes: [
      node('group', 'section'),
      node('external-group', 'section'),
      node('other-group', 'section'),
      node('ancestor', 'image'),
      node('reference', 'image', { sectionId: 'external-group', assetPath: 'ref.png' }),
      node('video', 'video-source', { sectionId: 'group', templatePending: true }),
      node('sequence', 'sequence', { sectionId: 'group' }),
      node('sibling', 'image', { sectionId: 'group' }),
      node('unrelated', 'image', { sectionId: 'other-group' }),
    ],
    edges: [
      { id: 'ancestor-ref', from: 'ancestor', to: 'reference', kind: 'image-variant' },
      { id: 'ref-video', from: 'reference', to: 'video', kind: 'first-frame' },
      { id: 'video-seq', from: 'video', to: 'sequence', kind: 'sequence-source' },
      { id: 'ref-other', from: 'reference', to: 'unrelated', kind: 'image-variant' },
    ],
    queues: ['group', 'external-group', 'other-group'].map((groupId) => ({
      groupId,
      pending: groupId === 'group' ? ['video', 'sequence', 'sibling'] : [],
      completed: 2,
      total: 5,
      active: groupId === 'group' ? 'video' : undefined,
      phase: 'running',
      message: 'Captured queue state',
      stopping: false,
    })),
    templateFlow: {
      imageId: 'reference',
      videoId: 'video',
      sequenceId: 'sequence',
      duration: 4,
      stage: 'video',
    },
  };
}

test.each([true, false])('choices match update validation and schema (image=%s)', (image) => {
  const choices = canvasGenerationParameterChoices(image);
  const schema = canvasParameterSchema()[image ? 'image' : 'video'];
  const document = emptyDocument();
  document.nodes = [node('target', image ? 'image' : 'video')];
  expect(Object.keys(schema.properties)).toEqual(Object.keys(choices));
  expect(schema.additionalProperties).toBe(false);
  for (const [name, values] of Object.entries(choices)) {
    expect(schema.properties[name].enum).toEqual(values);
    for (const value of values) {
      const updates = prepareCanvasNodeUpdates(document, {
        nodes: [{ id: 'target', parameters: { [name]: value } }],
      });
      expect(updates[0].node.generationDraft?.parameters).toEqual({ [name]: value });
    }
    for (const value of [null, true, 'unsupported', {}, []]) {
      expect(() =>
        prepareCanvasNodeUpdates(document, {
          nodes: [{ id: 'target', parameters: { [name]: value } }],
        })
      ).toThrow();
    }
  }
  choices.model.push('mutated');
  expect(canvasGenerationParameterChoices(image).model).not.toContain('mutated');
});

test('schema documents the execution combination without widening CLI choices', () => {
  const { image, video } = canvasParameterSchema();
  expect(image.properties.model.enum).toEqual(['auto', 'gpt', 'nanobanana']);
  expect(video.properties.duration).toEqual({ type: 'integer', enum: [4, 5, 6, 7, 8] });
  expect(video.properties.ratio.enum).toEqual(['adaptive', '1:1', '16:9', '9:16']);
  expect(video.allOf).toEqual([
    {
      if: {
        properties: {
          model: { const: '2.5' },
          mode: { enum: ['first_frame', 'first_last_frame'] },
        },
        required: ['model', 'mode'],
      },
      then: { properties: { ratio: { const: 'adaptive' } } },
    },
  ]);
  expect(video.description).toContain('effective execution settings');
  expect(video.description).toContain('multi_modal_reference permits all listed ratios');
});

test('sequence schema exposes exactly editable fields and cross-field limits', () => {
  const { sequence } = canvasParameterSchema();
  expect(Object.keys(sequence.properties).sort()).toEqual(
    [...canvasAutomationCapabilities().sequenceSettings].sort()
  );
  expect(sequence.properties.fps).toEqual({ type: 'number', minimum: 1, maximum: 30 });
  expect(sequence.properties.width).toEqual({ type: 'integer', minimum: 1, maximum: 2048 });
  expect(sequence.properties.height).toEqual(sequence.properties.width);
  expect(sequence.properties.tolerance).toEqual({ type: 'number', minimum: 0, maximum: 255 });
  expect(sequence['x-constraints']).toEqual({
    interval: { left: 'end', operator: '>', right: 'start' },
    frameCount: { expression: 'ceil((end - start) * fps - 1e-8)', maximum: 120 },
  });
  expect(new RegExp(sequence.properties.backgroundColor.pattern).test('#aBcD09')).toBe(true);
  expect(new RegExp(sequence.properties.backgroundColor.pattern).test('#abc')).toBe(false);
});

test.each([
  [{ start: 0, end: 4, fps: 30, width: 1, height: 2048, tolerance: 255 }, true],
  [{ start: 86399, end: 86400, fps: 1, tolerance: 0 }, true],
  [{ fps: 1.5, tolerance: 0.5 }, true],
  [{ start: -0.1 }, false],
  [{ end: 0 }, false],
  [{ start: 86399, end: 86400.1, fps: 1 }, false],
  [{ end: 4.01, fps: 30 }, false],
  [{ fps: 0.99 }, false],
  [{ fps: 30.01 }, false],
  [{ width: 1.5 }, false],
  [{ height: 2049 }, false],
  [{ tolerance: 255.1 }, false],
  [{ fps: Infinity }, false],
  [{ cutout: 'true' }, false],
  [{ duplicateThreshold: 0.9 }, false],
])('sequence ranges agree with existing update validation: %j', (settings, accepted) => {
  const document = emptyDocument();
  document.nodes = [node('sequence', 'sequence', { sequenceSettings: defaultSequenceSettings() })];
  const update = () =>
    prepareCanvasNodeUpdates(document, {
      nodes: [{ id: 'sequence', sequenceSettings: settings }],
    });
  if (accepted) expect(update).not.toThrow();
  else expect(update).toThrow();
});

test('single-card scope includes only the target and direct upstream, with original metadata', () => {
  const snapshot = fixture();
  const result = selectCanvasSnapshot(snapshot, 'video');
  expect(result.nodes.map((item) => item.id)).toEqual(['reference', 'video']);
  expect(result.edges).toEqual([snapshot.edges[1]]);
  expect(result.queues).toEqual(snapshot.queues!.slice(0, 2));
  expect(result.scope).toMatchObject({
    kind: 'node',
    id: 'video',
    targetIds: ['video'],
    upstreamIds: ['reference'],
    upstreamDepth: 1,
    readOnly: true,
    queues: 'whole-matching-groups',
  });
  expect(result).toMatchObject({
    id: snapshot.id,
    revision: snapshot.revision,
    title: snapshot.title,
    source: snapshot.source,
    blocked: snapshot.blocked,
    capturedAt: snapshot.capturedAt,
  });
  expect(result.templateFlow).toBeUndefined();
  expect(result.guidance.items.map((item) => item.nodeId)).toEqual(['video']);
});

test('group scope includes members and external direct dependencies, without sibling groups', () => {
  const snapshot = fixture();
  const result = selectCanvasSnapshot(snapshot, 'group');
  expect(result.nodes.map((item) => item.id)).toEqual([
    'group',
    'reference',
    'video',
    'sequence',
    'sibling',
  ]);
  expect(result.edges.map((edge) => edge.id)).toEqual(['ref-video', 'video-seq']);
  expect(result.scope.kind).toBe('group');
  expect(result.scope.upstreamIds).toEqual(['reference']);
  expect(result.templateFlow).toEqual(snapshot.templateFlow);
  expect(result.queues?.map((queue) => queue.groupId)).toEqual(['group', 'external-group']);
});

test('whole-canvas scope is explicit and unknown IDs never fall back to the whole graph', () => {
  const snapshot = fixture();
  const result = selectCanvasSnapshot(snapshot);
  expect(result.scope.kind).toBe('canvas');
  expect(result.nodes).toEqual(snapshot.nodes);
  expect(result.edges).toEqual(snapshot.edges);
  expect(result.queues).toEqual(snapshot.queues);
  for (const id of ['', 'missing', snapshot.id])
    expect(() => selectCanvasSnapshot(snapshot, id)).toThrow('不存在');
});

test('cycles, duplicate inputs and missing upstream nodes do not expand the scope', () => {
  const snapshot = fixture();
  snapshot.edges.push(
    { id: 'cycle', from: 'video', to: 'reference', kind: 'image-variant' },
    { id: 'duplicate', from: 'reference', to: 'video', kind: 'image-to-video' },
    { id: 'missing', from: 'absent', to: 'video', kind: 'first-frame' }
  );
  const result = selectCanvasSnapshot(snapshot, 'video');
  expect(result.scope.upstreamIds).toEqual(['reference', 'absent']);
  expect(result.nodes.map((item) => item.id)).toEqual(['reference', 'video']);
  expect(result.edges.map((edge) => edge.id)).toEqual(['ref-video', 'duplicate', 'missing']);
});

test('selection and guidance do not mutate frozen snapshot data', () => {
  const snapshot = fixture();
  const before = JSON.stringify(snapshot);
  const freeze = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  };
  freeze(snapshot);
  selectCanvasSnapshot(snapshot, 'video');
  selectCanvasSnapshot(snapshot, 'group');
  selectCanvasSnapshot(snapshot);
  expect(JSON.stringify(snapshot)).toBe(before);
  expect(snapshot).not.toHaveProperty('scope');
  expect(snapshot).not.toHaveProperty('guidance');
});

test.each(['pending', 'running', 'unknown', 'canceled', 'timedout'])(
  'query guidance uses captured canQuery for %s, not a workflow inference',
  (status) => {
    const snapshot = fixture();
    snapshot.nodes.find((item) => item.id === 'video')!.state = {
      generation: { status, canQuery: true },
    };
    const result = selectCanvasSnapshot(snapshot, 'video');
    expect(result.guidance.items).toEqual([
      expect.objectContaining({ nodeId: 'video', action: 'query' }),
    ]);
    expect(result.guidance.advisory).toBe(true);
    expect(result).not.toHaveProperty('canRun');
    snapshot.nodes.find((item) => item.id === 'video')!.state!.generation!.canQuery = false;
    expect(selectCanvasSnapshot(snapshot, 'video').guidance.items).toEqual([]);
  }
);

test('saved and unlabeled snapshots never acquire live execution state', () => {
  const snapshot = fixture();
  snapshot.source = 'saved';
  delete snapshot.queues;
  delete snapshot.blocked;
  const video = snapshot.nodes.find((item) => item.id === 'video')!;
  video.state = { generation: { status: 'pending', canQuery: true } };
  const result = selectCanvasSnapshot({ ...snapshot, executionState: 'unavailable' }, 'video');
  expect(result.source).toBe('saved');
  expect(result.executionState).toBe('unavailable');
  expect(result).not.toHaveProperty('queues');
  expect(result).not.toHaveProperty('blocked');
  expect(result.guidance).toMatchObject({ basis: 'saved', requiresLiveInspection: true });
  expect(result.guidance.items[0].action).toBe('check-upstream-and-run');
  delete snapshot.source;
  expect(selectCanvasSnapshot(snapshot, 'video').source).toBeUndefined();
  expect(selectCanvasSnapshot(snapshot, 'video').guidance.basis).toBe('unspecified');
});

test('result and input hints use recorded assets and edges, not historical task IDs or sources', () => {
  const snapshot = fixture();
  const video = snapshot.nodes.find((item) => item.id === 'video')!;
  video.templatePending = false;
  video.generation = { prompt: 'move', taskId: 'completed-task', sourceImageId: 'reference' };
  video.assetPath = 'video.mp4';
  expect(selectCanvasSnapshot(snapshot, 'video').guidance.items[0].action).toBe('export');
  video.templatePending = true;
  expect(selectCanvasSnapshot(snapshot, 'video').guidance.items[0].action).toBe(
    'check-upstream-and-run'
  );
  video.templatePending = false;
  delete video.assetPath;
  expect(selectCanvasSnapshot(snapshot, 'video').guidance.items).toEqual([]);
  snapshot.edges = [];
  expect(selectCanvasSnapshot(snapshot, 'video').guidance.items[0].action).toBe('set-references');
  video.generation.referenceImagePaths = ['imported.png'];
  expect(selectCanvasSnapshot(snapshot, 'video').guidance.items).toEqual([]);
  const sequence = snapshot.nodes.find((item) => item.id === 'sequence')!;
  sequence.assetPath = 'atlas.png';
  expect(selectCanvasSnapshot(snapshot, 'sequence').guidance.items).toEqual([]);
});

test('all runtime dependencies can be injected using exported function toString alone', () => {
  const functions = [canvasGenerationParameterChoices, canvasParameterSchema, selectCanvasSnapshot];
  const script = functions.map((fn) => fn.toString()).join('\n');
  const injected = runInNewContext(
    script + '\n({ canvasGenerationParameterChoices, canvasParameterSchema, selectCanvasSnapshot })'
  ) as {
    canvasGenerationParameterChoices: typeof canvasGenerationParameterChoices;
    canvasParameterSchema: typeof canvasParameterSchema;
    selectCanvasSnapshot: typeof selectCanvasSnapshot;
  };
  expect(injected.canvasGenerationParameterChoices(false)).toEqual(
    canvasGenerationParameterChoices(false)
  );
  expect(injected.canvasParameterSchema()).toEqual(canvasParameterSchema());
  expect(injected.selectCanvasSnapshot(fixture(), 'group')).toEqual(
    selectCanvasSnapshot(fixture(), 'group')
  );
});
