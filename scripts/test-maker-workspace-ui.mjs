import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-workspace-ui-'));
const checks = [];
const errors = [];
let browser;
let server;
let paidRequests = 0;
const check = (name) => {
  checks.push(name);
  console.log('PASS', name);
};
try {
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  const { chromium } = await import(
    pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(globalRoot, 'playwright/index.mjs'))
      .href
  );
  const bundle = path.join(temporary, 'harness.mjs');
  await build({
    stdin: {
      contents:
        'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { MakerCanvasFiles } from "./src/maker/canvas/files.ts"; export { getConsoleHtml } from "./src/maker/console/web.ts";',
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
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles, getConsoleHtml } = await import(
    pathToFileURL(bundle).href
  );
  const project = path.join(temporary, '中文路径 验收项目');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.maker-mcp/config.json'),
    JSON.stringify({ project_id: 'workspace-ui-test' })
  );
  fs.writeFileSync(
    path.join(project, '.project/project.json'),
    JSON.stringify({ taptap_publish: { title: '工作区布局验收' } })
  );
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker\n');
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  registry.add(project);
  const files = new MakerCanvasFiles(project);
  const initial = await files.create('角色动作 · 工作流', 'starter');
  const second = await files.create('第二张画布', 'empty');
  await files.setActiveCanvasId(initial.id);
  server = await startConsoleServer({
    registry,
    execute: async () => {
      throw new Error('验收不执行项目任务');
    },
    html: getConsoleHtml(),
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
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort()
  );
  await page.goto(server.origin + '/?projectid=workspace-ui-test');
  await page.locator('[data-page="canvas"]').click();
  const frame = page.frameLocator('.canvas-frame');
  await frame.locator('#canvas-title').filter({ hasText: initial.title }).waitFor();
  await frame.locator('.card').first().waitFor();
  check('真实控制台与画布成功加载，无付费生成');
  await page.screenshot({ path: path.join(temporary, '01-layout-1366.png') });
  assert.equal(await frame.locator('.workspace-tab').count(), 1);
  assert.equal(await frame.locator('.workspace-tab button[aria-label^="关闭"]').count(), 0);
  assert.equal(await frame.locator('#video-history').isVisible(), false);
  const library = frame.locator('.workspace-library summary');
  await library.click();
  await frame.getByRole('searchbox', { name: '搜索画布' }).fill('第二张');
  await frame.locator('.workspace-library-list button').click();
  await frame.locator('#canvas-title').filter({ hasText: second.title }).waitFor();
  assert.equal(await frame.locator('.workspace-tab').count(), 2);
  await frame.getByRole('tab', { name: initial.title, exact: true }).click();
  await frame.locator('#canvas-title').filter({ hasText: initial.title }).waitFor();
  check('全部画布搜索、打开页签、切换已打开页签');
  await frame.getByRole('button', { name: '新建空白画布', exact: true }).click();
  await frame.locator('#canvas-title').filter({ hasText: '空白画布' }).waitFor();
  assert.equal(await frame.locator('.card').count(), 0);
  const longName = '四方向角色动画画布名称很长也不能挤掉保存和工具按钮';
  page.once('dialog', (dialog) => dialog.accept(longName));
  await frame.locator('#rename-canvas').click();
  await frame.getByRole('tab', { name: longName, exact: true }).waitFor();
  await frame.locator('#save').click();
  await frame.locator('#status[data-state="saved"]').waitFor();
  const savedCount = (await files.list()).length;
  await frame.getByRole('button', { name: '关闭页签：' + longName, exact: true }).click();
  await frame.locator('#canvas-title').filter({ hasText: second.title }).waitFor();
  assert.equal((await files.list()).length, savedCount);
  check('新建为空白、重命名、真实保存、关闭页签不删除画布');
  await frame.getByRole('tab', { name: initial.title, exact: true }).click();
  await frame.locator('#canvas-title').filter({ hasText: initial.title }).waitFor();
  const scale = await frame.locator('#workspace-zoom').textContent();
  await frame.getByRole('button', { name: '放大画布', exact: true }).click();
  assert.notEqual(await frame.locator('#workspace-zoom').textContent(), scale);
  await frame.getByRole('button', { name: '缩小画布', exact: true }).click();
  assert.equal(await frame.locator('#workspace-zoom').textContent(), scale);
  await frame.locator('#fit-canvas').click();
  check('缩放百分比、放大缩小、适配画布入口');
  await frame.locator('.workspace-add summary').click();
  for (const id of [
    'add-generation',
    'add-image',
    'add-video-source',
    'add-video',
    'add-note',
    'create-section',
  ])
    assert.equal(await frame.locator('#' + id).isVisible(), true);
  await frame.locator('#add-note').click();
  assert.equal(await frame.locator('.workspace-add').getAttribute('open'), null);
  await frame.locator('.workspace-more summary').click();
  for (const id of ['undo', 'redo', 'duplicate-selected', 'delete-selected', 'export-canvas'])
    assert.equal(await frame.locator('#' + id).isVisible(), true);
  await frame.locator('#undo').click();
  await frame.locator('.workspace-more summary').click();
  await frame.locator('#redo').click();
  check('添加节点、更多菜单原入口保留、添加便签及撤销重做');
  await frame.locator('.canvas-log summary').click();
  assert.equal(await frame.locator('#video-history').isVisible(), true);
  assert.equal(await frame.locator('.canvas-log input[type="checkbox"]').count(), 3);
  await frame.locator('#video-history').click();
  await page.screenshot({ path: path.join(temporary, '02-history.png') });
  await page.keyboard.press('Escape');
  await frame.locator('.canvas-log summary').click();
  assert.equal(await frame.locator('#video-history').isVisible(), false);
  check('底部日志展开、筛选入口、视频历史仅展开可见');
  const identity = await page.locator('.canvas-frame').evaluate((element) => {
    element.dataset.identity = 'same-frame';
    return element.src;
  });
  await page.locator('[data-page="overview"]').click();
  assert.equal(
    await page.locator('body').evaluate((element) => element.classList.contains('canvas-mode')),
    false
  );
  await page.locator('[data-page="canvas"]').click();
  assert.equal(await page.locator('.canvas-frame').getAttribute('data-identity'), 'same-frame');
  assert.equal(
    await page.locator('.canvas-frame').getAttribute('src'),
    new URL(identity).pathname + new URL(identity).search
  );
  check('切换控制台主导航不销毁画布iframe');
  await frame.locator('#save').click();
  await frame.locator('#status[data-state="saved"]').waitFor();
  const canvasUrl = '**/canvases/' + initial.id;
  await page.route(canvasUrl, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, json: { error: '模拟保存失败' } })
      : route.continue()
  );
  page.once('dialog', (dialog) => dialog.accept('未保存的修改必须保留'));
  await frame.locator('#rename-canvas').click();
  await frame.getByRole('tab', { name: second.title, exact: true }).click();
  await frame.locator('.canvas-log-preview').filter({ hasText: '已留在此画布' }).waitFor();
  assert.equal(await frame.locator('#canvas-title').textContent(), '未保存的修改必须保留');
  assert.equal(
    await frame.locator('.workspace-tab[data-active="true"] [role="tab"]').textContent(),
    '未保存的修改必须保留'
  );
  await frame.getByRole('button', { name: '关闭页签：未保存的修改必须保留', exact: true }).click();
  assert.equal(await frame.locator('.workspace-tab').count(), 2);
  check('模拟保存失败时切换与关闭当前页签都保留原编辑');
  await frame.locator('.canvas-log summary').click();
  assert.ok((await frame.locator('.canvas-log-error').count()) > 0);
  await frame.getByRole('checkbox', { name: '错误', exact: true }).uncheck();
  assert.equal(await frame.locator('.canvas-log-list .canvas-log-error').count(), 0);
  await frame.getByRole('checkbox', { name: '错误', exact: true }).check();
  const logCount = await frame.locator('.canvas-log-list .canvas-log-row').count();
  await frame.getByRole('button', { name: '放大画布', exact: true }).click();
  assert.equal(await frame.locator('.canvas-log-list .canvas-log-row').count(), logCount);
  await page.screenshot({ path: path.join(temporary, '03-log-expanded.png') });
  await frame.locator('.canvas-log summary').click();
  check('日志真实错误、筛选切换、重绘保留日志实例和展开状态');
  await page.unroute(canvasUrl);
  await frame.locator('#save').click();
  await frame.locator('#status[data-state="saved"]').waitFor();
  let releaseLoad;
  let signalLoad;
  const loading = new Promise((resolve) => {
    signalLoad = resolve;
  });
  const delayedUrl = '**/canvases/' + second.id;
  await page.route(delayedUrl, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    signalLoad();
    await new Promise((resolve) => {
      releaseLoad = resolve;
    });
    return route.fulfill({ status: 500, json: { error: '模拟读取失败' } });
  });
  await frame.getByRole('tab', { name: second.title, exact: true }).click();
  await loading;
  assert.equal(
    await frame.locator('body').evaluate(() => Object.hasOwn(window, 'workspace')),
    false
  );
  assert.equal(await frame.locator('#board').evaluate((element) => element.inert), true);
  assert.equal(await frame.locator('#video-history').evaluate((element) => element.inert), true);
  assert.equal(
    await frame.getByRole('button', { name: '新建空白画布', exact: true }).isDisabled(),
    true
  );
  assert.equal(
    await frame.getByRole('tab', { name: second.title, exact: true }).isDisabled(),
    true
  );
  assert.equal(await frame.locator('#canvas-title').textContent(), '未保存的修改必须保留');
  releaseLoad();
  await frame.locator('.canvas-log-preview').filter({ hasText: '模拟读取失败' }).waitFor();
  assert.equal(
    await frame
      .getByRole('tab', { name: '未保存的修改必须保留', exact: true })
      .getAttribute('aria-selected'),
    'true'
  );
  await page.unroute(delayedUrl);
  check('慢请求期间禁重复切换；加载失败保持原画布和高亮');
  await frame.getByRole('tab', { name: second.title, exact: true }).click();
  await frame.locator('#canvas-title').filter({ hasText: second.title }).waitFor();
  await frame.locator('.workspace-add summary').click();
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    frame.locator('#add-image').click(),
  ]);
  const fixturePath = path.join(project, initial.nodes.find((node) => node.assetPath)?.assetPath);
  await picker.setFiles(fixturePath);
  await frame.locator('.card').waitFor();
  check('移动后的导入图片菜单保留文件选择和实际导入能力');
  await frame.locator('.workspace-more summary').click();
  await frame.locator('#duplicate-selected').click();
  assert.equal(await frame.locator('.card.image').count(), 2);
  await frame.locator('.workspace-more summary').click();
  await frame.locator('#delete-selected').click();
  assert.equal(await frame.locator('.card.image').count(), 1);
  await frame.locator('.workspace-more summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    frame.locator('#export-canvas').click(),
  ]);
  assert.match(download.suggestedFilename(), /\.png$/);
  assert.equal(await download.failure(), null);
  check('更多菜单复制、删除和导出画布实际执行');
  const videoPath = path.join(temporary, 'import-video.mp4');
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-loop',
    '1',
    '-i',
    fixturePath,
    '-t',
    '0.5',
    '-vf',
    'scale=96:96',
    '-pix_fmt',
    'yuv420p',
    videoPath,
  ]);
  await frame.locator('.workspace-add summary').click();
  const [videoPicker] = await Promise.all([
    page.waitForEvent('filechooser'),
    frame.locator('#add-video-source').click(),
  ]);
  await videoPicker.setFiles(videoPath);
  await frame.locator('.card.video-source').waitFor();
  await frame.locator('.workspace-more summary').click();
  await frame.locator('#delete-selected').click();
  check('导入视频菜单实际导入本地视频，无远端请求');
  await frame.locator('.workspace-add summary').click();
  await frame.locator('#add-video').click();
  await frame.locator('.card.video').waitFor();
  await frame.locator('.workspace-more summary').click();
  await frame.locator('#delete-selected').click();
  await frame.locator('.workspace-add summary').click();
  await frame.locator('#add-generation').click();
  assert.equal(await frame.locator('.card.image').count(), 2);
  await frame.locator('.workspace-more summary').click();
  await frame.locator('#delete-selected').click();
  check('新建图片和视频菜单复用原卡片创建流程');
  await frame.locator('#fit-canvas').click();
  await frame.locator('.card').click();
  await frame.locator('#selection-menu').waitFor();
  await page.waitForTimeout(100);
  const menuWithinBoard = () =>
    frame.locator('#selection-menu').evaluate((menu) => {
      const rect = menu.getBoundingClientRect();
      const board = document.querySelector('#board').getBoundingClientRect();
      return rect.x >= board.x && rect.y >= board.y && rect.right <= board.right + 1;
    });
  if (!(await menuWithinBoard())) {
    await page.screenshot({ path: path.join(temporary, 'menu-failure.png') });
    console.log(
      await frame.locator('#selection-menu').evaluate((menu) => ({
        menu: menu.getBoundingClientRect().toJSON(),
        board: document.querySelector('#board').getBoundingClientRect().toJSON(),
        style: menu.getAttribute('style'),
      }))
    );
  }
  assert.equal(await menuWithinBoard(), true);
  await frame.locator('.canvas-log summary').click();
  await page.waitForTimeout(100);
  assert.equal(await menuWithinBoard(), true);
  await frame.locator('.canvas-log summary').click();
  check('调整画布高度后卡片功能菜单仍按画布坐标定位');
  const boardBox = await frame.locator('#board').boundingBox();
  const transformBeforePan = await frame.locator('#world').getAttribute('style');
  await page.mouse.move(boardBox.x + 5, boardBox.y + 5);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(boardBox.x + 50, boardBox.y + 45);
  await page.mouse.up({ button: 'middle' });
  assert.notEqual(await frame.locator('#world').getAttribute('style'), transformBeforePan);
  await page.mouse.move(boardBox.x + 3, boardBox.y + 3);
  await page.mouse.down();
  await page.mouse.move(boardBox.x + boardBox.width - 3, boardBox.y + boardBox.height - 3, {
    steps: 5,
  });
  await page.mouse.up();
  assert.ok((await frame.locator('.card.selected').count()) > 0);
  await frame.locator('.workspace-add summary').click();
  await frame.locator('#create-section').click();
  await frame.locator('.card.section').waitFor();
  await frame.locator('.workspace-more summary').click();
  await frame.locator('#undo').click();
  assert.equal(await frame.locator('.card.section').count(), 0);
  await frame.locator('#board').click({ button: 'right', position: { x: 5, y: 5 } });
  await frame.locator('#canvas-context-menu').waitFor();
  assert.equal(
    await frame.locator('#canvas-context-menu').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
      );
    }),
    true
  );
  await frame.locator('#canvas-title').click();
  check('画布平移、框选、选中卡片分区和右键菜单坐标');
  await frame.locator('#add-template').click();
  await frame.getByRole('dialog', { name: '工作流模板', exact: true }).waitFor();
  await frame.locator('.workflow-template-row').first().waitFor();
  const titleBeforeTemplate = await frame.locator('#canvas-title').textContent();
  await frame
    .locator('.workflow-template-row')
    .first()
    .getByRole('button', { name: '添加', exact: true })
    .click();
  await frame.locator('.card.section').waitFor();
  assert.equal(await frame.locator('#canvas-title').textContent(), titleBeforeTemplate);
  await frame.locator('#fit-canvas').click();
  await page.screenshot({ path: path.join(temporary, '04-template-workspace.png') });
  check('添加模板插入当前画布，保留原模板库和工作流');
  for (let index = 0; index < 8; index++) {
    await frame.getByRole('button', { name: '新建空白画布', exact: true }).click();
    await frame.locator('#canvas-title').filter({ hasText: '空白画布' }).waitFor();
    page.once('dialog', (dialog) => dialog.accept('长名称动画工作流页签-' + index));
    await frame.locator('#rename-canvas').click();
  }
  assert.equal(
    await frame
      .locator('.workspace-tabs')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    true
  );
  await frame.locator('#save').click();
  await frame.locator('#status[data-state="saved"]').waitFor();
  check('多个长名称页签横向滚动，不挤掉全部画布和新建入口');
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1093, height: 614 },
  ]) {
    const before = await frame.locator('#world').getAttribute('style');
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    assert.equal(await frame.locator('#world').getAttribute('style'), before);
    const hostFits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight
    );
    assert.equal(hostFits, true, 'host overflow ' + JSON.stringify(viewport));
    const fits = await frame.locator('body').evaluate(() => {
      const board = document.querySelector('#board').getBoundingClientRect();
      const footer = document.querySelector('.workspace-bottom').getBoundingClientRect();
      return {
        width: document.documentElement.scrollWidth <= innerWidth,
        height: document.documentElement.scrollHeight <= innerHeight,
        board: board.height,
        bottom: footer.bottom <= innerHeight + 1,
      };
    });
    assert.ok(fits.width && fits.height && fits.bottom && fits.board > 250, JSON.stringify(fits));
    await page.screenshot({ path: path.join(temporary, 'layout-' + viewport.width + '.png') });
    check(viewport.width + '×' + viewport.height + ' 无页面溢出、日志可达、视口不自动适配');
  }
  await page.reload();
  await page.locator('[data-page="canvas"]').click();
  await frame.locator('#canvas-title').filter({ hasText: '长名称动画工作流页签-7' }).waitFor();
  assert.equal(await frame.locator('.workspace-tab').count(), 1);
  check('刷新仅恢复活动画布，不持久化临时页签列表');
  await page.locator('#close-canvas').click();
  assert.equal(await page.locator('.canvas-frame').count(), 0);
  await page.getByRole('button', { name: '打开当前项目画布', exact: true }).click();
  await frame.locator('#canvas-title').filter({ hasText: '长名称动画工作流页签-7' }).waitFor();
  check('主导航次要关闭入口和重新打开保留已保存画布');
  assert.deepEqual(errors, []);
  assert.equal(paidRequests, 0);
  check('无浏览器脚本错误、无真实生成请求');
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  fs.writeFileSync(
    path.join(temporary, 'checks.json'),
    JSON.stringify({ checks, errors, paidRequests }, null, 2)
  );
  console.log('验收目录：' + temporary);
}
