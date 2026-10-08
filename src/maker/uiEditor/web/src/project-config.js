// project-config.js
// 用途：统一项目配置的轻量契约，供本地清单、目录句柄和文件夹输入复用。
(function (root) {
  "use strict";

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  }

  function normalize(raw, source) {
    raw = raw && typeof raw === "object" ? raw : {};
    var publish = raw.taptap_publish && typeof raw.taptap_publish === "object"
      ? raw.taptap_publish
      : raw;
    var orientation = publish.screen_orientation === "landscape" || publish.orientation === "landscape"
      ? "landscape"
      : publish.screen_orientation === "portrait" || publish.orientation === "portrait"
        ? "portrait"
        : null;
    return {
      orientation: orientation,
      designWidth: finite(raw.designWidth) || finite(raw.design_width),
      designHeight: finite(raw.designHeight) || finite(raw.design_height),
      source: source || raw.source || ".project/project.json",
    };
  }

  function parse(text, source) {
    try {
      return { config: normalize(JSON.parse(text), source), error: "" };
    } catch (error) {
      return { config: null, error: error && error.message ? error.message : String(error) };
    }
  }

  root.UrhoxProjectConfig = {
    normalize: normalize,
    parse: parse,
  };
})(window);
