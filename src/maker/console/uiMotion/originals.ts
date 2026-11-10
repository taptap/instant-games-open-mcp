import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { ConsoleError } from '../types.js';
import {
  motionAssets,
  motionRuntimeScript,
  motionSourceFiles,
  motionDocumentationFiles,
  motionLibrary,
} from './runtime.js';
import { bundledOriginalFile, bundledOriginalReference, motionResourceMap } from './bundled.js';
import { demoResourceInfo, readDemoResource } from '../../demoResources.js';

type ReferenceCatalog = {
  version: number;
  files: { path: string; sha256?: string }[];
  images: string[];
  scenes: { id: string; ui: string; canvasId: string; boundary?: string }[];
};
const maxCatalogBytes = 1024 * 1024;
const maxReferenceFiles = 1024;
const maxReferenceBytes = 32 * 1024 * 1024;
const maxFileBytes = 24 * 1024 * 1024;
const playerFiles = new Set([
  'index.html',
  'player.js',
  'player.css',
  'catalog.json',
  'timelines.json',
  'README.md',
]);
const assetRoots = [
  'assets/ui/s01-redesign-v1/',
  'assets/ui/s02-redesign-v1/',
  'assets/ui/s03-redesign-v1/',
  'assets/ui/s04-redesign-v1/',
  'assets/ui/s05-redesign-v1/',
  'assets/ui/s01-native-r2/',
  'assets/ui/s02-native-r2/',
  'assets/ui/s04-native-r2/',
  'assets/ui/s05-native-r3/',
  'assets/ui/ui015-3ab3bbcb/v-86aec7ad36a6/',
];

export const originalMotionExamples = [
  {
    id: 'S01',
    name: '主菜单',
    kind: 'scene',
    family: 'neon',
    summary: '双角色 · 菜单确认 · 斜面揭幕',
  },
  {
    id: 'S02',
    name: '角色选择',
    kind: 'scene',
    family: 'neon',
    summary: '四名角色 · 六段姿态 · 斜刃爆发',
  },
  {
    id: 'S03',
    name: '剧情对话',
    kind: 'scene',
    family: 'neon',
    summary: '对话框揭开 · 逐字台词 · 继续确认',
  },
  {
    id: 'S04',
    name: '绒幕星仪剧场',
    kind: 'scene',
    family: 'clockwork',
    summary: '角色入场 · 瓷兔弹出 · 场记板',
  },
  {
    id: 'S05',
    name: '章节剧场',
    kind: 'scene',
    family: 'clockwork',
    summary: '幕布揭开 · 木偶入场 · 章节交互',
  },
  {
    id: 'T01',
    name: '斜面菜单揭幕',
    kind: 'transition',
    family: 'neon',
    summary: '斜面遮场 · 选人揭幕',
  },
  {
    id: 'T02',
    name: '必杀斜刃',
    kind: 'transition',
    family: 'neon',
    summary: '粉色边缘 · 白芯斜刃',
  },
  {
    id: 'T03',
    name: '扑克牌遮场',
    kind: 'transition',
    family: 'clockwork',
    summary: '星仪扑克牌 · 剧院内切页',
  },
] as const;

function safeRelative(name: string): boolean {
  return (
    !name.includes('\\') &&
    !name.includes('\0') &&
    !name.split('/').some((part) => !part || part === '.' || part === '..')
  );
}
function allowedPath(name: string): boolean {
  if (!safeRelative(name)) return false;
  if (name.startsWith('ui-motion-native/')) return playerFiles.has(name.slice(17));
  if (/^scripts\/[A-Za-z0-9_-]+\.lua(?:\.meta)?$/.test(name)) return true;
  if (
    /^assets\/ui\/ui015-[0-9a-f]{8}\/v-[0-9a-f]{12}\/ui\/s0[1-5]_redesign\.ui\.json(?:\.meta)?$/.test(
      name
    )
  )
    return true;
  if (
    /^assets\/Fonts\/(?:(?:Menu-Black|NotoSerifSC-Regular)\.ttf(?:\.meta)?|(?:OFL|NotoSerifSC-OFL)\.txt)$/.test(
      name
    )
  )
    return true;
  return assetRoots.some((root) => name.startsWith(root)) && /\.(?:png|json|meta)$/.test(name);
}
function withinRoot(root: string, relative: string): string | undefined {
  if (!safeRelative(relative)) return;
  try {
    const filename = fs.realpathSync(path.join(root, relative));
    if (filename.startsWith(root + path.sep) && fs.statSync(filename).isFile()) return filename;
  } catch {
    /* Missing local examples stay unavailable. */
  }
}
function source() {
  const configured = process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR;
  if (!configured) return;
  try {
    const root = fs.realpathSync(configured);
    const filename = withinRoot(root, 'ui-motion-native/catalog.json');
    if (!filename || fs.statSync(filename).size > maxCatalogBytes) return;
    const catalog = JSON.parse(fs.readFileSync(filename, 'utf8')) as ReferenceCatalog;
    if (
      catalog.version !== 1 ||
      !Array.isArray(catalog.files) ||
      !Array.isArray(catalog.scenes) ||
      !Array.isArray(catalog.images) ||
      catalog.files.length > maxReferenceFiles ||
      catalog.images.length > maxReferenceFiles ||
      !catalog.files.every(
        (item) => item && typeof item.path === 'string' && allowedPath(item.path)
      ) ||
      !catalog.images.every((name) => typeof name === 'string' && allowedPath(name))
    )
      return;
    return { root, catalog };
  } catch {
    return;
  }
}
function sourceFile(family: string, name: string, context = source()): string | undefined {
  if (family !== 'neon' && family !== 'clockwork') return;
  if (!context) return;
  const relative = playerFiles.has(name) ? 'ui-motion-native/' + name : name;
  if (!allowedPath(relative) || !context.catalog.files.some((item) => item.path === relative))
    return;
  return withinRoot(context.root, relative);
}

export function getOriginalMotionExamples() {
  const context = source();
  return originalMotionExamples.map((example) => ({
    ...example,
    available:
      !process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR ||
      Boolean(sourceFile(example.family, 'index.html', context)),
    preview:
      '/ui-motion/original/' + example.family + '/index.html?thumbnail=1&example=' + example.id,
    entry: '/ui-motion/original/' + example.family + '/index.html?embed=1&example=' + example.id,
  }));
}

export function getOriginalMotionReference(id: string) {
  const example = originalMotionExamples.find((item) => item.id === id);
  if (example && !process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR)
    return bundledOriginalReference(example);
  const context = source();
  if (!example || !context || !sourceFile(example.family, 'index.html', context)) return null;
  const base = '/ui-motion/original/' + example.family + '/';
  let totalBytes = 0;
  const files = context.catalog.files.flatMap(({ path: name }) => {
    if (!/\.(?:lua|json|meta|md|js|css|html|txt)$/.test(name)) return [];
    const filename = sourceFile(example.family, name, context);
    if (!filename) return [];
    const size = fs.statSync(filename).size;
    totalBytes += size;
    if (size > maxFileBytes || totalBytes > maxReferenceBytes)
      throw new ConsoleError('原生动效参考包超过大小上限。', 413);
    return [{ path: name, filename }];
  });
  const runtimeFiles = motionSourceFiles();
  const runtimeNames = new Set(runtimeFiles.map((file) => file.path));
  const extraBytes = runtimeFiles.reduce((size, file) => size + Buffer.byteLength(file.content), 0);
  if (totalBytes + extraBytes > maxReferenceBytes)
    throw new ConsoleError('原生动效参考包超过大小上限。', 413);
  const deliveredFiles = files
    .filter((file) => !runtimeNames.has(file.path))
    .map(({ path: name, filename }) => ({
      path: name,
      url: base + name,
      content: bundledMotionFile(name) ?? fs.readFileSync(filename, 'utf8'),
    }))
    .concat(runtimeFiles.map((file) => ({ ...file, url: base + file.path })));
  if (
    deliveredFiles.reduce((size, file) => size + Buffer.byteLength(file.content), 0) >
    maxReferenceBytes
  )
    throw new ConsoleError('原生动效参考包超过大小上限。', 413);
  const hashes = new Map(
    deliveredFiles.map((file) => [
      file.path,
      createHash('sha256').update(file.content).digest('hex'),
    ])
  );
  return {
    version: 2,
    variant: 'original',
    library: motionLibrary(),
    example: {
      ...example,
      available: true,
      entry: base + 'index.html?embed=1&example=' + example.id,
      preview: base + 'index.html?thumbnail=1&example=' + example.id,
    },
    assetBase: base,
    boundary:
      '已审核原创设计经 Maker 画布分离为独立 PNG，并按坐标组装可编辑 UI.json。控制台读取游戏同一套素材和 Lua 时间线；角色姿态与矢量光效实时组合。示例提供交互与动画，后续台词、存档和章节业务由接入项目实现。',
    manifest: {
      ...context.catalog,
      files: [
        ...context.catalog.files.filter((file) => !hashes.has(file.path)),
        ...deliveredFiles.map((file) => ({ path: file.path, sha256: hashes.get(file.path) })),
      ],
    },
    assets: context.catalog.images
      .filter((name) => sourceFile(example.family, name, context))
      .map((name) => ({ path: name, url: base + name })),
    files: deliveredFiles,
  };
}

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.lua': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.meta': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export async function serveOriginalMotion(url: URL, response: ServerResponse): Promise<void> {
  const relative = decodeURIComponent(url.pathname.slice('/ui-motion/original/'.length));
  const [family, ...parts] = relative.split('/');
  const name = parts.join('/');
  if (!process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR) {
    if (family !== 'neon' && family !== 'clockwork')
      throw new ConsoleError('原生动效参考文件不存在。', 404);
    const text = bundledOriginalFile(name);
    const resource = motionResourceMap()[name];
    if (text === undefined && !resource?.resourceId)
      throw new ConsoleError('原生动效参考文件不存在。', 404);
    const bytes =
      text === undefined ? await readDemoResource(resource.resourceId) : Buffer.from(text);
    response.writeHead(200, {
      'Content-Type':
        text === undefined
          ? demoResourceInfo(resource.resourceId).type
          : mime[path.extname(name)] || 'text/plain; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    });
    response.end(bytes);
    return;
  }
  const filename = sourceFile(family, name);
  const type = mime[path.extname(name).toLowerCase()];
  const bundled =
    source() && (family === 'neon' || family === 'clockwork') ? bundledMotionFile(name) : undefined;
  if ((!filename && bundled === undefined) || !type)
    throw new ConsoleError('原生动效参考文件不存在。', 404);
  if (filename && fs.statSync(filename).size > maxFileBytes)
    throw new ConsoleError('原生动效参考文件超过大小上限。', 413);
  response.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self'",
      "font-src 'self'",
      "media-src 'none'",
      "object-src 'none'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ')
  );
  response.writeHead(200, { 'Content-Type': type });
  response.end(bundled ?? fs.readFileSync(filename!));
}

function bundledMotionFile(name: string): string | undefined {
  if (name.startsWith('docs/'))
    return motionDocumentationFiles().find((file) => file.path === name)?.content;
  const relative = name.replace(/^ui-motion-native\//, '');
  if (relative === 'player.js') return motionRuntimeScript() + motionAssets()['native/player.js'];
  if (name.startsWith('scripts/')) return motionAssets()['lua/' + name.slice(8)];
  return undefined;
}
