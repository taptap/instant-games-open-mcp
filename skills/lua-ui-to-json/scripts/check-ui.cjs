#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const { checkDocument } = require("./ui-json-check.cjs");

function inside(root, file) {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel));
}
function readProjectConfig(root) {
  const source = ".project/project.json";
  const file = path.join(root, source);
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    const publish = raw && typeof raw.taptap_publish === "object" ? raw.taptap_publish : raw;
    const orientation = publish && (publish.screen_orientation || publish.orientation);
    return { orientation: orientation === "landscape" || orientation === "portrait" ? orientation : null, source };
  } catch (error) {
    if (error.code === "ENOENT") return { orientation: null, source, missing: true };
    return { orientation: null, source, error: error.message };
  }
}
function checkExportManifest(root, assets, files, diagnostics) {
  const relative = "assets/ui/ui-export-manifest.ui.json";
  const file = path.join(assets, "ui", "ui-export-manifest.ui.json");
  if (!fs.existsSync(file)) return;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    diagnostics.push({ code: "UI_MANIFEST_PARSE", severity: "error", file: relative, pointer: "",
      message: error.message });
    return;
  }
  const categories = ["pages", "components", "templates"];
  const actual = new Set(files.map(item => path.relative(assets, item).split(path.sep).join("/")));
  categories.forEach(kind => {
    const listed = Array.isArray(manifest[kind]) ? manifest[kind].filter(item => typeof item === "string") : [];
    const listedSet = new Set(listed);
    const actualFiles = [...actual].filter(item => item.startsWith("ui/" + kind + "/"));
    const missing = listed.filter(item => !actual.has(item));
    const unlisted = actualFiles.filter(item => !listedSet.has(item));
    if (missing.length) diagnostics.push({ code: "UI_MANIFEST_MISSING_FILE", severity: "error",
      file: relative, pointer: "/" + kind, message: "导出清单登记了不存在的文件：" + missing.join(", ") });
    if (unlisted.length) diagnostics.push({ code: "UI_MANIFEST_STALE", severity: "warning",
      file: relative, pointer: "/" + kind, message: "目录中有 " + unlisted.length +
        " 个 " + kind + " 文件未登记，清单可能来自旧导出：" + unlisted.slice(0, 5).join(", ") +
        (unlisted.length > 5 ? " …" : "") });
  });
}
function main(argv) {
  if (argv.includes("--help")) {
    console.log("node check-ui.cjs --project <game-root> [--file assets/ui/page.ui.json] [--format json|text]");
    return 0;
  }
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--project", "--file", "--format"].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw new Error("Unknown or incomplete argument: " + argv[i]);
    }
    args[argv[i]] = argv[i + 1];
  }
  if (!args["--project"]) throw new Error("--project is required");
  const format = args["--format"] || "text";
  if (!["json", "text"].includes(format)) throw new Error("--format must be json or text");
  const root = fs.realpathSync(args["--project"]);
  const assets = fs.realpathSync(path.join(root, "assets"));
  if (!inside(root, assets)) throw new Error("assets must be inside the project");
  const files = [], scanDiagnostics = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if ([".git", "node_modules"].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        scanDiagnostics.push({ code: "UI_SCAN_SYMLINK", severity: "warning",
          file: path.relative(root, file), pointer: "", message: "未递归扫描符号链接，请检查其目标。" });
      } else if (entry.isDirectory()) scan(file);
      else if (/\.ui\.json$/i.test(entry.name)) files.push(file);
    }
  }
  if (args["--file"]) {
    const target = path.resolve(root, args["--file"]);
    if (!inside(assets, target) || !/\.ui\.json$/i.test(target)) throw new Error("--file must be a .ui.json inside assets");
    const real = fs.realpathSync(target);
    if (!inside(assets, real)) throw new Error("--file symlink escapes assets");
    files.push(real);
  } else scan(assets);
  const projectConfig = readProjectConfig(root);
  const report = { version: 1, files: files.length, errors: 0, warnings: 0,
    projectConfig,
    diagnostics: scanDiagnostics, skipped: [] };
  checkExportManifest(root, assets, files, report.diagnostics);
  if (projectConfig.error) report.diagnostics.push({ code: "UI_PROJECT_CONFIG_PARSE", severity: "error",
    file: projectConfig.source, pointer: "", message: projectConfig.error });
  else if (projectConfig.missing) report.diagnostics.push({ code: "UI_PROJECT_CONFIG_MISSING", severity: "warning",
    file: projectConfig.source, pointer: "", message: "未找到项目屏幕方向配置；页面预览可能使用错误的横竖屏设备。" });
  const skipped = new Set();
  function resourceExists(ref) {
    const file = path.resolve(assets, ref);
    if (!inside(assets, file)) return false;
    try {
      const real = fs.realpathSync(file);
      if (!inside(assets, real)) return false;
      fs.accessSync(real, fs.constants.R_OK);
      return fs.statSync(real).isFile();
    } catch (_) { return false; }
  }
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    let tree;
    try {
      if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error("File exceeds 4 MiB");
      tree = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    } catch (error) {
      report.diagnostics.push({ code: "UI_JSON_PARSE", severity: "error",
        file: relative, pointer: "", message: error.message });
      continue;
    }
    const result = checkDocument({ file: relative, tree, resourceExists });
    report.diagnostics.push(...result.diagnostics);
    if (projectConfig.orientation && /assets\/ui\/pages\//i.test(relative) &&
        typeof tree.width === "number" && typeof tree.height === "number") {
      const landscape = tree.width >= tree.height;
      if ((projectConfig.orientation === "landscape") !== landscape) {
        report.diagnostics.push({ code: "UI_DESIGN_ORIENTATION", severity: "error", file: relative,
          pointer: "/width", message: "页面根尺寸 " + tree.width + "×" + tree.height +
            " 与项目配置的 " + projectConfig.orientation + " 方向不一致。" });
      }
    }
    result.skipped.forEach(item => skipped.add(item));
  }
  if (!files.length) report.diagnostics.push({ code: "UI_NO_FILES", severity: "error",
    file: "assets", pointer: "", message: "未找到 .ui.json；先确认项目根目录，或使用 lua-ui-to-json 提取。" });
  report.errors = report.diagnostics.filter(d => d.severity === "error").length;
  report.warnings = report.diagnostics.filter(d => d.severity === "warning").length;
  report.skipped = [...skipped];
  if (format === "json") console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.files} files, ${report.errors} errors, ${report.warnings} warnings`);
    for (const d of report.diagnostics) console.log(`[${d.severity}] ${d.code} ${d.file}${d.pointer}: ${d.message}`);
    console.log("Not verified: " + (report.skipped.join(", ") || "No documents checked"));
    console.log("Static checks do not prove runtime or visual equivalence.");
  }
  return report.errors ? 1 : 0;
}
try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 2; }
