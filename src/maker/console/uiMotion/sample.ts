import fs from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { ConsoleError } from '../types.js';
import { motionAssets, motionLuaSources, motionRuntimeScript } from './runtime.js';
import { bundledSample } from './bundled.js';

/** A local candidate stays outside the bundled example library. */
export function getUiMotionSampleFile(
  variant: 'showcase' | 'lab' = 'showcase'
): string | undefined {
  const configured = process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR;
  if (!configured) return;
  try {
    const root = fs.realpathSync(configured);
    const relative =
      variant === 'lab' ? 'ui-motion-lab/index.html' : 'ui-motion-vector-sample/index.html';
    const filename = fs.realpathSync(path.join(root, relative));
    const stat = fs.statSync(filename);
    const sizeLimit = (variant === 'lab' ? 48 : 24) * 1024 * 1024;
    if (filename.startsWith(root + path.sep) && stat.isFile() && stat.size <= sizeLimit)
      return filename;
  } catch {
    // Local candidates are optional; missing files leave the bundled examples unchanged.
  }
}

/** Read only the optional fixed local catalog; never accept arbitrary asset URLs. */
export function getUiMotionSampleCatalog() {
  if (!process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR)
    return JSON.parse(motionAssets()['data/ui-motion-vector-sample/catalog.json']).map(
      (item: Record<string, unknown>) => ({ ...item, project: '随包 LuaTween 演示资源' })
    );
  const sample = getUiMotionSampleFile();
  if (!sample) return [];
  try {
    const directory = path.dirname(sample);
    const filename = fs.realpathSync(path.join(directory, 'catalog.json'));
    if (!filename.startsWith(directory + path.sep) || fs.statSync(filename).size > 32 * 1024)
      return [];
    const catalog: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (!Array.isArray(catalog) || catalog.length > 20) return [];
    const seen = new Set<string>();
    return catalog.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new Error('Invalid local example');
      const record = item as Record<string, unknown>;
      const { id, name, kind, summary, entry } = record;
      if (
        typeof id !== 'string' ||
        !/^[ST]0[1-9]$/.test(id) ||
        seen.has(id) ||
        typeof name !== 'string' ||
        name.length > 80 ||
        (kind !== 'scene' && kind !== 'transition') ||
        typeof summary !== 'string' ||
        summary.length > 200 ||
        typeof entry !== 'string' ||
        !/^\/ui-motion\/vector-sample\?scene=S0[1-9](?:&clip=T0[1-9])?$/.test(entry)
      )
        throw new Error('Invalid local example');
      seen.add(id);
      return { id, name, kind, summary, entry, project: path.dirname(directory) };
    });
  } catch {
    return [];
  }
}

export function getUiMotionLab() {
  if (!process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR)
    return { project: '随包 LuaTween 演示资源', entry: '/ui-motion/motion-lab' };
  const filename = getUiMotionSampleFile('lab');
  return filename
    ? { project: path.dirname(path.dirname(filename)), entry: '/ui-motion/motion-lab' }
    : undefined;
}

export function serveUiMotionSample(
  response: ServerResponse,
  variant: 'showcase' | 'lab' = 'showcase'
): void {
  const filename = getUiMotionSampleFile(variant);
  if (!filename && process.env.TAPTAP_MAKER_UI_MOTION_REFERENCE_DIR)
    throw new ConsoleError('本机尚未准备 NanoVG 动效示例。', 404);
  const html = filename
    ? upgradeMotionSample(fs.readFileSync(filename, 'utf8'), variant)
    : bundledSample(variant);
  if (Buffer.byteLength(html) > (variant === 'lab' ? 48 : 24) * 1024 * 1024)
    throw new ConsoleError('LuaTween 演示超过大小上限。', 413);
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "media-src 'none'",
      "object-src 'none'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  });
  response.end(html);
}

export function upgradeMotionSample(html: string, variant: 'showcase' | 'lab'): string {
  const assets = motionAssets();
  if (variant === 'lab') {
    const match = /<script>const DATA=([\s\S]*?);<\/script\b[^>]*>/i.exec(html);
    if (!match) throw new ConsoleError('动效工坊素材格式不匹配，请更新参考素材。', 409);
    const data = JSON.parse(match[1]);
    const sources = motionLuaSources();
    data.lua =
      ['LuaTween', 'MotionLabRecipes', 'MotionLabDesign', 'MotionLabComponents']
        .map(
          (name) =>
            'package.preload[' + JSON.stringify(name) + ']=function()\n' + sources[name] + '\nend\n'
        )
        .join('') + sources.MotionLab;
    const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi)];
    const player = scripts.at(-1);
    if (!player || player.index === undefined) throw new ConsoleError('动效工坊入口不完整。', 409);
    html =
      html.slice(0, player.index) +
      '<script type="module">' +
      assets['lab/bridge.bundle.js'].replace(/<\/script/gi, '<\\/script') +
      '</script>' +
      html.slice(player.index + player[0].length);
    return html.replace(
      match[0],
      () => '<script>const DATA=' + JSON.stringify(data).replace(/</g, '\\u003c') + ';</script>'
    );
  }
  const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi)];
  const player = scripts.at(-1);
  if (!player || player.index === undefined || !html.includes('const DATA='))
    throw new ConsoleError('完整界面素材格式不匹配，请更新参考素材。', 409);
  return (
    html.slice(0, player.index) +
    '<script>' +
    (motionRuntimeScript() + assets['showcase/player.js']).replace(/<\/script/gi, '<\\/script') +
    '</script>' +
    html.slice(player.index + player[0].length)
  );
}
