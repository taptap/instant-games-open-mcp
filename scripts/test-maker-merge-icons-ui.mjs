import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-merge-ui-'));
let browser;
let server;
try {
  const modulePath =
    process.env.PLAYWRIGHT_MODULE ||
    path.join(
      execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
      'playwright/index.mjs'
    );
  const { chromium } = await import(pathToFileURL(modulePath).href);
  const bundle = path.join(temporary, 'harness.mjs');
  await build({
    stdin: {
      contents:
        'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { MakerCanvasFiles } from "./src/maker/canvas/files.ts"; export { createCanvasTemplateModel } from "./src/maker/canvas/templates.ts";',
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
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles, createCanvasTemplateModel } = await import(
    pathToFileURL(bundle).href
  );
  const project = path.join(temporary, 'project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.maker-mcp/config.json'),
    JSON.stringify({ project_id: 'template-ui-test' })
  );
  fs.writeFileSync(
    path.join(project, '.project/project.json'),
    JSON.stringify({ taptap_publish: { title: '模板管理验证' } })
  );
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker\n');
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  const entry = registry.add(project);
  server = await startConsoleServer({
    registry,
    execute: async () => {
      throw new Error('不执行项目任务');
    },
    html: '',
    version: 'template-test',
  });
  const files = new MakerCanvasFiles(project);
  let canvas = await files.create('二合图标编辑验收');
  const preset = await files.prepareTemplate('7e1cb6ad-732f-4dc3-a951-000000000009', canvas.id);
  const instance = createCanvasTemplateModel().instantiate(preset, { x: 0, y: 0 });
  canvas = await files.save(canvas.id, { ...canvas, nodes: instance.nodes, edges: instance.edges }, canvas.revision);
  await files.setActiveCanvasId(canvas.id);
  const atlas = canvas.nodes.find(node => node.mergeIcons);
  const assets = canvas.nodes.find(node => node.type === 'image-assets');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let requests = 0;
  await page.route('**/generation/image', async route => {
    requests++;
    const input = route.request().postDataJSON();
    assert(input.prompt.includes('严格3列×3行，共9个图标'));
    assert(input.prompt.includes('金色大礼篮'));
    assert.equal(input.targetNodeId, atlas.id);
    assert.equal(input.sourceImageIds.length, 1);
    await route.fulfill({ json: { ...input, id: randomUUID(), canvasId: canvas.id, kind: 'image', status: 'succeeded', resultAssetPath: atlas.assetPath, createdAt: new Date().toISOString() } });
  });
  await page.goto(server.origin + '/canvas?project=' + entry.key);
  const card = page.locator('.card[data-id="' + atlas.id + '"]');
  const openPanel = async () => {
    await card.waitFor();
    if (await card.getByRole('button', { name: '调整参数', exact: true }).count()) await card.getByRole('button', { name: '调整参数', exact: true }).click();
    else {
      await card.click({ position: { x: 20, y: 20 } });
      await page.getByRole('button', { name: '快速编辑', exact: true }).click();
    }
    await page.getByRole('button', { name: '编辑升级阶段', exact: true }).click();
  };
  await openPanel();
  const editor = page.locator('[data-merge-icons-editor]');
  const count = editor.getByRole('spinbutton', { name: '阶段数', exact: true });
  assert.equal(await count.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(42, 45, 53)');
  assert.equal(await count.evaluate(element => getComputedStyle(element).borderRadius), '8px');
  const last = await editor.getByRole('textbox', { name: '系列1阶段5', exact: true }).inputValue();
  await editor.getByRole('spinbutton', { name: '系列数', exact: true }).fill('1');
  assert.equal(await editor.getByRole('textbox', { name: '系列3阶段1', exact: true }).count(), 0);
  await editor.getByRole('spinbutton', { name: '系列数', exact: true }).fill('3');
  assert.equal(await editor.getByRole('textbox', { name: '系列3阶段1', exact: true }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await editor.evaluate(element => element.getBoundingClientRect().right <= innerWidth && element.scrollWidth <= element.clientWidth + 1));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await count.fill('3');
  assert.equal(await editor.getByRole('textbox', { name: '系列1阶段5', exact: true }).count(), 0);
  await count.fill('5');
  assert.equal(await editor.getByRole('textbox', { name: '系列1阶段5', exact: true }).inputValue(), last);
  await count.fill('33');
  assert.equal(await editor.getByRole('textbox', { name: '系列3阶段33', exact: true }).count(), 1);
  assert((await editor.locator('[data-density]').textContent()).includes('模型不保证'));
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal((await files.load(canvas.id)).nodes.find(node => node.id === atlas.id).mergeIcons.stageCount, 5);
  await page.getByRole('button', { name: '编辑升级阶段', exact: true }).click();
  await count.fill('34');
  await editor.getByRole('button', { name: '应用阶段设置', exact: true }).click();
  assert(await editor.isVisible());
  await count.fill('3');
  await editor.getByRole('textbox', { name: '系列1阶段3', exact: true }).fill('金色大礼篮');
  let failSave = true;
  await page.route(server.origin + '/api/projects/' + entry.key + '/canvases/' + canvas.id, async route => {
    if (failSave && route.request().method() === 'PUT') await route.fulfill({ status: 500, json: { error: '模拟保存失败' } });
    else await route.continue();
  });
  await editor.getByRole('button', { name: '应用阶段设置', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-merge-icons-editor] [data-error]')?.textContent.includes('尚未保存'));
  assert.equal((await files.load(canvas.id)).nodes.find(node => node.id === atlas.id).mergeIcons.stageCount, 5);
  assert.equal(requests, 0);
  failSave = false;
  await editor.getByRole('button', { name: '应用阶段设置', exact: true }).click();
  await page.waitForFunction(() => !window.makerCanvasUnsaved, null, { timeout: 8000 }).catch(async error => {
    console.error('EDITOR', await editor.textContent().catch(() => 'closed'), 'ERRORS', errors, await page.locator('#error').textContent());
    throw error;
  });
  let saved = await files.load(canvas.id);
  let next = saved.nodes.find(node => node.id === atlas.id);
  assert.equal(next.mergeIcons.stageCount, 3);
  assert.equal(next.assetPath, atlas.assetPath);
  assert.equal(next.generation.prompt, atlas.generation.prompt);
  assert.equal(next.generationDraft, undefined);
  assert.equal(next.mergeIcons.series[0].stages[2], '金色大礼篮');
  assert(next.templatePending);
  assert(saved.nodes.find(node => node.id === assets.id).templatePending);
  assert.equal(requests, 0);
  await page.reload();
  await openPanel();
  assert.equal(await count.inputValue(), '3');
  assert.equal(await editor.getByRole('textbox', { name: '系列1阶段3', exact: true }).inputValue(), '金色大礼篮');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: /^(生成|应用并继续)$/ }).click();
  await page.waitForFunction(() => !window.makerCanvasUnsaved && !document.querySelector('.card[data-card-state="loading"]'));
  await page.waitForTimeout(600);
  saved = await files.load(canvas.id);
  next = saved.nodes.find(node => node.id === atlas.id);
  assert.equal(requests, 1);
  assert(!next.templatePending);
  assert.equal(saved.nodes.length, 4);
  assert(next.generation.prompt.includes('严格3列×3行'));
  if (!await page.locator('[data-image-atlas-dialog]').count()) {
    await card.click({ button: 'right', position: { x: 20, y: 20 } });
    const menu = page.locator('#canvas-context-menu');
    await menu.getByRole('button', { name: '导出资源 ▸', exact: true }).click();
    await menu.getByRole('button', { name: '图集解析 / 导出单图', exact: true }).click();
  }
  const split = page.locator('[data-image-atlas-dialog]');
  await split.waitFor();
  assert.equal(await split.getByRole('spinbutton', { name: '列数', exact: true }).inputValue(), '3');
  assert.equal(await split.getByRole('spinbutton', { name: '行数', exact: true }).inputValue(), '3');
  await split.getByRole('button', { name: '关闭', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS 二合图标真实页面：阶段/系列/逐级描述、33阶段提示、缩减恢复、取消/校验、保存重载、旧结果待处理、模拟生成原位更新及解析网格同步');
} finally {
  await browser?.close();
  await server?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
