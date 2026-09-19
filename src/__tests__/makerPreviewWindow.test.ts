import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  previewWindow,
  readPreviewWindowSettings,
  savePreviewWindowSettings,
} from '../maker/preview/windowSettings';

describe('local preview window settings', () => {
  let root: string;
  let project: string;
  let oldHome: string | undefined;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-window-'));
    oldHome = process.env.TAPTAP_MAKER_HOME;
    process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
    project = path.join(root, 'game');
    fs.mkdirSync(path.join(project, '.project'), { recursive: true });
    fs.writeFileSync(path.join(project, '.project/project.json'), '{}');
  });
  afterEach(() => {
    if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
    else process.env.TAPTAP_MAKER_HOME = oldHome;
    fs.rmSync(root, { recursive: true, force: true });
  });
  test('defaults to landscape, follows project direction, and permits overrides both ways', () => {
    expect(previewWindow(project)).toMatchObject({ width: 1920, height: 1080, defaulted: true });
    const config = '{"taptap_publish":{"screen_orientation":"portrait"}}';
    fs.writeFileSync(path.join(project, '.project/project.json'), config);
    expect(previewWindow(project)).toMatchObject({ width: 1080, height: 1920, defaulted: false });
    savePreviewWindowSettings(project, {
      ...readPreviewWindowSettings(project).settings,
      orientation: 'landscape',
      preset: '4:3',
    });
    expect(previewWindow(project)).toMatchObject({
      width: 1024,
      height: 768,
      orientation: 'landscape',
    });
    savePreviewWindowSettings(project, {
      ...readPreviewWindowSettings(project).settings,
      orientation: 'portrait',
      preset: '21:9',
    });
    expect(previewWindow(project)).toMatchObject({
      width: 540,
      height: 1260,
      orientation: 'portrait',
    });
    expect(fs.readFileSync(path.join(project, '.project/project.json'), 'utf8')).toBe(config);
  });
  test('persists custom sizes across preset switches and isolates projects', () => {
    savePreviewWindowSettings(project, {
      orientation: 'portrait',
      preset: 'custom',
      custom: { longEdge: 1366, shortEdge: 1024 },
    });
    expect(previewWindow(project)).toMatchObject({ width: 1024, height: 1366 });
    savePreviewWindowSettings(project, {
      ...readPreviewWindowSettings(project).settings,
      preset: '16:9',
    });
    expect(readPreviewWindowSettings(project).settings.custom).toEqual({
      longEdge: 1366,
      shortEdge: 1024,
    });
    savePreviewWindowSettings(project, {
      ...readPreviewWindowSettings(project).settings,
      preset: 'custom',
      orientation: 'landscape',
    });
    expect(previewWindow(project)).toMatchObject({ width: 1366, height: 1024 });
    expect(previewWindow(path.join(root, 'another-game'))).toMatchObject({
      width: 1920,
      height: 1080,
    });
  });
  test.each([0, -1, 99, 4097, 100.5, '1080', NaN])(
    'rejects invalid custom edge %s without overwriting',
    (value) => {
      const settings = readPreviewWindowSettings(project).settings;
      expect(() =>
        savePreviewWindowSettings(project, {
          ...settings,
          preset: 'custom',
          custom: { longEdge: value, shortEdge: 100 },
        })
      ).toThrow();
      expect(readPreviewWindowSettings(project).settings).toEqual(settings);
    }
  );
});
