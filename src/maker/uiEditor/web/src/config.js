// config.js
// 用途：编辑器常量与宿主绑定。window.UrhoxHost 由嵌入页（Web）提供；缺省时使用 Maker 控制台路由。
(function (root) {
  "use strict";

  root.UrhoxConfig = {
    DEFAULT_UI: "",
    DEVICES: {
      "720p": { id: "720p", name: "720p", width: 720, height: 1280, bezel: 22 },
      "1080p": { id: "1080p", name: "1080p", width: 1080, height: 1920, bezel: 28 },
      "2k": { id: "2k", name: "2K", width: 1440, height: 2560, bezel: 32 },
      "4k": { id: "4k", name: "4K", width: 2160, height: 3840, bezel: 36 },
    },
  };
  var config = root.UrhoxConfig;
  var host = root.UrhoxHost || consoleHost();
  if (typeof host.fileRoot !== "string" || !host.fileRoot) throw new Error("UI 编辑器宿主缺少文件地址。");
  config.FILE_ROOT = host.fileRoot;
  config.DEFAULT_ASSET_ROOT = config.FILE_ROOT + "assets/";
  config.INITIAL_UI = typeof host.initialUi === "string" ? host.initialUi : "";
  config.displayPath = function (value) {
    return value && value.startsWith(config.FILE_ROOT)
      ? decodeURIComponent(value.slice(config.FILE_ROOT.length)) : value;
  };
  config.fileUrl = function (path) {
    return config.FILE_ROOT + String(path).split("/").map(encodeURIComponent).join("/");
  };
  // Asset roots this host serves; other roots are local blobs or absolute URLs.
  config.ownsAssetRoot = function (assetRoot) {
    return typeof assetRoot === "string" && assetRoot.indexOf(config.FILE_ROOT) === 0;
  };
  config.assetUrl = function (assetRoot, relative) {
    var encoded = String(relative).split("/").map(encodeURIComponent).join("/");
    return host.assetUrl ? host.assetUrl(assetRoot, encoded) : assetRoot + encoded;
  };
  config.loadManifest = function () { return host.manifest(); };
  /** Reads a document by its file URL from the manifest. */
  config.readText = function (url) { return host.readText(url); };
  /** path: decoded project path such as assets/ui/main.ui.json. */
  config.save = function (path, text, expectedText) { return host.save(path, text, expectedText); };

  function consoleHost() {
    var query = new URLSearchParams(location.search);
    var project = query.get("project") || "";
    if (!/^[a-f0-9]{64}$/.test(project)) throw new Error("请从 Maker 控制台选择项目后打开 UI 编辑器。");
    var apiRoot = "/api/projects/" + project + "/ui-editor/";
    return {
      fileRoot: apiRoot + "files/",
      initialUi: query.get("ui") || "",
      assetUrl: function (assetRoot, encoded) { return assetRoot + encoded + "?v=original2"; },
      manifest: async function () {
        var res = await fetch(apiRoot + "manifest");
        if (!res.ok) throw new Error("读取项目清单失败（HTTP " + res.status + "）");
        return res.json();
      },
      readText: async function (url) {
        var res = await fetch(url);
        if (!res.ok) throw new Error("读取失败（HTTP " + res.status + "）");
        return res.text();
      },
      save: async function (path, text, expectedText) {
        var response = await fetch(apiRoot + "save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: path, content: text, expectedText: expectedText }),
        });
        var result = await response.json();
        if (!response.ok || !result.ok) return { ok: false, error: result.error || "保存失败，请保留修改后重试。" };
        return { ok: true, mode: "maker" };
      },
    };
  }
})(window);
