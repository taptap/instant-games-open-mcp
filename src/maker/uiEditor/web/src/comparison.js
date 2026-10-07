// Editor-only reference images never enter the UI tree or its undo/save history.
(function (root) {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var app, key = "", image = null, blob = null, token = 0, objectUrl = null;
  var settings = defaults(), expanded = false, dbPromise;
  function defaults() { return { mode: "side", opacity: 50, visible: true, x: 0, y: 0, scale: 100 }; }
  function database() {
    if (!dbPromise) dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open("urhox-design-references", 1);
      request.onupgradeneeded = function () { request.result.createObjectStore("documents"); };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
    return dbPromise;
  }
  async function read(id) {
    var db = await database();
    return new Promise(function (resolve, reject) {
      var r = db.transaction("documents").objectStore("documents").get(id);
      r.onsuccess = function () { resolve(r.result); }; r.onerror = function () { reject(r.error); };
    });
  }
  async function persist() {
    if (!key) return;
    var id = key, record = { settings: Object.assign({}, settings), blob: blob };
    try {
      var db = await database();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put(record, id);
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    } catch (_) { if (key === id) $("compareStatus").textContent = "参考图设置未能保存到浏览器；本次仍可对照，重开后请重新选择。"; }
  }
  function syncView() {
    $("referenceStage").style.transform = $("previewStage").style.transform;
  }
  function fitReference(ctx) {
    if (!image || !image.naturalWidth) return;
    var size = root.UrhoxDoc.designSize(app.tree);
    var factor = Math.min(size.width / image.naturalWidth, size.height / image.naturalHeight) * settings.scale / 100;
    ctx.drawImage(image, settings.x, settings.y, image.naturalWidth * factor, image.naturalHeight * factor);
  }
  function paint(ctx, current) {
    if (app !== current || !image) return;
    if (expanded && settings.visible && settings.mode === "overlay") {
      ctx.save(); ctx.globalAlpha = settings.opacity / 100; fitReference(ctx); ctx.restore();
    }
    if (!expanded || settings.mode !== "side") return;
    var canvas = $("referenceCanvas"), source = app.canvas;
    if (canvas.width !== source.width) canvas.width = source.width;
    if (canvas.height !== source.height) canvas.height = source.height;
    var ref = canvas.getContext("2d"), origin = app.origin(), fit = app.contentTransform();
    ref.setTransform(1, 0, 0, 1, 0, 0); ref.clearRect(0, 0, canvas.width, canvas.height);
    ref.translate(origin.x + fit.x, origin.y + fit.y); ref.scale(fit.scale, fit.scale);
    if (settings.visible) fitReference(ref);
    syncView();
  }
  function render(refit) {
    $("comparisonTools").classList.toggle("hidden", !expanded);
    $("compareToggle").setAttribute("aria-expanded", String(expanded));
    $("referencePane").classList.toggle("hidden", !expanded || settings.mode !== "side");
    $("compareMode").value = settings.mode;
    $("compareVisible").checked = settings.visible;
    $("compareOpacity").value = settings.opacity;
    $("compareOpacity").disabled = settings.mode !== "overlay";
    $("comparePercent").textContent = settings.opacity + "%";
    $("compareX").value = settings.x; $("compareY").value = settings.y; $("compareScale").value = settings.scale;
    if (refit && root.UrhoxView) root.UrhoxView.fit();
    if (app) app.draw();
  }
  async function load(file, ref, currentToken) {
    var candidate = new Image(), url;
    try {
      await new Promise(function (resolve, reject) {
        candidate.onload = resolve;
        candidate.onerror = reject;
        if (file) { url = URL.createObjectURL(file); candidate.src = url; }
        else root.UrhoxAssets.bindSrc(candidate, ref);
      });
    } catch (_) { if (file && url) URL.revokeObjectURL(url); throw new Error("无法读取设计稿，请选择有效的 PNG、JPG 或 WebP 图片。"); }
    if (currentToken !== token) { if (file) URL.revokeObjectURL(url); return; }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = file ? url : null; image = candidate; blob = file || null;
    $("compareStatus").textContent = candidate.naturalWidth + " × " + candidate.naturalHeight + " · 参考图不参与导出";
    render(false);
  }
  async function openDocument(current, options) {
    var ticket = ++token; app = current;
    key = options.comparisonKey || (options.assetRoot || "") + ':' + app.path;
    image = null; blob = null; settings = defaults();
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    $("referenceCanvas").getContext("2d").clearRect(0, 0, $("referenceCanvas").width, $("referenceCanvas").height);
    $("compareStatus").textContent = "请选择设计稿"; render(false);
    var saved;
    try { saved = await read(key); } catch (_) {}
    if (ticket !== token) return;
    if (saved && saved.settings) {
      var value = saved.settings;
      settings.mode = ["side", "overlay", "off"].includes(value.mode) ? value.mode : "side";
      settings.visible = value.visible !== false;
      for (var field of ["x", "y", "scale", "opacity"]) if (Number.isFinite(value[field])) settings[field] = value[field];
      settings.opacity = Math.max(0, Math.min(100, settings.opacity));
      settings.scale = Math.max(10, Math.min(400, settings.scale));
    }
    render(false);
    if (saved && saved.blob || options.referenceImage) {
      try { await load(saved && saved.blob, options.referenceImage, ticket); }
      catch (error) { if (ticket === token) $("compareStatus").textContent = error.message; }
    }
  }
  $("compareToggle").addEventListener("click", function () { expanded = !expanded; render(true); });
  $("compareImport").addEventListener("click", function () { $("compareFile").click(); });
  $("compareFile").addEventListener("change", async function () {
    var file = this.files[0]; this.value = "";
    if (!file || !app) return;
    if (file.size > 32 * 1024 * 1024) { $("compareStatus").textContent = "设计稿须小于 32 MiB，请缩小图片后重试。"; return; }
    var ticket = ++token;
    try { await load(file, null, ticket); if (ticket === token) await persist(); }
    catch (error) { if (ticket === token) $("compareStatus").textContent = error.message; }
  });
  $("compareMode").addEventListener("change", function () { settings.mode = this.value; render(true); void persist(); });
  $("compareVisible").addEventListener("change", function () { settings.visible = this.checked; render(false); void persist(); });
  for (const field of ["Opacity", "X", "Y", "Scale"]) {
    $("compare" + field).addEventListener("input", function () {
      if (this.value === "") return;
      var value = Number(this.value); if (!Number.isFinite(value)) return;
      if (field === "Scale") value = Math.max(10, Math.min(400, value));
      if (field === "Opacity") value = Math.max(0, Math.min(100, value));
      settings[field.toLowerCase()] = value;
      $("comparePercent").textContent = settings.opacity + "%";
      if (app) app.draw();
    });
    $("compare" + field).addEventListener("change", function () { render(false); void persist(); });
  }
  $("compareReset").addEventListener("click", function () { settings.x = settings.y = 0; settings.scale = 100; render(false); void persist(); });
  var pane = $("referencePane"), pan;
  pane.addEventListener("wheel", function (event) {
    event.preventDefault(); var a = pane.getBoundingClientRect(), b = $("preview").getBoundingClientRect();
    $("preview").dispatchEvent(new WheelEvent("wheel", { deltaY: event.deltaY, clientX: b.left + event.clientX - a.left, clientY: b.top + event.clientY - a.top, cancelable: true }));
  }, { passive: false });
  pane.addEventListener("pointerdown", function (event) { if (event.button > 1) return; pan = { x: event.clientX, y: event.clientY }; pane.setPointerCapture(event.pointerId); });
  pane.addEventListener("pointermove", function (event) {
    if (!pan) return; root.UrhoxView.panBy(event.clientX - pan.x, event.clientY - pan.y); pan = { x: event.clientX, y: event.clientY };
  });
  for (var name of ["pointerup", "pointercancel", "lostpointercapture"]) pane.addEventListener(name, function () { pan = null; });
  window.addEventListener("blur", function () { pan = null; });
  root.UrhoxComparison = { openDocument: openDocument, paint: paint, syncView: syncView };
})(window);
