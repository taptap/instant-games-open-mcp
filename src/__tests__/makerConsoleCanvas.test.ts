import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { ConsoleProjects } from '../maker/console/projects';
import { startConsoleServer } from '../maker/console/server';
import { getCanvasPageHtml, CANVAS_PAGE_MARKER } from '../maker/canvas/page';
import { createBrowserCanvasDocumentStore } from '../maker/canvas/store';
import { sequenceActionsForCard } from '../maker/canvas/sequence';
import { canvasParameterSchema } from '../maker/canvas/automationInfo';

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
      const html = await page.text();
      const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
      const directives = new Map(
        csp.split(';').map((directive) => {
          const [name, ...sources] = directive.trim().split(/\s+/);
          return [name, sources.join(' ')];
        })
      );
      expect(page.status).toBe(200);
      expect(html).toContain(CANVAS_PAGE_MARKER);
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).not.toContain("script-src 'self'");
      expect(csp).not.toContain('studio_token');
      expect(directives.get('default-src')).toBe("'none'");
      expect(directives.get('script-src')).toBe(
        "'sha256-" + createHash('sha256').update(script).digest('base64') + "'"
      );
      expect(directives.get('img-src')).toBe("'self' data: blob:");
      for (const name of ['media-src', 'connect-src', 'frame-src'])
        expect(directives.get(name)).toBe("'self'");
      for (const name of ['base-uri', 'form-action']) expect(directives.get(name)).toBe("'none'");
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
    expect(script).toContain('store.importVideo(canvasId');
    expect(script).toContain('sequenceUi = createSequenceUiController({');
    expect(script.includes(sequenceActionsForCard.toString())).toBe(true);
    expect(script.includes(canvasParameterSchema.toString())).toBe(true);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(() => new Script(script)).not.toThrow();
    expect(script).toContain(
      'createSequenceEditor({ maxFrames: MAX_SEQUENCE_FRAMES, controller: sequenceUi'
    );
    expect(script).toContain('let sequenceEditor');
    expect(script).toContain('renderCard: renderSequenceResult');
    expect(script).not.toContain('function renderSequenceCard(');
    expect(script).toContain('sequenceUi.createFromVideo(node.id)');
    expect(script).toContain('maxSequenceFrameCount');
    expect(script).not.toContain("board.addEventListener('drop'");
    expect(script).toContain('function nextPlacement(type)');
    expect(script).toContain("add('video', pendingPlacement || nextPlacement('video'))");
    expect(script).toContain("kind: 'image-variant'");
    expect(html).toContain('id="create-section"');
    expect(html).toContain('id="duplicate-selected"');
    expect(script).toContain('exportCanvasPng');
    expect(script).toContain('function createImageSlot(source)');
    expect(html).toContain('新建空白画布');
    expect(html).not.toContain('新建序列帧模板画布');
    expect(html).toContain('id="add-template"');
    expect(html).toContain('id="canvas-context-menu"');
    expect(html).toContain('新建图片卡片');
    expect(html).toContain('新建视频卡片');
    expect(html).not.toContain('data-canvas-action="add-image"');
    expect(html).not.toContain('data-canvas-action="add-video-source"');
    expect(html).toContain('id="undo"');
    expect(html).toContain('id="redo"');
    expect(script).toContain("board.addEventListener('contextmenu'");
    expect(script).toContain("card.addEventListener('dragstart'");
    expect(script).not.toContain('图片生成方式');
    expect(script).toContain('generationUi.render(panel, panelNode');
    expect(script).toContain('function requestImageImport(nodeId)');
    expect(script).toContain('store.importImage(request.canvasId');
    expect(html).toContain('id="selection-toolbar"');
    expect(html).toContain("className = 'image-empty'");
    expect(script).not.toContain("button('生成变体'");
    expect(script).not.toContain("button('扩展画面'");
    const mediaLoader = script.match(/async function loadMedia\(assetPath\) \{([\s\S]*?)\n {2}\}/);
    expect(mediaLoader).not.toBeNull();
    expect(mediaLoader![1]).not.toContain('createObjectURL');
    const pageScript = script.slice(script.indexOf('(function () {'));
    expect(() => new Script(pageScript)).not.toThrow();
    expect(pageScript).not.toMatch(/\bimport_[A-Za-z0-9_$]+\./);
    const assetPath = 'assets/image/hero #1.png';
    const store = createBrowserCanvasDocumentStore('project-key');
    expect(store.mediaUrl(assetPath)).toBe(
      '/api/projects/project-key/canvas-media?path=assets%2Fimage%2Fhero%20%231.png'
    );
  });

  test.each([
    { assetPath: undefined, selectionAction: '', opens: true, blocked: '' },
    { assetPath: 'assets/hero.png', selectionAction: '', opens: false, blocked: '' },
    { assetPath: 'assets/hero.png', selectionAction: 'image', opens: true, blocked: '' },
    { assetPath: 'assets/hero.png', selectionAction: 'outpaint', opens: true, blocked: '' },
    { assetPath: undefined, selectionAction: '', opens: false, blocked: 'model' },
    { assetPath: 'assets/hero.png', selectionAction: 'image', opens: false, blocked: 'generation' },
    {
      assetPath: 'assets/hero.png',
      selectionAction: 'outpaint',
      opens: false,
      blocked: 'template-loading',
    },
    { assetPath: undefined, selectionAction: '', opens: false, blocked: 'template-locked' },
    {
      assetPath: 'assets/hero.png',
      selectionAction: 'image',
      opens: false,
      blocked: 'remote-unknown',
    },
  ])(
    'shows the image prompt for the selection: $assetPath / $selectionAction / $blocked',
    ({ assetPath, selectionAction, opens, blocked }) => {
      const html = getCanvasPageHtml();
      const handler = html.match(/function renderSelectionToolbar\(\) \{([\s\S]*?)\n {4}\}/);
      expect(handler).not.toBeNull();
      const node = { id: 'image-slot', type: 'image', assetPath };
      const generationUi = {
        render: jest.fn(),
        isNodeBusy: jest.fn(() => blocked === 'generation'),
        nodeState: jest.fn(() =>
          blocked === 'remote-unknown' ? { status: 'unknown' } : undefined
        ),
      };
      const modelUi = { protects: jest.fn(() => blocked === 'model') };
      const templateWorkflow = {
        isNodeLoading: jest.fn(() => blocked === 'template-loading'),
        isMember: jest.fn(() => false),
        locked: jest.fn(() => blocked === 'template-locked'),
      };
      const selectionToolbar = { replaceChildren: jest.fn(), append: jest.fn(), hidden: true };
      const selectionMenu = { replaceChildren: jest.fn(), append: jest.fn(), hidden: true };
      const document = {
        createElement: () => ({
          append: jest.fn(),
          addEventListener: jest.fn(),
          setAttribute: jest.fn(),
        }),
      };
      new Script('(function () {' + handler![1] + '})();').runInNewContext({
        document,
        documentState: { nodes: [node] },
        selected: new Set([node.id]),
        selectionAction,
        selectionToolbar,
        selectionMenu,
        generationUi,
        modelUi,
        templateWorkflow,
        positionSelectionToolbar: jest.fn(),
      });
      expect(selectionMenu.hidden).toBe(!assetPath || Boolean(blocked));
      expect(selectionMenu.append).toHaveBeenCalledTimes(blocked ? 0 : 1);
      expect(selectionToolbar.hidden).toBe(!opens);
      expect(generationUi.render).toHaveBeenCalledTimes(opens ? 1 : 0);
      if (opens)
        expect(generationUi.render).toHaveBeenCalledWith(
          expect.anything(),
          node,
          [node],
          selectionAction === 'outpaint' ? 'outpaint' : undefined,
          undefined
        );
      expect(html).toContain('width: 84px; height: 84px;');
    }
  );

  test.each([
    { anchor: { left: 100, top: 80, right: 460, bottom: 300 }, left: '100px', top: '312px' },
    { anchor: { left: 100, top: 470, right: 460, bottom: 690 }, left: '472px', top: '458px' },
    { anchor: { left: 600, top: 470, right: 960, bottom: 690 }, left: '148px', top: '458px' },
  ])(
    'anchors the generation panel next to the selected card: $left / $top',
    ({ anchor, left, top }) => {
      const html = getCanvasPageHtml();
      expect(html).toContain('<div id="board"><div id="selection-menu" role="toolbar"');
      const handler = html.match(/function positionSelectionToolbar\(\) \{([\s\S]*?)\n {2}\}/);
      expect(handler).not.toBeNull();
      const style = { left: '', top: '' };
      const menuStyle = { left: '', top: '' };
      new Script('(function () {' + handler![1] + '})();').runInNewContext({
        selectionToolbar: { hidden: false, style, offsetWidth: 440, offsetHeight: 230 },
        selectionMenu: { hidden: false, style: menuStyle, offsetWidth: 320, offsetHeight: 40 },
        world: {
          querySelector: () => ({
            getBoundingClientRect: () => ({ ...anchor, width: anchor.right - anchor.left }),
          }),
        },
        board: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }) },
      });
      expect(style.left).toBe(left);
      expect(style.top).toBe(top);
      expect(menuStyle.left).toBe(anchor.left + 20 + 'px');
      expect(menuStyle.top).toBe(anchor.top - 52 + 'px');
    }
  );

  test.each([
    { value: '  新名称  ', title: '新名称', changed: true, error: '' },
    { value: null, title: '原名称', changed: false, error: undefined },
    { value: '  ', title: '原名称', changed: false, error: '画布名称不能为空。' },
    { value: '原名称', title: '原名称', changed: false, error: undefined },
  ])('renames the canvas from its title icon: $value', ({ value, title, changed, error }) => {
    const html = getCanvasPageHtml();
    expect(html).toContain('<strong id="canvas-title">创作画布</strong><button id="rename-canvas"');
    expect(html).toContain('aria-label="修改画布名称"');
    expect(html.match(/id="rename-canvas"/g)).toHaveLength(1);
    expect(html).not.toContain('#rename-canvas, #add-image');
    const handler = html.match(
      /document\.getElementById\('rename-canvas'\)\.addEventListener\('click', function \(\) \{([\s\S]*?)\n {2}\}\);/
    )?.[1];
    expect(handler).toBeTruthy();
    const documentState = { title: '原名称' };
    const heading = { textContent: '原名称' };
    const option = { textContent: '原名称' };
    const remember = jest.fn();
    const markDirty = jest.fn();
    const setError = jest.fn();
    new Script('(function () {' + handler + '})();').runInNewContext({
      documentState,
      window: { prompt: () => value },
      document: { getElementById: () => heading },
      select: { options: [option], selectedIndex: 0 },
      remember,
      markDirty,
      setError,
    });
    expect(documentState.title).toBe(title);
    expect(heading.textContent).toBe(title);
    expect(option.textContent).toBe(title);
    expect(remember).toHaveBeenCalledTimes(changed ? 1 : 0);
    expect(markDirty).toHaveBeenCalledTimes(changed ? 1 : 0);
    if (error !== undefined) expect(setError).toHaveBeenCalledWith(error);
    else expect(setError).not.toHaveBeenCalled();
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
      const preferencesStat = fs.statSync(preferencesFile);
      expect(preferencesStat.isFile()).toBe(true);
      expect(JSON.parse(fs.readFileSync(preferencesFile, 'utf8'))).toEqual({
        schema: 1,
        selectedProjectKey: key,
      });
      if (process.platform !== 'win32') expect(preferencesStat.mode & 0o777).toBe(0o600);
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
