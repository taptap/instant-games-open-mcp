import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import {
  getOriginalMotionExamples,
  getOriginalMotionReference,
  serveOriginalMotion,
} from '../uiMotion/originals.js';

describe('original UI motion reference limits', () => {
  let root: string;
  let previousDirectory: string | undefined;
  let files: string[];

  function writeCatalog() {
    fs.writeFileSync(
      path.join(root, 'ui-motion-native/catalog.json'),
      JSON.stringify({
        version: 1,
        files: files.map((name) => ({ path: name })),
        scenes: [],
        images: [],
      })
    );
  }

  function sparseFile(name: string, size: number) {
    const filename = path.join(root, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, '');
    fs.truncateSync(filename, size);
    files.push(name);
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-motion-originals-'));
    previousDirectory = process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR;
    process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR = root;
    fs.mkdirSync(path.join(root, 'ui-motion-native'));
    fs.writeFileSync(path.join(root, 'ui-motion-native/index.html'), '<html>preview</html>');
    files = ['ui-motion-native/index.html'];
    writeCatalog();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousDirectory === undefined) delete process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR;
    else process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR = previousDirectory;
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('returns the registered source and serves small files', () => {
    expect(getOriginalMotionReference('S01')).toMatchObject({
      example: { id: 'S01', available: true },
      files: [{ path: 'ui-motion-native/index.html', content: '<html>preview</html>' }],
    });
    const response = { setHeader: jest.fn(), writeHead: jest.fn(), end: jest.fn() };
    serveOriginalMotion(
      new URL('http://localhost/ui-motion/original/neon/index.html'),
      response as unknown as ServerResponse
    );
    expect(response.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    expect(response.end).toHaveBeenCalledWith(Buffer.from('<html>preview</html>'));
  });

  test('rejects an oversized catalog before reading it', () => {
    fs.truncateSync(path.join(root, 'ui-motion-native/catalog.json'), 1024 * 1024 + 1);
    const read = jest.spyOn(fs, 'readFileSync');
    expect(getOriginalMotionReference('S01')).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  test('rejects excessive file counts and malformed image paths', () => {
    files = Array.from({ length: 1025 }, () => 'ui-motion-native/index.html');
    writeCatalog();
    expect(getOriginalMotionReference('S01')).toBeNull();
    fs.writeFileSync(
      path.join(root, 'ui-motion-native/catalog.json'),
      JSON.stringify({
        version: 1,
        files: [{ path: 'ui-motion-native/index.html' }],
        scenes: [],
        images: [null],
      })
    );
    expect(getOriginalMotionExamples().every((example) => !example.available)).toBe(true);
  });

  test.each([[25 * 1024 * 1024], [17 * 1024 * 1024, 17 * 1024 * 1024]])(
    'rejects oversized reference content before loading any source (%j)',
    (...sizes) => {
      sizes.forEach((size, index) => sparseFile('scripts/large' + index + '.lua', size));
      writeCatalog();
      const read = jest.spyOn(fs, 'readFileSync');
      expect(() => getOriginalMotionReference('S01')).toThrow('参考包超过大小上限');
      expect(
        read.mock.calls
          .filter(([filename]) => String(filename).startsWith(root + path.sep))
          .every(([filename]) => String(filename).endsWith('catalog.json'))
      ).toBe(true);
    }
  );

  test('rejects oversized individual files before sending headers or reading content', () => {
    sparseFile('assets/Fonts/Menu-Black.ttf', 24 * 1024 * 1024 + 1);
    writeCatalog();
    const read = jest.spyOn(fs, 'readFileSync');
    const response = { setHeader: jest.fn(), writeHead: jest.fn(), end: jest.fn() };
    expect(() =>
      serveOriginalMotion(
        new URL('http://localhost/ui-motion/original/neon/assets/Fonts/Menu-Black.ttf'),
        response as unknown as ServerResponse
      )
    ).toThrow('参考文件超过大小上限');
    expect(response.writeHead).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
    expect(
      read.mock.calls
        .filter(([filename]) => String(filename).startsWith(root + path.sep))
        .every(([filename]) => String(filename).endsWith('catalog.json'))
    ).toBe(true);
  });
});
