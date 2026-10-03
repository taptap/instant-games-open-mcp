import { applyCanvasReferences, prepareCanvasReferences } from '../automationReferences.js';
import { snapshotCanvasSource } from '../dependencies.js';
import type { CanvasDocument, CanvasNode } from '../model.js';

function card(id: string, patch: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id,
    type: 'image',
    title: id,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    assetPath: 'assets/image/' + id + '.png',
    ...patch,
  };
}

function fixture(targetPatch: Partial<CanvasNode> = {}): CanvasDocument {
  return {
    id: 'canvas',
    title: 'Canvas',
    revision: 7,
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: [card('target', targetPatch), card('old'), card('first'), card('last')],
    edges: [],
    deletedGenerationIds: ['deleted-attempt'],
  };
}

function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(freezeDeep);
  Object.freeze(value);
}

test('marks grouped targets pending and allocates edge IDs before changing the document', () => {
  const document = fixture({ sectionId: 'group' });
  document.edges.push({ id: 'existing', from: 'first', to: 'target', kind: 'image-variant' });
  const plan = prepareCanvasReferences(document, { id: 'target', sourceIds: ['last', 'first'] });
  expect(plan.node.templatePending).toBe(true);
  expect(plan.edges[1].id).toBe('existing');
  const before = JSON.stringify(document);
  expect(() =>
    applyCanvasReferences(document, plan, () => {
      throw new Error('分配失败');
    })
  ).toThrow('分配失败');
  expect(JSON.stringify(document)).toBe(before);
  applyCanvasReferences(document, plan, () => 'new');
  expect(document.nodes[0].templatePending).toBe(true);
  expect(document.edges.map((edge) => edge.id)).toEqual(['new', 'existing']);
});

test('returns an ordered reference plan without modifying assets, history or graph', () => {
  const document = fixture({
    generation: {
      prompt: 'Original prompt',
      operation: 'variant',
      attemptId: 'original-attempt',
      sourceImageId: 'old',
      sourceImageIds: ['old'],
      referenceImagePaths: ['assets/image/imported.png'],
    },
  });
  document.nodes[0].sourceSnapshot = snapshotCanvasSource(document.nodes[1]);
  document.edges.push({ id: 'old-edge', from: 'old', to: 'target', kind: 'image-variant' });
  const original = JSON.stringify(document);
  const input = { id: 'target', sourceIds: ['last', 'first'], includeSelf: true };
  freezeDeep(document);
  freezeDeep(input);

  const plan = prepareCanvasReferences(document, input);

  expect(plan.node.referenceInput).toEqual({ includeSelf: true });
  expect(plan.node.generation).toEqual({
    ...document.nodes[0].generation,
    referenceImagePaths: [],
  });
  expect(plan.edges.map((edge) => edge.from)).toEqual(['last', 'first']);
  plan.node.generation!.sourceImageIds!.push('changed');
  plan.edges[0].from = 'changed';
  expect(input.sourceIds).toEqual(['last', 'first']);
  expect(JSON.stringify(document)).toBe(original);
});

test.each(['image', 'video', 'video-source'] as const)(
  'supports replacing and clearing references on %s cards',
  (type) => {
    const document = fixture({ type, ...(type === 'video' ? { assetPath: undefined } : {}) });
    const target = document.nodes[0];
    const plan = prepareCanvasReferences(document, { id: 'target', sourceIds: ['first'] });
    const kind =
      type === 'image' ? 'image-variant' : type === 'video' ? 'first-frame' : 'image-to-video';
    expect(plan.edges).toEqual([{ id: undefined, from: 'first', to: 'target', kind }]);
    expect(applyCanvasReferences(document, plan, () => 'new-edge')).toBe(target);
    expect(document.edges[0].id).toBe('new-edge');
    applyCanvasReferences(
      document,
      prepareCanvasReferences(document, { id: 'target', sourceIds: [] }),
      () => 'unused'
    );
    expect(document.edges).toEqual([]);
    expect(target.referenceInput).toEqual({ includeSelf: false });
  }
);

test('clearing removes input edges and imported references but preserves identity and unrelated connections', () => {
  const document = fixture({
    generation: {
      prompt: 'Old',
      sourceImageId: 'old',
      sourceImageIds: ['first'],
      referenceImagePaths: ['assets/image/imported.png'],
    },
  });
  document.edges.push({ id: 'edge', from: 'last', to: 'target', kind: 'image-variant' });
  document.edges.push({ id: 'unrelated', from: 'first', to: 'last', kind: 'image-variant' });
  const plan = prepareCanvasReferences(document, { id: 'target', sourceIds: [] });
  expect(plan.edges).toEqual([document.edges[1]]);
  expect(plan.node.referenceInput).toEqual({ includeSelf: false });
  expect(plan.node.generation).toEqual({
    ...document.nodes[0].generation,
    referenceImagePaths: [],
  });
});

test('empty image slots can use text alone and suppress a prior variant draft source', () => {
  const document = fixture({
    assetPath: undefined,
    generationDraft: { operation: 'variant', sourceImageId: 'old', prompt: 'Draft prompt' },
  });
  const plan = prepareCanvasReferences(document, { id: 'target', sourceIds: [] });
  expect(plan.edges).toEqual([]);
  expect(plan.node.generationDraft?.sourceImageId).toBeUndefined();
  expect(document.nodes[0].generationDraft?.operation).toBe('variant');
});

test.each([
  null,
  [],
  {},
  { id: 'target', sourceIds: 'first' },
  { id: 'target', sourceIds: [null] },
  { id: 'target', sourceIds: [''] },
  { id: 'target', sourceIds: [], includeSelf: 'true' },
  { id: 'target', sourceIds: [], ignoreSource: true },
])('rejects malformed input atomically: %j', (input) => {
  const document = fixture();
  freezeDeep(document);
  expect(() => prepareCanvasReferences(document, input as never)).toThrow('输入无效');
});

test.each(['note', 'section', 'sequence', 'animation'] as const)(
  'rejects unsupported target and source type %s',
  (type) => {
    const document = fixture({ type });
    expect(() => prepareCanvasReferences(document, { id: 'target', sourceIds: [] })).toThrow(
      '图片或视频'
    );
    expect(() => prepareCanvasReferences(document, { id: 'first', sourceIds: ['target'] })).toThrow(
      '已保存的画布图片'
    );
  }
);

test('validates the entire source batch before returning a plan', () => {
  const document = fixture();
  const original = JSON.stringify(document);
  freezeDeep(document);
  for (const sourceIds of [['first', 'missing'], ['first', 'first'], ['target']]) {
    expect(() => prepareCanvasReferences(document, { id: 'target', sourceIds })).toThrow();
    expect(JSON.stringify(document)).toBe(original);
  }
  expect(() => prepareCanvasReferences(document, { id: 'missing', sourceIds: [] })).toThrow();
});

test.each([
  { assetPath: undefined },
  { type: 'video' as const, assetPath: undefined },
  { type: 'video-source' as const },
])('includeSelf only accepts an existing image result: %j', (patch) => {
  expect(() =>
    prepareCanvasReferences(fixture(patch), { id: 'target', sourceIds: [], includeSelf: true })
  ).toThrow('已保存的当前图片');
});

test('rejects cycles through indirect dependents', () => {
  const document = fixture();
  document.edges = [
    { id: 'first-edge', from: 'target', to: 'first', kind: 'image-variant' },
    { id: 'last-edge', from: 'first', to: 'last', kind: 'image-variant' },
  ];
  expect(() => prepareCanvasReferences(document, { id: 'target', sourceIds: ['last'] })).toThrow(
    '循环'
  );
});

test.each(['missing-asset', 'pending', 'stale', 'upstream-pending', 'upstream-empty', 'cycle'])(
  'rejects unfinished references: %s',
  (state) => {
    const document = fixture();
    const source = document.nodes[2];
    const parent = document.nodes[1];
    if (state === 'missing-asset') delete source.assetPath;
    if (state === 'pending') source.templatePending = true;
    if (state === 'stale') {
      source.sourceSnapshot = snapshotCanvasSource(parent);
      parent.assetPath = 'assets/image/changed.png';
    }
    if (state === 'upstream-pending') parent.templatePending = true;
    if (state === 'upstream-empty') delete parent.assetPath;
    document.edges.push({ id: 'parent-edge', from: 'old', to: 'first', kind: 'image-variant' });
    if (state === 'cycle')
      document.edges.push({ id: 'cycle-edge', from: 'first', to: 'old', kind: 'image-variant' });
    freezeDeep(document);
    expect(() =>
      prepareCanvasReferences(document, { id: 'target', sourceIds: ['last', 'first'] })
    ).toThrow();
  }
);

test.each([
  ['image', undefined, undefined, 14, false],
  ['image', undefined, undefined, 13, true],
  ['video', 'first_frame', '2.5', 1, false],
  ['video-source', 'first_last_frame', '2.0', 2, false],
  ['video', 'multi_modal_reference', '2.0', 9, false],
  ['video-source', 'multi_modal_reference', '2.5', 30, false],
  ['video', undefined, undefined, 9, false],
] as const)(
  'enforces %s / %s / %s limits including self',
  (type, mode, model, limit, includeSelf) => {
    const parameters = { ...(mode ? { mode } : {}), ...(model ? { model } : {}) };
    const document = fixture({
      type,
      ...(type === 'video'
        ? { assetPath: undefined, generationDraft: { operation: 'generate', parameters } }
        : { generation: { prompt: 'Prompt', parameters } }),
    });
    const sources = Array.from({ length: limit + 1 }, (_, index) => card('source-' + index));
    document.nodes.push(...sources);
    const input = {
      id: 'target',
      sourceIds: sources.slice(0, limit).map((node) => node.id),
      includeSelf,
    };
    expect(prepareCanvasReferences(document, input).edges).toHaveLength(limit);
    expect(() =>
      prepareCanvasReferences(document, { ...input, sourceIds: sources.map((node) => node.id) })
    ).toThrow('最多支持');
  }
);
