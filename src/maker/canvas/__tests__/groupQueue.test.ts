import { createCanvasGroupQueue } from '../groupQueue.js';
import { emptyDocument, type CanvasDocument, type CanvasNode } from '../model.js';

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function node(id: string, type: CanvasNode['type'], groupId = 'group'): CanvasNode {
  return {
    id,
    type,
    title: id,
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    ...(type === 'section' ? { templateId: 'template' } : { sectionId: groupId }),
  };
}

function fixture() {
  const document = emptyDocument();
  document.nodes = [
    node('group', 'section'),
    node('animation', 'animation'),
    node('sequence', 'sequence'),
    node('video', 'video-source'),
    node('image', 'image'),
  ];
  document.edges = [
    { id: 'iv', from: 'image', to: 'video', kind: 'image-to-video' },
    { id: 'vs', from: 'video', to: 'sequence', kind: 'sequence-source' },
    { id: 'sa', from: 'sequence', to: 'animation', kind: 'sequence-animation' },
  ];
  let current: CanvasDocument | null = document;
  const completed = new Set<string>();
  const problems = new Map<string, string>();
  const options = {
    getDocument: () => current,
    needs: (id: string) => !completed.has(id),
    problem: (id: string) => problems.get(id),
    busy: jest.fn(() => false),
    stopActive: jest.fn((_id: string) => {}),
    run: jest.fn(async (id: string) => {
      completed.add(id);
      return true;
    }),
    confirm: jest.fn(() => true),
    changed: jest.fn(),
    error: jest.fn(),
  };
  return {
    document,
    completed,
    problems,
    options,
    queue: createCanvasGroupQueue(options),
    setDocument(value: CanvasDocument | null) {
      current = value;
    },
  };
}

function twoGroups() {
  const setup = fixture();
  setup.document.nodes = [
    node('group', 'section'),
    node('video', 'video-source'),
    node('other-group', 'section'),
    node('other-image', 'image', 'other-group'),
  ];
  setup.document.edges = [];
  return setup;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('executes dependency order serially and waits for each single-step result', async () => {
  const { queue, options, completed } = fixture();
  const order = ['image', 'video', 'sequence', 'animation'];
  const controls = new Map(order.map((id) => [id, deferred<boolean>()]));
  options.run.mockImplementation(async (id) => {
    const success = await controls.get(id)!.promise;
    if (success) completed.add(id);
    return success;
  });

  queue.start('group');
  queue.start('group');
  for (const [index, id] of order.entries()) {
    await jest.advanceTimersByTimeAsync(0);
    expect(options.run.mock.calls.map(([calledId]) => calledId)).toEqual(order.slice(0, index + 1));
    expect(queue.view('group')).toMatchObject({ active: id, completed: index });
    controls.get(id)!.resolve(true);
  }
  await jest.advanceTimersByTimeAsync(0);

  expect(options.confirm).toHaveBeenCalledTimes(1);
  expect(queue.view('group')).toMatchObject({ phase: 'complete', completed: 4, pending: [] });
  expect(queue.isBusy).toBe(false);
});

test('omits already completed cards when starting a group', async () => {
  const { queue, completed, options } = fixture();
  completed.add('image');
  completed.add('video');
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);

  expect(options.run.mock.calls).toEqual([['sequence'], ['animation']]);
  expect(queue.view('group')).toMatchObject({ phase: 'complete', total: 2, completed: 2 });
});

test('static workflow does not finish until the final resource card succeeds', async () => {
  const { queue, document, options } = fixture();
  document.nodes = [
    node('group', 'section'),
    node('assets', 'image-assets'),
    node('image', 'image'),
  ];
  document.edges = [{ id: 'ia', from: 'image', to: 'assets', kind: 'image-assets' }];
  const assets = deferred<boolean>();
  options.run.mockImplementation(async (id) => (id === 'assets' ? assets.promise : true));
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls).toEqual([['image'], ['assets']]);
  expect(queue.view('group')).toMatchObject({ phase: 'running', active: 'assets', total: 2 });
  assets.resolve(false);
  await jest.advanceTimersByTimeAsync(10000);
  expect(queue.view('group')).toMatchObject({ phase: 'paused', pending: ['assets'], completed: 1 });
  expect(options.run).toHaveBeenCalledTimes(2);
});

test('skips a queued card completed while waiting for the shared execution lock', async () => {
  const { queue, completed, options } = fixture();
  options.busy.mockReturnValue(true);
  queue.start('group');
  expect(options.run).not.toHaveBeenCalled();
  completed.add('image');
  options.busy.mockReturnValue(false);
  await jest.advanceTimersByTimeAsync(2000);

  expect(options.run.mock.calls).toEqual([['video'], ['sequence'], ['animation']]);
  expect(queue.view('group')).toMatchObject({ phase: 'complete', completed: 4 });
});

test('allows reordering independent pending cards and follows the new order', async () => {
  const { queue, document, options } = fixture();
  document.nodes = [node('group', 'section'), node('first', 'image'), node('second', 'image')];
  document.edges = [];
  options.busy.mockReturnValue(true);
  queue.start('group');

  expect(queue.move('group', 'second', 'first')).toBe(true);
  expect(queue.view('group')?.pending).toEqual(['second', 'first']);
  options.busy.mockReturnValue(false);
  await jest.advanceTimersByTimeAsync(2000);

  expect(options.run.mock.calls).toEqual([['second'], ['first']]);
});

test('rejects moving a dependent before its source or a source after its dependent', () => {
  const { queue, options } = fixture();
  options.busy.mockReturnValue(true);
  queue.start('group');

  expect(queue.move('group', 'sequence', 'video')).toBe(false);
  expect(queue.move('group', 'image')).toBe(false);
  expect(queue.view('group')?.pending).toEqual(['image', 'video', 'sequence', 'animation']);
  expect(options.run).not.toHaveBeenCalled();
});

test('stopping waits for the active step without canceling it or starting descendants', async () => {
  const { queue, options } = fixture();
  const active = deferred<boolean>();
  options.run.mockReturnValueOnce(active.promise);
  queue.start('group');
  queue.stop('group');
  await jest.advanceTimersByTimeAsync(10000);

  expect(queue.view('group')).toMatchObject({ active: 'image', stopping: true, completed: 0 });
  expect(queue.isBusy).toBe(true);
  expect(options.run.mock.calls).toEqual([['image']]);
  expect(queue.move('group', 'image', 'video')).toBe(false);

  active.resolve(true);
  await jest.advanceTimersByTimeAsync(10000);

  expect(queue.view('group')).toMatchObject({
    phase: 'paused',
    active: undefined,
    completed: 1,
    pending: ['video', 'sequence', 'animation'],
  });
  expect(options.run.mock.calls).toEqual([['image']]);
  expect(queue.isBusy).toBe(false);
});

test('stopping an active video releases local waiting immediately and never starts descendants', async () => {
  const { queue, options, completed } = fixture();
  completed.add('image');
  const remote = deferred<boolean>();
  const stopped = deferred<boolean>();
  options.run.mockReturnValueOnce(Promise.race([remote.promise, stopped.promise]));
  options.stopActive.mockImplementation(() => stopped.resolve(false));
  queue.start('group');
  expect(queue.view('group')?.active).toBe('video');
  queue.stop('group');
  expect(options.stopActive).toHaveBeenCalledWith('video');
  await jest.advanceTimersByTimeAsync(0);

  expect(queue.isBusy).toBe(false);
  expect(queue.protects('video')).toBe(false);
  expect(queue.view('group')).toMatchObject({
    phase: 'paused',
    active: undefined,
    completed: 0,
    pending: ['video', 'sequence', 'animation'],
  });
  remote.resolve(true);
  await jest.advanceTimersByTimeAsync(10000);
  expect(options.run.mock.calls).toEqual([['video']]);
  expect(queue.view('group')).toMatchObject({ phase: 'paused', completed: 0 });
});

test.each(['false', 'throw'])(
  'a single-step %s pauses without automatically retrying',
  async (failure) => {
    const { queue, options } = fixture();
    if (failure === 'throw') options.run.mockRejectedValueOnce(new Error('save failed'));
    else options.run.mockResolvedValueOnce(false);
    queue.start('group');
    await jest.advanceTimersByTimeAsync(20000);

    expect(options.run.mock.calls).toEqual([['image']]);
    expect(queue.view('group')).toMatchObject({
      phase: 'paused',
      completed: 0,
      pending: ['image', 'video', 'sequence', 'animation'],
    });
    expect(queue.isBusy).toBe(false);
  }
);

test.each(['failed', 'unknown'])(
  'a %s problem pauses before skipping an apparently completed card',
  async (problem) => {
    const { queue, options, completed, problems } = fixture();
    options.busy.mockReturnValue(true);
    queue.start('group');
    completed.add('image');
    problems.set('image', problem);
    options.busy.mockReturnValue(false);
    await jest.advanceTimersByTimeAsync(20000);

    expect(options.run).not.toHaveBeenCalled();
    expect(queue.view('group')).toMatchObject({
      phase: 'paused',
      completed: 0,
      message: 'image：' + problem,
    });
    expect(options.error).toHaveBeenCalledWith(problem);
  }
);

test('groups share the single-step lock and one group failure does not stop another', async () => {
  const { queue, options } = twoGroups();
  const active = deferred<boolean>();
  options.run.mockReturnValueOnce(active.promise);
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  queue.start('other-group');
  await jest.advanceTimersByTimeAsync(4000);

  expect(options.run.mock.calls).toEqual([['video']]);
  expect(queue.view('other-group')?.pending).toEqual(['other-image']);
  active.resolve(false);
  await jest.advanceTimersByTimeAsync(4000);

  expect(options.run.mock.calls).toEqual([['video'], ['other-image']]);
  expect(queue.view('group')?.phase).toBe('paused');
  expect(queue.view('other-group')?.phase).toBe('complete');
});

test('videos use the same execution queue as other cards without a separate occupancy check', async () => {
  const { queue, options } = twoGroups();
  options.busy.mockReturnValue(true);
  queue.start('group');
  queue.start('other-group');
  options.busy.mockReturnValue(false);
  await jest.advanceTimersByTimeAsync(4000);

  expect(options.run.mock.calls).toEqual([['video'], ['other-image']]);
  expect(queue.view('other-group')?.phase).toBe('complete');
  expect(queue.view('group')?.phase).toBe('complete');
});

test('an upstream video rejection pauses only its own group and does not retry it', async () => {
  const { queue, options } = twoGroups();
  options.busy.mockReturnValue(true);
  options.run.mockRejectedValueOnce(new Error('Maker concurrency limit'));
  queue.start('group');
  queue.start('other-group');
  options.busy.mockReturnValue(false);
  await jest.advanceTimersByTimeAsync(20000);

  expect(options.run.mock.calls).toEqual([['video'], ['other-image']]);
  expect(options.error).toHaveBeenCalledWith('Maker concurrency limit');
  expect(queue.view('group')?.phase).toBe('paused');
  expect(queue.view('other-group')?.phase).toBe('complete');
});

test('switching canvas during execution prevents continuation or restoration', async () => {
  const { queue, document, options, setDocument } = fixture();
  const pending = deferred<boolean>();
  options.run.mockReturnValueOnce(pending.promise);
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  setDocument(emptyDocument());
  expect(queue.view('group')).toBeUndefined();
  pending.resolve(true);
  await jest.advanceTimersByTimeAsync(10000);

  expect(options.run.mock.calls).toEqual([['image']]);
  expect(queue.isBusy).toBe(false);
  setDocument(document);
  // Reopening shows the saved checkpoint as stopped; it never claims a live executor.
  expect(queue.view('group')).toMatchObject({ phase: 'paused', running: {} });
  expect(queue.isBusy).toBe(false);
  await jest.advanceTimersByTimeAsync(10000);
  expect(options.run.mock.calls).toEqual([['image']]);
});

test.each(['throw', 'unknown'])(
  'isolates a %s branch including transitive dependents and joins',
  async (failure) => {
    const { document, options, completed, problems, queue } = fixture();
    document.nodes.push(
      node('independent', 'image'),
      node('package', 'image-assets'),
      node('join', 'image')
    );
    document.edges.push(
      { id: 'ip', from: 'independent', to: 'package', kind: 'image-assets' },
      { id: 'ij', from: 'independent', to: 'join', kind: 'image-variant' },
      { id: 'aj', from: 'animation', to: 'join', kind: 'image-variant' }
    );
    if (failure === 'unknown') problems.set('image', '结果未知');
    else
      options.run.mockImplementation(async (id) => {
        if (id === 'image') throw new Error('生成失败');
        completed.add(id);
        return true;
      });
    queue.start('group');
    await jest.advanceTimersByTimeAsync(20000);
    expect(completed).toEqual(new Set(['independent', 'package']));
    expect(queue.view('group')).toMatchObject({ phase: 'paused', completed: 2, total: 7 });
    expect(queue.blockedBy('group', 'join')).toBe('image');
    expect(queue.blockedBy('group', 'independent')).toBeUndefined();
    const before = options.run.mock.calls.length;
    problems.clear();
    options.run.mockImplementation(async (id) => {
      completed.add(id);
      return true;
    });
    queue.start('group');
    await jest.advanceTimersByTimeAsync(0);
    expect(options.run.mock.calls.slice(before).map(([id]) => id)).toEqual([
      'image',
      'video',
      'sequence',
      'animation',
      'join',
    ]);
    expect(queue.view('group')).toMatchObject({ phase: 'complete', completed: 7, total: 7 });
  }
);

test('quality failure regenerates only its source twice and then continues independent work', async () => {
  const { document, options, completed } = fixture();
  document.nodes = [
    node('group', 'section'),
    node('source', 'image'),
    node('assets', 'image-assets'),
    node('other', 'image'),
  ];
  document.edges = [{ id: 'sa', from: 'source', to: 'assets', kind: 'image-assets' }];
  options.run.mockImplementation(async (id) => {
    if (id === 'assets') throw new Error('图集排版不合格');
    completed.add(id);
    return true;
  });
  const queue = createCanvasGroupQueue({
    ...options,
    retryTarget: (id) => (id === 'assets' ? 'source' : undefined),
    prepareRetry: (id) => {
      completed.delete(id);
    },
  });
  queue.start('group');
  await jest.advanceTimersByTimeAsync(20000);
  expect(options.run.mock.calls.map(([id]) => id)).toEqual([
    'source',
    'assets',
    'other',
    'source',
    'assets',
    'source',
    'assets',
  ]);
  expect(queue.view('group')).toMatchObject({
    phase: 'paused',
    completed: 2,
    total: 3,
    retries: { source: 2 },
    failures: { assets: '图集排版不合格' },
  });
});

test('stopping a failed attempt suppresses its automatic retry', async () => {
  const { options } = fixture();
  const active = deferred<boolean>();
  options.run.mockReturnValueOnce(active.promise);
  const retry = jest.fn(() => 'image');
  const queue = createCanvasGroupQueue({ ...options, retryTarget: retry });
  queue.start('group');
  queue.stop('group');
  active.resolve(false);
  await jest.advanceTimersByTimeAsync(20000);
  expect(retry).not.toHaveBeenCalled();
  expect(options.run).toHaveBeenCalledTimes(1);
});

test('a save failure pauses all queued groups before another paid step', async () => {
  const { options } = twoGroups();
  const active = deferred<boolean>();
  options.run.mockReturnValueOnce(active.promise);
  const queue = createCanvasGroupQueue({ ...options, haltReason: () => '画布保存失败' });
  queue.start('group');
  queue.start('other-group');
  active.resolve(false);
  await jest.advanceTimersByTimeAsync(20000);
  expect(options.run).toHaveBeenCalledTimes(1);
  expect(queue.view('group')).toMatchObject({ phase: 'paused', pending: ['video'] });
  expect(queue.view('other-group')?.phase).toBe('paused');
});

function parallelFixture() {
  const setup = fixture();
  const images = ['first', 'second', 'third', 'fourth'];
  setup.document.nodes = [
    node('group', 'section'),
    node('reference', 'image'),
    ...images.flatMap((id) => [node(id, 'image'), node(id + '-assets', 'image-assets')]),
  ];
  setup.document.edges = images.flatMap((id) => [
    { id: 'ref-' + id, from: 'reference', to: id, kind: 'image-variant' as const },
    { id: 'assets-' + id, from: id, to: id + '-assets', kind: 'image-assets' as const },
  ]);
  setup.completed.add('reference');
  const controls = new Map(images.map((id) => [id, deferred<boolean>()]));
  setup.options.run.mockImplementation(async (id) => {
    const success = controls.has(id) ? await controls.get(id)!.promise : true;
    if (success) setup.completed.add(id);
    return success;
  });
  const queue = createCanvasGroupQueue({
    ...setup.options,
    parallel: (id) => images.includes(id),
  });
  return { ...setup, queue, images, controls };
}

test('runs three independent images and immediately fills a freed slot while cutting ready output', async () => {
  const { queue, controls, options } = parallelFixture();
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls.map(([id]) => id)).toEqual(['first', 'second', 'third']);
  expect(Object.keys(queue.view('group')!.running)).toEqual(['first', 'second', 'third']);

  options.busy.mockReturnValue(true);
  controls.get('second')!.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls.map(([id]) => id)).toEqual([
    'first',
    'second',
    'third',
    'second-assets',
    'fourth',
  ]);
  expect(Object.keys(queue.view('group')!.running)).toEqual(['first', 'third', 'fourth']);
  options.busy.mockReturnValue(false);
  for (const control of controls.values()) control.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.view('group')).toMatchObject({ phase: 'complete', completed: 8, total: 8 });
});

test('does not start parallel descendants while their upstream is still running', async () => {
  const { document, options, completed } = fixture();
  document.nodes = [
    node('group', 'section'),
    node('source', 'image'),
    node('left', 'image'),
    node('right', 'image'),
  ];
  document.edges = ['left', 'right'].map((id) => ({
    id,
    from: 'source',
    to: id,
    kind: 'image-variant',
  }));
  const upstream = deferred<boolean>();
  options.run.mockImplementation(async (id) => {
    if (id === 'source') await upstream.promise;
    completed.add(id);
    return true;
  });
  const queue = createCanvasGroupQueue({ ...options, parallel: (id) => id !== 'source' });
  queue.start('group');
  await jest.advanceTimersByTimeAsync(1000);
  expect(options.run.mock.calls).toEqual([['source']]);
  upstream.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls).toEqual([['source'], ['left'], ['right']]);
  expect(queue.view('group')?.phase).toBe('complete');
});

test('shares the image concurrency limit across groups and completes each group independently', async () => {
  const { document, options, controls, completed } = parallelFixture();
  document.nodes.push(node('other-group', 'section'), node('other', 'image', 'other-group'));
  const other = deferred<boolean>();
  options.run.mockImplementation(async (id) => {
    const success =
      id === 'other'
        ? await other.promise
        : controls.has(id)
          ? await controls.get(id)!.promise
          : true;
    if (success) completed.add(id);
    return success;
  });
  const queue = createCanvasGroupQueue({
    ...options,
    parallel: (id) => id === 'other' || controls.has(id),
  });
  queue.start('group');
  queue.start('other-group');
  expect(options.run).toHaveBeenCalledTimes(3);
  for (const control of controls.values()) control.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.view('group')?.phase).toBe('complete');
  expect(queue.view('other-group')?.phase).toBe('running');
  expect(queue.view('group')?.elapsedMs).toBe(document.nodes[0].workDurationMs);
  other.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.isBusy).toBe(false);
});

test('stops every in-flight card and never starts a fourth image or a dependent after stopping', async () => {
  const { queue, controls, options, document } = parallelFixture();
  queue.start('group');
  await jest.advanceTimersByTimeAsync(1200);
  queue.stop('group');
  expect(options.stopActive.mock.calls).toEqual([['first'], ['second'], ['third']]);
  for (const control of controls.values()) control.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run).toHaveBeenCalledTimes(3);
  expect(queue.view('group')).toMatchObject({ phase: 'paused', completed: 3, elapsedMs: 1200 });
  expect(document.nodes[0].workDurationMs).toBe(1200);
  await jest.advanceTimersByTimeAsync(10000);
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.view('group')).toMatchObject({ phase: 'complete', completed: 8, elapsedMs: 1200 });
});

test('removing a queued member stops its group and ignores a late result', async () => {
  const { queue, controls, options } = parallelFixture();
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  queue.remove(['first']);
  expect(options.stopActive.mock.calls.length).toBeGreaterThan(0);
  for (const control of controls.values()) control.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls.map(([id]) => id)).not.toContain('first-assets');
  expect(queue.isBusy).toBe(false);
});

test('a reloaded paused flow keeps the saved elapsed time instead of starting at zero', async () => {
  const { document, options, controls } = parallelFixture();
  const queue = createCanvasGroupQueue(options);
  queue.start('group');
  await jest.advanceTimersByTimeAsync(1200);
  queue.stop('group');
  for (const control of controls.values()) control.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(document.nodes[0]).toMatchObject({ workTimingOpen: true, workDurationMs: 1200 });
  const startedAt = document.nodes[0].workStartedAt;
  document.nodes[0].workDurationMs = 1200 + 90000;
  const reloaded = createCanvasGroupQueue(options);
  expect(reloaded.view('group')).toMatchObject({ phase: 'paused' });
  expect(reloaded.isBusy).toBe(false);
  reloaded.start('group');
  await jest.advanceTimersByTimeAsync(0);
  expect(reloaded.view('group')?.elapsedMs).toBeGreaterThanOrEqual(91200);
  expect(document.nodes[0].workStartedAt).toBe(startedAt);
  expect(document.nodes[0].workDurationMs).toBeGreaterThanOrEqual(91200);
});

test('an unknown image blocks only its dependent while other parallel branches finish', async () => {
  const { queue, controls, problems, options } = parallelFixture();
  problems.set('first', '结果未知，不重提');
  queue.start('group');
  for (const control of controls.values()) control.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls.map(([id]) => id)).not.toContain('first-assets');
  expect(queue.view('group')).toMatchObject({
    phase: 'paused',
    completed: 6,
    failures: { first: '结果未知，不重提' },
  });
});

test('deleting a card of one group keeps an unrelated group queue running', async () => {
  const { queue, options, document, setDocument } = parallelFixture();
  document.nodes.push(node('other', 'section'), node('other-image', 'image', 'other'));
  queue.start('group');
  queue.start('other');
  await jest.advanceTimersByTimeAsync(0);
  queue.remove(['first']);
  setDocument({ ...document, nodes: document.nodes.filter((item) => item.id !== 'first') });
  expect(queue.view('other')).toBeDefined();
  expect(['queued', 'running', 'waiting', 'complete']).toContain(queue.view('other')!.phase);
  expect(options.stopActive).toHaveBeenCalledWith('first');
  expect(options.stopActive).not.toHaveBeenCalledWith('second');
});

test('a deleted run is ignored, while a later continue accepts results again', async () => {
  const { queue, controls, options } = parallelFixture();
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  queue.remove(['first']);
  for (const control of controls.values()) control.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls.map(([id]) => id)).not.toContain('first-assets');
  expect(queue.view('group')?.finished).toEqual(expect.arrayContaining(['second', 'third']));
  expect(queue.isBusy).toBe(false);
});

test('a reload after failure shows a stopped checkpoint, never a phantom running state', async () => {
  const { document, options, controls } = parallelFixture();
  const queue = createCanvasGroupQueue(options);
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  controls.get('first')!.resolve(false);
  await jest.advanceTimersByTimeAsync(0);
  expect(['queued', 'running']).toContain(document.nodes[0].workflowState?.phase);
  const reloaded = createCanvasGroupQueue(options);
  expect(reloaded.view('group')).toMatchObject({ phase: 'paused', running: {} });
  expect(reloaded.isBusy).toBe(false);
});

test('a very long failure is stored as a bounded checkpoint summary', async () => {
  const { document, options } = fixture();
  options.run.mockRejectedValue(new Error('x'.repeat(5000)));
  const queue = createCanvasGroupQueue(options);
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  const failure = document.nodes[0].workflowState?.failures.image || '';
  expect(failure.length).toBeLessThanOrEqual(300);
  expect(options.error).toHaveBeenCalledWith('x'.repeat(5000));
});

test('a prelayout scope stops at the review checkpoint before paid separation', async () => {
  const { document, options, completed } = fixture();
  document.nodes = [
    node('group', 'section'),
    { ...node('pre', 'image'), uiAtlasPrelayout: true, uiAtlasGroup: 'controls' },
    { ...node('split', 'image'), uiAtlasGroup: 'controls' },
    node('cut', 'image-assets'),
  ];
  document.edges = [
    { id: 'ps', from: 'pre', to: 'split', kind: 'image-variant' },
    { id: 'sc', from: 'split', to: 'cut', kind: 'image-assets' },
  ];
  const queue = createCanvasGroupQueue(options);
  queue.start('group', true, 'prelayout');
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls.map(([id]) => id)).toEqual(['pre']);
  expect(queue.view('group')).toMatchObject({ phase: 'paused', pauseReason: 'prelayout-review' });
  expect(document.nodes[0].workflowState?.pauseReason).toBe('prelayout-review');
  queue.start('group', true);
  await jest.advanceTimersByTimeAsync(0);
  expect(options.run.mock.calls.map(([id]) => id)).toEqual(['pre', 'split', 'cut']);
  expect(completed.has('cut')).toBe(true);
});

test('persists a failed checkpoint so a reloaded group still exposes the failure', async () => {
  const { document, options } = fixture();
  options.run.mockResolvedValue(false);
  const queue = createCanvasGroupQueue(options);
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  expect(document.nodes[0].workflowState).toMatchObject({
    phase: 'paused',
    failures: { image: expect.any(String) },
  });
  const reloaded = createCanvasGroupQueue(options);
  expect(reloaded.view('group')).toMatchObject({
    phase: 'paused',
    failures: { image: expect.any(String) },
  });
});

test('does not report completion until the final save succeeds', async () => {
  const { options, completed } = fixture();
  for (const id of ['image', 'video', 'sequence']) completed.add(id);
  const saved = deferred<boolean>();
  const queue = createCanvasGroupQueue({ ...options, save: () => saved.promise });
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.view('group')).toMatchObject({ phase: 'waiting', message: '保存执行结果' });
  saved.resolve(false);
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.view('group')?.phase).toBe('paused');
});

test('stopping while the final save is pending does not start duplicate saves', async () => {
  const { options } = fixture();
  const pending = deferred<boolean>();
  const save = jest.fn(() => pending.promise);
  const queue = createCanvasGroupQueue({ ...options, save });
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  queue.stop('group');
  await jest.advanceTimersByTimeAsync(5000);
  expect(save).toHaveBeenCalledTimes(1);
  pending.resolve(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.isBusy).toBe(false);
});

test('a rejected final save pauses instead of leaving a busy queue or unhandled rejection', async () => {
  const { options } = fixture();
  const queue = createCanvasGroupQueue({
    ...options,
    save: async () => {
      throw new Error('保存失败');
    },
  });
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.view('group')?.phase).toBe('paused');
  expect(queue.isBusy).toBe(false);
});

test('saves elapsed wall time while cards are still running and resumes without offline time', async () => {
  const { document, options } = parallelFixture();
  const queue = createCanvasGroupQueue(options);
  queue.start('group');
  await jest.advanceTimersByTimeAsync(10500);
  queue.checkpoint();
  const saved = structuredClone(document);
  expect(saved.nodes[0].workDurationMs).toBe(10500);
  await jest.advanceTimersByTimeAsync(30000);
  const restored = createCanvasGroupQueue({ ...options, getDocument: () => saved });
  restored.start('group');
  await jest.advanceTimersByTimeAsync(1000);
  restored.checkpoint();
  expect(saved.nodes[0].workDurationMs).toBe(11500);
});

test('a batch expansion error pauses instead of leaving the queue permanently busy', async () => {
  const { options } = fixture();
  const queue = createCanvasGroupQueue({
    ...options,
    expand: () => {
      throw new Error('bad batch');
    },
  });
  queue.start('group');
  await jest.advanceTimersByTimeAsync(0);
  expect(queue.view('group')).toMatchObject({ phase: 'paused', message: 'bad batch' });
  expect(queue.isBusy).toBe(false);
  expect(options.run).not.toHaveBeenCalled();
});
