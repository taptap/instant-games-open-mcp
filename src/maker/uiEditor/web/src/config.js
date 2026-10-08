// config.js
// 用途：编辑器常量和控制台绑定的当前项目。
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
