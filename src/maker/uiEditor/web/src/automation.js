(function () {
  "use strict";
  var query = new URLSearchParams(location.search);
  var jobId = query.get("render");
  var api = window.UrhoxConfig.API_ROOT + "render/";
  async function request(route, body) {
    var response = await fetch(api + route, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    var value = await response.json();
    if (!response.ok) throw new Error(value.error || "预览请求失败：" + response.status);
    return value;
  }
  if (jobId) {
    (async function () {
      var worker = query.get("worker");
      try {
        var job = await request(jobId + "/input");
        var value = await window.UrhoxPreview.renderSaved(job);
        await request(jobId + "/complete", Object.assign({ worker: worker }, value));
      } catch (error) {
        await request(jobId + "/complete", { worker: worker, error: String(error.message || error) }).catch(function () {});
      } finally {
        parent.postMessage({ type: "maker-ui-render-complete", id: jobId }, location.origin);
      }
    })();
    return;
  }
  var pageId = crypto.randomUUID();
  var active = null;
  window.addEventListener("message", function (event) {
    if (event.origin === location.origin && active && event.source === active.frame.contentWindow &&
        event.data && event.data.type === "maker-ui-render-complete" && event.data.id === active.id) {
      active.frame.remove(); active = null;
    }
  });
  async function poll() {
    try {
      if (active && Date.now() - active.at > 45000) { active.frame.remove(); active = null; }
      var job = await request("claim", { pageId: pageId, busy: !!active });
      if (!active) {
        if (job.id) {
          var frame = document.createElement("iframe");
          frame.hidden = true;
          frame.setAttribute("aria-hidden", "true");
          frame.src = "/ui-editor/?" + new URLSearchParams({ project: window.UrhoxConfig.MAKER_PROJECT, render: job.id, worker: job.worker });
          active = { id: job.id, frame: frame, at: Date.now() };
          document.body.appendChild(frame);
        }
      }
    } catch (_) {}
    setTimeout(poll, 1000);
  }
  poll();
})();
