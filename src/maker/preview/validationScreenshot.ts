// @ts-expect-error pngjs has no bundled declarations; its decoder boundary is typed below.
import pngjs from 'pngjs';

const PNG = pngjs.PNG as {
  sync: { read(bytes: Buffer): { width: number; height: number; data: Buffer } };
};

export type ScreenshotAssessment = {
  status: 'NOT_READY' | 'REVIEW_REQUIRED';
  reasons: string[];
  frame: number;
  captured_frame?: number;
  bootstrap_at_capture: 'complete' | 'incomplete' | 'unobserved';
  bootstrap_completed_frame?: number;
  black_or_transparent_ratio: number;
  effective_visual_evidence?: false;
};

export class ValidationScreenshot {
  private bootstrap: ScreenshotAssessment['bootstrap_at_capture'] = 'unobserved';
  private atCapture?: ScreenshotAssessment['bootstrap_at_capture'];
  private completedFrame?: number;
  private capturedFrame?: number;

  constructor(private readonly frame: number) {}

  observe(line: string): void {
    const log = /^(?:\[[0-9 _:-]+\]\[(\d+)\] )?INFO: (.*)$/.exec(line);
    if (!log) return;
    const message = log[2];
    if (/^BootstrapPipeline: starting\b/.test(message)) {
      this.bootstrap = 'incomplete';
      this.completedFrame = undefined;
    } else if (message === 'BootstrapPipeline: completed successfully') {
      this.bootstrap = 'complete';
      this.completedFrame = log[1] === undefined ? undefined : Number(log[1]);
    }
    const capture = /^\[Screenshot\] (?:captured|requested) at frame (\d+)\b/.exec(message);
    if (capture && Number(capture[1]) === this.frame) {
      // A later readback/completion log cannot make an earlier request ready retroactively.
      this.atCapture ??= this.bootstrap;
      this.capturedFrame = Number(capture[1]);
    }
  }

  assess(bytes: Buffer): ScreenshotAssessment & { width: number; height: number } {
    // Bound decoded allocation before inflating, independently of compressed file size.
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width > 4096 || height > 4096)
      throw new Error('Screenshot dimensions exceed the supported 4096x4096 limit.');
    const image = PNG.sync.read(bytes);
    if (
      image.width !== width ||
      image.height !== height ||
      image.data.length !== width * height * 4
    )
      throw new Error('Screenshot pixel data is incomplete.');
    let blank = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (
        image.data[i + 3] <= 3 ||
        (image.data[i] <= 3 && image.data[i + 1] <= 3 && image.data[i + 2] <= 3)
      )
        blank++;
    }
    const ratio = blank / (width * height);
    // stdout/stderr delivery may interleave; global frames resolve unequal-frame ordering.
    // For same-frame events (or older logs without frames), retain observed request ordering.
    const bootstrapAtCapture =
      this.completedFrame !== undefined && this.completedFrame !== this.frame
        ? this.completedFrame < this.frame
          ? 'complete'
          : 'incomplete'
        : (this.atCapture ?? (this.bootstrap === 'incomplete' ? 'incomplete' : 'unobserved'));
    const reasons = [
      ...(bootstrapAtCapture === 'incomplete' ? ['bootstrap_incomplete'] : []),
      ...(ratio >= 0.999 ? ['near_total_black_or_transparent'] : []),
    ];
    return {
      status: reasons.length ? 'NOT_READY' : 'REVIEW_REQUIRED',
      reasons,
      frame: this.frame,
      captured_frame: this.capturedFrame,
      bootstrap_at_capture: bootstrapAtCapture,
      bootstrap_completed_frame: this.completedFrame,
      black_or_transparent_ratio: ratio,
      effective_visual_evidence: reasons.length ? false : undefined,
      width,
      height,
    };
  }
}

export function laterScreenshotFrame(assessment: ScreenshotAssessment): number | undefined {
  const next = Math.max(
    assessment.frame + 180,
    assessment.frame * 2,
    (assessment.bootstrap_completed_frame ?? 0) + 180
  );
  return Number.isSafeInteger(next) && next <= 2147483567 ? next : undefined;
}
