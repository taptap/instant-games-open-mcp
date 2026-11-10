import path from 'node:path';
import { createRequire as createMotionRequire } from 'node:module';

declare const __MAKER_UI_MOTION_ASSETS__: Record<string, string> | undefined;
let cached: Record<string, string> | undefined;

export function motionAssets(): Record<string, string> {
  if (typeof __MAKER_UI_MOTION_ASSETS__ !== 'undefined') return __MAKER_UI_MOTION_ASSETS__;
  if (!cached) {
    const root = process.cwd();
    cached = createMotionRequire(path.join(root, 'package.json'))(
      './scripts/maker-ui-motion-assets.cjs'
    )(root);
  }
  return cached!;
}

export function motionLuaSources(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(motionAssets())
      .filter(([name]) => name.startsWith('lua/'))
      .map(([name, source]) => [name.slice(4, -4), source])
  );
}

export function motionRuntimeScript(): string {
  const sources = motionLuaSources();
  const common = Object.fromEntries(
    ['LuaTween', 'ClipPlayer', 'UiMotionRecipes', 'ImageMotionRecipes'].map((name) => [
      name,
      sources[name],
    ])
  );
  return (
    motionAssets()['browser.bundle.js'] +
    '\nconst LuaMotion = MakerLuaMotion.createLuaRuntime(' +
    JSON.stringify(common).replace(/</g, '\\u003c') +
    ');\n' +
    'addEventListener("pagehide",()=>LuaMotion.destroy());\n'
  );
}

export function motionSourceFiles() {
  return [
    ...Object.entries(motionLuaSources()).map(([name, content]) => ({
      path: 'scripts/' + name + '.lua',
      content,
    })),
    ...motionDocumentationFiles(),
  ];
}

export function motionLibrary() {
  return JSON.parse(motionAssets()['library.json']) as {
    name: string;
    source: string;
    commit: string;
    sha256: string;
    upstreamSha256: string;
    path: string;
    readme: string;
    api: string;
    integration: string;
  };
}

export function motionDocumentationFiles() {
  const assets = motionAssets();
  const library = motionLibrary();
  return [
    { path: library.readme, content: assets['library/README.md'] },
    { path: library.api, content: assets['library/LuaTween.md'] },
    { path: library.integration, content: assets['integration.md'] },
  ];
}
