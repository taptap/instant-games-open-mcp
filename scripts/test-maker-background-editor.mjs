import assert from 'node:assert/strict';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = await build({
  stdin: {
    contents:
      'export { openBackgroundEditor } from "./src/maker/canvas/backgroundUi.ts"; export { createBackgroundRemoval } from "./src/maker/canvas/backgroundRemoval.ts"; export { SEQUENCE_EDITOR_STYLES } from "./src/maker/canvas/sequenceEditorStyles.ts";',
    resolveDir: repo,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { openBackgroundEditor, createBackgroundRemoval, SEQUENCE_EDITOR_STYLES } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const playwrightModule =
  process.env.PLAYWRIGHT_MODULE ||
  path.join(
    execSync('npm root -g', { encoding: 'utf8', windowsHide: true }).trim(),
    'playwright/index.mjs'
  );
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const browser = await chromium.launch({ headless: true });
const errors = [];
let externalRequests = 0;
let checks = 0;
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    externalRequests++;
    return route.abort();
  });
  await page.setContent('<style>' + SEQUENCE_EDITOR_STYLES + '</style>');
  await page.addScriptTag({
    content:
      'window.openBackgroundEditor = ' +
      openBackgroundEditor.toString() +
      '; window.createBackgroundRemoval = ' +
      createBackgroundRemoval.toString() +
      ';',
  });
  await page.evaluate(() => {
    window.prepare = async (kind = 'solid') => {
      const frames = [];
      for (let index = 0; index < 2; index++) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const palette =
          kind === 'noisy'
            ? [
                '#123456',
                '#ff00ff',
                '#00ff00',
                '#0000ff',
                '#ff0000',
                '#ffff00',
                '#00ffff',
                '#ffffff',
              ]
            : [index ? '#00ff00' : '#ff00ff'];
        palette.forEach((color, offset) => {
          context.fillStyle = color;
          context.fillRect((offset * 128) / palette.length, 0, 128 / palette.length, 64);
        });
        if (kind !== 'noisy') {
          context.fillStyle = '#2222ee';
          context.fillRect(48, 16, 32, 32);
          context.fillStyle = palette[0];
          context.fillRect(60, 28, 8, 8);
        }
        frames.push({
          index,
          time: index / 8,
          width: 128,
          height: 64,
          blob: await new Promise((resolve) => canvas.toBlob(resolve)),
        });
      }
      window.frames = frames;
      window.currentFrames = [frames[0], { ...frames[1], blob: new Blob(['preserved edit']) }];
      window.applied = [];
      window.calls = [];
      window.behavior = 'normal';
      window.release = undefined;
      const removal = createBackgroundRemoval();
      window.opening = openBackgroundEditor({
        frames,
        currentFrames: window.currentFrames,
        index: 0,
        removal: {
          apply: async (blob, settings, signal) => {
            window.calls.push({
              ...settings,
              frame: frames.findIndex((frame) => frame.blob === blob),
            });
            if (window.behavior === 'hold')
              await new Promise((resolve) => {
                window.release = resolve;
              });
            if (window.behavior === 'fail-second' && blob === frames[1].blob)
              throw new Error('第二帧模拟失败');
            if (window.behavior === 'ignore-abort') return removal.apply(blob, settings);
            return removal.apply(blob, settings, signal);
          },
        },
        apply: (result) => window.applied.push(result),
      });
      await window.opening;
    };
    window.pixel = async (blob, horizontal = 2, vertical = 2) => {
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        return Array.from(context.getImageData(horizontal, vertical, 1, 1).data);
      } finally {
        bitmap.close();
      }
    };
  });
  const dialog = page.getByRole('dialog', { name: '自动去背景', exact: true });
  const current = dialog.getByRole('button', { name: '应用到当前帧', exact: true });
  const batch = dialog.getByRole('button', { name: '批量应用到全部帧', exact: true });
  const color = dialog.getByRole('textbox', { name: '手动背景色 HEX' });
  const strategy = dialog.getByRole('combobox', { name: '背景颜色模式' });
  const scope = dialog.getByRole('combobox', { name: '背景处理范围' });
  const ready = () =>
    page.waitForFunction(() => {
      const button = [...document.querySelectorAll('.background-editor button')].find(
        (button) => button.textContent === '应用到当前帧'
      );
      return button && !button.disabled;
    });
  const check = (name) => {
    checks++;
    console.log('PASS ' + name);
  };

  await page.evaluate(() => prepare('noisy'));
  assert.equal(await current.isDisabled(), true);
  assert.match(await dialog.getByRole('status').textContent(), /未可靠识别/);
  await strategy.selectOption('manual');
  await color.fill('#123456');
  await ready();
  assert.equal(await scope.inputValue(), 'connected');
  await color.fill('invalid');
  await page.waitForFunction(() =>
    document.querySelector('.background-editor [role=status]').textContent.includes('#RRGGBB')
  );
  assert.equal(await current.isDisabled(), true);
  await color.fill('#123456');
  await ready();
  check('真实自动识别失败后，手动 HEX 可恢复预览；非法颜色不能提交');
  if (process.env.MAKER_BACKGROUND_SCREENSHOT)
    await page.screenshot({ path: process.env.MAKER_BACKGROUND_SCREENSHOT });

  await color.fill('#abcdef');
  await ready();
  await dialog.getByRole('button', { name: '从原图取色', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.background-editor [role=status]').textContent.startsWith('请点击原图')
  );
  await dialog.locator('canvas').evaluate((canvas) => {
    canvas.style.width = '400px';
    canvas.style.height = '300px';
    canvas.style.transform = 'scale(.75)';
  });
  let bounds = await dialog.locator('canvas').boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + 5);
  assert.equal(await color.inputValue(), '#abcdef');
  const clickPixel = async (horizontal, vertical) => {
    const position = await dialog.locator('canvas').evaluate(
      (canvas, point) => {
        const bounds = canvas.getBoundingClientRect();
        const scale = Math.min(bounds.width / canvas.width, bounds.height / canvas.height);
        return {
          x:
            bounds.left +
            (bounds.width - canvas.width * scale) / 2 +
            (point.horizontal + 0.5) * scale,
          y:
            bounds.top +
            (bounds.height - canvas.height * scale) / 2 +
            (point.vertical + 0.5) * scale,
        };
      },
      { horizontal, vertical }
    );
    await page.mouse.click(position.x, position.y);
  };
  await clickPixel(4, 32);
  assert.equal(await color.inputValue(), '#123456');
  await ready();
  assert.equal(
    await dialog
      .locator('canvas')
      .evaluate((canvas) => canvas.getContext('2d').getImageData(4, 32, 1, 1).data[3]),
    0
  );
  await dialog.getByRole('button', { name: '从原图取色', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('.background-editor canvas').dataset.view === 'original'
  );
  await clickPixel(4, 32);
  assert.equal(await color.inputValue(), '#123456');
  await ready();
  await current.click();
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(
    await page.evaluate(async () => ({
      count: applied.length,
      unchanged: applied[0][1] === currentFrames[1],
      alpha: (await pixel(applied[0][0].blob))[3],
    })),
    { count: 1, unchanged: true, alpha: 0 }
  );
  check('高 DPI、CSS 缩放和 contain 留白下取色准确；仅采原图，当前帧应用保留其它编辑');

  await page.evaluate(() => prepare());
  await batch.click();
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(
    await page.evaluate(async () => ({
      count: applied.length,
      alpha: await Promise.all(applied[0].map(async (frame) => (await pixel(frame.blob))[3])),
      fixedColor: calls.some((call) => call.color !== undefined),
      interiorAlpha: (await pixel(applied[0][0].blob, 63, 31))[3],
    })),
    { count: 1, alpha: [0, 0], fixedColor: false, interiorAlpha: 255 }
  );
  check('自动逐帧允许背景色改变，不传前帧颜色；默认连通模式保留封闭主体同色区域');

  await page.evaluate(() => prepare());
  await strategy.selectOption('manual');
  await color.fill('#ff00ff');
  await scope.selectOption('all');
  await ready();
  await current.click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(async () => (await pixel(applied[0][0].blob, 63, 31))[3]), 0);
  check('全图模式只能明确选择，手动预览和实际应用使用一致参数');

  await page.evaluate(() => prepare());
  await page.evaluate(() => {
    behavior = 'fail-second';
  });
  await batch.click();
  await page.waitForFunction(() =>
    document.querySelector('.background-editor [role=status]').textContent.includes('原帧集未改变')
  );
  assert.equal(await page.evaluate(() => applied.length), 0);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  check('整批第二帧失败不提交第一帧，原帧集保持不变');

  await page.evaluate(() => prepare());
  await page.evaluate(() => {
    behavior = 'hold';
  });
  await batch.click();
  await page.waitForFunction(() => typeof release === 'function');
  const callsBeforeCancel = await page.evaluate(() => calls.length);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(() => {
    behavior = 'ignore-abort';
    release();
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => applied.length), 0);
  assert.equal(await page.evaluate(() => calls.length), callsBeforeCancel);
  check('应用中取消无提交，即使底层忽略 abort 也不处理后续帧');

  await page.evaluate(() => prepare('noisy'));
  await strategy.selectOption('manual');
  await color.fill('#123456');
  await ready();
  await page.evaluate(() => {
    behavior = 'hold';
  });
  await color.fill('#ff00ff');
  await page.waitForFunction(() => typeof release === 'function');
  await page.evaluate(() => {
    behavior = 'normal';
  });
  await color.fill('#00ff00');
  await ready();
  await page.evaluate(() => release());
  await page.waitForTimeout(100);
  assert.match(await dialog.getByRole('status').textContent(), /#00ff00/);
  assert.equal(await color.inputValue(), '#00ff00');
  await page.evaluate(() => {
    release = undefined;
    behavior = 'hold';
  });
  await color.fill('#ff00ff');
  await page.waitForFunction(() => typeof release === 'function');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(() => {
    behavior = 'ignore-abort';
    release();
  });
  await page.waitForTimeout(100);
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.evaluate(() => applied.length), 0);
  check('过期预览不覆盖新参数，关闭后迟到结果不复活弹窗或提交');
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  console.log('PASS ' + checks + ' checks; no external requests, paid calls or HTML reports');
} finally {
  await browser.close();
}
