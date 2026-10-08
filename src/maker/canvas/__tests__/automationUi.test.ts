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

test('CLI group run cannot open a hidden image-assets confirmation or bypass review', async () => {
  const { current, ui, command } = fixture();
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
  await expect(
    ui.execute({ ...command, action: 'run', allowPaid: true, input: { id: 'group' } })
  ).rejects.toThrow('preview-image-assets');
});

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
