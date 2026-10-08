import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MakerProjectRegistry } from '../maker/projectRegistry.js';
import { previewProject, previewDirectory } from '../maker/preview/protocol.js';
import { previewCacheUsage } from '../maker/preview/cacheManagement.js';
import { ownedPreviewWorkspace } from '../maker/preview/workspace.js';
import { sameProjectPathSpelling } from '../maker/system/projectPath.js';
import { withPreviewLock } from '../maker/preview/installation.js';
import * as previewSession from '../maker/preview/session.js';
import * as validationHistory from '../maker/preview/validationHistory.js';

const canonical = String.raw`C:\Maker\中文 空格\923522_只差一次`;
const alias = 'c' + canonical.slice(1);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
let root: string;
let project: string;
let previousHome: string | undefined;

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-drive-case-')));
  project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.writeFileSync(path.join(project, '.maker-mcp/config.json'), '{"project_id":"same-remote"}');
  previousHome = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  fs.mkdirSync(process.env.TAPTAP_MAKER_HOME);
  const local = (filename: fs.PathLike): fs.PathLike => {
    if (typeof filename !== 'string') return filename;
    for (const spelling of [canonical, alias])
      if (filename === spelling || filename.startsWith(spelling + path.sep))
        return project + filename.slice(spelling.length);
    return filename;
  };
  const native = fs.realpathSync.native;
  jest.spyOn(fs.realpathSync, 'native').mockImplementation((filename, options) => {
    const actual = local(filename);
    const resolved = native(actual, options as any);
    return actual === filename ? resolved : canonical + String(resolved).slice(project.length);
  });
  const absolute = path.isAbsolute;
  jest
    .spyOn(path, 'isAbsolute')
    .mockImplementation(
      (filename) => filename === canonical || filename === alias || absolute(filename)
    );
  const normalize = path.normalize;
  jest
    .spyOn(path, 'normalize')
    .mockImplementation((filename) =>
      filename === canonical || filename === alias ? filename : normalize(filename)
    );
  const stat = fs.statSync,
    lstat = fs.lstatSync,
    read = fs.readFileSync,
    exists = fs.existsSync;
  jest
    .spyOn(fs, 'statSync')
    .mockImplementation((filename, options) => stat(local(filename), options as any));
  jest
    .spyOn(fs, 'lstatSync')
    .mockImplementation((filename, options) => lstat(local(filename), options as any));
  jest
    .spyOn(fs, 'readFileSync')
    .mockImplementation((filename, options) =>
      read(typeof filename === 'number' ? filename : local(filename), options)
    );
  jest.spyOn(fs, 'existsSync').mockImplementation((filename) => exists(local(filename)));
  const asyncStat = fs.promises.lstat,
    readdir = fs.promises.readdir;
  jest
    .spyOn(fs.promises, 'lstat')
    .mockImplementation((filename, options) => asyncStat(local(filename), options as any));
  jest
    .spyOn(fs.promises, 'readdir')
    .mockImplementation((filename, options) => readdir(local(filename), options));
});

afterEach(() => {
  jest.restoreAllMocks();
  if (previousHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = previousHome;
  fs.rmSync(root, { recursive: true, force: true });
});

test('both drive spellings use one native registry identity and one preview hash', () => {
  const registry = new MakerProjectRegistry();
  const first = registry.add(canonical);
  expect(registry.add(alias)).toEqual(first);
  expect(first).toMatchObject({ path: canonical, key: hash(canonical), valid: true });
  expect(registry.list()).toEqual([first]);
  expect(previewProject(alias)).toBe(canonical);
  expect(previewDirectory(previewProject(alias))).toBe(previewDirectory(previewProject(canonical)));
});

test.each([false, true])(
  'reopening removes old drive-case aliases without merging different checkouts: %s',
  (hasCanonical) => {
    const filename = path.join(process.env.TAPTAP_MAKER_HOME!, 'projects.json');
    const record = (directory: string) => ({
      key: hash(directory),
      path: directory,
      binding: 'same-remote',
    });
    const old = record(alias);
    const other = path.join(root, 'another-project');
    fs.mkdirSync(path.join(other, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(path.join(other, '.maker-mcp/config.json'), '{"project_id":"same-remote"}');
    fs.writeFileSync(
      filename,
      JSON.stringify({
        schema: 1,
        legacyMigrated: true,
        projects: [old, ...(hasCanonical ? [record(canonical)] : []), record(other)],
      })
    );
    const registry = new MakerProjectRegistry();
    expect(registry.list().find((entry) => entry.key === old.key)?.valid).toBe(false);
    expect(() => registry.resolve(old.key)).toThrow('identity');
    const current = registry.add(alias);
    expect(current.path).toBe(canonical);
    expect(
      registry
        .list()
        .map((entry) => entry.path)
        .sort()
    ).toEqual([canonical, other].sort());
    expect(registry.list().every((entry) => entry.valid)).toBe(true);
    expect(JSON.parse(fs.readFileSync(filename, 'utf8')).projects).toHaveLength(2);
  }
);

test('cache accounting counts the project-local workspace once, not once per drive spelling', async () => {
  const registry = new MakerProjectRegistry();
  registry.add(alias);
  registry.add(canonical);
  fs.mkdirSync(path.join(project, '.maker-preview/source'), { recursive: true });
  fs.writeFileSync(path.join(project, '.maker-preview/source/asset'), '1234567');
  const usage = await previewCacheUsage(previewProject(alias));
  expect(usage.categories['project-workspace']).toBe(7);
  expect(usage.total_categories['project-workspace']).toBe(7);
  expect(usage.projects).toHaveLength(1);
  expect(usage.warnings).toEqual([]);
});

test('legacy alias caches stay counted without owning the canonical project workspace', async () => {
  new MakerProjectRegistry().add(canonical);
  const legacy = previewDirectory(alias);
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'session.json'), JSON.stringify({ project_realpath: alias }));
  fs.mkdirSync(path.join(project, '.maker-preview/source'), { recursive: true });
  fs.writeFileSync(path.join(project, '.maker-preview/source/asset'), '1234567');
  const usage = await previewCacheUsage(previewProject(alias));
  const orphan = usage.projects.find((entry) => entry.key === hash(alias));
  expect(orphan?.project).toBeUndefined();
  expect(orphan?.bytes).toBeGreaterThan(0);
  expect(orphan?.categories['project-workspace']).toBeUndefined();
  expect(usage.total_categories['project-workspace']).toBe(7);
  expect(usage.projects.filter((entry) => entry.project === canonical)).toHaveLength(1);
  expect(fs.existsSync(path.join(legacy, 'session.json'))).toBe(true);
});

test.each([true, undefined, false])(
  'canonical operations respect legacy drive-case Runtime state: %s',
  async (alive) => {
    fs.mkdirSync(previewDirectory(alias), { recursive: true });
    const status = jest
      .spyOn(previewSession, 'previewStatus')
      .mockResolvedValue({ process_alive: alive });
    const validation = jest
      .spyOn(validationHistory, 'requireNoActiveValidationRuntime')
      .mockResolvedValue();
    const action = jest.fn(async () => 'done');
    const operation = withPreviewLock(canonical, action);
    if (alive === false) {
      await expect(operation).resolves.toBe('done');
      expect(validation).toHaveBeenCalledWith(alias);
      expect(action).toHaveBeenCalledTimes(1);
    } else {
      await expect(operation).rejects.toThrow('旧盘符');
      expect(action).not.toHaveBeenCalled();
    }
    expect(status).toHaveBeenCalledWith(alias);
    for (const directory of [canonical, alias])
      expect(fs.existsSync(path.join(previewDirectory(directory), 'operation.lock'))).toBe(false);
  }
);

test('legacy validation with unverified Runtime blocks the canonical operation', async () => {
  fs.mkdirSync(previewDirectory(alias), { recursive: true });
  jest.spyOn(previewSession, 'previewStatus').mockResolvedValue({ process_alive: false });
  jest
    .spyOn(validationHistory, 'requireNoActiveValidationRuntime')
    .mockRejectedValue(new Error('unverified Runtime'));
  const action = jest.fn(async () => 'done');
  await expect(withPreviewLock(canonical, action)).rejects.toThrow('unverified Runtime');
  expect(action).not.toHaveBeenCalled();
});

test('an existing workspace owner tolerates drive spelling only, not a changed project', () => {
  fs.mkdirSync(path.join(project, '.maker-preview'));
  const marker = path.join(project, '.maker-preview/owner.json');
  fs.writeFileSync(marker, JSON.stringify({ schema: 1, project: alias }));
  expect(ownedPreviewWorkspace(canonical)).toBe(path.join(canonical, '.maker-preview'));
  fs.writeFileSync(marker, JSON.stringify({ schema: 1, project: alias + '-other' }));
  expect(() => ownedPreviewWorkspace(canonical)).toThrow('归属不匹配');
  expect(sameProjectPathSpelling(canonical, String.raw`C:\maker\中文 空格\923522_只差一次`)).toBe(
    false
  );
  expect(sameProjectPathSpelling('/project/Case', '/project/case')).toBe(false);
});
