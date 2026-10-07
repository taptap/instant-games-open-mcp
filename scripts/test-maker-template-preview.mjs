import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-template-preview-'));
let browser, server, page;
let paidRequests = 0;
const browserErrors = [];
try {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  const playwright = await import(
    process.env.PLAYWRIGHT_MODULE || pathToFileURL(path.join(root, 'playwright/index.mjs')).href
  );
  const bundle = path.join(temporary, 'harness.mjs');
  await build({
    stdin: {
      contents:
        'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { MakerCanvasFiles } from "./src/maker/canvas/files.ts"; export { snapshotCanvasSource } from "./src/maker/canvas/dependencies.ts";',
      resolveDir: repo,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    external: ['./native/index.js'],
    logLevel: 'silent',
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
  });
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles, snapshotCanvasSource } =
    await import(pathToFileURL(bundle).href);
  const project = path.join(temporary, 'project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.maker-mcp/config.json'),
    JSON.stringify({ project_id: 'canvas-ui-test' })
  );
  fs.writeFileSync(
    path.join(project, '.project/project.json'),
    JSON.stringify({ taptap_publish: { title: '画布自动验收' } })
  );
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker' + String.fromCharCode(10));
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  const entry = registry.add(project);
  server = await startConsoleServer({
    registry,
    execute: async () => {
      throw new Error('验收不执行项目任务');
    },
    html: '',
    version: 'ui-test',
    remoteProxyManager: {
      listTools: async () => [],
      closeAll: async () => {},
      callTool: async () => {
        paidRequests++;
        throw new Error('验收禁止远端生成');
      },
    },
  });
  const files = new MakerCanvasFiles(project);
  const canvas = await files.create('画布自动验收');
  await files.setActiveCanvasId(canvas.id);
  browser = await playwright.chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(7000);
  page.on('pageerror', (error) => browserErrors.push(error.message));
  const template = files.getTemplate('7e1cb6ad-732f-4dc3-a951-000000000012');
  const prepared = await files.prepareTemplate(template.id, canvas.id);
  const custom = await files.saveTemplate({
    ...prepared,
    id: randomUUID(),
    revision: 0,
    name: 'Preview custom fixture',
  });
  const original = JSON.stringify(await files.load(canvas.id));
  await page.goto(server.origin + '/canvas?project=' + entry.key);
  await page.locator('#add-template').click();
  await page.locator('.workflow-template-row').first().waitFor();
  const writes = [];
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' &&
      !request.url().includes('/cover?') &&
      !request.url().includes('/automation/')
    )
      writes.push(request.url());
  });
  const preview = page.getByRole('dialog', { name: '模板流程预览', exact: true });
  async function open(id) {
    await page.locator('[data-template-id="' + id + '"] .template-preview').click();
    await preview.locator('.template-preview-card').first().waitFor();
  }
  await page.locator('.template-search').fill(template.name);
  await open(template.id);
  assert.equal(await preview.locator('.template-preview-card').count(), template.nodes.length);
  assert.equal(
    await preview.locator('.template-preview-wires path').count(),
    template.edges.length
  );
  assert.equal(
    await preview
      .locator('.template-preview-card button, .template-preview-card input, video, iframe')
      .count(),
    0
  );
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.template-workflow-preview img')];
    return (
      images.length > 0 &&
      images.every((img) => img.complete && img.naturalWidth > 0) &&
      !document.querySelector('.template-workflow-preview').textContent.includes('图片加载中')
    );
  });
  const viewport = preview.locator('.template-preview-viewport');
  const transform = () =>
    preview.locator('.template-preview-world').evaluate((el) => el.style.transform);
  const initial = await transform();
  await preview.getByRole('button', { name: '放大', exact: true }).click();
  assert.notEqual(await transform(), initial);
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30);
  await page.mouse.up();
  await preview.getByRole('button', { name: '全景', exact: true }).click();
  assert.equal(await transform(), initial);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  await preview.getByRole('button', { name: '铺满窗口' }).click();
  await preview.getByRole('button', { name: '还原窗口' }).click();
  await page.screenshot({ path: '/tmp/maker-template-preview.png' });
  await page.keyboard.press('Escape');
  await preview.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.template-search').inputValue(), template.name);
  await page.locator('.template-search').fill(custom.name);
  await open(custom.id);
  await preview.getByRole('button', { name: '关闭', exact: true }).click();
  await page.route('**/preview-image?**', (route) => route.fulfill({ status: 404 }));
  await open(custom.id);
  await preview.getByText('图片不可用', { exact: true }).first().waitFor();
  await preview.getByRole('button', { name: '关闭', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await open(custom.id);
  const bounds = await preview.boundingBox();
  assert(bounds.width <= 390 && bounds.height <= 844);
  await page.screenshot({ path: '/tmp/maker-template-preview-mobile.png' });
  await preview.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(JSON.stringify(await files.load(canvas.id)), original);
  assert.deepEqual(writes, []);
  assert.equal(paidRequests, 0);
  assert.deepEqual(browserErrors, []);
  console.log(
    'PASS: builtin/custom preview, images, wires, zoom/pan/fit, modal lifecycle, missing images, mobile, no canvas writes or generation'
  );
} catch (error) {
  console.error(browserErrors, await page?.locator('body').innerText());
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
