import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-card-status-'));
let browser;
try {
  const modulePath =
    process.env.PLAYWRIGHT_MODULE ||
    path.join(
      execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
      'playwright/index.mjs'
    );
  const { chromium } = await import(pathToFileURL(modulePath).href);
  const bundle = path.join(temporary, 'page.mjs');
  await build({
    stdin: {
      contents:
        'export { getCanvasPageHtml } from "./src/maker/canvas/page.ts"; export { STARTER_IMAGE_BASE64 } from "./src/maker/canvas/starterImages.ts";',
      resolveDir: repo,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'silent',
  });
  const { getCanvasPageHtml, STARTER_IMAGE_BASE64 } = await import(pathToFileURL(bundle).href);
  const html = getCanvasPageHtml();
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const canvasId = randomUUID();
  const groupId = randomUUID();
  const titles = ['处理中', '待处理', '等待继续', '处理失败', '结果待确认', '视频后台生成'];
  const nodes = titles.map((title, index) => ({
    id: randomUUID(),
    type: index === 5 ? 'video' : 'image',
    title,
    x: 60 + (index % 3) * 350,
    y: 60 + Math.floor(index / 3) * 370,
    width: 300,
    height: 300,
    ...(index === 5 ? {} : { assetPath: 'assets/image/canvas-demo.jpg' }),
    sectionId: groupId,
    ...(index === 1 ? { templatePending: true } : {}),
  }));
  let canvas = {
    id: canvasId,
    title: '卡片状态视觉验证（状态夹具）',
    revision: 0,
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: [
      {
        id: groupId,
        type: 'section',
        templateId: randomUUID(),
        templateRevision: 1,
        title: '状态展示',
        x: 30,
        y: 10,
        width: 1060,
        height: 760,
      },
      ...nodes,
    ],
    edges: [{ id: randomUUID(), from: nodes[0].id, to: nodes[5].id, kind: 'first-frame' }],
  };
  const attempts = ['running', undefined, 'canceled', 'failed', 'unknown', 'pending'].flatMap(
    (status, index) =>
      status
        ? [
            {
              id: randomUUID(),
              canvasId,
              targetNodeId: nodes[index].id,
              kind: index === 5 ? 'video' : 'image',
              status,
              prompt: '状态回归夹具，不提交生成',
              createdAt: '2026-10-01T00:00:00Z',
              updatedAt: '2026-10-01T00:00:00Z',
              ...(index === 5 ? { taskId: 'fixture-task', sourceImageId: nodes[0].id } : {}),
            },
          ]
        : []
  );
  const errors = [];
  let queries = 0;
  const submissions = [];
  let workflowFixture = false;
  let videoResponseStatus = 'failed';
  let releaseImage;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1150, height: 930 } });
  page.setDefaultTimeout(6000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/canvas') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname.endsWith('/canvas-media'))
      return route.fulfill({
        contentType: 'image/jpeg',
        body: Buffer.from(STARTER_IMAGE_BASE64[0], 'base64'),
      });
    let response;
    if (url.pathname.endsWith('/canvases')) response = [{ id: canvasId, title: canvas.title }];
    else if (url.pathname.endsWith('/canvases/active')) response = { canvasId };
    else if (url.pathname.endsWith('/canvases/' + canvasId)) {
      if (route.request().method() === 'PUT')
        canvas = { ...route.request().postDataJSON(), revision: canvas.revision + 1 };
      response = canvas;
    } else if (workflowFixture && /\/generation\/(image|video)$/.test(url.pathname)) {
      const input = route.request().postDataJSON();
      const kind = url.pathname.endsWith('/image') ? 'image' : 'video';
      submissions.push({ kind, input });
      if (kind === 'image') await new Promise(resolve => { releaseImage = resolve; });
      response = {
        ...input, id: randomUUID(), canvasId, kind,
        status: kind === 'image' ? 'succeeded' : videoResponseStatus,
        ...(kind === 'image' ? { resultAssetPath: 'assets/image/fixture-updated.jpg' } : { error: videoResponseStatus === 'unknown' ? '执行结果未知，请核查原任务。<img src=x onerror="window.logInjection=1">' : '模拟视频失败：验证停止后续，不调用远端' }),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      attempts.push(response);
    } else if (url.pathname.endsWith('/generation')) response = attempts;
    else if (url.pathname.endsWith('/query')) {
      queries++;
      attempts.at(-1).status = 'unknown';
      response = attempts.at(-1);
    } else throw new Error('非预期请求（禁止生成）: ' + url.pathname);
    return route.fulfill({ json: response });
  });
  await page.goto('http://127.0.0.1/canvas?project=status-test');
  await page.locator('.card-state-overlay').nth(5).waitFor();
  assert.deepEqual(
    await page
      .locator('.card-state-overlay')
      .evaluateAll((elements) => elements.map((element) => element.dataset.state)),
    ['loading', 'waiting', 'paused', 'failed', 'unknown', 'loading']
  );
  for (const node of nodes) {
    const card = page.locator('.card[data-id="' + node.id + '"]');
    const bounds = await card.boundingBox();
    const overlay = await card.locator('.card-state-overlay').boundingBox();
    assert(
      Math.abs(bounds.width - overlay.width) <= 4 && Math.abs(bounds.height - overlay.height) <= 4
    );
  }
  const loading = page.locator('.card-state-loading').first();
  const before = await loading
    .locator('.card-state-icon')
    .evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(180);
  assert.notEqual(
    await loading
      .locator('.card-state-icon')
      .evaluate((element) => getComputedStyle(element).transform),
    before
  );
  await loading.click();
  assert.equal(await page.locator('#selection-menu').isVisible(), false);
  if (process.env.MAKER_CARD_STATUS_SCREENSHOT)
    await page.screenshot({ path: process.env.MAKER_CARD_STATUS_SCREENSHOT });
  await page.getByRole('button', { name: '查询原任务', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.card-state-unknown').length === 2);
  assert.equal(queries, 1);
  await page.locator('.card[data-id="' + nodes[1].id + '"]').click();
  assert.equal(await page.locator('#selection-menu').isVisible(), false);
  await page.locator('.card[data-id="' + nodes[1].id + '"]').getByRole('button', { name: '调整参数' }).click();
  assert.equal(await page.locator('#selection-toolbar').isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '应用并继续' }).isVisible(), true);
  assert.equal(await page.locator('.card-state-unknown .card-state-adjust').count(), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await loading
      .locator('.card-state-icon')
      .evaluate((element) => getComputedStyle(element).animationName),
    'none'
  );
  attempts.splice(0);
  canvas.nodes.forEach((node) => {
    delete node.templatePending;
  });
  await page.reload();
  await page.locator('.card').nth(6).waitFor();
  assert.equal(await page.locator('.card-state-overlay').count(), 0);
  workflowFixture = true;
  const head = canvas.nodes.find(node => node.id === nodes[0].id);
  const image = canvas.nodes.find(node => node.id === nodes[1].id);
  const video = canvas.nodes.find(node => node.id === nodes[5].id);
  head.assetPath = 'assets/image/fixture-new-head.jpg';
  image.generation = { prompt: '游戏角色：火焰剑士；动作：挥剑', operation: 'variant', sourceImageId: head.id };
  image.sourceSnapshot = { nodeId: head.id, version: 'image|assets/image/canvas-demo.jpg|manual-asset' };
  video.generation = { prompt: '动作描述：游戏剑士原地挥剑', parameters: { duration: 6, resolution: '480p', model: '2.0', ratio: '1:1' } };
  canvas.edges = [
    { id: randomUUID(), from: head.id, to: image.id, kind: 'image-variant' },
    { id: randomUUID(), from: image.id, to: video.id, kind: 'first-frame' },
  ];
  const cardIds = canvas.nodes.map(node => node.id);
  await page.reload();
  const imageCard = page.locator('.card[data-id="' + image.id + '"]');
  const videoCard = page.locator('.card[data-id="' + video.id + '"]');
  await imageCard.locator('.card-state-waiting').waitFor();
  await videoCard.locator('.card-state-waiting').waitFor();
  await imageCard.getByRole('button', { name: '处理并继续', exact: true }).click();
  await imageCard.locator('.card-state-loading').waitFor();
  assert.equal(await page.locator('#selection-menu').isVisible(), false);
  while (!releaseImage) await page.waitForTimeout(20);
  releaseImage();
  await videoCard.locator('.card-state-failed').waitFor();
  assert.equal(await imageCard.locator('.card-state-overlay').count(), 0);
  assert.deepEqual(submissions.map(item => item.kind), ['image', 'video']);
  assert.equal(submissions[0].input.sourceImagePath, head.assetPath);
  assert.equal(submissions[0].input.targetNodeId, image.id);
  assert.equal(submissions[1].input.sourceImagePath, 'assets/image/fixture-updated.jpg');
  assert.equal(submissions[1].input.targetNodeId, video.id);
  assert.equal(submissions[1].input.duration, 6);
  assert.equal(submissions[1].input.resolution, '480p');
  assert.deepEqual(canvas.nodes.map(node => node.id), cardIds);
  await videoCard.getByRole('button', { name: '重试并继续', exact: true }).waitFor();
  await page.reload();
  await videoCard.locator('.card-state-failed').waitFor();
  assert.equal(submissions.length, 2);
  assert.equal(await imageCard.locator('.card-state-overlay').count(), 0);
  await videoCard.click();
  assert.equal(await page.locator('#selection-menu').isVisible(), false);
  await videoCard.getByRole('button', { name: '调整参数' }).click();
  await page.locator('#selection-toolbar .prompt-section-input').first().fill('游戏剑士原地跳跃');
  videoResponseStatus = 'unknown';
  await page.getByRole('button', { name: '应用并继续', exact: true }).click();
  await videoCard.locator('.card-state-unknown').waitFor();
  assert.equal(await page.locator('#selection-toolbar').isVisible(), false);
  assert.equal(await page.locator('#selection-menu').isVisible(), false);
  assert.equal(submissions.length, 3);
  assert.equal(submissions[2].input.targetNodeId, video.id);
  assert.match(submissions[2].input.prompt, /原地跳跃/);
  assert.equal(submissions[2].input.duration, 6);
  assert.deepEqual(canvas.nodes.map(node => node.id), cardIds);
  assert.equal(await videoCard.getByRole('button', { name: '调整参数' }).count(), 0);
  assert.equal(await videoCard.getByRole('button', { name: '重试并继续' }).count(), 0);
  const logs = page.locator('#canvas-log');
  assert.equal(await logs.locator('details').getAttribute('open'), null);
  assert((await logs.locator('.canvas-log-preview .canvas-log-row').count()) <= 2);
  assert.equal(await page.locator('#error').isVisible(), false);
  await logs.locator('summary').click();
  await logs.locator('.canvas-log-list .canvas-log-warning').waitFor();
  await logs.getByLabel('错误', { exact: true }).uncheck();
  assert.equal(await logs.locator('.canvas-log-list .canvas-log-error').count(), 0);
  await logs.getByLabel('普通', { exact: true }).uncheck();
  assert.equal(await logs.locator('.canvas-log-list .canvas-log-info').count(), 0);
  assert.equal(await page.evaluate(() => window.logInjection), undefined);
  assert.equal(await logs.locator('img').count(), 0);
  await logs.getByRole('button', { name: '清空显示' }).click();
  assert.match(await logs.locator('.canvas-log-list').textContent(), /暂无/);
  if (process.env.MAKER_WORKFLOW_ACTIONS_SCREENSHOT) {
    await logs.locator('summary').click();
    await page.screenshot({ path: process.env.MAKER_WORKFLOW_ACTIONS_SCREENSHOT });
  }
  assert.deepEqual(errors, []);
  attempts.splice(0);
  const tail = { ...head, id: randomUUID(), title: '尾帧狼王', assetPath: 'assets/image/fixture-tail.jpg', x: 60, y: 420 };
  const start = { ...head, title: '首帧灰狼', x: 60, y: 60 };
  const twoFrameVideo = { ...video, title: '首尾帧变身视频', x: 430, y: 100, templatePending: true,
    generation: { prompt: '灰狼连续变身为狼王', sourceImageId: start.id, sourceImageIds: [start.id, tail.id], parameters: { duration: 5 } } };
  canvas.nodes = [canvas.nodes.find(node => node.type === 'section'), tail, start, twoFrameVideo];
  canvas.edges = [
    { id: randomUUID(), from: tail.id, to: twoFrameVideo.id, kind: 'first-frame' },
    { id: randomUUID(), from: start.id, to: twoFrameVideo.id, kind: 'first-frame' },
  ];
  videoResponseStatus = 'failed';
  await page.reload();
  const twoFrameCard = page.locator('.card[data-id="' + twoFrameVideo.id + '"]');
  await twoFrameCard.getByRole('button', { name: '调整参数' }).click();
  const panel = page.locator('#selection-toolbar');
  assert.equal(await panel.locator('.generation-reference img').count(), 2);
  const mode = panel.locator('.generation-field').filter({ hasText: '输入方式' }).locator('select');
  assert.equal(await mode.inputValue(), 'select_mode');
  await mode.selectOption('first_last_frame');
  assert.match(await panel.locator('.generation-reference').nth(0).textContent(), /首帧.*灰狼/);
  assert.match(await panel.locator('.generation-reference').nth(1).textContent(), /尾帧.*狼王/);
  assert((await panel.locator('.generation-reference img').nth(0).getAttribute('src')).includes(encodeURIComponent(start.assetPath)));
  assert((await panel.locator('.generation-reference img').nth(1).getAttribute('src')).includes(encodeURIComponent(tail.assetPath)));
  if (process.env.MAKER_MULTI_REFERENCE_SCREENSHOT) await page.screenshot({ path: process.env.MAKER_MULTI_REFERENCE_SCREENSHOT });
  const previousSubmissions = submissions.length;
  await panel.getByRole('button', { name: '应用并继续' }).click();
  await twoFrameCard.locator('.card-state-failed').waitFor();
  assert.equal(submissions.length, previousSubmissions + 1);
  const submitted = submissions.at(-1).input;
  assert.deepEqual(submitted.sourceImageIds, [start.id, tail.id]);
  assert.deepEqual(submitted.sourceImagePaths, [start.assetPath, tail.assetPath]);
  assert.equal(submitted.mode, 'first_last_frame');
  assert.equal(submitted.targetNodeId, twoFrameVideo.id);
  assert.equal(canvas.nodes.filter(node => node.type === 'video').length, 1);
  assert.equal(await panel.isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS 双图编辑显示两个当前引用，首尾顺序不受节点/边排列影响，显式选择模式，提交双图并复用当前卡，失败不新建节点。');
  console.log(
    'PASS 五种遮罩状态、全卡覆盖、旋转动画、加载阻止点击、待处理可编辑、查询原任务、减少动效、完成移除遮罩。'
  );
  console.log(
    'PASS 引用变化、遮罩调整参数原位执行、菜单隐藏、未知不重提、两行日志折叠与级别筛选、安全文本呈现。使用状态/接口夹具验证真实页面；不提交或伪装真实生图/视频，不生成 HTML 报告。'
  );
} finally {
  await browser?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
