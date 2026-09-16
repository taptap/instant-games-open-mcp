import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensurePreviewRuntimeResources } from '../maker/preview/runtimeResources.js';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-runtime-resources-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function runtimeExecutable(platform: NodeJS.Platform): string {
  const executable = path.join(root, platform === 'win32' ? 'UrhoXRuntime.exe' : 'UrhoXRuntime');
  fs.writeFileSync(executable, 'runtime');
  return executable;
}

test.each(['darwin', 'win32'] as const)(
  '%s preparation creates Runtime resource directories and installs the fallback font',
  (platform) => {
    const executable = runtimeExecutable(platform);
    const sourceFont = path.join(root, 'system-font.ttf');
    fs.writeFileSync(sourceFont, 'font-data');

    const result = ensurePreviewRuntimeResources(executable, {
      platform,
      fontCandidates: [path.join(root, 'missing.ttf'), sourceFont],
    });

    expect(result).toMatchObject({
      fallbackFont: 'copied',
      fallbackFontSource: sourceFont,
      warnings: [],
    });
    expect(fs.readFileSync(path.join(root, 'Data', 'Fonts', 'MiSans-Regular.ttf'), 'utf8')).toBe(
      'font-data'
    );
    for (const directory of ['Data/LuaScripts', 'Data/Fonts', 'CoreData']) {
      expect(fs.statSync(path.join(root, ...directory.split('/'))).isDirectory()).toBe(true);
    }
  }
);

test('preparation preserves an existing fallback font', () => {
  const executable = runtimeExecutable('darwin');
  const fonts = path.join(root, 'Data', 'Fonts');
  fs.mkdirSync(fonts, { recursive: true });
  fs.writeFileSync(path.join(fonts, 'MiSans-Regular.ttf'), 'existing-font');
  const sourceFont = path.join(root, 'system-font.ttf');
  fs.writeFileSync(sourceFont, 'replacement-font');

  const result = ensurePreviewRuntimeResources(executable, {
    platform: 'darwin',
    fontCandidates: [sourceFont],
  });

  expect(result.fallbackFont).toBe('existing');
  expect(result.fallbackFontSource).toBeUndefined();
  expect(fs.readFileSync(path.join(fonts, 'MiSans-Regular.ttf'), 'utf8')).toBe('existing-font');
});

test('preparation keeps Runtime usable and reports when no fallback font is available', () => {
  const executable = runtimeExecutable('win32');

  const result = ensurePreviewRuntimeResources(executable, {
    platform: 'win32',
    fontCandidates: [path.join(root, 'missing.ttf')],
  });

  expect(result.fallbackFont).toBe('missing');
  expect(result.warnings).toEqual([expect.stringContaining('Chinese fallback font was not found')]);
  expect(fs.existsSync(path.join(root, 'Data', 'Fonts', 'MiSans-Regular.ttf'))).toBe(false);
  expect(fs.statSync(path.join(root, 'CoreData')).isDirectory()).toBe(true);
});

test('repeated preparation shares one Runtime fallback without project-specific copies', () => {
  const executable = runtimeExecutable('darwin');
  const firstFont = path.join(root, 'first-project-font.ttf');
  const secondFont = path.join(root, 'second-project-font.ttf');
  fs.writeFileSync(firstFont, 'first');
  fs.writeFileSync(secondFont, 'second');

  expect(
    ensurePreviewRuntimeResources(executable, {
      platform: 'darwin',
      fontCandidates: [firstFont],
    }).fallbackFont
  ).toBe('copied');
  expect(
    ensurePreviewRuntimeResources(executable, {
      platform: 'darwin',
      fontCandidates: [secondFont],
    }).fallbackFont
  ).toBe('existing');
  expect(fs.readFileSync(path.join(root, 'Data', 'Fonts', 'MiSans-Regular.ttf'), 'utf8')).toBe(
    'first'
  );
});
