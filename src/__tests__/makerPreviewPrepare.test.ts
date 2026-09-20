import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { checkMakerPythonEnvironment } from '../maker/system/python.js';
import {
  validatePreparedPreview,
  requireManifestPreviewPlatform,
  materializePreviewBuilder,
  preparePreviewProject,
  previewPreparationDirectory,
} from '../maker/preview/prepare.js';
import { previewDirectory } from '../maker/preview/protocol.js';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
jest.mock('../maker/system/python.js', () => ({
  checkMakerPythonEnvironment: jest.fn(),
  setupMakerPythonEnvironment: jest.fn(),
}));

let root: string;
let home: string | undefined;
beforeEach(() => {
  jest.resetAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-prepare-test-'));
  home = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = root;
});
afterEach(() => {
  if (home === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = home;
  fs.rmSync(root, { recursive: true, force: true });
});
function manifest(): Record<string, any> {
  fs.mkdirSync(path.join(root, 'dist', '1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist', 'assets'));
  fs.mkdirSync(path.join(root, '.build', 'manifest_cache'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'dist', 'latest.json'),
    JSON.stringify({ version: '1', client: 'abcd' })
  );
  fs.writeFileSync(path.join(root, 'dist', 'assets', 'uuid-hash.lua'), 'abc');
  fs.writeFileSync(path.join(root, '.build', 'manifest_cache', 'engine-res-abcd.json'), '{}');
  return {
    target: 'client',
    entry: 'main.lua',
    sources: { 'engine-res': { base_url: 'https://example.test/resources/' } },
    files: [{ uuid: 'uuid', hash: 'hash', ext: '.lua', size: 3 }],
  };
}
function write(value: Record<string, any>): void {
  fs.writeFileSync(path.join(root, 'dist', '1', 'manifest-abcd.json'), JSON.stringify(value));
}

test('validates local assets and keeps CDN source information', () => {
  write(manifest());
  expect(validatePreparedPreview(root)).toMatchObject({
    entry: 'main.lua',
    project_files: 1,
    public_sources: ['engine-res'],
  });
});
test('missing project asset fails rather than launching an incomplete build', () => {
  write(manifest());
  fs.unlinkSync(path.join(root, 'dist', 'assets', 'uuid-hash.lua'));
  expect(() => validatePreparedPreview(root)).toThrow();
});
test('asset size mismatch is rejected', () => {
  const value = manifest();
  value.files[0].size = 8;
  write(value);
  expect(() => validatePreparedPreview(root)).toThrow('size mismatch');
});
test('public source index download is required', () => {
  write(manifest());
  fs.unlinkSync(path.join(root, '.build', 'manifest_cache', 'engine-res-abcd.json'));
  expect(() => validatePreparedPreview(root)).toThrow('index was not downloaded');
});
test('manifest traversal is rejected', () => {
  write(manifest());
  fs.writeFileSync(
    path.join(root, 'dist', 'latest.json'),
    JSON.stringify({ version: '../../escape', client: 'abcd' })
  );
  expect(() => validatePreparedPreview(root)).toThrow('escapes');
});
test('source needs CDN address and target must be client', () => {
  const value = manifest();
  value.sources['engine-res'].base_url = 'file:///private';
  write(value);
  expect(() => validatePreparedPreview(root)).toThrow('HTTPS');
  value.target = 'server';
  write(value);
  expect(() => validatePreparedPreview(root)).toThrow('client');
});
test('desktop preview supports macOS and Windows, but not unknown platforms', () => {
  expect(() => requireManifestPreviewPlatform('darwin')).not.toThrow();
  expect(() => requireManifestPreviewPlatform('linux')).toThrow(
    'PUBLIC_PREVIEW_PLATFORM_UNSUPPORTED'
  );
  expect(() => requireManifestPreviewPlatform('win32')).not.toThrow();
});
test('builder is self contained, reused and excludes publisher and public assets', () => {
  const builder = materializePreviewBuilder();
  expect(fs.existsSync(builder)).toBe(true);
  expect(materializePreviewBuilder()).toBe(builder);
  expect(fs.existsSync(path.join(path.dirname(builder), 'project_uploader.py'))).toBe(false);
  expect(fs.existsSync(path.join(path.dirname(builder), 'engine-res-project'))).toBe(false);
  expect(
    fs.existsSync(path.join(path.dirname(builder), 'build_steps', 'step_load_remote_sources.py'))
  ).toBe(true);
});
test('cancelled preparation stops before Python or project writes', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(
    preparePreviewProject(root, path.join(root, 'output'), abort.signal)
  ).rejects.toThrow('CANCELLED');
  expect(fs.existsSync(path.join(root, 'output'))).toBe(false);
});

test('prepares missing config only in the managed copy with official source defaults', async () => {
  const project = path.join(root, 'new-game');
  fs.mkdirSync(path.join(project, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(project, '.maker-mcp'));
  fs.writeFileSync(path.join(project, 'scripts/main.lua'), 'print("hello")');
  fs.writeFileSync(path.join(project, '.maker-mcp/config.json'), '{"project_id":"bound-game"}');
  jest.mocked(checkMakerPythonEnvironment).mockReturnValue({
    ready: true,
    python: '/python',
  } as ReturnType<typeof checkMakerPythonEnvironment>);
  jest.mocked(execFile).mockImplementation((...args: unknown[]) => {
    (args[args.length - 1] as (error: Error) => void)(new Error('fixture builder reached'));
    return {} as ReturnType<typeof execFile>;
  });
  await expect(preparePreviewProject(project, path.join(root, 'output'))).rejects.toThrow(
    'fixture builder reached'
  );
  const copy = path.join(root, 'output/source/.project');
  const read = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(copy, name + '.json'), 'utf8'));
  expect(read('project')).toMatchObject({
    project_id: 'bound-game',
    entry: 'main.lua',
    version: '1.0.0',
  });
  expect(read('resources')).toMatchObject({ groups: { default: ['**'] } });
  expect(read('settings')).toMatchObject({
    sources: {
      engine: { tag: 'stable' },
      'engine-res': { tag: 'stable' },
      'official-res': { tag: 'stable' },
    },
    build: { asset_dirs: ['../assets', '../scripts'] },
  });
  expect(fs.existsSync(path.join(project, '.project'))).toBe(false);
});

test.each([
  '/tmp/outside',
  '../../outside',
  '..\\outside',
  'C:\\outside',
  'C:outside',
  '\\\\host\\share',
  '.',
  '..',
  '1.0.',
  'CON',
  'nul.json',
  '',
  null,
  1,
])('rejects unsafe project version %p before running the builder', async (version) => {
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(path.join(project, '.project', 'project.json'), JSON.stringify({ version }));
  jest
    .mocked(checkMakerPythonEnvironment)
    .mockReturnValue({ ready: true, python: '/python' } as ReturnType<
      typeof checkMakerPythonEnvironment
    >);
  jest.mocked(execFile).mockImplementation((...args: unknown[]) => {
    (args[args.length - 1] as (error: Error) => void)(new Error('builder should not run'));
    return {} as ReturnType<typeof execFile>;
  });
  await expect(preparePreviewProject(project, path.join(root, 'output'))).rejects.toThrow(
    'Unsafe project version'
  );
  expect(execFile).not.toHaveBeenCalled();
});

test.each(['1', '1.2.3', '1.0.{x}', '0.{x}.{x}', '1.2.3-beta.1+build', 'dev'])(
  'preserves safe version %s and lets the builder resolve it',
  async (version) => {
    const project = path.join(root, 'project');
    fs.mkdirSync(path.join(project, '.project'), { recursive: true });
    fs.writeFileSync(path.join(project, '.project', 'project.json'), JSON.stringify({ version }));
    jest
      .mocked(checkMakerPythonEnvironment)
      .mockReturnValue({ ready: true, python: '/python' } as ReturnType<
        typeof checkMakerPythonEnvironment
      >);
    jest.mocked(execFile).mockImplementation((...args: unknown[]) => {
      (args[args.length - 1] as (error: Error) => void)(new Error('fixture builder reached'));
      return {} as ReturnType<typeof execFile>;
    });
    await expect(preparePreviewProject(project, path.join(root, 'output'))).rejects.toThrow(
      'fixture builder reached'
    );
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(fs.readFileSync(path.join(root, 'output/source/.project/project.json'), 'utf8'))
        .version
    ).toBe(version);
  }
);

test.each([undefined, '../../outside'])(
  'requires standard project.json rather than falling back to JSONC (%p)',
  async (version) => {
    const project = path.join(root, 'project');
    fs.mkdirSync(path.join(project, '.project'), { recursive: true });
    fs.writeFileSync(path.join(project, '.project', 'project.jsonc'), JSON.stringify({ version }));
    jest
      .mocked(checkMakerPythonEnvironment)
      .mockReturnValue({ ready: true, python: '/python' } as ReturnType<
        typeof checkMakerPythonEnvironment
      >);
    jest.mocked(execFile).mockImplementation((...args: unknown[]) => {
      (args[args.length - 1] as (error: Error) => void)(new Error('builder must not run'));
      return {} as ReturnType<typeof execFile>;
    });
    await expect(preparePreviewProject(project, path.join(root, 'output'))).rejects.toThrow(
      'requires .project/project.json'
    );
    expect(execFile).not.toHaveBeenCalled();
  }
);

test('builder failure retains diagnostics and never uses old project dist', async () => {
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.mkdirSync(path.join(project, 'scripts'));
  fs.mkdirSync(path.join(project, 'dist'));
  fs.writeFileSync(path.join(project, '.project', 'settings.json'), '{}');
  fs.writeFileSync(path.join(project, '.project', 'project.json'), '{}');
  fs.writeFileSync(path.join(project, 'dist', 'latest.json'), 'old');
  jest
    .mocked(checkMakerPythonEnvironment)
    .mockReturnValue({ ready: true, python: '/python' } as ReturnType<
      typeof checkMakerPythonEnvironment
    >);
  jest.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      error: Error,
      stdout: string,
      stderr: string
    ) => void;
    callback(
      Object.assign(new Error('network unavailable'), { stderr: 'source download failed' }),
      '',
      'source download failed'
    );
    return {} as ReturnType<typeof execFile>;
  });
  const output = path.join(root, 'output');
  await expect(preparePreviewProject(project, output)).rejects.toThrow('no Runtime was started');
  expect(fs.readFileSync(path.join(output, 'prepare.log'), 'utf8')).toContain(
    'source download failed'
  );
  expect(fs.existsSync(path.join(output, 'source', 'dist'))).toBe(false);
  expect(fs.readFileSync(path.join(project, 'dist', 'latest.json'), 'utf8')).toBe('old');
  const args = jest.mocked(execFile).mock.calls[0][1];
  expect(args).toEqual(
    expect.arrayContaining(['--force-enhanced-refs', '--no-7z', '--no-compress'])
  );
});

test('exit zero without a complete manifest still fails', async () => {
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(path.join(project, '.project', 'settings.json'), '{}');
  fs.writeFileSync(path.join(project, '.project', 'project.json'), '{}');
  jest
    .mocked(checkMakerPythonEnvironment)
    .mockReturnValue({ ready: true, python: '/python' } as ReturnType<
      typeof checkMakerPythonEnvironment
    >);
  jest.mocked(execFile).mockImplementation((...args: unknown[]) => {
    (args[args.length - 1] as (error: null, stdout: string, stderr: string) => void)(
      null,
      'done',
      ''
    );
    return {} as ReturnType<typeof execFile>;
  });
  await expect(preparePreviewProject(project, path.join(root, 'output'))).rejects.toThrow(
    'Local prepare failed'
  );
});

test('repeated failed standalone preparations retain only the latest three managed copies', async () => {
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(path.join(project, '.project', 'project.json'), '{"version":"../unsafe"}');
  let last = '';
  for (let i = 0; i < 6; i++) {
    last = previewPreparationDirectory(project);
    await expect(preparePreviewProject(project, last)).rejects.toThrow('Unsafe project version');
  }
  const retained = fs.readdirSync(path.join(previewDirectory(project), 'preparations'));
  expect(retained).toHaveLength(3);
  expect(retained).toContain(path.basename(last));
});

test.each(['valid', 'missing-asset', 'nonzero-exit', 'stderr-error'])(
  'duplicate-reference diagnostic handling preserves preparation safety: %s',
  async (mode) => {
    const project = path.join(root, 'project');
    const output = path.join(root, 'output');
    fs.mkdirSync(path.join(project, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(project, 'scripts/main.lua'), 'abc');
    jest.mocked(checkMakerPythonEnvironment).mockReturnValue({
      ready: true,
      python: '/python',
    } as ReturnType<typeof checkMakerPythonEnvironment>);
    jest.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const source = path.join(output, 'source');
      const cache = path.join(source, '.build/manifest_cache');
      fs.mkdirSync(cache, { recursive: true });
      fs.mkdirSync(path.join(source, 'dist/1'), { recursive: true });
      fs.mkdirSync(path.join(source, 'dist/assets'));
      fs.writeFileSync(path.join(source, 'dist/latest.json'), '{"version":"1","client":"abcd"}');
      fs.writeFileSync(
        path.join(cache, 'engine-res-aa.json'),
        JSON.stringify({
          files: [
            { uuid: 'plane', hash: 'ab', size: 336, ext: '.mdl', fs_path: 'Models/Plane.mdl' },
          ],
        })
      );
      fs.writeFileSync(
        path.join(cache, 'official-res-bb.json'),
        JSON.stringify({
          files: [
            { uuid: 'plane', source: 'engine-res', ext: '.mdl', fs_path: 'Models/Plane.mdl' },
          ],
        })
      );
      fs.writeFileSync(
        path.join(source, 'dist/1/manifest-abcd.json'),
        JSON.stringify({
          target: 'client',
          entry: 'main.lua',
          sources: { 'engine-res': { base_url: 'https://example.test/' } },
          files: [{ uuid: 'entry', hash: 'abc', ext: '.lua', size: 3 }],
        })
      );
      if (mode !== 'missing-asset')
        fs.writeFileSync(path.join(source, 'dist/assets/entry-abc.lua'), 'abc');
      const stdout = [
        '[INFO] 导入 1 个远端资源: engine-res (client=aa, server=aa)',
        '[INFO] 导入 1 个远端资源: official-res (client=bb, server=bb)',
        '[ERROR] 增强引用错误: 1 个远端路径匹配多个 source，已选择第一个',
        '[ERROR] Models/Plane.mdl: multiple sources matched; selected engine-res=plane; candidates=engine-res=plane, official-res=plane',
        '[INFO] 构建完成!',
      ].join('\n');
      const callback = args[args.length - 1] as (
        error: Error | null,
        output: { stdout: string; stderr: string }
      ) => void;
      callback(mode === 'nonzero-exit' ? new Error('builder exited with code 1') : null, {
        stdout,
        stderr: mode === 'stderr-error' ? '[ERROR] another failure' : '',
      });
      return {} as ReturnType<typeof execFile>;
    });
    const result = preparePreviewProject(project, output);
    if (mode === 'valid') {
      await expect(result).resolves.toMatchObject({
        ok: true,
        warnings: [
          '[WARN] Verified duplicate public resource reference: Models/Plane.mdl -> engine-res=plane',
        ],
      });
      expect(fs.readFileSync(path.join(output, 'prepare.log'), 'utf8')).toContain('[ERROR]');
    } else {
      await expect(result).rejects.toThrow('Local prepare failed; no Runtime was started.');
    }
    expect(fs.existsSync(path.join(project, 'dist'))).toBe(false);
  }
);
