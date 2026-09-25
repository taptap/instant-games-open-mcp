import {
  duplicateIndicesFromSignatures,
  estimateSequenceFrameCount,
  maxSequenceFrameCount,
  maxSequenceInputFrameCount,
  removeConnectedBackgroundPixels,
  sequenceActionsForCard,
  MAX_SEQUENCE_FRAMES,
} from '../sequence.js';

describe('sequence processing', () => {
  test('estimates sampled frames and rejects excessive work before decoding', () => {
    expect(estimateSequenceFrameCount(0, 1, 8)).toBe(8);
    expect(() => estimateSequenceFrameCount(0, 100, 30)).toThrow(String(MAX_SEQUENCE_FRAMES));
  });

  test('limits frame sets to the actual single-atlas capacity', () => {
    expect(maxSequenceFrameCount(512, 512)).toBe(64);
    expect(maxSequenceFrameCount(512, 288)).toBe(112);
  });

  test('limits decoded video work by scaled input pixels', () => {
    expect(maxSequenceInputFrameCount(512, 512)).toBe(MAX_SEQUENCE_FRAMES);
    expect(maxSequenceInputFrameCount(1920, 1080)).toBe(81);
  });

  test('marks only adjacent near-identical frames as duplicate candidates', () => {
    const frames = [
      Uint8Array.from([0, 0, 0, 255]),
      Uint8Array.from([0, 0, 0, 255]),
      Uint8Array.from([255, 255, 255, 255]),
      Uint8Array.from([0, 0, 0, 255]),
    ];
    expect(duplicateIndicesFromSignatures(frames, 0.99)).toEqual([{ index: 1, similarity: 1 }]);
  });

  test('does not chain-remove gradual changes against only the previous frame', () => {
    const frames = [
      Uint8Array.from([0, 0, 0, 255]),
      Uint8Array.from([20, 20, 20, 255]),
      Uint8Array.from([40, 40, 40, 255]),
    ];
    const candidates = duplicateIndicesFromSignatures(frames, 0.92);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].index).toBe(1);
  });

  test.each([
    ['extract', '重试抽帧', false],
    ['cutout', '重试统一抠图', true],
    ['dedupe', '重试分析重复帧', true],
    ['resize', '重试统一缩放', true],
    ['save', '重试保存帧集', true],
  ] as const)('preserves retry for failed %s stage', (stage, expectedLabel, hasFrames) => {
    const actions = sequenceActionsForCard(
      {
        status: 'failed',
        stage,
        progress: 0,
        total: 1,
        frames: hasFrames ? [{ time: 0, blob: new Blob(['frame']) }] : [],
        candidates: [],
        removed: [],
      },
      false,
      true
    );
    expect(actions[0]).toEqual({
      label: expectedLabel,
      action:
        stage === 'extract'
          ? 'extract'
          : stage === 'cutout'
            ? 'cutout'
            : stage === 'dedupe'
              ? 'dedupe'
              : stage === 'resize'
                ? 'resize'
                : 'save',
    });
    if (hasFrames) expect(actions.some((action) => action.action === 'discard')).toBe(true);
  });

  test('keeps a path to continue after a failed optional cutout', () => {
    expect(
      sequenceActionsForCard(
        {
          status: 'failed',
          stage: 'cutout',
          progress: 0,
          total: 1,
          frames: [{ time: 0, blob: new Blob(['frame']) }],
          candidates: [],
          removed: [],
        },
        false,
        true
      ).map((action) => action.action)
    ).toEqual(['cutout', 'skip-cutout', 'discard']);
  });

  test('removes border-connected sample color in bounded batches and keeps the subject', async () => {
    const width = 320;
    const height = 180;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const subject = x >= 80 && x < 240 && y >= 40 && y < 140;
        pixels[offset] = subject ? 255 : 1;
        pixels[offset + 1] = subject ? 0 : 160;
        pixels[offset + 2] = subject ? 0 : 65;
        pixels[offset + 3] = 255;
      }
    }
    let yields = 0;
    const visited = await removeConnectedBackgroundPixels(
      pixels,
      width,
      height,
      [1, 160, 65],
      48,
      new AbortController().signal,
      async () => {
        yields += 1;
      }
    );
    expect(visited).toBe(width * height - 160 * 100);
    expect(yields).toBe(1);
    expect(pixels[3]).toBe(0);
    expect(pixels[(90 * width + 160) * 4 + 3]).toBe(255);
  });

  test('cutout scan yields between batches so cancellation is observed', async () => {
    const width = 320;
    const height = 180;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 1;
      pixels[index + 1] = 160;
      pixels[index + 2] = 65;
      pixels[index + 3] = 255;
    }
    const controller = new AbortController();
    await expect(
      removeConnectedBackgroundPixels(
        pixels,
        width,
        height,
        [1, 160, 65],
        48,
        controller.signal,
        async () => {
          controller.abort();
        }
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
