import fs from 'node:fs';
import path from 'node:path';

export const UNVERIFIED_CLEANUP_MARKER = '.cleanup-unverified';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function trimPreviewCache(
  directory: string,
  prefix: '' | 'runtime-',
  limit: number,
  protectedDirectories: string[]
): string[] {
  if (!fs.existsSync(directory)) return [];
  try {
    if (!fs.lstatSync(directory).isDirectory())
      throw new Error('Cache root is not a regular directory.');
    const pattern = new RegExp('^' + prefix + UUID + '$', 'i');
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
      .map((entry) => path.join(directory, entry.name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const protectedPaths = new Set(protectedDirectories.map((filename) => path.resolve(filename)));
    const retained = new Set(
      entries.filter(
        (filename) =>
          protectedPaths.has(path.resolve(filename)) ||
          fs.existsSync(path.join(filename, UNVERIFIED_CLEANUP_MARKER))
      )
    );
    for (const filename of entries) {
      if (retained.has(filename)) continue;
      if (retained.size < limit) retained.add(filename);
      else fs.rmSync(filename, { recursive: true, force: true });
    }
    return [];
  } catch {
    return ['Preview cache cleanup was incomplete; retained files in ' + directory + '.'];
  }
}
