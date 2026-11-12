import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { uiEditorManifest } from '../projectFiles.js';

describe('UI editor design resolution detection', () => {
  test('uses a unique Lua resolution even when project.json is missing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-editor-manifest-'));
    await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'scripts', 'main.lua'),
      'UI.Scale.DESIGN_RESOLUTION(1080, 1920)\n'
    );

    const manifest = await uiEditorManifest({ path: root, key: 'test', name: 'test' });
    expect(manifest.config).toMatchObject({ designWidth: 1080, designHeight: 1920 });
  });

  test('ignores resolutions inside Lua comments and strings', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-editor-manifest-'));
    await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'scripts', 'main.lua'),
      [
        '-- UI.Scale.DESIGN_RESOLUTION(111, 222)',
        'local text = "UI.Scale.DESIGN_RESOLUTION(333, 444)"',
        'UI.Scale.DESIGN_RESOLUTION(1080, 1920)',
        '',
      ].join('\n')
    );

    const manifest = await uiEditorManifest({ path: root, key: 'test', name: 'test' });
    expect(manifest.config).toMatchObject({ designWidth: 1080, designHeight: 1920 });
  });

  test('ignores Lua long strings and long comments', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-editor-manifest-'));
    await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'scripts', 'main.lua'),
      [
        'local text = [[UI.Scale.DESIGN_RESOLUTION(333, 444)]]',
        '--[=[ UI.Scale.DESIGN_RESOLUTION(555, 666) ]=]',
        'UI.Scale.DESIGN_RESOLUTION(1080, 1920)',
        '',
      ].join('\n')
    );

    const manifest = await uiEditorManifest({ path: root, key: 'test', name: 'test' });
    expect(manifest.config).toMatchObject({ designWidth: 1080, designHeight: 1920 });
  });

  test('does not scan a scripts symlink outside the project', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-editor-manifest-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-editor-scripts-'));
    await fs.writeFile(path.join(outside, 'main.lua'), 'UI.Scale.DESIGN_RESOLUTION(1080, 1920)\n');
    await fs.symlink(outside, path.join(root, 'scripts'));

    const manifest = await uiEditorManifest({ path: root, key: 'test', name: 'test' });
    expect(manifest.config).toBeUndefined();
  });
});
