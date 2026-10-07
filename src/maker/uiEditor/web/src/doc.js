// doc.js
// 用途：.ui.json 节点树的纯操作。内部身份、坐标转换、模板展开。不碰 canvas / DOM。
(function (root) {
  "use strict";

  var seq = 0;

  function nextEditorId() {
    seq += 1;
    return "e" + seq;
  }

  function walk(node, visit, parent) {
    if (!node) return;
    visit(node, parent);
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) walk(children[i], visit, node);
  }

  function getEditorId(node) {
    if (!node) return "";
    var existing = /^e(\d+)$/.exec(node._editorId || "");
    if (existing) seq = Math.max(seq, Number(existing[1]));
    if (!node._editorId) node._editorId = nextEditorId();
    return node._editorId;
  }

  function nodeKey(node) {
    return getEditorId(node);
  }

  function ensureEditorIds(node) {
    if (!node) return;
    getEditorId(node);
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) ensureEditorIds(children[i]);
  }

  function ensureKeys(node) {
    ensureEditorIds(node);
  }

  function resetKeys() {
    seq = 0;
  }

  function findByEditorId(node, editorId) {
    if (!node || !editorId) return null;
    if (node._editorId === editorId) return node;
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) {
      var found = findByEditorId(children[i], editorId);
      if (found) return found;
    }
    return null;
  }

  function findById(node, id) {
    if (!node || id == null) return null;
    if (node._editorId === id || node.id === id) return node;
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) {
      var found = findById(children[i], id);
      if (found) return found;
    }
    return null;
  }

  function parentOf(rootNode, node) {
    var found = null;
    walk(rootNode, function (cur, parent) {
      if (cur === node) found = parent || null;
    });
    return found;
  }

  function ancestors(rootNode, node) {
    var list = [];
    var cur = parentOf(rootNode, node);
    while (cur) {
      list.push(cur);
      cur = parentOf(rootNode, cur);
    }
    return list;
  }

  function selectableNodes(rootNode) {
    var nodes = [];
    function visit(node) {
      if (!node || node.locked || node.visible === false || isGenerated(node)) return;
      if (node !== rootNode) nodes.push(node);
      (node.children || []).forEach(visit);
    }
    visit(rootNode);
    return nodes;
  }

  function applyRect(node, x, y, w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    node.position = node.position || "absolute";
    node.left = Math.round(x);
    node.top = Math.round(y);
    node.width = w;
    node.height = h;
    delete node.right;
    delete node.bottom;
  }

  function getWorldRect(rootNode, node) {
    if (node && node._layout) {
      return { x: node._layout.x, y: node._layout.y, w: node._layout.w, h: node._layout.h };
    }
    var parent = rootNode ? parentOf(rootNode, node) : null;
    var origin = parent && parent._layout
      ? { x: parent._layout.x, y: parent._layout.y }
      : { x: 0, y: 0 };
    return {
      x: origin.x + (Number(node && node.left) || 0),
      y: origin.y + (Number(node && node.top) || 0),
      w: Number(node && node.width) || 1,
      h: Number(node && node.height) || 1,
    };
  }

  function worldToParentRect(rootNode, parent, worldRect) {
    var origin = parent && parent._layout
      ? { x: parent._layout.x, y: parent._layout.y }
      : { x: 0, y: 0 };
    return {
      x: worldRect.x - origin.x,
      y: worldRect.y - origin.y,
      w: worldRect.w,
      h: worldRect.h,
    };
  }

  function parentToWorldRect(rootNode, parent, localRect) {
    var origin = parent && parent._layout
      ? { x: parent._layout.x, y: parent._layout.y }
      : { x: 0, y: 0 };
    return {
      x: origin.x + localRect.x,
      y: origin.y + localRect.y,
      w: localRect.w,
      h: localRect.h,
    };
  }

  function setWorldRect(rootNode, node, worldRect) {
    var parent = parentOf(rootNode, node);
    var local = worldToParentRect(rootNode, parent, worldRect);
    applyRect(node, local.x, local.y, local.w, local.h);
    if (node._layout) {
      node._layout.x = worldRect.x;
      node._layout.y = worldRect.y;
      node._layout.w = Math.max(1, Math.round(worldRect.w));
      node._layout.h = Math.max(1, Math.round(worldRect.h));
    }
  }

  function applyWorldRect(rootNode, node, x, y, w, h) {
    setWorldRect(rootNode, node, { x: x, y: y, w: w, h: h });
  }

  function moveWorldRect(rootNode, node, x, y) {
    var current = getWorldRect(rootNode, node);
    var parent = parentOf(rootNode, node);
    var parentBox = parent && parent._layout || { w: 0, h: 0 };
    function offset(value, delta, extent) {
      if (typeof value === "string" && /%$/.test(value) && extent > 0) {
        return (parseFloat(value) + delta / extent * 100) + "%";
      }
      return Math.round((Number(value) || 0) + delta);
    }
    function axis(start, end, delta, extent) {
      if (!delta) return;
      if (node[start] != null || node[end] == null) node[start] = offset(node[start], delta, extent);
      if (node[end] != null) node[end] = offset(node[end], -delta, extent);
    }
    axis("left", "right", x - current.x, parentBox.w);
    axis("top", "bottom", y - current.y, parentBox.h);
    if (node._layout) {
      node._layout.x = x;
      node._layout.y = y;
    }
  }

  function parentOrigin(rootNode, node) {
    var parent = parentOf(rootNode, node);
    if (!parent) return { x: 0, y: 0 };
    if (parent._layout) return { x: parent._layout.x, y: parent._layout.y };
    return { x: Number(parent.left) || 0, y: Number(parent.top) || 0 };
  }

  function cloneForPaste(node) {
    var copy = root.UrhoxHistory.cloneNode(node);
    walk(copy, function (cur) {
      delete cur._editorId;
      if (cur.id) cur.id = cur.id + "_copy";
    });
    ensureEditorIds(copy);
    return copy;
  }

  function count(node) {
    var n = 0;
    walk(node, function () { n += 1; });
    return n;
  }

  function designSize(tree) {
    var w = tree && typeof tree.width === "number" ? tree.width : 1080;
    var h = tree && typeof tree.height === "number" ? tree.height : 1920;
    return { width: Math.max(1, w), height: Math.max(1, h) };
  }

  function cloneTree(node) {
    return JSON.parse(JSON.stringify(node, function (key, value) {
      if (key.charAt(0) === "_") return undefined;
      return value;
    }));
  }

  function parsePropToken(value) {
    if (typeof value !== "string" || value.charAt(0) !== "$") return null;
    var body = value.slice(1);
    var colon = body.indexOf(":");
    if (colon < 0) return { name: body, raw: "" };
    return { name: body.slice(0, colon), raw: body.slice(colon + 1) };
  }

  function coercePropDefault(raw, key) {
    if (raw === "") return undefined;
    if (key === "id" || key === "text" || key === "backgroundImage") return raw;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return raw;
  }

  function expandPropDefaults(node) {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) expandPropDefaults(node[i]);
      return node;
    }
    Object.keys(node).forEach(function (key) {
      if (key === "children") {
        expandPropDefaults(node.children);
        return;
      }
      var token = parsePropToken(node[key]);
      if (!token) {
        if (node[key] && typeof node[key] === "object") expandPropDefaults(node[key]);
        return;
      }
      var next = coercePropDefault(token.raw, key);
      if (next === undefined) {
        if (key === "id") node[key] = token.name;
        else if (key === "text") node[key] = "";
        else delete node[key];
      } else {
        node[key] = next;
      }
    });
    return node;
  }

  function stampIds(node, slot) {
    if (node.id) node.id = node.id + "_" + slot;
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) stampIds(children[i], slot);
  }

  function expandRepeats(source, templates) {
    templates = templates || {};
    var preview = root.UrhoxHistory.cloneForHistory(source);
    expandPropDefaults(preview);
    walk(preview, function (node) {
      var spec = node.$repeat;
      if (!spec || !spec.template) return;
      var tmpl = templates[spec.template]
        || templates["assets/" + spec.template]
        || templates[spec.template.replace(/^assets\//, "")];
      if (!tmpl) {
        node._generated = true;
        node._repeatHost = true;
        return;
      }
      var countValue = spec.count || 0;
      var cols = spec.columns || 1;
      var startX = spec.startX || 0;
      var startY = spec.startY || 0;
      var gapX = spec.gapX || 0;
      var gapY = spec.gapY || 0;
      var tileW = tmpl.width || 0;
      var tileH = tmpl.height || 0;
      node.children = [];
      node._repeatHost = true;
      for (var i = 0; i < countValue; i++) {
        var col = i % cols;
        var row = Math.floor(i / cols);
        var copy = cloneTree(tmpl);
        copy.position = "absolute";
        copy.left = startX + col * gapX;
        copy.top = startY + row * gapY;
        copy.width = copy.width || tileW;
        copy.height = copy.height || tileH;
        stampIds(copy, i + 1);
        expandPropDefaults(copy);
        walk(copy, function (child) { child._generated = true; });
        copy._repeatIndex = i;
        if (copy.id && copy.children) {
          var num = copy.children.filter(function (c) { return c.id && String(c.id).indexOf("number") >= 0; })[0];
          if (num) num.text = String(i + 1);
        }
        node.children.push(copy);
      }
    });
    ensureEditorIds(preview);
    return preview;
  }

  function componentValue(components, ref) {
    if (!ref) return null;
    return components[ref] || components["assets/" + ref] || components[ref.replace(/^assets\//, "")]
      || null;
  }

  function expandComponents(source, components) {
    var preview = root.UrhoxHistory.cloneForHistory(source);
    components = components || {};
    walk(preview, function (node) {
      if (!node || !node.component) return;
      var template = componentValue(components, node.component);
      if (!template) {
        node._componentMissing = true;
        return;
      }
      var instance = root.UrhoxHistory.cloneForHistory(node);
      var expanded = root.UrhoxHistory.cloneForHistory(template);
      var children = expanded.children || [];
      Object.keys(instance).forEach(function (key) {
        if (key !== "children" && key !== "component") expanded[key] = instance[key];
      });
      expanded.children = children;
      Object.keys(node).forEach(function (key) { delete node[key]; });
      Object.keys(expanded).forEach(function (key) { node[key] = expanded[key]; });
      node._componentRef = instance.component;
      node.children.forEach(function (child) {
        walk(child, function (descendant) { descendant._generated = true; });
      });
    });
    ensureEditorIds(preview);
    return preview;
  }

  function isGenerated(node) {
    return !!(node && node._generated);
  }

  function pathOf(rootNode, node) {
    var path = [];
    var cur = node;
    while (cur && cur !== rootNode) {
      var parent = parentOf(rootNode, cur);
      if (!parent) return null;
      path.unshift((parent.children || []).indexOf(cur));
      cur = parent;
    }
    return path;
  }

  function atPath(rootNode, path) {
    if (!rootNode || !path) return null;
    var cur = rootNode;
    for (var i = 0; i < path.length; i++) {
      cur = (cur.children || [])[path[i]];
      if (!cur) return null;
    }
    return cur;
  }

  function sourceOf(sourceRoot, previewRoot, previewNode) {
    if (!previewNode) return null;
    if (sourceRoot === previewRoot) return previewNode;
    var match = findByEditorId(sourceRoot, previewNode._editorId);
    if (match && !previewNode._generated) return match;
    var cur = previewNode;
    while (cur && cur._generated) cur = parentOf(previewRoot, cur);
    if (!cur) return sourceRoot;
    var path = pathOf(previewRoot, cur);
    return atPath(sourceRoot, path) || sourceRoot;
  }

  function hitTestOrder(tree, designMode) {
    var list = [];
    function visit(node, clip) {
      if (!node || node._hidden || !node._layout) return;
      var box = node._layout;
      var nextClip = clip;
      if (node.overflow === "hidden" || node.overflow === "scroll") {
        nextClip = clip
          ? intersectRect(clip, box)
          : { x: box.x, y: box.y, w: box.w, h: box.h };
      }
      var children = (node.children || []).slice();
      children.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
      var i;
      var pe = node.pointerEvents;
      if (!designMode && pe === "box-only") {
        list.push({ node: node, clip: clip });
        return;
      }
      if (designMode || pe !== "none" && pe !== "box-none") list.push({ node: node, clip: clip });
      for (i = 0; i < children.length; i++) visit(children[i], nextClip);
    }
    visit(tree, null);
    return list;
  }

  function intersectRect(a, b) {
    var x = Math.max(a.x, b.x);
    var y = Math.max(a.y, b.y);
    var r = Math.min(a.x + a.w, b.x + b.w);
    var btm = Math.min(a.y + a.h, b.y + b.h);
    return { x: x, y: y, w: Math.max(0, r - x), h: Math.max(0, btm - y) };
  }

  function containsPoint(box, x, y) {
    return x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
  }

  function validateTree(tree) {
    function visit(node, path) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        throw new Error(path + " 必须是 UI 节点对象");
      }
      if ((path === "root" || node.type != null) &&
          (typeof node.type !== "string" || !node.type.trim())) {
        throw new Error(path + ".type 必须是控件类型名称");
      }
      if (node.children != null && !Array.isArray(node.children)) {
        throw new Error(path + ".children 必须是数组");
      }
      (node.children || []).forEach(function (child, i) { visit(child, path + ".children[" + i + "]"); });
    }
    visit(tree, "root");
  }

  function pickAt(tree, x, y, options) {
    options = options || {};
    var skip = options.skip || [];
    var includeLocked = !!options.includeLocked;
    var list = hitTestOrder(tree, options.designMode);
    var hits = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var item = list[i];
      var node = item.node;
      if (!node || node === tree) continue;
      if (node._hidden) continue;
      if (!includeLocked && (node.locked || ancestors(tree, node).some(function (p) { return p.locked; }))) continue;
      if (skip.indexOf(node) >= 0) continue;
      if (!options.designMode && node.pointerEvents === "none") continue;
      var box = node._layout;
      if (!box) continue;
      if (root.UrhoxGeom && root.UrhoxGeom.worldMatrix) {
        var inv = root.UrhoxGeom.inverse(root.UrhoxGeom.worldMatrix(tree, node));
        if (!inv) continue;
        var p = root.UrhoxGeom.point(inv, { x: x, y: y });
        if (!containsPoint(box, p.x, p.y)) continue;
        var clipped = ancestors(tree, node).some(function (parent) {
          if (parent.overflow !== "hidden" && parent.overflow !== "scroll") return false;
          var inverse = root.UrhoxGeom.inverse(root.UrhoxGeom.worldMatrix(tree, parent));
          if (!inverse) return true;
          var local = root.UrhoxGeom.point(inverse, { x: x, y: y });
          return !containsPoint(parent._layout, local.x, local.y);
        });
        if (clipped) continue;
      } else {
        if (!containsPoint(box, x, y)) continue;
        if (item.clip && (item.clip.w <= 0 || item.clip.h <= 0 || !containsPoint(item.clip, x, y))) continue;
      }
      hits.push(node);
    }
    return hits;
  }

  root.UrhoxDoc = {
    selectableNodes: selectableNodes,
    validateTree: validateTree,
    walk: walk,
    nodeKey: nodeKey,
    getEditorId: getEditorId,
    ensureEditorIds: ensureEditorIds,
    ensureKeys: ensureKeys,
    resetKeys: resetKeys,
    findByEditorId: findByEditorId,
    findById: findById,
    parentOf: parentOf,
    ancestors: ancestors,
    applyRect: applyRect,
    applyWorldRect: applyWorldRect,
    moveWorldRect: moveWorldRect,
    getWorldRect: getWorldRect,
    worldToParentRect: worldToParentRect,
    parentToWorldRect: parentToWorldRect,
    setWorldRect: setWorldRect,
    parentOrigin: parentOrigin,
    cloneForPaste: cloneForPaste,
    count: count,
    designSize: designSize,
    expandRepeats: expandRepeats,
    expandComponents: expandComponents,
    cloneTree: cloneTree,
    expandPropDefaults: expandPropDefaults,
    isGenerated: isGenerated,
    pathOf: pathOf,
    atPath: atPath,
    sourceOf: sourceOf,
    hitTestOrder: hitTestOrder,
    pickAt: pickAt,
  };
})(window);
