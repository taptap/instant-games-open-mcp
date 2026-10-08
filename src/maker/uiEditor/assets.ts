import fs from 'node:fs';
import path from 'node:path';

declare const __MAKER_UI_EDITOR_ASSETS__: Record<string, string> | undefined;

export function readUiEditorAsset(relative: string): Buffer | undefined {
  if (
    !relative ||
    relative.split('/').some((part) => !part || part === '.' || part === '..') ||
    relative.includes('\\') ||
    relative.includes('\0')
  )
    return;
  if (typeof __MAKER_UI_EDITOR_ASSETS__ !== 'undefined') {
    const value = Object.prototype.hasOwnProperty.call(__MAKER_UI_EDITOR_ASSETS__, relative)
      ? __MAKER_UI_EDITOR_ASSETS__[relative]
      : undefined;
    return value === undefined ? undefined : Buffer.from(value, 'base64');
  }
  const root =
    typeof __dirname === 'string'
      ? path.join(__dirname, 'web')
      : path.join(path.dirname(path.resolve(process.argv[1])), 'uiEditor', 'web');
  const filename = path.join(root, relative);
  try {
    if (fs.lstatSync(filename).isFile() && fs.realpathSync(filename).startsWith(root + path.sep))
      return fs.readFileSync(filename);
  } catch {
    /* Missing static assets return 404. */
  }
}

export const uiEditorMime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};
