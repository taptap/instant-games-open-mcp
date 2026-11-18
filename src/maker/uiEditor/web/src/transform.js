(function (root) {
  "use strict";
  var G = root.UrhoxGeom, D = root.UrhoxDoc;
  function dynamicTransform(tree, node) {
    return [node].concat(D.ancestors(tree, node)).some(function (p) {
      return ["rotate","scale","translateX","translateY","transformOrigin","left","top","right","bottom"].some(function (key) {
        return typeof p[key] === "string" && p[key].charAt(0) === "$";
      });
    });
  }
  // A single hidden node can edit stored properties without visual bounds or layout.
  function hiddenTarget(app) {
    var tree = app.sourceTree || app.tree, selected = app.selectedNodes || [];
    var node = selected.length === 1 && selected[0];
    if (!node || !node._hidden || node === tree || node.locked || node.$repeat || D.isGenerated(node) ||
      D.ancestors(tree, node).some(function (p) { return p.locked; }) || dynamicTransform(tree, node)) return null;
    var scale = G.transformValue(node, "scale");
    return scale == null || (Number.isFinite(scale) && scale > 0) ? node : null;
  }
  function disabledReason(app) {
    var tree = app.sourceTree || app.tree, selected = app.selectedNodes || [];
    if (selected.indexOf(tree) >= 0) return "根节点不能旋转或缩放";
    if (selected.some(function (n) { return n.locked || D.ancestors(tree, n).some(function (p) { return p.locked; }); }))
      return "节点或父级已锁定，请先解锁";
    if (selected.some(function (n) { return n.$repeat || D.isGenerated(n); })) return "动态生成节点不能直接变换";
    if (selected.some(function (n) { return D.ancestors(tree, n).some(function (p) { return selected.indexOf(p) >= 0; }); }))
      return "不能同时变换父节点和子节点，请调整选区";
    if (selected.some(function (n) { return dynamicTransform(tree, n); })) return "节点或父级使用动态变换表达式，不能直接变换";
    if (selected.some(function (n) { return n._hidden; })) return "隐藏节点请单独选择后编辑旋转或缩放";
    return "无法计算变换，请检查节点及父级的缩放值";
  }
  function targets(app) {
    var tree = app.sourceTree || app.tree, selection = app.selectedNodes || [];
    return selection.filter(function (n) {
      return n && n !== tree && n._layout && !n._hidden && !n.locked && !n.$repeat &&
        !D.isGenerated(n) && !D.ancestors(tree, n).some(function (p) { return p.locked || selection.indexOf(p) >= 0; });
    });
  }
  function bounds(app) {
    var tree = app.sourceTree || app.tree;
    return G.boundsOf(targets(app).map(function (n) { return G.visualBounds(tree, n); }));
  }
  function capture(app) {
    var tree = app.sourceTree || app.tree;
    return targets(app).filter(function (n) {
      return !dynamicTransform(tree, n);
    }).map(function (n) {
      var parent = D.parentOf(tree, n);
      var pm = parent ? G.worldMatrix(tree, parent) : [1,0,0,1,0,0];
      var pivot = G.pivot(n);
      return { node: n, x: n._layout.x, y: n._layout.y, w: n._layout.w, h: n._layout.h,
        rotate: Number(G.transformValue(n,"rotate")) || 0,
        scale: Number.isFinite(G.transformValue(n,"scale")) ? G.transformValue(n,"scale") : 1,
        rotateValue:n.rotate, scaleValue:n.scale,
        pivot: pivot, worldPivot: G.point(G.worldMatrix(tree, n), pivot), parentInverse: G.inverse(pm) };
    }).filter(function (i) { return i.parentInverse && i.scale > 0; });
  }
  function apply(app, items, center, factor, degrees) {
    var r = degrees*Math.PI/180, c = Math.cos(r), s = Math.sin(r), tree = app.sourceTree || app.tree;
    items.forEach(function (item) {
      var dx = item.worldPivot.x-center.x, dy = item.worldPivot.y-center.y;
      var desired = { x:center.x+factor*(c*dx-s*dy), y:center.y+factor*(s*dx+c*dy) };
      var local = G.point(item.parentInverse, desired), n = item.node;
      if (degrees === 0 && item.rotateValue === undefined) delete n.rotate;
      else n.rotate = Math.round((item.rotate+degrees)*100)/100;
      if (factor === 1 && item.scaleValue === undefined) delete n.scale;
      else n.scale = Math.max(0.001, Math.round(item.scale*factor*100000)/100000);
      var angle = (Number(G.transformValue(n,"rotate"))||0)*Math.PI/180;
      var scale=G.transformValue(n,"scale"); if (scale == null) scale=1;
      var tx = Number(G.transformValue(n,"translateX"))||0, ty = Number(G.transformValue(n,"translateY"))||0;
      local.x -= scale*(Math.cos(angle)*tx-Math.sin(angle)*ty);
      local.y -= scale*(Math.sin(angle)*tx+Math.cos(angle)*ty);
      D.moveWorldRect(tree, n, item.x+local.x-item.pivot.x, item.y+local.y-item.pivot.y);
    });
  }
  function center(app, items) {
    if (items.length === 1) return items[0].worldPivot;
    var b = bounds(app);
    return { x:b.x+b.w/2, y:b.y+b.h/2 };
  }
  function handles(app) {
    var b = bounds(app);
    if (!b) return [];
    var nodes = targets(app);
    if (nodes.length !== (app.selectedNodes || []).length || capture(app).length !== nodes.length) return [];
    var list = root.UrhoxCanvas.handlesFor(b);
    // Transformed shapes use visual scaling; plain single nodes retain layout resizing.
    list.push({ id:"rotate", x:b.x+b.w/2, y:b.y-root.UrhoxCanvas.handleSize(app)*4, cursor:"rotating" });
    return list;
  }
  function command(app, factor, degrees) {
    if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(degrees)) return;
    var hidden = hiddenTarget(app);
    if (hidden) {
      app.beginHistory();
      if (degrees !== 0) hidden.rotate = Math.round(((Number(G.transformValue(hidden, "rotate")) || 0) + degrees)*100)/100;
      if (factor !== 1) {
        var scale = G.transformValue(hidden, "scale");
        hidden.scale = Math.max(0.001, Math.round((scale == null ? 1 : scale)*factor*100000)/100000);
      }
      app.rebuildPreview();
      app.commitHistory();
      app.refresh();
      return;
    }
    var items = capture(app);
    if (!items.length || !Number.isFinite(factor) || factor <= 0 || !Number.isFinite(degrees)) return;
    app.beginHistory();
    apply(app, items, center(app, items), factor, degrees);
    app.rebuildPreview();
    app.commitHistory();
    app.refresh();
  }
  root.UrhoxTransform = { targets: targets, bounds: bounds, capture: capture, apply: apply,
    center: center, handles: handles, command: command, hiddenTarget: hiddenTarget, disabledReason: disabledReason };
})(window);
