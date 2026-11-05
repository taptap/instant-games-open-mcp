const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function load(context, name) {
  vm.runInContext(fs.readFileSync(require.resolve('../web/src/' + name + '.js'), 'utf8'), context);
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const font = deferred();
  let ready = false, paints = 0;
  const loaded = new Set();
  const context = vm.createContext({
    document: { createElement: () => ({ style: {}, getContext: () => ({
      fillRect() {}, save() {}, scale() {}, restore() {}, strokeRect() {}
    }) }) },
  });
  context.window = context;
  load(context, 'geom');
  load(context, 'doc');
  context.UrhoxAssets = {
    loadFont(path) { loaded.add(path); },
    async whenFontsReady() { const missing = await font.promise; ready = true; return missing; },
  };
  context.UrhoxYoga = { textMetrics: () => ({
    width: ready ? 40 : 200, height: 20, lineHeight: 20, lines: ['text']
  }) };
  context.UrhoxPreview = {
    tree: {}, canProbe: true,
    orientationInfo: { source: 'document', orientation: 'portrait' },
    currentScene: { id: '720p' },
    probeScenes(scenes, visit) {
      return scenes.map(scene => visit(scene, {
        // This font exists only in the expanded preview of one checked screen.
        tree: { type: 'Label', text: 'text', fontSize: 20,
          fontFamily: scene.id === 'ipadpro' ? 'Fonts/tablet.ttf' : 'Fonts/phone.ttf',
          _layout: { x: 0, y: 0, w: 100, h: 40 } },
        width: 300, height: 500, scale: 1, dpr: 1, safeArea: {},
        sourceId: () => 'label',
        paint() { assert(ready, 'thumbnails must use loaded fonts'); paints++; },
      }));
    },
  };
  load(context, 'adapt');
  return { context, font, loaded, paints: () => paints };
}

test('adaptation waits for fonts from all scenes before measuring and painting', async () => {
  const f = fixture();
  let settled = false;
  const pending = f.context.UrhoxAdapt.run().then(report => { settled = true; return report; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(f.paints(), 0);
  assert.deepEqual([...f.loaded].sort(), ['Fonts/phone.ttf', 'Fonts/tablet.ttf']);
  f.font.resolve([]);
  const report = await pending;
  assert.equal(report.issues.length, 0, 'fallback-font overflow must not enter the report');
  assert.equal(f.paints(), 3);
  assert(f.context.UrhoxAdapt.toMarkdown(report, 'screen.ui.json').includes('均未发现问题'));
});

test('failed fonts are disclosed in both report and copied Markdown', async () => {
  const f = fixture();
  const pending = f.context.UrhoxAdapt.run();
  f.font.resolve(['Fonts/phone.ttf', 'Fonts/previous-document.ttf']);
  const report = await pending;
  assert(report.note.includes('Fonts/phone.ttf'));
  assert(!report.note.includes('previous-document'));
  assert(f.context.UrhoxAdapt.toMarkdown(report, 'screen.ui.json').includes('备用字体'));
});

test('changing documents while fonts load discards the old check', async () => {
  const f = fixture();
  const pending = f.context.UrhoxAdapt.run();
  f.context.UrhoxPreview.tree = {};
  f.font.resolve([]);
  assert.equal(await pending, null);
  assert.equal(f.paints(), 0);
});

test('rerunning or closing the dialog ignores pending results and copying waits for completion', async () => {
  const elements = new Map(), pending = [], copied = [];
  function element() {
    return { style: {}, classList: { add() {} }, textContent: '', open: false,
      handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; },
      replaceChildren() {}, appendChild(child) { return child; },
      showModal() { this.open = true; },
      close() { this.open = false; this.handlers.close(); },
    };
  }
  function el(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }
  const context = vm.createContext({
    console,
    document: { getElementById: el, createElement: element },
    navigator: { clipboard: { async writeText(text) { copied.push(text); } } },
    requestAnimationFrame(fn) { fn(); }, setTimeout(fn) { void fn(); },
    UrhoxPreview: { canProbe: true, tree: {}, currentScene: {}, currentPath: 'screen.ui.json' },
    UrhoxAdapt: {
      run() { const next = deferred(); pending.push(next); return next.promise; },
      toMarkdown(report) { return report.note; },
    },
  });
  context.window = context;
  load(context, 'adapt-ui');
  const report = note => ({ note, results: [], issues: [] });
  el('adaptBtn').handlers.click();
  await el('adaptCopy').handlers.click();
  assert.equal(copied.length, 0);
  el('adaptRerun').handlers.click();
  pending[1].resolve(report('new'));
  await new Promise(setImmediate);
  pending[0].resolve(report('old'));
  await new Promise(setImmediate);
  assert.equal(el('adaptOrientation').textContent, 'new');
  await el('adaptCopy').handlers.click();
  assert.deepEqual(copied, ['new']);
  el('adaptRerun').handlers.click();
  el('adaptDialog').close();
  pending[2].resolve(report('closed'));
  await new Promise(setImmediate);
  assert.equal(el('adaptOrientation').textContent, '');
  await el('adaptCopy').handlers.click();
  assert.deepEqual(copied, ['new']);
});
