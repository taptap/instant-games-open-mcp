// Single-page build of the Maker UI editor for hosts that embed it with iframe srcdoc (Web).
// The local console keeps serving src/maker/uiEditor/web/ through /ui-editor/ unchanged.
//
//   buildUiEditorPageHtml({ hostScript, themeStyles, themeScript })
//
// hostScript must define window.UrhoxHost (see web/src/config.js) before the editor boots.
import { build, transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAKER_UI_EDITOR_BROWSER_TARGET = 'chrome74';
const web = fileURLToPath(new URL('../src/maker/uiEditor/web/', import.meta.url));

/** Script order is owned by bootstrap.js so the console and this page load the same set. */
async function editorScripts() {
  const bootstrap = await readFile(path.join(web, 'src/bootstrap.js'), 'utf8');
  const list = /for \(const name of \[([\s\S]*?)\]\)/.exec(bootstrap);
  if (!list) throw new Error('UI editor bootstrap.js script list not found.');
  const names = [...list[1].matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
  if (!names.length || names.join(',') !== list[1].replace(/[\s"]/g, '').replace(/,$/, ''))
    throw new Error('UI editor bootstrap.js script list has an unexpected format.');
  return names;
}

function replaceOnce(html, search, replacement) {
  const parts = html.split(search);
  if (parts.length !== 2) throw new Error('UI editor index.html changed: ' + search);
  return parts[0] + replacement + parts[1];
}

function inline(tag, code) {
  if (new RegExp('</' + tag, 'i').test(code))
    throw new Error('Inline UI editor ' + tag + ' contains a closing ' + tag + ' tag.');
  return '<' + tag + '>' + code + '</' + tag + '>';
}

export async function buildUiEditorPageHtml({ hostScript, themeStyles, themeScript = '' }) {
  if (typeof hostScript !== 'string' || typeof themeStyles !== 'string')
    throw new Error('hostScript and themeStyles are required.');
  const target = MAKER_UI_EDITOR_BROWSER_TARGET;
  const tooltip = await build({
    entryPoints: [
      fileURLToPath(new URL('../packages/maker-canvas/src/browser/webTooltip.ts', import.meta.url)),
    ],
    bundle: true,
    format: 'iife',
    globalName: 'UrhoxWebTooltip',
    target,
    write: false,
    legalComments: 'none',
  });
  const yoga = await build({
    stdin: {
      contents:
        'import { loadYoga } from "./vendor/yoga-layout/dist/src/load.js";\n' +
        'window.__makerUiEditorLoadYoga = loadYoga;\n',
      resolveDir: web,
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    target,
    write: false,
    legalComments: 'none',
    // The embedded base64 WASM never resolves files relative to import.meta.url.
    logOverride: { 'empty-import-meta': 'silent' },
  });
  const read = (name) => readFile(path.join(web, name), 'utf8');
  // Each file runs in its own strict scope, matching how bootstrap.js imports them as modules.
  const scope = (source) => '(function () {\n"use strict";\n' + source + '\n})();\n';
  const sources = [scope(await read('skills/lua-ui-to-json/scripts/ui-json-check.js'))];
  for (const name of await editorScripts()) sources.push(scope(await read('src/' + name + '.js')));
  const main = (
    await transform(
      '(async function () {\n' +
        'if (!Element.prototype.replaceChildren) Element.prototype.replaceChildren = function () { while (this.firstChild) this.removeChild(this.firstChild); for (var i = 0; i < arguments.length; i++) this.appendChild(arguments[i]); };\n' +
        'if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { var a = Array.isArray(r) ? r : [r]; if (a.length === 1) a = [a[0], a[0], a[0], a[0]]; if (a.length === 2) a = [a[0], a[1], a[0], a[1]]; if (a.length === 3) a = [a[0], a[1], a[2], a[1]]; var limit = Math.min(Math.abs(w) / 2, Math.abs(h) / 2); a = a.slice(0, 4).map(function (v) { return Math.min(limit, Math.max(0, Number(v) || 0)); }); this.moveTo(x + a[0], y); this.arcTo(x + w, y, x + w, y + h, a[1]); this.arcTo(x + w, y + h, x, y + h, a[2]); this.arcTo(x, y + h, x, y, a[3]); this.arcTo(x, y, x + w, y, a[0]); this.closePath(); return this; };\n' +
        'try {\n' +
        'window.UrhoxYogaEngine = await window.__makerUiEditorLoadYoga();\n' +
        sources.join('') +
        '} catch (error) {\n' +
        'console.error(error);\n' +
        'document.getElementById("sessionStatus").textContent = "编辑器加载失败，请刷新重试。";\n' +
        '["openProjectBtn", "saveBtn", "checkUiBtn"].forEach(function (id) {\n' +
        '  document.getElementById(id).disabled = true;\n' +
        '});\n' +
        '}\n})();\n',
      { loader: 'js', target, charset: 'utf8', legalComments: 'none' }
    )
  ).code;
  let html = await read('index.html');
  html = replaceOnce(
    html,
    '<script src="/console-theme.js"></script>\n  <link rel="stylesheet" href="/console-theme.css" />\n  <link rel="stylesheet" href="src/style.css" />',
    inline('style', themeStyles) + inline('style', await read('src/style.css'))
  );
  html = replaceOnce(
    html,
    /<script type="module" src="src\/bootstrap\.js[^"]*"><\/script>/.exec(html)?.[0] ??
      '<script type="module" src="src/bootstrap.js',
    [themeScript, tooltip.outputFiles[0].text, hostScript, yoga.outputFiles[0].text, main]
      .map((code) => inline('script', code))
      .join('\n')
  );
  return html;
}
