import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { ConsoleProjects } from '../maker/console/projects';
import { ConsoleTasks } from '../maker/console/tasks';
import { startConsoleServer } from '../maker/console/server';
import type { ConsoleExecutor } from '../maker/console/types';
import * as folderPicker from '../maker/console/folderPicker';

describe('Maker console project isolation', () => {
  let directory: string;
  let registry: ConsoleProjects;
  function project(name: string, id = name): string {
    const root = path.join(directory, name);
    fs.mkdirSync(path.join(root, '.maker-mcp'), { recursive: true });
    fs.mkdirSync(path.join(root, '.project'), { recursive: true });
    fs.writeFileSync(path.join(root, '.maker-mcp/config.json'), JSON.stringify({ project_id: id }));
    fs.writeFileSync(
      path.join(root, '.project/project.json'),
      JSON.stringify({
        version: '1.2.3',
        taptap_publish: { title: name, screen_orientation: 'portrait' },
      })
    );
    return root;
  }
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-test-'));
    registry = new ConsoleProjects(path.join(directory, 'registry.json'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test('folder selection requires authentication and handles cancellation, validation and concurrency', async () => {
    const picker = jest.spyOn(folderPicker, 'chooseProjectDirectory');
    const server = await startConsoleServer({
      registry,
      html: '',
      version: 'test',
      execute: async () => ({ ok: true }),
    });
    const select = (authenticated = true) =>
      fetch(server.origin + '/api/projects/select-folder', {
        method: 'POST',
        headers: {
          Origin: server.origin,
          'Content-Type': 'application/json',
          ...(authenticated ? { Authorization: `Bearer ${server.token}` } : {}),
        },
        body: '{}',
      });
    try {
      expect((await select(false)).status).toBe(401);
      expect(picker).not.toHaveBeenCalled();
      picker.mockResolvedValueOnce(null);
      expect(await (await select()).json()).toEqual({ cancelled: true });
      expect(registry.list()).toHaveLength(0);
      picker.mockResolvedValueOnce(directory);
      expect((await (await select()).json()).added).toBe(0);
      expect(registry.list()).toHaveLength(0);
      const root = project('selected-folder');
      let finish!: (value: string | null) => void;
      let opened!: () => void;
      const ready = new Promise<void>((resolve) => {
        opened = resolve;
      });
      picker.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
            opened();
          })
      );
      const pending = select();
      await ready;
      expect((await select()).status).toBe(409);
      finish(root);
      const response = await pending;
      expect(response.status).toBe(200);
      expect((await response.json()).added).toBe(1);
      expect(registry.list()).toHaveLength(1);
    } finally {
      picker.mockRestore();
      await server.close();
    }
  });

  test('detects server changes without flagging client-only files or modifying the project', async () => {
    const root = project('server-warning');
    const runGit = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
        cwd: root,
        encoding: 'utf8',
      });
    fs.mkdirSync(path.join(root, 'scripts/backend'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.project/project.json'),
      JSON.stringify({
        'entry@server': 'backend/main.lua',
      })
    );
    for (const file of ['backend/main.lua', 'backend/rules.lua', 'client.lua', 'shared.lua']) {
      fs.writeFileSync(path.join(root, 'scripts', file), '-- initial\n');
    }
    fs.writeFileSync(path.join(root, 'scripts/shared.lua.meta'), '{"c_or_s":"cs"}');
    runGit('init');
    runGit('add', '.');
    runGit('commit', '-m', 'fixture');
    const item = registry.add(root);
    expect(await registry.previewServerChanges(item.key)).toEqual({
      checked: true,
      changed: false,
    });
    fs.appendFileSync(path.join(root, 'scripts/client.lua'), '-- client\n');
    expect(await registry.previewServerChanges(item.key)).toEqual({
      checked: true,
      changed: false,
    });
    fs.appendFileSync(path.join(root, 'scripts/backend/rules.lua'), '-- server\n');
    expect((await registry.previewServerChanges(item.key)).changed).toBe(true);
    runGit('add', '.');
    runGit('commit', '-m', 'changes');
    runGit('mv', 'scripts/backend/rules.lua', 'scripts/client-rules.lua');
    expect((await registry.previewServerChanges(item.key)).changed).toBe(true);
    runGit('commit', '-am', 'rename');
    fs.unlinkSync(path.join(root, 'scripts/shared.lua'));
    fs.unlinkSync(path.join(root, 'scripts/shared.lua.meta'));
    expect((await registry.previewServerChanges(item.key)).changed).toBe(true);
    runGit('add', '.');
    runGit('commit', '-m', 'delete');
    fs.mkdirSync(path.join(root, 'scripts/server'));
    fs.writeFileSync(path.join(root, 'scripts/server/new.lua'), '-- new\n');
    const before = runGit('status', '--porcelain');
    expect((await registry.previewServerChanges(item.key)).changed).toBe(true);
    expect(runGit('status', '--porcelain')).toBe(before);
  });

  test('server-change check is non-blocking for a project without Git', async () => {
    const item = registry.add(project('no-git'));
    expect(await registry.previewServerChanges(item.key)).toEqual({
      checked: false,
      changed: false,
    });
  });

  test('only checks server changes when explicitly requested by the preview UI', async () => {
    const item = registry.add(project('preview-advisory'));
    const check = jest
      .spyOn(registry, 'previewServerChanges')
      .mockResolvedValue({ checked: true, changed: true });
    const server = await startConsoleServer({
      registry,
      html: '',
      version: 'test',
      execute: async () => ({ ok: true, install_state: 'ready', process_alive: false }),
    });
    try {
      const headers = { Authorization: `Bearer ${server.token}` };
      const url = server.origin + '/api/projects/' + item.key + '/preview';
      await fetch(url, { headers });
      expect(check).not.toHaveBeenCalled();
      const result = await (await fetch(url + '?check_server_changes=1', { headers })).json();
      expect(result.server_changes).toEqual({ checked: true, changed: true });
      expect(result.install_state).toBe('ready');
    } finally {
      await server.close();
    }
  });

  test('saves preview window preferences with mutation auth and leaves publishing config unchanged', async () => {
    const oldHome = process.env.TAPTAP_MAKER_HOME;
    process.env.TAPTAP_MAKER_HOME = path.join(directory, 'home');
    const item = registry.add(project('window'));
    const config = fs.readFileSync(path.join(item.path, '.project/project.json'), 'utf8');
    const server = await startConsoleServer({
      registry,
      html: '',
      version: 'test',
      execute: async () => ({ ok: true, install_state: 'missing', process_alive: false }),
    });
    try {
      const headers = {
        Authorization: `Bearer ${server.token}`,
        Origin: server.origin,
        'Content-Type': 'application/json',
      };
      const url = server.origin + '/api/projects/' + item.key + '/preview';
      const settings = {
        orientation: 'landscape',
        preset: 'custom',
        custom: { longEdge: 1440, shortEdge: 900 },
      };
      expect(
        (await fetch(url + '/window', { method: 'POST', body: JSON.stringify(settings) })).status
      ).toBe(401);
      expect(
        (
          await fetch(url + '/window', {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...settings, custom: { longEdge: -1, shortEdge: 0 } }),
          })
        ).status
      ).toBe(400);
      expect(
        (
          await fetch(url + '/window', {
            method: 'POST',
            headers,
            body: JSON.stringify(settings),
          })
        ).status
      ).toBe(200);
      const state = await (await fetch(url, { headers })).json();
      expect(state.window_settings.effective).toMatchObject({ width: 1440, height: 900 });
      expect(state.install_state).toBe('missing');
      expect(fs.readFileSync(path.join(item.path, '.project/project.json'), 'utf8')).toBe(config);
    } finally {
      await server.close();
      if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
      else process.env.TAPTAP_MAKER_HOME = oldHome;
    }
  });

  test('exposes bounded progress while the build is running and persists the final outcome', async () => {
    const item = registry.add(project('progress'));
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const file = path.join(directory, 'tasks.json');
    const tasks = new ConsoleTasks(
      registry,
      async ({ onProgress }) => {
        onProgress?.({
          phase: 'remote_build',
          message: 'x'.repeat(2000),
          progress: 25,
          total: 100,
        });
        await gate;
        return { ok: true };
      },
      file
    );
    const task = tasks.start(item.key, 'build');
    await new Promise((resolve) => setImmediate(resolve));
    expect(tasks.get(task.id)).toMatchObject({
      status: 'running',
      progress: { phase: 'remote_build', progress: 25, total: 100 },
    });
    expect(tasks.get(task.id).progress?.message.length).toBe(512);
    finish();
    await tasks.settled();
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))[0]).toMatchObject({
      status: 'succeeded',
      progress: { phase: 'remote_build' },
    });
  });

  test('registers only bound absolute directories and deduplicates a realpath', () => {
    expect(() => registry.add('relative')).toThrow();
    expect(() => registry.add(directory)).toThrow();
    const root = project('A');
    const first = registry.add(root);
    expect(registry.add(root).key).toBe(first.key);
    expect(registry.list()).toHaveLength(1);
    expect(registry.resolve(first.key).path).toBe(fs.realpathSync(root));
  });

  test('keeps two checkouts of the same remote app separate', () => {
    const a = registry.add(project('A', 'same-app'));
    const b = registry.add(project('B', 'same-app'));
    expect(a.key).not.toBe(b.key);
    expect(() => registry.resolve('missing')).toThrow();
    registry.remove(a.key);
    expect(fs.existsSync(a.path)).toBe(true);
    expect(registry.list().map((item) => item.key)).toEqual([b.key]);
  });

  test('does not follow a changed project binding or silently erase an invalid registry', () => {
    const item = registry.add(project('A'));
    fs.writeFileSync(
      path.join(item.path, '.maker-mcp/config.json'),
      '{"project_id":"replacement"}'
    );
    expect(registry.list()[0].valid).toBe(false);
    expect(() => registry.resolve(item.key)).toThrow();
    fs.writeFileSync(path.join(directory, 'registry.json'), 'broken');
    expect(() => registry.add(project('B'))).toThrow();
  });

  test('returns project metadata and bounded Git history including parents', async () => {
    const item = registry.add(project('A'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: item.path });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Console Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'chore: first fixture',
      ],
      { cwd: item.path }
    );
    const detail = await registry.detail(item.key);
    expect(detail.config.version).toBe('1.2.3');
    expect(detail.git.branch).toBe('main');
    const history = await registry.git(item.key, 0);
    expect(history.commits).toHaveLength(1);
    expect(history.commits[0].subject).toBe('chore: first fixture');
    expect(history.commits[0].parents).toEqual([]);
    expect(() => registry.commit(item.key, '--help')).toThrow();
  });

  test('freezes each task target and rejects duplicate project work', async () => {
    const a = registry.add(project('A'));
    const b = registry.add(project('B'));
    let release!: (value: { ok: boolean }) => void;
    const execute = jest.fn(
      (_options: Parameters<ConsoleExecutor>[0]) =>
        new Promise<{ ok: boolean }>((resolve) => {
          release = resolve;
        })
    );
    const tasks = new ConsoleTasks(registry, execute);
    const task = tasks.start(a.key, 'build');
    expect(task.projectKey).toBe(a.key);
    expect(() => tasks.start(a.key, 'preview.start')).toThrow();
    expect(() => tasks.start(b.key, 'anything' as 'build')).toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(execute.mock.calls[0][0]).toMatchObject({ project: a.path, action: 'build' });
    release({ ok: true });
    await tasks.settled();
    expect(tasks.get(task.id).status).toBe('succeeded');
  });

  test('preserves failures, does not retry, and caps task output', async () => {
    const item = registry.add(project('A'));
    const execute = jest.fn(async ({ onOutput }) => {
      onOutput('x'.repeat(300_000));
      return { ok: false, error: 'build failed' };
    });
    const tasks = new ConsoleTasks(registry, execute);
    const task = tasks.start(item.key, 'build');
    await tasks.settled();
    expect(tasks.get(task.id).status).toBe('failed');
    expect(tasks.get(task.id).output.length).toBeLessThanOrEqual(65536);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('bounds structured task results and rejects oversized history before parsing', async () => {
    const item = registry.add(project('A'));
    const tasks = new ConsoleTasks(registry, async () => ({
      ok: true,
      payload: 'x'.repeat(1024 * 1024),
    }));
    const task = tasks.start(item.key, 'build');
    await tasks.settled();
    expect(task.status).toBe('succeeded');
    expect(JSON.stringify(task.result).length).toBeLessThan(300000);
    expect(task.result).toMatchObject({ result_truncated: true });
    const file = path.join(directory, 'large-history.json');
    const fd = fs.openSync(file, 'w');
    fs.ftruncateSync(fd, 40 * 1024 * 1024 + 1);
    fs.closeSync(fd);
    expect(() => new ConsoleTasks(registry, async () => ({ ok: true }), file)).toThrow(
      'history exceeds'
    );
  });

  test('does not leave a phantom running task when history cannot be saved', () => {
    const item = registry.add(project('A'));
    const history = path.join(directory, 'history.json');
    const execute = jest.fn(async () => ({ ok: true }));
    const tasks = new ConsoleTasks(registry, execute, history);
    fs.mkdirSync(history);
    expect(() => tasks.start(item.key, 'build')).toThrow();
    expect(tasks.busy(item.key)).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  test('rejects new mutations while draining an already started operation', async () => {
    const a = registry.add(project('A'));
    const b = registry.add(project('B'));
    let release!: (value: { ok: boolean }) => void;
    const server = await startConsoleServer({
      registry,
      html: '',
      version: 'test',
      execute: ({ project: root }) =>
        root === a.path
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve({ ok: true }),
    });
    const headers = {
      Authorization: `Bearer ${server.token}`,
      Origin: server.origin,
      'Content-Type': 'application/json',
    };
    await fetch(server.origin + '/api/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectKey: a.key, action: 'build' }),
    });
    const closing = server.close();
    try {
      const health = await fetch(server.origin + '/api/health', { headers });
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ draining: true });
      const response = await fetch(server.origin + '/api/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify({ projectKey: b.key, action: 'build' }),
      });
      expect(response.status).toBe(503);
    } finally {
      release({ ok: true });
      await closing;
    }
  });

  test('requires bearer auth and same-origin writes, never infers current project', async () => {
    const item = registry.add(project('A'));
    const server = await startConsoleServer({
      registry,
      html: '<html>console</html>',
      version: 'test',
      execute: async () => ({ ok: true }),
    });
    const auth = { Authorization: `Bearer ${server.token}` };
    const write = { ...auth, Origin: server.origin, 'Content-Type': 'application/json' };
    try {
      expect((await fetch(server.origin + '/api/state')).status).toBe(401);
      const state = await fetch(server.origin + '/api/state', { headers: auth });
      expect(state.status).toBe(200);
      const payload = (await state.json()) as {
        projects: { key: string }[];
        luaLsp?: { ready?: boolean; status?: string };
      };
      expect(payload.projects[0].key).toBe(item.key);
      expect(payload.luaLsp).toEqual(
        expect.objectContaining({
          ready: expect.any(Boolean),
          status: expect.any(String),
        })
      );
      expect(
        (
          await fetch(server.origin + '/api/state', {
            headers: { ...auth, Origin: 'https://evil.invalid' },
          })
        ).status
      ).toBe(403);
      expect(
        (await fetch(server.origin + '/api/tasks', { method: 'POST', headers: auth, body: '{}' }))
          .status
      ).toBe(403);
      expect(
        (
          await fetch(server.origin + '/api/tasks', {
            method: 'POST',
            headers: write,
            body: JSON.stringify({ action: 'build' }),
          })
        ).status
      ).toBe(400);
      expect(
        (
          await fetch(server.origin + '/api/tasks', {
            method: 'POST',
            headers: write,
            body: JSON.stringify({ projectKey: item.key, action: 'shell' }),
          })
        ).status
      ).toBe(400);
      expect(
        (
          await fetch(server.origin + '/api/tasks', {
            method: 'POST',
            headers: write,
            body: JSON.stringify({ projectKey: item.key, action: 'build' }),
          })
        ).status
      ).toBe(202);
      expect(
        (
          await fetch(server.origin + '/api/projects', {
            method: 'POST',
            headers: write,
            body: 'x'.repeat(20000),
          })
        ).status
      ).toBe(413);
      const badHost = await new Promise<number | undefined>((resolve, reject) => {
        http
          .get(
            server.origin + '/api/state',
            { headers: { ...auth, Host: 'evil.invalid' } },
            (res) => {
              res.resume();
              resolve(res.statusCode);
            }
          )
          .on('error', reject);
      });
      expect(badHost).toBe(403);
      const page = await fetch(server.origin);
      expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(await page.text()).not.toContain(server.token);
      expect((await fetch(server.origin + '/favicon.ico')).status).toBe(204);
    } finally {
      await server.close();
    }
  });

  test('rejects a mutation whose request body completes after draining starts', async () => {
    const a = registry.add(project('A'));
    const b = registry.add(project('B'));
    let release!: (value: { ok: boolean }) => void;
    const server = await startConsoleServer({
      registry,
      html: '',
      version: 'test',
      execute: ({ project: root }) =>
        root === a.path
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve({ ok: true }),
    });
    const headers = {
      Authorization: `Bearer ${server.token}`,
      Origin: server.origin,
      'Content-Type': 'application/json',
    };
    await fetch(server.origin + '/api/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectKey: a.key, action: 'build' }),
    });
    const body = JSON.stringify({ projectKey: b.key, action: 'build' });
    let request!: http.ClientRequest;
    const response = new Promise<number | undefined>((resolve, reject) => {
      request = http.request(server.origin + '/api/tasks', { method: 'POST', headers }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      request.on('error', reject);
      request.write(body.slice(0, 1));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const closing = server.close();
    try {
      request.end(body.slice(1));
      expect(await response).toBe(503);
    } finally {
      release({ ok: true });
      await closing;
    }
  });
});
