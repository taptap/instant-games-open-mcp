// adapt-ui.js
// 用途：多屏适配检查的弹窗。结果可点击回到对应屏幕和节点，也可复制给 AI。
(function (root) {
  "use strict";
  function el(id) { return document.getElementById(id); }
  var button = el("adaptBtn"), dialog = el("adaptDialog");
  if (!button || !dialog) return;
  var report = null;
  var checkVersion = 0;

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text != null) item.textContent = text;
    return item;
  }

  function jump(index, editorIds) {
    var api = root.UrhoxPreview;
    var scene = report.results[index].scene;
    dialog.close();
    api.applyScene(scene);
    if (editorIds && editorIds.length) api.selectEditorIds(editorIds);
  }

  function renderScenes() {
    var box = el("adaptScenes");
    box.replaceChildren();
    var active = root.UrhoxPreview.currentScene;
    report.results.forEach(function (res, index) {
      var counts = res.counts;
      var card = node("button", "adapt-scene");
      card.type = "button";
      card.title = "切换到这块屏幕查看";
      card.appendChild(node("span", "adapt-thumb")).appendChild(res.thumb);
      card.appendChild(node("strong", "", root.UrhoxAdapt.sceneName(res.scene)));
      var status = counts.problem + counts.warning
        ? (counts.problem ? counts.problem + " 个问题" : "") + (counts.problem && counts.warning ? " · " : "") +
          (counts.warning ? counts.warning + " 个警告" : "")
        : counts.hint ? "仅 " + counts.hint + " 条提示" : "未发现问题";
      var line = node("span", "adapt-scene-meta " + (counts.problem ? "problem" : counts.warning ? "warning" : "ok"),
        res.width + "×" + res.height + " · " + status);
      card.appendChild(line);
      if (res.scene.id === active.id && res.scene.orientation === active.orientation) card.classList.add("current");
      card.addEventListener("click", function () { jump(index, null); });
      box.appendChild(card);
    });
  }

  function issueRow(item) {
    var api = root.UrhoxAdapt;
    var row = node("button", "adapt-issue " + item.severity);
    row.type = "button";
    row.title = item.editorIds.length ? "切换到有问题的屏幕并选中" + (item.count > 1 ? "这 " + item.count + " 个节点" : "该节点")
      : "该节点由模板或组件生成，只能切换屏幕";
    var head = node("span", "adapt-issue-head");
    head.appendChild(node("b", "", api.severity[item.severity].label));
    head.appendChild(node("span", "adapt-issue-node", api.nodeName(item.label, item.count)));
    row.appendChild(head);
    row.appendChild(node("span", "adapt-issue-msg", item.messages[item.scenes[0]]));
    var chips = node("span", "adapt-chips");
    if (item.scenes.length === report.results.length) {
      chips.appendChild(node("span", "adapt-chip", "所有屏幕"));
    } else {
      item.scenes.forEach(function (index) {
        var chip = node("span", "adapt-chip", report.results[index].scene.short);
        chip.title = item.messages[index];
        chips.appendChild(chip);
      });
    }
    row.appendChild(chips);
    row.addEventListener("click", function () { jump(item.scenes[0], item.editorIds); });
    return row;
  }

  function renderIssues() {
    var box = el("adaptIssues");
    box.replaceChildren();
    var strong = report.issues.filter(function (i) { return i.severity !== "hint"; });
    var hints = report.issues.filter(function (i) { return i.severity === "hint"; });
    if (!strong.length) {
      box.appendChild(node("p", "adapt-ok", hints.length ? "没有越界或安全区问题。" : "所有检查屏幕都没有发现问题。"));
    }
    strong.forEach(function (item) { box.appendChild(issueRow(item)); });
    if (hints.length) {
      var details = node("details", "adapt-hints");
      details.appendChild(node("summary", "", "触控区偏小的按钮（" + hints.length + "）"));
      hints.forEach(function (item) { details.appendChild(issueRow(item)); });
      box.appendChild(details);
    }
  }

  function summary() {
    var strong = report.issues.filter(function (i) { return i.severity !== "hint"; });
    var problems = strong.filter(function (i) { return i.severity === "problem"; }).length;
    var hints = report.issues.length - strong.length;
    var clean = report.results.filter(function (r) { return !r.issues.some(function (i) { return i.severity !== "hint"; }); }).length;
    el("adaptSummary").textContent = strong.length
      ? strong.length + " 处需要处理" + (problems ? "（其中 " + problems + " 处会被屏幕边缘裁掉）" : "") +
        (hints ? "，另有 " + hints + " 条提示" : "") + " · " + clean + "/" + report.results.length + " 块屏幕完全正常"
      : "全部 " + report.results.length + " 块屏幕都没有越界、安全区或文字超框" + (hints ? "，另有 " + hints + " 条提示" : "");
  }

  function open() {
    var api = root.UrhoxPreview;
    if (!api || (root.UrhoxProject && root.UrhoxProject.isOpening && root.UrhoxProject.isOpening())) return;
    var version = ++checkVersion;
    report = null;
    el("adaptCopyStatus").textContent = "";
    el("adaptOrientation").textContent = "";
    el("adaptScenes").replaceChildren();
    el("adaptIssues").replaceChildren();
    if (!dialog.open) dialog.showModal();
    if (!api.canProbe) {
      el("adaptSummary").textContent = api.tree
        ? "当前打开的是组件。请先勾选顶部“在屏幕中预览组件”，再做适配检查。"
        : "还没有打开 UI 文档。请先在底部选择一个 .ui.json。";
      return;
    }
    el("adaptSummary").textContent = "正在检查…";
    requestAnimationFrame(function () {
      setTimeout(async function () {
        if (version !== checkVersion || !dialog.open) return;
        try {
          var result = await root.UrhoxAdapt.run();
          if (version !== checkVersion || !dialog.open) return;
          report = result;
          if (!report) { dialog.close(); return; }
          el("adaptOrientation").textContent = report.note;
          summary(); renderScenes(); renderIssues();
        } catch (error) {
          if (version !== checkVersion || !dialog.open) return;
          console.error(error);
          el("adaptSummary").textContent = "检查失败：" + (error && error.message || error);
        }
      }, 20);
    });
  }

  button.addEventListener("click", open);
  dialog.addEventListener("close", function () { checkVersion++; report = null; });
  el("adaptClose").addEventListener("click", function () { dialog.close(); });
  el("adaptRerun").addEventListener("click", open);
  el("adaptCopy").addEventListener("click", async function () {
    if (!report) return;
    var status = el("adaptCopyStatus");
    var text = root.UrhoxAdapt.toMarkdown(report, root.UrhoxPreview.currentPath);
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "已复制，可直接发给 AI";
    } catch (_) {
      status.textContent = "浏览器未允许自动复制";
    }
  });
  dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
})(window);
