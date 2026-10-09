const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

module.exports = (async function () {
  const context = { console };
  context.window = context;
  context.UrhoxYogaEngine = (await import("../web/vendor/yoga-layout/dist/src/index.js")).default;
  vm.createContext(context);
  for (const name of ["history", "doc", "geom", "yoga-lite", "commands"]) {
    vm.runInContext(fs.readFileSync(require.resolve("../web/src/" + name + ".js"), "utf8"), context);
  }
  const { UrhoxCommands: cmd, UrhoxDoc: doc, UrhoxYoga: yoga } = context;
  {
    const h = context.UrhoxHistory;
    const tree = { type: "Panel", children: [
      { type: "Label", id: "same", text: "Original" },
      { type: "Panel", id: "same", children: [] },
    ] };
    doc.ensureEditorIds(tree);
    const [label, panel] = tree.children;
    const baseline = h.nodeStates(tree);
    const changed = () => [...h.modifiedNodeKeys(tree, baseline)];
    label._layout = { x: 100 };
    assert.deepEqual(changed(), [], "preview caches do not dirty a node");
    label.text = "Edited";
    assert.deepEqual(changed(), [label._editorId], "only edited node changes, even with duplicate names");
    const inFlightSave = h.nodeStates(tree);
    label.id = "renamed";
    assert.deepEqual([...h.modifiedNodeKeys(tree, inFlightSave)], [label._editorId], "edits during save remain dirty");
    label.id = "same"; label.text = "Original";
    assert.deepEqual(changed(), [], "reverting to saved properties clears the marker");
    tree.children.shift(); panel.children.push(label);
    assert.deepEqual(new Set(changed()), new Set([tree._editorId, panel._editorId, label._editorId]), "reparenting marks changed relationships");
    const moved = h.nodeStates(tree);
    assert.deepEqual([...h.modifiedNodeKeys(h.cloneForHistory(tree), moved)], [], "undo snapshots retain identities");
    panel.children.push({ type: "NanoVG", commands: [] });
    doc.ensureEditorIds(tree);
    assert.deepEqual(new Set(h.modifiedNodeKeys(tree, moved)), new Set([panel._editorId, panel.children[1]._editorId]), "new nodes and their parent are modified");
    panel.children.pop();
    assert.deepEqual([...h.modifiedNodeKeys(tree, moved)], [], "undoing insertion clears markers");
  }
  function fixture() {
    const a = { type: "Panel", id: "a", width: "50%", height: 20 };
    const b = { type: "Panel", id: "b", width: 30, height: 20 };
    const p = { type: "Panel", id: "p", width: 200, height: 100, children: [a, b] };
    const q = { type: "Panel", id: "q", position: "absolute", left: 250, top: 80,
      width: 200, height: 150, borderWidth: 5, padding: 10, children: [] };
    const tree = { type: "Panel", width: 500, height: 400, children: [p, q] };
    const history = [];
    const app = { tree, sourceTree: tree, selected: a,
      pushHistory() { history.push(JSON.stringify(doc.cloneForPaste(tree))); },
      ensureKeys() { doc.ensureEditorIds(tree); },
      layout() { yoga.layoutTree(tree, 500, 400); },
      selectNode(n) { this.selected = n; this.selectedNodes = n ? [n] : []; },
      setSelection(nodes) { this.selectedNodes = nodes; this.selected = nodes[nodes.length - 1] || null; },
      refresh() {},
    };
    app.ensureKeys(); app.layout();
    return { app, a, b, p, q, history };
  }
  {
    const { app, p } = fixture();
    const first = cmd.createNode(app, "NanoVG", 20, 20, p);
    const second = cmd.createNode(app, "NanoVG", 40, 40, p);
    assert.equal(first.type, "NanoVG");
    assert.notEqual(first.id, second.id, "new vector layers have unique document IDs");
    assert.equal(first.commands[2][1].kind, "linearGradient");
    const snapshot = context.UrhoxHistory.cloneForSave(app.tree);
    assert.deepEqual(snapshot.children[0].children[2].commands, first.commands);
  }
  {
    const { app, a, b, p } = fixture();
    app.setSelection([a]);
    assert.equal(cmd.contextState(app).rename, true);
    p.locked = true;
    assert.equal(cmd.contextState(app).rename, false);
    assert.equal(cmd.contextState(app).lock, false, "a child cannot unlock a locked ancestor");
    assert.equal(cmd.contextState(app).add, false);
    p.locked = false;
    a.locked = true;
    assert.equal(cmd.contextState(app).lock, true, "a directly locked node can be unlocked");
    assert.equal(cmd.contextState(app).remove, false);
    a.locked = false;
    app.setSelection([p]);
    b.locked = true;
    assert.equal(cmd.contextState(app).remove, false, "deleting a parent protects its locked descendants");
    b.locked = false;
    app.setSelection([a, b]);
    a.position = b.position = "absolute";
    assert.equal(cmd.contextState(app).align, true);
    a.rotate = 30;
    assert.equal(cmd.contextState(app).align, false, "simple alignment cannot rewrite transformed coordinates");
    app.setSelection([]);
    assert.equal(cmd.contextState(app).add, true);
    assert.equal(cmd.contextState(app).paste, false);
  }
  {
    const { app, a, b, p, history } = fixture();
    p.borderWidth = 7;
    a.position = b.position = "absolute";
    a.left = 10; a.top = 20; b.left = 80; b.top = 45;
    a.zIndex = b.zIndex = 3;
    const tail = { type: "Panel", id: "tail", position: "absolute", width: 10, height: 10 };
    p.children.push(tail);
    app.layout();
    const before = [a, b].map(n => ({ ...n._layout }));
    app.setSelection([b, a]);
    cmd.group(app);
    const group = app.selected;
    assert.deepEqual(Array.from(group.children, n => n.id), ["a", "b"],
      "group keeps source order instead of click order");
    assert.equal(p.children[0], group, "group occupies first selected sibling slot");
    assert.equal(p.children[1], tail);
    assert.equal(group.zIndex, 3, "same stacking level survives grouping");
    assert.deepEqual([a._layout, b._layout], before, "group preserves world rectangles under a border");
    cmd.ungroup(app);
    assert.deepEqual(Array.from(p.children, n => n.id), ["a", "b", "tail"]);
    assert.deepEqual([a._layout, b._layout], before, "ungroup preserves world rectangles under a border");
    assert.equal(app.selectedNodes.length, 2);
    assert.equal(history.length, 2);
  }
  {
    const { app, a, b, p, history } = fixture();
    app.setSelection([a, b]);
    cmd.group(app);
    assert.equal(history.length, 0, "flow grouping does not silently destroy sibling layout");
    a.position = b.position = "absolute";
    b.locked = true;
    cmd.group(app);
    assert.equal(history.length, 0, "locked batch cannot group partially");
    app.selectNode(p);
    cmd.ungroup(app);
    assert.equal(history.length, 0, "locked descendant prevents ungroup");
    b.locked = false;
    cmd.ungroup(app);
    assert.equal(history.length, 0, "flow container removal must not shift other siblings");
  }
  {
    const { app, a, b, p } = fixture();
    a.position = b.position = "absolute";
    app.setSelection([a]);
    cmd.group(app);
    const first = app.selected;
    app.setSelection([b]);
    cmd.group(app);
    assert.notEqual(app.selected.id, first.id, "new groups have distinct names");
    app.setSelection([first, app.selected]);
    cmd.ungroup(app);
    assert.equal(p.children.length, 2, "unsupported multi-ungroup does not operate on primary only");
  }
  {
    const { app, a, b, p, history } = fixture();
    app.setSelection([b, a]);
    cmd.duplicate(app);
    assert.equal(app.selectedNodes.length, 2, "duplicate handles the whole selection");
    assert.deepEqual(Array.from(p.children, n => n.id), ["a", "a_copy", "b", "b_copy"],
      "copies follow their originals in source order");
    assert.equal(app.selectedNodes[0].width, "50%");
    assert.equal(app.selectedNodes[0].position, undefined, "flow copies remain in flow");
    assert.equal(history.length, 1);
    app.setSelection([a, b]);
    cmd.duplicate(app);
    const ids = p.children.map(n => n.id);
    assert.equal(new Set(ids).size, ids.length, "repeated duplication has distinct runtime names");
  }
  {
    const { app, a, p, q, history } = fixture();
    app.setSelection([a, p]);
    cmd.copy(app);
    assert.equal(app.clipboard.length, 1, "a selected descendant is copied through its parent only");
    app.selectNode(q);
    cmd.paste(app);
    assert.equal(q.children.length, 1);
    assert.equal(q.children[0].children.length, 2);
    assert.equal(history.length, 1);
    assert.notEqual(doc.getEditorId(q.children[0]), doc.getEditorId(p));
  }
  {
    const { app, a, b, p, q, history } = fixture();
    app.setSelection([b, a]);
    cmd.copy(app);
    a.id = "changed";
    app.selectNode(q);
    cmd.paste(app);
    assert.deepEqual(Array.from(q.children, n => n.id), ["a_copy", "b_copy"], "clipboard is frozen");
    app.setSelection([a, b]);
    cmd.remove(app);
    assert.equal(p.children.length, 0, "batch delete removes both");
    assert.equal(history.length, 2, "each batch uses one snapshot");
  }
  {
    const { app, a, b, p, q, history } = fixture();
    const previous = { type: "Label", id: "previous" };
    app.clipboard = previous;
    b.locked = true;
    app.setSelection([a, b]);
    cmd.cut(app);
    cmd.duplicate(app);
    assert.equal(p.children.length, 2, "locked selection does not partially mutate");
    assert.equal(app.clipboard, previous, "rejected cut preserves clipboard");
    app.selectNode(q);
    q.locked = true;
    cmd.paste(app);
    assert.equal(q.children.length, 0, "locked paste destination rejected");
    app.setSelection([p]);
    cmd.remove(app);
    assert.equal(app.tree.children.length, 2, "delete ancestor must not remove locked descendants");
    app.setSelection([app.tree, a]);
    cmd.remove(app);
    assert.equal(history.length, 0, "root/locked operations add no history");
  }
  {
    const { app, a, b, p, history } = fixture();
    app.setSelection([a, b]);
    cmd.cut(app);
    assert.equal(p.children.length, 0);
    assert.equal(app.clipboard.length, 2);
    assert.equal(history.length, 1, "cut is one undo step");
    app.selectNode(p);
    cmd.paste(app);
    assert.equal(p.children.length, 2);
    const snap = JSON.parse(history[0]);
    assert.equal(snap.children[0].children.length, 2, "single undo snapshot contains both originals");
  }
  {
    const { app, a, p } = fixture();
    a.position = "absolute"; a.left = "10%"; a.top = 12;
    app.layout();
    app.selectNode(a);
    cmd.duplicate(app);
    assert.equal(app.selected.width, "50%");
    assert.equal(app.selected.left, "18%", "offset keeps percentage positioning");
    assert.equal(app.selected._layout.x, a._layout.x + 16);
    assert.equal(p.children.length, 3);
  }
  {
    const { app, a, p, q, history } = fixture();
    p.locked = true;
    cmd.reparent(app, a, q);
    assert.equal(doc.parentOf(app.tree, a), p, "locked ancestor prevents dragging descendants");
    assert.equal(history.length, 0);
  }
  {
    const { app, a, b, p, history } = fixture();
    cmd.reparent(app, b, p, 0);
    assert.equal(p.children[0], b, "tree insertion index reorders siblings");
    assert.equal(a.width, "50%");
    assert.equal(b.position, undefined, "flow reorder must preserve layout mode");
    assert.equal(history.length, 1);
    cmd.reparent(app, b, p, 0);
    assert.equal(history.length, 1, "same position does not add history");
  }
  {
    const { app, a, q } = fixture();
    cmd.reparent(app, a, q);
    assert.equal(a.width, "50%", "flow reparent preserves responsive declarations");
    assert.equal(a.position, undefined);
    assert.equal(a.left, undefined);
    assert.equal(a._layout.x, q._layout.x + 15, "flow children follow target padding and border");
  }
  {
    const { app, a, q } = fixture();
    a.position = "absolute"; a.left = 25; a.top = 32;
    app.layout();
    const before = { ...a._layout };
    cmd.reparent(app, a, q);
    assert.deepEqual(a._layout, before, "absolute reparent preserves world bounds across a bordered parent");
  }
  {
    const { app, a, p, q, history } = fixture();
    cmd.reparent(app, p, a);
    cmd.reparent(app, app.tree, q);
    q.locked = true;
    cmd.reparent(app, a, q);
    assert.equal(history.length, 0, "cycles, root moves and locked destinations are rejected");
  }
  console.log("tree commands passed");
})();
