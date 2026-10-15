import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCanvasMedia } from '../canvasMedia.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'maker-media-read-'));
});
afterEach(async () => {
  jest.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

test('concurrent and repeated ranges reuse the same verified bytes', async () => {
  const file = path.join(root, 'video.mp4');
  await fs.writeFile(file, '0123456789');
  const read = jest.spyOn(fs, 'readFile');
  const [first, second] = await Promise.all([readCanvasMedia(file), readCanvasMedia(file)]);
  expect(second).toBe(first);
  expect((await readCanvasMedia(file)).bytes.subarray(4, 8).toString()).toBe('4567');
  expect(read).toHaveBeenCalledTimes(1);
});

test('same-size overwrite with restored mtime still invalidates the cached content', async () => {
  const file = path.join(root, 'video.mp4');
  await fs.writeFile(file, 'original');
  const first = await readCanvasMedia(file);
  const before = await fs.stat(file);
  await fs.writeFile(file, 'replaced');
  await fs.utimes(file, before.atime, before.mtime);
  const next = await readCanvasMedia(file);
  expect(next.bytes.toString()).toBe('replaced');
  expect(next.version).not.toBe(first.version);
  expect(first.bytes.toString()).toBe('original');
});

test('a changed file during reading is rejected and the next request can retry', async () => {
  const file = path.join(root, 'video.mp4');
  await fs.writeFile(file, 'original');
  const readFile = fs.readFile;
  jest
    .spyOn(fs, 'readFile')
    .mockImplementationOnce(async (...args: Parameters<typeof fs.readFile>) => {
      const bytes = await readFile(...args);
      await fs.writeFile(file, 'changed during read');
      return bytes;
    });
  await expect(readCanvasMedia(file)).rejects.toMatchObject({ status: 409 });
  expect((await readCanvasMedia(file)).bytes.toString()).toBe('changed during read');
});

test('entry limit evicts older files instead of accumulating all project media', async () => {
  const read = jest.spyOn(fs, 'readFile');
  for (let index = 0; index < 17; index++) {
    const file = path.join(root, String(index));
    await fs.writeFile(file, String(index));
    await readCanvasMedia(file);
  }
  read.mockClear();
  await readCanvasMedia(path.join(root, '16'));
  expect(read).not.toHaveBeenCalled();
  await readCanvasMedia(path.join(root, '0'));
  expect(read).toHaveBeenCalledTimes(1);
});

test('oversize files fail before a full read and removed cached files are not served', async () => {
  const file = path.join(root, 'video.mp4');
  await fs.writeFile(file, 'small');
  await readCanvasMedia(file);
  await fs.truncate(file, 128 * 1024 * 1024 + 1);
  const read = jest.spyOn(fs, 'readFile');
  await expect(readCanvasMedia(file)).rejects.toMatchObject({ status: 413 });
  expect(read).not.toHaveBeenCalled();
  await fs.unlink(file);
  await expect(readCanvasMedia(file)).rejects.toMatchObject({ code: 'ENOENT' });
});
