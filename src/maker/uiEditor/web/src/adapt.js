// adapt.js
// 用途：多屏适配检查。把未保存的当前文档在几种代表性屏幕上各排一遍，
// 汇总越界、安全区、文字超框、触控区过小等问题，并给出每块屏幕的缩略图。
// 只读：不改文档、撤销记录和选择，结束后恢复当前屏幕。
(function (root) {
  "use strict";

  var FAMILIES = [
    { id: "720p", name: "标准手机 16:9", short: "手机" },
    { id: "iphone18", name: "iPhone 18 Pro", short: "iPhone" },
    { id: "ipadpro", name: "iPad Pro 13″", short: "iPad" },
  ];
  var ORIENTATION_TEXT = { portrait: "竖屏", landscape: "横屏" };

  // 游戏只有一个方向，只检查它。项目和文档都没写明方向时才横竖都查，并在界面上说明。
  function scenesFor(info, custom) {
    var both = info.source === "unset";
    var orientations = both ? ["portrait", "landscape"] : [info.orientation];
    var list = [];
    orientations.forEach(function (orientation) {
      var families = custom ? [custom].concat(FAMILIES) : FAMILIES;
      families.forEach(function (family) {
        list.push({ id: family.id, orientation: orientation, name: family.name, both: both,
          short: family.short + (both ? (orientation === "landscape" ? "横" : "竖") : "") });
      });
    });
    return list;
  }

  function orientationNote(info) {
    var text = ORIENTATION_TEXT[info.orientation];
    return info.source === "document" ? "按文档设计尺寸判断为" + text + "，只检查" + text
      : info.source === "project" ? "项目设置为" + text + "，只检查" + text
        : "项目和文档都没有指定屏幕方向，横屏、竖屏都检查";
  }
  var MIN_TOUCH_PT = 40;
  var SEVERITY = {
    problem: { label: "问题", rank: 0, color: "#f87171" },
    warning: { label: "警告", rank: 1, color: "#fbbf24" },
    hint: { label: "提示", rank: 2, color: "#94a3b8" },
  };

  function area(r) { return Math.max(0, r.w) * Math.max(0, r.h); }
  function intersect(a, b) {
    var x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return { x: x, y: y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
  }
  function round(n) { return Math.round(n); }

  function labelOf(node) {
    var text = typeof node.text === "string" && node.text ? " “" + node.text.replace(/\s+/g, " ").slice(0, 12) + "”" : "";
    return { type: node.type || "Panel", name: node.id || "", text: text };
  }

  function hasText(node) { return typeof node.text === "string" && node.text.trim() !== ""; }

  // 文字实际占据的矩形（逻辑坐标），避免整行宽度的 Label 被误判为压住安全区。
  function textRect(node, box) {
    var pad = node._padding || [0, 0, 0, 0];
    var innerW = Math.max(0, box.w - pad[0] - pad[2]);
    var innerH = Math.max(0, box.h - pad[1] - pad[3]);
    var m = root.UrhoxYoga.textMetrics(node, innerW);
    var w = Math.min(m.width, innerW || m.width);
    var align = node.textAlign || (node.type === "Button" ? "center" : "left");
    var x = box.x + pad[0] + (align === "center" ? (innerW - w) / 2 : align === "right" ? innerW - w : 0);
    var vertical = node.verticalAlign || (node.type === "Button" ? "middle" : "top");
    var y = box.y + pad[1] + (vertical === "middle" ? (innerH - m.height) / 2 : vertical === "bottom" ? innerH - m.height : 0);
    return { x: x, y: y, w: w, h: m.height };
  }

  // ctx：probeScenes 给出的逻辑画幅、安全区（逻辑单位）、缩放和 DPR。
  function analyze(ctx) {
    var G = root.UrhoxGeom, Y = root.UrhoxYoga;
    var W = ctx.width, H = ctx.height, S = ctx.safeArea;
    var screen = { x: 0, y: 0, w: W, h: H };
    var safe = { x: S.left, y: S.top, w: W - S.left - S.right, h: H - S.top - S.bottom };
    var hasSafe = S.top > 0 || S.right > 0 || S.bottom > 0 || S.left > 0;
    var found = [];

    function add(code, severity, node, bounds, message) {
      var sid = ctx.sourceId(node);
      found.push({ code: code, severity: severity, key: code + ":" + (sid || "gen:" + node._editorId),
        editorId: sid, label: labelOf(node), message: message, bounds: bounds });
    }

    function walk(node, parentMatrix, clip) {
      if (!node || node._hidden || !node._layout) return;
      var matrix = G.multiply(parentMatrix, G.nodeMatrix(node));
      var L = node._layout;
      var corners = [[L.x, L.y], [L.x + L.w, L.y], [L.x, L.y + L.h], [L.x + L.w, L.y + L.h]].map(function (p) {
        var v = G.point(matrix, { x: p[0], y: p[1] });
        return { x: v.x, y: v.y, w: 0, h: 0 };
      });
      var b = G.boundsOf(corners);
      var content = node.type === "Button" || node.type === "Image" || node.type === "Label" && hasText(node);
      if (content && b.w > 0 && b.h > 0) check(node, b, clip);

      var childClip = clip;
      if (node.type === "ScrollView" || node.overflow === "hidden" || node.overflow === "scroll") {
        childClip = { rect: clip ? intersect(clip.rect, b) : b, scroll: node.type === "ScrollView" || node.overflow === "scroll" };
      }
      (node.children || []).forEach(function (child) { walk(child, matrix, childClip); });
    }

    function check(node, b, clip) {
      var text = node.type === "Button" || node.type === "Label";
      var background = node.type === "Image" && b.w >= W * 0.9 && b.h >= H * 0.9;

      if (text && hasText(node)) {
        var pad = node._padding || [0, 0, 0, 0];
        var innerW = b.w - pad[0] - pad[2], innerH = b.h - pad[1] - pad[3];
        if (innerW > 0) {
          var m = Y.textMetrics(node, innerW);
          if (m.width > innerW + 2) {
            add("textOverflow", "warning", node, b, "文字比控件宽 " + round(m.width - innerW) + " px，会超出或被截断");
          } else {
            // 行高里的上下留白不算文字本身，按“字高”判断，避免一行字差几像素就报警。
            var size = Number(node.fontSize) || 16;
            var glyphs = m.height - (m.lineHeight - size);
            if (innerH > 0 && glyphs > innerH + 2) {
              add("textOverflow", "warning", node, b, "文字有 " + m.lines.length + " 行，比控件高 " + round(glyphs - innerH) + " px");
            }
          }
        }
      }
      if (node.type === "Button") {
        var points = Math.min(b.w, b.h) * ctx.scale / ctx.dpr;
        if (points < MIN_TOUCH_PT) {
          add("smallTouch", "hint", node, b, "触控区约 " + round(points) + " pt，低于 " + MIN_TOUCH_PT + " pt，手指不易点中");
        }
      }
      if (clip && clip.scroll) return; // 滚动列表里的内容靠滚动露出，不按屏幕裁切判断
      if (clip && !clip.scroll && node.type !== "Image") {
        var inside = intersect(b, clip.rect);
        if (area(inside) < area(b) * 0.98) {
          add("clippedByParent", "warning", node, b, "被父容器（overflow 裁切）截掉 " + round((1 - area(inside) / area(b)) * 100) + "%");
          return;
        }
      }
      if (background) return;
      var visible = area(intersect(b, screen)) / area(b);
      if (visible <= 0.02) {
        add("offscreen", "warning", node, b, "整个控件在屏幕外（若是入场动画的起始位置可忽略）");
        return;
      }
      if (visible < 0.98) {
        add("cutByScreen", "problem", node, b, "被屏幕边缘裁切 " + round((1 - visible) * 100) + "%");
        return;
      }
      if (!hasSafe) return;
      var r = node.type === "Label" ? textRect(node, b) : b;
      var sides = [];
      function over(side, amount) { if (amount > 1) sides.push(side + "安全区 " + round(amount) + " px"); }
      over("顶部", safe.y - r.y);
      over("底部", r.y + r.h - (safe.y + safe.h));
      over("左侧", safe.x - r.x);
      over("右侧", r.x + r.w - (safe.x + safe.w));
      if (sides.length) {
        add("unsafe", "warning", node, b, "进入" + sides.join("、") + "（刘海、圆角或手势条处），建议放进 SafeAreaView");
      }
    }

    walk(ctx.tree, [1, 0, 0, 1, 0, 0], null);
    return found;
  }

  function drawThumb(ctx, scene, data, issues) {
    var maxW = 200, maxH = 120, pixel = 2;
    var k = Math.min(maxW / data.width, maxH / data.height);
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(data.width * k * pixel));
    canvas.height = Math.max(1, Math.round(data.height * k * pixel));
    canvas.style.width = canvas.width / pixel + "px";
    canvas.style.height = canvas.height / pixel + "px";
    var g = canvas.getContext("2d");
    var s = k * pixel;
    g.fillStyle = "#0b0e13";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.save();
    g.scale(s, s);
    ctx.paint(g);
    var S = data.safeArea;
    if (S.top || S.right || S.bottom || S.left) {
      g.fillStyle = "rgba(248,113,113,0.16)";
      g.fillRect(0, 0, data.width, S.top);
      g.fillRect(0, data.height - S.bottom, data.width, S.bottom);
      g.fillRect(0, S.top, S.left, data.height - S.top - S.bottom);
      g.fillRect(data.width - S.right, S.top, S.right, data.height - S.top - S.bottom);
    }
    issues.forEach(function (issue) {
      if (issue.severity === "hint") return;
      g.strokeStyle = SEVERITY[issue.severity].color;
      g.lineWidth = 2 * pixel / s;
      g.strokeRect(issue.bounds.x, issue.bounds.y, issue.bounds.w, issue.bounds.h);
    });
    g.restore();
    return canvas;
  }

  function run() {
    var api = root.UrhoxPreview;
    var info = api.orientationInfo;
    var current = api.currentScene;
    var custom = current.id === "custom" ? { id: "custom", name: current.name || "自定义", short: "自定义" } : null;
    var scenes = scenesFor(info, custom);
    var results = api.probeScenes(scenes, function (scene, ctx) {
      var logical = { width: ctx.width, height: ctx.height, safeArea: ctx.safeArea };
      var issues = analyze(ctx);
      return {
        scene: scene, width: Math.round(ctx.width), height: Math.round(ctx.height),
        issues: issues, thumb: drawThumb(ctx, scene, logical, issues),
      };
    });
    if (!results) return null;
    // 同一问题按 ID 去掉数字后合并（item_1…item_40 算一条），点击时一次选中全部。
    var grouped = {}, order = [];
    results.forEach(function (res, index) {
      res.counts = { problem: 0, warning: 0, hint: 0 };
      res.issues.forEach(function (issue) {
        var pattern = issue.label.name ? issue.code + ":" + issue.label.type + ":" + issue.label.name.replace(/\d+/g, "#") : issue.key;
        var item = grouped[pattern];
        if (!item) {
          item = grouped[pattern] = { key: pattern, code: issue.code, severity: issue.severity, label: issue.label,
            nodes: {}, count: 0, editorIds: [], scenes: [], messages: {} };
          order.push(item);
        }
        if (!item.nodes[issue.key]) {
          item.nodes[issue.key] = true;
          item.count++;
          if (issue.editorId) item.editorIds.push(issue.editorId);
        }
        if (item.scenes.indexOf(index) < 0) {
          item.scenes.push(index);
          item.messages[index] = issue.message;
          res.counts[item.severity]++;
        }
      });
    });
    order.forEach(function (item) {
      if (item.count > 1) {
        item.label = { type: item.label.type, name: item.label.name.replace(/\d+/g, "#"), text: "" };
      }
    });
    order.sort(function (a, b) {
      return SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || b.scenes.length - a.scenes.length;
    });
    return { results: results, issues: order, orientation: info, note: orientationNote(info) };
  }

  function sceneName(scene) { return scene.name + (scene.both ? " · " + ORIENTATION_TEXT[scene.orientation] : ""); }
  function nodeName(label, count) {
    return label.type + (label.name ? " " + label.name : "") + label.text + (count > 1 ? " ×" + count : "");
  }

  function toMarkdown(report, file) {
    var lines = ["# 多屏适配检查：" + (file || "当前 UI"), "", report.note + "。",
      "检查范围（编辑器模拟，不含真机、引擎字体与动态数据）：" + report.results.map(function (r) {
        return sceneName(r.scene) + " " + r.width + "×" + r.height;
      }).join("；"), ""];
    ["problem", "warning", "hint"].forEach(function (level) {
      var items = report.issues.filter(function (i) { return i.severity === level; });
      if (!items.length) return;
      lines.push("## " + SEVERITY[level].label + "（" + items.length + "）");
      items.forEach(function (item) {
        var first = item.scenes[0];
        lines.push("- " + nodeName(item.label, item.count) + "：" + item.messages[first] + "；出现在 " +
          (item.scenes.length === report.results.length ? "所有检查屏幕" :
            item.scenes.map(function (i) { return report.results[i].scene.short; }).join("、")));
      });
      lines.push("");
    });
    if (!report.issues.length) lines.push("所有检查屏幕均未发现问题。", "");
    lines.push("修复建议：优先用百分比、flex、SafeAreaView 和约束调整布局，不要写死某个设备的坐标；" +
      "改完用 `taptap-maker ui preview --device iphone18 --orientation " + report.orientation.orientation +
      "` 等命令复核。");
    return lines.join("\n");
  }

  root.UrhoxAdapt = { analyze: analyze, run: run, toMarkdown: toMarkdown, sceneName: sceneName,
    nodeName: nodeName, severity: SEVERITY };
})(window);
