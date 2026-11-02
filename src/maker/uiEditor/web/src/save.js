(function (root) {
  "use strict";
  root.UrhoxSave = {
    write: async function (path, text, expectedText) {
      var config = root.UrhoxConfig;
      if (!path || !path.startsWith(config.FILE_ROOT) || typeof expectedText !== "string") {
        return { ok: false, error: "只能保存当前项目中已打开的 UI 文档。" };
      }
      try {
        var result = await config.save(decodeURIComponent(path.slice(config.FILE_ROOT.length)), text, expectedText);
        // conflict: the file changed on disk since it was opened (hosts report it, e.g. HTTP 409).
        if (!result || !result.ok) return { ok: false, conflict: !!(result && result.conflict), error: (result && result.error) || "保存失败，请保留修改后重试。" };
        return { ok: true, mode: result.mode || "maker" };
      } catch (error) { return { ok: false, error: error.message || String(error) }; }
    },
  };
})(window);
