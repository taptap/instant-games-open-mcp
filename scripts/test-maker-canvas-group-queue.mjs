import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-group-queue-'));
let browser;
try {
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright/index.mjs')).href);
  const bundle = path.join(temporary, 'page.mjs');
  await build({ stdin: { contents: 'export { getCanvasPageHtml } from "./src/maker/canvas/page.ts"; export { STARTER_IMAGE_BASE64 } from "./src/maker/canvas/starterImages.ts"; export { snapshotCanvasSource } from "./src/maker/canvas/dependencies.ts";', resolveDir: repo }, bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' });
  const { getCanvasPageHtml, STARTER_IMAGE_BASE64, snapshotCanvasSource } = await import(pathToFileURL(bundle).href);
  const html = getCanvasPageHtml();
  const image = Buffer.from(STARTER_IMAGE_BASE64[0], 'base64');
  fs.writeFileSync(path.join(temporary, 'source.jpg'), image);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', path.join(temporary, 'source.jpg'), '-t', '0.5', '-vf', 'scale=128:128', '-pix_fmt', 'yuv420p', path.join(temporary, 'fixture.mp4')]);
  const videoBytes = fs.readFileSync(path.join(temporary, 'fixture.mp4'));
  const canvasId = randomUUID();
  const groupId = randomUUID();
  const group = { id: groupId, type: 'section', templateId: randomUUID(), title: '角色方向 · 队列交互测试', x: 30, y: 30, width: 1080, height: 650 };
  const master = { id: randomUUID(), type: 'image', title: '角色首图', sectionId: groupId, x: 60, y: 220, width: 180, height: 220, assetPath: 'assets/image/master.jpg' };
  const references = ['正面', '背面', '左侧'].map((direction, index) => ({ id: randomUUID(), type: 'image', title: direction + '参考图', sectionId: groupId, x: 300 + index * 260, y: 80, width: 210, height: 250, assetPath: 'assets/image/example.jpg', templatePending: true, generation: { operation: 'variant', sourceImageId: master.id, prompt: '游戏角色：保持角色设计；生成指定方向的站姿参考图' } }));
  const videos = references.map((reference, index) => ({ id: randomUUID(), type: 'video', title: ['正面', '背面', '左侧'][index] + '动作', sectionId: groupId, x: reference.x, y: 380, width: 210, height: 230, templatePending: true, generation: { prompt: '角色原地跑步，保持参考图朝向', parameters: { duration: 4, mode: 'first_frame' } } }));
  let canvas = { id: canvasId, title: '分组队列页面回归', revision: 0, viewport: { x: 0, y: 0, scale: 1 }, nodes: [group, master, ...references, ...videos], edges: references.flatMap((reference, index) => [ { id: randomUUID(), from: master.id, to: reference.id, kind: 'image-variant' }, { id: randomUUID(), from: reference.id, to: videos[index].id, kind: 'first-frame' } ]) };
  const attempts = [];
  const calls = [];
  const errors = [];
  let release;
  let holdNext = true;
  let failNext = false;
  let confirmations = 0;
  let importedImages = 0;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 880 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { confirmations++; void dialog.accept(); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/canvas') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname.endsWith('/canvas-media')) return route.fulfill({ contentType: url.search.includes('.mp4') ? 'video/mp4' : 'image/jpeg', body: url.search.includes('.mp4') ? videoBytes : image });
    let response;
    if (url.pathname.endsWith('/canvases')) response = [{ id: canvasId, title: canvas.title }];
    else if (url.pathname.endsWith('/canvases/active')) response = { canvasId };
    else if (url.pathname.endsWith('/video-history')) response = { items: [], total: 0 };
    else if (url.pathname.endsWith('/images')) response = { relativePath: 'assets/image/imported-' + (++importedImages) + '.jpg' };
    else if (url.pathname.endsWith('/canvases/' + canvasId)) {
      if (route.request().method() === 'PUT') canvas = { ...route.request().postDataJSON(), revision: canvas.revision + 1 };
      response = canvas;
    } else if (/\/generation\/(image|video)$/.test(url.pathname)) {
      const input = route.request().postDataJSON();
      const kind = url.pathname.endsWith('/image') ? 'image' : 'video';
      calls.push(input.targetNodeId);
      const target = canvas.nodes.find(node => node.id === input.targetNodeId);
      response = { ...input, id: randomUUID(), canvasId, kind, status: failNext ? 'unknown' : 'succeeded', error: failNext ? '模拟结果未知；禁止自动重提' : undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), targetAssetPath: target?.assetPath || '', resultAssetPath: failNext ? undefined : kind === 'image' ? 'assets/image/' + randomUUID() + '.jpg' : 'assets/video/result.mp4', sourceSnapshots: (input.sourceImageIds || [input.sourceImageId]).map(id => snapshotCanvasSource(canvas.nodes.find(node => node.id === id))), parameters: { mode: input.mode, duration: input.duration, model: input.model } };
      failNext = false;
      attempts.push(response);
      if (holdNext) { holdNext = false; await new Promise(resolve => { release = resolve; }); }
    } else if (url.pathname.endsWith('/generation')) response = attempts;
    else throw new Error('非预期请求：' + url.pathname);
    return route.fulfill({ json: response });
  });
  await page.goto('http://127.0.0.1/canvas?project=group-test');
  const queue = page.getByRole('group', { name: group.title + '执行队列', exact: true });
  await queue.getByRole('button', { name: '▶ 完成剩余流程', exact: true }).click();
  await page.locator('.card-state-loading').waitFor();
  assert.equal(confirmations, 1);
  const chip = id => queue.locator('[data-node-id="' + id + '"]');
  await chip(references[2].id).dragTo(chip(references[1].id));
  assert.equal(await queue.locator('.group-queue-task').first().getAttribute('data-node-id'), references[2].id);
  await chip(videos[2].id).dragTo(chip(references[2].id));
  assert.equal(await queue.locator('.group-queue-task').first().getAttribute('data-node-id'), references[2].id);
  if (process.env.MAKER_GROUP_QUEUE_SCREENSHOT) await page.screenshot({ path: process.env.MAKER_GROUP_QUEUE_SCREENSHOT });
  await queue.getByRole('button', { name: '停止后续', exact: true }).click();
  release();
  await queue.getByText('已暂停', { exact: true }).waitFor();
  assert.deepEqual(calls, [references[0].id]);
  await queue.getByRole('button', { name: '继续剩余流程', exact: true }).click();
  await queue.getByText('已完成', { exact: true }).waitFor();
  assert.deepEqual(calls.slice(0, 3), [references[0].id, references[2].id, references[1].id]);
  assert.equal(calls.length, 6);
  assert.equal(confirmations, 2);
  assert.equal(canvas.nodes.length, 8);
  assert.equal(canvas.nodes.filter(node => node.templatePending).length, 0);
  await page.reload();
  assert.equal(await queue.getByRole('button', { name: '停止后续', exact: true }).count(), 0);
  assert.equal(calls.length, 6);
  canvas.nodes.find(node => node.id === references[1].id).templatePending = true;
  failNext = true;
  await page.reload();
  await queue.getByRole('button', { name: '▶ 完成剩余流程', exact: true }).click();
  await queue.getByText('已暂停', { exact: true }).waitFor();
  assert.equal(calls.length, 7);
  await queue.getByRole('button', { name: '继续剩余流程', exact: true }).click();
  await queue.getByText('已暂停', { exact: true }).waitFor();
  assert.equal(calls.length, 7);
  assert.deepEqual(errors, []);
  for (const scenario of ['text', 'import', 'linked', 'unknown']) {
    attempts.splice(0);
    const target = scenario === 'linked'
      ? { ...references[0], templatePending: true }
      : { ...master };
    canvas = {
      ...canvas,
      nodes: [group, ...(scenario === 'linked' ? [{ ...master }] : []), target],
      edges: scenario === 'linked'
        ? [{ id: randomUUID(), from: master.id, to: target.id, kind: 'image-variant' }]
        : [],
    };
    await page.reload();
    const targetCard = page.locator('.card[data-id="' + target.id + '"]');
    await targetCard.click();
    if (scenario === 'linked') {
      await targetCard.getByRole('button', { name: '调整参数', exact: true }).click();
    } else {
      await page.getByRole('button', { name: '快速编辑', exact: true }).click();
    }
    const prompt = page.locator('.generation-panel textarea').first();
    await prompt.fill('游戏怪物：一只可爱的橘色猫咪，全身完整，纯色背景');
    assert.equal(await page.locator('.generation-reference-remove').count(), scenario === 'linked' ? 2 : 1);
    while (await page.locator('.generation-reference-remove').count()) {
      await page.locator('.generation-reference-remove').first().click();
    }
    assert.match(await prompt.inputValue(), /橘色猫咪/);
    await page.getByText('未使用参考图，将仅根据提示词生成。', { exact: true }).waitFor();
    const addReference = page.locator('.generation-references').getByRole('button', { name: '导入参考图', exact: true });
    assert.equal(await addReference.isVisible(), true);
    assert.equal(await page.locator('.generation-actions').getByRole('button', { name: '导入参考图', exact: true }).count(), 0);
    assert.equal(canvas.nodes.find(node => node.id === target.id).assetPath, target.assetPath);
    if (scenario === 'import') {
      const [picker] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: '导入参考图', exact: true }).click(),
      ]);
      assert.equal(picker.isMultiple(), true);
      await picker.setFiles(Array.from({ length: 14 }, (_, index) => ({ name: 'reference-' + index + '.jpg', mimeType: 'image/jpeg', buffer: image })));
      await page.getByAltText('参考图 14', { exact: true }).waitFor();
      assert.equal(await addReference.isDisabled(), true);
      const strip = page.locator('.generation-references');
      assert.equal(await strip.evaluate(element => element.scrollWidth > element.clientWidth), true);
      assert.equal(await strip.evaluate(element => getComputedStyle(element).flexWrap), 'nowrap');
      await page.getByRole('button', { name: '移除参考图 1', exact: true }).click();
      assert.equal(await addReference.isEnabled(), true);
      assert.equal(await page.locator('.generation-reference img').count(), 13);
      if (process.env.MAKER_REFERENCE_STRIP_SCREENSHOT) {
        await addReference.scrollIntoViewIfNeeded();
        await page.screenshot({ path: process.env.MAKER_REFERENCE_STRIP_SCREENSHOT });
      }
      assert.equal(await page.getByAltText('当前图片', { exact: true }).count(), 0);
    }
    failNext = scenario === 'unknown';
    await page.getByRole('button', { name: '应用并继续', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.card-state-loading'));
    const submitted = attempts.at(-1);
    assert.equal(submitted.targetNodeId, target.id);
    assert.equal(submitted.operation, 'generate');
    assert.equal(submitted.sourceImagePath, undefined);
    assert.equal(submitted.sourceImageIds, undefined);
    assert.equal(submitted.sourceImagePaths, undefined);
    assert.deepEqual(submitted.referenceImagePaths, scenario === 'import' ? Array.from({ length: 13 }, (_, index) => 'assets/image/imported-' + (index + 2) + '.jpg') : []);
    assert.match(submitted.prompt, /橘色猫咪/);
    assert.equal(canvas.nodes.length, scenario === 'linked' ? 3 : 2);
    if (scenario === 'unknown') {
      assert.equal(canvas.nodes.find(node => node.id === target.id).assetPath, target.assetPath);
    } else {
      assert.notEqual(canvas.nodes.find(node => node.id === target.id).assetPath, target.assetPath);
      assert.equal(canvas.edges.filter(edge => edge.to === target.id).length, 0);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS 模板图片参考可全部移除，文本草稿保留，纯文本/仅导入图生成不隐式携带旧图或上游图，原位更新且未知结果保留旧图。');
  console.log('PASS 横向参考图列表：空态加号、多选14张、横向滚动、达到上限禁用、删除后恢复添加，底部不再有导入按钮。');
  console.log('PASS Group 底部队列：一次确认接续图/视频、拖拽排序、拒绝倒置依赖、停止后续、完成跳过、刷新不恢复付费任务、unknown 不重提。');
  console.log('使用真实打包页面与本地媒体、远端响应夹具；不提交付费生成，不生成 HTML 报告。');
} finally {
  await browser?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
