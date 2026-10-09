// editor.js
// 用途：编辑控制台当前项目的 UI 文档，直接保存并按需刷新资源索引。
(function () {
  "use strict";

  var openProjectBtn = document.getElementById("openProjectBtn");
  var documentNameEl = document.getElementById("currentDocument");
  var projectDirsEl = document.getElementById("projectDirs");
  var projectFilesEl = document.getElementById("projectFiles");
  var viewListBtn = document.getElementById("viewListBtn");
  var viewIconBtn = document.getElementById("viewIconBtn");

  var project = {
    name: "当前项目",
    files: [],
    config: null,
    configError: "",
  };
  var selectedDir = "";
  var viewMode = "list";
  var collapsedDirs = {};
  var bottomTab = "ui";
  var assets = [];
  var resourceIndexReady = false;
  var selectedAsset = "";
  var replaceTarget = null;
  var dirtyPaths = {};
  var pendingFile = null;
  var saveBtn = document.getElementById("saveBtn");
  var saveStatus = document.getElementById("saveStatus");
  var refreshing = false;
  var writeReady = false;
  var saving = null;
  var opening = false;
  var saveDialog = document.getElementById("saveDialog");
  var saveDialogPath = document.getElementById("saveDialogPath");
  var loadedText = {};
  var entryQueries = { ui: "", project: "" };
  var entrySearch = document.getElementById("entrySearch");
  if (entrySearch) {
    entrySearch.addEventListener("input", function () {
      entryQueries[bottomTab] = entrySearch.value; renderAll();
    });
    entrySearch.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.stopPropagation(); event.preventDefault();
        entrySearch.value = ""; entryQueries[bottomTab] = ""; renderAll();
      }
    });
  }

  function dirname(path) {
    var i = path.lastIndexOf("/");
    return i <= 0 ? "" : path.slice(0, i);
  }

  function basename(path) {
    var i = path.lastIndexOf("/");
    return i < 0 ? path : path.slice(i + 1);
  }

  function insertPath(tree, path, file) {
    var parts = dirname(window.UrhoxConfig.displayPath(path)).split("/").filter(Boolean);
    var node = tree;
    var acc = "";
    for (var i = 0; i < parts.length; i++) {
      acc = acc ? acc + "/" + parts[i] : parts[i];
      node.dirs[parts[i]] = node.dirs[parts[i]] || { name: parts[i], path: acc, dirs: {}, files: [] };
      node = node.dirs[parts[i]];
    }
    node.files.push(file);
  }

  function buildDirTree(files) {
    var root = { name: "项目", path: "", dirs: {}, files: [] };
    files.forEach(function (file) {
      insertPath(root, file.path, file);
    });
    return root;
  }

  function collectFiles(node, out) {
    node.files.forEach(function (file) { out.push(file); });
    Object.keys(node.dirs).forEach(function (name) {
      collectFiles(node.dirs[name], out);
    });
  }

  function findDir(node, path) {
    if (node.path === path) return node;
    var names = Object.keys(node.dirs);
    for (var i = 0; i < names.length; i++) {
      var found = findDir(node.dirs[names[i]], path);
      if (found) return found;
    }
    return null;
  }

  function filesForDir(tree, path) {
    if (!path) {
      var all = [];
      collectFiles(tree, all);
      return all;
    }
    var node = findDir(tree, path);
    if (!node) return [];
    var out = [];
    collectFiles(node, out);
    return out;
  }

  function renderDirNode(node, container, depth) {
    var row = document.createElement("div");
    row.className = "dir-item" + (selectedDir === node.path ? " active" : "");
    row.style.paddingLeft = (6 + depth * 12) + "px";
    var hasChildren = Object.keys(node.dirs).length > 0;
    var collapsed = !!collapsedDirs[node.path || "__root__"];
    row.textContent = (hasChildren ? (collapsed ? "▸ " : "▾ ") : "  ") + (node.name || "项目");
    row.title = node.path || "/";
    row.dataset.path = node.path;
    row.addEventListener("click", function (event) {
      event.stopPropagation();
      if (hasChildren && event.detail === 2) {
        collapsedDirs[node.path || "__root__"] = !collapsed;
        renderAll();
        return;
      }
      selectedDir = node.path;
      renderAll();
    });
    container.appendChild(row);
    if (!collapsed) {
      Object.keys(node.dirs).sort().forEach(function (name) {
        renderDirNode(node.dirs[name], container, depth + 1);
      });
    }
  }

  function currentFilePath() {
    return window.UrhoxPreview ? window.UrhoxPreview.currentPath : "";
  }

  function bindFileThumb(img, file) {
    if (!img || !file) return;
    var ref = file.ref || file.path;
    if (window.UrhoxPreview && window.UrhoxPreview.bindImage) {
      window.UrhoxPreview.bindImage(img, ref);
      return;
    }
    if (window.UrhoxAssets && window.UrhoxAssets.bindSrc) {
      window.UrhoxAssets.bindSrc(img, ref);
      return;
    }
    if (file.path) img.src = file.path;
  }

  function currentEntries() {
    if (bottomTab === "project") return assets;
    return project.files;
  }

  function renderFileList(files) {
    projectFilesEl.innerHTML = "";
    if (!files.length) {
      projectFilesEl.innerHTML = entryQueries[bottomTab].trim() ? '<p class="muted">没有匹配的文件</p>' : bottomTab === "project"
        ? "<p class=\"muted\">这个目录下没有图片 / 字体</p>"
        : "<p class=\"muted\">这个目录下没有 .ui.json</p>";
      return;
    }
    files = files.slice().sort(function (a, b) { return a.path.localeCompare(b.path); });
    var activePath = bottomTab === "project" ? selectedAsset : currentFilePath();
    if (bottomTab === "project" && viewMode === "icon") {
      var grid = document.createElement("div");
      grid.className = "file-grid";
      files.forEach(function (file) {
        var card = document.createElement("div");
        card.className = "file-card" + (activePath === file.path ? " active" : "") + (dirtyPaths[file.path] ? " dirty" : "") + (selectedAsset === file.path ? " reveal" : "");
        card.title = window.UrhoxConfig.displayPath(file.path);
        card.dataset.path = file.path;
        if (file.kind === "image") {
          card.innerHTML = "<img class=\"icon\" alt=\"\" draggable=\"false\" /><div class=\"name\"></div>";
          var thumb = card.querySelector("img");
          thumb.draggable = false;
          bindFileThumb(thumb, file);
        } else {
          card.innerHTML = "<div class=\"icon\">" + (file.kind === "font" ? "TTF" : "JSON") + "</div><div class=\"name\"></div>";
        }
        window.UrhoxUiTools.highlight(card.querySelector(".name"), file.name, entryQueries[bottomTab]);
        if (entryQueries[bottomTab].trim()) {
          var pathLabel = document.createElement("div"); pathLabel.className = "file-path";
          window.UrhoxUiTools.highlight(pathLabel, window.UrhoxConfig.displayPath(file.path), entryQueries[bottomTab]); card.appendChild(pathLabel);
        }
        if (file.kind === "image") {
          card.draggable = true;
          card.addEventListener("dragstart", function (event) {
            var ref = file.ref || file.path;
            event.dataTransfer.setData("text/plain", "urhox-image:" + ref);
            event.dataTransfer.effectAllowed = "copy";
          });
        }
        card.addEventListener("click", function () { return onEntryClick(file); });
        bindEntryMenu(card, file);
        grid.appendChild(card);
      });
      projectFilesEl.appendChild(grid);
      return;
    }
    var list = document.createElement("div");
    list.className = "file-list";
    files.forEach(function (file) {
      var item = document.createElement("div");
      item.className = "file-item" + (activePath === file.path ? " active" : "") + (dirtyPaths[file.path] ? " dirty" : "") + (selectedAsset === file.path ? " reveal" : "");
      item.title = window.UrhoxConfig.displayPath(file.path);
      item.dataset.path = file.path;
      item.innerHTML = "<span></span><span class=\"file-path\"></span>";
      window.UrhoxUiTools.highlight(item.querySelector("span"), file.name, entryQueries[bottomTab]);
      window.UrhoxUiTools.highlight(item.querySelector(".file-path"),
        entryQueries[bottomTab].trim() ? window.UrhoxConfig.displayPath(file.path) : file.dir || "", entryQueries[bottomTab]);
      if (file.kind === "image") {
        item.draggable = true;
        item.addEventListener("dragstart", function (event) {
          var ref = file.ref || file.path;
          event.dataTransfer.setData("text/plain", "urhox-image:" + ref);
          event.dataTransfer.effectAllowed = "copy";
        });
      }
      item.addEventListener("click", function () { return onEntryClick(file); });
      bindEntryMenu(item, file);
      list.appendChild(item);
    });
    projectFilesEl.appendChild(list);
  }

  function bindEntryMenu(element, file) {
    element.addEventListener("contextmenu", function (event) {
      event.preventDefault(); event.stopPropagation();
      if (opening) return;
      var api = window.UrhoxPreview, menu = window.UrhoxContextMenu, origin = project;
      if (!menu) return;
      var items;
      if (file.kind === "image" || file.kind === "font") {
        selectedAsset = file.path; renderAll();
        items = [];
        if (file.kind === "image") {
          items.push({ label: "添加到画布", enabled: !!api.tree && !api.tree.locked, run: function () {
            if (project === origin) api.placeImage(file.ref || file.path);
          } }, { label: "替换选中节点图片", enabled: api.contextState().image, run: function () {
            if (project === origin) api.replaceSelectedImage(file.ref || file.path);
          } });
        }
        items.push({ label: "复制资源路径", run: function () {
          return navigator.clipboard.writeText(file.ref || file.path);
        } });
      } else {
        var reload = file.path === currentFilePath();
        items = [{ label: reload ? "重新从磁盘加载" : "打开", run: function () {
          if (project === origin) return openUiFile(file, reload);
        } }];
      }
      menu.open(items, event.clientX, event.clientY);
    });
  }

  function onEntryClick(file) {
    if (replaceTarget && file.kind === "image") {
      applyReplace(file);
      return;
    }
    if (bottomTab === "project") {
      selectedAsset = file.path;
      renderAll();
      return;
    }
    return openUiFile(file);
  }

  function imageHasMeta(file) {
    return !file || file.hasMeta !== false;
  }

  function applyReplace(file) {
    if (!validateImageTarget() || !file || file.kind !== "image") return false;
    var target = replaceTarget;
    var ref = file.ref || file.path;
    if (target.node[target.key] === ref) {
      cancelReplaceImage();
      return true;
    }
    if (!imageHasMeta(file)) {
      alert("这张图没有 .meta（" + file.name + ".meta）。\n游戏资源通常需要 meta。请先在项目里生成 meta，再引用。\n仍会写入路径，但运行时可能加载失败。");
    }
    var cb = target.onChange;
    if (cb) cb({ phase: "start" });
    target.node[target.key] = ref;
    cancelReplaceImage();
    if (cb) cb({ phase: "end" });
    selectedAsset = file.path;
    renderAll();
    return true;
  }

  function updateReplaceUi() {
    var title = document.getElementById("bottomListTitle");
    if (title) title.textContent = bottomTab === "project"
      ? (replaceTarget ? "替换图片 · " + (replaceTarget.node.id || replaceTarget.node.type) : "项目资源")
      : "UI 文档";
    var cancel = document.getElementById("cancelReplaceBtn");
    if (cancel) cancel.classList.toggle("hidden", !replaceTarget);
    document.body.classList.toggle("picking-image", !!replaceTarget);
  }

  function cancelReplaceImage() {
    if (!replaceTarget) return false;
    replaceTarget = null;
    updateReplaceUi();
    return true;
  }

  function validateImageTarget() {
    if (!replaceTarget) return false;
    var preview = window.UrhoxPreview;
    var selection = preview && preview.getSelection ? preview.getSelection() : [];
    if (!preview || preview.tree !== replaceTarget.tree || project !== replaceTarget.project ||
        selection.length !== 1 || selection[0] !== replaceTarget.node) {
      cancelReplaceImage();
      return false;
    }
    return true;
  }

  function setBottomTab(tab) {
    bottomTab = tab;
    document.body.classList.toggle("ui-documents", tab === "ui");
    viewListBtn.hidden = viewIconBtn.hidden = tab === "ui";
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    var dirTitle = document.getElementById("bottomDirTitle");
    if (dirTitle) dirTitle.textContent = tab === "project" ? "资源目录" : "UI 文档";
    if (tab !== "project") cancelReplaceImage();
    updateReplaceUi();
    selectedDir = "";
    renderAll();
  }

  function renderAll() {
    var tree = buildDirTree(currentEntries());
    if (projectDirsEl) {
      projectDirsEl.innerHTML = "";
      renderDirNode(tree, projectDirsEl, 0);
    }
    var query = entryQueries[bottomTab];
    if (entrySearch) {
      entrySearch.value = query;
      entrySearch.placeholder = bottomTab === "ui" ? "搜索 UI 文档" : "搜索项目资源";
      entrySearch.setAttribute("aria-label", entrySearch.placeholder);
    }
    var files = query.trim() ? currentEntries().filter(function (file) {
      return window.UrhoxUiTools.matchPositions(window.UrhoxConfig.displayPath(file.path), query) !== null;
    }) : (bottomTab === "ui" ? project.files : filesForDir(tree, selectedDir));
    var count = document.getElementById("entrySearchCount");
    if (count) count.textContent = query.trim() ? files.length + " 项" : "";
    renderFileList(files);
  }

  function isDirty(path) {
    return !!dirtyPaths[path || currentFilePath()];
  }

  function updateDirtyUi() {
    var dirty = isDirty();
    if (openProjectBtn) openProjectBtn.disabled = refreshing || opening || !!saving;
    if (saveBtn) {
      saveBtn.disabled = !writeReady || !dirty || !!saving || opening;
      saveBtn.textContent = saving ? "保存中…" : "保存";
    }
    var hasDocument = !!window.UrhoxPreview?.tree;
    if (documentNameEl) {
      var display = hasDocument ? window.UrhoxConfig.displayPath(currentFilePath()) : "尚未打开 UI 文档";
      documentNameEl.textContent = display;
      documentNameEl.title = project.name + " · " + display;
    }
    if (saveStatus) saveStatus.textContent = saving ? "正在保存…" : !hasDocument ? "" : dirty ? "未保存" : "已保存";
    renderAll();
  }

  function setDirty(path, value) {
    if (!path) return;
    if (!!dirtyPaths[path] === !!value) return;
    if (value) dirtyPaths[path] = true;
    else delete dirtyPaths[path];
    updateDirtyUi();
  }

  function setOpening(value, message) {
    opening = value;
    if (openProjectBtn) openProjectBtn.disabled = value || refreshing || !!saving;
    var workspace = document.querySelector(".workspace");
    if (workspace) workspace.inert = value;
    if (projectFilesEl) projectFilesEl.inert = value;
    if (projectDirsEl) projectDirsEl.inert = value;
    var status = document.getElementById("sessionStatus");
    if (status) status.textContent = value ? (message || "正在打开文档…") : "";
    updateDirtyUi();
  }

  function exportJSON(tree) {
    return JSON.stringify(tree, null, 2) + "\n";
  }

  function saveCurrent() {
    if (saving) return saving;
    if (!writeReady) {
      alert("当前项目文件尚未就绪，请刷新文件后再保存。");
      return Promise.resolve(false);
    }
    var preview = window.UrhoxPreview;
    if (!preview || !preview.tree) return Promise.resolve(false);
    if (!isDirty()) return Promise.resolve(true);
    var targetProject = project;
    var path = preview.currentPath;
    // Keep the saved snapshot separate from edits made while the request is in flight.
    var json = preview.getJSON();
    var savedNodes = window.UrhoxHistory.nodeStates(preview.tree);
    var text = exportJSON(json);
    saving = (async function () {
      var result = await window.UrhoxSave.write(path, text, loadedText[path]);
      if (!result.ok) throw new Error(result.error || "无法保存当前项目的 UI 文档");
      loadedText[path] = text;
      if (project === targetProject && preview.currentPath === path) {
        if (preview.markClean) preview.markClean(json, savedNodes);
        else setDirty(path, JSON.stringify(preview.getJSON()) !== JSON.stringify(json));
      }
      return true;
    })().catch(function (err) {
      alert("保存失败：" + (err.message || String(err)));
      return false;
    }).finally(function () {
      saving = null;
      updateDirtyUi();
    });
    updateDirtyUi();
    return saving;
  }

  function showMissingUiGuide(projectName) {
    if (window.UrhoxGuidance) {
      window.UrhoxGuidance.open(projectName || project.name);
      return;
    }
    var dialog = document.getElementById("missingUiDialog");
    if (dialog) dialog.showModal();
  }

  function hideSaveDialog() {
    pendingFile = null;
    saveDialog.close();
  }

  function confirmLeave(nextFile) {
    return new Promise(function (resolve) {
      pendingFile = { file: nextFile, resolve: resolve };
      saveDialogPath.textContent = window.UrhoxConfig.displayPath(currentFilePath());
      saveDialog.showModal();
    });
  }

  async function allowLeave() {
    if (saving) await saving;
    if (isDirty()) {
      var action = await confirmLeave(null);
      if (action === "cancel") return false;
      if (action === "save") {
        var ok = await saveCurrent();
        if (!ok) return false;
        if (isDirty()) {
          alert("保存期间产生了新修改，已保留当前文档。请再次保存后切换。");
          return false;
        }
      }
    }
    return true;
  }

  async function openUiFile(file, reload) {
    if (opening || refreshing || (!reload && file.path === currentFilePath())) return false;
    setOpening(true);
    try {
      if (!await allowLeave()) return false;
      var oldPath = currentFilePath();
      await loadUiFile(file);
      setDirty(oldPath, false);
      return true;
    } catch (err) {
      alert("无法打开「" + file.name + "」：" + (err.message || String(err)));
      return false;
    } finally {
      setOpening(false);
    }
  }

  function openUiPath(ref) {
    if (!ref) return false;
    var normalized = String(ref).replace(/^\/+/, "");
    var file = project.files.find(function (entry) {
      var path = String(entry.path || "").replace(/^\/+/, "");
      return path === normalized ||
        path.endsWith("/" + normalized) ||
        path.endsWith("/assets/" + normalized) ||
        path === "assets/" + normalized;
    });
    if (!file) {
      alert("找不到组件源文件：" + ref);
      return false;
    }
    openUiFile(file);
    return true;
  }

  async function loadUiFile(file, targetProject) {
    targetProject = targetProject || project;
    var res = await fetch(file.path);
    if (!res.ok) throw new Error("读取失败（HTTP " + res.status + "）");
    var text = await res.text();
    var json = JSON.parse(text);
    if (window.UrhoxPreview) {
      if (window.UrhoxPreview.setProjectConfig) {
        window.UrhoxPreview.setProjectConfig(targetProject.config || null);
      }
      var opts = {
        path: file.path,
        assetRoot: file.assetRoot || window.UrhoxConfig.DEFAULT_ASSET_ROOT,
        projectConfig: targetProject.config || null,
        comparisonKey: targetProject.name + ':' + file.path,
        referenceImage: (function () {
          var companion = file.path.replace(/\.ui\.json$/i, '.reference.png');
          if (assets.some(function (item) { return item.path === companion; })) {
            return decodeURIComponent(companion.replace(/^.*?assets\//, ''));
          }
          return null;
        })(),
      };
      if (window.UrhoxPreview.loadTreeAsync) {
        await window.UrhoxPreview.loadTreeAsync(json, opts);
      } else {
        window.UrhoxPreview.loadTree(json, opts);
      }
    }
    loadedText[file.path] = text;
    setDirty(file.path, false);
    updateDirtyUi();
  }

  openProjectBtn.addEventListener("click", function () { loadProjectFiles(false); });

  viewListBtn.addEventListener("click", function () {
    viewMode = "list";
    viewListBtn.classList.add("active");
    viewIconBtn.classList.remove("active");
    renderAll();
  });
  viewIconBtn.addEventListener("click", function () {
    viewMode = "icon";
    viewIconBtn.classList.add("active");
    viewListBtn.classList.remove("active");
    renderAll();
  });

  var missingUiOk = document.getElementById("missingUiOk");
  if (missingUiOk) {
    missingUiOk.addEventListener("click", function () {
      var dialog = document.getElementById("missingUiDialog");
      if (dialog) dialog.close();
    });
  }
  if (saveBtn) saveBtn.addEventListener("click", function () { saveCurrent(); });
  saveDialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    if (pendingFile) pendingFile.resolve("cancel");
    hideSaveDialog();
  });
  document.getElementById("saveDialogCancel").addEventListener("click", function () {
    if (pendingFile) pendingFile.resolve("cancel");
    hideSaveDialog();
  });
  document.getElementById("saveDialogDiscard").addEventListener("click", function () {
    if (pendingFile) pendingFile.resolve("discard");
    hideSaveDialog();
  });
  document.getElementById("saveDialogSave").addEventListener("click", function () {
    if (pendingFile) pendingFile.resolve("save");
    hideSaveDialog();
  });

  window.addEventListener("beforeunload", function (event) {
    if (!isDirty() && !saving) return;
    event.preventDefault();
    event.returnValue = "";
  });

  async function loadProjectFiles(initial) {
    if (opening || saving || refreshing) return;
    refreshing = true;
    openProjectBtn.disabled = true;
    openProjectBtn.textContent = "刷新中…";
    var status = document.getElementById("sessionStatus");
    if (status) status.textContent = "";
    try {
      var res = await fetch(window.UrhoxConfig.MANIFEST);
      if (!res.ok) throw new Error("读取项目清单失败（HTTP " + res.status + "）");
      var data = await res.json();
      if (!Array.isArray(data.ui) || !Array.isArray(data.assets)) throw new Error("项目文件清单格式无效");
      if (data.name) project.name = data.name;
      project.config = data.config && window.UrhoxProjectConfig
        ? window.UrhoxProjectConfig.normalize(data.config, data.config.source) : data.config || null;
      project.configError = project.config && project.config.error ? project.config.error : "";
      project.files = data.ui.filter(function (file) { return /\.ui\.json$/i.test(file.path); });
      assets = data.assets.map(function (asset) {
        if (asset.hasMeta == null) asset.hasMeta = true;
        return asset;
      });
      resourceIndexReady = true;
      writeReady = true;
      if (window.UrhoxPreview?.tree) {
        // Refresh the index only: keep the document, undo history and original save baseline.
        if (!project.files.some(function (file) { return file.path === currentFilePath(); }) && status)
          status.textContent = "当前文件已不在项目列表中，编辑内容仍保留；请检查磁盘文件。";
      } else if (project.files.length) {
        var requested = initial ? new URLSearchParams(location.search).get("ui") : "";
        if (requested && requested.startsWith("assets/")) requested = window.UrhoxConfig.FILE_ROOT + requested.split("/").map(encodeURIComponent).join("/");
        var first = project.files.find(function (file) { return file.path === requested; });
        if (requested && !first) throw new Error("找不到指定的 UI 文档：" + window.UrhoxConfig.displayPath(requested));
        setOpening(true);
        try { await loadUiFile(first || project.files[0]); }
        finally { setOpening(false); }
      } else if (initial) showMissingUiGuide(project.name);
      updateDirtyUi();
    } catch (error) {
      if (status) status.textContent = "文件列表加载失败：" + (error.message || String(error));
    } finally {
      refreshing = false;
      openProjectBtn.disabled = opening || !!saving;
      openProjectBtn.textContent = "刷新文件";
    }
  }

  function findAsset(ref) {
    if (!ref) return null;
    return assets.find(function (a) {
      return a.kind === "image" && (
        a.ref === ref ||
        a.path === ref ||
        a.path.endsWith("/" + ref) ||
        a.path.endsWith("/assets/" + ref) ||
        ("assets/" + ref) === a.path
      );
    }) || null;
  }

  function bindAssetThumb(img, ref) {
    var found = findAsset(ref);
    if (found) {
      bindFileThumb(img, found);
      return;
    }
    if (window.UrhoxPreview && window.UrhoxPreview.bindImage) {
      window.UrhoxPreview.bindImage(img, ref);
      return;
    }
    if (window.UrhoxAssets && window.UrhoxAssets.bindSrc) window.UrhoxAssets.bindSrc(img, ref);
  }

  function revealAsset(ref) {
    var found = findAsset(ref);
    setBottomTab("project");
    entryQueries.project = "";
    if (!found) return;
    selectedAsset = found.path;
    // Match insertPath's tree keys, not the manifest's display-only directory.
    selectedDir = dirname(window.UrhoxConfig.displayPath(found.path)).split("/").filter(Boolean).join("/");
    collapsedDirs.__root__ = false;
    var parts = selectedDir.split("/");
    parts.forEach(function (_, index) {
      collapsedDirs[parts.slice(0, index + 1).join("/")] = false;
    });
    viewMode = "icon";
    if (viewIconBtn) viewIconBtn.classList.add("active");
    if (viewListBtn) viewListBtn.classList.remove("active");
    renderAll();
    requestAnimationFrame(function () {
      if (bottomTab !== "project" || selectedAsset !== found.path) return;
      function scrollToPath(container, path) {
        if (!container) return;
        var el = Array.from(container.querySelectorAll("[data-path]")).find(function (row) {
          return row.dataset.path === path;
        });
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      scrollToPath(projectDirsEl, selectedDir);
      scrollToPath(projectFilesEl, found.path);
    });
  }

  function beginReplaceImage(node, key, onChange) {
    if (!node) return;
    replaceTarget = { node: node, key: key, onChange: onChange,
      tree: window.UrhoxPreview.tree, project: project };
    if (!validateImageTarget()) return;
    setBottomTab("project");
    viewMode = "icon";
    if (viewIconBtn) viewIconBtn.classList.add("active");
    if (viewListBtn) viewListBtn.classList.remove("active");
    if (!assets.length) {
      alert("当前项目里还没有图片。请把 png/jpg 放到当前项目的 assets 目录后点击「刷新文件」。只能使用项目内的图片。");
      cancelReplaceImage();
      return;
    }
    renderAll();
    var bar = document.querySelector(".project-bar");
    if (bar && bar.scrollIntoView) bar.scrollIntoView({ block: "nearest" });
  }

  function assignImageByRef(ref) {
    if (!ref) return false;
    var found = assets.find(function (a) {
      return a.kind === "image" && (a.ref === ref || a.path === ref || a.path.endsWith("/" + ref));
    });
    if (!found) {
      alert("只能使用项目内的图片。");
      return false;
    }
    return applyReplace(found);
  }

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setBottomTab(btn.getAttribute("data-tab"));
    });
  });
  var cancelReplaceBtn = document.getElementById("cancelReplaceBtn");
  if (cancelReplaceBtn) cancelReplaceBtn.addEventListener("click", cancelReplaceImage);

  setBottomTab("ui");
  loadProjectFiles(true);

  window.UrhoxProject = {
    render: renderAll,
    get: function () { return project; },
    setDirty: setDirty,
    isDirty: isDirty,
    saveCurrent: saveCurrent,
    isOpening: function () { return opening; },
    isBusy: function () { return opening || refreshing || !!saving; },
    isResourceIndexReady: function () { return resourceIndexReady; },
    revealAsset: revealAsset,
    resourceExists: function (ref) {
      return assets.concat(project.files).some(function (entry) {
        return entry.ref === ref || entry.path === ref || entry.path.endsWith("/" + ref);
      });
    },
    beginReplaceImage: beginReplaceImage,
    cancelReplaceImage: cancelReplaceImage,
    validateImageTarget: validateImageTarget,
    assignImageByRef: assignImageByRef,
    findAsset: findAsset,
    bindAssetThumb: bindAssetThumb,
    openUiPath: openUiPath,
  };

  renderAll();
})();
