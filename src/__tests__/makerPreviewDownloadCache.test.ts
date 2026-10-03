import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openPreviewDownloadCache } from '../maker/preview/downloadCache.js';

let directory: string;
const allocated = new Set<string>();
const firstUrl = 'http://127.0.0.1:12345/first-token/';
const nextUrl = 'http://127.0.0.1:12346/next-token/';

beforeEach(() => {
  directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-download-test-')));
});
afterEach(() => {
  for (const root of allocated) fs.rmSync(root, { recursive: true, force: true });
  allocated.clear();
  fs.rmSync(directory, { recursive: true, force: true });
});

function open(url = firstUrl, platform: NodeJS.Platform = 'win32', storage = directory) {
  const cache = openPreviewDownloadCache(storage, url, platform);
  allocated.add(cache.root);
  return cache;
}

test.each<NodeJS.Platform>(['win32', 'darwin'])(
  '%s preserves public resources and another round while removing only the owned project',
  (platform) => {
    const first = open(firstUrl, platform);
    const next = open(nextUrl, platform);
    expect(next.root).toBe(first.root);
    const publicFile = path.join(first.root, 'cdn.example/engine-res/assets/uuid-hash.bin');
    const project = path.join(first.root, '127.0.0.1_12345/first-token');
    const nextProject = path.join(first.root, '127.0.0.1_12346/next-token');
    const sibling = path.join(first.root, '127.0.0.1_12345/sibling');
    for (const name of [path.dirname(publicFile), project, nextProject, sibling])
      fs.mkdirSync(name, { recursive: true });
    fs.writeFileSync(publicFile, 'cached public asset');
    first.clearProject();
    first.clearProject();
    expect(fs.existsSync(project)).toBe(false);
    expect(fs.existsSync(nextProject)).toBe(true);
    expect(fs.existsSync(sibling)).toBe(true);
    expect(fs.readFileSync(publicFile, 'utf8')).toBe('cached public asset');
    next.clearProject();
    expect(fs.existsSync(path.dirname(nextProject))).toBe(false);
    expect(open(firstUrl, platform).root).toBe(first.root);
  }
);

test('Windows stays in a short TEMP directory and isolates projects and Maker homes', () => {
  const first = open();
  const otherProject = open(firstUrl, 'win32', path.join(directory, 'other-project'));
  const otherHome = open(firstUrl, 'win32', path.join(directory, 'other-home'));
  expect(path.dirname(first.root)).toBe(fs.realpathSync(os.tmpdir()));
  expect(path.basename(first.root)).toMatch(/^maker-cache-[a-f0-9]{16}$/);
  expect(new Set([first.root, otherProject.root, otherHome.root]).size).toBe(3);
  expect(open(nextUrl).root).toBe(first.root);
});

test('macOS adopts its existing public cache without moving or deleting it', () => {
  const root = path.join(directory, 'runtime-cache');
  fs.mkdirSync(path.join(root, 'cdn.example'), { recursive: true });
  fs.writeFileSync(path.join(root, 'cdn.example/resource'), 'existing');
  const cache = open(firstUrl, 'darwin');
  cache.clearProject();
  expect(cache.root).toBe(root);
  expect(fs.readFileSync(path.join(root, 'cdn.example/resource'), 'utf8')).toBe('existing');
});

test.each([false, true])(
  'Windows owner write failure permits a clean retry (partial=%s)',
  (partial) => {
    const cacheRoot = path.join(
      fs.realpathSync(os.tmpdir()),
      'maker-cache-' + createHash('sha256').update(directory).digest('hex').slice(0, 16)
    );
    allocated.add(cacheRoot);
    const write = fs.writeFileSync;
    const failedWrite = jest
      .spyOn(fs, 'writeFileSync')
      .mockImplementationOnce((file, data, options) => {
        if (partial) write(file, '{', options);
        throw new Error('Transient owner write failure');
      });
    try {
      expect(() => open()).toThrow('Transient owner write failure');
    } finally {
      failedWrite.mockRestore();
    }
    expect(fs.existsSync(cacheRoot)).toBe(false);
    expect(() => open()).not.toThrow();
  }
);

test('refuses a Windows cache with a mismatched or missing owner without removing it', () => {
  const cache = open();
  const marker = path.join(cache.root, '.maker-preview-owner.json');
  fs.writeFileSync(marker, '{"storage":"another project"}');
  expect(() => open()).toThrow(/belongs to another project/);
  expect(() => cache.clearProject()).toThrow(/belongs to another project/);
  fs.unlinkSync(marker);
  expect(() => open()).toThrow();
  expect(fs.existsSync(cache.root)).toBe(true);
});

test.each<NodeJS.Platform>(['win32', 'darwin'])(
  '%s refuses a replaced root at reuse and cleanup, preserving the linked target',
  (platform) => {
    const cache = open(firstUrl, platform);
    const target = path.join(directory, 'untouched');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'sentinel'), 'preserved');
    fs.rmSync(cache.root, { recursive: true });
    fs.symlinkSync(target, cache.root, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => open(firstUrl, platform)).toThrow(/ownership changed/);
    expect(() => cache.clearProject()).toThrow(/ownership changed/);
    expect(fs.readFileSync(path.join(target, 'sentinel'), 'utf8')).toBe('preserved');
  }
);

test.each(['127.0.0.1_12345', '127.0.0.1_12345/first-token'])(
  'refuses a linked project cache at %s, including dangling links',
  (relative) => {
    const cache = open();
    const filename = path.join(cache.root, relative);
    const target = path.join(directory, 'not-created');
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.symlinkSync(target, filename, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => open()).toThrow(/ownership changed/);
    expect(() => cache.clearProject()).toThrow(/ownership changed/);
    expect(fs.lstatSync(filename).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  }
);

test.each([
  'https://cdn.example/project/',
  'http://127.0.0.1:12345/first-token/nested/',
  'http://127.0.0.1:12345/first-token/?query=value',
  'http://user:password@127.0.0.1:12345/first-token/',
])('rejects a non-preview URL: %s', (url) => {
  open();
  expect(() => open(url)).toThrow(/protected loopback project URL/);
});
