import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-template-ui-'));
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
        'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { MakerCanvasFiles } from "./src/maker/canvas/files.ts";',
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
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles } = await import(
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
  let canvas = await files.create('模板管理验证', 'starter');
  const image = { ...canvas.nodes[0], x: 90, y: 100, width: 280, height: 260 };
  const video = {
    id: randomUUID(),
    type: 'video',
    title: '视频输入',
    x: 440,
    y: 100,
    width: 300,
    height: 260,
  };
  canvas = await files.save(
    canvas.id,
    {
      ...canvas,
      nodes: [image, video],
      edges: [{ id: randomUUID(), kind: 'first-frame', from: image.id, to: video.id }],
    },
    canvas.revision
  );
  await files.setActiveCanvasId(canvas.id);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort()
  );
  await page.route('**/generation/image', () => {
    throw new Error('模板管理测试不得触发生图');
  });
  await page.route('**/generation/video', () => {
    throw new Error('模板管理测试不得触发生视频');
  });
  const card = (id) => page.locator('.card[data-id="' + id + '"]');
  const dialog = page.getByRole('dialog', { name: '工作流模板' });
  const menu = page.locator('#canvas-context-menu');
  const saved = () => files.load(canvas.id);
  const userTemplates = async () => (await files.listTemplates()).filter(template => !template.builtin);
  async function until(check) {
    for (let index = 0; index < 60; index++) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      '等待持久化结果超时；页面错误：' + (await page.locator('#error').textContent())
    );
  }
  await page.goto(server.origin + '/canvas?project=' + entry.key);
  await card(image.id).click({ position: { x: 25, y: 25 } });
  await card(video.id).click({ position: { x: 25, y: 25 }, modifiers: ['Shift'] });
  await card(image.id).click({ button: 'right', position: { x: 25, y: 25 } });
  await menu.getByRole('button', { name: '保存为模板', exact: true }).click();
  await dialog.getByRole('textbox', { name: '模板名称' }).fill('游戏动作流程');
  await dialog.getByRole('button', { name: '保存模板', exact: true }).click();
  await until(async () => (await saved()).nodes.some((node) => node.templateId));
  assert.equal((await userTemplates()).length, 1);
  console.log('PASS 框选保存 → 自动分组 → 实际落盘');

  async function dragBy(id, deltaX, deltaY) {
    const bounds = await card(id).boundingBox();
    await page.mouse.move(bounds.x + 24, bounds.y + 24);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 24 + deltaX, bounds.y + 24 + deltaY, { steps: 12 });
    await page.mouse.up();
    await page.locator('#save').click();
  }
  const originalGroup = (await saved()).nodes.find(node => node.type === 'section');
  await dragBy(image.id, 0, 450);
  await until(async () => !(await saved()).nodes.find(node => node.id === image.id).sectionId);
  await dragBy(image.id, 0, -450);
  await until(async () => (await saved()).nodes.find(node => node.id === image.id).sectionId === originalGroup.id);
  console.log('PASS 真实拖出/拖入分组，保存后归属正确');

  await page.getByRole('button', { name: '添加模板', exact: true }).click();
  await dialog.locator('.workflow-template-row').filter({ hasText: '游戏动作流程' }).getByRole('button', { name: '添加', exact: true }).click();
  await until(
    async () => (await saved()).nodes.filter((node) => node.type === 'section').length === 2
  );
  let document = await saved();
  const groups = document.nodes.filter((node) => node.type === 'section');
  const copied = document.nodes.filter((node) => node.sectionId === groups[1].id);
  assert.equal(copied.length, 2);
  assert(!copied.some((node) => [image.id, video.id].includes(node.id)));
  assert.equal(
    document.edges.find((edge) => edge.to === copied.find((node) => node.type === 'video').id).from,
    copied.find((node) => node.type === 'image').id
  );
  await page.reload();
  await card(groups[1].id).waitFor();
  assert.equal((await saved()).nodes.length, 6);
  console.log('PASS 添加独立副本 → 内部引用重映射 → 刷新保留');

  await card(groups[1].id).click({ button: 'right', position: { x: 12, y: 12 } });
  await menu.getByRole('button', { name: '替换模板', exact: true }).click();
  await dialog.getByRole('textbox', { name: '模板名称' }).fill('游戏动作流程 v2');
  await dialog.getByRole('button', { name: '确认替换', exact: true }).click();
  await until(
    async () =>
      (await userTemplates())[0].revision === 2 &&
      (await saved()).nodes.find((node) => node.id === groups[1].id).templateRevision === 2
  );
  assert.equal(
    (await saved()).nodes.find((node) => node.id === groups[0].id).title,
    '游戏动作流程'
  );
  console.log('PASS 替换模板不修改旧实例');

  await page.getByRole('button', { name: '添加模板', exact: true }).click();
  await dialog.locator('.template-more summary').click();
  await dialog.getByRole('button', { name: '编辑副本', exact: true }).click();
  await until(
    async () => (await saved()).nodes.filter((node) => node.type === 'section').length === 3
  );
  assert.equal((await userTemplates())[0].revision, 2);
  console.log('PASS 编辑创建独立副本，不隐式覆盖模板');
  if (process.env.MAKER_TEMPLATE_SCREENSHOT)
    await page.screenshot({ path: process.env.MAKER_TEMPLATE_SCREENSHOT });

  await page.getByRole('button', { name: '添加模板', exact: true }).click();
  await dialog.locator('.template-more summary').click();
  await dialog.getByRole('button', { name: '重命名', exact: true }).click();
  await dialog.getByRole('textbox', { name: '模板名称' }).fill('新动作');
  await dialog.getByRole('button', { name: '保存名称', exact: true }).click();
  await dialog.getByText('新动作', { exact: true }).waitFor();
  assert.equal((await userTemplates())[0].revision, 3);
  await dialog.locator('.template-more summary').click();
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除模板', exact: true }).click();
  await until(async () => (await userTemplates()).length === 0);
  assert.equal((await saved()).nodes.length, 9);
  console.log('PASS 重命名/删除模板，不删除实例和素材');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  document = await saved();
  const last = document.nodes.filter((node) => node.type === 'section').at(-1);
  await card(last.id).click({ button: 'right', position: { x: 12, y: 12 } });
  await menu.getByRole('button', { name: '取消分组', exact: true }).click();
  await page.locator('#save').click();
  await until(async () => !(await saved()).nodes.some((node) => node.id === last.id));
  assert.equal((await saved()).nodes.filter((node) => node.type !== 'section').length, 6);
  assert(!(await saved()).nodes.some((node) => node.sectionId === last.id));
  assert.deepEqual(errors, []);
  console.log('PASS 取消分组保留卡片，浏览器无脚本错误');
  canvas = await files.create('内置预设验证');
  await files.setActiveCanvasId(canvas.id);
  await page.reload();
  for (const name of ['序列帧动画', '角色四方向']) {
    await page.getByRole('button', { name: '添加模板', exact: true }).click();
    const row = dialog.locator('.workflow-template-row').filter({ has: page.getByText(name, { exact: true }) });
    await row.waitFor();
    assert.equal(await row.getByRole('button').count(), 1);
    await row.getByRole('button', { name: '添加', exact: true }).click();
    await until(async () => (await saved()).nodes.filter(node => node.type === 'section').length === (name === '序列帧动画' ? 1 : 2));
  }
  document = await saved();
  assert.equal(document.nodes.length, 19);
  assert.equal(document.edges.length, 15);
  const presetGroups = document.nodes.filter(node => node.type === 'section');
  assert.deepEqual(presetGroups.map(group => document.nodes.filter(node => node.sectionId === group.id).length), [4, 13]);
  for (const node of document.nodes.filter(node => node.assetPath))
    assert(fs.statSync(files.readMedia(node.assetPath).file).size > 0);
  await page.reload();
  await card(presetGroups[1].id).waitFor();
  await card(presetGroups[1].id).click({ button: 'right', position: { x: 12, y: 12 } });
  assert.equal(await menu.getByRole('button', { name: '替换模板', exact: true }).count(), 0);
  assert.equal(await menu.getByRole('button', { name: '保存为新模板', exact: true }).count(), 1);
  const videoPaths = document.nodes.filter(node => node.type === 'video-source').map(node => node.assetPath);
  const loadedVideos = await page.evaluate(async paths => {
    const project = new URL(location.href).searchParams.get('project');
    return Promise.all(paths.map(assetPath => new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const timeout = setTimeout(() => reject(new Error('预设视频加载超时')), 5000);
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        video.removeAttribute('src');
        video.load();
      };
      video.onerror = () => { clearTimeout(timeout); reject(new Error('预设视频不能播放')); };
      video.src = '/api/projects/' + project + '/canvas-media?path=' + encodeURIComponent(assetPath);
    })));
  }, videoPaths);
  assert(loadedVideos.every(video => video.width > 0 && video.height > 0 && video.duration > 0));
  assert.deepEqual(errors, []);
  if (process.env.MAKER_TEMPLATE_SCREENSHOT)
    await page.screenshot({ path: process.env.MAKER_TEMPLATE_SCREENSHOT });
  console.log('PASS 两个内置预设实际添加并刷新保留：19卡/15连线，五段示例视频可解码，预设不能覆盖');
  await page.keyboard.press('Escape');
  const demo = await files.prepareTemplate('7e1cb6ad-732f-4dc3-a951-000000000001', canvas.id);
  for (let index = 0; index < 500; index++) {
    const id = randomUUID();
    fs.writeFileSync(path.join(project, '.maker/canvases/templates', id + '.json'), JSON.stringify({ ...demo, builtin: undefined, id, name: '游戏动作 ' + String(index).padStart(3, '0'), revision: 1 }));
  }
  const requests = [];
  page.on('request', request => { if (request.url().includes('/templates')) requests.push(request.url()); });
  await page.evaluate(() => {
    window.templateObjectUrls = new Set();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); window.templateObjectUrls.add(url); return url; };
    URL.revokeObjectURL = url => { window.templateObjectUrls.delete(url); revoke(url); };
  });
  const opened = performance.now();
  await page.getByRole('button', { name: '添加模板', exact: true }).click();
  await dialog.getByText('我的模板 · 500', { exact: true }).waitFor();
  const openTime = performance.now() - opened;
  assert.equal(await dialog.locator('.workflow-template-row').count(), 26);
  await page.waitForFunction(() => [...document.querySelectorAll('.template-cover img')].filter(image => image.naturalWidth > 0).length >= 2);
  assert.equal(await dialog.locator('video').count(), 0);
  const firstCover = dialog.locator('.template-cover img').first();
  await firstCover.waitFor();
  assert(await firstCover.evaluate(image => image.naturalWidth > 0 && image.naturalWidth <= 256 && image.naturalHeight > 0 && image.naturalHeight <= 256));
  const firstPage = await files.listTemplatePage();
  assert(firstPage.items.every(item => !('nodes' in item) && !('edges' in item)));
  for (let index = 0; index < 3; index++) {
    await dialog.getByRole('button', { name: '下一页' }).click();
    await dialog.getByText((index + 2) + ' / 21', { exact: true }).waitFor();
    assert.equal(await dialog.locator('.workflow-template-row').count(), 26);
  }
  const search = dialog.getByRole('searchbox', { name: '搜索模板' });
  await search.fill('游戏动作 499');
  await dialog.getByText('我的模板 · 1', { exact: true }).waitFor();
  await dialog.getByText('游戏动作 499', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.template-cover img')?.naturalWidth > 0);
  const matched = (await files.listTemplatePage(1, '游戏动作 499')).items[0];
  await until(async () => !files.readTemplateCover(matched.id, matched.revision).source);
  assert(!requests.some(url => /templates\/[0-9a-f-]{36}$/.test(url)));
  await search.fill('没有这个模板');
  await dialog.getByText('我的模板 · 0', { exact: true }).waitFor();
  assert.equal(await dialog.locator('.workflow-template-row').count(), 0);
  await search.fill('游戏动作 499');
  await dialog.getByText('我的模板 · 1', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.template-cover img')?.naturalWidth > 0);
  await page.setViewportSize({ width: 500, height: 850 });
  assert.equal(await dialog.locator('.template-grid').last().evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await search.fill('');
  await dialog.getByText('我的模板 · 500', { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.template-cover img')].filter(image => image.naturalWidth > 0).length >= 2);
  if (process.env.MAKER_TEMPLATE_SCREENSHOT) await page.screenshot({ path: process.env.MAKER_TEMPLATE_SCREENSHOT });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.waitForFunction(() => window.templateObjectUrls.size === 0);
  assert.deepEqual(errors, []);
  console.log('PASS 500条模板：打开 ' + Math.round(openTime) + 'ms；每页26卡（含2预设）、全库搜索、翻页回收、256px缩略缓存、窄屏单列、关闭释放URL');
  console.log('完成：真实浏览器 + 实际文件接口；仅模板管理，不含生图、生视频或完整序列帧验收。');
} finally {
  await browser?.close();
  await server?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
