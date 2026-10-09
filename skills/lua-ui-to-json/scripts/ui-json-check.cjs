(function (root) {
  "use strict";
  var previewTypes = new Set(["Panel", "Label", "Button", "NanoVG"]);
  // An allowlist shared by the browser, CLI and standalone document checker.
  var nanoOps = {
    save: "", restore: "", beginPath: "", closePath: "", fill: "", stroke: "",
    moveTo: "nn", lineTo: "nn", bezierTo: "nnnnnn", quadTo: "nnnn", arcTo: "nnnnn",
    rect: "nnnn", roundedRect: "nnnnn", roundedRectVarying: "nnnnnnnn",
    circle: "nnn", ellipse: "nnnn", arc: "nnnnnn",
    translate: "nn", scale: "nn", rotate: "n", skewX: "n", skewY: "n", transform: "nnnnnn",
    scissor: "nnnn", intersectScissor: "nnnn",
    fillColor: "c", strokeColor: "c", fillPaint: "p", strokePaint: "p",
    strokeWidth: "n", miterLimit: "n", lineCap: "n", lineJoin: "n", globalAlpha: "n",
    fontSize: "n", fontFace: "s", textAlign: "n", textLetterSpacing: "n", text: "nns", textBox: "nnns",
  };
  function nanoColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ||
      Array.isArray(value) && value.length === 4 && value.every(function (n) {
        return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 255;
      });
  }
  function checkNanoVG(node, issue, resource) {
    var box = node.viewBox, commands = node.commands, depth = 0;
    if (!Array.isArray(box) || box.length !== 4 || box.some(function (n) {
      return typeof n !== "number" || !Number.isFinite(n);
    }) || box[2] <= 0 || box[3] <= 0) issue("/viewBox", "viewBox 必须是 [x, y, 正宽度, 正高度]。");
    if (!Array.isArray(commands) || commands.length > 20000) {
      issue("/commands", "绘制指令必须是数组，最多 20000 条。"); return;
    }
    function paint(value, at) {
      if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.kind !== "string") return false;
      var signatures = { linearGradient: "nnnncc", radialGradient: "nnnncc", imagePattern: "nnnnnsn" };
      var sig = Object.prototype.hasOwnProperty.call(signatures, value.kind) && signatures[value.kind];
      if (!sig || !args(value.args, sig, at + "/args")) return false;
      if (value.kind === "radialGradient" && (value.args[2] < 0 || value.args[3] <= value.args[2])) return false;
      if (value.kind === "imagePattern") {
        if (value.args[2] <= 0 || value.args[3] <= 0 || value.args[6] < 0 || value.args[6] > 1) return false;
        resource(value.args[5], at + "/args/5");
      }
      return true;
    }
    function args(values, sig, at) {
      return Array.isArray(values) && values.length === sig.length && values.every(function (value, i) {
        var type = sig[i];
        return type === "n" ? typeof value === "number" && Number.isFinite(value) :
          type === "s" ? typeof value === "string" : type === "c" ? nanoColor(value) : paint(value, at + "/" + i);
      });
    }
    commands.forEach(function (command, i) {
      var at = "/commands/" + i;
      if (!Array.isArray(command) || typeof command[0] !== "string" || !Object.prototype.hasOwnProperty.call(nanoOps, command[0]) ||
          !args(command.slice(1), nanoOps[command[0]], at)) {
        issue(at, "不支持的 NanoVG 指令或参数。使用 ui capabilities 查询支持范围。"); return;
      }
      var op = command[0], a = command.slice(1);
      if (op === "save" && ++depth > 32) issue(at, "NanoVG 图层状态栈超过 32 层，需为引擎保留栈空间。");
      if (op === "restore" && --depth < 0) { issue(at, "restore 没有对应的 save。"); depth = 0; }
      if (op === "globalAlpha" && (a[0] < 0 || a[0] > 1)) issue(at, "透明度必须在 0 到 1 之间。");
      if (["strokeWidth", "miterLimit", "fontSize"].includes(op) && a[0] <= 0) issue(at, "值必须大于 0。");
      if (op === "lineCap" && ![0, 1, 2].includes(a[0]) || op === "lineJoin" && ![1, 3, 4].includes(a[0]) ||
          op === "arc" && ![1, 2].includes(a[5])) issue(at, "无效的 NanoVG 枚举值。");
      if (op === "textBox" && a[2] <= 0) issue(at, "文本框宽度必须大于 0。");
      if (op === "textAlign" && ![0, 1, 2, 4].some(function (h) {
        return [0, 8, 16, 32, 64].some(function (v) { return a[0] === h + v; });
      })) issue(at, "文本对齐每个方向最多指定一个 NanoVG 标志。");
      if (op === "circle" && a[2] < 0 || op === "ellipse" && (a[2] < 0 || a[3] < 0) ||
          op === "arc" && a[2] < 0 || op === "arcTo" && a[4] < 0 ||
          op.startsWith("roundedRect") && a.slice(4).some(function (n) { return n < 0; })) issue(at, "半径不能为负数。");
    });
    if (depth) issue("/commands", "save/restore 必须配对。");
  }
  var lengths = ["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
    "left", "right", "top", "bottom", "padding", "paddingLeft", "paddingRight",
    "paddingTop", "paddingBottom", "paddingHorizontal", "paddingVertical",
    "margin", "marginLeft", "marginRight", "marginTop", "marginBottom",
    "marginHorizontal", "marginVertical", "gap", "flexBasis"];
  var enums = {
    position: ["relative", "absolute"],
    backgroundFit: ["fill", "contain", "cover", "sliced"],
    overflow: ["visible", "hidden", "scroll"],
    flexDirection: ["row", "column", "row-reverse", "column-reverse"],
    textAlign: ["left", "center", "right"],
    verticalAlign: ["top", "middle", "bottom"],
  };
  function token(value) { return typeof value === "string" && value.charAt(0) === "$"; }
  function length(value) {
    return typeof value === "number" && Number.isFinite(value) ||
      typeof value === "string" && /^(auto|-?\d+(?:\.\d+)?%?)$/.test(value);
  }
  function checkDocument(options) {
    var diagnostics = [], ids = new Map(), count = 0, limited = false, parameterized = false;
    function issue(code, severity, pointer, message) {
      diagnostics.push({ code: code, severity: severity, file: options.file || "",
        pointer: pointer, message: message });
    }
    function resource(value, pointer) {
      if (value == null || value === "" || token(value)) return;
      if (typeof value !== "string") {
        issue("UI_RESOURCE_TYPE", "error", pointer, "资源引用必须是字符串。"); return;
      }
      if (/^uuid:\/\//.test(value)) {
        issue("UI_RESOURCE_UNRESOLVED", "warning", pointer, "UUID 引用需要引擎资源索引，尚未验证。"); return;
      }
      if (/^(\/|\\|[a-z]+:)/i.test(value) || value.includes("\\") || value.split("/").includes("..")) {
        issue("UI_RESOURCE_PATH", "error", pointer, "使用 assets 内相对资源路径，不允许绝对路径或越界引用。"); return;
      }
      if (value.startsWith("assets/")) {
        issue("UI_RESOURCE_PREFIX", "warning", pointer, "游戏资源通常相对 assets 根，请核对是否多写了 assets/。");
      }
      if (options.resourceExists && !options.resourceExists(value)) {
        issue("UI_RESOURCE_MISSING", "error", pointer, "找不到或无法读取资源：" + value);
      }
    }
    function visit(node, pointer, depth) {
      if (++count > 10000 || depth > 128) {
        if (!limited) issue("UI_LIMIT", "error", pointer, "节点数量或深度超过检查上限。");
        limited = true; return;
      }
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        issue("UI_NODE", "error", pointer, "节点必须是对象。"); return;
      }
      if (typeof node.type !== "string" || !node.type.trim()) {
        issue("UI_NODE_TYPE", "error", pointer + "/type", "每个节点都需要非空 type。");
      } else if (!previewTypes.has(node.type)) {
        issue("UI_PREVIEW_TYPE", "warning", pointer + "/type",
          "此类型需要核对引擎注册及编辑器预览支持：" + node.type + "；不应自动改成 Panel。");
      }
      if (node.id != null && !token(node.id)) {
        if (typeof node.id !== "string" || !node.id.trim()) {
          issue("UI_ID_TYPE", "error", pointer + "/id", "id 必须是非空字符串。");
        } else if (ids.has(node.id)) {
          issue("UI_DUPLICATE_ID", "error", pointer + "/id", "同一文档的 id 重复：" + node.id +
            "；首次出现于 " + ids.get(node.id));
        } else ids.set(node.id, pointer + "/id");
      }
      Object.keys(node).forEach(function (key) {
        var value = node[key], at = pointer + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1");
        if (key.charAt(0) === "_") issue("UI_INTERNAL_FIELD", "error", at, "导出含编辑器内部字段。");
        if (/^on[A-Z]/.test(key)) issue("UI_CALLBACK", "error", at, "回调保留在 Lua 中，不写入 UI JSON。");
        if (token(value)) { parameterized = true; return; }
        if (typeof value === "number" && !Number.isFinite(value)) {
          issue("UI_NUMBER", "error", at, "数值必须有限。"); return;
        }
        if (lengths.includes(key) && !length(value)) {
          issue("UI_LENGTH", "error", at, "尺寸/位置必须是有限数值、百分比或受支持的 auto。");
        }
        if (["width", "height"].includes(key) && typeof value === "number" && value <= 0) {
          issue("UI_ZERO_SIZE", "warning", at, "非正尺寸可能不可见；动态尺寸需在运行时确认。");
        }
        if (enums[key] && !enums[key].includes(value)) {
          issue("UI_ENUM", "error", at, "不支持的枚举值：" + String(value));
        }
        if (["visible", "disabled", "locked"].includes(key) && typeof value !== "boolean") {
          issue("UI_BOOLEAN", "error", at, "此字段必须是布尔值。");
        }
        if (key === "opacity" && (typeof value !== "number" || value < 0 || value > 1)) {
          issue("UI_OPACITY", "error", at, "透明度应为 0 到 1 的数值。");
        }
        if (key === "backgroundSlice" && (!Array.isArray(value) || value.length !== 4 ||
          value.some(function (n) { return typeof n !== "number" || !Number.isFinite(n) || n < 0; }))) {
          issue("UI_SLICE", "error", at, "九宫格切边使用四个非负数：[上, 右, 下, 左]。");
        }
      });
      resource(node.backgroundImage, pointer + "/backgroundImage");
      resource(node.pressedBackgroundImage, pointer + "/pressedBackgroundImage");
      if (node.type === "NanoVG") checkNanoVG(node, function (at, message) {
        issue("UI_NANOVG", "error", pointer + at, message);
      }, function (ref, at) { resource(ref, pointer + at); });
      if (node.component != null) {
        if (token(node.component)) {
          parameterized = true;
        } else if (typeof node.component !== "string" || !node.component.trim()) {
          issue("UI_COMPONENT_TYPE", "error", pointer + "/component", "组件引用必须是非空字符串。");
        } else if (options.resourceExists && !options.resourceExists(node.component)) {
          issue("UI_COMPONENT_MISSING", "error", pointer + "/component", "找不到组件文件：" + node.component);
        }
      }
      if (node.$repeat) {
        issue("UI_EDITOR_REPEAT", "warning", pointer + "/$repeat",
          "$repeat 是编辑器扩展，不证明引擎会生成列表；运行时应核对模板实例化。");
        resource(node.$repeat.template, pointer + "/$repeat/template");
      }
      if (node.children != null && !Array.isArray(node.children)) {
        issue("UI_CHILDREN", "error", pointer + "/children", "children 必须是数组。");
      } else (node.children || []).some(function (child, i) {
        visit(child, pointer + "/children/" + i, depth + 1);
        return limited;
      });
    }
    visit(options.tree, "", 0);
    if (parameterized) issue("UI_TEMPLATE_CONTEXT", "warning", "",
      "含模板参数。请验证调用方 props、默认值及模板加载模式；此检查没有展开模板。");
    return {
      version: 1, nodes: count,
      errors: diagnostics.filter(function (d) { return d.severity === "error"; }).length,
      warnings: diagnostics.filter(function (d) { return d.severity === "warning"; }).length,
      diagnostics: diagnostics,
      skipped: ["runtime-equivalence", "layout-and-fonts", "component-expansion", "lua-bindings",
        "image-decoding", "meta-and-font-resources", "source-coverage", "duplicate-json-keys"]
        .concat(options.resourceExists ? [] : ["resource-existence"]),
    };
  }
  var api = { checkDocument: checkDocument, checkNanoVG: checkNanoVG, nanoOps: nanoOps };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UrhoxUICheck = api;
})(typeof window !== "undefined" ? window : globalThis);
