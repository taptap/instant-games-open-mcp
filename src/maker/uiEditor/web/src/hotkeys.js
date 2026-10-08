// hotkeys.js
// 用途：Figma 风格快捷键。Mac 用 Command，Windows 用 Ctrl。
(function () {
  "use strict";

  function isTyping(el) {
    if (!el) return false;
    var tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  function mod(event) {
    return event.metaKey || event.ctrlKey;
  }

  window.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || event.isComposing) return;
    var save = mod(event) && event.key.toLowerCase() === "s";
    // Suppress browser Save Page even when the editor is busy or modal.
    if (save) event.preventDefault();
    if (document.querySelector("dialog[open]")) return;
    if (window.UrhoxProject && window.UrhoxProject.isOpening && window.UrhoxProject.isOpening()) return;
    if (event.key === "Escape" && !isTyping(event.target) && window.UrhoxProject &&
        window.UrhoxProject.cancelReplaceImage && window.UrhoxProject.cancelReplaceImage()) {
      event.preventDefault();
      return;
    }
    if (save) {
      if (window.UrhoxProject) window.UrhoxProject.saveCurrent();
      return;
    }
    if (isTyping(event.target)) return;
    var api = window.UrhoxPreview;
    var view = window.UrhoxView;
    if (!api) return;

    var key = event.key;
    var shift = event.shiftKey;

    if (mod(event) && key.toLowerCase() === "z") {
      event.preventDefault();
      if (shift) api.redo();
      else api.undo();
      return;
    }
    if (mod(event) && key.toLowerCase() === "y") {
      event.preventDefault();
      api.redo();
      return;
    }
    if (mod(event) && key.toLowerCase() === "c") {
      event.preventDefault();
      api.copy();
      return;
    }
    if (mod(event) && key.toLowerCase() === "x") {
      event.preventDefault();
      api.cut();
      return;
    }
    if (mod(event) && key.toLowerCase() === "v") {
      event.preventDefault();
      api.paste();
      return;
    }
    if (mod(event) && key.toLowerCase() === "d") {
      event.preventDefault();
      api.duplicate();
      return;
    }
    if (mod(event) && key.toLowerCase() === "a") {
      event.preventDefault();
      if (api.selectAll) api.selectAll();
      return;
    }
    if (mod(event) && shift && key.toLowerCase() === "h") {
      event.preventDefault();
      api.toggleVisible();
      return;
    }
    if (mod(event) && shift && key.toLowerCase() === "l") {
      event.preventDefault();
      api.toggleLocked();
      return;
    }
    if (mod(event) && key.toLowerCase() === "r") {
      event.preventDefault();
      api.rename();
      return;
    }
    if (mod(event) && key.toLowerCase() === "g") {
      event.preventDefault();
      if (shift) api.ungroup && api.ungroup();
      else api.group && api.group();
      return;
    }
    if (key === "]") {
      event.preventDefault();
      api.moveLayer && api.moveLayer(1, event.altKey);
      return;
    }
    if (key === "[") {
      event.preventDefault();
      api.moveLayer && api.moveLayer(-1, event.altKey);
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      if (api.confirmDelete) api.confirmDelete();
      else api.remove();
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      api.deselect();
      return;
    }
    if (key === "Enter" && shift) {
      event.preventDefault();
      api.selectParent && api.selectParent();
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      api.selectChild && api.selectChild();
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      var step = shift ? 10 : 1;
      var dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
      var dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
      api.nudge(dx, dy);
      return;
    }
    if (shift && !mod(event) && !event.altKey && (event.code === "Digit1" || key === "1") && view) {
      event.preventDefault();
      view.fit();
      return;
    }
    if (shift && !mod(event) && !event.altKey && (event.code === "Digit0" || key === "0") && view) {
      event.preventDefault();
      view.setZoom(1);
      return;
    }
    if (shift && !mod(event) && !event.altKey && (event.code === "Digit2" || key === "2") && view) {
      event.preventDefault();
      view.fitSelected && view.fitSelected();
      return;
    }
    if (mod(event) && (key === "=" || key === "+") && view) {
      event.preventDefault();
      view.zoomBy(1.1);
      return;
    }
    if (mod(event) && key === "-" && view) {
      event.preventDefault();
      view.zoomBy(1 / 1.1);
      return;
    }
  });
})();
