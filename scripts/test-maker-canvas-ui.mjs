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
    stdin: { contents: 'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { MakerCanvasFiles } from "./src/maker/canvas/files.ts"; export { snapshotCanvasSource } from "./src/maker/canvas/dependencies.ts";', resolveDir: repo },
    bundle: true, platform: 'node', format: 'esm', outfile: bundle,
    external: ['./native/index.js'], logLevel: 'silent',
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  });
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles, snapshotCanvasSource } = await import(pathToFileURL(bundle).href);
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
    const current = await files.load(canvas.id);
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
      targetAssetPath: current.nodes.find(node => node.id === input.targetNodeId)?.assetPath || '',
      sourceSnapshots: input.sourceImageIds.map(id => snapshotCanvasSource(current.nodes.find(node => node.id === id))),
      parameters: { mode: input.mode, model: input.model, duration: input.duration, resolution: input.resolution, ratio: input.ratio },
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
    ['悬浮图标栏不占画布宽度且页签改名刷新后可用', async () => {
      const title = '页签改名验证';
      page.once('dialog', dialog => dialog.accept(title));
      await page.locator('.workspace-tab #rename-canvas').click();
      assert.equal((await saved()).title, title);
      await page.reload();
      await page.getByRole('tab', { name: title, exact: true }).waitFor();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.locator('.workspace-add summary').click();
        const rail = await page.locator('.workspace-toolbar').boundingBox();
        const area = await board.boundingBox();
        const menu = await page.locator('.workspace-add .workspace-menu-panel').boundingBox();
        assert.ok(rail.width <= 56 && rail.x > area.x);
        assert.equal(area.width, width);
        assert.ok(rail.height < area.height / 2);
        assert.ok(menu.x >= rail.x + rail.width && menu.x + menu.width <= width);
        await page.locator('.workspace-add summary').click();
        assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isVisible(), true);
        assert.equal(await page.locator('#status').getAttribute('title'), '已保存');
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
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
      await board.click({ position: { x: 90, y: 40 } });
      await deleteCard(duplicate.id);
      assert.deepEqual((await saved()).nodes.map(node => node.id), [imageId]);
      await board.click({ position: { x: 90, y: 40 } });
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForFunction(() => document.querySelectorAll('.card').length === 2);
      assert.equal((await saved()).nodes.length, 2);
      await board.click({ position: { x: 90, y: 40 } });
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
      await board.click({ position: { x: 90, y: 40 } });
      assert.equal(await page.locator('.generation-prompt').count(), 0);
      assert.equal((await saved()).nodes.length, 1);
    }],
    ['视频导入的是额外参考图，不替换图片卡', async () => {
      const before = (await files.load(canvas.id)).nodes.find(node => node.id === generatedId).assetPath;
      await page.locator('.card.image').click();
      await page.getByRole('button', { name: '视频生成', exact: true }).click();
      await page.getByLabel('输入方式').selectOption('first_last_frame');
      const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '导入参考图', exact: true }).click()]);
      await picker.setFiles(path.join(project, imagePath));
      await page.getByLabel('移除参考图 1', { exact: true }).waitFor();
      assert.equal(await page.locator('.generation-reference img').count(), 2);
      assert.equal((await files.load(canvas.id)).nodes.find(node => node.id === generatedId).assetPath, before);
      await page.getByLabel('移除参考图 1', { exact: true }).click();
      await page.getByLabel('输入方式').selectOption('first_frame');
      await board.click({ position: { x: 90, y: 40 } });
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
    ['视频历史读取本地记录并可关闭，不提交生成', async () => {
      await page.locator('.canvas-log summary').click();
      await page.getByRole('button', { name: '视频历史', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '视频历史', exact: true });
      await dialog.getByText('已取回本地', { exact: false }).waitFor();
      assert.equal(await dialog.getByRole('link', { name: '下载本地视频' }).count(), 1);
      const video = (await files.load(canvas.id)).nodes.find(node => node.id === videoId);
      const attempt = JSON.parse(fs.readFileSync(path.join(project, '.maker/canvases/attempts', video.generation.attemptId + '.json'), 'utf8'));
      let queries = 0;
      await page.route('**/generation/' + attempt.id + '/query', route => {
        queries++;
        return route.fulfill({ json: attempt });
      });
      await dialog.getByRole('button', { name: '查询并取回', exact: true }).click();
      await dialog.getByText('视频已取回并更新原卡片。', { exact: true }).waitFor();
      assert.equal(queries, 1);
      assert.equal(report.generationRequests.video, 1);
      let delayedQuery;
      await page.route('**/generation/' + attempt.id + '/query', route => { delayedQuery = route; });
      await dialog.getByRole('button', { name: '查询并取回', exact: true }).click();
      await dialog.getByRole('button', { name: '停止等待并关闭', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.ok(delayedQuery);
      await delayedQuery.fulfill({ json: attempt });
    }],
    ['实际尺寸与本地抠图保存接入画布，不调用远端', async () => {
      const original = (await files.load(canvas.id)).nodes.find(node => node.id === generatedId);
      await page.locator('.card.image').click();
      assert.match(await page.locator('.image-size-info').textContent(), /实际尺寸：320 × 240/);
      const count = report.simulatedGenerations;
      await page.getByRole('button', { name: '去纯色背景', exact: true }).click();
      const editor = page.getByRole('dialog', { name: '自动去背景', exact: true });
      await editor.getByRole('button', { name: '应用到当前帧', exact: true }).click();
      const local = page.getByRole('dialog', { name: '本地图片编辑', exact: true });
      let rejectSave = true;
      const saveRoute = '**/canvases/' + canvas.id;
      await page.route(saveRoute, route => {
        if (route.request().method() === 'PUT' && rejectSave) {
          rejectSave = false;
          return route.fulfill({ status: 503, json: { error: '模拟保存失败，验证原结果保留' } });
        }
        return route.continue();
      });
      await local.getByRole('button', { name: '保存本地 PNG', exact: true }).click();
      await local.getByText('原结果仍保留', { exact: false }).waitFor();
      assert.equal((await files.load(canvas.id)).nodes.length, 2);
      assert.equal(await page.locator('.card.image').count(), 1);
      await page.unroute(saveRoute);
      await local.getByRole('button', { name: '保存本地 PNG', exact: true }).click();
      await local.waitFor({ state: 'detached' });
      const result = await saved();
      assert.equal(result.nodes.find(node => node.id === generatedId).assetPath, original.assetPath);
      const edited = result.nodes.find(node => node.type === 'image' && node.id !== generatedId);
      assert.ok(edited && fs.existsSync(path.join(project, edited.assetPath)));
      assert.equal(report.simulatedGenerations, count);
      await deleteCard(edited.id);
      await saved();
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
    ['停止分组和卡片视频等待立即解锁，允许明确新生成且迟到结果不覆盖', async () => {
      const document = await files.load(canvas.id);
      const groupId = randomUUID();
      const sourceId = randomUUID();
      const targetId = randomUUID();
      const originalVideo = files.importGeneratedVideo(canvas.id, ensureVideoAsset());
      document.nodes = [
        { id: groupId, type: 'section', title: '停止等待验收', templateId: randomUUID(), x: 30, y: 50, width: 850, height: 320 },
        { id: sourceId, type: 'image', title: '参考图片', sectionId: groupId, assetPath: imagePath, x: 60, y: 105, width: 230, height: 220 },
        { id: targetId, type: 'video-source', title: '视频等待验收', assetPath: originalVideo, sectionId: groupId, templatePending: true, x: 400, y: 105, width: 330, height: 220, generation: { prompt: '固定镜头，角色原地跑步', parameters: { mode: 'first_frame', duration: 4 } } },
      ];
      document.edges = [{ id: randomUUID(), from: sourceId, to: targetId, kind: 'image-to-video' }];
      document.viewport = { x: 0, y: 0, scale: 1 };
      await files.save(canvas.id, document, document.revision);
      const held = [];
      await page.route('**/generation/video', async route => {
        const input = route.request().postDataJSON();
        const attempt = { ...input, id: randomUUID(), canvasId: canvas.id, kind: 'video', toolName: 'create_video_task', status: 'running', targetAssetPath: originalVideo, sourceSnapshots: [snapshotCanvasSource(document.nodes[1])], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const file = path.join(project, '.maker/canvases/attempts', attempt.id + '.json');
        fs.writeFileSync(file, JSON.stringify(attempt));
        held.push({ route, attempt, file });
        report.simulatedGenerations++;
        report.generationRequests.video++;
      });
      await page.reload();
      const group = page.locator('.group-queue');
      await group.getByRole('button', { name: '▶ 完成剩余流程', exact: true }).click();
      await group.getByRole('button', { name: '确认执行', exact: true }).click();
      const card = page.locator('.card[data-id="' + targetId + '"]');
      await card.getByRole('button', { name: '停止等待', exact: true }).waitFor();
      const firstCanceled = page.waitForResponse(response => response.url().endsWith('/cancel') && response.ok());
      await group.getByRole('button', { name: /停止/ }).click();
      await page.locator('.group-queue[data-phase=paused]').waitFor();
      await firstCanceled;
      await card.getByRole('button', { name: '调整参数', exact: true }).click();
      await page.getByRole('button', { name: '应用并继续', exact: true }).click();
      await card.getByRole('button', { name: '停止等待', exact: true }).waitFor();
      const secondCanceled = page.waitForResponse(response => response.url().endsWith('/cancel') && response.ok());
      await card.getByRole('button', { name: '停止等待', exact: true }).click();
      await card.getByRole('button', { name: '调整参数', exact: true }).waitFor();
      await secondCanceled;
      assert.equal(held.length, 2);
      for (const item of held) {
        const persisted = JSON.parse(fs.readFileSync(item.file, 'utf8'));
        assert.ok(persisted.localWaitCanceledAt);
        const result = { ...persisted, status: 'succeeded', taskId: 'late-' + item.attempt.id, resultAssetPath: files.importGeneratedVideo(canvas.id, ensureVideoAsset()) };
        fs.writeFileSync(item.file, JSON.stringify(result));
        await item.route.fulfill({ json: result });
      }
      await page.reload();
      await card.waitFor();
      assert.equal((await files.load(canvas.id)).nodes.find(node => node.id === targetId).assetPath, originalVideo);
      assert.equal(held.length, 2);
      await page.screenshot({ path: path.join(reportDir, 'video-wait-stopped.png') });
    }],
    ['连线可双向拖动、撤销重做、刷新保留并恢复自动走线', async () => {
      const document = await files.load(canvas.id);
      const source = { id: randomUUID(), type: 'image', title: '来源', x: 160, y: 60, width: 200, height: 150, assetPath: imagePath };
      const target = { ...source, id: randomUUID(), title: '结果', x: 660, y: 550, referenceInput: { includeSelf: false } };
      const link = { id: randomUUID(), from: source.id, to: target.id, kind: 'image-variant' };
      document.nodes = [source, target]; document.edges = [link]; document.viewport = { x: 0, y: 0, scale: 1 };
      delete document.templateFlow;
      await files.save(canvas.id, document, document.revision);
      await page.reload(); await page.getByText('已保存', { exact: true }).waitFor();
      const area = await board.boundingBox();
      await page.mouse.click(area.x + 510, area.y + 380);
      await page.locator('.wire-handle[data-axis=y]').waitFor();
      async function dragHandle(axis, delta) {
        const box = await page.locator('.wire-handle[data-axis=' + axis + ']').boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + (axis === 'x' ? delta : 0), y + (axis === 'y' ? delta : 0), { steps: 5 });
        await page.mouse.up();
      }
      await dragHandle('y', 60); await dragHandle('x', 100);
      assert.deepEqual((await saved()).edges[0].route, { x: 100, y: 60 });
      await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('ControlOrMeta+z');
      assert.deepEqual((await saved()).edges[0].route, { x: 0, y: 60 });
      await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('ControlOrMeta+Shift+z');
      assert.deepEqual((await saved()).edges[0].route, { x: 100, y: 60 });
      await page.reload(); await page.getByText('已保存', { exact: true }).waitFor();
      assert.deepEqual((await files.load(canvas.id)).edges[0].route, { x: 100, y: 60 });
      await page.mouse.click(area.x + 560, area.y + 440);
      await page.getByRole('button', { name: '恢复自动走线' }).click();
      assert.equal((await saved()).edges[0].route, undefined);
      await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('ControlOrMeta+z');
      assert.deepEqual((await saved()).edges[0].route, { x: 100, y: 60 });
      await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press('ControlOrMeta+Shift+z'); await saved();
      // Zoom changes screen delta, not the persisted canvas-coordinate offset.
      await page.getByRole('button', { name: '缩小画布', exact: true }).click();
      const scaled = await saved(); const v = scaled.viewport;
      await page.mouse.click(area.x + v.x + 510 * v.scale, area.y + v.y + 380 * v.scale);
      await dragHandle('x', 50);
      assert.ok(Math.abs((await saved()).edges[0].route.x - 50 / v.scale) < 1);
      await page.getByRole('button', { name: '恢复自动走线' }).click(); await saved();
      await page.screenshot({ path: path.join(reportDir, 'wire-routing.png') });
      const persisted = await files.load(canvas.id);
      for (const route of [{ x: '2', y: 0 }, { x: 0, y: 100001 }, { x: 0 }, null]) {
        await assert.rejects(files.save(canvas.id, { ...persisted, edges: [{ ...link, route }] }, persisted.revision));
      }
      assert.equal((await files.load(canvas.id)).revision, persisted.revision);
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
