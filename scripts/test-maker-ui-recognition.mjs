import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PNG } from 'pngjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-recognition-'));
let browser, server;
const priorConfig = process.env.TAPTAP_MAKER_VISION_CONFIG;
try {
  const filename = path.join(temporary, 'harness.mjs');
  await build({
    stdin: {
      contents:
        'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { MakerCanvasFiles } from "./src/maker/canvas/files.ts";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: filename,
    external: ['./native/index.js'],
    logLevel: 'silent',
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
  });
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles } = await import(
    pathToFileURL(filename).href
  );
  const project = path.join(temporary, 'project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(project, '.project'), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.maker-mcp/config.json'),
    JSON.stringify({ project_id: 'recognition-ui-test' })
  );
  fs.writeFileSync(
    path.join(project, '.project/project.json'),
    JSON.stringify({ taptap_publish: { title: '识图接口模拟测试' } })
  );
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker' + String.fromCharCode(10));
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  const entry = registry.add(project);
  delete process.env.TAPTAP_MAKER_VISION_CONFIG;
  const files = new MakerCanvasFiles(project);
  const doc = await files.create('识图对比测试', 'empty');
  const png = new PNG({ width: 300, height: 500 });
  for (let y = 0; y < 500; y++)
    for (let x = 0; x < 300; x++) {
      const i = (y * 300 + x) * 4;
      const yellow = x >= 30 && x < 230 && [80, 180, 280].some((top) => y >= top && y < top + 50);
      png.data[i] = yellow ? 240 : 30;
      png.data[i + 1] = yellow ? 190 : 35;
      png.data[i + 2] = yellow ? 30 : 40;
      png.data[i + 3] = 255;
    }
  const media = await files.importImage(PNG.sync.write(png));
  const sourceId = randomUUID(),
    groupId = randomUUID();
  doc.nodes = [
    {
      id: groupId,
      type: 'section',
      templateId: '7e1cb6ad-732f-4dc3-a951-000000000012',
      templateRevision: 9,
      title: '游戏UI制作',
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    },
    {
      id: sourceId,
      type: 'image',
      sectionId: groupId,
      title: '② 去文字设计稿',
      x: 40,
      y: 240,
      width: 300,
      height: 520,
      assetPath: media.relativePath,
      uiRecognition: { enabled: false, model: 'fixture-a', results: [] },
    },
    {
      id: randomUUID(),
      type: 'note',
      sectionId: groupId,
      title: '识图元素清单',
      x: 400,
      y: 240,
      width: 400,
      height: 400,
      uiRecognitionSourceId: sourceId,
    },
  ];
  const originalPng = new PNG({ width: 300, height: 500 });
  originalPng.data.fill(255);
  const originalMedia = await files.importImage(PNG.sync.write(originalPng));
  const originalId = randomUUID();
  doc.nodes.find((node) => node.id === sourceId).generation = {
    prompt: '去文字', operation: 'variant', sourceImageIds: [originalId],
  };
  doc.nodes.push({
    id: originalId,
    type: 'image',
    title: '未去文字原稿',
    sectionId: groupId,
    x: 1300,
    y: 240,
    width: 300,
    height: 520,
    assetPath: originalMedia.relativePath,
  });
  doc.edges.push({ id: randomUUID(), from: originalId, to: sourceId, kind: 'image-variant' });
  const annotationId = randomUUID();
  doc.nodes.push({
    id: annotationId,
    type: 'image',
    sectionId: groupId,
    title: '按钮标注',
    x: 850,
    y: 240,
    width: 300,
    height: 520,
    assetPath: media.relativePath,
    uiAnnotation: ['action'],
    templatePending: true,
    generation: { prompt: '标注按钮', operation: 'variant', sourceImageIds: [sourceId] },
  });
  doc.edges.push({ id: randomUUID(), from: sourceId, to: annotationId, kind: 'image-variant' });
  await files.save(doc.id, doc, doc.revision);
  let generations = 0;
  server = await startConsoleServer({
    registry,
    execute: async () => {
      throw new Error('No project tasks in test');
    },
    html: '',
    version: 'recognition-test',
    remoteProxyManager: {
      listTools: async () => [],
      closeAll: async () => {},
      callTool: async () => {
        generations++;
        throw new Error('No image generation in recognition-only test');
      },
    },
  });
  const modulePath =
    process.env.PLAYWRIGHT_MODULE ||
    path.join(
      execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
      'playwright/index.mjs'
    );
  const { chromium } = await import(pathToFileURL(modulePath).href);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(server.origin + '/canvas?project=' + entry.key);
  await page.waitForFunction(() => document.getElementById('status').textContent === '已保存');
  const base = server.origin + '/api/projects/' + entry.key + '/canvases/automation';
  async function command(action, input = {}) {
    let live;
    for (let i = 0; i < 50; i++) {
      const pages = await (await fetch(base + '/pages')).json();
      live = pages.find((item) => item.canvasId === doc.id);
      if (live?.revision === (await files.load(doc.id)).revision) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(live, 'fixture canvas is connected');
    const response = await fetch(base + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: server.origin },
      body: JSON.stringify({
        requestId: randomUUID(),
        pageId: live.id,
        canvasId: doc.id,
        revision: live.revision,
        action,
        input,
        ...(action === 'run' ? { allowPaid: true } : {}),
      }),
    });
    const submitted = await response.json();
    assert.ok(response.ok, JSON.stringify(submitted));
    for (let i = 0; i < 100; i++) {
      const result = await (await fetch(base + '/status?id=' + submitted.id)).json();
      if (!['queued', 'running'].includes(result.status)) return result;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Fixture command timed out');
  }
  const beforeResize = await files.load(doc.id);
  const resized = await command('update-nodes', { nodes: [{ id: sourceId, width: 360 }] });
  assert.equal(resized.status, 'succeeded', JSON.stringify(resized));
  const resizedSource = resized.result.nodes.find((node) => node.id === sourceId);
  assert.ok(Math.abs(resizedSource.width - 360) < 0.001);
  assert.ok(Math.abs(resizedSource.height - ((358 * 500) / 300 + 42)) < 0.001);
  assert.deepEqual((await files.load(doc.id)).viewport, beforeResize.viewport);
  assert.equal(resizedSource.recognitionState.status, 'disabled');
  assert.match(resized.result.nodes.find((node) => node.uiRecognitionSourceId).text, /识图已关闭/);
  assert.equal(
    (await command('update-nodes', { nodes: [{ id: sourceId, height: 1 }] })).status,
    'failed'
  );
  const defaultRun = await command('run', { id: groupId });
  assert.equal(defaultRun.status, 'failed', JSON.stringify(defaultRun));
  assert.match(defaultRun.error, /当前 AI 看图/);
  assert.equal(generations, 0);
  const queried = await command('query', { id: sourceId });
  assert.equal(queried.status, 'failed', JSON.stringify(queried));
  assert.match(queried.error, /没有原图片生成记录/, 'text-free card queries generation without a pending vision request');
  const result = {
    id: randomUUID(),
    model: 'fixture-agent-a',
    prompt: '识别全部按钮',
    createdAt: new Date().toISOString(),
    durationMs: 0,
    sourcePath: media.relativePath,
    sourceSha256: createHash('sha256')
      .update(fs.readFileSync(path.join(project, media.relativePath)))
      .digest('hex'),
    width: 300,
    height: 500,
    elements: Array.from({ length: 3 }, (_, i) => ({
      id: 'B' + (32 + i * 2),
      name: '黄色按钮' + i,
      category: 'action',
      rect: [30, 80 + i * 100, 200, 50],
      parentId: null,
      zIndex: 1,
      states: ['normal'],
      cutout: true,
    })),
  };
  const wrong = await command('update-nodes', {
    nodes: [
      { id: sourceId, uiRecognition: { result: { ...result, sourceSha256: '0'.repeat(64) } } },
    ],
  });
  assert.equal(wrong.status, 'failed', JSON.stringify(wrong));
  assert.match(wrong.error, /原稿内容已变化/);
  assert.equal(
    (await files.load(doc.id)).nodes.find((n) => n.id === sourceId).uiRecognition.results.length,
    0
  );
  const saved = await command('update-nodes', {
    nodes: [{ id: sourceId, uiRecognition: { result } }],
  });
  assert.equal(saved.status, 'succeeded', JSON.stringify(saved));
  const continued = await command('run', { id: groupId });
  assert.equal(continued.status, 'succeeded', JSON.stringify(continued));
  const annotation = (await files.load(doc.id)).nodes.find((n) => n.id === annotationId);
  assert.equal(Boolean(annotation.templatePending), false);
  assert.notEqual(annotation.assetPath, media.relativePath);
  const annotatedPng = PNG.sync.read(fs.readFileSync(path.join(project, annotation.assetPath)));
  assert.deepEqual(
    [...annotatedPng.data.subarray(0, 3)],
    [30, 35, 40],
    'annotation must draw on text-free output, never original'
  );
  await page.getByRole('button', { name: '识图：开 · 对比' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ui-recognition-dialog section').length === 1
  );
  const first = (await files.load(doc.id)).nodes.find((node) => node.id === sourceId).uiRecognition;
  assert.equal(first.results.length, 1);
  assert.equal(first.results[0].elements.length, 3);
  const note = page.locator('.ui-recognition-note');
  assert.match(await note.inputValue(), /B32[\s\S]*B34[\s\S]*B36/);
  assert.match(await note.inputValue(), /\[30, 280, 200, 50\]/);
  assert.equal(await note.isVisible(), true);
  assert.match(await page.locator('.ui-recognition-status').textContent(), /3 个元素/);
  const inspected = await command('inspect');
  assert.equal(
    inspected.result.nodes.find((node) => node.id === sourceId).recognitionState.status,
    'ready'
  );
  assert.match(inspected.result.nodes.find((node) => node.uiRecognitionSourceId).text, /B36/);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const another = await command('update-nodes', {
    nodes: [
      {
        id: sourceId,
        uiRecognition: {
          result: {
            ...result,
            id: randomUUID(),
            model: 'fixture-agent-b',
            elements: result.elements.slice(0, 2),
          },
        },
      },
    ],
  });
  assert.equal(another.status, 'succeeded', JSON.stringify(another));
  const second = (await files.load(doc.id)).nodes.find((n) => n.id === sourceId).uiRecognition;
  assert.equal(second.results.length, 2);
  assert.notEqual(second.selectedId, first.selectedId);
  await page.getByRole('button', { name: '识图：开 · 对比' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ui-recognition-dialog section canvas').length === 2
  );
  await page.getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '识图：关 · 对比' }).waitFor();
  assert.match(await note.inputValue(), /识图已关闭/);
  assert.doesNotMatch(await note.inputValue(), /B32/);
  await page.reload();
  await page.locator('.ui-recognition-note').waitFor();
  assert.match(await note.inputValue(), /识图已关闭/);
  await page.getByRole('button', { name: '识图：关 · 对比' }).click();
  await page.getByRole('button', { name: '新建对照画布（保留本页结果）' }).click();
  await page.getByRole('button', { name: '识图：开 · 对比' }).waitFor();
  await page.getByRole('button', { name: '识图：开 · 对比' }).click();
  await page.getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(generations, 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: CLI card sizing and inspect, visible recognition notes/status, model comparison; 0 image-generation calls. Agent lists are fixtures; annotations use text-free pixels, no vision service configured.'
  );
} finally {
  await browser?.close();
  await server?.close();
  if (priorConfig === undefined) delete process.env.TAPTAP_MAKER_VISION_CONFIG;
  else process.env.TAPTAP_MAKER_VISION_CONFIG = priorConfig;
  fs.rmSync(temporary, { recursive: true, force: true });
}
