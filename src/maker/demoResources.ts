import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import manifest from './demoResources.json';
import { getMakerHome } from './storage.js';

declare const __MAKER_DEMO_BUNDLED__: boolean | undefined;
export interface DemoResource {
  file: string;
  size: number;
  sha256: string;
  type: string;
  cdn?: string;
  thumbnail?: string;
}
export const demoResources = manifest.resources as Record<string, DemoResource>;
const pending = new Map<string, Promise<Buffer>>();

export function demoResourceInfo(id: string): DemoResource {
  const entry = Object.prototype.hasOwnProperty.call(demoResources, id)
    ? demoResources[id]
    : undefined;
  if (!entry || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(entry.file)) throw new Error('示例资源不存在。');
  return entry;
}

function valid(bytes: Buffer, entry: DemoResource): boolean {
  return (
    bytes.length === entry.size && createHash('sha256').update(bytes).digest('hex') === entry.sha256
  );
}

export async function downloadDemoResource(entry: DemoResource, urls: string[]): Promise<Buffer> {
  for (const url of urls) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      if (new URL(url).protocol !== 'https:') throw new Error('需要 HTTPS 地址');
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok || !response.body) throw new Error('资源下载失败');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > entry.size) {
          abort.abort();
          throw new Error('资源大小不符');
        }
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      if (!valid(bytes, entry)) throw new Error('资源校验失败');
      return bytes;
    } catch {
      // Try the one configured fallback; never cache a partial or mismatched file.
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('示例资源下载失败，CDN 和 GitHub 均不可用或文件校验失败。请检查网络后重试。');
}

export async function readDemoResource(id: string, preview = false): Promise<Buffer> {
  let entry = demoResourceInfo(id);
  if (preview && entry.thumbnail) {
    id = entry.thumbnail;
    entry = demoResourceInfo(id);
  }
  const existing = pending.get(id);
  if (existing) return existing;
  const operation = (async () => {
    // Repository development/tests use the same checked files committed for GitHub fallback.
    if (typeof __MAKER_DEMO_BUNDLED__ === 'undefined') {
      const source =
        typeof __dirname === 'string' ? __dirname : path.dirname(path.resolve(process.argv[1]));
      try {
        const bytes = await fs.readFile(
          path.resolve(source, '../../resources/maker-demo', entry.file)
        );
        if (valid(bytes, entry)) return bytes;
      } catch {
        /* Installed bundles use the cache and remote URLs below. */
      }
    }
    const directory = path.join(getMakerHome(), 'cache', 'demo-resources');
    const filename = path.join(directory, entry.file);
    try {
      const bytes = await fs.readFile(filename);
      if (valid(bytes, entry)) return bytes;
    } catch {
      /* Cache miss. */
    }
    const bytes = await downloadDemoResource(entry, [
      ...(entry.cdn ? [entry.cdn] : []),
      manifest.githubBaseUrl + entry.file,
    ]);
    await fs.mkdir(directory, { recursive: true });
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, bytes, { flag: 'wx' });
      await fs.rename(temporary, filename);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return bytes;
  })();
  pending.set(id, operation);
  try {
    return await operation;
  } finally {
    pending.delete(id);
  }
}

export function editorDemoResource(relative: string): string | undefined {
  const entries = manifest.editor as Record<string, string>;
  return Object.prototype.hasOwnProperty.call(entries, relative) ? entries[relative] : undefined;
}
