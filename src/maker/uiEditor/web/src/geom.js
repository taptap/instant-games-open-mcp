// geom.js
// 用途：框选相交、等比/中心缩放等纯几何计算，供画布与单测共用。
(function (root) {
  "use strict";

  function rect(x, y, w, h) {
    return {
      x: Math.min(x, x + w),
      y: Math.min(y, y + h),
      w: Math.abs(w),
      h: Math.abs(h),
    };
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function boundsOf(rects) {
    if (!rects || !rects.length) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function resizeRect(orig, mode, dx, dy, opts) {
    opts = opts || {};
    var x = orig.x, y = orig.y, w = orig.w, h = orig.h;
    var ratio = orig.w / Math.max(1, orig.h);
    var fromCenter = !!opts.alt;
    var proportional = !!opts.shift && mode !== "move";

    if (mode === "move") {
      return { x: x + dx, y: y + dy, w: w, h: h };
    }

    var left = x, right = x + w, top = y, bottom = y + h;
    if (mode.indexOf("w") >= 0) left += dx;
    if (mode.indexOf("e") >= 0) right += dx;
    if (mode.indexOf("n") >= 0) top += dy;
    if (mode.indexOf("s") >= 0) bottom += dy;

    if (fromCenter) {
      if (mode.indexOf("w") >= 0) right = orig.x + orig.w - (left - orig.x);
      if (mode.indexOf("e") >= 0) left = orig.x - (right - (orig.x + orig.w));
      if (mode.indexOf("n") >= 0) bottom = orig.y + orig.h - (top - orig.y);
      if (mode.indexOf("s") >= 0) top = orig.y - (bottom - (orig.y + orig.h));
    }

    w = right - left;
    h = bottom - top;
    x = left;
    y = top;

    if (proportional && w > 0 && h > 0) {
      var nextW = Math.abs(w);
      var nextH = Math.abs(h);
      if (mode === "n" || mode === "s") nextW = nextH * ratio;
      else if (mode === "e" || mode === "w") nextH = nextW / ratio;
      else if (nextW / nextH > ratio) nextH = nextW / ratio;
      else nextW = nextH * ratio;

      if (mode.indexOf("w") >= 0) x = right - nextW * Math.sign(w || 1);
      else if (mode.indexOf("e") >= 0) x = left;
      else x = orig.x + orig.w / 2 - nextW / 2;

      if (mode.indexOf("n") >= 0) y = bottom - nextH * Math.sign(h || 1);
      else if (mode.indexOf("s") >= 0) y = top;
      else y = orig.y + orig.h / 2 - nextH / 2;

      if (fromCenter) {
        x = orig.x + orig.w / 2 - nextW / 2;
        y = orig.y + orig.h / 2 - nextH / 2;
      }
      w = nextW;
      h = nextH;
    }

    if (w < 1) { x += w - 1; w = 1; }
    if (h < 1) { y += h - 1; h = 1; }
    return { x: x, y: y, w: w, h: h };
  }

  function alignRects(rects, mode) {
    if (!rects || !rects.length) return rects;
    var b = boundsOf(rects);
    return rects.map(function (r) {
      var n = { x: r.x, y: r.y, w: r.w, h: r.h };
      if (mode === "left") n.x = b.x;
      if (mode === "right") n.x = b.x + b.w - r.w;
      if (mode === "hcenter") n.x = b.x + (b.w - r.w) / 2;
      if (mode === "top") n.y = b.y;
      if (mode === "bottom") n.y = b.y + b.h - r.h;
      if (mode === "vcenter") n.y = b.y + (b.h - r.h) / 2;
      return n;
    });
  }

  function distributeRects(rects, axis) {
    if (!rects || rects.length < 3) return rects;
    var sorted = rects.map(function (r, i) { return { r: r, i: i }; });
    sorted.sort(function (a, b) {
      return axis === "x" ? a.r.x - b.r.x : a.r.y - b.r.y;
    });
    var first = sorted[0].r;
    var last = sorted[sorted.length - 1].r;
    var start = axis === "x" ? first.x : first.y;
    var end = axis === "x" ? last.x + last.w : last.y + last.h;
    var size = sorted.reduce(function (s, item) { return s + (axis === "x" ? item.r.w : item.r.h); }, 0);
    var gap = (end - start - size) / (sorted.length - 1);
    var cursor = start;
    var out = rects.slice();
    sorted.forEach(function (item) {
      var n = { x: item.r.x, y: item.r.y, w: item.r.w, h: item.r.h };
      if (axis === "x") n.x = cursor;
      else n.y = cursor;
      out[item.i] = n;
      cursor += (axis === "x" ? item.r.w : item.r.h) + gap;
    });
    return out;
  }

  function spacing(a, b) {
    var dx = 0, dy = 0;
    if (a.x + a.w < b.x) dx = b.x - (a.x + a.w);
    else if (b.x + b.w < a.x) dx = a.x - (b.x + b.w);
    if (a.y + a.h < b.y) dy = b.y - (a.y + a.h);
    else if (b.y + b.h < a.y) dy = a.y - (b.y + b.h);
    return { dx: dx, dy: dy };
  }

  function multiply(a, b) {
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
      a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
      a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  }
  function point(m, p) {
    return { x: m[0]*p.x + m[2]*p.y + m[4], y: m[1]*p.x + m[3]*p.y + m[5] };
  }
  function inverse(m) {
    var d = m[0]*m[3]-m[1]*m[2];
    if (Math.abs(d) < 1e-10) return null;
    return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,
      (m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];
  }
  function pivot(node) {
    var b = node._layout, o = transformValue(node,"transformOrigin");
    var pairs = { "top-left":[0,0], "top-right":[1,0], "bottom-left":[0,1], "bottom-right":[1,1],
      top:[0.5,0], bottom:[0.5,1], left:[0,0.5], right:[1,0.5] };
    var f = Array.isArray(o) ? o : pairs[o] || [0.5,0.5];
    return { x: b.x + b.w*(Number.isFinite(f[0]) ? f[0] : 0.5),
      y: b.y + b.h*(Number.isFinite(f[1]) ? f[1] : 0.5) };
  }
  function transformValue(node,key) {
    var value=node[key];
    if ((value == null || typeof value === "string" && value.charAt(0) === "$") && node._previewTransform) {
      return node._previewTransform[key];
    }
    return value;
  }
  function nodeMatrix(node) {
    var o = pivot(node), r = (Number(transformValue(node,"rotate")) || 0)*Math.PI/180;
    var scale=transformValue(node,"scale");
    var s = Number.isFinite(scale) ? scale : 1, c = Math.cos(r)*s, sn = Math.sin(r)*s;
    var tx = Number(transformValue(node,"translateX")) || 0, ty = Number(transformValue(node,"translateY")) || 0;
    return [c,sn,-sn,c,o.x-c*o.x+sn*o.y+c*tx-sn*ty,o.y-sn*o.x-c*o.y+sn*tx+c*ty];
  }
  function worldMatrix(tree, node) {
    var chain = root.UrhoxDoc.ancestors(tree, node).slice().reverse().concat([node]);
    return chain.reduce(function (m, n) { return n._layout ? multiply(m, nodeMatrix(n)) : m; }, [1,0,0,1,0,0]);
  }
  function visualBounds(tree, node) {
    var b = node._layout, m = worldMatrix(tree, node);
    return boundsOf([{x:b.x,y:b.y}, {x:b.x+b.w,y:b.y}, {x:b.x,y:b.y+b.h}, {x:b.x+b.w,y:b.y+b.h}]
      .map(function (p) { var v = point(m,p); return {x:v.x,y:v.y,w:0,h:0}; }));
  }

  root.UrhoxGeom = {
    rect: rect,
    intersects: intersects,
    boundsOf: boundsOf,
    resizeRect: resizeRect,
    alignRects: alignRects,
    distributeRects: distributeRects,
    spacing: spacing,
    multiply: multiply, point: point, inverse: inverse, pivot: pivot,
    nodeMatrix: nodeMatrix, worldMatrix: worldMatrix, visualBounds: visualBounds,
    transformValue: transformValue,
  };
})(typeof window !== "undefined" ? window : global);
