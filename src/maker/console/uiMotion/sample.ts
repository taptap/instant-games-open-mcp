import fs from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { ConsoleError } from '../types.js';

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
  if (!filename) throw new ConsoleError('本机尚未准备 NanoVG 动效示例。', 404);
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      'img-src data:',
      'font-src data:',
      "media-src 'none'",
      "object-src 'none'",
      "connect-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  });
  response.end(fs.readFileSync(filename));
}
