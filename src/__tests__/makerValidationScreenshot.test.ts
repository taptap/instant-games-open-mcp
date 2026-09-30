import {
  ValidationScreenshot,
  laterScreenshotFrame,
} from '../maker/preview/validationScreenshot.js';

const { PNG } = require('pngjs') as {
  PNG: {
    new (options: { width: number; height: number }): {
      width: number;
      height: number;
      data: Buffer;
    };
    sync: { write(image: { width: number; height: number; data: Buffer }): Buffer };
  };
};

function image(color: number[], colorType?: number): Buffer {
  const png = new PNG({ width: 100, height: 100 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set(color, i);
  return colorType === undefined
    ? PNG.sync.write(png)
    : require('pngjs').PNG.sync.write(png, { colorType });
}

const log = (frame: number, message: string) =>
  `[2026-09-30 12_00_00_000][${frame}] INFO: ${message}`;
const capture = (frame: number) =>
  log(frame, `[Screenshot] captured at frame ${frame} -> screenshot.png`);

test.each([0, 2, 4, 6])('decodes all pixels of PNG color type %s', (colorType) => {
  expect(new ValidationScreenshot(120).assess(image([40, 80, 120, 255], colorType))).toMatchObject({
    status: 'REVIEW_REQUIRED',
    black_or_transparent_ratio: 0,
    bootstrap_at_capture: 'unobserved',
  });
});

test('checks CRC and pixel data rather than trusting IHDR and IEND', () => {
  const bytes = image([0, 0, 0, 255]);
  bytes[bytes.length - 20] ^= 0xff;
  expect(() => new ValidationScreenshot(120).assess(bytes)).toThrow();
});

test('rejects an oversized PNG header before decompression', () => {
  const bytes = image([0, 0, 0, 255]);
  bytes.writeUInt32BE(50000, 16);
  expect(() => new ValidationScreenshot(120).assess(bytes)).toThrow(/dimensions/);
});

test('keeps startup ordering when bootstrap completes in the same frame after a request', () => {
  const tracker = new ValidationScreenshot(120);
  tracker.observe(log(0, 'BootstrapPipeline: starting with 5 steps, total weight 1.00'));
  tracker.observe(log(120, '[Screenshot] requested at frame 120 -> screenshot.png'));
  tracker.observe(log(120, 'BootstrapPipeline: completed successfully'));
  tracker.observe(capture(120));
  expect(tracker.assess(image([40, 80, 120, 255]))).toMatchObject({
    status: 'NOT_READY',
    reasons: ['bootstrap_incomplete'],
    bootstrap_at_capture: 'incomplete',
  });
});

test('later completion frames disqualify a screenshot even if streams deliver completion first', () => {
  const tracker = new ValidationScreenshot(120);
  tracker.observe(log(0, 'BootstrapPipeline: starting with 5 steps, total weight 1.00'));
  tracker.observe(log(900, 'BootstrapPipeline: completed successfully'));
  tracker.observe(capture(120));
  expect(tracker.assess(image([40, 80, 120, 255]))).toMatchObject({
    status: 'NOT_READY',
    reasons: ['bootstrap_incomplete'],
  });
});

test('an earlier completion frame survives delayed delivery from another stream', () => {
  const tracker = new ValidationScreenshot(120);
  tracker.observe(log(0, 'BootstrapPipeline: starting with 5 steps, total weight 1.00'));
  tracker.observe(capture(120));
  tracker.observe(log(3, 'BootstrapPipeline: completed successfully'));
  expect(tracker.assess(image([40, 80, 120, 255]))).toMatchObject({
    status: 'REVIEW_REQUIRED',
    bootstrap_at_capture: 'complete',
  });
});

test('only exact pipeline completion counts, not a step completion or game ready text', () => {
  const tracker = new ValidationScreenshot(120);
  tracker.observe(log(0, 'BootstrapPipeline: starting with 5 steps, total weight 1.00'));
  tracker.observe(log(3, "BootstrapPipeline: step 'Ready' completed successfully"));
  tracker.observe(log(3, 'Game ready'));
  tracker.observe(capture(120));
  expect(tracker.assess(image([40, 80, 120, 255]))).toMatchObject({
    status: 'NOT_READY',
    reasons: ['bootstrap_incomplete'],
  });
});

test('does not claim capture ordering without a capture event or global completion frame', () => {
  const tracker = new ValidationScreenshot(120);
  tracker.observe('INFO: BootstrapPipeline: starting with 5 steps, total weight 1.00');
  tracker.observe('INFO: BootstrapPipeline: completed successfully');
  expect(tracker.assess(image([40, 80, 120, 255]))).toMatchObject({
    status: 'REVIEW_REQUIRED',
    bootstrap_at_capture: 'unobserved',
  });
});

test('does not overflow Runtime frame limits when proposing another launch', () => {
  const assessment = new ValidationScreenshot(2147483567).assess(image([0, 0, 0, 255]));
  expect(laterScreenshotFrame(assessment)).toBeUndefined();
  expect(laterScreenshotFrame({ ...assessment, frame: 120, bootstrap_completed_frame: 1361 })).toBe(
    1541
  );
});
