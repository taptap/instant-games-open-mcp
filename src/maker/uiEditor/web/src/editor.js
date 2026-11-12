// editor.js
// 用途：编辑控制台当前项目的 UI 文档，直接保存并按需刷新资源索引。
(function () {
  'use strict';

  var openProjectBtn = document.getElementById('openProjectBtn');
  var documentNameEl = document.getElementById('currentDocument');
  var projectDirsEl = document.getElementById('projectDirs');
  var projectFilesEl = document.getElementById('projectFiles');
  var viewListBtn = document.getElementById('viewListBtn');
  var viewIconBtn = document.getElementById('viewIconBtn');

  var project = {
    name: '当前项目',
    files: [],
    config: null,
    configError: '',
  };
  var selectedDir = '';
  var viewMode = 'list';
  var collapsedDirs = {};
  var bottomTab = 'ui';
  var assets = [];
  var resourceIndexReady = false;
  var selectedAsset = '';
  var replaceTarget = null;
  var dirtyPaths = {};
  var pendingFile = null;
  var saveBtn = document.getElementById('saveBtn');
  var saveStatus = document.getElementById('saveStatus');
  var refreshing = false;
  var writeReady = false;
  var saving = null;
  var lastSaveError = null;
  var opening = false;
  var saveDialog = document.getElementById('saveDialog');
  var saveDialogPath = document.getElementById('saveDialogPath');
  var loadedText = {};
  var entryQueries = { ui: '', project: '' };
  var entrySearch = document.getElementById('entrySearch');
  if (entrySearch) {
    entrySearch.addEventListener('input', function () {
      entryQueries[bottomTab] = entrySearch.value;
      renderAll();
    });
    entrySearch.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        entrySearch.value = '';
        entryQueries[bottomTab] = '';
        renderAll();
      }
    });
  }

  function dirname(path) {
    var i = path.lastIndexOf('/');
    return i <= 0 ? '' : path.slice(0, i);
  }

  function basename(path) {
    var i = path.lastIndexOf('/');
    return i < 0 ? path : path.slice(i + 1);
  }

  function insertPath(tree, path, file) {
    var parts = dirname(window.UrhoxConfig.displayPath(path)).split('/').filter(Boolean);
    var node = tree;
    var acc = '';
    for (var i = 0; i < parts.length; i++) {
      acc = acc ? acc + '/' + parts[i] : parts[i];
      node.dirs[parts[i]] = node.dirs[parts[i]] || {
        name: parts[i],
        path: acc,
        dirs: {},
        files: [],
      };
      node = node.dirs[parts[i]];
    }
    node.files.push(file);
  }

  function buildDirTree(files) {
    var root = { name: '项目', path: '', dirs: {}, files: [] };
    files.forEach(function (file) {
      insertPath(root, file.path, file);
    });
    return root;
  }

  function collectFiles(node, out) {
    node.files.forEach(function (file) {
      out.push(file);
    });
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
    var row = document.createElement('div');
    row.className = 'dir-item' + (selectedDir === node.path ? ' active' : '');
    row.style.paddingLeft = 6 + depth * 12 + 'px';
    var hasChildren = Object.keys(node.dirs).length > 0;
    var collapsed = !!collapsedDirs[node.path || '__root__'];
    row.textContent = (hasChildren ? (collapsed ? '▸ ' : '▾ ') : '  ') + (node.name || '项目');
    row.title = node.path || '/';
    row.dataset.path = node.path;
    row.addEventListener('click', function (event) {
      event.stopPropagation();
      if (hasChildren && event.detail === 2) {
        collapsedDirs[node.path || '__root__'] = !collapsed;
        renderAll();
        return;
      }
      selectedDir = node.path;
      renderAll();
    });
    container.appendChild(row);
    if (!collapsed) {
      Object.keys(node.dirs)
        .sort()
        .forEach(function (name) {
          renderDirNode(node.dirs[name], container, depth + 1);
        });
    }
  }

  function currentFilePath() {
    return window.UrhoxPreview ? window.UrhoxPreview.currentPath : '';
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
    if (bottomTab === 'project') return assets;
    return project.files;
  }

  function renderFileList(files) {
    projectFilesEl.innerHTML = '';
    if (!files.length) {
      projectFilesEl.innerHTML = entryQueries[bottomTab].trim()
        ? '<p class="muted">没有匹配的文件</p>'
        : bottomTab === 'project'
          ? '<p class="muted">这个目录下没有图片 / 字体</p>'
          : '<p class="muted">这个目录下没有 .ui.json</p>';
      return;
    }
    files = files.slice().sort(function (a, b) {
      return a.path.localeCompare(b.path);
    });
    var activePath = bottomTab === 'project' ? selectedAsset : currentFilePath();
    if (bottomTab === 'project' && viewMode === 'icon') {
      var grid = document.createElement('div');
      grid.className = 'file-grid';
      files.forEach(function (file) {
        var card = document.createElement('div');
        card.className =
          'file-card' +
          (activePath === file.path ? ' active' : '') +
          (dirtyPaths[file.path] ? ' dirty' : '') +
          (selectedAsset === file.path ? ' reveal' : '');
        card.title = window.UrhoxConfig.displayPath(file.path);
        card.dataset.path = file.path;
        if (file.kind === 'image') {
          card.innerHTML = '<img class="icon" alt="" draggable="false" /><div class="name"></div>';
          var thumb = card.querySelector('img');
          thumb.draggable = false;
          bindFileThumb(thumb, file);
        } else {
          card.innerHTML =
            '<div class="icon">' +
            (file.kind === 'font' ? 'TTF' : 'JSON') +
            '</div><div class="name"></div>';
        }
        window.UrhoxUiTools.highlight(
          card.querySelector('.name'),
          file.name,
          entryQueries[bottomTab]
        );
        if (entryQueries[bottomTab].trim()) {
          var pathLabel = document.createElement('div');
          pathLabel.className = 'file-path';
          window.UrhoxUiTools.highlight(
            pathLabel,
            window.UrhoxConfig.displayPath(file.path),
            entryQueries[bottomTab]
          );
          card.appendChild(pathLabel);
        }
        if (file.kind === 'image') {
          card.draggable = true;
          card.addEventListener('dragstart', function (event) {
            var ref = file.ref || file.path;
            event.dataTransfer.setData('text/plain', 'urhox-image:' + ref);
            event.dataTransfer.effectAllowed = 'copy';
          });
        }
        card.addEventListener('click', function () {
          return onEntryClick(file);
        });
        bindEntryMenu(card, file);
        grid.appendChild(card);
      });
      projectFilesEl.appendChild(grid);
      return;
    }
    var list = document.createElement('div');
    list.className = 'file-list';
    files.forEach(function (file) {
      var item = document.createElement('div');
      item.className =
        'file-item' +
        (activePath === file.path ? ' active' : '') +
        (dirtyPaths[file.path] ? ' dirty' : '') +
        (selectedAsset === file.path ? ' reveal' : '');
      item.title = window.UrhoxConfig.displayPath(file.path);
      item.dataset.path = file.path;
      item.innerHTML = '<span></span><span class="file-path"></span>';
      window.UrhoxUiTools.highlight(item.querySelector('span'), file.name, entryQueries[bottomTab]);
      window.UrhoxUiTools.highlight(
        item.querySelector('.file-path'),
        entryQueries[bottomTab].trim() ? window.UrhoxConfig.displayPath(file.path) : file.dir || '',
        entryQueries[bottomTab]
      );
      if (file.kind === 'image') {
        item.draggable = true;
        item.addEventListener('dragstart', function (event) {
          var ref = file.ref || file.path;
          event.dataTransfer.setData('text/plain', 'urhox-image:' + ref);
          event.dataTransfer.effectAllowed = 'copy';
        });
      }
      item.addEventListener('click', function () {
        return onEntryClick(file);
      });
      bindEntryMenu(item, file);
      list.appendChild(item);
    });
    projectFilesEl.appendChild(list);
  }

  function bindEntryMenu(element, file) {
    element.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (opening) return;
      var api = window.UrhoxPreview,
        menu = window.UrhoxContextMenu,
        origin = project;
      if (!menu) return;
      var items;
      if (file.kind === 'image' || file.kind === 'font') {
        selectedAsset = file.path;
        renderAll();
        items = [];
        if (file.kind === 'image') {
          items.push(
            {
              label: '添加到画布',
              enabled: !!api.tree && !api.tree.locked,
              run: function () {
                if (project === origin) api.placeImage(file.ref || file.path);
              },
            },
            {
              label: '替换选中节点图片',
              enabled: api.contextState().image,
              run: function () {
                if (project === origin) api.replaceSelectedImage(file.ref || file.path);
              },
            }
          );
        }
        items.push({
          label: '复制资源路径',
          run: function () {
            return navigator.clipboard.writeText(file.ref || file.path);
          },
        });
      } else {
        var reload = file.path === currentFilePath();
        items = [
          {
            label: reload ? '重新从磁盘加载' : '打开',
            run: function () {
              if (project === origin) return openUiFile(file, reload);
            },
          },
        ];
      }
      items.push({
        label: '拷贝路径',
        run: function () {
          return navigator.clipboard.writeText(window.UrhoxConfig.displayPath(file.path));
        },
      });
      menu.open(items, event.clientX, event.clientY);
    });
  }

  function onEntryClick(file) {
    if (replaceTarget && file.kind === 'image') {
      applyReplace(file);
      return;
    }
    if (bottomTab === 'project') {
      selectedAsset = file.path;
      renderAll();
      return;
    }
    return openUiFile(file);
  }

  function applyReplace(file) {
    if (!validateImageTarget() || !file || file.kind !== 'image') return false;
    var target = replaceTarget;
    var ref = file.ref || file.path;
    if (target.node[target.key] === ref) {
      cancelReplaceImage();
      return true;
    }
    var cb = target.onChange;
    if (cb) cb({ phase: 'start' });
    target.node[target.key] = ref;
    cancelReplaceImage();
    if (cb) cb({ phase: 'end' });
    selectedAsset = file.path;
    renderAll();
    return true;
  }

  function updateReplaceUi() {
    var title = document.getElementById('bottomListTitle');
    if (title)
      title.textContent =
        bottomTab === 'project'
          ? replaceTarget
            ? '替换图片 · ' + (replaceTarget.node.id || replaceTarget.node.type)
            : '项目资源'
          : 'UI 文档';
    var cancel = document.getElementById('cancelReplaceBtn');
    if (cancel) cancel.classList.toggle('hidden', !replaceTarget);
    document.body.classList.toggle('picking-image', !!replaceTarget);
  }

  function cancelReplaceImage() {
    if (!replaceTarget) return false;
    replaceTarget = null;
    updateReplaceUi();
    var host = hostPicker();
    if (host && typeof host.cancelPick === 'function') host.cancelPick();
    return true;
  }

  function validateImageTarget() {
    if (!replaceTarget) return false;
    var preview = window.UrhoxPreview;
    var selection = preview && preview.getSelection ? preview.getSelection() : [];
    if (
      !preview ||
      preview.tree !== replaceTarget.tree ||
      project !== replaceTarget.project ||
      selection.length !== 1 ||
      selection[0] !== replaceTarget.node
    ) {
      cancelReplaceImage();
      return false;
    }
    return true;
  }

  function setBottomTab(tab) {
    bottomTab = tab;
    document.body.classList.toggle('ui-documents', tab === 'ui');
    viewListBtn.hidden = viewIconBtn.hidden = tab === 'ui';
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    var dirTitle = document.getElementById('bottomDirTitle');
    if (dirTitle) dirTitle.textContent = tab === 'project' ? '资源目录' : 'UI 文档';
    if (tab !== 'project') cancelReplaceImage();
    updateReplaceUi();
    selectedDir = '';
    renderAll();
  }

  function renderAll() {
    var tree = buildDirTree(currentEntries());
    if (projectDirsEl) {
      projectDirsEl.innerHTML = '';
      renderDirNode(tree, projectDirsEl, 0);
    }
    var query = entryQueries[bottomTab];
    if (entrySearch) {
      entrySearch.value = query;
      entrySearch.placeholder = bottomTab === 'ui' ? '搜索 UI 文档' : '搜索项目资源';
      entrySearch.setAttribute('aria-label', entrySearch.placeholder);
    }
    var files = query.trim()
      ? currentEntries().filter(function (file) {
          return (
            window.UrhoxUiTools.matchPositions(window.UrhoxConfig.displayPath(file.path), query) !==
            null
          );
        })
      : bottomTab === 'ui'
        ? project.files
        : filesForDir(tree, selectedDir);
    var count = document.getElementById('entrySearchCount');
    if (count) count.textContent = query.trim() ? files.length + ' 项' : '';
    renderFileList(files);
    window.dispatchEvent(new Event('urhox:documentschange'));
  }

  function isDirty(path) {
    return !!dirtyPaths[path || currentFilePath()];
  }

  function updateDirtyUi() {
    var dirty = isDirty();
    if (openProjectBtn) openProjectBtn.disabled = refreshing || opening || !!saving;
    if (saveBtn) {
      saveBtn.disabled = !writeReady || !dirty || !!saving || opening;
      saveBtn.textContent = saving ? '保存中…' : '保存';
      saveBtn.setAttribute('aria-busy', String(!!saving));
    }
    var hasDocument = !!window.UrhoxPreview?.tree;
    if (documentNameEl) {
      var display = hasDocument
        ? window.UrhoxConfig.displayPath(currentFilePath())
        : '尚未打开 UI 文档';
      documentNameEl.title = project.name + ' · ' + display;
      // 路径太长时优先保留文件名，收起的是前面的目录。
      var cut = hasDocument ? display.lastIndexOf('/') + 1 : 0;
      if (cut > 0) {
        var dir = document.createElement('span'),
          file = document.createElement('b');
        dir.className = 'doc-dir';
        dir.textContent = display.slice(0, cut);
        file.className = 'doc-file';
        file.textContent = display.slice(cut);
        documentNameEl.replaceChildren(dir, file);
      } else documentNameEl.textContent = display;
    }
    if (saveStatus) {
      var failed = dirty && lastSaveError && lastSaveError.path === currentFilePath();
      saveStatus.dataset.state = saving
        ? 'saving'
        : !hasDocument
          ? 'empty'
          : failed
            ? 'error'
            : dirty
              ? 'dirty'
              : 'clean';
      saveStatus.textContent = saving
        ? '正在保存…'
        : !hasDocument
          ? ''
          : failed
            ? '保存失败'
            : dirty
              ? '未保存'
              : '已保存';
      saveStatus.title = failed ? lastSaveError.message : '';
    }
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
    var workspace = document.querySelector('.workspace');
    if (workspace) workspace.inert = value;
    if (projectFilesEl) projectFilesEl.inert = value;
    if (projectDirsEl) projectDirsEl.inert = value;
    var status = document.getElementById('sessionStatus');
    if (status) status.textContent = value ? message || '正在打开文档…' : '';
    updateDirtyUi();
  }

  function exportJSON(tree) {
    return JSON.stringify(tree, null, 2) + '\n';
  }

  function saveCurrent() {
    if (saving) return saving;
    if (!writeReady) {
      notify('当前项目文件尚未就绪，请刷新文件后再保存。');
      return Promise.resolve(false);
    }
    var preview = window.UrhoxPreview;
    if (!preview || !preview.tree) return Promise.resolve(false);
    if (!isDirty()) return Promise.resolve(true);
    var targetProject = project;
    var path = preview.currentPath;
    lastSaveError = null;
    // Keep the saved snapshot separate from edits made while the request is in flight.
    var json = preview.getJSON();
    var savedNodes = window.UrhoxHistory.nodeStates(preview.tree);
    var text = exportJSON(json);
    saving = (async function () {
      var result = await window.UrhoxSave.write(path, text, loadedText[path]);
      if (!result.ok) {
        var failure = new Error(result.error || '无法保存当前项目的 UI 文档');
        failure.conflict = !!result.conflict;
        throw failure;
      }
      loadedText[path] = text;
      if (preview.currentPath === path) hideExternalChange();
      if (project === targetProject && preview.currentPath === path) {
        if (preview.markClean) preview.markClean(json, savedNodes);
        else setDirty(path, JSON.stringify(preview.getJSON()) !== JSON.stringify(json));
      }
      return true;
    })()
      .catch(function (err) {
        lastSaveError = { path: path, message: err.message || String(err) };
        // A conflict means someone else changed the file; the bar explains it and offers a reload.
        var conflicted =
          err &&
          err.conflict &&
          project.files.find(function (entry) {
            return entry.path === path;
          });
        if (conflicted) {
          showExternalChange(conflicted, true);
          return false;
        }
        notify('保存失败：' + (err.message || String(err)));
        return false;
      })
      .finally(function () {
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
    var dialog = document.getElementById('missingUiDialog');
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
      if (action === 'cancel') return false;
      if (action === 'save') {
        var ok = await saveCurrent();
        if (!ok) return false;
        if (isDirty()) {
          notify('保存期间产生了新修改，已保留当前文档。请再次保存后切换。', 'warning');
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
      if (!(await allowLeave())) return false;
      var oldPath = currentFilePath();
      var draft = !reload && window.UrhoxConfig.draftFor ? await window.UrhoxConfig.draftFor(file.path) : null;
      var restoredDraft = !!(draft && typeof draft.text === 'string');
      if (restoredDraft)
        await loadUiFile(file, undefined, { text: draft.text, baselineText: draft.baselineText, draft: true });
      else await loadUiFile(file);
      setDirty(oldPath, false);
      return true;
    } catch (err) {
      notify('无法打开「' + file.name + '」：' + (err.message || String(err)));
      return false;
    } finally {
      setOpening(false);
    }
  }

  function openUiPath(ref) {
    if (!ref) return false;
    var normalized = String(ref).replace(/^\/+/, '');
    var file = project.files.find(function (entry) {
      var path = String(entry.path || '').replace(/^\/+/, '');
      return (
        path === normalized ||
        path.endsWith('/' + normalized) ||
        path.endsWith('/assets/' + normalized) ||
        path === 'assets/' + normalized
      );
    });
    if (!file) {
      notify('找不到组件源文件：' + ref);
      return false;
    }
    openUiFile(file);
    return true;
  }

  async function loadUiFile(file, targetProject, extra) {
    targetProject = targetProject || project;
    var text =
      extra && typeof extra.text === 'string'
        ? extra.text
        : await window.UrhoxConfig.readText(file.path);
    var json = JSON.parse(text);
    if (window.UrhoxPreview) {
      if (window.UrhoxPreview.setProjectConfig) {
        window.UrhoxPreview.setProjectConfig(targetProject.config || null);
      }
      var opts = {
        path: file.path,
        assetRoot: file.assetRoot || window.UrhoxConfig.DEFAULT_ASSET_ROOT,
        projectConfig: targetProject.config || null,
        designDraft: await readDesignDraft(file.path),
        comparisonKey: targetProject.name + ':' + file.path,
        referenceImage: (function () {
          var companion = file.path.replace(/\.ui\.json$/i, '.reference.png');
          if (
            assets.some(function (item) {
              return item.path === companion;
            })
          ) {
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
      if (extra && extra.draft && typeof extra.baselineText === 'string' && window.UrhoxPreview.markClean) {
        try { window.UrhoxPreview.markClean(JSON.parse(extra.baselineText)); } catch (_) { /* keep the draft dirty */ }
      }
    }
    loadedText[file.path] = extra && typeof extra.baselineText === 'string' ? extra.baselineText : text;
    if (lastSaveError && lastSaveError.path === file.path) lastSaveError = null;
    if (extra && extra.draft && window.UrhoxConfig.forgetDraft) window.UrhoxConfig.forgetDraft(file.path);
    setDirty(file.path, !!(extra && extra.draft));
    hideExternalChange();
    updateDirtyUi();
    promptLegacyAdaptation();
  }

  async function readDesignDraft(filePath) {
    if (!window.UrhoxConfig.readDesignDraft) return null;
    var layoutPath = String(filePath || '').replace(/[^/]+$/, 'layout.json');
    if (!layoutPath || layoutPath === filePath) return null;
    try {
      var data = await window.UrhoxConfig.readDesignDraft(layoutPath);
      if (!data) return null;
      var design = data && data.design;
      if (!design || !(design.width > 0) || !(design.height > 0)) return null;
      var adaptation =
        data.adaptation && data.adaptation.mode === 'screen' && data.adaptation.logicalShortSide > 0
          ? { mode: 'screen', logicalShortSide: data.adaptation.logicalShortSide }
          : null;
      return { width: design.width, height: design.height, adaptation: adaptation };
    } catch (err) {
      return null;
    }
  }

  function usesDesignResolution() {
    var config = project.config || {};
    return config.designWidth > 0 && config.designHeight > 0;
  }

  function promptLegacyAdaptation() {
    var preview = window.UrhoxPreview;
    var dialog = document.getElementById('legacyAdaptDialog');
    var info = preview && preview.legacyDesignInfo && preview.legacyDesignInfo();
    var ok = document.getElementById('legacyAdaptOk');
    if (
      !dialog ||
      !info ||
      (typeof location !== 'undefined' && new URLSearchParams(location.search).has('render'))
    )
      return;
    if (usesDesignResolution()) return;
    document.getElementById('legacyAdaptText').textContent =
      '这份界面根节点仍是固定设计尺寸 ' +
      info.width +
      '×' +
      info.height +
      '，尚未做多分辨率适配。确认后按新导出规则适配并保存：根节点改为 100%，坐标按短边 720 换算，并放入安全区。';
    if (ok) ok.hidden = false;
    if (!dialog.open) dialog.showModal();
  }

  async function confirmLegacyAdaptation() {
    var dialog = document.getElementById('legacyAdaptDialog');
    if (dialog) dialog.close();
    var preview = window.UrhoxPreview;
    if (!preview || !preview.applyLegacyAdaptation || usesDesignResolution()) return;
    if (!preview.applyLegacyAdaptation()) return;
    setDirty(preview.currentPath, true);
    await saveCurrent();
  }
  function askConfirm(options) {
    return window.UrhoxDialogs.confirm(options);
  }
  function notify(message, level) {
    window.UrhoxDialogs.notify(message, level);
  }
  // External edits to the open document (e.g. an Agent rewrote it on disk). A clean document
  // reloads in place; unsaved edits are never overwritten, a bar offers the reload instead.
  var externalBar = null;
  function hideExternalChange() {
    if (externalBar) externalBar.hidden = true;
  }
  function showExternalChange(file, saveFailed) {
    if (!externalBar) {
      externalBar = document.createElement('div');
      externalBar.className = 'external-change';
      externalBar.setAttribute('role', 'status');
      var label = document.createElement('span');
      label.className = 'external-change-text';
      var reload = document.createElement('button');
      reload.type = 'button';
      reload.className = 'ghost';
      reload.textContent = '重新加载';
      reload.addEventListener('click', function () {
        var target = externalBar.file;
        if (!target || target.path !== currentFilePath()) {
          hideExternalChange();
          return;
        }
        if (!isDirty()) {
          void reloadFromDisk(target);
          return;
        }
        void askConfirm({
          title: '重新加载文档？',
          message: '会放弃你未保存的修改，载入文档的最新版本。',
          confirmLabel: '重新加载',
          danger: true,
        }).then(function (ok) {
          if (ok && target.path === currentFilePath()) void reloadFromDisk(target);
        });
      });
      // Keep my version: save over the file as it is on disk now, dropping the other edits.
      var overwrite = document.createElement('button');
      overwrite.type = 'button';
      overwrite.className = 'ghost danger';
      overwrite.textContent = '覆盖保存';
      overwrite.addEventListener('click', function () {
        var target = externalBar.file;
        if (!target || target.path !== currentFilePath()) {
          hideExternalChange();
          return;
        }
        void askConfirm({
          title: '覆盖保存？',
          message: '会用你的版本替换文档的最新版本，新版本中的修改会丢失。',
          confirmLabel: '覆盖保存',
          danger: true,
        }).then(function (ok) {
          if (ok && target.path === currentFilePath()) void overwriteDisk(target);
        });
      });
      externalBar.appendChild(label);
      externalBar.appendChild(reload);
      externalBar.appendChild(overwrite);
      (document.querySelector('header.chrome') || document.body).appendChild(externalBar);
    }
    externalBar.file = file;
    externalBar.querySelector('.external-change-text').textContent = saveFailed
      ? '文档有新版本，你的修改没有保存。'
      : '文档有新版本。';
    externalBar.hidden = false;
  }
  async function reloadFromDisk(file, text) {
    if (opening || saving) return false;
    setOpening(true, '正在重新加载文档…');
    // Same document: keep the user's pan and zoom across the reload (loading refits the view).
    var view = window.UrhoxView && window.UrhoxView.getView ? window.UrhoxView.getView() : null;
    try {
      await loadUiFile(file, null, { text: text });
      if (view)
        requestAnimationFrame(function () {
          window.UrhoxView.setView(view);
        });
      return true;
    } catch (err) {
      notify('无法重新加载「' + file.name + '」：' + (err.message || String(err)));
      return false;
    } finally {
      setOpening(false);
    }
  }
  async function overwriteDisk(file) {
    if (opening || saving) return false;
    var text;
    try {
      text = await window.UrhoxConfig.readText(file.path);
    } catch (err) {
      notify('无法读取磁盘上的「' + file.name + '」：' + (err.message || String(err)));
      return false;
    }
    if (file.path !== currentFilePath()) return false;
    // The disk version becomes the save baseline, so the save replaces exactly what is there now;
    // if it changes again before the write lands, the save conflicts and the bar returns.
    loadedText[file.path] = text;
    return saveCurrent();
  }
  async function syncFromDisk() {
    if (opening || saving || refreshing) return false;
    await loadProjectFiles(false);
    var path = currentFilePath();
    var file = project.files.find(function (entry) {
      return entry.path === path;
    });
    if (!file || !window.UrhoxPreview || !window.UrhoxPreview.tree) return false;
    var baseline = loadedText[path];
    var text;
    try {
      text = await window.UrhoxConfig.readText(path);
    } catch (_) {
      return false;
    }
    if (
      path !== currentFilePath() ||
      loadedText[path] !== baseline ||
      saving ||
      opening ||
      text === loadedText[path]
    )
      return false;
    if (isDirty()) {
      showExternalChange(file, false);
      return true;
    }
    return reloadFromDisk(file, text);
  }

  openProjectBtn.addEventListener('click', function () {
    loadProjectFiles(false);
  });

  viewListBtn.addEventListener('click', function () {
    viewMode = 'list';
    viewListBtn.classList.add('active');
    viewIconBtn.classList.remove('active');
    renderAll();
  });
  viewIconBtn.addEventListener('click', function () {
    viewMode = 'icon';
    viewIconBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    renderAll();
  });

  var missingUiOk = document.getElementById('missingUiOk');
  if (missingUiOk) {
    missingUiOk.addEventListener('click', function () {
      var dialog = document.getElementById('missingUiDialog');
      if (dialog) dialog.close();
    });
  }
  if (saveBtn)
    saveBtn.addEventListener('click', function () {
      saveCurrent();
    });
  saveDialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    if (pendingFile) pendingFile.resolve('cancel');
    hideSaveDialog();
  });
  document.getElementById('saveDialogCancel').addEventListener('click', function () {
    if (pendingFile) pendingFile.resolve('cancel');
    hideSaveDialog();
  });
  document.getElementById('saveDialogDiscard').addEventListener('click', function () {
    if (pendingFile) pendingFile.resolve('discard');
    hideSaveDialog();
  });
  document.getElementById('saveDialogSave').addEventListener('click', function () {
    if (pendingFile) pendingFile.resolve('save');
    hideSaveDialog();
  });
  document.getElementById('legacyAdaptCancel').addEventListener('click', function () {
    document.getElementById('legacyAdaptDialog').close();
  });
  document.getElementById('legacyAdaptOk').addEventListener('click', function () {
    void confirmLegacyAdaptation();
  });

  window.addEventListener('beforeunload', function (event) {
    if (!isDirty() && !saving) return;
    event.preventDefault();
    event.returnValue = '';
  });

  async function loadProjectFiles(initial) {
    if (opening || saving || refreshing) return;
    refreshing = true;
    openProjectBtn.disabled = true;
    openProjectBtn.textContent = '刷新中…';
    var status = document.getElementById('sessionStatus');
    if (status) status.textContent = '';
    try {
      var data = await window.UrhoxConfig.loadManifest();
      if (!data || typeof data !== 'object') throw new Error('项目文件清单格式无效');
      if (!Array.isArray(data.ui) || !Array.isArray(data.assets))
        throw new Error('项目文件清单格式无效');
      if (data.name) project.name = data.name;
      project.config =
        data.config && window.UrhoxProjectConfig
          ? window.UrhoxProjectConfig.normalize(data.config, data.config.source)
          : data.config || null;
      project.configError = project.config && project.config.error ? project.config.error : '';
      project.files = data.ui.filter(function (file) {
        return /\.ui\.json$/i.test(file.path);
      });
      assets = data.assets.map(function (asset) {
        if (asset.hasMeta == null) asset.hasMeta = true;
        return asset;
      });
      resourceIndexReady = true;
      writeReady = true;
      if (window.UrhoxPreview?.tree) {
        // Refresh the index only: keep the document, undo history and original save baseline.
        if (
          !project.files.some(function (file) {
            return file.path === currentFilePath();
          }) &&
          status
        )
          status.textContent = '当前文件已不在项目列表中，编辑内容仍保留；请检查磁盘文件。';
      } else if (project.files.length) {
        var requested = initial ? window.UrhoxConfig.INITIAL_UI : '';
        if (requested && requested.startsWith('assets/'))
          requested = window.UrhoxConfig.fileUrl(requested);
        var first = project.files.find(function (file) {
          return file.path === requested;
        });
        if (requested && !first)
          throw new Error('找不到指定的 UI 文档：' + window.UrhoxConfig.displayPath(requested));
        setOpening(true);
        try {
          var selected = first || project.files[0];
          var draft = selected && window.UrhoxConfig.draftFor ? await window.UrhoxConfig.draftFor(selected.path) : null;
          if (draft && typeof draft.text === 'string')
            await loadUiFile(selected, undefined, { text: draft.text, baselineText: draft.baselineText, draft: true });
          else await loadUiFile(selected);
        } finally {
          setOpening(false);
        }
      } else if (initial) showMissingUiGuide(project.name);
      updateDirtyUi();
    } catch (error) {
      if (status) status.textContent = '文件列表加载失败：' + (error.message || String(error));
    } finally {
      refreshing = false;
      openProjectBtn.disabled = opening || !!saving;
      openProjectBtn.textContent = '刷新文件';
    }
  }

  function findAsset(ref) {
    if (!ref) return null;
    return (
      assets.find(function (a) {
        return (
          a.kind === 'image' &&
          (a.ref === ref ||
            a.path === ref ||
            a.path.endsWith('/' + ref) ||
            a.path.endsWith('/assets/' + ref) ||
            'assets/' + ref === a.path)
        );
      }) || null
    );
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
    // Hosts with their own asset browser show the image there (UrhoxHost.revealImage).
    var host = window.UrhoxHost;
    if (host && typeof host.revealImage === 'function') {
      host.revealImage(found ? found.ref || ref : ref);
      return;
    }
    setBottomTab('project');
    entryQueries.project = '';
    if (!found) return;
    selectedAsset = found.path;
    // Match insertPath's tree keys, not the manifest's display-only directory.
    selectedDir = dirname(window.UrhoxConfig.displayPath(found.path))
      .split('/')
      .filter(Boolean)
      .join('/');
    collapsedDirs.__root__ = false;
    var parts = selectedDir.split('/');
    parts.forEach(function (_, index) {
      collapsedDirs[parts.slice(0, index + 1).join('/')] = false;
    });
    viewMode = 'icon';
    if (viewIconBtn) viewIconBtn.classList.add('active');
    if (viewListBtn) viewListBtn.classList.remove('active');
    renderAll();
    requestAnimationFrame(function () {
      if (bottomTab !== 'project' || selectedAsset !== found.path) return;
      function scrollToPath(container, path) {
        if (!container) return;
        var el = Array.from(container.querySelectorAll('[data-path]')).find(function (row) {
          return row.dataset.path === path;
        });
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      scrollToPath(projectDirsEl, selectedDir);
      scrollToPath(projectFilesEl, found.path);
    });
  }

  // Hosts with their own asset browser (UrhoxHost.pickImage) pick the image there; the editor
  // keeps the target and applies the returned ref. Without one, the bottom project list is used.
  function hostPicker() {
    var host = window.UrhoxHost;
    return host && typeof host.pickImage === 'function' ? host : null;
  }
  function beginReplaceImage(node, key, onChange) {
    if (!node) return;
    replaceTarget = {
      node: node,
      key: key,
      onChange: onChange,
      tree: window.UrhoxPreview.tree,
      project: project,
    };
    if (!validateImageTarget()) return;
    var host = hostPicker();
    if (host) {
      var target = replaceTarget;
      updateReplaceUi();
      Promise.resolve(host.pickImage({ label: node.id || node.type })).then(
        function (ref) {
          if (replaceTarget !== target) return;
          if (ref) assignImageByRef(String(ref));
          else cancelReplaceImage();
        },
        function () {
          if (replaceTarget === target) cancelReplaceImage();
        }
      );
      return;
    }
    setBottomTab('project');
    viewMode = 'icon';
    if (viewIconBtn) viewIconBtn.classList.add('active');
    if (viewListBtn) viewListBtn.classList.remove('active');
    if (!assets.length) {
      notify(
        '当前项目里还没有图片。请把 png/jpg 放到当前项目的 assets 目录后点击「刷新文件」。只能使用项目内的图片。',
        'warning'
      );
      cancelReplaceImage();
      return;
    }
    renderAll();
    var bar = document.querySelector('.project-bar');
    if (bar && bar.scrollIntoView) bar.scrollIntoView({ block: 'nearest' });
  }
  function assignImageByRef(ref) {
    if (!ref) return false;
    function lookup() {
      return assets.find(function (a) {
        return (
          a.kind === 'image' && (a.ref === ref || a.path === ref || a.path.endsWith('/' + ref))
        );
      });
    }
    var found = lookup();
    if (found) return applyReplace(found);
    if (window.UrhoxHost && replaceTarget) {
      // The host's asset browser can upload images after the last file listing; refresh once.
      var target = replaceTarget;
      loadProjectFiles(false).then(function () {
        if (replaceTarget !== target) return;
        var fresh = lookup();
        if (fresh) applyReplace(fresh);
        else {
          cancelReplaceImage();
          notify('只能使用项目内的图片。', 'warning');
        }
      });
      return true;
    }
    notify('只能使用项目内的图片。', 'warning');
    return false;
  }
  // Direct assignment (drop, context menu): same checks and undo step as picking, no picker.
  function assignImageTo(node, key, onChange, ref) {
    if (!node || !ref) return false;
    replaceTarget = {
      node: node,
      key: key,
      onChange: onChange,
      tree: window.UrhoxPreview.tree,
      project: project,
    };
    if (!validateImageTarget()) return false;
    if (assignImageByRef(ref)) return true;
    cancelReplaceImage();
    return false;
  }
  // Image ref carried by a drag: the editor's own "urhox-image:" text, or whatever the host's
  // asset browser puts on the drag (UrhoxHost.imageRefFromDrop).
  function dropImageRef(dataTransfer) {
    if (!dataTransfer) return '';
    var raw = dataTransfer.getData('text/plain');
    if (raw && raw.indexOf('urhox-image:') === 0) return raw.slice('urhox-image:'.length);
    var host = window.UrhoxHost;
    if (host && typeof host.imageRefFromDrop === 'function') {
      try {
        return String(host.imageRefFromDrop(dataTransfer) || '');
      } catch (error) {
        return '';
      }
    }
    return '';
  }

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setBottomTab(btn.getAttribute('data-tab'));
    });
  });
  var cancelReplaceBtn = document.getElementById('cancelReplaceBtn');
  if (cancelReplaceBtn) cancelReplaceBtn.addEventListener('click', cancelReplaceImage);

  setBottomTab('ui');
  loadProjectFiles(true);

  window.UrhoxProject = {
    render: renderAll,
    get: function () {
      return project;
    },
    // Detached snapshots: hosts cannot mutate editor state through the document picker.
    listDocuments: function () {
      return project.files.map(function (file) {
        return {
          path: file.path,
          displayPath: window.UrhoxConfig.displayPath(file.path),
          name: file.name,
          dirty: isDirty(file.path),
          active: currentFilePath() === file.path,
        };
      });
    },
    setDirty: setDirty,
    isDirty: isDirty,
    saveCurrent: saveCurrent,
    isOpening: function () {
      return opening;
    },
    isBusy: function () {
      return opening || refreshing || !!saving;
    },
    isResourceIndexReady: function () {
      return resourceIndexReady;
    },
    revealAsset: revealAsset,
    resourceExists: function (ref) {
      return assets.concat(project.files).some(function (entry) {
        return entry.ref === ref || entry.path === ref || entry.path.endsWith('/' + ref);
      });
    },
    beginReplaceImage: beginReplaceImage,
    cancelReplaceImage: cancelReplaceImage,
    validateImageTarget: validateImageTarget,
    assignImageByRef: assignImageByRef,
    assignImageTo: assignImageTo,
    dropImageRef: dropImageRef,
    refreshFiles: function () {
      return loadProjectFiles(false);
    },
    syncFromDisk: syncFromDisk,
    findAsset: findAsset,
    bindAssetThumb: bindAssetThumb,
    openUiPath: openUiPath,
  };

  renderAll();
})();
