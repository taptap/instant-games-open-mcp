// hotkeys.js
// 用途：Figma 风格快捷键。Mac 用 Command，Windows 用 Ctrl。
(function () {
  "use strict";

  function isTyping(el) {
    if (!el) return false;
    var tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  function mod(event) {
    return event.metaKey || event.ctrlKey;
  }

  var helpButton = document.getElementById("shortcutsBtn");
  var help = document.createElement("dialog");
  help.id = "editorShortcuts";
  help.className = "editor-shortcuts";
  help.setAttribute("aria-labelledby", "editorShortcutsTitle");
  var modLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  var groups = [
    ["视图操作", [["按住空格 + 拖动", "临时平移视图"], ["中键拖动", "平移视图"], ["Shift + 1 / Shift + 2", "适配画板 / 所选"], ["Shift + 0", "原始比例"], ["Mod + + / Mod + -", "放大 / 缩小"], ["Esc", "取消选择或替换图片"]]],
    ["选择与排版", [["Shift / Mod + 点击", "追加选择，拖动则一起移动"], ["Shift / Mod + 框选", "追加框选"], ["Mod + A", "全选"], ["Mod + G / Mod + Shift + G", "分组 / 取消分组"], ["方向键 / Shift + 方向键", "移动 1 / 10 像素"], ["Enter / Shift + Enter", "选择子节点 / 父节点"], ["[ / ]", "下移 / 上移一层"], ["Alt + [ / Alt + ]", "置底 / 置顶"], ["Shift + 拖动", "约束水平或垂直移动"], ["Shift / Alt + 缩放", "等比 / 从中心缩放"], ["Shift + 旋转", "15° 步进旋转"]]],
    ["编辑与保存", [["Mod + C / X / V", "复制 / 剪切 / 粘贴"], ["Mod + D / Alt + 拖动", "复制所选"], ["F2", "重命名"], ["Mod + Shift + H / L", "切换显隐 / 锁定"], ["Delete / Backspace", "删除所选"], ["Mod + Z", "撤销"], ["Mod + Shift + Z / Mod + Y", "重做"], ["Mod + S", "保存"]]],
  ];
  help.innerHTML = '<div class="shortcut-heading"><h2 id="editorShortcutsTitle">UI 编辑器快捷键</h2><button type="button" aria-label="关闭快捷键" autofocus>×</button></div>' +
    groups.map(function (group) { return '<section><h3>' + group[0] + '</h3>' + group[1].map(function (row) {
      return '<div class="shortcut-row"><span>' + row[1] + '</span><kbd>' + row[0].replace(/Mod/g, modLabel) + '</kbd></div>';
    }).join('') + '</section>'; }).join('') +
    '<p>输入文字时不触发编辑快捷键。节点树获得焦点时，空格、回车和方向键用于树导航。</p>';
  document.body.appendChild(help);
  function positionHelp() {
    if (!help.open) return;
    var anchor = helpButton.getBoundingClientRect();
    help.style.left = Math.max(8, Math.min(anchor.right - help.offsetWidth, window.innerWidth - help.offsetWidth - 8)) + "px";
    help.style.top = Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - help.offsetHeight - 8)) + "px";
  }
  helpButton.addEventListener("click", function () {
    if (help.open) help.close();
    else { help.showModal(); help.scrollTop = 0; helpButton.setAttribute("aria-expanded", "true"); positionHelp(); }
  });
  help.querySelector("button").addEventListener("click", function () { help.close(); });
  function outsideHelp(event) {
    var rect = help.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  // Close on click, not pointerdown: the closing gesture must not reach the editor underneath.
  help.addEventListener("pointerdown", function (event) {
    if (event.target === help && outsideHelp(event)) { event.preventDefault(); event.stopPropagation(); }
  });
  help.addEventListener("click", function (event) {
    if (event.target === help && outsideHelp(event)) { event.preventDefault(); event.stopPropagation(); help.close(); }
  });
  help.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); help.close(); }
  });
  help.addEventListener("close", function () { helpButton.setAttribute("aria-expanded", "false"); });
  window.addEventListener("resize", positionHelp);

  window.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || event.isComposing) return;
    var save = mod(event) && event.key.toLowerCase() === "s";
    // Suppress browser Save Page even when the editor is busy or modal.
    if (save) event.preventDefault();
    if (document.querySelector("dialog[open]")) return;
    if (window.UrhoxProject && window.UrhoxProject.isOpening && window.UrhoxProject.isOpening()) return;
    if (event.key === "Escape" && !isTyping(event.target) && window.UrhoxProject &&
        window.UrhoxProject.cancelReplaceImage && window.UrhoxProject.cancelReplaceImage()) {
      event.preventDefault();
      return;
    }
    if (save) {
      if (window.UrhoxProject) window.UrhoxProject.saveCurrent();
      return;
    }
    if (isTyping(event.target)) return;
    var api = window.UrhoxPreview;
    var view = window.UrhoxView;
    if (!api) return;

    var key = event.key;
    var shift = event.shiftKey;

    if (mod(event) && key.toLowerCase() === "z") {
      event.preventDefault();
      if (shift) api.redo();
      else api.undo();
      return;
    }
    if (mod(event) && key.toLowerCase() === "y") {
      event.preventDefault();
      api.redo();
      return;
    }
    if (mod(event) && key.toLowerCase() === "c") {
      event.preventDefault();
      api.copy();
      return;
    }
    if (mod(event) && key.toLowerCase() === "x") {
      event.preventDefault();
      api.cut();
      return;
    }
    if (mod(event) && key.toLowerCase() === "v") {
      event.preventDefault();
      api.paste();
      return;
    }
    if (mod(event) && key.toLowerCase() === "d") {
      event.preventDefault();
      api.duplicate();
      return;
    }
    if (mod(event) && key.toLowerCase() === "a") {
      event.preventDefault();
      if (api.selectAll) api.selectAll();
      return;
    }
    if (mod(event) && shift && key.toLowerCase() === "h") {
      event.preventDefault();
      api.toggleVisible();
      return;
    }
    if (mod(event) && shift && key.toLowerCase() === "l") {
      event.preventDefault();
      api.toggleLocked();
      return;
    }
    if (key === "F2" && !mod(event) && !event.altKey) {
      event.preventDefault();
      api.rename();
      return;
    }
    if (mod(event) && key.toLowerCase() === "g") {
      event.preventDefault();
      if (shift) api.ungroup && api.ungroup();
      else api.group && api.group();
      return;
    }
    if (key === "]") {
      event.preventDefault();
      api.moveLayer && api.moveLayer(1, event.altKey);
      return;
    }
    if (key === "[") {
      event.preventDefault();
      api.moveLayer && api.moveLayer(-1, event.altKey);
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      if (api.confirmDelete) api.confirmDelete();
      else api.remove();
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      api.deselect();
      return;
    }
    if (key === "Enter" && shift) {
      event.preventDefault();
      api.selectParent && api.selectParent();
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      api.selectChild && api.selectChild();
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      var step = shift ? 10 : 1;
      var dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
      var dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
      api.nudge(dx, dy);
      return;
    }
    if (shift && !mod(event) && !event.altKey && (event.code === "Digit1" || key === "1") && view) {
      event.preventDefault();
      view.fit();
      return;
    }
    if (shift && !mod(event) && !event.altKey && (event.code === "Digit0" || key === "0") && view) {
      event.preventDefault();
      view.setZoom(1);
      return;
    }
    if (shift && !mod(event) && !event.altKey && (event.code === "Digit2" || key === "2") && view) {
      event.preventDefault();
      view.fitSelected && view.fitSelected();
      return;
    }
    if (mod(event) && (key === "=" || key === "+") && view) {
      event.preventDefault();
      view.zoomBy(1.1);
      return;
    }
    if (mod(event) && key === "-" && view) {
      event.preventDefault();
      view.zoomBy(1 / 1.1);
      return;
    }
  });
})();
