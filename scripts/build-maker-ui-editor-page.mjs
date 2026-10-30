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
      '(async function () {\ntry {\n' +
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
    [themeScript, hostScript, yoga.outputFiles[0].text, main]
      .map((code) => inline('script', code))
      .join('\n')
  );
  return html;
}
