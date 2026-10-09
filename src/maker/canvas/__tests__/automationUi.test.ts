import { createCanvasAutomationUi } from '../automationUi.js';
import { emptyDocument } from '../model.js';

const globals = globalThis as any;
const previousDocument = globals.document;
beforeEach(() => {
  globals.document = { body: { inert: false }, addEventListener: jest.fn() };
});
afterEach(() => {
  if (previousDocument === undefined) delete globals.document;
  else globals.document = previousDocument;
});

function fixture() {
  const current = emptyDocument();
  current.nodes.push({
    id: 'image',
    type: 'image',
    title: 'image',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    assetPath: 'image.png',
    generation: { prompt: 'old prompt' },
  });
  const options = {
    current: () => current,
    blocked: jest.fn(() => undefined as string | undefined),
    nodeStatus: () => ({}),
    nodeBlocked: () => false,
    remember: jest.fn(),
    changed: jest.fn(),
    render: jest.fn(),
    save: jest.fn(async () => true),
    select: jest.fn(),
    selected: () => [],
    addTemplate: jest.fn(async (_id: string) => {}),
    resetDraft: jest.fn(),
    error: () => '',
    clearError: jest.fn(),
    busyChanged: jest.fn(),
    queue: { view: () => undefined },
  };
  const ui = createCanvasAutomationUi(
    options as unknown as Parameters<typeof createCanvasAutomationUi>[0]
  );
  const command = {
    pageId: 'page',
    canvasId: current.id,
    revision: 0,
    requestId: 'operation',
    action: 'inspect',
    input: {},
  };
  return { current, options, ui, command };
}

test('live snapshots do not change before acknowledgement when a person edits later', async () => {
  const { current, ui, command } = fixture();
  const result = (await ui.execute(command)) as any;
  current.nodes[0].generation!.prompt = 'later input';
  expect(result.nodes[0].generation.prompt).toBe('old prompt');
});

test('CLI recognition toggle preserves history and restores the baseline downstream prompt', async () => {
  const { current, options, ui, command } = fixture();
  const source = current.nodes[0];
  source.uiRecognition = { enabled: false, model: 'vision-a', results: [] };
  const target = {
    ...source,
    id: 'atlas',
    sectionId: 'group',
    uiRecognition: undefined,
    uiBaselinePrompt: 'baseline',
    generation: { prompt: 'recognition slots' },
  };
  current.nodes.push(target);
  current.edges.push({ id: 'edge', from: source.id, to: target.id, kind: 'image-variant' });
  const viewport = { ...current.viewport };
  await ui.execute({
    ...command,
    action: 'update-nodes',
    input: { nodes: [{ id: source.id, uiRecognition: { enabled: true, model: 'vision-b' } }] },
  });
  expect(source.uiRecognition).toEqual({ enabled: true, model: 'vision-b', results: [] });
  expect(target.templatePending).toBe(true);
  await ui.execute({
    ...command,
    revision: current.revision,
    action: 'update-nodes',
    input: { nodes: [{ id: source.id, uiRecognition: { enabled: false } }] },
  });
  expect(target.generation.prompt).toBe('baseline');
  expect(source.uiRecognition.model).toBe('vision-b');
  expect(current.viewport).toEqual(viewport);
  expect(options.save).toHaveBeenCalledTimes(2);
});

test('image-assets run returns review state without starting the interactive run or saving', async () => {
  const { current, options, ui, command } = fixture();
  current.nodes[0].type = 'image-assets';
  const previewImageAssets = jest.fn(async () => ({
    status: 'waiting_for_confirmation',
    reviewId: 'review',
  }));
  const confirmImageAssets = jest.fn(async () => ({ status: 'completed' }));
  const run = jest.fn();
  Object.assign(options, { previewImageAssets, confirmImageAssets, run });
  expect(await ui.execute({ ...command, action: 'run', input: { id: 'image' } })).toMatchObject({
    status: 'waiting_for_confirmation',
  });
  expect(run).not.toHaveBeenCalled();
  expect(options.save).not.toHaveBeenCalled();
  await expect(
    ui.execute({ ...command, action: 'confirm-image-assets', input: { id: 'image' } })
  ).rejects.toThrow('reviewId');
  await expect(
    ui.execute({
      ...command,
      revision: 1,
      action: 'confirm-image-assets',
      input: { id: 'image', reviewId: 'review' },
    })
  ).rejects.toThrow('revision');
  expect(confirmImageAssets).not.toHaveBeenCalled();
  await ui.execute({
    ...command,
    action: 'confirm-image-assets',
    input: { id: 'image', reviewId: 'review' },
  });
  expect(confirmImageAssets).toHaveBeenCalledWith('image', 'review');
  options.blocked.mockReturnValue('manual draft');
  await expect(
    ui.execute({ ...command, action: 'preview-image-assets', input: { id: 'image' } })
  ).rejects.toThrow('manual draft');
  expect(previewImageAssets).toHaveBeenCalledTimes(1);
});

test('CLI group run includes resource cards and delegates saved-grid processing to the queue', async () => {
  const { current, options, ui, command } = fixture();
  current.nodes[0].type = 'image-assets';
  current.nodes[0].sectionId = 'group';
  current.nodes.push({
    id: 'group',
    type: 'section',
    title: 'group',
    x: 0,
    y: 0,
    width: 600,
    height: 400,
  });
  const start = jest.fn();
  Object.assign(options.queue, { start, view: () => ({ phase: 'complete' }) });
  await expect(ui.execute({ ...command, action: 'run', input: { id: 'group' } })).rejects.toThrow(
    '--allow-paid'
  );
  expect(start).not.toHaveBeenCalled();
  await ui.execute({ ...command, action: 'run', allowPaid: true, input: { id: 'group' } });
  expect(start).toHaveBeenCalledWith('group', true);
  expect(options.save).toHaveBeenCalledTimes(1);
});

function recognitionRunFixture() {
  const state = fixture();
  const source = state.current.nodes[0];
  source.sectionId = 'group';
  source.uiRecognition = { enabled: false, results: [] };
  const group = { ...source, id: 'group', type: 'section' as const, uiRecognition: undefined };
  state.current.nodes.push(group);
  const run = jest.fn(async () => true);
  const start = jest.fn();
  Object.assign(state.options, { run });
  Object.assign(state.options.queue, { start, view: () => ({ phase: 'complete' }) });
  const command = { ...state.command, action: 'run', allowPaid: true, input: { id: 'group' } };
  return { ...state, source, run, start, command };
}

test('CLI enables recognition and asks the calling AI for a list without invoking a provider', async () => {
  const { ui, command, source, run, start, options } = recognitionRunFixture();
  await expect(ui.execute(command)).rejects.toThrow('当前 AI 看图');
  expect(source.uiRecognition?.enabled).toBe(true);
  expect(options.save).toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});

test('CLI continues with an existing selected list without invoking recognition', async () => {
  const { ui, command, source, run, start } = recognitionRunFixture();
  source.uiRecognition!.selectedId = 'record';
  source.uiRecognition!.results = [
    { id: 'record', sourcePath: source.assetPath, elements: [], model: 'fixture', durationMs: 0 },
  ] as any;
  await ui.execute(command);
  expect(run).not.toHaveBeenCalled();
  expect(start).toHaveBeenCalledWith('group', true);
});

test('explicit CLI no-recognition comparison skips vision and persists the disabled switch', async () => {
  const { ui, command, source, run, start } = recognitionRunFixture();
  source.uiRecognition!.enabled = true;
  await ui.execute({ ...command, input: { id: 'group', recognition: false } });
  expect(source.uiRecognition!.enabled).toBe(false);
  expect(run).not.toHaveBeenCalled();
  expect(start).toHaveBeenCalled();
});

test.each(['recognition error', 'save error', 'missing authorization', 'invalid switch'])(
  'CLI blocks downstream work on %s without silently disabling recognition',
  async (failure) => {
    const { ui, command, source, options, run, start } = recognitionRunFixture();
    if (failure === 'recognition error') run.mockRejectedValue(new Error('识图模型未配置'));
    if (failure === 'save error') options.save.mockResolvedValue(false);
    if (failure === 'missing authorization') command.allowPaid = false;
    const input =
      failure === 'invalid switch' ? { id: 'group', recognition: 'false' } : command.input;
    await expect(ui.execute({ ...command, input })).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
    expect(source.uiRecognition!.enabled).toBe(
      failure !== 'missing authorization' && failure !== 'invalid switch'
    );
  }
);

test('unsaved human edits reject changes before touching history or saving', async () => {
  const { ui, options, command } = fixture();
  options.blocked.mockReturnValue('unsaved human input');
  await expect(
    ui.execute({ ...command, action: 'rename', input: { title: 'new title' } })
  ).rejects.toThrow('unsaved human');
  expect(options.remember).not.toHaveBeenCalled();
  expect(options.save).not.toHaveBeenCalled();
});

test('save failure reports an unsaved result and releases the UI without rolling back edits', async () => {
  const { ui, options, current, command } = fixture();
  options.save.mockResolvedValue(false);
  await expect(
    ui.execute({ ...command, action: 'rename', input: { title: 'unsaved title' } })
  ).rejects.toThrow('保存失败');
  expect(current.title).toBe('unsaved title');
  expect(globals.document.body.inert).toBe(false);
  expect(ui.isEditing).toBe(false);
});

test('an asynchronous template insertion serializes mutations but permits inspection', async () => {
  const { ui, options, command } = fixture();
  let finish!: () => void;
  options.addTemplate.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const pending = ui.execute({ ...command, action: 'add-template', input: { id: 'template' } });
  expect(ui.isEditing).toBe(true);
  expect(globals.document.body.inert).toBe(true);
  await expect(
    ui.execute({ ...command, action: 'rename', input: { title: 'racing' } })
  ).rejects.toThrow('执行中');
  await expect(ui.execute(command)).resolves.toMatchObject({ source: 'live' });
  finish();
  await pending;
  expect(globals.document.body.inert).toBe(false);
});

test('CLI completes text removal before asking AI to recognize its output', async () => {
  const { ui, command, source, run, start } = recognitionRunFixture();
  source.templatePending = true;
  source.assetPath = 'old-example.png';
  run.mockImplementation(async () => {
    source.assetPath = 'text-free.png';
    delete source.templatePending;
    return true;
  });
  await expect(ui.execute(command)).rejects.toThrow('text-free.png');
  expect(run).toHaveBeenCalledWith(source.id);
  expect(start).not.toHaveBeenCalled();
});

test('CLI can run text removal alone without requiring recognition of the original', async () => {
  const { ui, command, source, run } = recognitionRunFixture();
  source.templatePending = true;
  await ui.execute({ ...command, input: { id: source.id } });
  expect(run).toHaveBeenCalledWith(source.id);
  expect(source.uiRecognition!.enabled).toBe(true);
});

test('failed text removal does not request recognition or start downstream queue', async () => {
  const { ui, command, source, run, start } = recognitionRunFixture();
  source.templatePending = true;
  run.mockResolvedValue(false);
  await expect(ui.execute(command)).rejects.toThrow('去文字尚未完成');
  expect(start).not.toHaveBeenCalled();
});
