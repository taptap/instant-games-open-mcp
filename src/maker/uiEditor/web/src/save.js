(function (root) {
  "use strict";
  root.UrhoxSave = {
    write: async function (path, text, expectedText) {
      var config = root.UrhoxConfig;
      if (!path || !path.startsWith(config.FILE_ROOT) || typeof expectedText !== "string") {
        return { ok: false, error: "只能保存当前项目中已打开的 UI 文档。" };
      }
      try {
        var response = await fetch(config.API_ROOT + "save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: decodeURIComponent(path.slice(config.FILE_ROOT.length)), content: text, expectedText: expectedText }),
        });
        var result = await response.json();
        if (!response.ok || !result.ok) return { ok: false, error: result.error || "保存失败，请保留修改后重试。" };
        return { ok: true, mode: "maker" };
      } catch (error) { return { ok: false, error: error.message || String(error) }; }
    },
  };
})(window);
