import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PNG } from 'pngjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-sequence-ui-'));
const reportDir = path.join(temporary, 'report');
fs.mkdirSync(reportDir);
const report = { checks: [], browserErrors: [], remoteCalls: 0, screenshots: [] };
let browser, server, page;
async function check(name, run) {
  await run(); assert.deepEqual(report.browserErrors, []);
  report.checks.push(name); console.log('通过：' + name);
}
async function screenshot(name) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(reportDir, name + '.png'), fullPage: true });
  report.screenshots.push(name + '.png');
}
try {
  const globalPlaywright = process.env.PLAYWRIGHT_MODULE || path.join(
    execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright/index.mjs'
  );
  const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href : fs.existsSync(globalPlaywright) ? pathToFileURL(globalPlaywright).href : 'playwright');
  const bundle = path.join(temporary, 'harness.mjs');
  await build({ stdin: { contents: 'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { MakerCanvasFiles } from "./src/maker/canvas/files.ts"; export { defaultSequenceSettings } from "./src/maker/canvas/sequenceModel.ts"; export { snapshotCanvasSource } from "./src/maker/canvas/dependencies.ts";', resolveDir: repo }, bundle: true, platform: 'node', format: 'esm', outfile: bundle, external: ['./native/index.js'], logLevel: 'silent', banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles, defaultSequenceSettings, snapshotCanvasSource } = await import(pathToFileURL(bundle).href);
  const project = path.join(temporary, 'project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(path.join(project, '.maker-mcp/config.json'), JSON.stringify({ project_id: 'sequence-test' }));
  fs.writeFileSync(path.join(project, '.project/project.json'), JSON.stringify({ taptap_publish: { title: '序列帧验收' } }));
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker\n');
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  const entry = registry.add(project);
  server = await startConsoleServer({ registry, execute: async () => { throw new Error('测试禁止项目任务'); }, html: '', version: 'sequence-ui-test', remoteProxyManager: { listTools: async () => [], closeAll: async () => {}, callTool: async () => { report.remoteCalls++; throw new Error('测试禁止远端生成'); } } });
  const files = new MakerCanvasFiles(project);
  let document = await files.create('序列帧功能验收');
  await files.setActiveCanvasId(document.id);
  const frames = [];
  const atlas = new PNG({ width: 480, height: 384 });
  for (let index = 0; index < 20; index++) {
    const frame = new PNG({ width: 96, height: 96 });
    for (let row = 0; row < 96; row++) for (let column = 0; column < 96; column++) {
      const actor = column >= 25 + index && column < 45 + index && row >= 20 && row < 78;
      const color = actor ? [20, 180, 220, 255] : [237, 98, 168, 255];
      frame.data.set(color, (row * 96 + column) * 4);
      atlas.data.set(color, (((Math.floor(index / 5) * 96) + row) * 480 + (index % 5) * 96 + column) * 4);
    }
    fs.writeFileSync(path.join(temporary, 'frame' + String(index).padStart(2, '0') + '.png'), PNG.sync.write(frame));
    frames.push({ index, time: index / 10, x: (index % 5) * 96, y: Math.floor(index / 5) * 96, width: 96, height: 96 });
  }
  const movie = path.join(temporary, 'moving.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', path.join(temporary, 'frame%02d.png'), '-vf', 'scale=192:192', '-c:v', process.env.MAKER_TEST_VIDEO_ENCODER || 'libx264', '-pix_fmt', 'yuv420p', movie]);
  const video = await files.importVideo(document.id, fs.readFileSync(movie), 'video/mp4');
  const asset = await files.importImage(PNG.sync.write(atlas));
  const source = { id: randomUUID(), type: 'video-source', title: '运动视频', x: -320, y: 40, width: 240, height: 210, assetPath: video.relativePath, videoInfo: { duration: 2, width: 192, height: 192 } };
  const info = { fps: 10, frameCount: 20, width: 480, height: 384, columns: 5, rows: 4, frames };
  const first = { id: randomUUID(), type: 'sequence', title: '动作 A', x: 30, y: 40, width: 480, height: 300, sourceVideoId: source.id, assetPath: asset.relativePath, frameSetInfo: info, sequenceSettings: { ...defaultSequenceSettings(2, 96, 96), fps: 10 }, sourceSnapshot: snapshotCanvasSource(source) };
  const second = { ...first, id: randomUUID(), title: '动作 B', x: 560, y: 40 };
  document.nodes.push(source, first, second);
  document.edges.push(...[first, second].map((node) => ({ id: randomUUID(), from: source.id, to: node.id, kind: 'sequence-source' })));
  document = await files.save(document.id, document, document.revision);
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => report.browserErrors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/*', (route) => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  await page.goto(server.origin + '/canvas?project=' + entry.key);
  const editor = page.getByRole('dialog', { name: '序列帧编辑', exact: true });
  const count = () => editor.locator('.sequence-editor-tile').count();
  async function open(id = first.id) {
    const card = page.locator('[data-id="' + id + '"]');
    await card.click({ position: { x: 25, y: 20 } });
    await card.getByRole('button', { name: '编辑', exact: true }).click();
    await editor.waitFor();
  }
  async function organize() { await editor.getByRole('button', { name: '整理与输出', exact: true }).click(); }
  await check('两个页签分工、旧图集无需重新抽帧即可多选删除', async () => {
    await open(); assert.equal(await count(), 20);
    await editor.getByRole('button', { name: '查看第 1 帧', exact: true }).click();
    const single = page.getByRole('dialog', { name: '单帧编辑', exact: true }); await single.waitFor();
    await single.getByRole('button', { name: '取消', exact: true }).click();
    await organize();
    for (const index of [6, 9, 12]) await editor.getByRole('checkbox', { name: '选择第 ' + index + ' 帧', exact: true }).check();
    await editor.getByRole('button', { name: '删除所选帧（3）', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.sequence-editor-tile').length === 17);
    await editor.getByRole('button', { name: '撤销帧编辑' }).click(); assert.equal(await count(), 20);
    await editor.getByRole('button', { name: '重做', exact: true }).click(); assert.equal(await count(), 17);
    await editor.getByRole('checkbox', { name: '选择第 1 帧', exact: true }).check();
    await editor.getByRole('button', { name: '复制所选帧', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.sequence-editor-tile').length === 18);
    await screenshot('01-organize');
  });
  await check('预览调速、前后帧叠影、输出 FPS 独立', async () => {
    await editor.getByLabel('预览速度', { exact: true }).selectOption('0.5');
    await editor.getByRole('checkbox', { name: '前后帧叠影' }).check();
    assert.equal(await editor.getByLabel('播放 FPS', { exact: true }).inputValue(), '10');
    await editor.getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForTimeout(500); await editor.getByRole('button', { name: '暂停', exact: true }).click();
    await screenshot('02-onion-preview');
  });
  await check('自动识别粉色背景、调整参数、取消不改帧、批量应用可撤销', async () => {
    await editor.getByRole('button', { name: '自动去背景 / 调整参数', exact: true }).click();
    const background = page.getByRole('dialog', { name: '自动去背景', exact: true });
    await background.getByText('当前帧自动识别：#ed62a8', { exact: false }).waitFor();
    await background.getByLabel('颜色容差', { exact: true }).focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < 35; step++) await page.keyboard.press('ArrowRight');
    assert.equal(await background.getByLabel('颜色容差', { exact: true }).inputValue(), '35');
    await background.getByRole('button', { name: '应用到当前帧', exact: true }).waitFor({ state: 'visible' });
    await screenshot('03-background');
    await background.getByRole('button', { name: '取消', exact: true }).click(); assert.equal(await count(), 18);
    await editor.getByRole('button', { name: '自动去背景 / 调整参数', exact: true }).click();
    await background.getByText('当前帧自动识别：#ed62a8', { exact: false }).waitFor();
    await background.getByRole('button', { name: '批量应用到全部帧', exact: true }).click();
    await background.waitFor({ state: 'detached' });
    await editor.getByRole('button', { name: '自动去背景 / 调整参数', exact: true }).click();
    await background.getByText('当前帧自动识别：#ed62a8', { exact: false }).waitFor();
    await background.getByRole('button', { name: '应用到当前帧', exact: true }).click();
    await background.waitFor({ state: 'detached' });
    await editor.getByRole('button', { name: '撤销帧编辑' }).click();
    await editor.getByRole('button', { name: '重做', exact: true }).click();
  });
  await check('保存落盘、重开不复活已删帧、复制帧内容正确', async () => {
    await editor.getByRole('button', { name: '统一缩放', exact: true }).click();
    const originalPath = (await files.load(document.id)).nodes.find((node) => node.id === first.id).assetPath;
    const saveRoute = '**/canvases/' + document.id;
    await page.route(saveRoute, (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 500, json: { error: '测试保存失败' } }) : route.fallback());
    await editor.getByRole('button', { name: '保存帧集到画布', exact: true }).click();
    await editor.getByRole('button', { name: '重试保存帧集', exact: true }).waitFor();
    assert.equal((await files.load(document.id)).nodes.find((node) => node.id === first.id).assetPath, originalPath);
    assert.equal(await count(), 18);
    await page.unroute(saveRoute);
    await editor.getByRole('button', { name: '重试保存帧集', exact: true }).click();
    await editor.getByText('已保存到画布', { exact: true }).waitFor();
    const saved = await files.load(document.id); const node = saved.nodes.find((item) => item.id === first.id);
    assert.equal(node.frameSetInfo.frameCount, 18);
    assert.deepEqual(node.frameSetInfo.frames.map((frame) => frame.time), [0, 0, 0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.9, 1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9]);
    const png = PNG.sync.read(fs.readFileSync(path.join(project, node.assetPath)));
    assert.equal(png.data[3], 0);
    const firstFrame = node.frameSetInfo.frames[0];
    const secondFrame = node.frameSetInfo.frames[1];
    for (let row = 0; row < firstFrame.height; row++) {
      const offset = ((firstFrame.y + row) * png.width + firstFrame.x) * 4;
      const other = ((secondFrame.y + row) * png.width + secondFrame.x) * 4;
      assert.deepEqual(png.data.subarray(offset, offset + firstFrame.width * 4), png.data.subarray(other, other + firstFrame.width * 4));
    }
    await editor.getByRole('button', { name: '完成并返回画布', exact: true }).click();
    await page.reload(); await open(); assert.equal(await count(), 18);
    await editor.getByRole('button', { name: '完成并返回画布', exact: true }).click();
  });
  await check('隐藏图集对比入口', async () => {
    assert.equal(await page.getByRole('button', { name: '图集对比', exact: true }).count(), 0);
  });
  await check('运动视频真实抽帧、自动抠图和保存流程', async () => {
    await open(second.id);
    await editor.getByRole('button', { name: '从源视频重新处理', exact: true }).click();
    await editor.getByRole('button', { name: '统一抠图', exact: true }).click();
    await organize();
    await editor.getByRole('button', { name: '分析重复帧', exact: true }).click();
    await editor.getByRole('button', { name: '保留全部帧', exact: true }).click();
    await editor.getByRole('button', { name: '统一缩放', exact: true }).click();
    await editor.getByRole('button', { name: '保存帧集到画布', exact: true }).click();
    await editor.getByText('已保存到画布', { exact: true }).waitFor();
    await screenshot('06-extracted');
    const saved = (await files.load(document.id)).nodes.find((node) => node.id === second.id);
    const png = PNG.sync.read(fs.readFileSync(path.join(project, saved.assetPath)));
    assert.equal(png.data[3], 0); assert.equal(saved.frameSetInfo.frameCount, 20);
    await editor.getByRole('button', { name: '完成并返回画布', exact: true }).click();
  });
  await check('窄屏可以选择、删除和取消草稿', async () => {
    const before = JSON.stringify(await files.load(document.id));
    await page.setViewportSize({ width: 600, height: 850 }); await open(); await organize();
    await editor.getByRole('checkbox', { name: '选择第 2 帧', exact: true }).check();
    await editor.getByRole('button', { name: '删除所选帧（1）', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.sequence-editor-tile').length === 17);
    await screenshot('07-mobile');
    await editor.getByRole('button', { name: '关闭', exact: true }).click();
    await editor.getByRole('button', { name: '确认', exact: true }).click();
    assert.equal(JSON.stringify(await files.load(document.id)), before);
  });
  await check('逐帧识别不同背景色，批量失败不会部分应用，取消不提交结果', async () => {
    await page.evaluate(async () => {
      const frames = [];
      for (const color of ['#ed62a8', '#00ff00']) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
        const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 96, 96);
        context.fillStyle = '#14b4dc'; context.fillRect(30, 20, 20, 60);
        frames.push({ time: frames.length, blob: await new Promise((resolve) => canvas.toBlob(resolve)) });
      }
      window.backgroundFrames = frames;
      window.backgroundResult = null;
      await openBackgroundEditor({ frames, index: 0, removal: createBackgroundRemoval(), apply: (result) => { window.backgroundResult = result; } });
    });
    const background = page.getByRole('dialog', { name: '自动去背景', exact: true });
    await background.getByRole('button', { name: '批量应用到全部帧', exact: true }).click();
    await background.waitFor({ state: 'detached' });
    const alpha = await page.evaluate(async () => Promise.all(window.backgroundResult.map(async (frame) => {
      const bitmap = await createImageBitmap(frame.blob);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
      return [context.getImageData(0, 0, 1, 1).data[3], context.getImageData(35, 35, 1, 1).data[3]];
    })));
    assert.deepEqual(alpha, [[0, 255], [0, 255]]);
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
      const transparent = await new Promise((resolve) => canvas.toBlob(resolve));
      const frames = [window.backgroundFrames[0], { time: 1, blob: transparent }];
      window.backgroundApplied = false;
      await openBackgroundEditor({ frames, index: 0, removal: createBackgroundRemoval(), apply: () => { window.backgroundApplied = true; } });
    });
    await background.getByRole('button', { name: '批量应用到全部帧', exact: true }).click();
    await background.getByText('第 2 帧：未可靠识别到大面积纯色背景', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.backgroundApplied), false);
    await screenshot('08-batch-protection');
    await background.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.backgroundApplied), false);
  });
  await check('仓库真实角色动作视频抽帧、自动去背景与图集落盘', async () => {
    const preset = JSON.parse(fs.readFileSync(path.join(repo, 'src/maker/canvas/presetData.json'), 'utf8'))[0];
    const videoAsset = Object.values(preset.assets).find((asset) => asset.type === 'video/mp4');
    assert.ok(videoAsset, '验收需要仓库自带的真实角色动作视频');
    const actual = await files.create('真实角色动作验收');
    const moviePath = path.join(temporary, 'character.mp4');
    const bytes = Buffer.from(videoAsset.data, 'base64'); fs.writeFileSync(moviePath, bytes);
    const imported = await files.importVideo(actual.id, bytes, 'video/mp4');
    const videoInfo = await page.evaluate((mediaUrl) => new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const info = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
        video.removeAttribute('src'); video.load(); resolve(info);
      };
      video.onerror = () => reject(new Error('Fixture video metadata is unavailable.'));
      video.src = mediaUrl;
    }), server.origin + '/api/projects/' + entry.key + '/canvas-media?path=' + encodeURIComponent(imported.relativePath));
    const actualSource = { ...source, id: randomUUID(), assetPath: imported.relativePath, videoInfo };
    const sequence = { id: randomUUID(), type: 'sequence', title: '角色动作序列', x: 30, y: 40, width: 480, height: 300, sourceVideoId: actualSource.id, sequenceSettings: preset.nodes.find((node) => node.type === 'sequence').sequenceSettings };
    actual.nodes.push(actualSource, sequence);
    actual.edges.push({ id: randomUUID(), from: actualSource.id, to: sequence.id, kind: 'sequence-source' });
    await files.save(actual.id, actual, actual.revision); await files.setActiveCanvasId(actual.id);
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload(); await open(sequence.id);
    await editor.getByRole('button', { name: '开始抽帧', exact: true }).click();
    await editor.getByRole('button', { name: '统一抠图', exact: true }).waitFor();
    await screenshot('09-character-original');
    await editor.getByRole('button', { name: '统一抠图', exact: true }).click();
    await organize();
    await editor.getByRole('button', { name: '分析重复帧', exact: true }).click();
    await editor.getByRole('button', { name: '保留全部帧', exact: true }).click();
    await editor.getByRole('button', { name: '统一缩放', exact: true }).click();
    await editor.getByRole('button', { name: '保存帧集到画布', exact: true }).click();
    await editor.getByText('已保存到画布', { exact: true }).waitFor();
    await screenshot('10-character-result');
    const saved = (await files.load(actual.id)).nodes.find((node) => node.id === sequence.id);
    assert.equal(saved.frameSetInfo.frameCount, 12);
    const png = PNG.sync.read(fs.readFileSync(path.join(project, saved.assetPath)));
    const contents = saved.frameSetInfo.frames.map((frame) => {
      const rows = [];
      for (let row = 0; row < frame.height; row++) {
        const offset = ((frame.y + row) * png.width + frame.x) * 4;
        rows.push(png.data.subarray(offset, offset + frame.width * 4));
      }
      const pixels = Buffer.concat(rows);
      assert.ok(pixels.some((value, index) => index % 4 === 3 && value === 0), '应存在透明背景');
      assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 128), '角色不能被全部抠除');
      return pixels.toString('base64');
    });
    assert.ok(new Set(contents).size > 3, '动作视频必须包含不同帧，不能用静态视频代替');
    await editor.getByRole('button', { name: '完成并返回画布', exact: true }).click();
  });
  assert.equal(report.remoteCalls, 0);
} catch (error) {
  report.error = error.stack; process.exitCode = 1;
  console.error('序列帧验收失败：' + error.message);
  if (page) await screenshot('failed').catch(() => {});
} finally {
  await browser?.close(); await server?.close();
  fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify(report, null, 2));
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  fs.writeFileSync(path.join(reportDir, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>序列帧验收</title><style>body{max-width:1100px;margin:30px auto;font-family:sans-serif}img{max-width:100%}pre{white-space:pre-wrap}</style><h1>序列帧真实页面验收</h1><p>临时项目、真实运动视频、受控素材路由与实际落盘；远端生成请求 ' + report.remoteCalls + ' 次。</p><ul>' + report.checks.map((name) => '<li>' + escape(name) + '</li>').join('') + '</ul>' + (report.error ? '<pre>' + escape(report.error) + '</pre>' : '') + report.screenshots.map((name) => '<h2>' + escape(name) + '</h2><img src="' + name + '">').join('') + '</html>');
  console.log('验收报告：' + path.join(reportDir, 'index.html'));
}
