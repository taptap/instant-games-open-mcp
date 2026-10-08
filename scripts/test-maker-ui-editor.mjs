import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PNG } from 'pngjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-editor-browser-'));
const staticRoot = path.join(repo, 'src/maker/uiEditor/web');
const previousHome = process.env.TAPTAP_MAKER_HOME;
process.env.TAPTAP_MAKER_HOME = path.join(temporary, 'maker-home');
function assets(directory, relative = '') {
  return Object.fromEntries(
    fs
      .readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? Object.entries(assets(path.join(directory, entry.name), relative + entry.name + '/'))
          : [
              [
                relative + entry.name,
                fs.readFileSync(path.join(directory, entry.name)).toString('base64'),
              ],
            ]
      )
  );
}
let server, browser, page;
try {
  const output = path.join(temporary, 'server.mjs');
  await build({
    stdin: {
      contents:
        'export { startConsoleServer } from "./src/maker/console/server.ts"; export { ConsoleProjects } from "./src/maker/console/projects.ts"; export { getConsoleHtml } from "./src/maker/console/web.ts";',
      resolveDir: repo,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: output,
    define: {
      __MAKER_UI_EDITOR_ASSETS__: JSON.stringify(assets(staticRoot)),
      __MAKER_DEMO_BUNDLED__: 'true',
    },
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
    logLevel: 'silent',
  });
  const { startConsoleServer, ConsoleProjects, getConsoleHtml } = await import(
    pathToFileURL(output)
  );
  const registry = new ConsoleProjects(path.join(temporary, 'registry.json'));
  function fixture(name) {
    const root = path.join(temporary, name);
    for (const dir of ['.project', '.maker-mcp', 'assets/ui', 'assets/image'])
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: name })
    );
    fs.writeFileSync(
      path.join(root, '.project/project.json'),
      JSON.stringify({ taptap_publish: { title: name, screen_orientation: 'portrait' } })
    );
    const tree = {
      type: 'Panel',
      id: 'screen',
      width: 400,
      height: 800,
      backgroundColor: '#ebe5dc',
      children: [
        {
          type: 'Button',
          id: 'button',
          position: 'absolute',
          left: 50,
          top: 150,
          width: 200,
          height: 80,
          backgroundImage: 'image/button #1.png',
          backgroundColor: false,
        },
        {
          type: 'Label',
          id: 'caption',
          position: 'absolute',
          left: 50,
          top: 160,
          width: 200,
          height: 50,
          text: 'Maker UI',
          fontSize: 22,
        },
      ],
    };
    fs.writeFileSync(path.join(root, 'assets/ui/main.ui.json'), JSON.stringify(tree));
    fs.writeFileSync(
      path.join(root, 'assets/image/button #1.png'),
      PNG.sync.write({ width: 200, height: 80, data: Buffer.alloc(200 * 80 * 4, 230) })
    );
    fs.writeFileSync(
      path.join(root, 'assets/ui/main.reference.png'),
      PNG.sync.write({ width: 400, height: 800, data: Buffer.alloc(400 * 800 * 4, 200) })
    );
    return { root, ...registry.add(root) };
  }
  const first = fixture('first'),
    second = fixture('second'),
    empty = fixture('empty');
  fs.unlinkSync(path.join(empty.root, 'assets/ui/main.ui.json'));
  server = await startConsoleServer({
    registry,
    execute: async () => {
      throw new Error('No project actions in editor test');
    },
    html: getConsoleHtml(),
    version: 'test',
    packageRoot: repo,
  });
  const modulePath =
    process.env.PLAYWRIGHT_MODULE ||
    path.join(
      execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
      'playwright/index.mjs'
    );
  const { chromium } = await import(pathToFileURL(modulePath));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error('browser:', e.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  const failedResources = [];
  page.on('response', (res) => {
    if (
      res.status() >= 400 &&
      /ui-editor/.test(res.url()) &&
      !(res.status() === 409 && res.url().endsWith('/save'))
    )
      failedResources.push(res.url());
  });
  await page.goto(
    server.origin + '/?project=' + first.key + '&page=ui-editor&ui=assets%2Fui%2Fmain.ui.json'
  );
  const editor = page.frameLocator('#ui-editor-view iframe');
  await page.waitForFunction(
    (name) =>
      document.querySelector('#ui-editor-view iframe')?.contentWindow?.UrhoxProject?.get().name ===
      name,
    'first'
  );
  await editor.locator('#stage').waitFor();
  let frame = page.frames().find((f) => f.url().includes('/ui-editor/'));
  await frame.waitForFunction(
    () => window.UrhoxPreview?.tree?.id === 'screen' && !window.UrhoxProject.isBusy()
  );
  await page.locator('#theme').uncheck();
  assert.equal(await frame.evaluate(() => window.MakerConsole.getTheme()), 'light');
  assert.equal(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)');
  async function checkEditorControls() {
    const consoleColors = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return { yellow:css.getPropertyValue('--yellow').trim(), panel:css.getPropertyValue('--top').trim() };
    });
    const controls = await frame.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return {
        yellow:css.getPropertyValue('--yellow').trim(), panel:css.getPropertyValue('--panel').trim(),
        primary:getComputedStyle(document.getElementById('saveBtn')).backgroundColor,
        primaryText:getComputedStyle(document.getElementById('saveBtn')).color,
        neutral:getComputedStyle(document.getElementById('changesBtn')).backgroundColor,
        checkbox:getComputedStyle(document.querySelector('.tree-vis')).accentColor,
        radio:getComputedStyle(document.querySelector('.orientation-control input')).accentColor,
      };
    });
    assert.equal(controls.yellow, consoleColors.yellow);
    assert.equal(controls.panel, consoleColors.panel);
    assert.equal(controls.primary, 'rgb(245, 220, 86)');
    assert.equal(controls.primaryText, 'rgb(37, 40, 32)');
    assert.equal(controls.checkbox, controls.primary);
    assert.equal(controls.radio, controls.primary);
    assert.notEqual(controls.neutral, controls.primary);
  }
  await checkEditorControls();
  const headerHeight = (await page.locator('.top').boundingBox()).height;
  for (const tab of ['overview', 'build', 'git', 'documents', 'canvas', 'ui-editor']) {
    await page.locator('nav [data-page="' + tab + '"]').click();
    assert.equal((await page.locator('.top').boundingBox()).height, headerHeight, tab);
  }
  const canvasFrame = page.frames().find((item) => item.url().includes('/canvas?'));
  await canvasFrame.waitForFunction(() => window.MakerConsole?.getTheme() === 'light');
  assert.equal(await canvasFrame.evaluate(() => getComputedStyle(document.getElementById('board')).backgroundColor), 'rgb(245, 247, 246)');
  await page.locator('#theme').check();
  assert.equal(await canvasFrame.evaluate(() => window.MakerConsole.getTheme()), 'dark');
  assert.equal(await frame.evaluate(() => window.MakerConsole.getTheme()), 'dark');
  await checkEditorControls();
  assert.equal(await canvasFrame.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(16, 17, 20)');
  assert.equal(await editor.locator('#welcomeScreen').count(), 0);
  assert.equal(await editor.locator('#folderInput').count(), 0);
  assert.equal(await editor.locator('#permBadge').count(), 0);
  assert.equal(await editor.locator('.project-dirs').isVisible(), false);
  assert.equal(await editor.locator('#currentDocument').innerText(), 'assets/ui/main.ui.json');
  await editor.getByRole('button', { name: '设计稿对照', exact: true }).click();
  await frame.waitForFunction(() => document.getElementById('referenceCanvas').width > 0);
  // Use the same node/dirty/history APIs as the inspector; save is exercised through real controls.
  await frame.evaluate(() => {
    const p = window.UrhoxPreview;
    p.selectNode(p.tree.children[0], true);
    p.nudge(25, 0);
  });
  await frame.waitForFunction(() => window.UrhoxProject.isDirty());
  await page.locator('#theme').uncheck();
  assert.equal(await frame.evaluate(() => window.UrhoxProject.isDirty()), true);
  // Refresh discovers new files without losing the dirty document or undo history.
  fs.mkdirSync(path.join(first.root, 'assets/ui/sub'), { recursive: true });
  fs.copyFileSync(
    path.join(first.root, 'assets/ui/main.ui.json'),
    path.join(first.root, 'assets/ui/sub/secondary.ui.json')
  );
  fs.copyFileSync(
    path.join(first.root, 'assets/image/button #1.png'),
    path.join(first.root, 'assets/image/new #2.png')
  );
  await editor.locator('#openProjectBtn').click();
  await editor.locator('.file-item').filter({ hasText: 'secondary.ui.json' }).waitFor();
  assert.equal(await frame.evaluate(() => window.UrhoxProject.isDirty()), true);
  assert.equal(await frame.evaluate(() => window.UrhoxPreview.tree.children[0].left), 75);
  await frame.evaluate(() => window.UrhoxPreview.undo());
  assert.equal(await frame.evaluate(() => window.UrhoxPreview.tree.children[0].left), 50);
  await frame.evaluate(() => window.UrhoxPreview.redo());
  await editor.locator('.file-item').filter({ hasText: 'secondary.ui.json' }).click();
  await editor.locator('#saveDialogCancel').click();
  assert.equal(await editor.locator('#currentDocument').innerText(), 'assets/ui/main.ui.json');
  await editor.getByRole('button', { name: '项目资源', exact: true }).click();
  assert.equal(await editor.locator('.project-dirs').isVisible(), true);
  await editor.locator('.file-item').filter({ hasText: 'new #2.png' }).waitFor();
  await editor.getByRole('button', { name: 'UI 文档', exact: true }).click();
  await editor.locator('#changesBtn').click();
  await editor.locator('#changesDialog[open]').waitFor();
  assert.match(await editor.locator('#changesPath').innerText(), /assets.ui.main/);
  await editor.getByRole('button', { name: '关闭变更预览' }).click();

  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByRole('button', { name: 'UI 编辑器', exact: true }).click();
  assert.equal(await frame.evaluate(() => window.UrhoxPreview.tree.children[0].left), 75);
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#project-picker').selectOption(second.key);
  assert.equal(await page.locator('#project-picker').inputValue(), first.key);
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await frame.waitForFunction(
    () => !window.UrhoxProject.isDirty() && !window.UrhoxProject.isBusy()
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(first.root, 'assets/ui/main.ui.json'))).children[0].left,
    75
  );
  assert.equal(await editor.locator('#changesDialog').evaluate((d) => d.open), false);
  assert.equal(await editor.locator('#saveStatus').innerText(), '已保存');
  // A second editor with a stale baseline must not overwrite external edits.
  await frame.evaluate(() => {
    const p = window.UrhoxPreview;
    p.nudge(24, 0);
  });
  const external = JSON.parse(fs.readFileSync(path.join(first.root, 'assets/ui/main.ui.json')));
  external.children[0].left = 88;
  fs.writeFileSync(path.join(first.root, 'assets/ui/main.ui.json'), JSON.stringify(external));
  await editor.locator('#openProjectBtn').click();
  await frame.waitForFunction(() => !window.UrhoxProject.isBusy());
  let conflict = '';
  page.once('dialog', async (d) => {
    conflict = d.message();
    await d.accept();
  });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await frame.waitForFunction(() => !window.UrhoxProject.isBusy());
  assert.match(conflict, /外部修改/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(first.root, 'assets/ui/main.ui.json'))).children[0].left,
    88
  );
  await editor.locator('.file-item').filter({ hasText: 'main.ui.json' }).click({ button: 'right' });
  await editor.getByRole('menuitem', { name: '重新从磁盘加载', exact: true }).click();
  await editor.locator('#saveDialogDiscard').click();
  await frame.waitForFunction(() => !window.UrhoxProject.isBusy());
  assert.equal(await frame.evaluate(() => window.UrhoxPreview.tree.children[0].left), 88);
  assert.equal(await frame.evaluate(() => window.UrhoxProject.isDirty()), false);
  await frame.evaluate(() => {
    const p = window.UrhoxPreview;
    p.selectNode(p.tree.children[0], true);
    p.nudge(1, 0);
  });
  page.once('dialog', (d) => d.accept());
  await page.locator('#project-picker').selectOption(second.key);
  frame = page.frames().find((f) => f.url().includes('/ui-editor/'));
  await page.waitForFunction(
    (name) =>
      document.querySelector('#ui-editor-view iframe')?.contentWindow?.UrhoxProject?.get().name ===
      name,
    'second'
  );
  assert.equal(await editor.locator('#demoBtn').count(), 0);
  const help = editor.locator('#examplesHelp');
  assert.equal(await help.getAttribute('href'), 'https://liangdong-ttm.github.io/UrhoxUIEditor/');
  assert.equal(await help.getAttribute('target'), '_blank');
  assert.equal(await help.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await help.isVisible(), true);
  await page.locator('#project-picker').selectOption(empty.key);
  await editor.locator('#missingUiDialog[open]').waitFor();
  assert.match(await editor.locator('#skillPrompt').inputValue(), /maker-ui-workflow/);
  assert.match(await editor.locator('#skillPrompt').inputValue(), /lua-ui-to-json/);
  await editor.locator('#missingUiOk').click();
  await page.locator('#project-picker').selectOption(second.key);
  await page.waitForFunction(
    (name) =>
      document.querySelector('#ui-editor-view iframe')?.contentWindow?.UrhoxProject?.get().name ===
      name,
    'second'
  );
  await page.setViewportSize({ width: 768, height: 900 });
  assert.ok((await page.locator('#ui-editor-view iframe').boundingBox()).height > 500);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok((await page.locator('#ui-editor-view iframe').boundingBox()).height > 400);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.reload();
  await page.locator('nav [data-page="ui-editor"]').click();
  await editor.locator('#stage').waitFor();
  assert.equal(await page.evaluate(() => window.MakerConsole.getTheme()), 'light');
  assert.equal(await editor.locator('html').getAttribute('data-theme'), 'light');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResources, []);
  const skillPage = await browser.newPage();
  await skillPage.goto(server.origin + '/?project=' + second.key + '&page=documents&skill=maker-ui-workflow');
  await skillPage.locator('.document-reader-header h2').waitFor();
  assert.match(await skillPage.locator('#document-reader').innerText(), /Maker 游戏 UI 制作|Maker UI|设计稿/);
  assert.match(await skillPage.locator('#document-reader').innerText(), /assemble-ui/);
  await skillPage.goto(server.origin + '/?project=' + second.key + '&page=documents&skill=missing-skill');
  await skillPage.getByText('未找到关联 Skill：missing-skill。请检查 Maker 版本或当前项目的 Skill 文件。', {exact:true}).waitFor();
  await skillPage.close();
  console.log(
    'PASS: project loading, reference, direct save, non-destructive index refresh, document guard, resources, stale conflict after refresh, project guard, external examples, empty project, responsive frame, shared theme, compact navigation'
  );
} catch (error) {
  for (const frame of page?.frames() || [])
    console.error(
      frame.url(),
      (
        await frame
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(0, 1800)
    );
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
  if (previousHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = previousHome;
}
