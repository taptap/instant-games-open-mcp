import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { ConsoleError } from './types.js';

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 16;
type Media = { bytes: Buffer; version: string };
const cache = new Map<string, { stamp: string; media: Media }>();
const pending = new Map<string, Promise<Media>>();
let cachedBytes = 0;

async function fileStamp(file: string): Promise<string> {
  const info = await stat(file, { bigint: true });
  if (info.size > BigInt(MAX_BYTES)) throw new ConsoleError('素材超过读取上限。', 413);
  return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':');
}

/** Call only after project/realpath authorization. Range responses share immutable verified bytes. */
export async function readCanvasMedia(file: string): Promise<Media> {
  const stamp = await fileStamp(file);
  const cached = cache.get(file);
  if (cached) {
    cache.delete(file);
    if (cached.stamp === stamp) {
      cache.set(file, cached);
      return cached.media;
    }
    cachedBytes -= cached.media.bytes.length;
  }
  const key = JSON.stringify([file, stamp]);
  const existing = pending.get(key);
  if (existing) return existing;
  const reading = (async () => {
    const bytes = await readFile(file);
    if (bytes.length > MAX_BYTES) throw new ConsoleError('素材超过读取上限。', 413);
    if ((await fileStamp(file)) !== stamp)
      throw new ConsoleError('素材在读取期间变化，请刷新素材后重新操作。', 409);
    const media = { bytes, version: createHash('sha256').update(bytes).digest('hex') };
    const previous = cache.get(file);
    if (previous) {
      cachedBytes -= previous.media.bytes.length;
      cache.delete(file);
    }
    while (cache.size && (cache.size >= MAX_ENTRIES || cachedBytes + bytes.length > MAX_BYTES)) {
      const oldest = cache.keys().next().value!;
      cachedBytes -= cache.get(oldest)!.media.bytes.length;
      cache.delete(oldest);
    }
    cache.set(file, { stamp, media });
    cachedBytes += bytes.length;
    return media;
  })();
  pending.set(key, reading);
  try {
    return await reading;
  } finally {
    pending.delete(key);
  }
}
