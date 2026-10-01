import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-canvas-ui-'));
function reportTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return parts.year + parts.month + parts.day + '-' + parts.hour + parts.minute + parts.second;
}
const reportRoot = process.env.MAKER_CANVAS_REPORT_DIR || path.join(repo, 'test-reports', 'maker-canvas-ui');
const runStamp = reportTimestamp();
const reportDir = path.join(reportRoot, runStamp);
const reportHtml = path.join(reportRoot, 'maker-canvas-ui-' + runStamp + '.html');
fs.mkdirSync(reportRoot, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });
const report = { checks: [], browserErrors: [], paidRequests: 0, simulatedGenerations: 0, generationRequests: { image: 0, video: 0 }, reportDir, reportHtml, startedAt: new Date().toISOString() };
let browser;
let server;
let page;
function resolvePlaywrightModule() {
  if (process.env.PLAYWRIGHT_MODULE) {
    return pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href;
  }
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    const globalModule = path.join(globalRoot, 'playwright', 'index.mjs');
    if (fs.existsSync(globalModule)) return pathToFileURL(globalModule).href;
  } catch {}
  return 'playwright';
}
try {
  const playwright = await import(resolvePlaywrightModule());
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
  fs.writeFileSync(path.join(project, '.maker-mcp/config.json'), JSON.stringify({ project_id: 'canvas-ui-test' }));
  fs.writeFileSync(path.join(project, '.project/project.json'), JSON.stringify({ taptap_publish: { title: '画布自动验收' } }));
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker' + String.fromCharCode(10));
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  const entry = registry.add(project);
  server = await startConsoleServer({ registry, execute: async () => { throw new Error('验收不执行项目任务'); }, html: '', version: 'ui-test', remoteProxyManager: {
    listTools: async () => [], closeAll: async () => {},
    callTool: async () => { report.paidRequests++; throw new Error('验收禁止远端生成'); },
  } });
  const files = new MakerCanvasFiles(project);
  const canvas = await files.create('画布自动验收');
  await files.setActiveCanvasId(canvas.id);
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  await page.route('**/generation/image', async route => {
    const input = route.request().postDataJSON();
    const asset = await files.importImage(fs.readFileSync(path.join(project, imagePath)), 'image/png');
    const attempt = { ...input, id: randomUUID(), canvasId: canvas.id, kind: 'image', toolName: 'generate_image', status: 'succeeded', resultAssetPath: asset.relativePath, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const directory = path.join(project, '.maker/canvases/attempts');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, attempt.id + '.json'), JSON.stringify(attempt));
    report.simulatedGenerations++;
    report.generationRequests.image++;
    await route.fulfill({ json: attempt });
  });
  await page.route('**/generation/video', async route => {
    const input = route.request().postDataJSON();
    const resultAssetPath = files.importGeneratedVideo(canvas.id, ensureVideoAsset());
    const attempt = {
      ...input,
      id: randomUUID(),
      canvasId: canvas.id,
      kind: 'video',
      toolName: 'create_video_task',
      status: 'succeeded',
      taskId: 'simulated-video-' + randomUUID(),
      resultAssetPath,
      sourceImageId: input.sourceImageId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const directory = path.join(project, '.maker/canvases/attempts');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, attempt.id + '.json'), JSON.stringify(attempt));
    report.simulatedGenerations++;
    report.generationRequests.video++;
    await route.fulfill({ json: attempt });
  });
  await page.goto(server.origin + '/canvas?project=' + entry.key);
  const board = page.locator('#board');
  let imageId;
  let imagePath;
  let generatedId;
  let variantId;
  let videoId;
  function ensureVideoAsset() {
    const relativePath = 'assets/video/generated.mp4';
    const target = path.join(project, relativePath);
    if (!fs.existsSync(target)) {
      if (!imagePath) throw new Error('视频验收缺少来源图片。');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-loop', '1', '-i', path.join(project, imagePath),
        '-t', '1', '-r', '1', '-pix_fmt', 'yuv420p', target,
      ], { stdio: 'ignore' });
    }
    return relativePath;
  }
  async function createImage() {
    await board.click({ button: 'right', position: { x: 200, y: 100 } });
    assert.equal(await page.locator('[data-canvas-action=delete]').isVisible(), false);
    await page.locator('[data-canvas-action=add-generation]').click();
    await page.getByPlaceholder('描述要生成的游戏角色、道具或怪物…').waitFor();
  }
  async function deleteCard(id) {
    await page.locator('.card[data-id="' + id + '"]').click({ button: 'right' });
    assert.equal(await page.locator('[data-canvas-action=add-generation]').isVisible(), false);
    await page.locator('[data-canvas-action=delete]').click();
    await page.locator('.card[data-id="' + id + '"]').waitFor({ state: 'detached' });
  }
  async function saved() {
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('status').textContent === '已保存');
    return files.load(canvas.id);
  }
  const checks = [
    ['新建空画布', async () => {
      await page.getByText('已保存', { exact: true }).waitFor();
      assert.equal(await page.locator('.card').count(), 0);
      assert.equal((await files.load(canvas.id)).nodes.length, 0);
    }],
    ['右键新建图片卡并显示生图框', async () => {
      await createImage();
      assert.equal(await page.locator('.card.image').count(), 1);
      assert.equal(await page.locator('#selection-menu').isVisible(), false);
      imageId = (await saved()).nodes[0].id;
    }],
    ['加号导入图片并真实落盘', async () => {
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        const context = canvas.getContext('2d'); context.fillStyle = '#6589e8'; context.fillRect(0, 0, 320, 240);
        context.fillStyle = '#ffe1ac'; context.fillRect(80, 40, 160, 160); return canvas.toDataURL().split(',')[1];
      });
      const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.image-empty').click()]);
      await picker.setFiles({ name: '测试图片.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.locator('.card.image img').waitFor();
      imagePath = (await saved()).nodes[0].assetPath;
      assert.ok(fs.existsSync(path.join(project, imagePath)));
    }],
    ['右键复制、删除指定卡片、撤销和重做', async () => {
      await page.locator('.card').click({ button: 'right' });
      await page.locator('[data-canvas-action=duplicate]').click();
      await page.waitForFunction(() => document.querySelectorAll('.card').length === 2);
      const duplicate = (await saved()).nodes.find(node => node.id !== imageId);
      await board.click({ position: { x: 30, y: 40 } });
      await deleteCard(duplicate.id);
      assert.deepEqual((await saved()).nodes.map(node => node.id), [imageId]);
      await board.click({ position: { x: 30, y: 40 } });
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForFunction(() => document.querySelectorAll('.card').length === 2);
      assert.equal((await saved()).nodes.length, 2);
      await board.click({ position: { x: 30, y: 40 } });
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await page.waitForFunction(() => document.querySelectorAll('.card').length === 1);
      assert.deepEqual((await saved()).nodes.map(node => node.id), [imageId]);
    }],
    ['右键删除图片卡并保存刷新', async () => {
      await deleteCard(imageId);
      await page.waitForFunction(() => document.querySelectorAll('.card').length === 0);
      assert.equal((await saved()).nodes.length, 0);
      await page.reload();
      await page.getByText('已保存', { exact: true }).waitFor();
      assert.equal(await page.locator('.card').count(), 0);
      assert.ok(fs.existsSync(path.join(project, imagePath)), '删除卡片不删除原素材');
    }],
    ['文本生图结果落盘（远端模拟）', async () => {
      await createImage();
      generatedId = (await saved()).nodes[0].id;
      await page.getByPlaceholder('描述要生成的游戏角色、道具或怪物…').fill('蓝银轻甲剑士，二次元动作游戏角色立绘，完整身体，持单手剑，纯色背景');
      await page.getByRole('button', { name: '生成', exact: true }).click();
      await page.locator('.card.image img').waitFor();
      assert.ok((await saved()).nodes[0].generation.attemptId);
    }],
    ['导入参考图只增加缩略图，不替换卡片', async () => {
      await page.locator('.card').click();
      await page.getByRole('button', { name: '快速编辑', exact: true }).click();
      const before = await files.load(canvas.id);
      const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '导入参考图', exact: true }).click()]);
      await picker.setFiles(path.join(project, imagePath));
      await page.getByAltText('参考图 1', { exact: true }).waitFor();
      assert.equal((await saved()).nodes[0].assetPath, before.nodes[0].assetPath);
      assert.equal(await page.locator('.card').count(), 1);
      await page.getByRole('button', { name: '移除参考图 1', exact: true }).click();
      assert.equal(await page.getByAltText('参考图 1', { exact: true }).count(), 0);
    }],
    ['快速编辑新建变体和来源连线（远端模拟）', async () => {
      await page.locator('.generation-panel textarea:visible').first().fill('保留剑士身份，改为双手持剑的攻击姿势，增加蓝色能量剑光，保持完整身体');
      await page.getByRole('button', { name: '生成', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.card.image').length === 2);
      const document = await saved();
      variantId = document.nodes.find(node => node.id !== generatedId).id;
      assert.ok(document.edges.some(edge => edge.from === generatedId && edge.to === variantId && edge.kind === 'image-variant'));
      await page.screenshot({ path: path.join(reportDir, 'variant-before-delete.png') });
    }],
    ['删除生成变体后刷新不会复活', async () => {
      await deleteCard(variantId);
      assert.equal((await saved()).nodes.length, 1);
      await page.reload();
      await page.getByText('已保存', { exact: true }).waitFor();
      assert.equal(await page.locator('.card').count(), 1);
      assert.equal((await files.load(canvas.id)).nodes.length, 1);
      await page.screenshot({ path: path.join(reportDir, 'variant-after-delete-reload.png') });
    }],
    ['视频草稿可关闭，时长为4至8秒且长时长标红', async () => {
      await page.locator('.card').click();
      await page.getByRole('button', { name: '视频生成', exact: true }).click();
      const duration = page.getByLabel('时长（秒）');
      assert.deepEqual(await duration.locator('option').allTextContents(), ['4', '5', '6', '7', '8']);
      await duration.selectOption('6');
      assert.equal(await duration.evaluate(element => element.style.color), 'rgb(239, 100, 100)');
      await page.screenshot({ path: path.join(reportDir, 'video-draft.png') });
      await board.click({ position: { x: 30, y: 40 } });
      assert.equal(await page.locator('.generation-prompt').count(), 0);
      assert.equal((await saved()).nodes.length, 1);
    }],
    ['图生视频结果卡与来源连线（远端模拟）', async () => {
      await page.locator('.card.image').click();
      await page.getByRole('button', { name: '视频生成', exact: true }).click();
      await page.locator('.generation-panel textarea:visible').first().fill('剑士向右挥剑并释放蓝色剑气，保持完整身体，镜头稳定，适合动作游戏战斗演示');
      await page.getByLabel('时长（秒）').selectOption('4');
      await page.getByRole('button', { name: '生成视频', exact: true }).click();
      await page.locator('.card.video-source').waitFor();
      const document = await saved();
      const video = document.nodes.find(node => node.type === 'video-source');
      videoId = video.id;
      assert.ok(video.assetPath);
      assert.ok(video.generation?.attemptId);
      assert.ok(video.generation?.taskId);
      assert.ok(document.edges.some(edge => edge.from === generatedId && edge.to === videoId && edge.kind === 'image-to-video'));
      assert.equal(report.generationRequests.video, 1);
      await page.screenshot({ path: path.join(reportDir, 'video-result.png') });
      await page.reload();
      await page.getByText('已保存', { exact: true }).waitFor();
      assert.equal(await page.locator('.card.video-source').count(), 1);
      assert.equal((await files.load(canvas.id)).nodes.find(node => node.id === videoId).type, 'video-source');
    }],
    ['拖动卡片后保存和刷新保持位置', async () => {
      const before = (await files.load(canvas.id)).nodes[0];
      const bounds = await page.locator('.card.image').boundingBox();
      await page.mouse.move(bounds.x + 50, bounds.y + 50);
      await page.mouse.down(); await page.mouse.move(bounds.x + 140, bounds.y + 110, { steps: 5 }); await page.mouse.up();
      const after = (await saved()).nodes[0];
      assert.notEqual(after.x, before.x);
      await page.reload(); await page.getByText('已保存', { exact: true }).waitFor();
      assert.equal((await files.load(canvas.id)).nodes[0].x, after.x);
    }],
    ['PNG和JPG导出为真实对应格式', async () => {
      await page.evaluate(() => { window.showSaveFilePicker = undefined; });
      await page.locator('.card.image').click();
      for (const format of ['PNG', 'JPG']) {
        await page.getByLabel('下载图片', { exact: true }).click();
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出为 ' + format }).click()]);
        const file = path.join(reportDir, 'export.' + format.toLowerCase()); await download.saveAs(file);
        const bytes = fs.readFileSync(file);
        assert.equal(bytes.subarray(0, format === 'PNG' ? 4 : 3).toString('hex'), format === 'PNG' ? '89504e47' : 'ffd8ff');
      }
    }],
    ['删除生成结果和源卡后刷新不会复活', async () => {
      await deleteCard(videoId); await saved();
      await page.reload(); await page.getByText('已保存', { exact: true }).waitFor();
      assert.equal(await page.locator('.card').count(), 1);
      await deleteCard(generatedId); await saved();
      await page.reload(); await page.getByText('已保存', { exact: true }).waitFor();
      assert.equal(await page.locator('.card').count(), 0);
    }],
  ];
  for (const [name, run] of checks) {
    const started = Date.now();
    try {
      await run();
      assert.deepEqual(report.browserErrors, []);
      report.checks.push({ name, status: 'passed', durationMs: Date.now() - started });
      console.log('通过：' + name);
    } catch (error) {
      report.checks.push({ name, status: 'failed', error: error.message });
      for (const [pending] of checks.slice(report.checks.length)) report.checks.push({ name: pending, status: 'skipped' });
      throw error;
    }
  }
  assert.equal(report.paidRequests, 0);
  await page.screenshot({ path: path.join(reportDir, 'passed.png'), fullPage: true });
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(reportDir, 'failed.png'), fullPage: true }).catch(() => {});
  console.error('画布验收失败：' + error.message);
} finally {
  await browser?.close();
  await server?.close();
  if (!report.error) {
    fs.rmSync(path.join(temporary, 'project'), { recursive: true, force: true });
    fs.rmSync(path.join(temporary, 'harness.mjs'), { force: true });
  }
  fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify(report, null, 2));
  const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const imageFiles = fs.readdirSync(reportDir)
    .filter(name => /\.(?:png|jpe?g)$/i.test(name))
    .sort();
  const embeddedImages = imageFiles.map(name => {
    const extension = path.extname(name).toLowerCase() === '.png' ? 'png' : 'jpeg';
    const data = fs.readFileSync(path.join(reportDir, name)).toString('base64');
    return '<figure><figcaption>' + escapeHtml(name) + '</figcaption><img src="data:image/' + extension + ';base64,' + data + '" alt="' + escapeHtml(name) + '"></figure>';
  }).join('');
  const passed = report.checks.filter(check => check.status === 'passed').length;
  const failed = report.checks.filter(check => check.status === 'failed').length;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(reportHtml, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>画布验收 ' + runStamp + '</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:1200px;margin:0 auto;padding:28px;color:#20242b;background:#f5f6f8}h1{margin-top:0}.summary{display:flex;gap:12px;flex-wrap:wrap}.pill{padding:8px 12px;border-radius:999px;background:#fff;border:1px solid #d9dde5}.passed{color:#18794e}.failed{color:#b42318}.checks{background:#fff;border:1px solid #d9dde5;border-radius:10px;padding:16px}.check{padding:10px 0;border-bottom:1px solid #edf0f4}.check:last-child{border-bottom:0}figure{display:inline-block;vertical-align:top;width:min(560px,100%);margin:12px 12px 12px 0;background:#fff;border:1px solid #d9dde5;border-radius:10px;padding:10px;box-sizing:border-box}figure img{display:block;max-width:100%;height:auto}figcaption{font-size:13px;margin-bottom:8px;word-break:break-all}code{word-break:break-all}</style></head><body><h1>画布真实页面验收</h1><p><code>' + escapeHtml(runStamp) + '</code></p><div class="summary"><span class="pill passed">通过 ' + passed + '</span><span class="pill failed">失败 ' + failed + '</span><span class="pill">付费请求 ' + report.paidRequests + '</span><span class="pill">模拟生成 ' + report.simulatedGenerations + '</span></div><h2>检查记录</h2><section class="checks">' + report.checks.map(check => '<div class="check"><strong class="' + escapeHtml(check.status) + '">' + escapeHtml(check.status === 'passed' ? '通过' : check.status === 'failed' ? '失败' : '跳过') + '</strong>　' + escapeHtml(check.name) + (check.durationMs ? '　' + check.durationMs + ' ms' : '') + (check.error ? '<br><code>' + escapeHtml(check.error) + '</code>' : '') + '</div>').join('') + '</section><h2>截图</h2>' + (embeddedImages || '<p>本次没有生成截图。</p>') + '<h2>环境与边界</h2><ul><li>测试项目为临时项目，保存和刷新走真实控制台服务。</li><li>生图响应使用模拟结果，远端工具被阻断，付费请求数量为 ' + report.paidRequests + '。</li><li>浏览器错误：' + escapeHtml(report.browserErrors.length ? report.browserErrors.join('；') : '无') + '</li></ul></body></html>');
  console.log('验收报告：' + path.join(reportDir, 'results.json'));
  console.log('静态 HTML：' + reportHtml);
}
