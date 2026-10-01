import { createCanvasGenerationUi } from '../generationUi.js';
import { snapshotCanvasSource } from '../dependencies.js';
import { canvasNeedsProcessing } from '../templateWorkflow.js';

function fixture(status = 'succeeded') {
  const document: any = {
    id: 'canvas',
    templateFlow: { imageId: 'head' },
    nodes: [
      { id: 'head', type: 'image', assetPath: 'assets/image/new.png', x: 0, y: 0, width: 300 },
      { id: 'video', type: 'video-source', assetPath: 'old.mp4', generation: { prompt: '挥剑' } },
    ],
    edges: [{ id: 'edge', kind: 'image-to-video', from: 'head', to: 'video' }],
  };
  const attempt = {
    id: 'attempt',
    kind: 'video',
    canvasId: 'canvas',
    targetNodeId: 'video',
    sourceImageId: 'head',
    sourceImagePath: 'assets/image/new.png',
    createdAt: '2026-09-30T00:00:00Z',
    status,
    taskId: 'task',
    resultAssetPath: 'new.mp4',
  };
  const options = {
    store: {
      listGeneration: jest.fn(async () => [attempt]),
      createVideo: jest.fn<Promise<typeof attempt>, [string, any]>(async () => attempt),
      generationAction: jest.fn(async () => ({ ...attempt, status: 'succeeded' })),
      importImage: jest.fn(),
      mediaUrl: (value: string) => value,
      generateImage: jest.fn(),
    },
    getDocument: () => document,
    getSelected: () => new Set<string>(),
    remember: jest.fn(),
    markDirty: jest.fn(),
    flush: jest.fn(async () => true),
    render: jest.fn(),
    nextPlacement: () => ({ x: 0, y: 0 }),
    loadMedia: jest.fn(async () => {}),
    requestImageImport: jest.fn(),
    requestVideoImport: jest.fn(),
    setError: jest.fn(),
    createId: () => 'new-id',
  };
  return { document, attempt, options, ui: createCanvasGenerationUi(options) };
}

test('template recovers an existing successful attempt without new paid generation', async () => {
  const { document, options, ui } = fixture();
  expect(await ui.runTemplateVideo('video', 4)).toBe(true);
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(document.nodes[1].assetPath).toBe('new.mp4');
  expect(document.edges).toHaveLength(1);
});

test('credits belong to the displayed result, not its source or a later attempt', async () => {
  const { document, attempt, ui } = fixture();
  Object.assign(attempt, { credits: 605 });
  await ui.restore();
  expect(ui.creditsLabel(document.nodes[0])).toBeUndefined();
  expect(ui.creditsLabel(document.nodes[1])).toBe('积分：605');
  document.nodes[1].generation.attemptId = 'another-attempt';
  expect(ui.creditsLabel(document.nodes[1])).toBe('积分：未返回');
});

test.each([undefined, -1, '20', NaN, Infinity, 0, 20])(
  'credits display does not treat missing or invalid values as free: %s',
  async (credits) => {
    const { document, attempt, ui } = fixture();
    Object.assign(attempt, { credits });
    await ui.restore();
    expect(ui.creditsLabel(document.nodes[1])).toBe(
      credits === 0 || credits === 20 ? '积分：' + credits : '积分：未返回'
    );
  }
);

test('restoring a two-image video keeps both source links without paid regeneration', async () => {
  const { document, attempt, options, ui } = fixture();
  document.nodes.push({
    id: 'tail',
    type: 'image',
    assetPath: 'assets/image/tail.png',
    x: 0,
    y: 300,
    width: 300,
  });
  document.edges.push({ id: 'tail-edge', from: 'tail', to: 'video', kind: 'image-to-video' });
  Object.assign(attempt, {
    sourceImageIds: ['head', 'tail'],
    sourceImagePaths: ['assets/image/new.png', 'assets/image/tail.png'],
  });
  expect(await ui.runTemplateVideo('video', 4)).toBe(true);
  expect(document.nodes[1].generation.sourceImageIds).toEqual(['head', 'tail']);
  expect(document.edges.map((edge: any) => edge.from)).toEqual(['head', 'tail']);
  expect(options.store.createVideo).not.toHaveBeenCalled();
});

function twoFrameFixture() {
  const fixtureResult = fixture();
  const { document, options } = fixtureResult;
  delete document.templateFlow;
  const head = document.nodes[0];
  const video = document.nodes[1];
  const tail = { ...head, id: 'tail', assetPath: 'assets/image/tail.png' };
  document.nodes.unshift(tail);
  document.edges.unshift({ id: 'tail-edge', from: tail.id, to: video.id, kind: 'image-to-video' });
  video.generation = {
    prompt: '从灰狼变为狼王',
    sourceImageId: head.id,
    sourceImageIds: [head.id, tail.id],
    parameters: { mode: 'first_last_frame' },
  };
  options.store.listGeneration.mockResolvedValue([]);
  options.store.createVideo.mockImplementation(async (canvasId, input) => ({
    ...fixtureResult.attempt,
    ...input,
    canvasId,
    parameters: { mode: input.mode },
    sourceSnapshots: input.sourceImageIds.map((id: string) =>
      snapshotCanvasSource(document.nodes.find((node: any) => node.id === id))
    ),
  }));
  return { ...fixtureResult, head, tail, video };
}

test('two-frame workflow submits all current references in role order and invalidates on tail changes', async () => {
  const { document, ui, options, tail, video } = twoFrameFixture();
  expect(await ui.runTemplateVideo('video', 4)).toBe(true);
  expect(options.store.createVideo).toHaveBeenCalledWith(
    'canvas',
    expect.objectContaining({
      mode: 'first_last_frame',
      sourceImageIds: ['head', 'tail'],
      sourceImagePaths: ['assets/image/new.png', 'assets/image/tail.png'],
      targetNodeId: 'video',
    })
  );
  expect(video.generation.parameters.mode).toBe('first_last_frame');
  expect(video.sourceSnapshots).toHaveLength(2);
  expect(canvasNeedsProcessing(document, video)).toBe(false);
  tail.assetPath = 'assets/image/changed-tail.png';
  expect(canvasNeedsProcessing(document, video)).toBe(true);
  expect(video.assetPath).toBe('new.mp4');
});

test('a missing tail never silently degrades into a paid single-image request', async () => {
  const { document, ui, options } = twoFrameFixture();
  document.edges = document.edges.filter((edge: any) => edge.from !== 'tail');
  expect(await ui.runTemplateVideo('video', 4)).toBe(false);
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith(expect.stringContaining('两张'));
});

test('unsettled video from an old tail blocks resubmission even when the first frame is unchanged', async () => {
  const { ui, options, attempt } = twoFrameFixture();
  options.store.listGeneration.mockResolvedValue([
    {
      ...attempt,
      status: 'unknown',
      sourceImageIds: ['head', 'tail'],
      sourceImagePaths: ['assets/image/new.png', 'assets/image/old-tail.png'],
      parameters: { mode: 'first_last_frame' },
    } as any,
  ]);
  expect(await ui.runTemplateVideo('video', 4)).toBe(false);
  expect(options.store.createVideo).not.toHaveBeenCalled();
});

test.each(['head', 'tail'])(
  'restoring a result does not reconnect the removed %s reference',
  async (removedId) => {
    const { ui, document, options, attempt, head, tail, video } = twoFrameFixture();
    Object.assign(attempt, {
      sourceImageIds: [head.id, tail.id],
      sourceImagePaths: [head.assetPath, tail.assetPath],
      sourceSnapshots: [snapshotCanvasSource(head), snapshotCanvasSource(tail)],
    });
    delete video.assetPath;
    document.edges = document.edges.filter((edge: any) => edge.from !== removedId);
    const edgesBefore = structuredClone(document.edges);
    options.store.listGeneration.mockResolvedValue([attempt]);
    await ui.restore();
    expect(video.assetPath).toBe(attempt.resultAssetPath);
    expect(document.edges).toEqual(edgesBefore);
    expect(canvasNeedsProcessing(document, video)).toBe(true);
    expect(options.store.createVideo).not.toHaveBeenCalled();
  }
);

test('legacy multi-image recovery retains missing source evidence instead of accepting the remaining head', async () => {
  const { ui, document, options, attempt, head, tail, video } = twoFrameFixture();
  Object.assign(attempt, {
    sourceImageIds: [head.id, tail.id],
    sourceImagePaths: [head.assetPath, tail.assetPath],
    sourceSnapshot: snapshotCanvasSource(head),
  });
  delete video.assetPath;
  document.nodes = document.nodes.filter((node: any) => node.id !== tail.id);
  document.edges = document.edges.filter((edge: any) => edge.from !== tail.id);
  options.store.listGeneration.mockResolvedValue([attempt]);
  await ui.restore();
  expect(video.sourceSnapshots.map((snapshot: any) => snapshot.nodeId)).toEqual([head.id, tail.id]);
  expect(canvasNeedsProcessing(document, video)).toBe(true);
  expect(options.store.createVideo).not.toHaveBeenCalled();
});

test('tail changes during generation keep the completed video stale and preserve task input snapshots', async () => {
  const { ui, document, options, attempt, head, tail, video } = twoFrameFixture();
  const snapshots = [snapshotCanvasSource(head), snapshotCanvasSource(tail)];
  options.store.createVideo.mockImplementation(async (canvasId, input) => {
    tail.assetPath = 'assets/image/changed-during-generation.png';
    return { ...attempt, ...input, canvasId, sourceSnapshots: snapshots };
  });
  await ui.runTemplateVideo(video.id, 4);
  expect(video.sourceSnapshots).toEqual(snapshots);
  expect(canvasNeedsProcessing(document, video)).toBe(true);
  expect(options.store.createVideo).toHaveBeenCalledTimes(1);
});

test('template queries pending task at 120 seconds without resubmitting', async () => {
  jest.useFakeTimers();
  try {
    const { options, ui } = fixture('pending');
    const pending = ui.runTemplateVideo('video', 4);
    await jest.advanceTimersByTimeAsync(119999);
    expect(options.store.generationAction).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(true);
    expect(options.store.generationAction).toHaveBeenCalledWith('canvas', 'attempt', 'query');
    expect(options.store.createVideo).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('unknown task without task ID stops without submitting', async () => {
  const { attempt, options, ui } = fixture('unknown');
  attempt.taskId = '';
  expect(await ui.runTemplateVideo('video', 4)).toBe(false);
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(options.store.generationAction).not.toHaveBeenCalled();
});

test('user template resolves the current connected image and reuses stored video parameters', async () => {
  const { document, options, ui, attempt } = fixture();
  delete document.templateFlow;
  document.nodes[1].generation.parameters = {
    model: '2.0',
    resolution: '480p',
    duration: 7,
    ratio: '1:1',
  };
  options.store.listGeneration.mockResolvedValue([]);
  expect(await ui.runTemplateVideo('video', 4)).toBe(true);
  expect(options.store.createVideo).toHaveBeenCalledWith(
    'canvas',
    expect.objectContaining({
      sourceImagePath: 'assets/image/new.png',
      sourceImageId: 'head',
      targetNodeId: 'video',
      model: '2.0',
      resolution: '480p',
      duration: 7,
      ratio: '1:1',
    })
  );
  expect(document.nodes).toHaveLength(2);
  expect(document.nodes[1].generation.parameters.duration).toBe(7);
  expect(document.nodes[1].generation.attemptId).toBe(attempt.id);
});

test('an already applied success is not reused as a new generation for a pending card', async () => {
  const { document, options, ui, attempt } = fixture();
  document.nodes[1].generation.attemptId = attempt.id;
  document.nodes[1].templatePending = true;
  options.store.createVideo.mockResolvedValue({ ...attempt, id: 'new-attempt' });
  expect(await ui.runTemplateVideo('video', 6)).toBe(true);
  expect(options.store.createVideo).toHaveBeenCalledTimes(1);
  expect(options.store.createVideo.mock.calls[0][1].duration).toBe(6);
  expect(document.nodes[1].generation.attemptId).toBe('new-attempt');
});

test('changing the input never bypasses an unresolved task for the old input', async () => {
  const { options, ui, attempt } = fixture('unknown');
  attempt.sourceImagePath = 'old-image.png';
  expect(await ui.runTemplateVideo('video', 4)).toBe(false);
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith(expect.stringContaining('旧来源'));
});

test('image continuation recovers only its recorded parameters and reference images', async () => {
  const { document, options, ui } = fixture();
  delete document.templateFlow;
  const target = document.nodes[1];
  target.type = 'image';
  target.generation = {
    prompt: '游戏剑士换红色护甲',
    operation: 'variant',
    attemptId: 'recorded',
    sourceImageId: 'head',
  };
  document.edges[0].kind = 'image-variant';
  const recorded: any = {
    id: 'recorded',
    canvasId: 'canvas',
    targetNodeId: 'video',
    kind: 'image',
    status: 'succeeded',
    parameters: { model: 'gpt', resolution: '2K', aspectRatio: '3:2', userConfirmed: true },
    referenceImagePaths: ['assets/image/reference.png'],
  };
  options.store.listGeneration.mockResolvedValue([recorded]);
  options.store.generateImage.mockImplementation(async (canvasId, input) => ({
    ...input,
    id: 'new-image',
    canvasId,
    kind: 'image',
    status: 'succeeded',
    resultAssetPath: 'result.png',
    parameters: {
      model: input.model,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
    },
  }));
  expect(await ui.runTemplateImage('video')).toBe(true);
  expect(options.store.generateImage).toHaveBeenCalledWith(
    'canvas',
    expect.objectContaining({
      targetNodeId: 'video',
      sourceImagePath: 'assets/image/new.png',
      model: 'gpt',
      resolution: '2K',
      aspectRatio: '3:2',
      referenceImagePaths: ['assets/image/reference.png'],
    })
  );
  expect(options.store.generateImage.mock.calls[0][1].userConfirmed).toBeUndefined();
  expect(target.generation.referenceImagePaths).toEqual(['assets/image/reference.png']);
  expect(document.nodes).toHaveLength(2);
});

test('restore fills reusable settings only from the exact applied attempt, never payment consent', async () => {
  const { document, options, ui, attempt } = fixture();
  document.nodes[1].generation.attemptId = attempt.id;
  options.store.listGeneration.mockResolvedValue([
    { ...attempt, parameters: { model: '2.5', duration: 7, userConfirmed: true } } as any,
  ]);
  await ui.restore();
  expect(document.nodes[1].generation.parameters).toEqual({ model: '2.5', duration: 7 });
});

test('failed paid generation is not automatically retried within a workflow run', async () => {
  const { options, ui } = fixture('failed');
  options.store.listGeneration.mockResolvedValue([]);
  expect(await ui.runTemplateVideo('video', 4)).toBe(false);
  expect(options.store.createVideo).toHaveBeenCalledTimes(1);
  expect(options.store.generationAction).not.toHaveBeenCalled();
});

test('template video uses action-first prompt constraints', async () => {
  const { options, ui } = fixture('failed');
  options.store.listGeneration.mockResolvedValue([]);

  await ui.runTemplateVideo('video', 4);

  const input = options.store.createVideo.mock.calls[0][1];
  expect(input.prompt).toContain('挥剑');
  expect(input.prompt).toContain('视频约束：');
  expect(input.prompt).toContain('站台');
  expect(input.prompt).toContain('固定镜头');
  expect(input.prompt).toContain('\n\n视频约束：');
  expect(input.prompt).not.toContain('\\n');
});

test('page restore does not overwrite template results or advance paid workflow', async () => {
  const { document, options, ui } = fixture();
  document.templateFlow.videoId = 'video';
  await ui.restore();
  expect(document.nodes[1].assetPath).toBe('old.mp4');
  expect(options.store.createVideo).not.toHaveBeenCalled();
});

test('page restore does not recreate explicitly deleted generation results', async () => {
  const { document, ui } = fixture();
  delete document.templateFlow;
  document.deletedGenerationIds = ['attempt'];
  await ui.restore();
  expect(document.nodes[1].assetPath).toBe('old.mp4');
});

test('page restore does not recreate a deleted generation target', async () => {
  const { document, ui } = fixture();
  delete document.templateFlow;
  document.nodes.pop();
  await ui.restore();
  expect(document.nodes).toHaveLength(1);
});

test.each(['pending', 'running', 'unknown', 'failed', 'canceled'])(
  'exposes %s only on its target card',
  async (status) => {
    const { ui } = fixture(status);
    await ui.restore();
    expect(ui.nodeState('video')).toEqual({ status, canQuery: status !== 'failed' });
    expect(ui.nodeState('head')).toBeUndefined();
  }
);

test('overlay queries an existing video task without submitting generation', async () => {
  const { ui, options } = fixture('unknown');
  await ui.restore();
  await ui.queryNode('video');
  expect(options.store.generationAction).toHaveBeenCalledWith('canvas', 'attempt', 'query');
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(ui.nodeState('video')).toBeUndefined();
});
