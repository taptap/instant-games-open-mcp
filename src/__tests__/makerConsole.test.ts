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
import { ConsoleError } from '../maker/console/types';

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
  afterEach(() =>
    fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  );

  test('report requires consent, uses the original project and submits only once', async () => {
    const a = registry.add(project('Report A'));
    let finish!: (value: { ok: boolean; status: string; issue_url: string }) => void;
    const execute = jest.fn<ReturnType<ConsoleExecutor>, Parameters<ConsoleExecutor>>(
      async ({ action }) =>
        action === 'issue.report'
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : { ok: false, error: 'TIMEOUT: preview supervisor did not open its control channel' }
    );
    const tasks = new ConsoleTasks(registry, execute);
    const task = tasks.start(a.key, 'preview.start');
    await tasks.settled();
    expect(tasks.get(task.id).reportOffer?.category).toBe('runtime');
    expect(() => tasks.report(task.id, false)).toThrow('consent');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(tasks.report(task.id, true).report?.status).toBe('running');
    expect(tasks.active).toBe(true);
    expect(tasks.busy(a.key)).toBe(true);
    tasks.report(task.id, true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0]).toMatchObject({
      project: a.path,
      action: 'issue.report',
      reportContext: { source: 'console', category: 'runtime', failed_operation: 'preview.start' },
    });
    finish({
      ok: true,
      status: 'created',
      issue_url: 'https://github.com/taptap/instant-games-open-mcp/issues/123',
    });
    await tasks.settled();
    expect(tasks.get(task.id).report?.status).toBe('created');
    tasks.report(task.id, true);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test('restores an interrupted report as unknown and never automatically resubmits', async () => {
    const a = registry.add(project('Report restart'));
    const history = path.join(directory, 'reports.json');
    const execute = jest.fn(async () => ({ ok: false, error: 'preview supervisor timeout' }));
    const tasks = new ConsoleTasks(registry, execute, history);
    const task = tasks.start(a.key, 'preview.start');
    await tasks.settled();
    const saved = JSON.parse(fs.readFileSync(history, 'utf8'));
    saved[0].report = { status: 'running' };
    fs.writeFileSync(history, JSON.stringify(saved));
    const restored = new ConsoleTasks(registry, execute, history);
    expect(restored.get(task.id).report?.status).toBe('unknown');
    expect(restored.report(task.id, true).report?.status).toBe('unknown');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('rejects feedback after a project binding changes', async () => {
    const root = project('Report changed');
    const a = registry.add(root);
    const execute = jest.fn(async () => ({ ok: false, error: 'preview supervisor timeout' }));
    const tasks = new ConsoleTasks(registry, execute);
    const task = tasks.start(a.key, 'preview.start');
    await tasks.settled();
    fs.writeFileSync(path.join(root, '.maker-mcp/config.json'), '{"project_id":"different"}');
    expect(() => tasks.report(task.id, true)).toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('report HTTP route requires consent and keeps the service alive during submission', async () => {
    const a = registry.add(project('HTTP report'));
    let finish!: (result: { ok: boolean; status: string }) => void;
    const execute = jest.fn<ReturnType<ConsoleExecutor>, Parameters<ConsoleExecutor>>(
      async ({ action }) =>
        action === 'issue.report'
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : { ok: false, error: 'preview supervisor timeout' }
    );
    const server = await startConsoleServer({ registry, execute, html: '', version: 'test' });
    try {
      const task = server.tasks.start(a.key, 'preview.start');
      await server.tasks.settled();
      const post = (route: string, body: unknown) =>
        fetch(server.origin + route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: server.origin },
          body: JSON.stringify(body),
        });
      const route = '/api/tasks/' + task.id + '/report';
      expect((await post(route, {})).status).toBe(400);
      expect(execute).toHaveBeenCalledTimes(1);
      expect((await post(route, { consent: true })).status).toBe(202);
      expect((await post(route, { consent: true })).status).toBe(202);
      expect(execute).toHaveBeenCalledTimes(2);
      expect((await post('/api/shutdown', {})).status).toBe(409);
      finish({ ok: false, status: 'unavailable' });
      await server.tasks.settled();
      expect(server.tasks.get(task.id)).toMatchObject({
        status: 'failed',
        error: 'preview supervisor timeout',
        report: { status: 'unavailable' },
      });
    } finally {
      finish?.({ ok: false, status: 'unavailable' });
      await server.close();
    }
  });

  test('keeps and persists only the latest ten tasks per project including the active task', async () => {
    const a = registry.add(project('History A'));
    const b = registry.add(project('History B'));
    const history = path.join(directory, 'tasks.json');
    const execute = jest.fn(async () => ({ ok: true }));
    const tasks = new ConsoleTasks(registry, execute, history);
    const first = tasks.start(a.key, 'build');
    await tasks.settled();
    tasks.start(b.key, 'build');
    await tasks.settled();
    for (let i = 0; i < 10; i++) {
      tasks.start(a.key, 'build');
      await tasks.settled();
    }
    expect(tasks.list().filter((task) => task.projectKey === a.key)).toHaveLength(10);
    expect(tasks.list().filter((task) => task.projectKey === b.key)).toHaveLength(1);
    expect(() => tasks.get(first.id)).toThrow('Task not found');
    expect(JSON.parse(fs.readFileSync(history, 'utf8'))).toHaveLength(11);
    const pending = tasks.start(a.key, 'build');
    expect(tasks.get(pending.id).status).toBe('running');
    expect(tasks.list().filter((task) => task.projectKey === a.key)).toHaveLength(10);
    await tasks.settled();
  });

  test('prunes old on-disk history at startup', () => {
    const history = path.join(directory, 'tasks.json');
    fs.writeFileSync(
      history,
      JSON.stringify(
        Array.from({ length: 15 }, (_, index) => ({
          id: String(index),
          projectKey: 'alpha',
          action: 'build',
          status: 'succeeded',
          startedAt: new Date(index * 1000).toISOString(),
          output: '',
        }))
      )
    );
    const tasks = new ConsoleTasks(registry, async () => ({ ok: true }), history);
    expect(tasks.list().map((task) => task.id)).toEqual([
      '14',
      '13',
      '12',
      '11',
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
    ]);
    expect(JSON.parse(fs.readFileSync(history, 'utf8'))).toHaveLength(10);
  });

  test.each([undefined, '', '   ', '<game title, required>', ' <game title, required> '])(
    'uses the directory name with an unpublished label for title=%s',
    (title) => {
      const root = project('PixelShooter3D');
      const file = path.join(root, '.project/project.json');
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      config.taptap_publish.title = title;
      const original = JSON.stringify(config);
      fs.writeFileSync(file, original);
      const item = registry.add(root);
      expect(item.name).toBe('PixelShooter3D（未发布）');
      expect(registry.list()[0].name).toBe(item.name);
      expect(registry.resolve(item.key).name).toBe(item.name);
      expect(fs.readFileSync(file, 'utf8')).toBe(original);
    }
  );

  test('preserves an actual project title', () => {
    const item = registry.add(project('我的游戏', 'real-project-id'));
    expect(item.name).toBe('我的游戏');
    expect(item.projectid).toBe('real-project-id');
  });

  test.each([290607, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '290607'])(
    'publishes only a safe numeric current developer identity: %s',
    async (developerId) => {
      const root = project('Developer');
      const file = path.join(root, '.project/project.json');
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      config.taptap_publish.developer_id = developerId;
      fs.writeFileSync(file, JSON.stringify(config));
      expect((await registry.detail(registry.add(root).key)).config.developerId).toBe(
        developerId === 290607 ? 290607 : null
      );
    }
  );

  test('project detail exposes missing initialization before showing editable QR fields', async () => {
    const root = project('New project');
    fs.rmSync(path.join(root, '.project'), { recursive: true });
    expect((await registry.detail(registry.add(root).key)).config).toMatchObject({
      qrcodeNeedsInitialization: true,
      qrcodePreparation: { status: 'needs_initialization', action: 'build' },
    });
  });

  test('historical unavailable identity exposes recovery but cannot authorize a replacement', async () => {
    const item = registry.add(project('Unavailable developer'));
    const history = path.join(directory, 'tasks.json');
    fs.writeFileSync(
      history,
      JSON.stringify([
        {
          id: 'old-id',
          projectKey: item.key,
          action: 'qrcode',
          status: 'failed',
          error:
            '配置的开发者 ID 290607 不可用。\n\n请重新运行发布命令，系统会列出当前可用的开发者。',
        },
      ])
    );
    const execute = jest.fn(async () => ({ ok: true }));
    const tasks = new ConsoleTasks(registry, execute, history);
    expect(tasks.get('old-id')).toMatchObject({
      status: 'unknown',
      recovery: { kind: 'developer_unavailable', developerId: 290607 },
    });
    expect(tasks.get('old-id').interaction).toBeUndefined();
    expect(() =>
      tasks.start(item.key, 'qrcode', undefined, { developer_id: 123 }, true, 'old-id')
    ).toThrow();
    expect(execute).not.toHaveBeenCalled();
    tasks.start(item.key, 'qrcode', undefined, undefined, true);
    await tasks.settled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('project detail requests missing QR metadata only for an unbound app', async () => {
    const root = project('QR fields');
    const file = path.join(root, '.project/project.json');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    config.taptap_publish = { title: '', category: '', screen_orientation: 'portrait' };
    fs.writeFileSync(file, JSON.stringify(config));
    const item = registry.add(root);
    expect((await registry.detail(item.key)).config).toMatchObject({
      qrcodeNeedsTitle: true,
      qrcodeNeedsCategory: true,
    });
    config.taptap_publish.app_id = '12345';
    fs.writeFileSync(file, JSON.stringify(config));
    expect((await registry.detail(item.key)).config).toMatchObject({
      qrcodeNeedsTitle: false,
      qrcodeNeedsCategory: false,
    });
  });

  test('QR tasks retain the project and explicit orientation, and reject invalid input', async () => {
    const item = registry.add(project('QR'));
    const execute = jest.fn(async () => ({ ok: true }));
    const tasks = new ConsoleTasks(registry, execute);
    expect(() => tasks.start(item.key, 'qrcode', 'auto')).toThrow();
    expect(() => tasks.start(item.key, 'build', 'portrait')).toThrow();
    expect(() => tasks.start(item.key, 'qrcode', undefined, { category: 'sce' })).toThrow();
    expect(() => tasks.start(item.key, 'qrcode', undefined, { title: '<game>' })).toThrow();
    expect(() => tasks.start(item.key, 'build', undefined, { title: 'Game' })).toThrow();
    expect(() => tasks.start(item.key, 'qrcode', undefined, undefined, 'true')).toThrow();
    const task = tasks.start(
      item.key,
      'qrcode',
      'portrait',
      { title: 'QR', category: 'puzzle' },
      true
    );
    await tasks.settled();
    expect(task.status).toBe('succeeded');
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        project: item.path,
        action: 'qrcode',
        confirmedOrientation: 'portrait',
        publication: { title: 'QR', category: 'puzzle' },
        confirmedBuild: true,
      })
    );
  });

  test('historical QR errors support only confirmed original-project source choices', async () => {
    const item = registry.add(project('QR source'));
    const other = registry.add(project('Other'));
    const history = path.join(directory, 'tasks.json');
    const error =
      '生成测试二维码失败: 检测到多个可用的开发者身份，需要用户选择：\n\n' +
      '  1. [个人] [未认证] A (ID: 123) ⭐ 推荐\n\n请按以下步骤操作：';
    fs.writeFileSync(
      history,
      JSON.stringify([
        {
          id: 'historical',
          projectKey: item.key,
          projectName: item.name,
          action: 'qrcode',
          status: 'failed',
          error,
          output: '',
          startedAt: '2026-09-18',
        },
      ])
    );
    const execute = jest.fn(async () => ({ ok: true }));
    const tasks = new ConsoleTasks(registry, execute, history);
    expect(tasks.list()[0]).toMatchObject({
      status: 'unknown',
      interaction: { kind: 'select_developer', options: [{ value: 123 }] },
    });
    expect(execute).not.toHaveBeenCalled();
    for (const id of [0, -1, 1.5, 456, Number.MAX_SAFE_INTEGER + 1, '123']) {
      expect(() =>
        tasks.start(item.key, 'qrcode', undefined, { developer_id: id }, true, 'historical')
      ).toThrow();
    }
    expect(() =>
      tasks.start(other.key, 'qrcode', undefined, { developer_id: 123 }, true, 'historical')
    ).toThrow();
    expect(() =>
      tasks.start(item.key, 'build', undefined, { developer_id: 123 }, true, 'historical')
    ).toThrow();
    expect(() =>
      tasks.start(item.key, 'qrcode', undefined, { developer_id: 123 }, false, 'historical')
    ).toThrow();
    expect(() => tasks.start(item.key, 'qrcode', undefined, { developer_id: 123 }, true)).toThrow();
    expect(execute).not.toHaveBeenCalled();
    tasks.start(item.key, 'qrcode', undefined, { developer_id: 123 }, true, 'historical');
    await tasks.settled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        project: item.path,
        publication: { developer_id: 123 },
        confirmedBuild: true,
      })
    );
    expect(() =>
      tasks.start(item.key, 'qrcode', undefined, { developer_id: 123 }, true, 'historical')
    ).toThrow();
  });

  test('retains a failed QR sync marker after task history reload', async () => {
    const item = registry.add(project('QR reload'));
    const history = path.join(directory, 'tasks.json');
    const execute = jest.fn(async () => ({ ok: false, requiresSync: true }));
    const tasks = new ConsoleTasks(registry, execute, history);
    const task = tasks.start(item.key, 'qrcode', undefined, undefined, true);
    await tasks.settled();
    const reloaded = new ConsoleTasks(registry, execute, history);
    expect(reloaded.get(task.id)).toMatchObject({
      status: 'failed',
      result: { ok: false, requiresSync: true },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('keeps QR sync intent when the CLI exits without a verifiable result', async () => {
    const item = registry.add(project('QR interrupted'));
    const history = path.join(directory, 'tasks.json');
    const execute = jest.fn(async () => ({ ok: false, unknown: true }));
    const tasks = new ConsoleTasks(registry, execute, history);
    const task = tasks.start(item.key, 'qrcode', undefined, undefined, true);
    expect(new ConsoleTasks(registry, execute, history).get(task.id)).toMatchObject({
      status: 'unknown',
      result: { requiresSync: true },
    });
    await tasks.settled();
    expect(new ConsoleTasks(registry, execute, history).get(task.id)).toMatchObject({
      status: 'unknown',
      result: { requiresSync: true },
    });
  });

  test('clears QR sync intent when the CLI returns a verified successful result', async () => {
    const item = registry.add(project('QR synced'));
    const tasks = new ConsoleTasks(registry, async () => ({ ok: true }));
    const task = tasks.start(item.key, 'qrcode', undefined, undefined, true);
    await tasks.settled();
    expect(task.result).toEqual({ ok: true });
  });

  test('preserves QR sync intent when a failed result is too large for history', async () => {
    const item = registry.add(project('QR large failure'));
    const tasks = new ConsoleTasks(registry, async () => ({
      ok: false,
      requiresSync: true,
      output: 'x'.repeat(300 * 1024),
    }));
    const task = tasks.start(item.key, 'qrcode', undefined, undefined, true);
    await tasks.settled();
    expect(task.result).toMatchObject({ result_truncated: true, requiresSync: true });
  });

  test('folder selection requires same origin and handles cancellation, validation and concurrency', async () => {
    const picker = jest.spyOn(folderPicker, 'chooseProjectDirectory');
    const server = await startConsoleServer({
      registry,
      html: '',
      version: 'test',
      execute: async () => ({ ok: true }),
    });
    const select = (sameOrigin = true) =>
      fetch(server.origin + '/api/projects/select-folder', {
        method: 'POST',
        headers: {
          Origin: sameOrigin ? server.origin : 'https://evil.invalid',
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
    try {
      expect((await select(false)).status).toBe(403);
      expect(picker).not.toHaveBeenCalled();
      picker.mockResolvedValueOnce(null);
      expect(await (await select()).json()).toEqual({ cancelled: true });
      expect(registry.list()).toHaveLength(0);
      picker.mockRejectedValueOnce(new ConsoleError('文件夹选择窗口失败', 422));
      expect((await select()).status).toBe(422);
      picker.mockResolvedValueOnce(null);
      expect(await (await select()).json()).toEqual({ cancelled: true });
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
      const headers = {};
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
      ).toBe(403);
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

  test('allows token-free access but requires same-origin writes, never infers current project', async () => {
    const item = registry.add(project('A'));
    const server = await startConsoleServer({
      registry,
      html: '<html>console</html>',
      version: 'test',
      execute: async () => ({ ok: true }),
    });
    const auth = {};
    const write = { ...auth, Origin: server.origin, 'Content-Type': 'application/json' };
    try {
      expect((await fetch(server.origin + '/api/state')).status).toBe(200);
      expect(
        (await fetch(server.origin + '/api/state', { headers: { 'Sec-Fetch-Site': 'cross-site' } }))
          .status
      ).toBe(403);
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
      expect(await page.text()).toBe('<html>console</html>');
      expect(server).not.toHaveProperty('token');
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
