// commands.js
// 用途：改文档树的编辑命令。不绑 canvas 事件。
(function (root) {
  "use strict";

  function Doc() {
    return root.UrhoxDoc;
  }

  function cloneForPaste(node) {
    return Doc().cloneForPaste(node);
  }

  function sourceRoot(app) {
    return app.sourceTree || app.tree;
  }

  function parentOf(app, node) {
    return Doc().parentOf(sourceRoot(app), node);
  }

  function afterChange(app, selected) {
    if (app.rebuildPreview) app.rebuildPreview();
    app.ensureKeys();
    app.layout();
    if (selected !== undefined) {
      if (Array.isArray(selected)) app.setSelection(selected);
      else if (selected) app.selectNode(selected);
      else app.setSelection([]);
    }
    app.refresh();
  }

  function worldRect(app, node) {
    return Doc().getWorldRect(app.tree, node);
  }

  function commandNodes(app, explicit, destructive) {
    var tree = sourceRoot(app);
    var selected = explicit || app.selectedNodes || (app.selected ? [app.selected] : []);
    if (!tree || !selected.length || selected.some(function (node) {
      return !node || node === tree || !parentOf(app, node) || Doc().isGenerated(node) ||
        node.locked || Doc().ancestors(tree, node).some(function (p) { return p.locked; });
    })) return [];
    var nodes = [];
    Doc().walk(tree, function (node) {
      if (selected.indexOf(node) >= 0 && !Doc().ancestors(tree, node).some(function (p) {
        return selected.indexOf(p) >= 0;
      })) nodes.push(node);
    });
    if (destructive) {
      var locked = false;
      nodes.forEach(function (node) {
        Doc().walk(node, function (child) { if (child.locked) locked = true; });
      });
      if (locked) return [];
    }
    return nodes;
  }

  function copiesFor(app, nodes) {
    var used = new Set();
    Doc().walk(sourceRoot(app), function (node) { if (node.id) used.add(node.id); });
    return nodes.map(function (node) {
      var copy = cloneForPaste(node);
      Doc().walk(copy, function (child) {
        if (!child.id) return;
        var base = child.id, suffix = 2;
        while (used.has(child.id)) child.id = base + "_" + suffix++;
        used.add(child.id);
      });
      return copy;
    });
  }

  function offsetCopies(app, copies) {
    if (app.rebuildPreview) app.rebuildPreview();
    app.layout();
    copies.forEach(function (copy) {
      if (copy.position !== "absolute") return;
      var box = worldRect(app, copy);
      Doc().moveWorldRect(sourceRoot(app), copy, box.x + 16, box.y + 16);
    });
  }

  function groupTargets(app) {
    var nodes = commandNodes(app, null, true);
    if (!nodes.length) return [];
    var parent = parentOf(app, nodes[0]);
    return nodes.every(function (node) {
      return parentOf(app, node) === parent && node.position === "absolute";
    }) ? nodes : [];
  }

  function canPreserveTransform(app, node) {
    var g=root.UrhoxGeom, tree=sourceRoot(app);
    if (!g || !g.worldMatrix || !node._layout) return true;
    return !!g.inverse(g.worldMatrix(tree,node)) && ![node].concat(Doc().ancestors(tree,node)).some(function (n) {
      return ["rotate","scale","translateX","translateY","transformOrigin"].some(function (key) {
        return typeof n[key] === "string" && n[key].charAt(0) === "$";
      });
    });
  }

  function visualFrame(app, node) {
    var g=root.UrhoxGeom, b=node._layout;
    return g && g.worldMatrix && b ? g.multiply(g.worldMatrix(sourceRoot(app),node),[1,0,0,1,b.x,b.y]) : null;
  }

  function restoreVisualFrame(app, node, frame) {
    if (!frame || !node._layout) return;
    var g=root.UrhoxGeom, b=node._layout, parent=parentOf(app,node);
    var inverse=parent ? g.inverse(g.worldMatrix(sourceRoot(app),parent)) : [1,0,0,1,0,0];
    if (!inverse) return;
    var matrix=g.multiply(g.multiply(inverse,frame),[1,0,0,1,-b.x,-b.y]);
    var current=g.nodeMatrix(node);
    if (matrix.every(function (v,i) { return Math.abs(v-current[i])<1e-7; })) return;
    // Uniform engine transforms have no skew. Recover their local parameters after reparenting.
    var scale=Math.hypot(matrix[0],matrix[1]), angle=Math.atan2(matrix[1],matrix[0])*180/Math.PI;
    var o=g.pivot(node), linear=[matrix[0],matrix[1],matrix[2],matrix[3],0,0];
    var translation=g.point(g.inverse(linear),{
      x:matrix[4]-o.x+matrix[0]*o.x+matrix[2]*o.y,
      y:matrix[5]-o.y+matrix[1]*o.x+matrix[3]*o.y
    });
    node.rotate=angle; node.scale=scale;
    node.translateX=translation.x; node.translateY=translation.y;
  }

  function ungroupTarget(app) {
    var selected = app.selectedNodes || (app.selected ? [app.selected] : []);
    if (selected.length !== 1) return null;
    var nodes = commandNodes(app, selected, true);
    var node = nodes[0];
    return node && node.position === "absolute" && node.children && node.children.length && node.children.every(function (child) {
      return child.position === "absolute" && !Doc().isGenerated(child) && canPreserveTransform(app,child);
    }) ? node : null;
  }

  function placeWorldRects(app, nodes, worlds) {
    nodes.forEach(function (node, i) { Doc().setWorldRect(sourceRoot(app), node, worlds[i]); });
    if (app.rebuildPreview) app.rebuildPreview();
    app.layout();
    // Measured positions include borders and margins; correct those origins after reparenting.
    nodes.forEach(function (node, i) {
      Doc().moveWorldRect(sourceRoot(app), node, worlds[i].x, worlds[i].y);
    });
  }

  function canReparent(app, node, newParent) {
    var tree = sourceRoot(app);
    if (!node || !newParent || node === tree || node === newParent) return false;
    if (!parentOf(app, node) || (newParent !== tree && !parentOf(app, newParent))) return false;
    if (Doc().isGenerated(node) || Doc().isGenerated(newParent)) return false;
    if ([node, newParent].some(function (n) {
      return n.locked || Doc().ancestors(tree, n).some(function (p) { return p.locked; });
    })) return false;
    if (parentOf(app,node) !== newParent && (!canPreserveTransform(app,node) || !canPreserveTransform(app,newParent))) return false;
    return Doc().ancestors(tree, newParent).indexOf(node) < 0;
  }

  root.UrhoxCommands = {
    contextState: function (app) {
      var tree = sourceRoot(app), selected = app.selectedNodes || [], node = app.selected;
      var parent = node || tree;
      var inheritedLock = node && Doc().ancestors(tree, node).some(function (n) { return n.locked; });
      var editable = !!node && !node.locked && !inheritedLock && !Doc().isGenerated(node);
      var canAdd = !!parent && !parent.locked && !Doc().isGenerated(parent) && !inheritedLock &&
        !parent.component && !parent.$repeat && parent.type !== "Label";
      var nodes = commandNodes(app);
      var arrange = nodes.length === selected.length && nodes.length >= 2 && nodes.every(function (n) {
        return n.position === "absolute" && [n].concat(Doc().ancestors(tree, n)).every(function (p) {
          var g = root.UrhoxGeom;
          return !g.transformValue(p, "rotate") && !g.transformValue(p, "translateX") &&
            !g.transformValue(p, "translateY") && (g.transformValue(p, "scale") == null || g.transformValue(p, "scale") === 1);
        });
      });
      return {
        copy: nodes.length > 0, duplicate: nodes.length > 0, remove: commandNodes(app, null, true).length > 0,
        rename: selected.length === 1 && editable, visibility: selected.length === 1 && editable,
        lock: selected.length === 1 && !inheritedLock && !Doc().isGenerated(node),
        add: selected.length <= 1 && canAdd,
        paste: selected.length <= 1 && canAdd && !!app.clipboard && app.clipboard.length > 0,
        group: groupTargets(app).length > 0, ungroup: !!ungroupTarget(app),
        align: arrange, distribute: arrange && nodes.length >= 3,
        image: selected.length === 1 && editable && node.type !== "Label",
      };
    },
    canReparent: canReparent,
    deleteTargets: function (app, nodes) { return commandNodes(app, nodes, true); },
    canGroup: function (app) { return groupTargets(app).length > 0; },
    canUngroup: function (app) { return !!ungroupTarget(app); },
    nudge: function (app, dx, dy) {
      var nodes = (app.selectedNodes || [app.selected]).filter(function (node) {
        return node && node !== sourceRoot(app) && !node.locked && !Doc().isGenerated(node) &&
          !Doc().ancestors(sourceRoot(app), node).some(function (p) {
            return p.locked || (app.selectedNodes || []).indexOf(p) >= 0;
          });
      });
      if (!nodes.length) return;
      app.pushHistory();
      nodes.forEach(function (node) {
        var box = worldRect(app, node);
        var x=dx,y=dy,parent=parentOf(app,node),g=root.UrhoxGeom;
        if (parent && g && g.worldMatrix) {
          var inverse=g.inverse(g.worldMatrix(sourceRoot(app),parent));
          if (!inverse) return;
          x=inverse[0]*dx+inverse[2]*dy; y=inverse[1]*dx+inverse[3]*dy;
        }
        Doc().moveWorldRect(sourceRoot(app), node, box.x + x, box.y + y);
      });
      afterChange(app);
    },

    duplicate: function (app) {
      var nodes = commandNodes(app);
      if (!nodes.length) return;
      var copies = copiesFor(app, nodes);
      app.pushHistory();
      nodes.forEach(function (node, i) {
        var parent = parentOf(app, node);
        parent.children.splice(parent.children.indexOf(node) + 1, 0, copies[i]);
      });
      offsetCopies(app, copies);
      afterChange(app, copies);
    },

    remove: function (app, explicit) {
      var nodes = commandNodes(app, explicit, true);
      if (!nodes.length) return false;
      var parents = nodes.map(function (node) { return parentOf(app, node); });
      app.pushHistory();
      nodes.forEach(function (node, i) {
        parents[i].children = parents[i].children.filter(function (child) { return child !== node; });
      });
      var parent = parents.every(function (p) { return p === parents[0]; }) ? parents[0] : null;
      afterChange(app, parent === sourceRoot(app) ? null : parent);
      return true;
    },

    copy: function (app) {
      var nodes = commandNodes(app);
      if (!nodes.length) return;
      app.clipboard = nodes.map(function (node) { return root.UrhoxHistory.cloneNode(node); });
    },

    cut: function (app) {
      var nodes = commandNodes(app, null, true);
      if (!nodes.length) return;
      var clipboard = nodes.map(function (node) { return root.UrhoxHistory.cloneNode(node); });
      if (this.remove(app, nodes)) app.clipboard = clipboard;
    },

    paste: function (app) {
      if (!app.clipboard || !sourceRoot(app)) return;
      var parent = app.selected || sourceRoot(app);
      if (Doc().isGenerated(parent) || parent.locked ||
        (parent !== sourceRoot(app) && !parentOf(app, parent)) ||
        Doc().ancestors(sourceRoot(app), parent).some(function (p) { return p.locked; })) return;
      var nodes = Array.isArray(app.clipboard) ? app.clipboard : [app.clipboard];
      if (!nodes.length) return;
      var copies = copiesFor(app, nodes);
      app.pushHistory();
      parent.children = parent.children || [];
      copies.forEach(function (copy) { parent.children.push(copy); });
      offsetCopies(app, copies);
      afterChange(app, copies);
    },

    setVisible: function (app, node, visible) {
      if (!node) return;
      app.pushHistory();
      node.visible = visible !== false;
      afterChange(app);
    },

    toggleVisible: function (app) {
      if (!app.selected) return;
      this.setVisible(app, app.selected, app.selected.visible === false);
    },

    toggleLocked: function (app) {
      if (!app.selected) return;
      app.pushHistory();
      app.selected.locked = !app.selected.locked;
      afterChange(app);
    },

    rename: function (app) {
      if (!app.selected) return;
      var next = window.prompt("节点名称", app.selected.id || "");
      if (next == null) return;
      app.pushHistory();
      app.selected.id = next;
      afterChange(app);
    },

    align: function (app, mode) {
      var nodes = (app.selectedNodes || []).filter(function (n) { return n && !Doc().isGenerated(n); });
      if (nodes.length < 2) return;
      app.pushHistory();
      var rects = window.UrhoxGeom.alignRects(nodes.map(function (n) { return worldRect(app, n); }), mode);
      nodes.forEach(function (node, i) {
        if (node && rects[i]) Doc().setWorldRect(sourceRoot(app), node, rects[i]);
      });
      afterChange(app);
    },

    distribute: function (app, axis) {
      var nodes = (app.selectedNodes || []).filter(function (n) { return n && !Doc().isGenerated(n); });
      if (nodes.length < 3) return;
      app.pushHistory();
      var rects = window.UrhoxGeom.distributeRects(nodes.map(function (n) { return worldRect(app, n); }), axis);
      nodes.forEach(function (node, i) {
        if (node && rects[i]) Doc().setWorldRect(sourceRoot(app), node, rects[i]);
      });
      afterChange(app);
    },

    reparent: function (app, node, newParent, index) {
      if (!canReparent(app, node, newParent)) return false;
      var oldParent = parentOf(app, node);
      var sameParent = oldParent === newParent;
      if (sameParent && index == null) return false;
      var oldIndex = oldParent.children.indexOf(node);
      var next = index == null ? (newParent.children || []).length : index;
      if (sameParent && oldIndex < next) next -= 1;
      next = Math.max(0, Math.min((newParent.children || []).length - (sameParent ? 1 : 0), next));
      if (sameParent && next === oldIndex) return false;
      var world = worldRect(app, node);
      var visual = visualFrame(app,node);
      app.pushHistory();
      oldParent.children = (oldParent.children || []).filter(function (c) { return c !== node; });
      newParent.children = newParent.children || [];
      newParent.children.splice(next, 0, node);
      if (!sameParent && node.position === "absolute") {
        Doc().setWorldRect(sourceRoot(app), node, world);
        if (app.rebuildPreview) app.rebuildPreview();
        app.layout();
        // Correct the new containing block's border origin using measured bounds.
        Doc().moveWorldRect(sourceRoot(app), node, world.x, world.y);
        restoreVisualFrame(app,node,visual);
      }
      afterChange(app, node);
      return true;
    },

    moveLayer: function (app, delta, extreme) {
      var node = app.selected;
      if (!node) return;
      var parent = parentOf(app, node);
      if (!parent || !parent.children) return;
      var list = parent.children.slice();
      var i = list.indexOf(node);
      if (i < 0) return;
      list.splice(i, 1);
      var next = extreme ? (delta > 0 ? list.length : 0) : Math.max(0, Math.min(list.length, i + delta));
      list.splice(next, 0, node);
      app.pushHistory();
      parent.children = list;
      afterChange(app);
    },

    group: function (app) {
      var nodes = groupTargets(app);
      if (!nodes.length) return;
      var parent = parentOf(app, nodes[0]);
      var index = parent.children.indexOf(nodes[0]);
      var worlds = nodes.map(function (n) { return worldRect(app, n); });
      var b = window.UrhoxGeom.boundsOf(worlds);
      if (!b) return;
      app.pushHistory();
      var group = {
        type: "Panel",
        id: "group",
        position: "absolute",
        width: b.w,
        height: b.h,
        backgroundColor: false,
        children: [],
      };
      var names = new Set();
      Doc().walk(sourceRoot(app), function (node) { if (node.id) names.add(node.id); });
      var suffix = 2;
      while (names.has(group.id)) group.id = "group_" + suffix++;
      if (nodes.every(function (node) { return node.zIndex === nodes[0].zIndex; }) &&
        nodes[0].zIndex != null) group.zIndex = nodes[0].zIndex;
      Doc().ensureEditorIds(group);
      nodes.forEach(function (n) {
        parent.children = (parent.children || []).filter(function (c) { return c !== n; });
        group.children.push(n);
      });
      parent.children = parent.children || [];
      parent.children.splice(index, 0, group);
      if (app.rebuildPreview) app.rebuildPreview();
      app.layout();
      placeWorldRects(app, [group], [b]);
      if (app.rebuildPreview) app.rebuildPreview();
      app.layout();
      placeWorldRects(app, nodes, worlds);
      afterChange(app, group);
    },

    ungroup: function (app) {
      var node = ungroupTarget(app);
      if (!node) return;
      var parent = parentOf(app, node);
      if (!parent) return;
      app.pushHistory();
      var kids = node.children.slice();
      var worlds = kids.map(function (kid) { return worldRect(app, kid); });
      var visuals = kids.map(function (kid) { return visualFrame(app,kid); });
      parent.children.splice.apply(parent.children, [parent.children.indexOf(node), 1].concat(kids));
      if (app.rebuildPreview) app.rebuildPreview();
      app.layout();
      placeWorldRects(app, kids, worlds);
      kids.forEach(function (kid,i) { restoreVisualFrame(app,kid,visuals[i]); });
      afterChange(app, kids);
    },

    selectParent: function (app) {
      if (!app.selected) return;
      var parent = parentOf(app, app.selected);
      if (parent && parent !== app.tree) app.selectNode(parent);
    },

    selectChild: function (app) {
      if (!app.selected || !app.selected.children || !app.selected.children.length) return;
      app.selectNode(app.selected.children[0]);
    },

    createNode: function (app, kind, x, y, parent) {
      if (!sourceRoot(app)) return null;
      parent = parent || app.selected || sourceRoot(app);
      if (Doc().isGenerated(parent)) parent = sourceRoot(app);
      if (parent.type === "Label") parent = parentOf(app, parent) || sourceRoot(app);
      var box = parent._layout || { x: 0, y: 0, w: 200, h: 80 };
      if (x == null) x = box.x + 16;
      if (y == null) y = box.y + 16;
      var node;
      if (kind === "Label") {
        node = { type: "Label", id: "label", position: "absolute", left: 0, top: 0, width: 200, height: 48, text: "文本", fontSize: 28, fontColor: "#62364D", textAlign: "center", verticalAlign: "middle" };
      } else if (kind === "Button") {
        node = {
          type: "Button",
          id: "button",
          position: "absolute",
          left: 0,
          top: 0,
          width: 200,
          height: 72,
          text: "按钮",
          fontSize: 24,
          fontColor: "#FFFFFF",
          textAlign: "center",
          verticalAlign: "middle",
          backgroundColor: "#FF6F97",
          borderRadius: 24,
          borderWidth: 0,
          hoverOpacity: 1,
          pressedOpacity: 0.86,
        };
      } else if (kind === "NanoVG") {
        node = { type: "NanoVG", id: "vector", position: "absolute", left: 0, top: 0,
          width: 240, height: 160, viewBox: [0, 0, 240, 160], commands: [
            ["beginPath"], ["roundedRect", 2, 2, 236, 156, 18],
            ["fillPaint", { kind: "linearGradient", args: [0, 0, 240, 160, "#164e63", "#22a899"] }],
            ["fill"], ["strokeColor", "#a7f3d0"], ["strokeWidth", 2], ["stroke"],
          ] };
        var used = new Set(), suffix = 2;
        Doc().walk(sourceRoot(app), function (item) { if (item.id) used.add(item.id); });
        while (used.has(node.id)) node.id = "vector_" + suffix++;
      } else if (kind === "Image") {
        node = { type: "Panel", role: "Image", id: "image", position: "absolute", left: 0, top: 0, width: 160, height: 160, backgroundImage: "", backgroundFit: "contain", backgroundColor: "#CCCCCC55" };
      } else {
        node = { type: "Panel", id: "panel", position: "absolute", left: 0, top: 0, width: 240, height: 160, backgroundColor: "#FFFFFFCC", borderRadius: 16 };
      }
      Doc().ensureEditorIds(node);
      app.pushHistory();
      parent.children = parent.children || [];
      parent.children.push(node);
      if (app.rebuildPreview) app.rebuildPreview();
      app.layout();
      Doc().setWorldRect(sourceRoot(app), node, { x: x, y: y, w: node.width, h: node.height });
      afterChange(app, node);
      return node;
    },

    createImageFromAsset: function (app, ref, x, y) {
      var parent = sourceRoot(app);
      var node = this.createNode(app, "Image", x, y, parent);
      if (!node) return null;
      node.backgroundImage = ref;
      node.backgroundColor = false;
      node.role = "Image";
      afterChange(app, node);
      return node;
    },
  };
})(window);
