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
                  render(element, text) {
                    window.hostTooltip = element && !element.closest('.canvas-pane') ? text : null;
                    return !!window.hostTooltip;
                  },
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
      await page.evaluate(() => {
        const toolbar = document.querySelector('.canvas-toolbar');
        toolbar.classList.add('maker-toolbar', 'maker-toolbar-actions');
        const grip = document.createElement('button');
        grip.className = 'maker-toolbar-grip';
        grip.id = 'grip';
        toolbar.prepend(grip);
        const style = document.createElement('style');
        style.textContent =
          ':root { --web-line:#888; --web-panel:#fff; --web-text:#222; --web-muted:#666; --web-wash:#eee; }' +
          window.UrhoxWebTooltip.webToolbarStyles(':root');
        document.head.appendChild(style);
        window.toolbarDrag = window.UrhoxWebTooltip.installWebToolbarDrag(
          toolbar,
          document.querySelector('.canvas-pane'),
          grip,
          { inset: 8 }
        );
      });
      const first = page.locator('#first');
      assert.equal(await first.evaluate((el) => getComputedStyle(el).width), '36px');
      await first.hover();
      assert.equal(
        await first.evaluate((el) => getComputedStyle(el).backgroundColor),
        'rgb(238, 238, 238)'
      );
      await page.mouse.down();
      assert.equal(
        await first.evaluate((el) => getComputedStyle(el).backgroundColor),
        'rgb(34, 34, 34)'
      );
      await page.mouse.up();
      const grip = page.locator('#grip');
      assert.equal(await grip.evaluate((el) => getComputedStyle(el).borderWidth), '0px');
      const before = await grip.boundingBox();
      await grip.press('ArrowRight');
      assert.equal(Math.round((await grip.boundingBox()).x - before.x), 10);
      const box = await grip.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40);
      await page.mouse.up();
      assert.equal(Math.round((await grip.boundingBox()).x - box.x), 80);
      await page.evaluate(() => window.toolbarDrag.reset());
      assert.equal(await page.locator('.canvas-toolbar').evaluate((el) => el.style.left), '');
      await page.evaluate((editor) => {
        document
          .querySelector('#first')
          .setAttribute(
            editor ? 'data-web-title' : 'data-web-tip',
            '长提示需要换行，确保全部内容都在画面内。'.repeat(8)
          );
      }, editor);
      await first.hover();
      await page.waitForFunction(() => !document.querySelector('.web-tooltip').hidden);
      assert.ok(await tip.evaluate((el) => el.scrollWidth <= el.clientWidth + 2));
      assert.ok((await tip.boundingBox()).width <= 220);
      if (editor) {
        await page.evaluate(() => {
          const button = document.createElement('button');
          button.id = 'header';
          button.title = '让 AI 检查当前 UI 是否已接入游戏，并按项目现有流程完成接入。';
          button.textContent = '接入游戏';
          document.body.prepend(button);
        });
        await page.locator('#header').hover();
        await page.waitForFunction(() => !!window.hostTooltip);
        assert.equal(await tip.isHidden(), true);
        await page.mouse.down();
        assert.equal(await page.evaluate(() => window.hostTooltip), null);
        await page.mouse.up();
      }
      await page.close();
    }
  }
  console.log(
    'PASS: shared canvas/editor tooltip styles, hover delay, labels, boundary, pointer and keyboard interactions'
  );
} finally {
  await browser.close();
}
