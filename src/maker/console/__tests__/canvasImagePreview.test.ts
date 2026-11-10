import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MakerCanvasFiles } from '../../canvas/files.js';
import { CanvasImagePreview } from '../canvasImagePreview.js';

let root: string;
let files: MakerCanvasFiles;
let preview: CanvasImagePreview;
let saved: unknown;

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-image-preview-')));
  files = new MakerCanvasFiles(root);
  saved = {};
  jest.spyOn(files, 'readPreviewImageIndex').mockImplementation(() => saved);
  jest.spyOn(files, 'writePreviewImageIndex').mockImplementation(async (value) => {
    saved = JSON.parse(JSON.stringify(value));
  });
  preview = new CanvasImagePreview(files);
});

afterEach(async () => {
  await jest.runOnlyPendingTimersAsync();
  jest.useRealTimers();
  jest.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

async function write(relative: string, bytes: Buffer): Promise<string> {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return file;
}

async function original(bytes = Buffer.alloc(12_000, 7)) {
  const reference = 'assets/image/canvas-' + randomUUID() + '.png';
  const file = await write(reference, bytes);
  await preview.read(reference);
  return { reference, file, bytes };
}

test('remembers fingerprints across sessions and recovers a renamed file without rewriting its reference', async () => {
  const image = await original();
  await jest.advanceTimersByTimeAsync(100);
  expect(files.writePreviewImageIndex).toHaveBeenCalledTimes(1);
  const moved = await write('assets/ui/renamed.png', image.bytes);
  await fs.unlink(image.file);
  preview = new CanvasImagePreview(files);
  expect(await preview.read(image.reference)).toMatchObject({ file: moved, bytes: image.bytes });
  expect(() => files.readMedia(image.reference)).toThrow();
  expect(await fs.readdir(path.join(root, 'assets/image'))).toEqual([]);
});

test('searches again when the last recovered location contains a different file of the same size', async () => {
  const image = await original();
  const first = await write('assets/first.png', image.bytes);
  await fs.unlink(image.file);
  expect((await preview.read(image.reference)).file).toBe(first);
  const second = path.join(root, 'assets/second.png');
  await fs.rename(first, second);
  await fs.writeFile(first, Buffer.alloc(image.bytes.length, 9));
  await jest.advanceTimersByTimeAsync(30_001);
  expect(await preview.read(image.reference)).toMatchObject({ file: second, bytes: image.bytes });
});

test('size and sampled bytes reject unrelated files before a full read; concurrent searches share the scan', async () => {
  const image = await original();
  await write('assets/moved.png', image.bytes);
  await fs.unlink(image.file);
  for (let i = 0; i < 40; i++) {
    await write('assets/noise/' + i + '.png', Buffer.alloc(i < 20 ? 500 : image.bytes.length, 1));
  }
  const fullReads = jest.spyOn(fs, 'readFile');
  const listing = jest.spyOn(fs, 'readdir');
  const results = await Promise.all([preview.read(image.reference), preview.read(image.reference)]);
  expect(results.every((value) => value.bytes?.equals(image.bytes))).toBe(true);
  expect(fullReads).toHaveBeenCalledTimes(1);
  const listed = listing.mock.calls.length;
  await preview.read(image.reference);
  expect(listing).toHaveBeenCalledTimes(listed);
  expect(fullReads).toHaveBeenCalledTimes(1);
});

test('matching size and head/tail are only filters: changed middle bytes must not match', async () => {
  const image = await original();
  const altered = Buffer.from(image.bytes);
  altered[6000] = 8;
  await write('assets/same-sample.png', altered);
  await fs.unlink(image.file);
  await expect(preview.read(image.reference)).rejects.toThrow();
});

test('identical copies are ambiguous, while archive copies are excluded', async () => {
  const image = await original();
  await write('assets/first.png', image.bytes);
  await write('assets/second.png', image.bytes);
  await fs.unlink(image.file);
  await expect(preview.read(image.reference)).rejects.toThrow();
  await fs.mkdir(path.join(root, 'assets/archive'));
  await fs.rename(
    path.join(root, 'assets/second.png'),
    path.join(root, 'assets/archive/second.png')
  );
  await jest.advanceTimersByTimeAsync(30_001);
  expect((await preview.read(image.reference)).file).toBe(path.join(root, 'assets/first.png'));
});

test('deleted files, archive-only files and nested projects remain missing', async () => {
  const image = await original();
  await write('archive/only.png', image.bytes);
  await write('other-game/assets/only.png', image.bytes);
  await fs.mkdir(path.join(root, 'other-game/.project'));
  await fs.unlink(image.file);
  await expect(preview.read(image.reference)).rejects.toThrow();
  await jest.advanceTimersByTimeAsync(100);
  (saved as Record<string, { location: string }>)[image.reference].location =
    'other-game/assets/only.png';
  await expect(new CanvasImagePreview(files).read(image.reference)).rejects.toThrow();
});

test('does not follow symlink directories or accept a persisted location outside the project', async () => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-outside-'));
  try {
    const image = await original();
    await jest.advanceTimersByTimeAsync(100);
    await fs.rename(image.file, path.join(outside, 'image.png'));
    await fs.symlink(outside, path.join(root, 'assets/linked'));
    (saved as Record<string, { location: string }>)[image.reference].location = path.join(
      outside,
      'image.png'
    );
    preview = new CanvasImagePreview(files);
    await expect(preview.read(image.reference)).rejects.toThrow();
  } finally {
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('unknown old references do not trigger a scan and optional index write failures do not break display', async () => {
  const listing = jest.spyOn(fs, 'readdir');
  await expect(preview.read('assets/image/canvas-' + randomUUID() + '.png')).rejects.toThrow();
  expect(listing).not.toHaveBeenCalled();
  jest.mocked(files.writePreviewImageIndex).mockRejectedValue(new Error('read-only'));
  const image = await original();
  await jest.advanceTimersByTimeAsync(100);
  expect((await preview.read(image.reference)).bytes).toEqual(image.bytes);
});

test('the optional index persists through the existing project writer and tolerates damaged JSON', async () => {
  const image = await original();
  await jest.advanceTimersByTimeAsync(100);
  const disk = new MakerCanvasFiles(root);
  await disk.writePreviewImageIndex(saved);
  expect(disk.readPreviewImageIndex()).toEqual(saved);
  jest.spyOn(disk, 'writePreviewImageIndex').mockResolvedValue();
  await write('assets/moved.png', image.bytes);
  await fs.unlink(image.file);
  expect((await new CanvasImagePreview(disk).read(image.reference)).bytes).toEqual(image.bytes);
  await write('.maker/canvases/image-previews.json', Buffer.from('{broken'));
  expect(disk.readPreviewImageIndex()).toEqual({});
});
