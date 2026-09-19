import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { trimPreviewCache, UNVERIFIED_CLEANUP_MARKER } from '../maker/preview/cache.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-preview-cache-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('retains explicitly protected current and rollback installs regardless of age', () => {
  const copies = Array.from({ length: 5 }, (_, i) => {
    const filename = path.join(root, 'runtime-' + randomUUID());
    fs.mkdirSync(filename);
    fs.utimesSync(filename, new Date(i * 1000), new Date(i * 1000));
    return filename;
  });
  expect(trimPreviewCache(root, 'runtime-', 2, [copies[0], copies[1]])).toEqual([]);
  expect(fs.readdirSync(root).sort()).toEqual(
    copies
      .slice(0, 2)
      .map((filename) => path.basename(filename))
      .sort()
  );
});

test('never removes an unverified installer or unrelated directories', () => {
  const uncertain = path.join(root, 'runtime-' + randomUUID());
  const unrelated = path.join(root, 'runtime-user-files');
  fs.mkdirSync(uncertain);
  fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(uncertain, UNVERIFIED_CLEANUP_MARKER), '');
  trimPreviewCache(root, 'runtime-', 0, []);
  expect(fs.existsSync(uncertain)).toBe(true);
  expect(fs.existsSync(unrelated)).toBe(true);
});

(process.platform === 'win32' ? test.skip : test)(
  'does not follow a symlink cache root or child',
  () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    const target = path.join(outside, randomUUID());
    fs.mkdirSync(target);
    const linkedRoot = path.join(root, 'linked');
    fs.symlinkSync(outside, linkedRoot, 'dir');
    expect(trimPreviewCache(linkedRoot, '', 0, [])).toHaveLength(1);
    expect(fs.existsSync(target)).toBe(true);
    const childLink = path.join(root, 'runtime-' + randomUUID());
    fs.symlinkSync(outside, childLink, 'dir');
    trimPreviewCache(root, 'runtime-', 0, []);
    expect(fs.lstatSync(childLink).isSymbolicLink()).toBe(true);
  }
);
