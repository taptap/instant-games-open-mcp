import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  formatMakerProjectHealthStatus,
  inspectMakerProjectHealth,
} from '../maker/projectSettings';

describe('Maker project health check', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-project-health-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test('allows an entirely uninitialized project to proceed to first build', () => {
    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('not_initialized');
    expect(health.canBuild).toBe(true);
    expect(health.canGenerateTestQrcode).toBe(false);
    expect(formatMakerProjectHealthStatus(health)).toContain('can_generate_test_qrcode: no');
    expect(health.issues).toEqual([]);
  });

  test('ignores an unrelated dist directory before the first Maker build', () => {
    fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'dist', 'maker.js'), 'bundle');

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('not_initialized');
    expect(health.canBuild).toBe(true);
    expect(health.issues).toEqual([]);
  });

  test('does not block an uninitialized project for an unrelated root project.json', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'project.json'),
      JSON.stringify({ name: 'custom-data' })
    );

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('not_initialized');
    expect(health.canBuild).toBe(true);
    expect(health.issues).toEqual([]);
  });

  test('does not block an uninitialized project for unrelated root settings and resources', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'settings.json'),
      JSON.stringify({ difficulty: 'normal' })
    );
    fs.writeFileSync(path.join(projectRoot, 'resources.json'), JSON.stringify({ levels: ['one'] }));

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('not_initialized');
    expect(health.canBuild).toBe(true);
    expect(health.issues).toEqual([]);
  });

  test('does not treat generic Maker-like field names as moved configurations', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'resources.json'),
      JSON.stringify({ groups: { ui: ['button'] } })
    );
    fs.writeFileSync(
      path.join(projectRoot, 'settings.json'),
      JSON.stringify({ sources: {}, build: {} })
    );
    fs.writeFileSync(
      path.join(projectRoot, 'project.json'),
      JSON.stringify({ project_id: 'local', version: '1.0.0' })
    );

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('not_initialized');
    expect(health.canBuild).toBe(true);
    expect(health.issues).toEqual([]);
  });

  test('detects Maker settings and resources moved to the project root', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'settings.json'),
      JSON.stringify({
        $schema: '../schemas/settings.schema.json',
        sources: {},
        build: {},
      })
    );
    fs.writeFileSync(
      path.join(projectRoot, 'resources.json'),
      JSON.stringify({ $schema: '../schemas/resources.schema.json', groups: {} })
    );

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('misplaced_config');
    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'settings.json', code: 'misplaced_config' }),
        expect.objectContaining({ path: 'resources.json', code: 'misplaced_config' }),
      ])
    );
  });

  test('keeps QR-only errors separate from build capability', () => {
    writeProjectFiles({
      project: {
        ...validProjectJson(),
        project_id: '<project id, auto-generated>',
        taptap_publish: {
          ...validProjectJson().taptap_publish,
          title: '<game title, required>',
        },
      },
      resources: validResourcesJson(),
    });

    const buildHealth = inspectMakerProjectHealth(projectRoot, 'build');
    const qrcodeHealth = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(buildHealth.canBuild).toBe(true);
    expect(qrcodeHealth.canBuild).toBe(true);
    expect(qrcodeHealth.canGenerateTestQrcode).toBe(false);
  });

  test('reports a source-ready project without requiring a local dist directory', () => {
    writeProjectFiles({
      project: validProjectJson(),
      resources: validResourcesJson(),
    });

    const health = inspectMakerProjectHealth(projectRoot, 'status');

    expect(health.status).toBe('warning');
    expect(health.canBuild).toBe(true);
    expect(health.canGenerateTestQrcode).toBe(true);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_settings_json', severity: 'warning' }),
      ])
    );
  });

  test('warns about the remote builder version template without blocking build', () => {
    writeProjectFiles({
      project: { ...validProjectJson(), version: '1.0.{x}' },
      resources: validResourcesJson(),
    });

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.canBuild).toBe(true);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_project_field',
          path: '.project/project.json:version',
          severity: 'warning',
        }),
      ])
    );
  });

  test('blocks QR generation for a remote builder version template', () => {
    writeProjectFiles({
      project: { ...validProjectJson(), version: '1.0.{x}' },
      resources: validResourcesJson(),
    });

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.canGenerateTestQrcode).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_project_field',
          path: '.project/project.json:version',
          severity: 'error',
        }),
      ])
    );
  });

  test('allows a remote-init template project to reach the first build', () => {
    writeProjectFiles({
      project: {
        project_id: '<project id, auto-generated>',
        version: '1.0.0',
        entry: 'main.lua',
        taptap_publish: {
          title: '<game title, required>',
          category: '<game category: strategy>',
          screen_orientation: 'landscape',
        },
      },
      resources: validResourcesJson(),
      settings: validSettingsJson(),
    });

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.canBuild).toBe(true);
    expect(health.canGenerateTestQrcode).toBe(false);
    expect(health.status).toBe('warning');
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '.project/project.json:project_id',
          severity: 'warning',
        }),
        expect.objectContaining({ path: 'taptap_publish.title', severity: 'warning' }),
        expect.objectContaining({ path: 'taptap_publish.category', severity: 'warning' }),
      ])
    );
    expect(formatMakerProjectHealthStatus(health)).toContain('can_generate_test_qrcode: no');
  });

  test('warns when publish configuration is missing without blocking build', () => {
    const project = validProjectJson();
    delete project.taptap_publish;
    writeProjectFiles({ project, resources: validResourcesJson() });

    const health = inspectMakerProjectHealth(projectRoot, 'status');

    expect(health.canBuild).toBe(true);
    expect(health.canGenerateTestQrcode).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_publish_field',
          path: 'taptap_publish',
          severity: 'warning',
        }),
      ])
    );
  });

  test('detects root-level configuration that was moved out of .project', () => {
    fs.writeFileSync(path.join(projectRoot, 'project.json'), JSON.stringify(validProjectJson()));

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('misplaced_config');
    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'misplaced_config',
          path: 'project.json',
          expectedPath: '.project/project.json',
          severity: 'error',
        }),
      ])
    );
  });

  test('detects a known assets/project.json publish config in the wrong location', () => {
    fs.mkdirSync(path.join(projectRoot, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'assets', 'project.json'),
      JSON.stringify({ taptap_publish: { title: '测试项目' } })
    );

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.status).toBe('misplaced_config');
    expect(health.canGenerateTestQrcode).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'misplaced_config',
          path: 'assets/project.json',
          expectedPath: '.project/project.json',
        }),
      ])
    );
  });

  test('blocks a built project when required resources.json is deleted', () => {
    writeProjectFiles({ project: validProjectJson() });

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('error');
    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_required_file',
          path: '.project/resources.json',
          severity: 'error',
        }),
      ])
    );
  });

  test('blocks a built project when project.json is deleted', () => {
    writeProjectFiles({
      resources: validResourcesJson(),
      settings: validSettingsJson(),
    });

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('error');
    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_required_file',
          path: '.project/project.json',
          severity: 'error',
        }),
      ])
    );
  });

  test('reports both required project files when both are missing', () => {
    fs.mkdirSync(path.join(projectRoot, '.project'), { recursive: true });

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_required_file',
          path: '.project/project.json',
        }),
        expect.objectContaining({
          code: 'missing_required_file',
          path: '.project/resources.json',
        }),
      ])
    );
  });

  test('reports a canonical JSON path changed into a directory', () => {
    fs.mkdirSync(path.join(projectRoot, '.project', 'project.json'), { recursive: true });

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('error');
    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_path_type',
          path: '.project/project.json',
          severity: 'error',
        }),
      ])
    );
  });

  test('does not call a settings directory missing when reporting its path type', () => {
    writeProjectFiles({
      project: validProjectJson(),
      resources: validResourcesJson(),
    });
    fs.mkdirSync(path.join(projectRoot, '.project', 'settings.json'));

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.issues).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          code: 'missing_settings_json',
          path: '.project/settings.json',
        }),
      ])
    );
  });

  test('rejects canonical config symlinks instead of reading outside the project', () => {
    const projectDir = path.join(projectRoot, '.project');
    fs.mkdirSync(projectDir, { recursive: true });
    const externalProject = path.join(projectRoot, 'external-project.json');
    fs.writeFileSync(externalProject, JSON.stringify(validProjectJson()));
    fs.symlinkSync(externalProject, path.join(projectDir, 'project.json'));
    fs.writeFileSync(path.join(projectDir, 'resources.json'), JSON.stringify(validResourcesJson()));

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_path_type',
          path: '.project/project.json',
          severity: 'error',
        }),
      ])
    );
    expect(health.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_project_field',
          path: '.project/project.json:project_id',
        }),
      ])
    );
  });

  test('reports moved root config when the canonical path is a symlink', () => {
    const projectDir = path.join(projectRoot, '.project');
    fs.mkdirSync(projectDir, { recursive: true });
    const externalProject = path.join(projectRoot, 'external-project.json');
    fs.writeFileSync(externalProject, JSON.stringify(validProjectJson()));
    fs.symlinkSync(externalProject, path.join(projectDir, 'project.json'));
    fs.writeFileSync(path.join(projectRoot, 'project.json'), JSON.stringify(validProjectJson()));
    fs.writeFileSync(path.join(projectDir, 'resources.json'), JSON.stringify(validResourcesJson()));

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_path_type',
          path: '.project/project.json',
        }),
        expect.objectContaining({
          code: 'misplaced_config',
          path: 'project.json',
          expectedPath: '.project/project.json',
        }),
      ])
    );
  });

  test('does not treat a dangling .project symlink as an uninitialized project', () => {
    fs.symlinkSync(
      path.join(projectRoot, 'missing-project-dir'),
      path.join(projectRoot, '.project')
    );

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.status).toBe('error');
    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_path_type',
          path: '.project',
          severity: 'error',
        }),
      ])
    );
  });

  test('rejects project.json when its top-level value is not an object', () => {
    const projectDir = path.join(projectRoot, '.project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'project.json'), '[]');
    fs.writeFileSync(path.join(projectDir, 'resources.json'), JSON.stringify(validResourcesJson()));

    const health = inspectMakerProjectHealth(projectRoot, 'build');

    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_project_json',
          path: '.project/project.json',
          severity: 'error',
        }),
      ])
    );
  });

  test('blocks QR generation for invalid JSON or placeholder publish metadata', () => {
    writeProjectFiles({
      project: {
        ...validProjectJson(),
        taptap_publish: {
          title: '<game title, required>',
          category: '<game category>',
          screen_orientation: 'diagonal',
        },
      },
      resources: validResourcesJson(),
    });
    fs.writeFileSync(path.join(projectRoot, '.project', 'settings.json'), '{bad json');

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.status).toBe('error');
    expect(health.canGenerateTestQrcode).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_publish_field', path: 'taptap_publish.title' }),
        expect.objectContaining({ code: 'invalid_publish_field', path: 'taptap_publish.category' }),
        expect.objectContaining({
          code: 'invalid_publish_field',
          path: 'taptap_publish.screen_orientation',
        }),
      ])
    );
  });

  test('returns a ready QR state when source configs are valid', () => {
    const project = validProjectJson();
    writeProjectFiles({ project, resources: validResourcesJson() });

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.status).toBe('ready');
    expect(health.canBuild).toBe(true);
    expect(health.canGenerateTestQrcode).toBe(true);
    expect(health.issues).toEqual([]);
  });

  test('accepts a game title containing non-placeholder braces', () => {
    const project = validProjectJson();
    project.taptap_publish = {
      ...(project.taptap_publish as Record<string, unknown>),
      title: '勇者{重生}',
    };
    writeProjectFiles({ project, resources: validResourcesJson() });

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.canGenerateTestQrcode).toBe(true);
    expect(health.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_publish_field',
          path: 'taptap_publish.title',
        }),
      ])
    );
  });

  test('accepts a non-empty category outside the local historical list', () => {
    const project = validProjectJson();
    project.taptap_publish = {
      ...(project.taptap_publish as Record<string, unknown>),
      category: 'future-category',
    };
    writeProjectFiles({ project, resources: validResourcesJson() });

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.canGenerateTestQrcode).toBe(true);
    expect(health.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_publish_field',
          path: 'taptap_publish.category',
        }),
      ])
    );
  });

  test('blocks QR generation when project identity still uses placeholders', () => {
    writeProjectFiles({
      project: {
        ...validProjectJson(),
        project_id: '<project id, auto-generated>',
        version: '<version, auto-generated>',
      },
      resources: validResourcesJson(),
    });

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.canGenerateTestQrcode).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_project_field',
          path: '.project/project.json:project_id',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'invalid_project_field',
          path: '.project/project.json:version',
          severity: 'error',
        }),
      ])
    );
  });

  test('blocks QR generation when entry or title still uses placeholders', () => {
    writeProjectFiles({
      project: {
        ...validProjectJson(),
        entry: '<entry, auto-generated>',
        taptap_publish: {
          ...validProjectJson().taptap_publish,
          title: '{game title}',
        },
      },
      resources: validResourcesJson(),
    });

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.canGenerateTestQrcode).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_project_field',
          path: '.project/project.json:entry',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'invalid_publish_field',
          path: 'taptap_publish.title',
          severity: 'error',
        }),
      ])
    );
  });

  test('does not let settings-only errors block QR generation', () => {
    writeProjectFiles({
      project: validProjectJson(),
      resources: validResourcesJson(),
    });
    fs.writeFileSync(path.join(projectRoot, '.project', 'settings.json'), '{bad json');

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.canGenerateTestQrcode).toBe(true);
    expect(health.canBuild).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_settings_json',
          path: '.project/settings.json',
          severity: 'error',
        }),
      ])
    );
  });

  test('accepts an entry supplied by resources.json', () => {
    const project = validProjectJson();
    delete project.entry;
    writeProjectFiles({
      project,
      resources: { ...validResourcesJson(), entry: 'main.lua' },
    });

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.canGenerateTestQrcode).toBe(true);
  });

  test('blocks QR generation when required resources.json is missing', () => {
    writeProjectFiles({ project: validProjectJson() });

    const health = inspectMakerProjectHealth(projectRoot, 'qrcode');

    expect(health.canGenerateTestQrcode).toBe(false);
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_required_file',
          path: '.project/resources.json',
          severity: 'error',
        }),
      ])
    );
  });

  function writeProjectFiles(files: {
    project?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    settings?: Record<string, unknown>;
  }): void {
    const projectDir = path.join(projectRoot, '.project');
    fs.mkdirSync(projectDir, { recursive: true });
    if (files.project) {
      fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(files.project));
    }
    if (files.resources) {
      fs.writeFileSync(path.join(projectDir, 'resources.json'), JSON.stringify(files.resources));
    }
    if (files.settings) {
      fs.writeFileSync(path.join(projectDir, 'settings.json'), JSON.stringify(files.settings));
    }
  }

  function validProjectJson(): Record<string, unknown> {
    return {
      project_id: 'p_test',
      version: '1.0.0',
      entry: 'main.lua',
      taptap_publish: {
        title: '测试项目',
        category: 'strategy',
        screen_orientation: 'landscape',
      },
    };
  }

  function validResourcesJson(): Record<string, unknown> {
    return { groups: { default: ['**'] } };
  }

  function validSettingsJson(): Record<string, unknown> {
    return {
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
    };
  }
});
