import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-card-ui-'));
const checks = [];
const errors = [];
let browser;
let server;
let remoteCalls = 0;
const check = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
try {
  const playwrightModule = process.env.PLAYWRIGHT_MODULE || path.join(
    execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright/index.mjs'
  );
  const { chromium } = await import(
    pathToFileURL(playwrightModule)
      .href
  );
  const bundle = path.join(temporary, 'harness.mjs');
  await build({
    stdin: {
      contents:
        'export {startConsoleServer} from "./src/maker/console/server.ts"; export {ConsoleProjects} from "./src/maker/console/projects.ts"; export {MakerCanvasFiles} from "./src/maker/canvas/files.ts"; export {getConsoleHtml} from "./src/maker/console/web.ts";',
      resolveDir: repo,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    external: ['./native/index.js'],
    logLevel: 'silent',
    banner: {
      js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);',
    },
  });
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles, getConsoleHtml } = await import(
    pathToFileURL(bundle).href
  );
  const project = path.join(temporary, 'project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.maker-mcp/config.json'),
    JSON.stringify({ project_id: 'card-ui-test' })
  );
  fs.writeFileSync(
    path.join(project, '.project/project.json'),
    JSON.stringify({ taptap_publish: { title: '卡片视觉验收' } })
  );
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker\n');
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  registry.add(project);
  const files = new MakerCanvasFiles(project);
  let document = await files.create('角色动作制作');
  const preset = await files.prepareTemplate('7e1cb6ad-732f-4dc3-a951-000000000001', document.id);
  const group = {
    id: randomUUID(),
    type: 'section',
    title: '蓝银战士 · 挥剑动作',
    x: 30,
    y: 30,
    width: 1550,
    height: 505,
  };
  const nodes = preset.nodes.map((node) => ({
    ...node,
    sectionId: group.id,
    x: node.x + 55,
    y: 100,
  }));
  document = await files.save(
    document.id,
    {
      ...document,
      nodes: [group, ...nodes],
      edges: preset.edges,
      viewport: { x: 8, y: 25, scale: 0.96 },
    },
    document.revision
  );
  await files.setActiveCanvasId(document.id);
  server = await startConsoleServer({
    registry,
    execute: async () => {
      throw Error('不执行项目任务');
    },
    html: getConsoleHtml(),
    version: 'card-ui-test',
    remoteProxyManager: {
      listTools: async () => [],
      closeAll: async () => {},
      callTool: async () => {
        remoteCalls++;
        throw Error('不提交付费生成');
      },
    },
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort()
  );
  await page.goto(server.origin + '/?projectid=card-ui-test');
  await page.locator('[data-page=canvas]').click();
  const frame = page.frameLocator('.canvas-frame');
  await frame.locator('.card.animation .animation-preview').waitFor();
  await frame.locator('.canvas-group-state[data-state=ready]').waitFor();
  const activeFrame = page.frames().find((item) => item.url().includes('/canvas?'));
  const addBox = await frame.locator('.workspace-add summary').boundingBox();
  const saveBox = await frame.locator('#save').boundingBox();
  assert.equal(addBox.height, 32);
  assert.equal(addBox.height, saveBox.height);
  assert.ok(Math.abs(addBox.y - saveBox.y) < 1);
  await frame.locator('.workspace-add summary').click();
  const openedColor = await frame
    .locator('.workspace-add summary')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  assert.notEqual(
    await frame
      .locator('.workspace-add summary')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    openedColor
  );
  check('添加节点与保存等高、垂直居中，展开状态与普通状态区分');
  assert.equal(await frame.locator('.canvas-card-header').count(), 5);
  for (const title of nodes.map((node) => node.title))
    assert.equal(await frame.locator('.canvas-card-title').filter({ hasText: title }).count(), 1);
  const video = frame.locator('.card.video-source video');
  await video.evaluate((element) =>
    element.readyState >= 1
      ? Promise.resolve()
      : new Promise((resolve) =>
          element.addEventListener('loadedmetadata', resolve, { once: true })
        )
  );
  const videoGeometry = await video.evaluate((element) => {
    const media = element.getBoundingClientRect();
    const card = element.closest('.card').getBoundingClientRect();
    const header = element
      .closest('.card')
      .querySelector('.canvas-card-header')
      .getBoundingClientRect();
    return {
      ratio: media.width / media.height,
      actual: element.videoWidth / element.videoHeight,
      gap: card.bottom - media.bottom,
      top: media.top - header.bottom,
    };
  });
  assert.ok(
    Math.abs(videoGeometry.ratio - videoGeometry.actual) < 0.01,
    JSON.stringify(videoGeometry)
  );
  assert.ok(
    Math.abs(videoGeometry.gap) < 2 && Math.abs(videoGeometry.top) < 1,
    JSON.stringify(videoGeometry)
  );
  check('图片、视频、序列帧、动画与分组均有标题，视频无空白尾部且比例正确');
  await video.evaluate((element) => element.play());
  await page.waitForTimeout(250);
  assert.equal(await video.evaluate((element) => element.paused), false);
  await video.evaluate((element) => element.pause());
  const animation = frame.locator('.card.animation');
  await animation.getByRole('button', { name: '播放动画', exact: true }).click();
  const changed = await animation.locator('canvas').evaluate(async (canvas) => {
    const cardId = canvas.closest('.card').dataset.id;
    const start = canvas.dataset.frameIndex || '0';
    const initialPixels = canvas.toDataURL();
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const current = document.querySelector('[data-id="' + cardId + '"] canvas');
      if (current && current.dataset.frameIndex !== start && current.toDataURL() !== initialPixels)
        return true;
    }
    return false;
  });
  assert.equal(changed, true);
  await animation.getByRole('button', { name: '暂停', exact: true }).click();
  // 页面重绘会重新挂载 canvas 并绘制首帧；只在同一次挂载内比较暂停像素。
  const paused = await animation.evaluate(async (card) => {
    const cardId = card.dataset.id;
    let previous;
    let pixels;
    let stableSince = 0;
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const currentCard = document.querySelector('[data-id="' + cardId + '"]');
      const canvas = currentCard?.querySelector('canvas');
      const button = currentCard?.querySelector('.animation-controls button');
      if (button?.textContent !== '播放动画') return false;
      if (!canvas || canvas.dataset.frameIndex === undefined) continue;
      const currentPixels = canvas.toDataURL();
      if (canvas !== previous) {
        previous = canvas;
        pixels = currentPixels;
        stableSince = performance.now();
      } else {
        if (currentPixels !== pixels) return false;
        if (performance.now() - stableSince >= 350) return true;
      }
    }
    return false;
  });
  assert.equal(paused, true, '暂停后当前 canvas 不应继续换帧');
  check('原视频播放器可播放暂停，动画实际换帧且能暂停');
  await frame.locator('.card.image .canvas-card-menu').click();
  await frame.locator('#canvas-context-menu').waitFor();
  await frame.locator('#canvas-title').click();
  const more = frame.locator('.card.image .canvas-card-menu');
  const menuAnchor = await more.boundingBox();
  await more.focus();
  await more.press('Enter');
  const menuBounds = await frame.locator('#canvas-context-menu').boundingBox();
  assert.ok(Math.abs(menuBounds.x - menuAnchor.x) < 2);
  assert.ok(Math.abs(menuBounds.y - menuAnchor.y - menuAnchor.height) < 2);
  await frame.locator('#canvas-title').click();
  const sequence = frame.locator('.card.sequence');
  await sequence.locator('.canvas-card-title').click();
  await sequence.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = frame.getByRole('dialog', { name: '序列帧编辑', exact: true });
  await editor.waitFor();
  await editor.getByRole('button', { name: '完成并返回画布', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  check('卡片更多菜单复用右键操作，序列帧原编辑器仍能打开并返回');
  await frame.locator('#canvas-title').click();
  await page.screenshot({ path: path.join(temporary, '01-ready-cards.png') });
  await frame.locator('#save').click();
  await frame.locator('#status[data-state=saved]').waitFor();
  const persisted = await files.load(document.id);
  const originalVideo = nodes.find((node) => node.type === 'video-source');
  const savedVideo = persisted.nodes.find((node) => node.id === originalVideo.id);
  assert.ok(savedVideo.height <= 1600);
  assert.deepEqual(persisted.edges, document.edges);
  await page.reload();
  await page.locator('[data-page=canvas]').click();
  await frame.locator('.canvas-group-state[data-state=ready]').waitFor();
  assert.equal(
    (await files.load(document.id)).nodes.find((node) => node.id === savedVideo.id).height,
    savedVideo.height
  );
  check('保存重开几何稳定，不改变原引用关系');
  const currentFrame = page.frames().find((item) => item.url().includes('/canvas?'));
  await currentFrame.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'status-fixtures';
    fixture.style.cssText =
      'position:fixed;inset:100px 10px 50px;z-index:100;background:#13181c;display:flex;gap:12px;align-items:center;justify-content:center;';
    for (const state of ['loading', 'waiting', 'paused', 'failed', 'unknown']) {
      const card = document.createElement('div');
      card.className = 'card canvas-card';
      card.style.cssText = 'position:relative;width:240px;height:280px;';
      const title = document.createElement('strong');
      title.className = 'canvas-card-title';
      title.textContent = state + ' 状态样例';
      card.append(title);
      const action = document.createElement('button');
      action.textContent = '原操作';
      card.append(action);
      window.renderCanvasCardStatus(card, state, {
        resume: ['waiting', 'paused', 'failed'].includes(state) ? async () => {} : undefined,
        query: state === 'unknown' ? async () => {} : undefined,
        adjust: state === 'waiting' ? () => {} : undefined,
      });
      fixture.append(card);
    }
    document.body.append(fixture);
  });
  const samples = frame.locator('#status-fixtures');
  assert.equal(
    await samples
      .locator('.card-state-loading')
      .locator('..')
      .getByRole('button', { name: '原操作' })
      .isDisabled(),
    true
  );
  for (const name of ['处理并继续', '重试并继续', '查询原任务', '调整参数'])
    assert.ok(await samples.getByRole('button', { name, exact: true }).first().isVisible());
  await page.screenshot({ path: path.join(temporary, '02-status-fixtures.png') });
  check('五种状态样例完整覆盖，loading禁用原操作，保留查询继续和调整入口');
  await currentFrame.evaluate(() => document.querySelector('#status-fixtures').remove());
  await page.setViewportSize({ width: 1093, height: 614 });
  await frame.locator('#fit-canvas').click();
  await page.screenshot({ path: path.join(temporary, '03-compact-cards.png') });
  assert.deepEqual(errors, []);
  assert.equal(remoteCalls, 0);
  check('紧凑视口可用、无页面脚本错误、无付费生成');
} finally {
  await browser?.close();
  await server?.close();
  fs.writeFileSync(
    path.join(temporary, 'checks.json'),
    JSON.stringify({ checks, errors, remoteCalls }, null, 2)
  );
  console.log('验收截图：' + temporary);
}
