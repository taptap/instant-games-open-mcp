import { Script } from 'node:vm';
import { downloadCanvasImage } from '../imageExport';

function setup(format: 'png' | 'jpg', canceled = false) {
  const blob = new Blob(['encoded'], { type: format === 'jpg' ? 'image/jpeg' : 'image/png' });
  const context = { fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: jest.fn((callback) => callback(blob)),
  };
  const writable = {
    write: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
    abort: jest.fn(async () => undefined),
  };
  const picker = jest.fn(async () => {
    if (canceled) throw Object.assign(new Error('Canceled'), { name: 'AbortError' });
    return { createWritable: async () => writable };
  });
  const decode = jest.fn(async () => undefined);
  const globals = {
    setTimeout,
    clearTimeout,
    window: { showSaveFilePicker: picker },
    document: { createElement: () => canvas },
    Image: class {
      naturalWidth = 512;
      naturalHeight = 256;
      decode = decode;
      onload?: () => void;
      onerror?: () => void;
      set src(value: string) {
        if (value)
          void decode().then(
            () => this.onload?.(),
            () => this.onerror?.()
          );
      }
    },
  };
  const download = new Script('(' + downloadCanvasImage.toString() + ')').runInNewContext(globals);
  return { download, canvas, context, picker, writable, decode, blob };
}

describe('canvas image export', () => {
  test('image loading timeout releases the caller without producing a file', async () => {
    jest.useFakeTimers();
    try {
      const { download, decode, writable } = setup('png');
      decode.mockImplementation(() => new Promise(() => {}));
      const pending = download('/stalled-image', 'hero', 'png');
      const rejection = expect(pending).rejects.toThrow('加载超时');
      await jest.advanceTimersByTimeAsync(15000);
      await rejection;
      expect(writable.write).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('image load errors do not produce an export', async () => {
    const { download, decode, writable } = setup('png');
    decode.mockRejectedValueOnce(new Error('invalid image'));
    await expect(download('/invalid', 'hero', 'png')).rejects.toThrow('无法加载');
    expect(writable.write).not.toHaveBeenCalled();
  });
  test('CLI sink receives encoded bytes without a browser save dialog', async () => {
    const { download, picker, writable, blob } = setup('png');
    const sink = jest.fn(async () => undefined);
    await download('/api/image', 'hero', 'png', sink);
    expect(sink).toHaveBeenCalledWith(blob, 'hero.png');
    expect(picker).not.toHaveBeenCalled();
    expect(writable.write).not.toHaveBeenCalled();
  });
  test.each(['png', 'jpg'] as const)(
    'encodes %s at original size and writes the selected local file',
    async (format) => {
      const { download, canvas, context, picker, writable, blob } = setup(format);
      await download('/api/image', 'hero.png', format);
      expect(picker).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedName: 'hero.' + format })
      );
      expect(canvas.width).toBe(512);
      expect(canvas.height).toBe(256);
      expect(canvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        format === 'jpg' ? 'image/jpeg' : 'image/png',
        0.95
      );
      expect(context.fillRect).toHaveBeenCalledTimes(format === 'jpg' ? 1 : 0);
      if (format === 'jpg') expect(context.fillStyle).toBe('#ffffff');
      expect(writable.write).toHaveBeenCalledWith(blob);
      expect(writable.close).toHaveBeenCalledTimes(1);
    }
  );

  test('canceling the save picker does not encode or write', async () => {
    const { download, decode, writable } = setup('png', true);
    await download('/api/image', 'hero', 'png');
    expect(decode).not.toHaveBeenCalled();
    expect(writable.write).not.toHaveBeenCalled();
  });

  test('aborts a failed write without reporting success', async () => {
    const { download, writable } = setup('png');
    writable.write.mockRejectedValueOnce(new Error('disk full'));
    await expect(download('/api/image', 'hero', 'png')).rejects.toThrow('disk full');
    expect(writable.abort).toHaveBeenCalledTimes(1);
    expect(writable.close).not.toHaveBeenCalled();
  });
});
