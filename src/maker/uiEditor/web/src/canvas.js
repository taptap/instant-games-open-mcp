// canvas.js
// 用途：把当前文档画到 canvas 上（设备框、节点、选中、参考线）。不处理鼠标。
(function (root) {
  "use strict";

  var BLUE = "#0D99FF";
  var PINK = "#F24822";

  function screenLine(app, px) {
    var zoom = window.UrhoxView ? window.UrhoxView.getZoom() : 1;
    var scale = app.contentTransform().scale;
    return Math.max(1, px / (zoom * scale));
  }

  function handleSize(app) {
    return Math.max(6, screenLine(app, 7));
  }

  function handlesFor(box) {
    var x = box.x, y = box.y, w = box.w, h = box.h;
    return [
      { id: "nw", x: x, y: y, cursor: "nwse" },
      { id: "n", x: x + w / 2, y: y, cursor: "ns" },
      { id: "ne", x: x + w, y: y, cursor: "nesw" },
      { id: "e", x: x + w, y: y + h / 2, cursor: "ew" },
      { id: "se", x: x + w, y: y + h, cursor: "nwse" },
      { id: "s", x: x + w / 2, y: y + h, cursor: "ns" },
      { id: "sw", x: x, y: y + h, cursor: "nesw" },
      { id: "w", x: x, y: y + h / 2, cursor: "ew" },
    ];
  }

  function drawSliced(ctx, img, box, slice) {
    var top = slice[0] || 0;
    var right = slice[1] || 0;
    var bottom = slice[2] || 0;
    var left = slice[3] || 0;
    var imgW = img.naturalWidth;
    var imgH = img.naturalHeight;
    var x = box.x, y = box.y, w = box.w, h = box.h;
    var cw = w - left - right;
    var ch = h - top - bottom;
    var scw = imgW - left - right;
    var sch = imgH - top - bottom;
    function put(dx, dy, dw, dh, sx, sy, sw, sh) {
      if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    put(x, y, left, top, 0, 0, left, top);
    put(x + left, y, cw, top, left, 0, scw, top);
    put(x + left + cw, y, right, top, imgW - right, 0, right, top);
    put(x, y + top, left, ch, 0, top, left, sch);
    put(x + left, y + top, cw, ch, left, top, scw, sch);
    put(x + left + cw, y + top, right, ch, imgW - right, top, right, sch);
    put(x, y + top + ch, left, bottom, 0, imgH - bottom, left, bottom);
    put(x + left, y + top + ch, cw, bottom, left, imgH - bottom, scw, bottom);
    put(x + left + cw, y + top + ch, right, bottom, imgW - right, imgH - bottom, right, bottom);
  }

  function boxPath(ctx, box, radius) {
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, Math.max(0, box.w), Math.max(0, box.h),
      Math.max(0, Math.min(Number(radius) || 0, box.w / 2, box.h / 2)));
  }

  function paintNode(ctx, node, app) {
    var box = node._layout;
    if (!box || node._hidden) return;
    var assets = root.UrhoxAssets;
    ctx.save();
    var bg = assets.colorToCss(node.backgroundColor);
    if (bg) {
      ctx.fillStyle = bg;
      boxPath(ctx, box, node.borderRadius);
      ctx.fill();
    }
    if (node.backgroundImage) {
      ctx.save();
      boxPath(ctx, box, node.borderRadius);
      ctx.clip();
      ctx.globalAlpha *= node.backgroundImageOpacity == null ? 1 : node.backgroundImageOpacity;
      var img = assets.loadImage(node.backgroundImage, app.draw);
      if (img.complete && img.naturalWidth > 0) {
        if (node.backgroundFit === "sliced" && node.backgroundSlice) {
          drawSliced(ctx, img, box, node.backgroundSlice);
        } else {
          var fitted = assets.fitRect(box, img.naturalWidth, img.naturalHeight, node.backgroundFit);
          ctx.drawImage(img, fitted.x, fitted.y, fitted.w, fitted.h);
        }
      } else if (img.complete && (!node.backgroundImage || String(node.backgroundImage).charAt(0) !== "$")) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 80, 80, 0.18)";
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = "rgba(255, 80, 80, 0.9)";
        ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
        ctx.fillStyle = "#b91c1c";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("缺图", box.x + box.w / 2, box.y + box.h / 2);
        ctx.restore();
      }
      ctx.restore();
    }
    if (node.borderWidth > 0) {
      var bw = Math.min(node.borderWidth, box.w / 2, box.h / 2);
      ctx.strokeStyle = assets.colorToCss(node.borderColor) || "#000000";
      ctx.lineWidth = bw;
      boxPath(ctx, { x: box.x + bw / 2, y: box.y + bw / 2, w: box.w - bw, h: box.h - bw },
        Math.max(0, (node.borderRadius || 0) - bw / 2));
      ctx.stroke();
    }
    if ((node.type === "Label" || node.type === "Button") && node.text) {
      ctx.font = root.UrhoxYoga.font(node);
      ctx.textAlign = node.textAlign || (node.type === "Button" ? "center" : "left");
      ctx.textBaseline = "middle";
      var pad = node._padding || [0, 0, 0, 0];
      var innerW = Math.max(0, box.w - pad[0] - pad[2]);
      var innerH = Math.max(0, box.h - pad[1] - pad[3]);
      var metrics = root.UrhoxYoga.textMetrics(node, innerW);
      var tx = box.x + pad[0], ty = box.y + pad[1];
      var vertical = node.verticalAlign || (node.type === "Button" ? "middle" : "top");
      if (ctx.textAlign === "center") tx += innerW / 2;
      if (ctx.textAlign === "right") tx += innerW;
      if (vertical === "middle") ty += (innerH - metrics.height) / 2;
      if (vertical === "bottom") ty += innerH - metrics.height;
      var fill = assets.colorToCss(node.fontColor) || "#ffffff";
      if (node.textShadow) {
        var shadow = node.textShadow;
        ctx.shadowOffsetX = shadow.offsetX || shadow.x || 0;
        ctx.shadowOffsetY = shadow.offsetY || shadow.y || 0;
        ctx.shadowBlur = shadow.blur || 0;
        ctx.shadowColor = assets.colorToCss(shadow.color) || "rgba(0,0,0,0.5)";
      }
      ctx.fillStyle = fill;
      metrics.lines.forEach(function (line, i) {
        ctx.fillText(line, tx, ty + (i + 0.5) * metrics.lineHeight);
      });
    }
    ctx.restore();
  }

  function drawLabel(ctx, app, text, x, y) {
    var zoom = window.UrhoxView ? window.UrhoxView.getZoom() : 1;
    var font = Math.max(10, 11 / zoom);
    ctx.save();
    ctx.font = "500 " + font + "px Inter, 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var w = ctx.measureText(text).width + 8 / zoom;
    var h = 16 / zoom;
    ctx.fillStyle = BLUE;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y + 0.5 / zoom);
    ctx.restore();
  }

  function drawSliceGuides(ctx, app, node) {
    var box = node._layout;
    var s = node.backgroundSlice || [40, 40, 40, 40];
    var t = s[0] || 0, r = s[1] || 0, b = s[2] || 0, l = s[3] || 0;
    ctx.save();
    ctx.transform.apply(ctx,root.UrhoxGeom.worldMatrix(app.sourceTree || app.tree,node));
    ctx.strokeStyle = "rgba(46, 204, 113, 0.95)";
    ctx.lineWidth = screenLine(app, 1);
    ctx.setLineDash([4, 3]);
    function line(x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    line(box.x + l, box.y, box.x + l, box.y + box.h);
    line(box.x + box.w - r, box.y, box.x + box.w - r, box.y + box.h);
    line(box.x, box.y + t, box.x + box.w, box.y + t);
    line(box.x, box.y + box.h - b, box.x + box.w, box.y + box.h - b);
    ctx.restore();
  }

  function drawOverlay(ctx, app, node, kind) {
    var box = node._layout;
    if (!box || box.w <= 0 || box.h <= 0) return;
    ctx.save();
    var tree = root.UrhoxDoc.findByEditorId(app.tree,node._editorId) === node ? app.tree : app.sourceTree || app.tree;
    var matrix = root.UrhoxGeom.worldMatrix(tree, node);
    ctx.transform.apply(ctx, matrix);
    if (kind === "selected") {
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = screenLine(app, 1.5);
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
      var hs = handleSize(app);
      handlesFor(box).forEach(function (h) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = BLUE;
        ctx.lineWidth = screenLine(app, 1.25);
        ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
      });
    } else if (kind === "hover") {
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = screenLine(app, 1);
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
    }
    ctx.restore();
  }

  function paintTree(ctx, node, app) {
    if (!node || node._hidden || !node._layout) return;
    ctx.save();
    ctx.transform.apply(ctx, root.UrhoxGeom.nodeMatrix(node));
    ctx.globalAlpha *= node.opacity == null ? 1 : Math.max(0, Math.min(1, node.opacity));
    paintNode(ctx, node, app);
    if (node.overflow === "hidden" || node.overflow === "scroll") {
      boxPath(ctx, node._layout, node.borderRadius);
      ctx.clip();
    }
    (node.children || []).slice().sort(function (a, b) {
      return (a.zIndex || 0) - (b.zIndex || 0);
    }).forEach(function (child) { paintTree(ctx, child, app); });
    ctx.restore();
  }

  function draw(app) {
    var canvas = app.canvas;
    var ctx = app.ctx;
    var tree = app.tree;
    var screen = app.screen;
    var device = app.device;
    if (!canvas || !ctx || !tree) return;
    var o = app.origin();
    var fit = app.contentTransform();
    var prefab = app.editMode === "prefab";
    var src = window.UrhoxDoc.designSize(tree);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, o.x, o.y);
    if (!prefab) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, screen.width, screen.height);
    }
    ctx.translate(fit.x, fit.y);
    ctx.scale(fit.scale, fit.scale);
    paintTree(ctx, tree, app);
    if (root.UrhoxComparison) root.UrhoxComparison.paint(ctx, app);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!prefab) {
      var bezel = device.bezel || 24;
      ctx.save();
      ctx.fillStyle = "rgba(8, 10, 14, 0.55)";
      ctx.beginPath();
      ctx.rect(o.x - bezel, o.y - bezel, screen.width + bezel * 2, screen.height + bezel * 2);
      ctx.rect(o.x, o.y, screen.width, screen.height);
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 4;
      ctx.strokeRect(o.x - bezel + 2, o.y - bezel + 2, screen.width + bezel * 2 - 4, screen.height + bezel * 2 - 4);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, screen.width - 1, screen.height - 1);
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, src.width - 1, src.height - 1);
      ctx.restore();
    }

    ctx.setTransform(1, 0, 0, 1, o.x + fit.x, o.y + fit.y);
    ctx.scale(fit.scale, fit.scale);
    var selected = app.selected;
    var selectedNodes = app.selectedNodes || [];
    var hover = app.hover;
    if (hover && selectedNodes.indexOf(hover) < 0 && hover._layout && !hover._hidden) {
      drawOverlay(ctx, app, hover, "hover");
      var label = window.UrhoxTree.nodeLabel(hover);
      var text = (label.typeName + (label.name ? " " + label.name : "")).trim();
      if (label.extra) text += "  " + label.extra;
      var hoverBounds=root.UrhoxGeom.visualBounds(app.tree,hover);
      drawLabel(ctx, app, text, hoverBounds.x + hoverBounds.w / 2, hoverBounds.y - 12);
    }
    selectedNodes.forEach(function (node) {
      if (node && node._layout && !node._hidden && node !== selected) drawOverlay(ctx, app, node, "hover");
    });
    if (selected && selected._layout && !selected._hidden) {
      var transform = root.UrhoxTransform;
      drawOverlay(ctx, app, selected, transform ? "hover" : "selected");
      if (transform) {
        var bounds = transform.bounds(app);
        var handles = transform.handles(app);
        if (bounds && handles.length) {
          ctx.save();
          ctx.strokeStyle = BLUE;
          ctx.lineWidth = screenLine(app, 1);
          ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
          handles.forEach(function (h) {
            var hs = handleSize(app);
            ctx.fillStyle = h.id === "rotate" ? BLUE : "#fff";
            if (h.id === "rotate") {
              ctx.beginPath(); ctx.moveTo(h.x, bounds.y); ctx.lineTo(h.x, h.y); ctx.stroke();
              ctx.beginPath(); ctx.arc(h.x, h.y, hs/2, 0, Math.PI*2); ctx.fill();
            } else {
              ctx.fillRect(h.x-hs/2, h.y-hs/2, hs, hs);
              ctx.strokeRect(h.x-hs/2, h.y-hs/2, hs, hs);
            }
          });
          ctx.restore();
        }
      }
      if (selected.backgroundFit === "sliced") drawSliceGuides(ctx, app, selected);
      if (app.drag && app.drag.mode !== "marquee") {
        var box = selected._layout;
        drawLabel(ctx, app, Math.round(box.w) + " × " + Math.round(box.h), box.x + box.w / 2, box.y + box.h + 12);
      }
    }
    if (app.marquee) {
      var mq = window.UrhoxGeom.rect(app.marquee.x, app.marquee.y, app.marquee.w, app.marquee.h);
      ctx.save();
      ctx.fillStyle = "rgba(13, 153, 255, 0.12)";
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = screenLine(app, 1);
      ctx.fillRect(mq.x, mq.y, mq.w, mq.h);
      ctx.strokeRect(mq.x + 0.5, mq.y + 0.5, Math.max(0, mq.w - 1), Math.max(0, mq.h - 1));
      ctx.restore();
    }
    if (app.spacingTarget && selected && selected._layout && app.spacingTarget._layout) {
      var a = root.UrhoxGeom.visualBounds(app.sourceTree || app.tree,selected);
      var b = root.UrhoxGeom.visualBounds(app.tree,app.spacingTarget);
      var sp = window.UrhoxGeom.spacing(a, b);
      ctx.save();
      ctx.strokeStyle = PINK;
      ctx.lineWidth = screenLine(app, 1);
      if (sp.dx) {
        var y = Math.min(a.y + a.h / 2, b.y + b.h / 2);
        var x1 = a.x + a.w < b.x ? a.x + a.w : b.x + b.w;
        var x2 = a.x + a.w < b.x ? b.x : a.x;
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        drawLabel(ctx, app, String(Math.round(sp.dx)), (x1 + x2) / 2, y - 10);
      }
      if (sp.dy) {
        var x = Math.min(a.x + a.w / 2, b.x + b.w / 2);
        var y1 = a.y + a.h < b.y ? a.y + a.h : b.y + b.h;
        var y2 = a.y + a.h < b.y ? b.y : a.y;
        ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
        drawLabel(ctx, app, String(Math.round(sp.dy)), x + 14, (y1 + y2) / 2);
      }
      ctx.restore();
    }
    if (app.guides && app.guides.length) {
      ctx.save();
      ctx.strokeStyle = PINK;
      ctx.lineWidth = screenLine(app, 1);
      app.guides.forEach(function (g) {
        ctx.beginPath();
        if (g.axis === "x") { ctx.moveTo(g.pos + 0.5, -400); ctx.lineTo(g.pos + 0.5, 4000); }
        else { ctx.moveTo(-400, g.pos + 0.5); ctx.lineTo(4000, g.pos + 0.5); }
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!prefab && app.safeArea) {
      var area = app.safeArea;
      ctx.save();
      ctx.strokeStyle = "#38cbb6"; ctx.lineWidth = 2; ctx.setLineDash([10,6]);
      ctx.strokeRect(o.x+area.left, o.y+area.top,
        Math.max(0,screen.width-area.left-area.right), Math.max(0,screen.height-area.top-area.bottom));
      ctx.restore();
    }
  }

  root.UrhoxCanvas = {
    draw: draw,
    handlesFor: handlesFor,
    handleSize: handleSize,
  };
})(window);
