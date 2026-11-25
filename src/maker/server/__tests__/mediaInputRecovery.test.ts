import { embeddedMediaDiagnostics, mediaInputRecoveryHint } from '../mediaInputRecovery.js';

describe('media input recovery diagnostics', () => {
  it('does not inspect normal errors', () => {
    let inspected = false;
    expect(
      mediaInputRecoveryHint('validation failed', () => {
        inspected = true;
        return [];
      })
    ).toBeUndefined();
    expect(inspected).toBe(false);
  });

  it('diagnoses embedded image metadata only for stack overflow', () => {
    const hint = mediaInputRecoveryHint('INVALID_REQUEST: Maximum call stack size exceeded', () => [
      { bytes: 3_168_681, mimeType: 'image/png', width: 2048, height: 1152 },
    ]);
    expect(hint).toContain('3168681');
    expect(hint).toContain('2048×1152');
    expect(hint).toContain('2,500,000');
    expect(hint).not.toContain('data:image');
    expect(hint).not.toContain('base64,');
  });

  it('finds embedded PNG dimensions without fetching URLs', () => {
    const pngHeader = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngHeader);
    pngHeader.writeUInt32BE(320, 16);
    pngHeader.writeUInt32BE(180, 20);
    const encoded = pngHeader.toString('base64');
    const result = embeddedMediaDiagnostics({
      inline: 'data:image/png;base64,' + encoded,
      remote: 'https://example.invalid/image.png',
    });
    expect(result).toEqual([{ bytes: 24, mimeType: 'image/png', width: 320, height: 180 }]);
  });

  it('keeps the original message when diagnostics throw', () => {
    const hint = mediaInputRecoveryHint('Maximum call stack size exceeded', () => {
      throw new Error('diagnostic failure');
    });
    expect(hint).toContain('2.5 MB');
  });
});
