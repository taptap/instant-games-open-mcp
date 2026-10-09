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
    expect(queue.view('group')).toMatchObject({ phase: 'paused', completed: 0, message: problem });
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
  expect(queue.view('group')).toBeUndefined();
  await jest.advanceTimersByTimeAsync(10000);
  expect(options.run.mock.calls).toEqual([['image']]);
});
