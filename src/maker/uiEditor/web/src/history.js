// history.js
// 用途：编辑器撤销 / 重做。快照含内部 _editorId，保存时再剥掉。
(function (root) {
  "use strict";

  function cloneNode(node, keepEditor) {
    if (!node || typeof node !== "object") return node;
    var out = {};
    Object.keys(node).forEach(function (key) {
      if (key.charAt(0) === "_" && !(keepEditor && key === "_editorId")) return;
      if (key === "children" && Array.isArray(node.children)) {
        out.children = node.children.map(function (child) { return cloneNode(child, keepEditor); });
      } else if (node[key] && typeof node[key] === "object") {
        out[key] = JSON.parse(JSON.stringify(node[key]));
      } else {
        out[key] = node[key];
      }
    });
    return out;
  }

  function cloneForSave(node) {
    return cloneNode(node, false);
  }

  function cloneForHistory(node) {
    return cloneNode(node, true);
  }

  function History(limit) {
    this.limit = limit || 80;
    this.undoStack = [];
    this.redoStack = [];
    this.paused = false;
    this.openTxn = null;
  }

  History.prototype.snapshot = function (tree, selectedId, selectedIds) {
    if (this.paused || !tree) return;
    if (this.openTxn) return;
    this.undoStack.push({
      tree: cloneForHistory(tree),
      selectedId: selectedId || null,
      selectedIds: selectedIds ? selectedIds.slice() : undefined,
    });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  };

  History.prototype.begin = function (tree, selectedId, label, selectedIds) {
    if (this.paused || !tree) return;
    if (this.openTxn) this.commit(tree);
    this.openTxn = {
      label: label || "",
      tree: cloneForHistory(tree),
      selectedId: selectedId || null,
      selectedIds: selectedIds ? selectedIds.slice() : undefined,
    };
  };

  History.prototype.update = function () {};

  History.prototype.commit = function (current) {
    if (!this.openTxn) return;
    if (current && JSON.stringify(cloneForSave(current)) === JSON.stringify(cloneForSave(this.openTxn.tree))) {
      this.openTxn = null;
      return;
    }
    this.undoStack.push(this.openTxn);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.openTxn = null;
  };

  History.prototype.cancel = function () {
    var txn = this.openTxn;
    this.openTxn = null;
    return txn;
  };

  History.prototype.undo = function (current, selectedId, selectedIds) {
    if (this.openTxn) this.commit(current);
    if (!this.undoStack.length) return null;
    var prev = this.undoStack.pop();
    this.redoStack.push({ tree: cloneForHistory(current), selectedId: selectedId || null,
      selectedIds: selectedIds ? selectedIds.slice() : undefined });
    return prev;
  };

  History.prototype.redo = function (current, selectedId, selectedIds) {
    if (this.openTxn) this.commit(current);
    if (!this.redoStack.length) return null;
    var next = this.redoStack.pop();
    this.undoStack.push({ tree: cloneForHistory(current), selectedId: selectedId || null,
      selectedIds: selectedIds ? selectedIds.slice() : undefined });
    return next;
  };

  History.prototype.clone = cloneForSave;

  root.UrhoxHistory = {
    History: History,
    cloneNode: cloneForSave,
    cloneForHistory: cloneForHistory,
    cloneForSave: cloneForSave,
  };
})(window);
