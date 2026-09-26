import { createId, emptyDocument, type CanvasNode } from '../model.js';
import { createSequenceUiController, type SequenceUiOptions } from '../sequenceUi.js';
import {
  createSequenceProcessor,
  defaultSequenceSettings,
  renderSequenceCard,
  type SequenceFrame,
  type SequenceRunView,
} from '../sequence.js';

describe('sequence workflow recovery', () => {
  function editorFixture() {
    const document = emptyDocument();
    const source: CanvasNode = {
      id: 'video',
      type: 'video-source',
      title: 'video',
      x: 0,
      y: 0,
      width: 240,
      height: 210,
      assetPath: '.maker/video.mp4',
      videoInfo: { duration: 1, width: 320, height: 180 },
    };
    const originalInfo = {
      fps: 2,
      width: 256,
      height: 256,
      frameCount: 1,
      columns: 1,
      rows: 1,
      frames: [{ index: 0, x: 0, y: 0, width: 256, height: 256, time: 0 }],
    };
    const node: CanvasNode = {
      id: 'sequence',
      type: 'sequence',
      title: 'sequence',
      x: 0,
      y: 0,
      width: 480,
      height: 300,
      sourceVideoId: source.id,
      assetPath: 'assets/image/original.png',
      frameSetInfo: originalInfo,
      sequenceSettings: defaultSequenceSettings(1, 320, 180),
    };
    document.nodes = [source, node];
    const frame = { time: 0, blob: new Blob(['frame']) };
    const upload = jest.fn(async () => ({ relativePath: 'assets/image/new.png' }));
    const flush = jest.fn(async () => true);
    const snapshots: string[] = [];
    const options = {
      store: { mediaUrl: (value: string) => value, importImage: upload },
      processor: {
        extract: async () => [frame],
        findDuplicates: async () => [],
        resize: async () => [frame],
        packAtlas: async () => ({ blob: new Blob(['atlas']), info: originalInfo }),
        dispose: (frames: SequenceFrame[]) => {
          frames.length = 0;
        },
      },
      video: {
        dataset: { assetPath: source.assetPath },
        readyState: 1,
        duration: 1,
        videoWidth: 320,
        videoHeight: 180,
      },
      getDocument: () => document,
      createId,
      nextPlacement: () => ({ x: 0, y: 0 }),
      remember: () => snapshots.push(JSON.stringify(node)),
      markDirty: jest.fn(),
      flush,
      render: jest.fn(),
      renderCard: jest.fn(),
      refreshCard: jest.fn(),
      publishState: jest.fn(),
      setError: jest.fn(),
      defaultSettings: defaultSequenceSettings,
      estimateFrameCount: () => 1,
      maxFrameCount: () => 10,
      maxInputFrameCount: () => 10,
    } as unknown as SequenceUiOptions;
    return {
      controller: createSequenceUiController(options),
      document,
      node,
      upload,
      flush,
      snapshots,
    };
  }

  test('frame edit undo and redo remain isolated in the draft', async () => {
    const { controller, node } = editorFixture();
    const before = JSON.stringify(node);
    await controller.action(node.id, 'reset');
    await controller.action(node.id, 'extract');
    const original = controller.view(node.id).run!.frames[0].blob;
    const edited = new Blob(['edited']);
    controller.replaceFrames(node.id, [{ time: 0, blob: edited }]);
    expect(controller.view(node.id).run!.frames[0].blob).toBe(edited);
    controller.undoFrames(node.id);
    expect(controller.view(node.id).run!.frames[0].blob).toBe(original);
    controller.undoFrames(node.id, true);
    expect(controller.view(node.id).run!.frames[0].blob).toBe(edited);
    controller.replaceFrames(node.id, []);
    expect(controller.view(node.id).run!.frames).toHaveLength(1);
    expect(JSON.stringify(node)).toBe(before);
    controller.discardEdit(node.id);
    expect(JSON.stringify(node)).toBe(before);
  });

  test('re-edit settings and discarded frames never replace the saved result', async () => {
    const { controller, node, document } = editorFixture();
    const before = JSON.stringify(document);
    controller.beginEdit(node.id);
    await controller.action(node.id, 'reset');
    controller.updateSetting(node.id, 'fps', 3);
    await controller.action(node.id, 'extract');
    expect(controller.hasDraft(node.id)).toBe(true);
    expect(JSON.stringify(document)).toBe(before);
    expect(controller.discardEdit(node.id)).toBe(true);
    expect(controller.hasUnsavedFrames).toBe(false);
    expect(JSON.stringify(document)).toBe(before);
  });

  test('failed commit preserves original result and retries without reupload; success is one undo', async () => {
    const { controller, node, upload, flush, snapshots } = editorFixture();
    const before = JSON.stringify(node);
    await controller.action(node.id, 'reset');
    await controller.action(node.id, 'extract');
    await controller.action(node.id, 'dedupe');
    await controller.action(node.id, 'keep-all');
    await controller.action(node.id, 'resize');
    flush.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await controller.action(node.id, 'save');
    expect(JSON.stringify(node)).toBe(before);
    expect(controller.view(node.id).run).toMatchObject({ status: 'failed', stage: 'save' });
    expect(controller.view(node.id).run?.frames).toHaveLength(1);
    expect(snapshots).toHaveLength(0);
    await controller.action(node.id, 'save');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(node.assetPath).toBe('assets/image/new.png');
    expect(controller.view(node.id).run?.status).toBe('complete');
    expect(snapshots).toEqual([before]);
    controller.discardEdit(node.id);
    controller.beginEdit(node.id);
    expect(controller.view(node.id).node?.assetPath).toBe('assets/image/new.png');
    expect(controller.hasUnsavedFrames).toBe(false);
  });

  test('retries a failed cutout step with the extracted frames intact', async () => {
    const document = emptyDocument();
    const video: CanvasNode = {
      id: createId(),
      type: 'video-source',
      x: 0,
      y: 0,
      width: 240,
      height: 210,
      title: 'source',
      assetPath: '.maker/canvases/source.mp4',
      videoInfo: { duration: 1, width: 320, height: 180 },
    };
    const sequence: CanvasNode = {
      id: createId(),
      type: 'sequence',
      x: 300,
      y: 0,
      width: 480,
      height: 300,
      title: 'sequence',
      sourceVideoId: video.id,
      sequenceSettings: { ...defaultSequenceSettings(1, 320, 180), end: 1, fps: 2, cutout: true },
    };
    document.nodes = [video, sequence];
    document.edges = [{ id: createId(), from: video.id, to: sequence.id, kind: 'sequence-source' }];
    const extracted: SequenceFrame[] = [
      { time: 0, blob: new Blob(['frame-1']) },
      { time: 0.5, blob: new Blob(['frame-2']) },
    ];
    const cutout = jest
      .fn<
        Promise<SequenceFrame[]>,
        [SequenceFrame[], string, number, AbortSignal, (current: number, total: number) => void]
      >()
      .mockRejectedValueOnce(new Error('temporary cutout failure'))
      .mockResolvedValueOnce(extracted.map((frame) => ({ ...frame })));
    const processor = {
      extract: jest.fn(async () => extracted.map((frame) => ({ ...frame }))),
      cutout,
      findDuplicates: jest.fn(async () => []),
      resize: jest.fn(async (frames: SequenceFrame[]) => frames),
      packAtlas: jest.fn(),
      dispose: jest.fn(),
    } as unknown as ReturnType<typeof createSequenceProcessor>;
    const videoElement = {
      dataset: { assetPath: video.assetPath },
      readyState: 1,
      duration: 1,
      videoWidth: 320,
      videoHeight: 180,
      pause: jest.fn(),
    } as unknown as HTMLVideoElement;
    let lastRun: SequenceRunView | undefined;
    const controller = createSequenceUiController({
      store: {
        list: async () => [],
        load: async () => document,
        create: async () => document,
        save: async (value) => value,
        importImage: async () => ({ relativePath: 'assets/image/canvas-atlas.png' }),
        importVideo: async () => ({ relativePath: video.assetPath! }),
        mediaUrl: (value) => value,
        getActiveCanvasId: async () => document.id,
        setActiveCanvasId: async () => {},
      },
      processor,
      renderCard: ((_, __, ___, run) => {
        lastRun = run;
      }) as typeof renderSequenceCard,
      getDocument: () => document,
      createId,
      nextPlacement: () => ({ x: 600, y: 0 }),
      video: videoElement,
      remember: jest.fn(),
      markDirty: jest.fn(),
      flush: async () => true,
      render: jest.fn(),
      refreshCard: () => controller.renderCard({} as HTMLElement, sequence, video),
      publishState: jest.fn(),
      setError: jest.fn(),
      defaultSettings: defaultSequenceSettings,
      estimateFrameCount: () => 2,
      maxFrameCount: () => 2,
      maxInputFrameCount: () => 2,
    });

    await controller.action(sequence.id, 'extract');
    await controller.action(sequence.id, 'cutout');
    expect(lastRun).toMatchObject({ status: 'failed', stage: 'cutout' });
    expect(lastRun?.frames).toHaveLength(2);

    await controller.action(sequence.id, 'cutout');
    expect(cutout).toHaveBeenCalledTimes(2);
    expect(cutout.mock.calls[1][0]).toHaveLength(2);
    expect(lastRun).toMatchObject({ status: 'ready', stage: 'dedupe' });
    await controller.action(sequence.id, 'remove-frame', 0);
    expect(lastRun?.frames).toHaveLength(1);
    await controller.action(sequence.id, 'remove-frame', 0);
    expect(lastRun?.frames).toHaveLength(1);
  });
});
