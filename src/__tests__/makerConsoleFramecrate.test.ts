import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { FramecrateLauncher } from '../maker/console/integrations/framecrate.js';
import { ConsoleProjects } from '../maker/console/projects.js';
import { startConsoleServer } from '../maker/console/server.js';
import { getConsoleHtml } from '../maker/console/web.js';

describe('Maker console FrameCrate launcher', () => {
  let directory: string;
  let root: string;
  let registry: ConsoleProjects;
  const launchers: FramecrateLauncher[] = [];

  function project(name: string) {
    const directoryPath = path.join(directory, name);
    fs.mkdirSync(path.join(directoryPath, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(
      path.join(directoryPath, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: name })
    );
    return registry.add(directoryPath);
  }

  function fixture(source = '') {
    fs.writeFileSync(
      path.join(root, 'server/main.ts'),
      `
const fs = require('node:fs');
const path = require('node:path');
const projectPath = process.argv[process.argv.indexOf('--project') + 1];
fs.appendFileSync(path.join(process.cwd(), 'starts.jsonl'),
  JSON.stringify({pid:process.pid, cwd:process.cwd(), exec:process.execPath,
    args:process.execArgv, projectPath, env:process.env.FIXTURE_VALUE,
    hostOrigin:process.argv.includes('--host-origin') ? process.argv[process.argv.indexOf('--host-origin') + 1] : null}) + '\\n');
const url = 'http://127.0.0.1:12345/#studio_token=fixture-' + process.pid;
${source || 'console.log(JSON.stringify({url, projectPath}));'}
setInterval(() => {}, 1000);
`
    );
  }

  function launcher(env: NodeJS.ProcessEnv = { ...process.env, FRAMECRATE_STUDIO_DIR: root }) {
    const instance = new FramecrateLauncher({
      env: { ...env, FIXTURE_VALUE: 'inherited' },
      startTimeoutMs: 1000,
      stopTimeoutMs: 50,
    });
    launchers.push(instance);
    return instance;
  }

  function starts() {
    const file = path.join(root, 'starts.jsonl');
    return fs.existsSync(file)
      ? fs
          .readFileSync(file, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [];
  }

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-framecrate-'));
    root = path.join(directory, 'studio with spaces');
    fs.mkdirSync(path.join(root, 'server'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    fs.symlinkSync(
      path.dirname(require.resolve('tsx/package.json')),
      path.join(root, 'node_modules/tsx'),
      'junction'
    );
    registry = new ConsoleProjects(path.join(directory, 'registry.json'));
    fixture();
  });

  afterEach(async () => {
    await Promise.all(launchers.splice(0).map((instance) => instance.close()));
    for (const { pid } of starts()) expect(() => process.kill(pid, 0)).toThrow();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('requires explicit configuration and an installed source entry', async () => {
    const item = project('A');
    await expect(launcher({}).open(item.path)).rejects.toThrow('FRAMECRATE_STUDIO_DIR');
    fs.unlinkSync(path.join(root, 'server/main.ts'));
    await expect(launcher().open(item.path)).rejects.toThrow('server/main.ts');
    expect(starts()).toEqual([]);
  });

  it('allows 75 seconds by default for provider initialization before readiness', async () => {
    const instance = new FramecrateLauncher({
      env: { ...process.env, FRAMECRATE_STUDIO_DIR: root },
    });
    launchers.push(instance);
    const timer = jest.spyOn(global, 'setTimeout');
    try {
      await instance.open(project('A').path);
      expect(timer).toHaveBeenCalledWith(expect.any(Function), 75000);
    } finally {
      timer.mockRestore();
    }
  });

  it('uses the explicit Node, studio-local loader/cwd, environment and selected path', async () => {
    const item = project('game with spaces');
    const instance = launcher();
    const [first, concurrent] = await Promise.all([
      instance.open(item.path),
      instance.open(item.path),
    ]);
    expect(concurrent).toEqual(first);
    expect(await instance.open(item.path)).toEqual(first);
    expect(first).toMatchObject({ projectPath: item.path });
    expect(first.url).toContain('#studio_token=fixture-');
    expect(starts()).toEqual([
      expect.objectContaining({
        cwd: fs.realpathSync(root),
        exec: process.execPath,
        projectPath: item.path,
        args: [
          '--import',
          pathToFileURL(path.join(fs.realpathSync(root), 'node_modules/tsx/dist/loader.mjs')).href,
        ],
        env: 'inherited',
      }),
    ]);
    const second = await instance.open(project('B').path);
    expect(second.url).not.toBe(first.url);
    expect(starts()).toHaveLength(2);
  });

  it('passes the exact console origin and never reuses a session for a different host', async () => {
    const instance = launcher();
    const item = project('A');
    const hostOrigin = 'http://127.0.0.1:34567';
    const first = await instance.open(item.path, hostOrigin);
    expect(await instance.open(item.path, hostOrigin)).toEqual(first);
    expect(starts()).toEqual([expect.objectContaining({ hostOrigin })]);
    await expect(instance.open(item.path, 'http://127.0.0.1:34568')).rejects.toThrow('origin');
    expect(starts()).toHaveLength(1);
  });

  it.each(['https://evil.invalid', 'http://127.0.0.1:1234/path', 'http://127.0.0.1:1234/'])(
    'rejects a non-exact host origin before spawning: %s',
    async (hostOrigin) => {
      await expect(launcher().open(project('A').path, hostOrigin)).rejects.toThrow('origin');
      expect(starts()).toEqual([]);
    }
  );

  it.each([
    ["console.log('not json');", 'readiness'],
    ["console.log(JSON.stringify({url, projectPath:'/wrong'}));", 'readiness'],
    [
      "console.log(JSON.stringify({url:'https://evil.invalid/#studio_token=x',projectPath}));",
      'readiness',
    ],
    ["console.log(JSON.stringify({url:'http://127.0.0.1:1234/',projectPath}));", 'readiness'],
    [
      "console.log(JSON.stringify({url:'http://localhost:1234/#studio_token=x',projectPath}));",
      'readiness',
    ],
    [
      "console.log(JSON.stringify({url:'http://[::1]:1234/#studio_token=x',projectPath}));",
      'readiness',
    ],
    ["console.log('x'.repeat(20000));", 'readiness'],
    ["process.stderr.write('diagnostic secret'); process.exit(2);", 'exited'],
    ["process.on('SIGTERM', () => {});", 'timed out'],
  ])(
    'cleans failed startup without returning diagnostics or credentials: %s',
    async (source, error) => {
      fixture(source);
      await expect(launcher().open(project('A').path)).rejects.toThrow(error);
    }
  );

  it('cleans a pending launch on shutdown and refuses later launches', async () => {
    fixture("process.on('SIGTERM', () => {});");
    const instance = launcher();
    const pending = instance.open(project('A').path);
    const rejected = expect(pending).rejects.toThrow('closed');
    await instance.close();
    await rejected;
    await expect(instance.open(project('B').path)).rejects.toThrow('closed');
  });

  it('waits for ready Studio cleanup beyond one second before completing console shutdown', async () => {
    fixture(`
let signals = 0;
process.on('SIGTERM', () => {
  signals++;
  if (signals !== 1) return;
  setTimeout(() => {
    fs.writeFileSync(path.join(process.cwd(), 'drained.json'), JSON.stringify({signals}));
    process.exit(0);
  }, 1300);
});
console.log(JSON.stringify({url, projectPath}));
`);
    const instance = launcher();
    await instance.open(project('A').path);
    const server = await startConsoleServer({
      registry,
      execute: jest.fn(),
      html: '',
      version: 'test',
      plugins: [instance],
    });
    let closed = false;
    const closing = server.close().then(() => {
      closed = true;
    });
    const repeated = server.close();
    try {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(closed).toBe(false);
      expect(instance.active).toBe(true);
      const health = await fetch(`${server.origin}/api/health`, {
        headers: { Authorization: `Bearer ${server.token}` },
      });
      expect(await health.json()).toMatchObject({ draining: true });
      await Promise.all([closing, repeated, server.closed]);
      expect(JSON.parse(fs.readFileSync(path.join(root, 'drained.json'), 'utf8'))).toEqual({
        signals: 1,
      });
      expect(instance.active).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('restarts only after its own child exits', async () => {
    const instance = launcher();
    const item = project('A');
    await instance.open(item.path);
    process.kill(starts()[0].pid, 'SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await instance.open(item.path);
    expect(starts()).toHaveLength(2);
  });

  it('tracks only owned starting and running sessions until they exit', async () => {
    fixture('setTimeout(() => console.log(JSON.stringify({url, projectPath})), 50);');
    const instance = launcher();
    expect(instance.hasActiveSessions()).toBe(false);
    const pending = instance.open(project('A').path);
    expect(instance.hasActiveSessions()).toBe(true);
    await pending;
    expect(instance.hasActiveSessions()).toBe(true);
    await instance.close();
    expect(instance.hasActiveSessions()).toBe(false);
  });

  it('keeps the console alive for a Studio and resumes idle shutdown after its exit', async () => {
    const instance = launcher();
    const item = project('A');
    let now = 0;
    const onDraining = jest.fn();
    const server = await startConsoleServer({
      registry,
      execute: jest.fn(),
      html: '',
      version: 'test',
      plugins: [instance],
      idleMs: 20,
      now: () => now,
      onDraining,
    });
    try {
      const pending = instance.open(item.path);
      now = 100;
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(onDraining).not.toHaveBeenCalled();
      process.kill(starts()[0].pid, 'SIGTERM');
      await server.closed;
      expect(onDraining).toHaveBeenCalledTimes(1);
      expect(instance.hasActiveSessions()).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('still honors explicit shutdown while a Studio is alive', async () => {
    const instance = launcher();
    await instance.open(project('A').path);
    const server = await startConsoleServer({
      registry,
      execute: jest.fn(),
      html: '',
      version: 'test',
      plugins: [instance],
    });
    try {
      const response = await fetch(`${server.origin}/api/shutdown`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${server.token}`,
          Origin: server.origin,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      expect(response.status).toBe(200);
      await server.closed;
      expect(() => process.kill(starts()[0].pid, 0)).toThrow();
    } finally {
      await server.close();
    }
  });

  it('accepts chunked readiness while draining stderr without mixing the streams', async () => {
    fixture(`
process.stderr.write('diagnostics'.repeat(10000));
const line = JSON.stringify({url, projectPath});
process.stdout.write(line.slice(0, 10));
setTimeout(() => process.stdout.write(line.slice(10) + '\\n'), 20);
`);
    const item = project('A');
    await expect(launcher().open(item.path)).resolves.toMatchObject({ projectPath: item.path });
  });

  it('bounds owned studios without preventing reuse', async () => {
    const instance = launcher();
    const items = Array.from({ length: 9 }, (_, i) => project(String(i)));
    for (const item of items.slice(0, 8)) await instance.open(item.path);
    await expect(instance.open(items[8].path)).rejects.toThrow('limit');
    await expect(instance.open(items[0].path)).resolves.toMatchObject({
      projectPath: items[0].path,
    });
    expect(starts()).toHaveLength(8);
  });

  it('uses a fixed authenticated route and revalidates registration even on reuse', async () => {
    const item = project('A');
    const instance = launcher();
    const execute = jest.fn(async () => ({ ok: true }));
    const server = await startConsoleServer({
      registry,
      execute,
      html: getConsoleHtml(),
      version: 'test',
      plugins: [instance],
    });
    const route = `/api/projects/${item.key}/plugins/framecrate/open`;
    const headers = {
      Authorization: `Bearer ${server.token}`,
      Origin: server.origin,
      'Content-Type': 'application/json',
    };
    const post = (pathname = route, requestHeaders = headers) =>
      fetch(server.origin + pathname, { method: 'POST', headers: requestHeaders, body: '{}' });
    try {
      expect((await post(route, { ...headers, Authorization: '' })).status).toBe(401);
      expect((await post(route, { ...headers, Origin: 'https://evil.invalid' })).status).toBe(403);
      const badHost = await new Promise<number | undefined>((resolve, reject) => {
        const request = http.request(
          server.origin + route,
          {
            method: 'POST',
            headers: { ...headers, Host: 'evil.invalid' },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          }
        );
        request.on('error', reject);
        request.end('{}');
      });
      expect(badHost).toBe(403);
      expect((await post('/api/framecrate/open')).status).toBe(404);
      expect((await post(`/api/projects/${item.key}/framecrate/open`)).status).toBe(404);
      expect((await post(`/api/projects/${'0'.repeat(64)}/plugins/framecrate/open`)).status).toBe(
        404
      );
      expect(starts()).toHaveLength(0);
      const response = await post();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ projectPath: item.path });
      expect((await post()).status).toBe(200);
      expect(starts()).toHaveLength(1);
      expect(starts()[0].hostOrigin).toBe(server.origin);
      fs.writeFileSync(path.join(item.path, '.maker-mcp/config.json'), '{"project_id":"other"}');
      expect((await post()).status).toBe(409);
      expect(starts()).toHaveLength(1);
      expect(execute).not.toHaveBeenCalled();
      expect(
        JSON.stringify(await (await fetch(server.origin + '/api/state', { headers })).json())
      ).not.toContain('studio_token');
    } finally {
      await server.close();
    }
    expect(() => process.kill(starts()[0].pid, 0)).toThrow();
  });
});
