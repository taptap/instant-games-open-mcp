import { createCanvasAutomationUiWithHost as createCanvasAutomationUi } from '../../../../packages/maker-canvas/src/browser/automationUi.js';
import { prepareCanvasNodeUpdates } from '../automation.js';
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
    prepareNodeUpdates: prepareCanvasNodeUpdates,
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

test('CLI enables recognition and lets the group queue time the complete workflow', async () => {
  const { ui, command, source, run, start, options } = recognitionRunFixture();
  await ui.execute(command);
  expect(source.uiRecognition?.enabled).toBe(true);
  expect(options.save).toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
  expect(start).toHaveBeenCalledWith('group', true);
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

test.each(['save error', 'missing authorization', 'invalid switch'])(
  'CLI blocks downstream work on %s without silently disabling recognition',
  async (failure) => {
    const { ui, command, source, options, start } = recognitionRunFixture();
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

test('CLI undo stays reachable when the pending edit cannot be saved', async () => {
  const { ui, options, command } = fixture();
  let saveable = false;
  options.blocked.mockImplementation((allowUnsaved?: boolean) =>
    allowUnsaved || saveable ? undefined : '画布有未保存修改，请等待保存完成后重试。'
  );
  options.save.mockImplementation(async () => saveable);
  const undo = jest.fn(() => {
    saveable = true;
    return true;
  });
  Object.assign(options, { undo, redo: jest.fn(() => false) });
  // Ordinary edits are still refused before any change while saving fails.
  await expect(
    ui.execute({ ...command, action: 'rename', input: { title: 'blocked title' } })
  ).rejects.toMatchObject({ code: 'INVALID_ARGS', message: expect.stringContaining('保存失败') });
  expect(options.remember).not.toHaveBeenCalled();
  await expect(ui.execute({ ...command, action: 'undo', input: {} })).resolves.toBeTruthy();
  expect(undo).toHaveBeenCalledTimes(1);
});

test('CLI undo after a failed save still honours other blocks', async () => {
  const { ui, options, command } = fixture();
  options.blocked.mockImplementation((allowUnsaved?: boolean) =>
    allowUnsaved ? undefined : '画布有未保存修改，请等待保存完成后重试。'
  );
  options.save.mockResolvedValue(false);
  const undo = jest.fn(() => true);
  Object.assign(options, { undo, redo: jest.fn(() => true) });
  let calls = 0;
  options.blocked.mockImplementation((allowUnsaved?: boolean) => {
    // A dialog opens while the failed save is reported: undo must not run through it.
    if (allowUnsaved) return calls++ > 1 ? '请先完成或关闭正在编辑的面板。' : undefined;
    return '画布有未保存修改，请等待保存完成后重试。';
  });
  await expect(ui.execute({ ...command, action: 'undo', input: {} })).rejects.toMatchObject({
    code: 'INVALID_ARGS',
  });
  expect(undo).not.toHaveBeenCalled();
});

test('CLI disconnect uses the host unwiring and reports its refusal as not executed', async () => {
  const { ui, options, current, command } = fixture();
  current.nodes.push({ ...current.nodes[0], id: 'target', assetPath: 'target.png' });
  current.edges.push({ id: 'edge', from: 'image', to: 'target', kind: 'image-variant' });
  const disconnect = jest.fn((edge: { id: string }) => {
    current.edges = current.edges.filter((item) => item.id !== edge.id);
    return undefined;
  });
  Object.assign(options, { disconnect });
  await ui.execute({ ...command, action: 'disconnect', input: { edgeId: 'edge' } });
  expect(disconnect).toHaveBeenCalledWith(expect.objectContaining({ id: 'edge' }));
  expect(current.edges).toHaveLength(0);
  expect(options.remember).not.toHaveBeenCalled();
  current.edges.push({ id: 'edge2', from: 'image', to: 'target', kind: 'image-variant' });
  disconnect.mockImplementation(() => '引用卡片尚未就绪，请稍后再删除连线。' as any);
  await expect(
    ui.execute({
      ...command,
      revision: current.revision,
      action: 'disconnect',
      input: { edgeId: 'edge2' },
    })
  ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
  expect(current.edges).toHaveLength(1);
});

test('015 run argument errors are rejections, coordinator failures stay uncoded', async () => {
  const { ui, options, current, command } = fixture();
  current.nodes.push({
    id: 'group',
    type: 'section',
    title: '015',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    templateId: '7e1cb6ad-732f-4dc3-a951-000000000015',
  });
  const advance = jest.fn(async () => ({
    status: 'failed',
    stage: 'prepare',
    message: '准备失败',
  }));
  Object.assign(options, {
    ui015: { isWorkflowGroup: () => true, advance, inspect: () => undefined },
  });
  const run = { ...command, action: 'run', allowPaid: true };
  await expect(
    ui.execute({ ...run, input: { id: 'group', artText: 'all' } })
  ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
  expect(advance).not.toHaveBeenCalled();
  const failure = await ui.execute({ ...run, input: { id: 'group' } }).catch((error) => error);
  expect(failure.message).toBe('准备失败');
  expect(failure.code).toBeUndefined();
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

test('CLI includes pending text removal in the group queue instead of running it before timing', async () => {
  const { ui, command, source, run, start } = recognitionRunFixture();
  source.templatePending = true;
  source.assetPath = 'old-example.png';
  run.mockImplementation(async () => {
    source.assetPath = 'text-free.png';
    delete source.templatePending;
    return true;
  });
  await ui.execute(command);
  expect(run).not.toHaveBeenCalled();
  expect(source.templatePending).toBe(true);
  expect(start).toHaveBeenCalledWith('group', true);
});

test('CLI can run text removal alone without requiring recognition of the original', async () => {
  const { ui, command, source, run } = recognitionRunFixture();
  source.templatePending = true;
  await ui.execute({ ...command, input: { id: source.id } });
  expect(run).toHaveBeenCalledWith(source.id);
  expect(source.uiRecognition!.enabled).toBe(true);
});

test('CLI propagates a group recognition failure without starting a second workflow', async () => {
  const { ui, command, source, run, start, options } = recognitionRunFixture();
  source.templatePending = true;
  Object.assign(options.queue, { view: () => ({ phase: 'paused', message: '识图模型未配置' }) });
  await expect(ui.execute(command)).rejects.toThrow('识图模型未配置');
  expect(start).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
});

test('external recognition adds to image work once and preserves the paused flow total', async () => {
  const { current, options, ui, command } = fixture();
  Object.assign(options, { checkRecognition: async () => {}, ensureRecognitionNote: () => {} });
  const source = current.nodes[0];
  source.assetPath = 'assets/image/canvas-00000000-0000-4000-8000-000000000001.png';
  source.sectionId = 'group';
  source.workDurationMs = 30000;
  source.uiRecognition = { enabled: true, results: [] };
  current.nodes.push({
    id: 'group',
    type: 'section',
    title: 'UI',
    x: 0,
    y: 0,
    width: 500,
    height: 500,
    workStartedAt: 1000,
    workDurationMs: 30000,
    workTimingOpen: true,
  });
  const result = {
    id: '00000000-0000-4000-8000-000000000002',
    sourcePath: source.assetPath,
    sourceSha256: 'a'.repeat(64),
    width: 100,
    height: 100,
    model: 'ChatGPT web',
    prompt: 'recognize',
    createdAt: new Date().toISOString(),
    durationMs: 90000,
    elements: [
      {
        id: 'E001',
        name: '按钮',
        category: 'action',
        rect: [1, 1, 10, 10],
        parentId: null,
        zIndex: 0,
        cutout: true,
        states: ['normal'],
      },
    ],
  };
  const input = { nodes: [{ id: source.id, uiRecognition: { result } }] };
  await ui.execute({ ...command, action: 'update-nodes', input });
  expect(source.workDurationMs).toBe(120000);
  expect(current.nodes[1].workDurationMs).toBe(120000);
  await expect(
    ui.execute({ ...command, revision: current.revision, action: 'update-nodes', input })
  ).rejects.toThrow('识图记录');
  expect(source.workDurationMs).toBe(120000);
  expect(current.nodes[1].workDurationMs).toBe(120000);
});
