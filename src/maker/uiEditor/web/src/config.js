// config.js
// 用途：编辑器常量和控制台绑定的当前项目。
(function (root) {
  "use strict";

  root.UrhoxConfig = {
    DEFAULT_UI: "",
    DEVICES: {
      "720p": { id: "720p", name: "720p", width: 720, height: 1280, dpr: 1, bezel: 22 },
      "1080p": { id: "1080p", name: "1080p", width: 1080, height: 1920, dpr: 1.5, bezel: 28 },
      "2k": { id: "2k", name: "2K", width: 1440, height: 2560, dpr: 2, bezel: 32 },
      "4k": { id: "4k", name: "4K", width: 2160, height: 3840, dpr: 3, bezel: 36 },
      "iphone18": { id: "iphone18", name: "iPhone 18 Pro", width: 1206, height: 2622, dpr: 3, bezel: 28,
        safeArea: { top: 186, right: 0, bottom: 102, left: 0 },
        landscapeSafeArea: { top: 0, right: 186, bottom: 63, left: 186 } },
      "ipadpro": { id: "ipadpro", name: "iPad Pro 13 英寸", width: 2064, height: 2752, dpr: 2, bezel: 28,
        safeArea: { top: 48, right: 0, bottom: 40, left: 0 },
        landscapeSafeArea: { top: 48, right: 0, bottom: 40, left: 0 } },
    },
  };
  var query = new URLSearchParams(location.search);
  var project = query.get("project") || "";
  if (!/^[a-f0-9]{64}$/.test(project)) throw new Error("请从 Maker 控制台选择项目后打开 UI 编辑器。");
  root.UrhoxConfig.MAKER_PROJECT = project;
  root.UrhoxConfig.API_ROOT = "/api/projects/" + project + "/ui-editor/";
  root.UrhoxConfig.FILE_ROOT = root.UrhoxConfig.API_ROOT + "files/";
  root.UrhoxConfig.displayPath = function (value) {
    return value && value.startsWith(root.UrhoxConfig.FILE_ROOT)
      ? decodeURIComponent(value.slice(root.UrhoxConfig.FILE_ROOT.length)) : value;
  };
  root.UrhoxConfig.MANIFEST = root.UrhoxConfig.API_ROOT + "manifest";
  root.UrhoxConfig.DEFAULT_ASSET_ROOT = root.UrhoxConfig.FILE_ROOT + "assets/";
})(window);
