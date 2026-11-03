// Browser check of the single-page UI editor with a stub host (no console server).
//   node scripts/test-maker-ui-editor-page.mjs   (Playwright as in test-maker-ui-editor.mjs)
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { buildUiEditorPageHtml } from './build-maker-ui-editor-page.mjs';

const hostScript = `
window.UrhoxHost = {
  fileRoot: "/files?path=",
  initialUi: "assets/ui/main.ui.json",
  manifest: async function () {
    function item(p, kind) {
      return { path: "/files?path=" + p.split("/").map(encodeURIComponent).join("/"), name: p.split("/").pop(),
        dir: p.split("/").slice(0, -1).join("/"), kind: kind, ref: p.replace(/^assets\\//, ""),
        assetRoot: "/files?path=assets/", hasMeta: true };
    }
    return { name: "page", ui: [item("assets/ui/main.ui.json", "ui")],
      assets: [item("assets/image/a b.png", "image"), item("assets/ui/main.reference.png", "image")],
      config: { orientation: "portrait" } };
  },
  readText: async function (url) {
    var response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.text();
  },
  save: async function (path, text, expectedText) {
    window.__saved = { path: path, text: text, expectedText: expectedText };
    return { ok: true };
  },
};`;
const html = await buildUiEditorPageHtml({ hostScript, themeStyles: ':root{--bg:#121516}' });
for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(match[1]);
assert.doesNotMatch(html, /type="module"|<script src=|href="src\//);
assert.doesNotMatch(html, /console-theme/);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);
const documentText = JSON.stringify({
  type: 'Panel',
  width: 400,
  height: 800,
  children: [
    {
      type: 'Panel',
      id: 'hero',
      position: 'absolute',
      left: 0,
      top: 0,
      backgroundImage: 'image/a b.png',
      width: 100,
      height: 100,
    },
    {
      type: 'Panel',
      id: 'second',
      position: 'absolute',
      left: 120,
      top: 0,
      width: 100,
      height: 100,
    },
    {
      type: 'NanoVG',
      id: 'vector',
      width: 80,
      height: 80,
      viewBox: [0, 0, 80, 80],
      commands: [['beginPath'], ['rect', 0, 0, 20, 20], ['fillColor', '#ff0000'], ['fill']],
    },
  ],
});
const requested = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.end(html);
  }
  const file = url.pathname === '/files' ? url.searchParams.get('path') : null;
  if (file) requested.push(file);
  if (file === 'assets/ui/main.ui.json') {
    response.setHeader('Content-Type', 'application/json');
    return response.end(documentText);
  }
  if (file === 'assets/image/a b.png' || file === 'assets/ui/main.reference.png') {
    response.setHeader('Content-Type', 'image/png');
    return response.end(png);
  }
  response.statusCode = 404;
  response.end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const modulePath =
  process.env.PLAYWRIGHT_MODULE ||
  path.join(
    execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
    'playwright/index.mjs'
  );
const { chromium } = await import(pathToFileURL(modulePath));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.waitForFunction(() => window.UrhoxPreview && window.UrhoxPreview.tree, null, {
    timeout: 15000,
  });
  await page.waitForFunction(() =>
    document.getElementById('currentDocument').textContent.includes('main')
  );
  const state = await page.evaluate(async () => ({
    files: window.UrhoxProject.get().files.length,
    current: document.getElementById('currentDocument').textContent,
    saved: await window.UrhoxSave.write(
      window.UrhoxProject.get().files[0].path,
      '{"type":"Panel"}',
      'base'
    ),
    host: window.__saved,
  }));
  assert.deepEqual(errors, []);
  assert.equal(state.files, 1);
  assert.match(state.current, /assets\/ui\/main\.ui\.json/);
  assert.deepEqual(state.saved, { ok: true, mode: 'maker' });
  assert.deepEqual(state.host, {
    path: 'assets/ui/main.ui.json',
    text: '{"type":"Panel"}',
    expectedText: 'base',
  });
  const importedIds = await page.evaluate(() => {
    const api = window.UrhoxPreview;
    for (let i = 0; i < 3; i++) api.placeImage('image/a b.png');
    const images = api.tree.children.slice(-3);
    return { ids: images.map(node => node.id), refs: images.map(node => node.backgroundImage),
      errors: window.UrhoxUICheck.checkDocument({ tree: api.getJSON() }).errors };
  });
  assert.deepEqual(importedIds.ids, ['image', 'image_2', 'image_3']);
  assert.deepEqual(importedIds.refs, Array(3).fill('image/a b.png'));
  assert.equal(importedIds.errors, 0);
  await page.evaluate(() => {
    const api = window.UrhoxPreview;
    api.undo(); api.undo(); api.undo();
  });
  await page.evaluate(() => window.UrhoxPreview.selectNode(window.UrhoxPreview.tree.children[0]));
  const nodeName = page.locator('[data-field="id"] input');
  await nodeName.fill('second');
  await nodeName.press('Tab');
  await page.waitForSelector('#checkUiBtn.has-ui-errors');
  assert.match(await page.locator('#checkUiBtn').getAttribute('aria-label'), /个错误/);
  await page.click('#checkUiBtn');
  assert.match(await page.locator('#uiCheckSummary').textContent(), /[1-9] 个错误/);
  await page.click('#closeCheckReport');
  await nodeName.fill('hero');
  await nodeName.press('Tab');
  await page.waitForSelector('#checkUiBtn:not(.has-ui-errors)');
  assert.equal(await page.locator('#checkUiBtn').getAttribute('aria-label'), '检查 UI');
  const transforms = await page.evaluate(() => {
    const api = window.UrhoxPreview;
    const input = document.getElementById('selectionRotation');
    const defaultToolbar = !!input.closest('.transform-toolbar');
    window.UrhoxHost.layout = { inspectorTransforms: true };
    api.selectNode(api.tree.children[0], true);
    const inRect = input.closest('.insp-group').textContent.includes('Rect Transform');
    const enabled = !input.disabled;
    input.value = '20';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const rotation = Number(input.value);
    api.selectNode(null);
    const parked = !!input.closest('.transform-toolbar') && input.disabled;
    api.selectNode(api.tree.children[0], true);
    api.selectNode(api.tree.children[1], true, true);
    const multi =
      !input.disabled && input.closest('.insp-group').textContent.includes('Rect Transform');
    const scale = document.getElementById('selectionScale');
    scale.value = '150';
    scale.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      defaultToolbar,
      inRect,
      enabled,
      rotation,
      parked,
      multi,
      sameInput: input === document.getElementById('selectionRotation'),
      scale: api.tree.children[0].scale,
    };
  });
  assert.deepEqual(transforms, {
    defaultToolbar: true,
    inRect: true,
    enabled: true,
    rotation: 20,
    parked: true,
    multi: true,
    sameInput: true,
    scale: 1.5,
  });
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.UrhoxPreview.selectNode(window.UrhoxPreview.tree.children[0], true));
  const positionBefore = await page.evaluate(() => {
    const n = window.UrhoxPreview.selected;
    return { left: n.left, top: n.top, width: n.width, height: n.height };
  });
  await page.locator('[data-field="visible"] input').uncheck();
  assert.equal(await page.locator('#selectionRotation').isEnabled(), true);
  assert.equal(await page.locator('#selectionScale').isEnabled(), true);
  assert.equal(await page.locator('#transformStatus').textContent(), '');
  await page.evaluate(() => {
    for (const [id, value] of [['selectionRotation', '45'], ['selectionScale', '125']]) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  assert.deepEqual(await page.evaluate(() => {
    const n = window.UrhoxPreview.selected;
    return { left: n.left, top: n.top, width: n.width, height: n.height, rotate: n.rotate, scale: n.scale, visible: n.visible };
  }), { ...positionBefore, rotate: 45, scale: 1.25, visible: false });
  await page.evaluate(() => window.UrhoxPreview.undo());
  assert.equal(await page.locator('#selectionScale').inputValue(), '150');
  await page.evaluate(() => window.UrhoxPreview.redo());
  assert.equal(await page.locator('#selectionScale').inputValue(), '125');
  await page.locator('[data-field="visible"] input').check();
  assert.equal(await page.locator('#selectionRotation').isEnabled(), true);
  const snapshot = await page.evaluate(() => {
    const before = window.UrhoxProject.listDocuments();
    before[0].name = 'mutated';
    return window.UrhoxProject.listDocuments()[0];
  });
  assert.equal(snapshot.name, 'main.ui.json');
  assert.equal(snapshot.displayPath, 'assets/ui/main.ui.json');
  await page.evaluate(() =>
    window.UrhoxPreview.selectNode(window.UrhoxPreview.tree.children[2], true)
  );
  const commands = page.locator('[data-field="commands"] textarea');
  await page.getByText('4 条指令', { exact: true }).click();
  const changedCommands = JSON.stringify([
    ['beginPath'],
    ['rect', 0, 0, 30, 30],
    ['fillColor', '#ff0000'],
    ['fill'],
    ['beginPath'],
  ]);
  await commands.fill(changedCommands);
  // Blur must not rebuild and swallow the click intended for another tree row.
  await page.locator('.tree-row').nth(1).click();
  assert.equal(await page.evaluate(() => window.UrhoxPreview.selected.id), 'hero');
  assert.equal(await page.evaluate(() => window.UrhoxPreview.tree.children[2].commands.length), 5);
  await page.evaluate(() => window.UrhoxPreview.undo());
  assert.equal(await page.evaluate(() => window.UrhoxPreview.tree.children[2].commands.length), 4);
  await page.evaluate(() => window.UrhoxPreview.redo());
  assert.equal(await page.evaluate(() => window.UrhoxPreview.tree.children[2].commands.length), 5);
  await page.evaluate(() =>
    window.UrhoxPreview.selectNode(window.UrhoxPreview.tree.children[2], true)
  );
  await page.getByText('5 条指令', { exact: true }).click();
  await commands.fill('[bad json');
  await commands.press('Tab');
  assert.equal(await page.evaluate(() => window.UrhoxPreview.selected.commands.length), 5);
  assert.match(
    await page.locator('[data-field="commands"] [role="status"]').textContent(),
    /未应用/
  );
  await commands.press('Escape');
  await commands.fill('[["unknownCommand"]]');
  await commands.press('Tab');
  assert.equal(await page.evaluate(() => window.UrhoxPreview.selected.commands.length), 5);
  assert.match(
    await page.locator('[data-field="commands"] [role="status"]').textContent(),
    /未应用/
  );
  await commands.press('Escape');
  const safeFit = await page.evaluate(() => {
    const preview = document.getElementById('preview');
    window.UrhoxHost.previewViewport = () => ({
      left: 100,
      top: 20,
      width: preview.clientWidth - 100,
      height: preview.clientHeight - 60,
    });
    window.UrhoxView.fit();
    const canvas = document.getElementById('stage');
    const box = canvas.getBoundingClientRect(),
      area = preview.getBoundingClientRect();
    const z = window.UrhoxView.getZoom();
    const left = box.left + Number(canvas.dataset.originX || 0) * z;
    const top = box.top + Number(canvas.dataset.originY || 0) * z;
    const right = box.right - Number(canvas.dataset.originX || 0) * z;
    const bottom = box.bottom - Number(canvas.dataset.originY || 0) * z;
    return (
      left >= area.left + 100 &&
      top >= area.top + 20 &&
      right <= area.right &&
      bottom <= area.bottom - 40
    );
  });
  assert.equal(safeFit, true);
  const marquee = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 100;
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100px;height:100px';
    document.getElementById('preview').appendChild(canvas);
    const app = { canvas, ctx: canvas.getContext('2d'),
      tree: { type: 'Panel', width: 100, height: 100, _layout: { x: 0, y: 0, w: 100, h: 100 } },
      screen: { width: 100, height: 100 }, device: { bezel: 0 },
      origin: () => ({ x: 0, y: 0 }), contentTransform: () => ({ x: 0, y: 0, scale: 1 }),
      selectedNodes: [], marquee: { x: 20, y: 20, w: 200, h: 200 } };
    document.documentElement.style.setProperty('--editor-selection-width', '2');
    window.UrhoxCanvas.draw(app);
    const rect = app.marqueeLayer.firstChild;
    const result = { width: rect.getBoundingClientRect().width,
      stageWidth: canvas.getBoundingClientRect().width, stroke: rect.getAttribute('stroke-width') };
    app.marquee = null;
    window.UrhoxCanvas.draw(app);
    result.hidden = app.marqueeLayer.style.display === 'none';
    app.marqueeLayer.remove();
    canvas.remove();
    document.documentElement.style.removeProperty('--editor-selection-width');
    return result;
  });
  assert.equal(marquee.width, 200);
  assert.equal(marquee.stageWidth, 100);
  assert.equal(marquee.stroke, '2');
  assert.equal(marquee.hidden, true);
  const frames = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1400;
    const ctx = canvas.getContext('2d');
    const tree = { type: 'Panel', width: 1000, height: 1000, _layout: { x: 0, y: 0, w: 1000, h: 1000 } };
    const app = { canvas, ctx, tree, screen: { width: 1000, height: 1000 }, device: { bezel: 24 },
      origin: () => ({ x: 200, y: 200 }), contentTransform: () => ({ x: 0, y: 0, scale: 1 }), selectedNodes: [] };
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    window.UrhoxCanvas.draw(app);
    const defaults = { center: pixel(700, 700), bezel: pixel(190, 700) };
    const vars = { '--editor-screen-bg': 'white', '--editor-frame-line': 'rgba(0,0,0,.08)',
      '--editor-frame-shadow': 'rgba(0,0,0,.1)', '--editor-bezel': '0' };
    for (const [key, value] of Object.entries(vars)) document.documentElement.style.setProperty(key, value);
    const samples = [];
    for (const mode of ['page', 'prefab']) {
      app.editMode = mode;
      for (const zoom of [0.25, 1, 2]) {
        window.UrhoxView.setZoom(zoom);
        window.UrhoxCanvas.draw(app);
        samples.push({ mode, zoom, center: pixel(700, 700),
          shadow: pixel(200 - Math.round(4 / zoom), 700),
          clear: ctx.shadowBlur === 0 && ctx.shadowOffsetY === 0 });
      }
    }
    for (const key of Object.keys(vars)) document.documentElement.style.removeProperty(key);
    window.UrhoxView.fit();
    return { defaults, samples };
  });
  assert.equal(frames.defaults.center[3], 0);
  assert.ok(frames.defaults.bezel[3] > 100);
  for (const sample of frames.samples) {
    assert.deepEqual(sample.center, [255, 255, 255, 255]);
    assert.ok(sample.shadow[3] > 0 && sample.shadow[3] < 100);
    assert.equal(sample.clear, true);
  }
  assert.ok(Math.abs(frames.samples[0].shadow[3] - frames.samples[2].shadow[3]) <= 3);
  assert.deepEqual(errors, []);
  for (let tries = 0; tries < 50 && requested.length < 3; tries++) await page.waitForTimeout(100);
  assert.ok(requested.includes('assets/image/a b.png'), 'host asset URL resolves encoded paths');
  assert.ok(requested.includes('assets/ui/main.reference.png'), 'reference image loads');
  console.log(
    'PASS: single-page host, document snapshots, inspector transforms, NanoVG blur/validation/undo, safe fit, asset URLs'
  );
} finally {
  await browser.close();
  server.close();
}
