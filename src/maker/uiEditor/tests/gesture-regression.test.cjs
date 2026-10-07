const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class Surface {
  constructor() { this.listeners = {}; this.classList = { add() {}, remove() {} }; this.width = 400; this.height = 400; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, opts = {}) {
    const event = { button: 0, pointerId: 1, clientX: 45, clientY: 45,
      preventDefault() { this.prevented = true; }, stopPropagation() {}, ...opts };
    (this.listeners[type] || []).forEach(fn => fn(event));
    return event;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 400 }; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture(id) { this.capture = null; this.fire("lostpointercapture", { pointerId: id }); }
}
function setup() {
  const win = new Surface(), canvas = new Surface();
  const context = { console, document: { getElementById: () => null } };
  context.window = context;
  context.addEventListener = win.addEventListener.bind(win);
  vm.createContext(context);
  for (const name of ["history", "doc", "geom", "input"]) {
    vm.runInContext(fs.readFileSync(require.resolve("../web/src/" + name + ".js"), "utf8"), context);
  }
  const doc = context.UrhoxDoc;
  context.UrhoxYoga = { walk: doc.walk };
  context.UrhoxCanvas = { handleSize: () => 3, handlesFor: b => [{ x: b.x + b.w, y: b.y + b.h, id: "se" }] };
  const a = { type: "Panel", position: "absolute", left: 30, top: 30, width: 50, height: 50 };
  const b = { type: "Panel", locked: true, position: "absolute", left: 200, top: 200, width: 50, height: 50 };
  const tree = { type: "Panel", width: 400, height: 400, children: [a, b] };
  const h = new context.UrhoxHistory.History();
  const app = { canvas, tree, sourceTree: tree, selected: a, selectedNodes: [a, b],
    origin: () => ({ x: 0, y: 0 }), contentTransform: () => ({ x: 0, y: 0, scale: 1 }),
    designSize: () => ({ width: 400, height: 400 }),
    sourceNode: n => n, isSelected(n) { return this.selectedNodes.includes(n); },
    ensureKeys() { doc.ensureEditorIds(this.sourceTree); },
    beginHistory() { h.begin(this.sourceTree, this.selected._editorId); },
    commitHistory() { h.commit(this.sourceTree); },
    cancelHistory(ids) {
      const snap = h.cancel();
      if (!snap) return;
      this.tree = this.sourceTree = snap.tree;
      this.setSelection(ids.map(id => doc.findByEditorId(this.tree, id)).filter(Boolean));
      this.rebuildPreview();
    },
    selectNode(n) { this.setSelection(n ? [n] : []); },
    setSelection(nodes) { this.selectedNodes = nodes; this.selected = nodes[nodes.length - 1] || null; },
    enterPickMode() { this.setSelection([]); },
    rebuildPreview() { doc.walk(this.tree, n => { n._layout = { x: n.left || 0, y: n.top || 0, w: n.width, h: n.height }; }); },
    draw() {}, refreshInspector() {}, updateMeta() {},
  };
  app.ensureKeys(); app.rebuildPreview();
  context.UrhoxInput.bind(app);
  return { app, canvas, win, h };
}
for (const mode of ["pointercancel", "lostpointercapture", "escape", "blur"]) {
  const { app, canvas, win, h } = setup();
  canvas.fire("pointerdown", { altKey: true });
  canvas.fire("pointermove", { clientX: 65, clientY: 61 });
  assert(app.tree.children.length > 2, "Alt gesture creates temporary copies");
  if (mode === "escape") win.fire("keydown", { key: "Escape" });
  else if (mode === "blur") win.fire("blur");
  else canvas.fire(mode);
  assert.equal(app.tree.children.length, 2, mode + " must roll back Alt copies");
  assert.equal(app.tree.children[0].left, 30);
  assert.equal(h.undoStack.length, 0, "cancelled gesture creates no undo step");
  assert.equal(app.selectedNodes.length, 2, "cancel restores full original selection");
  assert.equal(app.drag, null);
}
{
  const { app, canvas, h, win } = setup();
  h.redoStack.push({ tree: { type: "Panel" } });
  canvas.fire("pointerdown", { clientX: 80, clientY: 80 });
  canvas.fire("pointermove", { clientX: 100, clientY: 110 });
  assert.equal(app.tree.children[0].width, 70);
  win.fire("keydown", { key: "Escape" });
  assert.equal(app.tree.children[0].width, 50, "cancel resize restores dimensions");
  assert.equal(h.redoStack.length, 1, "cancellation preserves preexisting redo");
  assert.equal(h.openTxn, null);
  assert.equal(canvas.capture, null);
}
{
  const { app, canvas, win, h } = setup();
  canvas.fire("pointerdown", { clientX: 300, clientY: 20 });
  assert.equal(app.drag.mode, "marquee");
  canvas.fire("pointermove", { clientX: 10, clientY: 100 });
  assert.equal(app.selectedNodes.length, 1);
  win.fire("keydown", { key: "Escape" });
  assert.equal(app.selectedNodes.length, 2, "cancel marquee restores the original selection");
  assert.equal(h.undoStack.length, 0);
}
{
  const { app, canvas, h } = setup();
  canvas.fire("pointerdown");
  canvas.fire("pointermove", { clientX: 65, clientY: 61 });
  assert.equal(app.tree.children[1].left, 200, "mixed selection cannot drag a locked node");
  canvas.fire("pointerup");
  canvas.fire("lostpointercapture");
  assert.equal(h.undoStack.length, 1, "normal release commits exactly once");
  assert.equal(h.undo(app.tree).tree.children[0].left, 30);
}
console.log("gesture regression passed");
