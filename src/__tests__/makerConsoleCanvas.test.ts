import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';
import { ConsoleProjects } from '../maker/console/projects';
import { startConsoleServer } from '../maker/console/server';
import { getCanvasPageHtml, CANVAS_PAGE_MARKER } from '../maker/canvas/page';
import { createBrowserCanvasDocumentStore } from '../maker/canvas/store';

function makeProject(directory: string, name: string, id = name): string {
  const root = path.join(directory, name);
  fs.mkdirSync(path.join(root, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(root, '.project'), { recursive: true });
  fs.writeFileSync(path.join(root, '.maker-mcp/config.json'), JSON.stringify({ project_id: id }));
  fs.writeFileSync(
    path.join(root, '.project', 'project.json'),
    JSON.stringify({
      taptap_publish: { title: name },
    })
  );
  return root;
}

describe('Maker console canvas', () => {
  let directory: string;
  let registry: ConsoleProjects;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-canvas-http-'));
    registry = new ConsoleProjects(path.join(directory, 'registry.json'));
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test('serves a same-origin canvas page without widening the console script policy', async () => {
    const server = await startConsoleServer({
      registry,
      execute: async () => ({ ok: true }),
      html: '<script>window.keep = true;</script>',
      version: 'test',
    });
    try {
      const page = await fetch(server.origin + '/canvas');
      const csp = page.headers.get('content-security-policy') || '';
      expect(page.status).toBe(200);
      expect(await page.text()).toContain(CANVAS_PAGE_MARKER);
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).not.toContain("script-src 'self'");
      expect(csp).not.toContain('studio_token');
      expect(csp).not.toContain('blob:');
      const home = await fetch(server.origin);
      const homeCsp = home.headers.get('content-security-policy') || '';
      expect(homeCsp).toContain("frame-ancestors 'none'");
      expect(homeCsp).not.toContain('maker-canvas');
      expect(getCanvasPageHtml()).not.toContain('generate_image');
      expect(getCanvasPageHtml()).not.toContain('create_video_task');
    } finally {
      await server.close();
    }
  });

  test('loads page images through the encoded same-origin project media route', async () => {
    const html = getCanvasPageHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
    expect(script).toContain('const store = createBrowserCanvasDocumentStore(key)');
    expect(script).toContain('return store.mediaUrl(assetPath)');
    expect(script).toContain('store.importImage(canvasId');
    expect(script).toContain('store.importVideo(canvasId');
    expect(script).toContain('sequenceUi = createSequenceUiController({');
    expect(script).toContain('function sequenceActionsForCard');
    expect(script).toContain('createSequenceEditor({ controller: sequenceUi');
    expect(script).toContain('let sequenceEditor');
    expect(script).toContain('renderCard: renderSequenceResult');
    expect(script).not.toContain('function renderSequenceCard(');
    expect(script).toContain('sequenceUi.createFromVideo(node.id)');
    expect(script).toContain('maxSequenceFrameCount');
    expect(script).toContain("board.addEventListener('drop'");
    expect(script).toContain('function nextPlacement(type)');
    expect(script).toContain("add('video', nextPlacement('video'))");
    expect(script).not.toContain('createObjectURL');
    const pageScript = script.slice(script.indexOf('(function () {'));
    expect(() => new Script(pageScript)).not.toThrow();
    const assetPath = 'assets/image/hero #1.png';
    const store = createBrowserCanvasDocumentStore('project-key');
    expect(store.mediaUrl(assetPath)).toBe(
      '/api/projects/project-key/canvas-media?path=assets%2Fimage%2Fhero%20%231.png'
    );
  });

  test('imports video through the project route and serves it from the same project', async () => {
    const root = makeProject(directory, 'video');
    execFileSync('git', ['init'], { cwd: root });
    fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
    const key = registry.add(root).key;
    const server = await startConsoleServer({
      registry,
      execute: async () => ({ ok: true }),
      html: '<script>window.keep = true;</script>',
      version: 'test',
    });
    try {
      const created = await fetch(server.origin + '/api/projects/' + key + '/canvases', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.origin },
        body: JSON.stringify({ title: '视频流程' }),
      });
      const document = (await created.json()) as { id: string };
      expect(created.status).toBe(201);
      const bytes = Buffer.alloc(16);
      bytes.write('ftyp', 4, 'ascii');
      bytes.write('isom', 8, 'ascii');
      const upload = await fetch(
        server.origin + '/api/projects/' + key + '/canvases/' + document.id + '/videos',
        {
          method: 'POST',
          headers: { 'content-type': 'video/mp4', origin: server.origin },
          body: bytes,
        }
      );
      expect(upload.status).toBe(201);
      const saved = (await upload.json()) as { relativePath: string };
      expect(
        saved.relativePath.startsWith('.maker/canvases/' + document.id + '/videos/video-')
      ).toBe(true);
      const media = await fetch(
        server.origin +
          '/api/projects/' +
          key +
          '/canvas-media?path=' +
          encodeURIComponent(saved.relativePath)
      );
      expect(media.status).toBe(200);
      expect(Buffer.from(await media.arrayBuffer())).toEqual(bytes);
      const mediaUrl =
        server.origin +
        '/api/projects/' +
        key +
        '/canvas-media?path=' +
        encodeURIComponent(saved.relativePath);
      const part = await fetch(mediaUrl, { headers: { range: 'bytes=4-7' } });
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe('bytes 4-7/16');
      expect(part.headers.get('content-length')).toBe('4');
      expect(Buffer.from(await part.arrayBuffer())).toEqual(bytes.subarray(4, 8));
      const suffix = await fetch(mediaUrl, { headers: { range: 'bytes=-4' } });
      expect(suffix.status).toBe(206);
      expect(Buffer.from(await suffix.arrayBuffer())).toEqual(bytes.subarray(12));
      for (const range of ['bytes=100-', 'bytes=9-3', 'bytes=0-1,4-5', 'bytes=-0']) {
        const invalid = await fetch(mediaUrl, { headers: { range } });
        expect(invalid.status).toBe(416);
        expect(invalid.headers.get('content-range')).toBe('bytes */16');
      }
    } finally {
      await server.close();
    }
  });

  test('restores a saved canvas, isolates projects, and rejects a stale key', async () => {
    const root = makeProject(directory, 'alpha');
    execFileSync('git', ['init'], { cwd: root });
    fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
    const key = registry.add(root).key;
    const server = await startConsoleServer({
      registry,
      execute: async () => ({ ok: true }),
      html: '<script>window.keep = true;</script>',
      version: 'test',
    });
    try {
      const created = await fetch(`${server.origin}/api/projects/${key}/canvases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.origin },
        body: JSON.stringify({ title: '恢复' }),
      });
      expect(created.status).toBe(201);
      const document = (await created.json()) as { id: string };
      const selectedCanvas = await fetch(
        server.origin + '/api/projects/' + key + '/canvases/active',
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json', origin: server.origin },
          body: JSON.stringify({ canvasId: document.id }),
        }
      );
      expect(selectedCanvas.status).toBe(200);
      const other = makeProject(directory, 'beta', 'beta');
      execFileSync('git', ['init'], { cwd: other });
      fs.writeFileSync(path.join(other, '.gitignore'), '.maker\n');
      const otherKey = registry.add(other).key;
      const foreign = await fetch(
        `${server.origin}/api/projects/${otherKey}/canvases/${document.id}`
      );
      expect(foreign.status).toBe(404);
      await server.close();
      const restarted = await startConsoleServer({
        registry,
        execute: async () => ({ ok: true }),
        html: '<script>window.keep = true;</script>',
        version: 'test',
      });
      try {
        const listed = await fetch(`${restarted.origin}/api/projects/${key}/canvases`);
        expect(await listed.json()).toEqual([
          expect.objectContaining({ id: document.id, title: '恢复' }),
        ]);
        const active = await fetch(restarted.origin + '/api/projects/' + key + '/canvases/active');
        expect(await active.json()).toEqual({ canvasId: document.id });
        registry.remove(key);
        const denied = await fetch(`${restarted.origin}/api/projects/${key}/canvases`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: restarted.origin },
          body: JSON.stringify({ title: '不该写入' }),
        });
        expect(denied.status).toBe(404);
        expect(fs.existsSync(path.join(other, '.maker'))).toBe(false);
      } finally {
        await restarted.close();
      }
    } finally {
      await server.close().catch(() => undefined);
    }
  });

  test('persists and validates the selected project across console restarts', async () => {
    const root = makeProject(directory, 'remembered');
    const key = registry.add(root).key;
    const preferencesFile = path.join(directory, 'console', 'preferences.json');
    const start = () =>
      startConsoleServer({
        registry,
        execute: async () => ({ ok: true }),
        html: '',
        version: 'test',
        preferencesFile,
      });
    const server = await start();
    try {
      const saved = await fetch(server.origin + '/api/console-preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: server.origin },
        body: JSON.stringify({ selectedProjectKey: key }),
      });
      expect(saved.status).toBe(200);
      expect(fs.statSync(preferencesFile).mode & 0o777).toBe(0o600);
    } finally {
      await server.close();
    }
    const restarted = await start();
    try {
      const preference = await fetch(restarted.origin + '/api/console-preferences');
      expect(await preference.json()).toEqual({ selectedProjectKey: key });
      const stale = await fetch(restarted.origin + '/api/console-preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: restarted.origin },
        body: JSON.stringify({ selectedProjectKey: 'unknown-project-key' }),
      });
      expect(stale.status).toBe(404);
      registry.remove(key);
      const unavailable = await fetch(restarted.origin + '/api/console-preferences');
      expect(await unavailable.json()).toEqual({ selectedProjectKey: null });
    } finally {
      await restarted.close();
    }
  });
});
