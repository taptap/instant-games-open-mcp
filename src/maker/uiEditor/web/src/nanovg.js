// NanoVG command data is replayed, never evaluated as JavaScript or Lua.
(function (root) {
  "use strict";

  function color(value) {
    return typeof value === "string" ? value : "rgba(" + value.slice(0, 3).join(",") + "," + value[3] / 255 + ")";
  }

  function paint(ctx, value, app) {
    var a = value.args, result;
    if (value.kind === "linearGradient") {
      result = ctx.createLinearGradient(a[0], a[1], a[2], a[3]);
    } else if (value.kind === "radialGradient") {
      result = ctx.createRadialGradient(a[0], a[1], a[2], a[0], a[1], a[3]);
    } else {
      var img = root.UrhoxAssets.loadImage(a[5], app.draw);
      if (!img.complete || !img.naturalWidth) return { style: "transparent", alpha: 1 };
      result = ctx.createPattern(img, "repeat");
      var matrix = ctx.getTransform().multiply(new DOMMatrix().translate(a[0], a[1])
        .rotate(a[4] * 180 / Math.PI).scale(a[2] / img.naturalWidth, a[3] / img.naturalHeight));
      return { style: result || "transparent", alpha: a[6], pattern: result && { value: result, matrix: matrix } };
    }
    result.addColorStop(0, color(a[4]));
    result.addColorStop(1, color(a[5]));
    return { style: result, alpha: 1 };
  }

  function render(ctx, node, app) {
    var invalid = false;
    root.UrhoxUICheck.checkNanoVG(node, function () { invalid = true; }, function () {});
    if (invalid) {
      ctx.fillStyle = "#c53030";
      ctx.font = "14px sans-serif";
      ctx.fillText("NanoVG 数据无效，请检查 UI", node._layout.x, node._layout.y + 20);
      return;
    }
    var box = node._layout, view = node.viewBox;
    ctx.save();
    var stack = [], state = { size: 16, face: "sans-serif", clips: [], fillAlpha: 1, strokeAlpha: 1, fillPattern: null, strokePattern: null };
    try {
      ctx.translate(box.x, box.y);
      ctx.scale(box.w / view[2], box.h / view[3]);
      ctx.translate(-view[0], -view[1]);
      var alpha = ctx.globalAlpha;
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#000000"; ctx.lineWidth = 1;
      ctx.lineCap = "butt"; ctx.lineJoin = "miter"; ctx.miterLimit = 10;
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.font = "16px sans-serif";
      ctx.letterSpacing = "0px";
      ctx.beginPath();
      function draw(fn, opacity, pattern) {
        ctx.save();
        try {
          var transform = ctx.getTransform();
          state.clips.forEach(function (clip) {
            ctx.setTransform(clip.transform); ctx.clip(clip.path);
          });
          ctx.setTransform(transform);
          if (pattern) pattern.value.setTransform(transform.inverse().multiply(pattern.matrix));
          ctx.globalAlpha *= opacity;
          fn();
        } finally { ctx.restore(); }
      }
      node.commands.forEach(function (command) {
        var op = command[0], a = command.slice(1), p;
        switch (op) {
          case "save": ctx.save(); stack.push(Object.assign({}, state)); break;
          case "restore": ctx.restore(); state = stack.pop(); break;
          case "beginPath": ctx.beginPath(); break;
          case "closePath": ctx.closePath(); break;
          case "moveTo": ctx.moveTo(a[0], a[1]); break;
          case "lineTo": ctx.lineTo(a[0], a[1]); break;
          case "bezierTo": ctx.bezierCurveTo.apply(ctx, a); break;
          case "quadTo": ctx.quadraticCurveTo.apply(ctx, a); break;
          case "arcTo": ctx.arcTo.apply(ctx, a); break;
          case "rect": ctx.rect.apply(ctx, a); break;
          case "roundedRect": ctx.roundRect(a[0], a[1], a[2], a[3], a[4]); break;
          case "roundedRectVarying": ctx.roundRect(a[0], a[1], a[2], a[3], a.slice(4)); break;
          case "circle": ctx.moveTo(a[0] + a[2], a[1]); ctx.arc(a[0], a[1], a[2], 0, Math.PI * 2); ctx.closePath(); break;
          case "ellipse": ctx.moveTo(a[0] + a[2], a[1]); ctx.ellipse(a[0], a[1], a[2], a[3], 0, 0, Math.PI * 2); ctx.closePath(); break;
          case "arc": ctx.arc(a[0], a[1], a[2], a[3], a[4], a[5] === 1); break;
          case "translate": ctx.translate(a[0], a[1]); break;
          case "scale": ctx.scale(a[0], a[1]); break;
          case "rotate": ctx.rotate(a[0]); break;
          case "skewX": ctx.transform(1, 0, Math.tan(a[0]), 1, 0, 0); break;
          case "skewY": ctx.transform(1, Math.tan(a[0]), 0, 1, 0, 0); break;
          case "transform": ctx.transform.apply(ctx, a); break;
          case "scissor": case "intersectScissor":
            p = new Path2D(); p.rect(a[0], a[1], Math.max(0, a[2]), Math.max(0, a[3]));
            state.clips = (op === "scissor" ? [] : state.clips).concat([{ path: p, transform: ctx.getTransform() }]); break;
          case "fillColor": ctx.fillStyle = color(a[0]); state.fillAlpha = 1; state.fillPattern = null; break;
          case "strokeColor": ctx.strokeStyle = color(a[0]); state.strokeAlpha = 1; state.strokePattern = null; break;
          case "fillPaint": p = paint(ctx, a[0], app); ctx.fillStyle = p.style; state.fillAlpha = p.alpha; state.fillPattern = p.pattern; break;
          case "strokePaint": p = paint(ctx, a[0], app); ctx.strokeStyle = p.style; state.strokeAlpha = p.alpha; state.strokePattern = p.pattern; break;
          case "strokeWidth": ctx.lineWidth = a[0]; break;
          case "miterLimit": ctx.miterLimit = a[0]; break;
          case "lineCap": ctx.lineCap = ["butt", "round", "square"][a[0]]; break;
          case "lineJoin": ctx.lineJoin = { 1: "round", 3: "bevel", 4: "miter" }[a[0]]; break;
          case "globalAlpha": ctx.globalAlpha = alpha * a[0]; break;
          case "fontSize": state.size = a[0]; ctx.font = state.size + "px " + state.face; break;
          case "fontFace":
            state.face = a[0] === "sans" ? "sans-serif" : JSON.stringify(a[0]) + ", sans-serif";
            ctx.font = state.size + "px " + state.face; break;
          case "textLetterSpacing": ctx.letterSpacing = a[0] + "px"; break;
          case "textAlign":
            ctx.textAlign = a[0] & 4 ? "right" : a[0] & 2 ? "center" : "left";
            ctx.textBaseline = a[0] & 8 ? "top" : a[0] & 16 ? "middle" : a[0] & 32 ? "bottom" : "alphabetic"; break;
          case "text": draw(function () { ctx.fillText(a[2], a[0], a[1]); }, state.fillAlpha, state.fillPattern); break;
          case "textBox":
            draw(function () {
              var x = a[0] + (ctx.textAlign === "center" ? a[2] / 2 : ctx.textAlign === "right" ? a[2] : 0);
              var metrics = ctx.measureText("Mg");
              var lineHeight = (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) || state.size * 1.2;
              var y = a[1];
              a[3].split(/\r\n|\r|\n/).forEach(function (paragraph) {
                var line = "";
                var tokens = paragraph.match(/[\t ]+|[A-Za-z0-9_]+|[^\t ]/gu) || [];
                function emit() { ctx.fillText(line.trimEnd(), x, y); y += lineHeight; line = ""; }
                tokens.forEach(function (token) {
                  if (line && ctx.measureText(line + token).width > a[2]) emit();
                  if (!line && /^\s+$/.test(token)) return;
                  Array.from(token).forEach(function (ch) {
                    if (line && ctx.measureText(line + ch).width > a[2]) emit();
                    line += ch;
                  });
                });
                emit();
              });
            }, state.fillAlpha, state.fillPattern); break;
          case "fill": draw(function () { ctx.fill(); }, state.fillAlpha, state.fillPattern); break;
          case "stroke": draw(function () { ctx.stroke(); }, state.strokeAlpha, state.strokePattern); break;
        }
      });
    } finally {
      while (stack.length) { ctx.restore(); stack.pop(); }
      ctx.restore();
    }
  }

  root.UrhoxNanoVG = { render: render };
})(window);
