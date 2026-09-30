import { createCanvasGenerationUi } from '../generationUi.js';

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
      createVideo: jest.fn(async () => attempt),
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

test('failed paid generation is not automatically retried within a workflow run', async () => {
  const { options, ui } = fixture('failed');
  options.store.listGeneration.mockResolvedValue([]);
  expect(await ui.runTemplateVideo('video', 4)).toBe(false);
  expect(options.store.createVideo).toHaveBeenCalledTimes(1);
  expect(options.store.generationAction).not.toHaveBeenCalled();
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
