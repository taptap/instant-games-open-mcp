import fs from 'node:fs';
import path from 'node:path';

export function readCanvasImport(filename: string) {
  if (!path.isAbsolute(filename)) throw new Error('--file 必须为本地素材绝对路径。');
  const formats: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  const mime = formats[path.extname(filename).toLowerCase()];
  if (!mime) throw new Error('仅支持 PNG、JPEG、WebP、MP4、MOV、WebM。');
  const kind = mime.startsWith('image/') ? 'image' : 'video';
  const limit = (kind === 'image' ? 20 : 100) * 1024 * 1024;
  const descriptor = fs.openSync(filename, 'r');
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 1 || stat.size > limit)
      throw new Error(
        kind === 'image' ? '图片必须是1字节至20 MiB的文件。' : '视频必须是1字节至100 MiB的文件。'
      );
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!read) throw new Error('读取期间素材文件发生变化，请重新检查文件。');
      offset += read;
    }
    const after = fs.fstatSync(descriptor);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
      throw new Error('读取期间素材文件发生变化，请重新检查文件。');
    return {
      bytes,
      mime,
      kind,
      title: path.basename(filename, path.extname(filename)).slice(0, 80),
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

export function canvasExportDirectory(directory: unknown): string {
  if (typeof directory !== 'string' || !path.isAbsolute(directory))
    throw new Error('--output-dir 必须是已存在的绝对目录。');
  const real = fs.realpathSync(directory);
  if (!fs.statSync(real).isDirectory()) throw new Error('--output-dir 必须是目录。');
  return real;
}

export function writeCanvasExport(directory: string, filename: string, bytes: Uint8Array): string {
  const real = canvasExportDirectory(directory);
  if (
    !filename ||
    filename.length > 120 ||
    Array.from(filename).some((character) => character.charCodeAt(0) < 32) ||
    /[<>:"/\\|?*]/.test(filename) ||
    filename.endsWith('.') ||
    filename.endsWith(' ') ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename) ||
    !/\.(png|jpg|mp4|mov|webm|zip)$/i.test(filename)
  )
    throw new Error('导出文件名无效。');
  if (!bytes.byteLength || bytes.byteLength > 128 * 1024 * 1024)
    throw new Error('导出内容大小无效。');
  const extension = path.extname(filename);
  const stem = filename.slice(0, -extension.length);
  for (let index = 0; index < 1000; index++) {
    const suffix = index ? '-' + index : '';
    const name =
      Array.from(stem)
        .slice(0, 15 - extension.length - suffix.length)
        .join('') +
      suffix +
      extension;
    const target = path.join(real, name);
    let descriptor: number;
    try {
      descriptor = fs.openSync(target, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    try {
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } catch (error) {
      fs.closeSync(descriptor);
      fs.rmSync(target, { force: true });
      throw error;
    }
    fs.closeSync(descriptor);
    return target;
  }
  throw new Error('同名文件过多，请选择其它导出目录。');
}
