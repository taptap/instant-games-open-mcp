// Adapter between the declaration format and the locally bundled Yoga engine.
(function (root) {
  "use strict";
  var Y = root.UrhoxYogaEngine;
  var measureContext = typeof document !== "undefined"
    ? document.createElement("canvas").getContext("2d") : null;

  function font(node) {
    return (node.fontWeight === "bold" ? "700 " : "400 ") +
      (Number(node.fontSize) || 16) + "px 'PingFang SC', 'Noto Sans SC', sans-serif";
  }

  function textMetrics(node, maxWidth) {
    var size = Number(node.fontSize) || 16;
    if (measureContext) measureContext.font = font(node);
    function width(text) {
      return measureContext ? measureContext.measureText(text).width : Array.from(text).length * size;
    }
    var lines = [];
    String(node.text == null ? "" : node.text).split("\n").forEach(function (paragraph) {
      if (node.whiteSpace !== "normal" || !Number.isFinite(maxWidth) || maxWidth <= 0) {
        lines.push(paragraph);
        return;
      }
      var line = "";
      Array.from(paragraph).forEach(function (char) {
        if (line && width(line + char) > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += char;
      });
      lines.push(line);
    });
    var lineHeight = size * (Number(node.lineHeight) || 1.4);
    return { lines: lines, width: Math.max.apply(null, lines.map(width).concat([0])),
      height: Math.ceil(lines.length * lineHeight), lineHeight: lineHeight };
  }

  function validLength(value) {
    return typeof value === "number" && Number.isFinite(value) ||
      typeof value === "string" && /^(auto|-?\d+(?:\.\d+)?%?)$/.test(value);
  }

  function enumValue(prefix, value) {
    if (typeof value !== "string") return undefined;
    return Y[prefix + value.toUpperCase().replace(/-/g, "_")];
  }

  function build(node) {
    var yn = Y.Node.create();
    try {
      yn.setPositionType(node.position === "absolute" ? Y.POSITION_TYPE_ABSOLUTE : Y.POSITION_TYPE_RELATIVE);
      yn.setFlexShrink(0);
      if (node.visible === false) yn.setDisplay(Y.DISPLAY_NONE);
      ["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "flexBasis"].forEach(function (key) {
        if (validLength(node[key])) yn["set" + key[0].toUpperCase() + key.slice(1)](node[key]);
      });
      ["flexGrow", "flexShrink", "aspectRatio"].forEach(function (key) {
        if (typeof node[key] === "number" && Number.isFinite(node[key])) {
          yn["set" + key[0].toUpperCase() + key.slice(1)](node[key]);
        }
      });
      [["flexDirection", "FLEX_DIRECTION_"], ["justifyContent", "JUSTIFY_"],
        ["alignItems", "ALIGN_"], ["alignSelf", "ALIGN_"], ["alignContent", "ALIGN_"],
        ["flexWrap", "WRAP_"]].forEach(function (pair) {
        var constant = enumValue(pair[1], node[pair[0]]);
        if (constant !== undefined) yn["set" + pair[0][0].toUpperCase() + pair[0].slice(1)](constant);
      });
      ["padding", "margin"].forEach(function (key) {
        [["", "ALL"], ["Horizontal", "HORIZONTAL"], ["Vertical", "VERTICAL"],
          ["Left", "LEFT"], ["Top", "TOP"], ["Right", "RIGHT"], ["Bottom", "BOTTOM"]].forEach(function (edge) {
          var value = node[key + edge[0]];
          if (validLength(value) && !(key === "padding" && value === "auto")) {
            yn[key === "padding" ? "setPadding" : "setMargin"](Y["EDGE_" + edge[1]], value);
          }
        });
      });
      ["left", "top", "right", "bottom"].forEach(function (key) {
        if (validLength(node[key])) yn.setPosition(Y["EDGE_" + key.toUpperCase()], node[key]);
      });
      if (typeof node.borderWidth === "number") yn.setBorder(Y.EDGE_ALL, Math.max(0, node.borderWidth));
      if (validLength(node.gap) && node.gap !== "auto") yn.setGap(Y.GUTTER_ALL, node.gap);
      var kids = node.children || [];
      if (!kids.length && (node.type === "Label" || node.type === "Button")) {
        yn.setMeasureFunc(function (width, widthMode) {
          var metrics = textMetrics(node, widthMode === Y.MEASURE_MODE_UNDEFINED ? Infinity : width);
          return { width: metrics.width, height: metrics.height };
        });
      }
      kids.forEach(function (child, i) { yn.insertChild(build(child), i); });
      return yn;
    } catch (error) {
      yn.freeRecursive();
      throw error;
    }
  }

  function layoutTree(tree, width, height) {
    if (!tree) return null;
    var yn = build(tree);
    try {
      if (!validLength(tree.width)) yn.setWidth(width);
      if (!validLength(tree.height)) yn.setHeight(height);
      yn.calculateLayout(width, height, Y.DIRECTION_LTR);
      function copy(node, layoutNode, x, y, hidden) {
        var rect = layoutNode.getComputedLayout();
        node._hidden = hidden || node.visible === false;
        node._layout = { x: x + rect.left, y: y + rect.top, w: rect.width, h: rect.height };
        node._padding = ["LEFT", "TOP", "RIGHT", "BOTTOM"].map(function (edge) {
          return layoutNode.getComputedPadding(Y["EDGE_" + edge]);
        });
        (node.children || []).forEach(function (child, i) {
          copy(child, layoutNode.getChild(i), node._layout.x, node._layout.y, node._hidden);
        });
      }
      copy(tree, yn, 0, 0, false);
      return tree;
    } finally {
      yn.freeRecursive();
    }
  }

  function walk(node, visit) {
    if (!node) return;
    visit(node);
    (node.children || []).forEach(function (child) { walk(child, visit); });
  }
  root.UrhoxYoga = { layoutTree: layoutTree, walk: walk, textMetrics: textMetrics, font: font };
})(window);
