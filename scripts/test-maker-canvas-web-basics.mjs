// Exercises the built dist (run maker:canvas:build first), since the Web host consumes that output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'packages/maker-canvas/dist');
const { getCanvasPageHtml } = await import(pathToFileURL(path.join(dist, 'browser.mjs')).href);
const acorn = createRequire(path.join(repo, 'package.json'))('acorn');
const results = [];
async function check(name, run) {
  if (process.env.CANVAS_CHECK && !name.includes(process.env.CANVAS_CHECK)) return;
  await run();
  results.push(name);
  console.log('PASS ' + name);
}

// Runs inside the page: a Web-style host over an in-memory store, mirroring web-page-host.js.
function testHostScript() {
  function createCanvasHost() {
    const config = window.__canvasTestConfig || {};
    const docs = new Map();
    const media = new Map();
    const attempts = new Map();
    const calls = (window.__canvasCalls = { generate: [], actions: [] });
    let active;
    const now = () => new Date().toISOString();
    const copy = (value) => JSON.parse(JSON.stringify(value));
    function pngBlob(color, width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }
    async function addMedia(color, width, height, path) {
      const target = path || 'assets/image/canvas/' + crypto.randomUUID() + '.png';
      media.set(target, URL.createObjectURL(await pngBlob(color, width, height)));
      return target;
    }
    window.__canvasAddMedia = addMedia;
    // Seeded canvases stand in for documents saved by an earlier session.
    const seeded = Promise.all(
      Object.entries(config.seedMedia || {}).map(([target, color]) =>
        addMedia(color, 120, 120, target)
      )
    );
    for (const doc of config.seedDocuments || []) docs.set(doc.id, copy(doc));
    if (config.seedDocuments?.length) active = config.seedDocuments[0].id;
    // Solid background with a centred subject, or 8 stripes that no background detector accepts.
    window.__canvasAddPainted = async (kind, width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      const stripes = ['#e33', '#3e3', '#33e', '#ee3', '#3ee', '#e3e', '#963', '#fff'];
      if (kind === 'stripes')
        stripes.forEach((color, index) => {
          context.fillStyle = color;
          context.fillRect((index * width) / 8, 0, width / 8 + 1, height);
        });
      else {
        context.fillStyle = '#00ff00';
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#c33';
        context.fillRect(width / 4, height / 4, width / 2, height / 2);
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const target = 'assets/image/canvas/' + crypto.randomUUID() + '.png';
      media.set(target, URL.createObjectURL(blob));
      return target;
    };
    // Seeds a finished attempt the page has not applied yet, as a reload would find it.
    window.__canvasAddAttempt = async (input) => {
      const attempt = {
        id: crypto.randomUUID(),
        kind: 'image',
        toolName: 'generate_image',
        status: 'succeeded',
        parameters: {},
        createdAt: now(),
        updatedAt: now(),
        resultAssetPath: await addMedia('#59c', 48, 48),
        resultImageInfo: { width: 48, height: 48 },
        ...input,
      };
      attempts.set(attempt.id, attempt);
      return attempt.id;
    };
    // A short real WebM so video cards and the sequence editor decode actual frames.
    let videoBytes;
    async function addVideo() {
      if (!videoBytes) {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const recorder = new MediaRecorder(canvas.captureStream(15), { mimeType: 'video/webm' });
        const chunks = [];
        recorder.ondataavailable = (event) => chunks.push(event.data);
        const done = new Promise((resolve) => (recorder.onstop = resolve));
        recorder.start();
        for (let frame = 0; frame < 12; frame += 1) {
          context.fillStyle = '#00ff00';
          context.fillRect(0, 0, 96, 64);
          context.fillStyle = '#c33';
          context.fillRect(10 + frame * 5, 16, 24, 32);
          await new Promise((resolve) => setTimeout(resolve, 70));
        }
        recorder.stop();
        await done;
        videoBytes = new Blob(chunks, { type: 'video/webm' });
      }
      const target = 'assets/video/canvas/' + crypto.randomUUID() + '.webm';
      media.set(target, URL.createObjectURL(videoBytes));
      return target;
    }
    window.__canvasAddVideo = addVideo;
    window.__canvasVideoBytes = async () => {
      await addVideo();
      return Array.from(new Uint8Array(await new Response(videoBytes).arrayBuffer()));
    };
    async function succeed(attempt) {
      attempt.status = 'succeeded';
      if (attempt.kind === 'video') {
        attempt.resultAssetPath = await addVideo();
        attempt.updatedAt = now();
        delete attempt.error;
        return attempt;
      }
      const [width, height] = window.__canvasResultSize || [64, 32];
      attempt.resultAssetPath = await addMedia('#3a7', width, height);
      attempt.resultImageInfo = { width, height };
      attempt.updatedAt = now();
      delete attempt.error;
      return attempt;
    }
    const store = {
      platform: 'web',
      capabilities: config.capabilities,
      async list() {
        return [...docs.values()].map((doc) => ({
          id: doc.id,
          title: doc.title,
          revision: doc.revision,
          updatedAt: now(),
        }));
      },
      async load(id) {
        await seeded;
        if (!docs.has(id)) throw Object.assign(new Error('画布不存在'), { status: 404 });
        return copy(docs.get(id));
      },
      async create(title) {
        const doc = {
          id: crypto.randomUUID(),
          title: title || '创作画布',
          revision: 1,
          viewport: { x: 0, y: 0, scale: 1 },
          nodes: [],
          edges: [],
        };
        docs.set(doc.id, doc);
        return copy(doc);
      },
      async save(doc) {
        if (window.__canvasSaveDelay)
          await new Promise((resolve) => setTimeout(resolve, window.__canvasSaveDelay));
        if (window.__canvasSaveFail) throw new Error('模拟保存失败');
        const next = copy(doc);
        next.revision = (docs.get(doc.id)?.revision || 0) + 1;
        docs.set(doc.id, next);
        return copy(next);
      },
      async importImage(canvasId, bytes, type) {
        const target = 'assets/image/canvas/' + crypto.randomUUID() + '.png';
        media.set(target, URL.createObjectURL(new Blob([bytes], { type })));
        return { relativePath: target };
      },
      async importVideo(canvasId, file, type) {
        if (!config.videoStore) throw new Error('测试宿主不支持视频。');
        const target = 'assets/video/canvas/' + crypto.randomUUID() + '.webm';
        media.set(target, URL.createObjectURL(new Blob([file], { type })));
        return { relativePath: target };
      },
      mediaUrl(target) {
        return media.get(target) || 'data:,';
      },
      async getActiveCanvasId() {
        return active;
      },
      async setActiveCanvasId(id) {
        active = id;
      },
      async listGeneration(canvasId) {
        return [...attempts.values()].filter((item) => item.canvasId === canvasId).map(copy);
      },
      async imageModels(tool) {
        window.__canvasModelCalls = (window.__canvasModelCalls || 0) + 1;
        return {
          provider: { identity: 'test-host', source: 'maker' },
          tool,
          origin: 'mcp',
          label: '测试宿主模型',
          defaultModel: 'host-default',
          models: [
            { id: 'host-default', label: '宿主默认' },
            { id: 'host-second', label: '宿主模型二', maxReferenceImages: 4 },
          ],
        };
      },
      async generateImage(canvasId, input) {
        calls.generate.push(copy(input));
        if (window.__canvasHold) await window.__canvasHold;
        const attempt = {
          id: crypto.randomUUID(),
          canvasId,
          kind: 'image',
          toolName: input.sourceImageIds?.length ? 'edit_image' : 'generate_image',
          status: 'failed',
          prompt: input.prompt,
          operation: input.operation,
          targetNodeId: input.targetNodeId,
          sourceImageId: input.sourceImageId,
          sourceImageIds: input.sourceImageIds,
          sourceImagePath: input.sourceImagePath,
          sourceImagePaths: input.sourceImagePaths,
          referenceImagePaths: input.referenceImagePaths,
          parameters: {
            model: input.model,
            resolution: input.resolution,
            aspectRatio: input.aspectRatio,
            targetSize: input.targetSize,
          },
          error: '模拟生成失败',
          createdAt: now(),
          updatedAt: now(),
        };
        if (!window.__canvasFailNext) await succeed(attempt);
        window.__canvasFailNext = false;
        attempts.set(attempt.id, attempt);
        return copy(attempt);
      },
      async createVideo(canvasId, input) {
        if (!config.videoStore) throw new Error('测试宿主不支持视频。');
        (calls.video = calls.video || []).push(copy(input));
        if (window.__canvasVideoHold) await window.__canvasVideoHold;
        // Maker Web contract: a remote task id plus the parameters it was submitted with.
        const attempt = {
          id: crypto.randomUUID(),
          canvasId,
          kind: 'video',
          toolName: 'create_video_task',
          status: window.__canvasVideoStatus || 'succeeded',
          prompt: input.prompt,
          taskId: 'task-' + crypto.randomUUID().slice(0, 8),
          targetNodeId: input.targetNodeId,
          sourceImagePath: input.sourceImagePath,
          sourceImageId: input.sourceImageId,
          sourceImageIds: input.sourceImageIds,
          sourceImagePaths: input.sourceImagePaths,
          referenceImagePaths: input.referenceImagePaths,
          parameters: {
            model: input.model,
            resolution: input.resolution,
            duration: input.duration,
            ratio: input.ratio,
            mode: input.mode,
            userConfirmed: input.userConfirmed,
          },
          // Like the local host, snapshots come from the saved document the request ran against.
          sourceSnapshots: (input.sourceImageIds || []).flatMap((id) => {
            const snapshot = snapshotCanvasSource(
              docs.get(canvasId).nodes.find((node) => node.id === id)
            );
            return snapshot ? [snapshot] : [];
          }),
          credits: 20,
          createdAt: now(),
          updatedAt: now(),
        };
        if (attempt.status === 'succeeded') await succeed(attempt);
        else if (attempt.status === 'failed') attempt.error = '模拟视频失败';
        attempts.set(attempt.id, attempt);
        return copy(attempt);
      },
      async videoHistory(offset = 0, limit = 30) {
        const items = [...attempts.values()].filter((item) => item.kind === 'video');
        return { items: items.slice(offset, offset + limit).map(copy), total: items.length };
      },
      async generationAction(canvasId, attemptId, action) {
        calls.actions.push({ attemptId, action });
        const attempt = attempts.get(attemptId);
        if (!attempt) throw new Error('任务不存在');
        if (action === 'retry') await succeed(attempt);
        return copy(attempt);
      },
    };
    if (!config.videoStore) delete store.videoHistory;
    window.__canvasSetMedia = (target, blob) => media.set(target, URL.createObjectURL(blob));
    // Simulates a file moved or deleted outside the canvas; resolves its bytes for restoring.
    window.__canvasDropMedia = async (target) => {
      const url = media.get(target);
      const blob = url ? await (await fetch(url)).blob() : null;
      if (url) URL.revokeObjectURL(url);
      media.delete(target);
      return blob;
    };
    // Maker Web sprite mirror contract: read-only project JSON (404 when absent) and media probes.
    if (config.projectJson) {
      store.readProjectJson = async (target) => {
        (calls.json = calls.json || []).push(target);
        const files = window.__canvasProjectJson || config.projectJson;
        if (!Object.prototype.hasOwnProperty.call(files, target))
          throw Object.assign(new Error('文件不存在：' + target), { status: 404 });
        return copy(files[target]);
      };
      store.prepareMedia = async (target) => {
        if (!media.has(target)) throw Object.assign(new Error('素材不存在'), { status: 404 });
      };
    }
    async function readSource(target, signal, failure) {
      if (window.__canvasReadHold) await window.__canvasReadHold;
      const response = await fetch(store.mediaUrl(target), { signal });
      if (!response.ok) throw new Error(failure || '读取失败');
      return response.blob();
    }
    async function deliver(request) {
      const blob = await request.produce();
      window.__canvasDelivered = {
        filename: request.filename,
        mime: request.mime,
        type: blob.type,
        size: blob.size,
      };
      // Maker Web host behaviour: the produced blob leaves through an <a download> click.
      if (config.anchorDownload) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = request.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      return { status: 'downloaded' };
    }
    const validation = {
      validateImageAssetsInfo: validateImageAssetsInfoStructure,
      imageAssetsBindingPlan: imageAssetsBindingPlanStructure,
      validateUiBbox: validateUiBboxStructure,
    };
    function downloadCanvasResource(
      node,
      format,
      mediaUrl,
      progress,
      identity,
      loop,
      sink,
      current,
      delivery = deliver
    ) {
      return downloadCanvasResourceWithHost(
        node,
        format,
        {
          mediaUrl,
          deliver: delivery,
          nextCode: nextCanvasExportCode,
          validateBundle: (doc, id) =>
            validateResourceBundleStructure(doc, id, 200, undefined, validation),
          createBundle: async (doc, id, notify) =>
            createCanvasZip(
              await resourceBundleEntriesFromReader(
                doc,
                id,
                {
                  validation,
                  referenceEntryName: (item) => 'references/' + encodeURIComponent(item),
                  readSource: (item, failure) => readSource(item, undefined, failure),
                },
                notify,
                200
              ),
              200
            ),
          createImageAssets: async (info) =>
            createCanvasZip(
              await collectImageAssetEntriesFromReader(info, (item) => readSource(item))
            ),
          readSource: (item, failure) => readSource(item, undefined, failure),
        },
        progress,
        identity,
        loop,
        sink,
        current
      );
    }
    function openImageAtlasDialog(node, mediaUrl, actions, delivery) {
      return openImageAtlasDialogWithHost(node, { readSource, deliver: delivery }, actions);
    }
    return {
      store,
      features: config.features,
      appearance: config.appearance,
      addToChat: config.addToChat
        ? (items) => {
            (window.__canvasChat = window.__canvasChat || []).push(copy(items));
          }
        : undefined,
      pickProjectImages: config.pickProjectImages
        ? async () => window.__canvasPick || []
        : undefined,
      startSpriteGen: config.startSpriteGen
        ? async (input) => {
            const starts = (window.__canvasSpriteStarts = window.__canvasSpriteStarts || []);
            starts.push({ ...copy(input), unsaved: window.__canvasUnsaved });
            if (window.__canvasSpriteFail) throw new Error('模拟打开对话失败');
            return { chatId: 'chat-' + starts.length };
          }
        : undefined,
      openSpriteChat: config.startSpriteGen
        ? (chatId) => {
            (window.__canvasSpriteChats = window.__canvasSpriteChats || []).push(chatId);
          }
        : undefined,
      readSource,
      // Counted separately so tests can prove a download went through the host delivery hook.
      deliverExport(request) {
        window.__canvasHostDeliveries = (window.__canvasHostDeliveries || 0) + 1;
        return deliver(request);
      },
      validateUiAtlasPlan: validateUiAtlasPlanStructure,
      downloadCanvasResource,
      async prepareCanvasImportedNode(canvasId, input) {
        if (typeof input.assetPath !== 'string' || !media.has(input.assetPath))
          throw new Error('只允许引用当前项目内的素材。');
        return prepareCanvasImportedNodeFromMedia(input, store.mediaUrl);
      },
      gameUiNextStep: () => undefined,
      onReady(editor) {
        window.__canvasEditor = editor;
      },
      publishUnsaved(value) {
        window.__canvasUnsaved = value;
      },
      publishActivity() {},
      connectAutomation() {},
      deliverAutomationExport() {},
      createCanvasTemplateUi: (options) => createCanvasTemplateUiWithHost(options),
      createCanvasGenerationUi: (options) =>
        createCanvasGenerationUiWithHost({
          ...options,
          detectUiCutoutColor: (paths) => detectUiCutoutColorFromReader(paths, readSource),
        }),
      createUiRecognitionUi: (options) =>
        createUiRecognitionUiWithHost({
          ...options,
          readSource,
          webRecognitionHint: '测试',
          localRecognitionHint: '测试',
          localRecognitionViewHint: '测试',
        }),
      createCanvasModelUi: (options) =>
        createCanvasModelUiWithHost({
          ...options,
          thumbnailUrl() {
            throw new Error('无模型');
          },
          previewOrigin: () => location.origin,
        }),
      createImageAssetsUi: (options) =>
        createImageAssetsUiWithHost({
          ...options,
          applyImageAssets: applyImageAssetsToDocument,
          imageAssetsBindingPlan: imageAssetsBindingPlanStructure,
          openImageAtlasDialog: (node, mediaUrl, actions) =>
            openImageAtlasDialog(node, mediaUrl, actions, options.deliver),
          readSource,
        }),
      createCanvasAutomationUi: (options) =>
        createCanvasAutomationUiWithHost({
          ...options,
          prepareNodeUpdates: (doc, input) =>
            prepareCanvasNodeUpdatesWithValidation(doc, input, {
              validateUiRecognition: validateUiRecognitionStructure,
              validateUiAtlasPlan: validateUiAtlasPlanStructure,
            }),
        }),
      createSequenceUiController: (options) =>
        createSequenceUiControllerWithMedia({ ...options, readAtlas: readSource }),
      createCanvasResourceExport: (options) =>
        createCanvasResourceExportWithHost({
          ...options,
          downloadResource: downloadCanvasResource,
          openHandoff() {},
          openAtlas: (node, mediaUrl) =>
            openImageAtlasDialog(node, mediaUrl, undefined, options.deliver),
        }),
    };
  }
}
const hostSource = testHostScript.toString().replace(/^function testHostScript\(\) \{|\}$/g, '');
const html = getCanvasPageHtml({ hostScript: hostSource });

await check('Chrome 74：内联脚本与浏览器产物可按 ES2019 解析', async () => {
  // Host code is injected verbatim and must be lowered by the host; check the shared page only.
  const shared = getCanvasPageHtml({ hostScript: '/* __MAKER_CANVAS_HOST__ */' });
  assert.ok(shared.includes('/* __MAKER_CANVAS_HOST__ */'));
  const scripts = [...shared.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length);
  for (const script of scripts) acorn.parse(script, { ecmaVersion: 2019, sourceType: 'script' });
  const seen = new Set();
  const queue = ['browser.mjs', 'domain.mjs', 'contracts.mjs'];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const code = fs.readFileSync(path.join(dist, file), 'utf8');
    acorn.parse(code, { ecmaVersion: 2019, sourceType: 'module' });
    for (const match of code.matchAll(/from\s+"\.\/([^"]+\.mjs)"/g)) queue.push(match[1]);
  }
  const page = scripts.join('\n');
  for (const api of ['structuredClone', 'randomUUID', 'replaceChildren', 'AbortSignal.timeout'])
    assert.ok(page.includes(api), api + ' 用法扫描失效');
  assert.ok(page.includes('installCanvasPolyfills();'), '缺少运行时 polyfill');
});

const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  path.join(
    execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
    'playwright/index.mjs'
  );
const playwright = await import(
  fs.existsSync(playwrightPath) ? pathToFileURL(playwrightPath).href : 'playwright'
);
const browser = await playwright.chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
// Remove post-Chrome 74 natives so the run exercises the shipped polyfills.
const removeModernApis = () => {
  delete window.structuredClone;
  delete Object.hasOwn;
  delete Array.prototype.at;
  delete Array.prototype.findLast;
  delete String.prototype.replaceAll;
  delete Element.prototype.replaceChildren;
  delete Blob.prototype.arrayBuffer;
  delete AbortSignal.timeout;
  delete Crypto.prototype.randomUUID;
};
async function openCanvas(config, legacy) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.dismiss());
  if (legacy) await page.addInitScript(removeModernApis);
  await page.addInitScript((value) => {
    window.__canvasTestConfig = value;
  }, config);
  await page.route('http://canvas.test/**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.goto('http://canvas.test/');
  await page.waitForFunction(() => window.__canvasEditor);
  return { page, errors };
}
const webFeatures = {
  templates: false,
  uiRecognition: false,
  video: false,
  sequence: false,
  model3d: false,
  uiEditor: false,
  resourceExport: false,
  sections: false,
  imageEditing: false,
  connectors: true,
};
try {
  await check('默认宿主：功能入口保持原样且不显示连接点', async () => {
    const { page, errors } = await openCanvas({});
    for (const id of [
      'add-template',
      'add-ui-recognition',
      'add-video',
      'add-video-source',
      'create-section',
    ])
      assert.equal(await page.$eval('#' + id, (item) => item.style.display), '', id);
    assert.equal(await page.locator('[data-canvas-action="add-video"]').count(), 1);
    await page.evaluate(() =>
      window.__canvasEditor.execute({
        requestId: 'r-default',
        pageId: 'p1',
        canvasId: window.__canvasEditor.current().id,
        revision: window.__canvasEditor.current().revision,
        action: 'add-node',
        input: { type: 'image' },
      })
    );
    assert.equal(await page.locator('.canvas-port').count(), 0);
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.classList.contains('canvas-appearance-web')
      ),
      false
    );
    // New Web/hook entries stay out of the default page.
    for (const action of ['upload-image', 'pick-project-images'])
      assert.equal(await page.locator('[data-canvas-action="' + action + '"]').count(), 0, action);
    const assetPath = await page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
    await page.evaluate(
      (assetPath) =>
        window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '来源图' }),
      assetPath
    );
    await page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
    const menu = page.locator('#selection-menu');
    assert.equal(await menu.getByRole('button', { name: '去纯色背景' }).count(), 1);
    assert.equal(await menu.getByRole('button', { name: '抠图', exact: true }).count(), 0);
    assert.equal(await menu.getByRole('button', { name: '加入对话' }).count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  });

  const { page, errors } = await openCanvas({ features: webFeatures }, true);
  const run = async (action, input = {}, overrides = {}) => {
    // Most cases start from a settled document; the dirty-flush cases call send directly.
    await page.waitForFunction(() => window.__canvasUnsaved === false);
    return send(action, input, overrides);
  };
  const send = (action, input = {}, overrides = {}) =>
    page.evaluate(
      async ({ action, input, overrides }) => {
        const editor = window.__canvasEditor;
        const current = editor.current();
        try {
          return {
            ok: true,
            value: await editor.execute({
              requestId: 'r-' + Math.random().toString(16).slice(2),
              pageId: 'page-1',
              canvasId: current.id,
              revision: current.revision,
              action,
              input,
              ...overrides,
            }),
          };
        } catch (error) {
          return { ok: false, code: error.code, message: error.message };
        }
      },
      { action, input, overrides }
    );
  const success = async (action, input, overrides) => {
    const result = await run(action, input, overrides);
    assert.ok(result.ok, action + ': ' + result.message);
    return result.value;
  };
  const doc = () => page.evaluate(() => window.__canvasEditor.current());
  const nodeOf = async (id) => (await doc()).nodes.find((node) => node.id === id);

  await check('Web 功能开关隐藏入口，只保留基础编辑', async () => {
    for (const id of [
      'add-template',
      'add-ui-recognition',
      'add-video',
      'add-video-source',
      'create-section',
    ])
      assert.equal(await page.$eval('#' + id, (item) => item.style.display), 'none', id);
    for (const id of [
      'add-generation',
      'add-image',
      'add-note',
      'mark-ellipse',
      'mark-arrow',
      'undo',
      'redo',
    ])
      assert.notEqual(await page.$eval('#' + id, (item) => item.style.display), 'none', id);
    assert.equal(await page.locator('[data-canvas-action="add-video"]').count(), 0);
  });

  await check('undo 空栈返回 INVALID_ARGS；inspect 返回 selectedIds', async () => {
    const empty = await run('undo');
    assert.equal(empty.ok, false);
    assert.equal(empty.code, 'INVALID_ARGS');
    const snapshot = await success('inspect');
    assert.deepEqual(snapshot.selectedIds, []);
  });

  let sourceId;
  let sourcePath;
  let slotId;
  await check('add-node 创建空图片槽并返回 selectedIds', async () => {
    sourcePath = await page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
    await page.evaluate(
      (assetPath) =>
        window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '来源图' }),
      sourcePath
    );
    sourceId = (await doc()).nodes.find((node) => node.assetPath === sourcePath).id;
    const added = await success('add-node', { type: 'image' });
    slotId = added.selectedIds[0];
    const slot = await nodeOf(slotId);
    assert.equal(slot.type, 'image');
    assert.equal(slot.assetPath, undefined);
    const inspected = await success('inspect');
    assert.deepEqual(inspected.selectedIds, [slotId]);
  });

  await check('错误码：参数 INVALID_ARGS、缺失 NOT_FOUND', async () => {
    const cases = [
      [await run('fly', {}), 'INVALID_ARGS'],
      [await run('fill-slot', { id: slotId, assetPath: sourcePath, extra: 1 }), 'INVALID_ARGS'],
      [await run('fill-slot', { id: slotId, assetPath: 3 }), 'INVALID_ARGS'],
      [await run('fill-slot', { id: sourceId, assetPath: sourcePath }), 'INVALID_ARGS'],
      [await run('fill-slot', { id: 'missing', assetPath: sourcePath }), 'NOT_FOUND'],
      [await run('inspect', { id: 'missing' }), 'NOT_FOUND'],
      [await run('connect', { from: sourceId, to: 'missing' }), 'NOT_FOUND'],
      [await run('connect', { from: slotId, to: slotId }), 'INVALID_ARGS'],
      [await run('add-node', { type: 'image' }, { revision: 0 }), 'INVALID_ARGS'],
      [await run('add-node', { type: 'image' }, { canvasId: 'other-canvas' }), 'NOT_FOUND'],
      [await run('update-nodes', { nodes: [{ id: 'missing', x: 1 }] }), 'NOT_FOUND'],
      [await run('update-nodes', { nodes: [{ id: slotId, x: 'left' }] }), 'INVALID_ARGS'],
    ];
    for (const [result, code] of cases) {
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, code, result.message);
    }
  });

  await check('connect：图片连入图片槽成为参考图，inspect 可见连线', async () => {
    const connected = await success('connect', { from: sourceId, to: slotId });
    const edge = connected.edges.find((item) => item.from === sourceId && item.to === slotId);
    assert.equal(edge.kind, 'image-variant');
    assert.deepEqual((await nodeOf(slotId)).referenceInput, { includeSelf: false });
    const cycle = await run('connect', { from: slotId, to: sourceId });
    assert.equal(cycle.code, 'INVALID_ARGS');
  });

  await check('选中图片槽：参考图缩略图、＋、提示词、宿主模型、比例/尺寸与发送', async () => {
    await page.locator('.card[data-id="' + slotId + '"]').click({ position: { x: 20, y: 60 } });
    const panel = page.locator('#selection-toolbar .generation-panel');
    await panel.waitFor();
    assert.equal(await panel.locator('.generation-reference img').count(), 1);
    assert.equal(await panel.locator('.generation-reference-add').count(), 1);
    assert.equal(await panel.locator('textarea.generation-prompt').count(), 1);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#selection-toolbar select option')].some(
        (option) => option.textContent === '宿主模型二'
      )
    );
    const labels = await panel
      .locator('select')
      .evaluateAll((items) => items.map((item) => [...item.options].map((option) => option.value)));
    assert.ok(labels.some((values) => values.includes('auto') && values.includes('host-second')));
    assert.ok(labels.some((values) => values.includes('1K')));
    assert.ok(labels.some((values) => values.includes('1:1')));
    // Upload is not a composer action; the default host keeps the in-slot import button.
    assert.equal(await panel.getByRole('button', { name: '上传' }).count(), 0);
    // Feature-hidden image tools stay out of the selection menu.
    assert.equal(await page.getByRole('button', { name: '视频生成' }).count(), 0);
  });

  await check('发送：经宿主 generateImage 生成并回填同一图片槽', async () => {
    const before = await nodeOf(slotId);
    const panel = page.locator('#selection-toolbar .generation-panel');
    await panel.locator('textarea.generation-prompt').fill('一只像素风史莱姆');
    await panel.locator('select').first().selectOption('host-second');
    await panel.getByRole('button', { name: '生成' }).click();
    await page.waitForFunction((id) => {
      const node = window.__canvasEditor.current().nodes.find((item) => item.id === id);
      return node && node.assetPath;
    }, slotId);
    const call = await page.evaluate(() => window.__canvasCalls.generate.at(-1));
    assert.equal(call.targetNodeId, slotId);
    assert.deepEqual(call.sourceImageIds, [sourceId]);
    assert.equal(call.model, 'host-second');
    const after = await nodeOf(slotId);
    assert.equal(after.id, before.id);
    assert.equal(after.x, before.x);
    assert.equal(after.y, before.y);
    assert.equal(after.width, before.width);
    assert.ok((await doc()).edges.some((edge) => edge.from === sourceId && edge.to === slotId));
  });

  await check('连接点拖拽：图片右侧连到新图片槽左侧', async () => {
    const added = await success('add-node', { type: 'image' });
    const targetId = added.selectedIds[0];
    await success('update-nodes', { nodes: [{ id: targetId, x: 900, y: 120 }] });
    const port = page.locator('.card[data-id="' + sourceId + '"] .canvas-port-output');
    const target = page.locator('.card[data-id="' + targetId + '"]');
    await port.waitFor();
    const from = await port.boundingBox();
    const to = await target.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      ({ sourceId, targetId }) =>
        window.__canvasEditor
          .current()
          .edges.some(
            (edge) =>
              edge.from === sourceId && edge.to === targetId && edge.kind === 'image-variant'
          ),
      { sourceId, targetId }
    );
    assert.equal(
      await page.locator('.card[data-id="' + targetId + '"] .canvas-port-input').count(),
      1
    );
  });

  const overlaps = (a, b) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  let rightSlotId;
  await check('点击右侧＋：右侧新建图片槽、连为参考图、选中并打开提示词面板，可撤销', async () => {
    await page.waitForFunction(() => window.__canvasUnsaved === false);
    const before = await doc();
    const source = before.nodes.find((node) => node.id === sourceId);
    await page.locator('.card[data-id="' + sourceId + '"] .canvas-port-output').click();
    await page.waitForFunction(
      (count) => window.__canvasEditor.current().nodes.length === count + 1,
      before.nodes.length
    );
    const after = await doc();
    const slot = after.nodes.find((node) => !before.nodes.some((item) => item.id === node.id));
    rightSlotId = slot.id;
    assert.equal(slot.type, 'image');
    assert.equal(slot.assetPath, undefined);
    assert.ok(slot.x >= source.x + source.width, 'slot 应在来源右侧');
    for (const other of after.nodes)
      if (other.id !== slot.id && other.type !== 'section')
        assert.ok(!overlaps(slot, other), '新图片槽与 ' + other.id + ' 重叠');
    assert.ok(
      after.edges.some(
        (edge) => edge.from === sourceId && edge.to === slot.id && edge.kind === 'image-variant'
      )
    );
    assert.deepEqual(slot.referenceInput, { includeSelf: false });
    await page.locator('#selection-toolbar .generation-panel').waitFor();
    assert.deepEqual((await success('inspect')).selectedIds, [slot.id]);
    // Waiting for the autosave also proves the click went through the normal changed path.
    const undone = await success('undo');
    assert.ok(!undone.nodes.some((node) => node.id === slot.id));
    assert.ok(!undone.edges.some((edge) => edge.to === slot.id));
    const redone = await success('redo');
    assert.ok(redone.nodes.some((node) => node.id === slot.id));
  });

  await check('点击左侧＋：左侧新建图片槽并连入当前图片', async () => {
    const before = await doc();
    const target = before.nodes.find((node) => node.id === rightSlotId);
    await page.locator('.card[data-id="' + rightSlotId + '"] .canvas-port-input').click();
    await page.waitForFunction(
      (count) => window.__canvasEditor.current().nodes.length === count + 1,
      before.nodes.length
    );
    const after = await doc();
    const slot = after.nodes.find((node) => !before.nodes.some((item) => item.id === node.id));
    assert.ok(slot.x + slot.width <= target.x, 'slot 应在目标左侧');
    for (const other of after.nodes)
      if (other.id !== slot.id && other.type !== 'section')
        assert.ok(!overlaps(slot, other), '新图片槽与 ' + other.id + ' 重叠');
    assert.ok(after.edges.some((edge) => edge.from === slot.id && edge.to === rightSlotId));
    assert.deepEqual((await success('inspect')).selectedIds, [slot.id]);
    await success('delete-nodes', { ids: [slot.id, rightSlotId] });
  });

  await check('未保存修改：命令先等待自动保存再执行', async () => {
    await page.waitForFunction(() => window.__canvasUnsaved === false);
    await page.evaluate(() => (window.__canvasSaveDelay = 300));
    const count = (await doc()).nodes.length;
    await page.evaluate(() => document.getElementById('add-note').click());
    assert.equal(await page.evaluate(() => window.__canvasUnsaved), true);
    const result = await send('add-node', { type: 'image' });
    await page.evaluate(() => (window.__canvasSaveDelay = 0));
    assert.ok(result.ok, result.message);
    assert.equal((await doc()).nodes.length, count + 2);
  });

  await check('保存失败：命令以 INVALID_ARGS 拒绝且未执行', async () => {
    await page.waitForFunction(() => window.__canvasUnsaved === false);
    await page.evaluate(() => (window.__canvasSaveFail = true));
    await page.evaluate(() => document.getElementById('add-note').click());
    const count = (await doc()).nodes.length;
    const result = await send('add-node', { type: 'image' });
    await page.evaluate(() => (window.__canvasSaveFail = false));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_ARGS', result.message);
    assert.equal((await doc()).nodes.length, count);
    await send('save');
  });

  await check('忙碌与阻塞拒绝均为 INVALID_ARGS', async () => {
    await page.waitForFunction(() => window.__canvasUnsaved === false);
    const busy = await page.evaluate(async () => {
      window.__canvasSaveDelay = 300;
      const editor = window.__canvasEditor;
      const command = (requestId) => ({
        requestId,
        pageId: 'page-1',
        canvasId: editor.current().id,
        revision: editor.current().revision,
        action: 'add-node',
        input: { type: 'note' },
      });
      const first = editor.execute(command('busy-1'));
      const second = await editor.execute(command('busy-2')).catch((error) => error);
      await first;
      window.__canvasSaveDelay = 0;
      return { code: second.code, message: second.message };
    });
    assert.equal(busy.code, 'INVALID_ARGS', busy.message);
    await page.waitForFunction(() => window.__canvasUnsaved === false);
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'blocking-dialog';
      document.body.append(dialog);
      dialog.show();
    });
    const blocked = await send('add-node', { type: 'note' });
    await page.evaluate(() => document.getElementById('blocking-dialog').remove());
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'INVALID_ARGS', blocked.message);
  });

  await check('fill-slot 原位回填并保留连线；undo / redo 走页面撤销栈', async () => {
    const added = await success('add-node', { type: 'image' });
    const fillId = added.selectedIds[0];
    await success('connect', { from: sourceId, to: fillId });
    const before = await nodeOf(fillId);
    const filled = await success('fill-slot', { id: fillId, assetPath: sourcePath });
    assert.deepEqual(filled.selectedIds, [fillId]);
    const after = filled.nodes.find((node) => node.id === fillId);
    assert.equal(after.assetPath, sourcePath);
    assert.equal(after.x, before.x);
    assert.equal(after.y, before.y);
    assert.equal(after.width, before.width);
    assert.ok(filled.edges.some((edge) => edge.from === sourceId && edge.to === fillId));
    const again = await run('fill-slot', { id: fillId, assetPath: sourcePath });
    assert.equal(again.code, 'INVALID_ARGS');
    const undone = await success('undo');
    assert.equal(undone.nodes.find((node) => node.id === fillId).assetPath, undefined);
    const redone = await success('redo');
    assert.equal(redone.nodes.find((node) => node.id === fillId).assetPath, sourcePath);
    const noRedo = await run('redo');
    assert.equal(noRedo.code, 'INVALID_ARGS');
  });

  await check('replace-image 原位替换已有图片，保留 id/位置/宽度/连线；undo 还原', async () => {
    const added = await success('add-node', { type: 'image' });
    const targetId = added.selectedIds[0];
    await success('update-nodes', { nodes: [{ id: targetId, x: 300, y: 700 }] });
    await success('connect', { from: sourceId, to: targetId });
    await success('fill-slot', { id: targetId, assetPath: sourcePath });
    const wide = await page.evaluate(() => window.__canvasAddMedia('#36c', 80, 40));
    const refused = [
      await run('replace-image', { id: slotId + '-missing', assetPath: wide }),
      await run('replace-image', {
        id: (await success('add-node', { type: 'image' })).selectedIds[0],
        assetPath: wide,
      }),
      await run('replace-image', { id: targetId, assetPath: wide, extra: true }),
      await run('replace-image', { id: targetId, assetPath: 'assets/image/missing.png' }),
    ];
    assert.deepEqual(
      refused.map((item) => item.code),
      ['NOT_FOUND', 'INVALID_ARGS', 'INVALID_ARGS', 'INVALID_ARGS'],
      JSON.stringify(refused)
    );
    const note = (await success('add-node', { type: 'note' })).selectedIds[0];
    assert.equal((await run('replace-image', { id: note, assetPath: wide })).code, 'INVALID_ARGS');
    const before = await nodeOf(targetId);
    const replaced = await success('replace-image', { id: targetId, assetPath: wide });
    const after = replaced.nodes.find((node) => node.id === targetId);
    assert.deepEqual(replaced.selectedIds, [targetId]);
    assert.equal(after.assetPath, wide);
    assert.deepEqual(
      [after.x, after.y, after.width, after.title],
      [before.x, before.y, before.width, before.title]
    );
    assert.ok(after.height < before.height, '高度应随 2:1 图片比例变化');
    assert.ok(replaced.edges.some((edge) => edge.from === sourceId && edge.to === targetId));
    const undone = await success('undo');
    assert.equal(undone.nodes.find((node) => node.id === targetId).assetPath, sourcePath);
    assert.equal(undone.nodes.find((node) => node.id === targetId).height, before.height);
  });

  await check('import 省略 kind/title 时按图片与文件名导入；中文文件名可用', async () => {
    const chinese = await page.evaluate(() =>
      window.__canvasAddMedia('#963', 30, 30, 'assets/image/角色立绘·火焰.png')
    );
    const imported = await success('import', { assetPath: chinese });
    const node = imported.nodes.find((item) => item.id === imported.selectedIds[0]);
    assert.equal(node.type, 'image');
    assert.equal(node.title, '角色立绘·火焰');
    assert.equal(node.generation, undefined, '无 prompt 时不写生成元数据');
    for (const assetPath of ['../secret.png', 'assets//a.png', 'assets/image/a.gif', '/abs/a.png'])
      assert.equal((await run('import', { assetPath })).code, 'INVALID_ARGS', assetPath);
    assert.equal((await run('import', { assetPath: chinese, kind: 'model' })).code, 'INVALID_ARGS');
    assert.equal((await run('import', { assetPath: chinese, title: '' })).code, 'INVALID_ARGS');
    assert.equal(
      (await run('import', { assetPath: 'assets/image/未登记.png' })).code,
      'INVALID_ARGS',
      '宿主拒绝也是未执行'
    );
    const withSource = await success('import', {
      assetPath: chinese,
      prompt: '火焰剑士 · 挥剑',
      sourceId,
    });
    const variant = withSource.nodes.find((item) => item.id === withSource.selectedIds[0]);
    assert.ok(
      withSource.edges.some(
        (edge) => edge.from === sourceId && edge.to === variant.id && edge.kind === 'image-variant'
      )
    );
    assert.equal(variant.generation.prompt, '火焰剑士 · 挥剑');
    assert.equal(variant.generation.origin, 'agent');
    assert.equal(variant.generation.operation, 'variant');
    assert.deepEqual(variant.generation.sourceImageIds, [sourceId]);
    assert.ok(variant.x >= (await nodeOf(sourceId)).x + (await nodeOf(sourceId)).width);
  });

  await check('失败显示「重试」，重试经宿主 generationAction 回填', async () => {
    const added = await success('add-node', { type: 'image' });
    const failedId = added.selectedIds[0];
    await success('update-nodes', { nodes: [{ id: failedId, x: 300, y: 420 }] });
    await page.evaluate(() => (window.__canvasFailNext = true));
    await page.locator('.card[data-id="' + failedId + '"]').click({ position: { x: 20, y: 60 } });
    const panel = page.locator('#selection-toolbar .generation-panel');
    await panel.locator('textarea.generation-prompt').fill('会失败的图');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#selection-toolbar select option')].some(
        (option) => option.value === 'auto'
      )
    );
    await panel.getByRole('button', { name: '生成' }).click();
    const retry = page.locator('.card[data-id="' + failedId + '"] .card-state-retry');
    await retry.waitFor();
    assert.equal(await retry.textContent(), '重试');
    await retry.click();
    await page.waitForFunction((id) => {
      const node = window.__canvasEditor.current().nodes.find((item) => item.id === id);
      return node && node.assetPath;
    }, failedId);
    assert.equal((await page.evaluate(() => window.__canvasCalls.actions.at(-1))).action, 'retry');
  });

  await check('默认外观：点空槽内导入按钮沿用本地导入填充图片槽', async () => {
    const added = await success('add-node', { type: 'image' });
    const uploadId = added.selectedIds[0];
    await success('update-nodes', { nodes: [{ id: uploadId, x: 620, y: 420 }] });
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.card[data-id="' + uploadId + '"] .image-empty').click();
    await (
      await chooser
    ).setFiles({
      name: 'upload.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      ),
    });
    await page.waitForFunction((id) => {
      const node = window.__canvasEditor.current().nodes.find((item) => item.id === id);
      return node && node.assetPath;
    }, uploadId);
    assert.equal((await nodeOf(uploadId)).title, 'upload');
  });

  await check('选中连线后可删除（Delete）', async () => {
    const before = (await doc()).edges.length;
    const edge = (await doc()).edges.find((item) => item.kind === 'image-variant');
    const point = await page.evaluate(({ from, to }) => {
      const path = document.querySelector(
        '#wires path[data-from="' + from + '"][data-to="' + to + '"]'
      );
      const middle = path.getPointAtLength(path.getTotalLength() / 2);
      const rect = document.getElementById('board').getBoundingClientRect();
      return { x: rect.left + middle.x, y: rect.top + middle.y };
    }, edge);
    await page.mouse.click(point.x, point.y);
    await page.locator('.wire-remove').waitFor();
    await page.keyboard.press('Delete');
    await page.waitForFunction(
      (id) => !window.__canvasEditor.current().edges.some((item) => item.id === id),
      edge.id
    );
    assert.equal((await doc()).edges.length, before - 1);
  });

  await check('旧浏览器 API 缺失时页面无运行错误（polyfill 生效）', async () => {
    assert.equal(await page.evaluate(() => typeof window.structuredClone), 'function');
    assert.deepEqual(errors, []);
  });
  await page.close();

  await check(
    'Web 外观：点空槽只开下方面板不弹文件选择，顶部「上传」才弹；＋点击与键盘',
    async () => {
      const { page, errors } = await openCanvas({ features: webFeatures, appearance: 'web' }, true);
      assert.ok(
        await page.evaluate(() =>
          document.documentElement.classList.contains('canvas-appearance-web')
        )
      );
      const editor = (action, input) =>
        page.evaluate(
          ({ action, input }) => {
            const current = window.__canvasEditor.current();
            return window.__canvasEditor.execute({
              requestId: 'r-' + Math.random().toString(16).slice(2),
              pageId: 'page-1',
              canvasId: current.id,
              revision: current.revision,
              action,
              input,
            });
          },
          { action, input }
        );
      const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      await page.waitForFunction(() => window.__canvasUnsaved === false);
      await editor('update-nodes', { nodes: [{ id: slotId, x: 300, y: 160 }] });
      let choosers = 0;
      page.on('filechooser', () => (choosers += 1));
      // Click the empty frame itself: in Web it selects only, the file picker stays closed.
      await page.locator('.card[data-id="' + slotId + '"]').click({ position: { x: 140, y: 120 } });
      await page.locator('#selection-toolbar .generation-panel').waitFor();
      const card = await page.locator('.card[data-id="' + slotId + '"]').boundingBox();
      const frame = await page
        .locator('.card[data-id="' + slotId + '"] .canvas-card-content')
        .boundingBox();
      const panel = await page.locator('#selection-toolbar').boundingBox();
      const upload = await page.locator('.card[data-id="' + slotId + '"] .web-slot-upload');
      assert.equal(await upload.textContent(), '上传');
      const pill = await upload.boundingBox();
      assert.ok(panel.y >= card.y + card.height, '面板应在图片槽下方');
      assert.ok(Math.abs(pill.y + pill.height + 14 - frame.y) < 1.5, '上传应在图片框上方 14px');
      assert.ok(
        Math.abs(pill.x + pill.width / 2 - (frame.x + frame.width / 2)) < 1.5,
        '上传应水平居中'
      );
      assert.equal(await page.locator('#selection-toolbar .generation-action-upload').count(), 0);
      await page.waitForTimeout(100);
      assert.equal(choosers, 0, '点空槽不应弹出文件选择');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('#selection-toolbar select option')].some(
          (option) => option.textContent === '宿主模型二'
        )
      );
      const room = await page
        .locator('#selection-toolbar select.generation-mode')
        .evaluateAll((items) =>
          items.map((item) => {
            const context = document.createElement('canvas').getContext('2d');
            context.font = getComputedStyle(item).font;
            const text = context.measureText(item.options[item.selectedIndex].text).width;
            // Mivo's 20px right padding keeps the chevron clear of the label.
            return item.clientWidth - 8 - 20 - text;
          })
        );
      assert.ok(room.length >= 3 && room.every((value) => value >= 0), '下拉文字被截断：' + room);
      const count = (await page.evaluate(() => window.__canvasEditor.current())).nodes.length;
      await page.locator('.card[data-id="' + slotId + '"] .canvas-port-output').click();
      await page.waitForFunction(
        (count) => window.__canvasEditor.current().nodes.length === count + 1,
        count
      );
      // Keyboard activation never starts a wire, so it must create the slot on click.
      await page.locator('.card[data-id="' + slotId + '"] .canvas-port-input').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        (count) => window.__canvasEditor.current().nodes.length === count + 2,
        count
      );
      // The top pill is the only upload entry and reuses the local import picker.
      await page.locator('.card[data-id="' + slotId + '"]').click({ position: { x: 140, y: 120 } });
      assert.equal(choosers, 0, '点空槽不应弹出文件选择');
      const chooser = page.waitForEvent('filechooser');
      await page.locator('.card[data-id="' + slotId + '"] .web-slot-upload').click();
      await chooser;
      assert.deepEqual(errors, []);
      await page.close();
    }
  );

  await check('Web 外观：＋仅选中时出现，拖拽有预览线与目标高亮，曲线可剪断', async () => {
    const { page, errors } = await openCanvas({ features: webFeatures, appearance: 'web' }, true);
    const editor = (action, input) =>
      page.evaluate(
        ({ action, input }) => {
          const current = window.__canvasEditor.current();
          return window.__canvasEditor.execute({
            requestId: 'r-' + Math.random().toString(16).slice(2),
            pageId: 'page-1',
            canvasId: current.id,
            revision: current.revision,
            action,
            input,
          });
        },
        { action, input }
      );
    const assetPath = await page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
    await page.evaluate(
      (assetPath) =>
        window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '来源图' }),
      assetPath
    );
    const sourceId = (await page.evaluate(() => window.__canvasEditor.current())).nodes[0].id;
    const targetId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', {
      nodes: [
        { id: sourceId, x: 160, y: 160 },
        { id: targetId, x: 700, y: 260 },
      ],
    });
    await page.waitForFunction(() => window.__canvasUnsaved === false);
    const port = page.locator('.card[data-id="' + sourceId + '"] .canvas-port-output');
    const shown = () => port.evaluate((item) => getComputedStyle(item).opacity);
    await page.mouse.click(1200, 700);
    assert.equal(await shown(), '0', '未选中时不显示＋');
    await page.locator('.card[data-id="' + sourceId + '"]').click({ position: { x: 140, y: 120 } });
    assert.equal(await shown(), '1', '选中后显示＋');
    const from = await port.boundingBox();
    const to = await page.locator('.card[data-id="' + targetId + '"]').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 60, to.y + to.height / 2, { steps: 8 });
    assert.equal(await page.locator('.web-wire-preview path').count(), 2, '拖拽应显示预览线');
    assert.equal(await page.locator('.card.web-wire-target').getAttribute('data-id'), targetId);
    await page.mouse.up();
    await page.waitForFunction(
      ({ sourceId, targetId }) =>
        window.__canvasEditor
          .current()
          .edges.some((edge) => edge.from === sourceId && edge.to === targetId),
      { sourceId, targetId }
    );
    assert.equal(await page.locator('.web-wire-preview path').count(), 0, '松手后清除预览');
    assert.equal(await page.locator('.web-wire-target').count(), 0);
    const wire = page.locator(
      '#wires path[data-from="' + sourceId + '"][data-to="' + targetId + '"]'
    );
    assert.match(await wire.getAttribute('d'), / C /, 'Web 连线应为曲线');
    assert.equal(await wire.getAttribute('marker-end'), null, 'Web 连线不带箭头');
    const middle = await wire.evaluate((path) => {
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      const rect = document.getElementById('board').getBoundingClientRect();
      return { x: rect.left + point.x, y: rect.top + point.y };
    });
    await page.mouse.click(1200, 700);
    await page.mouse.click(middle.x, middle.y);
    await page.locator('.wire-controls .wire-active').waitFor();
    assert.equal(
      await page.locator('.wire-controls .wire-handle').count(),
      0,
      '曲线不显示折线手柄'
    );
    await page.locator('.wire-scissors').click();
    await page.waitForFunction(
      (targetId) => !window.__canvasEditor.current().edges.some((edge) => edge.to === targetId),
      targetId
    );
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check(
    'Web 外观：已生成图片槽选中仍显示提示词面板，普通导入图片不显示；多选不显示＋',
    async () => {
      const { page, errors } = await openCanvas({ features: webFeatures, appearance: 'web' }, true);
      const editor = (action, input) =>
        page.evaluate(
          ({ action, input }) => {
            const current = window.__canvasEditor.current();
            return window.__canvasEditor.execute({
              requestId: 'r-' + Math.random().toString(16).slice(2),
              pageId: 'page-1',
              canvasId: current.id,
              revision: current.revision,
              action,
              input,
            });
          },
          { action, input }
        );
      const assetPath = await page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
      await page.evaluate(
        (assetPath) =>
          window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '来源图' }),
        assetPath
      );
      const sourceId = (await page.evaluate(() => window.__canvasEditor.current())).nodes[0].id;
      const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      await editor('update-nodes', {
        nodes: [
          { id: sourceId, x: 160, y: 160 },
          { id: slotId, x: 700, y: 200 },
        ],
      });
      await page.waitForFunction(() => window.__canvasUnsaved === false);
      const card = (id) => page.locator('.card[data-id="' + id + '"]');
      const toolbar = page.locator('#selection-toolbar');
      await card(sourceId).click({ position: { x: 100, y: 120 } });
      assert.equal(await toolbar.isHidden(), true, '普通导入图片不显示提示词面板');
      assert.equal(await card(sourceId).locator('.web-node-handle').count(), 4);
      assert.equal(
        await card(sourceId)
          .locator('.canvas-port-input')
          .evaluate((item) => getComputedStyle(item).display),
        'none',
        '普通图片只有右侧＋'
      );
      await card(slotId).click({ position: { x: 100, y: 100 } });
      const panel = page.locator('#selection-toolbar .generation-panel');
      await panel.locator('textarea.generation-prompt').fill('像素史莱姆');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('#selection-toolbar select option')].some(
          (option) => option.textContent === '宿主模型二'
        )
      );
      await panel.locator('.generation-action-primary').click();
      await page.waitForFunction(
        (id) => window.__canvasEditor.current().nodes.find((node) => node.id === id).assetPath,
        slotId
      );
      await page.mouse.click(1300, 820);
      await card(slotId).click({ position: { x: 60, y: 60 } });
      await panel.waitFor();
      assert.ok(
        (await panel.locator('textarea.generation-prompt').count()) >= 1 &&
          (await panel.locator('.generation-action-primary').count()) === 1,
        '已生成图片槽应显示提示词面板'
      );
      assert.equal(await card(slotId).locator('.web-slot-upload').count(), 0, '已有图不出上传');
      const port = card(slotId).locator('.canvas-port-output');
      const shown = () => port.evaluate((item) => getComputedStyle(item).opacity);
      assert.equal(await shown(), '1');
      await card(sourceId).click({ position: { x: 100, y: 120 }, modifiers: ['Shift'] });
      assert.equal(
        await page.evaluate(
          () =>
            window.__canvasEditor.current() && document.querySelectorAll('.card.selected').length
        ),
        2
      );
      assert.equal(await shown(), '0', '多选不显示＋');
      assert.equal(await page.locator('.web-node-handle').count(), 0, '多选不显示角柄');
      assert.deepEqual(errors, []);
      await page.close();
    }
  );

  await check('Web 外观：＋与连线端点位于图片框垂直中心（不含标题行）', async () => {
    const { page, errors } = await openCanvas({ features: webFeatures, appearance: 'web' }, true);
    const editor = (action, input) =>
      page.evaluate(
        ({ action, input }) => {
          const current = window.__canvasEditor.current();
          return window.__canvasEditor.execute({
            requestId: 'r-' + Math.random().toString(16).slice(2),
            pageId: 'page-1',
            canvasId: current.id,
            revision: current.revision,
            action,
            input,
          });
        },
        { action, input }
      );
    const assetPath = await page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
    await page.evaluate(
      (assetPath) =>
        window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '来源图' }),
      assetPath
    );
    const sourceId = (await page.evaluate(() => window.__canvasEditor.current())).nodes[0].id;
    const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', {
      nodes: [
        { id: sourceId, x: 160, y: 160 },
        { id: slotId, x: 700, y: 260 },
      ],
    });
    await editor('connect', { from: sourceId, to: slotId });
    const center = async (selector) => {
      const box = await page.locator(selector).boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
    };
    for (const zoomOut of [0, 4]) {
      for (let i = 0; i < zoomOut; i++)
        await page.getByRole('button', { name: '缩小画布' }).click();
      const scale = (await page.evaluate(() => window.__canvasEditor.current())).viewport.scale;
      if (zoomOut) assert.ok(scale < 0.8, '应已缩小画布');
      await page
        .locator('.card[data-id="' + sourceId + '"]')
        .click({ position: { x: 20, y: 120 } });
      const frame = await center('.card[data-id="' + sourceId + '"] .canvas-card-content');
      const card = await center('.card[data-id="' + sourceId + '"]');
      assert.ok(Math.abs(frame.y - card.y) > 5, '图片框中心应与整卡中心不同');
      const port = await center('.card[data-id="' + sourceId + '"] .canvas-port-output');
      assert.ok(Math.abs(port.y - frame.y) < 1, '＋应在图片框垂直中心 @' + scale);
      // Mivo hot zone: 80px on screen, centred 25px outside the frame edge.
      assert.ok(Math.abs(port.box.width - 80) < 1, '热区应保持 80px 屏幕尺寸 @' + scale);
      assert.ok(Math.abs(port.x - (frame.box.x + frame.box.width + 25)) < 1);
      const ends = await page.evaluate(
        ({ sourceId, slotId }) => {
          const path = document.querySelector(
            '#wires path[data-from="' + sourceId + '"][data-to="' + slotId + '"]'
          );
          const rect = document.getElementById('board').getBoundingClientRect();
          const first = path.getPointAtLength(0);
          const last = path.getPointAtLength(path.getTotalLength());
          return [
            { x: rect.left + first.x, y: rect.top + first.y },
            { x: rect.left + last.x, y: rect.top + last.y },
          ];
        },
        { sourceId, slotId }
      );
      const target = await center('.card[data-id="' + slotId + '"] .canvas-card-content');
      assert.ok(Math.abs(ends[0].y - frame.y) < 1, '连线起点应在来源图片框中心 @' + scale);
      assert.ok(Math.abs(ends[0].x - (frame.box.x + frame.box.width)) < 1);
      assert.ok(Math.abs(ends[1].y - target.y) < 1, '连线终点应在目标图片框中心 @' + scale);
      assert.ok(Math.abs(ends[1].x - target.box.x) < 1);
    }
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check(
    'Web 提示词面板：fill-slot 带 prompt 打开即预填；游戏素材约束只进请求；无说明文案',
    async () => {
      const { page, errors } = await openCanvas({ features: webFeatures, appearance: 'web' }, true);
      const editor = (action, input) =>
        page.evaluate(
          ({ action, input }) => {
            const current = window.__canvasEditor.current();
            return window.__canvasEditor.execute({
              requestId: 'r-' + Math.random().toString(16).slice(2),
              pageId: 'page-1',
              canvasId: current.id,
              revision: current.revision,
              action,
              input,
            });
          },
          { action, input }
        );
      const card = (id) => page.locator('.card[data-id="' + id + '"]');
      const panel = page.locator('#selection-toolbar .generation-panel');
      const toggle = panel.locator('.generation-asset-constraints');
      const assetPath = await page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
      const emptyId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      const filledId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      await editor('update-nodes', {
        nodes: [
          { id: emptyId, x: 140, y: 120 },
          { id: filledId, x: 760, y: 120 },
        ],
      });
      await editor('fill-slot', { id: filledId, assetPath, prompt: '像素风史莱姆，蓝色' });
      await page.waitForFunction(() => window.__canvasUnsaved === false);
      const shoot = async (name) => {
        if (!process.env.CANVAS_SCREENSHOT_DIR) return;
        fs.mkdirSync(process.env.CANVAS_SCREENSHOT_DIR, { recursive: true });
        await page.waitForFunction(() =>
          [...document.images].every((image) => image.complete && image.naturalWidth)
        );
        await page.screenshot({ path: path.join(process.env.CANVAS_SCREENSHOT_DIR, name) });
      };
      const open = async (id) => {
        await page.mouse.click(1300, 860);
        await card(id).click({ position: { x: 60, y: 80 } });
        await panel.waitFor();
        await page.waitForFunction(() =>
          [...document.querySelectorAll('#selection-toolbar select option')].some(
            (option) => option.textContent === '宿主模型二'
          )
        );
      };
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await open(emptyId);
        const rail = await page.locator('.workspace-toolbar').boundingBox();
        const composer = await page.locator('#selection-toolbar').boundingBox();
        assert.ok(composer.x >= rail.x + rail.width, '提示词面板不应压住左侧工具条');
        await shoot('v4-' + theme + '-empty.png');
        await open(filledId);
        await shoot('v4-' + theme + '-filled.png');
      }
      const text = await page.locator('#selection-toolbar').innerText();
      for (const removed of [
        '分辨率与比例是生成目标',
        '未使用参考图',
        '服务模型说明',
        '测试宿主模型',
      ])
        assert.ok(!text.includes(removed), '不应显示：' + removed);
      assert.equal(
        await panel.locator('textarea.generation-prompt').inputValue(),
        '像素风史莱姆，蓝色'
      );
      assert.ok(await card(filledId).evaluate((item) => item.classList.contains('web-slot')));

      await open(emptyId);
      assert.equal(await toggle.getAttribute('aria-pressed'), 'true', '空槽默认开启');
      assert.match(await toggle.getAttribute('title'), /游戏素材约束：/);
      await panel.locator('textarea.generation-prompt').fill('火焰剑士');
      await panel.locator('.generation-action-primary').click();
      await page.waitForFunction(
        (id) => window.__canvasEditor.current().nodes.find((node) => node.id === id).assetPath,
        emptyId
      );
      const sent = await page.evaluate(() => window.__canvasCalls.generate.at(-1).prompt);
      assert.ok(sent.startsWith('火焰剑士\n\n游戏素材约束：'), sent);
      const result = (await page.evaluate(() => window.__canvasEditor.current())).nodes.find(
        (node) => node.id === emptyId
      );
      assert.equal(result.generation.prompt, '火焰剑士', '卡片只存用户文本');
      assert.equal(result.generation.parameters.assetConstraints, true);
      await page.waitForFunction(() => window.__canvasUnsaved === false);
      await open(emptyId);
      assert.equal(await panel.locator('textarea.generation-prompt').inputValue(), '火焰剑士');

      // Off: the request carries only the user's text and the choice is persisted.
      const offId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      await editor('update-nodes', { nodes: [{ id: offId, x: 140, y: 560 }] });
      await page.waitForFunction(() => window.__canvasUnsaved === false);
      await open(offId);
      await toggle.click();
      await panel.locator('.generation-asset-switch').click();
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
      await panel.locator('textarea.generation-prompt').fill('冰霜法师');
      await panel.locator('.generation-action-primary').click();
      await page.waitForFunction(
        (id) => window.__canvasEditor.current().nodes.find((node) => node.id === id).assetPath,
        offId
      );
      assert.equal(
        await page.evaluate(() => window.__canvasCalls.generate.at(-1).prompt),
        '冰霜法师'
      );
      const off = (await page.evaluate(() => window.__canvasEditor.current())).nodes.find(
        (node) => node.id === offId
      );
      assert.equal(off.generation.parameters.assetConstraints, false);
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  // Shared helpers for the Web interaction cases below.
  const webPage = async (extra = {}) => {
    const opened = await openCanvas({ features: webFeatures, appearance: 'web', ...extra }, true);
    const { page } = opened;
    const editor = (action, input) =>
      page.evaluate(
        ({ action, input }) => {
          const current = window.__canvasEditor.current();
          return window.__canvasEditor.execute({
            requestId: 'r-' + Math.random().toString(16).slice(2),
            pageId: 'page-1',
            canvasId: current.id,
            revision: current.revision,
            action,
            input,
          });
        },
        { action, input }
      );
    const settle = () => page.waitForFunction(() => window.__canvasUnsaved === false);
    const current = () => page.evaluate(() => window.__canvasEditor.current());
    const nodeOf = async (id) => (await current()).nodes.find((node) => node.id === id);
    const card = (id) => page.locator('.card[data-id="' + id + '"]');
    const importImage = async (title, color = '#c33', width = 40, height = 40) => {
      const assetPath = await page.evaluate(
        ({ color, width, height }) => window.__canvasAddMedia(color, width, height),
        { color, width, height }
      );
      await page.evaluate(
        ({ assetPath, title }) =>
          window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title }),
        { assetPath, title }
      );
      const node = (await current()).nodes.find((item) => item.assetPath === assetPath);
      return { id: node.id, assetPath };
    };
    const blank = () => page.mouse.click(1300, 840);
    const shoot = async (name, clip) => {
      if (!process.env.CANVAS_SCREENSHOT_DIR) return;
      fs.mkdirSync(process.env.CANVAS_SCREENSHOT_DIR, { recursive: true });
      await page.waitForFunction(() =>
        [...document.images].every((image) => image.complete && image.naturalWidth)
      );
      await page.screenshot({ path: path.join(process.env.CANVAS_SCREENSHOT_DIR, name), clip });
    };
    return { ...opened, editor, settle, current, nodeOf, card, importImage, blank, shoot };
  };
  const boxesOverlap = (a, b) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  await check('Web 外观：四角都可缩放，光标对应对角线，保持图片比例并可撤销', async () => {
    const { page, errors, editor, settle, nodeOf, card, importImage, blank } = await webPage();
    const image = await importImage('方图');
    const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', {
      nodes: [
        { id: image.id, x: 300, y: 260 },
        { id: slotId, x: 800, y: 260 },
      ],
    });
    await settle();
    await blank();
    await card(image.id).click({ position: { x: 100, y: 120 } });
    const handles = card(image.id).locator('.web-node-handle');
    assert.equal(await handles.count(), 4);
    const cursors = await handles.evaluateAll((items) =>
      items.map((item) => [item.className.split('is-')[1], getComputedStyle(item).cursor])
    );
    assert.deepEqual(cursors, [
      ['nw', 'nwse-resize'],
      ['ne', 'nesw-resize'],
      ['sw', 'nesw-resize'],
      ['se', 'nwse-resize'],
    ]);
    const radius = await handles.first().evaluate((item) => getComputedStyle(item).borderRadius);
    assert.equal(radius, '50%', '角柄应为圆形');
    const drag = async (id, corner, dx, dy) => {
      const box = await card(id)
        .locator('.web-node-handle.is-' + corner)
        .boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
      await page.mouse.move(x + dx, y + dy, { steps: 3 });
      await page.mouse.up();
    };
    const before = await nodeOf(image.id);
    await drag(image.id, 'nw', -60, -60);
    const grown = await nodeOf(image.id);
    assert.ok(grown.width > before.width + 40, '左上角拖出应放大');
    assert.ok(Math.abs(grown.x + grown.width - (before.x + before.width)) < 0.5, '右边应固定');
    assert.ok(Math.abs(grown.y + grown.height - (before.y + before.height)) < 0.5, '下边应固定');
    assert.ok(Math.abs(grown.height - 42 - (grown.width - 2)) < 0.5, '应保持 1:1 图片比例');
    await card(image.id).click({ position: { x: 100, y: 120 } });
    const middle = await nodeOf(image.id);
    await drag(image.id, 'ne', -40, 0);
    const shrunk = await nodeOf(image.id);
    assert.ok(shrunk.width < middle.width - 20, '右上角向内应缩小');
    assert.ok(Math.abs(shrunk.x - middle.x) < 0.5, '左边应固定');
    assert.ok(Math.abs(shrunk.y + shrunk.height - (middle.y + middle.height)) < 0.5);
    await settle();
    await editor('undo', {});
    assert.equal((await nodeOf(image.id)).width, middle.width, 'undo 还原上一次缩放');
    // Empty slots have no image ratio: the south-west corner moves only the left and bottom edges.
    await blank();
    await card(slotId).click({ position: { x: 100, y: 100 } });
    const slot = await nodeOf(slotId);
    await drag(slotId, 'sw', -50, 30);
    const resized = await nodeOf(slotId);
    assert.ok(Math.abs(resized.x - (slot.x - 50)) < 1);
    assert.ok(Math.abs(resized.width - (slot.width + 50)) < 1);
    assert.ok(Math.abs(resized.height - (slot.height + 30)) < 1);
    assert.equal(resized.y, slot.y, '上边应固定');
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check('Web 外观：加入对话经宿主 addToChat 传选中图片；无钩子不显示', async () => {
    const { page, errors, editor, settle, card, importImage, blank } = await webPage({
      addToChat: true,
    });
    const first = await importImage('甲');
    const second = await importImage('乙', '#36c');
    const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', {
      nodes: [
        { id: first.id, x: 260, y: 220 },
        { id: second.id, x: 620, y: 220 },
        { id: slotId, x: 980, y: 220 },
      ],
    });
    await settle();
    await blank();
    await card(first.id).click({ position: { x: 100, y: 120 } });
    const menu = page.locator('#selection-menu');
    await menu.getByRole('button', { name: '加入对话' }).click();
    assert.deepEqual(await page.evaluate(() => window.__canvasChat.at(-1)), [
      { nodeId: first.id, assetPath: first.assetPath },
    ]);
    await card(second.id).click({ position: { x: 100, y: 120 }, modifiers: ['Shift'] });
    await card(slotId).click({ position: { x: 100, y: 100 }, modifiers: ['Shift'] });
    assert.equal(await menu.isHidden(), false, '多选应显示菜单');
    assert.equal(await menu.getByRole('button').count(), 1);
    await menu.getByRole('button', { name: '加入对话' }).click();
    // The empty slot has no asset, so only the two images are handed to the chat.
    assert.deepEqual(await page.evaluate(() => window.__canvasChat.at(-1)), [
      { nodeId: first.id, assetPath: first.assetPath },
      { nodeId: second.id, assetPath: second.assetPath },
    ]);
    const outline = await card(first.id)
      .locator('.canvas-card-content')
      .evaluate((item) => getComputedStyle(item).outlineWidth);
    assert.equal(outline, '2px', '多选描边应为 2px');
    assert.equal(await page.locator('.web-selection-bounds').count(), 0, '多选不再画整体框');
    const ring = await card(first.id).evaluate(
      (item) => Number(getComputedStyle(item, '::before').opacity) > 0
    );
    assert.ok(ring, '多选保留每张卡的描边光环');
    assert.deepEqual(errors, []);
    await page.close();
    const plain = await webPage();
    const image = await plain.importImage('无钩子');
    await plain.settle();
    await plain.blank();
    await plain.card(image.id).click({ position: { x: 100, y: 120 } });
    await plain.page.locator('#selection-menu').waitFor();
    assert.equal(
      await plain.page.locator('#selection-menu').getByRole('button', { name: '加入对话' }).count(),
      0
    );
    assert.equal(
      await plain.page
        .locator('#selection-menu')
        .getByRole('button', { name: '抠图', exact: true })
        .count(),
      0,
      'Web 关闭 imageEditing 且未声明 cutout 时不显示抠图'
    );
    await plain.page.close();
  });

  await check('Web 外观：「抠图」一键去纯色背景，结果卡连到原图并立即显示', async () => {
    const { page, errors, settle, current, nodeOf, card, blank, editor } = await webPage({
      features: { ...webFeatures, cutout: true },
    });
    const painted = async (title, kind) => {
      const assetPath = await page.evaluate(
        (kind) => window.__canvasAddPainted(kind, 80, 60),
        kind
      );
      await page.evaluate(
        ({ assetPath, title }) =>
          window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title }),
        { assetPath, title }
      );
      return (await current()).nodes.find((item) => item.assetPath === assetPath).id;
    };
    const sourceId = await painted('抠图源', 'subject');
    await editor('update-nodes', { nodes: [{ id: sourceId, x: 300, y: 240 }] });
    await settle();
    // Any dialog opening during the action fails the case: the cutout must not open the editor.
    await page.evaluate(() => {
      window.__canvasDialogs = 0;
      new MutationObserver((records) => {
        for (const record of records)
          for (const added of record.addedNodes)
            if (added.tagName === 'DIALOG') window.__canvasDialogs++;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await blank();
    await card(sourceId).click({ position: { x: 100, y: 120 } });
    const menu = page.locator('#selection-menu');
    assert.equal(await menu.getByRole('button', { name: '去纯色背景' }).count(), 0);
    assert.equal(await menu.getByRole('button', { name: '快速编辑' }).count(), 0);
    await page.evaluate(() => {
      window.__canvasReadHold = new Promise((resolve) => (window.__canvasReadRelease = resolve));
    });
    await menu.getByRole('button', { name: '抠图', exact: true }).click();
    await card(sourceId).locator('.card-state-loading').waitFor();
    await page.evaluate(() => {
      window.__canvasReadHold = undefined;
      window.__canvasReadRelease();
    });
    const resultId = await page
      .waitForFunction((id) => {
        const doc = window.__canvasEditor.current();
        const edge = doc.edges.find((item) => item.from === id && item.kind === 'image-variant');
        return edge && edge.to;
      }, sourceId)
      .then((handle) => handle.jsonValue());
    // Checked before any wait: the card must draw its image without a reload.
    const src = await card(resultId).locator('img').getAttribute('src');
    assert.ok(src && src !== 'data:,', '抠图结果卡应立即有图片 src');
    const result = await nodeOf(resultId);
    const source = await nodeOf(sourceId);
    assert.equal(result.title, '抠图源 · 抠图');
    assert.ok(result.x >= source.x + source.width, '结果卡放在原图右侧');
    assert.equal(
      await card(resultId).evaluate((item) => item.classList.contains('selected')),
      true,
      '选中结果卡'
    );
    assert.equal(await card(sourceId).locator('.card-state-loading').count(), 0);
    const alpha = await page.evaluate(async (path) => {
      const bitmap = await createImageBitmap(await (await fetch(path)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      return [context.getImageData(1, 1, 1, 1).data[3], context.getImageData(40, 30, 1, 1).data[3]];
    }, src);
    assert.deepEqual(alpha, [0, 255], '背景透明、主体保留');
    assert.equal(await page.evaluate(() => window.__canvasDialogs), 0, '不打开任何编辑弹窗');
    assert.equal(
      await page.evaluate(() => window.__canvasCalls.generate.length),
      0,
      '抠图不调用生成'
    );
    await settle();
    await editor('undo', {});
    assert.equal(await nodeOf(resultId), undefined, 'undo 移除抠图结果');

    // No reliable solid background: a short error, and nothing is created.
    const stripesId = await painted('条纹', 'stripes');
    await editor('update-nodes', { nodes: [{ id: stripesId, x: 300, y: 560 }] });
    await settle();
    const before = (await current()).nodes.length;
    await blank();
    await card(stripesId).click({ position: { x: 100, y: 100 } });
    await menu.getByRole('button', { name: '抠图', exact: true }).click();
    await page.waitForFunction(() => /抠图失败/.test(document.getElementById('error').textContent));
    assert.equal(
      await page.locator('#error').textContent(),
      '抠图失败：未识别到纯色背景，可用「调整抠图」手动取色'
    );
    assert.equal((await current()).nodes.length, before, '失败不创建卡片');
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check(
    '导入类结果卡动作完成即有图片 src：本地编辑/上传/右键上传/fill-slot/replace-image',
    async () => {
      const png = {
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64'
        ),
      };
      const srcOf = (page, id) =>
        page
          .locator('.card[data-id="' + id + '"] img')
          .evaluateAll((items) => items.map((item) => item.getAttribute('src')));
      const assertSrc = async (page, id, label) => {
        const [src] = await srcOf(page, id);
        assert.ok(src && src !== 'data:,', label + '：结果卡应立即有图片 src，实际 ' + src);
      };
      // Default appearance keeps the full local editor; its saved result must render without reload.
      const local = await openCanvas({});
      const sourcePath = await local.page.evaluate(() =>
        window.__canvasAddPainted('subject', 80, 60)
      );
      await local.page.evaluate(
        (assetPath) =>
          window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '本地源' }),
        sourcePath
      );
      const sourceId = (
        await local.page.evaluate(() => window.__canvasEditor.current())
      ).nodes.find((node) => node.assetPath === sourcePath).id;
      await local.page.waitForFunction(() => window.__canvasUnsaved === false);
      await local.page.locator('.card[data-id="' + sourceId + '"] img').click();
      await local.page
        .locator('#selection-menu')
        .getByRole('button', { name: '去纯色背景' })
        .click();
      const background = local.page.locator('dialog[aria-label="自动去背景"]');
      await background.waitFor();
      const apply = background.getByRole('button', { name: '应用到当前帧' });
      await local.page.waitForFunction(
        () => !document.querySelector('dialog[aria-label="自动去背景"] footer button').disabled
      );
      await apply.click();
      const editorDialog = local.page.locator('dialog[aria-label="本地图片编辑"]');
      const save = editorDialog.getByRole('button', { name: '保存本地 PNG' });
      await local.page.waitForFunction(() =>
        [...document.querySelectorAll('dialog[aria-label="本地图片编辑"] button')].some(
          (item) => item.textContent === '保存本地 PNG' && !item.disabled
        )
      );
      await save.click();
      await local.page.waitForFunction(() => !document.querySelector('dialog[open]'));
      const edited = (await local.page.evaluate(() => window.__canvasEditor.current())).edges.find(
        (edge) => edge.from === sourceId && edge.kind === 'image-variant'
      );
      assert.ok(edited, '本地编辑结果应连到原图');
      await assertSrc(local.page, edited.to, '本地编辑');
      assert.deepEqual(local.errors, []);
      await local.page.close();

      const { page, errors, editor, settle, current, blank } = await webPage();
      const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      await editor('update-nodes', { nodes: [{ id: slotId, x: 300, y: 200 }] });
      await settle();
      await blank();
      await page.locator('.card[data-id="' + slotId + '"]').click({ position: { x: 80, y: 80 } });
      let chooser = page.waitForEvent('filechooser');
      await page.locator('.card[data-id="' + slotId + '"] .web-slot-upload').click();
      await (await chooser).setFiles({ name: 'slot.png', ...png });
      await page.waitForFunction(
        (id) => window.__canvasEditor.current().nodes.find((node) => node.id === id).assetPath,
        slotId
      );
      await assertSrc(page, slotId, '槽内上传');
      await settle();
      await blank();
      await page.mouse.click(300, 700, { button: 'right' });
      chooser = page.waitForEvent('filechooser');
      await page.locator('#canvas-context-menu').getByRole('button', { name: '上传图片' }).click();
      await (await chooser).setFiles({ name: 'menu.png', ...png });
      await page.waitForFunction(() =>
        window.__canvasEditor
          .current()
          .nodes.some((node) => node.title === 'menu' && node.assetPath)
      );
      await assertSrc(
        page,
        (await current()).nodes.find((node) => node.title === 'menu').id,
        '右键上传'
      );
      await settle();
      const fillId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      const fillPath = await page.evaluate(() => window.__canvasAddMedia('#3a7', 40, 40));
      await editor('fill-slot', { id: fillId, assetPath: fillPath });
      await assertSrc(page, fillId, 'fill-slot');
      const [filledSrc] = await srcOf(page, fillId);
      await settle();
      const replacePath = await page.evaluate(() => window.__canvasAddMedia('#36c', 80, 40));
      await editor('replace-image', { id: fillId, assetPath: replacePath });
      await assertSrc(page, fillId, 'replace-image');
      assert.notEqual((await srcOf(page, fillId))[0], filledSrc, 'replace-image 应换成新图');
      assert.deepEqual(errors, []);
      await page.close();
    }
  );

  await check('Web 提示词面板与素材规范弹层停留在画板内（右缘/底缘，避开工具条）', async () => {
    const { page, errors, editor, settle, card, blank, shoot } = await webPage();
    const boardBox = await page.locator('#board').boundingBox();
    const dock = await page.locator('.workspace-toolbar').boundingBox();
    const inside = (box, label) => {
      assert.ok(box.x >= boardBox.x - 0.5, label + ' 左缘越界');
      assert.ok(box.y >= boardBox.y - 0.5, label + ' 上缘越界');
      assert.ok(box.x + box.width <= boardBox.x + boardBox.width + 0.5, label + ' 右缘越界');
      assert.ok(box.y + box.height <= boardBox.y + boardBox.height + 0.5, label + ' 下缘越界');
    };
    const rightId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    const bottomId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', {
      nodes: [
        { id: rightId, x: boardBox.width - 250, y: 160 },
        { id: bottomId, x: 520, y: boardBox.height - 230 },
      ],
    });
    await settle();
    const composer = page.locator('#selection-toolbar');
    const pill = composer.locator('.generation-asset-constraints');
    const popover = composer.locator('.generation-asset-popover');
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await blank();
      await card(rightId).click({ position: { x: 80, y: 80 } });
      await pill.waitFor();
      const closed = await composer.boundingBox();
      inside(closed, '右缘面板');
      assert.ok(closed.x >= dock.x + dock.width, '面板不压住工具条');
      await pill.click();
      await popover.waitFor();
      await popover.locator('textarea').focus();
      const opened = await composer.boundingBox();
      assert.deepEqual(opened, closed, '打开弹层不改变面板位置与尺寸');
      const pop = await popover.boundingBox();
      inside(pop, '素材规范弹层');
      assert.ok(pop.y + pop.height <= (await pill.boundingBox()).y, '弹层向上展开');
      assert.equal(await page.evaluate(() => document.getElementById('board').scrollLeft), 0);
      await shoot('v6-' + theme + '-composer-popover-right.png');
      await blank();
      await card(bottomId).click({ position: { x: 80, y: 80 } });
      await pill.waitFor();
      const flipped = await composer.boundingBox();
      inside(flipped, '底缘面板');
      const frame = await card(bottomId).locator('.canvas-card-content').boundingBox();
      assert.ok(flipped.y + flipped.height <= frame.y, '下方放不下时翻到卡片上方');
    }
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check(
    'Web 连线：悬停/选中用宿主强调色 3px，剪断钮 28px 毛玻璃；点击与 Delete 均可删',
    async () => {
      const { page, errors, editor, settle, current, importImage, blank, shoot } = await webPage();
      // A distinctive host accent proves the wire follows --canvas-accent, not a fixed blue.
      await page.evaluate(() =>
        document.documentElement.style.setProperty('--canvas-accent', 'rgb(10, 120, 200)')
      );
      const first = await importImage('甲', '#c96', 60, 60);
      const second = await importImage('乙', '#69c', 60, 60);
      const third = await importImage('丙', '#9c6', 60, 60);
      await editor('update-nodes', {
        nodes: [
          { id: first.id, x: 240, y: 220 },
          { id: second.id, x: 640, y: 160 },
          { id: third.id, x: 640, y: 480 },
        ],
      });
      await editor('connect', { from: first.id, to: second.id });
      await editor('connect', { from: first.id, to: third.id });
      await settle();
      const middle = (to) =>
        page
          .locator('#wires path[data-from="' + first.id + '"][data-to="' + to + '"]')
          .evaluate((path) => {
            const point = path.getPointAtLength(path.getTotalLength() / 2);
            const rect = document.getElementById('board').getBoundingClientRect();
            return { x: rect.left + point.x, y: rect.top + point.y };
          });
      const cut = page.locator('.wire-controls .wire-scissors');
      // 流光: every comet layer runs the dash keyframes and its offset actually advances.
      const assertFlowing = async (label) => {
        const sample = () =>
          page.evaluate(() =>
            [...document.querySelectorAll('.wire-controls .wire-glow')].map((item) => {
              const style = getComputedStyle(item);
              return [style.animationName, parseFloat(style.strokeDashoffset)];
            })
          );
        const before = await sample();
        assert.equal(before.length, 6, label + '：应有 6 层流光');
        assert.ok(
          before.every(([name]) => name === 'web-wire-flow'),
          label + '：流光动画缺失'
        );
        await page.waitForTimeout(120);
        const after = await sample();
        assert.ok(
          after.some((item, index) => item[1] !== before[index][1]),
          label + '：流光未移动'
        );
      };
      const strokes = () =>
        page.evaluate(() =>
          ['.wire-controls .wire-active', '.wire-controls .wire-glow'].map((selector) => {
            const style = getComputedStyle(document.querySelector(selector));
            return [style.stroke, style.strokeWidth];
          })
        );
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await blank();
        const hover = await middle(third.id);
        await page.mouse.move(hover.x, hover.y);
        await cut.waitFor();
        assert.deepEqual(await strokes(), [
          ['rgb(10, 120, 200)', '3px'],
          ['rgb(10, 120, 200)', '5px'],
        ]);
        await assertFlowing('悬停');
        const hovered = await cut.boundingBox();
        await shoot('v9-' + theme + '-wire-hover.png', {
          x: hovered.x - 150,
          y: hovered.y - 90,
          width: 300,
          height: 180,
        });
        await blank();
        const point = await middle(second.id);
        await page.mouse.click(point.x, point.y);
        await cut.waitFor();
        assert.deepEqual(await strokes(), [
          ['rgb(10, 120, 200)', '3px'],
          ['rgb(10, 120, 200)', '5px'],
        ]);
        await assertFlowing('选中');
        const box = await cut.boundingBox();
        assert.equal(Math.round(box.width), 28);
        assert.equal(Math.round(box.height), 28);
        assert.equal(await cut.evaluate((item) => getComputedStyle(item).borderRadius), '50%');
        assert.equal(await cut.locator('svg').getAttribute('width'), '14');
        const icon = await cut.locator('svg').boundingBox();
        assert.deepEqual([icon.width, icon.height], [14, 14], '剪刀图标实际渲染 14px');
        assert.ok(Math.abs(icon.x + icon.width / 2 - (box.x + box.width / 2)) < 1, '图标水平居中');
        assert.ok(
          Math.abs(icon.y + icon.height / 2 - (box.y + box.height / 2)) < 1,
          '图标垂直居中'
        );
        const glass = await cut.evaluate((item) => {
          const style = getComputedStyle(item);
          return [style.backdropFilter || style.webkitBackdropFilter, style.backgroundColor];
        });
        assert.equal(glass[0], 'blur(10px)');
        assert.match(glass[1], /^rgba\(.*0\.62\)$/, '半透明面板色');
        await cut.hover();
        await page.waitForTimeout(200);
        const hoverStyle = await cut.evaluate((item) => {
          const style = getComputedStyle(item);
          return [style.borderTopColor, style.color, getComputedStyle(item, '::before').opacity];
        });
        assert.deepEqual(hoverStyle, ['rgba(0, 0, 0, 0)', 'rgb(10, 120, 200)', '0.14']);
        await shoot('v9-' + theme + '-wire-delete.png', {
          x: box.x - 150,
          y: box.y - 90,
          width: 300,
          height: 180,
        });
      }
      await cut.click();
      await page.waitForFunction(
        (id) => !window.__canvasEditor.current().edges.some((edge) => edge.to === id),
        second.id
      );
      const point = await middle(third.id);
      await blank();
      await page.mouse.click(point.x, point.y);
      await cut.waitFor();
      await page.keyboard.press('Delete');
      await page.waitForFunction(
        (id) => !window.__canvasEditor.current().edges.some((edge) => edge.to === id),
        third.id
      );
      assert.equal((await current()).edges.length, 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  for (const appearance of ['web', 'default'])
    await check(
      '拖拽图片（' + appearance + '）：打开的生成面板只跟随移动，不重建下拉、不重复读模型',
      async () => {
        const { page, errors } = await openCanvas(
          { features: webFeatures, appearance: appearance === 'web' ? 'web' : undefined },
          true
        );
        const slotId = await page.evaluate(async () => {
          const current = window.__canvasEditor.current();
          const result = await window.__canvasEditor.execute({
            requestId: 'r-drag',
            pageId: 'page-1',
            canvasId: current.id,
            revision: current.revision,
            action: 'add-node',
            input: { type: 'image' },
          });
          const id = result.selectedIds[0];
          const next = window.__canvasEditor.current();
          await window.__canvasEditor.execute({
            requestId: 'r-drag-place',
            pageId: 'page-1',
            canvasId: next.id,
            revision: next.revision,
            action: 'update-nodes',
            input: { nodes: [{ id, x: 360, y: 160 }] },
          });
          return id;
        });
        const card = page.locator('.card[data-id="' + slotId + '"]');
        await page.mouse.click(1300, 840);
        // The header avoids the default empty-slot import button, which opens a file chooser.
        await card.click({ position: { x: 12, y: 10 } });
        const panel = page.locator('#selection-toolbar .generation-panel');
        await panel.locator('textarea.generation-prompt').fill('拖拽中保留的提示词');
        await page.waitForFunction(() =>
          [...document.querySelectorAll('#selection-toolbar select option')].some(
            (option) => option.textContent === '宿主模型二'
          )
        );
        await page
          .locator('#selection-toolbar select.generation-mode')
          .first()
          .selectOption('host-second');
        await page.evaluate(() => {
          window.__canvasModelCalls = 0;
          window.__dragSelect = document.querySelector('#selection-toolbar select.generation-mode');
        });
        const before = await page.evaluate(
          (id) => window.__canvasEditor.current().nodes.find((node) => node.id === id),
          slotId
        );
        const toolbarBefore = await page.locator('#selection-toolbar').boundingBox();
        const box = await card.boundingBox();
        await page.mouse.move(box.x + 12, box.y + 10);
        await page.mouse.down();
        for (let step = 1; step <= 12; step++) {
          await page.mouse.move(box.x + 12 + step * 10, box.y + 10 + step * 4);
          assert.equal(
            await page.evaluate(
              () =>
                document.querySelector('#selection-toolbar select.generation-mode') ===
                  window.__dragSelect && window.__dragSelect.isConnected
            ),
            true,
            '拖拽第 ' + step + ' 步模型下拉被重建'
          );
        }
        await page.mouse.up();
        const after = await page.evaluate(
          (id) => window.__canvasEditor.current().nodes.find((node) => node.id === id),
          slotId
        );
        assert.equal(after.x, before.x + 120);
        assert.equal(after.y, before.y + 48);
        assert.ok(
          (await page.evaluate(() => window.__canvasModelCalls)) <= 1,
          '拖拽期间重复读模型'
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('#selection-toolbar select.generation-mode') ===
              window.__dragSelect
          ),
          true,
          '松手后下拉仍是同一节点'
        );
        assert.equal(
          await panel.locator('textarea.generation-prompt').inputValue(),
          '拖拽中保留的提示词'
        );
        assert.equal(
          await page.locator('#selection-toolbar select.generation-mode').first().inputValue(),
          'host-second'
        );
        const toolbarAfter = await page.locator('#selection-toolbar').boundingBox();
        const cardAfter = await card.boundingBox();
        // The default page may flip a tall panel beside the card; Web keeps its offset.
        if (appearance === 'web')
          assert.deepEqual(
            [toolbarAfter.x - cardAfter.x, toolbarAfter.y - cardAfter.y],
            [toolbarBefore.x - box.x, toolbarBefore.y - box.y],
            '面板跟随卡片移动'
          );
        else assert.notDeepEqual(toolbarAfter, toolbarBefore, '面板重新定位');
        assert.deepEqual(errors, []);
        await page.close();
      }
    );
  await check('Web 外观：AI 结果槽再生成原位回填（保留 id/位置/宽度/连线，可撤销）', async () => {
    const { page, errors, editor, settle, current, nodeOf, card, importImage, blank } =
      await webPage();
    const source = await importImage('来源图', '#c33', 40, 40);
    const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', {
      nodes: [
        { id: source.id, x: 160, y: 160 },
        { id: slotId, x: 640, y: 200 },
      ],
    });
    await editor('connect', { from: source.id, to: slotId });
    await settle();
    const panel = page.locator('#selection-toolbar .generation-panel');
    const send = async (prompt) => {
      await panel.locator('textarea.generation-prompt').fill(prompt);
      await page.waitForFunction(() =>
        [...document.querySelectorAll('#selection-toolbar select option')].some(
          (option) => option.textContent === '宿主模型二'
        )
      );
      await panel.locator('.generation-action-primary').click();
    };
    // Square first result, so the 64x32 regeneration visibly changes only the height.
    await page.evaluate(() => (window.__canvasResultSize = [48, 48]));
    await blank();
    await card(slotId).click({ position: { x: 100, y: 100 } });
    await send('第一版');
    await page.waitForFunction(
      (id) => window.__canvasEditor.current().nodes.find((node) => node.id === id).assetPath,
      slotId
    );
    await settle();
    await editor('update-nodes', { nodes: [{ id: slotId, x: 640, y: 200, width: 300 }] });
    await settle();
    const before = await current();
    const first = before.nodes.find((node) => node.id === slotId);
    await blank();
    await card(slotId).click({ position: { x: 100, y: 100 } });
    await page.evaluate(() => (window.__canvasResultSize = [64, 32]));
    await send('第二版');
    await page.waitForFunction(
      ({ id, path }) =>
        window.__canvasEditor.current().nodes.find((node) => node.id === id).assetPath !== path,
      { id: slotId, path: first.assetPath }
    );
    await settle();
    const after = await current();
    const second = after.nodes.find((node) => node.id === slotId);
    assert.equal(after.nodes.length, before.nodes.length, '不新建结果卡');
    assert.deepEqual(
      [second.x, second.y, second.width, second.title],
      [first.x, first.y, first.width, first.title]
    );
    assert.notEqual(second.height, first.height, '高度跟随新比例');
    assert.deepEqual(second.imageInfo, { width: 64, height: 32 });
    assert.equal(second.generation.prompt, '第二版');
    assert.deepEqual(after.edges, before.edges, '连线保持不变');
    const calls = await page.evaluate(() => window.__canvasCalls.generate);
    assert.equal(calls.at(-1).targetNodeId, slotId);
    await editor('undo', {});
    assert.equal((await nodeOf(slotId)).assetPath, first.assetPath, '撤销还原上一张');
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 外观：AI 结果面板显示生成它的来源图，原位再生成只发送来源', async () => {
    const kneel = 'assets/image/canvas/seed-kneel.png';
    const lying = 'assets/image/canvas/seed-lying.png';
    const text = 'assets/image/canvas/seed-text.png';
    const base = { type: 'image', y: 200, width: 240, height: 240 };
    const generated = (prompt, operation, extra = {}) => ({
      prompt,
      operation,
      referenceImagePaths: [],
      parameters: {},
      ...extra,
    });
    const { page, errors, settle, current, card, blank } = await webPage({
      seedMedia: { [kneel]: '#c33', [lying]: '#3a7', [text]: '#36c' },
      seedDocuments: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          title: '来源画布',
          revision: 3,
          viewport: { x: 0, y: 0, scale: 1 },
          nodes: [
            {
              ...base,
              id: 'seed-k',
              title: '生图结果',
              x: 120,
              assetPath: kneel,
              generation: generated('生成跪姿女孩', 'generate'),
            },
            {
              ...base,
              id: 'seed-l',
              title: '图片变体 · 已保存结果',
              x: 520,
              assetPath: lying,
              generation: generated('生成这个女孩的躺姿势', 'variant', {
                sourceImageId: 'seed-k',
              }),
              sourceSnapshot: { nodeId: 'seed-k', version: 'image|' + kneel + '|manual-asset' },
              sourceSnapshots: [{ nodeId: 'seed-k', version: 'image|' + kneel + '|manual-asset' }],
            },
            {
              ...base,
              id: 'seed-t',
              title: '生图结果',
              x: 920,
              assetPath: text,
              generation: generated('纯文生图', 'generate'),
            },
          ],
          edges: [{ id: 'seed-edge', from: 'seed-k', to: 'seed-l', kind: 'image-variant' }],
        },
      ],
    });
    await card('seed-l').waitFor();
    const panel = page.locator('#selection-toolbar .generation-panel');
    const open = async (id) => {
      await blank();
      await card(id).click({ position: { x: 60, y: 80 } });
      await panel.waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('#selection-toolbar select option')].some(
          (option) => option.textContent === '宿主模型二'
        )
      );
    };
    const srcOf = (id) => card(id).locator('img').first().getAttribute('src');
    await open('seed-l');
    const thumbs = panel.locator('.generation-reference img');
    assert.equal(await thumbs.count(), 1);
    assert.equal(await thumbs.first().getAttribute('src'), await srcOf('seed-k'), '显示来源 K');
    assert.notEqual(await thumbs.first().getAttribute('src'), await srcOf('seed-l'));
    const before = await current();
    await panel.locator('.generation-action-primary').click();
    await page.waitForFunction(
      (path) =>
        window.__canvasEditor.current().nodes.find((node) => node.id === 'seed-l').assetPath !==
        path,
      lying
    );
    await settle();
    const after = await current();
    const call = (await page.evaluate(() => window.__canvasCalls.generate)).at(-1);
    assert.equal(call.targetNodeId, 'seed-l');
    assert.deepEqual(call.sourceImagePaths, [kneel], '只发送来源 K，不发送 L 自身');
    assert.deepEqual(call.referenceImagePaths, []);
    assert.equal(after.nodes.length, before.nodes.length, '原位回填，不新建卡片');
    const result = after.nodes.find((node) => node.id === 'seed-l');
    assert.equal(result.title, '图片变体 · 已保存结果');
    assert.equal(result.generation.sourceImageId, 'seed-k');
    assert.deepEqual(after.edges, before.edges, '连线保持不变');
    await open('seed-t');
    assert.equal(await panel.locator('.generation-reference img').count(), 0, '文生图无参考图');
    await panel.locator('.generation-action-primary').click();
    await page.waitForFunction(
      (path) =>
        window.__canvasEditor.current().nodes.find((node) => node.id === 'seed-t').assetPath !==
        path,
      text
    );
    const textCall = (await page.evaluate(() => window.__canvasCalls.generate)).at(-1);
    assert.equal(textCall.targetNodeId, 'seed-t');
    assert.equal(textCall.operation, 'generate');
    assert.equal(textCall.sourceImageIds, undefined, '文生图不带来源图');
    assert.deepEqual(textCall.referenceImagePaths, []);
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 外观：普通导入图生成仍落到新连线卡片', async () => {
    const { page, errors, editor, settle, current, nodeOf, card, importImage, blank } =
      await webPage({ features: { ...webFeatures, imageEditing: true } });
    const source = await importImage('导入图', '#c33', 40, 40);
    await editor('update-nodes', { nodes: [{ id: source.id, x: 200, y: 200 }] });
    await settle();
    await blank();
    await card(source.id).click({ position: { x: 100, y: 120 } });
    await page.locator('#selection-menu').getByRole('button', { name: '快速编辑' }).click();
    const panel = page.locator('#selection-toolbar .generation-panel');
    await panel.locator('textarea.generation-prompt').fill('导入图变体');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#selection-toolbar select option')].some(
        (option) => option.textContent === '宿主模型二'
      )
    );
    await panel.locator('.generation-action-primary').click();
    await page.waitForFunction(() => window.__canvasEditor.current().nodes.length === 2);
    await settle();
    const doc = await current();
    const result = doc.nodes.find((node) => node.id !== source.id);
    assert.ok(result.assetPath);
    assert.equal((await nodeOf(source.id)).assetPath, source.assetPath, '导入图本身不变');
    assert.ok(doc.edges.some((edge) => edge.from === source.id && edge.to === result.id));
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check(
    'Web 外观：图片工具条为图标按钮；图片右键含加入对话/抠图/下载，按钩子显示',
    async () => {
      const { page, errors, editor, settle, card, importImage, blank, shoot } = await webPage({
        addToChat: true,
        features: { ...webFeatures, cutout: true },
      });
      const image = await importImage('角色', '#c96', 160, 120);
      const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      await editor('update-nodes', {
        nodes: [
          { id: image.id, x: 260, y: 220 },
          { id: slotId, x: 760, y: 220 },
        ],
      });
      await settle();
      const menu = page.locator('#selection-menu');
      const contextMenu = page.locator('#canvas-context-menu');
      const imageItems = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('#canvas-context-menu [data-menu-scope=image]')]
            .filter((item) => !item.hidden)
            .map((item) => item.textContent)
        );
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await blank();
        await card(image.id).click({ position: { x: 100, y: 120 } });
        for (const name of ['加入对话', '抠图']) {
          const button = menu.getByRole('button', { name, exact: true });
          assert.equal(await button.getAttribute('title'), null, name + ' 不用原生 title');
          assert.equal(await button.getAttribute('aria-label'), name);
          assert.equal(await button.getAttribute('data-web-tip'), name);
          assert.equal(await button.locator('svg').count(), 1, name + ' 为图标');
          assert.equal((await button.innerText()).trim(), '', name + ' 不显示文字');
        }
        const download = menu.getByRole('button', { name: '下载 PNG', exact: true });
        assert.equal(await download.getAttribute('data-web-tip'), '下载 PNG');
        assert.equal(await download.locator('svg').count(), 1);
        assert.equal(await menu.locator('details').count(), 0, '下载不再是折叠菜单');
        const bar = await menu.boundingBox();
        await shoot('v7-' + theme + '-selection-icons.png', {
          x: bar.x - 24,
          y: bar.y - 16,
          width: bar.width + 48,
          height: 260,
        });
        await card(image.id).click({ button: 'right', position: { x: 100, y: 120 } });
        await contextMenu.waitFor();
        // Same names and order as the selection icons: 编辑 / 对话 / 导出.
        assert.deepEqual(await imageItems(), [
          '抠图',
          '调整抠图',
          '加入对话',
          '下载 PNG',
          '下载 JPG',
        ]);
        const iconOrder = await page.evaluate(() =>
          [...document.querySelectorAll('#selection-menu .selection-actions > button')].map(
            (item) => item.getAttribute('aria-label')
          )
        );
        assert.deepEqual(
          iconOrder.filter((label) =>
            ['抠图', '调整抠图', '加入对话', '下载 PNG', '下载 JPG'].includes(label)
          ),
          ['抠图', '调整抠图', '加入对话', '下载 PNG', '下载 JPG']
        );
        // One separator between each visible group, none around empty ones.
        const groups = await page.evaluate(() => {
          const out = [[]];
          for (const item of document.querySelector('#canvas-context-menu').children) {
            if (item.hidden) continue;
            if (item.matches('.canvas-menu-separator')) out.push([]);
            else if (item.matches('button')) out[out.length - 1].push(item.textContent);
          }
          return out;
        });
        assert.deepEqual(groups, [
          ['图片生成'],
          ['抠图', '调整抠图'],
          ['加入对话'],
          ['下载 PNG', '下载 JPG'],
          ['复制卡片', '删除卡片'],
        ]);
        const opened = await contextMenu.boundingBox();
        await shoot('v7-' + theme + '-image-context-menu.png', {
          x: Math.max(0, opened.x - 24),
          y: Math.max(0, opened.y - 24),
          width: opened.width + 48,
          height: opened.height + 48,
        });
        await page.keyboard.press('Escape');
        await blank();
      }
      await card(image.id).click({ button: 'right', position: { x: 100, y: 120 } });
      await contextMenu.getByRole('button', { name: '加入对话' }).click();
      assert.deepEqual(await page.evaluate(() => window.__canvasChat.at(-1)), [
        { nodeId: image.id, assetPath: image.assetPath },
      ]);
      await card(image.id).click({ button: 'right', position: { x: 100, y: 120 } });
      await contextMenu.getByRole('button', { name: '下载 PNG', exact: true }).click();
      await page.waitForFunction(() => window.__canvasDelivered);
      assert.match(await page.evaluate(() => window.__canvasDelivered.filename), /\.png$/);
      await page.evaluate(() => (window.__canvasDelivered = undefined));
      await card(image.id).click({ button: 'right', position: { x: 100, y: 120 } });
      await contextMenu.getByRole('button', { name: '下载 JPG' }).click();
      await page.waitForFunction(() => window.__canvasDelivered);
      assert.match(await page.evaluate(() => window.__canvasDelivered.filename), /\.jpg$/);
      assert.equal(await page.evaluate(() => window.__canvasDelivered.type), 'image/jpeg');
      await card(slotId).click({ button: 'right', position: { x: 100, y: 100 } });
      assert.deepEqual(await imageItems(), [], '空槽不显示图片动作');
      await page.mouse.click(1300, 840, { button: 'right' });
      assert.deepEqual(await imageItems(), [], '空白处菜单不变');
      assert.equal(
        await contextMenu.locator('[data-canvas-action="add-generation"]').isVisible(),
        true
      );
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, []);
      await page.close();
      const plain = await webPage();
      const bare = await plain.importImage('无钩子');
      await plain.settle();
      await plain.blank();
      await plain.card(bare.id).click({ button: 'right', position: { x: 100, y: 120 } });
      await plain.page.locator('#canvas-context-menu').waitFor();
      assert.deepEqual(
        await plain.page.evaluate(() =>
          [...document.querySelectorAll('#canvas-context-menu [data-menu-scope=image]')]
            .filter((item) => !item.hidden)
            .map((item) => item.textContent)
        ),
        ['下载 PNG', '下载 JPG'],
        '无 addToChat / cutout 时只保留下载'
      );
      await plain.page.close();
      const local = await openCanvas({
        features: { ...webFeatures, cutout: true },
        addToChat: true,
      });
      const localPath = await local.page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
      await local.page.evaluate(
        (assetPath) =>
          window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '默认' }),
        localPath
      );
      const localId = (await local.page.evaluate(() => window.__canvasEditor.current())).nodes[0]
        .id;
      await local.page.waitForFunction(() => window.__canvasUnsaved === false);
      await local.page
        .locator('.card[data-id="' + localId + '"]')
        .click({ button: 'right', position: { x: 60, y: 80 } });
      assert.equal(
        await local.page
          .locator('#canvas-context-menu [data-menu-scope=image]:not([hidden])')
          .count(),
        0,
        '默认外观右键菜单不变'
      );
      assert.equal(
        await local.page.locator('#selection-menu .web-icon-action').count(),
        0,
        '默认外观工具条保持文字按钮'
      );
      await local.page.close();
    }
  );
  await check(
    'Web 提示：图标按钮悬停/键盘聚焦 150ms 内显示自绘提示（明暗），无原生 title',
    async () => {
      const { page, errors, editor, settle, card, importImage, blank, shoot } = await webPage({
        addToChat: true,
        features: { ...webFeatures, cutout: true },
      });
      const image = await importImage('提示', '#c96', 160, 120);
      await editor('update-nodes', { nodes: [{ id: image.id, x: 300, y: 260 }] });
      await settle();
      const tip = page.locator('.web-tooltip');
      const shown = async (text, label) => {
        const started = Date.now();
        await page.waitForFunction(
          (text) => {
            const item = document.querySelector('.web-tooltip');
            return (
              item && !item.hidden && item.dataset.open === 'true' && item.textContent === text
            );
          },
          text,
          { timeout: 1000 }
        );
        assert.ok(Date.now() - started < 450, label + '：提示应快速出现');
      };
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await blank();
        await card(image.id).click({ position: { x: 100, y: 120 } });
        const cutout = page
          .locator('#selection-menu')
          .getByRole('button', { name: '抠图', exact: true });
        await cutout.hover();
        await shown('抠图', '悬停抠图');
        const [button, bubble] = [await cutout.boundingBox(), await tip.boundingBox()];
        assert.ok(bubble.y + bubble.height <= button.y, '提示位于按钮上方');
        assert.ok(
          Math.abs(bubble.x + bubble.width / 2 - (button.x + button.width / 2)) < 2,
          '水平居中'
        );
        assert.equal(await cutout.getAttribute('title'), null);
        assert.equal(await cutout.getAttribute('aria-label'), '抠图');
        const colors = await tip.evaluate((item) => {
          const style = getComputedStyle(item);
          return [style.backgroundColor, style.color, style.fontSize];
        });
        assert.equal(colors[2], '12px');
        assert.equal(colors[1], theme === 'dark' ? 'rgb(255, 250, 240)' : 'rgb(255, 255, 255)');
        await page.evaluate(
          () => (document.querySelector('.web-tooltip').style.transition = 'none')
        );
        await shoot('v8-' + theme + '-tooltip.png', {
          x: button.x - 120,
          y: button.y - 60,
          width: 280,
          height: 110,
        });
        await page.mouse.move(1300, 860);
        await page.waitForFunction(() => document.querySelector('.web-tooltip').hidden);
        // Dock buttons share the helper: their native title is migrated on first hover.
        const undo = page.locator('.workspace-actions > button').first();
        // The tooltip shows the title (which carries the shortcut), not just the aria-label.
        const name = await undo.evaluate((item) => item.title || item.dataset.webTip);
        await undo.hover();
        await shown(name, '工具条按钮');
        assert.equal(await undo.getAttribute('title'), null);
        await page.mouse.move(1300, 860);
        await page.waitForFunction(() => document.querySelector('.web-tooltip').hidden);
        // Keyboard focus shows it as well; a pointer press hides it.
        const chat = page.locator('#selection-menu').getByRole('button', { name: '加入对话' });
        // A bare modifier is not navigation; Tab switches the page into keyboard mode.
        await page.keyboard.press('Tab');
        await chat.focus();
        await shown('加入对话', '键盘聚焦');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('.web-tooltip').hidden);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check(
    'Web 调整抠图：工具条箭头与右键只打开去背景参数框，「保存」后像一键抠图新建右侧卡片并选中',
    async () => {
      const { page, errors, editor, settle, current, nodeOf, card, blank, shoot } = await webPage({
        features: { ...webFeatures, cutout: true },
      });
      const assetPath = await page.evaluate(() => window.__canvasAddPainted('subject', 80, 60));
      await page.evaluate(
        (assetPath) =>
          window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '精修源' }),
        assetPath
      );
      const sourceId = (await current()).nodes.find((item) => item.assetPath === assetPath).id;
      await editor('update-nodes', { nodes: [{ id: sourceId, x: 300, y: 260 }] });
      await settle();
      const menu = page.locator('#selection-menu');
      const adjust = menu.getByRole('button', { name: '调整抠图' });
      const background = page.locator('dialog[aria-label="自动去背景"]');
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await blank();
        await card(sourceId).click({ position: { x: 100, y: 120 } });
        await adjust.hover();
        await page.waitForFunction(() => {
          const item = document.querySelector('.web-tooltip');
          return item.dataset.open === 'true' && item.textContent === '调整抠图';
        });
        // Clipped captures can re-run the fade, so freeze the settled bubble for the screenshot.
        await page.evaluate(
          () => (document.querySelector('.web-tooltip').style.transition = 'none')
        );
        const bar = await menu.boundingBox();
        await shoot('v8-' + theme + '-cutout-adjust.png', {
          x: bar.x - 60,
          y: bar.y - 50,
          width: bar.width + 120,
          height: 110,
        });
      }
      // Right-click entry opens the same editor; cancelling leaves the canvas unchanged.
      await page.keyboard.press('Escape');
      await card(sourceId).click({ button: 'right', position: { x: 100, y: 120 } });
      await page.locator('#canvas-context-menu').getByRole('button', { name: '调整抠图' }).click();
      await background.waitFor();
      for (const label of ['颜色容差', '边缘过渡', '去溢色强度', '手动背景色 HEX', '背景处理范围'])
        assert.equal(await background.getByLabel(label).count(), 1, label);
      await background.getByRole('button', { name: '从原图取色' }).waitFor();
      // Only the 去背景 dialog opens, with 取消 + one primary 保存 and no frame/local-PNG steps.
      assert.equal(await page.locator('dialog[open]').count(), 1, '只打开去背景对话框');
      assert.equal(await page.locator('dialog[aria-label="本地图片编辑"]').count(), 0);
      assert.deepEqual(
        await background
          .locator('footer button')
          .evaluateAll((items) => items.map((item) => [item.textContent, item.className])),
        [
          ['取消', ''],
          ['保存', 'primary'],
        ]
      );
      await background.getByRole('button', { name: '取消' }).click();
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
      assert.equal((await current()).nodes.length, 1, '取消不创建卡片');
      await blank();
      await card(sourceId).click({ position: { x: 100, y: 120 } });
      await adjust.click();
      await background.waitFor();
      const saveButton = background.getByRole('button', { name: '保存' });
      await page.waitForFunction(
        () =>
          !document.querySelector('dialog[aria-label="自动去背景"] footer button.primary').disabled
      );
      await background.getByLabel('颜色容差').fill('60');
      await page.waitForFunction(
        () =>
          !document.querySelector('dialog[aria-label="自动去背景"] footer button.primary').disabled
      );
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await page.waitForTimeout(150);
        await shoot('v9-' + theme + '-cutout-adjust-dialog.png');
      }
      await saveButton.click();
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
      assert.equal(await page.locator('#error').textContent(), '');
      const edge = (await current()).edges.find(
        (item) => item.from === sourceId && item.kind === 'image-variant'
      );
      assert.ok(edge, '结果卡连到原图');
      const [result, source] = [await nodeOf(edge.to), await nodeOf(sourceId)];
      assert.equal(result.title, '精修源 · 抠图');
      assert.ok(result.x >= source.x + source.width, '结果卡放在原图右侧');
      assert.equal(
        await card(edge.to).evaluate((item) => item.classList.contains('selected')),
        true,
        '选中结果卡'
      );
      const src = await card(edge.to).locator('img').getAttribute('src');
      assert.ok(src && src !== 'data:,', '结果卡立即有图片');
      const alpha = await card(edge.to)
        .locator('img')
        .evaluate(async (image) => {
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          const at = (x, y) => context.getImageData(x, y, 1, 1).data[3];
          return [at(1, 1), at(canvas.width / 2, canvas.height / 2)];
        });
      assert.deepEqual(alpha, [0, 255], '保存结果已去背景，主体保留');
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  // Returns the board-relative midpoint of a rendered wire in page coordinates.
  const wireMiddle = (page, from, to) =>
    page.locator('#wires path[data-from="' + from + '"][data-to="' + to + '"]').evaluate((path) => {
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      const rect = document.getElementById('board').getBoundingClientRect();
      return { x: rect.left + point.x, y: rect.top + point.y };
    });
  await check(
    'Web 删除连线：结果卡保留图片且不进入待处理，悬停流光 5px、剪刀 14px 居中',
    async () => {
      const { page, errors, editor, settle, current, nodeOf, card, blank, shoot } = await webPage({
        features: { ...webFeatures, cutout: true },
      });
      const assetPath = await page.evaluate(() => window.__canvasAddPainted('subject', 80, 60));
      await page.evaluate(
        (assetPath) =>
          window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '连线源' }),
        assetPath
      );
      const sourceId = (await current()).nodes[0].id;
      await editor('update-nodes', { nodes: [{ id: sourceId, x: 200, y: 260 }] });
      await settle();
      await blank();
      await card(sourceId).click({ position: { x: 100, y: 120 } });
      await page
        .locator('#selection-menu')
        .getByRole('button', { name: '抠图', exact: true })
        .click();
      const resultId = await page
        .waitForFunction((id) => {
          const edge = window.__canvasEditor
            .current()
            .edges.find((item) => item.from === id && item.kind === 'image-variant');
          return edge && edge.to;
        }, sourceId)
        .then((handle) => handle.jsonValue());
      await editor('update-nodes', { nodes: [{ id: resultId, x: 620, y: 420 }] });
      await settle();
      const result = await nodeOf(resultId);
      assert.ok(result.assetPath && result.sourceSnapshots?.length, '本地结果带来源快照');
      assert.equal(result.generation, undefined);
      await blank();
      const middle = await wireMiddle(page, sourceId, resultId);
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await page.mouse.move(middle.x + 40, middle.y + 40);
        await page.mouse.move(middle.x, middle.y);
        await page.locator('.wire-controls .wire-glow').first().waitFor({ state: 'attached' });
        await page.locator('.wire-controls .wire-scissors').waitFor({ timeout: 3000 });
        await page.waitForTimeout(150);
        await shoot('v9-' + theme + '-wire-hover.png', {
          x: middle.x - 260,
          y: middle.y - 160,
          width: 520,
          height: 320,
        });
        await shoot('v9-' + theme + '-wire-delete-button.png', {
          x: middle.x - 40,
          y: middle.y - 40,
          width: 80,
          height: 80,
        });
      }
      const glow = await page.$$eval('.wire-controls .wire-glow', (items) =>
        items.map((item) => [getComputedStyle(item).strokeWidth, getComputedStyle(item).stroke])
      );
      assert.ok(glow.length > 0);
      for (const [width] of glow) assert.equal(width, '5px', '流光宽 5px');
      const accent = await page.evaluate(
        () => getComputedStyle(document.querySelector('.wire-controls .wire-active')).stroke
      );
      for (const [, stroke] of glow) assert.equal(stroke, accent, '流光沿用强调色');
      const cut = await page.locator('.wire-controls .wire-scissors').evaluate((button) => {
        const box = button.getBoundingClientRect();
        const icon = button.querySelector('svg').getBoundingClientRect();
        return {
          size: [box.width, box.height],
          icon: [icon.width, icon.height],
          offset: [
            icon.left + icon.width / 2 - (box.left + box.width / 2),
            icon.top + icon.height / 2 - (box.top + box.height / 2),
          ],
        };
      });
      assert.deepEqual(cut.size, [28, 28], '按钮 28px');
      assert.deepEqual(cut.icon, [14, 14], '剪刀 14px');
      for (const value of cut.offset) assert.ok(Math.abs(value) <= 0.5, '剪刀居中');
      await page.locator('.wire-controls .wire-scissors').click();
      await page.waitForFunction(
        (id) => !window.__canvasEditor.current().edges.some((edge) => edge.to === id),
        resultId
      );
      await settle();
      const after = await nodeOf(resultId);
      assert.equal(after.assetPath, result.assetPath, '图片保持不变');
      assert.equal(after.templatePending, undefined);
      assert.equal(await card(resultId).locator('.card-state-overlay').count(), 0, '无待处理遮罩');
      assert.equal(
        await card(resultId).evaluate((item) => item.classList.contains('template-pending')),
        false
      );
      assert.equal(await page.getByRole('button', { name: '处理并继续' }).count(), 0);
      await page.mouse.move(1300, 840);
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await page.waitForTimeout(100);
        const box = await card(resultId).boundingBox();
        await shoot('v9-' + theme + '-result-after-wire-delete.png', {
          x: box.x - 300,
          y: box.y - 40,
          width: box.width + 340,
          height: box.height + 80,
        });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check('Web 删除连线：空图片槽保持为空，仅移除下一次生成的参考', async () => {
    const { page, errors, settle, current, nodeOf, card, importImage, editor, blank } =
      await webPage();
    const source = await importImage('参考源', '#c33', 40, 40);
    await editor('update-nodes', { nodes: [{ id: source.id, x: 200, y: 260 }] });
    await settle();
    await blank();
    await card(source.id).click({ position: { x: 100, y: 120 } });
    await card(source.id).locator('.canvas-port-output').click();
    const slotId = await page
      .waitForFunction((id) => {
        const edge = window.__canvasEditor.current().edges.find((item) => item.from === id);
        return edge && edge.to;
      }, source.id)
      .then((handle) => handle.jsonValue());
    await settle();
    await blank();
    const middle = await wireMiddle(page, source.id, slotId);
    await page.mouse.click(middle.x, middle.y);
    await page.locator('.wire-controls .wire-scissors').click();
    await page.waitForFunction(
      (id) => !window.__canvasEditor.current().edges.some((edge) => edge.to === id),
      slotId
    );
    await settle();
    const slot = await nodeOf(slotId);
    assert.equal(slot.assetPath, undefined, '槽保持为空');
    assert.equal(slot.templatePending, undefined);
    assert.equal(slot.generationDraft?.sourceImageId, undefined, '草稿不再引用来源');
    assert.equal(await card(slotId).locator('.card-state-overlay').count(), 0);
    // The next generation sends no reference image.
    await card(slotId).click({ position: { x: 100, y: 120 } });
    const panel = page.locator('#selection-toolbar .generation-panel');
    await panel.locator('textarea.generation-prompt').fill('无参考生成');
    await panel.locator('.generation-action-primary').click();
    await page.waitForFunction(() => window.__canvasCalls.generate.length === 1);
    const call = await page.evaluate(() => window.__canvasCalls.generate[0]);
    assert.equal(call.targetNodeId, slotId);
    assert.ok(!(call.sourceImageIds || []).includes(source.id), '不再携带已删除的参考');
    assert.notEqual(call.sourceImageId, source.id);
    assert.equal((await current()).nodes.length, 2);
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 加载：来源已断开的本地编辑结果正常显示，无待处理遮罩', async () => {
    const src = 'assets/image/canvas/seed-source.png';
    const edited = 'assets/image/canvas/seed-edited.png';
    const base = { type: 'image', y: 200, width: 240, height: 240 };
    const { page, errors, card } = await webPage({
      seedMedia: { [src]: '#c33', [edited]: '#3a7' },
      seedDocuments: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: '旧画布',
          revision: 3,
          viewport: { x: 0, y: 0, scale: 1 },
          nodes: [
            { ...base, id: 'seed-src', title: '图片变体 · 已保存结果', x: 120, assetPath: src },
            {
              ...base,
              id: 'seed-edit',
              title: '图片变体 · 已保存结果 · 本地编辑',
              x: 520,
              assetPath: edited,
              sourceSnapshot: { nodeId: 'seed-src', version: 'image|' + src + '|manual-asset' },
              sourceSnapshots: [{ nodeId: 'seed-src', version: 'image|' + src + '|manual-asset' }],
            },
          ],
          edges: [],
        },
      ],
    });
    await card('seed-edit').waitFor();
    assert.equal(await card('seed-edit').locator('.card-state-overlay').count(), 0);
    assert.equal(
      await card('seed-edit').evaluate((item) => item.classList.contains('template-pending')),
      false
    );
    assert.notEqual(await card('seed-edit').locator('img').getAttribute('src'), 'data:,');
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check(
    'Web 下载：关闭 resourceExport 时无「导出资源」，下载经 host.deliverExport 交 PNG',
    async () => {
      const { page, errors, editor, settle, card, importImage, blank } = await webPage({
        features: { ...webFeatures, cutout: true },
      });
      const image = await importImage('下载图', '#c96', 160, 120);
      await editor('update-nodes', { nodes: [{ id: image.id, x: 300, y: 260 }] });
      await settle();
      const contextMenu = page.locator('#canvas-context-menu');
      await blank();
      await card(image.id).click({ button: 'right', position: { x: 100, y: 120 } });
      await contextMenu.waitFor();
      assert.equal(await contextMenu.locator('[data-resource-export]').count(), 0, '无导出资源组');
      assert.equal(await contextMenu.getByText('导出资源').count(), 0);
      const delivered = async (count) => {
        await page.waitForFunction(
          (count) => window.__canvasHostDeliveries === count && window.__canvasDelivered,
          count
        );
        const result = await page.evaluate(() => window.__canvasDelivered);
        assert.match(result.filename, /\.png$/);
        assert.equal(result.mime, 'image/png');
        assert.equal(result.type, 'image/png');
        assert.ok(result.size > 0);
      };
      await contextMenu.getByRole('button', { name: '下载 PNG', exact: true }).click();
      await delivered(1);
      await page.evaluate(() => (window.__canvasDelivered = undefined));
      await blank();
      await card(image.id).click({ position: { x: 100, y: 120 } });
      await page.locator('#selection-menu').getByRole('button', { name: '下载 PNG' }).click();
      await delivered(2);
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check('Web 下载：工具栏图标与右键「下载」各一次点击触发浏览器下载 PNG', async () => {
    const { page, errors, settle, editor, card, importImage, blank } = await webPage({
      features: { ...webFeatures, cutout: true },
      anchorDownload: true,
    });
    const image = await importImage('下载图', '#c96', 160, 120);
    await editor('update-nodes', { nodes: [{ id: image.id, x: 300, y: 260 }] });
    await settle();
    await blank();
    await card(image.id).click({ position: { x: 100, y: 120 } });
    const icon = page.locator('#selection-menu').getByRole('button', { name: '下载 PNG' });
    await icon.waitFor();
    let download = page.waitForEvent('download', { timeout: 5000 });
    await icon.click();
    assert.match((await download).suggestedFilename(), /\.png$/);
    await blank();
    await card(image.id).click({ button: 'right', position: { x: 100, y: 120 } });
    download = page.waitForEvent('download', { timeout: 5000 });
    await page
      .locator('#canvas-context-menu')
      .getByRole('button', { name: '下载 PNG', exact: true })
      .click();
    assert.match((await download).suggestedFilename(), /\.png$/);
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 外观：画布页签为圆角胶囊，关闭/重命名按悬停与激活显示（明暗）', async () => {
    const { page, errors, shoot } = await webPage();
    await page.locator('#workspace-new').click();
    await page.waitForFunction(() => document.querySelectorAll('.workspace-tab').length === 2);
    const tabs = page.locator('.workspace-tab');
    const active = page.locator('.workspace-tab[data-active="true"]');
    const inactive = page.locator('.workspace-tab[data-active="false"]');
    const closeOf = (tab) => tab.locator('button:last-child:not([role="tab"]):not(#rename-canvas)');
    const opacity = (locator) => locator.evaluate((item) => getComputedStyle(item).opacity);
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await page.mouse.move(1300, 840);
      // Tab colours transition for 120ms after the theme flips.
      await page.waitForTimeout(200);
      const row = await page.locator('.workspace-tabs-row').boundingBox();
      assert.equal(Math.round(row.height), 40);
      for (const index of [0, 1])
        assert.equal(Math.round((await tabs.nth(index).boundingBox()).height), 30);
      const look = await page.evaluate(() => {
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const row = style('.workspace-tabs-row');
        const on = style('.workspace-tab[data-active="true"]');
        const off = style('.workspace-tab[data-active="false"]');
        const probe = document.createElement('i');
        document.body.append(probe);
        const tone = (name) => {
          probe.style.color = 'var(' + name + ')';
          return getComputedStyle(probe).color;
        };
        const tokens = [
          tone('--web-soft'),
          tone('--web-panel'),
          tone('--web-text'),
          tone('--web-muted'),
        ];
        probe.remove();
        return {
          row: row.backgroundColor,
          on: [on.backgroundColor, on.color, on.borderRadius, on.boxShadow !== 'none'],
          off: [off.backgroundColor, off.color],
          tokens,
        };
      });
      assert.equal(look.row, look.tokens[0], '页签栏用画板底色');
      assert.deepEqual(look.on, [look.tokens[1], look.tokens[2], '8px', true]);
      assert.deepEqual(look.off, ['rgba(0, 0, 0, 0)', look.tokens[3]]);
      assert.equal(await opacity(closeOf(active)), '1', '激活页签显示关闭');
      assert.equal(await opacity(closeOf(inactive)), '0', '未悬停页签隐藏关闭');
      assert.equal(await opacity(active.locator('#rename-canvas')), '0', '未悬停不显示重命名');
      for (const selector of ['#workspace-new', '.workspace-library > summary']) {
        const style = await page
          .locator(selector)
          .evaluate((item) => [
            getComputedStyle(item).backgroundColor,
            getComputedStyle(item).borderTopWidth,
            item.getBoundingClientRect().height,
          ]);
        assert.deepEqual(style, ['rgba(0, 0, 0, 0)', '0px', 28], selector + ' 为 ghost 按钮');
      }
      const placement = await page.evaluate(() => {
        const box = (item) => item.getBoundingClientRect();
        const tabs = document.querySelectorAll('.workspace-tab');
        const plus = document.getElementById('workspace-new');
        const glyph = getComputedStyle(plus, '::before');
        return {
          gap: box(plus).left - box(tabs[tabs.length - 1]).right,
          libraryRight:
            box(document.querySelector('.workspace-tabs-row')).right -
            box(document.querySelector('.workspace-library')).right,
          glyph: [glyph.width, glyph.height, getComputedStyle(plus).justifyContent],
          text: getComputedStyle(plus).fontSize,
        };
      });
      assert.ok(placement.gap >= 0 && placement.gap <= 10, '＋紧跟最后一个页签：' + placement.gap);
      assert.ok(placement.libraryRight <= 10, '全部画布靠右：' + placement.libraryRight);
      assert.deepEqual(placement.glyph, ['16px', '16px', 'center'], '＋图标居中');
      assert.equal(placement.text, '0px', '文字＋不参与排版');
      await page.waitForTimeout(150);
      await shoot('v7-' + theme + '-tab-bar.png', { x: 0, y: 0, width: 1400, height: 56 });
      await inactive.hover();
      await page.waitForTimeout(150);
      assert.equal(await opacity(closeOf(inactive)), '1', '悬停页签显示关闭');
      await active.hover();
      await page.waitForTimeout(150);
      assert.equal(await opacity(active.locator('#rename-canvas')), '1', '悬停激活页签显示重命名');
      await shoot('v7-' + theme + '-tab-bar-hover.png', { x: 0, y: 0, width: 1400, height: 56 });
    }
    await page.mouse.move(1300, 840);
    await page.locator('.workspace-tab[data-active="true"] button[role="tab"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'rename-canvas');
    await page.waitForTimeout(150);
    assert.equal(await opacity(active.locator('#rename-canvas')), '1', '键盘聚焦显示重命名');
    assert.notEqual(
      await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle),
      'none',
      '保留焦点环'
    );
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 截图 v6：多选无整体框、抠图结果、工具条顶部握把（明暗）', async () => {
    const { page, errors, editor, settle, current, card, importImage, blank, shoot } =
      await webPage({
        features: { ...webFeatures, cutout: true },
      });
    const grip = page.locator('.workspace-toolbar-grip svg circle');
    assert.equal(await grip.count(), 6, '握把为 2×3 点');
    const first = await importImage('角色立绘', '#c96', 160, 120);
    const second = await importImage('道具', '#69c', 120, 120);
    const sourcePath = await page.evaluate(() => window.__canvasAddPainted('subject', 160, 120));
    await page.evaluate(
      (assetPath) =>
        window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '抠图源' }),
      sourcePath
    );
    const sourceId = (await current()).nodes.find((node) => node.assetPath === sourcePath).id;
    await editor('update-nodes', {
      nodes: [
        { id: first.id, x: 220, y: 160 },
        { id: second.id, x: 640, y: 160 },
        { id: sourceId, x: 220, y: 480 },
      ],
    });
    await settle();
    await blank();
    await card(sourceId).click({ position: { x: 100, y: 120 } });
    await page
      .locator('#selection-menu')
      .getByRole('button', { name: '抠图', exact: true })
      .click();
    await page.waitForFunction(
      (id) => window.__canvasEditor.current().edges.some((edge) => edge.from === id),
      sourceId
    );
    await settle();
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await blank();
      await card(first.id).click({ position: { x: 100, y: 120 } });
      await card(second.id).click({ position: { x: 100, y: 120 }, modifiers: ['Shift'] });
      assert.equal(await page.locator('.web-selection-bounds').count(), 0);
      await shoot('v6-' + theme + '-multi-select.png');
      await blank();
      await shoot('v6-' + theme + '-cutout-result.png');
      const dock = await page.locator('.workspace-toolbar').boundingBox();
      await shoot('v6-' + theme + '-dock-top.png', {
        x: Math.max(0, dock.x - 12),
        y: Math.max(0, dock.y - 12),
        width: dock.width + 24,
        height: 120,
      });
    }
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check('Web 外观：空白处右键菜单新建槽/上传/素材库，素材库按钩子显示', async () => {
    const { page, errors, current, settle } = await webPage({
      pickProjectImages: true,
      features: { ...webFeatures, video: true },
      videoStore: true,
    });
    await settle();
    const menu = page.locator('#canvas-context-menu');
    const worldAt = (x, y) =>
      page.evaluate(
        ({ x, y }) => {
          const view = window.__canvasEditor.current().viewport;
          const rect = document.getElementById('board').getBoundingClientRect();
          return {
            x: (x - rect.left - view.x) / view.scale,
            y: (y - rect.top - view.y) / view.scale,
          };
        },
        { x, y }
      );
    await page.mouse.click(700, 360, { button: 'right' });
    await menu.waitFor();
    const labels = await menu
      .locator('button:not([hidden])')
      .evaluateAll((items) => items.map((item) => item.textContent));
    assert.deepEqual(labels, [
      '新建图片卡片',
      '新建视频卡片',
      '上传图片',
      '上传视频',
      '从素材库添加',
    ]);
    // One separator between 新建 and the upload / library entries.
    assert.deepEqual(
      await menu.evaluate((root) =>
        Array.from(root.children)
          .filter((item) => !item.hidden)
          .map((item) =>
            item.classList.contains('canvas-menu-separator') ? '|' : item.textContent
          )
          .slice(0, 6)
      ),
      ['新建图片卡片', '新建视频卡片', '|', '上传图片', '上传视频', '从素材库添加']
    );
    const point = await worldAt(700, 360);
    await menu.getByRole('button', { name: '新建图片卡片' }).click();
    const slot = (await current()).nodes.at(-1);
    assert.equal(slot.assetPath, undefined);
    assert.ok(Math.abs(slot.x - point.x) < 1 && Math.abs(slot.y - point.y) < 1, '槽应在右键处');
    await settle();
    const picked = await page.evaluate(() => window.__canvasAddMedia('#963', 30, 30));
    await page.evaluate((path) => (window.__canvasPick = [{ path, name: '素材库图.png' }]), picked);
    // The new slot opens its composer below it; deselect so the next right-click hits blank canvas.
    await page.mouse.click(1300, 840);
    await page.mouse.click(1000, 600, { button: 'right' });
    const pickPoint = await worldAt(1000, 600);
    await menu.getByRole('button', { name: '从素材库添加' }).click();
    await page.waitForFunction(
      (path) => window.__canvasEditor.current().nodes.some((node) => node.assetPath === path),
      picked
    );
    const added = (await current()).nodes.find((node) => node.assetPath === picked);
    assert.equal(added.title, '素材库图');
    // Project videos come through the same picker as video cards (kind or assets/video/ path).
    await settle();
    const pickedVideo = await page.evaluate(() => window.__canvasAddVideo());
    await page.evaluate(
      (path) => (window.__canvasPick = [{ path, name: '素材库视频.webm' }]),
      pickedVideo
    );
    await page.mouse.click(1300, 840);
    await page.mouse.click(400, 300, { button: 'right' });
    await menu.getByRole('button', { name: '从素材库添加' }).click();
    await page.waitForFunction(
      (path) => window.__canvasEditor.current().nodes.some((node) => node.assetPath === path),
      pickedVideo
    );
    const addedVideo = (await current()).nodes.find((node) => node.assetPath === pickedVideo);
    assert.equal(addedVideo.type, 'video-source', '素材库视频成为视频卡');
    assert.equal(addedVideo.title, '素材库视频');
    assert.ok(Math.abs(added.x - pickPoint.x) < 1 && Math.abs(added.y - pickPoint.y) < 1);
    // Paths are validated by the host import; unknown paths add nothing.
    await settle();
    const count = (await current()).nodes.length;
    await page.evaluate(
      () => (window.__canvasPick = [{ path: 'assets/image/未登记.png', name: 'x' }])
    );
    await page.mouse.click(1000, 200, { button: 'right' });
    await menu.getByRole('button', { name: '从素材库添加' }).click();
    await page.waitForTimeout(150);
    assert.equal((await current()).nodes.length, count);
    await page.mouse.click(300, 700, { button: 'right' });
    const uploadPoint = await worldAt(300, 700);
    const chooser = page.waitForEvent('filechooser');
    await menu.getByRole('button', { name: '上传图片' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'right-click.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      ),
    });
    await page.waitForFunction(() =>
      window.__canvasEditor.current().nodes.some((node) => node.title === 'right-click')
    );
    const uploaded = (await current()).nodes.find((node) => node.title === 'right-click');
    assert.ok(uploaded.assetPath);
    assert.ok(Math.abs(uploaded.x - uploadPoint.x) < 1 && Math.abs(uploaded.y - uploadPoint.y) < 1);
    assert.deepEqual(errors, []);
    await page.close();
    const plain = await webPage();
    await plain.settle();
    await plain.page.mouse.click(700, 360, { button: 'right' });
    assert.equal(await plain.page.locator('[data-canvas-action="pick-project-images"]').count(), 0);
    assert.equal(await plain.page.locator('[data-canvas-action="upload-image"]').count(), 1);
    await plain.page.close();
  });

  await check('Web 侧边＋：新槽继承模型/分辨率/比例/素材规范，不继承提示词', async () => {
    const { page, errors, editor, settle, current, card, blank } = await webPage();
    const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', { nodes: [{ id: slotId, x: 300, y: 120 }] });
    await settle();
    await blank();
    await card(slotId).click({ position: { x: 80, y: 80 } });
    const panel = page.locator('#selection-toolbar .generation-panel');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#selection-toolbar select option')].some(
        (option) => option.textContent === '宿主模型二'
      )
    );
    // Unsent pill edits: the composer keeps them in memory, not on the card yet.
    await panel.locator('textarea.generation-prompt').fill('不应继承的提示词');
    await panel.locator('select').nth(0).selectOption('host-second');
    await panel.locator('select').nth(1).selectOption('2K');
    await panel.locator('select').nth(2).selectOption('16:9');
    await panel.locator('.generation-asset-constraints').click();
    await panel.getByRole('switch').click();
    assert.equal(
      await panel.locator('.generation-asset-constraints').getAttribute('aria-pressed'),
      'false'
    );
    const expected = {
      model: 'host-second',
      resolution: '2K',
      aspectRatio: '16:9',
      assetConstraints: false,
    };
    const branch = async (fromId) => {
      const before = (await current()).nodes.length;
      await card(fromId).locator('.canvas-port-output').click();
      await page.waitForFunction(
        (count) => window.__canvasEditor.current().nodes.length === count + 1,
        before
      );
      const created = (await current()).nodes.at(-1);
      assert.deepEqual(created.generationDraft.parameters, expected);
      assert.equal(created.generationDraft.prompt, undefined, '提示词不继承');
      await panel.locator('select').nth(2).waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('#selection-toolbar select option')].some(
          (option) => option.textContent === '宿主模型二'
        )
      );
      const pills = await panel
        .locator('select')
        .evaluateAll((items) => items.map((item) => item.value));
      assert.deepEqual(pills, ['host-second', '2K', '16:9'], '新槽面板显示同样的选项');
      assert.equal(
        await panel.locator('.generation-asset-constraints').getAttribute('aria-pressed'),
        'false'
      );
      assert.equal(await panel.locator('textarea.generation-prompt').inputValue(), '');
      return created.id;
    };
    const second = await branch(slotId);
    // The second hop reads what the first slot stored, not composer memory.
    await settle();
    const third = await branch(second);
    assert.ok((await current()).edges.some((edge) => edge.from === second && edge.to === third));
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 标注框：四角显示圆点，拖角可斜向同时改宽高，左上角固定右下边', async () => {
    const { page, errors, settle, current, card, blank } = await webPage();
    await settle();
    await blank();
    await page.locator('#mark-ellipse').click();
    await page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
    const node = async () => (await current()).nodes.filter((item) => item.type === 'mark').at(-1);
    const start = await node();
    const frame = card(start.id);
    assert.equal(await frame.locator('.mark-corner').count(), 4);
    // Every swatch, the white one included, is a round chip with a visible ring on the menu.
    const swatches = await page
      .locator('#selection-menu .mark-color')
      .evaluateAll((items) =>
        items.map((item) => [
          getComputedStyle(item).borderRadius,
          getComputedStyle(item).boxShadow,
          item.getBoundingClientRect().width,
        ])
      );
    assert.equal(swatches.length, 5);
    for (const [radius, shadow, width] of swatches) {
      assert.equal(radius, '50%');
      assert.notEqual(shadow, 'none', '色块有描边');
      assert.ok(Math.abs(width - 22) < 0.5);
    }
    if (process.env.CANVAS_SCREENSHOT_DIR) {
      const menuBox = await page.locator('#selection-menu').boundingBox();
      await page.screenshot({
        path: path.join(process.env.CANVAS_SCREENSHOT_DIR, 'v14-mark-colors.png'),
        clip: {
          x: menuBox.x - 10,
          y: menuBox.y - 10,
          width: menuBox.width + 20,
          height: menuBox.height + 20,
        },
      });
    }
    assert.equal(
      await frame
        .locator('.mark-corner[data-corner="se"]')
        .evaluate((item) => getComputedStyle(item, '::before').content),
      '""',
      '选中时角上有圆点'
    );
    assert.equal(await frame.locator('.resize-handle').isVisible(), false, '旧右下手柄隐藏');
    const scale = (await current()).viewport.scale;
    const drag = async (corner, dx, dy) => {
      const box = await frame.locator('.mark-corner[data-corner="' + corner + '"]').boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 6 });
      await page.mouse.up();
    };
    await drag('se', 60, 40);
    const grown = await node();
    assert.ok(Math.abs(grown.width - start.width - 60 / scale) < 3, '右下角加宽：' + grown.width);
    assert.ok(
      Math.abs(grown.height - start.height - 40 / scale) < 3,
      '右下角加高：' + grown.height
    );
    assert.deepEqual([grown.x, grown.y], [start.x, start.y], '右下角不动左上');
    await drag('nw', -30, -20);
    const pulled = await node();
    assert.ok(
      Math.abs(pulled.x - (grown.x - 30 / scale)) < 3 &&
        Math.abs(pulled.y - (grown.y - 20 / scale)) < 3,
      '左上角移动'
    );
    assert.ok(
      Math.abs(pulled.x + pulled.width - (grown.x + grown.width)) < 2 &&
        Math.abs(pulled.y + pulled.height - (grown.y + grown.height)) < 2,
      '左上角拖动固定右下边'
    );
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 标注：框选/箭头可经工具条图标、右键、Delete 删除，均可撤销', async () => {
    const { page, errors, editor, settle, current, card, blank } = await webPage();
    await settle();
    const menu = page.locator('#selection-menu');
    const marks = async () => (await current()).nodes.filter((node) => node.type === 'mark');
    const place = async (id) => {
      await blank();
      await page.locator('#' + id).click();
      await page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
      return (await marks()).at(-1).id;
    };
    const undo = async (id) => {
      await settle();
      await editor('undo', {});
      assert.ok(
        (await marks()).some((node) => node.id === id),
        '撤销后标注恢复'
      );
    };
    for (const shape of ['mark-ellipse', 'mark-arrow']) {
      const id = await place(shape);
      const remove = menu.getByRole('button', { name: '删除', exact: true });
      assert.equal(await remove.count(), 1, shape + ' 工具条有删除');
      await remove.hover();
      await page.locator('.web-tooltip[data-open="true"]').waitFor();
      assert.equal(await page.locator('.web-tooltip').textContent(), '删除');
      await remove.click();
      assert.ok(!(await marks()).some((node) => node.id === id), shape + ' 工具条删除');
      await undo(id);

      await blank();
      const box = await card(id).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      const context = page.locator('#canvas-context-menu');
      await context.waitFor();
      const labels = await context
        .locator('button:not([hidden])')
        .evaluateAll((items) => items.map((item) => item.textContent));
      assert.ok(labels.includes('删除卡片'), shape + ' 右键有删除：' + labels.join('/'));
      await context.getByRole('button', { name: '删除卡片' }).click();
      assert.ok(!(await marks()).some((node) => node.id === id), shape + ' 右键删除');
      await undo(id);

      await blank();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      assert.equal(await menu.getByRole('button', { name: '删除', exact: true }).count(), 1);
      await page.keyboard.press('Delete');
      assert.ok(!(await marks()).some((node) => node.id === id), shape + ' Delete 删除');
      await undo(id);
    }
    assert.deepEqual(errors, []);
    await page.close();
    // Default appearance keeps its colour-only mark menu.
    const plain = await openCanvas({});
    await plain.page.locator('#mark-ellipse').click();
    await plain.page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
    assert.equal(
      await plain.page.locator('#selection-menu').getByRole('button', { name: '删除' }).count(),
      0
    );
    assert.deepEqual(plain.errors, []);
    await plain.page.close();
  });
  await check('Web 外观：图片积分角标为胶囊（明暗）', async () => {
    const { page, errors, editor, settle, card, blank } = await webPage();
    const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', { nodes: [{ id: slotId, x: 300, y: 120 }] });
    await settle();
    await blank();
    await card(slotId).click({ position: { x: 80, y: 80 } });
    const panel = page.locator('#selection-toolbar .generation-panel');
    await panel.locator('textarea.generation-prompt').fill('积分角标');
    await panel.locator('.generation-action-primary').click();
    const badge = card(slotId).locator('.generation-credits');
    await badge.waitFor();
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      const look = await badge.evaluate((item) => {
        const style = getComputedStyle(item);
        return [
          style.borderTopLeftRadius,
          style.paddingLeft,
          style.paddingRight,
          item.getBoundingClientRect().height,
        ];
      });
      assert.deepEqual(look, ['999px', '8px', '8px', 20], theme);
      const colors = await badge.evaluate((item) => {
        const style = getComputedStyle(item);
        return [style.backgroundColor, style.color];
      });
      assert.notEqual(colors[0], colors[1], theme + ' 文字与底色可区分');
    }
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 外观：适配画布避开左侧工具条', async () => {
    const { page, errors, editor, settle } = await webPage();
    const ids = [];
    for (let index = 0; index < 4; index++)
      ids.push((await editor('add-node', { type: 'image' })).selectedIds[0]);
    await editor('update-nodes', {
      nodes: [
        { id: ids[0], x: -400, y: -200 },
        { id: ids[1], x: 1600, y: -200 },
        { id: ids[2], x: -400, y: 900 },
        { id: ids[3], x: 1600, y: 900 },
      ],
    });
    await settle();
    await page.locator('#fit-canvas').click();
    const dock = await page.locator('.workspace-toolbar').boundingBox();
    const board = await page.locator('#board').boundingBox();
    for (const id of ids) {
      const box = await page.locator('.card[data-id="' + id + '"]').boundingBox();
      assert.ok(!boxesOverlap(box, dock), '卡片不应被工具条遮挡：' + id);
      assert.ok(box.x >= dock.x + dock.width + 30, '应留出工具条外边距');
      assert.ok(box.x + box.width <= board.x + board.width + 0.5);
      assert.ok(box.y >= board.y - 0.5 && box.y + box.height <= board.y + board.height + 0.5);
    }
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check('Web 外观：工具条选择/拖拽状态与光标跟随实际模式（含空格平移）', async () => {
    const { page, errors, settle } = await webPage();
    await settle();
    const state = () =>
      page.evaluate(() => ({
        select: document.getElementById('tool-select').getAttribute('aria-pressed'),
        pan: document.getElementById('tool-pan').getAttribute('aria-pressed'),
        cursor: getComputedStyle(document.getElementById('world')).cursor,
        panBg: getComputedStyle(document.getElementById('tool-pan')).backgroundColor,
        selectBg: getComputedStyle(document.getElementById('tool-select')).backgroundColor,
      }));
    const resting = await state();
    assert.equal(resting.select, 'true');
    await page.locator('#tool-pan').click();
    const hovered = await state();
    assert.deepEqual([hovered.select, hovered.pan, hovered.cursor], ['false', 'true', 'grab']);
    // Still hovering the pressed button: it must keep the active fill, not the hover wash.
    assert.equal(hovered.panBg, resting.selectBg);
    await page.mouse.move(700, 400);
    await page.mouse.down();
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.getElementById('world')).cursor),
      'grabbing'
    );
    await page.mouse.up();
    await page.locator('#tool-select').click();
    const back = await state();
    assert.deepEqual([back.select, back.pan, back.cursor], ['true', 'false', 'auto']);
    // Focus stays on the select button; Space must pan instead of re-clicking it.
    await page.keyboard.down('Space');
    const held = await state();
    assert.deepEqual([held.select, held.pan, held.cursor], ['false', 'true', 'grab']);
    const before = await page.evaluate(() => window.__canvasEditor.current().viewport.x);
    await page.mouse.move(700, 400);
    await page.mouse.down();
    await page.mouse.move(760, 400, { steps: 4 });
    await page.mouse.up();
    assert.ok(
      (await page.evaluate(() => window.__canvasEditor.current().viewport.x)) > before + 40,
      '空格拖动应平移'
    );
    await page.keyboard.up('Space');
    const released = await state();
    assert.deepEqual([released.select, released.pan, released.cursor], ['true', 'false', 'auto']);
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check('Web 外观：保存状态显示在保存按钮图标上，不再单列 ✓', async () => {
    const { page, errors, editor, settle } = await webPage();
    await settle();
    const save = page.locator('#save');
    assert.equal(await save.getAttribute('data-save-state'), 'saved');
    assert.match(await save.getAttribute('title'), /^已保存（(⌘S|Ctrl\+S)）$/);
    assert.equal(
      await page.locator('.workspace-toolbar #status').evaluate((item) => item.offsetWidth <= 1),
      true,
      '状态文字仅供读屏'
    );
    await page.evaluate(() => (window.__canvasSaveDelay = 400));
    // Editor commands await their own save, so use a UI edit that goes through the autosave debounce.
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, -120);
    assert.equal(await save.getAttribute('data-save-state'), 'unsaved');
    await page.waitForFunction(
      () => document.getElementById('save').dataset.saveState === 'saving'
    );
    await settle();
    assert.equal(await save.getAttribute('data-save-state'), 'saved');
    await page.evaluate(() => {
      window.__canvasSaveDelay = 0;
      window.__canvasSaveFail = true;
    });
    await editor('add-node', { type: 'note' }).catch(() => {});
    await page.waitForFunction(
      () => document.getElementById('save').dataset.saveState === 'failed'
    );
    assert.match(await save.getAttribute('title'), /保存失败/);
    await page.evaluate(() => (window.__canvasSaveFail = false));
    await save.click();
    await page.waitForFunction(() => document.getElementById('save').dataset.saveState === 'saved');
    assert.deepEqual(
      errors.filter((item) => !item.includes('模拟保存失败')),
      []
    );
    await page.close();
  });

  await check('Web 外观：各类 AI 结果卡选中都打开提示词面板', async () => {
    const { page, errors, editor, settle, current, card, importImage, blank } = await webPage();
    const source = await importImage('来源图');
    const canvasId = (await current()).id;
    await page.evaluate(
      (canvasId) =>
        window.__canvasAddAttempt({ canvasId, prompt: '页面生图', operation: 'generate' }),
      canvasId
    );
    await page.evaluate(
      ({ canvasId, sourceId }) =>
        window.__canvasAddAttempt({
          canvasId,
          prompt: '页面变体',
          operation: 'variant',
          toolName: 'edit_image',
          sourceImageId: sourceId,
          sourceImageIds: [sourceId],
        }),
      { canvasId, sourceId: source.id }
    );
    await settle();
    await editor('open', { id: canvasId });
    await page.waitForFunction(() => window.__canvasEditor.current().nodes.length >= 3);
    const fillId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('fill-slot', { id: fillId, assetPath: source.assetPath, prompt: 'Agent 回填' });
    const replaced = await importImage('待替换', '#3a3');
    await editor('replace-image', {
      id: replaced.id,
      assetPath: source.assetPath,
      prompt: 'Agent 替换',
    });
    const imported = (
      await editor('import', {
        assetPath: source.assetPath,
        prompt: 'Agent 导入',
        sourceId: source.id,
      })
    ).selectedIds[0];
    const nodes = (await current()).nodes;
    const kinds = [
      ['生图结果', nodes.find((node) => node.title === '生图结果').id, '页面生图'],
      [
        '图片变体 · 已保存结果',
        nodes.find((node) => node.title === '图片变体 · 已保存结果').id,
        '页面变体',
      ],
      ['fill-slot', fillId, 'Agent 回填'],
      ['replace-image', replaced.id, 'Agent 替换'],
      ['import', imported, 'Agent 导入'],
    ];
    await editor('update-nodes', {
      nodes: [{ id: source.id, x: 120, y: 80 }].concat(
        kinds.map(([, id], index) => ({
          id,
          x: 120 + (index % 3) * 420,
          y: 360 + Math.floor(index / 3) * 340,
        }))
      ),
    });
    await settle();
    const panel = page.locator('#selection-toolbar .generation-panel');
    for (const [kind, id, prompt] of kinds) {
      await blank();
      await card(id).click({ position: { x: 60, y: 80 } });
      await panel.waitFor();
      assert.equal(
        await panel.locator('textarea.generation-prompt').inputValue(),
        prompt,
        kind + ' 应打开预填的提示词面板'
      );
      assert.equal(await panel.locator('.generation-action-primary').count(), 1, kind);
    }
    await blank();
    await card(source.id).click({ position: { x: 60, y: 80 } });
    assert.equal(await page.locator('#selection-toolbar').isHidden(), true, '普通导入图不打开面板');
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check('Web 素材规范：弹层开关、可编辑约束只进请求、恢复默认', async () => {
    const { page, errors, editor, settle, current, nodeOf, card, blank } = await webPage();
    const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', { nodes: [{ id: slotId, x: 300, y: 120 }] });
    await settle();
    await blank();
    await card(slotId).click({ position: { x: 80, y: 80 } });
    const panel = page.locator('#selection-toolbar .generation-panel');
    const pill = panel.locator('.generation-asset-constraints');
    assert.equal(await pill.textContent(), '素材规范');
    assert.equal(await pill.getAttribute('aria-pressed'), 'true');
    await pill.click();
    const popover = panel.locator('.generation-asset-popover');
    await popover.waitFor();
    assert.equal(
      await popover.locator('.generation-asset-hint').textContent(),
      '让结果单体完整、纯色背景，方便抠图和放进游戏'
    );
    assert.equal(await popover.getByRole('switch').getAttribute('aria-checked'), 'true');
    const text = popover.getByRole('textbox', { name: '素材规范内容' });
    assert.match(await text.inputValue(), /^游戏素材约束：/);
    assert.equal(await popover.getByRole('button', { name: '恢复默认' }).isDisabled(), true);
    await text.fill('只要一个主体，白色纯色背景');
    assert.equal((await current()).settings.assetConstraintText, '只要一个主体，白色纯色背景');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#selection-toolbar select option')].some(
        (option) => option.textContent === '宿主模型二'
      )
    );
    await panel.locator('textarea.generation-prompt').fill('火焰剑士');
    await panel.locator('.generation-action-primary').click();
    await page.waitForFunction(
      (id) => window.__canvasEditor.current().nodes.find((node) => node.id === id).assetPath,
      slotId
    );
    assert.equal(
      await page.evaluate(() => window.__canvasCalls.generate.at(-1).prompt),
      '火焰剑士\n\n只要一个主体，白色纯色背景'
    );
    const result = await nodeOf(slotId);
    assert.equal(result.generation.prompt, '火焰剑士', '卡片只存用户文本');
    assert.equal(result.generation.parameters.assetConstraints, true);
    await settle();
    await blank();
    await card(slotId).click({ position: { x: 60, y: 80 } });
    assert.equal(await panel.locator('textarea.generation-prompt').inputValue(), '火焰剑士');
    await pill.click();
    await popover.getByRole('button', { name: '恢复默认' }).click();
    assert.equal((await current()).settings, undefined, '恢复默认后不保存文本');
    assert.match(await text.inputValue(), /^游戏素材约束：/);
    await popover.getByRole('switch').click();
    assert.equal(await pill.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check(
    'Web 截图：明暗两套（四角柄、多选、选中菜单、生成中、右键菜单、素材规范、工具条）',
    async () => {
      const view = await webPage({
        addToChat: true,
        pickProjectImages: true,
        features: { ...webFeatures, cutout: true },
      });
      const { page, errors, editor, settle, card, importImage, blank, shoot } = view;
      const first = await importImage('角色立绘', '#c96', 160, 120);
      const second = await importImage('道具', '#69c', 120, 120);
      const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      const busyId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      await editor('update-nodes', {
        nodes: [
          { id: first.id, x: 220, y: 200 },
          { id: second.id, x: 640, y: 200 },
          { id: slotId, x: 980, y: 200 },
          { id: busyId, x: 640, y: 520 },
        ],
      });
      await settle();
      let release;
      // Block body: returning the promise would make evaluate wait for the release.
      await page.evaluate(() => {
        window.__canvasHold = new Promise((resolve) => (window.__canvasRelease = resolve));
      });
      await blank();
      await card(busyId).click({ position: { x: 80, y: 80 } });
      const panel = page.locator('#selection-toolbar .generation-panel');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('#selection-toolbar select option')].some(
          (option) => option.textContent === '宿主模型二'
        )
      );
      await panel.locator('textarea.generation-prompt').fill('生成中的图');
      await panel.locator('.generation-action-primary').click();
      const tip = card(busyId).locator('.web-state-tip');
      await tip.waitFor();
      assert.match(await tip.innerText(), /处理中/);
      const stop = tip.getByRole('button', { name: '停止等待' });
      assert.equal(await stop.isEnabled(), true, '停止等待保持可用');
      release = () => page.evaluate(() => window.__canvasRelease());
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await blank();
        await card(slotId).click({ position: { x: 80, y: 80 } });
        await shoot('v5-' + theme + '-slot-handles.png');
        await panel.locator('.generation-asset-constraints').click();
        await panel.locator('.generation-asset-popover').waitFor();
        await shoot('v5-' + theme + '-constraint-popover.png');
        await blank();
        await card(first.id).click({ position: { x: 100, y: 120 } });
        await shoot('v5-' + theme + '-selection-toolbar.png');
        await card(second.id).click({ position: { x: 100, y: 120 }, modifiers: ['Shift'] });
        await shoot('v5-' + theme + '-multi-select.png');
        await blank();
        await shoot('v5-' + theme + '-generating.png');
        const dock = await page.locator('.workspace-toolbar').boundingBox();
        await shoot('v5-' + theme + '-dock.png', {
          x: Math.max(0, dock.x - 12),
          y: Math.max(0, dock.y - 12),
          width: dock.width + 24,
          height: dock.height + 24,
        });
        await page.mouse.click(420, 640, { button: 'right' });
        await page.locator('#canvas-context-menu').waitFor();
        await shoot('v5-' + theme + '-context-menu.png');
        await page.keyboard.press('Escape');
        await page.mouse.click(1300, 840);
      }
      await stop.click();
      await page.waitForFunction(
        (id) => !document.querySelector('.card[data-id="' + id + '"] .card-state-loading'),
        busyId
      );
      await release();
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  const videoFeatures = { ...webFeatures, video: true, sequence: true, sections: true };
  const themes = async (page, run) => {
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await run(theme);
    }
    await page.evaluate(() => delete document.documentElement.dataset.theme);
  };
  const menuLabels = (page) =>
    page
      .locator('#selection-menu button')
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
  await check('Web 视频：图标入口、胶囊参数、生成遮罩、createVideo 参数与视频历史', async () => {
    const { page, errors, editor, settle, current, card, importImage, blank, shoot } =
      await webPage({ features: videoFeatures, videoStore: true });
    const source = await importImage('角色', '#c96', 160, 120);
    await editor('update-nodes', { nodes: [{ id: source.id, x: 200, y: 160 }] });
    await settle();
    await blank();
    await card(source.id).click({ position: { x: 100, y: 120 } });
    // 图片生成 sits before 视频生成 and creates a connected image slot (same as the side +).
    const imageActions = await page
      .locator('#selection-menu .selection-actions > button')
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
    assert.deepEqual(imageActions.slice(0, 2), ['图片生成', '视频生成']);
    const before = (await current()).nodes.length;
    await page.locator('#selection-menu').getByRole('button', { name: '图片生成' }).click();
    const imageSlot = (await current()).nodes.at(-1);
    assert.equal((await current()).nodes.length, before + 1);
    assert.equal(imageSlot.type, 'image');
    assert.equal(imageSlot.assetPath, undefined);
    assert.ok(
      (await current()).edges.some((edge) => edge.from === source.id && edge.to === imageSlot.id),
      '图片生成槽连到源图'
    );
    await editor('delete-nodes', { ids: [imageSlot.id] });
    await settle();
    await blank();
    await card(source.id).click({ position: { x: 100, y: 120 } });
    const entry = page.locator('#selection-menu').getByRole('button', { name: '视频生成' });
    assert.equal(await entry.getAttribute('data-web-tip'), '视频生成');
    assert.ok(await entry.evaluate((item) => item.classList.contains('web-icon-action')));
    assert.equal(await entry.locator('svg').count(), 1);
    await entry.click();
    const panel = page.locator('#selection-toolbar .generation-panel-video');
    await panel.waitFor();
    assert.equal(await panel.locator('.generation-reference').getAttribute('data-role'), '首帧');
    const selects = panel.locator('.generation-fields select.generation-mode');
    assert.equal(await selects.count(), 5);
    for (const look of await selects.evaluateAll((items) =>
      items.map((item) => [getComputedStyle(item).appearance, getComputedStyle(item).height])
    ))
      assert.deepEqual(look, ['none', '32px'], '视频参数与生图同为 Web 胶囊');
    const labels = await selects.evaluateAll((items) =>
      items.map((item) => item.options[item.selectedIndex].textContent)
    );
    assert.deepEqual(labels, ['首帧', '模型 2.0', '720p', '4 秒', '自适应比例']);
    // Pills size to their label, so no chosen value is clipped.
    for (const clipped of await selects.evaluateAll((items) =>
      items.map((item) => item.scrollWidth > item.clientWidth)
    ))
      assert.equal(clipped, false);
    await selects.nth(2).selectOption('480p');
    await selects.nth(3).selectOption('5');
    await selects.nth(4).selectOption('16:9');
    await panel.locator('textarea.generation-prompt').fill('角色挥剑');
    await themes(page, (theme) => shoot('v10-' + theme + '-video-composer.png'));
    await page.evaluate(() => {
      window.__canvasVideoHold = new Promise((resolve) => (window.__canvasVideoRelease = resolve));
    });
    await panel.locator('.generation-action-primary').click();
    await page.waitForFunction(() => window.__canvasCalls.video?.length === 1);
    const slotId = (await current()).nodes.find((node) => node.type === 'video').id;
    const overlay = card(slotId).locator('.card-state-loading');
    await overlay.waitFor();
    assert.ok(await card(slotId).evaluate((item) => item.classList.contains('web-media')));
    assert.equal(await overlay.locator('.web-state-tip b').textContent(), '处理中');
    assert.equal(
      await card(slotId).evaluate((item) => getComputedStyle(item).overflow),
      'visible',
      '状态胶囊在卡片下方，不被裁切'
    );
    await blank();
    await themes(page, (theme) => shoot('v10-' + theme + '-video-generating.png'));
    await page.evaluate(() => window.__canvasVideoRelease());
    await page.waitForFunction(
      (id) =>
        window.__canvasEditor.current().nodes.some((node) => node.id === id && node.assetPath),
      slotId
    );
    await settle();
    const [sent] = await page.evaluate(() => window.__canvasCalls.video);
    assert.deepEqual(
      {
        prompt: sent.prompt,
        mode: sent.mode,
        model: sent.model,
        resolution: sent.resolution,
        duration: sent.duration,
        ratio: sent.ratio,
        sourceImageId: sent.sourceImageId,
        sourceImageIds: sent.sourceImageIds,
        sourceImagePath: sent.sourceImagePath,
        targetNodeId: sent.targetNodeId,
      },
      {
        prompt: '角色挥剑',
        mode: 'first_frame',
        model: '2.0',
        resolution: '480p',
        duration: 5,
        ratio: '16:9',
        sourceImageId: source.id,
        sourceImageIds: [source.id],
        sourceImagePath: source.assetPath,
        targetNodeId: slotId,
      }
    );
    const result = (await current()).nodes.find((node) => node.id === slotId);
    assert.equal(result.type, 'video-source');
    assert.equal(result.generation.parameters.resolution, '480p');
    // The generated video's image-to-video wire is a curve too, with flow on hover but no cut.
    assert.ok(
      (await current()).edges.some(
        (edge) => edge.from === source.id && edge.to === slotId && edge.kind === 'image-to-video'
      )
    );
    const resultWire = page.locator(
      '#wires path[data-from="' + source.id + '"][data-to="' + slotId + '"]'
    );
    assert.match(await resultWire.getAttribute('d'), / C /);
    assert.equal(await resultWire.getAttribute('marker-end'), null);
    await blank();
    const resultMiddle = await resultWire.evaluate((path) => {
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      const rect = document.getElementById('board').getBoundingClientRect();
      return { x: rect.left + point.x, y: rect.top + point.y };
    });
    await page.mouse.move(resultMiddle.x, resultMiddle.y);
    await page.locator('.wire-controls .wire-active').waitFor();
    await page.waitForTimeout(1200);
    assert.equal(
      await page.locator('.wire-controls .wire-scissors').count(),
      0,
      '派生连线不可剪断'
    );
    await page.mouse.move(1300, 860);
    assert.equal(await card(slotId).locator('.generation-credits').textContent(), '积分：20');
    // Video cards have no side +: there is no video→video edge, inputs are images only.
    assert.equal(await card(slotId).locator('.canvas-port').count(), 0);
    await blank();
    await card(slotId).click({ position: { x: 100, y: 60 } });
    // Like an AI image result, selecting the video result opens its composer; no 生成视频 button.
    assert.deepEqual(await menuLabels(page), ['拆序列帧']);
    await page.locator('#selection-toolbar .generation-panel-video').waitFor();
    assert.equal(
      await page.locator('#selection-toolbar textarea.generation-prompt').inputValue(),
      '角色挥剑',
      '面板带出原提示词'
    );
    assert.equal(await card(slotId).locator('.web-node-handle').count(), 4);
    // templates/resourceExport stay off: no template edit or export entries on the video result.
    await card(slotId).click({ position: { x: 100, y: 60 }, button: 'right' });
    const visible = await page
      .locator('#canvas-context-menu button:not([hidden])')
      .evaluateAll((items) => items.map((item) => item.textContent));
    assert.deepEqual(visible, ['拆序列帧', '复制卡片', '删除卡片']);
    assert.equal(await page.locator('#canvas-context-menu [data-resource-export]').count(), 0);
    await page.keyboard.press('Escape');
    await blank();
    await page.locator('.workspace-more > summary').click();
    await page.locator('.workspace-more .workspace-menu-panel #video-history').click();
    const history = page.locator('dialog.video-history[open]');
    await history.waitFor();
    await history.getByText('已取回本地').waitFor();
    assert.ok(await history.getByText(/taskId：task-/).count());
    await themes(page, (theme) => shoot('v10-' + theme + '-video-history.png'));
    await history.getByRole('button', { name: '关闭' }).click();
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check('Web 视频卡：空视频槽直接打开面板，导入视频为图标；右键/工具条入口', async () => {
    const { page, errors, current, card, blank, settle } = await webPage({
      features: videoFeatures,
      videoStore: true,
    });
    await settle();
    assert.equal(await page.locator('#add-video').textContent(), '新建视频卡片');
    assert.equal(await page.locator('#create-section').textContent(), '分组');
    await page.mouse.click(700, 360, { button: 'right' });
    const menu = page.locator('#canvas-context-menu');
    const labels = await menu
      .locator('button:not([hidden])')
      .evaluateAll((items) => items.map((item) => item.textContent));
    assert.deepEqual(labels, ['新建图片卡片', '新建视频卡片', '上传图片', '上传视频']);
    await menu.getByRole('button', { name: '新建视频卡片' }).click();
    const slot = (await current()).nodes.find((node) => node.type === 'video');
    await page.locator('#selection-toolbar .generation-panel-video').waitFor();
    assert.equal(await page.locator('#selection-menu').isHidden(), true);
    const upload = page.locator('#selection-toolbar .generation-action.web-icon-action');
    assert.equal(await upload.getAttribute('aria-label'), '导入视频');
    assert.equal(await upload.getAttribute('data-web-tip'), '导入视频');
    assert.ok(await card(slot.id).evaluate((item) => item.classList.contains('web-empty')));
    await settle();
    await blank();
    const chooser = page.waitForEvent('filechooser');
    await page.mouse.click(400, 600, { button: 'right' });
    await menu.getByRole('button', { name: '上传视频' }).click();
    const bytes = await page.evaluate(() => window.__canvasVideoBytes());
    await (
      await chooser
    ).setFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
    await page.waitForFunction(() =>
      window.__canvasEditor.current().nodes.some((node) => node.type === 'video-source')
    );
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check('Web 拆序列帧：视频结果卡打开序列帧编辑器（Web 样式）', async () => {
    const { page, errors, current, card, blank, settle, shoot } = await webPage({
      features: videoFeatures,
      videoStore: true,
    });
    await settle();
    const assetPath = await page.evaluate(() => window.__canvasAddVideo());
    await page.evaluate(
      (assetPath) =>
        window.__canvasEditor.importProjectAsset({ assetPath, kind: 'video', title: '角色动作' }),
      assetPath
    );
    await settle();
    const video = (await current()).nodes.find((node) => node.type === 'video-source');
    await blank();
    await card(video.id).click({ position: { x: 100, y: 60 } });
    await page.locator('#selection-menu').getByRole('button', { name: '拆序列帧' }).click();
    const dialog = page.locator('dialog.sequence-editor[open]');
    await dialog.waitFor();
    assert.equal(await dialog.locator('.sequence-editor-steps').count(), 1);
    assert.equal(
      await dialog
        .locator('button.primary')
        .first()
        .evaluate((item) => getComputedStyle(item).borderRadius),
      '8px'
    );
    assert.ok((await current()).nodes.some((node) => node.type === 'sequence'));
    // The WebM is a real MediaRecorder clip, so headless Chromium decodes and extracts actual frames.
    await dialog.getByRole('button', { name: '开始抽帧' }).click();
    await page
      .waitForFunction(
        () => document.querySelectorAll('dialog.sequence-editor .sequence-editor-tile').length > 1,
        undefined,
        { timeout: 20000 }
      )
      .catch(async (error) => {
        console.log(await dialog.locator('.sequence-editor-footer').textContent());
        throw error;
      });
    await page.waitForTimeout(800);
    // Editor re-renders (progress ticks, tab switches) keep the preview canvas and redraw thumbnails before paint.
    const kept = await page.evaluate(async () => {
      const dialog = document.querySelector('dialog.sequence-editor');
      const preview = dialog.querySelector('.sequence-editor-canvas');
      const tab = [...dialog.querySelectorAll('.sequence-editor-tabs button')].find(
        (item) => item.textContent === '整理与输出'
      );
      tab.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const thumb = dialog.querySelector('.sequence-editor-tile canvas');
      const data = thumb.getContext('2d').getImageData(0, 0, thumb.width, thumb.height).data;
      let drawn = false;
      for (let index = 3; index < data.length && !drawn; index += 4) drawn = data[index] > 0;
      const back = [...dialog.querySelectorAll('.sequence-editor-tabs button')].find(
        (item) => item.textContent === '帧编辑'
      );
      back.click();
      return { same: dialog.querySelector('.sequence-editor-canvas') === preview, drawn };
    });
    assert.deepEqual(kept, { same: true, drawn: true });
    await themes(page, (theme) => shoot('v10-' + theme + '-sequence-editor.png'));
    assert.deepEqual(errors, []);
    await page.close();
  });

  await check('Web 分组：多选图标创建，选中可取消分组/删除（工具条与右键），均可撤销', async () => {
    const { page, errors, editor, settle, current, card, importImage, blank, shoot } =
      await webPage({ features: videoFeatures, videoStore: true });
    const first = await importImage('角色', '#c96', 160, 120);
    const second = await importImage('道具', '#69c', 120, 120);
    await editor('update-nodes', {
      nodes: [
        { id: first.id, x: 220, y: 200 },
        { id: second.id, x: 560, y: 200 },
      ],
    });
    await settle();
    await blank();
    await card(first.id).click({ position: { x: 100, y: 120 } });
    await card(second.id).click({ position: { x: 60, y: 100 }, modifiers: ['Shift'] });
    assert.deepEqual(await menuLabels(page), ['分组']);
    const group = page.locator('#selection-menu').getByRole('button', { name: '分组' });
    assert.equal(await group.getAttribute('data-web-tip'), '分组');
    await group.click();
    const section = (await current()).nodes.find((node) => node.type === 'section');
    const members = (await current()).nodes.filter((node) => node.sectionId === section.id);
    assert.deepEqual(members.map((node) => node.id).sort(), [first.id, second.id].sort());
    assert.deepEqual(await menuLabels(page), ['取消分组', '删除分组']);
    // 分组 with an existing group and another card selected: the card joins that group.
    const third = await importImage('第三张', '#58b', 120, 90);
    await editor('update-nodes', {
      nodes: [{ id: third.id, x: section.x + section.width + 60, y: section.y + 40 }],
    });
    await settle();
    await blank();
    await card(section.id).click({ position: { x: 20, y: 20 } });
    await card(third.id).click({ position: { x: 40, y: 50 }, modifiers: ['Shift'] });
    await page.locator('#selection-menu').getByRole('button', { name: '分组' }).click();
    const joined = await current();
    assert.equal(joined.nodes.filter((node) => node.type === 'section').length, 1, '没有新建分组');
    assert.equal(joined.nodes.find((node) => node.id === third.id).sectionId, section.id);
    const grownGroup = joined.nodes.find((node) => node.id === section.id);
    const placed = joined.nodes.find((node) => node.id === third.id);
    assert.ok(grownGroup.x + grownGroup.width >= placed.x + placed.width, '分组扩大到包含新卡');
    // ⌘/Ctrl+C / ⌘/Ctrl+V duplicates a plain card.
    const beforePaste = (await current()).nodes.length;
    await blank();
    await card(third.id).click({ position: { x: 40, y: 50 } });
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    assert.equal((await current()).nodes.length, beforePaste + 1);
    await editor('undo', {});
    // Undo the join, the move and the import so the rest of this check sees two cards again.
    for (let step = 0; step < 3; step++) await editor('undo', {});
    assert.equal(
      (await current()).nodes.some((node) => node.id === third.id),
      false
    );
    await settle();
    await blank();
    await card(section.id).click({ position: { x: 20, y: 20 } });
    assert.equal(await card(section.id).locator('.web-node-handle').count(), 4);
    // Group corners have no visible dot, only an invisible resize hit area on the box corner.
    const corner = await card(section.id)
      .locator('.web-node-handle.is-nw')
      .evaluate((item) => {
        const style = getComputedStyle(item);
        return {
          at: [parseFloat(item.style.left), parseFloat(item.style.top)],
          paint: [style.backgroundColor, style.borderTopWidth],
          cursor: style.cursor,
        };
      });
    assert.deepEqual(corner, {
      at: [0, 0],
      paint: ['rgba(0, 0, 0, 0)', '0px'],
      cursor: 'nwse-resize',
    });
    assert.equal(
      await card(section.id).evaluate((item) => getComputedStyle(item).borderTopLeftRadius),
      '16px'
    );
    await settle();
    await themes(page, (theme) => shoot('v10-' + theme + '-section.png'));
    await page.locator('#selection-menu').getByRole('button', { name: '取消分组' }).click();
    let doc = await current();
    assert.equal(doc.nodes.filter((node) => node.type === 'section').length, 0);
    assert.equal(doc.nodes.filter((node) => node.sectionId).length, 0);
    assert.equal(doc.nodes.filter((node) => node.type === 'image').length, 2);
    await settle();
    await editor('undo', {});
    doc = await current();
    assert.equal(doc.nodes.filter((node) => node.sectionId === section.id).length, 2);
    await settle();
    await blank();
    await card(section.id).click({ position: { x: 20, y: 20 }, button: 'right' });
    const menu = page.locator('#canvas-context-menu');
    const labels = await menu
      .locator('button:not([hidden])')
      .evaluateAll((items) => items.map((item) => item.textContent));
    assert.deepEqual(labels, ['取消分组', '删除分组']);
    await menu.getByRole('button', { name: '删除分组' }).click();
    doc = await current();
    assert.equal(doc.nodes.length, 0, '删除分组同时删除成员');
    await settle();
    await editor('undo', {});
    assert.equal((await current()).nodes.length, 3);
    await settle();
    // Right-click on a multi-selection offers 分组 too.
    await blank();
    await card(first.id).click({ position: { x: 100, y: 120 } });
    await card(second.id).click({ position: { x: 60, y: 100 }, modifiers: ['Shift'] });
    await card(second.id).click({ position: { x: 60, y: 100 }, button: 'right' });
    assert.equal(await menu.getByRole('button', { name: '分组' }).isVisible(), true);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    await page.close();
  });

  const waitMetadata = (locator) =>
    locator.evaluate(
      (video) =>
        new Promise((resolve) =>
          video.readyState >= 1
            ? resolve()
            : video.addEventListener('loadedmetadata', resolve, { once: true })
        )
    );
  const importVideo = async (page, title) => {
    const assetPath = await page.evaluate(() => window.__canvasAddVideo());
    await page.evaluate(
      ({ assetPath, title }) =>
        window.__canvasEditor.importProjectAsset({ assetPath, kind: 'video', title }),
      { assetPath, title }
    );
    return page.evaluate(
      (assetPath) =>
        window.__canvasEditor.current().nodes.find((node) => node.assetPath === assetPath),
      assetPath
    );
  };
  await check(
    'Web 视频卡：重渲染/点击/缩放复用同一 <video>，拖动移动卡片不播放，播放只走按钮',
    async () => {
      const { page, errors, editor, settle, current, card, blank, shoot } = await webPage({
        features: videoFeatures,
        videoStore: true,
      });
      await settle();
      const video = await importVideo(page, '角色动作');
      await editor('update-nodes', { nodes: [{ id: video.id, x: 300, y: 200 }] });
      await settle();
      await blank();
      const player = card(video.id).locator('video');
      await waitMetadata(player);
      assert.equal(await player.evaluate((item) => item.controls), false, '无原生控件抢拖拽');
      await player.evaluate((item) => {
        item.muted = true;
        item.loop = true;
        window.__videoMark = item;
      });
      const box = await player.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 });
      await page.mouse.up();
      const moved = (await current()).nodes.find((node) => node.id === video.id);
      assert.ok(Math.abs(moved.x - 420) < 2 && Math.abs(moved.y - 240) < 2, '拖动移动视频卡');
      assert.equal(await player.evaluate((item) => item.paused), true, '拖动不触发播放');
      assert.ok(await card(video.id).evaluate((item) => item.classList.contains('selected')));
      await settle();
      await blank();
      await card(video.id).click({ position: { x: 120, y: 120 } });
      assert.equal(await player.evaluate((item) => item.paused), true, '点击卡片不播放');
      const play = card(video.id).locator('.web-video-play');
      assert.equal(await play.getAttribute('aria-label'), '播放视频');
      await themes(page, (theme) => shoot('v11-' + theme + '-video-play-control.png'));
      await play.click();
      // paused flips synchronously, the play event (which relabels the chip) follows as a task.
      await page.waitForFunction(
        (id) =>
          !window.__videoMark.paused &&
          document
            .querySelector('.card[data-id="' + id + '"] .web-video-play')
            .getAttribute('aria-label') === '暂停视频',
        video.id
      );
      await page.waitForTimeout(250);
      const started = await page.evaluate(() => ({
        time: window.__videoMark.currentTime,
        src: window.__videoMark.currentSrc,
      }));
      // Each of these re-renders the whole world.
      await blank();
      await card(video.id).click({ position: { x: 120, y: 120 } });
      await page.mouse.move(700, 500);
      await page.mouse.wheel(0, -120);
      await editor('update-nodes', { nodes: [{ id: video.id, title: '角色动作 2' }] });
      const after = await page.evaluate((id) => {
        const element = document.querySelector('.card[data-id="' + id + '"] video');
        return {
          same: element === window.__videoMark,
          paused: element.paused,
          time: element.currentTime,
          src: element.currentSrc,
        };
      }, video.id);
      assert.equal(after.same, true, '同一个 <video> 元素');
      assert.equal(after.src, started.src, 'src 不变');
      assert.equal(after.paused, false, '播放不被打断');
      assert.ok(after.time >= started.time, 'currentTime 不重置');
      await card(video.id).locator('.web-video-play').click();
      await page.waitForFunction(() => window.__videoMark.paused);
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check('Web 视频卡：播放键与进度条同高同底边（缩放 1× / 放大 / 缩小）', async () => {
    const { page, errors, editor, settle, card, blank } = await webPage({
      features: videoFeatures,
      videoStore: true,
    });
    await settle();
    const video = await importVideo(page, '对齐');
    await editor('update-nodes', { nodes: [{ id: video.id, x: 300, y: 200 }] });
    await settle();
    await blank();
    await waitMetadata(card(video.id).locator('video'));
    // Ctrl+wheel zooms in Web (a plain wheel pans); several steps reach 放大 / 缩小.
    for (const wheel of [0, -10, 10]) {
      if (wheel) {
        const media = await card(video.id).locator('video').boundingBox();
        await page.mouse.move(media.x + media.width / 2, media.y + media.height / 2);
        await page.keyboard.down('Control');
        for (let step = 0; step < 20; step++) await page.mouse.wheel(0, wheel);
        await page.keyboard.up('Control');
        await page.waitForTimeout(100);
      }
      const media = await card(video.id).locator('video').boundingBox();
      await page.mouse.move(media.x + media.width / 2, media.y + media.height / 3);
      await page.waitForFunction(
        (id) =>
          Number(
            getComputedStyle(document.querySelector('.card[data-id="' + id + '"] .web-video-bar'))
              .opacity
          ) > 0.9,
        video.id
      );
      const chip = await card(video.id).locator('.web-video-play').boundingBox();
      const bar = await card(video.id).locator('.web-video-bar').boundingBox();
      assert.ok(
        Math.abs(chip.height - bar.height) < 0.6,
        '同高 ' + chip.height + ' / ' + bar.height
      );
      assert.ok(
        Math.abs(chip.y + chip.height - (bar.y + bar.height)) < 0.6,
        '同底边 wheel=' + wheel
      );
      assert.ok(bar.x - (chip.x + chip.width) > 0, '进度条在播放键右侧');
    }
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check(
    'Web 触控板：双指滑动平移画布，捏合 / Ctrl+滚轮按指针缩放；默认外观滚轮仍缩放',
    async () => {
      const { page, errors, settle, current } = await webPage();
      await settle();
      const view = async () => (await current()).viewport;
      const start = await view();
      await page.mouse.move(700, 450);
      // Two-finger scroll arrives as a plain wheel with both axes.
      await page.mouse.wheel(40, 25);
      await page.mouse.wheel(-10, 15);
      let now = await view();
      assert.equal(now.scale, start.scale, '双指滑动不缩放');
      assert.ok(
        Math.abs(now.x - (start.x - 30)) < 0.5 && Math.abs(now.y - (start.y - 40)) < 0.5,
        '按位移平移：' + JSON.stringify(now)
      );
      // Shift+wheel (mouse) scrolls sideways.
      const beforeShift = now;
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 50);
      await page.keyboard.up('Shift');
      now = await view();
      assert.equal(now.scale, beforeShift.scale);
      assert.ok(
        Math.abs(beforeShift.x - now.x - 50) < 0.5 && Math.abs(now.y - beforeShift.y) < 0.5,
        'Shift+滚轮横向平移'
      );
      // Pinch is reported as Ctrl+wheel: small deltas zoom a little, around the pointer.
      const pivot = { x: 700, y: 450 };
      const board = await page.locator('#board').boundingBox();
      const worldBefore = {
        x: (pivot.x - board.x - now.x) / now.scale,
        y: (pivot.y - board.y - now.y) / now.scale,
      };
      await page.keyboard.down('Control');
      for (let step = 0; step < 10; step++) await page.mouse.wheel(0, -10);
      await page.keyboard.up('Control');
      const zoomed = await view();
      assert.ok(
        zoomed.scale > now.scale * 1.1 && zoomed.scale < now.scale * 1.35,
        '捏合平滑放大：' + zoomed.scale
      );
      const worldAfter = {
        x: (pivot.x - board.x - zoomed.x) / zoomed.scale,
        y: (pivot.y - board.y - zoomed.y) / zoomed.scale,
      };
      assert.ok(
        Math.abs(worldAfter.x - worldBefore.x) < 0.5 &&
          Math.abs(worldAfter.y - worldBefore.y) < 0.5,
        '以指针为中心缩放'
      );
      await settle();
      assert.deepEqual(errors, []);
      await page.close();
      // Default appearance keeps wheel = zoom.
      const plain = await openCanvas({});
      await plain.page.waitForFunction(() => window.__canvasEditor.current());
      const plainStart = await plain.page.evaluate(
        () => window.__canvasEditor.current().viewport.scale
      );
      await plain.page.mouse.move(700, 450);
      await plain.page.mouse.wheel(0, -120);
      await plain.page.waitForFunction(
        (scale) => window.__canvasEditor.current().viewport.scale > scale,
        plainStart
      );
      assert.deepEqual(plain.errors, []);
      await plain.page.close();
    }
  );
  await check('Web 工具条快捷键：V/H/R/A 切换或放置，⌘/Ctrl+S 保存，tooltip 写明按键', async () => {
    const { page, errors, settle, current } = await webPage();
    await settle();
    // The Web tooltip moves title into data-web-tip once it has shown.
    const title = (id) =>
      page.locator('#' + id).evaluate((item) => item.title || item.dataset.webTip || '');
    assert.equal(await title('tool-select'), '鼠标（V）');
    assert.match(await title('tool-pan'), /^拖拽画布（H · 按住空格临时拖拽）$/);
    assert.equal(await title('mark-ellipse'), '标注框（R）');
    assert.equal(await title('mark-arrow'), '箭头（A）');
    assert.match(await title('save'), /^已保存（(⌘S|Ctrl\+S)）$/);
    await page.mouse.click(1300, 840);
    await page.keyboard.press('h');
    assert.equal(await page.locator('#tool-pan').getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('v');
    assert.equal(await page.locator('#tool-select').getAttribute('aria-pressed'), 'true');
    const marks = async () => (await current()).nodes.filter((node) => node.type === 'mark');
    await page.keyboard.press('r');
    await page.keyboard.press('Escape');
    await page.mouse.click(1300, 840);
    await page.keyboard.press('a');
    const placed = await marks();
    assert.deepEqual(
      placed.map((node) => node.mark.shape),
      ['ellipse', 'arrow'],
      'R 放标注框、A 放箭头'
    );
    await page.keyboard.press('ControlOrMeta+s');
    await settle();
    // Typing in a field never triggers tool keys.
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'shortcut-probe';
      document.body.append(input);
    });
    await page.locator('#shortcut-probe').focus();
    await page.keyboard.type('vhra');
    assert.equal((await marks()).length, 2, '输入框里打字不触发');
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check(
    'Web 视频卡进度条：时间/时长，点击与拖动跳转不拖卡，键盘 ±1s，重渲染不重置，卡片仍可拖',
    async () => {
      const { page, errors, editor, settle, current, card, blank, shoot } = await webPage({
        features: videoFeatures,
        videoStore: true,
      });
      await settle();
      const video = await importVideo(page, '进度条');
      await editor('update-nodes', { nodes: [{ id: video.id, x: 300, y: 200 }] });
      await settle();
      await blank();
      const player = card(video.id).locator('video');
      await waitMetadata(player);
      await page.waitForFunction((id) => {
        const item = document.querySelector('.card[data-id="' + id + '"] video');
        return Number.isFinite(item.duration) && item.duration > 0 && item.currentTime === 0;
      }, video.id);
      await player.evaluate((item) => (window.__videoMark = item));
      const bar = card(video.id).locator('.web-video-bar');
      const track = bar.getByRole('slider', { name: '播放进度' });
      assert.equal(
        await bar.evaluate((item) => getComputedStyle(item).opacity),
        '0',
        '未悬停时隐藏'
      );
      await card(video.id).hover({ position: { x: 120, y: 100 } });
      await page.waitForFunction(
        (id) =>
          getComputedStyle(document.querySelector('.card[data-id="' + id + '"] .web-video-bar'))
            .opacity > '0.9',
        video.id
      );
      const duration = await player.evaluate((item) => item.duration);
      assert.match(await bar.locator('.web-video-time').textContent(), /^0:00 \/ 0:0\d$/);
      assert.equal(await track.getAttribute('aria-valuenow'), '0');
      assert.equal(
        await track.getAttribute('aria-valuemax'),
        String(Math.round(duration * 10) / 10)
      );
      await themes(page, (theme) => shoot('v12-' + theme + '-video-progress.png'));
      const before = (await current()).nodes.find((node) => node.id === video.id);
      const rect = await track.boundingBox();
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const clicked = await player.evaluate((item) => item.currentTime / item.duration);
      assert.ok(Math.abs(clicked - 0.5) < 0.08, '点击中点跳到一半：' + clicked);
      assert.equal(await player.evaluate((item) => item.paused), true, '跳转不触发播放');
      // Real mouse flow: after clicking the track, arrows keep seeking.
      await page.keyboard.press('ArrowRight');
      const afterClick = await player.evaluate((item) => item.currentTime);
      assert.ok(
        Math.abs(afterClick - Math.min(duration, clicked * duration + 1)) < 0.05,
        '点击进度条后 → 前进 1s：' + afterClick
      );
      // A re-render (autosave ack, task update, Agent edit) must not drop the slider's focus.
      await editor('update-nodes', { nodes: [{ id: video.id, title: '进度条 焦点' }] });
      // Focus comes back on the next frame (the card is laid out by then).
      await page.waitForFunction(() =>
        document.activeElement.classList.contains('web-video-track')
      );
      await page.keyboard.press('ArrowLeft');
      const afterRender = await player.evaluate((item) => item.currentTime);
      assert.ok(
        Math.abs(afterRender - Math.max(0, afterClick - 1)) < 0.05,
        '重渲染后 ← 仍后退：' + afterRender
      );
      // Drag along the bar: seeks, never moves the card.
      await page.mouse.move(rect.x + rect.width * 0.2, rect.y + rect.height / 2);
      await page.mouse.down();
      await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height / 2 + 30, { steps: 6 });
      await page.mouse.move(rect.x + rect.width * 0.9, rect.y + rect.height / 2 + 30, { steps: 4 });
      await page.mouse.up();
      await settle();
      const dragged = await player.evaluate((item) => item.currentTime / item.duration);
      assert.ok(Math.abs(dragged - 0.9) < 0.08, '拖动跳到 90%：' + dragged);
      const still = (await current()).nodes.find((node) => node.id === video.id);
      assert.deepEqual([still.x, still.y], [before.x, before.y], '拖进度条不移动卡片');
      // Keyboard: focused slider steps 1s, clamped to the clip; arrows don't nudge the card.
      await track.focus();
      await page.keyboard.press('Home');
      assert.equal(await player.evaluate((item) => item.currentTime), 0);
      await page.keyboard.press('ArrowRight');
      const stepped = await player.evaluate((item) => item.currentTime);
      assert.ok(Math.abs(stepped - Math.min(1, duration)) < 0.01, '→ 前进 1s');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await player.evaluate((item) => item.currentTime), 0, '← 后退 1s');
      await page.keyboard.press('End');
      assert.equal(
        await track.getAttribute('aria-valuenow'),
        String(Math.round(duration * 10) / 10)
      );
      assert.match(await track.getAttribute('aria-valuetext'), /^0:0\d \/ 0:0\d$/);
      const keyed = (await current()).nodes.find((node) => node.id === video.id);
      assert.deepEqual([keyed.x, keyed.y], [before.x, before.y], '方向键不挪卡片');
      // Mute toggle.
      const mute = bar.locator('.web-video-mute');
      const muted = await player.evaluate((item) => item.muted);
      await mute.click();
      assert.equal(await player.evaluate((item) => item.muted), !muted);
      assert.equal(await mute.getAttribute('aria-pressed'), String(!muted));
      // Arrows also seek from the play chip and from a selected card with nothing focused.
      const chip = card(video.id).locator('.web-video-play');
      await player.evaluate((item) => (item.currentTime = 0));
      await chip.focus();
      await page.keyboard.press('ArrowRight');
      assert.ok(
        Math.abs((await player.evaluate((item) => item.currentTime)) - Math.min(1, duration)) <
          0.05,
        '播放键上 → 前进 1s'
      );
      await editor('update-nodes', { nodes: [{ id: video.id, title: '进度条 播放键' }] });
      await page.waitForFunction(
        () => document.activeElement.classList.contains('web-video-play'),
        null,
        { timeout: 2000 }
      );
      await blank();
      await card(video.id).click({ position: { x: 120, y: 60 } });
      await player.evaluate((item) => (item.currentTime = 0));
      await page.keyboard.press('ArrowRight');
      assert.ok(
        Math.abs((await player.evaluate((item) => item.currentTime)) - Math.min(1, duration)) <
          0.05,
        '选中视频卡 → 前进 1s'
      );
      await page.keyboard.press('ArrowLeft');
      assert.equal(await player.evaluate((item) => item.currentTime), 0, '选中视频卡 ← 后退 1s');
      // Playing: controls fade after 2s idle even while selected or hovered, and come back on pointer move.
      const opacity = (selector) =>
        card(video.id)
          .locator(selector)
          .evaluate((item) => Number(getComputedStyle(item).opacity));
      await player.evaluate((item) => {
        item.loop = true;
        item.muted = true;
      });
      const pic = await player.boundingBox();
      await page.mouse.move(pic.x + pic.width / 2, pic.y + pic.height / 3);
      await chip.click();
      await page.waitForFunction(() => !window.__videoMark.paused);
      await page.mouse.move(pic.x + pic.width / 2 + 5, pic.y + pic.height / 3);
      assert.ok((await opacity('.web-video-bar')) > 0.9, '播放刚开始进度条可见');
      await page.waitForTimeout(2400);
      assert.equal(await opacity('.web-video-bar'), 0, '播放中静止 2s 后进度条隐藏');
      assert.equal(await opacity('.web-video-play'), 0, '播放中静止 2s 后播放键隐藏');
      await page.mouse.move(pic.x + pic.width / 2 + 20, pic.y + pic.height / 3);
      await page.waitForTimeout(200);
      assert.ok((await opacity('.web-video-bar')) > 0.9, '移动鼠标后进度条回来');
      await chip.click();
      await page.waitForFunction(() => window.__videoMark.paused);
      await page.waitForTimeout(2400);
      assert.ok((await opacity('.web-video-bar')) > 0.9, '暂停时不自动隐藏');
      // Re-renders keep the same bar and position.
      await player.evaluate((item) => (item.currentTime = item.duration / 2));
      const barMark = await bar.evaluate((item) => (window.__barMark = item) && true);
      assert.ok(barMark);
      await blank();
      await page.mouse.move(700, 500);
      await page.mouse.wheel(0, -120);
      await editor('update-nodes', { nodes: [{ id: video.id, title: '进度条 2' }] });
      const kept = await page.evaluate((id) => {
        const element = document.querySelector('.card[data-id="' + id + '"] .web-video-bar');
        return {
          same: element === window.__barMark,
          ratio: window.__videoMark.currentTime / window.__videoMark.duration,
        };
      }, video.id);
      assert.equal(kept.same, true, '同一进度条');
      assert.ok(Math.abs(kept.ratio - 0.5) < 0.02, '进度不重置');
      await page.mouse.wheel(0, 120);
      await settle();
      // The card still drags from the picture area.
      await blank();
      const start = (await current()).nodes.find((node) => node.id === video.id);
      const box = await player.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 3 + 40, { steps: 6 });
      await page.mouse.up();
      const moved = (await current()).nodes.find((node) => node.id === video.id);
      assert.ok(moved.x - start.x > 40 && moved.y - start.y > 20, '拖画面仍移动卡片');
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check('默认外观：视频卡重渲染也复用同一 <video>（共用修复），保留原生控件', async () => {
    const { page, errors } = await openCanvas({ videoStore: true });
    const video = await importVideo(page, '默认视频');
    const player = page.locator('.card[data-id="' + video.id + '"] video');
    await waitMetadata(player);
    assert.equal(await player.evaluate((item) => item.controls), true);
    await player.evaluate((item) => (window.__videoMark = item));
    await page.locator('.card[data-id="' + video.id + '"] .canvas-card-title').click();
    await page.mouse.click(1300, 860);
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, -120);
    assert.equal(
      await page.evaluate(
        (id) => document.querySelector('.card[data-id="' + id + '"] video') === window.__videoMark,
        video.id
      ),
      true
    );
    assert.equal(await page.locator('.web-video-play').count(), 0);
    assert.equal(await page.locator('.web-video-bar').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 序列帧/动画卡：与图片卡同款（框外标题、圆角面板、选中四角手柄）', async () => {
    const atlas = 'assets/image/canvas/style-atlas.png';
    const frame = (index) => ({
      index,
      time: index / 8,
      x: index * 60,
      y: 0,
      width: 60,
      height: 120,
    });
    const frameSetInfo = {
      fps: 8,
      frameCount: 2,
      width: 60,
      height: 120,
      columns: 2,
      rows: 1,
      frames: [frame(0), frame(1)],
    };
    const { page, errors } = await openCanvas({
      features: videoFeatures,
      appearance: 'web',
      seedMedia: { [atlas]: '#c33' },
      seedDocuments: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          title: '样式画布',
          revision: 1,
          viewport: { x: 0, y: 0, scale: 1 },
          nodes: [
            {
              id: 'seq-s',
              type: 'sequence',
              x: 120,
              y: 160,
              width: 420,
              height: 300,
              title: '视频转序列帧',
              assetPath: atlas,
              sequenceSettings: {
                start: 0,
                end: 1,
                fps: 8,
                cutout: false,
                backgroundColor: '#00ff00',
                tolerance: 48,
                duplicateThreshold: 0.985,
                width: 60,
                height: 120,
                fit: 'contain',
                pixel: false,
              },
              frameSetInfo,
            },
            {
              id: 'anim-s',
              type: 'animation',
              x: 620,
              y: 160,
              width: 320,
              height: 300,
              title: '序列帧动画',
              assetPath: atlas,
              frameSetInfo,
            },
          ],
          edges: [],
        },
      ],
    });
    await page.waitForSelector('.card[data-id="seq-s"] .canvas-card-content');
    for (const id of ['seq-s', 'anim-s']) {
      const card = page.locator('.card[data-id="' + id + '"]');
      await card.locator('.canvas-card-title').click();
      await page.waitForFunction(
        (id) =>
          document.querySelectorAll('.card[data-id="' + id + '"] .web-node-handle').length === 4,
        id
      );
      const style = await card.evaluate((element) => {
        const css = (item) => getComputedStyle(item);
        const content = element.querySelector('.canvas-card-content');
        const header = element.querySelector('.canvas-card-header');
        return {
          media: element.classList.contains('web-media'),
          cardBorder: css(element).borderTopWidth,
          cardBg: css(element).backgroundColor,
          headerBorder: css(header).borderBottomWidth,
          radius: css(content).borderTopLeftRadius,
          meta: css(element.querySelector('.canvas-card-meta')).display,
          grip: css(element.querySelector(':scope > .resize-handle') || element).display,
        };
      });
      assert.equal(style.media, true, id + ' 用媒体卡外观');
      assert.equal(style.cardBorder, '0px', id + ' 卡片外框去掉');
      assert.equal(style.cardBg, 'rgba(0, 0, 0, 0)', id + ' 标题行透明');
      assert.equal(style.headerBorder, '0px', id + ' 标题行无分隔线');
      assert.equal(style.radius, '12px', id + ' 内容圆角面板');
      assert.notEqual(style.meta, 'none', id + ' 保留帧数信息');
      assert.equal(style.grip, 'none', id + ' 旧右下手柄隐藏');
    }
    if (process.env.CANVAS_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.CANVAS_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.CANVAS_SCREENSHOT_DIR, 'v13-sequence-animation-cards.png'),
        clip: { x: 80, y: 100, width: 920, height: 420 },
      });
    }
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('序列帧卡：重渲染时帧格在同一帧内重绘（缓存已解码图集，不闪白）', async () => {
    const atlas = 'assets/image/canvas/sequence-atlas.png';
    const frame = (index) => ({
      index,
      time: index / 8,
      x: index * 60,
      y: 0,
      width: 60,
      height: 120,
    });
    const { page, errors } = await openCanvas({
      features: videoFeatures,
      appearance: 'web',
      seedMedia: { [atlas]: '#c33' },
      seedDocuments: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          title: '序列帧画布',
          revision: 1,
          viewport: { x: 0, y: 0, scale: 1 },
          nodes: [
            {
              id: 'seq-1',
              type: 'sequence',
              x: 240,
              y: 160,
              width: 480,
              height: 300,
              title: '序列帧',
              assetPath: atlas,
              sequenceSettings: {
                start: 0,
                end: 1,
                fps: 8,
                cutout: false,
                backgroundColor: '#00ff00',
                tolerance: 48,
                duplicateThreshold: 0.985,
                width: 60,
                height: 120,
                fit: 'contain',
                pixel: false,
              },
              frameSetInfo: {
                fps: 8,
                frameCount: 2,
                width: 60,
                height: 120,
                columns: 2,
                rows: 1,
                frames: [frame(0), frame(1)],
              },
            },
          ],
          edges: [],
        },
      ],
    });
    const painted = () =>
      page.evaluate(() => {
        const canvas = document.querySelector(
          '.card[data-id="seq-1"] .sequence-result-grid canvas'
        );
        return Boolean(canvas && canvas.getContext('2d').getImageData(80, 60, 1, 1).data[3]);
      });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.card[data-id="seq-1"] .sequence-result-grid canvas');
      return canvas && canvas.getContext('2d').getImageData(80, 60, 1, 1).data[3] > 0;
    });
    assert.equal(await painted(), true);
    // The wheel handler re-renders synchronously; the new tiles must already be painted.
    const sync = await page.evaluate(() => {
      const board = document.getElementById('board');
      const before = document.querySelector('.card[data-id="seq-1"] .sequence-result-grid canvas');
      board.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          clientX: 600,
          clientY: 400,
          bubbles: true,
          cancelable: true,
        })
      );
      const canvas = document.querySelector('.card[data-id="seq-1"] .sequence-result-grid canvas');
      return {
        rerendered: canvas !== before,
        alpha: canvas.getContext('2d').getImageData(80, 60, 1, 1).data[3],
      };
    });
    assert.equal(sync.rerendered, true);
    assert.ok(sync.alpha > 0, '重渲染后同步已绘制');
    assert.deepEqual(errors, []);
    await page.close();
  });
  for (const appearance of ['web', 'default']) {
    await check(
      '动画卡（' + appearance + '）：重渲染复用同一 canvas，当前帧立即可见（不闪）',
      async () => {
        const atlas = 'assets/image/canvas/animation-atlas.png';
        const frame = (index) => ({
          index,
          time: index / 8,
          x: index * 60,
          y: 0,
          width: 60,
          height: 120,
        });
        const { page, errors } = await openCanvas({
          features: videoFeatures,
          ...(appearance === 'web' ? { appearance } : {}),
          seedMedia: { [atlas]: '#c33' },
          seedDocuments: [
            {
              id: '44444444-4444-4444-8444-444444444444',
              title: '动画画布',
              revision: 1,
              viewport: { x: 0, y: 0, scale: 1 },
              nodes: [
                {
                  id: 'anim-1',
                  type: 'animation',
                  x: 240,
                  y: 160,
                  width: 360,
                  height: 300,
                  title: '动画',
                  assetPath: atlas,
                  frameSetInfo: {
                    fps: 8,
                    frameCount: 2,
                    width: 60,
                    height: 120,
                    columns: 2,
                    rows: 1,
                    frames: [frame(0), frame(1)],
                  },
                },
              ],
              edges: [],
            },
          ],
        });
        await page.waitForFunction(() => {
          const canvas = document.querySelector('.card[data-id="anim-1"] .animation-preview');
          return canvas && canvas.getContext('2d').getImageData(160, 120, 1, 1).data[3] > 0;
        });
        const sync = await page.evaluate(() => {
          const board = document.getElementById('board');
          const before = document.querySelector('.card[data-id="anim-1"] .animation-preview');
          const card = before.closest('.card');
          board.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: -100,
              clientX: 600,
              clientY: 400,
              bubbles: true,
              cancelable: true,
            })
          );
          const canvas = document.querySelector('.card[data-id="anim-1"] .animation-preview');
          return {
            rerendered: canvas.closest('.card') !== card,
            same: canvas === before,
            alpha: canvas.getContext('2d').getImageData(160, 120, 1, 1).data[3],
            play: canvas.closest('.card').querySelector('.animation-controls button').disabled,
          };
        });
        assert.equal(sync.rerendered, true, '卡片已重建');
        assert.equal(sync.same, true, '复用同一 canvas');
        assert.ok(sync.alpha > 0, '重渲染后同步可见');
        assert.equal(sync.play, false, '播放按钮立即可用');
        assert.deepEqual(errors, []);
        await page.close();
      }
    );
  }
  await check(
    'Web 侧边＋：选择「图片卡片 / 视频卡片」，键盘可用；视频槽以首帧连入，曲线连线',
    async () => {
      const { page, errors, editor, settle, current, card, importImage, blank, shoot } =
        await webPage({ features: videoFeatures, videoStore: true });
      const source = await importImage('角色', '#c96', 160, 120);
      await editor('update-nodes', { nodes: [{ id: source.id, x: 220, y: 200 }] });
      await settle();
      await blank();
      await card(source.id).click({ position: { x: 100, y: 120 } });
      const port = card(source.id).locator('.canvas-port-output');
      const chooser = page.locator('.web-slot-chooser');
      await port.click();
      await chooser.waitFor();
      assert.deepEqual(
        await chooser
          .getByRole('menuitem')
          .evaluateAll((items) => items.map((item) => item.textContent)),
        ['图片卡片', '视频卡片']
      );
      assert.equal((await current()).nodes.length, 1, '打开选择不创建卡片');
      await themes(page, (theme) => shoot('v11-' + theme + '-plus-chooser.png'));
      // Esc closes and gives focus back to the +.
      await page.keyboard.press('Escape');
      await chooser.waitFor({ state: 'detached' });
      assert.equal(await port.evaluate((item) => document.activeElement === item), true);
      await page.keyboard.press('Enter');
      await chooser.waitFor();
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        '图片卡片',
        '打开后聚焦首项'
      );
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), '视频卡片');
      await page.keyboard.press('Enter');
      await chooser.waitFor({ state: 'detached' });
      let doc = await current();
      const slot = doc.nodes.find((node) => node.type === 'video');
      assert.ok(slot && !slot.assetPath && !slot.generationDraft, '空视频槽，不继承图片参数');
      assert.ok(slot.x > doc.nodes.find((node) => node.id === source.id).x, '在图片右侧');
      const edge = doc.edges.find((item) => item.to === slot.id);
      assert.deepEqual([edge.from, edge.kind], [source.id, 'first-frame']);
      await page.locator('#selection-toolbar .generation-panel-video').waitFor();
      assert.equal(
        await page.locator('#selection-toolbar .generation-reference').getAttribute('data-role'),
        '首帧'
      );
      const wire = page.locator(
        '#wires path[data-from="' + source.id + '"][data-to="' + slot.id + '"]'
      );
      assert.match(await wire.getAttribute('d'), / C /, '视频连线为曲线');
      assert.equal(await wire.getAttribute('marker-end'), null, '无箭头');
      await settle();
      // Hovering a first-frame wire shows the same flow and, after 1s, the cut button.
      await blank();
      const middle = await wire.evaluate((path) => {
        const point = path.getPointAtLength(path.getTotalLength() / 2);
        const rect = document.getElementById('board').getBoundingClientRect();
        return { x: rect.left + point.x, y: rect.top + point.y };
      });
      await page.mouse.move(middle.x, middle.y);
      await page.locator('.wire-controls .wire-active').waitFor();
      await page.locator('.wire-controls .wire-scissors').waitFor({ timeout: 2500 });
      await themes(page, (theme) => shoot('v11-' + theme + '-image-video-wire.png'));
      await page.mouse.move(1300, 860);
      // Image choice still creates the linked image slot.
      await card(source.id).click({ position: { x: 100, y: 120 } });
      await port.click();
      await chooser.getByRole('menuitem', { name: '图片卡片' }).click();
      doc = await current();
      const imageSlot = doc.nodes.find((node) => node.type === 'image' && !node.assetPath);
      assert.ok(
        doc.edges.some(
          (item) =>
            item.from === source.id && item.to === imageSlot.id && item.kind === 'image-variant'
        )
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check('Web 侧边＋：未开视频功能时直接新建图片槽，不弹选择', async () => {
    const { page, errors, editor, settle, current, card, importImage, blank } = await webPage();
    const source = await importImage('角色', '#c96', 160, 120);
    await editor('update-nodes', { nodes: [{ id: source.id, x: 220, y: 200 }] });
    await settle();
    await blank();
    await card(source.id).click({ position: { x: 100, y: 120 } });
    await card(source.id).locator('.canvas-port-output').click();
    await page.waitForFunction(() => window.__canvasEditor.current().nodes.length === 2);
    assert.equal(await page.locator('.web-slot-chooser').count(), 0);
    assert.equal((await current()).nodes[1].type, 'image');
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check('Web 焦点环：鼠标点击无描边，键盘 Tab 才显示 1.5px 主题色淡环', async () => {
    const { page, errors, editor, settle, card, blank } = await webPage();
    const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
    await editor('update-nodes', { nodes: [{ id: slotId, x: 300, y: 120 }] });
    await settle();
    await blank();
    await card(slotId).click({ position: { x: 80, y: 80 } });
    const model = page.locator('#selection-toolbar select.generation-mode').first();
    await model.waitFor();
    const ring = (locator) =>
      locator.evaluate((item) => {
        const style = getComputedStyle(item);
        return [
          document.activeElement === item,
          style.outlineStyle,
          style.outlineWidth,
          style.outlineColor,
        ];
      });
    await model.dispatchEvent('pointerdown');
    await model.focus();
    const clicked = await ring(model);
    assert.equal(clicked[0], true);
    assert.equal(clicked[1], 'none', '鼠标聚焦无描边');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    const keyed = await ring(focused);
    assert.equal(keyed[1], 'solid');
    // Declared 1.5px; Chrome snaps outline widths to device pixels, so DPR 1 reports 1px.
    assert.ok(['1px', '1.5px'].includes(keyed[2]), keyed[2]);
    assert.match(keyed[3], /rgba\(\d+, \d+, \d+, 0\.6\)/, '主题色 60%');
    await page.keyboard.press('Shift+Tab');
    assert.equal((await ring(model))[1], 'solid', '键盘回到下拉也显示');
    await model.dispatchEvent('pointerdown');
    assert.equal((await ring(model))[1], 'none', '指针按下后恢复无描边');
    assert.deepEqual(errors, []);
    await page.close();
  });
  await check(
    'Web 文生视频：无图片视频槽只按提示词生成，mode=text_to_video、无图片字段、2.5 不弹确认',
    async () => {
      const { page, errors, settle, current, card, blank, shoot } = await webPage({
        features: videoFeatures,
        videoStore: true,
      });
      const dialogs = [];
      page.on('dialog', (dialog) => dialogs.push(dialog.message()));
      await settle();
      await page.mouse.click(700, 360, { button: 'right' });
      await page
        .locator('#canvas-context-menu')
        .getByRole('button', { name: '新建视频卡片' })
        .click();
      const slot = (await current()).nodes.find((node) => node.type === 'video');
      const panel = page.locator('#selection-toolbar .generation-panel-video');
      await panel.waitFor();
      const selects = panel.locator('.generation-fields select.generation-mode');
      assert.deepEqual(
        await selects.evaluateAll((items) =>
          items.map((item) => item.options[item.selectedIndex].textContent)
        ),
        ['模型 2.0', '720p', '4 秒', '16:9'],
        '无输入方式胶囊，比例默认 16:9'
      );
      assert.deepEqual(
        await selects.nth(3).evaluate((item) => [...item.options].map((option) => option.value)),
        ['16:9', '9:16', '1:1'],
        '无图片时不提供自适应比例'
      );
      await selects.nth(0).selectOption('2.5');
      await panel.locator('textarea.generation-prompt').fill('雨夜城市航拍');
      const send = panel.locator('.generation-action-primary');
      assert.equal(await send.isDisabled(), false);
      await themes(page, (theme) => shoot('v11-' + theme + '-text-to-video-composer.png'));
      await send.click();
      await page.waitForFunction(() => window.__canvasCalls.video?.length === 1);
      const [sent] = await page.evaluate(() => window.__canvasCalls.video);
      assert.deepEqual(sent, {
        prompt: '雨夜城市航拍',
        mode: 'text_to_video',
        targetNodeId: slot.id,
        duration: 4,
        model: '2.5',
        resolution: '720p',
        ratio: '16:9',
        userConfirmed: false,
      });
      assert.deepEqual(dialogs, [], 'Web 不弹 2.5 确认，由宿主处理');
      await page.waitForFunction(
        (id) =>
          window.__canvasEditor.current().nodes.some((node) => node.id === id && node.assetPath),
        slot.id
      );
      const result = (await current()).nodes.find((node) => node.id === slot.id);
      assert.equal(result.type, 'video-source');
      assert.equal(result.generation.parameters.mode, 'text_to_video');
      assert.deepEqual(result.generation.sourceImageIds, []);
      await blank();
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  const slotPng = {
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    ),
  };
  await check(
    'Web 空卡片：图片槽「上传」选 WebM 原位变成视频卡（同 id、去掉连线），可撤销',
    async () => {
      const { page, errors, editor, settle, current, card, importImage, blank } = await webPage({
        features: videoFeatures,
        videoStore: true,
      });
      const source = await importImage('参考');
      const slotId = (await editor('add-node', { type: 'image' })).selectedIds[0];
      await editor('update-nodes', { nodes: [{ id: slotId, x: 420, y: 220 }] });
      await editor('connect', { from: source.id, to: slotId });
      await settle();
      await blank();
      await card(slotId).click({ position: { x: 60, y: 80 } });
      const chooser = page.waitForEvent('filechooser');
      await card(slotId).locator('.web-slot-upload').click();
      const picked = await chooser;
      const accept = await picked.element().evaluate((input) => input.accept);
      for (const type of [
        'image/png',
        'image/jpeg',
        'image/webp',
        'video/mp4',
        'video/webm',
        'video/quicktime',
      ])
        assert.ok(accept.includes(type), 'accept 包含 ' + type);
      const bytes = await page.evaluate(() => window.__canvasVideoBytes());
      await picked.setFiles({
        name: '错建.webm',
        mimeType: 'video/webm',
        buffer: Buffer.from(bytes),
      });
      await page.waitForFunction(
        (id) =>
          window.__canvasEditor.current().nodes.find((node) => node.id === id).type ===
          'video-source',
        slotId
      );
      const doc = await current();
      const node = doc.nodes.find((item) => item.id === slotId);
      assert.equal(node.x, 420);
      assert.equal(node.y, 220);
      assert.equal(node.title, '错建');
      assert.match(node.assetPath, /^assets\/video\//);
      for (const key of ['generationDraft', 'referenceInput', 'generation'])
        assert.equal(node[key], undefined, key);
      assert.equal(
        doc.edges.filter((edge) => edge.to === slotId || edge.from === slotId).length,
        0
      );
      await card(slotId).locator('video').waitFor({ state: 'attached' });
      await settle();
      await editor('undo', {});
      const restored = (await current()).nodes.find((item) => item.id === slotId);
      assert.equal(restored.type, 'image');
      assert.equal(restored.assetPath, undefined);
      assert.ok(
        (await current()).edges.some((edge) => edge.from === source.id && edge.to === slotId)
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check('Web 空卡片：视频槽「导入视频」选 PNG 原位变成图片卡（同 id），可撤销', async () => {
    const { page, errors, editor, settle, current, card, blank } = await webPage({
      features: videoFeatures,
      videoStore: true,
    });
    const slotId = (await editor('add-node', { type: 'video' })).selectedIds[0];
    await editor('update-nodes', { nodes: [{ id: slotId, x: 380, y: 240 }] });
    await settle();
    await blank();
    await card(slotId).click({ position: { x: 60, y: 80 } });
    const upload = page.locator('#selection-toolbar .generation-action.web-icon-action');
    await upload.waitFor();
    const chooser = page.waitForEvent('filechooser');
    await upload.click();
    const picked = await chooser;
    assert.ok((await picked.element().evaluate((input) => input.accept)).includes('image/png'));
    await picked.setFiles({ name: '错建图.png', ...slotPng });
    await page.waitForFunction((id) => {
      const node = window.__canvasEditor.current().nodes.find((item) => item.id === id);
      return node.type === 'image' && node.assetPath;
    }, slotId);
    const node = (await current()).nodes.find((item) => item.id === slotId);
    assert.equal(node.x, 380);
    assert.equal(node.y, 240);
    assert.equal(node.title, '错建图');
    assert.equal(node.generationDraft, undefined);
    assert.equal(node.videoInputMode, undefined);
    await card(slotId).locator('img').waitFor();
    await settle();
    await editor('undo', {});
    const restored = (await current()).nodes.find((item) => item.id === slotId);
    assert.equal(restored.type, 'video');
    assert.equal(restored.assetPath, undefined);
    assert.deepEqual(errors, []);
    await page.close();
  });
  const spriteFeatures = { ...videoFeatures, spriteGen: true };
  const spriteProgress = (state, context = {}) => ({
    schema_version: 3,
    sprite_type: 'character',
    state,
    cursor: null,
    context: { sprite_name: 'hero', options: {}, flags: {}, anims: [], ...context },
  });
  const spritePage = async () => {
    const opened = await webPage({
      features: spriteFeatures,
      videoStore: true,
      projectJson: {},
      startSpriteGen: true,
    });
    const source = await opened.importImage('勇者', '#c33', 80, 80);
    await opened.editor('update-nodes', { nodes: [{ id: source.id, x: 200, y: 200 }] });
    await opened.settle();
    await opened.card(source.id).click({ position: { x: 40, y: 60 } });
    await opened.page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
    return { ...opened, source };
  };
  const startSprite = async (page, name, type) => {
    await page.locator('#selection-menu').getByRole('button', { name: '生成精灵' }).click();
    const dialog = page.locator('dialog.sprite-gen-dialog');
    await dialog.waitFor();
    await dialog.locator('input[name="sprite-name"]').fill(name);
    if (type === 'generic')
      await dialog.locator('.sprite-gen-option', { hasText: '通用序列帧' }).click();
    const count = await page.evaluate(() => (window.__canvasSpriteStarts || []).length);
    await dialog.getByRole('button', { name: '开始' }).click();
    await page.waitForFunction(
      (count) => (window.__canvasSpriteStarts || []).length > count,
      count
    );
    await dialog.waitFor({ state: 'detached' });
  };
  const spriteSection = async (current, name) =>
    (await current()).nodes.find(
      (node) => node.type === 'section' && node.spriteGen?.name === name
    );
  const spriteBadge = (page, id) =>
    page.locator('.card[data-id="' + id + '"] .canvas-group-state').textContent();
  await check(
    'Web 生成精灵：图标入口、对话框校验、建「精灵：名」分组并调用 startSpriteGen（明暗）',
    async () => {
      const { page, errors, current, source, shoot } = await spritePage();
      const labels = await menuLabels(page);
      assert.ok(labels.indexOf('生成精灵') === labels.indexOf('视频生成') + 1, labels.join(','));
      const entry = page.locator('#selection-menu').getByRole('button', { name: '生成精灵' });
      assert.ok(await entry.evaluate((item) => item.classList.contains('web-icon-action')));
      assert.equal(await entry.locator('svg').getAttribute('stroke-width'), '2');
      await entry.click();
      const dialog = page.locator('dialog.sprite-gen-dialog');
      await dialog.waitFor();
      const name = dialog.locator('input[name="sprite-name"]');
      assert.equal(await name.inputValue(), '勇者');
      await name.fill('a/b');
      assert.match(await dialog.locator('.sprite-gen-error').textContent(), /只能包含/);
      await dialog.getByRole('button', { name: '开始' }).click();
      assert.equal(await dialog.isVisible(), true);
      await name.fill('');
      await dialog.getByRole('button', { name: '开始' }).click();
      assert.equal(await dialog.locator('.sprite-gen-error').textContent(), '请填写精灵名。');
      await name.fill('hero');
      await themes(page, (theme) => shoot('v20-sprite-dialog-' + theme + '.png'));
      assert.equal(await page.evaluate(() => (window.__canvasSpriteStarts || []).length), 0);
      await dialog.locator('.sprite-gen-option', { hasText: '通用序列帧' }).click();
      await dialog.getByRole('button', { name: '开始' }).click();
      await page.waitForFunction(() => (window.__canvasSpriteStarts || []).length === 1);
      await dialog.waitFor({ state: 'detached' });
      const doc = await current();
      const section = doc.nodes.find((node) => node.type === 'section');
      assert.equal(section.title, '精灵：hero');
      assert.deepEqual(
        { ...section.spriteGen, startedAt: typeof section.spriteGen.startedAt, chatId: undefined },
        {
          name: 'hero',
          type: 'generic',
          sourceId: source.id,
          startedAt: 'number',
          dismissed: [],
          chatId: undefined,
        }
      );
      // The host reports the new chat; the group keeps it for 「打开生成对话」.
      await page.waitForFunction(
        () =>
          window.__canvasEditor.current().nodes.find((node) => node.type === 'section').spriteGen
            .chatId === 'chat-1'
      );
      const open = page
        .locator('.card[data-id="' + section.id + '"]')
        .getByRole('button', { name: '打开生成对话' });
      await open.click();
      assert.deepEqual(await page.evaluate(() => window.__canvasSpriteChats), ['chat-1']);
      assert.equal(doc.nodes.find((node) => node.id === source.id).sectionId, section.id);
      const [call] = await page.evaluate(() => window.__canvasSpriteStarts);
      assert.deepEqual(call, {
        canvasId: doc.id,
        nodeId: source.id,
        spriteName: 'hero',
        spriteType: 'generic',
        sourcePath: source.assetPath,
        unsaved: false,
      });
      await page.waitForFunction(
        (id) =>
          document.querySelector('.card[data-id="' + id + '"] .canvas-group-state')?.textContent ===
          '等待对话开始',
        section.id
      );
      // Same name reuses the group and asks the host again.
      await page
        .locator('.card[data-id="' + source.id + '"]')
        .click({ position: { x: 40, y: 60 } });
      await startSprite(page, 'hero');
      assert.equal((await current()).nodes.filter((node) => node.type === 'section').length, 1);
      assert.equal(await page.evaluate(() => window.__canvasSpriteStarts.length), 2);
      // Hook failures surface as the page error; the group stays.
      await page.evaluate(() => (window.__canvasSpriteFail = true));
      await page
        .locator('.card[data-id="' + source.id + '"]')
        .click({ position: { x: 40, y: 60 } });
      await startSprite(page, 'hero');
      await page.waitForFunction(() =>
        document.getElementById('error').textContent.includes('模拟打开对话失败')
      );
      assert.ok(await spriteSection(current, 'hero'));
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check(
    'Web 精灵同步：中途进度生成镜像卡、连线与阶段；只读菜单；删除后不再加回（明暗）',
    async () => {
      const { page, errors, editor, settle, current, card, source, shoot } = await spritePage();
      await startSprite(page, 'hero');
      const section = await spriteSection(current, 'hero');
      const base = '.build/sprite-gen/hero/_gen_images/';
      await page.evaluate(
        async ({ base }) => {
          await window.__canvasAddMedia('#e8e4dc', 96, 96, base + 'cutout_ref.png');
          await window.__canvasAddMedia('#36c', 96, 128, 'assets/image/vp_1.png');
          await window.__canvasAddMedia('#c63', 96, 128, 'assets/image/vp_2.png');
          // sprite-gen copies the chosen viewpoint (vp_2) onto ready.png.
          await window.__canvasAddMedia('#c63', 96, 128, base + 'ready.png');
        },
        { base }
      );
      const progressPath = '.build/sprite-gen/hero/_progress.json';
      await page.evaluate(
        ({ progressPath, progress }) => (window.__canvasProjectJson = { [progressPath]: progress }),
        {
          progressPath,
          progress: spriteProgress('plan', {
            flags: {
              viewpoint_candidates: [
                '/workspace/assets/image/vp_1.png',
                'assets/image/vp_2.png',
                '../evil.png',
                'assets/image/missing.png',
              ],
            },
          }),
        }
      );
      await page.evaluate(() => window.__canvasEditor.syncSprites());
      const mirrors = async () =>
        Object.fromEntries(
          (await current()).nodes
            .filter((node) => node.mirror)
            .map((node) => [node.mirror.key, node])
        );
      let byKey = await mirrors();
      assert.deepEqual(Object.keys(byKey).sort(), [
        'cutout_ref',
        'viewpoint:assets/image/vp_1.png',
        'viewpoint:assets/image/vp_2.png',
      ]);
      for (const node of Object.values(byKey)) {
        assert.equal(node.sectionId, section.id);
        assert.deepEqual(node.mirror.source, 'sprite-gen');
      }
      const edges = (await current()).edges.map((edge) => [edge.from, edge.to, edge.kind]);
      for (const [from, to] of [
        // 抠图 → 视角候选; ready.png duplicates vp_2, so vp_2 stands in for 主参考图.
        [source.id, byKey.cutout_ref.id],
        [byKey.cutout_ref.id, byKey['viewpoint:assets/image/vp_1.png'].id],
        [byKey.cutout_ref.id, byKey['viewpoint:assets/image/vp_2.png'].id],
      ])
        assert.ok(
          edges.some((edge) => edge[0] === from && edge[1] === to && edge[2] === 'image-variant')
        );
      assert.equal(await spriteBadge(page, section.id), '确认动画清单 · 待确认');
      // Header keeps the sprite name whole and drops the member count.
      const header = await page.evaluate((id) => {
        const card = document.querySelector('.card[data-id="' + id + '"]');
        const title = card.querySelector('.canvas-card-title');
        return {
          whole: title.scrollWidth <= title.clientWidth + 1,
          meta: getComputedStyle(card.querySelector('.canvas-card-meta')).display,
          tip: card.querySelector('.canvas-group-state').title,
        };
      }, section.id);
      assert.equal(header.whole, true, '分组名完整显示');
      assert.equal(header.meta, 'none', '精灵分组不显示卡片数');
      assert.match(header.tip, /请在对话中确认/);
      // Waiting for the user = orange dot; working = green.
      const dot = () =>
        page.evaluate(
          (id) =>
            getComputedStyle(
              document.querySelector('.card[data-id="' + id + '"] .canvas-group-state'),
              '::before'
            ).backgroundColor,
          section.id
        );
      assert.equal(await dot(), 'rgb(247, 107, 21)', '待确认为橘色');
      assert.equal(byKey['viewpoint:assets/image/vp_2.png'].title, '视角候选 2 · 主参考图');
      await card(byKey['viewpoint:assets/image/vp_2.png'].id).locator('img').waitFor();
      // Cards resize to their image ratio after loading; the layout follows so centre lines hold.
      await page.waitForFunction(
        ({ chain, ready, first, last }) => {
          const nodes = window.__canvasEditor.current().nodes;
          const at = (id) => nodes.find((node) => node.id === id);
          const mid = (node) => node.y + node.height / 2;
          const [a, c, d, r] = [at(chain), at(first), at(last), ready];
          return c.height !== 240 && Math.abs((c.y + d.y + d.height) / 2 - mid(a)) < 1 && !r;
        },
        {
          chain: byKey.cutout_ref.id,
          ready: null,
          first: byKey['viewpoint:assets/image/vp_1.png'].id,
          last: byKey['viewpoint:assets/image/vp_2.png'].id,
        }
      );
      byKey = await mirrors();
      // Tree layout: candidates fan out right of the cutout; 主参考图 follows the chosen one.
      const [vp1, vp2] = ['vp_1', 'vp_2'].map((n) => byKey['viewpoint:assets/image/' + n + '.png']);
      assert.ok(vp1.x > byKey.cutout_ref.x + byKey.cutout_ref.width, '候选在抠图右侧');
      assert.equal(vp1.x, vp2.x, '候选同列');
      assert.ok(vp2.y >= vp1.y + vp1.height, '候选向下排开');
      const grown = (await current()).nodes.find((node) => node.id === section.id);
      const vp = byKey['viewpoint:assets/image/vp_2.png'];
      assert.ok(
        grown.x + grown.width >= vp.x + vp.width && grown.y + grown.height >= vp.y + vp.height
      );
      // Sync is not a user action: undo goes back to before the group, redo re-syncs the mirrors.
      await settle();
      await editor('undo', {});
      assert.equal(await spriteSection(current, 'hero'), undefined);
      await editor('redo', {});
      await page.waitForFunction(
        () => window.__canvasEditor.current().nodes.filter((node) => node.mirror).length === 3
      );
      byKey = await mirrors();
      // Read-only: only 下载 remains (no addToChat hook here), no side ports, no 生成精灵.
      await settle();
      await card(byKey.cutout_ref.id).click({ position: { x: 40, y: 80 } });
      await page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
      assert.deepEqual(await menuLabels(page), ['下载 PNG', '下载 JPG', '复制为普通卡片']);
      assert.equal(await card(byKey.cutout_ref.id).locator('.canvas-port').count(), 0);
      assert.equal(await page.locator('#selection-toolbar .selection-panel').count(), 0);
      // 复制为普通卡片: the file is copied into the canvas folder; the copy sits outside the group.
      const beforeCopy = (await current()).nodes.length;
      await page.locator('#selection-menu').getByRole('button', { name: '复制为普通卡片' }).click();
      await page.waitForFunction(
        (count) => window.__canvasEditor.current().nodes.length === count + 1,
        beforeCopy
      );
      const copied = (await current()).nodes.at(-1);
      const groupNow = await spriteSection(current, 'hero');
      assert.equal(copied.mirror, undefined);
      assert.equal(copied.sectionId, undefined);
      assert.match(copied.assetPath, /^assets\/image\//);
      assert.ok(copied.x >= groupNow.x + groupNow.width, '复制卡在分组外');
      await editor('undo', {});
      await page.waitForFunction(
        (count) => window.__canvasEditor.current().nodes.length === count,
        beforeCopy
      );
      // ⌘/Ctrl+C then ⌘/Ctrl+V on a sprite card also copies it as a plain card.
      await card(byKey.cutout_ref.id).click({ position: { x: 40, y: 80 } });
      await page.keyboard.press('ControlOrMeta+c');
      await page.keyboard.press('ControlOrMeta+v');
      await page.waitForFunction(
        (count) => window.__canvasEditor.current().nodes.length === count + 1,
        beforeCopy
      );
      const pasted = (await current()).nodes.at(-1);
      assert.equal(pasted.mirror, undefined);
      assert.match(pasted.assetPath, /^assets\/image\//);
      // The copy is panned into view.
      const shown = await card(pasted.id).boundingBox();
      assert.ok(shown && shown.x >= 0 && shown.x + shown.width <= 1400, '复制卡在视野内');
      await editor('undo', {});
      // Dragging a sprite card out of its group keeps it in the group.
      const inside = byKey.cutout_ref;
      await settle();
      const from = await card(inside.id).boundingBox();
      await page.mouse.move(from.x + 40, from.y + 80);
      await page.mouse.down();
      await page.mouse.move(from.x + 40, from.y - 400, { steps: 8 });
      await page.mouse.up();
      assert.equal(
        (await current()).nodes.find((node) => node.id === inside.id).sectionId,
        section.id,
        '精灵卡拖出分组框仍属于分组'
      );
      await editor('undo', {});
      await page.mouse.move(10, 10);
      await themes(page, (theme) => shoot('v20-sprite-group-' + theme + '.png'));
      const removed = byKey['viewpoint:assets/image/vp_2.png'];
      await card(removed.id).click({ position: { x: 40, y: 80 } });
      await page.keyboard.press('Delete');
      await page.waitForFunction(
        (id) => !window.__canvasEditor.current().nodes.some((node) => node.id === id),
        removed.id
      );
      assert.deepEqual((await spriteSection(current, 'hero')).spriteGen.dismissed, [
        'viewpoint:assets/image/vp_2.png',
      ]);
      await page.evaluate(() => window.__canvasEditor.syncSprites());
      byKey = await mirrors();
      assert.equal(byKey['viewpoint:assets/image/vp_2.png'], undefined);
      assert.equal(Object.keys(byKey).length, 3);
      // A file moved away keeps its card as 素材丢失; moving it back restores the image.
      const lost = byKey['viewpoint:assets/image/vp_1.png'];
      const touchProgress = (stamp) =>
        page.evaluate(
          ({ progressPath, stamp }) => {
            window.__canvasProjectJson[progressPath].updated_at = stamp;
            return window.__canvasEditor.syncSprites();
          },
          { progressPath, stamp }
        );
      const kept = await page.evaluate(async (sourcePath) => {
        const blob = await window.__canvasDropMedia('assets/image/vp_1.png');
        window.__canvasKeptBlob = blob;
        // A plain (non-mirror) card whose file is gone: its <img> fails on the next render.
        await window.__canvasDropMedia(sourcePath);
        return Boolean(blob);
      }, source.assetPath);
      assert.ok(kept);
      await touchProgress('t1');
      await card(lost.id).locator('.card-state-missing').waitFor();
      await card(source.id).locator('.card-state-missing').waitFor();
      assert.ok(
        (await current()).nodes.some((node) => node.id === lost.id),
        '丢失的卡片保留'
      );
      assert.match(await card(lost.id).locator('.card-state-missing').textContent(), /素材丢失/);
      await page.mouse.move(10, 10);
      // shoot() waits for every image to decode, which a missing file never does.
      if (process.env.CANVAS_SCREENSHOT_DIR)
        await themes(page, (theme) =>
          page.screenshot({
            path: path.join(
              process.env.CANVAS_SCREENSHOT_DIR,
              'v20-sprite-missing-' + theme + '.png'
            ),
          })
        );
      await page.evaluate(() =>
        window.__canvasSetMedia('assets/image/vp_1.png', window.__canvasKeptBlob)
      );
      await touchProgress('t2');
      await card(lost.id).locator('img').waitFor();
      assert.equal(await card(lost.id).locator('.card-state-missing').count(), 0);
      // 重新整理: a card the user dragged away goes back into the tree; undo restores the drag.
      const laidOut = (await mirrors()).ready;
      await settle();
      const box = await card(laidOut.id).boundingBox();
      await page.mouse.move(box.x + 40, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 140, box.y + 260, { steps: 6 });
      await page.mouse.up();
      await page.waitForFunction(
        ({ id, y }) => window.__canvasEditor.current().nodes.find((n) => n.id === id).y > y + 100,
        { id: laidOut.id, y: laidOut.y }
      );
      const moved = (await mirrors()).ready;
      await settle();
      // The group's top-left blank strip stays on screen however far the tree grows.
      await card(section.id).click({ position: { x: 12, y: 52 } });
      await page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
      assert.deepEqual(await menuLabels(page), ['重新整理', '取消分组', '删除分组']);
      await page.locator('#selection-menu').getByRole('button', { name: '重新整理' }).click();
      await page.waitForFunction(
        ({ id, x, y }) => {
          const node = window.__canvasEditor.current().nodes.find((n) => n.id === id);
          return node.x === x && node.y === y;
        },
        { id: laidOut.id, x: laidOut.x, y: laidOut.y }
      );
      const tidied = await current();
      assert.ok(
        tidied.edges.some((edge) => edge.from === byKey.cutout_ref.id && edge.to === lost.id),
        '抠图 → 视角候选 连线仍在'
      );
      await settle();
      await editor('undo', {});
      const undone = (await current()).nodes.find((node) => node.id === laidOut.id);
      assert.deepEqual([undone.x, undone.y], [moved.x, moved.y]);
      await editor('redo', {});
      // Host hides the panel: no poll is pending; showing it again catches up right away.
      const before = await page.evaluate(() => {
        window.__canvasEditor.setPanelVisible(false);
        return window.__canvasCalls.json.length;
      });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__canvasCalls.json.length), before);
      await page.evaluate(() => window.__canvasEditor.setPanelVisible(true));
      await page.waitForFunction((count) => window.__canvasCalls.json.length > count, before);
      // Mirrors are only read: the sync asked for these files and wrote nothing back.
      const reads = await page.evaluate(() => window.__canvasCalls.json);
      assert.ok(reads.includes(progressPath) && reads.includes('assets/sprites/hero/sprite.json'));
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check(
    'Web 精灵同步：完成态裁边精灵表生成可播放的动画卡与序列帧卡，阶段为已完成（明暗）',
    async () => {
      const { page, errors, current, card, settle, shoot } = await spritePage();
      await startSprite(page, 'hero');
      const section = await spriteSection(current, 'hero');
      await page.evaluate(async () => {
        await window.__canvasAddMedia(
          '#3a7',
          96,
          96,
          '.build/sprite-gen/hero/_gen_images/ready.png'
        );
        const atlas = document.createElement('canvas');
        atlas.width = 64;
        atlas.height = 32;
        const context = atlas.getContext('2d');
        context.fillStyle = '#ff0000';
        context.fillRect(0, 0, 24, 32);
        context.fillStyle = '#0000ff';
        context.fillRect(24, 0, 24, 32);
        const blob = await new Promise((resolve) => atlas.toBlob(resolve, 'image/png'));
        window.__canvasSetMedia('assets/sprites/hero/walk/spritesheet.png', blob);
        const video = new Uint8Array(await window.__canvasVideoBytes());
        window.__canvasSetMedia(
          '.build/sprite-gen/hero/_gen_videos/walk/anim.mp4',
          new Blob([video], { type: 'video/webm' })
        );
      });
      const frame = (x, offsetX, duration) => ({
        frame: { x, y: 0, w: 24, h: 32 },
        rotated: false,
        trimmed: true,
        spriteSourceSize: { x: offsetX, y: 4, w: 24, h: 32 },
        sourceSize: { w: 40, h: 40 },
        duration,
      });
      await page.evaluate((files) => (window.__canvasProjectJson = files), {
        '.build/sprite-gen/hero/_progress.json': spriteProgress('done', {
          anims: [
            {
              id: 'walk',
              play_type: 'loop',
              action: '走',
              status: 'done',
              video_ref: 'https://cdn.example/x.mp4',
            },
          ],
        }),
        'assets/sprites/hero/sprite.json': {
          meta: { relatedMultiPacks: ['walk/spritesheet.json'] },
        },
        'assets/sprites/hero/walk/spritesheet.json': {
          frames: { walk_0001: frame(0, 8, 120), walk_0002: frame(24, 6, 120) },
          animations: [{ name: 'walk', frames: ['walk_0001', 'walk_0002'], repeat: -1, fps: 8 }],
          meta: { image: 'spritesheet.png', size: { w: 64, h: 32 } },
        },
      });
      await page.evaluate(() => window.__canvasEditor.syncSprites());
      const doc = await current();
      const byKey = Object.fromEntries(
        doc.nodes.filter((node) => node.mirror).map((node) => [node.mirror.key, node])
      );
      assert.deepEqual(Object.keys(byKey).sort(), [
        'animation:walk',
        'ready',
        'sequence:walk',
        'video:walk',
      ]);
      const kinds = [
        [byKey.ready.id, byKey['video:walk'].id, 'image-to-video'],
        [byKey['video:walk'].id, byKey['sequence:walk'].id, 'sequence-source'],
        [byKey['sequence:walk'].id, byKey['animation:walk'].id, 'sequence-animation'],
      ];
      for (const [from, to, kind] of kinds)
        assert.ok(
          doc.edges.some((edge) => edge.from === from && edge.to === to && edge.kind === kind),
          kind
        );
      assert.equal(byKey['sequence:walk'].sourceVideoId, byKey['video:walk'].id);
      // A mirrored video keeps only 复制为普通卡片 (no empty selection pill above it).
      await settle();
      await card(byKey['video:walk'].id).click({ position: { x: 40, y: 40 } });
      await page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
      assert.deepEqual(await menuLabels(page), ['复制为普通卡片']);
      await page.mouse.click(10, 10);
      assert.equal(byKey['animation:walk'].frameSetInfo.frames[1].offsetX, 6);
      assert.equal(await spriteBadge(page, section.id), '已完成');
      // The tree grows to the right (source → video → sequence → animation); fit it on screen.
      await page.locator('#fit-canvas').click();
      const sequence = card(byKey['sequence:walk'].id);
      await sequence.locator('.sequence-result-grid canvas').nth(1).waitFor();
      assert.equal(await sequence.locator('.sequence-result-grid canvas').count(), 2);
      assert.equal(
        await sequence.locator('.sequence-edit-button, .sequence-animation-button').count(),
        0
      );
      const animation = card(byKey['animation:walk'].id);
      const pixel = () =>
        animation.locator('canvas.animation-preview').evaluate((canvas) => ({
          index: canvas.dataset.frameIndex,
          rgba: Array.from(canvas.getContext('2d').getImageData(160, 120, 1, 1).data),
        }));
      await page.waitForFunction(
        (id) =>
          document.querySelector('.card[data-id="' + id + '"] canvas.animation-preview')?.dataset
            .frameIndex === '0',
        byKey['animation:walk'].id
      );
      const first = await pixel();
      assert.deepEqual(first.rgba.slice(0, 3), [255, 0, 0], '首帧按偏移绘制且非空白');
      await animation.getByRole('button', { name: '播放动画' }).click();
      await page.waitForFunction(
        (id) =>
          document.querySelector('.card[data-id="' + id + '"] canvas.animation-preview')?.dataset
            .frameIndex === '1',
        byKey['animation:walk'].id
      );
      const second = await pixel();
      assert.deepEqual(second.rgba.slice(0, 3), [0, 0, 255], '播放到第 2 帧');
      // Offsets matter: frame 1 sits 8px into the 40px box (scaled ×6), so x=60 stays empty.
      const edge = await animation
        .locator('canvas.animation-preview')
        .evaluate((canvas) => canvas.getContext('2d').getImageData(60, 120, 1, 1).data[3]);
      assert.equal(edge, 0);
      await animation.getByRole('button', { name: '暂停' }).click();
      await themes(page, (theme) => shoot('v20-sprite-done-' + theme + '.png'));
      assert.deepEqual(errors, []);
      await page.close();
    }
  );
  await check('生成精灵入口：默认外观与缺少 startSpriteGen 时都不显示', async () => {
    for (const config of [
      { features: { spriteGen: true }, startSpriteGen: true, projectJson: {} },
      { features: spriteFeatures, appearance: 'web', projectJson: {} },
    ]) {
      const { page, errors } = await openCanvas(config);
      const assetPath = await page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
      await page.evaluate(
        (assetPath) =>
          window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '来源图' }),
        assetPath
      );
      await page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
      assert.equal(
        await page.locator('#selection-menu').getByRole('button', { name: '生成精灵' }).count(),
        0
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  });
  await check('默认外观：视频/分组入口与文案不变，无 Web 菜单项', async () => {
    const { page, errors } = await openCanvas({ videoStore: true });
    assert.equal(await page.locator('#add-video').textContent(), '视频输入卡');
    assert.equal(await page.locator('#create-section').textContent(), '新建分区');
    assert.equal(await page.locator('[data-menu-scope="web"]').count(), 0);
    assert.equal(await page.locator('[data-canvas-action="import-video"]').count(), 0);
    const assetPath = await page.evaluate(() => window.__canvasAddMedia('#c33', 40, 40));
    await page.evaluate(
      (assetPath) =>
        window.__canvasEditor.importProjectAsset({ assetPath, kind: 'image', title: '来源图' }),
      assetPath
    );
    await page.waitForFunction(() => !document.getElementById('selection-menu').hidden);
    const entry = page.locator('#selection-menu').getByRole('button', { name: '视频生成' });
    assert.equal(await entry.textContent(), '视频生成');
    assert.equal(await entry.evaluate((item) => item.classList.contains('web-icon-action')), false);
    await entry.click();
    const panel = page.locator('#selection-toolbar .generation-panel-video');
    await panel.waitFor();
    assert.equal(await panel.locator('[data-role]').count(), 0);
    assert.equal(
      await panel
        .locator('select')
        .nth(3)
        .evaluate((item) => item.options[item.selectedIndex].textContent),
      '4'
    );
    // The default page keeps its own 2.5 cost confirmation (dismissed here, so nothing is sent).
    const dialogs = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    await panel.locator('select').nth(1).selectOption('2.5');
    await panel.locator('textarea').first().fill('角色挥剑');
    await panel.locator('.generation-action-primary').click();
    for (let tries = 0; tries < 20 && !dialogs.length; tries++) await page.waitForTimeout(50);
    assert.deepEqual(dialogs, ['按当前参数开始生成视频？']);
    assert.equal(await page.evaluate(() => window.__canvasCalls.video?.length || 0), 0);
    assert.deepEqual(errors, []);
    await page.close();
  });
} finally {
  await browser.close();
}
console.log('全部通过：' + results.length + ' 项');
