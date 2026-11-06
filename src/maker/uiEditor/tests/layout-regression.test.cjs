const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

module.exports = (async function () {
  global.window = global;
  global.UrhoxUICheck = require('../../../../skills/lua-ui-to-json/scripts/ui-json-check.cjs');
  for (const name of ['geom', 'history', 'doc']) {
    vm.runInThisContext(fs.readFileSync(require.resolve('../web/src/' + name + '.js'), 'utf8'));
  }
  global.UrhoxYogaEngine = (await import("../web/vendor/yoga-layout/dist/src/index.js")).default;
  vm.runInThisContext(fs.readFileSync(require.resolve("../web/src/yoga-lite.js"), "utf8"));
  const layout = global.UrhoxYoga.layoutTree;
  const row = { width: 200, height: 80, flexDirection: "row", gap: 10, padding: 8,
    children: [{ width: 30, height: 20 }, { width: 40, height: 20 }] };
  layout(row, 200, 80);
  assert.equal(row.children[0]._layout.x, 8);
  assert.equal(row.children[1]._layout.x, 48);
  const text = { type: "Label", fontSize: 16, text: "month" };
  const panel = { width: 518, height: 150, padding: 8, gap: 8,
    children: [text, { width: "100%", height: 16 }] };
  layout(panel, 518, 150);
  assert(text._layout.h < 40, "auto-height text must not fill its parent");
  assert(panel.children[1]._layout.y < 60, "track follows intrinsic text height");
  const hidden = { width: 100, height: 100, visible: false,
    children: [{ children: [{ width: 20, height: 20 }] }] };
  layout(hidden, 100, 100);
  assert(hidden.children[0].children[0]._hidden, "visibility inherited at every depth");
  const centered = { width: 200, height: 100, alignItems: "center", justifyContent: "center",
    children: [{ width: 40, height: 20 }] };
  layout(centered, 200, 100);
  assert.deepEqual(centered.children[0]._layout, { x: 80, y: 40, w: 40, h: 20 });
  const anchored = { width: 200, height: 100, children: [
    { position: "absolute", right: 10, top: 10, width: "50%", height: 20 },
    { width: 30, height: 20 },
    { width: 30, height: 20 }
  ] };
  layout(anchored, 200, 100);
  UrhoxDoc.moveWorldRect(anchored, anchored.children[0], 95, 15);
  assert.equal(anchored.children[0].right, 5);
  assert.equal(anchored.children[0].width, "50%", "moving preserves responsive dimensions");
  assert.equal(anchored.children[0].left, undefined);
  const flowing = anchored.children[2];
  const oldY = flowing._layout.y;
  UrhoxDoc.moveWorldRect(anchored, flowing, 5, oldY + 7);
  layout(anchored, 200, 100);
  assert.equal(flowing._layout.y, oldY + 7, "moving flow children offsets from flow position");
  assert.equal(flowing.position, undefined, "moving preserves layout mode");
  assert.equal(anchored.children[0]._layout.x, 95);
  const decorative = { width: 100, height: 100, children: [
    { id: "image", position: "absolute", width: 20, height: 20, pointerEvents: "none" }
  ] };
  layout(decorative, 100, 100);
  assert.equal(UrhoxDoc.pickAt(decorative, 10, 10, { designMode: true })[0].id, "image");
  assert.equal(UrhoxDoc.pickAt(decorative, 10, 10).length, 0);
  decorative.locked = true;
  assert.equal(UrhoxDoc.pickAt(decorative, 10, 10, { designMode: true }).length, 0,
    "locking a parent protects descendants");
  delete decorative.locked;
  const source = { type: "Panel", width: 300, height: 300, children: [
    { type: "Panel", id: "host", $repeat: { template: "tile", count: 1 }, children: [] }
  ] };
  UrhoxDoc.ensureEditorIds(source);
  const view = UrhoxDoc.expandRepeats(source, { tile: {
    width: 20, height: 20, children: [{ type: "Label", text: "child" }]
  } });
  assert.equal(view._editorId, source._editorId, "source identities survive preview rebuild");
  const generated = view.children[0].children[0].children[0];
  assert(generated._generated);
  assert.equal(UrhoxDoc.sourceOf(source, view, generated), source.children[0]);
  const restored = { _editorId: "e9000", children: [] };
  UrhoxDoc.resetKeys();
  UrhoxDoc.ensureEditorIds(restored);
  assert.notEqual(UrhoxDoc.getEditorId({}), "e9000");
  for (const mode of ["padding", "margin"]) {
    const safe = { type: "SafeAreaView", mode, width: 200, height: 200,
      [mode]: 20, [mode + "Horizontal"]: 12, [mode + "Top"]: 0,
      children: [{ width: 20, height: 20 }] };
    layout(safe, 300, 300, { safeArea: { top: 5, left: 3 } });
    assert.equal(safe.children[0]._layout.x, 15, mode + " respects horizontal shorthand");
    assert.equal(safe.children[0]._layout.y, 5, mode + " respects explicit zero");
    layout(safe, 300, 300, { safeArea: {} });
    assert.equal(safe.children[0]._layout.x, 12, mode + " preserves spacing with no inset");
    assert.equal(safe[mode], 20, "safe area never mutates authored spacing");
  }

  // Exercise the real preview rebuild with a minimal DOM; layout and expansion are not mocked.
  const element = { getContext: () => ({}), dataset: {}, style: {},
    classList: { toggle() {} }, addEventListener() {}, querySelectorAll: () => [] };
  global.document = { getElementById: () => element, querySelectorAll: () => [], addEventListener() {} };
  let app;
  global.UrhoxInput = { bind(value) { app = value; } };
  vm.runInThisContext(fs.readFileSync(require.resolve("../web/src/preview.js"), "utf8"));
  const list = () => ({ type: "ScrollView", width: 100, height: 80,
    children: [{ width: 50, height: 400 }] });
  for (const kind of ["plain", "placeholder", "component", "repeat"]) {
    app.tree = null;
    app.sourceTree = { type: "Panel", width: 300, height: 500, children: [list()] };
    app.components = { list: { type: "Panel", children: [list()] } };
    app.templates = { list: list() };
    if (kind === "placeholder") app.sourceTree.id = "$name";
    if (kind === "component") app.sourceTree.children.push({ component: "list" });
    if (kind === "repeat") app.sourceTree.children.push({ $repeat: { template: "list", count: 2 } });
    app.rebuildPreview();
    let count = 0;
    UrhoxDoc.walk(app.tree, node => { if (node.type === "ScrollView") node._scrollY = 40 + count++ * 20; });
    app.layout();
    count = 0;
    UrhoxDoc.walk(app.tree, node => {
      if (node.type === "ScrollView") assert.equal(node._scrollY, 40 + count++ * 20, kind + " scroll survives");
    });
    assert.throws(() => UrhoxPreview.probeScenes([{ id: "1080p", orientation: "portrait" }], () => {
      UrhoxDoc.walk(app.tree, node => { if (node.type === "ScrollView") node._scrollY = 0; });
      throw new Error("probe interrupted");
    }), /probe interrupted/);
    count = 0;
    UrhoxDoc.walk(app.tree, node => {
      if (node.type === "ScrollView") assert.equal(node._scrollY, 40 + count++ * 20, kind + " probe restores scroll");
    });
    assert(!JSON.stringify(UrhoxHistory.cloneForSave(app.sourceTree)).includes("_scroll"));
  }
  vm.runInThisContext(fs.readFileSync(require.resolve("../web/src/adapt.js"), "utf8"));
  const near = (actual, expected) => assert(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);
  const drawing = { type: "Panel", width: 1920, height: 1080, previewFit: "contain",
    children: [{ type: "Button", id: "left-control", position: "absolute", left: 0, top: 0, width: 180, height: 100 }] };
  for (const [width, height, dpr, scale, x, y] of [
    [1280, 720, 1, 2 / 3, 0, 0],
    [844, 390, 1, 390 / 1080, 75.333333, 0],
    [1688, 780, 2, 780 / 1080, 150.666667, 0],
    [720, 1280, 1, 0.375, 0, 437.5],
  ]) {
    app.sourceTree = UrhoxHistory.cloneForSave(drawing);
    app.tree = null;
    app.templates = {}; app.components = {}; app.editMode = "screen";
    app.screen = { width, height };
    app.device = app.customDevice = { id: "custom", width, height, dpr, scale: 2 };
    app.safeArea = { top: 10, right: 20, bottom: 10, left: 20 };
    app.customDevice.safeArea = app.safeArea;
    app.rebuildPreview();
    const fit = app.contentTransform();
    near(fit.scale, scale); near(fit.x, x); near(fit.y, y);
    near(app.tree._layout.w, 1920); near(app.tree._layout.h, 1080);
    assert.deepEqual(app.designSize(), { width: 1920, height: 1080 });
    const orientation = width > height ? "landscape" : "portrait";
    UrhoxPreview.probeScenes([{ id: "custom", orientation }], (_, ctx) => {
      near(ctx.offsetX * ctx.scale, x); near(ctx.offsetY * ctx.scale, y);
      near(ctx.width * ctx.scale, width); near(ctx.height * ctx.scale, height);
      const issues = UrhoxAdapt.analyze(ctx);
      assert(!issues.some(i => i.code === "offscreen" || i.code === "cutByScreen"));
      if (x > 20 && y === 0) {
        const unsafe = issues.find(i => i.code === "unsafe");
        assert(unsafe && !unsafe.message.includes("左侧"), "letterboxing keeps the left control clear of the inset");
      }
      const calls = [];
      global.UrhoxCanvas = { paintTree() { calls.push("paint"); } };
      ctx.paint({ save() {}, restore() {}, translate(tx, ty) { near(tx * scale, x); near(ty * scale, y); } });
      assert.deepEqual(calls, ["paint"]);
    });
    assert.deepEqual(UrhoxHistory.cloneForSave(app.sourceTree), drawing, "mapping and checks never rewrite design coordinates");
  }
  // Opt-in only: a fixed root still overflows under DEFAULT, and a responsive root still fills it.
  delete app.sourceTree.previewFit;
  app.screen = { width: 1920, height: 1080 };
  app.device = { dpr: 1.5 };
  app.rebuildPreview();
  assert.deepEqual(app.contentTransform(), { x: 0, y: 0, scale: 1.5 });
  near(app.tree._layout.w, 1920);
  app.sourceTree.width = app.sourceTree.height = "100%";
  app.rebuildPreview();
  near(app.tree._layout.w, 1280); near(app.tree._layout.h, 720);
  // Engine DESIGN_RESOLUTION scales the viewport, not the root; responsive pages keep
  // using the extra space on tall/wide screens instead of receiving a contain offset.
  app.designResolution = { width: 1080, height: 1920 };
  app.sourceTree = { type: "Panel", width: "100%", height: "100%", children: [
    { id: "footer", position: "absolute", left: 0, bottom: 0, width: "100%", height: 180 }
  ] };
  for (const [width, height, dpr] of [[1080,1920,1.5], [1170,2532,3], [2048,2732,2], [844,390,1]]) {
    app.screen = { width, height };
    app.device = app.customDevice = { id: "custom", width, height, dpr };
    app.rebuildPreview();
    const scale = Math.min(width / 1080, height / 1920);
    near(app.contentTransform().scale, scale);
    assert.equal(app.contentTransform().x, 0); assert.equal(app.contentTransform().y, 0);
    near(app.tree._layout.w * scale, width); near(app.tree._layout.h * scale, height);
    const footer = app.tree.children[0]._layout;
    near((footer.y + footer.h) * scale, height);
    UrhoxPreview.probeScenes([{ id: "custom", orientation: width > height ? "landscape" : "portrait" }], (_, ctx) => {
      near(ctx.scale, scale); near(ctx.height * ctx.scale, height);
    });
  }
  app.designResolution = null;
  assert.equal(UrhoxUICheck.checkDocument({ tree: drawing }).errors, 0);
  for (const invalid of [
    { ...drawing, width: "100%" }, { ...drawing, height: 0 }, { ...drawing, previewFit: "cover" },
    { type: "Panel", children: [drawing] },
  ]) {
    assert(UrhoxUICheck.checkDocument({ tree: invalid }).diagnostics.some(d => d.code === "UI_PREVIEW_FIT"));
    assert.throws(() => UrhoxDoc.validateTree(invalid), /previewFit|设计坐标/);
  }
  delete global.document;
  console.log("layout-regression.test.js passed");
})();
