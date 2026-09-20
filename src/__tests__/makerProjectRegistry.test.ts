import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto, { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  MakerProjectRegistry,
  getMakerProjectRegistryPath,
  registerMakerProject,
} from '../maker/projectRegistry';
import { ConsoleProjects } from '../maker/console/projects';
import { writePrivateJson } from '../maker/system/privateJson';
import { writePrivateJson as previewWritePrivateJson } from '../maker/preview/protocol';

describe('shared Maker local project registry', () => {
  let directory: string;
  let filename: string;
  let oldHome: string | undefined;
  function project(name: string, binding = 'same-remote'): string {
    const root = path.join(directory, name);
    fs.mkdirSync(path.join(root, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.maker-mcp/config.json'),
      JSON.stringify({
        project_id: binding,
      })
    );
    return fs.realpathSync(root);
  }
  function entry(root: string, binding = 'same-remote') {
    return { key: createHash('sha256').update(root).digest('hex'), path: root, binding };
  }
  beforeEach(() => {
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-registry-')));
    oldHome = process.env.TAPTAP_MAKER_HOME;
    process.env.TAPTAP_MAKER_HOME = path.join(directory, 'home');
    filename = path.join(directory, 'home/projects.json');
  });
  afterEach(() => {
    if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
    else process.env.TAPTAP_MAKER_HOME = oldHome;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('shares durable realpath identities across instances and console without selecting a project', () => {
    expect(getMakerProjectRegistryPath()).toBe(filename);
    const root = project('one');
    const alias = path.join(directory, 'alias');
    fs.symlinkSync(root, alias, 'junction');
    const first = new MakerProjectRegistry().add(root);
    expect(new MakerProjectRegistry().add(alias).key).toBe(first.key);
    const second = new ConsoleProjects(filename).add(project('two'));
    expect(second.key).not.toBe(first.key);
    expect(new MakerProjectRegistry().list().map((item) => item.key)).toEqual([
      second.key,
      first.key,
    ]);
    expect(new ConsoleProjects(filename).resolve(first.key).path).toBe(root);
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    expect(data).not.toHaveProperty('selected');
    expect(fs.readdirSync(root)).toEqual(['.maker-mcp']);
  });

  test('rejects relative, missing, unbound and rebound paths without changing project config', () => {
    const registry = new MakerProjectRegistry();
    expect(() => registry.add('relative')).toThrow();
    expect(() => registry.add(path.join(directory, 'missing'))).toThrow();
    expect(() => registry.add(directory)).toThrow();
    const root = project('one');
    const item = registry.add(root);
    const config = path.join(root, '.maker-mcp/config.json');
    fs.writeFileSync(config, '{"project_id":"replacement"}');
    expect(registry.list()[0]).toMatchObject({ key: item.key, valid: false });
    expect(() => registry.resolve(item.key)).toThrow(/binding|identity/i);
    expect(() => registry.add(root)).toThrow(/binding|identity/i);
    expect(fs.readFileSync(config, 'utf8')).toBe('{"project_id":"replacement"}');
    registry.remove(item.key);
    expect(registry.add(root).binding).toBe('replacement');
  });

  test('retains missing entries and refuses a registered path replaced by a symlink', () => {
    const registry = new MakerProjectRegistry();
    const root = project('one');
    const item = registry.add(root);
    fs.rmSync(root, { recursive: true });
    expect(registry.list()[0].valid).toBe(false);
    fs.symlinkSync(project('two'), root, 'junction');
    expect(() => registry.resolve(item.key)).toThrow(/identity/i);
    registry.remove(item.key);
    expect(fs.lstatSync(root).isSymbolicLink()).toBe(true);
  });

  test('merges legacy data once without touching it or resurrecting removed entries', () => {
    const legacy = path.join(directory, 'home/console/projects.json');
    const old = entry(project('old'));
    writePrivateJson(legacy, { schema: 1, projects: [old] });
    const original = fs.readFileSync(legacy, 'utf8');
    const registry = new MakerProjectRegistry();
    const fresh = registry.add(project('fresh'));
    expect(registry.list().map((item) => item.key)).toEqual([fresh.key, old.key]);
    registry.remove(old.key);
    expect(new MakerProjectRegistry().list().map((item) => item.key)).toEqual([fresh.key]);
    expect(fs.readFileSync(legacy, 'utf8')).toBe(original);
    expect(fs.existsSync(old.path)).toBe(true);
  });

  test('removal migrates first and commits the migration marker atomically', () => {
    const legacy = path.join(directory, 'home/console/projects.json');
    const old = entry(project('old'));
    writePrivateJson(legacy, { schema: 1, projects: [old] });
    new MakerProjectRegistry().remove(old.key);
    expect(new MakerProjectRegistry().list()).toEqual([]);
  });

  test('migration preserves unavailable entries and the shared binding on collisions', () => {
    const root = project('one');
    const shared = entry(root);
    const missing = entry(path.join(directory, 'missing'));
    writePrivateJson(filename, { schema: 1, projects: [shared] });
    writePrivateJson(path.join(directory, 'home/console/projects.json'), {
      schema: 1,
      projects: [{ ...shared, binding: 'stale' }, missing],
    });
    expect(new MakerProjectRegistry().list()).toEqual([
      { ...shared, valid: true },
      { ...missing, valid: false, error: expect.any(String) },
    ]);
  });

  test.each([
    'broken',
    '{"schema":2,"projects":[]}',
    '{"schema":1,"projects":{} }',
    '{"schema":1,"projects":[],"legacyMigrated":"yes"}',
  ])('fails closed on corrupt shared data: %s', (raw) => {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, raw);
    expect(() => new MakerProjectRegistry().add(project('one'))).toThrow();
    expect(() => new MakerProjectRegistry().remove('missing')).toThrow();
    expect(fs.readFileSync(filename, 'utf8')).toBe(raw);
  });

  test('rejects mismatched keys, duplicate entries and corrupt legacy files without rewriting them', () => {
    const item = entry(project('one'));
    for (const projects of [[{ ...item, key: '0'.repeat(64) }], [item, item]]) {
      const raw = JSON.stringify({ schema: 1, projects });
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, raw);
      expect(() => new MakerProjectRegistry().list()).toThrow();
      expect(fs.readFileSync(filename, 'utf8')).toBe(raw);
    }
    fs.unlinkSync(filename);
    const legacy = path.join(directory, 'home/console/projects.json');
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, 'broken');
    expect(() => new MakerProjectRegistry().list()).toThrow();
    expect(fs.existsSync(filename)).toBe(false);
    expect(fs.readFileSync(legacy, 'utf8')).toBe('broken');
  });

  test('bounds registry size without dropping existing entries', () => {
    const projects = Array.from({ length: 200 }, (_, i) => entry(path.join(directory, `old-${i}`)));
    writePrivateJson(filename, { schema: 1, projects });
    expect(() => new MakerProjectRegistry().add(project('extra'))).toThrow(/200/);
    expect(new MakerProjectRegistry().list()).toHaveLength(200);
  });

  test('preserves preview helper re-export and private atomic file permissions', () => {
    expect(previewWritePrivateJson).toBe(writePrivateJson);
    new MakerProjectRegistry().add(project('one'));
    if (process.platform !== 'win32') {
      expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
    }
    expect(fs.readdirSync(path.dirname(filename))).toEqual(['projects.json']);
  });

  test.each(['write', 'rename'])(
    'cleans its temporary file after %s failure and preserves the original error',
    (stage) => {
      writePrivateJson(filename, { original: true });
      const original = fs.readFileSync(filename, 'utf8');
      const failure = new Error(`${stage} failed`);
      const write = fs.writeFileSync;
      const spy =
        stage === 'write'
          ? jest.spyOn(fs, 'writeFileSync').mockImplementationOnce((file, data, options) => {
              write(file, data, options);
              throw failure;
            })
          : jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
              throw failure;
            });
      try {
        expect(() => writePrivateJson(filename, { replacement: true })).toThrow(failure);
      } finally {
        spy.mockRestore();
      }
      expect(fs.readFileSync(filename, 'utf8')).toBe(original);
      expect(fs.readdirSync(path.dirname(filename))).toEqual(['projects.json']);
    }
  );

  test('does not delete a temporary file it could not exclusively create', () => {
    writePrivateJson(filename, { original: true });
    const id = '11111111-1111-4111-8111-111111111111';
    const temporary = `${filename}.${id}.tmp`;
    fs.writeFileSync(temporary, 'owned by another writer');
    const uuid = jest.spyOn(crypto, 'randomUUID').mockReturnValue(id);
    try {
      expect(() => writePrivateJson(filename, { replacement: true })).toThrow(/EEXIST/);
      expect(fs.readFileSync(temporary, 'utf8')).toBe('owned by another writer');
      expect(JSON.parse(fs.readFileSync(filename, 'utf8'))).toEqual({ original: true });
    } finally {
      uuid.mockRestore();
    }
  });

  test('cleanup failure does not replace the original rename failure', () => {
    writePrivateJson(filename, { original: true });
    const failure = new Error('original rename failure');
    const rename = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw failure;
    });
    const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
      throw new Error('cleanup failure');
    });
    let caught: unknown;
    try {
      writePrivateJson(filename, { replacement: true });
    } catch (error) {
      caught = error;
    } finally {
      rename.mockRestore();
      unlink.mockRestore();
    }
    expect(caught).toBe(failure);
    expect(JSON.parse(fs.readFileSync(filename, 'utf8'))).toEqual({ original: true });
  });

  test('completed-migration list and resolve perform no filesystem writes or locking', () => {
    const registry = new MakerProjectRegistry();
    const item = registry.add(project('one'));
    const mkdir = jest.spyOn(fs, 'mkdirSync');
    const write = jest.spyOn(fs, 'writeFileSync');
    const rename = jest.spyOn(fs, 'renameSync');
    const rmdir = jest.spyOn(fs, 'rmdirSync');
    try {
      expect(registry.list()).toEqual([item]);
      expect(registry.resolve(item.key)).toEqual(item);
      expect(mkdir).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
      expect(rmdir).not.toHaveBeenCalled();
    } finally {
      mkdir.mockRestore();
      write.mockRestore();
      rename.mockRestore();
      rmdir.mockRestore();
    }
  });

  test('reads completed snapshots through an existing writer lock without hiding corruption', () => {
    const registry = new MakerProjectRegistry();
    const item = registry.add(project('one'));
    fs.mkdirSync(filename + '.lock');
    expect(registry.list()).toEqual([item]);
    expect(registry.resolve(item.key)).toEqual(item);
    fs.writeFileSync(filename, 'broken');
    expect(() => registry.list()).toThrow();
    expect(() => registry.resolve(item.key)).toThrow();
    expect(fs.readFileSync(filename, 'utf8')).toBe('broken');
    expect(fs.existsSync(filename + '.lock')).toBe(true);
  });

  test('first migration releases the write lock before inspecting project paths', () => {
    const root = project('old');
    writePrivateJson(path.join(directory, 'home/console/projects.json'), {
      schema: 1,
      projects: [entry(root)],
    });
    const realpath = fs.realpathSync;
    const locks: boolean[] = [];
    const spy = jest.spyOn(fs, 'realpathSync').mockImplementation((file, options) => {
      if (file === root) locks.push(fs.existsSync(filename + '.lock'));
      return realpath(file, options as any);
    });
    try {
      expect(new MakerProjectRegistry().list()[0].valid).toBe(true);
      expect(locks).toEqual([false]);
    } finally {
      spy.mockRestore();
    }
  });

  test('reading an empty custom registry without migration creates no directories', () => {
    const custom = path.join(directory, 'unused', 'projects.json');
    expect(new MakerProjectRegistry(custom).list()).toEqual([]);
    expect(fs.existsSync(path.dirname(custom))).toBe(false);
  });

  test('reports registration failures as warnings and leaves contended state untouched', () => {
    const root = project('one');
    fs.mkdirSync(filename + '.lock', { recursive: true });
    const start = Date.now();
    expect(registerMakerProject(root)).toMatch(/registry.*busy/i);
    expect(Date.now() - start).toBeLessThan(4000);
    expect(fs.existsSync(filename)).toBe(false);
    expect(fs.existsSync(filename + '.lock')).toBe(true);
  });

  test('genuine concurrent processes retain all successful additions and removals', async () => {
    const registry = new MakerProjectRegistry();
    const legacy = path.join(directory, 'home/console/projects.json');
    const old = Array.from({ length: 8 }, (_, i) => entry(project(`remove-${i}`)));
    writePrivateJson(legacy, { schema: 1, projects: old });
    const originalLegacy = fs.readFileSync(legacy, 'utf8');
    const removed = old.map((item) => item.key);
    const added = Array.from({ length: 8 }, (_, i) => project(`add-${i}`));
    const modulePath = path.resolve(__dirname, '../maker/projectRegistry.ts');
    const code = `
      const loaded = await import(process.argv[1]);
      const { MakerProjectRegistry } = loaded.default || loaded;
      process.send('ready');
      process.once('message', () => {
        try {
          const registry = new MakerProjectRegistry();
          registry.remove(process.argv[2]);
          registry.add(process.argv[3]);
          process.disconnect();
        } catch (error) { console.error(error); process.exit(1); }
      });
    `;
    const children = added.map((root, index) =>
      spawn(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', code, modulePath, removed[index], root],
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: process.env }
      )
    );
    try {
      const finished = children.map(
        (child) =>
          new Promise<void>((resolve, reject) => {
            let stderr = '';
            child.stderr!.on('data', (data) => {
              stderr += data;
            });
            child.on('error', reject);
            child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
          })
      );
      await Promise.all(
        children.map(
          (child) =>
            new Promise<void>((resolve) => {
              child.once('message', () => resolve());
            })
        )
      );
      children.forEach((child) => child.send('go'));
      await Promise.all(finished);
      expect(
        registry
          .list()
          .map((item) => item.path)
          .sort()
      ).toEqual(added.sort());
      expect(new MakerProjectRegistry().list()).toHaveLength(8);
      expect(fs.readFileSync(legacy, 'utf8')).toBe(originalLegacy);
    } finally {
      children.forEach((child) => {
        if (child.exitCode === null) child.kill();
      });
    }
  }, 30000);
});
