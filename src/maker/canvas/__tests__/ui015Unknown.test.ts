import { createUi015Workflow } from '../../../../packages/maker-canvas/src/browser/ui015Workflow.js';
import { emptyDocument } from '../model.js';

function fixture() {
  const document = emptyDocument();
  const node = (id: string, type: string, extra = {}) => ({
    id,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    title: id,
    ...extra,
  });
  document.nodes = [
    node('group', 'section', { templateId: '7e1cb6ad-732f-4dc3-a951-000000000015' }),
    node('design', 'image', { assetPath: 'design.png' }),
    node('input', 'image', {
      sectionId: 'group',
      assetPath: 'design.png',
      uiRecognition: { enabled: true, inputRole: 'design', results: [] },
    }),
    node('cut', 'image', {
      sectionId: 'group',
      templatePending: true,
      uiRecognition: { enabled: true, inputRole: 'text-free', results: [] },
    }),
  ] as any;
  document.edges = [
    { id: 'source', from: 'design', to: 'input', kind: 'image-variant' },
    { id: 'cut-edge', from: 'input', to: 'cut', kind: 'image-variant' },
  ];
  const options = {
    current: () => document,
    needs: (id: string) => id === 'cut',
    problem: (id: string) => (id === 'cut' ? 'unknown' : undefined),
    runImage: jest.fn(async () => false),
    recognize: jest.fn(),
    recoverImage: jest.fn(async () => 'unknown'),
    recoverRecognition: jest.fn(),
    chooseDesign: jest.fn(),
    sync: jest.fn(),
    queue: { start: jest.fn(), spendRetry: jest.fn(), view: () => undefined, remaining: () => 0 },
    focus: jest.fn(),
    remember: jest.fn(),
    save: jest.fn(),
    changed: jest.fn(),
    render: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    store: { assembleUi: jest.fn() },
  };
  return { document, options };
}

test('015 stops preparation on an unknown paid image and never restarts or assembles the group', async () => {
  const { options } = fixture();
  const ui = createUi015Workflow(options as any);
  const result = await ui.advance('group', { cli: true });
  expect(result).toMatchObject({ status: 'failed', stage: 'prepare' });
  expect(result.message).toContain('不会自动重试');
  expect(options.runImage).toHaveBeenCalledTimes(1);
  expect(options.recoverImage).toHaveBeenCalledWith('cut', false);
  expect(options.queue.start).not.toHaveBeenCalled();
  expect(options.store.assembleUi).not.toHaveBeenCalled();
});

test.each([0, 2])(
  '015 stops on an unknown queued image even after %s retries were spent',
  async (spent) => {
    jest.useFakeTimers();
    try {
      const { document, options } = fixture();
      const cut = document.nodes.find((node) => node.id === 'cut')!;
      Object.assign(cut, {
        templatePending: undefined,
        assetPath: 'cut.png',
        uiRecognition: {
          enabled: true,
          inputRole: 'text-free',
          selectedId: 'bbox',
          results: [{ id: 'bbox', sourcePath: 'cut.png', bbox: { texts: [], elements: [] } }],
        },
      });
      document.nodes.push({ id: 'bundle', type: 'resource-bundle', sectionId: 'group' } as any);
      options.needs = (_id: string): _id is 'cut' => false;
      options.sync.mockReturnValue([]);
      options.queue.start.mockReturnValue(true);
      options.queue.remaining = () => 1;
      options.queue.view = () =>
        ({ phase: 'paused', failures: { cut: 'unknown' }, retries: { cut: spent } }) as any;
      const ui = createUi015Workflow(options as any);
      expect(await ui.advance('group', { cli: true })).toMatchObject({ status: 'started' });
      ui.settled('group', 'paused');
      await jest.advanceTimersByTimeAsync(0);
      expect(ui.outcome('group')).toMatchObject({ status: 'failed', stage: 'generation' });
      expect(options.recoverImage).toHaveBeenCalledWith('cut', false);
      expect(options.queue.start).toHaveBeenCalledTimes(1);
      expect(options.queue.spendRetry).not.toHaveBeenCalled();
      expect(options.store.assembleUi).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  }
);
