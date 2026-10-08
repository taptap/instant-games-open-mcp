import {
  sequenceExportManifest,
  sequenceExportLua,
  sequenceExportInstructions,
} from '../sequenceExport.js';
import { createCanvasZip } from '../zipArchive.js';
import { canvasExportFilename } from '../exportNaming.js';
import type { FrameSetInfo } from '../sequenceModel.js';
import * as yauzl from 'yauzl';

function info(): FrameSetInfo {
  return {
    width: 64,
    height: 32,
    fps: 4,
    frameCount: 2,
    columns: 2,
    rows: 1,
    frames: [
      { index: 3, time: 0.75, x: 32, y: 0, width: 32, height: 32 },
      { index: 7, time: 1.75, x: 0, y: 0, width: 32, height: 32 },
    ],
  };
}

test.each([true, false])(
  'exports Maker SpriteSheet fields and playback order with loop=%s',
  (loop) => {
    const data = info();
    const before = structuredClone(data);
    const manifest = sequenceExportManifest(data, 64, 32, { name: 'left', loop });
    expect(manifest.meta).toEqual({ image: 'spritesheet.png', size: { w: 64, h: 32 }, scale: '1' });
    expect(manifest.animations).toEqual([
      {
        name: 'left',
        frames: ['left_0001', 'left_0002'],
        repeat: loop ? 0 : 1,
        fps: 4,
        direction: 'forward',
      },
    ]);
    expect(manifest.frames.map((frame) => frame.filename)).toEqual(['left_0001', 'left_0002']);
    expect(manifest.frames.map((frame) => frame.frame.x)).toEqual([32, 0]);
    expect(manifest.frames[0]).toEqual(
      expect.objectContaining({
        frame: { x: 32, y: 0, w: 32, h: 32 },
        duration: 250,
        sourceSize: { w: 32, h: 32 },
        spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
        trimmed: false,
        rotated: false,
      })
    );
    expect(data).toEqual(before);
  }
);

test.each([true, false])('exports a Maker Lua clip with loop=%s and four digit paths', (loop) => {
  const data = info();
  const before = structuredClone(data);
  const lua = sequenceExportLua(data, '角色左帧ABC123', { name: 'left', loop });
  expect(lua).toContain('name = "left"');
  expect(lua).toContain('framePattern = "image/角色左帧ABC123/frames/frame_%04d.png"');
  expect(lua).toContain('frameCount = 2');
  expect(lua).toContain('fps = 4');
  expect(lua).toContain('loop = ' + loop);
  expect(lua).toContain('width = 32');
  expect(lua).toContain('height = 32');
  expect(data).toEqual(before);
});

test('fractional frame durations retain the exported FPS', () => {
  const data = { ...info(), fps: 12 };
  expect(sequenceExportManifest(data, 64, 32).frames[0].duration).toBe(1000 / 12);
});

test.each(['../outside', 'x";error(1)', 'a\\b', 'a\nb'])(
  'rejects unsafe Lua resource folder %s',
  (folder) => {
    expect(() => sequenceExportLua(info(), folder)).toThrow('目录名称无效');
  }
);

test.each(['bad"name', '', '../name'])('rejects unsafe animation name %s', (name) => {
  expect(() => sequenceExportManifest(info(), 64, 32, { name, loop: true })).toThrow('动画名称');
});

test('both formats include actionable Maker paths and component requirements', () => {
  const playback = { name: 'front', loop: false };
  const atlas = sequenceExportInstructions('猫前集123456', 'atlas', playback);
  expect(atlas).toContain('image/猫前集123456/spritesheet.json');
  expect(atlas).toContain('UI.Sprite');
  expect(atlas).toContain('defaultAnimation = "front"');
  expect(atlas).toContain('播放一次');
  const frames = sequenceExportInstructions('猫前帧123456', 'frames', playback);
  expect(frames).toContain('scripts/animations/猫前帧123456.lua');
  expect(frames).toContain('require("animations.猫前帧123456")');
  expect(frames).toContain('不是自动运行的播放器');
});

test.each([
  'count',
  'fps',
  'nan',
  'bounds',
  'negative',
  'fraction',
  'size',
  'different',
  'time',
  'empty',
])('rejects invalid %s metadata instead of silently producing incomplete images', (kind) => {
  const data = info();
  if (kind === 'count') data.frameCount++;
  if (kind === 'fps') data.fps = 0;
  if (kind === 'nan') data.fps = NaN;
  if (kind === 'bounds') data.frames[0].x = 64;
  if (kind === 'negative') data.frames[0].y = -1;
  if (kind === 'fraction') data.frames[0].width = 1.5;
  if (kind === 'size') data.width = 32;
  if (kind === 'different') data.frames[1].width = 16;
  if (kind === 'time') data.frames[1].time = Infinity;
  if (kind === 'empty') data.frames = [];
  expect(() => sequenceExportManifest(data, 64, 32)).toThrow();
});

test('Windows reserved filenames are safe in both the archive filename and folder', () => {
  expect(canvasExportFilename({ title: 'CON', direction: '' }, 'atlas', 'zip', 'TH8K2A')).toBe(
    'CON集TH8K2A.zip'
  );
  expect(
    canvasExportFilename({ title: '猫咪跑步.zip', direction: '' }, 'frames', 'zip', 'TH8K2B')
  ).toBe('猫咪跑帧TH8K2B.zip');
});

test('stored ZIP uses UTF-8 filenames, standard CRC32 and decodes with an independent reader', async () => {
  const archive = await createCanvasZip([
    { name: '猫咪/atlas.png', blob: new Blob(['123456789']) },
    { name: '猫咪/animation.json', blob: new Blob(['{"fps":4}']) },
  ]);
  const buffer = Buffer.from(await archive.arrayBuffer());
  expect(buffer.readUInt32LE(14)).toBe(0xcbf43926);
  expect(buffer.readUInt16LE(6)).toBe(0x800);
  const decoded = await new Promise<Record<string, string>>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const entries: Record<string, string> = {};
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return reject(error);
          const chunks: Buffer[] = [];
          stream.on('error', reject);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            entries[entry.fileName] = Buffer.concat(chunks).toString();
            zip.readEntry();
          });
        })
      );
      zip.readEntry();
    });
  });
  expect(decoded).toEqual({ '猫咪/atlas.png': '123456789', '猫咪/animation.json': '{"fps":4}' });
});

test.each(['../escape.png', '/absolute.png', 'folder\\file.png', 'C:/file.png', 'empty//file.png'])(
  'ZIP rejects unsafe path %s',
  async (name) => {
    await expect(createCanvasZip([{ name, blob: new Blob(['image']) }])).rejects.toThrow();
  }
);

test('ZIP rejects duplicate entries', async () => {
  await expect(
    createCanvasZip(Array.from({ length: 2 }, () => ({ name: 'same.png', blob: new Blob(['x']) })))
  ).rejects.toThrow();
});

test('ZIP allows 120 frames plus Lua and README, but still caps entry count', async () => {
  const entries = Array.from({ length: 122 }, (_, index) => ({
    name: 'entry_' + index,
    blob: new Blob(['x']),
  }));
  expect((await createCanvasZip(entries)).size).toBeGreaterThan(0);
  await expect(
    createCanvasZip([...entries, { name: 'extra', blob: new Blob(['x']) }])
  ).rejects.toThrow('文件数量');
});
