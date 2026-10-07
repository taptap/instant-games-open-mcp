(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }
  var prompt = "请使用 Maker 内置 maker-ui-workflow Skill，处理控制台当前项目的 UI。" +
    "先检查已有设计稿、切图、布局清单和 UI.json，按我的要求从相应阶段继续。" +
    "设计稿拆分时记录元素 ID、位置和层级，切图与布局明确绑定，保留备用素材。" +
    "按布局组装 .ui.json，显式生成 meta，在控制台 UI 编辑器中对照设计稿检查并调整。" +
    "不要覆盖我手工修改过的 UI，不修改游戏加载入口或玩法。";
  el("skillPrompt").value = prompt;
  async function copy(textarea, status) {
    try {
      await navigator.clipboard.writeText(textarea.value);
      status.textContent = "已复制";
    } catch (_) {
      var details = textarea.closest("details");
      if (details) details.open = true;
      textarea.focus();
      textarea.select();
      status.textContent = "浏览器未允许自动复制，文本已选中，请按 Ctrl/Cmd+C。";
    }
  }
  function openGuide(projectName) {
    el("missingUiTitle").textContent = projectName ? "这个项目没有 .ui.json" : "UI 设计稿拆解与还原";
    el("missingUiDescription").textContent = projectName
      ? "在「" + projectName + "」中未找到 .ui.json。可把设计稿或已有素材交给 AI 组装，完成后刷新文件；也可以先体验新手示例。"
      : "把下面的指令交给 AI，使用 Maker 内置工作流。已有 UI 可以直接对照编辑。";
    el("skillCopyStatus").textContent = "";
    if (!el("missingUiDialog").open) el("missingUiDialog").showModal();
  }
  el("skillHelpBtn").addEventListener("click", function () { openGuide(); });
  el("copySkillPrompt").addEventListener("click", function () {
    return copy(el("skillPrompt"), el("skillCopyStatus"));
  });
  el("checkUiBtn").addEventListener("click", function () {
    var api = window.UrhoxPreview;
    if (!api || !api.tree || (window.UrhoxProject && window.UrhoxProject.isOpening && window.UrhoxProject.isOpening())) return;
    var tree = api.tree;
    var project = window.UrhoxProject;
    var resourcesReady = project && (!project.isResourceIndexReady || project.isResourceIndexReady());
    var report = window.UrhoxUICheck.checkDocument({
      file: api.currentPath, tree: api.getJSON(),
      resourceExists: resourcesReady ? project.resourceExists : null,
    });
    if (!resourcesReady) {
      report.warnings += 1;
      report.diagnostics.push({ code: "UI_RESOURCE_INDEX_PENDING", severity: "warning",
        file: api.currentPath, pointer: "", message: "资源索引尚未就绪，本次未检查资源是否存在。请等待项目加载完成后重试；加载失败时先处理顶栏错误。" });
    }
    el("uiCheckSummary").textContent = report.errors + " 个错误，" + report.warnings + " 个提示 · 当前文档";
    el("uiCheckOutput").value = JSON.stringify(report, null, 2);
    el("checkCopyStatus").textContent = "";
    var list = el("uiCheckList");
    list.replaceChildren();
    report.diagnostics.forEach(function (d) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "diagnostic-item " + d.severity;
      button.textContent = (d.severity === "error" ? "错误" : "提示") + " · " + d.code +
        "\n" + (d.pointer || "/") + "\n" + d.message;
      button.title = "定位源节点";
      button.addEventListener("click", function () {
        el("uiCheckDialog").close();
        if (api.tree === tree) api.selectDiagnosticNode(d.pointer);
      });
      list.appendChild(button);
    });
    if (!report.diagnostics.length) {
      var empty = document.createElement("p");
      empty.textContent = "当前静态检查未发现问题。";
      list.appendChild(empty);
    }
    el("uiCheckDialog").showModal();
  });
  el("copyCheckReport").addEventListener("click", function () {
    return copy(el("uiCheckOutput"), el("checkCopyStatus"));
  });
  el("closeCheckReport").addEventListener("click", function () { el("uiCheckDialog").close(); });
  window.UrhoxGuidance = { open: openGuide };
})();
