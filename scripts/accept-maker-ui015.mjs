// Real-run acceptance for the 015 Bbox UI template. PAID: it runs recognition, separation and
// cutting through the real console. One click on 「开始」, then it only observes and checks that
// what the page shows matches the page's own card state, until 「5 UI 已生成」.
//
// Usage:
//   node scripts/accept-maker-ui015.mjs --target-dir <project> --allow-paid [--out <dir>]
//     [--timeout-min 45] [--every-sec 4] [--no-second-page]
//
// Checks (each failure is recorded with a screenshot):
//   badge      group header badge reads 「执行中」 for the whole run (never 已暂停/待处理/失败)
//   bar        the group bar never shows 「已暂停」 or an enabled start/continue button mid-run
//   counts     「已完成 x/y · 进行中 n」 equal the cards' real state (two samples in a row)
//   overlay    no member card shows the grey 「等待继续」 (paused) overlay mid-run
//   layout     the running bar is one line (task strip scrolls), nothing clipped, on screen after fit
//   colours    running yellow, failed red, done green
//   peer page  a second page on the same canvas is read-only, says so, and does not pause the run
//   freeze     the page never blocks its main thread for 5 s or more (CLI and clicks stall)
//   final      the run reaches 「5 UI 已生成」, counts still match, page has no script errors
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEMPLATE_ID = '7e1cb6ad-732f-4dc3-a951-000000000015';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const targetDir = value('--target-dir');
if (!targetDir || !flag('--allow-paid')) {
  console.error('Usage: --target-dir <project> --allow-paid (this run is charged)');
  process.exit(2);
}
const out = path.resolve(value('--out', path.join('/tmp', 'maker-ui015-accept-' + Date.now())));
const timeoutMs = Number(value('--timeout-min', '45')) * 60000;
const everyMs = Number(value('--every-sec', '4')) * 1000;
fs.mkdirSync(out, { recursive: true });

const opened = JSON.parse(
  execFileSync(
    process.execPath,
    [
      path.join(repo, 'dist/maker.js'),
      'console',
      'open',
      '--target-dir',
      targetDir,
      '--no-open',
      '--json',
    ],
    { encoding: 'utf8' }
  )
);
const origin = new URL(opened.url).origin;
const key = opened.projectKey;
const api = origin + '/api/projects/' + key + '/canvases/automation/';
const playwrightModule =
  process.env.PLAYWRIGHT_MODULE ||
  path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightModule).href);

const violations = [];
const states = new Map();
const timeline = [];
const started = Date.now();
const elapsed = () => Math.round((Date.now() - started) / 1000);
let shotIndex = 0;
async function shot(page, name) {
  const file = path.join(out, String(++shotIndex).padStart(3, '0') + '-' + name + '.png');
  await page.screenshot({ path: file }).catch(() => {});
  return file;
}
async function fail(page, check, detail) {
  const file = await shot(page, 'FAIL-' + check);
  violations.push({ at: elapsed(), check, detail, screenshot: file });
  console.log('  ✗ ' + check + ': ' + detail);
}

async function openPage(browser, canvasId) {
  const context = await browser.newContext({ viewport: { width: 1700, height: 1050 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__longTasks.push({
          at: Math.round(entry.startTime),
          ms: Math.round(entry.duration),
        });
    }).observe({ type: 'longtask', buffered: true });
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => {
    errors.push('native dialog: ' + dialog.message().slice(0, 200));
    void dialog.accept();
  });
  await page.goto(origin + '/canvas?project=' + key + (canvasId ? '&canvas=' + canvasId : ''), {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('#add-template', { timeout: 30000 });
  await page.waitForTimeout(2500);
  return { page, errors };
}

/** The page's own state through the automation bridge (read-only inspect). */
async function inspect(pageId, canvasId, groupId) {
  const requestId = randomUUID();
  const response = await fetch(api + 'submit', {
    method: 'POST',
    // The console only accepts same-origin writes; this script runs on the same machine.
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      requestId,
      pageId,
      canvasId,
      action: 'inspect',
      input: { id: groupId },
    }),
  });
  if (!response.ok)
    throw new Error('inspect submit ' + response.status + ' ' + (await response.text()));
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const status = await (await fetch(api + 'status?id=' + requestId)).json();
    if (status.status === 'succeeded') return status.result;
    if (['failed', 'unknown'].includes(status.status)) throw new Error('inspect ' + status.error);
  }
  throw new Error('inspect timed out');
}

/** Everything the group shows, read from the DOM only. */
async function displayed(page, groupId, memberIds = []) {
  return page.evaluate(
    ([groupId, memberIds]) => {
      const group = document.querySelector('.card[data-id="' + groupId + '"]');
      const bar = group?.querySelector('.group-queue');
      const text = (bar?.innerText || '').replace(/\s+/g, ' ');
      const count = bar?.querySelector('.group-queue-count[data-total]')?.dataset;
      const rgb = (element, property) => {
        if (!element) return undefined;
        const match = getComputedStyle(element)[property].match(/\d+(\.\d+)?/g);
        return match && match.slice(0, 3).map(Number);
      };
      const clipped = [];
      if (bar) {
        const box = bar.getBoundingClientRect();
        for (const element of bar.querySelectorAll('*')) {
          // The task strip scrolls by design: its chips may sit outside the bar box.
          if (element.closest('.group-queue-tasks') && !element.matches('.group-queue-tasks'))
            continue;
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (
            rect.left < box.left - 1 ||
            rect.right > box.right + 1 ||
            rect.bottom > box.bottom + 1
          )
            clipped.push(
              (element.className || element.tagName) + ':' + element.textContent.slice(0, 30)
            );
          if (
            element.scrollWidth > element.clientWidth + 1 &&
            !['visible', 'auto', 'scroll'].includes(getComputedStyle(element).overflowX)
          )
            clipped.push('overflow ' + (element.className || element.tagName));
        }
      }
      const members = memberIds
        .map((id) => document.querySelector('.card[data-id="' + id + '"]'))
        .filter(Boolean);
      return {
        phase: bar?.dataset.phase,
        text: text.slice(0, 500),
        done: count ? [Number(count.done), Number(count.total)] : undefined,
        running: count ? Number(count.running) : undefined,
        failed: count ? Number(count.failed) : undefined,
        buttons: [...(bar?.querySelectorAll('button') || [])].map((button) => ({
          label: button.textContent.trim(),
          disabled: button.disabled,
        })),
        chips: [...(bar?.querySelectorAll('[data-state]') || [])].map((chip) => ({
          state: chip.dataset.state,
          background: rgb(chip, 'backgroundColor'),
          border: rgb(chip, 'borderColor'),
        })),
        colours: {
          done: rgb(bar?.querySelector('.group-queue-done'), 'color'),
          running: rgb(bar?.querySelector('.group-queue-running'), 'color'),
          failed: rgb(bar?.querySelector('.group-queue-count .group-queue-failed'), 'color'),
        },
        badge: group?.querySelector('.canvas-group-state')?.textContent?.trim(),
        overlays: members
          .map((card) => ({
            id: card.dataset.id,
            state: card.querySelector('.card-state-overlay')?.dataset.state,
            title: card.querySelector('.card-state-overlay')?.innerText?.split('\n')[0],
          }))
          .filter((item) => item.state),
        longTasks: window.__longTasks.splice(0),
        worldInert: getComputedStyle(document.getElementById('world')).pointerEvents === 'none',
        peer: (() => {
          const banner = document.getElementById('peer-block');
          return banner && !banner.hidden ? banner.innerText : '';
        })(),
        clipped,
        oneLine: bar ? bar.getBoundingClientRect().height <= 60 : true,
      };
    },
    [groupId, memberIds]
  );
}

/** Hue in degrees and saturation 0..1 of an rgb triple. */
function hue([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  if (!delta) return { hue: 0, saturation: 0 };
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  let h =
    max === rr
      ? ((gg - bb) / delta) % 6
      : max === gg
        ? (bb - rr) / delta + 2
        : (rr - gg) / delta + 4;
  h = (h * 60 + 360) % 360;
  return { hue: h, saturation: delta / (1 - Math.abs(max + min - 1) || 1) };
}
const isYellow = (colour) =>
  colour && hue(colour).saturation > 0.3 && hue(colour).hue >= 30 && hue(colour).hue <= 65;
const isRed = (colour) =>
  colour && hue(colour).saturation > 0.3 && (hue(colour).hue <= 15 || hue(colour).hue >= 340);
const isGreen = (colour) =>
  colour && hue(colour).saturation > 0.2 && hue(colour).hue >= 80 && hue(colour).hue <= 170;

/** Truth: card workflow state inside the queue's card set. */
function truth(snapshot, groupId) {
  const queue = (snapshot.queues || []).find((item) => item.groupId === groupId);
  const ids = queue
    ? [...new Set([...queue.finished, ...queue.pending, ...Object.keys(queue.running || {})])]
    : [];
  const state = (id) => snapshot.nodes.find((node) => node.id === id)?.state?.workflow;
  return {
    queue,
    total: ids.length,
    done: ids.filter((id) => state(id) === 'complete').length,
    running: ids.filter((id) => state(id) === 'loading').length,
  };
}

// Diagnostics for a lost page connection: console latency and gaps in the page heartbeat.
const slowConsole = [];
const heartbeatGaps = [];
let pinging = true;
void (async () => {
  while (pinging) {
    const begin = Date.now();
    await fetch(api + 'pages').catch(() => {});
    if (Date.now() - begin > 2000) slowConsole.push({ at: elapsed(), ms: Date.now() - begin });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
})();
function watchHeartbeat(page) {
  let last = Date.now();
  page.on('requestfinished', (request) => {
    if (!request.url().endsWith('/automation/exchange')) return;
    if (Date.now() - last > 5000) heartbeatGaps.push({ at: elapsed(), ms: Date.now() - last });
    last = Date.now();
  });
}

const browser = await chromium.launch({ headless: true });
let exitCode = 0;
try {
  const { page, errors } = await openPage(browser);
  watchHeartbeat(page);
  await page.locator('#workspace-new').evaluate((button) => button.click());
  await page.waitForTimeout(3000);
  await page.locator('#add-template').evaluate((button) => button.click());
  await page.waitForTimeout(2500);
  await page.locator('input[placeholder*="搜索模板"]').fill('Bbox');
  await page.waitForTimeout(2000);
  await page
    .locator('text=Bbox预排参考图')
    .first()
    .locator('xpath=ancestor::*[.//button[contains(., "添加")]][1]')
    .locator('button', { hasText: '添加' })
    .first()
    .evaluate((button) => button.click());
  await page.waitForTimeout(8000);
  const fit = page.locator('button', { hasText: '适配画布' });
  if (await fit.count()) await fit.first().click();
  await page.waitForTimeout(800);
  const canvasId = await page.evaluate(
    () =>
      new URLSearchParams(location.search).get('canvas') ||
      document.getElementById('canvases')?.value
  );
  let pageId;
  for (let i = 0; i < 20 && !pageId; i++) {
    const pages = await (await fetch(api + 'pages')).json();
    pageId = pages.find((item) => item.canvasId === canvasId)?.id;
    if (!pageId) await page.waitForTimeout(1000);
  }
  if (!pageId) throw new Error('page did not register with the automation bridge');
  const full = await inspect(pageId, canvasId);
  const groupId = full.nodes.find(
    (node) => node.type === 'section' && node.templateId === TEMPLATE_ID
  )?.id;
  if (!groupId) throw new Error('015 group not found on the new canvas');
  console.log('canvas ' + canvasId + ' group ' + groupId + ' out ' + out);
  await shot(page, 'before-start');
  const start = page.locator('.card[data-id="' + groupId + '"] .group-queue button', {
    hasText: '开始：自动生成 UI',
  });
  if (!(await start.count()))
    throw new Error('start button missing: ' + (await displayed(page, groupId)).text);
  await start.first().evaluate((button) => button.click());
  console.log('clicked 「开始」 once');

  let previousMismatch = '';
  let memberCount = 0;
  let longest = 0;
  let peerChecked = flag('--no-second-page');
  let finalReached = false;
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(everyMs);
    let snapshot;
    try {
      snapshot = await inspect(pageId, canvasId, groupId).catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return inspect(pageId, canvasId, groupId);
      });
    } catch (error) {
      await fail(page, 'connection', '页面未响应 CLI 查询：' + String(error.message || error));
      continue;
    }
    const members = snapshot.nodes
      .filter((node) => node.sectionId === groupId)
      .map((node) => node.id);
    const shown = await displayed(page, groupId, members);
    const real = truth(snapshot, groupId);
    finalReached = /5 UI 已生成/.test(shown.text);
    for (const task of shown.longTasks)
      if (task.ms >= 5000)
        await fail(page, 'freeze', '页面主线程卡住 ' + (task.ms / 1000).toFixed(1) + ' 秒');
    longest = Math.max(longest, ...shown.longTasks.map((task) => task.ms), 0);
    if (members.length !== memberCount) {
      // New batch cards: fit once so the screenshots show the whole group like a user would.
      memberCount = members.length;
      const fit = page.locator('button', { hasText: '适配画布' });
      if (await fit.count()) await fit.first().click();
      await page.waitForTimeout(500);
      const onScreen = await page.evaluate((groupId) => {
        const bar = document.querySelector('.card[data-id="' + groupId + '"] .group-queue');
        const board = document.getElementById('board').getBoundingClientRect();
        const rect = bar?.getBoundingClientRect();
        return Boolean(rect && rect.top >= board.top && rect.bottom <= board.bottom + 1);
      }, groupId);
      if (!onScreen) await fail(page, 'layout', '「适配画布」后分组进度栏不在可视区域内');
    }
    const key = [
      shown.badge,
      shown.phase,
      shown.text.split(' ')[0],
      shown.overlays
        .map((item) => item.state)
        .sort()
        .join(','),
    ].join('|');
    if (!states.has(key)) {
      states.set(key, await shot(page, 'state-' + states.size));
      await page
        .locator('.card[data-id="' + groupId + '"] .group-queue')
        .screenshot({ path: path.join(out, String(shotIndex).padStart(3, '0') + '-bar.png') })
        .catch(() => {});
    }
    timeline.push({
      at: elapsed(),
      shown: { ...shown, chips: shown.chips.length },
      real: { ...real, queue: real.queue?.phase },
    });
    console.log(
      '[' +
        elapsed() +
        's] badge=' +
        shown.badge +
        ' phase=' +
        shown.phase +
        ' shown=' +
        (shown.done || []).join('/') +
        ' run ' +
        shown.running +
        ' | real=' +
        real.done +
        '/' +
        real.total +
        ' run ' +
        real.running +
        ' | ' +
        shown.text.slice(0, 120)
    );
    if (finalReached) break;

    if (shown.badge !== '执行中')
      await fail(page, 'badge', '组状态显示「' + shown.badge + '」，运行仍在进行');
    if (/已暂停/.test(shown.text))
      await fail(page, 'bar', '运行中显示「已暂停」：' + shown.text.slice(0, 160));
    const startLike = shown.buttons.find(
      (button) => /开始|继续/.test(button.label) && !button.disabled
    );
    if (startLike) await fail(page, 'bar', '运行中出现可点的「' + startLike.label + '」');
    const paused = shown.overlays.filter((item) => item.state === 'paused');
    if (paused.length)
      await fail(
        page,
        'overlay',
        '运行中卡片显示暂停：' + paused.map((item) => item.title).join('、')
      );
    if (shown.clipped.length) await fail(page, 'layout', shown.clipped.slice(0, 5).join('; '));
    if (shown.running > 0 && !shown.oneLine) await fail(page, 'layout', '执行中分组栏不是单行');
    for (const chip of shown.chips) {
      if (chip.state === 'running' && !isYellow(chip.background) && !isYellow(chip.border))
        await fail(page, 'colours', '进行中任务不是黄色 ' + JSON.stringify(chip));
      if (chip.state === 'failed' && !isRed(chip.background) && !isRed(chip.border))
        await fail(page, 'colours', '失败任务不是红色 ' + JSON.stringify(chip));
    }
    if (shown.done?.[0] > 0 && !isGreen(shown.colours.done))
      await fail(page, 'colours', '已完成计数不是绿色');
    if (shown.running > 0 && !isYellow(shown.colours.running))
      await fail(page, 'colours', '进行中计数不是黄色');
    if (shown.failed > 0 && !isRed(shown.colours.failed))
      await fail(page, 'colours', '失败计数不是红色');
    if (shown.done && real.queue) {
      const mismatch =
        shown.done[0] !== real.done ||
        shown.done[1] !== real.total ||
        shown.running !== real.running
          ? '显示 ' +
            shown.done.join('/') +
            ' 进行中 ' +
            shown.running +
            '，实际 ' +
            real.done +
            '/' +
            real.total +
            ' 进行中 ' +
            real.running
          : '';
      if (mismatch && mismatch === previousMismatch) await fail(page, 'counts', mismatch);
      previousMismatch = mismatch;
    }

    // Second page on the same canvas once paid generation is running.
    if (!peerChecked && shown.running > 0) {
      peerChecked = true;
      const second = await openPage(browser, canvasId);
      // The page opens the project's active canvas, which the first page just set.
      const opened = await second.page.$eval('#canvases', (select) => select.value);
      if (opened !== canvasId)
        await fail(second.page, 'peer page', '第二个页面打开了其他画布 ' + opened);
      await second.page.waitForTimeout(4000);
      const other = await displayed(second.page, groupId);
      await shot(second.page, 'second-page');
      if (!/另一个页面/.test(other.peer))
        await fail(second.page, 'peer page', '第二个页面没有提示只读：' + other.peer);
      if (!other.worldInert) await fail(second.page, 'peer page', '第二个页面的卡片仍可点击');
      if (!/另一个页面/.test(other.text) || other.buttons.length)
        await fail(
          second.page,
          'peer page',
          '第二个页面的分组栏仍显示快照/按钮：' + other.text.slice(0, 160)
        );
      // A pan on the read-only page must not save over the running page.
      await second.page.mouse.move(800, 500);
      await second.page.mouse.wheel(0, 300);
      await second.page.waitForTimeout(6000);
      await second.page.context().close();
      if (second.errors.length)
        await fail(page, 'peer page', second.errors.join('; ').slice(0, 300));
    }
  }
  const expand = page.locator('#canvas-log', { hasText: '点击展开' });
  if (await expand.count())
    await expand
      .first()
      .click()
      .catch(() => {});
  await page.waitForTimeout(500);
  const log = await page.$eval('#canvas-log', (node) => node.innerText).catch(() => '');
  console.log('longest main-thread task ' + longest + ' ms');
  fs.writeFileSync(path.join(out, 'run-log.txt'), log);
  if (/画布保存失败|已被其他保存更新/.test(log))
    await fail(page, 'save', '运行日志出现保存失败/冲突');
  if (!finalReached) await fail(page, 'final', '超时未到达「5 UI 已生成」');
  else {
    await page.waitForTimeout(3000);
    const shown = await displayed(page, groupId);
    const real = truth(await inspect(pageId, canvasId, groupId), groupId);
    await shot(page, 'final');
    if (shown.badge === '执行中') await fail(page, 'final', '完成后组状态仍为执行中');
    if (shown.done && (shown.done[0] !== real.done || shown.done[1] !== real.total))
      await fail(
        page,
        'final',
        '完成后计数 ' + shown.done.join('/') + '，实际 ' + real.done + '/' + real.total
      );
    fs.writeFileSync(path.join(out, 'final.json'), JSON.stringify({ shown, real }, null, 2));
  }
  if (errors.length) await fail(page, 'page errors', errors.join('; ').slice(0, 400));
} catch (error) {
  violations.push({ at: elapsed(), check: 'harness', detail: String(error.stack || error) });
} finally {
  pinging = false;
  await browser.close();
  console.log('slow console responses ' + JSON.stringify(slowConsole.slice(0, 20)));
  console.log('page heartbeat gaps ' + JSON.stringify(heartbeatGaps.slice(0, 20)));
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify(
      { seconds: elapsed(), violations, slowConsole, heartbeatGaps, states: [...states], timeline },
      null,
      2
    )
  );
  console.log(
    '\n' +
      (violations.length ? violations.length + ' 项不符合：' : '全部检查通过') +
      '  报告：' +
      out
  );
  for (const item of violations)
    console.log(' - [' + item.at + 's] ' + item.check + ': ' + item.detail);
  exitCode = violations.length ? 1 : 0;
}
process.exit(exitCode);
