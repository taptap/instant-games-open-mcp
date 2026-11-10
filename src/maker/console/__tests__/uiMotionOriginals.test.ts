import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { bundledOriginalReference, bundledRuntimeReference } from '../uiMotion/bundled.js';
import { upgradeMotionSample } from '../uiMotion/sample.js';
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

  test('returns the registered source and serves small files', async () => {
    expect(getOriginalMotionReference('S01')).toMatchObject({
      example: { id: 'S01', available: true },
      files: expect.arrayContaining([
        {
          path: 'ui-motion-native/index.html',
          url: '/ui-motion/original/neon/ui-motion-native/index.html',
          content: expect.stringContaining('id="loading"'),
        },
      ]),
    });
    const response = { setHeader: jest.fn(), writeHead: jest.fn(), end: jest.fn() };
    await serveOriginalMotion(
      new URL('http://localhost/ui-motion/original/neon/index.html'),
      response as unknown as ServerResponse
    );
    expect(response.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    expect(String(response.end.mock.calls[0][0])).toContain('id="loading"');
  });

  test('delivers the original library, shared integration guide and portable media URLs', () => {
    const reference = bundledRuntimeReference();
    const library = reference.files.find((file) => file.path === reference.library.path)!;
    expect(createHash('sha256').update(library.content).digest('hex')).toBe(
      reference.library.sha256
    );
    for (const name of [
      reference.library.readme,
      reference.library.api,
      reference.library.integration,
    ])
      expect(reference.files.find((file) => file.path === name)?.content).toBeTruthy();
    expect(
      reference.files.find((file) => file.path === reference.library.integration)?.content
    ).toBe(
      fs.readFileSync(
        path.join(process.cwd(), 'skills/taptap-maker-local/references/ui-motion.md'),
        'utf8'
      )
    );
    expect(reference.assets.length).toBeGreaterThan(0);
    expect(
      reference.assets.every((asset) => asset.url.startsWith('https://') && asset.sha256)
    ).toBe(true);
  });

  test('keeps local reference player styles aligned with the bundled loading markup', async () => {
    sparseFile('ui-motion-native/player.css', 0);
    writeCatalog();
    const response = { setHeader: jest.fn(), writeHead: jest.fn(), end: jest.fn() };
    await serveOriginalMotion(
      new URL('http://localhost/ui-motion/original/neon/player.css'),
      response as unknown as ServerResponse
    );
    const css = String(response.end.mock.calls[0][0]);
    expect(css).toContain('.loading-panel');
    const reference = getOriginalMotionReference('S01');
    expect(
      reference?.files.find((file) => file.path === 'ui-motion-native/player.css')?.content
    ).toBe(css);
  });

  test('delivers every original manifest file including native fonts', () => {
    const reference = bundledOriginalReference({ id: 'S04', family: 'clockwork' });
    const delivered = new Set([...reference.files, ...reference.assets].map((file) => file.path));
    for (const file of reference.manifest.files) expect(delivered.has(file.path)).toBe(true);
    expect(reference.assets.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'assets/Fonts/Menu-Black.ttf',
        'assets/Fonts/NotoSerifSC-Regular.ttf',
      ])
    );
    expect(reference.assets.every((file) => file.url.startsWith('https://') && file.sha256)).toBe(
      true
    );
  });

  test.each(['lab', 'showcase'] as const)(
    'upgrades mixed-case script tags with browser-accepted endings in %s samples',
    (variant) => {
      for (const ending of [
        '',
        ' ',
        '\t',
        '\n',
        '\r\n',
        '\f',
        '\t\n bar',
        '/',
        ' data-old="yes"',
      ]) {
        const html =
          `<ScRiPt>const DATA={"lua":"legacy lua"};</sCrIpT${ending}>` +
          `<SCRIPT>legacyPlayer();</SCRIPT${ending}><footer>retained</footer>`;
        const upgraded = upgradeMotionSample(html, variant);
        expect(upgraded).not.toContain('legacyPlayer()');
        if (variant === 'lab') expect(upgraded).not.toContain('legacy lua');
        expect(upgraded).toContain('const DATA=');
        expect(upgraded).toContain('LuaTween');
        expect(upgraded.endsWith('<footer>retained</footer>')).toBe(true);
      }
    }
  );

  test('upgrades local lab loading styles without replacing its font sources', () => {
    const html =
      '<head><style>@font-face{font-family:LabSerif;src:url(local.ttf)}</style></HEAD>' +
      '<script>const DATA={"lua":"legacy"};</script><script>legacyPlayer();</script>';
    const upgraded = upgradeMotionSample(html, 'lab');
    expect(upgraded).toContain('src:url(local.ttf)');
    expect(upgraded).toContain('#lab-loading');
    expect(upgraded).toContain('maker:motion-lab-loading');
    expect(upgraded).not.toContain('__FONT_SERIF__');
    expect(upgraded).not.toContain('__FONT_BOLD__');
  });

  test('delivers the documented skin layouts and generated Lua data', () => {
    const reference = bundledRuntimeReference();
    const designs = JSON.parse(
      reference.files.find((file) => file.path === 'assets/ui/motion-lab-v2/designs.json')!.content
    );
    expect(designs).toHaveLength(7);
    expect(designs.every((skin: { id: string }) => typeof skin.id === 'string')).toBe(true);
    expect(reference.files.some((file) => file.path === 'scripts/MotionLabDesign.lua')).toBe(true);
    expect(
      reference.files.find((file) => file.path === 'assets/ui/motion-lab-v2/README.md')!.content
    ).not.toContain('layout.json');
  });

  test('serves packaged library documentation with and without a local reference override', async () => {
    for (const directory of [root, undefined]) {
      if (directory) process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR = directory;
      else delete process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR;
      const response = { setHeader: jest.fn(), writeHead: jest.fn(), end: jest.fn() };
      await serveOriginalMotion(
        new URL('http://localhost/ui-motion/original/neon/docs/LuaTween-integration.md'),
        response as unknown as ServerResponse
      );
      expect(String(response.end.mock.calls[0][0])).toContain('# LuaTween UI Integration');
    }
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

  test('rejects oversized individual files before sending headers or reading content', async () => {
    sparseFile('assets/Fonts/Menu-Black.ttf', 24 * 1024 * 1024 + 1);
    writeCatalog();
    const read = jest.spyOn(fs, 'readFileSync');
    const response = { setHeader: jest.fn(), writeHead: jest.fn(), end: jest.fn() };
    await expect(
      serveOriginalMotion(
        new URL('http://localhost/ui-motion/original/neon/assets/Fonts/Menu-Black.ttf'),
        response as unknown as ServerResponse
      )
    ).rejects.toThrow('参考文件超过大小上限');
    expect(response.writeHead).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
    expect(
      read.mock.calls
        .filter(([filename]) => String(filename).startsWith(root + path.sep))
        .every(([filename]) => String(filename).endsWith('catalog.json'))
    ).toBe(true);
  });
});
