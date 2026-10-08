// assets.js
// 用途：颜色解析、图片路径、加载缓存。绘制时向它要 Image。
(function (root) {
  "use strict";

  var cache = {};
  var urlCache = {};
  var objectUrls = [];
  var handlePromises = {};
  var generation = 0;
  var bindings = new WeakMap();
  var context = { assetRoot: "", handleMap: {}, blobMap: {} };

  function candidates(path) {
    var list = [];
    function add(key) {
      if (key && list.indexOf(key) < 0) list.push(key);
    }
    add(path);
    if (!path) return list;
    if (path.indexOf("assets/") !== 0) add("assets/" + path);
    var assetsIdx = path.indexOf("assets/");
    if (assetsIdx > 0) {
      add(path.slice(assetsIdx));
      add(path.slice(assetsIdx + "assets/".length));
    }
    if (path.indexOf("assets/") === 0) add(path.slice("assets/".length));
    if (context.assetRoot) add(context.assetRoot + path);
    return list;
  }

  function cachedUrl(path) {
    var keys = candidates(path);
    for (var i = 0; i < keys.length; i++) {
      if (urlCache[keys[i]]) return urlCache[keys[i]];
    }
    return "";
  }

  function rememberUrl(path, url) {
    candidates(path).forEach(function (key) { urlCache[key] = url; });
  }

  function hasHandles() {
    var handleMap = context.handleMap || {};
    for (var key in handleMap) {
      if (Object.prototype.hasOwnProperty.call(handleMap, key)) return true;
    }
    return false;
  }

  function findHandle(path) {
    var handleMap = context.handleMap || {};
    var keys = candidates(path);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (handleMap[keys[i]]) return handleMap[keys[i]];
    }
    var suffix = path.replace(/^assets\//, "");
    for (var key in handleMap) {
      if (!Object.prototype.hasOwnProperty.call(handleMap, key)) continue;
      if (key === suffix || key === path) return handleMap[key];
      if (key.endsWith("/" + suffix) || key.endsWith("/" + path) || key.endsWith("/assets/" + suffix)) {
        return handleMap[key];
      }
    }
    return null;
  }

  function revokeUrls() {
    objectUrls.forEach(function (url) {
      try { URL.revokeObjectURL(url); } catch (err) {}
    });
    objectUrls = [];
  }

  function parseHexColor(value) {
    if (typeof value !== "string") return null;
    var hex = value.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6 && hex.length !== 8) return null;
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    var a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
  }

  function colorToCss(value) {
    if (value === false || value == null) return null;
    if (typeof value === "string") return parseHexColor(value) || value;
    if (Array.isArray(value)) {
      var a = value[3] == null ? 255 : value[3];
      return "rgba(" + (value[0] || 0) + ", " + (value[1] || 0) + ", " + (value[2] || 0) + ", " + a / 255 + ")";
    }
    return null;
  }

  function resolve(path) {
    if (!path) return "";
    if (typeof path === "string" && path.charAt(0) === "$") {
      var colon = path.indexOf(":");
      path = colon > 0 ? path.slice(colon + 1) : "";
      if (!path) return "";
    }
    if (/^https?:/i.test(path) || path.indexOf("blob:") === 0 || path.charAt(0) === "/") return path;
    var hit = cachedUrl(path);
    if (hit) return hit;
    var blobMap = context.blobMap || {};
    var keys = candidates(path);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (blobMap[key]) {
        var url = URL.createObjectURL(blobMap[key]);
        objectUrls.push(url);
        rememberUrl(path, url);
        return url;
      }
    }
    if (findHandle(path) || hasHandles()) return "";
    var relative = context.assetRoot && context.assetRoot.indexOf('/api/projects/') === 0
      ? path.split('/').map(encodeURIComponent).join('/') : path;
    return (context.assetRoot || "") + relative + "?v=original2";
  }

  function resolveHandle(path) {
    var hit = cachedUrl(path);
    if (hit) return Promise.resolve(hit);
    var handle = findHandle(path);
    if (!handle || typeof handle.getFile !== "function") return Promise.resolve(null);
    if (handlePromises[path]) return handlePromises[path];
    var version = generation;
    handlePromises[path] = Promise.resolve().then(function () {
      return handle.getFile();
    }).then(function (file) {
      if (version !== generation) return null;
      var url = URL.createObjectURL(file);
      objectUrls.push(url);
      rememberUrl(path, url);
      return url;
    }).catch(function () {
      if (version === generation) delete handlePromises[path];
      return null;
    });
    return handlePromises[path];
  }

  function bindSrc(img, path) {
    if (!img) return;
    var binding = {};
    var version = generation;
    bindings.set(img, binding);
    img.removeAttribute("src");
    if (!path) return;
    var now = resolve(path);
    if (now) {
      img.src = now;
      return;
    }
    resolveHandle(path).then(function (url) {
      if (version === generation && bindings.get(img) === binding && url) img.src = url;
    }).catch(function () {});
  }

  function loadImage(path, onReady) {
    if (cache[path]) {
      if (!cache[path].done && onReady) cache[path].callbacks.add(onReady);
      return cache[path].image;
    }
    var img = new Image();
    var version = generation;
    var entry = { image: img, callbacks: new Set(), done: false };
    if (onReady) entry.callbacks.add(onReady);
    function finish() {
      if (entry.done) return;
      entry.done = true;
      if (version === generation) entry.callbacks.forEach(function (callback) { callback(); });
      entry.callbacks.clear();
    }
    img.onload = img.onerror = finish;
    cache[path] = entry;
    var now = resolve(path);
    if (now) img.src = now;
    else resolveHandle(path).then(function (url) {
      if (version !== generation) return;
      if (url) img.src = url;
      else finish();
    });
    return img;
  }

  function fitRect(box, imgW, imgH, fit) {
    var mode = fit || "fill";
    if (mode === "fill" || !imgW || !imgH) return { x: box.x, y: box.y, w: box.w, h: box.h };
    var imgRatio = imgW / imgH;
    var boxRatio = box.w / box.h;
    var drawW = box.w, drawH = box.h, drawX = box.x, drawY = box.y;
    if (mode === "contain") {
      if (imgRatio > boxRatio) { drawW = box.w; drawH = box.w / imgRatio; drawY = box.y + (box.h - drawH) / 2; }
      else { drawH = box.h; drawW = box.h * imgRatio; drawX = box.x + (box.w - drawW) / 2; }
    } else if (mode === "cover") {
      if (imgRatio > boxRatio) { drawH = box.h; drawW = box.h * imgRatio; drawX = box.x - (drawW - box.w) / 2; }
      else { drawW = box.w; drawH = box.w / imgRatio; drawY = box.y - (drawH - box.h) / 2; }
    }
    return { x: drawX, y: drawY, w: drawW, h: drawH };
  }

  root.UrhoxAssets = {
    colorToCss: colorToCss,
    resolve: resolve,
    bindSrc: bindSrc,
    loadImage: loadImage,
    fitRect: fitRect,
    setContext: function (next) {
      generation += 1;
      revokeUrls();
      context = next || { assetRoot: "", handleMap: {}, blobMap: {} };
      cache = {};
      urlCache = {};
      handlePromises = {};
    },
    getContext: function () { return context; },
  };
})(window);
