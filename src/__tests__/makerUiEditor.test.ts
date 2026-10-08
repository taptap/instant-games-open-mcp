import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConsoleProjects } from '../maker/console/projects';
import { startConsoleServer } from '../maker/console/server';
import { getConsoleHtml } from '../maker/console/web';

describe('Maker integrated UI editor', () => {
  let temporary: string;
  let registry: ConsoleProjects;
  let server: Awaited<ReturnType<typeof startConsoleServer>>;
  let root: string;
  let key: string;
  const original = JSON.stringify({ type: 'Panel', width: 400, height: 800 });
  beforeEach(async () => {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-editor-'));
    registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
    root = path.join(temporary, 'project');
    fs.mkdirSync(path.join(root, '.maker-mcp'), { recursive: true });
    fs.mkdirSync(path.join(root, '.project'));
    fs.mkdirSync(path.join(root, 'assets/ui'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: 'ui-test' })
    );
    fs.writeFileSync(
      path.join(root, '.project/project.json'),
      JSON.stringify({ taptap_publish: { title: 'UI test', screen_orientation: 'portrait' } })
    );
    fs.writeFileSync(path.join(root, 'assets/ui/main.ui.json'), original);
    key = registry.add(root).key;
    server = await startConsoleServer({
      registry,
      execute: async () => ({ ok: true }),
      html: getConsoleHtml(),
      version: 'test',
    });
  });
  afterEach(async () => {
    await server?.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const api = () => server.origin + '/api/projects/' + key + '/ui-editor/';
  const save = (body: unknown, origin = server.origin) =>
    fetch(api() + 'save', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  test('opens without a welcome page and exposes the current project only', async () => {
    const page = await fetch(server.origin + '/ui-editor/?project=' + key);
    const html = await page.text();
    expect(html).not.toContain('welcomeScreen');
    expect(html).toContain('刷新文件');
    expect(html).toContain('src="/console-theme.js"');
    const theme = await fetch(server.origin + '/console-theme.js');
    expect(theme.headers.get('content-type')).toContain('text/javascript');
    expect(await theme.text()).toContain('onThemeChange');
    expect(html).toContain('href="/console-theme.css"');
    const palette = await fetch(server.origin + '/console-theme.css');
    expect(palette.headers.get('content-type')).toContain('text/css');
    expect(await palette.text()).toContain('--yellow:#f5dc56');
    expect(page.headers.get('content-security-policy')).toContain(
      "script-src 'self' 'wasm-unsafe-eval'"
    );
    const manifest = (await (await fetch(api() + 'manifest')).json()) as any;
    expect(manifest.ui).toHaveLength(1);
    expect(manifest.ui[0].path).toContain('/' + key + '/ui-editor/files/assets/');
    expect(manifest.config.orientation).toBe('portrait');
    expect((await fetch(server.origin + manifest.ui[0].path)).ok).toBe(true);
    const missingProject = await fetch(
      server.origin + '/api/projects/' + '0'.repeat(64) + '/ui-editor/manifest'
    );
    expect(missingProject.ok).toBe(false);
  });

  test('serves a screen of concurrent resources without the project query throttle', async () => {
    const responses = await Promise.all(
      Array.from({ length: 24 }, async () => {
        const response = await fetch(api() + 'files/assets/ui/main.ui.json');
        return { status: response.status, text: await response.text() };
      })
    );
    expect(
      responses.every((response) => response.status === 200 && response.text === original)
    ).toBe(true);
  });

  test('saves atomically with a matching baseline and rejects stale editors', async () => {
    const content = JSON.stringify({ type: 'Panel', width: 500, height: 800 });
    expect(
      (await save({ path: 'assets/ui/main.ui.json', expectedText: original, content })).status
    ).toBe(200);
    expect(fs.readFileSync(path.join(root, 'assets/ui/main.ui.json'), 'utf8')).toBe(content);
    expect(
      (await save({ path: 'assets/ui/main.ui.json', expectedText: original, content: original }))
        .status
    ).toBe(409);
    expect(fs.readFileSync(path.join(root, 'assets/ui/main.ui.json'), 'utf8')).toBe(content);
    expect(fs.readdirSync(path.join(root, 'assets/ui'))).toEqual(['main.ui.json']);
  });

  test('rejects foreign origins, traversal, invalid documents and symlinks', async () => {
    const body = { path: 'assets/ui/main.ui.json', expectedText: original, content: original };
    expect((await save(body, 'https://example.org')).status).toBe(403);
    for (const filename of [
      'assets/../main.ui.json',
      '../assets/ui/main.ui.json',
      '/assets/ui/main.ui.json',
      'assets/ui/main.txt',
    ]) {
      expect((await save({ ...body, path: filename })).ok).toBe(false);
    }
    expect((await save({ ...body, content: '{}' })).status).toBe(400);
    expect((await save({ ...body, expectedText: undefined })).status).toBe(400);
    const outside = path.join(temporary, 'outside.ui.json');
    fs.writeFileSync(outside, original);
    fs.symlinkSync(outside, path.join(root, 'assets/ui/link.ui.json'));
    expect((await fetch(api() + 'files/assets/ui/link.ui.json')).status).toBe(403);
    expect((await save({ ...body, path: 'assets/ui/link.ui.json' })).status).toBe(403);
    expect(fs.readFileSync(outside, 'utf8')).toBe(original);
    const manifest = (await (await fetch(api() + 'manifest')).json()) as any;
    expect(manifest.ui).toHaveLength(1);
  });

  test('cannot save packaged examples or overwrite non-UI project files', async () => {
    const body = { expectedText: original, content: original };
    expect((await save({ ...body, path: 'examples/meowdoku/ui/level_tile.ui.json' })).ok).toBe(
      false
    );
    expect((await save({ ...body, path: 'assets/image.png' })).ok).toBe(false);
    expect(
      (await fetch(server.origin + '/ui-editor/vendor/yoga-layout/dist/src/index.js')).ok
    ).toBe(true);
    expect((await fetch(server.origin + '/ui-editor/examples/manifest.json')).ok).toBe(true);
  });
});
