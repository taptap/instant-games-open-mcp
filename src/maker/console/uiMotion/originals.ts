import fs from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { ConsoleError } from '../types.js';

type ReferenceCatalog = {
  version: number;
  files: { path: string; sha256?: string }[];
  images: string[];
  scenes: { id: string; ui: string; canvasId: string; boundary?: string }[];
};
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
    if (!filename) return;
    const catalog = JSON.parse(fs.readFileSync(filename, 'utf8')) as ReferenceCatalog;
    if (
      catalog.version !== 1 ||
      !Array.isArray(catalog.files) ||
      !Array.isArray(catalog.scenes) ||
      !Array.isArray(catalog.images) ||
      !catalog.files.every((item) => typeof item.path === 'string' && allowedPath(item.path))
    )
      return;
    return { root, catalog };
  } catch {
    return;
  }
}
function sourceFile(family: string, name: string): string | undefined {
  if (family !== 'neon' && family !== 'clockwork') return;
  const context = source();
  if (!context) return;
  const relative = playerFiles.has(name) ? 'ui-motion-native/' + name : name;
  if (!allowedPath(relative) || !context.catalog.files.some((item) => item.path === relative))
    return;
  return withinRoot(context.root, relative);
}

export function getOriginalMotionExamples() {
  return originalMotionExamples.map((example) => ({
    ...example,
    available: Boolean(sourceFile(example.family, 'index.html')),
    preview:
      '/ui-motion/original/' + example.family + '/index.html?thumbnail=1&example=' + example.id,
    entry: '/ui-motion/original/' + example.family + '/index.html?embed=1&example=' + example.id,
  }));
}

export function getOriginalMotionReference(id: string) {
  const example = getOriginalMotionExamples().find((item) => item.id === id);
  const context = source();
  if (!example?.available || !context) return null;
  const base = '/ui-motion/original/' + example.family + '/';
  return {
    version: 2,
    variant: 'original',
    example,
    assetBase: base,
    boundary:
      '已审核原创设计经 Maker 画布分离为独立 PNG，并按坐标组装可编辑 UI.json。控制台读取游戏同一套素材和 Lua 时间线；角色姿态与矢量光效实时组合。示例提供交互与动画，后续台词、存档和章节业务由接入项目实现。',
    manifest: context.catalog,
    assets: context.catalog.images
      .filter((name) => sourceFile(example.family, name))
      .map((name) => ({ path: name, url: base + name })),
    files: context.catalog.files.flatMap(({ path: name }) => {
      const filename = sourceFile(example.family, name);
      return filename && /\.(?:lua|json|meta|md|js|css|html|txt)$/.test(name)
        ? [{ path: name, url: base + name, content: fs.readFileSync(filename, 'utf8') }]
        : [];
    }),
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

export function serveOriginalMotion(url: URL, response: ServerResponse): void {
  const relative = decodeURIComponent(url.pathname.slice('/ui-motion/original/'.length));
  const [family, ...parts] = relative.split('/');
  const name = parts.join('/');
  const filename = sourceFile(family, name);
  const type = mime[path.extname(name).toLowerCase()];
  if (!filename || !type) throw new ConsoleError('原生动效参考文件不存在。', 404);
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
  response.end(fs.readFileSync(filename));
}
