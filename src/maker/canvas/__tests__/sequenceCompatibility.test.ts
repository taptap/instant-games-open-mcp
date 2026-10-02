import { createSequenceProcessor, type SequenceProcessorOptions } from '../sequence.js';

type Sample = { color: [number, number, number]; coverage: number } | undefined;
const pink: Sample = { color: [153, 3, 84], coverage: 0.8 };
const white: Sample = { color: [253, 251, 252], coverage: 1 };

function fixture(samples: Sample[]) {
  const frames = samples.map((_sample, index) => ({
    time: index / 4,
    blob: new Blob([String(index)]),
  }));
  const identify = jest.fn(
    async (blob: Blob) => samples[frames.findIndex((frame) => frame.blob === blob)]
  );
  const apply = jest.fn(async (blob: Blob, settings: { color: [number, number, number] }) => ({
    blob,
    color: settings.color,
  }));
  const options = {
    backgroundRemoval: { identify, apply },
    maxSourceSide: 2048,
    estimateFrameCount: () => 1,
  } as unknown as SequenceProcessorOptions;
  return { frames, identify, apply, processor: createSequenceProcessor(options) };
}

describe('sequence video compatibility', () => {
  const previousWindow = globalThis.window;
  beforeAll(() => {
    Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  });
  afterAll(() => {
    Object.assign(globalThis, { window: previousWindow });
  });

  test.each([white, { color: [3, 2, 3], coverage: 1 } as Sample])(
    'skips only a brief uniform leading flash: %s',
    async (sample) => {
      const { frames, processor, apply } = fixture([sample, pink, pink]);
      const output = await processor.cutout(
        frames,
        '#ff00ff',
        32,
        new AbortController().signal,
        jest.fn()
      );
      expect(output.map((frame) => frame.time)).toEqual([0.25, 0.5]);
      expect(frames).toHaveLength(3);
      expect(apply).toHaveBeenCalledTimes(2);
      expect(apply.mock.calls[0][1]).toMatchObject({ automatic: false, color: pink!.color });
    }
  );

  test('uses each detected background for small exposure changes', async () => {
    const { frames, processor, apply } = fixture([
      pink,
      { color: [180, 15, 90], coverage: 0.7 },
      pink,
    ]);
    expect(
      await processor.cutout(frames, '#00ff00', 32, new AbortController().signal, jest.fn())
    ).toHaveLength(3);
    expect(apply.mock.calls[1][1].color).toEqual([180, 15, 90]);
  });

  test.each([
    [{ color: [250, 250, 250], coverage: 0.85 }, pink, pink],
    [{ color: [0, 240, 0], coverage: 1 }, pink, pink],
    [pink, white, pink],
    [pink, white, white, pink],
  ] as Sample[][])(
    'keeps subject frames when reliable backgrounds change %#',
    async (...samples) => {
      const { frames, processor, apply } = fixture(samples);
      const output = await processor.cutout(
        frames,
        '#ff00ff',
        32,
        new AbortController().signal,
        jest.fn()
      );
      expect(output).toHaveLength(samples.length);
      expect(apply.mock.calls.map((call) => call[1].color)).toEqual(
        samples.map((sample) => sample!.color)
      );
    }
  );

  test.each([
    [pink, undefined, pink],
    [undefined, undefined],
  ] as Sample[][])(
    'does not silently drop subjects or publish an unreliable batch %#',
    async (...samples) => {
      const { frames, processor, apply } = fixture(samples);
      const original = frames.slice();
      await expect(
        processor.cutout(frames, '#ff00ff', 32, new AbortController().signal, jest.fn())
      ).rejects.toThrow(/原帧集未改变/);
      expect(apply).not.toHaveBeenCalled();
      expect(frames).toEqual(original);
    }
  );

  test('cancellation during background sampling never applies partial output', async () => {
    const { frames, processor, identify, apply } = fixture([pink, pink]);
    const abort = new AbortController();
    identify.mockImplementationOnce(async () => {
      abort.abort();
      return pink;
    });
    await expect(
      processor.cutout(frames, '#ff00ff', 32, abort.signal, jest.fn())
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(apply).not.toHaveBeenCalled();
  });

  test.each([
    { duration: 1, videoWidth: 0, videoHeight: 0 },
    { duration: Infinity, videoWidth: 640, videoHeight: 480 },
    { duration: 1, videoWidth: NaN, videoHeight: 480 },
  ])('rejects invalid video metadata before creating a blank frame: %s', async (metadata) => {
    const { processor } = fixture([]);
    await expect(
      processor.extract(
        metadata as HTMLVideoElement,
        0,
        1,
        4,
        new AbortController().signal,
        jest.fn()
      )
    ).rejects.toThrow('视频没有有效画面');
  });

  test.each(['delayed-data', 'decode-error', 'abort', 'invalid-seek'])(
    'handles video seek lifecycle: %s',
    async (scenario) => {
      const originalDocument = globalThis.document;
      const context = { clearRect: jest.fn(), drawImage: jest.fn() };
      Object.assign(globalThis, {
        document: {
          createElement: () => ({
            width: 0,
            height: 0,
            getContext: () => context,
            toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['frame'])),
          }),
        },
      });
      const abort = new AbortController();
      class Video extends EventTarget {
        duration = 1;
        videoWidth = 16;
        videoHeight = 16;
        readyState = 1;
        seeking = false;
        pause = jest.fn();
        get currentTime() {
          return 0;
        }
        set currentTime(_value: number) {
          if (scenario === 'invalid-seek') throw new Error('seek rejected');
          queueMicrotask(() => {
            if (scenario === 'abort') {
              abort.abort();
              return;
            }
            if (scenario === 'decode-error') {
              this.dispatchEvent(new Event('error'));
              return;
            }
            this.dispatchEvent(new Event('seeked'));
            expect(context.drawImage).not.toHaveBeenCalled();
            this.readyState = 2;
            this.dispatchEvent(new Event('loadeddata'));
          });
        }
      }
      try {
        const { processor } = fixture([]);
        const extraction = processor.extract(
          new Video() as unknown as HTMLVideoElement,
          0,
          1,
          1,
          abort.signal,
          jest.fn()
        );
        if (scenario === 'delayed-data') {
          expect(await extraction).toHaveLength(1);
          expect(context.drawImage).toHaveBeenCalledTimes(1);
        } else {
          await expect(extraction).rejects.toThrow();
          expect(context.drawImage).not.toHaveBeenCalled();
        }
      } finally {
        Object.assign(globalThis, { document: originalDocument });
      }
    }
  );
});
