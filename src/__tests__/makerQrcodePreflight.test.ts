import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  inspectMakerQrcodePreflight,
  inspectMakerQrcodePreparation,
} from '../maker/qrcodePreflight';

describe('Maker QR code orientation preflight', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-qrcode-preflight-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test('reports missing project configuration without creating it', () => {
    const result = inspectMakerQrcodePreflight(projectRoot, 'portrait', {
      title: '拼豆',
      category: 'puzzle',
    });
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('Restore or initialize .project/project.json'),
    });
    expect(fs.existsSync(path.join(projectRoot, '.project'))).toBe(false);
  });

  test('reports explicit initialization without creating missing configuration', () => {
    expect(inspectMakerQrcodePreparation(projectRoot)).toMatchObject({
      status: 'needs_initialization',
      action: 'build',
    });
    expect(fs.readdirSync(projectRoot)).toEqual([]);
  });

  test.each(['invalid-json', 'misplaced', 'invalid-publish'])(
    'blocks broken config without offering initialization: %s',
    (mode) => {
      writeProjectConfig(projectRoot);
      const filename = path.join(projectRoot, '.project/project.json');
      if (mode === 'invalid-json') fs.writeFileSync(filename, '{invalid');
      if (mode === 'misplaced') {
        const config = {
          ...readProjectConfig(projectRoot),
          project_id: 'app-1',
          version: '1.0.0',
          entry: 'scripts/main.lua',
        };
        fs.rmSync(filename);
        fs.writeFileSync(path.join(projectRoot, 'project.json'), JSON.stringify(config));
      }
      if (mode === 'invalid-publish')
        fs.writeFileSync(filename, JSON.stringify({ taptap_publish: [] }));
      expect(inspectMakerQrcodePreparation(projectRoot)).toMatchObject({ status: 'blocked' });
    }
  );

  test('allows missing editable fields once primary configuration is ready', () => {
    fs.mkdirSync(path.join(projectRoot, '.project'));
    fs.writeFileSync(
      path.join(projectRoot, '.project/project.json'),
      JSON.stringify({
        project_id: 'app-1',
        version: '1.0.0',
        entry: 'scripts/main.lua',
        taptap_publish: {},
      })
    );
    fs.writeFileSync(path.join(projectRoot, '.project/resources.json'), '{}');
    fs.writeFileSync(
      path.join(projectRoot, '.project/settings.json'),
      JSON.stringify({
        $schema: '../schemas/settings.schema.json',
        sources: {
          engine: { tag: 'stable' },
          'engine-res': { tag: 'stable' },
          'official-res': { tag: 'stable' },
        },
        build: {
          generate_fs_path: true,
          output_dir: '../dist',
          asset_dirs: ['../assets', '../scripts'],
          asset_ignores: [],
        },
      })
    );
    expect(inspectMakerQrcodePreparation(projectRoot)).toEqual({ status: 'ready' });
    fs.rmSync(path.join(projectRoot, '.project/settings.json'));
    expect(inspectMakerQrcodePreparation(projectRoot)).toMatchObject({
      status: 'needs_initialization',
    });
  });

  test('saves a confirmed developer while preserving all other project fields', () => {
    writeProjectConfig(projectRoot, 'portrait');
    const before = readProjectConfig(projectRoot);
    expect(inspectMakerQrcodePreflight(projectRoot, undefined, { developer_id: 123 }).ok).toBe(
      true
    );
    expect(readProjectConfig(projectRoot)).toEqual({
      ...before,
      taptap_publish: { ...before.taptap_publish, developer_id: 123 },
    });
    expect(inspectMakerQrcodePreflight(projectRoot, undefined, { developer_id: 123 }).ok).toBe(
      true
    );
    const saved = readProjectConfig(projectRoot);
    expect(inspectMakerQrcodePreflight(projectRoot, undefined, { developer_id: 456 }).ok).toBe(
      false
    );
    expect(readProjectConfig(projectRoot)).toEqual(saved);
  });

  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, '123'])(
    'rejects an invalid developer before modifying files: %s',
    (developer_id) => {
      writeProjectConfig(projectRoot, 'portrait');
      const before = readProjectConfig(projectRoot);
      expect(
        inspectMakerQrcodePreflight(projectRoot, undefined, { developer_id } as never).ok
      ).toBe(false);
      expect(readProjectConfig(projectRoot)).toEqual(before);
    }
  );

  test('uses the configured orientation without asking the user again', () => {
    writeProjectConfig(projectRoot, 'portrait');

    const result = inspectMakerQrcodePreflight(projectRoot, undefined);

    expect(result).toEqual({ ok: true, orientation: 'portrait' });
  });

  test('saves explicit missing publication fields without changing existing orientation', () => {
    writeProjectConfig(projectRoot, 'landscape');
    const config = readProjectConfig(projectRoot);
    config.taptap_publish.title = '';
    config.taptap_publish.category = '';
    fs.writeFileSync(path.join(projectRoot, '.project/project.json'), JSON.stringify(config));
    expect(
      inspectMakerQrcodePreflight(projectRoot, 'portrait', {
        title: '拼豆',
        category: 'puzzle',
      })
    ).toEqual({ ok: true, orientation: 'landscape' });
    expect(readProjectConfig(projectRoot).taptap_publish).toMatchObject({
      title: '拼豆',
      category: 'puzzle',
      screen_orientation: 'landscape',
    });
  });

  test('preserves valid publication fields despite stale confirmation values', () => {
    writeProjectConfig(projectRoot, 'portrait');
    expect(
      inspectMakerQrcodePreflight(projectRoot, undefined, {
        title: 'Replacement',
        category: 'puzzle',
      }).ok
    ).toBe(true);
    expect(readProjectConfig(projectRoot).taptap_publish).toMatchObject({
      title: 'Test game',
      category: 'casual',
    });
  });

  test('rejects invalid confirmed genre before changing any config', () => {
    writeProjectConfig(projectRoot);
    const original = readProjectConfig(projectRoot);
    expect(
      inspectMakerQrcodePreflight(projectRoot, 'portrait', {
        title: 'Game',
        category: 'sce',
      }).ok
    ).toBe(false);
    expect(readProjectConfig(projectRoot)).toEqual(original);
  });

  test('asks for orientation only when project orientation is missing', () => {
    writeProjectConfig(projectRoot);

    const result = inspectMakerQrcodePreflight(projectRoot, undefined);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('separate conversation turn');
    expect(result.message).toContain('landscape');
    expect(result.message).toContain('portrait');
  });

  test('stores the user choice when project orientation is missing', () => {
    writeProjectConfig(projectRoot);

    expect(inspectMakerQrcodePreflight(projectRoot, 'portrait')).toEqual({
      ok: true,
      orientation: 'portrait',
    });
    expect(readProjectConfig(projectRoot).taptap_publish).toMatchObject({
      screen_orientation: 'portrait',
    });
  });

  test('keeps the configured orientation when a later confirmation conflicts', () => {
    writeProjectConfig(projectRoot, 'landscape');

    const result = inspectMakerQrcodePreflight(projectRoot, 'portrait');

    expect(result).toEqual({
      ok: true,
      orientation: 'landscape',
    });
    expect(readProjectConfig(projectRoot).taptap_publish).toMatchObject({
      screen_orientation: 'landscape',
    });
  });

  test('keeps the original project config when atomic replacement fails', () => {
    writeProjectConfig(projectRoot);
    const projectJsonPath = path.join(projectRoot, '.project', 'project.json');
    const originalConfig = fs.readFileSync(projectJsonPath, 'utf8');
    const originalRename = fs.renameSync;
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(destination) === projectJsonPath) {
        throw new Error('forced project config rename failure');
      }
      return originalRename(source, destination);
    });

    try {
      const result = inspectMakerQrcodePreflight(projectRoot, 'portrait');

      expect(result.ok).toBe(false);
      expect(result.message).toContain('forced project config rename failure');
      expect(fs.readFileSync(projectJsonPath, 'utf8')).toBe(originalConfig);
      expect(fs.readdirSync(path.dirname(projectJsonPath))).toEqual(['project.json']);
    } finally {
      rename.mockRestore();
    }
  });

  test('does not overwrite project config changed during orientation persistence', () => {
    writeProjectConfig(projectRoot);
    const projectJsonPath = path.join(projectRoot, '.project', 'project.json');
    const originalWrite = fs.writeFileSync;
    const externalConfig = {
      ...readProjectConfig(projectRoot),
      version: 'changed-by-another-process',
    };
    const write = jest.spyOn(fs, 'writeFileSync').mockImplementation((filePath, data, options) => {
      const result = originalWrite(filePath, data, options);
      if (String(filePath) !== projectJsonPath && String(filePath).endsWith('.tmp')) {
        originalWrite(projectJsonPath, JSON.stringify(externalConfig), 'utf8');
      }
      return result;
    });

    try {
      const result = inspectMakerQrcodePreflight(projectRoot, 'portrait');

      expect(result.ok).toBe(false);
      expect(result.message).toContain('changed while saving');
      expect(readProjectConfig(projectRoot)).toEqual(externalConfig);
      expect(fs.readdirSync(path.dirname(projectJsonPath))).toEqual(['project.json']);
    } finally {
      write.mockRestore();
    }
  });
});

function writeProjectConfig(projectRoot: string, screenOrientation?: string): void {
  const projectDir = path.join(projectRoot, '.project');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'project.json'),
    JSON.stringify({
      project_id: 'p_test',
      taptap_publish: {
        title: 'Test game',
        category: 'casual',
        ...(screenOrientation ? { screen_orientation: screenOrientation } : {}),
      },
    })
  );
}

function readProjectConfig(projectRoot: string): Record<string, any> {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, '.project', 'project.json'), 'utf8')
  ) as Record<string, any>;
}
