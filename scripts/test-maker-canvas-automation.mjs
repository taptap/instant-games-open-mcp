import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-canvas-cli-'));
process.env.TAPTAP_MAKER_HOME = path.join(temporary, 'home');
let server;
let browser;
try {
  const bundle = path.join(temporary, 'harness.mjs');
  await build({
    stdin: {
      contents: [
        'export { startConsoleServer } from "./src/maker/console/server.ts";',
        'export { ConsoleProjects } from "./src/maker/console/projects.ts";',
        'export { MakerCanvasFiles } from "./src/maker/canvas/files.ts";',
        'export { snapshotCanvasSource } from "./src/maker/canvas/dependencies.ts";',
        'export { runMakerCli } from "./src/maker/cli/commands.ts";',
        'export { createConsoleLauncherIdentity } from "./src/maker/console/cli.ts";',
      ].join(';'),
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
  const {
    startConsoleServer,
    ConsoleProjects,
    MakerCanvasFiles,
    runMakerCli,
    createConsoleLauncherIdentity,
    snapshotCanvasSource,
  } = await import(pathToFileURL(bundle).href);
  const project = path.join(temporary, '中文 project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.mkdirSync(path.join(project, '.project'));
  fs.writeFileSync(
    path.join(project, '.maker-mcp/config.json'),
    JSON.stringify({ project_id: 'automation-test' })
  );
  fs.writeFileSync(
    path.join(project, '.project/project.json'),
    JSON.stringify({ taptap_publish: { title: 'CLI test' } })
  );
  fs.writeFileSync(path.join(project, '.gitignore'), '.maker' + String.fromCharCode(10));
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  registry.add(project);
  const instanceId = randomUUID();
  let paidRequests = 0;
  server = await startConsoleServer({
    registry,
    instanceId,
    execute: async () => {
      throw new Error('Unexpected project action');
    },
    html: '',
    version: 'dev',
    remoteProxyManager: {
      listTools: async () => [],
      closeAll: async () => {},
      callTool: async () => {
        paidRequests++;
        throw new Error('Real paid generation prohibited');
      },
    },
  });
  const sessionDirectory = path.join(process.env.TAPTAP_MAKER_HOME, 'console');
  fs.mkdirSync(sessionDirectory, { recursive: true });
  const entry = fs.realpathSync(process.argv[1]);
  fs.writeFileSync(
    path.join(sessionDirectory, 'session.json'),
    JSON.stringify({
      schema: 1,
      origin: server.origin,
      instanceId,
      launcher: createConsoleLauncherIdentity('dev', {
        entry,
        mtimeMs: fs.statSync(entry).mtimeMs,
      }),
      pid: process.pid,
    })
  );
  const files = new MakerCanvasFiles(project);
  const canvas = await files.create('CLI test');
  await files.setActiveCanvasId(canvas.id);
  const globalPlaywright = path.join(
    execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
    'playwright/index.mjs'
  );
  const playwright = await import(
    process.env.PLAYWRIGHT_MODULE
      ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
      : fs.existsSync(globalPlaywright)
        ? pathToFileURL(globalPlaywright).href
        : 'playwright'
  );
  browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('dialog', (dialog) => {
    browserErrors.push('Unexpected dialog: ' + dialog.message());
    void dialog.dismiss();
  });
  async function cli(action, options = {}) {
    const chunks = [];
    const original = process.stdout.write;
    process.stdout.write = function (chunk) {
      chunks.push(String(chunk));
      return true;
    };
    try {
      await runMakerCli([
        'canvas',
        action,
        '--target-dir',
        project,
        ...Object.entries(options).flatMap(([key, value]) =>
          value === true ? ['--' + key] : ['--' + key, String(value)]
        ),
      ]);
    } finally {
      process.stdout.write = original;
    }
    return JSON.parse(chunks.join('').trim());
  }
  const initial = await cli('pages');
  assert.deepEqual(initial.pages, []);
  assert.equal((await cli('inspect', { 'canvas-id': canvas.id, saved: true })).source, 'saved');
  await page.goto(initial.url);
  let pageId;
  for (let attempt = 0; attempt < 30; attempt++) {
    pageId = (await cli('pages')).pages[0]?.id;
    if (pageId) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(pageId, 'canvas page connected');
  let current = canvas;
  async function command(action, input = {}, extra = {}) {
    const submitted = await cli(action, {
      'page-id': pageId,
      'canvas-id': current.id,
      revision: current.revision,
      ...(extra['input-file'] ? {} : { input: JSON.stringify(input) }),
      ...extra,
    });
    assert.equal(submitted.status, 'queued', JSON.stringify(submitted));
    const completed = await cli('wait', { 'operation-id': submitted.id, timeout: 30 });
    if (completed.status === 'succeeded' && completed.result?.id) current = completed.result;
    return completed;
  }
  async function success(action, input, extra) {
    const result = await command(action, input, extra);
    assert.equal(result.status, 'succeeded', JSON.stringify(result));
    return result.result;
  }
  await success('inspect');
  const inputFile = path.join(temporary, '输入.json');
  fs.writeFileSync(inputFile, String.fromCharCode(0xfeff) + JSON.stringify({ title: 'CLI test' }));
  await success('rename', undefined, { 'input-file': inputFile });
  await success('add-node', { type: 'note' });
  const noteId = current.selectedIds[0];
  await success('update-nodes', {
    nodes: [{ id: noteId, title: 'AI note', text: '<script>plain text</script>', x: 321 }],
  });
  assert.equal((await files.load(canvas.id)).nodes[0].x, 321);
  assert.equal(await page.locator('[data-id="' + noteId + '"] strong').textContent(), 'AI note');
  const revision = current.revision;
  assert.equal(
    (await command('rename', { title: 'stale' }, { revision: revision - 1 })).status,
    'failed'
  );
  assert.equal((await files.load(canvas.id)).title, 'CLI test');
  assert.equal(
    (
      await command('update-nodes', {
        nodes: [
          { id: noteId, title: 'should not apply' },
          { id: 'missing', title: 'bad' },
        ],
      })
    ).status,
    'failed'
  );
  assert.equal((await files.load(canvas.id)).nodes[0].title, 'AI note');
  const requestId = randomUUID();
  await success('duplicate', { ids: [noteId] }, { 'request-id': requestId });
  const copiedCount = (await files.load(canvas.id)).nodes.length;
  const duplicate = await cli('duplicate', {
    'page-id': pageId,
    'canvas-id': current.id,
    revision,
    input: JSON.stringify({ ids: [noteId] }),
    'request-id': requestId,
  });
  assert.equal(duplicate.status, 'succeeded');
  assert.equal((await files.load(canvas.id)).nodes.length, copiedCount);
  await success('delete-nodes', { ids: current.nodes.map((node) => node.id) });
  await success('add-node', { type: 'image' });
  const imageId = current.selectedIds[0];
  await success('update-nodes', {
    nodes: [
      { id: imageId, prompt: 'cat, full body', parameters: { model: 'gpt', aspectRatio: '1:1' } },
    ],
  });
  assert.equal((await command('run', { id: imageId })).status, 'failed');
  let simulated = 0;
  let lastImageInput;
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = 'green';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const media = await files.importImage(Buffer.from(bytes, 'base64'), 'image/png');
  await page.route('**/generation/image', async (route) => {
    simulated++;
    const input = route.request().postDataJSON();
    lastImageInput = input;
    await route.fulfill({
      json: {
        ...input,
        id: randomUUID(),
        canvasId: canvas.id,
        kind: 'image',
        toolName: 'generate_image',
        status: 'succeeded',
        resultAssetPath: media.relativePath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });
  await success('run', { id: imageId }, { 'allow-paid': true });
  assert.equal(simulated, 1);
  assert.equal(
    (await files.load(canvas.id)).nodes.find((node) => node.id === imageId).assetPath,
    media.relativePath
  );
  await page.mouse.click(1200, 800);
  await success('inspect');
  await success('add-node', { type: 'video' });
  const inputVideo = current.selectedIds[0];
  await success('update-nodes', {
    nodes: [
      {
        id: inputVideo,
        prompt: 'walk in place',
        parameters: { model: '2.5', duration: 8, mode: 'first_frame' },
      },
    ],
  });
  assert.equal(
    (await files.load(canvas.id)).nodes.find((node) => node.id === inputVideo).generationDraft
      .parameters.model,
    '2.5'
  );
  await success('connect', { from: imageId, to: inputVideo });
  const edge = current.edges.find((edge) => edge.to === inputVideo);
  assert.ok(edge);
  await success('disconnect', { edgeId: edge.id });
  assert.equal(
    current.edges.some((edge) => edge.to === inputVideo),
    false
  );
  await success('group', { ids: [imageId, inputVideo] });
  const temporaryGroup = current.selectedIds[0];
  await success('delete-nodes', { ids: [inputVideo, temporaryGroup] });
  const templates = await cli('templates');
  assert.ok(templates.presets.length);
  await success('add-template', { id: templates.presets[0].id });
  assert.ok(current.nodes.some((node) => node.type === 'section'));
  const sequence = current.nodes.find((node) => node.type === 'sequence');
  await success('update-nodes', {
    nodes: [{ id: sequence.id, sequenceSettings: { fps: 3, width: 128, height: 128 } }],
  });
  assert.equal(
    (await files.load(canvas.id)).nodes.find((node) => node.id === sequence.id).sequenceSettings
      .fps,
    3
  );
  assert.equal((await command('run', { id: sequence.id })).status, 'failed');
  const group = current.nodes.find((node) => node.type === 'section');
  await page.route('**/generation/video', async (route) => {
    const input = route.request().postDataJSON();
    const saved = await files.load(canvas.id);
    const target = saved.nodes.find((node) => node.id === input.targetNodeId);
    const attempt = {
      ...input,
      id: randomUUID(),
      taskId: 'simulated-task',
      canvasId: canvas.id,
      kind: 'video',
      toolName: 'create_video_task',
      status: 'succeeded',
      resultAssetPath: target.assetPath,
      parameters: { model: input.model, duration: input.duration, mode: input.mode },
      targetAssetPath: target.assetPath || '',
      sourceSnapshots: input.sourceImageIds.map((id) =>
        snapshotCanvasSource(saved.nodes.find((node) => node.id === id))
      ),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const attempts = path.join(project, '.maker/canvases/attempts');
    fs.mkdirSync(attempts, { recursive: true });
    fs.writeFileSync(path.join(attempts, attempt.id + '.json'), JSON.stringify(attempt));
    await route.fulfill({ json: attempt });
  });
  await success('run', { id: group.id }, { 'allow-paid': true });
  const completedSequence = current.nodes.find((node) => node.id === sequence.id);
  assert.ok(completedSequence.frameSetInfo.frameCount > 0);
  assert.equal(
    completedSequence.state.sequence.frameCount,
    completedSequence.frameSetInfo.frameCount
  );
  assert.equal(
    (await files.load(canvas.id)).nodes.find((node) => node.id === sequence.id).frameSetInfo.fps,
    3
  );
  await success('update-nodes', { nodes: [{ id: sequence.id, sequenceSettings: { fps: 4 } }] });
  await success('run', { id: sequence.id });
  assert.equal(
    (await files.load(canvas.id)).nodes.find((node) => node.id === sequence.id).frameSetInfo.fps,
    4
  );
  await success('create', { title: 'new canvas' });
  assert.notEqual(current.id, canvas.id);
  await success('open', { id: canvas.id });
  assert.equal(current.id, canvas.id);
  const video = current.nodes.find((node) => node.type === 'video-source');
  assert.equal((await command('stop', { id: video.id })).status, 'failed');
  assert.equal((await command('query', { id: video.id })).status, 'failed');
  const importFile = path.join(temporary, '参考 图片.png');
  fs.writeFileSync(importFile, Buffer.from(bytes, 'base64'));
  await success('import', { title: 'Imported reference' }, { file: importFile });
  const importedImage = current.nodes.find((node) => node.id === current.selectedIds[0]);
  assert.equal(importedImage.type, 'image');
  assert.ok(fs.existsSync(path.join(project, importedImage.assetPath)));
  await success('set-references', { id: imageId, sourceIds: [importedImage.id] });
  assert.ok(current.edges.some((edge) => edge.from === importedImage.id && edge.to === imageId));
  await success('run', { id: imageId }, { 'allow-paid': true });
  assert.deepEqual(lastImageInput.sourceImageIds, [importedImage.id]);
  await success('set-references', { id: imageId, sourceIds: [] });
  assert.equal(
    current.edges.some((edge) => edge.to === imageId),
    false
  );
  await page.reload();
  await page.waitForTimeout(1200);
  pageId = (await cli('pages')).pages.find((item) => item.id !== pageId)?.id || pageId;
  await success('inspect');
  assert.equal(current.nodes.find((node) => node.id === imageId).referenceInput.includeSelf, false);
  await success('run', { id: imageId }, { 'allow-paid': true });
  assert.equal(lastImageInput.sourceImageId, undefined);
  assert.equal(lastImageInput.sourceImagePaths, undefined);
  assert.deepEqual(lastImageInput.referenceImagePaths, []);
  const videoFile = path.join(temporary, '导入 视频.mp4');
  fs.copyFileSync(path.join(project, video.assetPath), videoFile);
  await success('import', { title: 'Imported video' }, { file: videoFile });
  const importedVideo = current.nodes.find((node) => node.id === current.selectedIds[0]);
  assert.equal(importedVideo.type, 'video-source');
  assert.ok(importedVideo.videoInfo.duration > 0);
  await success('add-node', { type: 'sequence', sourceId: importedVideo.id });
  const importedSequenceId = current.selectedIds[0];
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await success('update-nodes', {
    nodes: [
      {
        id: importedSequenceId,
        sequenceSettings: { start: 0, end: 1, fps: 2, width: 64, height: 64, cutout: false },
      },
    ],
  });
  await success('run', { id: importedSequenceId });
  await success('add-node', { type: 'animation', sourceId: importedSequenceId });
  const importedAnimationId = current.selectedIds[0];
  const full = current;
  const partial = await success('inspect', { id: importedSequenceId });
  assert.ok(partial.nodes.length < full.nodes.length);
  assert.ok(partial.nodes.some((node) => node.id === importedVideo.id));
  await success('inspect');
  for (const [id, format] of [
    [importedImage.id, 'png'],
    [importedImage.id, 'jpg'],
    [importedVideo.id, 'video'],
    [importedSequenceId, 'atlas'],
    [importedAnimationId, 'frames'],
  ]) {
    const exported = await command('export', { id, format });
    assert.equal(exported.status, 'succeeded', JSON.stringify(exported));
    const saved = await cli('download', { 'operation-id': exported.id, 'output-dir': temporary });
    const output = fs.readFileSync(saved.outputPath);
    assert.equal(output.length, exported.result.export.size);
    if (format === 'video') assert.deepEqual(output, fs.readFileSync(videoFile));
    if (format === 'png') assert.equal(output.subarray(1, 4).toString(), 'PNG');
    if (format === 'jpg') assert.equal(output.readUInt16BE(0), 0xffd8);
    if (format === 'atlas' || format === 'frames') {
      assert.equal(output.readUInt32LE(0), 0x04034b50);
      assert.ok(output.includes(Buffer.from('README')));
      assert.ok(
        output.includes(Buffer.from(format === 'atlas' ? 'spritesheet.json' : 'animation.lua'))
      );
    }
  }
  const exportedDirectly = await cli('export', {
    'page-id': pageId,
    'canvas-id': current.id,
    revision: current.revision,
    input: JSON.stringify({ id: importedSequenceId, format: 'atlas', loop: false }),
    'output-dir': temporary,
  });
  assert.equal(exportedDirectly.status, 'succeeded', JSON.stringify(exportedDirectly));
  assert.ok(fs.statSync(exportedDirectly.outputPath).size > 0);
  await success('inspect');
  const saveRoute = '**/canvases/' + canvas.id;
  await page.route(saveRoute, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 409, json: { error: 'simulated save conflict' } })
      : route.continue()
  );
  assert.equal((await command('rename', { title: 'unsaved rename' })).status, 'failed');
  assert.equal((await files.load(canvas.id)).title, 'CLI test');
  assert.equal((await command('rename', { title: 'must not overwrite' })).status, 'failed');
  assert.equal(await page.evaluate(() => document.body.inert), false);
  await page.unroute(saveRoute);
  await page.locator('#save').click();
  await page.waitForFunction(() => document.getElementById('status').textContent === '已保存');
  await success('inspect');
  await success('rename', { title: 'CLI test' });
  await page.screenshot({ path: path.join(temporary, 'canvas-cli.png') });
  await success('add-template', { id: '7e1cb6ad-732f-4dc3-a951-000000000004' });
  const modelGroup = current.selectedIds[0];
  const modelNodes = current.nodes.filter((node) => node.sectionId === modelGroup);
  const character = modelNodes.find((node) => node.type === 'image');
  const views = modelNodes.find((node) => node.type === 'model-views');
  const model = modelNodes.find((node) => node.type === 'model');
  assert.ok(character && views && model);
  assert.equal((await command('run', { id: modelGroup }, { 'allow-paid': true })).status, 'failed');
  assert.equal((await command('run', { id: views.id })).status, 'failed');
  await success('update-nodes', {
    nodes: [
      { id: character.id, prompt: 'Test character' },
      { id: views.id, modelQuality: 'high_quality' },
    ],
  });
  await success('run', { id: character.id }, { 'allow-paid': true });
  let modelAttempt;
  let modelSubmissions = 0;
  await page.route('**/canvases/' + canvas.id + '/models', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: modelAttempt ? [modelAttempt] : [] });
    const input = route.request().postDataJSON();
    if (input.action === 'start') {
      modelSubmissions++;
      modelAttempt = {
        id: randomUUID(),
        canvasId: canvas.id,
        nodeId: views.id,
        sourceId: character.id,
        sourceVersion: snapshotCanvasSource(current.nodes.find((node) => node.id === character.id))
          .version,
        quality: 'high_quality',
        status: 'review',
        phase: 'views',
        assetId: 'mock-3d-asset',
        stepId: 'multiview_review',
        reviewId: 'review-token',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        previews: ['front', 'left', 'back', 'right'].map((view) => ({
          view,
          path: media.relativePath,
        })),
      };
    } else if (input.action === 'confirm') {
      assert.equal(input.reviewId, 'review-token');
      modelSubmissions++;
      modelAttempt = {
        ...modelAttempt,
        status: 'completed',
        phase: 'model',
        modelPath: 'assets/model/mock/Meshes/main.mdl',
      };
    }
    await route.fulfill({ json: modelAttempt });
  });
  await success('run', { id: views.id }, { 'allow-paid': true });
  assert.equal(current.nodes.find((node) => node.id === views.id).state.model.status, 'review');
  assert.equal(
    await page.locator('[data-id="' + views.id + '"] .model-views-gallery img').count(),
    4
  );
  assert.equal(modelSubmissions, 1);
  assert.equal((await command('run', { id: model.id }, { 'allow-paid': true })).status, 'failed');
  assert.equal(
    (await command('confirm-model', { id: model.id, reviewId: 'review-token' })).status,
    'failed'
  );
  assert.equal(modelSubmissions, 1);
  await page.reload();
  await page.waitForTimeout(1200);
  pageId = (await cli('pages')).pages.find((item) => item.id !== pageId)?.id || pageId;
  await success('inspect');
  assert.equal(
    current.nodes.find((node) => node.id === views.id).state.model.assetId,
    'mock-3d-asset'
  );
  await success('query', { id: views.id });
  await page.screenshot({ path: path.join(temporary, 'canvas-model-review.png') });
  const viewsCard = page.locator('[data-id="' + views.id + '"]');
  assert.equal(await viewsCard.getByRole('combobox', { name: '模型质量' }).isVisible(), false);
  await viewsCard.locator('.canvas-card-menu').click();
  assert.equal(
    await viewsCard.getByRole('combobox', { name: '模型质量' }).inputValue(),
    'high_quality'
  );
  const transformBeforeMenuScroll = await page
    .locator('#world')
    .evaluate((world) => world.style.transform);
  await viewsCard
    .locator('.model-menu-actions')
    .dispatchEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
  assert.equal(
    await page.locator('#world').evaluate((world) => world.style.transform),
    transformBeforeMenuScroll
  );
  await viewsCard.locator('.canvas-card-menu').click();
  let thumbnailLoads = 0;
  let thumbnailFails = false;
  await page.route('**/canvas-model-preview?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('mode') !== 'thumbnail')
      return route.continue();
    thumbnailLoads++;
    const result = thumbnailFails
      ? { error: '模拟缩略图读取失败' }
      : {
          image:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
        };
    await route.fulfill({
      contentType: 'text/html',
      body:
        '<script>parent.postMessage(' +
        JSON.stringify({ type: 'maker:model-thumbnail', ...result }) +
        ',location.origin)</script>',
    });
  });
  await success(
    'confirm-model',
    { id: model.id, reviewId: 'review-token' },
    { 'allow-paid': true }
  );
  assert.equal(current.nodes.find((node) => node.id === model.id).state.model.status, 'completed');
  assert.equal(modelSubmissions, 2);
  const modelCard = page.locator('[data-id="' + model.id + '"]');
  await modelCard.locator('.model-thumbnail[data-state="ready"] img').waitFor();
  assert.equal(await page.locator('.model-thumbnail-worker').count(), 0);
  assert.equal(await modelCard.locator('code').isVisible(), false);
  await success('inspect');
  assert.equal(thumbnailLoads, 1);
  await modelCard.locator('.canvas-card-menu').click();
  assert.equal(
    await modelCard.getByRole('button', { name: '查询原任务', exact: true }).isVisible(),
    true
  );
  thumbnailFails = true;
  await modelCard.getByRole('button', { name: '重试预览', exact: true }).click();
  await modelCard.locator('.model-thumbnail[data-state="error"]').waitFor();
  assert.equal(await page.locator('.model-thumbnail-worker').count(), 0);
  thumbnailFails = false;
  await modelCard.locator('.canvas-card-menu').click();
  await modelCard.getByRole('button', { name: '重试预览', exact: true }).click();
  await modelCard.locator('.model-thumbnail[data-state="ready"]').waitFor();
  assert.equal(thumbnailLoads, 3);
  assert.equal(modelSubmissions, 2);
  await modelCard.locator('.model-thumbnail').click();
  await page.locator('.model-preview-dialog[open]').waitFor();
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  const preview = await command('preview-model', { id: model.id });
  assert.equal(preview.status, 'succeeded', JSON.stringify(preview));
  assert.equal(preview.result.opened, true);
  assert.ok(preview.result.url.includes('/canvas-model-preview?'));
  await page.locator('.model-preview-dialog[open]').waitFor();
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  await page.locator('.model-preview-dialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.model-preview-dialog').count(), 0);
  assert.equal(modelSubmissions, 2);
  await page.route('**/models/export?*', (route) =>
    route.fulfill({ contentType: 'application/zip', body: Buffer.from('PK-model-test') })
  );
  const modelExport = await command('export', { id: model.id, format: 'model' });
  assert.equal(modelExport.status, 'succeeded', JSON.stringify(modelExport));
  const modelDownload = await cli('download', {
    'operation-id': modelExport.id,
    'output-dir': temporary,
  });
  assert.equal(fs.readFileSync(modelDownload.outputPath).toString(), 'PK-model-test');
  await success('update-nodes', { nodes: [{ id: views.id, modelQuality: 'balanced' }] });
  assert.equal(current.nodes.find((node) => node.id === views.id).state.model.stale, true);
  assert.equal((await command('export', { id: model.id, format: 'model' })).status, 'failed');
  assert.equal((await cli('models', { 'canvas-id': canvas.id })).source, 'saved');
  await success('add-node', { type: 'model-views', sourceId: importedImage.id });
  const independentViews = current.selectedIds[0];
  await success('add-node', { type: 'model', sourceId: independentViews });
  assert.equal(current.nodes.find((node) => node.id === current.selectedIds[0]).type, 'model');
  assert.deepEqual(browserErrors, []);
  assert.equal(paidRequests, 0);
  console.log(
    'PASS: CLI -> HTTP -> canvas -> disk; conflicts, paid guard, references, imports, sequence/animation, five resource exports and reviewed model workflow (simulated upstream).'
  );
  console.log('Screenshot: ' + path.join(temporary, 'canvas-cli.png'));
} finally {
  await browser?.close();
  await server?.close();
}
