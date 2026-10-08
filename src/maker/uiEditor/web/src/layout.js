// layout.js
// 用途：分栏拖动；中间画布 Figma 式平移 / 滚轮缩放 / 点阵背景。
(function () {
  "use strict";

  var root = document.documentElement;
  var preview = document.getElementById("preview");
  var stageWrap = document.getElementById("previewStage");
  var canvas = document.getElementById("stage");
  var zoomLabel = document.getElementById("zoomLabel");
  var fitBtn = document.getElementById("fitBtn");

  var leftW = 280;
  var rightW = 320;
  var bottomH = 200;
  var projLeftW = 240;
  var zoom = 0.5;
  var panX = 24;
  var panY = 24;
  var spaceDown = false;
  var MIN_SIDE = 180;
  var MIN_BOTTOM = 120;
  var MIN_PREVIEW = 220;
  var GRID = 18;
  var STORAGE = "urhox.panel-layout.v1";
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (saved && [saved.left,saved.right,saved.bottom,saved.project].every(function (n) { return Number.isFinite(n) && n>0; })) {
      leftW=saved.left; rightW=saved.right; bottomH=saved.bottom; projLeftW=saved.project;
    }
  } catch (_) {}

  function persist() {
    try { localStorage.setItem(STORAGE,JSON.stringify({left:leftW,right:rightW,bottom:bottomH,project:projLeftW})); } catch (_) {}
  }

  function applySizes() {
    var sideMax=Math.max(120,(window.innerWidth-MIN_PREVIEW-12)/2);
    root.style.setProperty("--left-w", Math.min(leftW,sideMax) + "px");
    root.style.setProperty("--right-w", Math.min(rightW,sideMax) + "px");
    root.style.setProperty("--bottom-h", Math.min(bottomH,Math.max(100,window.innerHeight-240)) + "px");
    root.style.setProperty("--proj-left-w", Math.min(projLeftW,Math.max(100,window.innerWidth-180)) + "px");
  }

  function applyView() {
    if (!stageWrap) return;
    stageWrap.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + zoom + ")";
    var label = document.getElementById("artboardLabel");
    if (label && canvas) {
      label.style.transformOrigin = "left top";
      label.style.transform = "scale(" + (1 / zoom) + ")";
      label.style.top = (Number(canvas.dataset.originY || 0) - 22 / zoom) + "px";
    }
    if (preview) {
      preview.style.setProperty("--grid-x", (panX % GRID) + "px");
      preview.style.setProperty("--grid-y", (panY % GRID) + "px");
    }
    if (window.UrhoxComparison) window.UrhoxComparison.syncView();
    if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + "%";
  }

  function fitPreview() {
    if (!preview || !canvas) return;
    var originX = Number(canvas.dataset.originX || 0);
    var originY = Number(canvas.dataset.originY || 0);
    var designW = canvas.width - originX * 2;
    var designH = canvas.height - originY * 2;
    var margin = 72;
    var sx = (preview.clientWidth - margin) / Math.max(1, designW);
    var sy = (preview.clientHeight - margin) / Math.max(1, designH);
    var cap = designW < 480 || designH < 480 ? 4 : 1.5;
    zoom = Math.max(0.08, Math.min(sx, sy, cap));
    panX = (preview.clientWidth - designW * zoom) / 2 - originX * zoom;
    panY = (preview.clientHeight - designH * zoom) / 2 - originY * zoom;
    applyView();
  }

  function bindSplit(el, kind) {
    el.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      el.classList.add("dragging");
      var startX = event.clientX;
      var startY = event.clientY;
      var startLeft = leftW;
      var startRight = rightW;
      var startBottom = bottomH;
      var startProj = projLeftW;
      function move(ev) {
        if (kind === "left") {
          leftW = Math.max(MIN_SIDE, Math.min(window.innerWidth - rightW - MIN_PREVIEW, startLeft + (ev.clientX - startX)));
        } else if (kind === "right") {
          rightW = Math.max(MIN_SIDE, Math.min(window.innerWidth - leftW - MIN_PREVIEW, startRight - (ev.clientX - startX)));
        } else if (kind === "bottom") {
          bottomH = Math.max(MIN_BOTTOM, Math.min(window.innerHeight - 160, startBottom - (ev.clientY - startY)));
        } else if (kind === "project") {
          var bar = document.querySelector(".project-bar");
          var max = (bar ? bar.clientWidth : 400) - 160;
          projLeftW = Math.max(140, Math.min(max, startProj + (ev.clientX - startX)));
        }
        applySizes();
      }
      function up() {
        el.classList.remove("dragging");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        persist();
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  }

  document.querySelectorAll(".split-v, .split-h").forEach(function (el) {
    bindSplit(el, el.getAttribute("data-split"));
  });

  window.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || event.isComposing || document.querySelector("dialog[open]")) return;
    if (window.UrhoxProject && window.UrhoxProject.isOpening && window.UrhoxProject.isOpening()) return;
    if (event.target && event.target.closest("button, [role=button]")) return;
    if (event.target && (event.target.closest("input, textarea, select") || event.target.isContentEditable)) return;
    if (event.code === "Space" && !event.repeat) {
      spaceDown = true;
      if (preview) preview.classList.add("space");
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", function (event) {
    if (event.code === "Space") {
      spaceDown = false;
      if (preview) preview.classList.remove("space");
    }
  });
  function stopPan() {
    panning = false;
    if (preview) preview.classList.remove("panning");
  }
  window.addEventListener("blur", function () {
    spaceDown = false;
    if (preview) preview.classList.remove("space");
    stopPan();
  });

  if (preview) {
    preview.addEventListener("wheel", function (event) {
      event.preventDefault();
      var rect = preview.getBoundingClientRect();
      var mx = event.clientX - rect.left;
      var my = event.clientY - rect.top;
      var before = zoom;
      var factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      zoom = Math.max(0.08, Math.min(8, zoom * factor));
      panX = mx - (mx - panX) * (zoom / before);
      panY = my - (my - panY) * (zoom / before);
      applyView();
    }, { passive: false });

    var panning = false;
    var lastX = 0;
    var lastY = 0;
    preview.addEventListener("pointerdown", function (event) {
      var pan = event.button === 1 || (event.button === 2 && event.target !== canvas) || spaceDown;
      if (!pan) return;
      event.preventDefault();
      panning = true;
      lastX = event.clientX;
      lastY = event.clientY;
      preview.classList.add("panning");
      preview.setPointerCapture(event.pointerId);
    });
    preview.addEventListener("pointermove", function (event) {
      if (!panning) return;
      panX += event.clientX - lastX;
      panY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      applyView();
    });
    preview.addEventListener("pointerup", stopPan);
    preview.addEventListener("pointercancel", stopPan);
    preview.addEventListener("lostpointercapture", stopPan);
    preview.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
  }

  if (fitBtn) fitBtn.addEventListener("click", fitPreview);
  var resetBtn=document.getElementById("resetLayoutBtn");
  if (resetBtn) resetBtn.addEventListener("click",function () {
    leftW=280; rightW=320; bottomH=200; projLeftW=240; persist(); applySizes(); fitPreview();
  });
  window.addEventListener("resize", function () { applySizes(); });

  applySizes();
  applyView();
  requestAnimationFrame(fitPreview);

  window.UrhoxView = {
    fit: fitPreview,
    panBy: function (dx, dy) { panX += dx; panY += dy; applyView(); },
    getZoom: function () { return zoom; },
    setZoom: function (value) {
      if (!preview || !canvas) return;
      zoom = Math.max(0.08, Math.min(8, value));
      panX = (preview.clientWidth - canvas.width * zoom) / 2;
      panY = (preview.clientHeight - canvas.height * zoom) / 2;
      applyView();
    },
    fitSelected: function () {
      if (!preview || !canvas || !window.UrhoxPreview) return;
      var box = window.UrhoxPreview.selectionBounds && window.UrhoxPreview.selectionBounds();
      if (!box) {
        fitPreview();
        return;
      }
      var originX = Number(canvas.dataset.originX || 0);
      var originY = Number(canvas.dataset.originY || 0);
      var fit = window.UrhoxPreview.contentTransform ? window.UrhoxPreview.contentTransform() : { x: 0, y: 0, scale: 1 };
      var sx = originX + fit.x + box.x * fit.scale;
      var sy = originY + fit.y + box.y * fit.scale;
      var sw = box.w * fit.scale;
      var sh = box.h * fit.scale;
      var pad = 64;
      var z = Math.min((preview.clientWidth - pad) / sw, (preview.clientHeight - pad) / sh, 8);
      zoom = Math.max(0.08, z);
      panX = (preview.clientWidth - sw * zoom) / 2 - sx * zoom;
      panY = (preview.clientHeight - sh * zoom) / 2 - sy * zoom;
      applyView();
    },
    zoomBy: function (factor) {
      if (!preview) return;
      var rect = preview.getBoundingClientRect();
      var mx = rect.width / 2;
      var my = rect.height / 2;
      var before = zoom;
      zoom = Math.max(0.08, Math.min(8, zoom * factor));
      panX = mx - (mx - panX) * (zoom / before);
      panY = my - (my - panY) * (zoom / before);
      applyView();
    },
    isSpaceDown: function () { return spaceDown; },
    panBy: function (dx, dy) {
      panX += dx;
      panY += dy;
      applyView();
    },
  };
})();
