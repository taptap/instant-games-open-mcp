(function (root) {
  "use strict";
  var menu = document.getElementById("contextMenu"), anchor = null, returnFocus = null;
  function hide(restore) {
    menu.classList.add("hidden");
    if (restore && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function open(items, x, y) {
    var api = root.UrhoxPreview, tree = api.tree;
    returnFocus = document.activeElement;
    anchor = { x: x, y: y };
    document.getElementById("overlapMenu").classList.add("hidden");
    function render(entries, parent) {
      menu.replaceChildren();
      if (parent) entries = [{ label: "返回", run: parent }].concat(entries);
      entries.forEach(function (item) {
        if (!item) {
          var line = document.createElement("div"); line.className = "menu-separator";
          line.setAttribute("role", "separator"); menu.appendChild(line); return;
        }
        var button = document.createElement("button");
        button.type = "button"; button.setAttribute("role", "menuitem");
        button.setAttribute("aria-label", item.label);
        button.textContent = item.label; button.disabled = item.enabled === false;
        if (item.danger) button.className = "danger";
        if (item.children) {
          button.setAttribute("aria-haspopup", "menu");
          button.classList.add("has-submenu");
        }
        button.addEventListener("click", function () {
          if (root.UrhoxProject.isOpening() || api.tree !== tree) { hide(); return; }
          if (item.children) {
            render(item.children, function () { render(entries, parent); }); return;
          }
          if (item.label !== "返回") hide(true);
          Promise.resolve().then(item.run).catch(function (error) {
            document.getElementById("sessionStatus").textContent = "操作失败：" + (error.message || error);
          });
        });
        menu.appendChild(button);
      });
      menu.classList.remove("hidden");
      var box = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(anchor.x, window.innerWidth - box.width - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(anchor.y, window.innerHeight - box.height - 8)) + "px";
      var first = menu.querySelector("button:not(:disabled)");
      if (first) first.focus();
    }
    render(items);
  }
  function nodes(hits, x, y, canvas) {
    var api = root.UrhoxPreview, selected = api.getSelection(), target = hits[0];
    if (canvas && target === api.tree) target = null;
    if (!target) api.deselect();
    else if (selected.indexOf(target) < 0) api.selectNode(target, true);
    var state = api.contextState(), node = api.selected;
    function action(label, command, enabled, arg) {
      return { label: label, enabled: enabled, run: function () { api[command](arg); } };
    }
    var items = [];
    if (hits.length > 1) {
      items.push({ label: "选择重叠节点", children: hits.map(function (hit) {
        return { label: (hit.id || hit.type) + " · " + (hit.type || "组件"), run: function () { api.selectNode(hit, true); } };
      }) }, null);
    }
    items.push({ label: "添加节点", enabled: state.add, children: [
      action("容器 Panel", "addNode", true, "Panel"), action("图片 Image", "addNode", true, "Image"),
      action("按钮 Button", "addNode", true, "Button"), action("文字 Label", "addNode", true, "Label"),
    ] });
    if (target) items.push(action("复制", "copy", state.copy), action("创建副本", "duplicate", state.duplicate));
    items.push(action(target ? "粘贴为子节点" : "粘贴", "paste", state.paste));
    if (target) {
      items.push(action("重命名", "rename", state.rename), null);
      if (api.getSelection().length === 1) {
        items.push(action(node.visible === false ? "显示" : "隐藏", "toggleVisible", state.visibility),
          action(node.locked ? "解锁" : "锁定", "toggleLocked", state.lock));
      }
      items.push(action("编组", "group", state.group), action("解组", "ungroup", state.ungroup));
      if (api.getSelection().length > 1) items.push({
        label: "对齐与分布", enabled: state.align, children: [
          action("左对齐", "align", state.align, "left"), action("水平居中", "align", state.align, "hcenter"),
          action("右对齐", "align", state.align, "right"), action("顶对齐", "align", state.align, "top"),
          action("垂直居中", "align", state.align, "vcenter"), action("底对齐", "align", state.align, "bottom"), null,
          action("水平均分", "distribute", state.distribute, "x"), action("垂直均分", "distribute", state.distribute, "y"),
        ],
      });
      var remove = action("删除", "confirmDelete", state.remove); remove.danger = true;
      items.push(null, remove);
    } else items.push({ label: "适应画布", run: function () { root.UrhoxView.fit(); } });
    open(items, x, y);
  }
  document.addEventListener("pointerdown", function (event) {
    if (!menu.contains(event.target)) hide();
  });
  menu.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  document.addEventListener("keydown", function (event) {
    if (menu.classList.contains("hidden")) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); hide(true); return;
    }
    if (event.key === "Tab") { hide(); return; }
    var buttons = Array.from(menu.querySelectorAll("button:not(:disabled)"));
    var at = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation();
      var next = buttons[(at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
      if (next) next.focus();
    } else if (event.key === "ArrowRight" && document.activeElement.hasAttribute("aria-haspopup")) {
      event.preventDefault(); event.stopPropagation(); document.activeElement.click();
    } else if (event.key === "ArrowLeft" && buttons[0] && buttons[0].textContent === "返回") {
      event.preventDefault(); event.stopPropagation(); buttons[0].click();
    } else if (event.key !== "Enter" && event.key !== " ") {
      event.stopPropagation();
    }
  }, true);
  window.addEventListener("resize", function () { hide(); });
  root.UrhoxContextMenu = { open: open, nodes: nodes };
})(window);
