// p0.test.js
// 用途：P0 几何行为单测（框选相交、等比缩放、从中心缩放）。
var fs = require("fs");
var path = require("path");
var code = fs.readFileSync(path.join(__dirname, "../web/src/geom.js"), "utf8");
eval(code);
var G = global.UrhoxGeom;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function almost(a, b, msg) {
  if (Math.abs(a - b) > 0.51) throw new Error(msg + " got " + a + " expected " + b);
}

var a = G.rect(0, 0, 100, 50);
var b = G.rect(90, 10, 20, 20);
assert(G.intersects(a, b), "overlap should intersect");
assert(!G.intersects(a, G.rect(200, 0, 10, 10)), "far rects should not intersect");
assert(G.intersects(G.rect(10, 10, -20, -20), G.rect(0, 0, 5, 5)), "negative drag marquee still intersects");

var bounds = G.boundsOf([{ x: 10, y: 20, w: 30, h: 10 }, { x: 5, y: 8, w: 10, h: 4 }]);
almost(bounds.x, 5, "bounds x");
almost(bounds.y, 8, "bounds y");
almost(bounds.w, 35, "bounds w");
almost(bounds.h, 22, "bounds h");

var orig = { x: 100, y: 100, w: 200, h: 100 };
var se = G.resizeRect(orig, "se", 40, 40, { shift: true });
almost(se.w / se.h, 2, "shift se keeps ratio");
almost(se.x, 100, "se x stays");
almost(se.y, 100, "se y stays");

var e = G.resizeRect(orig, "e", 50, 0, { shift: true });
almost(e.w, 250, "e width");
almost(e.h, 125, "e proportional height");

var altE = G.resizeRect(orig, "e", 40, 0, { alt: true });
almost(altE.w, 280, "alt e grows both sides: 200+80");
almost(altE.x, 60, "alt e x");

var altShift = G.resizeRect(orig, "se", 20, 20, { shift: true, alt: true });
almost(altShift.w / altShift.h, 2, "alt+shift keeps ratio");
almost(altShift.x + altShift.w / 2, 200, "alt+shift keeps center x");
almost(altShift.y + altShift.h / 2, 150, "alt+shift keeps center y");

var widgets = [
  { id: "a", _layout: { x: 0, y: 0, w: 40, h: 40 } },
  { id: "b", _layout: { x: 80, y: 0, w: 40, h: 40 } },
  { id: "c", _layout: { x: 10, y: 80, w: 200, h: 20 } },
];
var marquee = G.rect(0, 0, 50, 50);
var hits = widgets.filter(function (n) { return G.intersects(marquee, n._layout); }).map(function (n) { return n.id; });
assert(hits.indexOf("a") >= 0 && hits.indexOf("b") < 0, "marquee selects overlapping widgets only");

var aligned = G.alignRects(
  [{ x: 10, y: 10, w: 20, h: 10 }, { x: 40, y: 30, w: 20, h: 10 }],
  "left"
);
almost(aligned[0].x, 10, "align left 0");
almost(aligned[1].x, 10, "align left 1");

var dist = G.distributeRects(
  [{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }, { x: 90, y: 0, w: 10, h: 10 }],
  "x"
);
almost(dist[1].x, 45, "distribute middle x");

var sp = G.spacing({ x: 0, y: 0, w: 10, h: 10 }, { x: 40, y: 0, w: 10, h: 10 });
almost(sp.dx, 30, "gap dx");

console.log("p0.test.js passed");
