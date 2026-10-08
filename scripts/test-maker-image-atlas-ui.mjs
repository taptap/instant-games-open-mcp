import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const yauzl = require('yauzl');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-item-atlas-ui-'));
let browser;
let server;
function unzip(buffer) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    const entries = {};
    zip.on('error', reject);
    zip.on('end', () => resolve(entries));
    zip.on('entry', entry => zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = [];
      stream.on('error', reject);
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { entries[entry.fileName] = Buffer.concat(chunks); zip.readEntry(); });
    }));
    zip.readEntry();
  }));
}
try {
  const modulePath = process.env.PLAYWRIGHT_MODULE || path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright/index.mjs');
  const { chromium } = await import(pathToFileURL(modulePath).href);
  const bundle = path.join(temporary, 'harness.mjs');
  await build({
    stdin: { contents: 'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { MakerCanvasFiles } from "./src/maker/canvas/files.ts";', resolveDir: repo },
    bundle: true, platform: 'node', format: 'esm', outfile: bundle,
    external: ['./native/index.js'], logLevel: 'silent',
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  });
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles } = await import(pathToFileURL(bundle).href);
  const project = path.join(temporary, 'project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(path.join(project, '.maker-mcp/config.json'), JSON.stringify({ project_id: 'atlas-ui-test' }));
  fs.writeFileSync(path.join(project, '.project/project.json'), JSON.stringify({ taptap_publish: { title: '静态物品图集验收' } }));
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker' + String.fromCharCode(10));
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  const entry = registry.add(project);
  let paid = 0;
  server = await startConsoleServer({ registry, execute: async () => { throw new Error('禁止执行项目任务'); }, html: '', version: 'image-atlas-test', remoteProxy: { callTool: async () => { paid++; throw new Error('禁止生成'); } } });
  const files = new MakerCanvasFiles(project);
  let canvas = await files.create('静态物品图集验收');
  const preset = await files.prepareTemplate('7e1cb6ad-732f-4dc3-a951-000000000005', canvas.id);
  const atlas = preset.nodes.find(node => node.type === 'image' && preset.edges.some(edge => edge.to === node.id));
  const standalone = { id: atlas.id, type: 'image', title: '已保存的静态物品图集', x: 0, y: 0, width: 660, height: 500, assetPath: atlas.assetPath };
  canvas = await files.save(canvas.id, { ...canvas, nodes: [standalone], edges: [] }, canvas.revision);
  await files.setActiveCanvasId(canvas.id);
  const original = PNG.sync.read(fs.readFileSync(files.readMedia(atlas.assetPath).file));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  await page.addInitScript(() => { window.showSaveFilePicker = undefined; });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  await page.goto(server.origin + '/canvas?project=' + entry.key);
  await page.locator('.card').waitFor();
  await page.locator('.card').click({ button: 'right', position: { x: 12, y: 12 } });
  const menu = page.locator('#canvas-context-menu');
  await menu.getByRole('button', { name: '导出资源 ▸', exact: true }).click();
  await menu.getByRole('button', { name: '图集解析 / 导出单图', exact: true }).click();
  const dialog = page.locator('[data-image-atlas-dialog]');
  await dialog.getByText(/12 件/).waitFor();
  await dialog.locator('[data-atlas-preview]').click();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('.card').count(), 1);
  const single = dialog.locator('[data-atlas-mode="images"]');
  assert.equal(await single.isDisabled(), true);
  const confirmed = dialog.locator('[data-atlas-confirm]');
  await confirmed.check();
  assert.equal(await single.isEnabled(), true);
  await dialog.getByRole('spinbutton', { name: '列数', exact: true }).fill('5');
  assert.equal(await confirmed.isChecked(), false);
  await dialog.getByRole('spinbutton', { name: '列数', exact: true }).fill('0');
  await dialog.getByText('行列必须为正整数，最多导出 120 个物品。', { exact: true }).waitFor();
  await confirmed.check();
  assert.equal(await single.isDisabled(), true);
  await dialog.getByRole('spinbutton', { name: '列数', exact: true }).fill('4');
  await confirmed.check();
  const before = await files.load(canvas.id);
  for (const mode of ['images', 'atlas']) {
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('[data-atlas-mode="' + mode + '"]').click()]);
    const output = path.join(temporary, mode + '.zip');
    await download.saveAs(output);
    const entries = await unzip(fs.readFileSync(output));
    assert(entries['items/README.md'].toString().includes('不要把多个物品当作动画帧播放'));
    if (mode === 'images') {
      assert.equal(Object.keys(entries).length, 14);
      const index = JSON.parse(entries['items/index.json']);
      assert.equal(index.items.length, 12);
      for (const region of index.items) {
        const png = PNG.sync.read(entries['items/' + region.file]);
        assert.equal(png.width, region.width); assert.equal(png.height, region.height);
        let transparent = 0;
        for (let row = 0; row < png.height; row++) for (let column = 0; column < png.width; column++) {
          const offset = (row * png.width + column) * 4;
          const originalOffset = ((row + region.y) * original.width + column + region.x) * 4;
          const alpha = png.data[offset + 3];
          assert.equal(alpha, original.data[originalOffset + 3]);
          if (alpha === 0) transparent++;
          if (alpha === 255) assert.deepEqual(png.data.subarray(offset, offset + 4), original.data.subarray(originalOffset, originalOffset + 4));
        }
        assert(transparent > png.width * png.height * 0.1);
        assert(png.data.some((value, index) => index % 4 === 3 && value === 255));
      }
    } else {
      assert.equal(Object.keys(entries).length, 3);
      const manifest = JSON.parse(entries['items/spritesheet.json']);
      assert.equal(Object.keys(manifest.frames).length, 12);
      assert.equal(manifest.animations, undefined);
      assert.equal(manifest.meta.image, 'spritesheet.png');
      const png = PNG.sync.read(entries['items/spritesheet.png']);
      assert.deepEqual([png.width, png.height], [original.width, original.height]);
      assert.equal(png.data[3], 0);
    }
    if (process.env.MAKER_IMAGE_ATLAS_EXPORT_DIR) {
      fs.mkdirSync(process.env.MAKER_IMAGE_ATLAS_EXPORT_DIR, { recursive: true });
      fs.copyFileSync(output, path.join(process.env.MAKER_IMAGE_ATLAS_EXPORT_DIR, mode + '.zip'));
    }
  }
  assert.deepEqual(await files.load(canvas.id), before);
  assert.equal(paid, 0);
  await dialog.locator('[data-create-image-assets]').click();
  await page.locator('.image-assets-grid img').nth(11).waitFor();
  const assets = page.locator('.card.image-assets');
  assert.equal(await assets.locator('.image-assets-grid img').count(), 12);
  const created = await files.load(canvas.id);
  const collection = created.nodes.find(node => node.type === 'image-assets');
  assert.equal(collection.imageAssetsInfo.items.length, 12);
  assert.equal(created.edges.filter(edge => edge.kind === 'image-assets').length, 1);
  for (const item of collection.imageAssetsInfo.items) {
    const png = PNG.sync.read(fs.readFileSync(files.readMedia(item.assetPath).file));
    assert.deepEqual([png.width, png.height], [item.width, item.height]);
    assert(png.data.some((value, index) => index % 4 === 3 && value === 0));
  }
  assert.equal(await assets.locator('.image-assets-content button').count(), 0);
  assert.equal(await assets.getByRole('button', { name: '重新解析', exact: true }).count(), 0);
  await assets.locator('.canvas-card-menu').click();
  const [assetDownload] = await Promise.all([page.waitForEvent('download'), menu.getByRole('button', { name: '下载素材（PNG ZIP）', exact: true }).click()]);
  const assetZip = path.join(temporary, 'assets.zip');
  await assetDownload.saveAs(assetZip);
  const assetEntries = await unzip(fs.readFileSync(assetZip));
  assert.deepEqual(Object.keys(assetEntries), Array.from({ length: 12 }, (_, index) => 'item_' + String(index + 1).padStart(3, '0') + '.png'));
  for (const item of collection.imageAssetsInfo.items) assert.deepEqual(assetEntries[item.name + '.png'], fs.readFileSync(files.readMedia(item.assetPath).file));
  await page.reload();
  await page.locator('.image-assets-grid img').nth(11).waitFor();
  assert.deepEqual((await files.load(canvas.id)).nodes.find(node => node.type === 'image-assets').imageAssetsInfo, collection.imageAssetsInfo);
  await page.locator('.card[data-id="' + standalone.id + '"] .canvas-card-menu').click();
  await menu.getByRole('button', { name: '导出资源 ▸', exact: true }).click();
  await menu.getByRole('button', { name: '图集解析 / 导出单图', exact: true }).click();
  await dialog.getByText(/12 件/).waitFor();
  await dialog.locator('[data-atlas-confirm]').check();
  let rejectImport = true;
  const importPattern = '**/canvases/' + canvas.id + '/images';
  await page.route(importPattern, async route => {
    if (rejectImport) { rejectImport = false; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟图片保存失败' }) }); }
    else await route.continue();
  });
  await dialog.locator('[data-create-image-assets]').click();
  await dialog.getByText('游戏资产生成失败：模拟图片保存失败', { exact: true }).waitFor();
  assert.deepEqual((await files.load(canvas.id)).nodes.find(node => node.type === 'image-assets').imageAssetsInfo, collection.imageAssetsInfo);
  await page.unroute(importPattern);
  let rejectSave = true;
  const savePattern = '**/canvases/' + canvas.id;
  await page.route(savePattern, async route => {
    if (route.request().method() === 'PUT' && rejectSave) { rejectSave = false; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟画布保存失败' }) }); }
    else await route.continue();
  });
  await dialog.locator('[data-create-image-assets]').click();
  await dialog.getByText('游戏资产生成失败：游戏资产保存失败，原有资产已保留，请先保存画布后重试。', { exact: true }).waitFor();
  assert.deepEqual((await files.load(canvas.id)).nodes.find(node => node.type === 'image-assets').imageAssetsInfo, collection.imageAssetsInfo);
  assert.equal(await page.locator('.card.image-assets').count(), 1);
  await page.unroute(savePattern);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await dialog.evaluate(dialog => dialog.getBoundingClientRect().width <= innerWidth));
  if (process.env.MAKER_IMAGE_ATLAS_SCREENSHOT) await page.screenshot({ path: process.env.MAKER_IMAGE_ATLAS_SCREENSHOT });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await dialog.count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS 图片卡真实菜单/网格确认/参数校验/游戏资产卡12张真实PNG/保存重载/一键下载12张PNG/导入与保存失败保留旧资产/原像素Alpha/窄屏/关闭；无生成请求');
} finally {
  await browser?.close();
  await server?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
