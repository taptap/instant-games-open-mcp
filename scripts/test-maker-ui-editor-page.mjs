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
    { type: 'Panel', id: 'hero', backgroundImage: 'image/a b.png', width: 100, height: 100 },
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
  for (let tries = 0; tries < 50 && requested.length < 3; tries++) await page.waitForTimeout(100);
  assert.ok(requested.includes('assets/image/a b.png'), 'host asset URL resolves encoded paths');
  assert.ok(requested.includes('assets/ui/main.reference.png'), 'reference image loads');
  console.log(
    'PASS: single-page boot, host manifest/read/save, encoded asset URLs, reference image'
  );
} finally {
  await browser.close();
  server.close();
}
