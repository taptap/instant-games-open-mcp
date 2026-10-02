import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PNG } from 'pngjs';
import yauzl from 'yauzl';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-canvas-export-'));
let browser;
const makerExports = [];

function luaValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return '{' + value.map(luaValue).join(',') + '}';
  return '{' + Object.entries(value).map(([key, item]) => '[' + luaValue(key) + ']=' + luaValue(item)).join(',') + '}';
}

function verifyMakerPlayback() {
  const spriteDir = process.env.MAKER_SPRITE_DIR;
  const dogAnimator = process.env.MAKER_DOG_ANIMATOR;
  if (!spriteDir || !dogAnimator) {
    console.log('SKIP Maker Lua 播放器验证：设置 MAKER_SPRITE_DIR 和 MAKER_DOG_ANIMATOR 后运行。');
    return;
  }
  const cases = makerExports.map(item => ({ ...item, metadata: item.metadata || {}, config: item.config || '' }));
  const script = [
    'local cases = ' + luaValue(cases),
    'local selected',
    'cjson = { decode = function() return selected.metadata end }',
    'cache = { GetFile = function() return { ReadString = function() return "{}" end, Close = function() end } end }',
    'local Sheet = dofile(' + luaValue(path.join(spriteDir, 'SpriteSheet.lua')) + ')',
    'local Animator = dofile(' + luaValue(path.join(spriteDir, 'SpriteAnimator.lua')) + ')',
    'local DogAnimator = dofile(' + luaValue(dogAnimator) + ')',
    'for _, item in ipairs(cases) do',
    '    selected = item',
    '    if item.mode == "atlas" then',
    '        local sheet = assert(Sheet.New("image/" .. item.folder .. "/spritesheet.json"))',
    '        assert(sheet:GetFrameCount() == 2)',
    '        local image, width, height = sheet:GetPageForFrame(1)',
    '        assert(image == "image/" .. item.folder .. "/spritesheet.png" and width == 64 and height == 32)',
    '        assert(sheet:GetFrame(1).frame.w == 32 and sheet:GetFrame(1).frame.x == 32)',
    '        assert(sheet:GetFrame(2).frame.x == 0 and sheet:GetFrame(1).duration == 250)',
    '        local animator = Animator.New()',
    '        assert(animator:Play(sheet, "left"))',
    '        assert(animator:GetCurrentFrame() == 1)',
    '        animator:Update(0.26, sheet)',
    '        assert(animator:GetCurrentFrame() == 2)',
    '        animator:Update(0.26, sheet)',
    '        assert(animator:IsPlaying() == item.loop)',
    '        assert(animator:GetCurrentFrame() == (item.loop and 1 or 2))',
    '    else',
    '        local clip = assert(load(item.config, "animation.lua", "t", {}))()',
    '        assert(clip.name == "left" and clip.loop == item.loop)',
    '        assert(clip.width == 32 and clip.height == 32 and clip.fps == 4 and clip.frameCount == 2)',
    '        local animator = DogAnimator.new({left=clip}, {"left"})',
    '        local root = "image/" .. item.folder .. "/frames/"',
    '        assert(animator:GetFramePath() == root .. "frame_0001.png")',
    '        animator:Update(0.26)',
    '        assert(animator:GetFramePath() == root .. "frame_0002.png")',
    '        animator:Update(0.26)',
    '        assert(animator:GetFramePath() == root .. (item.loop and "frame_0001.png" or "frame_0002.png"))',
    '    end',
    'end',
    'print("PASS 实际 Maker SpriteSheet/SpriteAnimator 与狗狗项目播放器读取导出配置；帧位置、路径、时长、循环及单次播放正确（无引擎渲染）")',
  ].join('\n');
  console.log(execFileSync(process.env.LUA_COMMAND || 'lua', ['-'], { input: script, encoding: 'utf8' }).trim());
}
async function readZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const entries = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', entry => zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) return reject(error);
        const chunks = [];
        stream.on('error', reject);
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => { entries.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
      }));
      zip.readEntry();
    });
  });
}
try {
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright/index.mjs')).href);
  const bundle = path.join(temporary, 'page.mjs');
  await build({ stdin: { contents: 'export { getCanvasPageHtml } from "./src/maker/canvas/page.ts";', resolveDir: repo }, bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' });
  const { getCanvasPageHtml } = await import(pathToFileURL(bundle).href);
  const html = getCanvasPageHtml();
  const png = new PNG({ width: 64, height: 32 });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = (offset / 4) % 64 < 32 ? 220 : 40;
    png.data[offset + 1] = (offset / 4) % 64 < 32 ? 120 : 210;
    png.data[offset + 2] = 40;
    png.data[offset + 3] = offset % 32 === 0 ? 0 : 255;
  }
  const image = PNG.sync.write(png);
  fs.writeFileSync(path.join(temporary, 'source.png'), image);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', path.join(temporary, 'source.png'), '-t', '0.5', '-pix_fmt', 'yuv420p', path.join(temporary, 'source.mp4')]);
  const video = fs.readFileSync(path.join(temporary, 'source.mp4'));
  const canvasId = randomUUID();
  const frameSetInfo = { fps: 4, frameCount: 2, width: 64, height: 32, columns: 2, rows: 1, frames: [
    { index: 3, time: 0.75, x: 32, y: 0, width: 32, height: 32 },
    { index: 7, time: 1.75, x: 0, y: 0, width: 32, height: 32 },
  ] };
  const nodes = ['image', 'video-source', 'sequence', 'animation', 'image', 'note'].map((type, index) => ({
    id: randomUUID(), type, title: ['角色图片', '角色视频', '抽帧结果', '序列帧动画', '空图片卡', '备注'][index],
    x: 40 + (index % 3) * 380, y: 50 + Math.floor(index / 3) * 400, width: 300, height: 280,
    ...(index < 4 ? { assetPath: type === 'video-source' ? 'assets/video/source.mp4' : 'assets/image/source.png' } : {}),
    ...(['sequence', 'animation'].includes(type) ? { frameSetInfo } : {}),
  }));
  nodes[0].title = '01 蓝银战士 · 生图参考';
  nodes[1].exportDirection = 'left';
  const edges = ['image-to-video', 'sequence-source', 'sequence-animation'].map((kind, index) => ({ id: randomUUID(), from: nodes[index].id, to: nodes[index + 1].id, kind }));
  let canvas = { id: canvasId, title: '资源导出交互测试', revision: 0, viewport: { x: 0, y: 0, scale: 1 }, nodes, edges };
  const errors = [];
  const downloads = [];
  const writes = [];
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR:', error.message); });
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.addInitScript(() => { window.showSaveFilePicker = undefined; });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') writes.push(url.pathname);
    if (url.pathname === '/canvas') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname.endsWith('/canvas-media')) return route.fulfill({ contentType: url.search.includes('.mp4') ? 'video/mp4' : 'image/png', body: url.search.includes('.mp4') ? video : image });
    let data;
    if (url.pathname.endsWith('/canvases')) data = [{ id: canvasId, title: canvas.title }];
    else if (url.pathname.endsWith('/active')) data = { canvasId };
    else if (url.pathname.endsWith('/generation')) data = [];
    else if (url.pathname.endsWith('/canvases/' + canvasId)) {
      if (request.method() === 'PUT') canvas = { ...request.postDataJSON(), revision: canvas.revision + 1 };
      data = canvas;
    }
    else throw new Error('非预期请求：' + url.pathname);
    return route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1/canvas?project=export-test');
  await page.locator('.card').first().waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  await page.waitForFunction(() => document.getElementById('status').textContent === '已保存');
  writes.length = 0;
  const menu = page.locator('#canvas-context-menu');
  async function openExport(index) {
    await page.locator('.card[data-id="' + nodes[index].id + '"]').click({ button: 'right', position: { x: 35, y: 35 } });
    await menu.getByRole('button', { name: '导出资源 ▸', exact: true }).click();
  }
  async function download(index, label, extension, loop = true) {
    await openExport(index);
    if (extension === 'zip') {
      assert.equal(await menu.getByRole('checkbox', { name: '循环播放', exact: true }).isChecked(), true);
      await menu.getByRole('checkbox', { name: '循环播放', exact: true }).setChecked(loop);
    }
    const [result] = await Promise.all([page.waitForEvent('download'), menu.getByRole('button', { name: label, exact: true }).click()]);
    assert.ok(result.suggestedFilename().length <= 15);
    assert.match(result.suggestedFilename(), new RegExp('[A-Z0-9]{6}\\.' + extension + '$'));
    const kind = extension === 'zip' ? label.includes('图集') ? '集' : '帧' : extension === 'mp4' ? '视' : '图';
    assert.ok(result.suggestedFilename().startsWith('蓝银战' + (index > 0 ? '左' : '') + kind));
    assert.equal(new Set(downloads).size, downloads.length);
    const filename = path.join(temporary, index + '.' + extension);
    await result.saveAs(filename);
    assert.equal(await result.failure(), null);
    return fs.readFileSync(filename);
  }
  const exportedImage = PNG.sync.read(await download(0, 'PNG 图片', 'png'));
  assert.equal(exportedImage.width, 64);
  assert.equal(exportedImage.height, 32);
  assert.equal(exportedImage.data[3], 0);
  const jpeg = await download(0, 'JPG 图片', 'jpg');
  assert.deepEqual([...jpeg.subarray(0, 3)], [255, 216, 255]);
  assert.deepEqual(await download(1, '视频原文件', 'mp4'), video);
  for (const index of [2, 3]) {
    for (const mode of ['atlas', 'frames']) {
      const loop = index === 2;
      const zip = await readZip(await download(index, mode === 'atlas' ? 'Maker 图集包（推荐）' : 'Maker 单图包', 'zip', loop));
      const prefix = downloads.at(-1).slice(0, -4) + '/';
      assert.deepEqual([...zip.keys()].sort(), [prefix + 'README.md', ...(mode === 'atlas'
        ? [prefix + 'spritesheet.json', prefix + 'spritesheet.png']
        : [prefix + 'animation.lua', prefix + 'frames/frame_0001.png', prefix + 'frames/frame_0002.png'])].sort());
      assert.ok(zip.get(prefix + 'README.md').toString().includes('assets/image/' + prefix));
      let metadata;
      if (mode === 'atlas') {
        metadata = JSON.parse(zip.get(prefix + 'spritesheet.json'));
        assert.deepEqual(metadata.meta, { image: 'spritesheet.png', size: { w: 64, h: 32 }, scale: '1' });
        assert.deepEqual(metadata.animations, [{ name: 'left', frames: ['left_0001', 'left_0002'], direction: 'forward', repeat: loop ? 0 : 1, fps: 4 }]);
        assert.deepEqual(zip.get(prefix + metadata.meta.image), image);
        makerExports.push({ mode, folder: prefix.slice(0, -1), loop, metadata });
      } else {
        const config = zip.get(prefix + 'animation.lua').toString();
        assert.ok(config.includes('framePattern = "image/' + prefix + 'frames/frame_%04d.png"'));
        assert.ok(config.includes('loop = ' + loop));
        assert.ok(config.includes('frameCount = 2'));
        makerExports.push({ mode, folder: prefix.slice(0, -1), loop, config });
      }
      for (const [frameIndex, sourceFrame] of frameSetInfo.frames.entries()) {
        const rect = mode === 'atlas' ? metadata.frames[frameIndex].frame : { x: 0, y: 0, w: 32, h: 32 };
        if (mode === 'atlas') {
          const frame = metadata.frames[frameIndex];
          assert.equal(frame.trimmed, false);
          assert.equal(frame.rotated, false);
          assert.equal(frame.duration, 250);
          assert.deepEqual(frame.sourceSize, { w: 32, h: 32 });
          assert.deepEqual(frame.spriteSourceSize, { x: 0, y: 0, w: 32, h: 32 });
          assert.deepEqual(rect, { x: sourceFrame.x, y: sourceFrame.y, w: 32, h: 32 });
        }
        const file = mode === 'atlas' ? 'spritesheet.png' : 'frames/frame_' + String(frameIndex + 1).padStart(4, '0') + '.png';
        const exported = PNG.sync.read(zip.get(prefix + file));
        assert.equal(exported.width, mode === 'atlas' ? 64 : 32);
        assert.equal(exported.height, 32);
        for (let row = 0; row < 32; row++) {
          for (let column = 0; column < 32; column++) {
            const sourceOffset = ((row + frameSetInfo.frames[frameIndex].y) * 64 + column + frameSetInfo.frames[frameIndex].x) * 4;
            const targetOffset = ((row + rect.y) * exported.width + column + rect.x) * 4;
            assert.equal(exported.data[targetOffset + 3], png.data[sourceOffset + 3]);
            if (png.data[sourceOffset + 3]) assert.deepEqual(exported.data.subarray(targetOffset, targetOffset + 4), png.data.subarray(sourceOffset, sourceOffset + 4));
          }
        }
      }
    }
  }
  await page.reload();
  await download(1, '视频原文件', 'mp4');
  await page.locator('#board').click({ position: { x: 1200, y: 850 } });
  await page.locator('.card[data-id="' + nodes[0].id + '"]').click({ position: { x: 35, y: 35 } });
  await page.getByLabel('下载图片', { exact: true }).click();
  const [toolbarDownload] = await Promise.all([page.waitForEvent('download'), page.locator('.image-download-options').getByRole('button', { name: '导出为 PNG', exact: true }).click()]);
  assert.match(toolbarDownload.suggestedFilename(), /^蓝银战图[A-Z0-9]{6}\.png$/);
  assert.equal(new Set(downloads).size, downloads.length);
  await page.locator('.card[data-id="' + nodes[4].id + '"]').click({ button: 'right', position: { x: 20, y: 20 } });
  assert.equal(await menu.getByRole('button', { name: '导出资源 ▸', exact: true }).isDisabled(), true);
  await page.locator('#board').click({ position: { x: 1200, y: 850 } });
  await page.locator('.card[data-id="' + nodes[5].id + '"]').click({ button: 'right', position: { x: 20, y: 20 } });
  assert.equal(await menu.locator('[data-resource-export]').count(), 0);
  await page.locator('#board').click({ button: 'right', position: { x: 1200, y: 850 } });
  assert.equal(await menu.locator('[data-resource-export]').count(), 0);
  await openExport(3);
  if (process.env.MAKER_RESOURCE_EXPORT_SCREENSHOT) await menu.screenshot({ path: process.env.MAKER_RESOURCE_EXPORT_SCREENSHOT });
  const maximumFrames = canvas.nodes.find(node => node.id === nodes[3].id);
  maximumFrames.frameSetInfo = {
    ...frameSetInfo,
    frameCount: 120,
    frames: Array.from({ length: 120 }, (_, index) => ({ ...frameSetInfo.frames[index % 2], index, time: index / 4 })),
  };
  await page.reload();
  const maximumZip = await readZip(await download(3, 'Maker 单图包', 'zip'));
  assert.equal(maximumZip.size, 122);
  const maximumPrefix = downloads.at(-1).slice(0, -4) + '/';
  assert.ok(maximumZip.has(maximumPrefix + 'frames/frame_0120.png'));
  assert.ok(maximumZip.get(maximumPrefix + 'animation.lua').toString().includes('frameCount = 120'));
  const downloaded = downloads.length;
  const animation = canvas.nodes.find(node => node.id === nodes[3].id);
  animation.frameSetInfo = { ...animation.frameSetInfo, width: 128 };
  await page.reload();
  await openExport(3);
  await menu.getByRole('button', { name: 'Maker 图集包（推荐）', exact: true }).click();
  await page.locator('.canvas-log-preview').getByText(/图集尺寸、帧数或帧率无效/).waitFor();
  assert.equal(downloads.length, downloaded);
  assert.deepEqual(writes.filter(requestPath => !requestPath.endsWith('/canvases/active')), []);
  assert.deepEqual(errors, []);
  console.log('PASS 右键导出图片 PNG/JPG、视频原字节；Maker 图集 JSON 和单图 Lua 配置、循环选项、接入说明、帧尺寸与像素正确；不修改画布、不调用生成。');
  console.log('PASS 图集实际尺寸与元数据不一致时明确报错，不下载损坏的资源包。');
  console.log('PASS 引用链首图短名、方向、资源类型及 15 字符限制；重复导出、刷新后导出和图片顶部下载均使用不重名规则。');
  console.log('PASS 120 帧单图包完整导出 122 个文件（120 PNG＋Lua＋README）。');
  verifyMakerPlayback();
} finally {
  await browser?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
