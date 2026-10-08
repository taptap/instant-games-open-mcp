// input.js
// 用途：画布鼠标手势（点选、框选、拖移、缩放手柄）。
(function (root) {
  "use strict";

  var SNAP = 4;

  function pickHits(app, x, y) {
    return window.UrhoxDoc.pickAt(app.tree, x, y, { includeLocked: false, designMode: true }) || [];
  }

  function pickNodeAt(app, x, y, skip) {
    var hits = pickHits(app, x, y);
    if (skip && skip.length) {
      hits = hits.filter(function (node) { return skip.indexOf(node) < 0; });
    }
    return hits[0] || null;
  }

  function hitHandle(app, x, y) {
    if (!app.selected || !app.selected._layout) return null;
    if (app.selected.locked || root.UrhoxDoc.ancestors(app.sourceTree || app.tree, app.selected).some(function (p) {
      return p.locked;
    })) return null;
    var pad = root.UrhoxCanvas.handleSize(app);
    var list = root.UrhoxTransform ? root.UrhoxTransform.handles(app) : root.UrhoxCanvas.handlesFor(app.selected._layout);
    for (var i = 0; i < list.length; i++) {
      if (Math.abs(x - list[i].x) <= pad && Math.abs(y - list[i].y) <= pad) return list[i];
    }
    return null;
  }

  function canvasPoint(app, event) {
    var rect = app.canvas.getBoundingClientRect();
    var o = app.origin();
    var fit = app.contentTransform();
    return {
      x: ((event.clientX - rect.left) * (app.canvas.width / rect.width) - o.x - fit.x) / fit.scale,
      y: ((event.clientY - rect.top) * (app.canvas.height / rect.height) - o.y - fit.y) / fit.scale,
    };
  }

  function nodesInMarquee(app, box) {
    var hits = [];
    window.UrhoxYoga.walk(app.tree, function (node) {
      if (!node._layout || node._hidden || node === app.tree) return;
      if (node.locked || root.UrhoxDoc.ancestors(app.tree, node).some(function (p) { return p.locked; })) return;
      var b = root.UrhoxGeom.visualBounds ? root.UrhoxGeom.visualBounds(app.tree,node) : node._layout;
      if (b.w > 0 && b.h > 0 && b.x >= box.x && b.y >= box.y &&
          b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h) hits.push(node);
    });
    return hits;
  }

  function collectSnapLines(app, except) {
    var src = app.designSize();
    var xs = [0, src.width / 2, src.width];
    var ys = [0, src.height / 2, src.height];
    window.UrhoxYoga.walk(app.tree, function (node) {
      var source = app.sourceNode ? app.sourceNode(node) : node;
      var selected = app.selectedNodes || [except];
      if (!node._layout || node._hidden || selected.indexOf(source) >= 0 ||
          root.UrhoxDoc.ancestors(app.sourceTree || app.tree, source).some(function (p) {
            return selected.indexOf(p) >= 0;
          })) return;
      var b = root.UrhoxGeom.visualBounds ? root.UrhoxGeom.visualBounds(app.tree,node) : node._layout;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    return { xs: xs, ys: ys };
  }

  function snapAxis(edges, lines, tolerance) {
    var best = null;
    edges.forEach(function (edge) {
      lines.forEach(function (line) {
        var delta = line - edge;
        if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta: delta, pos: line };
        }
      });
    });
    return best;
  }

  function beginMoveOrResize(app, node, mode, p, event) {
    var source = app.sourceNode ? app.sourceNode(node) : node;
    if (!source || source.locked || root.UrhoxDoc.ancestors(app.sourceTree || app.tree, source).some(function (p) {
      return p.locked;
    })) return;
    if (window.UrhoxDoc.isGenerated(node) && source && source.$repeat) {
      app.selectNode(source, false);
      return;
    }
    var box = node._layout;
    if (!box) return;
    if (app.beginHistory) app.beginHistory();
    else app.pushHistory();
    app.drag = {
      pointerId: event.pointerId,
      selectionIds: (app.selectedNodes || []).map(root.UrhoxDoc.getEditorId),
      node: source,
      mode: mode,
      startX: p.x,
      startY: p.y,
      origX: box.x,
      origY: box.y,
      origW: box.w,
      origH: box.h,
      origs: (app.selectedNodes || []).filter(function (n) {
        return n && n !== (app.sourceTree || app.tree) && n._layout && !n.locked &&
          !root.UrhoxDoc.isGenerated(n) && !root.UrhoxDoc.ancestors(app.sourceTree || app.tree, n).some(function (p) {
          return p.locked || (app.selectedNodes || []).indexOf(p) >= 0;
        });
      }).map(function (n) {
        return { node: n, x: n._layout.x, y: n._layout.y, w: n._layout.w, h: n._layout.h };
      }),
      duplicate: event.altKey && mode === "move",
    };
    if (root.UrhoxTransform && mode !== "move") {
      app.drag.transformItems = root.UrhoxTransform.capture(app);
      app.drag.transformBounds = root.UrhoxTransform.bounds(app);
      app.drag.transformCenter = root.UrhoxTransform.center(app, app.drag.transformItems);
      app.drag.visualScale = app.drag.transformItems.length > 1 ||
        DHasTransform(source, app.sourceTree || app.tree);
    }
    if (app.drag.duplicate) {
      var copies = [];
      app.drag.origs.forEach(function (item) {
        var copy = root.UrhoxDoc.cloneForPaste(item.node);
        var parent = root.UrhoxDoc.parentOf(app.sourceTree || app.tree, item.node) || app.sourceTree || app.tree;
        parent.children = parent.children || [];
        parent.children.push(copy);
        copies.push(copy);
      });
      app.ensureKeys();
      app.rebuildPreview();
      app.setSelection(copies);
      app.drag.node = app.selected;
      app.drag.origs = (app.selectedNodes || []).filter(function (n) { return n && n._layout; }).map(function (n) {
        return { node: n, x: n._layout.x, y: n._layout.y, w: n._layout.w, h: n._layout.h };
      });
    }
  }

  function DHasTransform(node, tree) {
    return [node].concat(root.UrhoxDoc.ancestors(tree,node)).some(function (n) {
      var value=root.UrhoxGeom.transformValue || function (node,key) { return node[key]; };
      return value(n,"rotate") || (value(n,"scale") != null && value(n,"scale") !== 1) ||
        value(n,"translateX") || value(n,"translateY");
    });
  }

  function setCursor(app, name) {
    var preview = document.getElementById("preview");
    if (!preview) return;
    preview.classList.remove("moving", "nwse", "nesw", "ew", "ns", "rotating");
    if (name) preview.classList.add(name);
  }

  function bind(app) {
    var canvas = app.canvas;
    var previewEl = document.getElementById("preview");
    if (previewEl) previewEl.addEventListener("contextmenu", function (event) {
      if (event.target !== previewEl || !root.UrhoxContextMenu || !app.tree) return;
      event.preventDefault();
      root.UrhoxContextMenu.nodes([], event.clientX, event.clientY, true);
    });
    canvas.addEventListener("contextmenu",function (event) {
      if (!app.tree || !root.UrhoxWorkbench) return;
      event.preventDefault(); event.stopPropagation();
      var p=canvasPoint(app,event),nodes=[];
      pickHits(app,p.x,p.y).forEach(function (n) {
        var source=app.sourceNode ? app.sourceNode(n) : n;
        if (nodes.indexOf(source)<0) nodes.push(source);
      });
      if (root.UrhoxContextMenu) root.UrhoxContextMenu.nodes(nodes,event.clientX,event.clientY,true);
    });
    function beginMarquee(event) {
      var p = canvasPoint(app, event);
      var seed = (app.selectedNodes || []).slice();
      if (!event.shiftKey) app.enterPickMode();
      app.drag = { mode: "marquee", pointerId: event.pointerId, startX: p.x, startY: p.y, additive: event.shiftKey, seed: seed };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    canvas.addEventListener("pointermove", function (event) {
      if (!app.tree || app.drag) return;
      if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
      var p = canvasPoint(app, event);
      var handle = hitHandle(app, p.x, p.y);
      if (handle) { setCursor(app, handle.cursor); return; }
      var hit = pickNodeAt(app, p.x, p.y);
      app.spacingTarget = event.altKey && app.selected && hit && hit !== app.selected ? hit : null;
      setCursor(app, hit && app.isSelected(hit) ? "moving" : "");
      if (hit !== app.hover || app.spacingTarget) {
        app.hover = hit;
        app.draw();
      }
    });

    if (previewEl) {
      previewEl.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
        if (event.target !== previewEl) return;
        if (app.createKind) {
          var p = canvasPoint(app, event);
          window.UrhoxCommands.createNode(app, app.createKind, Math.round(p.x), Math.round(p.y));
          if (window.UrhoxPreview && window.UrhoxPreview.setCreateKind) window.UrhoxPreview.setCreateKind(null);
          return;
        }
        if (app.tree) beginMarquee(event);
      });
      function onImageDragOver(event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
      function onImageDrop(event) {
        var raw = event.dataTransfer && event.dataTransfer.getData("text/plain");
        if (!raw || raw.indexOf("urhox-image:") !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        var p = canvasPoint(app, event);
        window.UrhoxCommands.createImageFromAsset(app, raw.slice("urhox-image:".length), Math.round(p.x), Math.round(p.y));
      }
      previewEl.addEventListener("dragover", onImageDragOver);
      previewEl.addEventListener("drop", onImageDrop);
      canvas.addEventListener("dragover", onImageDragOver);
      canvas.addEventListener("drop", onImageDrop);
    }

    canvas.addEventListener("pointerleave", function () {
      app.hover = null;
      setCursor(app, "");
      if (app.tree && !app.drag) app.draw();
    });

    canvas.addEventListener("dblclick", function (event) {
      if (!app.tree) return;
      var p = canvasPoint(app, event);
      var target = app.selected || pickNodeAt(app, p.x, p.y);
      if (!target) return;
      var child = pickHits(app,p.x,p.y).find(function (node) {
        return node !== target && root.UrhoxDoc.ancestors(app.tree,node).indexOf(target)>=0;
      });
      if (child) app.selectNode(child, false);
    });

    canvas.addEventListener("pointerdown", function (event) {
      if (!app.tree || event.button !== 0) return;
      if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
      event.preventDefault();
      var p = canvasPoint(app, event);
      if (event.metaKey || event.ctrlKey) {
        var all = pickHits(app,p.x,p.y);
        var current = all.findIndex(function (n) { return app.isSelected(n); });
        if (all.length) app.selectNode(all[(current+1)%all.length], false);
        return;
      }
      if (app.createKind) {
        window.UrhoxCommands.createNode(app, app.createKind, Math.round(p.x), Math.round(p.y));
        if (window.UrhoxPreview && window.UrhoxPreview.setCreateKind) window.UrhoxPreview.setCreateKind(null);
        return;
      }
      var handle = hitHandle(app, p.x, p.y);
      if (handle && app.selected) {
        beginMoveOrResize(app, app.selected, handle.id, p, event);
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      var hit = pickNodeAt(app, p.x, p.y);
      if (!hit) {
        beginMarquee(event);
        return;
      }
      if (hit.locked) {
        app.selectNode(app.sourceNode ? app.sourceNode(hit) : hit, true);
        return;
      }
      if (event.shiftKey) {
        app.selectNode(hit, false, true);
        if (!app.isSelected(hit)) return;
      }
      else if (!app.isSelected(hit)) app.selectNode(hit, false);
      beginMoveOrResize(app, hit, "move", p, event);
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!app.drag) return;
      var p = canvasPoint(app, event);
      var dx = p.x - app.drag.startX;
      var dy = p.y - app.drag.startY;
      if (app.drag.mode === "marquee") {
        app.marquee = { x: app.drag.startX, y: app.drag.startY, w: dx, h: dy };
        var box = window.UrhoxGeom.rect(app.marquee.x, app.marquee.y, app.marquee.w, app.marquee.h);
        var hits = nodesInMarquee(app, box);
        app.setSelection(app.drag.additive ? app.drag.seed.concat(hits) : hits);
        app.draw();
        return;
      }
      var mode = app.drag.mode;
      if (root.UrhoxTransform && (mode === "rotate" || (mode !== "move" && app.drag.visualScale))) {
        var center = app.drag.transformCenter, factor = 1, angle = 0;
        if (mode === "rotate") {
          angle = (Math.atan2(p.y-center.y,p.x-center.x) -
            Math.atan2(app.drag.startY-center.y,app.drag.startX-center.x))*180/Math.PI;
          if (event.shiftKey) angle = Math.round(angle/15)*15;
        } else {
          var b = app.drag.transformBounds;
          center = event.altKey ? {x:b.x+b.w/2,y:b.y+b.h/2} : {
            x:mode.includes("w") ? b.x+b.w : mode.includes("e") ? b.x : b.x+b.w/2,
            y:mode.includes("n") ? b.y+b.h : mode.includes("s") ? b.y : b.y+b.h/2 };
          var vx = app.drag.startX-center.x, vy = app.drag.startY-center.y;
          factor = Math.max(0.01, ((p.x-center.x)*vx+(p.y-center.y)*vy)/Math.max(1,vx*vx+vy*vy));
        }
        root.UrhoxTransform.apply(app,app.drag.transformItems,center,factor,angle);
        app.rebuildPreview(); app.draw();
        return;
      }
      var lockX = false, lockY = false;
      if (event.shiftKey && mode === "move") {
        if (Math.abs(dx) > Math.abs(dy)) { dy = 0; lockY = true; }
        else { dx = 0; lockX = true; }
      }
      var worldX = app.drag.origX + (mode === "move" ? dx : 0);
      var worldY = app.drag.origY + (mode === "move" ? dy : 0);
      if (mode === "move") {
        (app.drag.origs || []).forEach(function (item) {
          var src = app.sourceNode ? app.sourceNode(item.node) : item.node;
          var ddx = dx, ddy = dy;
          if (root.UrhoxGeom.worldMatrix) {
            var parent = root.UrhoxDoc.parentOf(app.sourceTree || app.tree, src);
            var inv = parent && root.UrhoxGeom.inverse(root.UrhoxGeom.worldMatrix(app.sourceTree || app.tree,parent));
            if (inv) { ddx=inv[0]*dx+inv[2]*dy; ddy=inv[1]*dx+inv[3]*dy; }
          }
          root.UrhoxDoc.moveWorldRect(app.sourceTree || app.tree, src, item.x + ddx, item.y + ddy);
        });
      } else {
        var next = window.UrhoxGeom.resizeRect(
          { x: app.drag.origX, y: app.drag.origY, w: app.drag.origW, h: app.drag.origH },
          mode, dx, dy, { shift: event.shiftKey, alt: event.altKey }
        );
        worldX = next.x;
        worldY = next.y;
        var srcNode = app.sourceNode ? app.sourceNode(app.drag.node) : app.drag.node;
        root.UrhoxDoc.applyWorldRect(app.sourceTree || app.tree, srcNode, next.x, next.y, next.w, next.h);
      }
      app.guides = [];
      var lines = collectSnapLines(app, app.drag.node);
      if (mode === "move" && !(app.drag.origs || []).some(function (item) {
        return DHasTransform(item.node, app.sourceTree || app.tree);
      })) {
        var lead = (app.drag.origs && app.drag.origs[0]) || { x: app.drag.origX, y: app.drag.origY, w: app.drag.origW, h: app.drag.origH };
        var x = lead.x + dx, y = lead.y + dy, w = lead.w, h = lead.h;
        var rect = canvas.getBoundingClientRect();
        var tolerance = SNAP * canvas.width / rect.width / app.contentTransform().scale;
        var snapX = lockX ? null : snapAxis([x, x + w / 2, x + w], lines.xs, tolerance);
        var snapY = lockY ? null : snapAxis([y, y + h / 2, y + h], lines.ys, tolerance);
        var sx = snapX ? snapX.delta : 0, sy = snapY ? snapY.delta : 0;
        if (snapX) app.guides.push({ axis: "x", pos: snapX.pos });
        if (snapY) app.guides.push({ axis: "y", pos: snapY.pos });
        if (sx || sy) {
          (app.drag.origs || []).forEach(function (item) {
            var src = app.sourceNode ? app.sourceNode(item.node) : item.node;
            root.UrhoxDoc.moveWorldRect(app.sourceTree || app.tree, src, item.x + dx + sx, item.y + dy + sy);
          });
        }
      }
      if (app.rebuildPreview) app.rebuildPreview();
      app.draw();
    });

    function finishDrag(event, cancel) {
      if (!app.drag) return;
      var drag = app.drag;
      if (event && event.pointerId != null && event.pointerId !== drag.pointerId) return;
      var marquee = drag.mode === "marquee";
      app.drag = null;
      app.marquee = null;
      app.guides = [];
      if (cancel) {
        if (marquee) app.setSelection(drag.seed);
        else if (app.cancelHistory) app.cancelHistory(drag.selectionIds);
      } else if (!marquee && app.commitHistory) app.commitHistory();
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(drag.pointerId)) {
        canvas.releasePointerCapture(drag.pointerId);
      }
      setCursor(app, "");
      if (app.rebuildPreview) app.rebuildPreview();
      else if (app.layout) app.layout();
      app.draw();
      app.refreshInspector();
      app.updateMeta();
    }
    canvas.addEventListener("pointerup", function (event) { finishDrag(event, false); });
    canvas.addEventListener("pointercancel", function (event) { finishDrag(event, true); });
    canvas.addEventListener("lostpointercapture", function (event) { finishDrag(event, true); });
    window.addEventListener("blur", function () { finishDrag(null, true); });
    window.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !app.drag) return;
      event.preventDefault();
      event.stopPropagation();
      finishDrag(null, true);
    }, true);
  }

  root.UrhoxInput = { bind: bind, snapAxis: snapAxis };
})(window);
