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
    if (measureContext) {
      measureContext.font = font(node);
      measureContext.letterSpacing = (Number(node.letterSpacing) || 0) + "px";
    }
    function width(text) {
      return measureContext ? measureContext.measureText(text).width : Array.from(text).length * size;
    }
    var lines = [];
    String(node.text == null ? "" : node.text).split(/\r\n|\r|\n/).forEach(function (paragraph) {
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
    var multiplier = Number(node.lineHeight);
    var lineHeight = size * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.4);
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

  function build(node, environment, config) {
    if (node.type === "ScrollView") {
      node = Object.assign({ overflow: "hidden" }, node);
      if (node.flexGrow > 0 && node.flexBasis == null) node.flexBasis = 0;
    }
    if (node.type === "SafeAreaView" && environment) {
      node = Object.assign({}, node);
      var area = environment.safeArea || {};
      ["top", "right", "bottom", "left"].forEach(function (edge) {
        var edges = node.edges;
        var enabled = edges == null || edges === "all" || Array.isArray(edges) && edges.indexOf(edge) >= 0 ||
          edges === "horizontal" && (edge === "left" || edge === "right") ||
          edges === "vertical" && (edge === "top" || edge === "bottom");
        if (!enabled) return;
        var inset = area[edge] || 0;
        if (edge === "top" && node.nativeMenuInset) inset = Math.max(inset, environment.nativeMenuBottom || 0);
        var key = (node.mode && node.mode !== "padding" ? "margin" : "padding") + edge[0].toUpperCase() + edge.slice(1);
        node[key] = (Number(node[key]) || 0) + inset;
      });
    }
    var yn = Y.Node.create(config);
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
      [["rowGap", Y.GUTTER_ROW], ["columnGap", Y.GUTTER_COLUMN]].forEach(function (pair) {
        if (validLength(node[pair[0]]) && node[pair[0]] !== "auto") yn.setGap(pair[1], node[pair[0]]);
      });
      var kids = node.children || [];
      if (!kids.length && (node.type === "Label" || node.type === "Button")) {
        yn.setMeasureFunc(function (width, widthMode) {
          var metrics = textMetrics(node, widthMode === Y.MEASURE_MODE_UNDEFINED ? Infinity : width);
          return { width: metrics.width, height: metrics.height };
        });
      }
      kids.forEach(function (child, i) {
        var childNode = build(child, environment, config);
        if (node.type === "ScrollView") childNode.setFlexShrink(0);
        yn.insertChild(childNode, i);
      });
      return yn;
    } catch (error) {
      yn.freeRecursive();
      throw error;
    }
  }

  function layoutTree(tree, width, height, environment) {
    if (!tree) return null;
    var config = Y.Config.create(), yn;
    try {
      config.setPointScaleFactor(environment && environment.scale || 1);
      yn = build(tree, environment, config);
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
        node._margin = ["LEFT", "TOP", "RIGHT", "BOTTOM"].map(function (edge) {
          return layoutNode.getComputedMargin(Y["EDGE_" + edge]);
        });
        (node.children || []).forEach(function (child, i) {
          copy(child, layoutNode.getChild(i), node._layout.x, node._layout.y, node._hidden);
        });
      }
      copy(tree, yn, 0, 0, false);
      function scroll(node) {
        (node.children || []).forEach(scroll);
        if (node.type !== "ScrollView") return;
        var box = node._layout;
        var bottom = box.y;
        (node.children || []).forEach(function (child) {
          if (!child._hidden) bottom = Math.max(bottom, child._layout.y + child._layout.h);
        });
        node._scrollMaxY = node.scrollY === false ? 0 : Math.max(0, bottom - box.y - box.h);
        node._scrollY = Math.max(0, Math.min(node._scrollMaxY, node._scrollY || 0));
        (node.children || []).forEach(function (child) {
          walk(child, function (descendant) { descendant._layout.y -= node._scrollY; });
        });
      }
      scroll(tree);
      return tree;
    } finally {
      if (yn) yn.freeRecursive();
      config.free();
    }
  }

  function walk(node, visit) {
    if (!node) return;
    visit(node);
    (node.children || []).forEach(function (child) { walk(child, visit); });
  }
  root.UrhoxYoga = { layoutTree: layoutTree, walk: walk, textMetrics: textMetrics, font: font };
})(window);
