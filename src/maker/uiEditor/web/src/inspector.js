// inspector.js
// 用途：对照 Unity UGUI。顶部只放身份和常改项，其余分组默认折叠。
(function (root) {
  "use strict";

  function hasVal(node, key) {
    return node[key] != null && node[key] !== "" && node[key] !== false;
  }

  function isImageNode(node) {
    if (!node) return false;
    if (node.role === "Image" || node._isImage) return true;
    if (Object.prototype.hasOwnProperty.call(node, "backgroundImage")) return true;
    return node.backgroundFit === "sliced";
  }

  function isTextNode(node) {
    return node.type === "Label" || node.type === "Button" || node.text != null;
  }

  // open: 默认展开。常改项展开，其余折叠。
  var GROUPS = [
    {
      id: "identity",
      title: "基本",
      open: true,
      rows: [
        [{ key: "type", label: "组件", kind: "readonly" }, { key: "id", label: "名称", kind: "text" }],
        [{ key: "visible", label: "启用", kind: "bool", fallback: true }, { key: "locked", label: "锁定", kind: "bool" }],
      ],
    },
    {
      id: "image",
      title: "图片",
      open: true,
      showIf: isImageNode,
      rows: [
        [{ key: "backgroundImage", label: "Source Image", kind: "asset" }],
        [{ key: "backgroundFit", label: "Image Type", kind: "enum", options: [
          { value: "fill", label: "拉伸 Fill" },
          { value: "contain", label: "适应 Contain" },
          { value: "cover", label: "裁切 Cover" },
          { value: "sliced", label: "九宫格 Sliced" },
        ] }, { key: "backgroundColor", label: "Color", kind: "color" }],
        [{ key: "slice", label: "Border", kind: "slice" }],
      ],
    },
    {
      id: "text",
      title: "文本",
      open: true,
      showIf: isTextNode,
      rows: [
        [{ key: "text", label: "Text", kind: "text" }],
        [{ key: "fontSize", label: "字号", kind: "number" }, { key: "fontColor", label: "颜色", kind: "color" }],
        [{ key: "fontWeight", label: "粗细", kind: "enum", options: [
          { value: "normal", label: "常规" },
          { value: "bold", label: "加粗" },
        ] }],
        [{ key: "textAlign", label: "水平对齐", kind: "enum", options: [
          { value: "left", label: "左" },
          { value: "center", label: "中" },
          { value: "right", label: "右" },
        ] }, { key: "verticalAlign", label: "垂直对齐", kind: "enum", options: [
          { value: "top", label: "上" },
          { value: "middle", label: "中" },
          { value: "bottom", label: "下" },
        ] }],
      ],
    },
    {
      id: "rect",
      title: "Rect Transform",
      open: true,
      rows: [
        [{ key: "position", label: "定位", kind: "enum", options: ["relative", "absolute"] }],
        [{ key: "left", label: "相对父级 X", kind: "length" }, { key: "top", label: "相对父级 Y", kind: "length" }],
        [{ key: "width", label: "Width", kind: "length" }, { key: "height", label: "Height", kind: "length" }],
      ],
    },
    {
      id: "appearance",
      title: "外观",
      open: false,
      showIf: function (node) {
        return !isImageNode(node) || hasVal(node, "borderRadius") || hasVal(node, "opacity") || hasVal(node, "backgroundColor");
      },
      rows: [
        [{ key: "backgroundColor", label: "Color", kind: "color" }, { key: "opacity", label: "透明度", kind: "number" }],
        [{ key: "borderRadius", label: "圆角", kind: "number" }, { key: "borderWidth", label: "描边", kind: "number" }],
        [{ key: "borderColor", label: "边色", kind: "color" }],
      ],
    },
    {
      id: "flex",
      title: "布局 (Flex)",
      open: false,
      showIf: function (node) {
        return (node.children && node.children.length) || hasVal(node, "flexDirection") || hasVal(node, "gap");
      },
      rows: [
        [{ key: "flexDirection", label: "方向", kind: "enum", options: ["column", "row"] }, { key: "gap", label: "Gap", kind: "length" }],
      ],
    },
    {
      id: "button",
      title: "按钮",
      open: true,
      showIf: function (node) { return node.type === "Button"; },
      rows: [
        [{ key: "disabled", label: "禁用", kind: "bool" }],
        [{ key: "hoverOpacity", label: "鼠标悬停透明度", kind: "slider", min: 0, max: 1, step: 0.05 }],
        [{ key: "pressedOpacity", label: "按下透明度", kind: "slider", min: 0, max: 1, step: 0.05 }],
      ],
    },
    {
      id: "advanced",
      title: "更多",
      open: false,
      rows: [
        [{ key: "zIndex", label: "Z", kind: "number" }, { key: "pointerEvents", label: "Raycast", kind: "enum", options: ["auto", "none", "box-none", "box-only"] }],
        [{ key: "right", label: "Right", kind: "length" }, { key: "bottom", label: "Bottom", kind: "length" }],
        [{ key: "overflow", label: "Overflow", kind: "enum", options: ["visible", "hidden"] }],
        [{ key: "borderColor", label: "边色", kind: "color" }],
        [{ key: "locked", label: "锁定", kind: "bool" }],
      ],
    },
  ];

  var openState = {};

  function formatValue(value) {
    if (value === undefined || value === null) return "";
    if (value === false) return "false";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function parseLength(raw) {
    if (raw === "" || raw == null) return undefined;
    if (raw === "auto" || raw === "false") return raw === "false" ? false : "auto";
    if (/%$/.test(raw)) return raw;
    var n = Number(raw);
    return isNaN(n) ? raw : n;
  }

  function parseColor(raw) {
    if (raw === "" || raw == null) return undefined;
    if (raw === "false") return false;
    return raw;
  }

  function parseBool(raw, fallback) {
    if (raw === "" || raw == null) return fallback;
    return raw === true || raw === "true";
  }

  function parseNumber(raw) {
    if (raw === "" || raw == null) return undefined;
    var n = Number(raw);
    return isNaN(n) ? undefined : n;
  }

  function applyField(node, field, raw) {
    var value;
    if (field.kind === "readonly") return;
    if (field.kind === "bool") value = parseBool(raw, field.fallback);
    else if (field.kind === "number") value = parseNumber(raw);
    else if (field.kind === "length") value = parseLength(raw);
    else if (field.kind === "color") value = parseColor(raw);
    else if (raw === "") value = undefined;
    else value = raw;
    if (value === undefined) delete node[field.key];
    else node[field.key] = value;
  }

  function emitChange(onChange, extra) {
    extra = extra || {};
    if (typeof onChange === "function") onChange(extra);
  }

  function bindControl(control, node, field, onChange) {
    if (control.tagName === "INPUT" && control.type === "text") {
      var old = node[field.key];
      control.addEventListener("focus", function () {
        old = node[field.key];
        emitChange(onChange, { phase: "start" });
      });
      control.addEventListener("input", function () {
        applyField(node, field, control.value);
        emitChange(onChange, { live: true });
      });
      control.addEventListener("change", function () {
        applyField(node, field, control.value);
        emitChange(onChange, { phase: "end" });
      });
      control.addEventListener("blur", function () {
        emitChange(onChange, { phase: "end", live: true });
      });
      control.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          node[field.key] = old;
          control.value = formatValue(old);
          emitChange(onChange, { live: true });
        }
      });
      return;
    }
    control.addEventListener("change", function () {
      emitChange(onChange, { phase: "start" });
      var raw = control.type === "checkbox" ? control.checked : control.value;
      applyField(node, field, raw);
      if (field.key === "backgroundFit" && raw === "sliced" && !node.backgroundSlice) {
        node.backgroundSlice = [40, 40, 40, 40];
      }
      emitChange(onChange, { phase: "end" });
    });
  }

  function makeControl(node, field, onChange) {
    var value = node[field.key];
    var control;
    if (field.kind === "readonly") {
      control = document.createElement("input");
      control.disabled = true;
      control.value = formatValue(value);
    } else if (field.kind === "bool") {
      control = document.createElement("input");
      control.type = "checkbox";
      control.checked = value == null ? field.fallback === true : value === true;
    } else if (field.kind === "enum") {
      control = document.createElement("select");
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "—";
      control.appendChild(empty);
      field.options.forEach(function (opt) {
        var option = document.createElement("option");
        if (typeof opt === "object") {
          option.value = opt.value;
          option.textContent = opt.label;
        } else {
          option.value = opt;
          option.textContent = opt;
        }
        control.appendChild(option);
      });
      control.value = value == null ? "" : String(value);
    } else if (field.kind === "color") {
      return makeColorControl(node, field, onChange);
    } else if (field.kind === "slider") {
      return makeSliderControl(node, field, onChange);
    } else {
      control = document.createElement("input");
      control.type = "text";
      control.value = formatValue(value);
      control.placeholder = field.kind === "length" ? "auto" : "";
    }
    bindControl(control, node, field, onChange);
    return control;
  }

  function hex6(value) {
    if (typeof value !== "string") return "#ffffff";
    var hex = value.replace("#", "");
    if (hex.length === 8) hex = hex.slice(0, 6);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return "#ffffff";
    return "#" + hex;
  }

  function makeSliderControl(node, field, onChange) {
    var wrap = document.createElement("div");
    wrap.className = "slider-field";
    var slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(field.min == null ? 0 : field.min);
    slider.max = String(field.max == null ? 1 : field.max);
    slider.step = String(field.step == null ? 0.05 : field.step);
    var value = node[field.key];
    if (value == null) value = field.max == null ? 1 : field.max;
    slider.value = String(value);
    var num = document.createElement("span");
    num.className = "slider-value";
    num.textContent = Number(slider.value).toFixed(2);
    var editing = false;
    function start() {
      if (editing) return;
      editing = true;
      emitChange(onChange, { phase: "start" });
    }
    slider.addEventListener("pointerdown", start);
    slider.addEventListener("input", function () {
      start();
      node[field.key] = Number(slider.value);
      num.textContent = node[field.key].toFixed(2);
      emitChange(onChange, { live: true });
    });
    slider.addEventListener("change", function () {
      node[field.key] = Number(slider.value);
      num.textContent = node[field.key].toFixed(2);
      emitChange(onChange, { phase: "end" });
      editing = false;
    });
    slider.addEventListener("blur", function () {
      if (editing) emitChange(onChange, { phase: "end", live: true });
      editing = false;
    });
    wrap.appendChild(slider);
    wrap.appendChild(num);
    return wrap;
  }

  function makeColorControl(node, field, onChange) {
    var wrap = document.createElement("div");
    wrap.className = "color-field";
    var picker = document.createElement("input");
    picker.type = "color";
    picker.value = hex6(node[field.key]);
    var text = document.createElement("input");
    text.type = "text";
    text.value = formatValue(node[field.key]);
    var editing = false;
    function start() {
      if (editing) return;
      editing = true;
      emitChange(onChange, { phase: "start" });
    }
    picker.addEventListener("pointerdown", start);
    picker.addEventListener("input", function () {
      start();
      var hex = picker.value.toUpperCase();
      var prev = typeof node[field.key] === "string" ? node[field.key] : "";
      var alpha = prev.length === 9 ? prev.slice(7) : "";
      node[field.key] = hex + alpha;
      text.value = node[field.key];
      emitChange(onChange, { live: true });
    });
    picker.addEventListener("change", function () {
      emitChange(onChange, { phase: "end" });
      editing = false;
    });
    picker.addEventListener("blur", function () {
      if (editing) emitChange(onChange, { phase: "end", live: true });
      editing = false;
    });
    text.addEventListener("change", function () {
      emitChange(onChange, { phase: "start" });
      applyField(node, field, text.value);
      picker.value = hex6(node[field.key]);
      emitChange(onChange, { phase: "end" });
    });
    wrap.appendChild(picker);
    wrap.appendChild(text);
    return wrap;
  }

  function fieldCell(node, field, onChange) {
    if (field.kind === "slice") return renderSliceField(node, onChange);
    if (field.kind === "asset") return renderAssetField(node, field, onChange);
    var wrap = document.createElement("label");
    wrap.className = "insp-cell";
    var name = document.createElement("span");
    name.className = "insp-key";
    name.textContent = field.label;
    wrap.appendChild(name);
    wrap.appendChild(makeControl(node, field, onChange));
    return wrap;
  }

  function renderRow(node, fields, onChange) {
    var row = document.createElement("div");
    row.className = "insp-line cols-" + fields.length;
    fields.forEach(function (field) {
      row.appendChild(fieldCell(node, field, onChange));
    });
    return row;
  }

  function sliceArray(node) {
    var s = node.backgroundSlice;
    if (Array.isArray(s) && s.length >= 4) return [s[0] || 0, s[1] || 0, s[2] || 0, s[3] || 0];
    return [40, 40, 40, 40];
  }

  function renderSliceField(node, onChange) {
    var wrap = document.createElement("div");
    wrap.className = "slice-editor";
    if (node.backgroundFit !== "sliced") {
      wrap.hidden = true;
      return wrap;
    }
    var hint = document.createElement("div");
    hint.className = "slice-hint";
    hint.textContent = "四角不拉伸 · 四边单向拉 · 中间双向拉";
    wrap.appendChild(hint);
    var row = document.createElement("div");
    row.className = "insp-line cols-4";
    [["L", 3], ["T", 0], ["R", 1], ["B", 2]].forEach(function (pair) {
      var cell = document.createElement("label");
      cell.className = "insp-cell";
      var name = document.createElement("span");
      name.className = "insp-key";
      name.textContent = pair[0];
      var input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.value = String(sliceArray(node)[pair[1]] || 0);
      input.addEventListener("change", function () {
        emitChange(onChange, { phase: "start" });
        var next = sliceArray(node);
        next[pair[1]] = Math.max(0, Number(input.value) || 0);
        node.backgroundSlice = next;
        node.backgroundFit = "sliced";
        emitChange(onChange, { phase: "end" });
      });
      cell.appendChild(name);
      cell.appendChild(input);
      row.appendChild(cell);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function renderAssetField(node, field, onChange) {
    var block = document.createElement("div");
    block.className = "asset-block drop-image";
    var path = node[field.key] || "";
    var pathEl = document.createElement("div");
    pathEl.className = "asset-path";
    pathEl.textContent = path || "未选择图片，点「选择图片」";
    pathEl.title = "在项目列表中定位该素材";
    pathEl.addEventListener("click", function () {
      if (path && window.UrhoxProject) window.UrhoxProject.revealAsset(path);
    });
    block.appendChild(pathEl);
    if (path) {
      var img = document.createElement("img");
      img.className = "asset-thumb";
      img.alt = path;
      img.draggable = false;
      if (window.UrhoxProject && window.UrhoxProject.bindAssetThumb) {
        window.UrhoxProject.bindAssetThumb(img, path);
      } else if (window.UrhoxPreview && window.UrhoxPreview.bindImage) {
        window.UrhoxPreview.bindImage(img, path);
      } else if (window.UrhoxAssets && window.UrhoxAssets.bindSrc) {
        window.UrhoxAssets.bindSrc(img, path);
      }
      block.appendChild(img);
    }
    var actions = document.createElement("div");
    actions.className = "asset-actions";
    var pickBtn = document.createElement("button");
    pickBtn.type = "button";
    pickBtn.className = "ghost";
    pickBtn.textContent = path ? "替换图片" : "选择图片";
    pickBtn.addEventListener("click", function () {
      if (window.UrhoxProject) window.UrhoxProject.beginReplaceImage(node, field.key, onChange);
    });
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "ghost";
    clearBtn.textContent = "清除";
    clearBtn.addEventListener("click", function () {
      emitChange(onChange, { phase: "start" });
      delete node[field.key];
      emitChange(onChange, { phase: "end" });
    });
    actions.appendChild(pickBtn);
    actions.appendChild(clearBtn);
    block.appendChild(actions);
    var dropHint = document.createElement("div");
    dropHint.className = "slice-hint";
    dropHint.textContent = "可从底部 Assets 拖一张图到这里";
    block.appendChild(dropHint);
    function takeRef(event) {
      var raw = event.dataTransfer && event.dataTransfer.getData("text/plain");
      if (raw && raw.indexOf("urhox-image:") === 0) return raw.slice("urhox-image:".length);
      return "";
    }
    block.addEventListener("dragover", function (event) {
      if (takeRef(event) || (event.dataTransfer && event.dataTransfer.types && event.dataTransfer.types.length)) {
        event.preventDefault();
        block.classList.add("drop-over");
      }
    });
    block.addEventListener("dragleave", function () { block.classList.remove("drop-over"); });
    block.addEventListener("drop", function (event) {
      event.preventDefault();
      block.classList.remove("drop-over");
      var ref = takeRef(event);
      if (ref && window.UrhoxProject && window.UrhoxProject.assignImageByRef) {
        window.UrhoxProject.beginReplaceImage(node, field.key, onChange);
        window.UrhoxProject.assignImageByRef(ref);
      }
    });
    return block;
  }

  function isOpen(group) {
    if (Object.prototype.hasOwnProperty.call(openState, group.id)) return openState[group.id];
    return group.open !== false;
  }

  function renderGroup(group, node, onChange) {
    var block = document.createElement("div");
    block.className = "insp-group" + (isOpen(group) ? " open" : "");
    var title = document.createElement("button");
    title.type = "button";
    title.className = "insp-fold";
    title.textContent = (isOpen(group) ? "▾ " : "▸ ") + group.title;
    var body = document.createElement("div");
    body.className = "insp-body";
    body.hidden = !isOpen(group);
    (group.rows || []).forEach(function (fields) {
      body.appendChild(renderRow(node, fields, onChange));
    });
    title.addEventListener("click", function () {
      openState[group.id] = !isOpen(group);
      body.hidden = !openState[group.id];
      title.textContent = (openState[group.id] ? "▾ " : "▸ ") + group.title;
      block.classList.toggle("open", openState[group.id]);
    });
    block.appendChild(title);
    block.appendChild(body);
    return block;
  }

  function renderSelection(container, nodes, onChange, meta) {
    var heading = document.createElement("p");
    heading.className = "insp-note";
    heading.textContent = "已选择 " + nodes.length + " 个节点";
    container.appendChild(heading);
    if (meta.blocked) {
      var note = document.createElement("p");
      note.className = "muted insp-note";
      note.textContent = "包含锁定或模板生成节点，无法批量编辑";
      container.appendChild(note);
    }
    var fields = [
      { key: "visible", label: "启用", type: "checkbox", fallback: true },
      { key: "opacity", label: "透明度", type: "number", fallback: 1 },
    ];
    if (nodes.every(isTextNode)) fields.push({ key: "text", label: "Text", type: "text", fallback: "" });
    fields.forEach(function (field) {
      var cell = document.createElement("label");
      cell.className = "insp-cell";
      var caption = document.createElement("span");
      caption.className = "insp-key";
      caption.textContent = field.label;
      cell.appendChild(caption);
      var input = document.createElement("input");
      input.type = field.type;
      input.disabled = !!meta.blocked;
      var values = nodes.map(function (n) { return n[field.key] == null ? field.fallback : n[field.key]; });
      var mixed = values.some(function (value) { return value !== values[0]; });
      var initial = mixed ? "" : String(values[0]);
      var cancelled = false;
      if (field.type === "checkbox") {
        input.checked = !mixed && values[0] === true;
        input.indeterminate = mixed;
      } else {
        input.value = initial;
        input.placeholder = mixed ? "混合" : "";
        if (field.type === "number") { input.min = "0"; input.max = "1"; input.step = "any"; }
      }
      input.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && field.type !== "checkbox") {
          input.value = initial;
          cancelled = true;
          input.setCustomValidity("");
          event.preventDefault();
        }
      });
      input.addEventListener("input", function () { cancelled = false; input.setCustomValidity(""); });
      input.addEventListener("change", function () {
        if (cancelled || meta.blocked || (meta.isCurrent && !meta.isCurrent())) return;
        var value = field.type === "checkbox" ? input.checked : input.value;
        if (field.type === "number") {
          value = input.value.trim() === "" ? undefined : Number(input.value);
          if (input.validity && input.validity.badInput ||
              value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
            input.setCustomValidity("透明度必须为 0 到 1");
            input.reportValidity();
            return;
          }
        }
        if (nodes.every(function (n) { return n[field.key] === value; })) return;
        emitChange(onChange, { phase: "start" });
        nodes.forEach(function (n) {
          if (value === undefined) delete n[field.key];
          else n[field.key] = value;
        });
        emitChange(onChange, { phase: "end" });
      });
      cell.appendChild(input);
      var line = document.createElement("div");
      line.className = "insp-line cols-1";
      line.appendChild(cell);
      container.appendChild(line);
    });
    var list = document.createElement("p");
    list.className = "muted selection-names";
    list.textContent = nodes.map(function (n) { return n.id || n.type; }).join("、");
    container.appendChild(list);
  }

  function renderComponentNote(container, meta) {
    if (!meta || !meta.componentRef) return;
    var note = document.createElement("div");
    note.className = "component-instance-note";
    var title = document.createElement("strong");
    title.textContent = "组件实例";
    note.appendChild(title);
    var ref = document.createElement("code");
    ref.textContent = meta.componentRef;
    note.appendChild(ref);
    if (typeof meta.onOpenComponent === "function") {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ghost";
      button.textContent = "打开组件源文件";
      button.title = "编辑这个组件会影响所有引用它的页面";
      button.addEventListener("click", function () {
        meta.onOpenComponent(meta.componentRef);
      });
      note.appendChild(button);
    }
    container.appendChild(note);
  }

  function render(container, node, onChange, meta) {
    container.innerHTML = "";
    if (!node) {
      container.innerHTML = "<p class=\"muted\">选中一个节点后显示属性</p>";
      return;
    }
    meta = meta || {};
    if (meta.selection && meta.selection.length > 1) {
      renderSelection(container, meta.selection, onChange, meta);
      return;
    }
    renderComponentNote(container, meta);
    if (meta.generated) {
      var gen = document.createElement("p");
      gen.className = "muted insp-note";
      gen.textContent = "此区域由模板生成，当前页面不可直接编辑实例。请打开对应模板文件。";
      container.appendChild(gen);
    }
    if (meta.repeat) {
      var rep = document.createElement("p");
      rep.className = "muted insp-note";
      rep.textContent = "动态列表容器：保存时会保留 $repeat，画布上的格子只是预览。";
      container.appendChild(rep);
    }
    GROUPS.forEach(function (group) {
      if (group.showIf && !group.showIf(node)) return;
      container.appendChild(renderGroup(group, node, onChange));
    });
  }

  root.UrhoxInspector = { render: render };
})(window);
