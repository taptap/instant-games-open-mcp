import type { ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { demoResourceInfo, readDemoResource } from '../../demoResources.js';
import { ConsoleError } from '../types.js';
import {
  motionAssets,
  motionLuaSources,
  motionRuntimeScript,
  motionSourceFiles,
  motionLibrary,
  motionDocumentationFiles,
} from './runtime.js';

export function motionResourceMap(): Record<string, { resourceId: string }> {
  return JSON.parse(motionAssets()['resourceMap.json']);
}
function resourceUrl(name: string): string {
  return '/ui-motion/resource?path=' + encodeURIComponent(name);
}
function scriptJSON(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
export function bundledSample(variant: 'showcase' | 'lab'): string {
  const assets = motionAssets();
  const sources = motionLuaSources();
  if (variant === 'lab') {
    const data = {
      lua:
        ['LuaTween', 'MotionLabRecipes', 'MotionLabDesign', 'MotionLabComponents']
          .map(
            (name) =>
              'package.preload[' +
              JSON.stringify(name) +
              ']=function()\n' +
              sources[name] +
              '\nend\n'
          )
          .join('') + sources.MotionLab,
      catalog: JSON.parse(assets['data/assets/ui/motion-lab-v1/catalog.json']),
      images: Object.fromEntries(
        Object.keys(motionResourceMap())
          .filter((name) => name.startsWith('assets/ui/motion-lab-v2/'))
          .map((name) => [name.slice(7), resourceUrl(name)])
      ),
    };
    const css = assets['lab/lab.css']
      .replace('__FONT_SERIF__', resourceUrl('assets/ui/motion-lab-v1/fonts/Serif.ttf'))
      .replace('__FONT_BOLD__', resourceUrl('assets/ui/motion-lab-v1/fonts/Bold.ttf'));
    return assets['lab/template.html']
      .replace('__CSS__', () => css + '\n' + assets['lab/loading.css'])
      .replace('__DATA__', () => scriptJSON(data))
      .replace('__JS__', () => assets['lab/bridge.bundle.js'].replace(/<\/script/gi, '<\\/script'));
  }
  const data = JSON.parse(assets['showcase/data.json']);
  for (const key of ['images', 'fonts'])
    data[key] = Object.fromEntries(
      data[key].map((name: string) => [name, resourceUrl('assets/' + name)])
    );
  const scripts =
    '<script>const DATA=' +
    scriptJSON(data) +
    ';</script><script>' +
    (assets['showcase/draw.js'] + motionRuntimeScript() + assets['showcase/player.js']).replace(
      /<\/script/gi,
      '<\\/script'
    ) +
    '</script>';
  return assets['showcase/template.html'].replace('__SCRIPTS__', () => scripts);
}

export async function serveMotionResource(url: URL, response: ServerResponse): Promise<void> {
  const name = url.searchParams.get('path') || '';
  const entry = motionResourceMap()[name];
  if (!entry?.resourceId) throw new ConsoleError('动效素材不存在。', 404);
  const info = demoResourceInfo(entry.resourceId);
  const bytes = await readDemoResource(entry.resourceId);
  response.writeHead(200, { 'Content-Type': info.type, 'Cache-Control': 'public, max-age=3600' });
  response.end(bytes);
}

export function bundledOriginalFile(name: string): string | undefined {
  const assets = motionAssets();
  if (name.startsWith('docs/'))
    return motionDocumentationFiles().find((file) => file.path === name)?.content;
  const relative = name.replace(/^ui-motion-native\//, '');
  if (relative === 'player.js') return motionRuntimeScript() + assets['native/player.js'];
  if (name.startsWith('scripts/')) return assets['lua/' + name.slice(8)];
  return (
    assets['native/' + relative] ??
    assets['data/' + (relative === name && !name.includes('/') ? 'ui-motion-native/' + name : name)]
  );
}

export function bundledRuntimeReference() {
  const files = motionSourceFiles();
  for (const [name, content] of Object.entries(motionAssets())) {
    if (name.startsWith('data/')) files.push({ path: name.slice(5), content });
  }
  files.push({ path: 'README.md', content: motionAssets()['README.md'] });
  files.push({ path: 'FENGARI-LICENSE.txt', content: motionAssets()['FENGARI-LICENSE.txt'] });
  return {
    version: 1,
    engine: 'LuaTween',
    library: motionLibrary(),
    files,
    assets: Object.entries(motionResourceMap()).map(([name, entry]) => {
      const info = demoResourceInfo(entry.resourceId);
      return { path: name, url: info.cdn ?? resourceUrl(name), sha256: info.sha256 };
    }),
  };
}

export function bundledOriginalReference(example: { id: string; family: string }) {
  const assets = motionAssets();
  const catalog = JSON.parse(assets['data/ui-motion-native/catalog.json']);
  const base = '/ui-motion/original/' + example.family + '/';
  const sourceNames = new Set<string>(catalog.files.map((file: { path: string }) => file.path));
  for (const file of motionSourceFiles()) sourceNames.add(file.path);
  const files = [...sourceNames].flatMap((name) => {
    const content = bundledOriginalFile(name);
    return content === undefined ? [] : [{ path: name, content, url: base + name }];
  });
  if (files.reduce((size, file) => size + Buffer.byteLength(file.content), 0) > 32 * 1024 * 1024)
    throw new ConsoleError('原生动效参考包超过大小上限。', 413);
  const resources = motionResourceMap();
  catalog.files = [
    ...files.map((file) => ({
      path: file.path,
      sha256: createHash('sha256').update(file.content).digest('hex'),
    })),
    ...[...sourceNames]
      .filter((name) => resources[name])
      .map((name) => ({ path: name, sha256: demoResourceInfo(resources[name].resourceId).sha256 })),
  ];
  return {
    version: 3,
    variant: 'original',
    library: motionLibrary(),
    example: { ...example, available: true },
    assetBase: base,
    boundary: '网页与 Maker 共用原版 LuaTween。独立素材与 UI 布局不变；游戏业务由接入项目实现。',
    manifest: catalog,
    files,
    assets: [...sourceNames]
      .filter((name) => resources[name])
      .map((name) => {
        const info = demoResourceInfo(resources[name].resourceId);
        return { path: name, url: info.cdn ?? resourceUrl(name), sha256: info.sha256 };
      }),
  };
}
