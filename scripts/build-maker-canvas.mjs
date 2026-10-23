import { build, transform } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// Oldest WebView the Web host supports; also applied to the assembled inline page script.
export const MAKER_CANVAS_BROWSER_TARGET = 'chrome74';
const HOST_SLOT = '__MAKER_CANVAS_HOST_SLOT__();';
const THEME_SLOT = '__MAKER_CANVAS_THEME_SLOT__();';
const pageModule = path.join(root, 'packages/maker-canvas/src/browser/page.ts');
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'packages/maker-canvas/tsconfig.build.json'],
  { cwd: root, stdio: 'inherit' }
);
function bundle(plugins = []) {
  return build({
    absWorkingDir: root,
    entryPoints: [
      'packages/maker-canvas/src/browser.ts',
      'packages/maker-canvas/src/domain.ts',
      'packages/maker-canvas/src/contracts.ts',
    ],
    outdir: 'packages/maker-canvas/dist',
    outExtension: { '.js': '.mjs' },
    bundle: true,
    splitting: true,
    platform: 'browser',
    format: 'esm',
    target: MAKER_CANVAS_BROWSER_TARGET,
    // The existing page serializes functions; their names are part of its assembly contract.
    keepNames: true,
    minify: false,
    plugins,
  });
}
await bundle();
// The page is assembled from source strings esbuild never sees; lower the finished script instead.
const { getCanvasPageHtml } = await import(
  pathToFileURL(path.join(root, 'packages/maker-canvas/dist/browser.mjs')).href +
    '?page=' +
    Date.now()
);
const page = getCanvasPageHtml({ hostScript: HOST_SLOT, themeScript: THEME_SLOT });
const pieces = page.split(/(<script>[\s\S]*?<\/script>)/);
for (let index = 1; index < pieces.length; index += 2) {
  const source = pieces[index].slice('<script>'.length, -'</script>'.length);
  const { code } = await transform(source, {
    loader: 'js',
    target: MAKER_CANVAS_BROWSER_TARGET,
    charset: 'utf8',
    legalComments: 'none',
  });
  if (/<\/script/i.test(code))
    throw new Error('Lowered canvas script contains a closing script tag.');
  pieces[index] = '<script>' + code + '</script>';
}
const lowered = pieces.join('');
const [beforeTheme, afterTheme, ...extraTheme] = lowered.split(THEME_SLOT);
const [beforeHost, afterHost, ...extraHost] = (afterTheme || '').split(HOST_SLOT);
if (extraTheme.length || extraHost.length || afterTheme === undefined || afterHost === undefined)
  throw new Error('Canvas page host slots did not survive lowering.');
const precompiled = JSON.stringify([beforeTheme, beforeHost, afterHost]);
// Rebuild so dist serves the lowered page; source imports (local console) stay unchanged.
await bundle([
  {
    name: 'maker-canvas-lowered-page',
    setup(context) {
      context.onResolve({ filter: /\/browser\/page\.js$/ }, (args) =>
        args.importer.endsWith(path.join('src', 'browser.ts'))
          ? { path: 'lowered-page', namespace: 'maker-canvas-page' }
          : undefined
      );
      context.onLoad({ filter: /.*/, namespace: 'maker-canvas-page' }, () => ({
        resolveDir: path.dirname(pageModule),
        loader: 'ts',
        contents: [
          `export { CANVAS_PAGE_MARKER } from ${JSON.stringify(pageModule)};`,
          `export type { CanvasPageIntegration } from ${JSON.stringify(pageModule)};`,
          `import type { CanvasPageIntegration } from ${JSON.stringify(pageModule)};`,
          `const parts: string[] = ${precompiled};`,
          'export function getCanvasPageHtml(integration: CanvasPageIntegration): string {',
          '  return parts[0] + (integration.themeScript || "") + parts[1] + integration.hostScript + parts[2];',
          '}',
        ].join('\n'),
      }));
    },
  },
]);
