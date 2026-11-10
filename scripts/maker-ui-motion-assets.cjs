const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { createHash } = require('node:crypto');

module.exports = function motionAssets(root) {
  const directory = path.join(root, 'src/maker/console/uiMotion/runtime');
  const assets = {};
  function visit(relative) {
    for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative + entry.name;
      if (entry.isDirectory()) visit(name + '/');
      else assets[name] = fs.readFileSync(path.join(directory, name), 'utf8');
    }
  }
  visit('');
  assets['integration.md'] = fs.readFileSync(
    path.join(root, 'skills/taptap-maker-local/references/ui-motion.md'),
    'utf8'
  );
  function luaLiteral(value) {
    if (value === null) return 'nil';
    if (Array.isArray(value)) return '{' + value.map(luaLiteral).join(',') + '}';
    if (typeof value === 'object')
      return (
        '{' +
        Object.entries(value)
          .map(([key, item]) => '[' + JSON.stringify(key) + ']=' + luaLiteral(item))
          .join(',') +
        '}'
      );
    return JSON.stringify(value);
  }
  const scenes = JSON.parse(assets['data/ui-motion-native/timelines.json']).scenes;
  for (const [name, source] of [
    ['MotionLabDesign', 'assets/ui/motion-lab-v2/designs.json'],
    ['MotionLabCatalog', 'assets/ui/motion-lab-v1/catalog.json'],
  ])
    assets['lua/' + name + '.lua'] =
      'return ' + luaLiteral(JSON.parse(assets['data/' + source])) + '\n';
  const imageRecipes = Object.fromEntries(
    Object.entries(scenes).map(([id, scene]) => [id, scene.recipe])
  );
  imageRecipes.Attack = scenes.S02.attack.recipe;
  assets['lua/ImageMotionRecipes.lua'] =
    'local recipes=' +
    luaLiteral(imageRecipes) +
    '\nreturn {Scene=function(id) return assert(recipes[id],id) end}\n';
  const readAsset = (name) => JSON.parse(assets['data/assets/' + name]);
  const showcase = readAsset('ui/nanovg-showcase-v1/showcase.json');
  assets['showcase/data.json'] = JSON.stringify({
    ...JSON.parse(assets['showcase/media.json']),
    manifest: showcase,
    trees: Object.fromEntries(showcase.scenes.map((scene) => [scene.id, readAsset(scene.ui)])),
    clips: Object.fromEntries(
      Object.entries(showcase.clips).map(([id, name]) => [id, readAsset(name)])
    ),
    overlay: readAsset(showcase.overlay),
    references: {},
  });
  assets['showcase/draw.js'] = [
    'src/maker/uiEditor/web/skills/lua-ui-to-json/scripts/ui-json-check.js',
    'src/maker/uiEditor/web/src/nanovg.js',
  ]
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
    .join('\n');
  for (const [entry, format, name] of [
    ['browser.js', 'iife', 'browser.bundle.js'],
    ['lab/bridge.js', 'esm', 'lab/bridge.bundle.js'],
  ]) {
    assets[name] = esbuild.buildSync({
      entryPoints: [path.join(directory, entry)],
      bundle: true,
      write: false,
      platform: 'browser',
      format,
      globalName: 'MakerLuaMotion',
      target: 'es2022',
      minify: true,
      legalComments: 'inline',
      define: { process: 'undefined', 'process.env.FENGARICONF': 'undefined' },
    }).outputFiles[0].text;
  }
  const catalog = JSON.parse(assets['data/ui-motion-native/catalog.json']);
  const resources = JSON.parse(assets['resourceMap.json']);
  const names = new Set(catalog.files.map((file) => file.path));
  for (const name of Object.keys(assets))
    if (name.startsWith('lua/')) names.add('scripts/' + name.slice(4));
  catalog.files = [...names].flatMap((name) => {
    if (resources[name]) return [{ path: name, sha256: resources[name].resourceId }];
    const content = name.startsWith('scripts/')
      ? assets['lua/' + name.slice(8)]
      : (assets['native/' + name.replace(/^ui-motion-native\//, '')] ?? assets['data/' + name]);
    if (content === undefined) return [];
    if (name === 'ui-motion-native/catalog.json' || name === 'ui-motion-native/player.js')
      return [{ path: name }];
    return [{ path: name, sha256: createHash('sha256').update(content).digest('hex') }];
  });
  assets['data/ui-motion-native/catalog.json'] = JSON.stringify(catalog, null, 2);
  return assets;
};
