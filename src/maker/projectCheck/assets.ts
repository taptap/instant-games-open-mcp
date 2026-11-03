import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readImageDimensions } from '../canvas/imageDimensions.js';

type Asset = { path: string; bytes: number; width?: number; height?: number; references: string[] };
export interface AssetCheck {
  checkedAt: string;
  complete: boolean;
  assets: Asset[];
  duplicates: Array<{ paths: string[]; extraBytes: number }>;
  directories: Array<{ path: string; count: number; bytes: number }>;
  warnings: string[];
  omittedWarnings: number;
  sourceCount: number;
}
const TEXT = new Set(['.lua', '.json', '.xml', '.material', '.prefab', '.scene', '.meta']);
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_ENTRIES = 20000;
const MAX_TEXT = 4 * 1024 * 1024;
const MAX_TEXT_TOTAL = 64 * 1024 * 1024;
const MAX_HASH_TOTAL = 512 * 1024 * 1024;

/** Read-only inventory: reference evidence is conservative, never a deletion decision. */
export async function inspectAssets(projectDir: string, signal?: AbortSignal): Promise<AssetCheck> {
  const root = await fs.realpath(projectDir);
  const result: AssetCheck = {
    checkedAt: new Date().toISOString(),
    complete: true,
    assets: [],
    duplicates: [],
    directories: [],
    warnings: [],
    omittedWarnings: 0,
    sourceCount: 0,
  };
  const files: Array<{ path: string; bytes: number }> = [];
  let visited = 0,
    textBytes = 0,
    hashBytes = 0;
  const warn = (message: string) => {
    result.complete = false;
    if (result.warnings.length < 30) result.warnings.push(message);
    else result.omittedWarnings++;
  };
  async function safeFile(relative: string): Promise<string> {
    signal?.throwIfAborted();
    const filename = path.join(root, relative);
    if ((await fs.realpath(filename)) !== filename || !(await fs.lstat(filename)).isFile())
      throw new Error('文件路径已变化或为链接');
    return filename;
  }
  async function walk(relative: string, depth = 0): Promise<void> {
    signal?.throwIfAborted();
    if (visited >= MAX_ENTRIES) {
      warn('目录项达到 20000，扫描未完成');
      return;
    }
    const directory = path.join(root, relative);
    let opened = false;
    try {
      if ((await fs.realpath(directory)) !== directory) {
        warn(relative + '：跳过链接目录');
        return;
      }
      opened = true;
      if (
        await fs.stat(path.join(directory, '.project', 'project.json')).then(
          () => true,
          () => false
        )
      ) {
        warn(relative + '：跳过嵌套项目');
        return;
      }
      if (depth > 32) {
        warn(relative + '：目录层级超过 32');
        return;
      }
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        signal?.throwIfAborted();
        if (++visited > MAX_ENTRIES) {
          warn('目录项超过 20000，扫描未完成');
          break;
        }
        if (entry.name.startsWith('.')) continue;
        const name = relative + '/' + entry.name;
        if (entry.isSymbolicLink()) warn(name + '：跳过符号链接');
        else if (entry.isDirectory()) await walk(name, depth + 1);
        else if (entry.isFile()) {
          const stat = await fs.stat(await safeFile(name));
          files.push({ path: name, bytes: stat.size });
        }
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (opened || (error as NodeJS.ErrnoException).code !== 'ENOENT')
        warn(relative + '：无法完整读取目录');
    }
  }
  for (const directory of ['assets', 'scripts', '.project', '.maker/canvases'])
    await walk(directory);
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (++visited > MAX_ENTRIES) {
      warn('目录项超过 20000，项目根扫描未完成');
      break;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.lua') {
      const stat = await fs.stat(await safeFile(entry.name));
      files.push({ path: entry.name, bytes: stat.size });
    }
  }
  const assets = files.filter(
    (file) => file.path.startsWith('assets/') && !file.path.endsWith('.meta')
  );
  const aliases = new Map<string, Set<string>>();
  const addAlias = (alias: string, assetPath: string) => {
    const targets = aliases.get(alias) ?? new Set<string>();
    targets.add(assetPath);
    aliases.set(alias, targets);
  };
  for (const asset of assets) {
    addAlias(asset.path, asset.path);
    addAlias(asset.path.slice(7), asset.path);
    addAlias(path.posix.basename(asset.path), asset.path);
  }
  const texts: Array<{ path: string; text: string }> = [];
  for (const file of files) {
    if (!TEXT.has(path.extname(file.path).toLowerCase())) continue;
    if (file.bytes > MAX_TEXT || textBytes + file.bytes > MAX_TEXT_TOTAL) {
      warn(file.path + '：超过文本读取限制，引用检查不完整');
      continue;
    }
    try {
      const handle = await fs.open(await safeFile(file.path), 'r');
      let text: string;
      try {
        const stat = await handle.stat();
        if (stat.size !== file.bytes) throw new Error('文件变化');
        const buffer = Buffer.alloc(file.bytes + 1);
        let size = 0;
        while (size < buffer.length) {
          const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
          if (!bytesRead) break;
          size += bytesRead;
        }
        if (size !== file.bytes || (await handle.stat()).mtimeMs !== stat.mtimeMs)
          throw new Error('文件变化');
        text = buffer.subarray(0, size).toString('utf8');
        textBytes += size;
      } finally {
        await handle.close();
      }
      texts.push({ path: file.path, text });
      result.sourceCount++;
      if (file.path.endsWith('.meta')) {
        try {
          const meta = JSON.parse(text);
          if (typeof meta.uuid === 'string') addAlias(meta.uuid, file.path.slice(0, -5));
        } catch {
          warn(file.path + '：meta 解析失败，UUID 引用检查不完整');
        }
      }
    } catch {
      signal?.throwIfAborted();
      warn(file.path + '：文本读取失败或扫描时发生变化');
    }
  }
  const references = new Map<string, Set<string>>();
  for (const source of texts) {
    signal?.throwIfAborted();
    // Include path literals and UUIDs in code/config/Canvas, but not a resource's own meta.
    for (const match of source.text.matchAll(/["']([^"'\r\n]{1,2048})["']/g)) {
      const normalized = match[1].split(String.fromCharCode(92)).join('/');
      const token = normalized.startsWith('./') ? normalized.slice(2) : normalized;
      const candidates = [
        token,
        path.posix.normalize(path.posix.join(path.posix.dirname(source.path), token)),
      ];
      for (const candidate of candidates)
        for (const target of aliases.get(candidate) ?? []) {
          if (source.path === target || source.path === target + '.meta') continue;
          const sources = references.get(target) ?? new Set<string>();
          if (sources.size < 5) sources.add(source.path);
          references.set(target, sources);
        }
    }
  }
  const sizes = new Map<number, Asset[]>();
  const directories = new Map<string, { path: string; count: number; bytes: number }>();
  for (const file of assets) {
    signal?.throwIfAborted();
    const asset: Asset = { ...file, references: [...(references.get(file.path) ?? [])] };
    const directory = path.posix.dirname(file.path);
    const row = directories.get(directory) ?? { path: directory, count: 0, bytes: 0 };
    row.count++;
    row.bytes += file.bytes;
    directories.set(directory, row);
    if (IMAGES.has(path.extname(file.path).toLowerCase())) {
      try {
        if (file.bytes > 64 * 1024 * 1024) throw new Error('图片过大');
        const dimensions = readImageDimensions(await safeFile(file.path));
        if (!dimensions) throw new Error('无法识别图片头');
        Object.assign(asset, dimensions);
      } catch {
        signal?.throwIfAborted();
        warn(file.path + '：无法读取图片尺寸或超过 64 MiB');
      }
    }
    result.assets.push(asset);
    const sameSize = sizes.get(file.bytes) ?? [];
    sameSize.push(asset);
    sizes.set(file.bytes, sameSize);
  }
  for (const group of sizes.values()) {
    if (group.length < 2) continue;
    const hashes = new Map<string, string[]>();
    for (const file of group) {
      if (hashBytes + file.bytes > MAX_HASH_TOTAL) {
        warn(file.path + '：超过 512 MiB 哈希读取预算，重复检查不完整');
        continue;
      }
      try {
        const handle = await fs.open(await safeFile(file.path), 'r');
        const hash = createHash('sha256');
        let bytes = 0;
        try {
          const before = await handle.stat();
          if (before.size !== file.bytes) throw new Error('文件变化');
          const buffer = Buffer.alloc(64 * 1024);
          while (bytes < file.bytes) {
            signal?.throwIfAborted();
            const { bytesRead } = await handle.read(
              buffer,
              0,
              Math.min(buffer.length, file.bytes - bytes),
              bytes
            );
            if (!bytesRead) throw new Error('文件变化');
            hash.update(buffer.subarray(0, bytesRead));
            bytes += bytesRead;
            hashBytes += bytesRead;
          }
          const after = await handle.stat();
          if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
            throw new Error('文件变化');
        } finally {
          await handle.close();
        }
        const digest = hash.digest('hex');
        const paths = hashes.get(digest) ?? [];
        paths.push(file.path);
        hashes.set(digest, paths);
      } catch {
        signal?.throwIfAborted();
        warn(file.path + '：无法完成哈希检查或扫描时发生变化');
      }
    }
    for (const paths of hashes.values())
      if (paths.length > 1)
        result.duplicates.push({ paths, extraBytes: group[0].bytes * (paths.length - 1) });
  }
  result.directories = [...directories.values()].sort((a, b) => b.count - a.count);
  result.assets.sort((a, b) => b.bytes - a.bytes);
  result.duplicates.sort((a, b) => b.extraBytes - a.extraBytes);
  return result;
}
