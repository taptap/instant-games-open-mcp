import { createCanvasGenerationUi } from '../generationUi.js';
import { snapshotCanvasSource } from '../dependencies.js';
import { canvasNeedsProcessing } from '../templateWorkflow.js';
import { configureMergeIcons, mergeIconPrompt } from '../mergeIcons.js';

test.each(['succeeded', 'failed', 'missing', 'unknown'])(
  'merge icon execution respects settings and result protection: %s',
  async (status) => {
    const { document, options } = fixture();
    delete document.templateFlow;
    const target = document.nodes[1];
    target.type = 'image';
    target.assetPath = 'old-atlas.png';
    target.generation = { prompt: '旧提示词', sourceImageId: 'head' };
    document.edges[0].kind = 'image-variant';
    const settings = {
      stageCount: 3,
      instructions: '',
      series: [{ name: '面包', stages: ['圆面包', '一篮', '礼篮'] }],
    };
    configureMergeIcons(target, settings);
    options.store.listGeneration.mockResolvedValue(
      status === 'unknown'
        ? [
            {
              id: 'unknown-image',
              kind: 'image',
              canvasId: document.id,
              targetNodeId: target.id,
              status: 'unknown',
            } as any,
          ]
        : []
    );
    if (status === 'missing') document.edges = [];
    options.store.generateImage.mockImplementation(async (canvasId, input) => ({
      ...input,
      id: 'merge-result',
      canvasId,
      kind: 'image',
      status,
      resultAssetPath: status === 'succeeded' ? 'new-atlas.png' : undefined,
    }));
    const ui = createCanvasGenerationUi(options);
    const success = await ui.runTemplateImage(target.id);
    expect(success).toBe(status === 'succeeded');
    expect(document.nodes).toHaveLength(2);
    if (status === 'missing' || status === 'unknown')
      expect(options.store.generateImage).not.toHaveBeenCalled();
    else
      expect(options.store.generateImage).toHaveBeenCalledWith(
        document.id,
        expect.objectContaining({
          prompt: mergeIconPrompt(settings),
          targetNodeId: target.id,
          sourceImageIds: ['head'],
        })
      );
    expect(target.assetPath).toBe(status === 'succeeded' ? 'new-atlas.png' : 'old-atlas.png');
    expect(target.mergeIcons).toEqual(settings);
    expect(canvasNeedsProcessing(document, target)).toBe(status !== 'succeeded');
  }
);

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
    createdAt: new Date(Date.now()).toISOString(),
    status,
    taskId: 'task' as string | undefined,
    resultAssetPath: 'new.mp4' as string | undefined,
    toolName: 'create_video_task',
    executionState: undefined as string | undefined,
    error: undefined as string | undefined,
    targetAssetPath: 'old.mp4',
    sourceSnapshots: [snapshotCanvasSource(document.nodes[0])],
  };
  const listGeneration = jest.fn(async () => [attempt]);
  const options = {
    store: {
      listGeneration,
      createVideo: jest.fn<Promise<typeof attempt>, [string, any, AbortSignal?]>(async () => {
        listGeneration.mockResolvedValue([attempt]);
        return attempt;
      }),
      generationAction: jest.fn(async () => {
        const result = { ...attempt, status: 'succeeded' };
        listGeneration.mockResolvedValue([result]);
        return result;
      }),
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
    onGenerated: jest.fn(async () => {}),
    setError: jest.fn(),
    createId: () => 'new-id',
  };
  return { document, attempt, options, ui: createCanvasGenerationUi(options) };
}

test('paired generation submits first then last and preserves the pair connection after recovery', async () => {
  const { document, attempt, options } = fixture();
  delete document.templateFlow;
  const first = document.nodes[0];
  const video = document.nodes[1];
  const last = { ...first, id: 'tail', assetPath: 'assets/image/tail.png' };
  document.nodes.push(last);
  video.videoInputMode = 'first_last_frame';
  document.edges = [
    { id: 'last', kind: 'frame-last', from: last.id, to: video.id },
    { id: 'first', kind: 'frame-first', from: first.id, to: video.id },
  ];
  video.generation.parameters = { mode: 'first_last_frame' };
  Object.assign(attempt, {
    sourceImageIds: [first.id, last.id],
    sourceImagePaths: [first.assetPath, last.assetPath],
    sourceSnapshots: [snapshotCanvasSource(first), snapshotCanvasSource(last)],
    parameters: { mode: 'first_last_frame' },
  });
  options.store.listGeneration.mockResolvedValue([]);
  const ui = createCanvasGenerationUi(options);
  expect(await ui.runTemplateVideo(video.id, 4, true, true)).toBe(true);
  expect(options.store.createVideo).toHaveBeenCalledWith(
    document.id,
    expect.objectContaining({
      sourceImageIds: [first.id, last.id],
      sourceImagePaths: [first.assetPath, last.assetPath],
      mode: 'first_last_frame',
      referenceImagePaths: [],
    }),
    expect.anything()
  );
  expect(document.edges.filter((edge: any) => edge.to === video.id)).toHaveLength(2);
  expect(canvasNeedsProcessing(document, video)).toBe(false);
});

test('automation video execution uses explicitly saved parameters rather than a rejected attempt', async () => {
  const { document, attempt, options } = fixture('failed');
  attempt.taskId = undefined;
  attempt.executionState = 'not_executed';
  Object.assign(attempt, {
    prompt: 'old prompt',
    parameters: { model: '2.0', duration: 4, resolution: '720p' },
  });
  document.nodes[1].generation = {
    prompt: 'new prompt',
    parameters: { model: '2.5', duration: 8, resolution: '480p' },
  };
  const ui = createCanvasGenerationUi(options);
  await ui.runTemplateVideo('video', 8, true, true);
  expect(options.store.createVideo).toHaveBeenCalledWith(
    'canvas',
    expect.objectContaining({
      prompt: expect.stringContaining('new prompt'),
      model: '2.5',
      duration: 8,
      resolution: '480p',
    }),
    expect.anything()
  );
});

test('video submission rejection preserves the actual error without inventing a queryable task', async () => {
  const { options, ui } = fixture();
  options.store.listGeneration.mockResolvedValue([]);
  options.store.createVideo.mockRejectedValue(new Error('Seedance 2.5 requires adaptive ratio'));
  expect(await ui.runTemplateVideo('video', 4, true, true)).toBe(false);
  expect(options.setError).toHaveBeenLastCalledWith('Seedance 2.5 requires adaptive ratio');
  expect(options.store.generationAction).not.toHaveBeenCalled();
});

test('automation query refreshes a task ID that arrived after stopping local wait', async () => {
  const { document, attempt, options, ui } = fixture('canceled');
  attempt.taskId = undefined;
  await ui.restore();
  expect(ui.nodeState('video')?.canQuery).toBe(false);
  options.store.listGeneration.mockResolvedValue([{ ...attempt, taskId: 'late-task' }]);
  options.store.generationAction.mockResolvedValue({
    ...attempt,
    taskId: 'late-task',
    status: 'succeeded',
  });
  await ui.queryNode('video', true);
  expect(options.store.generationAction).toHaveBeenCalledWith('canvas', 'attempt', 'query');
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(document.nodes[1].assetPath).toBe('new.mp4');
});

test('automation query stops when the canvas changes during history refresh', async () => {
  const { options, ui } = fixture('pending');
  options.store.listGeneration.mockImplementation(async () => {
    options.getDocument = () => ({ id: 'different', nodes: [] });
    return [];
  });
  await expect(ui.queryNode('video', true)).rejects.toThrow('画布已切换');
  expect(options.store.generationAction).not.toHaveBeenCalled();
});

test('automation query reports request errors while the existing UI keeps its error display', async () => {
  const { options } = fixture('pending');
  const ui = createCanvasGenerationUi(options);
  await ui.restore();
  options.store.generationAction.mockRejectedValue(new Error('network down'));
  await expect(ui.queryNode('video', true)).rejects.toThrow('network down');
  await expect(ui.queryNode('video')).resolves.toBeUndefined();
  expect(options.setError).toHaveBeenCalledWith('network down');
});

describe('image reference drafts and refresh', () => {
  const globals = globalThis as any;
  const originalDocument = globals.document;
  let elements: any[];

  beforeEach(() => {
    elements = [];
    globals.document = {
      createElement: (tag: string) => {
        const element: any = {
          tag,
          value: '',
          events: {},
          append: jest.fn(),
          setAttribute: jest.fn(),
          addEventListener(event: string, callback: (event: any) => void) {
            this.events[event] = callback;
          },
        };
        elements.push(element);
        return element;
      },
    };
  });

  afterEach(() => {
    if (originalDocument === undefined) delete globals.document;
    else globals.document = originalDocument;
  });

  function imageFixture(imported = false) {
    const result = fixture();
    const { document, options } = result;
    delete document.templateFlow;
    const source = document.nodes[0];
    const image = {
      ...source,
      id: 'image',
      title: '派生图片',
      assetPath: 'assets/image/result.png',
      generation: {
        prompt: '角色挥剑',
        operation: 'variant',
        sourceImageId: source.id,
        referenceImagePaths: imported ? ['assets/image/imported.png'] : [],
      },
      sourceSnapshot: snapshotCanvasSource({ ...source, assetPath: 'assets/image/old.png' }),
    };
    document.nodes = [source, image];
    document.edges = [{ id: 'edge', from: source.id, to: image.id, kind: 'image-variant' }];
    options.store.listGeneration.mockResolvedValue([]);
    options.store.generateImage.mockResolvedValue({ id: 'image-attempt', status: 'failed' });
    return { ...result, image, source };
  }

  function displayedPaths() {
    return elements.filter((element) => element.tag === 'img').map((element) => element.src);
  }

  test('unsubmitted manual inputs remain detectable after closing a panel, unlike unchanged caches', () => {
    const { document, ui, image } = imageFixture(true);
    ui.render({ append: jest.fn() }, image, document.nodes);
    expect(ui.hasInputDraft()).toBe(false);
    const input = elements.find((element) => element.tag === 'textarea');
    const before = input.value;
    input.value = 'manual unsent prompt';
    input.events.input();
    expect(ui.hasInputDraft()).toBe(true);
    input.value = before;
    input.events.input();
    expect(ui.hasInputDraft()).toBe(false);
    const fields = elements.find((element) => element.className === 'generation-fields');
    const model = elements.find((element) => element.tag === 'select');
    model.value = 'nanobanana';
    fields.events.change();
    expect(ui.hasInputDraft()).toBe(true);
    model.value = 'auto';
    fields.events.change();
    expect(ui.hasInputDraft()).toBe(false);
    elements
      .find((element) => element.title === '移除参考图 1')
      .events.click({ stopPropagation() {} });
    expect(ui.hasInputDraft()).toBe(true);
  });

  test('saved automatic image model is omitted at the backend boundary', async () => {
    const { options, ui, image } = imageFixture();
    (image.generation as any).parameters = { model: 'auto' };
    await ui.runTemplateImage(image.id);
    expect(options.store.generateImage).toHaveBeenCalled();
    expect(options.store.generateImage.mock.calls[0][1].model).toBeUndefined();
  });

  test.each(['variant', 'outpaint', 'generate'])(
    '%s preserves edit instructions and only new generation receives asset defaults',
    async (operation) => {
      const { options, ui, image } = imageFixture();
      const prompt = '只去掉按钮文字和Icon，保留原底板、边框、底部厚度与阴影';
      image.generation.prompt = prompt;
      image.generation.operation = operation;
      await ui.runTemplateImage(image.id);
      const submitted = options.store.generateImage.mock.calls[0][1].prompt;
      if (operation === 'generate') {
        expect(submitted).toContain(prompt);
        expect(submitted).toContain('游戏素材约束：');
      } else {
        expect(submitted).toBe(prompt);
      }
    }
  );

  test('manual panels show explicit references in edge order and template generation respects removals', async () => {
    const { document, options, ui, image, source } = imageFixture(true);
    (image as any).referenceInput = { includeSelf: true };
    image.generation!.referenceImagePaths = [];
    const other = { ...source, id: 'other', assetPath: 'assets/image/other.png' };
    document.nodes.push(other);
    document.edges.unshift({
      id: 'other-edge',
      from: other.id,
      to: image.id,
      kind: 'image-variant',
    });
    ui.render({ append: jest.fn() }, image, document.nodes);
    expect(displayedPaths()).toEqual([other.assetPath, source.assetPath, image.assetPath]);
    elements
      .filter((element) => element.className === 'generation-reference-remove')
      .forEach((element) => element.events.click({ stopPropagation() {} }));
    elements = [];
    ui.render({ append: jest.fn() }, image, document.nodes);
    expect(displayedPaths()).toEqual([]);
    await ui.runTemplateImage(image.id);
    const input = options.store.generateImage.mock.calls[0][1];
    expect(input).toMatchObject({ operation: 'generate', referenceImagePaths: [] });
    expect(input.sourceImageIds).toBeUndefined();
    ui.resetDraft(image.id);
    (image as any).referenceInput.includeSelf = false;
    elements = [];
    ui.render({ append: jest.fn() }, image, document.nodes);
    expect(displayedPaths()).toEqual([other.assetPath, source.assetPath]);
  });

  test.each([
    { remove: false, imported: false },
    { remove: true, imported: false },
    { remove: true, imported: true },
  ])('manual refresh submits the displayed draft: %j', async ({ remove, imported }) => {
    const { document, options, ui, image } = imageFixture(imported);
    const before = structuredClone(document);
    const card = { append: jest.fn() };
    ui.render(card, image, document.nodes);
    expect(displayedPaths()).toEqual([image.assetPath, ...image.generation.referenceImagePaths]);
    if (remove) {
      elements
        .find((element) => element.title === '移除当前图片参考')
        .events.click({
          stopPropagation() {},
        });
      elements = [];
      ui.render(card, image, document.nodes);
      expect(displayedPaths()).toEqual(image.generation.referenceImagePaths);
    }
    elements
      .find((element) => element.textContent === '刷新结果')
      .events.click({
        stopPropagation() {},
      });
    await new Promise((resolve) => setImmediate(resolve));
    expect(options.store.generateImage).toHaveBeenCalledTimes(1);
    const input = options.store.generateImage.mock.calls[0][1];
    expect(input.operation).toBe(remove ? 'generate' : 'variant');
    expect(input.sourceImageIds).toEqual(remove ? undefined : [image.id]);
    expect(input.sourceImagePaths).toEqual(remove ? undefined : [image.assetPath]);
    expect(input.referenceImagePaths).toEqual(image.generation.referenceImagePaths);
    expect(document).toEqual(before);
  });

  test('template refresh respects manual reference removals', async () => {
    const { document, options, ui, image, source } = imageFixture();
    ui.render({ append: jest.fn() }, image, document.nodes, undefined, {
      canSubmit: true,
      submit: async (execute) => {
        await execute();
      },
    });
    expect(displayedPaths()).toEqual([source.assetPath, image.assetPath]);
    elements
      .filter((element) => element.className === 'generation-reference-remove')
      .forEach((element) => element.events.click({ stopPropagation() {} }));
    await ui.runTemplateImage(image.id);
    expect(options.store.generateImage).toHaveBeenCalledWith(
      document.id,
      expect.objectContaining({
        targetNodeId: image.id,
        operation: 'generate',
      })
    );
  });
});

test('template recovers an existing successful attempt without new paid generation', async () => {
  const { document, options, ui } = fixture();
  expect(await ui.runTemplateVideo('video', 4)).toBe(true);
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(document.nodes[1].assetPath).toBe('new.mp4');
  expect(document.edges).toHaveLength(1);
});

test('history recovery updates only an unchanged target and never starts downstream work', async () => {
  const { document, attempt, options, ui } = fixture();
  Object.assign(attempt, {
    targetAssetPath: 'old.mp4',
    sourceSnapshots: [snapshotCanvasSource(document.nodes[0])],
  });
  expect(await ui.recoverVideo(attempt)).toBe(true);
  expect(document.nodes[1].assetPath).toBe('new.mp4');
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(options.store.generationAction).not.toHaveBeenCalled();
});

test.each(['target', 'source', 'deleted', 'newer', 'canvas', 'snapshot', 'legacy'])(
  'history recovery preserves changed or unverifiable card: %s',
  async (change) => {
    const { document, attempt, options, ui } = fixture();
    Object.assign(attempt, {
      targetAssetPath: 'old.mp4',
      sourceSnapshots: [snapshotCanvasSource(document.nodes[0])],
    });
    if (change === 'target') document.nodes[1].assetPath = 'replacement.mp4';
    if (change === 'source') document.nodes[0].assetPath = 'replacement.png';
    if (change === 'deleted') document.nodes.pop();
    if (change === 'newer')
      options.store.listGeneration.mockResolvedValue([
        attempt,
        {
          ...attempt,
          id: 'newer',
          createdAt: new Date(Date.parse(attempt.createdAt) + 1000).toISOString(),
        },
      ]);
    if (change === 'canvas') attempt.canvasId = 'different';
    if (change === 'snapshot') delete (attempt as any).sourceSnapshots;
    if (change === 'legacy') delete (attempt as any).targetAssetPath;
    const before = JSON.stringify(document);
    expect(await ui.recoverVideo(attempt)).toBe(false);
    expect(JSON.stringify(document)).toBe(before);
    expect(options.store.createVideo).not.toHaveBeenCalled();
  }
);

test('failed video with a task ID queries instead of submitting a second paid job', async () => {
  const { options, ui } = fixture('failed');
  expect(await ui.runTemplateVideo('video', 4)).toBe(true);
  expect(options.store.createVideo).not.toHaveBeenCalled();
  expect(options.store.generationAction).toHaveBeenCalledWith('canvas', 'attempt', 'query');
});

test('reopening after rejected recovery never overwrites a manual replacement', async () => {
  const { document, attempt, options, ui } = fixture();
  document.nodes[1].assetPath = 'replacement.mp4';
  expect(await ui.recoverVideo(attempt)).toBe(false);
  await createCanvasGenerationUi(options).restore();
  expect(document.nodes[1].assetPath).toBe('replacement.mp4');
  expect(options.store.createVideo).not.toHaveBeenCalled();
});

test('historical video occupancy does not block an explicit submission', async () => {
  const { options } = fixture();
  options.store.listGeneration.mockResolvedValue([]);
  const videoHistory = jest.fn(async () => ({ busy: { reason: '等待原任务' } }));
  const ui = createCanvasGenerationUi({ ...options, store: { ...options.store, videoHistory } });
  expect(await ui.runTemplateVideo('video', 4)).toBe(true);
  expect(videoHistory).not.toHaveBeenCalled();
  expect(options.store.createVideo).toHaveBeenCalledTimes(1);
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
    sourceSnapshots: [
      snapshotCanvasSource(document.nodes[0]),
      snapshotCanvasSource(document.nodes[2]),
    ],
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
  options.store.createVideo.mockImplementation(async (canvasId, input) => {
    const result = {
      ...fixtureResult.attempt,
      ...input,
      canvasId,
      targetAssetPath: video.assetPath || '',
      parameters: { mode: input.mode },
      sourceSnapshots: input.sourceImageIds.map((id: string) =>
        snapshotCanvasSource(document.nodes.find((node: any) => node.id === id))
      ),
    };
    options.store.listGeneration.mockResolvedValue([result]);
    return result;
  });
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
    }),
    expect.any(AbortSignal)
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
      targetAssetPath: '',
    });
    delete video.assetPath;
    document.edges = document.edges.filter((edge: any) => edge.from !== removedId);
    const edgesBefore = structuredClone(document.edges);
    options.store.listGeneration.mockResolvedValue([attempt]);
    await ui.restore();
    expect(video.assetPath).toBeUndefined();
    expect(document.edges).toEqual(edgesBefore);
    expect(video.generation.attemptId).toBeUndefined();
    expect(options.store.createVideo).not.toHaveBeenCalled();
  }
);

test('legacy multi-image recovery with missing sources leaves the result only in history', async () => {
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
  expect(video.sourceSnapshots).toBeUndefined();
  expect(video.assetPath).toBeUndefined();
  expect(video.generation.attemptId).toBeUndefined();
  expect(options.store.createVideo).not.toHaveBeenCalled();
});

test('tail changes during generation preserve the old card and keep the new result in history', async () => {
  const { ui, options, attempt, head, tail, video } = twoFrameFixture();
  const snapshots = [snapshotCanvasSource(head), snapshotCanvasSource(tail)];
  const before = structuredClone(video);
  options.store.createVideo.mockImplementation(async (canvasId, input) => {
    const result = {
      ...attempt,
      ...input,
      canvasId,
      targetAssetPath: video.assetPath || '',
      parameters: { mode: input.mode },
      sourceSnapshots: snapshots,
    };
    options.store.listGeneration.mockResolvedValue([result]);
    tail.assetPath = 'assets/image/changed-during-generation.png';
    return result;
  });
  expect(await ui.runTemplateVideo(video.id, 4)).toBe(false);
  expect(video).toEqual(before);
  expect(await options.store.listGeneration()).toEqual([
    expect.objectContaining({
      id: attempt.id,
      status: 'succeeded',
      resultAssetPath: 'new.mp4',
      sourceSnapshots: snapshots,
      sourceImagePaths: ['assets/image/new.png', 'assets/image/tail.png'],
    }),
  ]);
  expect(options.store.createVideo).toHaveBeenCalledTimes(1);
  expect(options.onGenerated).not.toHaveBeenCalled();
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
    }),
    expect.any(AbortSignal)
  );
  expect(document.nodes).toHaveLength(2);
  expect(document.nodes[1].generation.parameters.duration).toBe(7);
  expect(document.nodes[1].generation.attemptId).toBe(attempt.id);
});

test('an already applied success is not reused as a new generation for a pending card', async () => {
  const { document, options, ui, attempt } = fixture();
  document.nodes[1].generation.attemptId = attempt.id;
  document.nodes[1].templatePending = true;
  const next = {
    ...attempt,
    id: 'new-attempt',
    createdAt: new Date(Date.parse(attempt.createdAt) + 1).toISOString(),
  };
  options.store.createVideo.mockImplementation(async () => {
    options.store.listGeneration.mockResolvedValue([next, attempt]);
    return next;
  });
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
  expect(await ui.runTemplateVideo('video', 4)).toBe(true);
  expect(options.store.createVideo).toHaveBeenCalledTimes(1);
  expect(options.store.generationAction).toHaveBeenCalledWith('canvas', 'attempt', 'query');
});

test('template video submits visible prompt without hidden constraints', async () => {
  const { options, ui } = fixture('failed');
  options.store.listGeneration.mockResolvedValue([]);

  await ui.runTemplateVideo('video', 4);

  const input = options.store.createVideo.mock.calls[0][1];
  expect(input.prompt).toBe('挥剑');
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
    expect(ui.nodeState('video')).toEqual({ status, canQuery: true });
    expect(ui.nodeState('head')).toBeUndefined();
  }
);

test('unknown history does not lock adjustment; only querying expires after six hours', async () => {
  jest.useFakeTimers();
  try {
    const { ui, attempt, options } = fixture('unknown');
    await ui.restore();
    expect(ui.hasUnsettledResult('video')).toBe(false);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(ui.nodeState('video')).toEqual({ status: 'unknown', canQuery: true });
    await jest.advanceTimersByTimeAsync(21_000_000);
    expect(ui.nodeState('video')).toEqual({ status: 'unknown', canQuery: false });
    await ui.queryNode('video');
    expect(options.store.generationAction).not.toHaveBeenCalled();
    expect(attempt.status).toBe('unknown');
  } finally {
    jest.useRealTimers();
  }
});

test('pending queries continue beyond ten minutes and stop immediately on request', async () => {
  jest.useFakeTimers();
  try {
    const { options, ui, attempt } = fixture('pending');
    options.store.generationAction.mockResolvedValue(attempt);
    const completed = jest.fn();
    const running = ui.runTemplateVideo('video', 4).then(completed);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(completed).not.toHaveBeenCalled();
    expect(ui.canStopWaiting('video')).toBe(true);
    ui.stopWaiting('video');
    await running;
    expect(completed).toHaveBeenCalledWith(false);
    expect(ui.isBusy).toBe(false);
    const calls = options.store.generationAction.mock.calls.length;
    await jest.advanceTimersByTimeAsync(600_000);
    expect(options.store.generationAction).toHaveBeenCalledTimes(calls);
    expect(options.store.createVideo).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('stopping during history lookup prevents a later paid submission', async () => {
  const { options, ui } = fixture();
  let finishLookup!: (attempts: any[]) => void;
  options.store.listGeneration.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishLookup = resolve;
      })
  );
  const running = ui.runTemplateVideo('video', 4, true);
  ui.stopWaiting('video');
  finishLookup([]);
  expect(await running).toBe(false);
  expect(options.store.createVideo).not.toHaveBeenCalled();
});

test.each(['stop', 'timeout'])(
  'submission releases waiting on %s and does not restore a late result',
  async (method) => {
    jest.useFakeTimers();
    try {
      const { document, options, ui, attempt } = fixture('running');
      attempt.taskId = '';
      attempt.resultAssetPath = '';
      options.store.listGeneration.mockResolvedValue([]);
      let finishSubmission!: (result: typeof attempt) => void;
      options.store.createVideo.mockImplementation(() => {
        options.store.listGeneration.mockResolvedValue([attempt]);
        return new Promise((resolve) => {
          finishSubmission = resolve;
        });
      });
      options.store.generationAction.mockResolvedValue(attempt);
      const before = structuredClone(document);
      const running = ui.runTemplateVideo('video', 4);
      await jest.advanceTimersByTimeAsync(0);
      expect(ui.canStopWaiting('video')).toBe(true);
      if (method === 'stop') ui.stopWaiting('video');
      else await jest.advanceTimersByTimeAsync(300_000);
      expect(await running).toBe(false);
      expect(ui.isNodeBusy('video')).toBe(false);
      expect(ui.isBusy).toBe(false);
      expect(options.store.createVideo.mock.calls[0][2]?.aborted).toBe(true);
      expect(document).toEqual(before);
      const lateResult = {
        ...attempt,
        status: 'succeeded',
        taskId: 'late-task',
        resultAssetPath: 'late.mp4',
      };
      options.store.listGeneration.mockResolvedValue([lateResult]);
      finishSubmission(lateResult);
      await jest.advanceTimersByTimeAsync(0);
      await ui.restore();
      expect(document).toEqual(before);
      expect(ui.nodeState('video')).toEqual({ status: 'canceled', canQuery: true });
      expect(ui.queueBlockReason('video')).toBeDefined();
      expect(options.store.createVideo).toHaveBeenCalledTimes(1);
      expect(options.store.generationAction).toHaveBeenCalledWith('canvas', attempt.id, 'cancel');
      expect(options.onGenerated).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  }
);

test('stopping an in-flight query releases the card and ignores its late success', async () => {
  jest.useFakeTimers();
  try {
    const { document, options, ui, attempt } = fixture('pending');
    let finishQuery!: (result: typeof attempt) => void;
    options.store.generationAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishQuery = resolve;
        })
    );
    const before = structuredClone(document);
    await ui.restore();
    const running = ui.queryNode('video');
    expect(ui.canStopWaiting('video')).toBe(true);
    ui.stopWaiting('video');
    finishQuery({ ...attempt, status: 'succeeded', resultAssetPath: 'late.mp4' });
    await running;
    expect(ui.isBusy).toBe(false);
    expect(document).toEqual(before);
    expect(options.onGenerated).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test.each(['unknown', 'failed', 'canceled'])(
  'automatic group pauses a first %s video response even with task ID',
  async (status) => {
    const { ui, options } = fixture(status);
    options.store.listGeneration.mockResolvedValueOnce([]);
    expect(await ui.runTemplateVideo('video', 4, true)).toBe(false);
    expect(options.store.createVideo).toHaveBeenCalledTimes(1);
    expect(options.store.generationAction).not.toHaveBeenCalled();
    expect(options.onGenerated).not.toHaveBeenCalled();
  }
);

test('confirmed queue retries an unsent local video failure and keeps the submission error', async () => {
  const { ui, options, attempt } = fixture('failed');
  attempt.taskId = undefined;
  attempt.executionState = 'not_executed';
  attempt.error = 'Cannot resolve user_id';
  attempt.resultAssetPath = undefined;
  await ui.restore();
  expect(ui.nodeState('video')).toEqual({ status: 'failed', canQuery: false });
  expect(ui.queueBlockReason('video')).toBeUndefined();
  const retry = {
    ...attempt,
    id: 'retry',
    createdAt: new Date(Date.now() + 1000).toISOString(),
  };
  options.store.listGeneration.mockResolvedValue([attempt]);
  options.store.createVideo.mockImplementation(async () => {
    options.store.listGeneration.mockResolvedValue([retry, attempt]);
    return retry;
  });
  expect(await ui.runTemplateVideo('video', 4, true)).toBe(false);
  expect(options.store.createVideo).toHaveBeenCalledTimes(1);
  expect(options.store.generationAction).not.toHaveBeenCalled();
  const messages = options.setError.mock.calls.map((call) => String(call[0]));
  expect(messages.join('\n')).toContain('Cannot resolve user_id');
  expect(messages.join('\n')).not.toContain('视频结果未确认');
});

test('a remote failed video still blocks the confirmed queue', async () => {
  const { ui } = fixture('failed');
  await ui.restore();
  expect(ui.queueBlockReason('video')).toContain('卡片结果未确认');
  expect(ui.nodeState('video')).toEqual({ status: 'failed', canQuery: true });
});

test.each(['项目授权失败', 'reference=-326001', 'MCP error -32600: 项目授权失败'])(
  'unknown image result stays locked despite diagnostic text %s',
  async (error) => {
    const { ui, attempt, document, options } = fixture('unknown');
    attempt.kind = 'image';
    attempt.toolName = 'generate_image';
    attempt.taskId = undefined;
    attempt.executionState = 'unknown';
    attempt.targetNodeId = 'head';
    attempt.error = error;
    document.nodes[0].templatePending = true;
    await ui.restore();
    expect(ui.queueBlockReason('head')).toBeDefined();
    expect(ui.hasUnsettledResult('head')).toBe(true);
    await ui.runTemplateImage('head');
    expect(options.store.generateImage).not.toHaveBeenCalled();
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
