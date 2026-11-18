import { createCanvasUiSplitController } from '../../../../packages/maker-canvas/src/browser/uiSplit.js';

function fixture(
  prepareMedia: (path: string) => Promise<unknown> = async () => undefined,
  blocked: () => boolean = () => false
) {
  const group = {
    id: 'group',
    type: 'section',
    x: 0,
    y: 0,
    width: 360,
    height: 420,
    uiSplit: {
      name: 'inventory',
      sourcePath: 'assets/image/design.png',
      dismissed: [] as string[],
    },
  };
  const doc: any = { id: 'canvas', nodes: [group], edges: [] };
  const progress = {
    version: 1,
    name: 'inventory',
    phase: 'review',
    design: { path: group.uiSplit.sourcePath },
    artifacts: [
      { key: 'original', title: '原稿', path: group.uiSplit.sourcePath },
      { key: 'cut', title: '去文字', path: 'assets/image/ui-split/inventory/cut.png' },
    ],
  };
  const save = jest.fn(async () => true);
  let id = 0;
  const controller = createCanvasUiSplitController({
    current: () => doc,
    blocked,
    store: { readUiSplitProgress: async () => progress, prepareMedia },
    host: {},
    save,
    changed: jest.fn(),
    render: jest.fn(),
    remember: jest.fn(),
    createId: () => 'node-' + ++id,
    error: jest.fn(),
  });
  return { doc, group, progress, controller, save };
}

test('UI slicing sync keeps moved and dismissed results and does not write unchanged progress', async () => {
  const { doc, controller, save } = fixture();
  await controller.sync();
  expect(doc.nodes).toHaveLength(3);
  doc.nodes[1].x = 900;
  await controller.sync();
  expect(doc.nodes[1].x).toBe(900);
  const writes = save.mock.calls.length;
  await controller.sync();
  expect(save).toHaveBeenCalledTimes(writes);
  controller.dismiss([doc.nodes[1].id]);
  doc.nodes.splice(1, 1);
  await controller.sync();
  expect(doc.nodes).toHaveLength(2);
});

test('UI slicing rejects cross-run paths and mismatched original designs', async () => {
  const { controller, progress, doc } = fixture();
  progress.artifacts[0].path = 'assets/image/ui-split/other/cut.png';
  await expect(controller.sync()).rejects.toThrow('路径无效');
  expect(doc.nodes).toHaveLength(1);
  progress.design.path = 'assets/image/other.png';
  await expect(controller.sync()).rejects.toThrow('原稿不匹配');
});

test('UI slicing adopts the source once and centers it with the text-free card across batches', async () => {
  const { doc, group, progress, controller, save } = fixture();
  const source = {
    id: 'design',
    type: 'image',
    assetPath: group.uiSplit.sourcePath,
    x: -400,
    y: -100,
    width: 320,
    height: 320,
  };
  doc.nodes.push(source);
  for (let index = 0; index < 4; index++) {
    progress.artifacts.push({
      key: 'prelayout-' + index,
      title: 'reference',
      path: 'assets/image/ui-split/inventory/prelayout-' + index + '.png',
    });
  }

  await controller.sync();
  const cut = doc.nodes.find((node: any) => node.mirror?.key === 'cut');
  const refs = doc.nodes.filter((node: any) => node.mirror?.key.startsWith('prelayout-'));
  const center = (card: { y: number; height: number }) => card.y + card.height / 2;
  expect(doc.nodes.filter((node: any) => node.assetPath === source.assetPath)).toEqual([source]);
  expect(source).toMatchObject({ sectionId: group.id });
  expect(center(source)).toBe(center(cut));
  expect(center(cut)).toBe((center(refs[0]) + center(refs[3])) / 2);
  expect(doc.edges).toContainEqual(expect.objectContaining({ from: source.id, to: cut.id }));
  await controller.sync();
  expect(save).toHaveBeenCalledTimes(1);
});

test('a stalled file cannot hold other results or a queued tidy; late completion cannot add a card', async () => {
  jest.useFakeTimers();
  try {
    let late!: () => void;
    const stall = new Promise<void>((resolve) => {
      late = resolve;
    });
    const { controller, doc } = fixture((path) =>
      path.endsWith('/cut.png') ? stall : Promise.resolve()
    );
    const sync = controller.sync();
    const tidy = controller.sync('group');
    await jest.advanceTimersByTimeAsync(24001);
    await Promise.all([sync, tidy]);
    expect(doc.nodes.map((node: any) => node.mirror?.key)).toEqual([undefined, 'original']);
    expect(controller.needsSync()).toBe(true);
    late();
    await Promise.resolve();
    expect(doc.nodes).toHaveLength(2);
    await controller.sync();
    expect(doc.nodes).toHaveLength(3);
  } finally {
    jest.useRealTimers();
  }
});

test('a missing replacement keeps the existing card and retries without moving it', async () => {
  let available = false;
  const { controller, doc, progress } = fixture(async (path) => {
    if (path.endsWith('replacement.png') && !available)
      throw Object.assign(new Error('not found'), { status: 404 });
  });
  await controller.sync();
  const card = doc.nodes.find((node: any) => node.mirror?.key === 'cut');
  const oldPath = card.assetPath;
  card.x = 900;
  progress.artifacts[1].path = 'assets/image/ui-split/inventory/replacement.png';
  await controller.sync();
  expect(card.assetPath).toBe(oldPath);
  expect(controller.needsSync()).toBe(true);
  available = true;
  await controller.sync();
  expect(card).toMatchObject({ x: 900, assetPath: progress.artifacts[1].path });
  expect(controller.needsSync()).toBe(false);
});

test.each(['delete', 'drag'])(
  'a late sync cannot apply while the user performs %s',
  async (action) => {
    let dragging = false;
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const { controller, doc } = fixture(
      () => pending,
      () => dragging
    );
    const sync = controller.sync();
    await Promise.resolve();
    if (action === 'delete') doc.nodes.splice(0, 1);
    else dragging = true;
    resolve();
    await sync;
    expect(doc.nodes).toHaveLength(action === 'delete' ? 0 : 1);
    if (action === 'drag') {
      expect(controller.needsSync()).toBe(true);
      dragging = false;
      await controller.sync();
      expect(doc.nodes).toHaveLength(3);
    }
  }
);

test('UI slicing still mirrors results when the host has no prepareMedia', async () => {
  const group = {
    id: 'group',
    type: 'section',
    x: 0,
    y: 0,
    width: 360,
    height: 420,
    uiSplit: {
      name: 'inventory',
      sourcePath: 'assets/image/design.png',
      dismissed: [] as string[],
    },
  };
  const doc: any = { id: 'canvas', nodes: [group], edges: [] };
  const controller = createCanvasUiSplitController({
    current: () => doc,
    store: {
      readUiSplitProgress: async () => ({
        version: 1,
        name: 'inventory',
        phase: 'review',
        design: { path: group.uiSplit.sourcePath },
        artifacts: [
          { key: 'original', title: '原稿', path: group.uiSplit.sourcePath },
          { key: 'cut', title: '去文字', path: 'assets/image/ui-split/inventory/cut.png' },
        ],
      }),
    },
    host: {},
    save: jest.fn(async () => true),
    changed: jest.fn(),
    render: jest.fn(),
    remember: jest.fn(),
    createId: () => 'node-cut',
    error: jest.fn(),
  });
  await controller.sync();
  expect(doc.nodes.map((node: any) => node.mirror?.key)).toEqual([undefined, 'original', 'cut']);
});
