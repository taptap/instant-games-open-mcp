export const architectureScript = String.raw`
const syncTheme = theme => document.body.classList.toggle('dark', theme === 'dark');
syncTheme(window.MakerConsole.getTheme());
window.MakerConsole.onThemeChange(syncTheme);
async function loadArchitecture() {
  const key = new URLSearchParams(location.search).get('project');
  if (!key || !/^[a-f0-9]{64}$/.test(key)) throw new Error('请从控制台选择项目后打开架构图。');
  const response = await fetch('/api/projects/' + key + '/architecture', {credentials:'omit',cache:'no-store',redirect:'error'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '架构读取失败，请重新打开项目检查页面。');
  if (!data) throw new Error('尚未生成结果，请返回项目检查复制给 AI 的指令。');
  document.getElementById('load-status').hidden = true;
  document.querySelector('.workspace').hidden = false;
  return data;
}
const data = await loadArchitecture(),
  $ = (id) => document.getElementById(id);
let project = data.projects[0],
  groupId = "g0",
  tab = "structure",
  tour = null,
  tourIndex = 0,
  fileLimit = 60,
  toastTimer;
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const btn = (text, fn, cls) => {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
};
function message(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3500);
}
async function copy(value) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(value);
    ok = true;
  } catch {
    const t = el("textarea");
    t.value = value;
    t.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px";
    document.body.append(t);
    t.select();
    try {
      ok = document.execCommand("copy");
    } catch {}
    t.remove();
  }
  message(
    ok ? "已复制源码位置" : "自动复制未成功，请在源码依据中查看文件路径。",
  );
}
function sourceButton(ref, label) {
  return btn(
    label || ref.path + ":" + ref.line,
    () => copy(project.path + "/" + ref.path + ":" + ref.line),
    "flow-source",
  );
}
function stopTour() {
  clearInterval(tour);
  tour = null;
  $("tour").textContent = "逐个讲解";
}
function setTab(next) {
  stopTour();
  tab = next;
  for (const id of ["structure", "flow", "evidence"])
    $(id).hidden = id !== next;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.tab === next)),
    );
  if (next === "structure") requestAnimationFrame(drawWires);
  if (next === "flow") renderFlow();
  if (next === "evidence") renderEvidence();
}
function selectProject(p) {
  stopTour();
  project = p;
  groupId = p.groups[0].id;
  fileLimit = 60;
  $("file-search").value = "";
  $("name").textContent = p.displayName;
  $("summary").textContent = p.summary;
  $("insight").textContent = p.insight;
  $("identity").replaceChildren(
    el("span", p.kind, "badge"),
    el("span", " 目录：" + p.name + " · " + p.source),
  );
  $("stats").replaceChildren(
    ...[
      [p.files.length, "扫描内 Lua 脚本"],
      [p.groups.length, p.single ? "文件内职责" : "职责模块"],
      [p.edges.length + p.manualEdges.length, "已解析加载引用"],
      [p.ui.length, "扫描内 UI 文档"],
    ].map(([value, label]) => {
      const s = el("div", undefined, "stat");
      s.append(el("b", String(value)), el("span", label));
      return s;
    }),
  );
  $("map-hint").textContent = p.single
    ? "同一脚本的职责拆解。虚线表示包含关系，不是函数调用顺序。"
    : "点击模块查看引用关系；只突出当前模块，避免连线挤成一团。";
  $("entries").replaceChildren(
    ...p.entries.map((e) => {
      const row = el("div", undefined, "entry");
      row.append(
        el("code", e.kind),
        el("span", e.path || "未解析：" + e.value, "source"),
      );
      if (e.path)
        row.append(btn("复制位置", () => copy(p.path + "/" + e.path)));
      return row;
    }),
  );
  $("footer").textContent =
    "快照时间：" +
    new Date(data.scannedAt).toLocaleString("zh-CN") +
    " · 当前范围 " +
    data.stats.projects +
    " 个项目 / " +
    data.stats.files.toLocaleString() +
    " 个源码文件 · 静态结构，不是实时运行追踪。";

  renderStructure();
  if (tab === "flow") renderFlow();
  if (tab === "evidence") renderEvidence();

}
function renderStructure() {
  const nodes = $("nodes");
  nodes.replaceChildren();
  const related = new Set([groupId]);
  for (const edge of project.groupEdges)
    if (edge.from === groupId || edge.to === groupId) {
      related.add(edge.from);
      related.add(edge.to);
    }
  project.groups.forEach((g, i) => {
    const b = btn(
      "",
      () => {
        stopTour();
        groupId = g.id;
        renderStructure();
      },
      "module",
    );
    b.dataset.group = g.id;
    b.setAttribute("aria-pressed", String(g.id === groupId));
    b.classList.toggle("dim", !related.has(g.id));
    b.classList.toggle("linked", g.id !== groupId && related.has(g.id));
    b.append(
      el("span", String(i + 1).padStart(2, "0"), "number"),
      el("b", g.title),
      el("p", g.description),
      el(
        "small",
        g.symbols.length
          ? g.symbols.length + " 个函数 · " + g.files.length + " 个文件"
          : g.files.length + " 个文件",
      ),
    );
    nodes.append(b);
  });
  renderInspector();
  const relations = $("relationships");
  relations.replaceChildren();
  for (const e of project.groupEdges.filter(
    (e) => e.from === groupId || e.to === groupId,
  )) {
    const a = project.groups.find((g) => g.id === e.from),
      b = project.groups.find((g) => g.id === e.to);
    relations.append(
      btn(
        a.title +
          " → " +
          b.title +
          " · " +
          e.count +
          " " +
          (e.kind === "包含职责" ? "个函数" : "处加载"),
        () => {
          groupId = e.from === groupId ? e.to : e.from;
          stopTour();
          renderStructure();
        },
      ),
    );
  }
  if (!relations.childNodes.length)
    relations.append(
      el(
        "p",
        "未提取到跨组静态加载关系；不代表这个模块没有运行时交互。",
        "empty",
      ),
    );
  requestAnimationFrame(drawWires);
}
function drawWires() {
  if (tab !== "structure") return;
  const svg = $("wires"),
    map = $("map");
  svg.replaceChildren();
  const NS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const defs = s("defs", {}),
    marker = s("marker", {
      id: "arrow",
      viewBox: "0 0 10 10",
      refX: "9",
      refY: "5",
      markerWidth: "6",
      markerHeight: "6",
      orient: "auto-start-reverse",
    });
  marker.append(
    s("path", {
      d: "M 1 1 L 9 5 L 1 9",
      fill: "none",
      stroke: "var(--accent)",
      "stroke-width": "1.5",
    }),
  );
  defs.append(marker);
  svg.append(defs);
  const rect = map.getBoundingClientRect();
  let lane = 0;
  for (const edge of project.groupEdges) {
    if (edge.from !== groupId && edge.to !== groupId) continue;
    const a = $("nodes")
        .querySelector('[data-group="' + edge.from + '"]')
        .getBoundingClientRect(),
      b = $("nodes")
        .querySelector('[data-group="' + edge.to + '"]')
        .getBoundingClientRect();
    const ax = a.left + a.width / 2 - rect.left,
      ay = a.bottom - rect.top,
      bx = b.left + b.width / 2 - rect.left,
      by = b.top - rect.top;
    let d;
    if (by > ay + 4) {
      const mid = ay + 18 + (lane % 3) * 8;
      d = "M " + ax + " " + ay + " V " + mid + " H " + bx + " V " + by;
    } else if (Math.abs(a.top - b.top) < 10) {
      const y = Math.max(a.bottom, b.bottom) - rect.top + 18 + (lane % 2) * 8;
      d =
        "M " +
        ax +
        " " +
        ay +
        " V " +
        y +
        " H " +
        bx +
        " V " +
        (b.bottom - rect.top);
    } else {
      const side = rect.width - 7 - (lane % 2) * 6;
      d =
        "M " +
        (a.right - rect.left) +
        " " +
        (a.top + a.height / 2 - rect.top) +
        " H " +
        side +
        " V " +
        (b.top + b.height / 2 - rect.top) +
        " H " +
        (b.right - rect.left);
    }
    const path = s("path", {
      d,
      class: "wire main" + (edge.kind === "包含职责" ? " dashed" : ""),
      "marker-end": "url(#arrow)",
    });
    svg.append(path);
    lane++;
  }
}
function renderInspector() {
  const g = project.groups.find((g) => g.id === groupId),
    root = $("inspector");
  root.replaceChildren(
    el("p", "当前模块", "eyebrow"),
    el("h2", g.title),
    el("p", g.description),
  );
  if (g.symbols.length) {
    root.append(el("h4", "源码函数"));
    for (const f of g.symbols) {
      const item = el("div", undefined, "file-item");
      item.append(
        el("b", f.name),
        el("small", f.path + ":" + f.line),
        btn("复制位置", () => copy(project.path + "/" + f.path + ":" + f.line)),
      );
      root.append(item);
    }
  } else {
    root.append(el("h4", "包含的文件 · " + g.files.length));
    let limit = 25;
    const container = el("div");
    root.append(container);
    function more() {
      container.replaceChildren();
      for (const path of g.files.slice(0, limit)) {
        const f = project.files.find((f) => f.path === path);
        const item = el("div", undefined, "file-item");
        item.append(
          el("b", path.replace(/^scripts\//, "")),
          el(
            "small",
            f.lines.toLocaleString() +
              " 行 · " +
              f.functions.length +
              " 个具名函数",
          ),
          btn("查看引用与函数", () => {
            setTab("evidence");
            $("file-search").value = path;
            renderFiles();
            $("evidence").scrollIntoView({
              block: "start",
              behavior: "instant",
            });
          }),
        );
        container.append(item);
      }
      if (g.files.length > limit)
        container.append(
          btn(
            "再显示 25 个（还有 " + (g.files.length - limit) + " 个）",
            () => {
              limit += 25;
              more();
            },
          ),
        );
    }
    more();
  }
  const edges = project.groupEdges.filter(
    (e) => e.kind !== "包含职责" && (e.from === groupId || e.to === groupId),
  );
  if (edges.length) {
    const detail = el("details");
    detail.append(
      el(
        "summary",
        "引用证据 · " + edges.reduce((n, e) => n + e.count, 0) + " 处",
      ),
    );
    for (const edge of edges) {
      const block = el("details");
      block.append(
        el(
          "summary",
          project.groups.find((g) => g.id === edge.from).title +
            " → " +
            project.groups.find((g) => g.id === edge.to).title,
        ),
      );
      block.addEventListener("toggle", () => {
        if (!block.open || block.dataset.loaded) return;
        block.dataset.loaded = "1";
        for (const e of edge.evidence) {
          const r = el("div", undefined, "source-edge");
          r.append(
            el("b", e.module),
            el("small", e.from + ":" + e.line + " → " + e.to),
            el("small", e.kind || "字面量 require / pcall(require)"),
          );
          block.append(r);
        }
      });
      detail.append(block);
    }
    root.append(detail);
  }
}
function renderFlow() {
  const root = $("flow-map");
  root.replaceChildren();
  const flow = project.flow;
  if (flow) {
    $("flow-title").textContent = flow.title;
    $("flow-note").textContent = flow.note;
    $("flow-badge").textContent = "AI 已阅读关键代码 · 以所列依据为准";
    $("flow-extra").textContent = flow.extra;
    const grid = el("div", undefined, "flow-nodes");
    flow.nodes.forEach((n, i) => {
      const card = el("article", undefined, "flow-node");
      card.id = "flow-" + n.id;
      card.append(
        el("span", String(i + 1).padStart(2, "0"), "step-id"),
        el("h3", n.label),
        el("p", n.evidence.symbol, "source"),
        sourceButton(n.evidence),
      );
      const links = el("div", undefined, "flow-links");
      for (const edge of flow.edges.filter((e) => e.from === n.id)) {
        const to = flow.nodes.find((x) => x.id === edge.to);
        const b = btn("→ " + to.label, () => {
          root
            .querySelectorAll(".active")
            .forEach((e) => e.classList.remove("active"));
          $("flow-" + to.id).classList.add("active");
          $("flow-" + to.id).scrollIntoView({
            behavior: "instant",
            block: "center",
          });
        });
        b.append(el("span", edge.label));
        links.append(b);
      }
      card.append(links);
      grid.append(card);
    });
    root.append(grid);
  } else {
    $("flow-title").textContent = "按职责阅读这个项目";
    $("flow-note").textContent =
      "以下是源码导览顺序，不是已经验证的业务执行流程。";
    $("flow-badge").textContent = "结构已梳理 · 业务流程尚未逐分支复核";
    $("flow-extra").textContent =
      "当前项目已提取真实文件与加载引用。复杂事件、闭包、动态加载和网络消息需要进一步阅读；不把 require 顺序当作游戏运行顺序。";
    const grid = el("div", undefined, "guide");
    project.guide.forEach((n, i) => {
      const card = el("article");
      card.append(
        el("span", String(i + 1).padStart(2, "0"), "step-id"),
        el("h3", n.title),
        el("p", n.text),
        sourceButton(n.evidence, "查看位置：" + n.evidence.path),
      );
      grid.append(card);
    });
    root.append(grid);
  }
}
function renderEvidence() {
  $("evidence-summary").textContent =
    "字面量加载已解析 " +
    project.edges.length +
    " 处；人工确认动态加载 " +
    project.manualEdges.length +
    " 处；已识别外部库引用 " +
    project.engineRefs.length +
    " 处；其它未解析 " +
    project.unresolved.length +
    " 处。发现 " +
    project.dynamicCount +
    " 处动态 require。" +
    (project.manualEdges.length
      ? "其中已补充经阅读确认的加载关系，其余目标仍需核对。"
      : project.dynamicCount
        ? "动态目标未自动展开，需要结合上下文核对。"
        : "");
  renderFiles();
  $("uncertain-title").textContent =
    "未解析与读取边界 · " +
    (project.unresolved.length + project.notes.length) +
    " 项";
  $("uncertain").replaceChildren();
  for (const e of project.unresolved) {
    const row = el("div", undefined, "source-edge");
    row.append(
      el("b", e.module),
      el("small", e.from + ":" + e.line + " · " + e.reason),
    );
    $("uncertain").append(row);
  }
  for (const note of project.notes) $("uncertain").append(el("p", note));
  if (!project.unresolved.length && !project.notes.length)
    $("uncertain").append(
      el("p", "本轮支持的字面量引用已解析；仍不覆盖运行时加载和完整语法校验。"),
    );
  $("excluded").replaceChildren(
    el(
      "p",
      "外部库：" +
        [...new Set(project.engineRefs.map((e) => e.module))].join("、"),
    ),
    el("p", "排除目录：" + project.skipped.join("、")),
    el(
      "p",
      "字面量引用按 scripts/、assets/ 与根目录约定解析。自定义 package.path、模块别名、dofile/loadfile、字符串拼接及长字符串加载未做完整解释；扫描结果不是 Lua 编译器或运行时追踪器。",
    ),
  );
}
function renderFiles() {
  const root = $("files"),
    q = $("file-search").value.trim().toLowerCase();
  root.replaceChildren();
  const matches = project.files.filter(
    (f) =>
      f.path.toLowerCase().includes(q) ||
      f.functions.some((x) => x.name.toLowerCase().includes(q)),
  );
  root.append(
    el(
      "p",
      "匹配 " +
        matches.length +
        " 个文件，当前显示 " +
        Math.min(matches.length, fileLimit) +
        " 个。",
      "source",
    ),
  );
  for (const f of matches.slice(0, fileLimit)) {
    const d = el("details", undefined, "file-card");
    const s = el("summary", f.path);
    s.append(
      el("small", f.lines + " 行 / " + f.functions.length + " 个具名函数"),
    );
    d.append(s);
    d.addEventListener("toggle", () => {
      if (!d.open || d.dataset.loaded) return;
      d.dataset.loaded = "1";
      d.append(
        btn("复制文件位置", () => copy(project.path + "/" + f.path)),
        el("p", "源码 SHA-256：" + f.sha256, "source"),
      );
      const symbols = el("div", undefined, "symbols");
      for (const fn of f.functions)
        symbols.append(
          btn(fn.name + " :" + fn.line, () =>
            copy(project.path + "/" + f.path + ":" + fn.line),
          ),
        );
      d.append(symbols);
      const edges = [...project.edges, ...project.manualEdges].filter(
        (e) => e.from === f.path,
      );
      for (const e of edges) {
        const row = el("div", undefined, "source-edge");
        row.append(
          el("b", e.module + " → " + e.to),
          el("small", "第 " + e.line + " 行 · " + (e.kind || "字面量加载")),
        );
        d.append(row);
      }
      const unresolved = [...project.engineRefs, ...project.unresolved].filter(
        (e) => e.from === f.path,
      );
      for (const e of unresolved)
        d.append(
          el(
            "p",
            "第 " + e.line + " 行 · " + e.module + "（外部或未解析）",
            "source",
          ),
        );
    });
    root.append(d);
  }
  if (matches.length > fileLimit)
    root.append(
      btn("再显示 60 个文件", () => {
        fileLimit += 60;
        renderFiles();
      }),
    );
}
$("file-search").oninput = () => {
  fileLimit = 60;
  renderFiles();
};
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
$("tour").onclick = () => {
  if (tour) {
    stopTour();
    return;
  }
  tourIndex = project.groups.findIndex((g) => g.id === groupId);
  $("tour").textContent = "停止讲解";
  tour = setInterval(() => {
    tourIndex++;
    if (tourIndex >= project.groups.length) {
      stopTour();
      return;
    }
    groupId = project.groups[tourIndex].id;
    renderStructure();
  }, 3500);
};
$("export").onclick = () => {
  const blob = new Blob(
      [JSON.stringify({ scannedAt: data.scannedAt, project }, null, 2)],
      { type: "application/json" },
    ),
    url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download =
    project.name.replace(/[\\/:*?"<>|]/g, "_") + ".architecture.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopTour();
});
window.addEventListener("pagehide", stopTour);
new ResizeObserver(() => requestAnimationFrame(drawWires)).observe($("map"));
selectProject(data.projects[0]);

window.addEventListener("message",event => { if (event.source === window.parent && event.origin === location.origin && event.data?.type === "maker:architecture-visibility" && !event.data.visible) stopTour(); });

`;
