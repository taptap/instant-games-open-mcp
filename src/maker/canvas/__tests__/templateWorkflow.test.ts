import { createTemplateWorkflow, parseTemplateFlow } from '../templateWorkflow.js';
import { emptyDocument } from '../model.js';

function fixture() {
  const document = emptyDocument();
  document.templateFlow = {
    imageId: 'image',
    videoId: 'video',
    sequenceId: 'sequence',
    animationId: 'animation',
    duration: 4,
    stage: 'image',
  };
  document.nodes = ['image', 'video-source', 'sequence', 'animation'].map((type, index) => ({
    id: ['image', 'video', 'sequence', 'animation'][index],
    type: type as 'image',
    title: type,
    x: 0,
    y: 0,
    width: 300,
    height: 200,
  }));
  document.edges = [
    { id: 'iv', from: 'image', to: 'video', kind: 'image-to-video' },
    { id: 'vs', from: 'video', to: 'sequence', kind: 'sequence-source' },
    { id: 'sa', from: 'sequence', to: 'animation', kind: 'sequence-animation' },
  ];
  const stages: string[] = [];
  const options = {
    getDocument: () => document,
    save: jest.fn(async () => {
      stages.push(document.templateFlow!.stage);
      return true;
    }),
    changed: jest.fn(),
    render: jest.fn(),
    error: jest.fn(),
    confirm: jest.fn(() => true),
    video: jest.fn(async () => true),
    sequence: jest.fn(async () => {}),
    animation: jest.fn(),
    select: jest.fn(),
    importImage: jest.fn(),
  };
  return { document, options, stages, flow: createTemplateWorkflow(options) };
}

test('template state validates node relationships and duration', () => {
  const { document } = fixture();
  expect(parseTemplateFlow(document.templateFlow, document)).toEqual(document.templateFlow);
  for (const patch of [
    { videoId: 'missing' },
    { duration: 3 },
    { duration: 9 },
    { stage: 'invalid' },
  ]) {
    expect(() => parseTemplateFlow({ ...document.templateFlow, ...patch }, document)).toThrow();
  }
  expect(() => parseTemplateFlow(document.templateFlow, { ...document, edges: [] })).toThrow();
});

test('only head is editable; cancel keeps ready progress without running paid work', async () => {
  const { document, options, flow } = fixture();
  expect(flow.canEditImage('image')).toBe(true);
  expect(flow.locked('video')).toBe(true);
  options.confirm.mockReturnValue(false);
  await flow.headChanged('image');
  expect(document.templateFlow?.stage).toBe('ready');
  expect(options.video).not.toHaveBeenCalled();
  expect(options.save).toHaveBeenCalledTimes(1);
});

test('one confirmation executes and persists the complete workflow', async () => {
  const { document, options, stages, flow } = fixture();
  await flow.headChanged('image');
  expect(options.confirm).toHaveBeenCalledTimes(1);
  expect(stages).toEqual(['ready', 'video', 'sequence', 'animation', 'complete']);
  expect(options.video).toHaveBeenCalledWith('video', 4);
  expect(options.sequence).toHaveBeenCalledWith('sequence');
  expect(document.templateFlow?.stage).toBe('complete');
  expect(flow.locked('video')).toBe(false);
});

test('local processing failure resumes without submitting another video', async () => {
  const { document, options, flow } = fixture();
  options.sequence.mockRejectedValueOnce(new Error('抽帧失败'));
  await flow.headChanged('image');
  expect(document.templateFlow?.stage).toBe('sequence');
  expect(options.animation).not.toHaveBeenCalled();
  await flow.run();
  expect(options.video).toHaveBeenCalledTimes(1);
  expect(options.confirm).toHaveBeenCalledTimes(1);
  expect(document.templateFlow?.stage).toBe('complete');
});

test('unknown video result stops at video and prevents downstream changes', async () => {
  const { document, options, flow } = fixture();
  options.video.mockResolvedValue(false);
  await flow.headChanged('image');
  expect(document.templateFlow?.stage).toBe('video');
  expect(options.sequence).not.toHaveBeenCalled();
  expect(flow.isBusy).toBe(false);
});

test('save failure prevents remote generation and rolls stage back', async () => {
  const { document, options, flow } = fixture();
  document.templateFlow!.stage = 'ready';
  options.save.mockResolvedValue(false);
  await flow.run();
  expect(document.templateFlow?.stage).toBe('ready');
  expect(options.video).not.toHaveBeenCalled();
});

test('running flow ignores duplicate clicks and locks the head', async () => {
  const { document, options, flow } = fixture();
  document.templateFlow!.stage = 'ready';
  let finish!: (value: boolean) => void;
  options.video.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = flow.run();
  await Promise.resolve();
  expect(flow.locked('image')).toBe(true);
  await flow.run();
  finish(true);
  await pending;
  expect(options.video).toHaveBeenCalledTimes(1);
});
