(function (root) {
  "use strict";
  var T = root.UrhoxUiTools;
  function el(id) { return document.getElementById(id); }
  function text(tag, value, cls) {
    var node = document.createElement(tag);
    node.textContent = value;
    if (cls) node.className = cls;
    return node;
  }
  function bind(id, event, fn) { var node = el(id); if (node) node.addEventListener(event, fn); }
  function close(id) {
    el(id).close();
  }
  document.querySelectorAll("[data-close]").forEach(function (button) {
    button.addEventListener("click", function () { close(button.dataset.close); });
  });
  ["changesDialog", "deviceDialog"].forEach(function (id) {
    bind(id, "cancel", function (event) { event.preventDefault(); close(id); });
  });
  function showChanges(before, after, path) {
    var changes = T.diff(before, after), list = el("changesList");
    list.replaceChildren();
    el("changesPath").textContent = root.UrhoxConfig.displayPath(path);
    changes.forEach(function (change) {
      var row = text("div", "", "change-row");
      row.appendChild(text("code", change.path));
      row.appendChild(text("pre", change.before === undefined ? "—" : JSON.stringify(change.before, null, 2), "change-before"));
      row.appendChild(text("pre", change.after === undefined ? "—" : JSON.stringify(change.after, null, 2), "change-after"));
      list.appendChild(row);
    });
    if (!changes.length) list.appendChild(text("p", "没有待保存的变更", "muted"));
    el("changesSummary").textContent = changes.length + " 处变更";
    el("changesDialog").showModal();
  }
  bind("changesBtn", "click", function () {
    var api = root.UrhoxPreview;
    if (api && api.tree) showChanges(api.getCleanJSON(), api.getJSON(), api.currentPath);
  });
  function overlaps(nodes, x, y) {
    var menu = el("overlapMenu"), tree = root.UrhoxPreview.tree;
    menu.replaceChildren();
    var closeButton = text("button", "×", "ghost"); closeButton.setAttribute("aria-label", "关闭重叠节点");
    closeButton.addEventListener("click", function () { menu.classList.add("hidden"); });
    menu.appendChild(closeButton);
    if (!nodes.length) menu.appendChild(text("p", "该位置没有可选节点", "muted"));
    nodes.forEach(function (node) {
      var button = text("button", (node.id || node.type) + " · " + node.type, "search-hit");
      button.type = "button";
      button.addEventListener("click", function () {
        if (root.UrhoxPreview.tree === tree) root.UrhoxPreview.selectNode(node, true);
        menu.classList.add("hidden");
      });
      menu.appendChild(button);
    });
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - 300)) + "px";
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - 260)) + "px";
    menu.classList.remove("hidden");
    closeButton.focus();
  }
  bind("overlapBtn", "click", function (event) {
    var b = event.currentTarget.getBoundingClientRect();
    overlaps(root.UrhoxPreview.pickOverlaps(), b.left, b.bottom);
  });
  document.addEventListener("pointerdown", function (event) {
    var menu = el("overlapMenu");
    if (menu && !menu.contains(event.target) && event.target !== el("overlapBtn")) menu.classList.add("hidden");
  });
  document.addEventListener("keydown", function (event) {
    var menu = el("overlapMenu");
    if (event.key === "Escape" && menu && !menu.classList.contains("hidden")) {
      menu.classList.add("hidden"); event.stopPropagation(); event.preventDefault();
    }
  }, true);
  bind("selectionRotation", "change", function () {
    var api = root.UrhoxPreview, value = Number(this.value);
    if (!Number.isFinite(value)) return;
    api.transformSelection(1, api.getSelection().length === 1 ? value - (Number(root.UrhoxGeom.transformValue(api.selected, "rotate")) || 0) : value);
  });
  bind("selectionScale", "change", function () {
    var value = Number(this.value), api = root.UrhoxPreview;
    var scale = api.getSelection().length === 1 ? root.UrhoxGeom.transformValue(api.selected, "scale") : 1;
    if (scale == null) scale = 1;
    if (value >= 1 && value <= 1000 && scale > 0) api.transformSelection(value / 100 / scale, 0);
  });
  function openDeviceSettings() {
    var device = root.UrhoxPreview.getDevice();
    el("deviceError").textContent = device.prefab ? "组件使用自身尺寸；请打开页面文档调整设备预览。" : "";
    el("deviceWidth").value = device.width; el("deviceHeight").value = device.height;
    el("safeAreaEnabled").checked = !!device.safeArea;
    ["Top", "Right", "Bottom", "Left"].forEach(function (side) {
      el("safe" + side).value = device.safeArea ? device.safeArea[side.toLowerCase()] : 0;
    });
    el("deviceDialog").showModal();
  }
  bind("deviceSwap", "click", function () {
    var w = el("deviceWidth").value; el("deviceWidth").value = el("deviceHeight").value; el("deviceHeight").value = w;
    var top = el("safeTop").value, right = el("safeRight").value, bottom = el("safeBottom").value, left = el("safeLeft").value;
    el("safeTop").value = left; el("safeRight").value = top; el("safeBottom").value = right; el("safeLeft").value = bottom;
  });
  bind("deviceForm", "submit", function (event) {
    event.preventDefault();
    var width = Number(el("deviceWidth").value), height = Number(el("deviceHeight").value), area = {};
    ["Top", "Right", "Bottom", "Left"].forEach(function (side) { area[side.toLowerCase()] = Number(el("safe" + side).value); });
    if (el("safeAreaEnabled").checked && (Object.values(area).some(function (v) { return !Number.isFinite(v) || v < 0; }) ||
        area.left + area.right >= width || area.top + area.bottom >= height)) {
      el("deviceError").textContent = "安全区边距必须小于预览尺寸"; return;
    }
    if (root.UrhoxPreview.configureDevice(width, height, el("safeAreaEnabled").checked ? area : null)) close("deviceDialog");
    else el("deviceError").textContent = "请打开页面文档，尺寸范围为 240–4096";
  });
  root.UrhoxWorkbench = {
    openDeviceSettings: openDeviceSettings, overlaps: overlaps,
  };
})(window);
