import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const modulePath =
  process.env.PLAYWRIGHT_MODULE ||
  path.join(
    execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
    'playwright/index.mjs'
  );
const { chromium } = await import(pathToFileURL(modulePath));
const compiled = await build({
  entryPoints: [
    fileURLToPath(new URL('../packages/maker-canvas/src/browser/webTooltip.ts', import.meta.url)),
  ],
  bundle: true,
  format: 'iife',
  globalName: 'UrhoxWebTooltip',
  target: 'chrome74',
  write: false,
});
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
try {
  for (const theme of ['light', 'dark']) {
    for (const editor of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      await page.setContent(
        '<div class="canvas-pane" style="position:absolute;left:200px;top:60px;width:600px;height:500px"><div class="canvas-toolbar workspace-actions" style="position:absolute;left:10px;top:100px"><button id="first" title="添加节点 (A)">A</button><button id="second" title="对齐节点">B</button></div></div>'
      );
      await page.addScriptTag({ content: compiled.outputFiles[0].text });
      await page.evaluate(
        ({ theme, editor }) => {
          document.documentElement.dataset.theme = theme;
          const style = document.createElement('style');
          style.textContent = window.UrhoxWebTooltip.canvasWebTooltipStyles(
            ':root',
            ':root[data-theme="light"]'
          );
          document.head.appendChild(style);
          window.UrhoxWebTooltip.installCanvasWebTooltips(
            editor
              ? {
                  targets: '[title],[data-web-title]',
                  labelAttribute: 'data-web-title',
                  keyboardClass: 'web-keyboard',
                  boundary: { targets: '.canvas-toolbar', container: '.canvas-pane' },
                }
              : {}
          );
        },
        { theme, editor }
      );
      const tip = page.locator('.web-tooltip');
      await page.locator('#first').hover();
      assert.equal(await tip.isHidden(), true);
      await page.waitForFunction(
        () => document.querySelector('.web-tooltip').dataset.open === 'true',
        null,
        { timeout: 1000 }
      );
      assert.equal(await tip.textContent(), '添加节点 (A)');
      assert.equal(await page.locator('#first').getAttribute('title'), null);
      const appearance = await tip.evaluate((el) => ({
        radius: getComputedStyle(el).borderRadius,
        arrow: getComputedStyle(el, '::after').width,
      }));
      assert.deepEqual(appearance, { radius: '7px', arrow: '8px' });
      if (editor) {
        const box = await tip.boundingBox();
        assert.ok(box.x >= 206 && box.x + box.width <= 794);
      }
      await page.locator('#second').hover();
      await page.waitForFunction(
        () => document.querySelector('.web-tooltip').textContent === '对齐节点'
      );
      await page.mouse.down();
      assert.equal(await tip.isHidden(), true);
      await page.mouse.up();
      await page.locator('#first').focus();
      assert.equal(await tip.isHidden(), true);
      await page.keyboard.press('Tab');
      await page.waitForFunction(
        () => document.querySelector('.web-tooltip').dataset.open === 'true'
      );
      assert.equal(await tip.textContent(), '对齐节点');
      await page.keyboard.press('Escape');
      assert.equal(await tip.isHidden(), true);
      await page.close();
    }
  }
  console.log(
    'PASS: shared canvas/editor tooltip styles, hover delay, labels, boundary, pointer and keyboard interactions'
  );
} finally {
  await browser.close();
}
