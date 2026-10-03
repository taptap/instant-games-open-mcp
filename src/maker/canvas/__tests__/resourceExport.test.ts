import { canvasExportFormats, downloadCanvasResource } from '../resourceExport.js';
import type { CanvasNode } from '../model.js';
import * as sequenceExport from '../sequenceExport.js';

function node(type: CanvasNode['type'] = 'video-source'): CanvasNode {
  return {
    id: 'card',
    type,
    title: '角色跑步',
    assetPath: 'assets/video/run.webm',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
}

test('offers formats only for resource cards', () => {
  expect(canvasExportFormats(node('image')).map((item) => item.format)).toEqual(['png', 'jpg']);
  expect(canvasExportFormats(node('video')).map((item) => item.format)).toEqual(['video']);
  expect(canvasExportFormats(node('animation')).map((item) => item.format)).toEqual([
    'atlas',
    'frames',
  ]);
  expect(canvasExportFormats(node('sequence')).map((item) => item.format)).toEqual([
    'atlas',
    'frames',
  ]);
  expect(canvasExportFormats(node('note'))).toEqual([]);
  expect(canvasExportFormats(node('section'))).toEqual([]);
  expect(canvasExportFormats()).toEqual([]);
});

describe('video and frame data downloads', () => {
  const globals = globalThis as any;
  const originalFetch = globals.fetch;
  const originalWindow = globals.window;
  let writable: any;
  let picker: jest.Mock;
  let fetcher: jest.Mock;
  beforeEach(() => {
    writable = {
      write: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
      abort: jest.fn(async () => undefined),
    };
    picker = jest.fn(async () => ({ createWritable: async () => writable }));
    fetcher = jest.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['original-video-bytes']),
    }));
    globals.window = { showSaveFilePicker: picker };
    globals.fetch = fetcher;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    globals.fetch = originalFetch;
    globals.window = originalWindow;
  });

  test('saves original video bytes without converting the format', async () => {
    await downloadCanvasResource(node(), 'video', (path) => '/media?path=' + path);
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: expect.stringMatching(/^角色跑视[A-Z0-9]{6}\.webm$/),
      })
    );
    expect(fetcher).toHaveBeenCalledWith('/media?path=assets/video/run.webm');
    expect(await writable.write.mock.calls[0][0].text()).toBe('original-video-bytes');
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  test('CLI sink uses the same export bytes without opening a save dialog', async () => {
    const source = node();
    const before = structuredClone(source);
    const sink = jest.fn(async (_blob: Blob, _filename: string) => undefined);
    await downloadCanvasResource(source, 'video', (path) => path, undefined, undefined, true, sink);
    expect(picker).not.toHaveBeenCalled();
    expect(await sink.mock.calls[0][0].text()).toBe('original-video-bytes');
    expect(sink.mock.calls[0][1]).toMatch(/.webm$/);
    expect(source).toEqual(before);
  });

  test('canceling does not read media or write a file', async () => {
    picker.mockRejectedValue(Object.assign(new Error('cancel'), { name: 'AbortError' }));
    await downloadCanvasResource(node(), 'video', (path) => path);
    expect(fetcher).not.toHaveBeenCalled();
    expect(writable.write).not.toHaveBeenCalled();
  });

  test('failed reads never save an error response as a video', async () => {
    fetcher.mockResolvedValue({ ok: false });
    await expect(downloadCanvasResource(node(), 'video', (path) => path)).rejects.toThrow(
      '视频读取失败'
    );
    expect(writable.write).not.toHaveBeenCalled();
  });

  test('failed writes abort the selected file', async () => {
    writable.write.mockRejectedValue(new Error('disk full'));
    await expect(downloadCanvasResource(node(), 'video', (path) => path)).rejects.toThrow(
      'disk full'
    );
    expect(writable.abort).toHaveBeenCalledTimes(1);
    expect(writable.close).not.toHaveBeenCalled();
  });

  test('writes one ZIP using the selected result metadata without changing the card', async () => {
    const animation = node('animation');
    animation.assetPath = 'assets/image/atlas.png';
    animation.frameSetInfo = {
      fps: 4,
      frameCount: 1,
      width: 32,
      height: 32,
      columns: 1,
      rows: 1,
      frames: [{ index: 3, time: 0.75, x: 0, y: 0, width: 32, height: 32 }],
    };
    animation.generation = { prompt: 'private prompt' };
    const before = structuredClone(animation);
    const archive = new Blob(['archive'], { type: 'application/zip' });
    const exportSequence = jest
      .spyOn(sequenceExport, 'createSequenceExport')
      .mockResolvedValue(archive);
    await downloadCanvasResource(animation, 'atlas', (path) => path);
    expect(exportSequence).toHaveBeenCalledWith(
      animation.assetPath,
      animation.frameSetInfo,
      'atlas',
      expect.stringMatching(/^角色跑集[A-Z0-9]{6}$/),
      undefined,
      { name: 'default', loop: true }
    );
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: expect.stringMatching(/^角色跑集[A-Z0-9]{6}\.zip$/),
      })
    );
    expect(exportSequence.mock.calls[0][3] + '.zip').toBe(picker.mock.calls[0][0].suggestedName);
    expect(writable.write).toHaveBeenCalledWith(archive);
    expect(fetcher).not.toHaveBeenCalled();
    expect(animation).toEqual(before);
    await downloadCanvasResource(
      animation,
      'frames',
      (path) => path,
      undefined,
      { title: '猫咪', direction: '左' },
      false
    );
    expect(exportSequence.mock.calls[1][5]).toEqual({ name: 'left', loop: false });
  });

  test.each(['empty', 'pending', 'missing-frames', 'invalid-format'])(
    'rejects %s before opening a save dialog',
    async (state) => {
      const card = node(state === 'missing-frames' ? 'animation' : 'video');
      if (state === 'empty') delete card.assetPath;
      if (state === 'pending') card.templatePending = true;
      await expect(
        downloadCanvasResource(
          card,
          state === 'missing-frames' || state === 'invalid-format' ? 'atlas' : 'video',
          (path) => path
        )
      ).rejects.toThrow();
      expect(picker).not.toHaveBeenCalled();
    }
  );
});
