import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConsoleProjects } from '../maker/console/projects.js';
import { startConsoleServer } from '../maker/console/server.js';
import {
  configuredConsolePlugins,
  ConsolePlugins,
  type ConsolePluginMetadata,
} from '../maker/console/plugins.js';

const metadata = {
  id: 'framecrate',
  title: 'FrameCrate',
  icon: 'film',
  order: 100,
  requiresProject: true,
  protocolVersion: 1,
};

describe('Maker console trusted backend plugins', () => {
  let directory: string;
  let registry: ConsoleProjects;
  let item: ReturnType<ConsoleProjects['add']>;
  const servers: Awaited<ReturnType<typeof startConsoleServer>>[] = [];

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-plugins-'));
    const project = path.join(directory, 'game');
    fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(path.join(project, '.maker-mcp/config.json'), '{"project_id":"game"}');
    registry = new ConsoleProjects(path.join(directory, 'registry.json'));
    item = registry.add(project);
  });
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function plugin(id = 'framecrate', order = 100) {
    return {
      metadata: { ...metadata, id, order },
      active: false,
      open: jest.fn(async (projectPath: string, _hostOrigin: string) => ({
        url: 'http://127.0.0.1:34567/#plugin_token=secret',
        projectPath,
      })),
      close: jest.fn(async () => {}),
    };
  }

  async function start(plugins?: ReturnType<typeof plugin>[], extra = {}) {
    const server = await startConsoleServer({
      registry,
      execute: async () => ({ ok: true }),
      html: '<html></html>',
      version: 'test',
      ...(plugins ? { plugins } : {}),
      ...extra,
    });
    servers.push(server);
    const headers = {
      Authorization: `Bearer ${server.token}`,
      Origin: server.origin,
      'Content-Type': 'application/json',
    };
    return {
      server,
      state: async (): Promise<{ plugins: ConsolePluginMetadata[] }> =>
        (await fetch(server.origin + '/api/state', { headers })).json() as Promise<{
          plugins: ConsolePluginMetadata[];
        }>,
      post: (id = 'framecrate', key = item.key, body = {}) =>
        fetch(`${server.origin}/api/projects/${key}/plugins/${id}/open`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }),
    };
  }

  it('advertises FrameCrate without launching it and allows only loopback iframe sources', async () => {
    const { server, state } = await start([plugin()]);
    expect((await state()).plugins).toEqual([metadata]);
    const page = await fetch(server.origin);
    const csp = page.headers.get('content-security-policy')!;
    expect(csp.split('; ')).toContain('frame-src http://127.0.0.1:*');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
  });

  it('keeps optional FrameCrate registration hidden until its Studio is configured', () => {
    expect(configuredConsolePlugins({})).toEqual([]);
    expect(configuredConsolePlugins({ FRAMECRATE_STUDIO_DIR: '/tmp/framecrate' })).toHaveLength(1);
  });

  it.each([
    { id: 'a'.repeat(49) },
    { title: '' },
    { title: '   ' },
    { title: 'a'.repeat(81) },
    { title: 123 },
    { protocolVersion: 2 },
    { protocolVersion: '1' },
    { requiresProject: false },
    { requiresProject: 'true' },
    { order: NaN },
    { order: Infinity },
    { order: -Infinity },
    { order: '100' },
  ])('rejects metadata the host cannot use at registration: %j', (invalid) => {
    const integration = plugin();
    Object.assign(integration.metadata, invalid);
    expect(() => new ConsolePlugins(registry, [integration])).toThrow();
    expect(integration.open).not.toHaveBeenCalled();
  });

  it('accepts host boundary metadata and a generic fragment without requiring a Studio token', async () => {
    const integration = plugin('a'.repeat(48), -0.5);
    integration.metadata.title = 'a'.repeat(80);
    integration.open.mockImplementation(async (projectPath) => ({
      url: 'http://127.0.0.1:34567/#opaque-token',
      projectPath,
    }));
    const { post, state } = await start([integration]);
    expect((await state()).plugins).toEqual([integration.metadata]);
    expect((await post(integration.metadata.id)).status).toBe(200);
    expect((await post('a'.repeat(49))).status).toBe(404);
    expect(integration.open).toHaveBeenCalledTimes(1);
  });

  it('dispatches registered ids with the resolved project and exact console origin only', async () => {
    const first = plugin();
    const second = plugin('trusted-editor', 50);
    const { server, state, post } = await start([first, second]);
    expect((await state()).plugins).toEqual([second.metadata, first.metadata]);
    expect(first.open).not.toHaveBeenCalled();
    const response = await post('trusted-editor', item.key, {
      projectPath: '/arbitrary',
      hostOrigin: 'https://evil.invalid',
      command: 'open',
      url: 'https://evil.invalid',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'http://127.0.0.1:34567/#plugin_token=secret',
      projectPath: item.path,
    });
    expect(second.open).toHaveBeenCalledWith(item.path, server.origin);
    expect(first.open).not.toHaveBeenCalled();
    expect(JSON.stringify(await state())).not.toContain('plugin_token');
  });

  it('rejects unknown/prototype ids and missing projects before any plugin launch', async () => {
    const integration = plugin();
    const { post } = await start([integration]);
    for (const id of ['missing', 'constructor', '__proto__', 'toString']) {
      expect((await post(id)).status).toBe(404);
    }
    expect((await post('framecrate', '0'.repeat(64))).status).toBe(404);
    expect(integration.open).not.toHaveBeenCalled();
  });

  it.each([
    'https://evil.invalid/#secret=x',
    'http://localhost:1234/#secret=x',
    'http://[::1]:1234/#secret=x',
    'http://127.0.0.1.evil.invalid:1234/',
    'http://user:secret@127.0.0.1:1234/',
    'javascript:alert(1)',
    'http://127.0.0.1:1234/editor#secret=x',
    'http://127.0.0.1:1234/?secret=x#token',
    'http://127.0.0.1:1234/',
    'http://127.0.0.1:1234/#',
  ])('rejects plugin iframe URLs outside the CSP boundary: %s', async (url) => {
    const integration = plugin();
    integration.open.mockImplementation(async (projectPath) => ({ url, projectPath }));
    const { post } = await start([integration]);
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain(url);
  });

  it('rejects project mismatch and revalidates a project changed during startup', async () => {
    const integration = plugin();
    integration.open.mockImplementationOnce(async () => ({
      url: 'http://127.0.0.1:1234/',
      projectPath: '/wrong',
    }));
    const { post } = await start([integration]);
    expect((await post()).status).toBe(409);
    integration.open.mockImplementationOnce(async (projectPath) => {
      fs.writeFileSync(
        path.join(projectPath, '.maker-mcp/config.json'),
        '{"project_id":"changed"}'
      );
      return { url: 'http://127.0.0.1:1234/', projectPath };
    });
    expect((await post()).status).toBe(409);
  });

  it('uses generic activity for idle lifetime and closes every plugin exactly once', async () => {
    const first = plugin();
    const second = plugin('trusted-editor');
    first.active = true;
    let now = 0;
    const onDraining = jest.fn();
    const { server } = await start([first, second], { idleMs: 20, now: () => now, onDraining });
    now = 100;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onDraining).not.toHaveBeenCalled();
    first.active = false;
    await server.closed;
    await server.close();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate registration and discards readiness arriving during shutdown', async () => {
    const first = plugin();
    const second = plugin('trusted-editor');
    expect(() => new ConsolePlugins(registry, [first, first])).toThrow('duplicate');
    let ready!: (value: { url: string; projectPath: string }) => void;
    first.open.mockImplementation(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        })
    );
    first.close.mockImplementation(async () => {
      ready({ url: 'http://127.0.0.1:1234/#token=private', projectPath: item.path });
    });
    const plugins = new ConsolePlugins(registry, [first, second]);
    const pending = plugins.open('framecrate', item.key, 'http://127.0.0.1:34567');
    const rejected = expect(pending).rejects.toMatchObject({ status: 503 });
    await plugins.close();
    await rejected;
    await plugins.close();
    await expect(
      plugins.open('framecrate', item.key, 'http://127.0.0.1:34567')
    ).rejects.toMatchObject({ status: 503 });
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
  });
});
