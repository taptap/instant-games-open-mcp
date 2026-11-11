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

  // Hosts may set a default bottom panel height and their own storage key (UrhoxHost.layout),
  // e.g. when they put taller content in the bottom panel.
  var hostLayout = (window.UrhoxHost && window.UrhoxHost.layout) || {};
  var DEFAULT_BOTTOM = Number.isFinite(hostLayout.bottom) && hostLayout.bottom > 0 ? hostLayout.bottom : 200;
  var leftW = 280;
  var rightW = 320;
  var bottomH = DEFAULT_BOTTOM;
  var projLeftW = 240;
  var leftVisible = true;
  var rightVisible = true;
  var bottomVisible = true;
  var zoom = 0.5;
  var panX = 24;
  var panY = 24;
  var spaceDown = false;
  var MIN_SIDE = 180;
  var MAX_RIGHT = Number.isFinite(hostLayout.maxRightWidth) && hostLayout.maxRightWidth >= MIN_SIDE
    ? hostLayout.maxRightWidth : Infinity;
  var MIN_BOTTOM = 120;
  var MIN_PREVIEW = 220;
  var GRID = 18;
  var STORAGE = typeof hostLayout.storageKey === "string" && hostLayout.storageKey ? hostLayout.storageKey : "urhox.panel-layout.v1";
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (saved && [saved.left,saved.right,saved.bottom,saved.project].every(function (n) { return Number.isFinite(n) && n>0; })) {
      leftW=saved.left; rightW=saved.right; bottomH=saved.bottom; projLeftW=saved.project;
      leftVisible = saved.leftVisible !== false;
      rightVisible = saved.rightVisible !== false;
      bottomVisible = saved.bottomVisible !== false;
    }
  } catch (_) {}

  function persist() {
    try { localStorage.setItem(STORAGE,JSON.stringify({left:leftW,right:rightW,bottom:bottomH,project:projLeftW,leftVisible:leftVisible,rightVisible:rightVisible,bottomVisible:bottomVisible})); } catch (_) {}
  }

  function applySizes() {
    rightW = Math.min(rightW, MAX_RIGHT);
    var sideMax=Math.max(120,(window.innerWidth-MIN_PREVIEW-12)/2);
    root.style.setProperty("--left-w", leftVisible ? Math.min(leftW,sideMax) + "px" : "0px");
    root.style.setProperty("--right-w", rightVisible ? Math.min(rightW,sideMax) + "px" : "0px");
    root.style.setProperty("--bottom-h", bottomVisible ? Math.min(bottomH,Math.max(100,window.innerHeight-240)) + "px" : "0px");
    root.style.setProperty("--proj-left-w", Math.min(projLeftW,Math.max(100,window.innerWidth-180)) + "px");
    root.classList.toggle("panel-left-hidden", !leftVisible);
    root.classList.toggle("panel-right-hidden", !rightVisible);
    root.classList.toggle("panel-bottom-hidden", !bottomVisible);
    updateToggle("left", leftVisible);
    updateToggle("right", rightVisible);
    updateToggle("bottom", bottomVisible);
  }

  function updateToggle(kind, visible) {
    var button = document.querySelector('[data-toggle="' + kind + '"]');
    if (!button) return;
    var name = kind === "left" ? "左侧" : kind === "right" ? "右侧" : "底部";
    var label = (visible ? "隐藏" : "显示") + name + "面板";
    button.textContent = visible ? (kind === "left" ? "◀" : kind === "right" ? "▶" : "▼") : (kind === "left" ? "▶" : kind === "right" ? "◀" : "▲");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.setAttribute("aria-expanded", String(visible));
  }

  function togglePanel(kind) {
    if (kind === "left") leftVisible = !leftVisible;
    else if (kind === "right") rightVisible = !rightVisible;
    else if (kind === "bottom") bottomVisible = !bottomVisible;
    else return;
    persist();
    applySizes();
  }

  function applyView() {
    if (!stageWrap) return;
    var previousZoom = zoom;
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
    if (window.UrhoxPreview && window.UrhoxPreview.draw && (zoom !== previousZoom || window.UrhoxPreview.hasMarquee && window.UrhoxPreview.hasMarquee())) window.UrhoxPreview.draw();
    if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + "%";
  }

  // A host may reserve canvas space occupied by floating controls.
  function fitViewport(width, height) {
    var full = { left: 0, top: 0, width: preview.clientWidth, height: preview.clientHeight };
    var host = window.UrhoxHost;
    var area = host && typeof host.previewViewport === "function" ? host.previewViewport({ width: width, height: height }) : null;
    if (!area || ![area.left, area.top, area.width, area.height].every(Number.isFinite) || area.width <= 0 || area.height <= 0) return full;
    var left = Math.max(0, Math.min(full.width - 1, area.left));
    var top = Math.max(0, Math.min(full.height - 1, area.top));
    return { left: left, top: top, width: Math.min(area.width, full.width - left), height: Math.min(area.height, full.height - top) };
  }

  function fitPreview() {
    if (!preview || !canvas) return;
    var originX = Number(canvas.dataset.originX || 0);
    var originY = Number(canvas.dataset.originY || 0);
    var designW = canvas.width - originX * 2;
    var designH = canvas.height - originY * 2;
    var area = fitViewport(designW, designH);
    var margin = Math.min(72, area.width / 3, area.height / 3);
    var sx = (area.width - margin) / Math.max(1, designW);
    var sy = (area.height - margin) / Math.max(1, designH);
    var cap = designW < 480 || designH < 480 ? 4 : 1.5;
    zoom = Math.max(0.08, Math.min(sx, sy, cap));
    panX = area.left + (area.width - designW * zoom) / 2 - originX * zoom;
    panY = area.top + (area.height - designH * zoom) / 2 - originY * zoom;
    applyView();
  }

  function bindSplit(el, kind) {
    var toggle = el.querySelector("[data-toggle]");
    if (toggle) {
      toggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        togglePanel(kind);
      });
    }
    el.addEventListener("pointerdown", function (event) {
      if (event.target.closest && event.target.closest("[data-toggle]")) return;
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
          rightW = Math.max(MIN_SIDE, Math.min(MAX_RIGHT, window.innerWidth - leftW - MIN_PREVIEW, startRight - (ev.clientX - startX)));
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
    if (event.target && event.target.closest("button, [role=button]") &&
        !event.target.closest(".chrome, .canvas-toolbar, .transform-toolbar")) return;
    if (event.target && (event.target.closest("input, textarea, select") || event.target.isContentEditable)) return;
    if (event.code === "Space" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      spaceDown = true;
      if (preview) preview.classList.add("space");
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", function (event) {
    if (event.code === "Space") {
      if (spaceDown) event.preventDefault();
      spaceDown = false;
      if (preview) preview.classList.remove("space");
    }
  }, true);
  function stopPan() {
    panning = false;
    if (preview) preview.classList.remove("panning");
  }
  function resetPan() {
    spaceDown = false;
    if (preview) preview.classList.remove("space");
    stopPan();
  }
  window.addEventListener("blur", resetPan);
  document.addEventListener("visibilitychange", function () { if (document.hidden) resetPan(); });

  if (preview) {
    preview.addEventListener("wheel", function (event) {
      event.preventDefault();
      var rect = preview.getBoundingClientRect();
      var mx = event.clientX - rect.left;
      var my = event.clientY - rect.top;
      var before = zoom;
      var config = window.UrhoxConfig || {};
      var unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
      if (config.WHEEL === "pan" && !event.ctrlKey && !event.metaKey) {
        // Shift+wheel on a mouse scrolls sideways; trackpads already report deltaX.
        var sideways = event.shiftKey && !event.deltaX;
        panX -= (sideways ? event.deltaY : event.deltaX) * unit;
        panY -= (sideways ? 0 : event.deltaY) * unit;
        applyView();
        return;
      }
      var factor = config.WHEEL === "pan"
        ? Math.exp(-event.deltaY * unit * 0.002)
        : event.deltaY < 0 ? 1.08 : 1 / 1.08;
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
    leftW=280; rightW=320; bottomH=DEFAULT_BOTTOM; projLeftW=240; leftVisible=true; rightVisible=true; bottomVisible=true; persist(); applySizes(); fitPreview();
  });
  window.addEventListener("resize", function () { applySizes(); });

  applySizes();
  applyView();
  requestAnimationFrame(fitPreview);

  window.UrhoxView = {
    fit: fitPreview,
    getZoom: function () { return zoom; },
    /** Pan and zoom, e.g. to restore them after reloading the same document. */
    getView: function () { return { zoom: zoom, panX: panX, panY: panY }; },
    setView: function (view) {
      if (!view || !Number.isFinite(view.zoom)) return;
      zoom = Math.max(0.08, Math.min(8, view.zoom));
      panX = Number(view.panX) || 0;
      panY = Number(view.panY) || 0;
      applyView();
    },
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
      var area = fitViewport(sw, sh);
      var pad = Math.min(64, area.width / 3, area.height / 3);
      var z = Math.min((area.width - pad) / sw, (area.height - pad) / sh, 8);
      zoom = Math.max(0.08, z);
      panX = area.left + (area.width - sw * zoom) / 2 - sx * zoom;
      panY = area.top + (area.height - sh * zoom) / 2 - sy * zoom;
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
