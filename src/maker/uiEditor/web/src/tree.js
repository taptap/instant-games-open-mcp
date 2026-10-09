// tree.js
// 用途：左侧 UI 节点树。只负责 DOM，选中/显隐/改父由预览模块回调。
(function (root) {
  "use strict";
  var draggingKey = null;

  function nodeLabel(node) {
    var typeName = node.type || "Node";
    var name = node.id || "";
    var extra = typeof node.text === "string" ? node.text : "";
    return { typeName: typeName, name: name, extra: extra };
  }

  function renderNode(container, node, depth, opts, parent, inheritedHidden, inheritedLocked) {
    if (opts.searching && !opts.searchVisible.has(node)) return;
    var children = Array.isArray(node.children) ? node.children : [];
    var key = opts.nodeKey(node);
    var collapsed = !opts.searching && !!opts.collapsed[key];
    var selected = (opts.selectedNodes || []).indexOf(node) >= 0;

    var hidden = inheritedHidden || node.visible === false;
    var locked = inheritedLocked || node.locked;
    var row = document.createElement("div");
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", depth + 1);
    row.setAttribute("aria-selected", String(selected));
    if (children.length) row.setAttribute("aria-expanded", String(!collapsed));
    row.tabIndex = 0;
    row.dataset.nodeKey = key;
    row.title = [node.type, node.id, inheritedHidden ? "父节点已隐藏" : "",
      inheritedLocked ? "父节点已锁定" : ""].filter(Boolean).join(" · ");
    row.className = "tree-row" + (selected ? " selected" : "") + (hidden ? " hidden-node" : "");
    row.classList.toggle("search-match", !!opts.searching && opts.searchMatches.has(node));
    var modified = !!opts.modifiedNodes && opts.modifiedNodes.has(key);
    row.classList.toggle("modified-node", modified);
    row.style.paddingLeft = (6 + depth * 14) + "px";

    var vis = document.createElement("input");
    vis.type = "checkbox";
    vis.className = "tree-vis";
    vis.checked = node.visible !== false;
    vis.title = vis.checked ? "显示节点及子节点" : "隐藏节点及子节点";
    vis.addEventListener("click", function (event) { event.stopPropagation(); });
    vis.addEventListener("change", function (event) {
      event.stopPropagation();
      opts.onVisible(node, vis.checked);
    });
    row.appendChild(vis);

    var lock = document.createElement("span");
    lock.className = "tree-lock";
    lock.textContent = node.locked ? "🔒" : "";
    if (inheritedLocked) lock.textContent = "🔒";
    lock.title = inheritedLocked ? "父节点已锁定" : node.locked ? "已锁定" : "";
    row.appendChild(lock);

    var toggle = document.createElement(children.length ? "button" : "span");
    toggle.className = "tree-toggle";
    toggle.textContent = children.length ? (collapsed ? "▸" : "▾") : "";
    if (children.length) {
      toggle.type = "button";
      toggle.disabled = opts.searching;
      toggle.title = (collapsed ? "展开 " : "折叠 ") + (node.id || node.type);
      toggle.setAttribute("aria-label", toggle.title);
    }
    row.appendChild(toggle);

    var label = nodeLabel(node);
    var typeEl = document.createElement("span");
    typeEl.className = "tree-type";
    typeEl.dataset.type = label.typeName;
    window.UrhoxUiTools.highlight(typeEl, label.typeName, opts.query || "");
    row.appendChild(typeEl);
    if (label.name) {
      var idEl = document.createElement("span");
      idEl.className = "tree-id";
      idEl.title = modified ? "有未保存的修改" : "";
      window.UrhoxUiTools.highlight(idEl, " " + label.name, opts.query || "");
      row.appendChild(idEl);
    }
    if (label.extra) {
      var extraEl = document.createElement("span");
      extraEl.className = "tree-text";
      window.UrhoxUiTools.highlight(extraEl, "  " + label.extra, opts.query || "");
      row.appendChild(extraEl);
    }
    if (selected) {
      if (opts.onAdd) {
        var add = document.createElement("button");
        add.type = "button";
        add.className = "tree-add";
        add.textContent = "+";
        add.title = "添加子节点";
        add.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          opts.onAdd(node);
        });
        row.appendChild(add);
      }
      if (opts.onDelete && parent) {
        var del = document.createElement("button");
        del.type = "button";
        del.className = "tree-add";
        del.textContent = "×";
        del.title = "删除节点";
        del.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          opts.onDelete(node);
        });
        row.appendChild(del);
      }
    }

    row.addEventListener("click", function (event) {
      event.preventDefault();
      if (event.target === toggle && children.length) {
        opts.onToggle(key);
        focusKey(key);
        return;
      }
      opts.onSelect(node, event.shiftKey);
      focusKey(key);
    });
    row.addEventListener("contextmenu", function (event) {
      if (!root.UrhoxContextMenu) return;
      event.preventDefault(); event.stopPropagation();
      root.UrhoxContextMenu.nodes([node], event.clientX, event.clientY);
    });
    function focusKey(nextKey) {
      var nextRow = Array.from(container.children).find(function (el) { return el.dataset.nodeKey === nextKey; });
      if (nextRow) nextRow.focus();
    }
    row.addEventListener("keydown", function (event) {
      if (event.target !== row) {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (["Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(event.key) < 0) return;
      event.preventDefault();
      event.stopPropagation();
      var rows = Array.from(container.children);
      var at = rows.indexOf(row);
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        var nextRow = rows[at + (event.key === "ArrowUp" ? -1 : 1)];
        if (nextRow) nextRow.click();
        if (nextRow) focusKey(nextRow.dataset.nodeKey);
      } else if (!opts.searching && ((event.key === "ArrowRight" && children.length && collapsed) ||
          (event.key === "ArrowLeft" && children.length && !collapsed))) {
        opts.onToggle(key);
        focusKey(key);
      } else if (event.key === "ArrowLeft" && parent) {
        opts.onSelect(parent, false);
        focusKey(opts.nodeKey(parent));
      } else if (event.key === "ArrowRight" && children.length) {
        var child = opts.searching ? children.find(function (n) { return opts.searchVisible.has(n); }) : children[0];
        if (child) { opts.onSelect(child, false); focusKey(opts.nodeKey(child)); }
      } else {
        opts.onSelect(node, event.shiftKey);
        focusKey(key);
      }
    });
    row.draggable = !!parent && !locked;
    row.addEventListener("dragstart", function (event) {
      if (!row.draggable) { event.preventDefault(); return; }
      draggingKey = key;
      event.dataTransfer.setData("application/x-urhox-node", key);
      event.dataTransfer.effectAllowed = "move";
    });
    function clearDrop() {
      row.classList.remove("drop-target", "drop-before", "drop-after");
    }
    function dropInfo(event) {
      var rect = row.getBoundingClientRect();
      var ratio = (event.clientY - rect.top) / rect.height;
      if (parent && ratio < 0.25) return { parent: parent, index: parent.children.indexOf(node), mode: "drop-before" };
      if (parent && ratio > 0.75) return { parent: parent, index: parent.children.indexOf(node) + 1, mode: "drop-after" };
      return { parent: node, mode: "drop-target" };
    }
    function showDrop(event) {
      clearDrop();
      var info = dropInfo(event);
      if (!draggingKey || draggingKey === key || !opts.canReparent(draggingKey, info.parent)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      row.classList.add(info.mode);
    }
    row.addEventListener("dragenter", showDrop);
    row.addEventListener("dragover", showDrop);
    row.addEventListener("dragleave", clearDrop);
    row.addEventListener("dragend", function () {
      draggingKey = null;
      Array.from(container.children).forEach(function (el) {
        el.classList.remove("drop-target", "drop-before", "drop-after");
      });
    });
    row.addEventListener("drop", function (event) {
      event.preventDefault();
      event.stopPropagation();
      clearDrop();
      var source = event.dataTransfer.getData("application/x-urhox-node");
      var info = dropInfo(event);
      if (source && source !== key && opts.canReparent(source, info.parent)) {
        opts.onReparent(source, info.parent, info.index);
      }
      draggingKey = null;
    });

    container.appendChild(row);
    if (!collapsed) {
      for (var i = 0; i < children.length; i++) renderNode(container, children[i], depth + 1, opts, node, hidden, locked);
    }
  }

  root.UrhoxTree = {
    render: function (container, rootNode, opts) {
      if (!container) return;
      container.setAttribute("role", "tree");
      container.setAttribute("aria-label", "UI 节点");
      container.setAttribute("aria-multiselectable", "true");
      container.innerHTML = "";
      if (!rootNode) return;
      opts.searching = !!(opts.query || "").trim();
      opts.searchMatches = new Set();
      opts.searchVisible = new Set();
      if (opts.searching) {
        function scan(node) {
          var label = nodeLabel(node);
          var match = [label.name, label.typeName, label.extra].some(function (value) {
            return root.UrhoxUiTools.matchPositions(value, opts.query) !== null;
          });
          if (match) opts.searchMatches.add(node);
          var childMatch = false;
          (node.children || []).forEach(function (child) { if (scan(child)) childMatch = true; });
          if (match || childMatch) opts.searchVisible.add(node);
          return match || childMatch;
        }
        scan(rootNode);
      }
      renderNode(container, rootNode, 0, opts);
      if (opts.searching && !opts.searchMatches.size) {
        var empty = document.createElement("p"); empty.className = "muted";
        empty.textContent = "没有匹配的节点"; container.appendChild(empty);
      }
      return Array.from(opts.searchMatches);
    },
    nodeLabel: nodeLabel,
  };
})(window);
