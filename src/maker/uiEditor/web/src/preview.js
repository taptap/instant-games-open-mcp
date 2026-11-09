// preview.js
// 用途：编辑会话。把文档、绘制、手势、命令接到一起，本身不做大段算法。
(function () {
  "use strict";

  var CFG = window.UrhoxConfig || {};
  var DEFAULT_UI = CFG.DEFAULT_UI || "";
  var DEFAULT_ASSET_ROOT = CFG.DEFAULT_ASSET_ROOT;
  var DEVICES = CFG.DEVICES || {
    "1080p": { id: "1080p", name: "1080p", width: 1080, height: 1920, bezel: 28 },
  };

  var app = {
    canvas: document.getElementById("stage"),
    ctx: null,
    treeEl: document.getElementById("tree"),
    inspectorEl: document.getElementById("inspector"),
    metaEl: document.getElementById("meta"),
    sourceTree: null,
    tree: null,
    templates: {},
    components: {},
    missingComponents: [],
    projectConfig: null,
    path: DEFAULT_UI,
    device: DEVICES["1080p"] || DEVICES[Object.keys(DEVICES)[0]],
    screen: { width: 1080, height: 1920 },
    selected: null,
    selectedNodes: [],
    hover: null,
    marquee: null,
    spacingTarget: null,
    collapsed: {},
    drag: null,
    lockedFromTree: false,
    clipboard: null,
    guides: [],
    history: new window.UrhoxHistory.History(80),
    editMode: "screen",
    componentPreview: false,
    createKind: null,
  };
  app.ctx = app.canvas.getContext("2d");
  app.screen.width = app.device.width;
  app.screen.height = app.device.height;
  function validDesignResolution(value) {
    return value && typeof value === "object" && !Array.isArray(value) &&
      [value.width, value.height].every(function (size) { return Number.isFinite(size) && size >= 1 && size <= 16384; });
  }
  // Preview preferences belong to the project, never to a device preset or the saved UI tree.
  var scalePreferenceKey = CFG.FILE_ROOT && "urhox-ui-design-resolution:" + CFG.FILE_ROOT;
  var adaptationPreferencePrefix = "urhox-ui-adaptation:" + (CFG.FILE_ROOT || "");
  var renderOnly = typeof location !== "undefined" && new URLSearchParams(location.search).has("render");
  if (scalePreferenceKey && !renderOnly) {
    try {
      var preference = JSON.parse(localStorage.getItem(scalePreferenceKey));
      if (validDesignResolution(preference)) app.designResolution = preference;
    } catch (_) {}
  }

  function projectRelativePath(path) {
    var value = String(path || "");
    if (CFG.displayPath) value = CFG.displayPath(value);
    else if (CFG.FILE_ROOT && value.indexOf(CFG.FILE_ROOT) === 0) value = value.slice(CFG.FILE_ROOT.length);
    return value;
  }

  function adaptationPreferenceKey(path) {
    return adaptationPreferencePrefix + projectRelativePath(path);
  }

  function orientationPreferenceKey(path) {
    return "urhox-ui-orientation:" + (CFG.FILE_ROOT || "") + projectRelativePath(path);
  }

  function readOrientationPreference(path) {
    if (renderOnly || typeof localStorage === "undefined") return null;
    try {
      var raw = localStorage.getItem(orientationPreferenceKey(path));
      if (!raw) return null;
      var value = JSON.parse(raw);
      return value && (value.orientation === "landscape" || value.orientation === "portrait")
        ? value.orientation : null;
    } catch (_) { return null; }
  }

  function rememberOrientationPreference(path, orientation) {
    if (renderOnly || typeof localStorage === "undefined" || !path) return;
    try {
      localStorage.setItem(orientationPreferenceKey(path), JSON.stringify({
        orientation: orientation === "landscape" ? "landscape" : "portrait",
      }));
    } catch (_) {}
  }

  function readAdaptationPreference(path) {
    if (renderOnly || typeof localStorage === "undefined") return null;
    try {
      var raw = localStorage.getItem(adaptationPreferenceKey(path));
      // Read the pre-normalization key once so existing editor sessions keep their state.
      if (!raw) raw = localStorage.getItem(adaptationPreferencePrefix + String(path || ""));
      var value = JSON.parse(raw);
      if (!value || value.mode !== "screen" || value.logicalShortSide <= 0) return null;
      if (value.orientation !== "landscape" && value.orientation !== "portrait") return null;
      return { mode: "screen", logicalShortSide: value.logicalShortSide, orientation: value.orientation };
    } catch (_) { return null; }
  }

  function rememberAdaptationPreference(path, orientation) {
    if (renderOnly || typeof localStorage === "undefined" || !path) return;
    try {
      localStorage.setItem(adaptationPreferenceKey(path), JSON.stringify({
        mode: "screen", logicalShortSide: 720, orientation: orientation === "landscape" ? "landscape" : "portrait",
      }));
    } catch (_) {}
  }

  function origin() {
    return {
      x: Number(app.canvas.dataset.originX || 400),
      y: Number(app.canvas.dataset.originY || 400),
    };
  }

  function isScreenDoc(tree) {
    if (!tree) return true;
    if (tree.previewFit === "contain") return true;
    if (tree.width === "100%" || tree.height === "100%" || tree.type === "SafeAreaView") return true;
    var w = typeof tree.width === "number" ? tree.width : 0;
    var h = typeof tree.height === "number" ? tree.height : 0;
    if (!w || !h) return false;
    return Math.min(w, h) >= 480 && Math.max(w, h) >= 800;
  }

  function designSize() {
    if (!inViewport()) return window.UrhoxDoc.designSize(app.tree);
    if (containedDesign()) return containedDesign();
    var scale = deviceScale();
    return { width: app.screen.width / scale, height: app.screen.height / scale };
  }

  function inViewport() {
    return app.editMode !== "prefab" || app.componentPreview;
  }

  function adaptedLogicalDraft() {
    var adapt = app.documentAdaptation;
    return !!(adapt && adapt.mode === "screen" && adapt.logicalShortSide > 0);
  }

  // The editor's adaptation adds this stable wrapper. It lets a saved adapted UI reopen
  // correctly even when the browser preference was cleared or the editor was reopened elsewhere.
  function hasEditorAdaptedStructure(tree) {
    if (!tree || tree.width !== "100%" || tree.height !== "100%") return false;
    var safe = (tree.children || []).find(function (node) {
      return node && /^safe_area(?:_\d+)?$/.test(String(node.id || "")) &&
        node.type === "SafeAreaView" && node.position === "absolute" &&
        node.left === 0 && node.top === 0 && node.right === 0 && node.bottom === 0;
    });
    var content = safe && (safe.children || []).find(function (node) {
      return node && /^safe_content(?:_\d+)?$/.test(String(node.id || "")) &&
        node.type === "Panel" && node.flexGrow === 1;
    });
    return !!(safe && safe.position === "absolute" && content && content.flexGrow === 1);
  }

  // Original art size is only a viewport when the JSON is still in design pixels.
  // An adapted export already lives in the engine logical viewport; using the art size
  // there splits absolute offsets from right/center anchors.
  function draftDesign() {
    var design = app.documentDesign;
    if (adaptedLogicalDraft()) return null;
    return inViewport() && design && design.width > 0 && design.height > 0 && !mappedDesign()
      ? design : null;
  }

  function numericScreenDesign() {
    var tree = app.sourceTree;
    if (!inViewport() || !tree || tree.previewFit) return null;
    if (typeof tree.width !== "number" || typeof tree.height !== "number") return null;
    if (!(tree.width > 0 && tree.height > 0) || !isScreenDoc(tree)) return null;
    return { width: tree.width, height: tree.height };
  }

  function pageDesign() {
    return containedDesign() || numericScreenDesign() || draftDesign();
  }

  function deviceScale() {
    var design = pageDesign();
    if (design) return Math.min(app.screen.width / design.width, app.screen.height / design.height);
    if (app.designResolution) return Math.min(app.screen.width / app.designResolution.width, app.screen.height / app.designResolution.height);
    if (app.device.scale > 0) return app.device.scale;
    var dpr = app.device.dpr || 1;
    var shortSide = Math.min(app.screen.width, app.screen.height) / dpr;
    return dpr * Math.max(0.625, Math.min(1, Math.sqrt(shortSide / 720)));
  }

  // Exported drawing coordinates opt in to the game's outer contain transform.
  // A fixed-size Yoga root alone does not imply this mapping.
  function containedDesign() {
    var tree = app.sourceTree;
    return inViewport() && tree && tree.previewFit === "contain" &&
      Number.isFinite(tree.width) && tree.width > 0 && Number.isFinite(tree.height) && tree.height > 0
      ? { width: tree.width, height: tree.height } : null;
  }

  // Editor-only preview for an exported design canvas. It is not previewFit and is never saved.
  function legacyDesignCanvas() {
    var tree = app.sourceTree;
    if (!inViewport() || !tree || tree.previewFit) return null;
    if (typeof tree.width !== "number" || typeof tree.height !== "number") return null;
    if (!(tree.width > 0 && tree.height > 0) || !isScreenDoc(tree)) return null;
    return { width: tree.width, height: tree.height };
  }

  function mappedDesign() {
    return containedDesign() || legacyDesignCanvas();
  }

  var responsiveLengths = ["left", "right", "top", "bottom", "width", "height", "minWidth", "maxWidth",
    "minHeight", "maxHeight", "margin", "marginLeft", "marginRight", "marginTop", "marginBottom",
    "padding", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "paddingHorizontal",
    "paddingVertical", "gap", "flexBasis", "fontSize", "borderRadius", "borderWidth"];

  function scaledLength(value, factor) {
    return Math.round(value * factor * 1000) / 1000;
  }

  // Same screen adaptation the current canvas exporter applies. Caller must save; this does not write the file.
  function applyLegacyAdaptation(tree) {
    tree = tree || app.sourceTree;
    if (!tree || typeof tree.width !== "number" || typeof tree.height !== "number" || !(tree.width > 0 && tree.height > 0)) return null;
    if (tree === app.sourceTree) pushHistory();
    var shortSide = Math.min(tree.width, tree.height);
    var factor = 720 / shortSide;
    var reference = { width: tree.width * factor, height: tree.height * factor };
    function visit(node) {
      responsiveLengths.forEach(function (key) {
        if (typeof node[key] === "number") node[key] = scaledLength(node[key], factor);
      });
      (node.children || []).forEach(visit);
    }
    visit(tree);
    function anchor(node, start, end, size, extent) {
      var length = node[size];
      if (typeof length !== "number") return;
      var offset = node[start] || 0;
      var centerOffset = offset + length / 2 - extent / 2;
      if (Math.abs(centerOffset) <= extent * 0.1) {
        node[start] = "50%";
        node[start === "left" ? "marginLeft" : "marginTop"] = scaledLength(offset - extent / 2, 1);
      } else if (centerOffset > 0) {
        node[end] = scaledLength(extent - offset - length, 1);
        delete node[start];
      }
    }
    var backgrounds = [], content = [];
    (tree.children || []).forEach(function (node) {
      if (node.id === "background" && node.backgroundImage) {
        node.left = 0; node.top = 0; node.right = 0; node.bottom = 0;
        delete node.width; delete node.height;
        backgrounds.push(node);
        return;
      }
      anchor(node, "left", "right", "width", reference.width);
      anchor(node, "top", "bottom", "height", reference.height);
      content.push(node);
    });
    var ids = {};
    function uniqueId(base) {
      var id = base, index = 1;
      while (ids[id]) id = base + "_" + index++;
      ids[id] = true;
      return id;
    }
    window.UrhoxDoc.walk(tree, function (node) { if (node.id) ids[node.id] = true; });
    tree.width = "100%";
    tree.height = "100%";
    tree.children = backgrounds.concat([{
      type: "SafeAreaView", id: uniqueId("safe_area"), position: "absolute",
      left: 0, top: 0, right: 0, bottom: 0,
      children: [{ type: "Panel", id: uniqueId("safe_content"), flexGrow: 1, minWidth: 0, minHeight: 0, children: content }],
    }]);
    if (tree === app.sourceTree) {
      rememberAdaptationPreference(app.path, app.orientation);
      rememberOrientationPreference(app.path, app.orientation);
      app.editMode = "screen";
      // The adaptation changes the root sizing model, not the preview/game orientation.
      // Keep the current device orientation selected by the editor.
      setDevice(app.device.id || "1080p");
      rebuildPreview();
      resizeCanvas();
      refresh();
      if (window.UrhoxView) window.UrhoxView.fit();
    }
    return { factor: factor, reference: reference };
  }

  function layoutEnvironment() {
    var fit = contentTransform(), scale = fit.scale, area = app.safeArea || {};
    return { scale: mappedDesign() ? 0 : scale, safeArea: { top: Math.max(0, (area.top || 0) - fit.y) / scale,
      right: Math.max(0, (area.right || 0) - fit.x) / scale,
      bottom: Math.max(0, (area.bottom || 0) - fit.y) / scale,
      left: Math.max(0, (area.left || 0) - fit.x) / scale },
      nativeMenuBottom: Math.max(0, (app.device.nativeMenuBottom || 0) - fit.y) / scale };
  }

  function contentTransform() {
    if (!inViewport()) {
      return { scale: 1, x: 0, y: 0 };
    }
    var scale = deviceScale(), design = mappedDesign();
    return { scale: scale, x: design ? (app.screen.width - design.width * scale) / 2 : 0,
      y: design ? (app.screen.height - design.height * scale) / 2 : 0 };
  }

  function updateScaleBadge() {
    var src = designSize();
    src = { width: Math.round(src.width), height: Math.round(src.height) };
    var badge = document.getElementById("scaleBadge");
    var label = document.getElementById("artboardLabel");
    var deviceSelect = document.getElementById("deviceSelect");
    document.getElementById("componentPreviewLabel").classList.toggle("hidden", app.editMode !== "prefab");
    document.getElementById("componentPreview").checked = app.componentPreview;
    document.querySelectorAll('[name="orientation"]').forEach(function (radio) { radio.disabled = !inViewport(); });
    if (!inViewport()) {
      if (badge) badge.textContent = "组件 Prefab · " + src.width + "×" + src.height;
      if (label) label.textContent = "组件  " + (app.tree && app.tree.id ? app.tree.id : "Prefab") + "  " + src.width + " × " + src.height;
      if (deviceSelect) deviceSelect.disabled = true;
      return;
    }
    if (deviceSelect) deviceSelect.disabled = false;
    var fit = contentTransform();
    if (badge) {
      badge.textContent = (containedDesign() ? "设计坐标 " : pageDesign() ? "设计尺寸 " : "逻辑视口 ") + src.width + "×" + src.height + " · " +
        (containedDesign() ? "等比居中 " : pageDesign() ? "设计稿基准 " : app.designResolution ? "UI.Scale.DESIGN_RESOLUTION " : app.device.scale ? "指定缩放 " : "UI.Scale.DEFAULT ") + fit.scale.toFixed(2) + "×";
    }
    if (label) {
      label.textContent = "页面  " + app.device.name + "  " + app.screen.width + "×" + app.screen.height + "  ·  UI " + src.width + "×" + src.height + " ×" + fit.scale.toFixed(2);
    }
  }

  function resizeCanvas() {
    var pad = 400;
    var w = !inViewport() ? designSize().width : app.screen.width;
    var h = !inViewport() ? designSize().height : app.screen.height;
    app.canvas.width = w + pad * 2;
    app.canvas.height = h + pad * 2;
    app.canvas.dataset.originX = String(pad);
    app.canvas.dataset.originY = String(pad);
    var label = document.getElementById("artboardLabel");
    if (label) {
      label.style.left = pad + "px";
      label.style.top = (pad - 22) + "px";
    }
    updateScaleBadge();
  }

  function needsPreviewCopy(tree) {
    var found = false;
    window.UrhoxDoc.walk(tree, function (node) {
      if (!node) return;
      if (node.$repeat || node.component) found = true;
      Object.keys(node).forEach(function (key) {
        if (typeof node[key] === "string" && node[key].charAt(0) === "$") found = true;
      });
    });
    return found;
  }

  // Generated children get new editor IDs on expansion; anchor them to their source host.
  function walkScrollState(tree, visit, key, sourceIds) {
    if (!tree) return;
    if (!sourceIds) {
      sourceIds = new Set();
      window.UrhoxDoc.walk(app.sourceTree, function (node) { sourceIds.add(node._editorId); });
    }
    if (sourceIds.has(tree._editorId)) key = tree._editorId;
    visit(tree, key);
    (tree.children || []).forEach(function (child, index) {
      walkScrollState(child, visit, key + "/" + index, sourceIds);
    });
  }

  function rebuildPreview() {
    if (!app.sourceTree) return;
    var scroll = new Map();
    walkScrollState(app.tree, function (node, key) {
      if (node.type === "ScrollView") scroll.set(key, node._scrollY || 0);
    });
    window.UrhoxDoc.ensureEditorIds(app.sourceTree);
    if (!needsPreviewCopy(app.sourceTree)) {
      app.tree = app.sourceTree;
      window.UrhoxDoc.walk(app.sourceTree,function (node) { delete node._previewTransform; });
    } else {
      var withComponents = window.UrhoxDoc.expandComponents(app.sourceTree, app.components || {});
      app.tree = window.UrhoxDoc.expandRepeats(withComponents, app.templates || {});
      window.UrhoxDoc.expandPropDefaults(app.tree);
    }
    window.UrhoxDoc.ensureEditorIds(app.tree);
    walkScrollState(app.tree, function (node, key) {
      if (node.type === "ScrollView" && scroll.has(key)) node._scrollY = scroll.get(key);
    });
    var src = designSize();
    var layoutRoot = app.editMode === "prefab" && app.componentPreview
      ? { type: "Panel", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", children: [app.tree] }
      : app.tree;
    window.UrhoxYoga.layoutTree(layoutRoot, src.width, src.height, inViewport() ? layoutEnvironment() : null);
    if (app.tree !== app.sourceTree) {
      var previews = {};
      window.UrhoxDoc.walk(app.tree, function (node) {
        if (!node._generated) previews[node._editorId] = node;
      });
      window.UrhoxDoc.walk(app.sourceTree, function (node) {
        var view = previews[node._editorId];
        if (!view) return;
        node._layout = Object.assign({}, view._layout);
        node._hidden = view._hidden;
        node._padding = view._padding;
        node._margin = view._margin;
        node._previewTransform = {};
        ["rotate","scale","translateX","translateY","transformOrigin"].forEach(function (key) {
          node._previewTransform[key] = view[key];
        });
      });
    }
    updateScaleBadge();
  }

  function sourceNode(previewOrSource) {
    if (!previewOrSource) return null;
    if (window.UrhoxDoc.findByEditorId(app.sourceTree, previewOrSource._editorId) === previewOrSource) {
      return previewOrSource;
    }
    if (!app.sourceTree || app.sourceTree === app.tree) return previewOrSource;
    return window.UrhoxDoc.sourceOf(app.sourceTree, app.tree, previewOrSource) || previewOrSource;
  }

  function previewNode(source) {
    if (!source) return null;
    if (!app.tree || app.tree === app.sourceTree) return source;
    var path = window.UrhoxDoc.pathOf(app.sourceTree, source);
    return window.UrhoxDoc.atPath(app.tree, path);
  }

  function layoutNow() {
    if (!app.tree) return;
    rebuildPreview();
  }

  function draw() {
    window.UrhoxCanvas.draw(app);
  }

  function renderTreePanel() {
    var tree = app.sourceTree || app.tree;
    if (!app.treeEl || !tree) return;
    var search = document.getElementById("treeSearch");
    app.searchMatches = window.UrhoxTree.render(app.treeEl, tree, {
      query: search ? search.value : "",
      collapsed: app.collapsed,
      selectedNodes: app.selectedNodes,
      nodeKey: window.UrhoxDoc.nodeKey,
      modifiedNodes: app.modifiedNodes,
      onVisible: function (node, visible) {
        window.UrhoxCommands.setVisible(app, node, visible);
      },
      onToggle: function (key) {
        if (search && search.value.trim()) return;
        app.collapsed[key] = !app.collapsed[key];
        renderTreePanel();
      },
      onSelect: function (node, additive) {
        selectNode(node, true, additive);
      },
      canReparent: function (key, target) {
        var dragged = window.UrhoxDoc.findByEditorId(app.sourceTree || app.tree, key);
        return window.UrhoxCommands.canReparent(app, dragged, target);
      },
      onReparent: function (key, target, index) {
        var dragged = window.UrhoxDoc.findByEditorId(app.sourceTree || app.tree, key);
        if (window.UrhoxCommands.reparent(app, dragged, target, index)) {
          app.collapsed[window.UrhoxDoc.nodeKey(target)] = false;
          renderTreePanel();
        }
      },
      onAdd: function (node) {
        openAddMenuFor(node);
      },
      onDelete: function (node) {
        confirmDelete(node);
      },
    });
    var count = document.getElementById("treeSearchCount");
    if (count) count.textContent = search && search.value.trim() ? app.searchMatches.length + " 项" : "";
  }

  var treeSearch = document.getElementById("treeSearch");
  if (treeSearch) {
    treeSearch.addEventListener("input", renderTreePanel);
    treeSearch.addEventListener("keydown", function (event) {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        treeSearch.value = ""; renderTreePanel();
      } else if (event.key === "Enter") {
        event.preventDefault(); event.stopPropagation();
        var matches = app.searchMatches || [];
        if (!matches.length) return;
        var at = matches.indexOf(app.selected), step = event.shiftKey ? -1 : 1;
        if (at < 0 && event.shiftKey) at = 0;
        var node = matches[(at + step + matches.length) % matches.length];
        selectNode(node, true);
        var key = window.UrhoxDoc.nodeKey(node);
        Array.from(app.treeEl.children).forEach(function (row) {
          if (row.dataset.nodeKey === key) row.scrollIntoView({ block: "nearest" });
        });
      }
    });
  }

  function onInspectorChange(opts) {
    opts = opts || {};
    if (opts.phase === "start") { beginHistory(); return; }
    else if (opts.phase === "end") commitHistory();
    else if (!opts.live) pushHistory();
    var previousMode = app.editMode;
    app.editMode = isScreenDoc(app.sourceTree) ? "screen" : "prefab";
    rebuildPreview();
    if (previousMode !== app.editMode) resizeCanvas();
    if (opts.live) {
      draw();
    } else {
      refresh();
    }
    markDirty();
    updateToolbarState();
  }

  function renderInspector() {
    if (window.UrhoxInspector) {
      var nodes = app.selectedNodes.slice();
      var source = app.sourceTree;
      window.UrhoxInspector.render(app.inspectorEl, app.selected, onInspectorChange, {
        selection: nodes,
        root: source,
        blocked: nodes.some(function (n) {
          return n.locked || window.UrhoxDoc.isGenerated(n) ||
            window.UrhoxDoc.ancestors(source, n).some(function (p) { return p.locked; });
        }),
        isCurrent: function () {
          return app.sourceTree === source && nodes.length === app.selectedNodes.length &&
            nodes.every(function (n, i) { return n === app.selectedNodes[i]; });
        },
        generated: app.selected && window.UrhoxDoc.isGenerated(previewNode(app.selected)),
        repeat: !!(app.selected && app.selected.$repeat),
        componentRef: app.selected && (app.selected.component || app.selected._componentRef),
        onOpenComponent: function (ref) {
          if (window.UrhoxProject && window.UrhoxProject.openUiPath) {
            window.UrhoxProject.openUiPath(ref);
          }
        },
      });
    }
  }

  function updateMeta() {
    if (!app.metaEl) return;
    var mode = app.editMode === "prefab" ? "组件" : "页面";
    var warning = app.missingComponents.length
      ? " · 缺少组件 " + app.missingComponents.join(", ")
      : "";
    // 文档路径已显示在顶栏，这里只放当前文档独有的信息。
    app.metaEl.textContent = mode + " · " + window.UrhoxDoc.count(app.sourceTree || app.tree) + " 个节点" + warning;
  }

  function updateToolbarState() {
    var count = (app.selectedNodes || []).length;
    document.querySelectorAll("[data-align]").forEach(function (btn) {
      btn.disabled = count < 2;
    });
    document.querySelectorAll("[data-dist]").forEach(function (btn) {
      btn.disabled = count < 3;
    });
    var groupBtn = document.getElementById("groupBtn");
    var ungroupBtn = document.getElementById("ungroupBtn");
    if (groupBtn) {
      groupBtn.disabled = !window.UrhoxCommands.canGroup(app);
      groupBtn.title = groupBtn.disabled ? "编组需要同一父级的未锁定绝对定位节点" : "编组";
    }
    if (ungroupBtn) {
      ungroupBtn.disabled = !window.UrhoxCommands.canUngroup(app);
      ungroupBtn.title = ungroupBtn.disabled ? "解组需要单个未锁定绝对定位容器及子节点，且变换必须为可逆的静态值" : "解组";
    }
    var del = document.getElementById("treeDeleteBtn");
    if (del) del.disabled = !window.UrhoxCommands.deleteTargets(app).length;
    var rotation = document.getElementById("selectionRotation");
    var scale = document.getElementById("selectionScale");
    var eligible = window.UrhoxTransform && window.UrhoxTransform.capture(app).length;
    var allEligible = eligible > 0 && eligible === window.UrhoxTransform.targets(app).length &&
      window.UrhoxTransform.targets(app).length === count;
    if (rotation) {
      rotation.disabled = !allEligible;
      rotation.value = count === 1 ? (Number(window.UrhoxGeom.transformValue(app.selected,"rotate")) || 0) : 0;
      rotation.title = count === 1 ? "旋转角度" : "绕整体中心旋转的增量";
    }
    if (scale) {
      scale.disabled = !allEligible;
      var currentScale = count === 1 ? window.UrhoxGeom.transformValue(app.selected,"scale") : 1;
      scale.value = Math.round((currentScale == null ? 1 : currentScale)*10000)/100;
      scale.title = count > 1 ? "相对当前选区等比缩放" : "相对原始尺寸的缩放比例";
    }
    var status = document.getElementById("transformStatus");
    if (status) status.textContent = count && !allEligible ? "含根节点、锁定项、嵌套选区或动态变换" :
      count > 1 ? count + " 个节点 · 旋转为增量，缩放为相对比例" : "";
  }

  function refresh() {
    if (window.UrhoxProject && window.UrhoxProject.validateImageTarget) window.UrhoxProject.validateImageTarget();
    renderTreePanel();
    renderInspector();
    draw();
    updateMeta();
    updateToolbarState();
    if (app.sourceTree) markDirty();
  }

  function isSelected(node) {
    var src = sourceNode(node);
    return app.selectedNodes.indexOf(src) >= 0 || app.selectedNodes.indexOf(node) >= 0;
  }

  function setSelection(nodes, fromTree) {
    app.selectedNodes = [];
    (nodes || []).forEach(function (node) {
      var src = sourceNode(node);
      if (src && app.selectedNodes.indexOf(src) < 0) app.selectedNodes.push(src);
    });
    app.selected = app.selectedNodes.length ? app.selectedNodes[app.selectedNodes.length - 1] : null;
    app.lockedFromTree = false;
    app.hover = null;
    refresh();
  }

  function selectNode(node, fromTree, additive) {
    if (fromTree) exitPickMode();
    if (!node) {
      setSelection([], false);
      return;
    }
    if (additive) {
      var src = sourceNode(node);
      if (isSelected(src)) {
        app.selectedNodes = app.selectedNodes.filter(function (n) { return n !== src; });
        app.selected = app.selectedNodes[app.selectedNodes.length - 1] || null;
      } else {
        app.selectedNodes.push(src);
        app.selected = src;
      }
      app.lockedFromTree = false;
      refresh();
      return;
    }
    setSelection([node], fromTree);
  }

  function hideAddPops() {
    document.querySelectorAll(".add-pop").forEach(function (el) { el.classList.add("hidden"); });
  }

  function openAddMenuFor(parent) {
    selectNode(parent, true);
    var pop = document.getElementById("treeAddPop");
    if (pop) pop.classList.remove("hidden");
  }

  function addChildOfKind(kind) {
    hideAddPops();
    var created = window.UrhoxCommands.createNode(app, kind);
    if (kind === "Image" && created && window.UrhoxProject && window.UrhoxProject.beginReplaceImage) {
      window.UrhoxProject.beginReplaceImage(created, "backgroundImage", onInspectorChange);
    }
  }

  function confirmDelete(node) {
    var nodes = window.UrhoxCommands.deleteTargets(app, node ? [node] : null);
    if (!nodes.length) return;
    var pending = { tree: app.sourceTree, nodes: nodes.slice() };
    var dialog = document.getElementById("deleteDialog");
    var text = document.getElementById("deleteDialogText");
    var label = nodes.length === 1 ? "「" + (nodes[0].id || nodes[0].type || "节点") + "」" :
      nodes.length + " 个节点（" + nodes.map(function (n) { return n.id || n.type || "节点"; }).join("、") + "）";
    if (text) text.textContent = "确定删除" + label + "及其子节点吗？此操作可用撤销恢复。";
    if (!dialog) {
      if (window.confirm("确定删除" + label + "及其子节点吗？") && app.sourceTree === pending.tree) {
        window.UrhoxCommands.remove(app, pending.nodes);
      }
      return;
    }
    dialog.showModal();
    dialog.dataset.pending = "1";
    app._pendingDelete = pending;
  }

  function setCreateKind(kind) {
    app.createKind = kind || null;
    var preview = document.getElementById("preview");
    if (preview) preview.classList.toggle("placing", !!app.createKind);
  }

  function enterPickMode() {
    app.lockedFromTree = false;
    setCreateKind(null);
    selectNode(null);
    var btn = document.getElementById("pickToolBtn");
    if (btn) btn.classList.add("active");
  }

  function exitPickMode() {
    var btn = document.getElementById("pickToolBtn");
    if (btn) btn.classList.remove("active");
  }

  function markDirty() {
    var tree = app.sourceTree || app.tree;
    var now = JSON.stringify(window.UrhoxHistory.cloneForSave(tree));
    if (now === app.cleanState) app.cleanNodes = window.UrhoxHistory.nodeStates(tree);
    app.modifiedNodes = window.UrhoxHistory.modifiedNodeKeys(tree, app.cleanNodes);
    if (app.treeEl) app.treeEl.querySelectorAll(".tree-row").forEach(function (row) {
      var modified = app.modifiedNodes.has(row.dataset.nodeKey);
      row.classList.toggle("modified-node", modified);
      var name = row.querySelector(".tree-id");
      if (name) name.title = modified ? "有未保存的修改" : "";
    });
    if (app.path && window.UrhoxProject) {
      window.UrhoxProject.setDirty(app.path, now !== app.cleanState);
    }
  }

  function markClean(savedTree, savedNodes) {
    app.cleanState = JSON.stringify(window.UrhoxHistory.cloneForSave(savedTree || app.sourceTree || app.tree));
    app.cleanNodes = savedNodes || window.UrhoxHistory.nodeStates(app.sourceTree || app.tree);
    markDirty();
  }

  function selectedEditorId() {
    return app.selected ? window.UrhoxDoc.getEditorId(app.selected) : null;
  }

  function selectedEditorIds() {
    return app.selectedNodes.map(function (node) { return window.UrhoxDoc.getEditorId(node); });
  }

  function pushHistory() {
    app.history.snapshot(app.sourceTree || app.tree, selectedEditorId(), selectedEditorIds());
    markDirty();
  }

  function beginHistory() {
    app.history.begin(app.sourceTree || app.tree, selectedEditorId(), "", selectedEditorIds());
  }

  function commitHistory() {
    app.history.commit(app.sourceTree || app.tree);
    markDirty();
  }

  function restoreSnapshot(snap) {
    if (!snap) return;
    app.sourceTree = snap.tree;
    window.UrhoxDoc.ensureEditorIds(app.sourceTree);
    var previousMode = app.editMode;
    app.editMode = isScreenDoc(app.sourceTree) ? "screen" : "prefab";
    rebuildPreview();
    if (previousMode !== app.editMode) resizeCanvas();
    var ids = snap.selectedIds || (snap.selectedId ? [snap.selectedId] : []);
    app.selectedNodes = ids.map(function (id) {
      return window.UrhoxDoc.findByEditorId(app.sourceTree, id);
    }).filter(Boolean);
    app.selected = app.selectedNodes[app.selectedNodes.length - 1] || null;
    app.lockedFromTree = false;
    refresh();
  }

  function templateKeys(rel) {
    var keys = [rel];
    if (rel.indexOf("assets/") !== 0) keys.push("assets/" + rel);
    if (rel.indexOf("ui/") === 0) keys.push("assets/" + rel);
    return keys;
  }

  async function readJsonFromContext(rel, options) {
    var handleMap = (options && options.handleMap) || {};
    var blobMap = (options && options.blobMap) || {};
    var keys = templateKeys(rel);
    var i;
    for (i = 0; i < keys.length; i++) {
      var blob = blobMap[keys[i]];
      if (blob && typeof blob.text === "function") {
        try { return JSON.parse(await blob.text()); } catch (err) {}
      }
    }
    for (i = 0; i < keys.length; i++) {
      var handle = handleMap[keys[i]];
      if (handle && typeof handle.getFile === "function") {
        try {
          var file = await handle.getFile();
          return JSON.parse(await file.text());
        } catch (err) {}
      }
    }
    var root = (options && options.assetRoot) || DEFAULT_ASSET_ROOT;
    if (root.indexOf('/api/projects/') === 0) {
      var relative = rel.replace(/^assets\//, '');
      var response = await fetch(root + relative.split('/').map(encodeURIComponent).join('/'));
      return response.ok ? response.json() : null;
    }
    var urls = keys.slice();
    if (root && rel.indexOf("ui/") === 0) urls.push(root + rel);
    for (i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i]);
        if (res.ok) return await res.json();
      } catch (err) {}
    }
    return null;
  }

  async function loadTemplates(tree, options) {
    var needed = [];
    window.UrhoxDoc.walk(tree, function (node) {
      if (node.$repeat && node.$repeat.template) needed.push(node.$repeat.template);
    });
    var templates = {};
    if (!needed.length) return templates;
    for (var i = 0; i < needed.length; i++) {
      var rel = needed[i];
      var data = await readJsonFromContext(rel, options);
      if (data) {
        window.UrhoxDoc.expandPropDefaults(data);
        templates[rel] = data;
      }
    }
    return templates;
  }

  async function loadComponents(tree, options) {
    var needed = [];
    window.UrhoxDoc.walk(tree, function (node) {
      if (node.component) needed.push(node.component);
    });
    var components = {};
    var missing = [];
    for (var i = 0; i < needed.length; i++) {
      var rel = needed[i];
      var data = await readJsonFromContext(rel, options);
      if (data) {
        window.UrhoxDoc.expandPropDefaults(data);
        components[rel] = data;
      } else if (missing.indexOf(rel) < 0) {
        missing.push(rel);
      }
    }
    return { components: components, missing: missing };
  }

  function loadTree(tree, options) {
    options = options || {};
    window.UrhoxDoc.validateTree(tree);
    // Resolve and lay out a detached candidate before replacing a live document.
    var candidate = window.UrhoxDoc.expandComponents(tree, options.components || {});
    candidate = window.UrhoxDoc.expandRepeats(candidate, options.templates || {});
    window.UrhoxDoc.expandPropDefaults(candidate);
    window.UrhoxDoc.validateTree(candidate);
    var size = window.UrhoxDoc.designSize(candidate);
    window.UrhoxYoga.layoutTree(candidate, size.width, size.height);
    app.sourceTree = tree;
    app.cleanState = JSON.stringify(window.UrhoxHistory.cloneForSave(tree));
    window.UrhoxDoc.ensureEditorIds(app.sourceTree);
    app.templates = options.templates || {};
    app.cleanNodes = window.UrhoxHistory.nodeStates(app.sourceTree);
    app.modifiedNodes = new Set();
    app.components = options.components || {};
    app.missingComponents = options.missingComponents || [];
    app.editMode = isScreenDoc(candidate) ? "screen" : "prefab";
    app.componentPreview = false;
    var numericDesign = typeof candidate.width === "number" && typeof candidate.height === "number" && isScreenDoc(candidate) ? size : null;
    var draft = options.designDraft && options.designDraft.width > 0 && options.designDraft.height > 0 ? options.designDraft : null;
    var savedAdaptation = readAdaptationPreference(options.path);
    var projectDesign = options.projectConfig && options.projectConfig.designWidth > 0 && options.projectConfig.designHeight > 0
      ? { width: options.projectConfig.designWidth, height: options.projectConfig.designHeight } : null;
    var inferredAdaptation = !numericDesign && hasEditorAdaptedStructure(candidate)
      ? { mode: "screen", logicalShortSide: 720 } : null;
    app.documentAdaptation = !numericDesign && ((draft && draft.adaptation) || savedAdaptation || inferredAdaptation) || null;
    app.documentDesign = !numericDesign && isScreenDoc(candidate) ? (draft || projectDesign) : null;
    var savedOrientation = readOrientationPreference(options.path);
    var orientationHint = savedAdaptation && savedAdaptation.orientation
      ? { width: savedAdaptation.orientation === "landscape" ? 2 : 1, height: savedAdaptation.orientation === "landscape" ? 1 : 2 }
      : numericDesign || app.documentDesign;
    setProjectConfig(options.projectConfig, orientationHint);
    if (savedOrientation && app.editMode === "screen") {
      app.orientation = savedOrientation;
      setDevice(app.device.id || "1080p");
    }
    app.path = options.path || DEFAULT_UI;
    window.UrhoxAssets.setContext({
      assetRoot: options.assetRoot != null ? options.assetRoot : DEFAULT_ASSET_ROOT,
      handleMap: options.handleMap || {},
      blobMap: options.blobMap || {},
    });
    app.collapsed = {};
    window.UrhoxDoc.ensureEditorIds(app.sourceTree);
    app.hover = null;
    app.drag = null;
    app.lockedFromTree = false;
    app.selected = null;
    app.selectedNodes = [];
    app.marquee = null;
    app.history = new window.UrhoxHistory.History(80);
    rebuildPreview();
    app.editMode = isScreenDoc(app.tree) ? "screen" : "prefab";
    resizeCanvas();
    refresh();
    if (window.UrhoxComparison) window.UrhoxComparison.openDocument(app, options);
    if (window.UrhoxView) window.UrhoxView.fit();
  }

  function syncDeviceControls() {
    var select = document.getElementById("deviceSelect");
    if (select) select.value = app.device.id;
    document.querySelectorAll('[name="orientation"]').forEach(function (radio) {
      radio.checked = radio.value === (app.orientation || "portrait");
    });
  }

  function deviceFor(id, orientation) {
    var base = id === "custom" && app.customDevice ? app.customDevice : DEVICES[id] || DEVICES["1080p"];
    var landscape = orientation === "landscape";
    var device = Object.assign({}, base, {
      width: landscape ? Math.max(base.width, base.height) : Math.min(base.width, base.height),
      height: landscape ? Math.min(base.width, base.height) : Math.max(base.width, base.height),
    });
    if (landscape && base.landscapeSafeArea) {
      device.safeArea = Object.assign({}, base.landscapeSafeArea);
    } else if (base.safeArea && (base.width > base.height) !== landscape) {
      var area = base.safeArea;
      device.safeArea = landscape
        ? { top:area.left, right:area.top, bottom:area.right, left:area.bottom }
        : { top:area.right, right:area.bottom, bottom:area.left, left:area.top };
    }
    return device;
  }

  // Lays the unsaved document out on other screens and hands each result to `visit`, then puts
  // the real device back. Nothing is written to the document, history or selection.
  function probeScenes(scenes, visit) {
    if (!app.sourceTree || !inViewport()) return null;
    var saved = { device: app.device, safeArea: app.safeArea, width: app.screen.width,
      height: app.screen.height, orientation: app.orientation };
    var scroll = new Map();
    walkScrollState(app.tree, function (node, key) {
      if (node.type === "ScrollView") scroll.set(key, node._scrollY || 0);
    });
    var results = [];
    try {
      scenes.forEach(function (scene) {
        var device = deviceFor(scene.id, scene.orientation);
        app.device = device;
        app.safeArea = device.safeArea || null;
        app.screen.width = device.width;
        app.screen.height = device.height;
        rebuildPreview();
        var fit = contentTransform(), scale = fit.scale;
        var area = app.safeArea || {};
        results.push(visit(scene, {
          tree: app.tree, device: device, scale: scale, dpr: device.dpr || 1,
          width: app.screen.width / scale, height: app.screen.height / scale,
          offsetX: fit.x / scale, offsetY: fit.y / scale,
          safeArea: { top: (area.top || 0) / scale, right: (area.right || 0) / scale,
            bottom: (area.bottom || 0) / scale, left: (area.left || 0) / scale },
          sourceId: function (node) {
            var source = sourceNode(node);
            return source && window.UrhoxDoc.findByEditorId(app.sourceTree, source._editorId) === source
              ? source._editorId : null;
          },
          paint: function (context) {
            context.save();
            context.translate(fit.x / scale, fit.y / scale);
            window.UrhoxCanvas.paintTree(context, app.tree, app);
            context.restore();
          },
        }));
      });
    } finally {
      app.device = saved.device;
      app.safeArea = saved.safeArea;
      app.screen.width = saved.width;
      app.screen.height = saved.height;
      app.orientation = saved.orientation;
      rebuildPreview();
      var restored = false;
      walkScrollState(app.tree, function (node, key) {
        if (scroll.has(key)) { node._scrollY = scroll.get(key); restored = true; }
      });
      if (restored) rebuildPreview();
    }
    return results;
  }

  function applyScene(scene) {
    if (!inViewport()) return false;
    app.orientation = scene.orientation;
    setDevice(scene.id);
    return true;
  }

  function selectEditorIds(editorIds) {
    var nodes = (editorIds || []).map(function (id) {
      return window.UrhoxDoc.findByEditorId(app.sourceTree, id);
    }).filter(Boolean);
    if (!nodes.length) return false;
    nodes.forEach(function (node) {
      window.UrhoxDoc.ancestors(app.sourceTree, node).forEach(function (parent) {
        app.collapsed[window.UrhoxDoc.nodeKey(parent)] = false;
      });
    });
    exitPickMode();
    setSelection(nodes, true);
    return true;
  }

  function setDevice(id) {
    app.device = deviceFor(id, app.orientation);
    app.safeArea = app.device.safeArea || null;
    app.screen.width = app.device.width;
    app.screen.height = app.device.height;
    syncDeviceControls();
    if (app.tree) {
      resizeCanvas();
      layoutNow();
      draw();
      if (window.UrhoxView) window.UrhoxView.fit();
    }
  }

  // A screen document's own design size picks the orientation (wider than tall = landscape);
  // the project setting is only the fallback for prefabs and square or unsized documents.
  function setProjectConfig(config, size) {
    app.projectConfig = config || null;
    app.orientation = size && size.width !== size.height
      ? (size.width > size.height ? "landscape" : "portrait")
      : config && config.orientation === "landscape" ? "landscape" : "portrait";
    // 游戏本身的方向，和用户在顶栏临时切换的方向分开记录；适配检查只看这个。
    app.orientationInfo = size && size.width !== size.height
      ? { orientation: app.orientation, source: "document" }
      : config && (config.orientation === "landscape" || config.orientation === "portrait")
        ? { orientation: config.orientation, source: "project" }
        : { orientation: app.orientation, source: "unset" };
    setDevice(app.device.id || "1080p");
  }

  app.origin = origin;
  app.inViewport = inViewport;
  app.designSize = designSize;
  app.contentTransform = contentTransform;
  app.layout = layoutNow;
  app.rebuildPreview = rebuildPreview;
  app.sourceNode = sourceNode;
  app.previewNode = previewNode;
  app.draw = draw;
  app.refresh = refresh;
  app.refreshInspector = renderInspector;
  app.updateMeta = updateMeta;
  app.ensureKeys = function () { window.UrhoxDoc.ensureEditorIds(app.sourceTree || app.tree); };
  app.pushHistory = pushHistory;
  app.beginHistory = beginHistory;
  app.commitHistory = commitHistory;
  app.cancelHistory = function (selectionIds) {
    var snapshot = app.history.cancel();
    if (!snapshot) return;
    restoreSnapshot(snapshot);
    setSelection((selectionIds || []).map(function (id) {
      return window.UrhoxDoc.findByEditorId(app.sourceTree, id);
    }).filter(Boolean));
    markDirty();
  };
  app.selectNode = selectNode;
  app.setSelection = setSelection;
  app.isSelected = isSelected;
  app.enterPickMode = enterPickMode;

  window.UrhoxInput.bind(app);

  var Cmd = window.UrhoxCommands;
  window.UrhoxPreview = {
    renderSaved: async function (job) {
      if (!new URLSearchParams(location.search).has("render")) throw new Error("CLI 渲染只能在独立预览页面执行。");
      var options = job.options;
      await this.loadTreeAsync(job.tree, { path: CFG.FILE_ROOT + job.file });
      app.componentPreview = options.componentPreview;
      if (inViewport()) {
        if (!this.configureDevice(options.width, options.height, options.safeArea, options.dpr, options.scale, options.nativeMenuBottom, options.designResolution)) {
          throw new Error("预览设备参数无效。");
        }
      }
      await document.fonts.ready;
      layoutNow();
      draw();
      var missingFonts = await window.UrhoxAssets.whenFontsReady();
      layoutNow();
      var missingImages = await window.UrhoxAssets.whenReady();
      var size = designSize(), fit = contentTransform(), scale = fit.scale;
      var width = inViewport() ? app.screen.width : Math.ceil(size.width);
      var height = inViewport() ? app.screen.height : Math.ceil(size.height);
      if (!(width > 0 && height > 0 && width <= 4096 && height <= 4096)) throw new Error("预览画幅必须在 1..4096 像素内。");
      var nodes = [];
      function physical(box) {
        return box ? { x: box.x * scale + fit.x, y: box.y * scale + fit.y, w: box.w * scale, h: box.h * scale } : null;
      }
      function visit(node, pointer, hidden) {
        hidden = hidden || !!node._hidden;
        var bounds = node._layout ? window.UrhoxGeom.visualBounds(app.tree, node) : null;
        nodes.push({ pointer: pointer, id: node.id || null, type: node.type, hidden: hidden,
          generated: !!node._generated, layout: node._layout || null, visualBounds: bounds, physicalBounds: physical(bounds) });
        (node.children || []).forEach(function (child, index) { visit(child, pointer + "/children/" + index, hidden); });
      }
      visit(app.tree, "", false);
      if (options.id !== undefined) nodes = nodes.filter(function (node) { return node.id === options.id; });
      if (options.pointer !== undefined) {
        var indices = options.pointer === "" ? [] : options.pointer.split("/").slice(1).filter(function (_, index) { return index % 2 === 1; }).map(Number);
        var source = window.UrhoxDoc.atPath(app.sourceTree, indices);
        var view = source && window.UrhoxDoc.findByEditorId(app.tree, source._editorId);
        nodes = nodes.filter(function (node) { return view && node.layout === view._layout; });
      }
      if (!nodes.length) throw new Error("目标节点未出现在展开后的预览树中。");
      var warnings = ["编辑器模拟结果，不代表引擎或真机验收；动态数据使用编辑器默认值，字体使用浏览器字体。"];
      if (missingImages.length) warnings.push("图片未能解码或读取：" + missingImages.join(", "));
      if (missingFonts.length) warnings.push("字体未能读取：" + missingFonts.join(", "));
      if (app.missingComponents.length) warnings.push("缺少组件：" + app.missingComponents.join(", "));
      window.UrhoxDoc.walk(app.sourceTree, function (node) {
        if (node.$repeat && node.$repeat.template && !app.templates[node.$repeat.template]) warnings.push("缺少模板：" + node.$repeat.template);
      });
      var result = { viewport: { width: width, height: height,
        logicalWidth: inViewport() ? width / scale : size.width, logicalHeight: inViewport() ? height / scale : size.height,
        scale: scale, dpr: options.dpr, device: options.device, mode: inViewport() ? "screen" : "component",
        safeArea: inViewport() ? app.safeArea : null, nativeMenuBottom: inViewport() ? options.nativeMenuBottom : 0 },
        tree: "expanded", coordinateSystem: "logical viewport; physicalBounds in pixels", nodes: nodes, warnings: warnings };
      if (containedDesign()) {
        result.viewport.previewFit = "contain";
        result.viewport.designWidth = size.width;
        result.viewport.designHeight = size.height;
        result.viewport.offsetX = fit.x;
        result.viewport.offsetY = fit.y;
        result.coordinateSystem = "design coordinates; physicalBounds include centered contain mapping in pixels";
      } else if (legacyDesignCanvas()) {
        result.viewport.legacyDesignPreview = true;
        result.viewport.designWidth = size.width;
        result.viewport.designHeight = size.height;
        result.viewport.offsetX = fit.x;
        result.viewport.offsetY = fit.y;
        result.coordinateSystem = "exported design coordinates; physicalBounds include editor-only centered preview, JSON is unchanged";
      } else if (inViewport() && app.designResolution) {
        result.viewport.designResolution = Object.assign({}, app.designResolution);
      }
      if (job.action !== "preview") return { result: result };
      var output = document.createElement("canvas");
      output.width = width; output.height = height;
      var context = output.getContext("2d");
      context.translate(fit.x, fit.y);
      context.scale(scale, scale);
      window.UrhoxCanvas.paintTree(context, app.tree, app);
      return { result: result, png: output.toDataURL("image/png").split(",")[1] };
    },
    loadTree: loadTree,
    legacyDesignInfo: legacyDesignCanvas,
    applyLegacyAdaptation: applyLegacyAdaptation,
    loadTreeAsync: async function (tree, options) {
      options = options || {};
      window.UrhoxDoc.validateTree(tree);
      options.templates = await loadTemplates(tree, options);
      var componentResult = await loadComponents(tree, options);
      options.components = componentResult.components;
      options.missingComponents = componentResult.missing;
      loadTree(tree, options);
    },
    get currentPath() { return app.path; },
    get selected() { return app.selected; },
    get tree() { return app.sourceTree || app.tree; },
    getJSON: function () { return window.UrhoxHistory.cloneForSave(app.sourceTree || app.tree); },
    assetUrl: function (path) { return window.UrhoxAssets.resolve(path); },
    bindImage: function (img, path) { window.UrhoxAssets.bindSrc(img, path); },
    contentTransform: contentTransform,
    markClean: markClean,
    getCleanJSON: function () { return JSON.parse(app.cleanState || "{}"); },
    getDevice: function () { return { width:app.screen.width, height:app.screen.height, safeArea:app.safeArea || null,
      dpr:app.device.dpr || 1, scale:app.device.scale || null, designResolution:app.designResolution ? Object.assign({}, app.designResolution) : null,
      nativeMenuBottom:app.device.nativeMenuBottom || 0, prefab:!inViewport() }; },
    configureDevice: function (width, height, area, dpr, scale, nativeMenuBottom, designResolution) {
      if (!inViewport() || !Number.isInteger(width) || !Number.isInteger(height) ||
          width < 240 || height < 240 || width > 4096 || height > 4096) return false;
      dpr = dpr == null ? 1 : dpr;
      if (!Number.isFinite(dpr) || dpr < 1 || dpr > 4 ||
          scale != null && (!Number.isFinite(scale) || scale < 0.25 || scale > 8) ||
          nativeMenuBottom != null && (!Number.isFinite(nativeMenuBottom) || nativeMenuBottom < 0 || nativeMenuBottom >= height)) return false;
      if (designResolution != null && (!validDesignResolution(designResolution) || scale != null)) return false;
      app.designResolution = designResolution ? { width:designResolution.width, height:designResolution.height } : null;
      if (scalePreferenceKey && !renderOnly) {
        try {
          if (app.designResolution) localStorage.setItem(scalePreferenceKey, JSON.stringify(app.designResolution));
          else localStorage.removeItem(scalePreferenceKey);
        } catch (_) {}
      }
      app.device = { id:"custom", name:"自定义", width:width, height:height, bezel:24 };
      Object.assign(app.device, { dpr:dpr, scale:scale, nativeMenuBottom:nativeMenuBottom || 0 });
      app.device.safeArea = area;
      app.customDevice = app.device;
      app.orientation = width > height ? "landscape" : "portrait";
      app.screen = { width:width, height:height }; app.safeArea = area;
      var select = document.getElementById("deviceSelect");
      if (select) {
        if (!select.querySelector('[value="custom"]')) {
          var option = document.createElement("option"); option.value="custom";
          select.insertBefore(option, select.querySelector('[value="customize"]'));
        }
        select.querySelector('[value="custom"]').textContent = "自定义 " + Math.min(width,height) + "×" + Math.max(width,height);
        select.value = "custom";
      }
      syncDeviceControls();
      resizeCanvas(); layoutNow(); draw();
      if (window.UrhoxView) window.UrhoxView.fit();
      return true;
    },
    pickOverlaps: function (point) {
      var node = app.selected;
      if (!point && node && node._layout) {
        var b = window.UrhoxGeom.visualBounds(app.sourceTree || app.tree,node);
        point = {x:b.x+b.w/2,y:b.y+b.h/2};
      }
      return point ? window.UrhoxDoc.pickAt(app.tree,point.x,point.y,{ designMode:true }).map(sourceNode)
        .filter(function (n,i,list) { return list.indexOf(n) === i; }) : [];
    },
    selectNode: selectNode,
    transformSelection: function (factor, degrees) { window.UrhoxTransform.command(app,factor,degrees); },
    undo: function () {
      restoreSnapshot(app.history.undo(app.sourceTree || app.tree, selectedEditorId(), selectedEditorIds()));
      markDirty();
    },
    redo: function () {
      restoreSnapshot(app.history.redo(app.sourceTree || app.tree, selectedEditorId(), selectedEditorIds()));
      markDirty();
    },
    copy: function () { Cmd.copy(app); },
    cut: function () { Cmd.cut(app); },
    paste: function () { Cmd.paste(app); },
    duplicate: function () { Cmd.duplicate(app); },
    remove: function () { Cmd.remove(app); },
    confirmDelete: function () { confirmDelete(); },
    nudge: function (dx, dy) { Cmd.nudge(app, dx, dy); },
    toggleVisible: function () { Cmd.toggleVisible(app); },
    toggleLocked: function () { Cmd.toggleLocked(app); },
    rename: function () { Cmd.rename(app); },
    deselect: enterPickMode,
    enterPickMode: enterPickMode,
    selectParent: function () { Cmd.selectParent(app); },
    selectChild: function () { Cmd.selectChild(app); },
    getSelection: function () { return app.selectedNodes.slice(); },
    contextState: function () { return Cmd.contextState(app); },
    addNode: function (kind) {
      if (Cmd.contextState(app).add) Cmd.createNode(app, kind);
    },
    replaceSelectedImage: function (ref) {
      if (!Cmd.contextState(app).image || !window.UrhoxProject) return;
      window.UrhoxProject.beginReplaceImage(app.selected, "backgroundImage", onInspectorChange);
      window.UrhoxProject.assignImageByRef(ref);
    },
    selectDiagnosticNode: function (pointer) {
      var node = app.sourceTree, parts = pointer.split("/").slice(1);
      for (var i = 0; i + 1 < parts.length && parts[i] === "children"; i += 2) {
        if (!/^\d+$/.test(parts[i + 1]) || !node.children || !node.children[Number(parts[i + 1])]) break;
        app.collapsed[window.UrhoxDoc.nodeKey(node)] = false;
        node = node.children[Number(parts[i + 1])];
      }
      if (node) selectNode(node, true);
    },
    selectAll: function () {
      setSelection(window.UrhoxDoc.selectableNodes(app.sourceTree || app.tree));
    },
    selectionBounds: function () {
      return window.UrhoxGeom.boundsOf(app.selectedNodes.filter(function (n) { return n._layout; })
        .map(function (n) { return window.UrhoxGeom.visualBounds(app.sourceTree || app.tree,n); }));
    },
    setDevice: setDevice,
    probeScenes: probeScenes,
    applyScene: applyScene,
    selectEditorIds: selectEditorIds,
    get canProbe() { return !!app.sourceTree && inViewport(); },
    get orientationInfo() { return app.orientationInfo || { orientation: app.orientation || "portrait", source: "unset" }; },
    get currentScene() { return { id: app.device.id, orientation: app.orientation || "portrait", name: app.device.name }; },
    setProjectConfig: setProjectConfig,
    getProjectConfig: function () { return app.projectConfig; },
    align: function (mode) { Cmd.align(app, mode); },
    distribute: function (axis) { Cmd.distribute(app, axis); },
    group: function () { Cmd.group(app); },
    ungroup: function () { Cmd.ungroup(app); },
    moveLayer: function (delta, extreme) { Cmd.moveLayer(app, delta, extreme); },
    setCreateKind: setCreateKind,
    get createKind() { return app.createKind; },
    placeImage: function (ref, x, y) {
      Cmd.createImageFromAsset(app, ref, x, y);
    },
  };

  document.querySelectorAll("[data-align]").forEach(function (btn) {
    btn.addEventListener("click", function () { Cmd.align(app, btn.getAttribute("data-align")); });
  });
  document.querySelectorAll("[data-dist]").forEach(function (btn) {
    btn.addEventListener("click", function () { Cmd.distribute(app, btn.getAttribute("data-dist")); });
  });
  var groupBtn = document.getElementById("groupBtn");
  var ungroupBtn = document.getElementById("ungroupBtn");
  if (groupBtn) groupBtn.addEventListener("click", function () { Cmd.group(app); });
  if (ungroupBtn) ungroupBtn.addEventListener("click", function () { Cmd.ungroup(app); });
  var pickToolBtn = document.getElementById("pickToolBtn");
  if (pickToolBtn) pickToolBtn.addEventListener("click", enterPickMode);
  function bindAddMenu(btnId, popId) {
    var btn = document.getElementById(btnId);
    var pop = document.getElementById(popId);
    if (!btn || !pop) return;
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = pop.classList.contains("hidden");
      hideAddPops();
      if (open) pop.classList.remove("hidden");
    });
    pop.querySelectorAll("[data-create]").forEach(function (item) {
      item.addEventListener("click", function (event) {
        event.stopPropagation();
        addChildOfKind(item.getAttribute("data-create"));
      });
    });
  }
  bindAddMenu("treeAddBtn", "treeAddPop");
  bindAddMenu("canvasAddBtn", "canvasAddPop");
  var deleteDialog = document.getElementById("deleteDialog");
  var deleteOk = document.getElementById("deleteDialogOk");
  var deleteCancel = document.getElementById("deleteDialogCancel");
  if (deleteOk) {
    deleteOk.addEventListener("click", function () {
      if (app._pendingDelete) {
        var pending = app._pendingDelete;
        if (app.sourceTree === pending.tree) window.UrhoxCommands.remove(app, pending.nodes);
        app._pendingDelete = null;
      }
      if (deleteDialog) deleteDialog.close();
    });
  }
  if (deleteCancel) {
    deleteCancel.addEventListener("click", function () {
      app._pendingDelete = null;
      if (deleteDialog) deleteDialog.close();
    });
  }
  if (deleteDialog) {
    deleteDialog.addEventListener("cancel", function () {
      app._pendingDelete = null;
    });
  }
  var treeDeleteBtn = document.getElementById("treeDeleteBtn");
  if (treeDeleteBtn) {
    treeDeleteBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      confirmDelete();
    });
  }
  document.addEventListener("click", hideAddPops);
  var deviceSelect = document.getElementById("deviceSelect");
  if (deviceSelect) {
    deviceSelect.addEventListener("change", function () {
      if (deviceSelect.value === "customize") {
        syncDeviceControls();
        if (window.UrhoxWorkbench) window.UrhoxWorkbench.openDeviceSettings();
      } else setDevice(deviceSelect.value);
    });
  }
  document.getElementById("componentPreview").addEventListener("change", function () {
    app.componentPreview = this.checked;
    resizeCanvas(); layoutNow(); draw();
    if (window.UrhoxView) window.UrhoxView.fit();
  });
  document.querySelectorAll('[name="orientation"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      if (!radio.checked || !inViewport()) return;
      var next = radio.value;
      app.orientation = next;
      rememberOrientationPreference(app.path, next);
      setDevice(app.device.id);
    });
  });

})();
