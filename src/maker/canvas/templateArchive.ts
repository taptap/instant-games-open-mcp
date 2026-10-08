import archiver from 'archiver';
import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CanvasWorkflowTemplate } from './templates.js';
import { CanvasStoreError } from './model.js';
import { snapshotCanvasSource } from './dependencies.js';

export const TEMPLATE_ARCHIVE_LIMIT = 128 * 1024 * 1024;
const MAX_FILES = 2000;
const MEDIA = /^media\/[a-f0-9]{64}\.(png|jpg|webp|mp4|mov|webm)$/;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const invalid = (message: string): never => {
  throw new CanvasStoreError(message, 400, 'INVALID_TEMPLATE_ARCHIVE');
};

export function templateAssetPaths(template: CanvasWorkflowTemplate): string[] {
  return [
    ...new Set(
      template.nodes.flatMap((node) => [
        ...(node.assetPath ? [node.assetPath] : []),
        ...(node.generation?.referenceImagePaths || []),
        ...(node.imageAssetsInfo?.items.map((item) => item.assetPath) || []),
      ])
    ),
  ];
}

export function remapTemplateAssets(
  template: CanvasWorkflowTemplate,
  paths: Map<string, string>
): void {
  const before = new Map(
    template.nodes.map((node) => [node.id, snapshotCanvasSource(node)?.version])
  );
  for (const node of template.nodes) {
    if (node.assetPath) node.assetPath = paths.get(node.assetPath)!;
    if (node.generation?.referenceImagePaths)
      node.generation.referenceImagePaths = node.generation.referenceImagePaths.map(
        (file) => paths.get(file)!
      );
    for (const item of node.imageAssetsInfo?.items || [])
      item.assetPath = paths.get(item.assetPath)!;
  }
  // Moving files changes source versions; preserve whether each result was already stale.
  for (const node of template.nodes) {
    for (const snapshot of [
      ...(node.sourceSnapshots || []),
      ...(node.sourceSnapshot ? [node.sourceSnapshot] : []),
    ]) {
      if (snapshot.version === before.get(snapshot.nodeId))
        snapshot.version = snapshotCanvasSource(
          template.nodes.find((source) => source.id === snapshot.nodeId)
        )!.version;
    }
  }
}

export async function exportTemplateArchive(
  template: CanvasWorkflowTemplate,
  readMedia: (relative: string) => { file: string; type: string }
): Promise<Buffer> {
  const assets: Record<string, string> = {};
  const entries = new Map<string, Buffer>();
  let total = 0;
  for (const relative of templateAssetPaths(template)) {
    const source = readMedia(relative);
    const stat = await fs.stat(source.file);
    if (stat.size > TEMPLATE_ARCHIVE_LIMIT) invalid('模板包超过 128 MiB，请减少素材后导出。');
    const bytes = await fs.readFile(source.file);
    const name = 'media/' + hash(bytes) + path.extname(relative);
    if (!MEDIA.test(name)) invalid('模板包含不支持的素材格式。');
    assets[relative] = name;
    total += bytes.length;
    if (total > TEMPLATE_ARCHIVE_LIMIT || entries.size >= MAX_FILES - 1)
      invalid('模板包超过 128 MiB 或素材数量过多。');
    if (entries.has(name)) continue;
    entries.set(name, bytes);
  }
  entries.set(
    'template.json',
    Buffer.from(JSON.stringify({ format: 'maker-canvas-template', version: 1, template, assets }))
  );
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { store: true });
    const chunks: Buffer[] = [];
    let size = 0;
    archive.on('error', reject);
    archive.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > TEMPLATE_ARCHIVE_LIMIT) {
        archive.abort();
        reject(new CanvasStoreError('模板包超过 128 MiB。', 413, 'STORAGE_LIMIT'));
      } else chunks.push(chunk);
    });
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    for (const [name, bytes] of entries) archive.append(bytes, { name });
    void archive.finalize().catch(reject);
  });
}

export async function readTemplateArchive(bytes: Buffer): Promise<{
  template: CanvasWorkflowTemplate;
  assets: Map<string, Buffer>;
}> {
  if (!bytes.length || bytes.length > TEMPLATE_ARCHIVE_LIMIT)
    invalid('模板 ZIP 为空或超过 128 MiB。');
  try {
    const zip = await yauzl.fromBufferPromise(bytes, {
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    const entries = new Map<string, Buffer>();
    let total = 0;
    try {
      for await (const entry of zip.eachEntry()) {
        const name = entry.fileName;
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (
          (name !== 'template.json' && !MEDIA.test(name)) ||
          entries.has(name) ||
          (mode !== 0 && mode !== 0x8000) ||
          entry.generalPurposeBitFlag & 1
        )
          invalid('模板 ZIP 含无效路径、重复文件、链接或加密内容。');
        total += entry.uncompressedSize;
        if (
          total > TEMPLATE_ARCHIVE_LIMIT ||
          entries.size >= MAX_FILES ||
          (name === 'template.json' && entry.uncompressedSize > 2 * 1024 * 1024)
        )
          invalid('模板 ZIP 解压大小或文件数量超限。');
        const stream = await zip.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > entry.uncompressedSize) invalid('模板 ZIP 文件大小不符。');
          chunks.push(chunk);
        }
        const content = Buffer.concat(chunks);
        if (name !== 'template.json' && hash(content) !== path.basename(name).split('.')[0])
          invalid('模板素材校验失败，文件可能已损坏。');
        entries.set(name, content);
      }
    } finally {
      zip.close();
    }
    const manifest = JSON.parse(entries.get('template.json')?.toString('utf8') || 'null');
    if (
      manifest?.format !== 'maker-canvas-template' ||
      manifest.version !== 1 ||
      !manifest.template ||
      !manifest.assets ||
      typeof manifest.assets !== 'object' ||
      Array.isArray(manifest.assets)
    )
      invalid('不是支持的 Maker 模板包，或模板包版本不受支持。');
    const assets = new Map<string, Buffer>();
    const used = new Set(['template.json']);
    let referencedSize = 0;
    for (const [source, name] of Object.entries(manifest.assets)) {
      if (typeof name !== 'string' || !MEDIA.test(name) || !entries.has(name))
        invalid('模板包缺少引用的素材。');
      assets.set(source, entries.get(name as string)!);
      referencedSize += entries.get(name as string)!.length;
      if (referencedSize > TEMPLATE_ARCHIVE_LIMIT || assets.size >= MAX_FILES)
        invalid('模板引用的素材总量超过 128 MiB 或数量超限。');
      used.add(name as string);
    }
    if (used.size !== entries.size) invalid('模板 ZIP 含未声明的文件。');
    return { template: manifest.template, assets };
  } catch (error) {
    if (error instanceof CanvasStoreError) throw error;
    return invalid('无法读取模板 ZIP，请确认文件完整且由 Maker 模板导出。');
  }
}
