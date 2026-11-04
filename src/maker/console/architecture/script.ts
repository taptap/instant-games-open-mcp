export const architectureScript = String.raw`
const architectureQuery = new URLSearchParams(location.search);
const compactArchitecture = architectureQuery.get('view') === 'compact';
document.body.classList.toggle('architecture-compact', compactArchitecture);
const architectureReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let architectureVisible = true;
function syncArchitectureMotion() {
  const paused = document.hidden || !architectureVisible || architectureReducedMotion.matches;
  document.body.classList.toggle('architecture-motion-paused', paused);
  const wires = document.getElementById('wires');
  if (paused) wires.pauseAnimations(); else wires.unpauseAnimations();
}
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
  tour = null,
  tourIndex = 0,
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
    ok ? "已复制源码位置" : "自动复制未成功，请手动记录文件路径。",
  );
}
function stopTour() {
  clearInterval(tour);
  tour = null;
  $("tour").textContent = "逐个讲解";
}
// Rows of modules ordered by dependency: a module that loads another sits above it.
function layerGroups(p) {
  const order = [...p.groups].sort((a, b) => b.lines - a.lines);
  const next = new Map(order.map((g) => [g.id, []]));
  const touched = new Set();
  for (const e of p.groupEdges) {
    if (e.from === e.to || e.kind === "包含职责") continue;
    next.get(e.from)?.push(e.to);
    touched.add(e.from);
    touched.add(e.to);
  }
  if (!touched.size) return [order];
  // Depth-first walk keeps only forward edges so mutual references cannot form a loop.
  const state = new Map(),
    forward = [];
  const visit = (id) => {
    state.set(id, 1);
    for (const to of next.get(id)) {
      if (state.get(to) === 1) continue;
      forward.push([id, to]);
      if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
  };
  order.forEach((g) => state.has(g.id) || visit(g.id));
  const level = new Map(order.map((g) => [g.id, 0]));
  for (let i = 0; i < order.length; i++)
    for (const [from, to] of forward)
      level.set(to, Math.max(level.get(to), level.get(from) + 1));
  // A long dependency chain would make one module per row; merge neighbouring levels into at most 4 rows.
  const depth = Math.max(...level.values()) + 1,
    rowCount = Math.min(depth, 4);
  const rows = [];
  const loose = [];
  for (const g of order) {
    if (!touched.has(g.id)) {
      loose.push(g);
      continue;
    }
    (rows[Math.floor((level.get(g.id) * rowCount) / depth)] ||= []).push(g);
  }
  rows.forEach((row) => row?.sort((a, b) => level.get(a.id) - level.get(b.id) || b.lines - a.lines));
  const layers = rows.filter(Boolean);
  if (loose.length) layers.push(loose);
  return layers;
}
// Card width follows code size (square-root scale) so one huge module cannot crowd out the rest.
const cardWidth = (lines) => Math.round(Math.min(380, 150 + Math.sqrt(lines) * 1.2));
const fmtLines = (n) =>
  n >= 10000 ? (n / 10000).toFixed(1) + " 万行" : n.toLocaleString() + " 行";
function selectProject(p) {
  stopTour();
  project = p;
  const lineOf = new Map(p.files.map((f) => [f.path, f.lines]));
  p.groups.forEach((g) => {
    g.lines = g.files.reduce((sum, file) => sum + (lineOf.get(file) || 0), 0);
  });
  p.layers = layerGroups(p);
  groupId = p.groups.find(g => g.id === architectureQuery.get('module'))?.id || p.groups[0].id;
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
  let number = 0;
  project.layers.forEach((layer) => {
  const row = el("div", undefined, "layer");
  nodes.append(row);
  layer.forEach((g) => {
    const b = btn(
      "",
      () => {
        stopTour();
        if (compactArchitecture) {
          window.parent.postMessage({type:'maker:architecture-expand',groupId:g.id},location.origin);
          return;
        }
        groupId = g.id;
        renderStructure();
      },
      "module",
    );
    b.dataset.group = g.id;
    b.setAttribute("aria-pressed", String(g.id === groupId));
    b.classList.toggle("dim", !compactArchitecture && !related.has(g.id));
    b.classList.toggle("linked", g.id !== groupId && related.has(g.id));
    // Wider cards for bigger modules; the square root keeps a huge module from squeezing the rest.
    b.style.flex = "0 0 " + cardWidth(g.lines) + "px";
    b.append(
      el("span", String(++number).padStart(2, "0"), "number"),
      el("b", g.title),
      el("p", g.description),
      el(
        "small",
        (g.symbols.length ? g.symbols.length + " 个函数 · " : "") +
          g.files.length +
          " 个文件" +
          (g.lines ? " · " + fmtLines(g.lines) : ""),
      ),
    );
    row.append(b);
  });
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
  const box = (id) => {
    const r = $("nodes")
      .querySelector('[data-group="' + id + '"]')
      .getBoundingClientRect();
    return {
      l: r.left - rect.left,
      w: r.width,
      t: r.top - rect.top,
      b: r.bottom - rect.top,
    };
  };
  // Selecting a module shows all of its links. The small preview only draws downward links
  // (a module to the lower-row module it depends on), at most the two strongest per module.
  let edges = project.groupEdges.filter((e) => e.from !== e.to);
  if (!compactArchitecture)
    edges = edges.filter((e) => e.from === groupId || e.to === groupId);
  let items = edges.map((edge) => {
    const a = box(edge.from),
      c = box(edge.to);
    const dir = c.t > a.b + 4 ? "down" : c.b < a.t - 4 ? "up" : "row";
    return { edge, a, c, dir, aSide: dir === "up" ? "t" : "b", cSide: dir === "down" ? "t" : "b" };
  });
  if (compactArchitecture) {
    const count = new Map();
    items = items
      .filter((it) => it.dir === "down")
      .sort((x, y) => y.edge.count - x.edge.count)
      .filter((it) => {
        const n = count.get(it.edge.from) || 0;
        count.set(it.edge.from, n + 1);
        return n < 2;
      });
  }
  // Spread links along a card edge so they do not pile up on the card centre.
  const slots = new Map();
  const slot = (id, side, item, role) => {
    const key = id + side;
    slots.set(key, [...(slots.get(key) || []), { item, role }]);
  };
  items.forEach((it) => {
    slot(it.edge.from, it.aSide, it, "a");
    slot(it.edge.to, it.cSide, it, "c");
  });
  slots.forEach((list) => {
    const other = (e) => {
      const o = e.role === "a" ? e.item.c : e.item.a;
      return o.l + o.w / 2;
    };
    list.sort((x, y) => other(x) - other(y));
    list.forEach((e, index) => {
      const self = e.role === "a" ? e.item.a : e.item.c;
      e.item[e.role + "x"] = self.l + (self.w * (index + 1)) / (list.length + 1);
    });
  });
  for (const { edge, a, c, dir, aSide, cSide, ax, cx } of items) {
    const ay = aSide === "t" ? a.t : a.b,
      cy = cSide === "t" ? c.t : c.b;
    const mid = (ay + cy) / 2,
      dip = ay + 28;
    const d =
      dir === "row"
        ? "M " + ax + " " + ay + " C " + ax + " " + dip + ", " + cx + " " + (cy + 28) + ", " + cx + " " + cy
        : "M " + ax + " " + ay + " C " + ax + " " + mid + ", " + cx + " " + mid + ", " + cx + " " + cy;
    const path = s("path", {
      d,
      class: "wire main" + (edge.kind === "包含职责" ? " dashed" : ""),
      "marker-end": "url(#arrow)",
    });
    path.style.strokeWidth = String(1 + Math.min(2.5, Math.log2(edge.count + 1) / 2));
    svg.append(path);
    const flow = s("g", { class: "wire-flow" });
    flow.append(
      s("path", {
        d: "M -8 -4 L 0 0 L -8 4",
        fill: "none",
        stroke: "var(--accent)",
        "stroke-width": "2.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
    flow.append(s("animateMotion", { path: d, dur: "3.2s", repeatCount: "indefinite", rotate: "auto" }));
    svg.append(flow);
  }
  syncArchitectureMotion();
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
  syncArchitectureMotion();
});
architectureReducedMotion.addEventListener('change',syncArchitectureMotion);
window.addEventListener("pagehide", stopTour);
new ResizeObserver(() =>
  requestAnimationFrame(() => {
    drawWires();
    if (compactArchitecture)
      window.parent.postMessage(
        { type: "maker:architecture-height", height: document.documentElement.scrollHeight },
        location.origin,
      );
  }),
).observe($("map"));
selectProject(data.projects[0]);

window.addEventListener("message",event => {
  if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== "maker:architecture-visibility") return;
  architectureVisible = !!event.data.visible;
  if (!architectureVisible) stopTour();
  syncArchitectureMotion();
});

`;
