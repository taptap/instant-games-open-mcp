import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readImageDimensions } from '../canvas/imageDimensions.js';
import { collectAssetRelations } from './relations.js';

export type AssetReference = {
  path: string;
  line: number;
  kind: 'path' | 'uuid' | 'filename' | 'registry' | 'canvas';
  canvasId?: string;
  nodeId?: string;
  title?: string;
  relation?: 'uses' | 'origin';
  cachePath?: string;
};
export type Asset = {
  path: string;
  bytes: number;
  modifiedAt?: number;
  sha256?: string;
  width?: number;
  height?: number;
  /** Set when the file has an image extension but is not a decodable bitmap (e.g. KTX texture). */
  unreadable?: 'ktx';
  references: string[];
  referenceEvidence?: AssetReference[];
  omittedReferences?: number;
};
export interface AssetCheck {
  checkedAt: string;
  complete: boolean;
  assets: Asset[];
  duplicates: Array<{ paths: string[]; extraBytes: number }>;
  directories: Array<{ path: string; count: number; bytes: number }>;
  warnings: string[];
  omittedWarnings: number;
  sourceCount: number;
  sourceRevisions?: Array<{ path: string; bytes: number; sha256: string }>;
}
const TEXT = new Set(['.lua', '.json', '.xml', '.material', '.prefab', '.scene', '.meta']);
/** KTX 1.1 / KTX 2.0 magic: «KTX 11» / «KTX 20». */
async function isKtxTexture(filename: string): Promise<boolean> {
  const handle = await fs.open(filename, 'r');
  try {
    const head = Buffer.alloc(12);
    const { bytesRead } = await handle.read(head, 0, 12, 0);
    const version = head.toString('latin1', 5, 7);
    return (
      bytesRead === 12 &&
      head[0] === 0xab &&
      head.toString('latin1', 1, 5) === 'KTX ' &&
      (version === '11' || version === '20')
    );
  } finally {
    await handle.close();
  }
}
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_ENTRIES = 20000;
const MAX_TEXT = 4 * 1024 * 1024;
const MAX_TEXT_TOTAL = 64 * 1024 * 1024;
const MAX_HASH_TOTAL = 1024 * 1024 * 1024;

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
    sourceRevisions: [],
  };
  const files: Array<{ path: string; bytes: number; modifiedAt: number }> = [];
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
          files.push({ path: name, bytes: stat.size, modifiedAt: stat.mtimeMs });
        }
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (opened || (error as NodeJS.ErrnoException).code !== 'ENOENT')
        warn(relative + '：无法完整读取目录');
    }
  }
  for (const directory of [
    'assets',
    'scripts',
    '.project',
    '.maker/canvases',
    '.maker/ui-workflows',
  ])
    await walk(directory);
  const registryPath = '.maker/assets/generated-assets.json';
  try {
    const stat = await fs.stat(await safeFile(registryPath));
    files.push({ path: registryPath, bytes: stat.size, modifiedAt: stat.mtimeMs });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warn('生成素材注册表无法安全读取');
  }
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (++visited > MAX_ENTRIES) {
      warn('目录项超过 20000，项目根扫描未完成');
      break;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.lua') {
      const stat = await fs.stat(await safeFile(entry.name));
      files.push({ path: entry.name, bytes: stat.size, modifiedAt: stat.mtimeMs });
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
      result.sourceRevisions!.push({
        path: file.path,
        bytes: file.bytes,
        sha256: createHash('sha256').update(text).digest('hex'),
      });
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
  const evidence = new Map<string, AssetReference[]>();
  const omitted = new Map<string, number>();
  const addReference = (target: string, ref: AssetReference) => {
    const rows = evidence.get(target) ?? [];
    if (rows.some((row) => JSON.stringify(row) === JSON.stringify(ref))) return;
    if (rows.length < 40) rows.push(ref);
    else omitted.set(target, (omitted.get(target) ?? 0) + 1);
    evidence.set(target, rows);
    const sources = references.get(target) ?? new Set<string>();
    if (sources.size < 5) sources.add(ref.path);
    references.set(target, sources);
  };
  collectAssetRelations(
    root,
    texts,
    new Set(assets.map((asset) => asset.path)),
    addReference,
    warn
  );
  for (const source of texts) {
    signal?.throwIfAborted();
    // Managed history and registry entries describe provenance, not runtime usage.
    if (source.path.startsWith('.maker/') && !source.path.startsWith('.maker/ui-workflows/'))
      continue;
    // Include path literals and UUIDs in code/config/Canvas, but not a resource's own meta.
    let line = 1,
      cursor = 0;
    for (const match of source.text.matchAll(/["']([^"'\r\n]{1,2048})["']/g)) {
      line += source.text.slice(cursor, match.index).split('\n').length - 1;
      cursor = match.index;
      const normalized = match[1].split(String.fromCharCode(92)).join('/');
      const token = path.isAbsolute(normalized)
        ? path.relative(root, normalized).split(path.sep).join('/')
        : normalized.startsWith('./')
          ? normalized.slice(2)
          : normalized;
      const candidates = [
        token,
        path.posix.normalize(path.posix.join(path.posix.dirname(source.path), token)),
      ];
      for (const candidate of candidates)
        for (const target of aliases.get(candidate) ?? []) {
          if (source.path === target || source.path === target + '.meta') continue;
          addReference(target, {
            path: source.path,
            line,
            kind:
              candidate === path.posix.basename(target)
                ? 'filename'
                : candidate === target || candidate === target.slice(7)
                  ? 'path'
                  : 'uuid',
          });
        }
    }
  }
  let ktxCount = 0;
  const sizes = new Map<number, Asset[]>();
  const directories = new Map<string, { path: string; count: number; bytes: number }>();
  for (const file of assets) {
    signal?.throwIfAborted();
    const asset: Asset = {
      ...file,
      references: [...(references.get(file.path) ?? [])],
      referenceEvidence: evidence.get(file.path) ?? [],
      omittedReferences: omitted.get(file.path) ?? 0,
    };
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
        if (await isKtxTexture(await safeFile(file.path))) {
          asset.unreadable = 'ktx';
          ktxCount++;
        } else warn(file.path + '：无法读取图片尺寸或超过 64 MiB');
      }
    }
    result.assets.push(asset);
    const sameSize = sizes.get(file.bytes) ?? [];
    sameSize.push(asset);
    sizes.set(file.bytes, sameSize);
  }
  // Preview needs a digest, so images the report highlights (oversized, or no explicit reference)
  // are hashed before other same-size candidates; otherwise the read budget runs out on unrelated files.
  const attention = (asset: Asset) =>
    Math.max(asset.width ?? 0, asset.height ?? 0) > 2048 ||
    !asset.referenceEvidence?.some(
      (ref) =>
        ref.kind === 'path' ||
        ref.kind === 'uuid' ||
        (ref.kind === 'canvas' && ref.relation === 'uses')
    );
  const previewable = (asset: Asset) =>
    Boolean(asset.width) &&
    Boolean(asset.height) &&
    asset.bytes <= 16 * 1024 * 1024 &&
    (asset.width ?? 0) * (asset.height ?? 0) <= 16777216;
  if (ktxCount)
    warn(
      ktxCount +
        ' 个 .png/.jpg/.webp 文件实际是 KTX 压缩纹理，无法解码，不参与尺寸与超大图检查，也不能预览'
    );
  const groups = [...sizes.values()]
    .filter((group) => group.length >= 2 || (previewable(group[0]) && attention(group[0])))
    .sort(
      (a, b) =>
        Number(b.some((file) => previewable(file) && attention(file))) -
        Number(a.some((file) => previewable(file) && attention(file)))
    );
  for (const group of groups) {
    const hashes = new Map<string, string[]>();
    for (const file of group) {
      if (hashBytes + file.bytes > MAX_HASH_TOTAL) {
        warn(file.path + '：超过 1 GiB 哈希读取预算，重复检查不完整');
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
        file.sha256 = digest;
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
