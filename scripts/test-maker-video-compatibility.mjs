import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PNG } from 'pngjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-video-compatibility-'));
const results = [];
const errors = [];
let browser;
let server;
try {
  const playwrightModule =
    process.env.PLAYWRIGHT_MODULE ||
    path.join(
      execSync('npm root -g', { encoding: 'utf8', windowsHide: true }).trim(),
      'playwright/index.mjs'
    );
  const { chromium } = await import(pathToFileURL(playwrightModule).href);
  const bundle = path.join(temporary, 'harness.mjs');
  await build({
    stdin: {
      contents:
        'export {startConsoleServer} from "./src/maker/console/server.ts"; export {ConsoleProjects} from "./src/maker/console/projects.ts"; export {MakerCanvasFiles} from "./src/maker/canvas/files.ts";',
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
  const { startConsoleServer, ConsoleProjects, MakerCanvasFiles } = await import(
    pathToFileURL(bundle).href
  );
  const project = path.join(temporary, 'project');
  fs.mkdirSync(path.join(project, '.maker-mcp'), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.maker-mcp/config.json'),
    JSON.stringify({ project_id: 'video-compatibility-test' })
  );
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  const entry = registry.add(project);
  const files = new MakerCanvasFiles(project);
  const document = await files.create('视频兼容性验收');
  await files.setActiveCanvasId(document.id);
  server = await startConsoleServer({
    registry,
    html: '<!doctype html><title>视频兼容性验收</title>',
    execute: async () => {
      throw Error('不执行项目任务');
    },
    version: 'compatibility-test',
    remoteProxyManager: {
      listTools: async () => [],
      closeAll: async () => {},
      callTool: async () => {
        throw Error('不调用付费生成');
      },
    },
  });
  for (let index = 0; index < 20; index++) {
    const frame = new PNG({ width: 128, height: 96 });
    for (let row = 0; row < 96; row++)
      for (let column = 0; column < 128; column++) {
        const actor = column >= 30 + index && column < 65 + index && row >= 20 && row < 78;
        frame.data.set(
          index === 0
            ? [253, 251, 252, 255]
            : actor
              ? [20, 180, 220, 255]
              : [153 + (index % 3), 3, 84, 255],
          (row * 128 + column) * 4
        );
      }
    fs.writeFileSync(
      path.join(temporary, 'frame' + String(index).padStart(2, '0') + '.png'),
      PNG.sync.write(frame)
    );
  }
  const variants = [
    {
      name: 'H264-faststart',
      extension: 'mp4',
      type: 'video/mp4',
      flags: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
    },
    {
      name: 'H264-long-gop',
      extension: 'mp4',
      type: 'video/mp4',
      flags: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '250', '-bf', '3'],
    },
    {
      name: 'H264-variable-rate',
      extension: 'mp4',
      type: 'video/mp4',
      flags: [
        '-vf',
        "setpts='if(lt(N,10),N/(10*TB),(1+(N-10)/5)/TB)'",
        '-fps_mode',
        'vfr',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
      ],
    },
    {
      name: 'VP9-WebM',
      extension: 'webm',
      type: 'video/webm',
      flags: ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '20'],
    },
    {
      name: 'H264-MOV',
      extension: 'mov',
      type: 'video/quicktime',
      flags: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
    },
  ];
  for (const variant of variants) {
    const target = path.join(temporary, variant.name + '.' + variant.extension);
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        '10',
        '-i',
        path.join(temporary, 'frame%02d.png'),
        ...variant.flags,
        target,
      ],
      { windowsHide: true }
    );
    const imported = await files.importVideo(document.id, fs.readFileSync(target), variant.type);
    variant.assetPath = imported.relativePath;
  }
  const preset = await files.prepareTemplate('7e1cb6ad-732f-4dc3-a951-000000000001', document.id);
  variants.push({
    name: '内置真实生成视频',
    assetPath: preset.nodes.find((node) => node.type === 'video-source').assetPath,
    real: true,
  });
  if (process.env.MAKER_SEQUENCE_TEST_VIDEO) {
    const imported = await files.importVideo(
      document.id,
      fs.readFileSync(process.env.MAKER_SEQUENCE_TEST_VIDEO),
      'video/mp4'
    );
    variants.push({
      name: '用户实际视频（边缘连通）',
      assetPath: imported.relativePath,
      real: true,
      actual: true,
    });
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 960 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort()
  );
  await page.goto(server.origin + '/canvas?project=' + entry.key);
  await page.locator('.workspace-add').waitFor();
  for (const variant of variants) {
    const result = await page.evaluate(
      async ({ name, url, real, actual }) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        try {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('metadata timeout')), 15000);
            video.onloadedmetadata = () => {
              clearTimeout(timer);
              resolve();
            };
            video.onerror = () => {
              clearTimeout(timer);
              reject(Error('decode error'));
            };
            video.src = url;
          });
          const processor = window.createSequenceProcessor({
            backgroundRemoval: window.createBackgroundRemoval(),
            maxSourceSide: 1024,
            maxOutputSide: 512,
            maxAtlasSide: 4096,
            estimateFrameCount: (start, end, fps) => Math.ceil((end - start) * fps),
            maxAtlasFrameCount: () => 100,
            duplicateFrameIndices: () => [],
          });
          const signal = new AbortController().signal;
          const frames = await processor.extract(
            video,
            0,
            Math.min(actual ? 3 : 2, video.duration),
            actual ? 4 : 10,
            signal,
            () => {}
          );
          const output = await processor.cutout(
            frames,
            '#ff00ff',
            actual ? 48 : 35,
            signal,
            () => {},
            actual ? 'connected' : 'chroma'
          );
          const previews = [];
          for (const frame of output.slice(0, 5)) {
            const bitmap = await createImageBitmap(frame.blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            previews.push({
              data: canvas.toDataURL(),
              background: context.getImageData(0, 0, 1, 1).data[3],
              foreground: context.getImageData(60, 50, 1, 1).data[3],
            });
          }
          let gallery = document.getElementById('compatibility-gallery');
          if (!gallery) {
            gallery = document.createElement('div');
            gallery.id = 'compatibility-gallery';
            gallery.style.cssText =
              'position:fixed;inset:20px;z-index:9999;padding:18px;overflow:auto;background:#171e23;color:#eee';
            document.body.append(gallery);
          }
          const heading = document.createElement('h3');
          heading.textContent =
            name + '：抽取 ' + frames.length + ' 帧 → 保留 ' + output.length + ' 帧';
          gallery.append(heading);
          for (const preview of previews) {
            const image = document.createElement('img');
            image.src = preview.data;
            image.style.cssText =
              'width:100px;height:90px;object-fit:contain;margin-right:10px;background:repeating-conic-gradient(#29333b 0% 25%,#20282e 0% 50%) 0/12px 12px';
            gallery.append(image);
          }
          return {
            name,
            extracted: frames.length,
            output: output.length,
            times: output.map((frame) => frame.time),
            previews: previews.map(({ background, foreground }) => ({ background, foreground })),
            real,
            actual,
          };
        } finally {
          video.removeAttribute('src');
          video.load();
        }
      },
      {
        name: variant.name,
        real: variant.real,
        actual: variant.actual,
        url:
          server.origin +
          '/api/projects/' +
          entry.key +
          '/canvas-media?path=' +
          encodeURIComponent(variant.assetPath),
      }
    );
    assert.ok(result.output > 0);
    if (!variant.real) {
      assert.equal(result.output, result.extracted - 1, JSON.stringify(result));
      for (const preview of result.previews) {
        assert.equal(preview.background, 0);
        assert.equal(preview.foreground, 255);
      }
    }
    results.push(result);
    console.log('PASS ' + variant.name);
  }
  const audioPath = path.join(temporary, 'audio-only.mp4');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:a',
      'aac',
      audioPath,
    ],
    { windowsHide: true }
  );
  const invalidVideos = [
    { name: '仅音轨', bytes: fs.readFileSync(audioPath) },
    {
      name: '截断损坏的 MP4',
      bytes: fs.readFileSync(path.join(temporary, 'H264-long-gop.mp4')).subarray(0, 32),
    },
  ];
  for (const invalid of invalidVideos) {
    const imported = await files.importVideo(document.id, invalid.bytes, 'video/mp4');
    const result = await page.evaluate(
      async ({ url, validUrl }) => {
        const source = { id: 'source', type: 'video-source', assetPath: url };
        const sequence = {
          id: 'sequence',
          type: 'sequence',
          sourceVideoId: source.id,
          sequenceSettings: { start: 0, end: 1, fps: 4, cutout: true, width: 128, height: 96 },
          assetPath: 'old-atlas.png',
        };
        const documentState = {
          nodes: [source, sequence],
          edges: [{ from: source.id, to: sequence.id, kind: 'sequence-source' }],
        };
        const video = document.createElement('video');
        const processor = window.createSequenceProcessor({
          maxSourceSide: 1024,
          estimateFrameCount: () => 4,
        });
        const controller = window.createSequenceUiController({
          store: { mediaUrl: (value) => value },
          processor,
          video,
          getDocument: () => documentState,
          remember() {},
          markDirty() {},
          render() {},
          refreshCard() {},
          publishState() {},
          setError() {},
          defaultSettings: () => sequence.sequenceSettings,
          estimateFrameCount: () => 4,
          maxFrameCount: () => 100,
          maxInputFrameCount: () => 100,
        });
        try {
          await controller.action(sequence.id, 'extract');
          const failed = {
            status: controller.view(sequence.id).run.status,
            message: controller.view(sequence.id).run.error,
            busy: controller.isBusy,
            path: sequence.assetPath,
          };
          source.assetPath = validUrl;
          await controller.action(sequence.id, 'extract');
          return {
            failed,
            recovered: controller.view(sequence.id).run.status,
            frames: controller.view(sequence.id).run.frames.length,
            busy: controller.isBusy,
          };
        } finally {
          controller.clear();
          video.removeAttribute('src');
          video.load();
        }
      },
      {
        url:
          server.origin +
          '/api/projects/' +
          entry.key +
          '/canvas-media?path=' +
          encodeURIComponent(imported.relativePath),
        validUrl:
          server.origin +
          '/api/projects/' +
          entry.key +
          '/canvas-media?path=' +
          encodeURIComponent(variants[0].assetPath),
      }
    );
    assert.equal(result.failed.status, 'failed');
    assert.match(result.failed.message, /画面轨道|无法解码/);
    assert.equal(result.failed.busy, false);
    assert.equal(result.failed.path, 'old-atlas.png');
    assert.equal(result.recovered, 'ready');
    assert.equal(result.frames, 4);
    assert.equal(result.busy, false);
    results.push({ name: invalid.name, ...result });
    console.log('PASS ' + invalid.name + '失败保留旧结果、释放占用并可重新抽帧');
  }
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(temporary, 'video-compatibility.png') });
} finally {
  await browser?.close();
  await server?.close();
  fs.writeFileSync(
    path.join(temporary, 'checks.json'),
    JSON.stringify({ results, errors }, null, 2)
  );
  console.log('验收目录：' + temporary);
}
