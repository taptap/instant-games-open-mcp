import { createTemplateWorkflow, parseTemplateFlow } from '../templateWorkflow.js';
import { emptyDocument } from '../model.js';
import { canvasNeedsProcessing, snapshotCanvasSource } from '../dependencies.js';

function fixture() {
  const document = emptyDocument();
  document.templateFlow = {
    imageId: 'image',
    videoId: 'video',
    sequenceId: 'sequence',
    animationId: 'animation',
    duration: 4,
    stage: 'image',
  };
  document.nodes = ['image', 'video-source', 'sequence', 'animation'].map((type, index) => ({
    id: ['image', 'video', 'sequence', 'animation'][index],
    type: type as 'image',
    title: type,
    x: 0,
    y: 0,
    width: 300,
    height: 200,
  }));
  document.edges = [
    { id: 'iv', from: 'image', to: 'video', kind: 'image-to-video' },
    { id: 'vs', from: 'video', to: 'sequence', kind: 'sequence-source' },
    { id: 'sa', from: 'sequence', to: 'animation', kind: 'sequence-animation' },
  ];
  document.nodes[2].sourceVideoId = 'video';
  const stages: string[] = [];
  const options = {
    getDocument: () => document,
    save: jest.fn(async () => {
      stages.push(document.templateFlow!.stage);
      return true;
    }),
    changed: jest.fn(),
    render: jest.fn(),
    error: jest.fn(),
    confirm: jest.fn(() => true),
    video: jest.fn<Promise<boolean>, [string, number]>(async () => true),
    sequence: jest.fn<Promise<void>, [string]>(async () => {}),
    animation: jest.fn(),
    select: jest.fn(),
    importImage: jest.fn(),
  };
  return { document, options, stages, flow: createTemplateWorkflow(options) };
}

test('template state validates node relationships and duration', () => {
  const { document } = fixture();
  expect(parseTemplateFlow(document.templateFlow, document)).toEqual(document.templateFlow);
  for (const patch of [
    { videoId: 'missing' },
    { duration: 3 },
    { duration: 9 },
    { stage: 'invalid' },
  ]) {
    expect(() => parseTemplateFlow({ ...document.templateFlow, ...patch }, document)).toThrow();
  }
  expect(() => parseTemplateFlow(document.templateFlow, { ...document, edges: [] })).toThrow();
});

test.each([
  ['image', 'image', 'image'],
  ['image', 'video', 'video'],
  ['video', 'sequence', 'sequence'],
  ['sequence', 'animation', 'animation'],
] as const)('uses the same pending-output policy for %s → %s', (sourceId, type, nodeId) => {
  const { flow } = fixture();
  expect(flow.resolveTarget(sourceId, type)).toEqual({ kind: 'reuse', nodeId });
});

test('does not reuse disconnected, finished or wrong-source cards', () => {
  const { flow, document } = fixture();
  document.nodes.forEach((node) => {
    node.assetPath = 'saved.png';
  });
  document.edges = document.edges.filter((edge) => edge.kind !== 'sequence-source');
  expect(flow.resolveTarget('video', 'sequence')).toEqual({ kind: 'create' });
  document.edges.push({ id: 'vs', from: 'video', to: 'sequence', kind: 'sequence-source' });
  document.nodes[2].sourceVideoId = 'other-video';
  expect(flow.resolveTarget('video', 'sequence')).toEqual({ kind: 'create' });
  document.nodes[2].sourceVideoId = 'video';
  document.templateFlow!.stage = 'complete';
  expect(flow.resolveTarget('image', 'image')).toEqual({ kind: 'create' });
  expect(flow.resolveTarget('image', 'video')).toEqual({ kind: 'create' });
  expect(flow.resolveTarget('video', 'sequence')).toEqual({ kind: 'create' });
  expect(flow.resolveTarget('sequence', 'animation')).toEqual({ kind: 'create' });
  expect(flow.resolveTarget('unrelated', 'sequence')).toBeUndefined();
});

test('reuses a newly linked empty branch without stealing the completed template output', () => {
  const { flow, document } = fixture();
  document.templateFlow!.stage = 'complete';
  document.nodes[2].assetPath = 'saved.png';
  document.nodes.push({ ...document.nodes[2], id: 'new-sequence', assetPath: undefined });
  document.edges.push({
    id: 'new-edge',
    from: 'video',
    to: 'new-sequence',
    kind: 'sequence-source',
  });
  expect(flow.resolveTarget('video', 'sequence')).toEqual({
    kind: 'reuse',
    nodeId: 'new-sequence',
  });
});

test('blocks active or unknown outputs rather than creating another paid task', () => {
  const { document, options } = fixture();
  const flow = createTemplateWorkflow({ ...options, isNodeBusy: (id) => id === 'video' });
  expect(flow.resolveTarget('image', 'video')?.kind).toBe('blocked');
  expect(flow.resolveTarget('video', 'sequence')?.kind).toBe('blocked');
  const unknown = createTemplateWorkflow({
    ...options,
    hasUnsettledResult: (id) => id === 'video',
  });
  expect(unknown.resolveTarget('image', 'video')?.kind).toBe('blocked');
  expect(document.nodes).toHaveLength(4);
});

test('manual sequence and animation completion advance only the remaining workflow', async () => {
  const { flow, document, options } = fixture();
  await flow.nodeChanged('sequence');
  expect(document.templateFlow!.stage).toBe('animation');
  expect(flow.status('sequence')).toBe('complete');
  expect(flow.status('animation')).toBe('pending');
  expect(flow.locked('sequence')).toBe(false);
  await flow.run();
  expect(options.video).not.toHaveBeenCalled();
  expect(options.sequence).not.toHaveBeenCalled();
  expect(options.animation).toHaveBeenCalledTimes(1);
  expect(document.templateFlow!.stage).toBe('complete');
});

test('head and video are editable before continuation', async () => {
  const { document, options, flow } = fixture();
  expect(flow.canEditImage('image')).toBe(true);
  expect(flow.canEditVideo('video')).toBe(true);
  expect(flow.locked('video')).toBe(false);
  await flow.headChanged('image');
  expect(document.templateFlow?.stage).toBe('ready');
  expect(options.video).not.toHaveBeenCalled();
  expect(options.save).toHaveBeenCalledTimes(1);
});

test('editing video advances to sequence without regenerating the completed video', async () => {
  const { document, options, flow } = fixture();
  await flow.videoChanged('video');
  expect(document.templateFlow?.stage).toBe('sequence');
  expect(flow.status('video')).toBe('complete');
  expect(flow.status('sequence')).toBe('pending');
  expect(options.video).not.toHaveBeenCalled();
  expect(options.save).toHaveBeenCalledTimes(1);
  await flow.run();
  expect(options.video).not.toHaveBeenCalled();
  expect(options.sequence).toHaveBeenCalledWith('sequence');
});

test('head completion waits for an explicit in-canvas continuation', async () => {
  const { document, options, stages, flow } = fixture();
  await flow.headChanged('image');
  expect(options.confirm).not.toHaveBeenCalled();
  expect(document.templateFlow?.stage).toBe('ready');
  expect(options.video).not.toHaveBeenCalled();
  expect(flow.status('video')).toBe('pending');
  await flow.run();
  expect(stages).toEqual(['ready', 'video', 'sequence', 'animation', 'complete']);
  expect(options.video).toHaveBeenCalledWith('video', 4);
  expect(options.sequence).toHaveBeenCalledWith('sequence');
  expect(document.templateFlow?.stage).toBe('complete');
  expect(flow.locked('video')).toBe(false);
});

test('local processing failure resumes without submitting another video', async () => {
  const { document, options, flow } = fixture();
  options.sequence.mockRejectedValueOnce(new Error('抽帧失败'));
  document.templateFlow!.stage = 'ready';
  await flow.run();
  expect(document.templateFlow?.stage).toBe('sequence');
  expect(options.animation).not.toHaveBeenCalled();
  await flow.run();
  expect(options.video).toHaveBeenCalledTimes(1);
  expect(options.confirm).not.toHaveBeenCalled();
  expect(document.templateFlow?.stage).toBe('complete');
});

test('unknown video result stops at video and prevents downstream changes', async () => {
  const { document, options, flow } = fixture();
  options.video.mockResolvedValue(false);
  document.templateFlow!.stage = 'ready';
  await flow.run();
  expect(document.templateFlow?.stage).toBe('video');
  expect(options.sequence).not.toHaveBeenCalled();
  expect(flow.isBusy).toBe(false);
});

test('save failure prevents remote generation and rolls stage back', async () => {
  const { document, options, flow } = fixture();
  document.templateFlow!.stage = 'ready';
  options.save.mockResolvedValue(false);
  await flow.run();
  expect(document.templateFlow?.stage).toBe('ready');
  expect(options.video).not.toHaveBeenCalled();
});

test('running flow ignores duplicate clicks and locks the head', async () => {
  const { document, options, flow } = fixture();
  document.templateFlow!.stage = 'ready';
  let finish!: (value: boolean) => void;
  options.video.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = flow.run();
  await Promise.resolve();
  expect(flow.locked('image')).toBe(true);
  await flow.run();
  finish(true);
  await pending;
  expect(options.video).toHaveBeenCalledTimes(1);
});

test('running flow marks the active template card as loading', async () => {
  const { document, options, flow } = fixture();
  document.templateFlow!.stage = 'ready';
  let finish!: (value: boolean) => void;
  options.video.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = flow.run();
  await new Promise((resolve) => setImmediate(resolve));
  expect(flow.status('video')).toBe('loading');
  expect(flow.status('sequence')).toBe('pending');
  finish(false);
  await pending;
});

function userTemplate() {
  const { document, options } = fixture();
  delete document.templateFlow;
  for (const node of document.nodes) {
    node.sectionId = 'group';
    node.assetPath = node.id + '-old';
    const source = document.edges.find((edge) => edge.to === node.id)?.from;
    if (source)
      node.sourceSnapshot = snapshotCanvasSource(document.nodes.find((node) => node.id === source));
  }
  document.nodes.push({
    id: 'group',
    type: 'section',
    templateId: 'saved-template',
    title: '模板',
    x: 0,
    y: 0,
    width: 1000,
    height: 400,
  });
  options.save.mockImplementation(async () => true);
  const executions: string[] = [];
  const complete = (id: string) => {
    executions.push(id);
    const node = document.nodes.find((node) => node.id === id)!;
    node.assetPath = id + '-new';
    const sourceId = document.edges.find((edge) => edge.to === id)?.from;
    node.sourceSnapshot = snapshotCanvasSource(document.nodes.find((node) => node.id === sourceId));
  };
  options.video.mockImplementation(async (id) => {
    complete(id);
    return true;
  });
  options.sequence.mockImplementation(async (id) => {
    complete(id);
  });
  const refreshAnimation = jest.fn(complete);
  const flow = createTemplateWorkflow({ ...options, refreshAnimation });
  return { document, options, executions, refreshAnimation, flow };
}

test('changing a reference marks all downstream cards pending, survives reload and never generates implicitly', async () => {
  const { document, options, flow } = userTemplate();
  document.nodes[0].assetPath = 'new-head';
  expect(flow.status('video')).toBe('pending');
  expect(flow.status('animation')).toBe('pending');
  await flow.nodeChanged('image');
  const restored = JSON.parse(JSON.stringify(document));
  const reopened = createTemplateWorkflow({ ...options, getDocument: () => restored });
  for (const id of ['video', 'sequence', 'animation']) expect(reopened.status(id)).toBe('pending');
  expect(options.video).not.toHaveBeenCalled();
  expect(document.nodes[1].assetPath).toBe('video-old');
});

test('explicit continuation reads current references, updates existing cards and executes downstream in order', async () => {
  const { document, options, executions, flow } = userTemplate();
  document.nodes[1].generation = { prompt: '动作', parameters: { duration: 6 } };
  const ids = document.nodes.map((node) => node.id);
  await flow.nodeChanged('image');
  await flow.runFrom('video');
  expect(options.error).not.toHaveBeenCalled();
  expect(options.video).toHaveBeenCalledWith('video', 6);
  expect(executions).toEqual(['video', 'sequence', 'animation']);
  expect(document.nodes.map((node) => node.id)).toEqual(ids);
  for (const node of document.nodes.slice(1, 4))
    expect(canvasNeedsProcessing(document, node)).toBe(false);
});

test('editing the middle card continues only its descendants, not its siblings or other groups', async () => {
  const { document, options, executions, flow } = userTemplate();
  document.nodes.push({ ...document.nodes[2], id: 'other', sectionId: 'other-group' });
  document.edges.push({ id: 'other-edge', from: 'video', to: 'other', kind: 'sequence-source' });
  await flow.nodeChanged('video');
  await flow.runFrom('sequence');
  expect(options.error).not.toHaveBeenCalled();
  expect(executions).toEqual(['sequence', 'animation']);
  expect(options.video).not.toHaveBeenCalled();
  expect(document.nodes.find((node) => node.id === 'other')?.templatePending).toBe(true);
});

test('downstream click cannot skip an unfinished prerequisite', async () => {
  const { options, flow } = userTemplate();
  await flow.nodeChanged('image');
  expect(flow.waitingForSource('sequence')).toBe(true);
  expect(flow.canContinue('sequence')).toBe(false);
  expect(flow.canAdjust('sequence')).toBe(false);
  await flow.runFrom('sequence');
  expect(options.sequence).not.toHaveBeenCalled();
  expect(options.error).toHaveBeenCalledWith(expect.stringContaining('上游'));
});

test('adjusting a completed workflow step replaces it and continues only after confirmed success', async () => {
  const { document, options, flow, executions } = userTemplate();
  const execute = jest.fn(async () => {
    document.nodes[1].assetPath = 'edited-video';
    return true;
  });
  await flow.runFrom('video', execute);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(options.video).not.toHaveBeenCalled();
  expect(executions).toEqual(['sequence', 'animation']);
  expect(document.nodes).toHaveLength(5);
});

test('canceling or failing an adjusted generation retains the old result and stops continuation', async () => {
  const { document, options, flow } = userTemplate();
  await flow.runFrom('video', async () => false);
  expect(document.nodes[1].assetPath).toBe('video-old');
  expect(options.sequence).not.toHaveBeenCalled();
  const unknown = createTemplateWorkflow({
    ...options,
    hasUnsettledResult: (id) => id === 'video',
  });
  expect(unknown.canAdjust('video')).toBe(false);
  const execute = jest.fn(async () => true);
  await unknown.runFrom('video', execute);
  expect(execute).not.toHaveBeenCalled();
});

test('failed video stops descendants and leaves previous results available', async () => {
  const { document, options, flow } = userTemplate();
  await flow.nodeChanged('image');
  options.video.mockResolvedValue(false);
  await flow.runFrom('video');
  expect(options.sequence).not.toHaveBeenCalled();
  expect(document.nodes[1].assetPath).toBe('video-old');
  expect(flow.canContinue('video')).toBe(true);
});

test('unsettled tasks, duplicate clicks, save failures and cycles never start extra generation', async () => {
  const { document, options, flow } = userTemplate();
  await flow.nodeChanged('image');
  const unsettled = createTemplateWorkflow({
    ...options,
    hasUnsettledResult: (id) => id === 'video',
  });
  expect(unsettled.canContinue('video')).toBe(false);
  await unsettled.runFrom('video');
  options.save.mockResolvedValueOnce(false);
  await flow.runFrom('video');
  expect(options.video).not.toHaveBeenCalled();
  document.edges.push({ id: 'cycle', from: 'animation', to: 'video', kind: 'first-frame' });
  await flow.runFrom('video');
  expect(options.error).toHaveBeenLastCalledWith(expect.stringContaining('循环'));
  expect(options.video).not.toHaveBeenCalled();
  document.edges.pop();
  let finish!: (value: boolean) => void;
  options.video.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = flow.runFrom('video');
  await new Promise((resolve) => setImmediate(resolve));
  expect(flow.status('video')).toBe('loading');
  expect(flow.locked('image')).toBe(true);
  await flow.runFrom('video');
  finish(false);
  await pending;
  expect(options.video).toHaveBeenCalledTimes(1);
  expect(flow.isBusy).toBe(false);
});
