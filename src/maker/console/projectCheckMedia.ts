import fs from 'node:fs';
import path from 'node:path';
import { readProjectCheck } from '../projectCheck/store.js';
import { ConsoleError } from './types.js';
import { readCanvasMedia } from './canvasMedia.js';

/** Preview only an inventoried raster image, pinned to the report's file snapshot. */
export async function projectCheckImage(
  root: string,
  params: URLSearchParams,
  ifNoneMatch?: string
) {
  if (
    [...params.keys()].some((key) => !['path', 'revision'].includes(key)) ||
    params.getAll('path').length !== 1 ||
    params.getAll('revision').length !== 1
  )
    throw new ConsoleError('素材预览参数无效。');
  const saved = readProjectCheck(root);
  if (!saved || saved.resultRevision !== params.get('revision'))
    throw new ConsoleError('检查结果已更新，请重新打开项目检查。', 409);
  const relative = params.get('path')!;
  const asset = saved.facts.assets.assets.find((item) => item.path === relative);
  const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  const type = types[path.extname(relative).toLowerCase()];
  if (
    !asset ||
    !type ||
    !relative.startsWith('assets/') ||
    relative.includes('\\') ||
    relative.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new ConsoleError('仅预览本次报告内的 PNG、JPEG 或 WebP。', 404);
  if (asset.modifiedAt === undefined)
    throw new ConsoleError('报告缺少素材版本，请重新检查后再预览。', 409);
  if (asset.bytes > 16 * 1024 * 1024 || (asset.width || 0) * (asset.height || 0) > 16777216)
    throw new ConsoleError('此图超过预览上限，请在本地图片工具中查看。', 413);
  const filename = path.join(saved.facts.identity.root, relative);
  const check = () => {
    if (fs.realpathSync.native(filename) !== filename || !fs.lstatSync(filename).isFile())
      throw new ConsoleError('素材路径变化或包含链接。', 409);
    const stat = fs.statSync(filename);
    if (stat.size !== asset.bytes || stat.mtimeMs !== asset.modifiedAt)
      throw new ConsoleError('素材已变化，请让 AI 更新检查。', 409);
  };
  check();
  // Digest when the check collected one; otherwise the size and mtime already verified above.
  const etag = '"' + (asset.sha256 ?? asset.bytes + '-' + asset.modifiedAt) + '"';
  // The browser already holds bytes verified against this digest; size/mtime/realpath were just rechecked,
  // so revalidation can skip reading the file.
  if (ifNoneMatch === etag) return { notModified: true as const, etag };
  const media = await readCanvasMedia(filename);
  check();
  if (asset.sha256 && media.version !== asset.sha256)
    throw new ConsoleError('素材内容已变化，请让 AI 更新检查。', 409);
  return { notModified: false as const, bytes: media.bytes, type, etag };
}
